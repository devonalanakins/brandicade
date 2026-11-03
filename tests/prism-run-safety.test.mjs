import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS} from '../src/prism-garden/content.mjs';
import {createRun,tryMove,hint} from '../src/prism-garden/engine.mjs';
import {newProgress,KEY} from '../src/prism-garden/achievements.mjs';

let instance=0;
async function mount(progress){
 const old={document:globalThis.document,localStorage:globalThis.localStorage,matchMedia:globalThis.matchMedia};
 const storage=new Map([[KEY,JSON.stringify(progress)],['brandicade:save:v1','unchanged-legacy']]);
 const handlers={};
 let focusCount=0;
 const app={
  dataset:{},innerHTML:'',
  addEventListener(type,fn){handlers[type]=fn;},
  querySelector(){return {focus(){focusCount++;}};},
  querySelectorAll(){return [];}
 };
 globalThis.document={querySelector(){return app;},activeElement:null};
 globalThis.matchMedia=()=>({matches:false});
 globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 await import('../src/prism-garden/app.mjs?run-safety-'+(++instance));
 return {
  app,handlers,storage,
  get saved(){return JSON.parse(storage.get(KEY));},
  get focusCount(){return focusCount;},
  click(dataset){handlers.click({target:{closest:()=>({dataset,disabled:false})}});},
  key(key){let prevented=false;handlers.keydown({key,preventDefault(){prevented=true;}});return prevented;},
  restore(){for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
 };
}
function unfinished(level){
 const start=createRun(level,{runId:'preserve-player-progress'});
 const move=hint(level,start);
 assert.ok(move);
 return tryMove(level,start,move.source,move.target).run;
}
test('Restart requires explicit confirmation before any unfinished move is replaced',async()=>{
 const progress=newProgress();progress.active=unfinished(LEVELS[0]);
 const ui=await mount(progress);
 try{
  ui.click({action:'continue'});
  assert.equal(ui.saved.active.moves,1);
  const originallySaved=ui.storage.get(KEY);
  ui.click({action:'restart'});
  assert.match(ui.app.innerHTML,/role="alertdialog"/);
  assert.match(ui.app.innerHTML,/Restart this mosaic/);
  assert.equal(ui.storage.get(KEY),originallySaved);
  assert.ok(ui.focusCount>0);
  ui.click({action:'cancel-run-change'});
  assert.equal(ui.saved.active.moves,1);
  assert.doesNotMatch(ui.app.innerHTML,/pg-confirm-backdrop/);
  ui.click({action:'restart'});
  assert.equal(ui.key('Escape'),true);
  assert.equal(ui.saved.active.moves,1);
  ui.click({action:'restart'});
  ui.click({action:'accept-run-change'});
  assert.equal(ui.saved.active.moves,0);
  assert.equal(ui.saved.active.levelId,LEVELS[0].id);
  assert.equal(ui.storage.get('brandicade:save:v1'),'unchanged-legacy');
 }finally{ui.restore();}
});
test('Selecting another unlocked level preserves active progress until explicit acceptance',async()=>{
 const progress=newProgress();
 progress.completed[LEVELS[0].id]='2026-11-02T12:00:00.000Z';
 progress.active=unfinished(LEVELS[1]);
 const ui=await mount(progress);
 try{
  ui.click({action:'continue'});
  ui.click({nav:'atlas'});
  ui.click({level:'1'});
  assert.match(ui.app.innerHTML,/Start a different mosaic/);
  assert.match(ui.app.innerHTML,/The Fern Door/);
  assert.equal(ui.saved.active.levelId,LEVELS[1].id);
  assert.equal(ui.saved.active.moves,1);
  ui.click({action:'cancel-run-change'});
  assert.equal(ui.saved.active.levelId,LEVELS[1].id);
  assert.match(ui.app.innerHTML,/The Fern Door/);
  ui.click({nav:'atlas'});
  ui.click({level:'1'});
  ui.click({action:'accept-run-change'});
  assert.equal(ui.saved.active.levelId,LEVELS[0].id);
  assert.equal(ui.saved.active.moves,0);
  assert.ok(ui.saved.completed[LEVELS[0].id]);
  assert.equal(ui.storage.get('brandicade:save:v1'),'unchanged-legacy');
 }finally{ui.restore();}
});
test('A brand-new unplayed puzzle does not force confirmation to restart',async()=>{
 const progress=newProgress();progress.active=createRun(LEVELS[0],{runId:'fresh-game'});
 const ui=await mount(progress);
 try{
  ui.click({action:'continue'});
  ui.click({action:'restart'});
  assert.doesNotMatch(ui.app.innerHTML,/pg-confirm-backdrop/);
  assert.equal(ui.saved.active.moves,0);
 }finally{ui.restore();}
});
