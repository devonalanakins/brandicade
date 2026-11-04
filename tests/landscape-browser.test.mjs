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
    const order=await page.evaluate(()=>{
      const rect=s=>document.querySelector(s)?.getBoundingClientRect();
      const copy=rect('#home .hero-text'),stage=rect('#home .kahlua-stage'),
        action=rect('#home .hero-text .actions'),greet=rect('#kahlua-greet');
      return {copy:copy?.bottom,stageTop:stage?.top,actionBottom:action?.bottom,greetTop:greet?.top,greetBottom:greet?.bottom,navTop:rect('.bottom-nav')?.top};
    });
    assert.ok(order.copy<=order.stageTop+2,'portrait copy must not overlap dog artwork: '+JSON.stringify(order));
    assert.ok(order.actionBottom<=order.stageTop+2,'portrait Play buttons must be above Kahlua: '+JSON.stringify(order));
    assert.ok(order.greetTop>=order.stageTop+6,'Kahlua greeting must remain inside her own scene');
    assert.ok(order.greetBottom<=order.navTop-3,'greeting must stay above fixed mobile navigation: '+JSON.stringify(order));
    assert.ok(await page.locator('#home .hero-text [data-action="play"]').isVisible());
    assert.ok(await page.locator('#home a[href="/prism-garden.html"]').first().isVisible());
    const width=await page.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(width<=392,'Kahlua portrait hub cannot horizontally overflow');
   }finally{await context.close();}
  });
  await t.test('Glimmer Pop: earned match cues do not reward invalid swaps or lose controller focus',async()=>{
   const context=await browser.newContext({viewport:{width:844,height:390},serviceWorkers:'block',reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.goto(url+'/',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
     const [{newSave,SAVE_KEY},{makeRun}]=await Promise.all([import('/src/progression.mjs'),import('/src/engine.mjs')]);
     const save=newSave();save.currentRun=makeRun(1);save.settings.sound=false;
     localStorage.setItem(SAVE_KEY,JSON.stringify(save));
    });
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#home .hero-text [data-action="play"]').click();
    await page.locator('#pop-board [data-cell="0"]').waitFor();
    const geometry=await page.evaluate(()=>{
      const rect=q=>document.querySelector(q)?.getBoundingClientRect();
      const tiles=[...document.querySelectorAll('#pop-board .charm')].map(el=>el.getBoundingClientRect());
      const board=rect('.game-board-outer'),back=rect('#game .back-button'),
        help=rect('#game .utility-button'),tools=rect('#game .game-tools'),
        nav=document.querySelector('.bottom-nav');
      return {count:tiles.length,minWidth:Math.min(...tiles.map(x=>x.width)),
        minHeight:Math.min(...tiles.map(x=>x.height)),
        boardRight:board?.right,boardBottom:board?.bottom,
        backLeft:back?.left,backTop:back?.top,helpBottom:help?.bottom,
        toolsBottom:tools?.bottom,navDisplay:getComputedStyle(nav).display,
        scrollWidth:document.documentElement.scrollWidth,height:innerHeight,width:innerWidth};
    });
    assert.equal(geometry.count,49);
    assert.ok(geometry.minWidth>=43.5&&geometry.minHeight>=43.5,
      '7x7 board must retain 44px jewels: '+JSON.stringify(geometry));
    assert.ok(geometry.boardBottom<=geometry.height-10,
      'every Glimmer jewel must remain visible without scrolling: '+JSON.stringify(geometry));
    assert.ok(geometry.boardRight+7<=geometry.backLeft,
      'board and control rail cannot overlap: '+JSON.stringify(geometry));
    assert.ok(geometry.toolsBottom<=geometry.height-10,
      'Hint and Restart must fit on the landscape play screen: '+JSON.stringify(geometry));
    assert.equal(geometry.navDisplay,'none','arcade nav cannot obscure live gameplay');
    assert.ok(geometry.scrollWidth<=geometry.width+2,'no horizontal overflow');

    const path=await page.evaluate(async()=>{
      const {findMove,adjacent,trySwap}=await import('/src/engine.mjs');
      const run=JSON.parse(localStorage.getItem('brandicade:save:v1')).currentRun;
      const valid=findMove(run.board);
      let invalid=null;
      for(let a=0;a<run.board.length&&!invalid;a++)for(let b=a+1;b<run.board.length;b++){
       if(adjacent(a,b)&&!trySwap(run,a,b).ok){invalid={from:a,to:b};break;}
      }
      return {valid,invalid,level:run.level};
    });
    assert.ok(path.valid&&path.invalid,'fixture should have both matching and nonmatching swaps');
    const original=await page.evaluate(()=>localStorage.getItem('brandicade:save:v1'));
    await page.locator('#pop-board [data-cell="'+path.invalid.from+'"]').click();
    await page.locator('#pop-board [data-cell="'+path.invalid.to+'"]').click();
    assert.equal(await page.locator('#glimmer-moment').isHidden(),true,'invalid move cannot celebrate');
    const afterInvalid=await page.evaluate(()=>localStorage.getItem('brandicade:save:v1'));
    const baseline=JSON.parse(original),checked=JSON.parse(afterInvalid);
    assert.deepEqual(checked.currentRun,baseline.currentRun,'invalid move must not alter board, turns, or score');
    assert.deepEqual(checked.progression,baseline.progression,'invalid move must not add XP or unlock levels');
    assert.deepEqual(checked.achievements,baseline.achievements,'invalid move must not mint achievements');
    assert.deepEqual(checked.stats,baseline.stats,'invalid move must not change match or win stats');
    await page.locator('#pop-board [data-cell="'+path.valid.from+'"]').click();
    await page.locator('#pop-board [data-cell="'+path.valid.to+'"]').click();
    await page.waitForFunction(()=>!document.getElementById('glimmer-moment').hidden);
    assert.equal(await page.locator('#toast').evaluate(el=>el.classList.contains('visible')),false,
      'a prior rejected-swap warning must not contradict the successful match');
    assert.match(await page.locator('#glimmer-moment-title').innerText(),/MATCH|CASCADE|CHAIN|GARDEN COMPLETE/);
    assert.match(await page.locator('#glimmer-moment-detail').innerText(),/charms.+points/);
    assert.equal(await page.locator('#glimmer-moment').getAttribute('aria-hidden'),'true');
    assert.equal(await page.locator('#glimmer-moment').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion removes flash, not result');
    const updated=await page.evaluate(()=>JSON.parse(localStorage.getItem('brandicade:save:v1')));
    assert.equal(updated.currentRun.movesMade,1);
    assert.equal(updated.currentRun.level,path.level);
    if(!updated.currentRun.ended)assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-cell')),String(path.valid.to),'controller focus must survive board redraw');
    await page.screenshot({path:'.artifacts/landscape/glimmer-kahlua-844x390.png',fullPage:false,animations:'allow'});
    await page.waitForFunction(()=>document.getElementById('glimmer-moment').hidden,{timeout:5000});
    assert.deepEqual(errors,[]);
   }finally{await context.close();}
  });
  await t.test('synthetic Xbox input navigates Kahlua, games, pause, and treasures without accidental saves',async()=>{
   const context=await browser.newContext({viewport:{width:844,height:390},serviceWorkers:'block'});
   await context.addInitScript(()=>{
    const mock={index:0,id:'Synthetic Xbox standard layout - not physical hardware',mapping:'standard',
     connected:true,axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
    Object.defineProperty(window,'__syntheticGamepad',{configurable:false,value:mock});
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[mock]});
   });
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const press=async(index)=>{
    await page.evaluate(i=>{window.__syntheticGamepad.buttons[i].pressed=true;},index);
    await page.waitForTimeout(100);
    await page.evaluate(i=>{window.__syntheticGamepad.buttons[i].pressed=false;},index);
    await page.waitForTimeout(55);
   };
   try{
    await page.goto(url+'/',{waitUntil:'networkidle'});
    await page.waitForSelector('#controller-indicator:not([hidden])',{timeout:5000});
    const baseline=await page.evaluate(()=>JSON.parse(localStorage.getItem('brandicade:save:v1')));
    await press(0); // A first focuses Play instead of unexpectedly launching a game.
    assert.ok(await page.locator('#home [data-action="play"]').first().evaluate(el=>document.activeElement===el),
     'first controller confirm should focus the real primary Play action');
    assert.equal(await page.locator('.section.active').getAttribute('id'),'home');
    await press(0); // Second A genuinely launches existing Glimmer Pop.
    assert.equal(await page.locator('.section.active').getAttribute('id'),'game');
    assert.equal(await page.locator('#pop-board [data-cell]').count(),49);
    await press(15); // Right D-pad establishes board focus.
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-cell')),'0');
    await press(15);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-cell')),'1');
    await press(0); // Select the focused jewel (not an actual move).
    assert.ok(await page.locator('#pop-board .charm.selected').count(),'A should select jewel');
    await press(1); // B cancels jewel selection before leaving the active game.
    assert.equal(await page.locator('#pop-board .charm.selected').count(),0);
    assert.equal(await page.locator('.section.active').getAttribute('id'),'game');
    // From the rightmost jewel, D-pad RIGHT must escape to actual game tools.
    // This guards against trapping controller users inside the 7x7 board.
    await page.locator('#pop-board [data-cell="48"]').focus();
    await press(15);
    assert.ok(await page.evaluate(()=>Boolean(document.activeElement?.closest('#game .game-tools'))),
      'rightmost jewel must lead into the adjacent Hint/Restart control rail');
    await press(14);
    assert.ok(await page.evaluate(()=>Boolean(document.activeElement?.matches('#pop-board [data-cell]'))),
      'left D-pad returns from tools to the jewel board');
    // Keyboard arrows already have native in-grid handling; the new capture
    // handler must not cause a second cell move.
    await page.locator('#pop-board [data-cell="7"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.cell),'8',
      'keyboard RIGHT must move exactly one jewel, never two');
    await page.locator('#pop-board [data-cell="48"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.ok(await page.evaluate(()=>Boolean(document.activeElement?.closest('#game .game-tools'))),
      'keyboard can escape the final column to the adjacent game tools');
    await press(9); // Menu pause in-game.
    assert.equal(await page.locator('#controller-pause').isHidden(),false);
    assert.equal(await page.locator('#content').evaluate(el=>el.inert),true,
     'paused game controls must not be keyboard/touch/controller reachable');
    await press(1);
    assert.equal(await page.locator('#controller-pause').isHidden(),true);
    assert.equal(await page.locator('#content').evaluate(el=>el.inert),false);
    await press(1); // B returns home only when there is no selected jewel.
    assert.equal(await page.locator('.section.active').getAttribute('id'),'home');
    await press(3); // Y opens the legitimate trophy gallery.
    assert.equal(await page.locator('.section.active').getAttribute('id'),'treasures');
    await press(1);
    assert.equal(await page.locator('.section.active').getAttribute('id'),'home');
    await press(5); // RB -> Games, focus must be INSIDE new section.
    assert.equal(await page.locator('.section.active').getAttribute('id'),'library');
    assert.equal(await page.evaluate(()=>document.activeElement?.closest('.section')?.id),'library');
    await press(5); // RB again -> Treasures.
    assert.equal(await page.locator('.section.active').getAttribute('id'),'treasures');
    await press(5); // RB -> Brandi profile, which illustrates only Kahlua.
    assert.equal(await page.locator('.section.active').getAttribute('id'),'profile');
    assert.equal(await page.locator('[data-avatar]').count(),0);
    await press(1);
    assert.equal(await page.locator('.section.active').getAttribute('id'),'home');
    const finalSave=await page.evaluate(()=>JSON.parse(localStorage.getItem('brandicade:save:v1')));
    assert.deepEqual(finalSave.progression,baseline.progression,'opening a genuine run must not invent XP or stars');
    assert.deepEqual(finalSave.achievements,baseline.achievements,'controller menu actions must not mint awards');
    assert.equal(finalSave.stats.wins,baseline.stats.wins,'nonmatching selections must not count as wins');
    assert.equal(finalSave.currentRun.movesMade,0,'select/deselect does not consume a turn');
    assert.deepEqual(errors,[],'synthetic controller path must not throw browser exceptions');
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
