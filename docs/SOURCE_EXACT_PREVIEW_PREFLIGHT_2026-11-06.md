# Brandicade — source-exact private staging preflight

**Date:** November 6, 2026

**Target:** prepare the current `main` frontend, including the new read-only save-file verification screens, for private review while preserving the existing staging Worker authentication and save backend. This is **not** a staging deployment, live release, login check, or approval to retire `prism.anevum.com`.

## Why another staging receipt is required

The original [staging attestation](STAGING_ASSET_ATTESTATION_2026-11-06.md) and [asset-only release projection](FRONTEND_ONLY_CUTOVER_2026-11-06.md) describe the earlier November 5 static assets. The previous preview has the v8 service-worker cache. Current source includes the v9 cache and `/src/backup-file-check.mjs`, plus the Prism Garden read-only file check. Therefore the original preview receipt does **not** prove the latest source is deployed and must not be reused as if it did.

## Non-deploying preflight

`scripts/prepare_current_preview.py` accepts the existing private production and preview `content/v2` readbacks and their pinned hash-only receipt. It validates exact readback module/table hashes, identical pre-table Worker bytes, identical post-table authentication/backend except the distinct Access audience, and the existing save-critical route digests. It independently verifies the *current* static bundle against checked-out repository files. It then replaces **only the preview's asset table**, applying the expected cloud-sync service-worker rewrite and adding the existing `/src/cloud-sync.mjs` code.

The output is a **new private preview candidate**, plus a safe digest/count receipt with `deployed=false`, not a live Cloudflare Worker. It does not write to `brandicade`, `brandicade-prism-preview-20261103`, DNS, Access, D1, or browser storage. Any optional raw Worker output must be kept in ignored `dist/private/` with restrictive permissions and never attached to a public PR/CI log.

Typical workflow after rechecking the existing provider deployment IDs using the authenticated Cloudflare API:

```sh
python3 build_worker.py
python3 scripts/verify_release_assets.py --output dist/brandicade-release-assets.json
python3 scripts/prepare_current_preview.py \
  --production /absolute/private/production-content-v2 \
  --preview /absolute/private/preview-content-v2 \
  --receipt docs/receipts/brandicade-2026-11-06-cutover-projection.json \
  --static-worker dist/brandicade.worker.js
```

To write the candidate **without deploying**, optionally append `--write-private-preview dist/private/latest-preview.worker.js`. No upload action is implemented. The hash-only receipt is derived from the current source and returned for operator review. The old pinned receipt is validated *only as the old baseline*; the new candidate must receive its own immutable Cloudflare deployment/version identifiers after a separately reviewed staging rollout.

## Acceptance criteria and limits

- [x] Pure offline builder and synthetic safety tests, committed to the repository when this document is reviewed
- [ ] Confirm full exact-head CI and compare against the pinned `main` source before merge
- [ ] Save owner-controlled files from the original iPhone production origin and maintain an independent copy
- [ ] Privately prepare the source-exact candidate from authoritative Worker readbacks, verify its digest and bindings, and obtain staging change authorization
- [ ] Deploy to an isolated authenticated staging environment **only after** preflight and rollback review; re-attest the *actual* served code
- [ ] Real allowlisted sign-in, denied-user check, physical iPhone/PWA and Xbox tests, and isolated restoration
- [ ] Resolve MIT/GPLv3 provenance and production release/rollback checks
- [ ] Promote reviewed version to `brandicade.anevum.com` preserving production D1/Access/origin; verify authentic player experience
- [ ] Only then authorize and perform removal of `prism.anevum.com` staging domain

**Release NO-GO:** Do not switch production to the historical `716792c8...` projected Worker: it includes the older staging frontend and is missing the read-only checks introduced later. Successful source CI and simulated browser tests do not prove a real signed-in deployment or a recoverable original iPhone save.
