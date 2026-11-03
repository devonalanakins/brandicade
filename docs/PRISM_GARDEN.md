# Prism Garden integration (non-deploying recovered source)

A new game inside Brandicade, hosted at /prism-garden.html in the recovered static archive. The feature branch contains original jewel puzzles, 18 authored levels, three worlds, Sanctuary and Mastery replay, a device-local profile/achievements gallery and independent local storage.

**This is a feature candidate only.** It does not replace the deployed Brandicade Worker, Cloudflare Access or D1 backend. Existing Glimmer Pop and Brandle saves stay untouched. Never deploy the generated recovered static Worker to the live Brandicade site until the recovery issue's production authentication, encrypted backup/restore, license/source parity, authenticated phone acceptance and rollback gates are satisfied.

## Controls
Select an exposed gem in any of three stacks, then choose a glowing matching color socket or a free holding shelf slot. Gems placed in a socket stay there, while staged gems can be placed from the shelf later. Each cleared color region unlocks the next. Undo is unlimited, hints use a deterministic solution search, and each puzzle is solvable from the authored start state.

## Verification
\`node --test tests/prism-garden.test.mjs\` checks 18 authored solution witnesses, legal moves, Undo, hints, idempotent awards and save namespace separation. The original recovery branch tests remain in place.

## Deliberate limits
- The game is original and works from /prism-garden.html on a static server, with no runtime packages.
- Achievements currently belong only to Prism Garden and device-local storage; there is no invented cross-game cloud sync, authenticated identity or server-authoritative leaderboard.
- Progress can be lost if Safari website data is cleared. The client does not migrate or alter older saves.
- Complex native 3D dioramas, voiced soundtrack, authoritative cross-device identity and full user-verified iPhone experience are follow-up quality work.
- Source/license provenance from the older Brandicade recovery remains unresolved.

## Product destination: Brandicade, not another game site
Prism Garden is Brandicade's **third arcade game**, alongside Glimmer Pop and Brandle. Both Home and Games library link to the native `/prism-garden.html` route on the **same Brandicade origin**. The Brandicade Brandi profile and Treasures gallery also display read-only Prism Garden mosaics and achievements using `src/prism-garden/arcade-summary.mjs`. The arcade only reads a validated Prism Garden local save and never writes to it. This is a shared presentation surface, not cross-game XP, a cloud account, or an import of Brandle progress.

The isolated `prism.anevum.com` Worker, PR #11 and preview bundle are **temporary QA infrastructure only** and are not a second game destination or a release requirement for the finished player experience. The intended final URL is `brandicade.anevum.com/prism-garden.html`. The Brandicade legacy backup exports Glimmer Pop progress only; Prism Garden retains its independent Settings backup until migration is explicitly verified.

The recovered static worker still omits the *live* Access/D1 API and must never overwrite production. Production launch requires safe recovery of the live Worker source, actual encrypted owner backup/restore, license/source parity, signed Access acceptance, an authorized rollback procedure and physical iPhone QA.

## Prism Bloom — first integrated release increment (2026-11-03)

The next major Brandicade release is the **Prism Bloom Update**, with Prism Garden as its third first-party game. This incremental implementation:

- Adds a Living Atrium restoration strip grounded in **actual completed** Prism mosaics and world progress, plus a distinct faceted jewel door on both Home and Games. Glimmer Pop and Brandle launch behavior stays unchanged.
- Makes Prism launchers show the next authored mosaic or validated interrupted level, and a real 0–18 completion meter. Corrupt/inaccessible progress displays recovery guidance and an indeterminate meter rather than inventing completion.
- Expands the Keepsake Cabinet into filterable Glimmer Pop, Prism Garden and Arcade Passport sections, each with explicit locked/earned states, accessible buttons and complete award descriptions.
- Introduces **six read-only, derived Arcade Passport achievements**, bringing the candidate collection to **34** (10 Glimmer + 18 Prism + 6 Passport). Requirements always use validated game-local progress, never Brandle's external origin. The Passport cannot grant XP, mutate game saves or infer inaccessible progress; it recomputes on visiting the profile/cabinet.
- Enhances Brandi's profile with the Passport count while preserving original Glimmer Pop XP, levels, cosmetics and separate Prism Garden save/backup formats.
- Uses no new dependencies or remote image trackers. Layered CSS/SVG-style glass jewels and world accents obey reduced-motion preference; keyboard and touch filters use 44px minimum targets.

**Implementation evidence:** Gameplay PR #8, first Prism Bloom source commit (CI, diff and device checks must be independently verified). Tests include read-only badge derivation, per-world progress and normal/error states, launcher references, offline asset list and cabinet accessibility checks.

**Important limits:** The recovered static Worker still does not contain the live Cloudflare Access/D1 backend and must not replace production. Brandle's external original saves remain there; do not claim cross-device synchronized trophies. All production source/backup, encrypted D1 restore, signed Access, licensing, safe rollout and real iPhone PWA acceptance gates on [issue #2](https://github.com/devonalanakins/brandicade/issues/2) remain in force.

## Prism Bloom restoration-scene increment — November 3, 2026

**Implemented in gameplay source:** three original scalable SVG dioramas are rendered by `src/prism-garden/restoration-scene.mjs`. Each world has exactly six visually distinct elements, one mapped to each existing authored mosaic. Nothing appears earned until that level's identifier is present in the validated device-local progress. The same scene is reused in the World Atlas, Living Gallery, puzzle environment and win screen. The win scene highlights only the newest completed layer, and the puzzle board highlights a genuinely successful placement.

The vector illustrations are local, dependency-free, decorative rather than authoritative game UI. Scene composition is fully accessible as a text-labeled image with an exact `X of 6` restoration count. Keyboard move actions restore focus to a reachable control after re-rendering; aria-live messages remain available. Device/system reduced motion and in-game motion-off settings suppress the new reveals. No achievements, save key, engine, puzzle difficulty, API, account, or Brandle functionality changed.

The app-shell route list includes `/src/prism-garden/restoration-scene.mjs` for offline play; Cloudflare preview must include this module in its isolated source allowlist before preview verification can pass. New `tests/prism-world-restoration.test.mjs` covers truthful scene states, non-sequential completion, all three art variants, unreadable data, static accessibility/motion guards, a read-only gallery/atlas and actual puzzle completion with a single newly revealed mosaic.

**Release boundary unchanged:** recovered static Worker build is not production's Access/D1 Worker. Production deployment remains blocked until the existing real-data backup/restore, identity, source parity, license, rollback and on-device testing gates are met.
