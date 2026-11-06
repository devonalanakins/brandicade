import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,levelById} from '../src/prism-garden/content.mjs';
import {createRun} from '../src/prism-garden/engine.mjs';
import {newProgress,KEY} from '../src/prism-garden/achievements.mjs';
import {makeBackup} from '../src/prism-garden/backup.mjs';

test('Settings backup controls export, cancel import and confirm restore without legacy save writes',async()=>{
 const initial=newProgress();
 initial.active=createRun(LEVELS[0],{runId:'ui-backup-sample'});
 const storage=new Map([[KEY,JSON.stringify(initial)],['brandicade:save:v1','leave-intact']]);
 const listeners={};let downloaded=false,loaded=0,consent=false;
 const controls={
  '#pg-backup-export':{disabled:false,addEventListener(type,fn){listeners.export=fn;}},
  '#pg-backup-import':{files:[],value:'',addEventListener(type,fn){listeners.import=fn;}},
  '#pg-backup-verify':{addEventListener(type,fn){listeners.verifyButton=fn;}},
  '#pg-backup-check':{files:[],value:'',clicked:0,click(){this.clicked++;},addEventListener(type,fn){listeners.check=fn;}},
  '#pg-backup-status':{textContent:'',dataset:{}}
 };
 const panel={setAttribute(){},querySelector:s=>controls[s],id:'pg-backup-tools'};
 const settings={after(element){host.panel=element;}};
 const host={panel:null,querySelector(s){if(s==='#pg-backup-tools')return this.panel;if(s==='.pg-options')return settings;return null;}};
 const old={document:globalThis.document,MutationObserver:globalThis.MutationObserver,window:globalThis.window,localStorage:globalThis.localStorage};
 const oldURL={create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.MutationObserver=class{observe(){}};
 globalThis.window={confirm:()=>consent,location:{reload(){loaded++;}}};
 globalThis.document={
  getElementById:s=>s==='prism-app'?host:s==='pg-backup-status'?controls['#pg-backup-status']:null,
  createElement:()=>({...panel,click(){downloaded=true;},remove(){}}),
  body:{appendChild(){}}
 };
 URL.createObjectURL=()=>'blob:test';URL.revokeObjectURL=()=>{};
 try{
  await import('../src/prism-garden/backup-ui.mjs');
  assert.equal(typeof listeners.export,'function');
  assert.equal(typeof listeners.import,'function');
  await listeners.export({currentTarget:controls['#pg-backup-export']});
  assert.equal(downloaded,true);
  assert.equal(controls['#pg-backup-status'].dataset.kind,'success');
  const replacement=newProgress();replacement.completed[LEVELS[0].id]='2026-11-02T12:00:00Z';
  replacement.active=createRun(LEVELS[0],{runId:'restored-run'});
  const payload=await makeBackup(replacement);
  const verifier=controls['#pg-backup-check'];
  assert.equal(typeof listeners.verifyButton,'function');
  assert.equal(typeof listeners.check,'function');
  listeners.verifyButton();
  assert.equal(verifier.clicked,1);
  const originalRaw=storage.get(KEY);
  verifier.files=[{size:new TextEncoder().encode(payload).length,text:async()=>payload}];
  await listeners.check({currentTarget:verifier});
  assert.equal(storage.get(KEY),originalRaw);
  assert.equal(loaded,0);
  assert.match(controls['#pg-backup-status'].textContent,/passed its checksum/);
  assert.equal(controls['#pg-backup-status'].dataset.kind,'success');
  const tampered=JSON.parse(payload);
  tampered.progress.completed['PG-001']='2026-01-01T00:00:00Z';
  const corruptText=JSON.stringify(tampered);
  verifier.files=[{size:new TextEncoder().encode(corruptText).length,text:async()=>corruptText}];
  await listeners.check({currentTarget:verifier});
  assert.equal(controls['#pg-backup-status'].dataset.kind,'error');
  assert.equal(storage.get(KEY),originalRaw);
  assert.equal(loaded,0);
  const input=controls['#pg-backup-import'];
  input.files=[{size:new TextEncoder().encode(payload).length,text:async()=>payload}];
  await listeners.import({currentTarget:input});
  assert.equal(loaded,0);
  assert.deepEqual(JSON.parse(storage.get(KEY)),initial);
  consent=true;
  input.files=[{size:new TextEncoder().encode(payload).length,text:async()=>payload}];
  await listeners.import({currentTarget:input});
  assert.equal(loaded,1);
  assert.deepEqual(JSON.parse(storage.get(KEY)),replacement);
  assert.equal(storage.get('brandicade:save:v1'),'leave-intact');
 }finally{
  for(const [key,value]of Object.entries(old)){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
  URL.createObjectURL=oldURL.create;URL.revokeObjectURL=oldURL.revoke;
 }
});

test('damaged original can be exported as-is without accepting it as a valid backup',async()=>{
 const broken='{"version":1';
 const storage=new Map([[KEY,broken],['brandicade:save:v1','safe-legacy']]);
 const handlers={};let downloaded=false,downloads=0;
 const controls={
  '#pg-backup-export':{disabled:false,addEventListener(type,fn){handlers.export=fn;}},
  '#pg-backup-raw':{disabled:false,addEventListener(type,fn){handlers.raw=fn;}},
  '#pg-backup-import':{files:[],value:'',addEventListener(type,fn){handlers.import=fn;}},
  '#pg-backup-verify':{addEventListener(type,fn){handlers.verifyButton=fn;}},
  '#pg-backup-check':{files:[],value:'',click(){},addEventListener(type,fn){handlers.check=fn;}},
  '#pg-backup-status':{textContent:'',dataset:{}}
 };
 const panel={setAttribute(){},querySelector:s=>controls[s]};
 const settings={after(element){host.panel=element;}};
 const host={panel:null,querySelector(s){return s==='#pg-backup-tools'?this.panel:s==='.pg-options'?settings:null;}};
 const old={document:globalThis.document,MutationObserver:globalThis.MutationObserver,window:globalThis.window,localStorage:globalThis.localStorage};
 const oldURL={create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.MutationObserver=class{observe(){}};
 globalThis.window={confirm:()=>false,location:{reload(){throw Error('reload not allowed');}}};
 globalThis.document={getElementById:s=>s==='prism-app'?host:s==='pg-backup-status'?controls['#pg-backup-status']:null,
  createElement:()=>({...panel,click(){downloaded=true;downloads++;},remove(){}}),body:{appendChild(){}}};
 URL.createObjectURL=()=>'blob:raw-test';URL.revokeObjectURL=()=>{};
 try{
  await import('../src/prism-garden/backup-ui.mjs?damaged-recovery');
  assert.equal(typeof handlers.raw,'function');
  await handlers.raw({currentTarget:controls['#pg-backup-raw']});
  assert.equal(downloaded,true);
  assert.equal(downloads,1);
  assert.equal(storage.get(KEY),broken);
  assert.equal(storage.get('brandicade:save:v1'),'safe-legacy');
  assert.equal(controls['#pg-backup-status'].dataset.kind,'success');
 }finally{
  for(const [key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  URL.createObjectURL=oldURL.create;URL.revokeObjectURL=oldURL.revoke;
 }
});
