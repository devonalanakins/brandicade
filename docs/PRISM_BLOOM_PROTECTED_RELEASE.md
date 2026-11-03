# Brandicade Prism Bloom — protected production candidate, source-only

**STATUS: REVIEW CANDIDATE / NOT A PRODUCTION RELEASE.**
Owner: Brandicade. Intended destination: `brandicade.anevum.com`.
Gameplay: [Prism Garden PR #8](https://github.com/devonalanakins/brandicade/pull/8).
Backend recovery: [PR #9](https://github.com/devonalanakins/brandicade/pull/9).
Vault: [PR #10](https://github.com/devonalanakins/brandicade/pull/10).
Issue and hard release gates: [issue #2](https://github.com/devonalanakins/brandicade/issues/2).

## What Cloudflare actually showed (2026-11-03)

- Live Worker `brandicade`: deployment `53bdf783-a472-486f-b06d-53551696018a`; existing `SAVES` D1 binding.
- Production Access is self-hosted, with two **email-specific** allow entries, not a blanket everyone allow. Private allowed identities are deliberately not reproduced.
- Cloudflare's `content/v2` endpoint returned the multipart **original deployed source** in memory (about 232 KB) with 14 static routes, signed RS256 Access identity verification, and the existing `/api/session`, `/api/save` and `/api/backups` API.
- The deployed writer uses a save upsert, a separate revision update, then a separate history insert. They are not one D1 batch transaction, which creates a plausible failure window. This is a **risk**, not evidence that anyone's save is damaged.
- The original multipart includes runtime-specific role emails and Access configuration. **Never paste the deployed source unredacted into this public repository**, test logs, a public CI artifact, or an issue.
- Neither deployed Worker, Access policy, D1 records, nor preview routing were changed by source inspection.

## Source-only integration candidate

`python3 scripts/build_brandicade_protected.py` generates
`dist/brandicade-protected.candidate.mjs`, but does not deploy or upload.
It preserves the original 28-route Prism Bloom static builder source and
imports the existing clean-room `server/legacy-recovery-composition.mjs` from
PR #9. A production bundler is required to resolve imports; uploading this
unbundled candidate as a standalone Worker is **not permitted**.

The runtime denies unauthenticated requests to **all** asset and API routes.
Private configuration is required at runtime, never in GitHub:

- `SAVES`: existing production D1 binding; do not re-key or recreate records.
- `ACCESS_ISSUER`, `ACCESS_AUDIENCE`: verified Cloudflare Access team/app parameters.
- `ACCESS_PLAYER_EMAIL`, `ACCESS_ADMIN_EMAIL`: distinct, privately held allowlist.
- `PLAYER_RECORD_KEY`: fixed legacy key matching current D1 records, never derived from JWT or HTTP input.
- `PLAYER_DISPLAY_NAME`: existing profile name in the save schema.
- `ENABLE_CLOUD_WRITES`: **`false` unless explicitly enabled after backup and acceptance**.

A five-minute cached JWKS provider validates signed RS256 identities using
Cloudflare's configured signing-key endpoint. Missing keys/configuration deny
requests rather than bypassing identity checks. API routes use the reconstructed
read-only contract and D1 transactional candidate; the write method is gated
off by default, returning 503 while the static and GET routes can be tested.
The candidate never performs an implicit data migration or creates a new table.

## Verification and security review

Run `python3 scripts/build_brandicade_protected.py`, then
`node --check dist/brandicade-protected.candidate.mjs` and
`node --test tests/brandicade-protected-worker.test.mjs tests/legacy-recovery-integration.test.mjs tests/legacy-write-api.test.mjs`.
The new tests use synthetic RSA signatures and in-memory SQLite transactional
D1 facades. They check malformed/expired JWTs, forbidden admin access to player
data, default-disabled writes, API response shape, stale-revision conflicts,
rollback of a failing history insert, missing config, and availability of
first-party Prism Garden assets. No production emails, JWTs, D1 records or
recovery private keys are used.

These tests are not an authenticated production login, physical-device proof,
genuine Cloudflare Worker D1 binding, or an independent backup/restore of live
player records.

## Explicit release NO-GO checklist

- [ ] Verify the generated, **fully bundled** candidate with an isolated real Cloudflare Worker and synthetic D1 binding; use a restricted Access host and negative-case tests.
- [ ] Reconcile MIT/GPLv3 source and asset provenance; retain notices.
- [ ] Privately establish owner-controlled RSA recovery private-key custody, create an encrypted backup of actual production records, and independently restore/compare them in an isolated disposable D1 target.
- [ ] Verify actual owner and admin Access JWT login against the private allowlist; confirm both GET and PUT semantics with real browser requests without revealing saves to the administrator.
- [ ] Verify first-party `/prism-garden.html`, home/game launchers, accessibility, offline PWA, local backups, cross-game trophies, and saved-state continuity on Brandi's actual iPhone.
- [ ] Pin the exact release artifact, record the previously deployed Cloudflare version, choose the single release owner, and demonstrate rollback *without* loss of new player saves.
- [ ] Approve production merge/deploy only after all prior gates pass. Observe intended live URL, auth, asset routing, cloud saves, and Worker error logs after deployment.

**No release, DNS, Access, D1, token, stored save, or existing Worker
settings change was performed by preparing this candidate.**

## Verified bundling gate (added to PR #12)
The draft CI also runs pinned open-source `wrangler@4.156.2 deploy --dry-run --outdir dist/protected-bundle`, checks that exactly one bundle is emitted, validates its JavaScript syntax, and re-runs the signed-Access/D1 HTTP tests against the **actual bundled module**. This is a local build test, **not a Worker upload, an Access login or a real D1-binding test**. Do not add a deploy workflow or publish bundled files to a public release before the data/identity/license gates pass.

## Resilience and cloud-save availability (November 3, 2026)

The protected preview/release candidate now has two separately validated boundaries:
a mandatory **signed Cloudflare Access identity** for every game or API route,
and a **separate optional D1 storage connection** for cloud-save endpoints.
A legitimate signed, allowlisted player or administrator can load static
Brandicade and Prism Bloom game assets even when D1 is absent, disabled, or has
invalid private save configuration. The `/api/*` cloud-save endpoints then
return 503; unauthenticated callers remain 403, including during an outage.
This avoids turning a temporary cloud-storage failure into a total loss of the
device-local arcade, without making any assets public.

This behavior is verified by signed synthetic JWT and missing/malformed D1
cases against both source and Wrangler's generated bundle. It does *not* prove
installed iPhone PWA behavior or cross-device synchronization.

### Metadata-only production D1 preflight

A read-only Cloudflare D1 check on November 3, 2026 confirmed both expected
tables exist and found **zero cloud save records and zero history records** at
the instant of the query, with no mismatches. These aggregate checks did not
read or output any saved-game JSON or individual player identity. The absence
of server-side rows does **not** establish the absence of Brandi's iPhone-local
progress, which must be exported/verified before any PWA origin, key, service
worker or cache migration. New records could appear after the check: verify
again immediately before any cutover, and preserve owner-held backup and
rollback approvals. Never rely on this historical zero count as permission to
wipe or reinitialize a database.

## Opt-in cloud-save client parity — November 3, 2026

Production's existing Worker injects an inline browser-side Glimmer Pop cloud
sync script after fetching `index.html`. The recovered static source had no
such client. Merely reconstructing `/api/save` would therefore remove an
existing feature. PR #12 now includes a **review-only** replacement
`src/cloud-sync.mjs`, served as a first-party module from the protected
Worker. The protected builder injects the external script into authenticated
HTML (no unsafe inline CSP exception) and adds that module to a versioned
offline service-worker app shell.

The client is intentionally safer than the original implicit reconciliation:

- Access to cloud status requires explicit **Check cloud backup** selection.
- It synchronizes only original Glimmer Pop `brandicade:save:v1`; Prism
  Garden's separate local save key, achievements and backups are untouched.
- Before an initial upload (empty remote), a real downloadable **device
  backup** action must be selected. Upload uses the exact observed cloud
  revision and refuses to overwrite a different concurrent revision.
- If there is only a cloud save, a cloud backup download is required before
  a deliberate restore into a truly empty browser save key.
- When local and cloud copies differ, **no automatic winner**, no
  last-played guess, no merge and no destructive replacement. Both copies can
  be exported for explicit conflict resolution.
- No background writes, polling, auto-retries of ambiguous writes, monkey
  patching of browser storage, or backup key custody in the client.
- Signed Access is still required on every route. D1 outages return errors
  from cloud routes but do not block local-first gameplay.
- This is a **manual sync candidate**. It does not yet restore full automatic
  cloud-sync semantics or demonstrate live real-owner login. Actual player
  acceptance and cloud-write gate activation remain outstanding.

`tests/cloud-sync.test.mjs` covers empty/device-only/cloud-only/matching/
conflicting/corrupt input and exact-progress preservation. The protected
Worker HTTP suite checks script injection, first-party route, denied anonymous
access, service-worker caching and offline asset registration against both
raw and Wrangler-bundled output. No production records, tokens or identities
are used. Real iPhone/PWA and storage-recovery acceptance remains mandatory.

### Mobile backup confirmation refinement

A browser download request does not prove that Safari actually saved a file.
The initial backup buttons therefore initiate a download **without** unlocking
a cloud upload or local restore. A separate, explicit **I saved the backup
file** action confirms that the user has retained the exported file in Files;
only then does the applicable upload/restore button become available.
This is user attestation rather than cryptographic proof of possession.
The device-local record is rechecked before the action, and a changed save
requires a fresh cloud review. In a conflict, both independent export options
remain available. Physical iPhone Files/download verification is still needed
before a production rollout.
 
### Independent synthetic browser interaction coverage
`tests/cloud-sync-ui.test.mjs` uses a synthetic DOM, browser-storage facade
and real module callbacks to exercise the complete check → download →
acknowledge → upload / restore sequence. It verifies that merely initiating
a download does not unlock a data change; conflicting local/cloud files are
exportable but not merged or replaced; administrator checks never mutate
device progress; and the Prism Garden save namespace is left unchanged.
These checks still do not certify iPhone Files downloads, Safari execution,
Cloudflare Access's actual injected JWT, or production D1 behavior.

## P1 device-local progress recovery fix (source-only)

An integrity review identified a concrete local data-loss path in the legacy
Glimmer Pop app: `loadSave()` previously swallowed invalid JSON/unsupported
schema/storage read errors, returned `newSave()`, and the normal bootstrap
`saveVisited()` immediately saved that new state over the original record.
This could erase the only remaining local progress on Brandi's iPhone.

The protected-release branch now uses `inspectLocalSave()` to distinguish
an absent save from one that is unreadable or unsupported. Routine
`persist()` performs a defensive re-read and rejects overwriting a malformed
or unsupported existing record. During blocked recovery, the UI renders a
persistent, accessible alert, offers a raw download of **exact original
localStorage bytes** (without changing the key), and disables entry into
Glimmer Pop gameplay. Prism Garden/Brandle retain their independent storage
and launch paths.

The only overwrite of an unreadable original is through the existing
explicit import-confirmation dialog using `restoreConfirmedBackup()`, which
validates schema before writing and retains the original if the browser
refuses storage writes. No automatic repair, reset, cross-game migration,
unannounced backup upload, or D1 write is involved.

`tests/main-save-recovery.test.mjs` verifies absent vs. malformed,
unsupported, oversized, unavailable storage, existing valid progress,
explicit recovery success/failure, and static recovery UI controls; actual
iPhone Safari storage-denial and Files-download tests remain outstanding.
Do not merge/deploy before these tests and the rest of the release gates pass.
