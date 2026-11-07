/* Brandicade offline shell only: never cache private API responses or Access pages. */
const CACHE='brandicade-glimmer-cascade-v11';
const ASSETS=['/','/index.html','/src/styles.css','/src/arcade-landscape.css','/src/kahlua-arcade.css','/src/app.mjs','/src/backup-file-check.mjs','/src/kahlua-companion.mjs','/src/arcade-controller.mjs','/src/engine.mjs','/src/progression.mjs','/prism-garden.html','/src/prism-garden/content.mjs','/src/prism-garden/engine.mjs','/src/prism-garden/board-guide.mjs','/src/prism-garden/feedback.mjs','/src/prism-garden/achievements.mjs','/src/prism-garden/restoration-scene.mjs','/src/prism-garden/app.mjs','/src/prism-garden/controller.mjs','/src/prism-garden/prism.css','/src/prism-garden/save-guard.mjs','/src/prism-garden/backup.mjs','/src/prism-garden/backup-ui.mjs','/src/prism-garden/backup.css','/src/prism-garden/arcade-summary.mjs','/src/arcade-passport.mjs','/assets/atrium.svg','/assets/kahlua-companion.svg','/assets/mark.svg','/assets/icon.svg','/assets/icon-192.png','/assets/icon-512.png','/assets/icon-1024.png','/manifest.webmanifest'];
const OWNED_CACHE_PREFIX='brandicade-glimmer-cascade-';
const STATIC_PATHS=new Set(ASSETS);
const DOCUMENT_PATHS=new Set(['/', '/index.html', '/prism-garden.html']);

// A service worker controls the whole origin. Limit caching to the explicit,
// unparameterized app shell; even a successful private GET must be network-only.
function safeStaticRequest(request,url){
 return request.method==='GET'&&url.origin===self.location.origin&&!url.search&&
  request.cache!=='no-store'&&!request.headers.get('authorization')&&
  !request.headers.get('range')&&STATIC_PATHS.has(url.pathname);
}
function safeStaticResponse(response,path){
 if(!response||response.status!==200||response.redirected||response.type==='opaque')return false;
 if(response.url){
  const url=new URL(response.url);
  if(url.origin!==self.location.origin||url.pathname!==path||url.search)return false;
 }
 const cc=response.headers.get('cache-control')||'';
 const vary=response.headers.get('vary')||'';
 // The protected Worker explicitly marks personalized HTML/no-store. Respect
 // that response directive even during installation and offline updates.
 return !/\b(no-store|private)\b/i.test(cc)&&
  !/(^|,)\s*(\*|cookie|authorization)\s*(,|$)/i.test(vary)&&
  !response.headers.get('set-cookie');
}
async function precache(){
 let cache;
 try{cache=await caches.open(CACHE);}catch{return;}
 await Promise.all(ASSETS.map(async path=>{
  try{
   // Never follow redirects to an Access sign-in page and cache the result as
   // application HTML. Missing/offline assets may be fetched after sign-in.
   const response=await fetch(new URL(path,self.location.origin),{
    cache:'no-store',credentials:'same-origin',redirect:'error'
   });
   if(safeStaticResponse(response,path))await cache.put(path,response);
  }catch{/* Offline/install auth failures must not persist a login response. */}
 }));
}
self.addEventListener('install',event=>{
 event.waitUntil(precache().then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  // v7 may contain old cached API GETs. Delete prior Brandicade caches without
  // touching unrelated service workers' caches on the same origin.
  let keys=[];
  try{keys=await caches.keys();}catch{/* Storage may be disabled; never use legacy caches. */}
  await Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith(OWNED_CACHE_PREFIX))
   .map(key=>caches.delete(key).catch(()=>false)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(!safeStaticRequest(request,url))return;
 // App screens are network-first; static code/art is cache-first for offline
 // use. Non-shell navigation (including /api/ and /cdn-cgi/) is never handled.
 if(request.mode==='navigate'&&!DOCUMENT_PATHS.has(url.pathname))return;
 event.respondWith((async()=>{
  // CacheStorage can be unavailable (private browsing, quota, denied storage).
  // Keep ordinary network gameplay functional when its optional cache fails.
  let cache=null;
  try{cache=await caches.open(CACHE);}catch{}
  if(request.mode!=='navigate'&&cache){
   try{const existing=await cache.match(url.pathname);if(existing)return existing;}
   catch{/* A broken cache read must never block the network. */}
  }
  try{
   const response=await fetch(request);
   if(cache&&safeStaticResponse(response,url.pathname)){
    try{await cache.put(url.pathname,response.clone());}
    catch{/* No cache storage is required for a successful response. */}
   }
   return response;
  }catch{
   if(cache){
    const fallback=url.pathname==='/'?'/index.html':url.pathname;
    try{const existing=await cache.match(fallback);if(existing)return existing;}
    catch{}
   }
   return Response.error();
  }
 })());
});
