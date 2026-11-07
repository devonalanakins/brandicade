# Brandicade v10 — production release gate (inactive candidate)

**Supersedes:** [v9 release gate](PRODUCTION_V9_RELEASE_GATE_2026-11-06.md). Its inactive production version `e46c58f2-c532-4949-b762-474398df927c` lacks the lossless-import fix and must **not** be promoted. Old versions are retained for traceability.

**New verification:** [PR #26](https://github.com/devonalanakins/brandicade/pull/26) and [full post-merge CI](https://github.com/devonalanakins/brandicade/actions/runs/42326554686) passed, including synthetic export and isolated two-game restore rehearsals in Chromium and WebKit. This does **not** satisfy the owner's original iPhone backup or real-device restore acceptance requirement. The PWA cache is now `cloud-bridge-v10`.

**HISTORICAL, SUPERSEDED:** v10 is **not** the current release. Its inactive version `167e4379-4634-4936-b7ea-c6ce1833e878` lacks the verified v11 lossless-export/write protection. Do not promote it. See the [v11 release gate](PRODUCTION_V11_RELEASE_GATE_2026-11-06.md) and [release issue #24](https://github.com/devonalanakins/brandicade/issues/24). The v10 manifest is retained only for audit history.

**Status checked November 6, 2026:** Source and exact-head GitHub CI are VERIFIED. The newest private staging version is LIVE. A production candidate is UPLOADED BUT INACTIVE. **Production crossover is NO-GO pending real owner/device evidence.** No amount of CI coverage can establish that Brandi's iPhone-local progress has been preserved.

## Pinned provider state

| Component | Verified ID / hash | State |
| --- | --- | --- |
| Repository `main` | `b4f3f1469c13a6ee7a8ee165486f8cb6f833968a` | Source-verified; [CI success](https://github.com/devonalanakins/brandicade/actions/runs/42326554686) |
| `brandicade.anevum.com` | Worker `brandicade`; deployment `49b2368d-4a9f-40a0-94f5-b3cc627827cc`; version `9b88b22c-d740-4e8f-b35a-5178a627a8e2` | Existing live production, 100% traffic |
| Inactive production v10 | Worker version `167e4379-4634-4936-b7ea-c6ce1833e878`; SHA-256 `ad94d4f63c7c4e5ba0f3ac8057f0e04d080ebe70cdc5c384811eaa80aa0d95f2` | Uploaded and independently read back, **0% production traffic** |
| `prism.anevum.com` | Worker deployment `b5b2c1a3-702f-4adc-bd5d-e04483d959d2`; version `e346cfcd-afd0-4cdb-98a3-0b46f9d20737`; SHA-256 `f50d0c627087e0c12829e660e6c375819c3abaf5352abc6af3a7ea697de18f40` | Live **private** v9 staging, 100% staging traffic |

Current source-to-static comparison: 37 assets including the first-party cloud bridge. The latest production candidate retains the **existing production Access audience, signed backend and D1 `SAVES` binding**, and has exactly the updated staging asset table. Seven save-critical modules match the current production implementation byte-for-byte. The production and staging D1 bindings are separate. Both Access applications have explicit email allowlists, with no public bypass policy.

**Rollback to the current production Worker** after a future promotion means deploying version `9b88b22c-d740-4e8f-b35a-5178a627a8e2` again. This reverts code routing only; it does **not** undo any D1 or iPhone-local save mutations. Do not use the superseded November 5 static projection `716792c8...` for a v10 release.

## Fail-closed local check

The version-pinned, read-only tool is `scripts/check_production_release_gate.py` and its public hash/version manifest is `docs/receipts/brandicade-v10-production-candidate-2026-11-06.json`.

```sh
python3 scripts/check_production_release_gate.py
```

Without evidence the exit code is **3** and status is `RELEASE_NO_GO`. This is the correct initial result. The tool does **not** call Cloudflare or authenticate to an account, change traffic, contact the player, upload save files or execute a deployment.

When the owner has privately recorded the checks, run it again with **two locally held files that must never be committed or uploaded as public CI artifacts**:

```sh
python3 scripts/check_production_release_gate.py \
  --provider-observation dist/private/brandicade-provider-snapshot.json \
  --owner-acceptance dist/private/brandicade-owner-acceptance.json
```

The fresh provider snapshot must be independently generated from **current authenticated Cloudflare read-only observations** and include the production and staging active/latest version IDs, code SHA-256, D1 separation, allowlist-only Access state, and observation timestamp with timezone. The checker rejects stale snapshots (over 30 minutes), altered candidate hashes, mismatched source/versions, missing or unsafe controls.

The owner-held acceptance file uses a strict schema with `schema`, `release`, `source_sha`, `candidate_version`, and `checks`. Each check requires `confirmed: true`, a timezone-aware `observed_at`, and an opaque `evidence_ref` pointing to privately held proof. The exact ten check IDs are in the manifest. The evidence references are **not** cryptographic attestations. Do not put emails, personal save contents, tokens, photos, screenshots, recovery keys, or player records in either file, GitHub, or Notion.

Even if both files satisfy the checks, the result is only `REVIEW_REQUIRED`, **never automatic authorization or a deployment**. A human must inspect evidence, source rights and rollback before approving production routing.

## Remaining owner acceptance (NOT YET VERIFIED)

1. On Brandi's existing iPhone and **original `brandicade.anevum.com` origin**, export Glimmer Pop and Prism Garden separately to Files. Retain a second independent private copy. **Do not clear browser data, remove the PWA or import over the current saves.** See [device instructions](DEVICE_BACKUP_ACCEPTANCE_2026-11-06.md).
2. Confirm the exports with the read-only checking controls on [private staging](https://prism.anevum.com) using an allowlisted Access session. The Glimmer check validates format/lossless compatibility, not a cryptographic signature. The Prism check validates its checksum and puzzle replay. Neither changes the original saved game.
3. Independently test restoring to a disposable environment; confirm the original iPhone's saves remain unchanged. Test both an authorized identity and a denied identity, actual iPhone Safari/PWA/offline and physical Bluetooth Xbox controller.
4. Document license-rights review for the inherited GPLv3 source notice versus MIT `LICENSE`. The [source-rights provenance audit](SOURCE_RIGHTS_PROVENANCE_2026-11-06.md) establishes that both statements entered together in the October 30 recovery commit, but not the pre-recovery ownership of code or raster art. Do not mistake the targeted technical scan for legal clearance.
5. Recheck exact Cloudflare IDs, prepare rollback, document operator and approve the traffic switch. After a real authenticated production acceptance, separately approve retiring `prism.anevum.com`. Do not delete its D1 or player data as a shortcut.

**Release gate: NO-GO until the checks above have actual independent evidence.** Maintain [release acceptance issue #24](https://github.com/devonalanakins/brandicade/issues/24), not the separate Brandle [issue #2](https://github.com/devonalanakins/brandicade/issues/2).