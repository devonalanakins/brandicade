import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prismControls, prismPreferred, startPrismController} from '../src/prism-garden/controller.mjs';

function node(attributes={}, label='button') {
  return {
    tagName:label.toUpperCase(),dataset:attributes,disabled:false,isConnected:true,
    attributes:{}, focused:0, clicked:0,
    closest(){return null;},getClientRects(){return [{}];},
    getBoundingClientRect(){return {left:0,top:0,width:44,height:44}},
    setAttribute(name,value){this.attributes[name]=value},
    hasAttribute(name){return name in this.attributes},
    focus(){this.focused++},scrollIntoView(){},click(){this.clicked++},
    querySelector(){return null},querySelectorAll(){return []}
  };
}

test('Prism priority prefers live game jewels over retreat and never chooses sealed/disabled sockets',()=>{
 const first=node({kind:'stack',index:'0'});
 const target=node({kind:'socket',index:'0'});
 const host={querySelector(selector){
  if(selector==='.pg-game')return {};
  if(selector.includes('.pg-socket.target:not([disabled])'))return target;
  if(selector.includes('.pg-stack.selected'))return first;
  if(selector.includes('.pg-stack:not([disabled])'))return first;
  return null;
 }};
 assert.equal(prismPreferred(host,null),target);
});

test('Prism controller scope never leaks focus outside an active run-change confirmation',()=>{
 const cancel=node({action:'cancel-run-change'}), replace=node({action:'accept-run-change'});
 const confirm={querySelectorAll:()=>[cancel,replace]};
 const host={querySelector:s=>s==='.pg-confirm[role="alertdialog"]'?confirm:null};
 const overlay={hidden:true};
 assert.deepEqual(prismControls(host,overlay),[cancel,replace]);
});

test('controller stays UI-only and Prism page serves its script through first-party protected assets',()=>{
 const file=readFileSync(new URL('../src/prism-garden/controller.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../prism-garden.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/prism-garden/prism.css',import.meta.url),'utf8');
 const builder=readFileSync(new URL('../build_worker.py',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(file,/localStorage|\.setItem\(|persist\(|\/api\/save/);
 assert.match(html,/src="\/src\/prism-garden\/controller\.mjs"/);
 assert.match(builder,/\/src\/prism-garden\/controller\.mjs/);
 assert.match(sw,/\/src\/prism-garden\/controller\.mjs/);
 assert.match(css,/@media\(orientation:landscape\)/);
 assert.match(css,/safe-area-inset-right/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(file,/readGamepad/);
});

test('physical controller polling focuses before confirming, opens pause, and supports safe return',()=>{
 const callbacks=[],events={},bodyNodes=[];
 let doc,held=[0],denied=false,connected=true;
 const start=node({action:'continue'}),resume=node(),returnHome=node();
 const confirmDialog={querySelectorAll:()=>[]};
 const shell={querySelectorAll:()=>[start],querySelector:()=>null};
 const host={
  querySelector(s){
   if(s.includes('pg-confirm'))return null;
   if(s==='.pg-game')return {};
   if(s==='.pg-shell')return shell;
   if(s.includes('.pg-stack:not'))return start;
   if(s.includes('.pg-controller'))return null;
   if(s.includes('.pg-game [data-nav="home"]'))return returnHome;
   return null;
  },
  querySelectorAll:()=>[]
 };
 const overlayNode={hidden:true,innerHTML:'',className:'',id:'',attributes:{},
  setAttribute(){},addEventListener(t,fn){events['overlay:'+t]=fn},
  removeEventListener(){},remove(){},
  querySelector:s=>s==='.pg-controller-panel'?{querySelectorAll:()=>[resume,returnHome]}:s==='[data-controller-resume]'?resume:null};
 const indicator={hidden:true,textContent:'',className:'',setAttribute(){},remove(){}};
 bodyNodes.push(indicator,overlayNode);
 const body={append(){},classList:{toggle(){},remove(){}}};
 doc={
  body,activeElement:null,visibilityState:'visible',
  getElementById:s=>s==='prism-app'?host:null,
  createElement:s=>s==='div'?(bodyNodes.shift()||node()):node(),
  addEventListener(t,fn){events[t]=fn},removeEventListener(){}
 };
 // Assign fake focus to the current test document.
 for(const x of [start,resume,returnHome])x.focus=()=>{doc.activeElement=x;x.focused++};
 const win={requestAnimationFrame:fn=>callbacks.push(fn)};
 const nav={getGamepads(){if(denied)throw Error('not permitted');return [{connected,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},(_,i)=>({pressed:held.includes(i)}))}]}};
 const stop=startPrismController({doc,win,nav});
 const tick=t=>callbacks.shift()(t);
 tick(0); // A only focuses.
 assert.equal(doc.activeElement,start);
 assert.equal(start.clicked,0);
 held=[];tick(20);
 held=[0];tick(40);
 assert.equal(start.clicked,1);
 held=[];tick(50);
 held=[9];tick(60);
 assert.equal(overlayNode.hidden,false);
 assert.equal(doc.activeElement,resume);
 held=[];tick(80);
 held=[1];tick(100);
 assert.equal(overlayNode.hidden,true);
 held=[];denied=true;tick(120);
 assert.equal(indicator.hidden,true);
 stop();
});
