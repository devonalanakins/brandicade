import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUTTON_BINDINGS, readGamepad, createRepeater, spatialTarget, startArcadeController, chooseControllerAction, gridCellTarget, createControllerInputGate} from '../src/arcade-controller.mjs';

function pad(indices = [], axes = [0, 0], mapping = 'standard') {
  return {mapping, connected: true, buttons: Array.from({length:16}, (_,i) => ({pressed:indices.includes(i)})), axes};
}

test('standard Xbox mappings preserve confirm/back/pause and independent navigation', () => {
  assert.equal(BUTTON_BINDINGS[0], 'CONFIRM');
  assert.equal(BUTTON_BINDINGS[1], 'BACK');
  assert.equal(BUTTON_BINDINGS[9], 'PAUSE');
  assert.deepEqual([...readGamepad(pad([0,5,12]))], ['CONFIRM', 'NEXT_TAB', 'UP']);
  assert.deepEqual([...readGamepad(pad([2,3,4,15]))], ['SECONDARY', 'ACHIEVEMENTS', 'PREV_TAB', 'RIGHT']);
});

test('unknown or disconnected layouts never cause unintended activation', () => {
  assert.equal(readGamepad(null).size, 0);
  assert.equal(readGamepad({...pad([0]),connected:false}).size, 0);
  assert.equal(readGamepad(pad([0], [0,0], '')).size, 0);
  assert.equal(readGamepad(pad([], [0.2,-0.25])).size, 0);
});

test('analog deadzones, digital priority, and diagonal axis handling are deterministic', () => {
  assert.deepEqual([...readGamepad(pad([], [-0.7,0.8]))], ['LEFT','DOWN']);
  assert.deepEqual([...readGamepad(pad([14], [0.9,0]))], ['LEFT']);
  assert.deepEqual([...readGamepad(pad([12], [0,0.9]))], ['UP']);
  assert.deepEqual([...readGamepad(pad([15], [-0.9,0]))], ['RIGHT'],
    'Right D-pad must override a left-leaning stick');
  assert.deepEqual([...readGamepad(pad([13], [0,-0.9]))], ['DOWN'],
    'Down D-pad must override an upward stick');
  assert.deepEqual([...readGamepad(pad([14,15], [0.9,0]))], [],
    'Opposite D-pad directions must be neutral');
  assert.equal(readGamepad(pad([], [Infinity,NaN])).size, 0);
});

test('one action per frame protects confirmations while a stick is held', () => {
  assert.equal(chooseControllerAction(['CONFIRM'],new Set(['RIGHT','CONFIRM'])),null);
  assert.equal(chooseControllerAction(['RIGHT','CONFIRM'],new Set(['RIGHT','CONFIRM'])),'RIGHT');
  assert.equal(chooseControllerAction(['CONFIRM','BACK'],new Set(['CONFIRM','BACK'])),'BACK');
  assert.equal(chooseControllerAction(['CONFIRM','PAUSE'],new Set(['CONFIRM','PAUSE'])),'PAUSE');
  assert.equal(chooseControllerAction(['ACHIEVEMENTS'],new Set(['ACHIEVEMENTS'])),'ACHIEVEMENTS');
  assert.equal(chooseControllerAction([],new Set()),null);
});


test('first held buttons never activate on connection, reconnect or tab restore', () => {
  const gate=createControllerInputGate(), idle=new Set(), a=new Set(['CONFIRM']);
  assert.equal(gate.accept(a,true),false,'held A on connection is ignored');
  assert.equal(gate.accept(a,true),false,'continued hold stays blocked');
  assert.equal(gate.accept(idle,true),false,'neutral sample arms but never activates');
  assert.equal(gate.accept(a,true),true,'fresh A after release can activate');
  assert.equal(gate.accept(a,false),false,'disconnect unarms input');
  assert.equal(gate.accept(a,true),false,'reconnected held A cannot activate');
  gate.reset(); // tab went into the background
  assert.equal(gate.accept(a,true),false,'background held A remains blocked');
  assert.equal(gate.accept(idle,true),false);
  assert.equal(gate.accept(a,true),true,'fresh press on restored tab works');
});

test('buttons are edge-triggered but directional movement repeats at a bounded cadence', () => {
  const clock = createRepeater({delay:250,interval:100});
  const active = new Set(['RIGHT','CONFIRM']);
  assert.deepEqual(clock.step(active,0), ['RIGHT','CONFIRM']);
  assert.deepEqual(clock.step(active,100), []);
  assert.deepEqual(clock.step(active,250), ['RIGHT']);
  assert.deepEqual(clock.step(active,350), ['RIGHT']);
  assert.deepEqual(clock.step(new Set(),400), []);
  assert.deepEqual(clock.step(active,420), ['RIGHT','CONFIRM']);
  clock.reset();
  assert.deepEqual(clock.step(active,421), ['RIGHT','CONFIRM']);
});

