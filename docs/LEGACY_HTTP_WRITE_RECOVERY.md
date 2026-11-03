# Brandicade cloud-save HTTP recovery candidate

Status: **SOURCE ONLY — NOT LIVE** (November 3, 2026).

The recovered static Worker lacks the production Access and cloud-save runtime. In a read-only inspection of the deployed Cloudflare Worker, existing `PUT /api/save` logic performed multiple individual D1 writes to `saves` and `save_history`. This was not atomic. It must not be copied into a replacement release.

`server/legacy-api-write-candidate.mjs` supplies a **separate, fail-closed** adapter compatible with the existing `{baseRevision,save}` request envelope and `{ok:true,revision}` successful response. It delegates GET routes to `createLegacyReadOnlyAPI` and uses `createLegacyD1Writer.compareAndSave`, previously exercised against disposable D1, for a single atomic save/history batch.

It requires explicit `writeEnabled:true`, a cryptographically verified Cloudflare Access authorizer supplied by trusted server setup, a fixed server-owned D1 record key (in the writer), and a valid read repository. It never derives roles or keys from the incoming save. The HTTP layer enforces bounded streamed JSON, a strict envelope, revisions, 409 conflict handling, no-store response headers and sanitized failures with no automatic retry for ambiguous writes.

**Release remains blocked:** independent encrypted production backup and disposable restore verification; signed owner login and private allowlist parity; complete source/licensing parity; real iPhone/PWA acceptance; and a reviewed single-owner deployment plus rollback. See issue #2. No production Worker, Access, D1, secrets or data were changed.
