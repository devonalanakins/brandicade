import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LEVELS,WORLDS} from '../src/prism-garden/content.mjs';
import {renderRestoration,restorationState} from '../src/prism-garden/restoration-scene.mjs';
import {newProgress,KEY} from '../src/prism-garden/achievements.mjs';
import {solve,createRun} from '../src/prism-garden/engine.mjs';

test('all three worlds have six genuine authored restoration features',()=>{
 assert.equal(WORLDS.length,3);
 for(let i=0;i<WORLDS.length;i++){
  const state=restorationState(i,{});
  assert.equal(state.total,6);
  assert.equal(state.count,0);
  const art=renderRestoration(i,{}, {variant:'atlas'});
  assert.match(art,/role="img"/);
  assert.match(art,/aria-hidden="true"/);
  assert.match(art,/viewBox="0 0 640 320"/);
  assert.equal((art.match(/data-mosaic="PG-\d{3}"/g)||[]).length,6);
  assert.equal((art.match(/data-restored="yes"/g)||[]).length,0);
  assert.equal((art.match(/data-restored="no"/g)||[]).length,6);
  assert.ok(art.length>2500,'Authored scene must contain visual artwork, not a placeholder');
  assert.doesNotMatch(art,/<(?:script|foreignObject|image)\b/i);
 }
});

test('each earned feature corresponds exactly to its own completed mosaic',()=>{
 const completed={
  [LEVELS[0].id]:'2026-11-03T20:00:00.000Z',
  [LEVELS[2].id]:'2026-11-03T20:05:00.000Z',
  [LEVELS[11].id]:'2026-11-03T20:07:00.000Z'
 };
 const first=restorationState(0,completed);
 assert.equal(first.count,2);
 assert.deepEqual(first.levels.map(l=>l.restored),[true,false,true,false,false,false]);
 const second=restorationState(1,completed),third=restorationState(2,completed);
 assert.equal(second.count,1);assert.equal(third.count,0);
 const art=renderRestoration(0,completed,{variant:'gallery'});
 assert.equal((art.match(/data-restored="yes"/g)||[]).length,2);
 assert.match(art,/data-mosaic="PG-001" data-restored="yes"/);
 assert.match(art,/data-mosaic="PG-002" data-restored="no"/);
 assert.match(art,/data-mosaic="PG-003" data-restored="yes"/);
});

