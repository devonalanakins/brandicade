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
 const listeners={};let downloaded=false,loaded=0,consent=false,confirmations=0;
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
 globalThis.window={confirm:()=>{confirmations++;return consent;},location:{reload(){loaded++;}}};
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
  // Correct checksum, but unknown profile details would be silently stripped
  // by sanitization. Neither checking nor importing may accept such a file.
  const losslessFailure=await makeBackup({...replacement,unsupportedCustomField:{keepsake:true}});
  const rejects=[
   losslessFailure,
   corruptText,
   JSON.stringify({format:'not-prism',version:1}),
  ];
  for(const text of rejects){
   const beforePrompts=confirmations;
   input.files=[{size:new TextEncoder().encode(text).length,text:async()=>text}];
   await listeners.import({currentTarget:input});
   assert.equal(controls['#pg-backup-status'].dataset.kind,'error');
   assert.equal(confirmations,beforePrompts,'invalid backup cannot trigger a restore prompt');
   assert.equal(storage.get(KEY),originalRaw,'invalid backup cannot overwrite original Prism progress');
   assert.equal(loaded,0);
  }
  assert.equal(storage.get('brandicade:save:v1'),'leave-intact');
  input.files=[{size:new TextEncoder().encode(payload).length,text:async()=>payload}];
  await listeners.import({currentTarget:input});
  assert.equal(loaded,0);
  assert.equal(confirmations,1);
  assert.deepEqual(JSON.parse(storage.get(KEY)),initial);
  consent=true;
  input.files=[{size:new TextEncoder().encode(payload).length,text:async()=>payload}];
  await listeners.import({currentTarget:input});
  assert.equal(loaded,1);
  assert.equal(confirmations,2);
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


test('Prism export refuses a sanitized backup and preserves the exact unsupported original',async()=>{
 const original={...newProgress(),futureKeepsake:{color:'emerald'}};
 const raw=JSON.stringify(original),map=new Map([[KEY,raw],['brandicade:save:v1','glimmer-stays']]);
 const writes=[];let created=0,blob=null;
 const handlers={};
 const controls={
  '#pg-backup-export':{disabled:false,addEventListener(_type,fn){handlers.export=fn;}},
  '#pg-backup-raw':{disabled:false,addEventListener(_type,fn){handlers.raw=fn;}},
  '#pg-backup-import':{files:[],value:'',addEventListener(){}},
  '#pg-backup-verify':{addEventListener(){}},
  '#pg-backup-check':{files:[],value:'',addEventListener(){}},
  '#pg-backup-status':{textContent:'',dataset:{}}
 };
 const panel={setAttribute(){},querySelector:selector=>controls[selector]};
 const host={panel:null,querySelector(selector){return selector==='#pg-backup-tools'?this.panel:selector==='.pg-options'?{after:node=>{this.panel=node;}}:null;}};
 const prev={document:globalThis.document,MutationObserver:globalThis.MutationObserver,window:globalThis.window,localStorage:globalThis.localStorage};
 const url={create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{writes.push(k);map.set(k,v);}};
 globalThis.MutationObserver=class{observe(){}};
 globalThis.window={confirm(){throw Error('restore prompt must not occur');},location:{reload(){throw Error('no reload');}}};
 globalThis.document={getElementById:selector=>selector==='prism-app'?host:selector==='pg-backup-status'?controls['#pg-backup-status']:null,
  createElement:()=>({...panel,click(){created++;},remove(){}}),body:{appendChild(){}}};
 URL.createObjectURL=b=>{blob=b;return 'blob:local-unverified';};URL.revokeObjectURL=()=>{};
 try{
  await import('../src/prism-garden/backup-ui.mjs?lossless-export');
  assert.equal(typeof handlers.export,'function');
  assert.equal(typeof handlers.raw,'function','raw export must be available when data cannot round-trip');
  await handlers.export({currentTarget:controls['#pg-backup-export']});
  assert.equal(created,0,'no lossy verified backup may be downloaded');
  assert.equal(controls['#pg-backup-status'].dataset.kind,'error');
  assert.match(controls['#pg-backup-status'].textContent,/unsupported details/);
  await handlers.raw({currentTarget:controls['#pg-backup-raw']});
  assert.equal(created,1);
  assert.equal(await blob.text(),raw,'unverified raw copy retains every unsupported byte');
  assert.equal(controls['#pg-backup-status'].dataset.kind,'success');
  assert.equal(writes.length,0,'neither export action may write browser storage');
  assert.equal(map.get(KEY),raw);
  assert.equal(map.get('brandicade:save:v1'),'glimmer-stays');
 }finally{
  for(const [key,value] of Object.entries(prev)){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
  URL.createObjectURL=url.create;URL.revokeObjectURL=url.revoke;
 }
});
