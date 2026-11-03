// SOURCE-ONLY backup and disposable-restore adapter. Not wired to any Worker route.
// Never put a real player's data or a private RSA key in logs, CI, or GitHub.
const FORMAT = 'brandicade-save-vault-v1';
const ALGORITHM = 'RSA-OAEP-SHA256+AES-256-GCM';
const SNAPSHOT_KIND = 'brandicade-d1-player-record-v1';
const SANDBOX_PURPOSE = 'brandicade-disposable-restore-v1';
const MAX_HISTORY = 1000;
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;
const MAX_ROW_BYTES = 524288;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const LEGACY_BACKUP_SQL = Object.freeze({
  current: 'SELECT revision, data, updated_at FROM saves WHERE player_id = ?1',
  history: 'SELECT revision, data, updated_at FROM save_history WHERE player_id = ?1 ORDER BY revision ASC',
  emptySaves: 'SELECT COUNT(*) AS count FROM saves',
  emptyHistory: 'SELECT COUNT(*) AS count FROM save_history',
  sandbox: 'SELECT purpose FROM brandicade_restore_sandbox WHERE id = 1',
  insertSave: 'INSERT INTO saves(player_id,revision,data,updated_at) VALUES(?1,?2,?3,?4)',
  insertHistory: 'INSERT INTO save_history(player_id,revision,data,updated_at) VALUES(?1,?2,?3,?4)',
});

function fail(message = 'Invalid legacy backup') { throw new Error(message); }
function checkedRecordKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) fail('Trusted record key required');
  return value;
}
function checkedKeyId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(value)) fail('Public recipient key ID required');
  return value;
}
function checkedDatabase(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function')
    fail('Transactional D1 database required');
  return db;
}
function checkedRows(rows, isSave = false) {
  if (!Array.isArray(rows) || rows.length > (isSave ? 1 : MAX_HISTORY)) fail('Snapshot row limit exceeded');
  let previous = -1;
  return rows.map(row => {
    if (!row || !Number.isSafeInteger(row.revision) || row.revision < 0
        || row.revision <= previous || typeof row.data !== 'string'
        || typeof row.updated_at !== 'string' || encoder.encode(row.data).byteLength > MAX_ROW_BYTES)
      fail('Invalid snapshot row');
    previous = row.revision;
    return {revision: row.revision, data: row.data, updated_at: row.updated_at};
  });
}
function checkedSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || snapshot.kind !== SNAPSHOT_KIND || snapshot.version !== 1
      || typeof snapshot.capturedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.capturedAt)))
    fail('Invalid legacy snapshot');
  checkedRecordKey(snapshot.playerRecordKey);
  const saves = checkedRows(snapshot.save === null ? [] : [snapshot.save], true);
  const history = checkedRows(snapshot.history);
  const copy = {kind: SNAPSHOT_KIND, version: 1, playerRecordKey: snapshot.playerRecordKey,
    capturedAt: snapshot.capturedAt, save: saves[0] || null, history};
  if (encoder.encode(JSON.stringify(copy)).byteLength > MAX_SNAPSHOT_BYTES) fail('Snapshot exceeds size limit');
  return copy;
}
function b64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(value, maxChars) {
  if (typeof value !== 'string' || !value.length || value.length > maxChars
      || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    fail();
  try {
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
  } catch { fail(); }
}
function makeHeader(keyId, backupId) {
  return {format: FORMAT, version: 1, algorithm: ALGORITHM, keyId, backupId};
}
function checkedArchive(archive) {
  if (!archive || typeof archive !== 'object' || Array.isArray(archive)
      || Object.keys(archive).sort().join(',') !==
        'algorithm,backupId,ciphertext,format,keyId,nonce,version,wrappedKey'
      || archive.format !== FORMAT || archive.version !== 1 || archive.algorithm !== ALGORITHM
      || typeof archive.backupId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(archive.backupId))
    fail();
  checkedKeyId(archive.keyId);
  const nonce = fromB64url(archive.nonce, 20);
  if (nonce.byteLength !== 12) fail();
  return {header: makeHeader(archive.keyId, archive.backupId), nonce,
    wrappedKey: fromB64url(archive.wrappedKey, 900),
    ciphertext: fromB64url(archive.ciphertext, Math.ceil(MAX_SNAPSHOT_BYTES * 4 / 3) + 100)};
}
async function importRSA(jwk, operation) {
  if (!jwk || typeof jwk !== 'object' || jwk.kty !== 'RSA'
      || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') fail('RSA recovery key required');
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSA-OAEP', hash:'SHA-256'},
      false, [operation]);
    if (key.algorithm.modulusLength < 2048) fail('2048-bit or stronger RSA key required');
    return key;
  } catch { fail('Invalid RSA recovery key'); }
}
function select(db, sql, recordKey) {
  return db.prepare(sql).bind(recordKey);
}
async function snapshotRows(db, recordKey) {
  const results = await db.batch([
    select(db, LEGACY_BACKUP_SQL.current, recordKey),
    select(db, LEGACY_BACKUP_SQL.history, recordKey),
  ]);
  if (!Array.isArray(results) || results.length !== 2 ||
      results.some(result => result?.success !== true || !Array.isArray(result.results)))
    fail('Consistent D1 snapshot unavailable');
  return {save:checkedRows(results[0].results, true)[0] || null,
    history:checkedRows(results[1].results)};
}

