import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FEEDBACK_TYPES,normalizeFeedback,playPrismCue} from '../src/prism-garden/feedback.mjs';
import {LEVELS} from '../src/prism-garden/content.mjs';
import {KEY,newProgress} from '../src/prism-garden/achievements.mjs';
import {solve} from '../src/prism-garden/engine.mjs';

test('feedback only accepts known events and never plays a malformed cue',()=>{
 for(const type of FEEDBACK_TYPES)assert.equal(normalizeFeedback(type),type);
 assert.equal(normalizeFeedback('<script>'),'idle');
 assert.equal(playPrismCue(null,'win'),0);
 assert.equal(playPrismCue({state:'closed'},'place'),0);
 assert.equal(playPrismCue({state:'running',createOscillator(){throw Error('must not run')}},'not-a-cue'),0);
});

test('quiet sound envelopes are bounded, non-looping and outcome-specific',()=>{
 const osc=[],gain=[];
 const ctx={currentTime:10,state:'running',destination:{},
  createOscillator(){
    const o={type:'',startAt:0,stopAt:0,frequency:{setValueAtTime(){}},connect(){},start(t){o.startAt=t},stop(t){o.stopAt=t}};
    osc.push(o);return o;
  },
  createGain(){
    const g={volume:0,gain:{setValueAtTime(){},linearRampToValueAtTime(v){g.volume=v},exponentialRampToValueAtTime(){}},connect(){}};
    gain.push(g);return g;
  }};
 assert.equal(playPrismCue(ctx,'select'),1);
 assert.equal(playPrismCue(ctx,'region'),3);
 assert.equal(playPrismCue(ctx,'win'),4);
 assert.equal(playPrismCue(ctx,'invalid'),1);
 assert.equal(osc.at(-1).type,'triangle');
 assert.ok(osc.every(o=>o.startAt>=10&&o.stopAt-o.startAt<.7));
 assert.ok(gain.every(g=>g.volume>0&&g.volume<=.032));
});

test('UI cues are accessible, motion-optional and served from first-party protected assets',()=>{
 const app=readFileSync(new URL('../src/prism-garden/app.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/prism-garden/prism.css',import.meta.url),'utf8');
 const build=readFileSync(new URL('../build_worker.py',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/verify.yml',import.meta.url),'utf8');
 assert.match(app,/data-feedback=/);
 assert.match(app,/regionCompleted\?'region':'place'/);
 assert.match(app,/aria-live="polite"/);
 assert.match(css,/pg-feedback-bloom/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/data-motion="off"/);
 assert.match(build,/\/src\/prism-garden\/feedback\.mjs/);
 assert.match(sw,/\/src\/prism-garden\/feedback\.mjs/);
 assert.match(workflow,/tests\/prism-feedback\.test\.mjs/);
 assert.doesNotMatch(readFileSync(new URL('../src/prism-garden/feedback.mjs',import.meta.url),'utf8'),/localStorage|fetch\(|\/api\/save/);
});

async function runWithProgress(tag,callback) {
 const original={document:globalThis.document,matchMedia:globalThis.matchMedia,localStorage:globalThis.localStorage,window:globalThis.window};
 const handlers={};
 const host={dataset:{},innerHTML:'',addEventListener(type,fn){handlers[type]=fn}};
 const progress=newProgress();progress.settings.sound=false;
 const storage=new Map([[KEY,JSON.stringify(progress)],['brandicade:save:v1','glimmer-preserved']]);
 let audioStarts=0;
 globalThis.document={querySelector:()=>host};
 globalThis.matchMedia=()=>({matches:false});
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.window={AudioContext:class{constructor(){audioStarts++;throw Error('sound should be off')}}};
 try{
  await import('../src/prism-garden/app.mjs?'+tag);
  const click=dataset=>handlers.click({detail:1,target:{closest:()=>({dataset,disabled:false})}});
  await callback({click,host,storage,getAudioStarts:()=>audioStarts});
 }finally{
  for(const [key,value]of Object.entries(original))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
}

test('selection and invalid attempt do not save; legitimate placement and undo do',async()=>{
 await runWithProgress('feedback-controls',({click,host,storage,getAudioStarts})=>{
  click({action:'continue'});
  assert.match(host.innerHTML,/data-feedback="idle"/);
  const before=storage.get(KEY);
  click({kind:'stack',index:'0'});
  assert.match(host.innerHTML,/data-feedback="select"/);
  assert.equal(storage.get(KEY),before);
  click({kind:'socket',index:'14'}); // invalid even if called programmatically
  assert.match(host.innerHTML,/data-feedback="invalid"/);
  assert.equal(storage.get(KEY),before);
  click({kind:'socket',index:'0'}); // the source selection survived the invalid attempt
  assert.match(host.innerHTML,/data-feedback="place"/);
  assert.equal(JSON.parse(storage.get(KEY)).active.moves,1);
  click({action:'undo'});
  assert.match(host.innerHTML,/data-feedback="undo"/);
  assert.equal(JSON.parse(storage.get(KEY)).active.moves,0);
  assert.equal(storage.get('brandicade:save:v1'),'glimmer-preserved');
  assert.equal(getAudioStarts(),0);
 });
});

test('only actual region completion illuminates a newly restored region',async()=>{
 await runWithProgress('feedback-region',({click,host,storage})=>{
  click({action:'continue'});
  const run=JSON.parse(storage.get(KEY)).active;
  const route=solve(LEVELS[0],run).path;
  assert.ok(route.length>0);
  let earned=false;
  for(const move of route){
   click({kind:move.source.kind,index:String(move.source.index)});
   click({kind:move.target.kind,index:String(move.target.index)});
   if(host.innerHTML.includes('data-feedback="region"')){earned=true;break;}
  }
  assert.equal(earned,true);
  assert.match(host.innerHTML,/recently-restored/);
  assert.equal(storage.get('brandicade:save:v1'),'glimmer-preserved');
  assert.equal(Object.keys(JSON.parse(storage.get(KEY)).awards).length,0);
 });
});
