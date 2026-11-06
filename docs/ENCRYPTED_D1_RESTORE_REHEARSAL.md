# Encrypted D1 save-backup and disposable restore rehearsal

Status: **ISOLATED IMPLEMENTATION ONLY — NOT LIVE**, November 3, 2026.

## Scope and trust boundaries

This feature adds `server/legacy-backup-vault.mjs` with two explicit, unconnected operations:

- `createEncryptedLegacyBackup(db, {playerRecordKey, recipientPublicKey, recipientKeyId, explicitlyAuthorized:true})`: reads only the fixed server-owned player's `saves` and complete `save_history` rows in **one D1 batch**, applies hard size/row limits (no silent truncation), and encrypts the snapshot before returning the portable archive.
- `restoreEncryptedLegacyBackupToSandbox(db, archive, {recipientPrivateKey, expectedPlayerRecordKey, explicitlyDisposable:true})`: authenticates and decrypts only with the separate recipient private key, requires the exact trusted record key, requires an empty target and an **explicit `brandicade_restore_sandbox` marker** (which must never be created in production), and uses a single transactional batch to restore all saved rows. It independently queries the restored records and compares them byte-for-byte.

The module deliberately has **no web route, scheduler, R2 output, production database binding, or secret configuration**. It is not bundled by `build_worker.py`. No owner key or private data belongs in this repository, CI, chat messages, normal logs or Notion.

## Cryptography and key custody

Each archive has a fresh 256-bit random AES-GCM data key, 96-bit random nonce, and authenticated metadata. The data key is wrapped with a separately owned **RSA-OAEP SHA-256 public key (at least 2048 bits)**. The archive contains only a public recipient key ID, format, algorithm, random archive ID, nonce, wrapped key and authenticated ciphertext. Player identifier, save documents, history and timestamps are inside ciphertext. Any header/ciphertext tampering, wrong private key or unexpected format is rejected. The random data key is cleared from its temporary byte buffer in a `finally` block.

Recipient private key generation, offline custody, independent storage and recoverability must be established outside ChatGPT before any real backup. Neither generating keys in a Worker nor storing a private recovery key next to Cloudflare is an acceptable independence demonstration. Rotate keys by issuing new backups with the new recipient public key while retaining the older offline private keys for older encrypted archives. This is a confidentiality and integrity mechanism; it does not replace secure key storage, access control, backup retention or recovery operations.

## Synthetic verification

The standalone test suite `tests/legacy-backup-vault.test.mjs` generates ephemeral RSA keypairs and uses in-memory SQLite with the same two-tables-and-history layout. It verifies:

- Encrypted archive contains neither the fixed player key nor synthetic progress plaintext; correct offline private key decrypts accurately.
- Wrong key, altered ciphertext, nonce, header or malformed envelope are refused.
- Exact original save/history revisions, data bytes and timestamps restore into marked empty disposable targets.
- A populated target, missing marker, missing explicit restore flag, mismatched player key, malformed source or oversized record are refused without replacement.
- An injected history insert failure rolls back the earlier save insert in the same transaction.
- A second player's rows do not enter the fixed-key archive; backup creation requires explicit authorization.
- Static Worker builder excludes this entire feature.

Run `node --test tests/legacy-backup-vault.test.mjs` and the existing recovery suites on Node 22. These tests exercise local Web Crypto and SQLite; they do **not** demonstrate a real Cloudflare D1 export or restore.

## Outstanding production release gates

1. Obtain owner-approved offline RSA recovery key custody **without exposing private keys to this workspace**. Verify the intended owner can decrypt a synthetic sample on an independently controlled device.
2. Provision an approved encrypted backup destination with retention, restoration access controls and independent ownership. Do not store plaintext SQL backups in R2 or GitHub. Define cadence and deletion policy.
3. Test encrypted export and restore on a truly disposable **Cloudflare D1** copy with synthetic records and verify restoration after an intentional history failure. Review D1 `batch()` limits for real row counts; the source refuses oversized backups rather than truncating.
4. Perform authorized export of real production data **in its controlled runtime** only, encrypt before data leaves the runtime, then restore into a separate approved private target and prove identical row/schema counts without logging or copying private data into ChatGPT.
5. Remember that this adapter backs up only the existing *per-player save and history rows*. It is **not a complete SQL dump or schema migration**. A separately verified whole-database archive is still required before overwriting or migrating the live Worker.
6. Confirm real signed Cloudflare Access owner/admin roles, full production source parity, licensing provenance, iPhone/PWA acceptance and approved rollback ownership. Neither PR #8 nor PR #9 is permitted to deploy over the current live Worker until these gates pass.

Cloudflare documents D1 export and external backup workflows: https://developers.cloudflare.com/workflows/examples/backup-d1/ . That example stores an SQL dump in R2; **do not copy its plaintext upload step into this private game**. This module instead supplies encrypted *player-record* archives that can be used as part of a broader recovery strategy, not as a substitute for full D1 export.

Never add the disposable-restore marker to the production D1 database. No production D1 records were read, exported or modified in this implementation.
