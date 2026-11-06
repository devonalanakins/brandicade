# Brandicade — pinned private staging frontend attestation

**Checkpoint:** November 6, 2026  
**Owning repository:** `devonalanakins/brandicade`  
**Scope:** Static frontend assets only. No user data, origin changes, login, signed API traffic, or deployment.

## Observed staging release

- Host: `prism.anevum.com`, a temporary private preview, **not** the planned production home.
- Cloudflare Worker: `brandicade-prism-preview-20261103`.
- Preview deployment ID: `8e1ec85d-d64e-41ac-b9da-7b3149d645e3`.
- Preview version ID: `0e57ae55-d3ab-4157-a4c8-ebdb11f9da89` (observed at 100% when captured).
- Pinned GitHub source manifest SHA-256: `7dddc1c57a68d66bc3d3ec0f55e60daf394654570b452447bd44a619e723a915`.
- 34 routes are unchanged from the verified 35-route source manifest; the app service worker is the one allowed, deterministic rewrite; `/src/cloud-sync.mjs` is the one additional first-party route.
- All **36** deployed asset hashes, byte sizes and MIME types were read from the actual Cloudflare Worker `content/v2` in the authenticated Cloudflare tool environment. The in-tool decoder expanded gzip/base64 chunks and returned *only* hashes and route metadata, never production Access configuration, code, save data, or secrets. Those observed values are pinned in `docs/receipts/brandicade-2026-11-06-prism-staging-assets.json`.
- The service-worker rewrite performs **exactly** the declared cache version change and inserts `/src/cloud-sync.mjs` in the static offline asset list. No broader rewrite allowance is accepted. The cloud sync module is independently checked against its actual source bytes.

## Reproducing the offline comparison

The verifier works with immutable hash-only receipts and source files; it never talks to the Cloudflare API. On the same source revision as the receipt:

```sh
python3 scripts/attest_staging_assets.py \
  --source docs/receipts/brandicade-2026-11-06-source-assets.json \
  --observed docs/receipts/brandicade-2026-11-06-prism-staging-assets.json \
  --service-worker sw.js \
  --cloud-sync src/cloud-sync.mjs \
  --expected-version 0e57ae55-d3ab-4157-a4c8-ebdb11f9da89 \
  --expected-deployment 8e1ec85d-d64e-41ac-b9da-7b3149d645e3 \
  --output dist/staging-frontend-attestation.json
python3 -m unittest discover -s tests -p 'test_staging_asset_attestation.py' -v
```

The independent GitHub workflow `verify-staging-frontend.yml` runs on this integration PR and supports manual re-verification. It does **not** fetch a fresh live preview version, and a green result on the pinned snapshot does not prove the hostname has not been redeployed since capture. Refresh provider-side deployment metadata before any release decision. The source receipt itself was created by the existing verification workflow and validated independently.

## Strict boundaries

**Verified:** This pinned preview version has the expected UI, controllers, Kahlua assets, Prism gameplay assets, and first-party cloud bridge without unexplained static-byte differences. The static source and the preview's immutable version have clear traceability.

**Not verified:** Cloudflare Access identity acceptance, real player session, backend/legacy D1 compatibility, owner-held device/cloud backups and isolated restore, iPhone Safari/PWA/offline tests, physical Bluetooth Xbox controller behavior, licensing provenance, or a new production release.

The planned final home remains `brandicade.anevum.com`. Preserve its Worker, Access application, D1 binding, original browser-origin saves and rollback version. Retire `prism.anevum.com` only **after** a separate approved production cutover, signed-in real-device acceptance, and dependency inventory. See [the cutover checklist](BRANDICADE_MAIN_CUTOVER_2026-11-06.md).
