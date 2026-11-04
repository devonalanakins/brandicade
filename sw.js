/* App-shell caching only. Network-first HTML, offline fallback; no tracking. */
const CACHE='brandicade-prism-bloom-guided-board-v5';
const ASSETS=['/','/index.html','/src/styles.css','/src/arcade-landscape.css','/src/app.mjs','/src/arcade-controller.mjs','/src/engine.mjs','/src/progression.mjs','/prism-garden.html','/src/prism-garden/content.mjs','/src/prism-garden/engine.mjs','/src/prism-garden/board-guide.mjs','/src/prism-garden/feedback.mjs','/src/prism-garden/achievements.mjs','/src/prism-garden/restoration-scene.mjs','/src/prism-garden/app.mjs','/src/prism-garden/controller.mjs','/src/prism-garden/prism.css','/src/prism-garden/save-guard.mjs','/src/prism-garden/backup.mjs','/src/prism-garden/backup-ui.mjs','/src/prism-garden/backup.css','/src/prism-garden/arcade-summary.mjs','/src/arcade-passport.mjs','/assets/atrium.svg','/assets/mark.svg','/assets/icon.svg','/assets/icon-192.png','/assets/icon-512.png','/assets/icon-1024.png','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(res=>{
    if(res.ok){
      const route=new URL(event.request.url).pathname;
      if(route==='/'||route==='/index.html'||route==='/prism-garden.html'){
        const key=route==='/'?'/index.html':route;
        const copy=res.clone();
        void caches.open(CACHE).then(cache=>cache.put(key,copy));
      }
    }
    return res;
  }).catch(async()=>await caches.match(event.request)||await caches.match('/index.html')));
  return;
 }
 event.respondWith(caches.match(event.request).then(cache=>cache||fetch(event.request).then(res=>{if(res.ok){const copy=res.clone();void caches.open(CACHE).then(c=>c.put(event.request,copy));}return res;})));
});