export async function createEncryptedLegacyBackup(db, {
  playerRecordKey, recipientPublicKey, recipientKeyId, explicitlyAuthorized = false,
} = {}) {
  if (explicitlyAuthorized !== true) fail('Explicit backup authorization required');
  checkedDatabase(db);
  const key = checkedRecordKey(playerRecordKey);
  const keyId = checkedKeyId(recipientKeyId);
  const rsa = await importRSA(recipientPublicKey, 'encrypt');
  const records = await snapshotRows(db, key);
  const snapshot = checkedSnapshot({kind:SNAPSHOT_KIND, version:1, playerRecordKey:key,
    capturedAt:new Date().toISOString(), ...records});
  const backupId = crypto.randomUUID();
  const header = makeHeader(keyId, backupId);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const secret = crypto.getRandomValues(new Uint8Array(32));
  try {
    const aes = await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['encrypt']);
    const wrapped = await crypto.subtle.encrypt({name:'RSA-OAEP'},rsa,secret);
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,
      additionalData:encoder.encode(JSON.stringify(header)),tagLength:128},aes,
      encoder.encode(JSON.stringify(snapshot)));
    return {...header, nonce:b64url(nonce),wrappedKey:b64url(new Uint8Array(wrapped)),
      ciphertext:b64url(new Uint8Array(encrypted))};
  } finally { secret.fill(0); }
}

export async function decryptEncryptedLegacyBackup(archive, recipientPrivateKey) {
  const {header,nonce,wrappedKey,ciphertext} = checkedArchive(archive);
  const rsa = await importRSA(recipientPrivateKey,'decrypt');
  try {
    const secret = new Uint8Array(await crypto.subtle.decrypt({name:'RSA-OAEP'},rsa,wrappedKey));
    try {
      if (secret.byteLength !== 32) fail();
      const aes = await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['decrypt']);
      const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce,
        additionalData:encoder.encode(JSON.stringify(header)),tagLength:128},aes,ciphertext);
      return checkedSnapshot(JSON.parse(decoder.decode(plaintext)));
    } finally { secret.fill(0); }
  } catch { fail('Encrypted backup could not be authenticated'); }
}

// Rehearsal ONLY. The sandbox marker is intentionally absent from production.
// Never add the marker to a production database. This restores ONLY the player
// save and history tables, not arbitrary application D1 schema or other data.
export async function restoreEncryptedLegacyBackupToSandbox(db, archive, {
  recipientPrivateKey, expectedPlayerRecordKey, explicitlyDisposable = false,
} = {}) {
  checkedDatabase(db);
  if (explicitlyDisposable !== true) fail('Disposable restore confirmation required');
  const key = checkedRecordKey(expectedPlayerRecordKey);
  let marker;
  try { marker = await db.prepare(LEGACY_BACKUP_SQL.sandbox).first(); }
  catch { fail('Restore sandbox marker missing'); }
  if (marker?.purpose !== SANDBOX_PURPOSE) fail('Restore sandbox marker missing');
  const snapshot = await decryptEncryptedLegacyBackup(archive, recipientPrivateKey);
  if (snapshot.playerRecordKey !== key) fail('Backup belongs to a different record key');
  const [saves,history] = await Promise.all([
    db.prepare(LEGACY_BACKUP_SQL.emptySaves).first(),
    db.prepare(LEGACY_BACKUP_SQL.emptyHistory).first(),
  ]);
  if (saves?.count !== 0 || history?.count !== 0) fail('Restore target must be entirely empty');
  const statements=[];
  if (snapshot.save) statements.push(db.prepare(LEGACY_BACKUP_SQL.insertSave).bind(
    key,snapshot.save.revision,snapshot.save.data,snapshot.save.updated_at));
  for (const row of snapshot.history) statements.push(db.prepare(LEGACY_BACKUP_SQL.insertHistory).bind(
    key,row.revision,row.data,row.updated_at));
  if (statements.length) {
    let results;
    try { results = await db.batch(statements); }
    catch { fail('Disposable restore transaction failed'); }
    if (!Array.isArray(results) || results.length !== statements.length ||
        results.some(result=>result?.success !== true || result?.meta?.changes !== 1))
      fail('Disposable restore result ambiguous');
  }
  const restored = await snapshotRows(db,key);
  if (JSON.stringify({save:restored.save,history:restored.history}) !==
      JSON.stringify({save:snapshot.save,history:snapshot.history}))
    fail('Disposable restore verification failed');
  return {verified:true,saves:snapshot.save?1:0,history:snapshot.history.length};
}
