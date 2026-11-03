import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newSave,SAVE_KEY} from '../src/progression.mjs';
import {planCloudSync} from '../src/cloud-sync.mjs';

function cloud(revision,save=null){return {revision,save,updatedAt:null}}
test('new blank state remains on-device with no upload or restore instruction',()=>{
 const decision=planCloudSync(null,cloud(0));
 assert.equal(decision.kind,'empty');
 assert.equal(decision.revision,0);
 assert.equal(decision.local,null);
 assert.equal(decision.remote,null);
});

test('initial upload is possible only as an explicit device-only state',()=>{
 const source=newSave();
 source.stats.played=9;
 const before=JSON.stringify(source);
 const result=planCloudSync(before,cloud(0));
 assert.equal(result.kind,'upload');
 assert.equal(result.local.stats.played,9);
 assert.equal(result.remote,null);
 assert.equal(JSON.stringify(source),before);
});

test('restore is proposed only when this browser has no prior local save',()=>{
 const remote=newSave();
 remote.stats.played=4;
 const result=planCloudSync(null,cloud(3,remote));
 assert.equal(result.kind,'restore');
 assert.equal(result.remote.stats.played,4);
 assert.equal(result.local,null);
});

test('matching saves do not cause a redundant network write',()=>{
 const original=newSave();
 original.stats.played=6;
 const result=planCloudSync(JSON.stringify(original),cloud(4,original));
 assert.equal(result.kind,'equal');
});

test('different saves are conflicts regardless of play count or updated timestamp',()=>{
 const local=newSave(),remote=structuredClone(local);
 local.stats.played=3;remote.stats.played=7;
 assert.equal(planCloudSync(JSON.stringify(local),cloud(9,remote)).kind,'conflict');
 const localB=structuredClone(remote);
 localB.stats.played=18;
 assert.equal(planCloudSync(JSON.stringify(localB),cloud(10,remote)).kind,'conflict');
});

test('invalid/unsupported cloud revision or save document is rejected without mutation',()=>{
 const local=JSON.stringify(newSave());
 for(const value of [-1,3.1,NaN,Infinity,'5',null,10000001]){
  assert.throws(()=>planCloudSync(local,cloud(value)),/Cloud response is invalid/);
 }
 for(const payload of [null,[],{revision:1,save:[]},{revision:0,save:newSave()},
  {revision:3,save:{schemaVersion:2}},{revision:3,save:4}]){
  assert.throws(()=>planCloudSync(local,payload));
 }
 assert.equal(local.length>0,true);
});

test('corrupt or oversized local data is rejected; never silently treated as blank',()=>{
 for(const local of ['{garbled',' '.repeat(512001),JSON.stringify({schemaVersion:2})]){
  assert.throws(()=>planCloudSync(local,cloud(0)),/unreadable|Unsupported save version/);
 }
});

test('browser bridge cannot silently import, upload, or merge before user interaction',()=>{
 const src=readFileSync(new URL('../src/cloud-sync.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../scripts/build_brandicade_protected.py',import.meta.url),'utf8');
 assert.equal(SAVE_KEY,'brandicade:save:v1');
 assert.match(src,/data-cloud-action="check"/);
 assert.match(src,/deviceBackupVerified/);
 assert.match(src,/remoteBackupVerified/);
 assert.match(src,/state.kind==='conflict'/);
 assert.match(src,/No device data was overwritten/);
 assert.match(src,/credentials:'same-origin'/);
 assert.match(worker,/const CLOUD_SYNC_SOURCE = __CLOUD_SYNC_SOURCE__/);
 assert.match(worker,/src\/cloud-sync\.mjs/);
 assert.doesNotMatch(src,/localStorage\.clear\(/);
 assert.doesNotMatch(src,/localStorage\.removeItem\(/);
});
