import test from 'node:test';
import assert from 'node:assert/strict';
import {newSave,SAVE_KEY} from '../src/progression.mjs';
import {mountCloudSync} from '../src/cloud-sync.mjs';

function browserFixture({local=null,remote=null,revision=0,role='player',failSave=false}={}){
 const previous={document:globalThis.document,localStorage:globalThis.localStorage,
  fetch:globalThis.fetch,location:globalThis.location,
  setTimeout:globalThis.setTimeout};
 const values=new Map(local===null?[]:[[SAVE_KEY,JSON.stringify(local)]]);
 values.set('prism-garden:progress:v1','prism-unchanged');
 const buttons={};
 for(const action of ['check','local','remote','confirm-backup','upload','restore']){
  buttons[action]={hidden:action!=='check',disabled:false,dataset:{cloudAction:action}};
 }
 const status={textContent:'initial'},listeners={},downloads=[];
 const panel={
  dataset:{},className:'',innerHTML:'',listeners,
  querySelector:sel=>sel==='.brandicade-cloud-status'?status:null,
  querySelectorAll:()=>Object.values(buttons),
  addEventListener:(event,handler)=>{listeners[event]=handler}
 };
 const host={panel:null,querySelector(){return this.panel},append(p){this.panel=p}};
 let writes=0,uploads=0,reloads=0;
 globalThis.document={
  readyState:'complete',
  querySelector:sel=>sel==='#profile .data-panel'?host:null,
  createElement:tag=>tag==='section'?panel:
    tag==='style'?{textContent:''}:
    tag==='a'?{hidden:false,href:'',download:'',click(){downloads.push(this.download)},remove(){}}:{},
  head:{append(){}},body:{append(){}}
 };
 globalThis.localStorage={
  getItem:key=>values.get(key)??null,
  setItem(key,v){writes++;values.set(key,v)}
 };
 globalThis.location={reload(){reloads++}};
 globalThis.setTimeout=()=>0;
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/session')return new Response(JSON.stringify({role}),{status:200});
  if(path==='/api/save'&&options.method==='PUT'){
   uploads++;
   if(failSave)return new Response('{}',{status:409});
   const data=JSON.parse(options.body);
   if(data.baseRevision!==revision)throw Error('Unexpected base revision');
   revision++;
   remote=data.save;
   return new Response(JSON.stringify({ok:true,revision}),{status:200});
  }
  if(path==='/api/save')return new Response(JSON.stringify({
   revision,save:remote,updatedAt:null
  }),{status:200});
  throw Error('Unexpected fetch '+path);
 };
 mountCloudSync();
 return {
  panel,buttons,status,values,downloads,
  get writes(){return writes},get uploads(){return uploads},get reloads(){return reloads},
  async click(action){await listeners.click({target:{closest(){return buttons[action]}}})},
  cleanup(){for(const [key,val] of Object.entries(previous))
    if(val===undefined)delete globalThis[key];else globalThis[key]=val}
 };
}
test('device-only backup requires download AND explicit saved-file acknowledgment before upload',async()=>{
 const save=newSave();save.stats.played=7;
 const f=browserFixture({local:save});
 try{
  const original=f.values.get(SAVE_KEY);
  assert.match(f.panel.innerHTML,/I saved the backup file/);
  await f.click('check');
  assert.equal(f.buttons.local.hidden,false);
  assert.equal(f.buttons.upload.hidden,true);
  await f.click('local');
  assert.deepEqual(f.downloads,['brandicade-device-backup.json']);
  assert.equal(f.buttons.upload.hidden,true);
  assert.equal(f.buttons['confirm-backup'].hidden,false);
  assert.equal(f.uploads,0);
  assert.equal(f.writes,0);
  await f.click('confirm-backup');
  assert.equal(f.buttons.upload.hidden,false);
  assert.equal(f.uploads,0);
  await f.click('upload');
  assert.equal(f.uploads,1);
  assert.match(f.status.textContent,/revision 1/);
  assert.equal(f.values.get(SAVE_KEY),original);
  assert.equal(f.values.get('prism-garden:progress:v1'),'prism-unchanged');
  assert.equal(f.writes,0);
 }finally{f.cleanup()}
});
test('two conflicting saves cannot be uploaded or restored by a download acknowledgment',async()=>{
 const local=newSave(),remote=structuredClone(local);
 local.stats.played=2;remote.stats.played=9;
 const f=browserFixture({local,remote,revision:3});
 try{
  const raw=f.values.get(SAVE_KEY);
  await f.click('check');
  assert.equal(f.buttons.upload.hidden,true);
  assert.equal(f.buttons.restore.hidden,true);
  await f.click('local');
  await f.click('confirm-backup');
  assert.equal(f.buttons.remote.hidden,false);
  assert.equal(f.buttons.upload.hidden,true);
  assert.equal(f.buttons.restore.hidden,true);
  await f.click('remote');
  await f.click('confirm-backup');
  assert.equal(f.buttons.local.hidden,false);
  assert.equal(f.buttons.upload.hidden,true);
  assert.equal(f.buttons.restore.hidden,true);
  assert.equal(f.values.get(SAVE_KEY),raw);
  assert.equal(f.writes,0);
  assert.equal(f.uploads,0);
 }finally{f.cleanup()}
});
test('cloud-only progress requires explicit cloud backup acknowledgment before restoring',async()=>{
 const remote=newSave();remote.stats.played=8;
 const f=browserFixture({remote,revision:2});
 try{
  await f.click('check');
  assert.equal(f.buttons.restore.hidden,true);
  await f.click('remote');
  assert.equal(f.buttons.restore.hidden,true);
  assert.deepEqual(f.downloads,['brandicade-cloud-backup.json']);
  await f.click('confirm-backup');
  assert.equal(f.buttons.restore.hidden,false);
  await f.click('restore');
  assert.equal(f.writes,1);
  assert.equal(JSON.parse(f.values.get(SAVE_KEY)).stats.played,8);
  assert.equal(f.reloads,1);
  assert.equal(f.values.get('prism-garden:progress:v1'),'prism-unchanged');
  assert.equal(f.uploads,0);
 }finally{f.cleanup()}
});
test('admin never reads player save, and local progress is preserved',async()=>{
 const local=newSave();local.stats.played=5;
 const f=browserFixture({local,role:'admin'});
 try{
  const raw=f.values.get(SAVE_KEY);
  await f.click('check');
  assert.match(f.status.textContent,/Only the player/);
  assert.equal(f.buttons.upload.hidden,true);
  assert.equal(f.buttons.restore.hidden,true);
  assert.equal(f.writes,0);
  assert.equal(f.values.get(SAVE_KEY),raw);
 }finally{f.cleanup()}
});