test('spatial navigation prioritizes intended direction and does not wrap', () => {
  const rect = (left,top) => ({left,top,width:50,height:30});
  const node = (left,top) => ({getBoundingClientRect:()=>rect(left,top)});
  const at=node(100,100), left=node(0,100), right=node(200,100), below=node(100,200), diagonal=node(200,210);
  const nodes=[at,left,right,below,diagonal];
  assert.equal(spatialTarget(nodes,at,'LEFT'),left);
  assert.equal(spatialTarget(nodes,at,'RIGHT'),right);
  assert.equal(spatialTarget(nodes,at,'DOWN'),below);
  assert.equal(spatialTarget([at,left],at,'RIGHT'),null);
  assert.equal(spatialTarget(nodes,null,'DOWN'),at);
});

test('integration is confined to UI assets and preserves independent save boundaries', () => {
  const html=readFileSync(new URL('../index.html', import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/arcade-controller.mjs',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/arcade-landscape.css',import.meta.url),'utf8');
  const build=readFileSync(new URL('../build_worker.py',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/verify.yml',import.meta.url),'utf8');
  assert.match(html,/id="controller-indicator"/);
  assert.match(html,/id="controller-pause"/);
  assert.match(html,/src="\/src\/arcade-controller\.mjs"/);
  assert.match(html,/href="\/src\/arcade-landscape\.css"/);
  assert.match(css, /orientation:landscape/);
  assert.match(css, /safe-area-inset-left/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(build, /src\/arcade-controller\.mjs/);
  assert.match(build, /src\/arcade-landscape\.css/);
  assert.match(sw, /src\/arcade-controller\.mjs/);
  assert.match(sw, /src\/arcade-landscape\.css/);
  assert.match(workflow, /tests\/arcade-controller\.test\.mjs/);
  assert.doesNotMatch(controller,/localStorage|\.setItem\(|\/api\/save|persist\(/);
  assert.match(html,/brandle-glimmer-grove\.devonakins\.workers\.dev/);
});


test('real controller loop: pause and resume work without an existing focus target', () => {
  const raf = [];
  const pause = {hidden:true,querySelector:()=>resume,querySelectorAll:()=>[resume],addEventListener(){},removeEventListener(){}};
  const indicator = {hidden:true}, legend = {hidden:true};
  const underlying = [{inert:false},{inert:true},{inert:false}];
  const section = {id:'game',querySelectorAll:()=>[],querySelector:()=>null};
  let doc;
  const resume = {
    focus(){doc.activeElement=this;},scrollIntoView(){},
    getClientRects(){return [{}];},closest(){return null;},click(){}
  };
  doc = {
    activeElement:null,visibilityState:'visible',
    body:{classList:{toggle(){}}},
    getElementById:(id)=>({'controller-pause':pause,'controller-indicator':indicator,'controller-legend':legend}[id]||null),
    querySelector:(s)=>s==='.section.active'?section:null,
    querySelectorAll:()=>underlying,
    addEventListener(){},removeEventListener(){}
  };
  let pressed=[9],fail=false;
  const nav={getGamepads(){
    if(fail)throw Error('Gamepad API unavailable');
    return [{mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:16},(_,i)=>({pressed:pressed.includes(i)}))}];
  }};
  const win={requestAnimationFrame:(fn)=>raf.push(fn)};
  const stop=startArcadeController({doc,win,nav});
  const tick=(t)=>raf.shift()(t);
  tick(0);
  assert.equal(indicator.hidden,false);
  assert.equal(pause.hidden,true,'held Menu on connection must not pause');
  pressed=[];tick(10); // neutral arms input
  pressed=[9];tick(20);
  assert.equal(pause.hidden,false);
  assert.equal(doc.activeElement,resume);
  assert.deepEqual(underlying.map(el=>el.inert),[true,true,true]);
  pressed=[];tick(30);
  pressed=[1];tick(40);
  assert.equal(pause.hidden,true); // previously crashed on missing previousFocus
  assert.deepEqual(underlying.map(el=>el.inert),[false,true,false],'prior inert state restored');
  fail=true;tick(60);
  assert.equal(indicator.hidden,true);
  stop();
});

test('first A in Glimmer Pop focuses a board cell; it cannot accidentally exit', () => {
  const raf=[];
  let doc, pressed=[0];
  const board={dataset:{cell:'0'},clickCount:0,focus(){doc.activeElement=this;},
    click(){this.clickCount++;},scrollIntoView(){},getClientRects(){return [{}];},
    closest(){return null;},getBoundingClientRect(){return {left:10,top:10,width:44,height:44};}};
  const back={clickCount:0,click(){this.clickCount++;},getClientRects(){return [{}];},closest(){return null;}};
  const section={id:'game',querySelectorAll:()=>[back,board],querySelector:()=>null};
  const pause={hidden:true,addEventListener(){},removeEventListener(){}};
  const docObj={activeElement:null,visibilityState:'visible',
    body:{classList:{toggle(){}}},
    getElementById:(id)=>({'controller-pause':pause,'controller-indicator':{hidden:true},'controller-legend':{hidden:true}}[id]||null),
    querySelector:(s)=>s==='.section.active'?section:s==='#pop-board [data-cell]'?board:null,
    querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}};
  doc=docObj;
  const nav={getGamepads:()=>[{mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:16},(_,i)=>({pressed:pressed.includes(i)}))}]};
  const win={requestAnimationFrame:(fn)=>raf.push(fn)};
  const stop=startArcadeController({doc,nav,win});
  raf.shift()(0);
  assert.equal(doc.activeElement,null,'held A at connect must not establish focus');
  pressed=[];raf.shift()(20); // neutral arms
  pressed=[0];raf.shift()(40); // first NEW A focuses the board
  assert.equal(doc.activeElement,board);
  assert.equal(board.clickCount,0);
  assert.equal(back.clickCount,0);
  pressed=[];raf.shift()(60);
  pressed=[0];raf.shift()(80); // second new A selects
  assert.equal(board.clickCount,1);
  assert.equal(back.clickCount,0);
  stop();
});


