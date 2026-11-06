#!/usr/bin/env python3
"""Create a source-exact *private* Brandicade staging candidate, never deploy.

The active staging Worker is an immutable readback; this tool changes only its
asset table. The old production and staging module hashes must match a pinned,
provider-observed receipt, and the two backends must differ only in their
existing Access audience. The protected production Worker is never the output.
"""
import argparse
import base64
import gzip
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from prepare_frontend_only_cutover import (
    ReleaseGuardError, compose, digest, extract_module, load_receipt,
    private_write, split_worker,
)
from save_contract_parity import require_save_contract_parity
from verify_release_assets import asset_manifest

SOURCE_SW_CACHE = b"const CACHE='brandicade-glimmer-cascade-v9'"
PREVIEW_SW_CACHE = b"const CACHE='brandicade-glimmer-cascade-cloud-bridge-v9'"
SOURCE_SW_ASSETS = b'const ASSETS=['
PREVIEW_SW_ASSETS = b"const ASSETS=['/src/cloud-sync.mjs',"
BRIDGE_ROUTE = '/src/cloud-sync.mjs'
SW_ROUTE = '/sw.js'
JS_MIME = 'text/javascript; charset=utf-8'


def encode_asset(source, mime):
    if not isinstance(source, bytes) or not isinstance(mime, str):
        raise ReleaseGuardError('Invalid source asset')
    zipped = gzip.compress(source, compresslevel=9, mtime=0)
    use_gzip = len(zipped) < len(source) * .93
    payload = zipped if use_gzip else source
    return {'m': mime, 'g': int(use_gzip), 'b': base64.b64encode(payload).decode('ascii')}


def preview_sw_bytes(source):
    """Apply exactly the old staging cloud-bridge rewrite to the current SW."""
    if source.count(SOURCE_SW_CACHE) != 1 or source.count(SOURCE_SW_ASSETS) != 1:
        raise ReleaseGuardError('Current service worker cache or asset sentinel changed')
    if PREVIEW_SW_CACHE in source or PREVIEW_SW_ASSETS in source:
        raise ReleaseGuardError('Source service worker already contains bridge rewrite')
    return source.replace(SOURCE_SW_CACHE, PREVIEW_SW_CACHE, 1).replace(
        SOURCE_SW_ASSETS, PREVIEW_SW_ASSETS, 1)


def build_preview_asset_table(static_worker_payload, root=ROOT, assets=None):
    """Verify source bytes then build a predictable staged static table."""
    if assets is None:
        from build_worker import ASSETS
        mapping = ASSETS
    else:
        mapping = assets
    root = Path(root)
    _, raw_table, _ = split_worker(extract_module(static_worker_payload))
    try:
        def reject_duplicates(pairs):
            result = {}
            for key, val in pairs:
                if key in result:
                    raise ReleaseGuardError('Duplicate source asset key: ' + key)
                result[key] = val
            return result
        entries = json.loads(raw_table, object_pairs_hook=reject_duplicates)
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError) as exc:
        raise ReleaseGuardError('Generated static asset table is not strict JSON') from exc
    try:
        provenance = asset_manifest(entries, mapping, root)
    except (ValueError, OSError, KeyError) as exc:
        raise ReleaseGuardError('Static source mismatch; refuse staging assembly') from exc
    if SW_ROUTE not in entries or BRIDGE_ROUTE in entries:
        raise ReleaseGuardError('Static source routes changed unexpectedly')
    try:
        current_sw = (root / mapping[SW_ROUTE][0]).read_bytes()
        bridge = (root / 'src/cloud-sync.mjs').read_bytes()
    except (OSError, KeyError) as exc:
        raise ReleaseGuardError('Missing trusted source file') from exc
    if not bridge.startswith(b'/* Brandicade cloud-save bridge'):
        raise ReleaseGuardError('Unexpected first-party cloud bridge source')
    staged = dict(entries)
    staged[SW_ROUTE] = encode_asset(preview_sw_bytes(current_sw), JS_MIME)
    staged[BRIDGE_ROUTE] = encode_asset(bridge, JS_MIME)
    raw = json.dumps(staged, separators=(',', ':'), ensure_ascii=True).encode('ascii')
    return raw, provenance


def prepare_current_preview(production_payload, preview_payload, old_receipt,
                            static_worker_payload, root=ROOT, assets=None,
                            save_pins=None):
    """Validate old deployment, preserve staging runtime and project new assets.

    The optional synthetic mapping/pins exist for tests only. The CLI always
    uses the real, fixed repository mapping and pinned save-contract digests.
    """
    # Validate exact provider readback hashes AND backend identity before
    # generating any staging candidate. Never modify production code.
    compose(production_payload, preview_payload, old_receipt)
    original_preview = extract_module(preview_payload)
    original_prod = extract_module(production_payload)
    preview_prefix, preview_table, preview_suffix = split_worker(original_preview)
    prod_prefix, _, prod_suffix = split_worker(original_prod)
    raw_new, provenance = build_preview_asset_table(static_worker_payload, root, assets)
    require_save_contract_parity(preview_table, raw_new, save_pins)
    candidate = preview_prefix + raw_new + preview_suffix
    proposed_prod = prod_prefix + raw_new + prod_suffix
    if split_worker(candidate)[0] != preview_prefix or split_worker(candidate)[2] != preview_suffix:
        raise ReleaseGuardError('Staging backend changed during asset replacement')
    if split_worker(proposed_prod)[0] != prod_prefix or split_worker(proposed_prod)[2] != prod_suffix:
        raise ReleaseGuardError('Production projection changed protected runtime')
    result = {
        'schema': 1,
        'scope': 'source-exact-private-staging-preflight-only',
        'source_manifest_sha256': provenance['manifest_sha256'],
        'source_route_count': provenance['route_count'],
        'staged_route_count': provenance['route_count'] + 1,
        'old_preview_version_id': old_receipt['preview']['version_id'],
        'preview_candidate_sha256': digest(candidate),
        'future_production_projection_sha256': digest(proposed_prod),
        'signed_login_verified': False,
        'deployed': False,
    }
    return candidate, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--production', type=Path, required=True, help='Private production Worker readback')
    parser.add_argument('--preview', type=Path, required=True, help='Private staging Worker readback')
    parser.add_argument('--receipt', type=Path, required=True, help='Previously pinned hash-only provider receipt')
    parser.add_argument('--static-worker', type=Path, required=True, help='Current verified dist/brandicade.worker.js')
    parser.add_argument('--write-private-preview', type=Path, help='Optional ignored dist/private/ path only, no deployment')
    args = parser.parse_args()
    receipt = load_receipt(args.receipt)
    candidate, result = prepare_current_preview(
        args.production.read_bytes(), args.preview.read_bytes(), receipt,
        args.static_worker.read_bytes(), ROOT,
    )
    if args.write_private_preview:
        private_write(args.write_private_preview, candidate)
    print(json.dumps(result, sort_keys=True, indent=2))
    print('NO NETWORK, OWNER SAVE ACCESS, OR DEPLOYMENT WAS PERFORMED')


if __name__ == '__main__':
    main()
