# Brandicade Prism Garden — production deployment evidence

**Deployment date:** 2026-11-03  
**Owner:** Brandicade / Devon  
**Target:** `https://brandicade.anevum.com/`  
**State:** Deployed at 100%; authenticated iPhone acceptance and source parity remain open.

## What actually shipped

The existing production Cloudflare Worker was updated *in place* to add Prism Garden **inside Brandicade**. It was not replaced with the unprotected static build or the different clean-room release candidate. The deployed code retains the pre-existing private Cloudflare Access JWT verifier and `/api/session`, `/api/save`, `/api/backups` runtime. The static asset table was enhanced using 20 SHA-1-verified GitHub blobs from pinned release gameplay commit `5d99d3b9abe51bc9cb06b01353183b196a21353d`, including the jewel game, achievement/arcade components, local save protection, new versioned PWA shell, and first-party manual cloud-backup module. The earlier inline periodic/background cloud upload script was removed and replaced with a first-party external module, with no change to Access allowlists or production D1 configuration.

The deployed Worker **is not byte-identical** to `dist/brandicade-protected.candidate.mjs` on PR #12. The latter is a *future clean-room backend integration candidate*, not the code serving production. This distinction is important for engineering integrity. The live Worker still contains the older non-atomic legacy D1 writer. The safer transactional D1 writer in the draft PR must undergo separate production-equivalent testing before replacing it; no assertion of live atomic writes is made.

| Item | Verified observation |
| --- | --- |
| Production Cloudflare Worker | `brandicade` |
| Production deployment ID | `49b2368d-4a9f-40a0-94f5-b3cc627827cc` |
| Current production version ID | `9b88b22c-d740-4e8f-b35a-5178a627a8e2` |
| Source SHA-256 returned by Cloudflare readback | `8a8efdc84fdea8fb581f06cfb49d5f5abd2032a6fff0aee1e0fc1661a782adc5` |
| Live Worker asset routes | 29 (including `/prism-garden.html` and `/src/cloud-sync.mjs`) |
| Release asset source commit | `5d99d3b9abe51bc9cb06b01353183b196a21353d` |
| Additional CI artifact-only commit | `40c6534ff28190905b1d16974da6b2170b7a3d01` |
| Exact-head CI | [GitHub Actions run 41741636977](https://github.com/devonalanakins/brandicade/actions/runs/41741636977) — passed; generated bundle available for short-term review, but it is NOT byte-identical to this deployed Worker |
| Old live deployment | `53bdf783-a472-486f-b06d-53551696018a` |
| Old deployable Worker version for rollback | `09c8dcb9-3db4-47c4-b7be-b9a218a7ba1e` |
| Private QA stage | `https://prism.anevum.com/` on deployment `24eaed37-d3d9-4abd-b97d-f1a22b58ab12`, separate synthetic D1 |

## Acceptance evidence

- GitHub PR #12's source and simulation tests passed, including JWT validation, cloud-save contracts, stale revision and rollback cases, mobile-layout source guards, backup/restore confirmations, and offline asset manifest checks.
- Cloudflare staged the composed Worker with the preview Access application's separate audience and its **own** D1 binding. A staged source readback matched the predicted SHA-256; its Access audience matched the private preview application.
- Immediately before production activation, read-only production D1 queries reported **zero saves and zero save-history rows**; a D1 time-travel bookmark was available. The production binding was retained and no D1 row mutations were issued by the deployment process.
- Production `/scripts/brandicade/deployments` confirmed 100% traffic on the new version. Production `content/v2` matched the pinned deployed source SHA-256. All 20 patched assets decompressed and the module-import route graph resolved against the 29-route Worker. The Prism Garden page, restoration scene, backup UI, updated PWA cache, explicit Glimmer save recovery, and external cloud bridge were present; the legacy periodic-upload injection was absent.
- Unauthenticated probes to the production and private-preview URLs returned HTTP 403 through the available client. Because the provider's HTTP client is not logged in as an allowlisted player, this **does not** prove signed-in gameplay works.

## Open gates and rollback

**Not yet verified:** an actual owner/Brandi Cloudflare Access browser session, an iPhone Safari or installed-PWA walkthrough, audio/visual/VoiceOver acceptance, a fully live D1 read/write with a real signed-in session, and a successful owner-controlled backup of any *device-local* progress. The repository's MIT license and the inherited GPLv3 Worker source header also remain a provenance discrepancy; neither was silently rewritten.

For incident response, identify the currently active version and save revision first. To roll back code, use the Cloudflare Workers deployment API with `strategy: percentage` and `versions: [{ percentage: 100, version_id: "09c8dcb9-3db4-47c4-b7be-b9a218a7ba1e" }]`. **Do not** delete/recreate production D1, clear service-worker caches or Safari data, or indiscriminately roll back cloud saves. Returning to the old Worker also returns to its previous automatic-sync behavior, so review newer local/cloud progress before selecting rollback.

The GitHub `main` branch is divergent from the recovery/release stack. PR #8 and PR #12 remain in their existing draft branches pending source reconciliation; this deployed Worker is *not* represented as merged to `main` until the actual clean-room source and license conflict are resolved.

**Next acceptance:** sign in at `https://brandicade.anevum.com`, launch Prism Garden from the Brandicade game library, make one move, exit/reopen, confirm the same board, check achievement progress, export a Prism backup, and test PWA installation/offline behavior. Preserve original progress on every device.
