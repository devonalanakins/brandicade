import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LEVELS,GEMS,WORLDS} from '../src/prism-garden/content.mjs';
import {createRun,tryMove,undoMove,hint,solve,isComplete,assertLevel,validDestinations} from '../src/prism-garden/engine.mjs';
import {ACHIEVEMENTS,newProgress,evaluateAchievements,validateProgress,earned} from '../src/prism-garden/achievements.mjs';
test('the full launch contains three original worlds and eighteen unique deterministic levels',()=>{
 assert.equal(WORLDS.length,3);assert.equal(LEVELS.length,18);
 assert.equal(new Set(LEVELS.map(l=>l.id)).size,18);
 assert.ok(LEVELS.every(assertLevel));
 assert.equal(Object.keys(GEMS).length,6);
});
test('every authored board can be solved and replayed with the exact reducer',()=>{
 for(const level of LEVELS){
  let state=createRun(level),solution=solve(level,state);
  assert.ok(solution,'unsolved '+level.id);
  for(const move of solution.path){
   const result=tryMove(level,state,move.source,move.target);
   assert.ok(result.ok,level.id+' illegal witness');
   state=result.run;
  }
  assert.ok(isComplete(level,state),level.id+' witness not finished');
  assert.equal(state.moves,solution.path.length);
 }
});
test('illegal placements and full slots never consume a move',()=>{
 const level=LEVELS[0],run=createRun(level);
 const result=tryMove(level,run,{kind:'stack',index:0},{kind:'socket',index:8});
 assert.equal(result.ok,false);assert.equal(result.run,run);
 assert.equal(run.moves,0);
});
test('undo reverses the board and shelf while preserving the undo count',()=>{
 const level=LEVELS[4],initial=createRun(level),move=hint(level,initial);
 const result=tryMove(level,initial,move.source,move.target);
 const undone=undoMove(result.run);
 assert.ok(undone.ok);assert.equal(undone.run.undos,1);
 for(const key of ['stacks','shelf','placed','moves'])assert.deepEqual(undone.run[key],initial[key]);
});
test('hints are always legal from the current state',()=>{
 for(const level of LEVELS){
  let run=createRun(level);
  for(let i=0;i<3;i++){
   const step=hint(level,run);assert.ok(step,level.id+' hint unavailable');
   assert.ok(validDestinations(level,run,step.source).some(d=>d.kind===step.target.kind&&d.index===step.target.index));
   run=tryMove(level,run,step.source,step.target).run;
  }
 }
});
test('eighteen stable achievements have no duplicated identifiers',()=>{
 assert.equal(ACHIEVEMENTS.length,18);
 assert.equal(new Set(ACHIEVEMENTS.map(a=>a.id)).size,18);
});
test('completing a puzzle awards only once even on replay and serialization',()=>{
 const level=LEVELS[0];let run=createRun(level);
 for(const move of solve(level,run).path)run=tryMove(level,run,move.source,move.target).run;
 const progress=newProgress();progress.completed[level.id]='2026-11-02T12:00:00.000Z';progress.sanctuary=[level.id];
 const once=evaluateAchievements(progress,run);
 assert.ok(once.some(a=>a.id==='PG-ACH-001'));
 const twice=evaluateAchievements(progress,run);
 assert.equal(twice.length,0);
 const hydrated=validateProgress(JSON.parse(JSON.stringify(progress)));
 assert.ok(hydrated.awards['PG-ACH-001']);
 assert.equal(earned(hydrated,'PG-ACH-001'),false);
});
test('Prism Garden is isolated from old saves and launcher targets its native page',()=>{
 const progression=readFileSync(new URL('../src/progression.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const prism=readFileSync(new URL('../prism-garden.html',import.meta.url),'utf8');
 assert.match(progression,/brandicade:save:v1/);
 assert.match(readFileSync(new URL('../src/prism-garden/achievements.mjs',import.meta.url),'utf8'),/brandicade:prism-garden:v1/);
 assert.match(html,/href="\/prism-garden.html"/);
 assert.match(prism,/src\/prism-garden\/app.mjs/);
 assert.match(prism,/viewport-fit=cover/);
});
