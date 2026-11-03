import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LEVELS,levelById} from '../src/prism-garden/content.mjs';
import {createRun,validDestinations,tryMove,undoMove,solve} from '../src/prism-garden/engine.mjs';
import {validateProgress,newProgress,KEY} from '../src/prism-garden/achievements.mjs';
import {validateSavedRun,sanitizeImportedProgress} from '../src/prism-garden/save-guard.mjs';
import {makeBackup,parseBackup,MAX_BACKUP_BYTES} from '../src/prism-garden/backup.mjs';

const deps={levelById,createRun,validDestinations,tryMove};
const imports={...deps,validateProgress};
const clone=value=>JSON.parse(JSON.stringify(value));
const first=LEVELS[0];

function sampleRun(){
 let state=createRun(first,{runId:'backup-test-1'});
 const stages=[
  [{kind:'stack',index:0},{kind:'socket',index:0}],
  [{kind:'stack',index:1},{kind:'shelf',index:0}],
  [{kind:'shelf',index:0},{kind:'socket',index:1}]
 ];
 for(const [source,target] of stages){
  const result=tryMove(first,state,source,target);
  assert.equal(result.ok,true);
  state=result.run;
 }
 return state;
}

test('restores an untouched level and replayable real-game action history',()=>{
 assert.equal(validateSavedRun(createRun(first,{runId:'fresh-test'}),deps),true);
 assert.equal(validateSavedRun(sampleRun(),deps),true);
});

test('all authored levels accept their original state and solver witness prefixes',()=>{
 for(const level of LEVELS){
  let run=createRun(level,{runId:'catalog-'+level.id});
  assert.equal(validateSavedRun(run,deps),true,level.id);
  const witness=solve(level,run);
  assert.ok(witness,level.id);
  for(const step of witness.path.slice(0,5)){
   run=tryMove(level,run,step.source,step.target).run;
   assert.equal(validateSavedRun(run,deps),true,level.id+' move '+run.moves);
  }
 }
});

test('actual reducer Undo is accepted and cannot be spoofed into an illegal move',()=>{
 const sample=sampleRun(),undone=undoMove(sample);
 assert.equal(undone.ok,true);
 assert.equal(validateSavedRun(undone.run,deps),true);
 const forged=clone(sample);forged.history[1].stacks[0].reverse();
 assert.equal(validateSavedRun(forged,deps),false);
});

test('a forged or duplicated gem and an illegal socket class are rejected',()=>{
 const invalid=clone(sampleRun());
 invalid.shelf[0]={id:'fake-id',color:'fern'};
 assert.equal(validateSavedRun(invalid,deps),false);
 const wrong=clone(sampleRun());wrong.placed[0].color='moon';
 assert.equal(validateSavedRun(wrong,deps),false);
 const duplicate=clone(sampleRun());duplicate.stacks[0][0]={...duplicate.placed[0]};
 assert.equal(validateSavedRun(duplicate,deps),false);
});

test('truncated or oversized move histories are rejected',()=>{
 const run=sampleRun(),bad=clone(run);
 bad.history.pop();
 assert.equal(validateSavedRun(bad,deps),false);
 const tooLong=clone(run);tooLong.history=Array(81).fill(run.history[0]);
 assert.equal(validateSavedRun(tooLong,deps),false);
});

test('backups round-trip authenticated local structure without touching older arcade storage',async()=>{
 const progress=newProgress();progress.active=sampleRun();
 progress.completed['PG-001']='2026-11-02T20:00:00.000Z';
 const exported=await makeBackup(progress);
 const parsed=await parseBackup(exported,imports);
 assert.deepEqual(parsed,validateProgress(progress));
 assert.equal(KEY,'brandicade:prism-garden:v1');
 const legacy=readFileSync(new URL('../src/progression.mjs',import.meta.url),'utf8');
 assert.match(legacy,/brandicade:save:v1/);
});

test('invalid checksum and a self-consistent forgery are independently rejected',async()=>{
 const original=newProgress();original.active=sampleRun();
 const envelope=JSON.parse(await makeBackup(original));
 envelope.progress.active.placed[0].color='moon';
 await assert.rejects(()=>parseBackup(JSON.stringify(envelope),imports),/integrity check/);
 const data=new TextEncoder().encode(JSON.stringify(envelope.progress));
 const sha=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
 envelope.integrity.digest=[...sha].map(n=>n.toString(16).padStart(2,'0')).join('');
 await assert.rejects(()=>parseBackup(JSON.stringify(envelope),imports),/inconsistent move history/);
 assert.equal(original.active.placed[0].color,'fern');
 assert.throws(()=>sanitizeImportedProgress(envelope.progress,imports));
});

test('unsupported, malformed and oversized backup files fail closed',async()=>{
 await assert.rejects(()=>parseBackup('{',imports),/valid JSON/);
 await assert.rejects(()=>parseBackup('{"format":"other"}',imports),/format or version/);
 await assert.rejects(()=>parseBackup('x'.repeat(MAX_BACKUP_BYTES+1),imports),/not a supported/);
});

test('static host and PWA include backup files without overwriting the offline main page',()=>{
 const html=readFileSync(new URL('../prism-garden.html',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../build_worker.py',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 for(const file of ['save-guard.mjs','backup.mjs','backup-ui.mjs','backup.css']){
  assert.match(worker,new RegExp(file.replaceAll('.','\\.')));
  assert.ok(sw.includes('/src/prism-garden/'+file));
 }
 assert.ok(html.includes('/src/prism-garden/backup-ui.mjs'));
 assert.ok(html.includes('/src/prism-garden/backup.css'));
 assert.match(sw,/route==='\/prism-garden\.html'/);
 assert.match(sw,/cache\.put\(key,copy\)/);
 assert.doesNotMatch(sw,/cache\.put\('\/index\.html',copy\)/);
});
