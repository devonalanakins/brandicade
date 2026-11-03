# Prism Garden — Local backup and save integrity

This work is part of [Brandicade PR #8](https://github.com/devonalanakins/brandicade/pull/8), which targets the recovered static source and **must not deploy over the production Worker** until existing Access/D1/source-provenance and recovery gates are resolved.

The Prism Garden Settings screen now offers **Download backup** and **Restore from file**. Backup files use a versioned JSON envelope, SHA-256 checksum to detect accidental corruption, a 256 KiB size limit, strict level-specific jewel conservation, and replay of the current puzzle's move history. The user must confirm a restore before only the `brandicade:prism-garden:v1` local storage key is replaced; Glimmer Pop's `brandicade:save:v1`, the Brandle origin, and the live D1 are never touched by this feature.

**Security and limits:** The JSON backup is not encrypted or signed. A SHA-256 checksum detects accidental corruption but is not a trust guarantee. Backups remain on the local device unless a player chooses to share them. This is not a server-authoritative anti-cheat system or cross-device cloud synchronization. The renderer does not automatically export or inspect another application's saves.

The static Worker route manifest and offline PWA cache include the backup modules; navigation caching now correctly distinguishes the arcade home from Prism Garden so offline navigation does not cache the wrong document under `/index.html`.

**Checks:** `node --test tests/prism-backup.test.mjs tests/prism-backup-ui.test.mjs` plus the existing Prism Garden, legacy backend, Python and deterministic Worker build checks from `.github/workflows/verify.yml`.

**Still required before launch:** real iPhone Safari download/picker/restore acceptance; artwork and animation polish; full recovered production Access identity and encrypted D1 restore verification; source provenance and release owner approval.

## Save corruption and stale-tab protection (November 3, 2026)
On startup, Prism Garden now validates the device-local current run against the existing level catalog, gem inventory and replayable move history. Unreadable saves are preserved without replacement. Gameplay writes are blocked with a visible explanation and a link to Settings, where the original bytes can be downloaded as an **unverified, as-is text file** or a known-good verified backup can be restored with player confirmation.

A best-effort localStorage snapshot check also refuses a save when another tab has changed the stored bytes since this tab loaded. This is not a transaction across simultaneous tabs, and does not replace full storage-concurrency testing. The user can reload to inspect the latest saved version. Existing Brandle, Glimmer Pop and production D1 records are outside the affected namespace.

Targeted Node regression tests cover corrupt JSON, inconsistent jewel history, normal saved runs, stale-tab writes, blocked Continue and raw file export. Hosted exact-head GitHub CI and real iPhone Safari recovery and backup acceptance remain outstanding. No production Worker, Access policy, private D1 or game-origin migration is authorized.
