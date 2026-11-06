#!/usr/bin/env python3
"""Prepare, but never deploy, an asset-only Brandicade Worker upgrade.

Reads the two private Cloudflare Worker module readbacks offline. Copies only
verified staging static assets into the exact production Worker runtime. It
preserves production Access audience, allowlist, signed API and save code.

Private Worker inputs and resulting module must never be committed to GitHub.
No network calls, no D1 operations, no live API writes, and no deployment.
"""
import argparse
import hashlib
import json
import os
import re
import stat
from pathlib import Path

from save_contract_parity import require_save_contract_parity

ROOT = Path(__file__).resolve().parent.parent
ASSET_START = b'const FILES = '
ASSET_END = b';\nconst SEC = '
AUTH = re.compile(
    rb"const BRANDICADE_AUTH = \{aud:'([^']+)',issuer:'([^']+)',"
    rb"player:'([^']+)',admin:'([^']+)'\};"
)
SHA256 = re.compile(r'[0-9a-f]{64}\Z')
GUID = re.compile(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\Z')


class ReleaseGuardError(ValueError):
    """Release precondition failed. No private Worker code was written."""


def digest(data):
    return hashlib.sha256(data).hexdigest()


def _distinct_json(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ReleaseGuardError('Duplicate release receipt field')
        result[key] = value
    return result


def load_receipt(path):
    data = json.loads(Path(path).read_text('utf-8'), object_pairs_hook=_distinct_json)
    if not isinstance(data, dict) or set(data) != {
        'schema', 'scope', 'production', 'preview', 'candidate_sha256'
    } or type(data['schema']) is not int or data['schema'] != 1 or data['scope'] != 'asset-only-worker-cutover-preflight':
        raise ReleaseGuardError('Unsupported release receipt')
    required = {'script', 'deployment_id', 'version_id', 'module_sha256', 'asset_table_sha256'}
    for name, expected_script in (
        ('production', 'brandicade'),
        ('preview', 'brandicade-prism-preview-20261103'),
    ):
        entry = data[name]
        if not isinstance(entry, dict) or set(entry) != required or entry['script'] != expected_script:
            raise ReleaseGuardError('Release receipt Worker identity mismatch')
        for key in ('deployment_id', 'version_id'):
            if not isinstance(entry[key], str) or not GUID.fullmatch(entry[key]):
                raise ReleaseGuardError('Invalid deployment identifier')
        for key in ('module_sha256', 'asset_table_sha256'):
            if not isinstance(entry[key], str) or not SHA256.fullmatch(entry[key]):
                raise ReleaseGuardError('Invalid receipt digest')
    if not isinstance(data['candidate_sha256'], str) or not SHA256.fullmatch(data['candidate_sha256']):
        raise ReleaseGuardError('Invalid proposed module digest')
    if data['production']['version_id'] == data['preview']['version_id']:
        raise ReleaseGuardError('Production and staging version unexpectedly identical')
    return data


def extract_module(payload):
    """Accept pure Worker JS or one strict Cloudflare content/v2 multipart part."""
    if payload.startswith(b'--'):
        header_line, sep, rest = payload.partition(b'\r\n')
        if not sep or not re.fullmatch(rb'--[A-Za-z0-9_.-]{8,160}', header_line):
            raise ReleaseGuardError('Malformed Worker multipart boundary')
        headers, sep, body = rest.partition(b'\r\n\r\n')
        if not sep or b'Content-Disposition: form-data; name="worker.js"; filename="worker.js"' not in headers:
            raise ReleaseGuardError('Unexpected multipart module identity')
        if b'Content-Type: application/javascript+module' not in headers:
            raise ReleaseGuardError('Unexpected Worker module MIME')
        ending = b'\r\n' + header_line + b'--'
        if body.endswith(ending + b'\r\n'):
            body = body[: -len(ending) - 2]
        elif body.endswith(ending):
            body = body[:-len(ending)]
        else:
            raise ReleaseGuardError('Multipart contains additional content or is truncated')
        payload = body
    if not payload.startswith(b'/* BRANDICADE'):
        raise ReleaseGuardError('Unexpected Worker source header')
    return payload


def split_worker(module):
    if module.count(ASSET_START) != 1 or module.count(ASSET_END) != 1:
        raise ReleaseGuardError('Static asset boundary missing or ambiguous')
    start = module.index(ASSET_START) + len(ASSET_START)
    end = module.index(ASSET_END)
    if end <= start or not module[start:end].startswith(b'{') or not module[start:end].rstrip().endswith(b'}'):
        raise ReleaseGuardError('Invalid static asset block')
    return module[:start], module[start:end], module[end:]


def _auth(suffix):
    matches = list(AUTH.finditer(suffix))
    if len(matches) != 1:
        raise ReleaseGuardError('Unexpected Access configuration boundary')
    return matches[0]


def compose(production_payload, preview_payload, receipt):
    production = extract_module(production_payload)
    preview = extract_module(preview_payload)
    if digest(production) != receipt['production']['module_sha256']:
        raise ReleaseGuardError('Production Worker changed since pinned readback')
    if digest(preview) != receipt['preview']['module_sha256']:
        raise ReleaseGuardError('Preview Worker changed since pinned readback')
    a_prefix, a_assets, a_suffix = split_worker(production)
    b_prefix, b_assets, b_suffix = split_worker(preview)
    if digest(a_assets) != receipt['production']['asset_table_sha256']:
        raise ReleaseGuardError('Production asset table differs from pinned readback')
    if digest(b_assets) != receipt['preview']['asset_table_sha256']:
        raise ReleaseGuardError('Preview asset table differs from pinned readback')
    if a_prefix != b_prefix:
        raise ReleaseGuardError('Worker code before assets differs')
    a, b = _auth(a_suffix), _auth(b_suffix)
    if a.groups()[1:] != b.groups()[1:]:
        raise ReleaseGuardError('Issuer or allowlisted identities differ')
    if a.group(1) == b.group(1):
        raise ReleaseGuardError('Production and preview audiences must differ')
    # Reject *any* server difference besides the expected audience; never
    # trust the newer staging backend to replace production security logic.
    stable_prod = a_suffix[:a.start(1)] + b'<AUDIENCE>' + a_suffix[a.end(1):]
    stable_preview = b_suffix[:b.start(1)] + b'<AUDIENCE>' + b_suffix[b.end(1):]
    if stable_prod != stable_preview:
        raise ReleaseGuardError('Signed backend or API code differs')
    if a_assets == b_assets:
        raise ReleaseGuardError('No frontend upgrade to prepare')
    candidate = a_prefix + b_assets + a_suffix
    if digest(candidate) != receipt['candidate_sha256']:
        raise ReleaseGuardError('Proposed Worker digest differs from reviewed projection')
    if split_worker(candidate)[2] != a_suffix or split_worker(candidate)[0] != a_prefix:
        raise ReleaseGuardError('Non-asset production runtime changed')
    return candidate


def private_write(path, candidate, root=ROOT):
    # Generated live code embeds Access configuration. Output only in an ignored,
    # private work directory, reject symlinks, and refuse to overwrite files.
    safe = (Path(root) / 'dist' / 'private').resolve()
    destination = Path(path).resolve()
    if not destination.is_relative_to(safe) or destination == safe:
        raise ReleaseGuardError('Candidate output must be inside dist/private/')
    safe.mkdir(parents=True, mode=0o700, exist_ok=True)
    if stat.S_IMODE(safe.stat().st_mode) & 0o077:
        raise ReleaseGuardError('Private output directory is accessible to other users')
    destination.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    if stat.S_IMODE(destination.parent.stat().st_mode) & 0o077:
        raise ReleaseGuardError('Output subdirectory is not private')
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(destination, flags, 0o600)
    except FileExistsError as exc:
        raise ReleaseGuardError('Candidate already exists; refusing overwrite') from exc
    with os.fdopen(fd, 'wb') as file:
        file.write(candidate)
    if stat.S_IMODE(destination.stat().st_mode) != 0o600:
        raise ReleaseGuardError('Unexpected candidate permissions')
    return destination


def verify_save_contract_before_release(production_payload, preview_payload, pinned_hashes=None):
    """Fail closed if any pinned game-progress module differs before candidate export.

    Operates only on the static asset table. It cannot inspect local Safari saves
    or prove an independent backup/restore occurred.
    """
    prod_table = split_worker(extract_module(production_payload))[1]
    stage_table = split_worker(extract_module(preview_payload))[1]
    return require_save_contract_parity(prod_table, stage_table, pinned_hashes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--production', type=Path, required=True,
                        help='Owner-private production content/v2 module response')
    parser.add_argument('--preview', type=Path, required=True,
                        help='Owner-private preview content/v2 module response')
    parser.add_argument('--receipt', type=Path, required=True,
                        help='Reviewed hash-only pinned provider readback receipt')
    parser.add_argument('--write-candidate', type=Path,
                        help='Optional private output within ignored dist/private/; never deploys')
    args = parser.parse_args()
    receipt = load_receipt(args.receipt)
    production_payload = args.production.read_bytes()
    preview_payload = args.preview.read_bytes()
    candidate = compose(production_payload, preview_payload, receipt)
    save_parity = verify_save_contract_before_release(production_payload, preview_payload)
    if args.write_candidate:
        private_write(args.write_candidate, candidate)
    print('VERIFIED asset-only cutover projection:', digest(candidate))
    print('VERIFIED pinned static save-contract assets:', save_parity['verified_save_contract_routes'])
    print('Production Access audience, player/admin mapping and backend retained byte-for-byte')
    print('NOT VERIFIED: owner device backup, live login, DNS, restore, production deployment')
    print('NO NETWORK OR PRODUCTION WRITE PERFORMED')


if __name__ == '__main__':
    main()
