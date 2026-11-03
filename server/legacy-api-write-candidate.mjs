// Non-deploying recovered HTTP write candidate. Not bundled by build_worker.py.
// Production use requires a signature-verified Cloudflare Access authorizer,
// trusted server-owned record key and a tested transaction-capable D1 writer.
import {createLegacyReadOnlyAPI} from './legacy-api-readonly.mjs';
import {LegacyWriteError} from './legacy-d1-writer.mjs';

const LIMIT=524288;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'
}});
async function readJSONBounded(request){
 const size=request.headers.get('content-length');
 if(size!==null&&(!/^\d+$/.test(size)||Number(size)>LIMIT))return {error:'size'};
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))
   return {error:'type'};
 if(!request.body?.getReader)return {error:'json'};
 const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let bytes=0,body='';
 try{
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>LIMIT){await reader.cancel().catch(()=>{});return {error:'size'};}
   body+=decoder.decode(value,{stream:true});
  }
  body+=decoder.decode();
  return {value:JSON.parse(body)};
 }catch{return {error:'json'};}
}
export function createLegacyWriteCandidateAPI({authorize,repository=null,writer=null,writeEnabled=false}={}){
 const readOnly=createLegacyReadOnlyAPI({authorize,repository});
 if(writer!==null&&typeof writer.compareAndSave!=='function')
  throw new TypeError('Transactional D1 writer contract required');
 return async function handle(request){
  let pathname;
  try{pathname=new URL(request.url).pathname;}catch{return json({error:'Invalid request.'},400);}
  if(pathname!=='/api/save'||request.method!=='PUT')return readOnly(request);
  let identity;
  try{identity=await authorize(request);}catch{}
  if(!identity||identity.role!=='player'||typeof identity.displayName!=='string'
     ||!identity.displayName.trim()||identity.displayName.length>80)
    return json({error:'Forbidden'},403);
  if(!writeEnabled||!writer||!repository)return json({error:'Cloud writes disabled.'},503);
  const body=await readJSONBounded(request);
  if(body.error==='size')return json({error:'Save is too large.'},413);
  if(body.error==='type')return json({error:'JSON content type required.'},415);
  if(body.error)return json({error:'Invalid JSON.'},400);
  const input=body.value;
  if(!input||typeof input!=='object'||Array.isArray(input)
    ||Object.keys(input).sort().join(',')!=='baseRevision,save'
    ||!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0||input.baseRevision>10000000
    ||!input.save||typeof input.save!=='object'||Array.isArray(input.save))
   return json({error:'Invalid save schema.'},400);
  try{
   const revision=await writer.compareAndSave(input.save,input.baseRevision);
   if(revision===null){
    const current=await repository.readSave();
    return json({error:'Concurrent update. Refresh cloud save.',revision:current.revision},409);
   }
   if(!Number.isSafeInteger(revision)||revision!==input.baseRevision+1)
    throw new LegacyWriteError('WRITE_OUTCOME_UNKNOWN');
   return json({ok:true,revision});
  }catch(e){
   if(e instanceof LegacyWriteError&&(e.code==='INVALID_SAVE'||e.code==='INVALID_REVISION'))
    return json({error:'Invalid save schema.'},400);
   // Never disclose D1 error, private record contents or ambiguous write outcome.
   return json({error:'Cloud storage unavailable. Check before retrying.'},503);
  }
 };
}
