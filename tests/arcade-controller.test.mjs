import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUTTON_BINDINGS, readGamepad, createRepeater, spatialTarget} from '../src/arcade-controller.mjs';

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
