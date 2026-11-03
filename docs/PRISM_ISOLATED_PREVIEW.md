# Prism Garden — Isolated iPhone preview build

**Status: source-only, not publicly deployed.** This preview is intentionally separate from the existing Brandicade production Worker, Cloudflare Access app and D1 saved-game database. It does not make the game live.

## Build

Run from the repository root:

```sh
python3 scripts/build_prism_preview.py
node --input-type=module --check < dist/prism-garden-preview.worker.js
python3 -m unittest tests/test_prism_preview_build.py -v
```

The builder reuses the repository's existing deterministic `build_worker.py` as a library, writing a separate `dist/prism-garden-preview.worker.js` artifact. It bundles **only** the Prism Garden interface, jewel engine, authored levels, achievements, device-local save/backup controls, CSS and icons. The root route serves Prism Garden directly. The old arcade, cloud-save endpoints, D1 bindings, real identities, keys and Access configuration are deliberately excluded. The generated Worker answers only GET/HEAD for known static routes.

The preview has a separate PWA manifest, named preview cache, service worker, iPhone home-screen icon and a clearly marked preview banner. Its save namespace still uses browser `localStorage`; **a distinct hostname means that even a matching storage key cannot read or overwrite Brandicade's production-origin local storage**. No progress sync, account login or cloud backup is advertised. A signed-in iPhone browser test is still required for offline launch, touch placement, restore picker, interrupted-game recovery and Add to Home Screen.

## Before making a preview URL available

- Choose and verify a separate preview hostname and protect it using an appropriately reviewed Cloudflare Access application/allowlist **before enabling public access**.
- Do not rebind the existing `brandicade` Worker, its `SAVES` D1 database, Cloudflare Access policy, production domain or route.
- Review source/license and asset provenance, then deploy this static artifact only to a new isolated Worker with zero storage/database/secrets bindings.
- Confirm response headers and all static routes, 404 for `/api/save` and old arcade assets, service worker scope, offline behavior, and iPhone acceptance.
- Remove the preview after testing if it is no longer needed. Any local progress under the preview origin must be backed up first.

**Verification:** four synthetic build/CI tests check deterministic output, missing imports and entrypoint rejection, preview-only assets, correct PWA metadata, and Worker JavaScript syntax. These tests do not replace real-device or actual-host checks.

Brandicade release issue: https://github.com/devonalanakins/brandicade/issues/2

## Prism Bloom scene parity (2026-11-03)
The QA-only preview's static asset allowlist now includes `restoration-scene.mjs` because the first-party Prism Garden game uses it for six earned layers in each of its three worlds. The isolated build must serve the new art module offline, keep legacy app and cloud-save API routes excluded, and pass exact-head HTTP tests. This remains test infrastructure, not a separate product or live deployment. The target player experience stays inside Brandicade.
