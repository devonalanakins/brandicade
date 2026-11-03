import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const ISSUER='https://synthetic-team.cloudflareaccess.com';
const AUD='synthetic-candidate-audience';
const PLAYER='player@example.invalid',ADMIN='admin@example.invalid';
const now=()=>Math.floor(Date.now()/1000);
const b64=x=>Buffer.from(x instanceof ArrayBuffer||ArrayBuffer.isView(x)?x:JSON.stringify(x)).toString('base64url');
let worker,privateKey,jwks,originalFetch;
before(async()=>{
 const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 privateKey=pair.privateKey;
 const key=await webcrypto.subtle.exportKey('jwk',pair.publicKey);
 key.kid='fixture-key';key.use='sig';jwks={keys:[key]};
 originalFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url!==ISSUER+'/cdn-cgi/access/certs')throw Error('Unexpected network request');
  return {ok:true,async json(){return jwks}};
 };
 worker=(await import('../dist/brandicade-protected.candidate.mjs')).default;
});
after(()=>{if(originalFetch)globalThis.fetch=originalFetch});
async function signed(email=PLAYER,change={}){
 const header={typ:'JWT',alg:'RS256',kid:'fixture-key'};
 const payload={iss:ISSUER,aud:[AUD],sub:'synthetic-subject',email,iat:now()-30,nbf:now()-30,exp:now()+600,...change};
 const data=b64(header)+'.'+b64(payload);
 const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,Buffer.from(data));
 return data+'.'+b64(signature);
}
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE saves(player_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
 sqlite.exec('CREATE TABLE save_history(player_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(player_id,revision));');
 const db={
  prepare(sql){return {bind(...args){
   const named=Object.fromEntries(args.map((v,i)=>['?'+(i+1),v]));
   return {
    first:async()=>sqlite.prepare(sql).get(named)??null,
    all:async()=>({results:sqlite.prepare(sql).all(named)}),
    run:()=>{const r=sqlite.prepare(sql).run(named);return {success:true,meta:{changes:r.changes}}}
   }
  }}},
  async batch(queries){
   sqlite.exec('BEGIN IMMEDIATE');
   try{const results=queries.map(q=>q.run());sqlite.exec('COMMIT');return results}
   catch(e){sqlite.exec('ROLLBACK');throw e}
  }
 };
 return {sqlite,db,close(){sqlite.close()}};
}
function env(db,extra={}){
 return {SAVES:db,ACCESS_ISSUER:ISSUER,ACCESS_AUDIENCE:AUD,
  ACCESS_PLAYER_EMAIL:PLAYER,ACCESS_ADMIN_EMAIL:ADMIN,
  PLAYER_RECORD_KEY:'synthetic-player',PLAYER_DISPLAY_NAME:'Synthetic Player',
  ENABLE_CLOUD_WRITES:'false',...extra};
}
async function hit(path,token,configuration,method='GET',payload){
 const headers=token?{'cf-access-jwt-assertion':token}:{};
 if(payload!==undefined)headers['content-type']='application/json';
 const req=new Request('https://arcade.example.invalid'+path,{
  method,headers,...(payload===undefined?{}:{body:JSON.stringify(payload)})
 });
 return worker.fetch(req,configuration);
}
const save=(played=1)=>({schemaVersion:1,profile:{name:'Synthetic Player'},stats:{played}});

