import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const origin='https://brandicade.example';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const toURL=value=>new URL(value?.url||value,origin).href;
function reply(path,{status=200,headers={},redirected=false,url=path}={}){
 const normalized=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
 return {
  status,ok:status>=200&&status<300,url:toURL(url),redirected,type:'basic',
  headers:{get:k=>normalized[k.toLowerCase()]??null},
  clone(){return reply(path,{status,headers,redirected,url});}
 };
}
function createRuntime(responder=url=>reply(url),{failOpen=false,failPut=false,failRead=false,failKeys=false}={}){
 const callbacks=new Map(),entries=new Map(),requests=[];
 const cacheFor=name=>{
  if(!entries.has(name))entries.set(name,new Map());
  const data=entries.get(name);
  return {
   async match(key){if(failRead)throw Error('synthetic CacheStorage read denied');return data.get(toURL(key))||undefined},
   async put(key,value){if(failPut)throw Error('synthetic CacheStorage quota exceeded');data.set(toURL(key),value)},
  };
 };
 const caches={
  open:async name=>{if(failOpen)throw Error('synthetic CacheStorage unavailable');return cacheFor(name);},
  keys:async()=>{if(failKeys)throw Error('synthetic CacheStorage keys denied');return [...entries.keys()];},
  delete:async name=>entries.delete(name)
 };
 const network=async(request,options={})=>{
  const url=toURL(request);
  requests.push({url,options});
  return responder(url,options);
 };
 const self={
  location:{origin},clients:{async claim(){}},async skipWaiting(){},
  addEventListener(name,callback){callbacks.set(name,callback);}
 };
 runInNewContext(source,{self,caches,fetch:network,URL,Response:{error:()=>({status:0,offline:true})}});
 const runLifecycle=async name=>{
  let task;
  callbacks.get(name)({waitUntil(promise){task=promise;}});
  await task;
 };
 const dispatch=async(path,{mode='cors',method='GET',cache='default',headers={}}={})=>{
  const hdr=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
  const request={
   url:toURL(path),mode,method,cache,
   headers:{get:key=>hdr[key.toLowerCase()]??null}
  };
  let responsePromise;
  callbacks.get('fetch')({request,respondWith(promise){responsePromise=promise;}});
  return {intercepted:!!responsePromise,
   response:await (responsePromise||network(request))};
 };
 return {caches,entries,requests,runLifecycle,dispatch};
}

test('private API, Cloudflare Access, unknown paths and credentialed requests never enter the SW cache',async()=>{
 const runtime=createRuntime();
 for(const path of ['/api/session','/api/save','/api/backups',
  '/cdn-cgi/access/authorize','/cdn-cgi/access/certs','/other/private.json',
  '/src/app.mjs?player=private']){
  const result=await runtime.dispatch(path);
  assert.equal(result.intercepted,false,path+' should remain network-owned');
 }
 for(const request of [
  {path:'/api/save',method:'PUT'},
  {path:'/src/app.mjs',cache:'no-store'},
  {path:'/src/app.mjs',headers:{Authorization:'Bearer synthetic'}},
  {path:'/src/app.mjs',headers:{Range:'bytes=0-100'}}
 ]){
  const {path,...options}=request;
  assert.equal((await runtime.dispatch(path,options)).intercepted,false,
   path+' with protected request options must bypass SW');
 }
 assert.deepEqual(await runtime.caches.keys(),[],'private GETs cannot create a cache');
});

test('legacy v7 caches containing private GETs are removed on activation without deleting unrelated caches',async()=>{
 const runtime=createRuntime();
 await (await runtime.caches.open('brandicade-glimmer-cascade-v7'))
  .put('/api/save',reply('/api/save'));
 await (await runtime.caches.open('brandicade-glimmer-cascade-cloud-bridge-v7'))
  .put('/api/backups',reply('/api/backups'));
 await (await runtime.caches.open('brandicade-glimmer-cascade-v8'))
  .put('/src/app.mjs',reply('/src/app.mjs'));
 await (await runtime.caches.open('brandicade-glimmer-cascade-v9'))
  .put('/src/app.mjs',reply('/src/app.mjs'));
 await (await runtime.caches.open('brandicade-glimmer-cascade-cloud-bridge-v9'))
  .put('/src/app.mjs',reply('/src/app.mjs'));
 await (await runtime.caches.open('unrelated-pwa')).put('/image.png',reply('/image.png'));
 await runtime.runLifecycle('activate');
 assert.deepEqual(await runtime.caches.keys(),['unrelated-pwa'],
  'old Brandicade caches should be purged while unrelated caches remain');
});

