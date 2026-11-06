# Brandicade — asset-only production crossover preflight

**Date:** November 6, 2026  
**Status:** implementation and synthetic checks only; **NOT deployed**  
**Intended production:** `brandicade.anevum.com` / Worker `brandicade`  
**Temporary preview:** `prism.anevum.com` / Worker `brandicade-prism-preview-20261103`

## Observed provider comparison

The two Cloudflare `content/v2` script readbacks were compared inside the authenticated provider environment without returning plaintext audiences, allowlisted identities, or source code. After removing only the static asset-table bytes and normalizing the single embedded Access audience identifier, the remaining Worker runtime source was identical byte-for-byte. The preamble, Access issuer, player/admin mapping, signed JWT/API logic, and D1 handling were unchanged. Each Access audience matches its own corresponding application. Both Worker deployments and production D1 were left untouched.

| Input | Production | Preview |
| --- | --- | --- |
| Worker script | `brandicade` | `brandicade-prism-preview-20261103` |
| Deployment ID | `49b2368d-4a9f-40a0-94f5-b3cc627827cc` | `8e1ec85d-d64e-41ac-b9da-7b3149d645e3` |
| Version ID | `9b88b22c-d740-4e8f-b35a-5178a627a8e2` | `0e57ae55-d3ab-4157-a4c8-ebdb11f9da89` |
| Worker module SHA-256, excluding multipart wrapper | `8a8efdc84fdea8fb581f06cfb49d5f5abd2032a6fff0aee1e0fc1661a782adc5` | `0968308e28ebcb19972f1f3117b4be8ffb4f9d573779a8ee5cea86d3063e4667` |
| Static asset-table SHA-256 | `b1dc33764afcd182a12e39fd746586cef37721d9b994f58d7078217aad6eff5c` | `af364454dd20ee140152d92d7613c1175fe4ce60f601992c06acdaa3b829e44c` |

**Projected candidate SHA-256:** `716792c8f3937096d769af305e9e17ad41e1f0908e8f374c562b7c5f8763c90a`. Computed by retaining the exact **production** Worker before/after its static asset table and substituting only the current **preview** asset table, on the readbacks above. This is a projection, not a deployed version or signed-in acceptance result.

## Tooling

`python3 scripts/prepare_frontend_only_cutover.py` is a fully offline and fail-closed developer tool. It validates pinned module and asset table digests, a unique static-table boundary, a unique expected Access configuration, exact issuer/identity equality, distinct Access audiences, unchanged backend bytecode, and an exact projected candidate digest. It never prints sensitive audiences, allowlists or module text, connects to Cloudflare, accesses private player records, or deploys a Worker.

Only when deliberately instructed, it can write a candidate under ignored `dist/private/` using owner-only directory/file permissions (`0700` / `0600`) and exclusive no-overwrite creation. Do **not** put raw `content/v2` files, local candidate, Access data, or actual game saves in the repository, artifact uploads, or chat. No private source is required or used in GitHub CI.

Synthetic tests:

```sh
python3 -m unittest discover -s tests -p 'test_frontend_only_cutover.py' -v
python3 -m py_compile scripts/prepare_frontend_only_cutover.py
```

Owner-private invocation **after** independently rechecking current Cloudflare deployment IDs, without transferring private Worker source outside the trusted environment:

```sh
python3 scripts/prepare_frontend_only_cutover.py \
  --production /absolute/private/path/production-content-v2 \
  --preview /absolute/private/path/preview-content-v2 \
  --receipt docs/receipts/brandicade-2026-11-06-cutover-projection.json
# Optional, only after all required release gates and approval:
#   --write-candidate dist/private/brandicade-assets-only.worker.js
```

The historical, hash-only receipt documents this particular November 6 readback and **must be re-pinned** if either Worker deployment changes. `scripts/prepare_frontend_only_cutover.py` never proves the current provider version remains the same; that requires a fresh provider API check.

## Explicit release gates — still OPEN

1. Preserve and verify Brandi's original iPhone-local Glimmer and Prism Garden saves with independent backups. Cloud D1 aggregate counts of zero are not evidence of an empty iPhone.
2. Verify the authorized player and denied-user Cloudflare Access flows on a real browser; prove real saved-game API behavior and recovery on isolated data. The existing legacy live D1 writer is not the new candidate's atomic writer.
3. Perform actual iPhone Safari landscape/portrait/PWA and paired physical Xbox controller testing (disconnect, pause and resume included).
4. Reconcile the inherited MIT/GPLv3 source/header discrepancy and confirm release rights.
5. Recheck exact production and preview active version IDs, locked original deployment and rollback method. Identify an approved operator and explicitly authorize the eventual live release. Validate that Worker upload retains the production Access application, production `SAVES` D1, routes, bindings and credentials unchanged.
6. Only after a new Worker is deployed and **signed-in production gameplay** is verified may the separate `prism.anevum.com` hostname/DNS/Access resources be retired, with a separate explicit cleanup gate.

**State:** VERIFIED (read-only backend parity and source/staging static receipt); IMPLEMENTED (safe offline cutover guard); **RELEASE NO-GO** (real device, save, authorization, licensing and rollback acceptance incomplete). This change must not be represented as an active production upgrade.
