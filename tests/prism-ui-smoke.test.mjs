import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GEMS} from '../src/prism-garden/content.mjs';

test('Prism Garden boots, opens gameplay and persists an actual jewel move without DOM frameworks', async()=>{
  const handlers={};
  const element={dataset:{},innerHTML:'',addEventListener(name,handler){handlers[name]=handler;}};
  const memory=new Map();
  globalThis.document={querySelector(){return element;}};
  globalThis.matchMedia=()=>({matches:false});
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
  await import('../src/prism-garden/app.mjs');
  assert.match(element.innerHTML,/Prism/);
  assert.match(element.innerHTML,/crystal shape-leaf/);
  const click=(dataset)=>{
    handlers.click({target:{closest:()=>({dataset,disabled:false})}});
  };
  click({action:'continue'});
  assert.match(element.innerHTML,/pg-mosaic/);
  click({kind:'stack',index:'0'});
  assert.match(element.innerHTML,/pg-socket/);
  click({kind:'socket',index:'0'});
  const stored=JSON.parse(memory.get('brandicade:prism-garden:v1'));
  assert.equal(stored.active.moves,1);
  assert.ok(stored.active.placed[0]);
  assert.equal(memory.has('brandicade:save:v1'),false);
  click({nav:'atlas'});
  assert.match(element.innerHTML,/Sanctuary/);
  click({modeChoice:'mastery'});
  assert.match(element.innerHTML,/Mastery replays completed/);
});

test('hint identifies an exact accessible destination and clears after placement',async()=>{
 const handlers={};
 const element={dataset:{},innerHTML:'',addEventListener(name,handler){handlers[name]=handler;}};
 const memory=new Map();
 globalThis.document={querySelector(){return element;}};
 globalThis.matchMedia=()=>({matches:false});
 globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const {LEVELS}=await import('../src/prism-garden/content.mjs');
 const {hint}=await import('../src/prism-garden/engine.mjs');
 await import('../src/prism-garden/app.mjs?hint-regression');
 const tap=(dataset)=>handlers.click({target:{closest:()=>({dataset,disabled:false})}});
 tap({action:'continue'});
 const before=JSON.parse(memory.get('brandicade:prism-garden:v1'));
 const level=LEVELS.find(l=>l.id===before.active.levelId);
 const move=hint(level,before.active);
 assert.ok(move);
 tap({action:'hint'});
 const suggested=[...element.innerHTML.matchAll(/class="[^"]*\bhint-destination\b[^"]*" data-kind="(socket|shelf)" data-index="(\d+)"/g)];
 assert.deepEqual(suggested.map(m=>({kind:m[1],index:Number(m[2])})),[move.target]);
 assert.match(element.innerHTML,/suggested by hint/);
 assert.match(element.innerHTML,/Hint: move the/);
 assert.match(element.innerHTML,/aria-live="polite"/);
 assert.equal(JSON.parse(memory.get('brandicade:prism-garden:v1')).active.hints,1);
 tap({kind:move.source.kind,index:String(move.source.index)});
 assert.doesNotMatch(element.innerHTML,/\bhint-destination\b/);
 tap({action:'hint'});
 tap({kind:move.target.kind,index:String(move.target.index)});
 const after=JSON.parse(memory.get('brandicade:prism-garden:v1'));
 assert.equal(after.active.moves,1);
 assert.equal(after.active.hints,2);
 assert.doesNotMatch(element.innerHTML,/\bhint-destination\b/);
 assert.equal(memory.has('brandicade:save:v1'),false);
});

test('every jewel family has an independent silhouette instead of color-only styling',()=>{
 const css=readFileSync(new URL('../src/prism-garden/prism.css',import.meta.url),'utf8');
 const seen=new Set();
 for(const {symbol} of Object.values(GEMS)){
  const match=css.match(new RegExp('\\.crystal\\.shape-'+symbol+'\\s*\\{clip-path:(polygon\\([^;]+\\))\\}'));
  assert.ok(match,'Missing jewel shape: '+symbol);
  assert.ok(!seen.has(match[1]),'Jewel shape is duplicated: '+symbol);
  seen.add(match[1]);
 }
 assert.equal(seen.size,6);
 const appSource=readFileSync(new URL('../src/prism-garden/app.mjs',import.meta.url),'utf8');
 assert.ok(appSource.includes("shape-'+GEMS[color].symbol"));
});
