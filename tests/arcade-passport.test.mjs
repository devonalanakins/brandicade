import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCADE_PASSPORT,deriveArcadePassport} from '../src/arcade-passport.mjs';
const defs=Array.from({length:10},(_,i)=>({id:'GP-'+String(i+1)}));
const glimmer=()=>({schemaVersion:1,progression:{levels:{}},stats:{wins:0},achievements:{}});
const prism=()=>({available:true,completed:0,totalLevels:18,earned:0,totalAchievements:18,worldsVisited:0,goldMedals:0});
const won=(g,n,stars=2)=>{for(let i=1;i<=n;i++)g.progression.levels[i]={stars};g.stats.wins=n;return g};
test('six stable, unique arcade-only badges',()=>{
 assert.equal(ARCADE_PASSPORT.length,6);
 assert.equal(new Set(ARCADE_PASSPORT.map(a=>a.id)).size,6);
});
test('no games played never earns rewards',()=>{
 const x=deriveArcadePassport(glimmer(),prism(),defs);
 assert.equal(x.available,true);assert.equal(x.earned,0);assert.ok(x.awards.every(a=>!a.unlocked));
});
test('each prerequisite is based on both games with no automatic mutation',()=>{
 const g=won(glimmer(),12,3),p={...prism(),completed:18,earned:18,worldsVisited:3,goldMedals:3};
 defs.forEach(d=>g.achievements[d.id]='2026-11-03T20:00:00.000Z');
 const before=JSON.stringify({g,p});const x=deriveArcadePassport(g,p,defs);
 assert.equal(x.earned,6);assert.ok(x.awards.every(a=>a.unlocked));
 assert.equal(JSON.stringify({g,p}),before);
});
test('partial and precise thresholds do not grant extra trophies',()=>{
 const g=won(glimmer(),4),p={...prism(),completed:4,worldsVisited:2};
 const x=deriveArcadePassport(g,p,defs);
 assert.deepEqual(x.awards.map(a=>a.unlocked),[true,false,false,false,false,false]);
});
test('missing or corrupt Prism data never becomes a locked/earned claim',()=>{
 const g=won(glimmer(),12,3);for(const bad of [{...prism(),available:false},{...prism(),earned:null},null]){
  const x=deriveArcadePassport(g,bad,defs);assert.equal(x.available,false);assert.equal(x.earned,null);assert.deepEqual(x.awards,[]);
 }
});
test('bad Glimmer save never earns awards and does not crash',()=>{
 for(const g of [null,{}, {...glimmer(),schemaVersion:0},{...glimmer(),achievements:[]}]){
  const x=deriveArcadePassport(g,prism(),defs);assert.equal(x.available,false);
 }
});
test('gold requires Glimmer three-star and Prism gold medal',()=>{
 const g=won(glimmer(),1,2),p={...prism(),completed:1,goldMedals:1};
 assert.equal(deriveArcadePassport(g,p,defs).awards[2].unlocked,false);
 g.progression.levels[1].stars=3;
 assert.equal(deriveArcadePassport(g,p,defs).awards[2].unlocked,true);
});
