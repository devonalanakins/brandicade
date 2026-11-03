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
