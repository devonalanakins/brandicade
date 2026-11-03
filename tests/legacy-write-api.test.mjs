import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLegacyWriteCandidateAPI } from '../server/legacy-api-write-candidate.mjs';
import { LegacyWriteError } from '../server/legacy-d1-writer.mjs';

const root = 'https://arcade.example.test';
const save = () => ({schemaVersion:1,profile:{name:'Synthetic Player'},stats:{played:3}});
const envelope = (revision=3) => ({baseRevision:revision,save:save()});
const request = (path,method='GET',value=null,headers={}) => new Request(root+path,{
 method,headers: method==='PUT'?{'Content-Type':'application/json',...headers}:headers,
 ...(value===null?{}:{body:typeof value==='string'?value:JSON.stringify(value)})
});
const put = (value=envelope(),headers={}) => request('/api/save','PUT',value,headers);

function setup({role='player',result=4,writeEnabled=true,failure=null}={}) {
 const calls=[],reads=[];
 const authorize=async()=>role==='player'?{role,displayName:'Synthetic Player'}:
  role==='admin'?{role,displayName:'Synthetic Admin'}:null;
 const repository={
  async readSave(){reads.push('save');return {revision:7,save:save(),updatedAt:null};},
  async listBackups(){reads.push('backups');return [{revision:7,updated_at:'2026-11-03'}];}
 };
 const writer={async compareAndSave(document,baseRevision){
  calls.push({document,baseRevision});
  if(failure)throw failure;
  return result;
 }};
 return {api:createLegacyWriteCandidateAPI({authorize,repository,writer,writeEnabled}),
   calls,reads};
}
test('write activation is explicit and a transaction writer is mandatory',async()=>{
 assert.throws(()=>createLegacyWriteCandidateAPI(),/authorizer required/);
 assert.throws(()=>createLegacyWriteCandidateAPI({authorize:async()=>({}),writer:{}}),/writer contract/);
 const h=setup({writeEnabled:false});
 const response=await h.api(put());
 assert.equal(response.status,503);
 assert.equal(h.calls.length,0);
});
test('accepted save preserves current PUT revision contract and no-cache headers',async()=>{
 const h=setup();
 const r=await h.api(put());
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,revision:4});
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 assert.deepEqual(h.calls,[{document:save(),baseRevision:3}]);
});
test('admin and missing identity cannot write or inspect another player via PUT',async()=>{
 for(const role of ['admin','absent']){
  const h=setup({role}),response=await h.api(put());
  assert.equal(response.status,403);
  assert.equal(h.calls.length,0);
  assert.equal(h.reads.length,0);
 }
});
test('input contract rejects invalid revisions, arbitrary ids, invalid body shapes',async()=>{
 const h=setup();
 for(const revision of [-1,3.3,10000001,'3',null]){
  assert.equal((await h.api(put(envelope(revision)))).status,400);
 }
 assert.equal((await h.api(put({...envelope(),playerId:'other'}))).status,400);
 assert.equal((await h.api(put({...envelope(),role:'admin'}))).status,400);
 assert.equal((await h.api(put({baseRevision:3,save:[]}))).status,400);
 assert.equal(h.calls.length,0);
});
test('bounded streaming parsing rejects invalid JSON and oversized bodies before writer',async()=>{
 const h=setup();
 assert.equal((await h.api(put('{invalid'))).status,400);
 assert.equal((await h.api(put(' '.repeat(524289)))).status,413);
 assert.equal((await h.api(put(undefined,{'Content-Type':'text/plain'}))).status,415);
 assert.equal(h.calls.length,0);
});
test('optimistic conflict exposes only current revision and never saved contents',async()=>{
 const h=setup({result:null});
 const response=await h.api(put());
 assert.equal(response.status,409);
 assert.deepEqual(await response.json(),{error:'Concurrent update. Refresh cloud save.',revision:7});
 assert.deepEqual(h.reads,['save']);
});
test('malformed saves and unknown D1 failures do not disclose SQL or retry',async()=>{
 for(const [failure,status] of [
  [new LegacyWriteError('INVALID_SAVE'),400],
  [new LegacyWriteError('INVALID_REVISION'),400],
  [new LegacyWriteError('WRITE_OUTCOME_UNKNOWN'),503],
  [new Error('private SQL exception'),503]
 ]){
  const h=setup({failure}),response=await h.api(put());
  assert.equal(response.status,status);
  assert.equal(h.calls.length,1);
  assert.doesNotMatch(JSON.stringify(await response.json()),/private SQL/);
 }
});
test('invalid success revision fails closed rather than reporting committed data',async()=>{
 const h=setup({result:99});
 const response=await h.api(put());
 assert.equal(response.status,503);
 assert.equal(h.calls.length,1);
});
test('read-only API still supplies session/save/backups and denies other verbs',async()=>{
 const h=setup();
 assert.deepEqual(await (await h.api(request('/api/session'))).json(),{
  role:'player',displayName:'Synthetic Player',cloudSaveEnabled:true
 });
 assert.equal((await h.api(request('/api/save'))).status,200);
 assert.deepEqual(await (await h.api(request('/api/backups'))).json(),{
  backups:[{revision:7,updated_at:'2026-11-03'}]
 });
 assert.equal((await h.api(request('/api/save','DELETE'))).status,405);
 assert.equal((await h.api(request('/api/unknown'))).status,404);
 assert.equal(h.calls.length,0);
});
test('static Worker build explicitly excludes this candidate and production D1',()=>{
 const builder=readFileSync(new URL('../build_worker.py',import.meta.url),'utf8');
 assert.doesNotMatch(builder,/legacy-api-write-candidate\.mjs/);
 assert.doesNotMatch(builder,/legacy-d1-writer\.mjs/);
});
