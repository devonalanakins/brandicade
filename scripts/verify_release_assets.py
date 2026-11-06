#!/usr/bin/env python3
"""Verify exact Brandicade static source-to-Worker asset parity.

This creates a deterministic, content-addressed *frontend-only* manifest. It
cannot attest to Cloudflare Access, cloud saves, or the live deployed Worker.
"""
import argparse
import base64
import binascii
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

START = 'const FILES = '
END = ';\nconst SEC = '


def read_asset_table(worker_source: str):
    """Fail closed on missing, duplicate, or ambiguous static Worker tables."""
    if worker_source.count(START) != 1 or worker_source.count(END) != 1:
        raise ValueError('Standalone static Worker asset boundary is ambiguous')
    raw = worker_source.split(START, 1)[1].split(END, 1)[0]
    try:
        entries = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError('Standalone Worker asset table is not JSON') from exc
    if not isinstance(entries, dict):
        raise ValueError('Standalone Worker asset table is not an object')
    return entries


def asset_manifest(entries, assets, root):
    """Compare deployed bytes, route identities and MIME types to repo files."""
    if set(entries) != set(assets):
        missing = sorted(set(assets) - set(entries))
        extra = sorted(set(entries) - set(assets))
        raise ValueError(f'Asset routes diverged: missing={missing}; extra={extra}')
    results = []
    for route in sorted(assets):
        file_path, mime = assets[route]
        entry = entries[route]
        if not isinstance(entry, dict) or set(entry) != {'m', 'g', 'b'}:
            raise ValueError(f'Invalid static payload structure: {route}')
        if entry['m'] != mime or entry['g'] not in (0, 1) or type(entry['g']) is not int:
            raise ValueError(f'Invalid static MIME or gzip flag: {route}')
        try:
            payload = base64.b64decode(entry['b'], validate=True)
            decoded = gzip.decompress(payload) if entry['g'] else payload
        except (TypeError, ValueError, binascii.Error, OSError, EOFError) as exc:
            raise ValueError(f'Unable to decode static asset: {route}') from exc
        source = (Path(root) / file_path).read_bytes()
        if decoded != source:
            raise ValueError(f'Static Worker bytes do not match repository: {route}')
        results.append({
            'route': route,
            'source': file_path,
            'mime': mime,
            'size_bytes': len(source),
            'sha256': hashlib.sha256(source).hexdigest(),
        })
    receipt = {'schema': 1, 'scope': 'static-frontend-only', 'route_count': len(results), 'assets': results}
    canonical = json.dumps(receipt, sort_keys=True, separators=(',', ':')).encode('utf-8')
    receipt['manifest_sha256'] = hashlib.sha256(canonical).hexdigest()
    return receipt


def verify(root=ROOT, output=None):
    from build_worker import ASSETS
    root = Path(root)
    entries = read_asset_table((root / 'dist/brandicade.worker.js').read_text(encoding='utf-8'))
    receipt = asset_manifest(entries, ASSETS, root)
    if output is not None:
        destination = Path(output)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(ROOT / 'dist/brandicade-release-assets.json'))
    args = parser.parse_args()
    receipt = verify(output=args.output)
    print(f"VERIFIED frontend source parity: {receipt['route_count']} routes; manifest sha256 {receipt['manifest_sha256']}")
    print('NOT VERIFIED: private Worker backend, Cloudflare Access/D1, owner device, or production deployment')


if __name__ == '__main__':
    main()