test('a full gallery restores six layers, but only its earned victory feature is highlighted',()=>{
 const completed=Object.fromEntries(LEVELS.slice(12,18).map(l=>[l.id,'2026-11-03T20:00:00.000Z']));
 const state=restorationState(2,completed);
 assert.equal(state.count,6);
 const svg=renderRestoration(2,completed,{variant:'win',freshLevelId:'PG-016'});
 assert.match(svg,/Moonpool Atrium: 6 of 6 mosaics restored/);
 assert.equal((svg.match(/data-restored="yes"/g)||[]).length,6);
 assert.equal((svg.match(/is-new/g)||[]).length,1);
 assert.match(svg,/is-awake is-new" data-mosaic="PG-016"/);
 const stale=renderRestoration(2,completed,{variant:'win',freshLevelId:'PG-001'});
 assert.doesNotMatch(stale,/is-new/);
});

test('unavailable data never invents progress and input does not mutate',()=>{
 const data={...Object.fromEntries(LEVELS.slice(0,4).map(l=>[l.id,'2026-11-03']))};
 const snapshot=JSON.stringify(data);
 for(const bad of [null,undefined,[],false]){
  const state=restorationState(0,bad);
  assert.equal(state.available,false);assert.equal(state.count,null);
  const markup=renderRestoration(0,bad);
  assert.match(markup,/progress unavailable until the saved game is recovered/);
  assert.equal((markup.match(/data-restored="yes"/g)||[]).length,0);
 }
 assert.equal(JSON.stringify(data),snapshot);
 assert.throws(()=>restorationState(4,{}),RangeError);
});

test('scene modes, restored details, placement feedback and reduced-motion rendering are wired',()=>{
 const app=readFileSync(new URL('../src/prism-garden/app.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/prism-garden/prism.css',import.meta.url),'utf8');
 for(const mode of ['gallery','atlas','play','win'])assert.match(app,new RegExp("variant:'"+mode+"'"));
 assert.match(app,/just-placed/);
 assert.match(app,/event\.detail===0/);
 assert.match(css,/\.pg-atlas-restoration/);
 assert.match(css,/\.pg-restoration-layer\.is-new/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/data-motion="off"/);
 assert.match(css,/\.pg-socket\.just-placed/);
});

test('gallery and atlas render real progress without writing either game save',async()=>{
 const previous={document:globalThis.document,matchMedia:globalThis.matchMedia,localStorage:globalThis.localStorage};
 const p=newProgress();
 p.completed[LEVELS[0].id]='2026-11-03T20:00:00.000Z';
 p.completed[LEVELS[6].id]='2026-11-03T20:00:00.000Z';
 const raw=JSON.stringify(p),map=new Map([[KEY,raw],['brandicade:save:v1','original']]);
 let writes=0;const handlers={},app={dataset:{},innerHTML:'',addEventListener:(name,fn)=>handlers[name]=fn,querySelector(){return null;},querySelectorAll(){return []}};
 globalThis.document={querySelector(){return app}};
 globalThis.matchMedia=()=>({matches:false});
 globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{writes++;map.set(k,v)}};
 try{
  await import('../src/prism-garden/app.mjs?restoration-gallery-qa');
  const click=dataset=>handlers.click({target:{closest:()=>({dataset,disabled:false})}});
  click({nav:'gallery'});
  assert.match(app.innerHTML,/Dewglass Conservatory: 1 of 6 mosaics restored/);
  assert.match(app.innerHTML,/Ember Orchard: 1 of 6 mosaics restored/);
  assert.match(app.innerHTML,/Moonpool Atrium: 0 of 6 mosaics restored/);
  assert.equal((app.innerHTML.match(/data-restored="yes"/g)||[]).length,2);
  click({nav:'atlas'});
  assert.equal((app.innerHTML.match(/pg-restoration--atlas/g)||[]).length,3);
  assert.equal(writes,0);
  assert.equal(map.get(KEY),raw);
  assert.equal(map.get('brandicade:save:v1'),'original');
 }finally{
  for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
});

test('victory reveals exactly the newly completed mosaic without changing Glimmer Pop',async()=>{
 const previous={document:globalThis.document,matchMedia:globalThis.matchMedia,localStorage:globalThis.localStorage};
 const map=new Map([['brandicade:save:v1','original']]),handlers={},app={dataset:{},innerHTML:'',addEventListener:(name,fn)=>handlers[name]=fn,querySelector(){return null;},querySelectorAll(){return []}};
 globalThis.document={querySelector(){return app}};
 globalThis.matchMedia=()=>({matches:false});
 globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 try{
  await import('../src/prism-garden/app.mjs?victory-diorama-qa');
  const click=dataset=>handlers.click({detail:1,target:{closest:()=>({dataset,disabled:false})}});
  click({action:'continue'});
  const level=LEVELS[0],solution=solve(level,createRun(level));
  assert.ok(solution?.path);
  for(const move of solution.path){
   click({kind:move.source.kind,index:String(move.source.index)});
   click({kind:move.target.kind,index:String(move.target.index)});
  }
  const save=JSON.parse(map.get(KEY));
  assert.ok(save.completed[level.id]);
  assert.equal(save.active,null);
  assert.match(app.innerHTML,/MOSAIC RESTORED/);
  assert.match(app.innerHTML,/is-awake is-new" data-mosaic="PG-001"/);
  assert.match(app.innerHTML,/1 of 6 world mosaics restored/);
  assert.equal(map.get('brandicade:save:v1'),'original');
 }finally{
  for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
});
