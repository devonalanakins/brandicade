import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LEVELS} from '../src/prism-garden/content.mjs';
import {ACHIEVEMENTS,newProgress,persistProgress,KEY} from '../src/prism-garden/achievements.mjs';
import {prismArcadeSummary} from '../src/prism-garden/arcade-summary.mjs';

test('read-only arcade summary reflects legitimate Prism Garden completion and trophies',()=>{
 const progress=newProgress();
 progress.completed[LEVELS[0].id]='2026-11-03T20:00:00.000Z';
 progress.awards[ACHIEVEMENTS[0].id]='2026-11-03T20:00:00.000Z';
 const map=new Map([[KEY,JSON.stringify(progress)],['brandicade:save:v1','legacy-unchanged']]);
 let writes=0;
 const storage={getItem:key=>map.get(key)??null,setItem(){writes++;throw Error('Read-only summary must not write');}};
 const summary=prismArcadeSummary(storage);
 assert.equal(summary.available,true);
 assert.equal(summary.completed,1);
 assert.equal(summary.totalLevels,18);
 assert.equal(summary.earned,1);
 assert.equal(summary.totalAchievements,18);
 assert.equal(summary.awards.filter(a=>a.unlocked).length,1);
 assert.equal(writes,0);
 assert.equal(map.get(KEY),JSON.stringify(progress));
 assert.equal(map.get('brandicade:save:v1'),'legacy-unchanged');
});

test('empty, malformed and inaccessible Prism saves are not fabricated as arcade achievements',()=>{
 const empty=prismArcadeSummary({getItem:()=>null});
 assert.equal(empty.available,true);
 assert.equal(empty.completed,0);
 assert.equal(empty.earned,0);
 const corrupt=prismArcadeSummary({getItem:()=>'{not-json'});
 assert.equal(corrupt.available,false);
 assert.equal(corrupt.completed,null);
 assert.equal(corrupt.earned,null);
 const denied=prismArcadeSummary({getItem(){throw Error('Storage access denied')}});
 assert.equal(denied.available,false);
});

test('both launcher cards remain first-class routes within Brandicade with an arcade return',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const garden=readFileSync(new URL('../src/prism-garden/app.mjs',import.meta.url),'utf8');
 const links=[...html.matchAll(/<a class="game-card prism-card[^>]*href="\/prism-garden\.html"/g)];
 assert.equal(links.length,2);
 assert.match(garden,/href="\/#home"/);
 assert.doesNotMatch(html,/<iframe[^>]*prism/i);
 assert.match(html,/id="profile-prism-summary"/);
 assert.match(html,/id="prism-achievement-grid"/);
 assert.match(html,/id="treasure-total"/);
});

test('main arcade only READS Prism Garden profile and retains separate save, offline and deploy boundaries',()=>{
 const main=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../build_worker.py',import.meta.url),'utf8');
 const offline=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../src/prism-garden/arcade-summary.mjs',import.meta.url),'utf8');
 assert.match(main,/prismArcadeSummary\(\)/);
 assert.doesNotMatch(bridge,/\.setItem\s*\(/);
 assert.doesNotMatch(bridge,/persistProgress\s*\(/);
 assert.match(worker,/src\/prism-garden\/arcade-summary\.mjs/);
 assert.match(offline,/src\/prism-garden\/arcade-summary\.mjs/);
 assert.match(worker,/\/prism-garden\.html/);
 assert.match(main,/original web address/);
});
