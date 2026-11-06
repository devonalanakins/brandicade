import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import {
  LEGACY_BACKUP_SQL, createEncryptedLegacyBackup,
  decryptEncryptedLegacyBackup, restoreEncryptedLegacyBackupToSandbox,
} from '../server/legacy-backup-vault.mjs';

let recipient, recipientPublic, recipientPrivate, wrongPrivate;
const KEY = 'synthetic-player';
const now = '2026-11-03 00:00:00';

before(async () => {
  const rsa = {name:'RSA-OAEP',modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'};
  recipient = await webcrypto.subtle.generateKey(rsa,true,['encrypt','decrypt']);
  const wrong = await webcrypto.subtle.generateKey(rsa,true,['encrypt','decrypt']);
  recipientPublic = await webcrypto.subtle.exportKey('jwk',recipient.publicKey);
  recipientPrivate = await webcrypto.subtle.exportKey('jwk',recipient.privateKey);
  wrongPrivate = await webcrypto.subtle.exportKey('jwk',wrong.privateKey);
});

function fixture({sandbox=false,seed=true}={}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE saves (
    player_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL,
    updated_at TEXT NOT NULL);
    CREATE TABLE save_history (
    player_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id,revision));`);
  if (sandbox) {
    sql.exec(`CREATE TABLE brandicade_restore_sandbox (
      id INTEGER PRIMARY KEY,purpose TEXT NOT NULL);
      INSERT INTO brandicade_restore_sandbox(id,purpose)
      VALUES(1,'brandicade-disposable-restore-v1');`);
  }
  if(seed){
    for(const version of [1,2]) {
      const data=JSON.stringify({schemaVersion:1,profile:{name:'Synthetic Player'},
        notes:'synthetic progress secret - not for public archive',version});
      if(version===2){sql.prepare('INSERT INTO saves VALUES(?,?,?,?)')
        .run(KEY,version,data,now);}
      sql.prepare('INSERT INTO save_history VALUES(?,?,?,?)')
        .run(KEY,version,data,now);
    }
  }
  const statement=(sqlText,args=[])=>{
    const named=Object.fromEntries(args.map((value,i)=>['?'+(i+1),value]));
    return {
      first:async()=>sql.prepare(sqlText).get(named)??null,
      all:async()=>({success:true,results:sql.prepare(sqlText).all(named)}),
      run:()=>{
        if(/^\s*SELECT\b/i.test(sqlText)) return {
          success:true,results:sql.prepare(sqlText).all(named),meta:{changes:0}};
        const r=sql.prepare(sqlText).run(named);
        return {success:true,results:[],meta:{changes:r.changes}};
      },
    };
  };
  const db={
    prepare(sqlText) {
      return {...statement(sqlText),bind(...args){return statement(sqlText,args)}};
    },
    async batch(statements){
      sql.exec('BEGIN IMMEDIATE');
      try{const result=statements.map(q=>q.run());sql.exec('COMMIT');return result}
      catch(e){sql.exec('ROLLBACK');throw e}
    },
  };
  return {db,sql,close:()=>sql.close()};
}
function rows(sql){
  return {
    save:sql.prepare('SELECT * FROM saves ORDER BY player_id,revision').all(),
    history:sql.prepare('SELECT * FROM save_history ORDER BY player_id,revision').all(),
  };
}
const backup=async db=>createEncryptedLegacyBackup(db,{
  playerRecordKey:KEY,recipientPublicKey:recipientPublic,recipientKeyId:'offline-key-1',
  explicitlyAuthorized:true,
});
const restore=(db,archive,rest={})=>restoreEncryptedLegacyBackupToSandbox(db,archive,{
  recipientPrivateKey:recipientPrivate,expectedPlayerRecordKey:KEY,
  explicitlyDisposable:true,...rest,
});

test('encrypted archive contains no plaintext player identifier or saved records',async()=>{
 const src=fixture();
 try{
   const archive=await backup(src.db), raw=JSON.stringify(archive);
   assert.equal(archive.format,'brandicade-save-vault-v1');
   assert.equal(archive.algorithm,'RSA-OAEP-SHA256+AES-256-GCM');
   assert.equal(archive.keyId,'offline-key-1');
   assert.doesNotMatch(raw,/synthetic-player|Synthetic Player|synthetic progress secret/);
   assert.equal(archive.nonce.length,16);
   const decoded=await decryptEncryptedLegacyBackup(archive,recipientPrivate);
   assert.equal(decoded.playerRecordKey,KEY);
   assert.equal(decoded.save.revision,2);
   assert.equal(decoded.history.length,2);
   assert.equal(decoded.history[0].revision,1);
   assert.equal(decoded.save.data,src.sql.prepare('SELECT data FROM saves').get().data);
 } finally{src.close()}
});

test('independent offline recipient private key is required and never exported',async()=>{
 const src=fixture();
 try{
   const encrypted=await backup(src.db);
   await assert.rejects(decryptEncryptedLegacyBackup(encrypted,wrongPrivate));
   await assert.rejects(decryptEncryptedLegacyBackup(encrypted,recipientPublic));
   assert.ok(!('privateKey' in encrypted));
 }finally{src.close()}
});

test('authenticated envelope rejects tampered ciphertext, IV, recipient ID and format',async()=>{
 const src=fixture();
 try{
   const encrypted=await backup(src.db);
   const bad=[
     {...encrypted,keyId:'another-key'},
     {...encrypted,ciphertext:(encrypted.ciphertext[0]==='A'?'B':'A')+encrypted.ciphertext.slice(1)},
     {...encrypted,nonce:(encrypted.nonce[0]==='A'?'B':'A')+encrypted.nonce.slice(1)},
     {...encrypted,format:'older-unsafe-v0'},
     {...encrypted,playerRecordKey:KEY},
   ];
   for(const archive of bad)await assert.rejects(decryptEncryptedLegacyBackup(archive,recipientPrivate));
 }finally{src.close()}
});

test('encrypted backup restores exact save/history into a marked, empty disposable target',async()=>{
 const src=fixture(),target=fixture({sandbox:true,seed:false});
 try{
   const encrypted=await backup(src.db);
   const before=rows(src.sql);
   const result=await restore(target.db,encrypted);
   assert.deepEqual(result,{verified:true,saves:1,history:2});
   assert.deepEqual(rows(target.sql),before);
   assert.equal(LEGACY_BACKUP_SQL.current.includes('player_id = ?1'),true);
   assert.equal(LEGACY_BACKUP_SQL.history.includes('player_id = ?1'),true);
 }finally{src.close();target.close()}
});

test('second restore cannot overwrite an already populated target',async()=>{
 const src=fixture(),target=fixture({sandbox:true,seed:false});
 try{
   const encrypted=await backup(src.db);
   await restore(target.db,encrypted);
   const before=rows(target.sql);
   await assert.rejects(restore(target.db,encrypted),/entirely empty/);
   assert.deepEqual(rows(target.sql),before);
 }finally{src.close();target.close()}
});

test('missing sandbox marker and missing explicit disposable flag deny writes',async()=>{
 const src=fixture(),unsafe=fixture({seed:false}),safe=fixture({sandbox:true,seed:false});
 try{
   const encrypted=await backup(src.db);
   await assert.rejects(restore(unsafe.db,encrypted),/marker missing/);
   await assert.rejects(restore(safe.db,encrypted,{explicitlyDisposable:false}),/confirmation required/);
   assert.deepEqual(rows(unsafe.sql),{save:[],history:[]});
   assert.deepEqual(rows(safe.sql),{save:[],history:[]});
 }finally{src.close();unsafe.close();safe.close()}
});

test('recipient record mismatch denies restore before target data changes',async()=>{
 const src=fixture(),target=fixture({sandbox:true,seed:false});
 try{
   const encrypted=await backup(src.db);
   await assert.rejects(restore(target.db,encrypted,{expectedPlayerRecordKey:'wrong-player'}),/different record key/);
   assert.deepEqual(rows(target.sql),{save:[],history:[]});
 }finally{src.close();target.close()}
});

test('history insertion error rolls back the prior save INSERT',async()=>{
 const src=fixture(),target=fixture({sandbox:true,seed:false});
 try{
   const encrypted=await backup(src.db);
   target.sql.exec(`CREATE TRIGGER fail_backup_history BEFORE INSERT ON save_history
       BEGIN SELECT RAISE(FAIL,'private injected fault');END`);
   await assert.rejects(restore(target.db,encrypted),/transaction failed/);
   assert.deepEqual(rows(target.sql),{save:[],history:[]});
 }finally{src.close();target.close()}
});

test('oversized source values fail without returning an incomplete backup',async()=>{
 const src=fixture({seed:false});
 try{
   src.sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run(KEY,1,'x'.repeat(524289),now);
   await assert.rejects(backup(src.db),/Invalid snapshot row/);
 }finally{src.close()}
});

test('broken snapshot schema and untrusted key metadata fail closed',async()=>{
 const src=fixture();
 try{
   await assert.rejects(createEncryptedLegacyBackup(src.db,{
     playerRecordKey:'../synthetic',recipientPublicKey:recipientPublic,recipientKeyId:'key', explicitlyAuthorized:true,
   }),/Trusted record key/);
   await assert.rejects(createEncryptedLegacyBackup(src.db,{
     playerRecordKey:KEY,recipientPublicKey:recipientPublic,recipientKeyId:'key with spaces', explicitlyAuthorized:true,
   }),/key ID/);
   const encrypted=await backup(src.db);
   await assert.rejects(decryptEncryptedLegacyBackup({...encrypted,version:2},recipientPrivate));
 }finally{src.close()}
});

test('backup without explicit authorization is refused before reading any records',async()=>{
 const src=fixture();
 try{
   await assert.rejects(createEncryptedLegacyBackup(src.db,{
     playerRecordKey:KEY,recipientPublicKey:recipientPublic,recipientKeyId:'offline-key-1',
   }),/Explicit backup authorization/);
   assert.equal(src.sql.prepare('SELECT COUNT(*) AS n FROM saves').get().n,1);
 }finally{src.close()}
});

test('fixed player key excludes other players even from the encrypted snapshot',async()=>{
 const src=fixture();
 try{
   const foreign='not-our-player';
   src.sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run(foreign,3,'foreign-data',now);
   src.sql.prepare('INSERT INTO save_history VALUES(?,?,?,?)').run(foreign,3,'foreign-data',now);
   const encrypted=await backup(src.db);
   const snapshot=await decryptEncryptedLegacyBackup(encrypted,recipientPrivate);
   assert.equal(snapshot.playerRecordKey,KEY);
   assert.equal(snapshot.history.length,2);
   assert.ok(!JSON.stringify(snapshot).includes('foreign-data'));
   assert.ok(!JSON.stringify(snapshot).includes(foreign));
 }finally{src.close()}
});

test('both static and protected candidate builders exclude the private backup vault',async()=>{
 const {readFileSync}=await import('node:fs');
 for (const path of ['../build_worker.py','../scripts/build_brandicade_protected.py',
                     '../server/legacy-recovery-composition.mjs']) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.doesNotMatch(source,/legacy-backup-vault|createEncryptedLegacyBackup|restoreEncryptedLegacyBackupToSandbox/,
    'backup recovery must remain unexposed: '+path);
 }
 const staticBuild=readFileSync(new URL('../build_worker.py',import.meta.url),'utf8');
 assert.doesNotMatch(staticBuild,/legacy-recovery-composition/);
});
