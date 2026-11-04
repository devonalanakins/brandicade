/**
 * Browser-level landscape acceptance on fresh, isolated test profiles.
 * Does NOT read owner saves, authenticate to Cloudflare Access, or imply
 * physical iOS Safari / Bluetooth Xbox controller verification.
 * Run: npm install --no-save --package-lock=false playwright@1.56.1
 *      npx playwright install chromium
 *      node --test tests/landscape-browser.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const MIMES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.jpg':'image/jpeg'};

/** Static source preview, explicitly not a Cloudflare Access or D1 emulation. */
function staticServer(){
 return createServer(async(request,response)=>{
  try{
   const url=new URL(request.url,'http://localhost');
   const route=decodeURIComponent(url.pathname)==='/'?'/index.html':decodeURIComponent(url.pathname);
   const file=resolve(root,'.'+route);
   if(file!==root&&!file.startsWith(root+sep)){response.writeHead(403).end();return;}
   const body=await readFile(file);
   response.writeHead(200,{'Content-Type':MIMES[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
   response.end(body);
  }catch{response.writeHead(404).end();}
 });
}
async function waitForListening(server){
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return 'http://127.0.0.1:'+server.address().port;
}
async function seedIsolatedPuzzle(page, levelNumber){
 await page.evaluate(async num=>{
  const [{newProgress,KEY},{LEVELS},{createRun}]=await Promise.all([
   import('/src/prism-garden/achievements.mjs'),
   import('/src/prism-garden/content.mjs'),
   import('/src/prism-garden/engine.mjs')
  ]);
  const progress=newProgress();
  for(const level of LEVELS.slice(0,num-1))progress.completed[level.id]='2026-11-04T00:00:00.000Z';
  progress.active=createRun(LEVELS[num-1],{runId:'ephemeral-browser-layout-test'});
  progress.settings.sound=false;
  localStorage.setItem(KEY,JSON.stringify(progress));
 },levelNumber);
 await page.reload({waitUntil:'networkidle'});
 await page.getByRole('button',{name:/Continue your garden/}).click();
 await page.locator('.pg-game').waitFor();
}
function measure(page){
 return page.evaluate(()=>{
  const rect=selector=>{
   const el=document.querySelector(selector),r=el?.getBoundingClientRect();
   return r?{x:r.x,y:r.y,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null;
  };
  const game=document.querySelector('.pg-game');
  const buttons=[...document.querySelectorAll('.pg-socket:not(:disabled), .pg-stack:not(:disabled), .pg-shelf-slot:not(:disabled), .pg-tools button:not(:disabled)')];
  return {viewport:{width:innerWidth,height:innerHeight},
   documentWidth:document.documentElement.scrollWidth,
   game:rect('.pg-game'),scene:rect('.pg-world-scene'),supplies:rect('.pg-supplies'),tools:rect('.pg-tools'),
   maxPlayableBottom:Math.max(...buttons.map(el=>el.getBoundingClientRect().bottom)),
   display:getComputedStyle(game).display,gridColumns:getComputedStyle(game).gridTemplateColumns,
   minButtonWidth:Math.min(...buttons.map(el=>el.getBoundingClientRect().width)),
   minButtonHeight:Math.min(...buttons.map(el=>el.getBoundingClientRect().height)),
   count:buttons.length, sockets:document.querySelectorAll('.pg-socket').length};
 });
}

test('Chromium landscape geometry and keyboard controls: real DOM, isolated saves', {timeout:150000},async t=>{
 const server=staticServer(),url=await waitForListening(server);
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  await mkdir('.artifacts/landscape',{recursive:true});
  for(const viewport of [{width:844,height:390},{width:932,height:430},{width:720,height:390}]){
   await t.test(viewport.width+'x'+viewport.height+' landscape, five-region board',async()=>{
    const context=await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block',hasTouch:true});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    try{
     await page.goto(url+'/prism-garden.html',{waitUntil:'networkidle'});
     await seedIsolatedPuzzle(page,13);
     const m=await measure(page);
     assert.equal(m.display,'grid','landscape game must use real two-column layout');
     assert.equal(m.sockets,15,'hardest puzzle uses all five 3-jewel regions');
     assert.ok(m.game.width>=viewport.width-60,'landscape game must not inherit 540px portrait max-width: '+JSON.stringify(m));
     assert.ok(m.scene.right+2<=m.supplies.left,'world and supplies must not overlap: '+JSON.stringify(m));
     assert.ok(m.supplies.right<=viewport.width+2,'supplies are not horizontally clipped');
     assert.ok(m.documentWidth<=viewport.width+2,'page must not horizontally overflow');
     assert.ok(m.scene.bottom<=viewport.height-6,'jewel scene must fit onscreen without scrolling: '+JSON.stringify(m));
     assert.ok(m.tools.bottom<=viewport.height-6,'primary actions must be visible without scrolling: '+JSON.stringify(m));
     assert.ok(m.maxPlayableBottom<=viewport.height-6,'all enabled jewels and actions must remain visible: '+JSON.stringify(m));
     assert.ok(m.count>5&&m.minButtonWidth>=43.5&&m.minButtonHeight>=43.5,
      'usable jewel and tool targets cannot shrink below 44px: '+JSON.stringify(m));
     const before=await page.evaluate(()=>localStorage.getItem('brandicade:prism-garden:v1'));
     await page.locator('.pg-stack:not([disabled])').first().click();
     assert.equal(await page.locator('.pg-game').getAttribute('data-feedback'),'select');
     assert.equal(await page.evaluate(()=>localStorage.getItem('brandicade:prism-garden:v1')),before,'mere selection cannot save');
     await page.locator('.pg-shelf-slot.target:not([disabled])').first().click();
     assert.equal(await page.locator('.pg-game').getAttribute('data-feedback'),'place');
     assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('brandicade:prism-garden:v1')).active.moves),1);
     await page.locator('.pg-tools [data-action="undo"]').click();
     assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('brandicade:prism-garden:v1')).active.moves),0);
     await page.screenshot({path:'.artifacts/landscape/prism-'+viewport.width+'x'+viewport.height+'.png',fullPage:true,animations:'disabled'});
     assert.deepEqual(errors,[],'browser runtime must not produce unhandled JS exceptions');
    }finally{await context.close();}
   });
  }
  await t.test('Kahlua-only companion hub uses real progress and preserves legacy saves',async()=>{
   const context=await browser.newContext({viewport:{width:844,height:390},serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(url+'/',{waitUntil:'networkidle'});
    await page.screenshot({path:'.artifacts/landscape/kahlua-hub-844x390.png',fullPage:false,animations:'disabled'});
    const dog=page.locator('.kahlua-stage img');
    assert.ok(await dog.count(),'Kahlua companion portrait must load');
    assert.ok(await dog.evaluate(img=>img.complete&&img.naturalWidth>0),'companion art must render');
    const before=await page.evaluate(()=>localStorage.getItem('brandicade:save:v1'));
    await page.locator('#kahlua-greet').click();
    assert.match(await page.locator('#kahlua-response').innerText(),/Kahlua/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('brandicade:save:v1')),before,'greeting is transient, never an achievement or save');
    await page.locator('#level-chip').click();
    assert.ok(await page.locator('#profile-avatar img').evaluate(img=>img.complete&&img.naturalWidth>0));
    assert.equal(await page.locator('[data-avatar], #avatar-options').count(),0,'no alternate avatar controls');
    await page.screenshot({path:'.artifacts/landscape/kahlua-profile-844x390.png',fullPage:true,animations:'disabled'});
    const title=await page.locator('#profile-title').innerText();
    assert.match(title,/Brandi/i,'player profile identity still belongs to Brandi');
    assert.deepEqual(errors,[],'Kahlua hub and profile must not throw');
   }finally{await context.close();}
  });
  await t.test('Kahlua home remains accessible in portrait',async()=>{
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
   const page=await context.newPage();
   try{
    await page.goto(url+'/',{waitUntil:'networkidle'});
    await page.screenshot({path:'.artifacts/landscape/kahlua-hub-390x844.png',fullPage:false,animations:'disabled'});
    assert.ok(await page.locator('#kahlua-greet').isVisible());
    assert.ok(await page.locator('#home [data-action="play"]').isVisible());
    assert.ok(await page.locator('#home a[href="/prism-garden.html"]').first().isVisible());
    const width=await page.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(width<=392,'Kahlua portrait hub cannot horizontally overflow');
   }finally{await context.close();}
  });
  await t.test('portrait remains usable, not a forced-orientation dead end',async()=>{
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.goto(url+'/prism-garden.html',{waitUntil:'networkidle'});
    await seedIsolatedPuzzle(page,1);
    const m=await measure(page);
    assert.equal(m.sockets,9);
    assert.ok(m.documentWidth<=392,'portrait cannot introduce horizontal overflow');
    await page.getByRole('button',{name:/Settings/}).first().click();
    assert.ok(await page.getByText('Sound',{exact:false}).count()>0,'settings must remain available');
    await page.screenshot({path:'.artifacts/landscape/prism-390x844-portrait.png',fullPage:true,animations:'disabled'});
    assert.deepEqual(errors,[]);
   }finally{await context.close();}
  });
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
});
