import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GEMS,LEVELS} from '../src/prism-garden/content.mjs';
import {createRun,tryMove,undoMove,solve,activeRegion} from '../src/prism-garden/engine.mjs';
import {newProgress,KEY} from '../src/prism-garden/achievements.mjs';
import {describeBoard} from '../src/prism-garden/board-guide.mjs';

test('the board guide displays all authored color regions with truthful current/completed/locked state',()=>{
 for(const level of [LEVELS[0],LEVELS[6],LEVELS[12]]){
  const run=createRun(level),snapshot=JSON.stringify(run),guide=describeBoard(level,run);
  assert.equal(guide.regions.length,level.colors.length);
  assert.equal(guide.regions[0].status,'active');
  assert.ok(guide.regions.slice(1).every(r=>r.status==='locked'));
  assert.ok(guide.regions.every(r=>r.filled===0&&r.total===3));
  assert.equal(guide.placed,0);
  assert.equal(guide.total,level.colors.length*3);
  assert.equal(guide.selection,null);
  assert.match(guide.instruction,/Choose an exposed jewel/);
  assert.equal(JSON.stringify(run),snapshot,'Guidance must not change the move history');
 }
});

test('a selected jewel reports exactly the reducer legal destinations and its color name',()=>{
 const level=LEVELS[0],run=createRun(level),source={kind:'stack',index:0};
 const guide=describeBoard(level,run,source);
 assert.equal(guide.selection.name,GEMS[run.stacks[0][0].color].label);
 assert.ok(guide.destinations.some(d=>d.kind==='socket'&&d.index===0));
 assert.ok(guide.destinations.some(d=>d.kind==='shelf'&&d.index===0));
 assert.match(guide.instruction,/available destinations/);
 assert.equal(run.moves,0);
});

test('the holding shelf can show an unavailable jewel without inventing an illegal move',()=>{
 const level=LEVELS[1],run=createRun(level),source={kind:'stack',index:0};
 const staged=tryMove(level,run,source,{kind:'shelf',index:0});
 assert.equal(staged.ok,true);
 const guide=describeBoard(level,staged.run,{kind:'shelf',index:0});
 assert.equal(guide.selection?.name,'Dew');
 assert.equal(guide.destinations.length,0);
 assert.match(guide.instruction,/no legal destination is open/);
 const back=undoMove(staged.run);
 assert.equal(back.ok,true);
 assert.equal(describeBoard(level,back.run).selection,null);
});

test('region completion and undo update the same progress rail without awarding anything',()=>{
 const level=LEVELS[0],plan=solve(level,createRun(level)).path;
 let state=createRun(level),regions=describeBoard(level,state).regions;
 assert.equal(regions[0].filled,0);
 for(const move of plan){
  const before=activeRegion(state,level);
  const result=tryMove(level,state,move.source,move.target);
  assert.equal(result.ok,true);
  state=result.run;
  if(activeRegion(state,level)>before)break;
 }
 const view=describeBoard(level,state);
 assert.equal(view.regions[0].filled,3);
 assert.equal(view.regions[0].status,'restored');
 assert.equal(view.regions[1].status,'active');
 assert.equal(view.placed,3);
 const undo=undoMove(state);
 assert.equal(undo.ok,true);
 const prior=describeBoard(level,undo.run);
 assert.equal(prior.regions[0].status,'active');
 assert.equal(prior.regions[0].filled,2);
 assert.equal(prior.regions[1].status,'locked');
});

