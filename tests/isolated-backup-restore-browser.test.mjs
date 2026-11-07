/** Synthetic cross-context backup/restore rehearsal. Never uses real player saves or Cloudflare. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {newSave} from '../src/progression.mjs';
import {newProgress,KEY as PRISM_KEY} from '../src/prism-garden/achievements.mjs';
import {LEVELS} from '../src/prism-garden/content.mjs';
import {makeBackup} from '../src/prism-garden/backup.mjs';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const GLIMMER_KEY='brandicade:save:v1';
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'text/javascript',
 '.css':'text/css','.svg':'image/svg+xml','.png':'image/png',
 '.jpg':'image/jpeg','.webmanifest':'application/manifest+json'};

async function localServer(){
 const server=createServer(async(req,res)=>{
  try{
   const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const path=resolve(ROOT,'.'+(route==='/'?'/index.html':route));
   if(!path.startsWith(ROOT+sep)){res.writeHead(403).end();return;}
   const data=await readFile(path);
   res.writeHead(200,{'Content-Type':MIME[extname(path)]||'application/octet-stream',
    'Cache-Control':'no-store'});
   res.end(data);
  }catch{res.writeHead(404).end();}
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 return {server,url:'http://127.0.0.1:'+server.address().port};
}

test('two-game export and isolated restore refuse lossy files (Chromium and WebKit)',
 {timeout:300000},async t=>{
 const {server,url}=await localServer();
 try{
  for(const [engine,type] of [['Chromium',chromium],['WebKit',webkit]]){
   await t.test(engine,async()=>{
    const browser=await type.launch({headless:true});
    let originalContext,disposableContext;
    try{
     const glimmer=newSave();glimmer.stats.played=6;glimmer.profile.avatar='fox';
     const prism=newProgress();prism.completed[LEVELS[0].id]='2026-11-06T12:00:00.000Z';
     prism.settings.night=true;
     originalContext=await browser.newContext({viewport:{width:390,height:844},
      serviceWorkers:'block',acceptDownloads:true});
     await originalContext.addInitScript(({g,p})=>{
      if(localStorage.getItem('brandicade:save:v1')===null)
       localStorage.setItem('brandicade:save:v1',g);
      if(localStorage.getItem('brandicade:prism-garden:v1')===null)
       localStorage.setItem('brandicade:prism-garden:v1',p);
     },{g:JSON.stringify(glimmer),p:JSON.stringify(prism)});
     const original=await originalContext.newPage(),originalErrors=[];
     original.on('pageerror',e=>originalErrors.push(e.message));
     await original.goto(url+'/',{waitUntil:'networkidle'});
     await original.locator('#settings-open').click();
     const [glimmerDownload]=await Promise.all([
      original.waitForEvent('download'),
      original.locator('#modal [data-action="export"]').click()
     ]);
     const glimmerText=(await readFile(await glimmerDownload.path())).toString('utf8');
     assert.equal(JSON.parse(glimmerText).format,'BRANDICADE_BACKUP');
     await original.goto(url+'/prism-garden.html',{waitUntil:'networkidle'});
     await original.getByRole('button',{name:/Settings/}).first().click();
     const [prismDownload]=await Promise.all([
      original.waitForEvent('download'),
      original.locator('#pg-backup-export').click()
     ]);
     const prismText=(await readFile(await prismDownload.path())).toString('utf8');
     assert.equal(JSON.parse(prismText).format,'brandicade.prism-garden.backup');
     const sourceSnapshot=await original.evaluate(({g,p})=>({
      glimmer:localStorage.getItem(g),prism:localStorage.getItem(p),
     }),{g:GLIMMER_KEY,p:PRISM_KEY});
     assert.ok(sourceSnapshot.glimmer&&sourceSnapshot.prism);

     // Only the isolated disposable browser context is allowed to import.
     disposableContext=await browser.newContext({viewport:{width:390,height:844},
      serviceWorkers:'block'});
     const page=await disposableContext.newPage(),errors=[];
     page.on('pageerror',e=>errors.push(e.message));
     await page.goto(url+'/',{waitUntil:'networkidle'});
     const originalDisposableGlimmer=await page.evaluate(key=>localStorage.getItem(key),GLIMMER_KEY);
     const lossyGlimmer=JSON.parse(glimmerText);
     lossyGlimmer.data.futureData={mustNotDisappear:true};
     await page.locator('#import-file').setInputFiles({
      name:'glimmer-unknown-fields.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(lossyGlimmer))
     });
     await page.waitForFunction(()=>document.querySelector('#toast')?.textContent?.includes('lose or alter save details'));
     assert.equal(await page.locator('#modal [data-action="confirm-import"]').count(),0,
      'lossy Glimmer file must not offer confirmation');
     assert.equal(await page.evaluate(key=>localStorage.getItem(key),GLIMMER_KEY),
      originalDisposableGlimmer,'lossy Glimmer cannot replace a disposable original');
     await page.locator('#import-file').setInputFiles({
      name:'glimmer-valid.json',mimeType:'application/json',buffer:Buffer.from(glimmerText)
     });
     await page.locator('#modal.open [data-action="confirm-import"]').waitFor();
     assert.equal(await page.evaluate(key=>localStorage.getItem(key),GLIMMER_KEY),
      originalDisposableGlimmer,'valid Glimmer file must wait for explicit confirmation');
     await page.locator('#modal [data-action="confirm-import"]').click();
     await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).stats.played===6,GLIMMER_KEY);
     const installedGlimmer=await page.evaluate(key=>localStorage.getItem(key),GLIMMER_KEY);
     assert.equal(JSON.parse(installedGlimmer).profile.avatar,'fox');

     await page.goto(url+'/prism-garden.html',{waitUntil:'networkidle'});
     await page.getByRole('button',{name:/Settings/}).first().click();
     const beforePrism=await page.evaluate(key=>localStorage.getItem(key),PRISM_KEY);
     await page.evaluate(()=>{
      sessionStorage.setItem('synthetic-restore-confirm-count','0');
      window.confirm=()=>{
       const key='synthetic-restore-confirm-count';
       sessionStorage.setItem(key,String(Number(sessionStorage.getItem(key))+1));
       return true;
      };
     });
     // Has a correct checksum but an unknown field, which the old import
     // handler silently dropped. Validation MUST run before confirmation.
     const losslessFailure=await makeBackup({
      ...JSON.parse(prismText).progress,unknownProgress:{keepsake:true}
     });
     await page.locator('#pg-backup-import').setInputFiles({
      name:'prism-lossy.json',mimeType:'application/json',buffer:Buffer.from(losslessFailure)
     });
     await page.waitForFunction(()=>document.querySelector('#pg-backup-status')?.dataset.kind==='error');
     assert.equal(await page.evaluate(()=>sessionStorage.getItem('synthetic-restore-confirm-count')),'0');
     assert.equal(await page.evaluate(key=>localStorage.getItem(key),PRISM_KEY),beforePrism);
     assert.equal(await page.evaluate(key=>localStorage.getItem(key),GLIMMER_KEY),installedGlimmer);
     await page.locator('#pg-backup-import').setInputFiles({
      name:'prism-valid.json',mimeType:'application/json',buffer:Buffer.from(prismText)
     });
     await page.waitForFunction(({key,id})=>{
      try{return !!JSON.parse(localStorage.getItem(key)).completed[id];}catch{return false;}
     },{key:PRISM_KEY,id:LEVELS[0].id});
     assert.equal(await page.evaluate(()=>sessionStorage.getItem('synthetic-restore-confirm-count')),'1');
     assert.equal(await page.evaluate(key=>localStorage.getItem(key),GLIMMER_KEY),installedGlimmer);
     const restoredPrism=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),PRISM_KEY));
     assert.equal(restoredPrism.completed[LEVELS[0].id],prism.completed[LEVELS[0].id]);
     assert.equal(restoredPrism.settings.night,true);
     assert.deepEqual(await original.evaluate(({g,p})=>({
      glimmer:localStorage.getItem(g),prism:localStorage.getItem(p),
     }),{g:GLIMMER_KEY,p:PRISM_KEY}),sourceSnapshot,
     'the source browser context must never be overwritten by isolated restoration');
     assert.deepEqual([...originalErrors,...errors],[],
      'no browser runtime errors during synthetic two-game restore');
    }finally{
     if(disposableContext)await disposableContext.close();
     if(originalContext)await originalContext.close();
     await browser.close();
    }
   });
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});