test('B clears Glimmer Pop jewel selection before returning to the arcade', () => {
  const queue=[];
  let pressed=[1], selected=true, cleared=0, exited=0;
  const selectedCell={click(){cleared++;selected=false;}};
  const home={click(){exited++;}};
  const pause={hidden:true,addEventListener(){},removeEventListener(){}};
  const ui={hidden:true};
  const doc={
    visibilityState:'visible',body:{classList:{toggle(){}}},
    getElementById:id=>id==='controller-pause'?pause:ui,
    querySelector(selector){
      if(selector==='.section.active')return {id:'game'};
      if(selector==='#pop-board .charm.selected[data-cell]:not([disabled])')return selected?selectedCell:null;
      if(selector==='.bottom-nav [data-go="home"]')return home;
      return null;
    },
    querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}
  };
  const nav={getGamepads:()=>[{mapping:'standard',connected:true,axes:[0,0],buttons:
    Array.from({length:16},(_,i)=>({pressed:pressed.includes(i)}))}]};
  const win={requestAnimationFrame:fn=>queue.push(fn)};
  const stop=startArcadeController({doc,win,nav});
  queue.shift()(0);
  assert.equal(cleared,0,'held B on connection cannot clear a jewel');
  pressed=[];queue.shift()(20); // neutral arms
  pressed=[1];queue.shift()(40);
  assert.equal(cleared,1);
  assert.equal(exited,0);
  pressed=[];queue.shift()(60);
  pressed=[1];queue.shift()(80);
  assert.equal(cleared,1);
  assert.equal(exited,1);
  stop();
});


test('7x7 board movement returns neighbors and never wraps a row', () => {
  assert.equal(gridCellTarget(0,'RIGHT'),1);
  assert.equal(gridCellTarget(1,'LEFT'),0);
  assert.equal(gridCellTarget(0,'DOWN'),7);
  assert.equal(gridCellTarget(7,'UP'),0);
  assert.equal(gridCellTarget(24,'LEFT'),23);
  assert.equal(gridCellTarget(24,'RIGHT'),25);
  assert.equal(gridCellTarget(24,'UP'),17);
  assert.equal(gridCellTarget(24,'DOWN'),31);
  assert.equal(gridCellTarget(6,'RIGHT'),null);
  assert.equal(gridCellTarget(7,'LEFT'),null);
  assert.equal(gridCellTarget(42,'DOWN'),null);
  assert.equal(gridCellTarget(48,'RIGHT'),null);
});

test('malformed board positions and directions fail closed', () => {
  for (const index of [-1,49,Number.NaN,2.5]) assert.equal(gridCellTarget(index,'UP'),null);
  assert.equal(gridCellTarget(2,'DIAGONAL'),null);
  assert.equal(gridCellTarget(2,'LEFT',0),null);
  assert.equal(gridCellTarget(2,'LEFT',3.5),null);
  assert.equal(gridCellTarget(2,'LEFT',3),1);
});
