# Brandicade — unified source and production cutover

**Decision (approved November 6, 2026):** Brandicade is the single playable arcade at `brandicade.anevum.com`. Prism Garden remains a game **within** Brandicade; `prism.anevum.com` is temporary private QA and will be retired **after** the new production release has passed the acceptance gates. The rest of ANEVUM and the independently hosted Brandle game must not be touched.

## Latest provider checkpoint — v11 lossless-export release

As of November 6, source commit `1e8c4cf85269438ca291a770b814ac186710577a` passed [full post-merge CI](https://github.com/devonalanakins/brandicade/actions/runs/42330373171) including synthetic isolated backup/restore in Chromium/WebKit. **Private staging v11 is LIVE** on `prism.anevum.com` at Worker version `b7fb7f2c-0d0c-4295-b6c7-a5338d4f77a3`, deployment `cd38cc2b-e6c9-4d71-9006-9e2a3152a7b0`, 100% staging traffic. The **v11 inactive production candidate** `b98da834-ce76-4c45-8f19-95f802f6e904` was uploaded and independently code-hash verified, but **production still serves** Worker `9b88b22c-d740-4e8f-b35a-5178a627a8e2` at 100%. V11 preserves exact raw saves when unsupported fields would be normalized; staging/production Access and D1 remain independent. This is not evidence that Brandi's actual iPhone backups exist or are restorable. [Current release gate](PRODUCTION_V11_RELEASE_GATE_2026-11-06.md) and [release issue #24](https://github.com/devonalanakins/brandicade/issues/24). Prior v9/v10 candidates are obsolete for promotion.

## Earlier v10 provider checkpoint — historical evidence only

As of November 6, software commit `b4f3f1469c13a6ee7a8ee165486f8cb6f833968a` passed [full CI](https://github.com/devonalanakins/brandicade/actions/runs/42326554686), including synthetic isolated Glimmer and Prism backup/restore on Chromium and WebKit. The corrected **v10 private staging** is LIVE at `prism.anevum.com`, 100% on Worker version `e346cfcd-afd0-4cdb-98a3-0b46f9d20737`, deployment `b5b2c1a3-702f-4adc-bd5d-e04483d959d2`. The corresponding **v10 inactive production candidate** `167e4379-4634-4936-b7ea-c6ce1833e878` was uploaded, read back and independently hash-verified. Production still serves the previous protected version `9b88b22c-d740-4e8f-b35a-5178a627a8e2` at 100% traffic. No actual iPhone saves or authenticated device tests have been verified. [Current v10 release gate](PRODUCTION_V10_RELEASE_GATE_2026-11-06.md) and [issue #24](https://github.com/devonalanakins/brandicade/issues/24). The old inactive v9 candidate `e46c58f2...` is **superseded; do not promote**.

## Earlier v9 provider checkpoint — historical evidence only

As of November 6, source commit `73e6e09a4d0245a631c01d224d18ba766cbff654` passed [full GitHub CI](https://github.com/devonalanakins/brandicade/actions/runs/42288102952). Current v9 private staging is **LIVE** on `prism.anevum.com` at version `906ffa9c-e60b-40b7-87f7-c69ff3eb222c` (100% preview traffic). Production's new v9 candidate version `e46c58f2-c532-4949-b762-474398df927c` was uploaded and independently read back, but remains **INACTIVE**; production version `9b88b22c-d740-4e8f-b35a-5178a627a8e2` still receives 100% traffic. [Current version-pinned release gate](PRODUCTION_V9_RELEASE_GATE_2026-11-06.md). The initial checkpoint below is retained as historical evidence, not current provider status.

## Verified initial checkpoint

- Production Cloudflare Worker: `brandicade`. November 3 deployment `49b2368d-4a9f-40a0-94f5-b3cc627827cc`, version `9b88b22c-d740-4e8f-b35a-5178a627a8e2`, seen at **100%** through Cloudflare provider API on November 6.
- Production hostname is a Worker custom domain with its own proxied DNS record. Production Worker has a D1 `SAVES` binding. It contains the November 3 Prism Garden frontend assets, but **not** the latest Kahlua/controller assets.
- Isolated preview custom domain `prism.anevum.com` points to `brandicade-prism-preview-20261103`, has a separate `SAVES` binding, and was last deployed November 5. Preview includes the newer controller/landscape/companion assets. Its presence does not prove production readiness.
- [PR #15](https://github.com/devonalanakins/brandicade/pull/15) merged into release source branch `release/prism-bloom-protected-parity-20261103`, **not `main`**; exact source head before this reconciliation: `fe047a3c8958e069e9cb649103b9db8e87751389`.
- [CI 41954720457](https://github.com/devonalanakins/brandicade/actions/runs/41954720457) passed on that head. Source tests and browser simulation passed. This CI is **nondeploying** and does not use a real owner's Access identity, real device, live production D1, or origin-specific Safari storage.
- Production backend is the **legacy original** Access/cloud-save runtime, not the PR #12 clean-room backend. **Do not** replace a live backend simply because source CI passes.

## Execution boundaries: source integration versus deployment

1. **Source integration COMPLETE (November 6).** [PR #16](https://github.com/devonalanakins/brandicade/pull/16) merged into `main`, preserving GitHub hero, all prior history, and the nondeploying verification workflow. Exact premerge-head [CI 42263850160](https://github.com/devonalanakins/brandicade/actions/runs/42263850160) passed. This **was not a production rollout**.
2. **Verify static asset parity.** Build `python3 build_worker.py`, then run `python3 scripts/verify_release_assets.py`. CI must publish the deterministic content-addressed frontend-only receipt. This proves compressed static routes match their source bytes, **not** backend/deployment parity.
3. **Inspect protected runtime parity.** Compare asset routing, signed Access verification, /api/session, GET/PUT /api/save and /api/backups, legacy record schema, Cloudflare Access environment, client injection and service-worker cache behavior. Create a production-equivalent **isolated** protected Worker using disposable D1 and approved private preview Access settings; test wrong-identity denial, stale revisions, backup conflicts, signed roles and cache bypass.
4. **Preserve actual data.** Check the current production D1 metadata, owner-controlled encrypted export and isolated restore on a disposable database. Check Brandi's local `brandicade:save:v1` and separate `brandicade:prism-garden:v1` on her own iPhone. Do not clear site data, rename origin, auto-merge progress, delete D1, or expose player records in logs.
5. **Resolve rights and browser acceptance.** Clarify MIT/GPLv3 generated-source notices and asset provenance. Run owner-authenticated iPhone Safari, PWA, airplane-mode, restore, touch target, audio/screen-reader and physical Xbox (Bluetooth, A/B/X/Y, D-pad, stick, LB/RB, Menu, pause, disconnect) tests. Capture evidence without personal save contents.
6. **Explicit production authorization and release receipt.** Confirm intended exact bundled artifact/hash, immutable head SHA, accountable operator, rollback ID, D1 protection, no unintended route or env changes, supported production method, and any required sign-off. Production upload/change must use the current production Worker and `SAVES` binding without silent reset.
7. **Post-release:** Check the intended live URL in an authenticated real player session (home, both games, controller, progress persistence, backup, offline); check failed-login denial, API responses, Worker errors and D1 metadata. Record live Worker version, output hash, observation date and rollback.
8. **Then retire preview hostname:** inventory dependencies; remove only the `prism.anevum.com` preview Worker custom-domain association and its corresponding proxied DNS entry after checking rollback needs. Do **not** delete production `brandicade` Worker/D1, Access policy, player origins or source history. Keep isolated preview code/config for rollback evaluation until independent clean-up approval.

## Device acceptance checklist (must be completed by an actual allowlisted player)

- [ ] Signed-in `https://brandicade.anevum.com/` loads the Kahlua atrium; blocked identity is denied.
- [ ] Open Glimmer Pop; select and make a valid move, pause and resume, reload; previous progress remains.
- [ ] Open Prism Garden from the arcade; move, undo, leave/reopen; board remains consistent; export its own backup and locate the saved file.
- [ ] From an actual iPhone in landscape and portrait: check safe areas, keyboard/touch focus, PWA launch, offline content, and no cross-game storage overwrite.
- [ ] Pair a physical Xbox controller; verify A, B, X, Y, D-pad, sticks, Menu, pause, focus recovery and disconnect, including while a modal is open.
- [ ] Verify per-game achievements match completed events; only Kahlua companion appears.
- [ ] Export Glimmer and Prism saves before browser/site data changes; retain and independently confirm backups.
- [ ] Record actual production deployment hash and version, post-cutover readback, rollback route and observer.

## Additional read-only Cloudflare verification (November 6)

Production and preview Workers each have a `SAVES` D1 binding, pointing to **distinct** databases with matching `saves` and `save_history` column structures (read-only PRAGMA metadata checks). Aggregate production query returned **0 saves and 0 history records at the instant queried**. No player rows or private values were fetched. Both `brandicade.anevum.com` and `prism.anevum.com` retain separate, audience-bound Cloudflare Access self-hosted applications with one policy each. This is not a real-user login, backup, or proof of device-local save absence. Production Worker still remained on deployment `49b2368d-4a9f-40a0-94f5-b3cc627827cc` after PR #16 merged.

## Release gate disposition

| Requirement | November 6 disposition |
| --- | --- |
| New game and controller source integrated to `main` | **Implemented** — PR #15 merged into PR #12 branch; source integration [PR #16](https://github.com/devonalanakins/brandicade/pull/16) merged November 6 |
| Static/frontend source-to-build parity | **VERIFIED** — integration head `f5586afd` passed [CI 42263850160](https://github.com/devonalanakins/brandicade/actions/runs/42263850160), including the new asset manifest and protected dry-run. Not backend/live parity. |
| Production backend parity and license provenance | **Open** — current original backend differs from source candidate |
| Encrypted owner-held backup, isolated restore, origin-safe device preservation | **Open** — older metadata counts do not prove private local progress is absent |
| Signed-in production-equivalent Access/D1 and physical iPhone/Xbox testing | **Open** |
| Production cutover/observation and Prism hostname retirement | **Not executed** |

**Release decision:** NO-GO for replacing the production Worker or removing the preview hostname until all mandatory gates are evidenced. GitHub source integration may proceed separately with truthful status markers and no deployment trigger.

**Rollback:** For a future v11 traffic activation, the immediately preceding LIVE production Worker is version `9b88b22c-d740-4e8f-b35a-5178a627a8e2` (still 100% active at this checkpoint), not the older historical version `09c8dcb9-3db4-47c4-b7be-b9a218a7ba1e`. Reverify deployability and player saves immediately before a production change. Code rollback does **not** rewind player progress, D1, browser storage, or Access policy. Do not force old automatic cloud-sync behavior without evaluating newer saves.

Source of truth: [Brandicade Notion project](https://app.notion.com/p/40a88cc2ef1481bbbcdce71be63b935e), [release PR #12](https://github.com/devonalanakins/brandicade/pull/12), [issue #2](https://github.com/devonalanakins/brandicade/issues/2), [November 3 deployment receipt](PRISM_GARDEN_PRODUCTION_RELEASE_2026-11-03.md).
