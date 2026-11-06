#!/usr/bin/env python3
"""Build a REVIEW-ONLY protected Brandicade Worker candidate.

Keeps the existing static asset generator intact. Appends a signed-Access,
legacy-D1-compatible API boundary instead of replacing production with static
assets. This is not a deployment command. Do not upload until release gates
and privately supplied owner config have been independently verified.
"""
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "dist" / "brandicade.worker.js"
OUTPUT = ROOT / "dist" / "brandicade-protected.candidate.mjs"

PREFIX = """/* Brandicade protected Worker CANDIDATE.
 * Source-only, NOT approved for production. Unbundled imports must be
 * resolved by a reviewed Worker bundler before any upload.
 * Private Access identities and keys MUST remain in Cloudflare secrets.
 */
import {createAccessRoleAuthorizer} from '../server/access-roles.mjs';
import {createLegacyRecoveryAPI} from '../server/legacy-recovery-composition.mjs';
"""

RUNTIME = r"""
// Externally served, first-party, opt-in client. Never use inline executable
// JavaScript in the protected HTML: Content Security Policy stays self-only.
const CLOUD_SYNC_SOURCE = __CLOUD_SYNC_SOURCE__;
// JWKS only comes from the fixed, validated Cloudflare Access team issuer.
const keyCache = new Map();
async function fetchTrustedJWKS(issuer) {
  const cached=keyCache.get(issuer);
  if(cached && cached.until>Date.now()) return cached.keys;
  const response=await fetch(issuer+'/cdn-cgi/access/certs',{
    redirect:'error',headers:{accept:'application/json'},cache:'no-store'
  });
  if(!response.ok)throw new Error('Access validation unavailable');
  const keys=await response.json();
  if(!keys||!Array.isArray(keys.keys)||keys.keys.length===0||keys.keys.length>20)
    throw new Error('Invalid Access signing keys');
  keyCache.set(issuer,{keys,until:Date.now()+300000});
  return keys;
}
const restricted = (status) => new Response(status===403?'Forbidden':'Service unavailable',{
  status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
// Authentication must remain available when D1 is down: local-first games
// and cached puzzle artwork do not require a successful cloud-save connection.
function privateAccessConfiguration(env) {
  const keys=['ACCESS_ISSUER','ACCESS_AUDIENCE','ACCESS_PLAYER_EMAIL',
    'ACCESS_ADMIN_EMAIL'];
  if(!env||keys.some(k=>typeof env[k]!=='string'||!env[k]))
    throw new Error('Private Access configuration unavailable');
  return {
    issuer:env.ACCESS_ISSUER,audience:env.ACCESS_AUDIENCE,
    playerEmail:env.ACCESS_PLAYER_EMAIL,adminEmail:env.ACCESS_ADMIN_EMAIL,
    playerDisplayName:env.PLAYER_DISPLAY_NAME||'Player',
    adminDisplayName:'Administrator',
    jwksProvider:()=>fetchTrustedJWKS(env.ACCESS_ISSUER)
  };
}
function privateStorageConfiguration(env,access) {
  if(!env.SAVES||typeof env.SAVES.prepare!=='function'
      ||typeof env.SAVES.batch!=='function')
    throw new Error('Private database unavailable');
  if(typeof env.PLAYER_RECORD_KEY!=='string'||!env.PLAYER_RECORD_KEY
     ||typeof env.PLAYER_DISPLAY_NAME!=='string'||!env.PLAYER_DISPLAY_NAME)
    throw new Error('Private player configuration unavailable');
  if(env.ENABLE_CLOUD_WRITES!==undefined &&
     env.ENABLE_CLOUD_WRITES!=='true'&&env.ENABLE_CLOUD_WRITES!=='false')
    throw new Error('Invalid private cloud-write flag');
  return {
    db:env.SAVES,playerRecordKey:env.PLAYER_RECORD_KEY,
    expectedProfileName:env.PLAYER_DISPLAY_NAME,access,
    writeEnabled:env.ENABLE_CLOUD_WRITES==='true'
  };
}
export default {
  async fetch(request,env) {
    let access,authorize;
    try {
      access=privateAccessConfiguration(env);
      authorize=createAccessRoleAuthorizer(access);
    }catch {return restricted(503);}
    let path;
    try {path=new URL(request.url).pathname;}catch{return restricted(400);}
    // Authenticate every request before exposing either static assets or
    // storage availability. A missing D1 binding never makes the game public.
    try {await authorize(request);}
    catch {return restricted(403);}
    if(path.startsWith('/api/')){
      try {
        const cfg=privateStorageConfiguration(env,access);
        return await createLegacyRecoveryAPI(cfg)(request);
      }catch {return restricted(503);}
    }
    if(path==='/src/cloud-sync.mjs'){
      if(request.method!=='GET'&&request.method!=='HEAD')
        return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
      return new Response(request.method==='HEAD'?null:CLOUD_SYNC_SOURCE,{
        status:200,headers:{'Content-Type':'text/javascript; charset=utf-8',
          'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    const response=await BRANDICADE_STATIC.fetch(request);
    if(request.method!=='GET'||!response.ok)return response;
    if(path==='/'||path==='/index.html'){
      const html=await response.text();
      const snippet='<script type="module" src="/src/cloud-sync.mjs"></script>';
      if(!html.includes('</body>')||html.includes(snippet))return restricted(503);
      const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');
      return new Response(html.replace('</body>',snippet+'</body>'),{
        status:200,headers});
    }
    if(path==='/sw.js'){
      let code=await response.text();
      const cache="const CACHE='brandicade-glimmer-cascade-v9'";
      const assets="const ASSETS=[";
      if(!code.includes(cache)||!code.includes(assets))return restricted(503);
      code=code.replace(cache,"const CACHE='brandicade-glimmer-cascade-cloud-bridge-v9'")
        .replace(assets,"const ASSETS=['/src/cloud-sync.mjs',");
      const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');
      return new Response(code,{status:200,headers});
    }
    return response;
  }
};
"""

def main():
    subprocess.run([sys.executable, str(ROOT / "build_worker.py")],
                   cwd=ROOT, check=True)
    content=STATIC.read_text(encoding="utf-8")
    marker="export default {"
    if content.count(marker)!=1:
        raise RuntimeError("Static Worker export boundary changed; refusing candidate build")
    if "const FILES = " not in content:
        raise RuntimeError("Static asset table missing; refusing candidate build")
    # Neither the game assets nor the original security headers are rewritten.
    content=content.replace(marker,"const BRANDICADE_STATIC = {",1)
    client_path=ROOT / "src" / "cloud-sync.mjs"
    if not client_path.is_file():
        raise RuntimeError("Protected cloud-sync client missing; refuse build")
    client=client_path.read_text(encoding="utf-8")
    if "import {SAVE_KEY,sanitizeSave,exportSave}" not in client:
        raise RuntimeError("Unexpected cloud-sync import boundary")
    runtime=RUNTIME.replace("__CLOUD_SYNC_SOURCE__",
                            json.dumps(client, ensure_ascii=True))
    OUTPUT.write_text(PREFIX+content+"\n"+runtime,encoding="utf-8")
    print("Built REVIEW-ONLY protected candidate",OUTPUT,
          OUTPUT.stat().st_size,"bytes; no upload performed")

if __name__=="__main__":main()
