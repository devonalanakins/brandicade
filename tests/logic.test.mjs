import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import {makeRun,findMove,trySwap,levelSpec,adjacent,matches,validateRun} from '../src/engine.mjs';
import {newSave,recordVisit,recordTurn,recordEnd,exportSave,importSave,sanitizeSave,ACHIEVEMENTS} from '../src/progression.mjs';
test('boards begin without automatic matches and always have a move',()=>{for(let l=1;l<=50;l++){const r=makeRun(l);assert.equal(matches(r.board).length,0);assert.ok(findMove(r.board));assert.ok(validateRun(r));}});
test('invalid swaps do not consume moves',()=>{const r=makeRun(1);const n=trySwap(r,0,48);assert.equal(n.ok,false);assert.equal(r.movesLeft,24);});
test('deterministic board and accepted swap',()=>{const r=makeRun(1);assert.deepEqual(makeRun(1),r);const m=findMove(r.board);const a=trySwap(r,m.from,m.to);assert.ok(a.ok);assert.equal(a.run.movesLeft,r.movesLeft-1);assert.ok(a.event.matched>=3);assert.ok(validateRun(a.run));});
test('reward engine records genuine wins and cannot duplicate first-time rewards',()=>{const s=newSave();recordVisit(s,new Date('2026-10-29T12:00:00Z'));const r=makeRun(1);const win={...r,won:true,ended:true,stars:3,score:20000,collected:14,movesLeft:7};const first=recordEnd(s,win);assert.equal(s.stats.wins,1);assert.ok(first.newAwards.some(x=>x.id==='first-light'));assert.equal(s.progression.totalStars,3);const count=Object.keys(s.achievements).length;recordEnd(s,win);assert.equal(Object.keys(s.achievements).length,count);assert.equal(s.progression.totalStars,3);});
test('backup roundtrip and schema rejection',()=>{const s=newSave();s.profile.avatar='fox';const restored=importSave(exportSave(s));assert.equal(restored.profile.avatar,'fox');assert.throws(()=>importSave('{bad'));assert.throws(()=>importSave(JSON.stringify({format:'BRANDICADE_BACKUP',data:{schemaVersion:3}})));});
test('tampered cosmetic unlocks are rejected',()=>{const s=newSave();s.profile.title='queen';s.profile.frame='orchid';const clean=sanitizeSave(s);assert.equal(clean.profile.title,'keeper');assert.equal(clean.profile.frame,'copper');});
test('all achievement ids unique',()=>{assert.equal(new Set(ACHIEVEMENTS.map(a=>a.id)).size,ACHIEVEMENTS.length);});


test('cascade visuals precisely reflect genuine engine waves without entering saved runs',()=>{
 for(let level=1;level<=24;level++){
  const original=makeRun(level),before=JSON.stringify(original);
  const action=findMove(original.board);
  assert.ok(action,'fixture always has a real legal swap');
  const first=trySwap(original,action.from,action.to),repeat=trySwap(original,action.from,action.to);
  assert.equal(first.ok,true);
  assert.deepEqual(first,repeat,'wave trace is deterministic, not random UI effects');
  assert.equal(JSON.stringify(original),before,'trace cannot mutate the source run');
  assert.ok(validateRun(first.run));
  assert.equal(Object.hasOwn(first.run,'visualWaves'),false,'transient preview cannot pollute local saves');
  const waves=first.event.visualWaves;
  assert.equal(waves.length,Math.min(first.event.chain,6),'only bounded real cascades are presented');
  for(const wave of waves){
   assert.ok(wave.cleared.length>=3,'a real match clears at least three cells');
   assert.deepEqual(wave.cleared,[...new Set(wave.cleared)].sort((a,b)=>a-b));
   assert.ok(wave.cleared.every(i=>Number.isInteger(i)&&i>=0&&i<49));
   assert.equal(wave.after.length,49,'gravity produces a complete board');
   assert.ok(wave.after.every(x=>['fern','aqua','ember','sun','orchid','luna'].includes(x)));
  }
  if(first.event.chain<=6)assert.equal(waves.reduce((sum,w)=>sum+w.cleared.length,0),first.event.matched,
    'clear animation counts only actual cleared jewels');
 }
});

test('cascade preview is optional and reduced-motion gets the same deterministic rewards',()=>{
 const run=makeRun(2),m=findMove(run.board),res=trySwap(run,m.from,m.to);
 assert.ok(res.ok);
 assert.equal(res.run.movesMade,run.movesMade+1);
 assert.equal(res.run.movesLeft,run.movesLeft-1);
 const saved=JSON.parse(JSON.stringify(res.run));
 assert.deepEqual(saved,res.run);
 const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/kahlua-arcade.css',import.meta.url),'utf8');
 assert.match(app,/await animateGlimmerCascades\(current,a,b,result\.event,result\.run\)/);
 assert.match(app,/board\.setAttribute\('aria-busy','true'\)/);
 assert.match(app,/p1\.cancel\(\);p2\.cancel\(\)/,'finished swap animations must release their transforms');
 assert.match(app,/save\.currentRun===committedRun/,'stale run cannot continue to animate over a replacement');
 assert.match(app,/if\(!board\|\|!activeMotion\(\)/,'calm gameplay must bypass animation');
 assert.match(css,/glimmer-clear/);
 assert.match(css,/glimmer-refill/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/body\.calm #pop-board/);
});
