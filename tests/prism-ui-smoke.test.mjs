import test from 'node:test';
import assert from 'node:assert/strict';

test('Prism Garden boots, opens gameplay and persists an actual jewel move without DOM frameworks', async()=>{
  const handlers={};
  const element={dataset:{},innerHTML:'',addEventListener(name,handler){handlers[name]=handler;}};
  const memory=new Map();
  globalThis.document={querySelector(){return element;}};
  globalThis.matchMedia=()=>({matches:false});
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
  await import('../src/prism-garden/app.mjs');
  assert.match(element.innerHTML,/Prism/);
  const click=(dataset)=>{
    handlers.click({target:{closest:()=>({dataset,disabled:false})}});
  };
  click({action:'continue'});
  assert.match(element.innerHTML,/pg-mosaic/);
  click({kind:'stack',index:'0'});
  assert.match(element.innerHTML,/pg-socket/);
  click({kind:'socket',index:'0'});
  const stored=JSON.parse(memory.get('brandicade:prism-garden:v1'));
  assert.equal(stored.active.moves,1);
  assert.ok(stored.active.placed[0]);
  assert.equal(memory.has('brandicade:save:v1'),false);
  click({nav:'atlas'});
  assert.match(element.innerHTML,/Sanctuary/);
  click({modeChoice:'mastery'});
  assert.match(element.innerHTML,/Mastery replays completed/);
});
