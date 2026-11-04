/**
 * WebKit engine smoke and orientation tests for Brandicade's landscape-first UI.
 * WebKit on GitHub Actions is NOT physical iPhone Safari, Cloudflare Access,
 * a real Xbox controller, an installed PWA, or owner-data recovery.
 *
 * Tests run on disposable per-context localStorage and a localhost source preview.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';
import {webkit} from 'playwright';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const MIMES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json',
 '.jpg':'image/jpeg','.webp':'image/webp'};

async function serveSource() {
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      const route=decodeURIComponent(url.pathname)==='/'?'/index.html':decodeURIComponent(url.pathname);
      const path=resolve(root,'.'+route);
      if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
      const body=await readFile(path);
      res.writeHead(200,{'Content-Type':MIMES[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(body);
    }catch{res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {server,url:'http://127.0.0.1:'+server.address().port};
}

const landscape={width:844,height:390}, portrait={width:390,height:844};

async function geometry(page){
  return page.evaluate(()=>{
    const locate=selector=>{
      const el=document.querySelector(selector);
      if(!el)return null;
      const r=el.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
    };
    return {
      width:innerWidth,height:innerHeight,
      docWidth:document.documentElement.scrollWidth,
      game:locate('#game'),board:locate('#pop-board'),
      prism:locate('#prism-app .pg-game'),
      world:locate('#prism-app .pg-world-scene'),
      supplies:locate('#prism-app .pg-supplies'),
      tools:locate('#prism-app .pg-tools')
    };
  });
}
async function seedPrismProgress(page){
  await page.evaluate(async()=>{
    const [{newProgress,KEY},{LEVELS},{createRun}]=await Promise.all([
      import('/src/prism-garden/achievements.mjs'),
      import('/src/prism-garden/content.mjs'),
      import('/src/prism-garden/engine.mjs')
    ]);
    const progress=newProgress();
    for(const level of LEVELS.slice(0,12)) progress.completed[level.id]='2026-11-04T00:00:00.000Z';
    progress.active=createRun(LEVELS[12],{runId:'temporary-webkit-layout-fixture'});
    progress.settings.sound=false;
    localStorage.setItem(KEY,JSON.stringify(progress));
  });
}

test('WebKit landscape/portrait and state preservation: disposable local preview',{timeout:180000},async t=>{
  const {server,url}=await serveSource();
  let browser;
  try{
    browser=await webkit.launch({headless:true});
    await mkdir('.artifacts/landscape',{recursive:true});

    await t.test('Kahlua-only hub rotates without personal art, fake awards or horizontal overflow',async()=>{
      const context=await browser.newContext({viewport:landscape,isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(url+'/',{waitUntil:'networkidle'});
        const image=page.locator('#kahlua-stage img');
        assert.equal(await image.count(),1);
        assert.equal(await image.evaluate(el=>el.complete&&el.naturalWidth>0),true,'only dog art should load correctly');
        assert.equal(await page.locator('[data-avatar], #avatar-options').count(),0,'no portrait or alternate avatar UI');
        const before=await page.evaluate(()=>localStorage.getItem('brandicade:save:v1'));
        await page.locator('#kahlua-greet').tap();
        assert.match(await page.locator('#kahlua-response').innerText(),/Kahlua/);
        await page.screenshot({path:'.artifacts/landscape/webkit-kahlua-844x390.png',animations:'disabled'});
        await page.setViewportSize(portrait);
        let m=await geometry(page);
        assert.ok(m.docWidth<=m.width+2,'portrait hub must not overflow horizontally: '+JSON.stringify(m));
        assert.equal(await page.locator('#kahlua-greet').isVisible(),true,'companion still usable in portrait');
        await page.screenshot({path:'.artifacts/landscape/webkit-kahlua-390x844.png',animations:'disabled'});
        await page.setViewportSize(landscape);
        m=await geometry(page);
        assert.ok(m.docWidth<=m.width+2,'rotated landscape hub must not overflow');
        assert.equal(await page.evaluate(()=>localStorage.getItem('brandicade:save:v1')),before,
          'petting Kahlua and rotating are cosmetic, not progression mutations');
        assert.deepEqual(errors,[],'no unhandled WebKit JS errors');
      }finally{await context.close();}
    });

    await t.test('Glimmer Pop retains a selected jewel and real run across rotations',async()=>{
      const context=await browser.newContext({viewport:landscape,isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(url+'/',{waitUntil:'networkidle'});
        await page.locator('#home [data-action="play"]').tap();
        await page.locator('#pop-board [data-cell]').first().waitFor();
        assert.equal(await page.locator('#pop-board [data-cell]').count(),49);
        const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('brandicade:save:v1')));
        const board=await geometry(page);
        assert.ok(board.board?.left>=0&&board.board?.right<=board.width+2,'jewel board horizontally visible: '+JSON.stringify(board));
        assert.ok(board.board?.bottom<=board.height+2,'jewel board visible without scroll in short landscape: '+JSON.stringify(board));
        const first=page.locator('#pop-board [data-cell="0"]');
        await first.tap();
        assert.equal(await first.getAttribute('aria-pressed'),'true','touch selects an actual jewel');
        await page.screenshot({path:'.artifacts/landscape/webkit-glimmer-844x390.png',animations:'disabled'});
        await page.setViewportSize(portrait);
        assert.equal(await page.locator('#pop-board [data-cell="0"]').getAttribute('aria-pressed'),'true',
          'layout rotation must not silently discard current touch selection');
        const m=await geometry(page);
        assert.ok(m.docWidth<=m.width+2,'Glimmer portrait cannot overflow horizontally: '+JSON.stringify(m));
        await page.setViewportSize(landscape);
        await page.locator('#pop-board [data-cell="0"]').tap();
        assert.equal(await page.locator('#pop-board [data-cell="0"]').getAttribute('aria-pressed'),'false');
        const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('brandicade:save:v1')));
        assert.deepEqual(saved.progression,original.progression,'rotation cannot generate XP or stars');
        assert.deepEqual(saved.achievements,original.achievements,'rotation cannot mint awards');
        assert.equal(saved.currentRun.movesMade,original.currentRun.movesMade,'selection is not a move');
        assert.deepEqual(errors,[],'no unhandled WebKit JS errors');
      }finally{await context.close();}
    });

    await t.test('Prism Garden five-region board survives rotate and supports touch Undo',async()=>{
      const context=await browser.newContext({viewport:landscape,isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(url+'/prism-garden.html',{waitUntil:'networkidle'});
        await seedPrismProgress(page);
        await page.reload({waitUntil:'networkidle'});
        await page.getByRole('button',{name:/Continue your garden/}).tap();
        await page.locator('.pg-game').waitFor();
        assert.equal(await page.locator('.pg-socket').count(),15);
        let m=await geometry(page);
        assert.ok(m.docWidth<=m.width+2,'Prism landscape cannot overflow');
        assert.ok(m.prism?.width>=m.width-60,'Prism landscape must be a full-width two-column experience');
        assert.ok(m.world?.right+1<=m.supplies?.left,'Prism scene and supplies must not overlap');
        assert.ok(m.tools?.bottom<=m.height-4,'Prism tools must fit into landscape viewport');
        const before=await page.evaluate(()=>localStorage.getItem('brandicade:prism-garden:v1'));
        await page.locator('.pg-stack:not([disabled])').first().tap();
        assert.equal(await page.locator('.pg-game').getAttribute('data-feedback'),'select');
        assert.equal(await page.evaluate(()=>localStorage.getItem('brandicade:prism-garden:v1')),before,
          'mere touch selection cannot persist progress');
        await page.setViewportSize(portrait);
        m=await geometry(page);
        assert.ok(m.docWidth<=m.width+2,'Prism portrait cannot overflow');
        assert.equal(await page.locator('.pg-game').count(),1,'rotation cannot navigate away from puzzle');
        await page.setViewportSize(landscape);
        const target=page.locator('.pg-shelf-slot.target:not([disabled])').first();
        await target.tap();
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('brandicade:prism-garden:v1')).active.moves),1,
          'touch placement must count precisely once');
        await page.locator('.pg-tools [data-action="undo"]').tap();
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('brandicade:prism-garden:v1')).active.moves),0,
          'Undo restores the legitimate initial run');
        await page.screenshot({path:'.artifacts/landscape/webkit-prism-844x390.png',animations:'disabled'});
        assert.deepEqual(errors,[],'no unhandled WebKit JS errors');
      }finally{await context.close();}
    });
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
