import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createLegacyRecoveryAPI } from '../server/legacy-recovery-composition.mjs';

const NOW = 1800000000;
const ISSUER = 'https://synthetic-team.cloudflareaccess.com';
const AUD = 'synthetic-brandicade-app';
const PLAYER = 'player@example.invalid';
const ADMIN = 'admin@example.invalid';
const KEY = 'synthetic-player';
let rsa, jwks;
const b64 = value => Buffer.from(value instanceof ArrayBuffer || ArrayBuffer.isView(value)
  ? value : JSON.stringify(value)).toString('base64url');

before(async () => {
  rsa = await webcrypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', rsa.publicKey);
  jwk.kid = 'synthetic-signing-key';
  jwk.use = 'sig';
  jwks = { keys: [jwk] };
});
async function signedToken(email = PLAYER, claims = {}, header = {}) {
  const h = { alg: 'RS256', kid: 'synthetic-signing-key', typ: 'JWT', ...header };
  const payload = { iss: ISSUER, aud: [AUD], sub: 'synthetic-subject',
    email, iat: NOW - 30, nbf: NOW - 30, exp: NOW + 300, ...claims };
  const message = `${b64(h)}.${b64(payload)}`;
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',
    rsa.privateKey, Buffer.from(message));
  return `${message}.${b64(signature)}`;
}
function createSyntheticD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE saves (
      player_id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
      data TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE save_history (
      player_id TEXT NOT NULL, revision INTEGER NOT NULL,
      data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(player_id, revision)
    );
  `);
  const prepare = (sql) => ({
    bind: (...args) => {
      const named = Object.fromEntries(args.map((value, index) => ["?" + (index + 1), value]));
      return {
      first: async () => sqlite.prepare(sql).get(named) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(named) }),
      run: () => {
        const result = sqlite.prepare(sql).run(named);
        return { success: true, meta: { changes: result.changes }, results: [] };
      },
    };
    },
  });
  const db = {
    prepare,
    async batch(queries) {
      // Matches the rollback semantics of an actual D1 batch, with real SQL.
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = queries.map(query => query.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, sqlite, close: () => sqlite.close() };
}
function fixture({ writeEnabled = true, accessOverrides = {}, playerRecordKey = KEY } = {}) {
  const data = createSyntheticD1();
  const access = {
    issuer: ISSUER, audience: AUD, playerEmail: PLAYER, adminEmail: ADMIN,
    jwksProvider: async () => jwks, now: () => NOW,
    ...accessOverrides,
  };
  const api = createLegacyRecoveryAPI({
    db: data.db, access, playerRecordKey, expectedProfileName: 'Synthetic Player',
    writeEnabled,
  });
  return { ...data, api };
}
function document(played = 3) {
  return { schemaVersion: 1, profile: { name: 'Synthetic Player' }, stats: { played } };
}
function req(path, token, { method = 'GET', payload } = {}) {
  const headers = token ? { 'cf-access-jwt-assertion': token } : {};
  if (payload !== undefined) headers['content-type'] = 'application/json';
  return new Request('https://arcade.example.test' + path, { method, headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
}
const put = (token, revision = 0, save = document()) =>
  req('/api/save', token, { method: 'PUT', payload: { baseRevision: revision, save } });

const readRows = sqlite => ({
  saves: sqlite.prepare('SELECT player_id, revision, data FROM saves ORDER BY player_id').all(),
  history: sqlite.prepare('SELECT player_id, revision, data FROM save_history ORDER BY player_id, revision').all(),
});

test('signed player can write and read a single atomic save/history pair', async () => {
  const f = fixture();
  try {
    const token = await signedToken();
    const response = await f.api(put(token));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, revision: 1 });
    const rows = readRows(f.sqlite);
    assert.equal(rows.saves.length, 1);
    assert.equal(rows.history.length, 1);
    assert.equal(rows.saves[0].player_id, KEY);
    assert.equal(rows.history[0].revision, 1);
    assert.equal(rows.history[0].data, rows.saves[0].data);
    assert.equal(rows.saves[0].data, JSON.stringify(document()));
    const read = await f.api(req('/api/save', token));
    assert.equal(read.status, 200);
    const json = await read.json();
    assert.equal(json.revision, 1);
    assert.deepEqual(json.save, document());
  } finally { f.close(); }
});

test('update creates exactly one new history entry; stale revision cannot overwrite', async () => {
  const f = fixture();
  try {
    const token = await signedToken();
    assert.equal((await f.api(put(token))).status, 200);
    const second = await f.api(put(token, 1, document(9)));
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { ok: true, revision: 2 });
    const stale = await f.api(put(token, 1, document(999)));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).revision, 2);
    const rows = readRows(f.sqlite);
    assert.equal(rows.saves.length, 1);
    assert.equal(rows.history.length, 2);
    assert.equal(rows.saves[0].revision, 2);
    assert.equal(JSON.parse(rows.saves[0].data).stats.played, 9);
  } finally { f.close(); }
});

test('explicitly disabled write gate denies valid signed player without modifying D1', async () => {
  const f = fixture({ writeEnabled: false });
  try {
    assert.equal((await f.api(put(await signedToken()))).status, 503);
    assert.deepEqual(readRows(f.sqlite), { saves: [], history: [] });
  } finally { f.close(); }
});

test('missing, administrator and signed unlisted identities never write player saves', async () => {
  const f = fixture();
  try {
    for (const token of [undefined, await signedToken(ADMIN),
      await signedToken('outsider@example.invalid')]) {
      const res = await f.api(put(token));
      assert.equal(res.status, 403);
    }
    assert.deepEqual(readRows(f.sqlite), { saves: [], history: [] });
  } finally { f.close(); }
});

test('tampered signature, wrong audience and expired token are rejected', async () => {
  const f = fixture();
  try {
    const token = await signedToken();
    const parts = token.split('.');
    const forged = [parts[0], b64({ iss: ISSUER, aud: [AUD], sub: 'forged',
      email: PLAYER, iat: NOW - 30, exp: NOW + 300 }), parts[2]].join('.');
    for (const invalid of [forged, await signedToken(PLAYER, { aud: ['wrong'] }),
      await signedToken(PLAYER, { exp: NOW - 1 })]) {
      assert.equal((await f.api(put(invalid))).status, 403);
    }
    assert.deepEqual(readRows(f.sqlite), { saves: [], history: [] });
  } finally { f.close(); }
});

test('history insertion failure causes rollback of preceding save revision', async () => {
  const f = fixture();
  try {
    const token = await signedToken();
    assert.equal((await f.api(put(token))).status, 200);
    f.sqlite.exec(`CREATE TRIGGER fail_history_insert
      BEFORE INSERT ON save_history
      BEGIN SELECT RAISE(FAIL, 'Synthetic history failure'); END`);
    const response = await f.api(put(token, 1, document(404)));
    assert.equal(response.status, 503);
    const rows = readRows(f.sqlite);
    assert.equal(rows.saves.length, 1);
    assert.equal(rows.saves[0].revision, 1);
    assert.equal(rows.history.length, 1);
    assert.equal(JSON.parse(rows.saves[0].data).stats.played, 3);
    assert.doesNotMatch(JSON.stringify(await response.json()), /Synthetic history failure/);
  } finally { f.close(); }
});

test('request-supplied identity and alternate record selector cannot bypass configured key', async () => {
  const f = fixture();
  try {
    const token = await signedToken();
    const requestWithSelector = req('/api/save', token, { method: 'PUT',
      payload: { baseRevision: 0, save: document(), playerId: 'outsider' } });
    assert.equal((await f.api(requestWithSelector)).status, 400);
    const invalidSave = { ...document(), identity: 'outsider' };
    assert.equal((await f.api(put(token, 0, invalidSave))).status, 400);
    assert.deepEqual(readRows(f.sqlite), { saves: [], history: [] });
  } finally { f.close(); }
});

test('missing D1 batch, missing trust configuration and same-user allowlist fail closed', () => {
  const f = createSyntheticD1();
  try {
    assert.throws(() => createLegacyRecoveryAPI({ db: { prepare() {} },
      access: {} }), /Transactional D1 binding/);
    assert.throws(() => createLegacyRecoveryAPI({ db: f.db }),
      /Trusted Access configuration/);
    assert.throws(() => fixture({ accessOverrides: { adminEmail: PLAYER } }),
      /Trusted Access role configuration/);
    assert.throws(() => fixture({ accessOverrides: { issuer: 'http://invalid' } }),
      /Trusted Access role configuration/);
  } finally { f.close(); }
});
