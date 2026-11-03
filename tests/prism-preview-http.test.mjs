import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Load the exact generated Worker without deploying or making an HTTP endpoint public.
const generated = readFileSync(new URL('../dist/prism-garden-preview.worker.js', import.meta.url));
const workerURL = 'data:text/javascript;base64,' + generated.toString('base64');
const worker = (await import(workerURL)).default;
assert.equal(typeof worker?.fetch, 'function', 'Generated preview must expose Worker fetch');
const get = (path, method = 'GET') => worker.fetch(new Request('https://prism-preview.invalid' + path, {method}));

test('root and explicit game route serve an isolated, security-headered preview', async () => {
  for (const path of ['/', '/index.html', '/prism-garden.html']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(response.headers.get('content-security-policy') || '', /script-src 'self'/);
    const html = await response.text();
    assert.match(html, /PRISM GARDEN PREVIEW/);
    assert.match(html, /<div id="prism-app"><\/div>/);
    assert.match(html, /\/src\/prism-garden\/app\.mjs/);
  }
});

test('game imports and settings backup UI are local, with a link back to the original arcade', async () => {
  const app = await get('/src/prism-garden/app.mjs');
  assert.equal(app.status, 200);
  assert.match(app.headers.get('content-type') || '', /text\/javascript/);
  const source = await app.text();
  assert.match(source, /https:\/\/brandicade\.anevum\.com\/#home/);
  assert.doesNotMatch(source, /href="\/#home"/);
  for (const path of ['/src/prism-garden/content.mjs', '/src/prism-garden/engine.mjs', '/src/prism-garden/board-guide.mjs', '/src/prism-garden/restoration-scene.mjs', '/src/prism-garden/backup-ui.mjs', '/src/prism-garden/backup.css']) {
    assert.equal((await get(path)).status, 200, path);
  }
});

test('PWA metadata and offline service worker serve only preview assets', async () => {
  const response = await get('/manifest.webmanifest');
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.name, /Prism Garden/);
  assert.ok(manifest.icons.some(icon => icon.src === '/assets/icon-192.png' && icon.sizes === '192x192'));
  const script = await get('/sw.js');
  assert.equal(script.status, 200);
  assert.equal(script.headers.get('service-worker-allowed'), '/');
  const body = await script.text();
  assert.match(body, /prism-garden-preview-/);
  assert.match(body, /\/src\/prism-garden\/app\.mjs/);
  assert.match(body, /\/src\/prism-garden\/restoration-scene\.mjs/);
  assert.match(body, /\/src\/prism-garden\/board-guide\.mjs/);
  assert.doesNotMatch(body, /\/src\/app\.mjs/);
  assert.doesNotMatch(body, /\/api\/save/);
  const icon = await get('/assets/icon-192.png');
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get('content-type'), 'image/png');
  const bytes = new Uint8Array(await icon.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('legacy code and cloud-save endpoints are absent; non-GET operations are denied', async () => {
  for (const path of ['/api/save', '/api/session', '/src/app.mjs', '/src/progression.mjs', '/not-an-asset']) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(await response.text(), /saved|token|password|email/i);
  }
  const request = await get('/api/save', 'PUT');
  assert.equal(request.status, 405);
  assert.equal(request.headers.get('allow'), 'GET, HEAD');
});

test('HEAD requests return headers but no asset body and do not cache the app shell forever', async () => {
  const head = await get('/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.match(head.headers.get('cache-control') || '', /no-cache/);
  const sw = await get('/sw.js');
  assert.match(sw.headers.get('cache-control') || '', /no-cache/);
});
