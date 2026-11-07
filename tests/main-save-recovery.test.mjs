import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SAVE_KEY,newSave,readLosslessLocalSave,inspectLocalSave,loadSave,persist,restoreConfirmedBackup} from '../src/progression.mjs';

function storage(original=null){
 const slots=new Map(original===null?[]:[[SAVE_KEY,original]]);
 slots.set('prism-garden:progress:v1','jewel-progress-unaltered');
 const writes=[];
 return {
  slots,writes,
  getItem(key){return slots.has(key)?slots.get(key):null},
  setItem(key,value){writes.push({key,value});slots.set(key,value)}
 };
}

test('first play has an empty save slot; ordinary progress is persisted normally',()=>{
 const db=storage(),first=inspectLocalSave(db);
 assert.equal(first.status,'empty');
 assert.equal(first.save.profile.name,'Brandi');
 assert.equal(db.writes.length,0);
 first.save.stats.played=7;
 assert.equal(persist(first.save,db),true);
 assert.equal(db.writes.length,1);
 const recovered=inspectLocalSave(db);
 assert.equal(recovered.status,'valid');
 assert.equal(recovered.save.stats.played,7);
 assert.equal(loadSave(db).stats.played,7);
 assert.equal(db.slots.get('prism-garden:progress:v1'),'jewel-progress-unaltered');
});

test('malformed JSON is never silently overwritten by initialization or future saves',()=>{
 for(const raw of ['{bad json','',JSON.stringify({schemaVersion:1,profile:{name:'Brandi'},currentRun:{}}).slice(0,10)]){
  const db=storage(raw);
  const result=inspectLocalSave(db);
  assert.equal(result.status,'unreadable');
  assert.equal(result.save.profile.name,'Brandi'); // temporary rendering only
  assert.equal(persist(result.save,db),false);
  assert.equal(db.writes.length,0);
  assert.equal(db.slots.get(SAVE_KEY),raw);
  assert.equal(db.slots.get('prism-garden:progress:v1'),'jewel-progress-unaltered');
 }
});

test('unknown or normalized Glimmer fields are never silently overwritten by ordinary saves',()=>{
 for(const modified of [
  save=>{save.unknownTreasures={rare:['jade']};},
  save=>{save.profile.avatar='unsupported-future-avatar';},
  save=>{delete save.settings;},
  save=>{save.stats.played=-5;},
 ]){
  const saved=newSave();saved.stats.played=12;modified(saved);
  const raw=JSON.stringify(saved),db=storage(raw);
  assert.throws(()=>readLosslessLocalSave(raw),/cannot preserve/);
  const inspected=inspectLocalSave(db);
  assert.equal(inspected.status,'unreadable','recovery mode must be shown for a lossy source');
  assert.equal(persist(inspected.save,db),false,'normal gameplay must not replace unknown progress');
  assert.equal(db.writes.length,0);
  assert.equal(db.slots.get(SAVE_KEY),raw,'original exact bytes remain available for raw export');
 }
});

test('lossless local saves still round-trip and permit ordinary updates',()=>{
 const valid=newSave();valid.stats.played=4;
 const raw=JSON.stringify(valid),db=storage(raw);
 assert.deepEqual(readLosslessLocalSave(raw),valid);
 const loaded=inspectLocalSave(db);
 assert.equal(loaded.status,'valid');
 loaded.save.stats.played++;
 assert.equal(persist(loaded.save,db),true);
 assert.equal(inspectLocalSave(db).save.stats.played,5);
});

test('unsupported schema, oversized records, and invalid storage types fail closed',()=>{
 for(const raw of [JSON.stringify({schemaVersion:2}), 'a'.repeat(524289),42]){
  const db=storage(raw);
  const result=inspectLocalSave(db);
  assert.equal(result.status,'unreadable');
  assert.equal(persist(newSave(),db),false);
  assert.equal(db.writes.length,0);
  assert.strictEqual(db.slots.get(SAVE_KEY),raw);
 }
});

test('unexpected undefined storage result also fails closed',()=>{
 const writes=[];
 const invalid={getItem:()=>undefined,setItem:(...v)=>writes.push(v)};
 assert.equal(inspectLocalSave(invalid).status,'unreadable');
 assert.equal(persist(newSave(),invalid),false);
 assert.equal(writes.length,0);
});

test('storage read denied cannot be mistaken for a new game',()=>{
 let reads=0,writes=0;
 const denied={getItem(){reads++;throw Error('SecurityError')},setItem(){writes++}};
 assert.equal(inspectLocalSave(denied).status,'unreadable');
 assert.equal(persist(newSave(),denied),false);
 assert.equal(writes,0);
 assert.equal(reads,2);
});

test('valid existing progress and cosmetic choices survive normal updates',()=>{
 const original=newSave();original.stats.played=13;original.profile.avatar='fox';
 const db=storage(JSON.stringify(original)),newData=inspectLocalSave(db).save;
 newData.stats.played+=1;
 assert.equal(persist(newData,db),true);
 assert.equal(inspectLocalSave(db).save.stats.played,14);
 assert.equal(inspectLocalSave(db).save.profile.avatar,'fox');
});

test('only explicitly confirmed valid backup can replace a damaged original',()=>{
 const raw='{unreadable original save contents';
 const db=storage(raw);
 assert.equal(inspectLocalSave(db).status,'unreadable');
 const source=newSave();source.stats.played=23;source.profile.avatar='fox';
 const failure={schemaVersion:99,profile:{name:'Brandi'}};
 assert.throws(()=>restoreConfirmedBackup(failure,db),/Unsupported save version/);
 assert.equal(db.writes.length,0);
 assert.equal(db.slots.get(SAVE_KEY),raw);
 const receipt=restoreConfirmedBackup(source,db);
 assert.equal(receipt.ok,true);
 assert.equal(receipt.save.stats.played,23);
 assert.equal(inspectLocalSave(db).status,'valid');
 assert.equal(inspectLocalSave(db).save.stats.played,23);
 assert.equal(db.writes.length,1);
 assert.equal(db.slots.get('prism-garden:progress:v1'),'jewel-progress-unaltered');
});

test('failed explicit backup restore does not clear blocked state or destroy original',()=>{
 const raw='{raw damaged save';
 const db={getItem:()=>raw,setItem(){throw Error('QuotaExceededError')}};
 const result=restoreConfirmedBackup(newSave(),db);
 assert.equal(result.ok,false);
 assert.equal(result.save,null);
 assert.equal(inspectLocalSave(db).status,'unreadable');
});

test('Glimmer Pop recovery UI requires an explicit confirmed import and preserves Prism',()=>{
 const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
 assert.match(app,/const bootSave=inspectLocalSave\(\)/);
 assert.match(app,/saveBlocked=bootSave.status==='unreadable'/);
 assert.match(app,/if\(saveBlocked\)\{if\(!storageWarningShown\)/);
 assert.match(app,/if\(saveBlocked&&id==='game'\)/);
 assert.match(app,/function showRecoveryNotice\(\)/);
 assert.match(app,/brandicade-original-unreadable-save\.txt/);
 assert.match(app,/case 'recovery-export':doRecoveryExport\(\)/);
 assert.match(app,/case 'recovery-import':case 'import':/);
 assert.match(app,/restoreConfirmedBackup\(importPending\)/);
 assert.match(app,/if\(!result.ok\).*Original saved data is unchanged/);
 assert.match(app,/saveBlocked=false;storageWarningShown=false/);
 assert.match(app,/showRecoveryNotice\(\);navigate/);
 assert.match(css,/#brandicade-save-recovery/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
