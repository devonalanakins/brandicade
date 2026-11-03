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
