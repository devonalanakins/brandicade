#!/usr/bin/env python3
"""Verify an offline, asset-only Cloudflare staging readback against pinned source.

This cannot authenticate the readback, contact Cloudflare, attest to the API or
Access configuration, or authorize a production deployment. Capture the digest
receipt using a trusted provider readback and pin its deployment/version ID.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

SOURCE_SCOPE = 'static-frontend-only'
STAGING_SCOPE = 'staging-static-assets-only'
STAGING_HOST = 'prism.anevum.com'
STAGING_SCRIPT = 'brandicade-prism-preview-20261103'
BRIDGE_ROUTE = '/src/cloud-sync.mjs'
SW_ROUTE = '/sw.js'
JS_MIME = 'text/javascript; charset=utf-8'
SOURCE_CACHE = "const CACHE='brandicade-glimmer-cascade-v8'"
STAGING_CACHE = "const CACHE='brandicade-glimmer-cascade-cloud-bridge-v8'"
SOURCE_ASSETS = 'const ASSETS=['
STAGING_ASSETS = "const ASSETS=['/src/cloud-sync.mjs',"
HASH_RE = re.compile(r'[0-9a-f]{64}\Z')
GUID_RE = re.compile(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\Z')


class AttestationError(ValueError):
    """Source and staging receipts are incompatible or untrusted in shape."""


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def load_json(path):
    def distinct(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise AttestationError('Duplicate JSON key: ' + key)
            result[key] = value
        return result
    return json.loads(Path(path).read_text('utf-8'), object_pairs_hook=distinct)


def check_assets(data, expected_keys, kind):
    entries = data.get('assets')
    if not isinstance(entries, list) or not entries:
        raise AttestationError(kind + ' requires nonempty assets')
    index = {}
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != expected_keys:
            raise AttestationError(kind + ' asset schema mismatch')
        route = entry['route']
        if (not isinstance(route, str) or not route.startswith('/')
                or any(x in route for x in ('..', '?', '#', '\\'))):
            raise AttestationError(kind + ' route invalid')
        if route in index:
            raise AttestationError(kind + ' duplicate route: ' + route)
        if not isinstance(entry['mime'], str) or not entry['mime']:
            raise AttestationError(kind + ' MIME invalid: ' + route)
        if type(entry['size_bytes']) is not int or entry['size_bytes'] < 0:
            raise AttestationError(kind + ' size invalid: ' + route)
        if not isinstance(entry['sha256'], str) or not HASH_RE.fullmatch(entry['sha256']):
            raise AttestationError(kind + ' sha256 invalid: ' + route)
        index[route] = entry
    if [x['route'] for x in entries] != sorted(index):
        raise AttestationError(kind + ' routes not canonically sorted')
    return index


def source_index(source):
    if not isinstance(source, dict) or source.get('schema') != 1 or source.get('scope') != SOURCE_SCOPE:
        raise AttestationError('Invalid source manifest schema/scope')
    data = check_assets(source, {'route', 'source', 'mime', 'size_bytes', 'sha256'}, 'source')
    if source.get('route_count') != len(data):
        raise AttestationError('Source route count mismatch')
    for a in data.values():
        if not isinstance(a['source'], str) or a['source'].startswith('/') or '..' in Path(a['source']).parts:
            raise AttestationError('Invalid source file path: ' + a['route'])
    body = {k: v for k, v in source.items() if k != 'manifest_sha256'}
    canonical = json.dumps(body, sort_keys=True, separators=(',', ':')).encode('utf-8')
    if source.get('manifest_sha256') != sha256(canonical):
        raise AttestationError('Source manifest SHA-256 mismatch')
    return data


def observed_index(observed, expected_version=None):
    if not isinstance(observed, dict) or observed.get('schema') != 1 or observed.get('scope') != STAGING_SCOPE:
        raise AttestationError('Invalid staging receipt schema/scope')
    if observed.get('hostname') != STAGING_HOST or observed.get('script') != STAGING_SCRIPT:
        raise AttestationError('Unexpected staging host or Worker script')
    for key in ('deployment_id', 'version_id'):
        v = observed.get(key)
        if not isinstance(v, str) or not GUID_RE.fullmatch(v):
            raise AttestationError('Invalid staging ' + key)
    if expected_version is not None and observed['version_id'] != expected_version:
        raise AttestationError('Staging version differs from pinned deployment')
    index = check_assets(observed, {'route', 'mime', 'size_bytes', 'sha256'}, 'staging')
    if observed.get('asset_count') != len(index):
        raise AttestationError('Staging asset count mismatch')
    return index


def attestation(source, observed, sw_bytes, cloud_sync_bytes, expected_version=None):
    """Require all regular routes, the *exact* SW rewrite and one cloud bridge."""
    standard = source_index(source)
    deployed = observed_index(observed, expected_version)
    expected_routes = set(standard) | {BRIDGE_ROUTE}
    if set(deployed) != expected_routes:
        raise AttestationError('Staging route set mismatch: missing=' + str(sorted(expected_routes - set(deployed)))
                               + ', unexpected=' + str(sorted(set(deployed) - expected_routes)))
    if BRIDGE_ROUTE in standard or SW_ROUTE not in standard:
        raise AttestationError('Source route ownership changed')
    if sha256(sw_bytes) != standard[SW_ROUTE]['sha256'] or len(sw_bytes) != standard[SW_ROUTE]['size_bytes']:
        raise AttestationError('Local service worker does not match pinned source receipt')
    try:
        sw_source = sw_bytes.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise AttestationError('Service worker is not UTF-8') from exc
    if sw_source.count(SOURCE_CACHE) != 1 or sw_source.count(SOURCE_ASSETS) != 1:
        raise AttestationError('Service worker bridge rewrite boundary changed')
    injected = sw_source.replace(SOURCE_CACHE, STAGING_CACHE).replace(SOURCE_ASSETS, STAGING_ASSETS)
    expected_sw = injected.encode('utf-8')
    matched = []
    for route, item in standard.items():
        test = deployed[route]
        if test['mime'] != item['mime']:
            raise AttestationError('MIME mismatch: ' + route)
        digest = sha256(expected_sw) if route == SW_ROUTE else item['sha256']
        size = len(expected_sw) if route == SW_ROUTE else item['size_bytes']
        if test['sha256'] != digest or test['size_bytes'] != size:
            raise AttestationError('Asset byte mismatch: ' + route)
        matched.append(route)
    bridge = deployed[BRIDGE_ROUTE]
    if (bridge['mime'] != JS_MIME or bridge['sha256'] != sha256(cloud_sync_bytes)
            or bridge['size_bytes'] != len(cloud_sync_bytes)):
        raise AttestationError('Injected cloud-sync module does not match source bytes')
    return {
        'scope': 'pinned-staging-frontend-parity-only',
        'source_manifest_sha256': source['manifest_sha256'],
        'staging_deployment_id': observed['deployment_id'],
        'staging_version_id': observed['version_id'],
        'verified_asset_count': len(matched) + 1,
        'unchanged_source_routes': len(matched) - 1,
        'deterministic_service_worker_rewrites': 1,
        'first_party_cloud_bridge_routes': 1,
        'live_authentication_verified': False,
        'backend_parity_verified': False,
        'production_deployment_verified': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--observed', type=Path, required=True)
    parser.add_argument('--service-worker', type=Path, required=True)
    parser.add_argument('--cloud-sync', type=Path, required=True)
    parser.add_argument('--expected-version', required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = attestation(load_json(args.source), load_json(args.observed),
                         args.service_worker.read_bytes(), args.cloud_sync.read_bytes(),
                         expected_version=args.expected_version)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', 'utf-8')
    print('VERIFIED PINNED STAGING FRONTEND:', result['verified_asset_count'], 'assets, deployment',
          result['staging_deployment_id'], 'version', result['staging_version_id'])
    print('NOT VERIFIED: evidence provenance/freshness, signed-in Cloudflare Access, save API, device, production')


if __name__ == '__main__':
    main()
