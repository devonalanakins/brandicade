# Brandicade cloud-save HTTP recovery candidate

Status: **SOURCE ONLY — NOT LIVE** (November 3, 2026).

The recovered static Worker lacks the production Access and cloud-save runtime. In a read-only inspection of the deployed Cloudflare Worker, existing `PUT /api/save` logic performed multiple individual D1 writes to `saves` and `save_history`. This was not atomic. It must not be copied into a replacement release.

`server/legacy-api-write-candidate.mjs` supplies a **separate, fail-closed** adapter compatible with the existing `{baseRevision,save}` request envelope and `{ok:true,revision}` successful response. It delegates GET routes to `createLegacyReadOnlyAPI` and uses `createLegacyD1Writer.compareAndSave` for a single atomic save/history batch.

`server/legacy-recovery-composition.mjs` now connects the recovered pieces **without introducing a live route**: Cloudflare Access JWT verification and privately configured role mapping, the fixed-record-key D1 read adapter, the optimistic transactional writer, and the HTTP compatibility candidate. All write operations default to disabled, and explicit `writeEnabled:true`, trusted server configuration, and a D1 `batch()` binding are required. There is no copy of player email addresses, keys, Access AUD, private database data, or credentials in the repository.

The HTTP layer enforces bounded streamed JSON, a strict envelope, revisions, 409 conflict handling, no-store response headers and sanitized failures with no automatic retry for ambiguous writes. The D1 writer rejects inconsistent history and transaction failures.

## Verification

- Locally inspected and Git-blob-SHA matched the existing backend modules against their repository versions.
- `node --check server/legacy-recovery-composition.mjs` and `node --check tests/legacy-recovery-integration.test.mjs`: passed.
- `node --test tests/legacy-recovery-integration.test.mjs tests/legacy-write-api.test.mjs`: **18 passed, 0 failed** using Node.js 22.
- The new eight tests generate original synthetic RS256 signatures and execute the full HTTP save contract against an in-memory SQLite transaction fixture; they check player and administrator isolation, missing/forged/expired tokens, initial and subsequent revisions, stale conflicts, disabled writes, malformed identity selectors, and history-insert rollback.
- The recovered static Worker builder excludes these backend modules; no production Worker is built from this file.
- The existing GitHub Actions verification workflow was extended to include this test file. A green exact-commit hosted run is still necessary.

**These are local synthetic acceptance tests, not production-signed Access login, actual Cloudflare D1 backup/restore, a real browser, or an iPhone validation.** No real player records were read in these tests.

## Release remains blocked

Independent encrypted production database backup and isolated restore; signed player/admin login and true Access policy parity; full deployed Worker source, assets, licensing rights and rollback ownership; actual device and offline/save acceptance; and fully green exact-commit CI. See [issue #2](https://github.com/devonalanakins/brandicade/issues/2).

No production Worker, Access policies, D1 data, migrations, routes, player saves or secrets have been modified.
