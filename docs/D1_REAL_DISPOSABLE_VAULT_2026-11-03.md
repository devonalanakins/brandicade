# Small Job 045 — encrypted backup and sandbox restore on real Cloudflare D1

**Status:** Verified on real, disposable Cloudflare D1 through the D1 REST query/batch API using the **exact committed** `server/legacy-backup-vault.mjs` logic. NOT tested through the Worker D1 binding in this job. NOT performed on production data. November 3, 2026 (America/New_York).

## Scope and isolation

- Source implementation: [PR #10](https://github.com/devonalanakins/brandicade/pull/10), original test commit `d678801f62e7d55a0130d7679aa0edeb36c16328`, file Git blob `a033d0d257a76d02a0b13b7813b85a9b5c5ded6e`.
- Created **two new disposable D1 databases**, `brandicade_job045_source_20261103` and `brandicade_job045_target_20261103`. Neither was the production `brandicade-player-saves` database or bound to the production Worker.
- Created the existing-schema `saves` and `save_history` tables in each. Source had one synthetic subject's revision 2 and two history revisions, plus a second **synthetic** record to exercise data isolation. Target began empty and had the distinctive `brandicade_restore_sandbox` marker.
- A temporary Worker `brandicade-job045-vault-test` was uploaded with **only synthetic D1 bindings**. Its `workers.dev` route was initially disabled; the route was briefly enabled for an attempted external HTTP invocation, but the available clients could not reach it. It was disabled and deleted. **No passing Worker-runtime invocation is claimed.**
- The verified test instead executed the exact GitHub source of the backup vault in a transient JavaScript context, replacing only the D1 database interface with a thin adapter over Cloudflare's actual `POST /d1/database/{id}/query` API. All SQL and backup crypto logic came from the committed source. `db.batch` mapped to D1 REST `batch`, with bound statement parameters.
- A fresh 2048-bit RSA-OAEP key pair was generated **only in test memory**. Neither the JWK private key nor encrypted player data were output or committed. The archive was not persisted. The only source records were artificial game fixtures.

## Observed test result

Cloudflare's D1 API returned `success:true` for source and target schema creation and seeding. The committed vault code then reported `pass:true` and every following verification succeeded:

| Check | Result |
| --- | --- |
| Archived ciphertext excludes synthetic player identifier, display name and an unrelated synthetic row | Pass |
| Tampered authenticated recipient metadata rejected | Pass |
| Recipient private key decrypts archive with expected two history revisions | Pass |
| Restore into empty, explicitly marked sandbox | Pass: `{verified:true,saves:1,history:2}` |
| Source and restored save data/revision/timestamp are exactly identical | Pass |
| Source and restored history contents/revisions/timestamps are exactly identical | Pass |
| Unrelated source player does not appear in target | Pass: 0 foreign saves |
| Repeating restore on populated target is denied | Pass |
| Restore attempt against a database without the sandbox marker is denied | Pass |

The source and target D1 queries were performed using the test databases only. This is stronger evidence than an in-memory SQLite fixture, but does **not** establish compatibility of the vault against the actual `env.SAVES` binding, production credentials, a long-lived offline recovery key, or a full database export/recovery.

## Cleanup verified

1. The synthetic Worker route was disabled with a configuration readback, then the Worker was deleted. The Workers list reported it absent.
2. The target and source D1 databases were individually checked by exact name and UUID before deletion, then **both deleted successfully**.
3. A fresh D1 list found neither temporary database; a fresh Worker list found no temporary Worker.
4. Production readback found Worker deployment `53bdf783-a472-486f-b06d-53551696018a` still active, the production `brandicade-player-saves` D1 database present, and the existing `Brandicade — Private Arcade` Access app with one policy. No production D1 rows were read or exported.

## Release gates remaining

This job closes the **synthetic real-D1 API** verification subtask only. [Issue #2](https://github.com/devonalanakins/brandicade/issues/2) must remain open until: owner-controlled offline recovery key and encrypted independent storage; a consented *production* encrypted backup with fully verified isolated restore and complete schema coverage; real Cloudflare Access signed login; final integrated Worker source/license/asset parity; iPhone Safari/PWA acceptance; and reviewed release plus rollback procedures. The full exact-head GitHub Actions run was queued at review time, not reported passed.

**No Prism Garden deployment, production Worker change, D1 production data mutation, Access policy modification, or production release was performed.**
