import test from 'node:test';
import assert from 'node:assert/strict';
import {newSave,exportSave} from '../src/progression.mjs';
import {checkGlimmerBackup} from '../src/backup-file-check.mjs';

test('current exported Glimmer file checks without changing browser storage',()=>{
 const backup=newSave();
 backup.stats.played=8;
 backup.stats.wins=3;
 const text=exportSave(backup);
 const originalStorage=globalThis.localStorage;
 let storageReads=0;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){storageReads++;throw Error('Storage access forbidden');}});
 try {
  const receipt=checkGlimmerBackup(text);
  assert.equal(receipt.gamesPlayed,8);
  assert.equal(receipt.completedLevels,0);
  assert.equal(receipt.mode,'read-only-format-and-lossless-compatibility');
  assert.equal(receipt.cryptographicIntegrityVerified,false);
  assert.equal(storageReads,0);
 } finally {
  if(originalStorage===undefined)delete globalThis.localStorage;
  else Object.defineProperty(globalThis,'localStorage',{configurable:true,value:originalStorage,writable:true});
 }
});

test('normalization that would discard unknown Glimmer save fields is refused',()=>{
 const original=JSON.parse(exportSave(newSave()));
 original.data.unsupportedCustomField={keepsake:true};
 assert.throws(()=>checkGlimmerBackup(JSON.stringify(original)),/lose or alter save details/);
});

test('changed Glimmer backup fields cannot masquerade as checksum verified',()=>{
 const original=JSON.parse(exportSave(newSave()));
 original.data.stats.played=42;
 const outcome=checkGlimmerBackup(JSON.stringify(original));
 assert.equal(outcome.gamesPlayed,42);
 assert.equal(outcome.cryptographicIntegrityVerified,false);
});

test('wrong format, unsupported version, malformed and oversized files fail closed',()=>{
 for(const text of ['{',JSON.stringify({format:'brandicade.prism-garden.backup'}),'z'.repeat(512001)]) {
  assert.throws(()=>checkGlimmerBackup(text));
 }
 const unsupported=JSON.parse(exportSave(newSave()));
 unsupported.data.schemaVersion=99;
 assert.throws(()=>checkGlimmerBackup(JSON.stringify(unsupported)),/Unsupported save version/);
});

test('partial profile that would acquire synthetic default data is refused',()=>{
 const backup=JSON.parse(exportSave(newSave()));
 delete backup.data.settings;
 assert.throws(()=>checkGlimmerBackup(JSON.stringify(backup)),/lose or alter save details/);
});

test('Glimmer verifier is reachable from settings and bundled for offline use',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../build_worker.py',import.meta.url),'utf8');
 assert.ok(app.includes("case 'check-backup':$('#verify-file').click();break;"));
 assert.ok(app.includes('checkGlimmerBackup(contents)'));
 assert.match(app,/const contents=await file\.text\(\);checkGlimmerBackup\(contents\);importPending=importSave\(contents\);/, 'a lossy import must never reach confirmation');
 assert.match(html,/id="verify-file" type="file"/);
 assert.ok(sw.includes("'/src/backup-file-check.mjs'"));
 assert.ok(worker.includes("'/src/backup-file-check.mjs'"));
});
