# Brandicade — recovered source and license provenance

**Forensic checkpoint:** November 6, 2026. **Status:** tracked-history verified; ownership and final license selection **unresolved**. This is a technical provenance inventory, **not legal advice or a rights certification**.

## What GitHub history actually establishes

1. The public repository was created October 30, 2026. Its [initial commit `e9bc052`](https://github.com/devonalanakins/brandicade/commit/e9bc0529e0b53025deebd57cbdbbf07caa6a28c2) contains only a one-line `README.md` (`# brandicade`); it has **no original source or upstream rights record**.
2. The next [recovery commit `27f78cb`](https://github.com/devonalanakins/brandicade/commit/27f78cb63c3dc5ab0bbec115c7131400f0f79caa), October 30 at 18:46 UTC, adds **both** the MIT `LICENSE` (copyright Devon Akins 2026) and `build_worker.py`, whose generated Worker banner states `Generated from GPLv3-licensed source`. These were not introduced by a later Prism integration or v9 modernization.
3. The recovery [README at that exact commit](https://github.com/devonalanakins/brandicade/blob/27f78cb63c3dc5ab0bbec115c7131400f0f79caa/README.md) **already acknowledged the conflict** and explicitly called it unresolved. It describes a recovered static checkpoint, not the full deployed Access/cloud-save Worker and not an original-rights chain.
4. The latest static generator [`build_worker.py`](https://github.com/devonalanakins/brandicade/blob/main/build_worker.py) still emits the inherited GPLv3 statement; [`LICENSE`](https://github.com/devonalanakins/brandicade/blob/main/LICENSE) remains MIT. Treat them as conflicting *claims*, not evidence of dual-license authorization.

## Source inspection scope

I inspected these tracked text components on November 6:

- Core game: `src/app.mjs`, `src/engine.mjs`, `src/progression.mjs`, `src/styles.css`, `src/arcade-controller.mjs`, `src/kahlua-arcade.css`, `src/cloud-sync.mjs`.
- Prism Garden: `src/prism-garden/app.mjs`, `src/prism-garden/content.mjs`, `src/prism-garden/engine.mjs`, `src/prism-garden/controller.mjs`, `src/prism-garden/prism.css`, `src/prism-garden/restoration-scene.mjs`, `src/prism-garden/feedback.mjs`, `src/prism-garden/backup.mjs`.
- Tracked SVG art: `assets/atrium.svg`, `assets/icon.svg`, `assets/kahlua-companion.svg`, `assets/mark.svg`, `.github/assets/readme-hero.svg`.
- Release/build boundaries: `build_worker.py`, `scripts/build_brandicade_protected.py`, `LICENSE`, historical and current `README.md`.

In the sampled game modules and SVG assets, **no additional explicit GPL/MIT/SPDX/third-party license, copyright-owner attribution, CDN import, or external font dependency was found**. SVG `http://www.w3.org/2000/svg` namespaces are not externally fetched code. The app has an external **Brandle** link, not a vendored Brandle distribution. Several source comments describe art or mechanics as original; **a source comment is not independent proof of authorship**.

This was a **targeted textual inspection**, not a complete automated audit of every blob. In particular, binary `assets/icon-192.png`, `assets/icon-512.png`, `assets/icon-1024.png`, `assets/share.jpg`, and `assets/share.png` have not been forensically authenticated, and no pre-recovery source archive was produced from GitHub.

## Unresolved questions (owner / source-of-truth evidence required)

- Where was the static V1.0.1 source maintained **before** the October 30 recovery? Recover any original commit history, archive, prior project or license declarations.
- Did the GPLv3 banner describe actual third-party GPLv3 content, an earlier self-chosen license, or an erroneous generated comment? Who owns the relevant rights, including artwork?
- Can the owner substantiate the desired license for **each** source and binary asset? A public MIT file does not override rights in third-party code or art.
- What copyright/attribution notices must accompany repository source and any distributed builds? Preserve all current notices until verified.

## Decision and release consequence

**Observed:** The inconsistency has existed since the recovered checkpoint. The scanned first-party-looking code/assets do not add an obvious *second* GPL or third-party notice.

**Not proven:** Clean chain of title, authorization to license all recovered source/art as MIT, or permission to remove the existing GPLv3 banner.

**Gate status:** `source_license_rights_review` remains **unconfirmed** in `scripts/check_production_release_gate.py`. Do not manufacture the owner acknowledgement, remove or rewrite license notices, or declare the release legally cleared from the technical scan alone. A documented owner review of recovered origin and assets is the smallest next step. If provenance cannot be established, obtain appropriate rights advice before public licensing/release decisions.

**Separate engineering fact:** The exact v9 frontend is on protected staging; the source-exact production candidate is uploaded **inactive**. This inventory itself does not alter deployment, Access, D1, personal saves, or the release state. See [production release gate](PRODUCTION_V9_RELEASE_GATE_2026-11-06.md) and [device backup acceptance](DEVICE_BACKUP_ACCEPTANCE_2026-11-06.md).