test('mobile board CSS adapts to five 44px socket rows without nested mosaic scrolling',()=>{
 const source=readFileSync(new URL('../src/prism-garden/app.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/prism-garden/prism.css',import.meta.url),'utf8');
 assert.match(source,/115\+level\.colors\.length\*54/);
 assert.match(source,/--pg-board-height:/);
 assert.match(css,/\.pg-world-scene\{height:max\(285px,var\(--pg-board-height,277px\)\);min-height:0\}/);
 assert.match(css,/\.pg-world-scene \.pg-mosaic\{max-height:none;overflow:visible\}/);
 assert.match(css,/\.pg-socket\{touch-action:manipulation;min-width:44px;min-height:44px\}/);
 assert.match(css,/\.pg-clear-selection:focus-visible/);
 assert.match(css,/data-motion="off"/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

let uiCount=0;
async function mount(progress){
 const previous={document:globalThis.document,matchMedia:globalThis.matchMedia,localStorage:globalThis.localStorage};
 const values=new Map([[KEY,JSON.stringify(progress)],['brandicade:save:v1','legacy-intact']]);
 let writes=0,focused=0,handlers={};
 const app={dataset:{},innerHTML:'',addEventListener:(type,fn)=>{handlers[type]=fn},
  querySelector(){return {focus(){focused++}}},querySelectorAll(){return []}};
 globalThis.document={querySelector(){return app}};
 globalThis.matchMedia=()=>({matches:false});
 globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes++;values.set(k,v)}};
 await import('../src/prism-garden/app.mjs?board-guide-'+(++uiCount));
 return {app,handlers,values,get writes(){return writes},get focused(){return focused},
  click:dataset=>handlers.click({detail:0,target:{closest:()=>({dataset,disabled:false})}}),
  key:key=>{let blocked=false;handlers.keydown({key,preventDefault(){blocked=true}});return blocked},
  restore(){for(const [k,v] of Object.entries(previous))if(v===undefined)delete globalThis[k];else globalThis[k]=v}
 };
}

test('a player can select a jewel, read legal placements, clear it by touch or Escape without saving a move',async()=>{
 const ui=await mount(newProgress());
 try{
  ui.click({action:'continue'});
  const saved=ui.values.get(KEY),writes=ui.writes;
  assert.match(ui.app.innerHTML,/RESTORATION PATH/);
  assert.match(ui.app.innerHTML,/aria-current="step"/);
  assert.match(ui.app.innerHTML,/role="progressbar"/);
  assert.match(ui.app.innerHTML,/Jewel regions in restoration order/);
  assert.doesNotMatch(ui.app.innerHTML,/data-action="clear-selection"/);
  ui.click({kind:'stack',index:'0'});
  assert.match(ui.app.innerHTML,/data-action="clear-selection"/);
  assert.match(ui.app.innerHTML,/Fern jewel selected/);
  assert.match(ui.app.innerHTML,/available destination/);
  assert.equal(ui.values.get(KEY),saved);
  ui.click({action:'clear-selection'});
  assert.doesNotMatch(ui.app.innerHTML,/data-action="clear-selection"/);
  assert.equal(ui.values.get(KEY),saved);
  ui.click({kind:'stack',index:'0'});
  assert.equal(ui.key('Escape'),true);
  assert.doesNotMatch(ui.app.innerHTML,/data-action="clear-selection"/);
  assert.ok(ui.focused>0);
  assert.equal(ui.writes,writes);
  assert.equal(ui.values.get('brandicade:save:v1'),'legacy-intact');
 }finally{ui.restore()}
});

test('an advanced five-region mosaic presents all fifteen sockets with a large enough scene',async()=>{
 const progress=newProgress();
 for(const level of LEVELS.slice(0,12))progress.completed[level.id]='2026-11-03T20:00:00.000Z';
 progress.active=createRun(LEVELS[12],{runId:'long-board-qa'});
 const ui=await mount(progress);
 try{
  ui.click({action:'continue'});
  assert.match(ui.app.innerHTML,/--pg-board-height:385px/);
  assert.equal((ui.app.innerHTML.match(/class="pg-region-step /g)||[]).length,5);
  assert.equal((ui.app.innerHTML.match(/data-kind="socket"/g)||[]).length,15);
  assert.match(ui.app.innerHTML,/Moon/);
  assert.match(ui.app.innerHTML,/Rose/);
  assert.equal(ui.writes,0);
  assert.equal(ui.values.get('brandicade:save:v1'),'legacy-intact');
 }finally{ui.restore()}
});
