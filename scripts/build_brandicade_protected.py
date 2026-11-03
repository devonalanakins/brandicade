#!/usr/bin/env python3
"""Build a REVIEW-ONLY protected Brandicade Worker candidate.

Keeps the existing static asset generator intact. Appends a signed-Access,
legacy-D1-compatible API boundary instead of replacing production with static
assets. This is not a deployment command. Do not upload until release gates
and privately supplied owner config have been independently verified.
"""
from pathlib import Path
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
function protectedConfiguration(env) {
  if(!env||!env.SAVES||typeof env.SAVES.prepare!=='function'
      ||typeof env.SAVES.batch!=='function')
    throw new Error('Private database unavailable');
  const keys=['ACCESS_ISSUER','ACCESS_AUDIENCE','ACCESS_PLAYER_EMAIL',
    'ACCESS_ADMIN_EMAIL','PLAYER_RECORD_KEY','PLAYER_DISPLAY_NAME'];
  if(keys.some(k=>typeof env[k]!=='string'||!env[k]))
    throw new Error('Private worker configuration unavailable');
  if(env.ENABLE_CLOUD_WRITES!==undefined &&
     env.ENABLE_CLOUD_WRITES!=='true'&&env.ENABLE_CLOUD_WRITES!=='false')
    throw new Error('Invalid private cloud-write flag');
  return {
    db:env.SAVES,playerRecordKey:env.PLAYER_RECORD_KEY,
    expectedProfileName:env.PLAYER_DISPLAY_NAME,
    access:{
      issuer:env.ACCESS_ISSUER,audience:env.ACCESS_AUDIENCE,
      playerEmail:env.ACCESS_PLAYER_EMAIL,adminEmail:env.ACCESS_ADMIN_EMAIL,
      playerDisplayName:env.PLAYER_DISPLAY_NAME,adminDisplayName:'Administrator',
      jwksProvider:()=>fetchTrustedJWKS(env.ACCESS_ISSUER)
    },
    writeEnabled:env.ENABLE_CLOUD_WRITES==='true'
  };
}
export default {
  async fetch(request,env) {
    let cfg,authorize;
    try {
      cfg=protectedConfiguration(env);
      authorize=createAccessRoleAuthorizer(cfg.access);
    }catch {return restricted(503);}
    let path;
    try {path=new URL(request.url).pathname;}catch{return restricted(400);}
    if(path.startsWith('/api/')){
      try {return await createLegacyRecoveryAPI(cfg)(request);}
      catch {return restricted(503);}
    }
    try {await authorize(request);}
    catch {return restricted(403);}
    return BRANDICADE_STATIC.fetch(request);
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
    OUTPUT.write_text(PREFIX+content+"\n"+RUNTIME,encoding="utf-8")
    print("Built REVIEW-ONLY protected candidate",OUTPUT,
          OUTPUT.stat().st_size,"bytes; no upload performed")

if __name__=="__main__":main()