test('static code is offline-cacheable but private/no-store HTML and redirects are never stored',async()=>{
 let offline=false;
 const runtime=createRuntime(url=>{
  if(offline)throw Error('synthetic offline');
  if(url.endsWith('/index.html'))return reply(url,{headers:{'Cache-Control':'private, no-store'}});
  if(url.endsWith('/prism-garden.html'))return reply(url,{redirected:true,url:'https://access.example/login'});
  return reply(url);
 });
 const first=await runtime.dispatch('/src/app.mjs');
 assert.equal(first.intercepted,true);
 const requestsAfterFirst=runtime.requests.length;
 const second=await runtime.dispatch('/src/app.mjs');
 assert.equal(second.intercepted,true);
 assert.equal(runtime.requests.length,requestsAfterFirst,'cache-first code does not refetch');
 assert.equal((await (await runtime.caches.open('brandicade-glimmer-cascade-v10')).match('/src/app.mjs')).status,200,
  'cache stores a cloned successful static response');
 const secretPage=await runtime.dispatch('/index.html',{mode:'navigate'});
 assert.equal(secretPage.intercepted,true);
 assert.equal(await (await runtime.caches.open('brandicade-glimmer-cascade-v10')).match('/index.html'),
  undefined,'private protected HTML must never be stored');
 await runtime.dispatch('/prism-garden.html',{mode:'navigate'});
 assert.equal(await (await runtime.caches.open('brandicade-glimmer-cascade-v10')).match('/prism-garden.html'),
  undefined,'Access-redirected navigation must never be stored');
 offline=true;
 assert.equal((await runtime.dispatch('/index.html',{mode:'navigate'})).response.offline,true,
  'private shell has no fabricated offline fallback');
 assert.equal((await runtime.dispatch('/src/app.mjs')).response.status,200,
  'known static code is still available offline');
});

test('PWA installation filters no-store and redirected responses and preserves only safe shell assets',async()=>{
 const runtime=createRuntime(url=>{
  if(url.endsWith('/index.html')||url.endsWith('/'))return reply(url,{headers:{'Cache-Control':'no-store'}});
  if(url.endsWith('/assets/icon.svg'))return reply(url,{redirected:true,url:'https://access.example/login'});
  return reply(url);
 });
 await runtime.runLifecycle('install');
 const cache=await runtime.caches.open('brandicade-glimmer-cascade-v10');
 assert.equal(await cache.match('/index.html'),undefined);
 assert.equal(await cache.match('/'),undefined);
 assert.equal(await cache.match('/assets/icon.svg'),undefined);
 assert.ok(await cache.match('/src/app.mjs'),'first-party app code should be primed when safe');
 assert.ok(await cache.match('/src/prism-garden/engine.mjs'),'offline Prism Garden engine remains available');
 assert.ok(runtime.requests.some(x=>x.options.redirect==='error'&&x.options.cache==='no-store'),
  'precache must fail closed on auth redirects and bypass HTTP cache');
});

test('network-first public Prism Garden remains usable offline without replacing other routes',async()=>{
 let offline=false;
 const runtime=createRuntime(url=>{
  if(offline)throw Error('synthetic offline');
  return reply(url);
 });
 const first=await runtime.dispatch('/prism-garden.html',{mode:'navigate'});
 assert.equal(first.intercepted,true);
 assert.equal((await runtime.dispatch('/unknown-navigation',{mode:'navigate'})).intercepted,false,
  'unknown navigation paths remain network-owned and cannot receive a cached homepage');
 offline=true;
 assert.equal((await runtime.dispatch('/prism-garden.html',{mode:'navigate'})).response.status,200,
  'the exact public game page is preserved for offline navigation');
});

test('storage denial, quota exhaustion and cache-read failure never break online gameplay',async()=>{
 for(const [label,opts] of [
  ['CacheStorage open denied',{failOpen:true}],
  ['cache writes fail',{failPut:true}],
  ['cache reads fail',{failRead:true}],
  ['cache enumeration fails',{failKeys:true}]
 ]){
  const runtime=createRuntime(url=>reply(url),opts);
  await runtime.runLifecycle('install');
  await runtime.runLifecycle('activate');
  const app=await runtime.dispatch('/src/app.mjs');
  assert.equal(app.intercepted,true,label+' remains within known shell route');
  assert.equal(app.response.status,200,label+' must return successful network code');
  const prism=await runtime.dispatch('/prism-garden.html',{mode:'navigate'});
  assert.equal(prism.response.status,200,label+' must return successful network HTML');
  assert.ok(runtime.requests.some(x=>x.url.endsWith('/src/app.mjs')),
   label+' makes an actual network request');
  assert.equal((await runtime.dispatch('/api/save')).intercepted,false,
   label+' must still bypass private saved-game APIs');
 }
});
