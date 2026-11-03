# Prism Garden — isolated mobile preview build

**Status: preview source only; not a released game and not an authenticated live URL.**

This recovery increment provides a deterministic, standalone Cloudflare Worker artifact containing Prism Garden and only its static assets. It does not replace the existing Brandicade Worker, bind the `SAVES` D1 database, call the authenticated save API, or copy Brandi's local progress. It deliberately stays separate from the existing game and cloud-save pull requests.

## Build and acceptance

From the project root:

```sh
python3 scripts/build_prism_preview.py
node --input-type=module --check < dist/prism-garden-preview.worker.js
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The builder reuses `build_worker.py` in a temporary directory, preserving the existing static Worker format and security headers. The preview is served at `/` and `/prism-garden.html` and includes Prism Garden engine, levels, achievements, device-local backup UI, CSS, icons, a preview banner, an independently scoped PWA manifest, and a versioned offline cache. It rewrites the back-to-arcade link to the existing production hostname. It includes **no** legacy arcade page, D1 binding, authentication settings, cloud-save endpoint, credentials, or private data.

Because browser storage is origin-scoped, a separate preview hostname cannot read or overwrite the current production-origin `localStorage` data. On the preview, progress is **device-local only** and must be exported using the game's backup interface before switching devices or deleting the preview app.

## Controlled publishing requirements

Do not enable a public `workers.dev` route until the preview domain is protected with a reviewed Cloudflare Access policy/allowlist, or explicit public publication is approved. Prefer an isolated Worker with no bindings, no production route, and disabled `workers.dev` visibility until the access gate is satisfied. Preview release does not depend on completing the production encrypted D1 migration.

For phone acceptance, verify Safari portrait/safe areas, starting a level, completing a jewel move, hint and undo, interrupted-run recovery, download/import, offline launch, Add to Home Screen icon, and reopening after an upgrade. The real iPhone results must be recorded separately. The existing production Access/D1 backup, source-license provenance, ownership and rollback gates still apply to merging into the **main Brandicade app**, not to local synthetic preview-build tests.

Local acceptance includes four synthetic preview-builder tests: deterministic output, asset-route isolation, PWA metadata and JavaScript syntax, cache revisioning, fail-closed missing imports and invalid game entrypoint. These tests do not claim the rendered game was exercised in Safari.

Release blocker: [Brandicade issue #2](https://github.com/devonalanakins/brandicade/issues/2).