test('missing, tampered, expired, wrong-audience and unlisted identities cannot read even static assets',async()=>{
 const f=fixture();
 try{
  assert.equal((await hit('/',null,env(f.db))).status,403);
  const good=await signed(),parts=good.split('.');
  const changed=b64({...JSON.parse(Buffer.from(parts[1],'base64url').toString()),email:ADMIN});
  assert.equal((await hit('/',parts[0]+'.'+changed+'.'+parts[2],env(f.db))).status,403);
  assert.equal((await hit('/',await signed('not-listed@example.invalid'),env(f.db))).status,403);
  assert.equal((await hit('/',await signed(PLAYER,{aud:['wrong']}),env(f.db))).status,403);
  assert.equal((await hit('/',await signed(PLAYER,{exp:now()-10}),env(f.db))).status,403);
 }finally{f.close()}
});
test('missing or invalid private settings fail closed',async()=>{
 const f=fixture();try{
  const jwt=await signed();
  for(const config of [env(null),env(f.db,{ACCESS_AUDIENCE:''}),
    env(f.db,{ACCESS_ADMIN_EMAIL:PLAYER}),env(f.db,{ENABLE_CLOUD_WRITES:'yes'})]){
   assert.equal((await hit('/',jwt,config)).status,503);
  }
 }finally{f.close()}
});
test('signed player sees first-party Prism assets and legacy read contracts; admin never reads player progress',async()=>{
 const f=fixture();try{
  const user=await signed(),admin=await signed(ADMIN),config=env(f.db);
  const page=await hit('/',user,config);
  assert.equal(page.status,200);
  assert.match(await page.text(),/BRANDICADE|Brandicade/);
  assert.equal((await hit('/src/prism-garden/app.mjs',user,config)).status,200);
  assert.equal((await hit('/src/prism-garden/board-guide.mjs',user,config)).status,200);
  assert.deepEqual(await (await hit('/api/session',user,config)).json(),
    {role:'player',displayName:'Synthetic Player',cloudSaveEnabled:true});
  assert.deepEqual(await (await hit('/api/save',user,config)).json(),
    {revision:0,save:null,updatedAt:null});
  assert.deepEqual(await (await hit('/api/backups',user,config)).json(),{backups:[]});
  assert.equal((await hit('/api/session',admin,config)).status,200);
  assert.equal((await hit('/api/save',admin,config)).status,403);
  assert.equal((await hit('/api/backups',admin,config)).status,403);
  assert.equal((await hit('/index.html',admin,config)).status,200);
 }finally{f.close()}
});
test('writes are disabled by default; explicit gate gives atomic revision/history and stale conflict',async()=>{
 const f=fixture();try{
  const jwt=await signed(),input={baseRevision:0,save:save()};
  assert.equal((await hit('/api/save',jwt,env(f.db),'PUT',input)).status,503);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM saves').get().n,0);
  const config=env(f.db,{ENABLE_CLOUD_WRITES:'true'});
  assert.deepEqual(await (await hit('/api/save',jwt,config,'PUT',input)).json(),
    {ok:true,revision:1});
  assert.deepEqual(await (await hit('/api/save',jwt,config,'PUT',
    {baseRevision:1,save:save(2)})).json(),{ok:true,revision:2});
  assert.equal((await hit('/api/save',jwt,config,'PUT',input)).status,409);
  const current=await (await hit('/api/save',jwt,config)).json();
  assert.equal(current.revision,2);assert.deepEqual(current.save,save(2));
  const history=await (await hit('/api/backups',jwt,config)).json();
  assert.deepEqual(history.backups.map(x=>x.revision),[2,1]);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM save_history').get().n,2);
 }finally{f.close()}
});
test('failed history insert rolls back preceding save changes',async()=>{
 const f=fixture();try{
  const jwt=await signed(),config=env(f.db,{ENABLE_CLOUD_WRITES:'true'});
  assert.equal((await hit('/api/save',jwt,config,'PUT',{baseRevision:0,save:save()})).status,200);
  f.sqlite.exec("CREATE TRIGGER deny_history BEFORE INSERT ON save_history BEGIN SELECT RAISE(FAIL,'Synthetic rollback'); END");
  assert.equal((await hit('/api/save',jwt,config,'PUT',{baseRevision:1,save:save(999)})).status,503);
  assert.equal(f.sqlite.prepare('SELECT revision AS r FROM saves').get().r,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM save_history').get().n,1);
  assert.deepEqual((await (await hit('/api/save',jwt,config)).json()).save,save());
 }finally{f.close()}
});
test('candidate generation contains no real identities or private keys',()=>{
 const content=readFileSync(new URL('../dist/brandicade-protected.candidate.mjs',import.meta.url),'utf8');
 assert.match(content,/const BRANDICADE_STATIC =/);
 assert.match(content,/createLegacyRecoveryAPI/);
 assert.match(content,/ENABLE_CLOUD_WRITES==='true'/);
 assert.doesNotMatch(content,/(?:admin|player)@[^\s"'<>]*\.(?:com|org|net)/i);
 assert.doesNotMatch(content,/BEGIN\s+PRIVATE\s+KEY/i);
});
