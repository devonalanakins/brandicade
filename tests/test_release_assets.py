"""Synthetic negative checks for the frontend-only release receipt."""
import base64
import gzip
import hashlib
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from verify_release_assets import read_asset_table, asset_manifest


class ReleaseAssetReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'src').mkdir()
        (self.root / 'src/game.mjs').write_bytes(b'export const game = true;\n')
        self.assets = {'/src/game.mjs': ('src/game.mjs', 'text/javascript; charset=utf-8')}
        compressed = gzip.compress((self.root / 'src/game.mjs').read_bytes(), mtime=0)
        self.entries = {'/src/game.mjs': {'m': self.assets['/src/game.mjs'][1], 'g': 1,
                                          'b': base64.b64encode(compressed).decode('ascii')}}

    def test_reproducible_content_addressed_frontend_receipt(self):
        first = asset_manifest(self.entries, self.assets, self.root)
        second = asset_manifest(self.entries, self.assets, self.root)
        self.assertEqual(first, second)
        self.assertEqual(first['scope'], 'static-frontend-only')
        self.assertEqual(first['route_count'], 1)
        self.assertEqual(first['assets'][0]['sha256'], hashlib.sha256(b'export const game = true;\n').hexdigest())
        self.assertEqual(len(first['manifest_sha256']), 64)

    def test_missing_or_extra_route_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Asset routes diverged'):
            asset_manifest({}, self.assets, self.root)
        with self.assertRaisesRegex(ValueError, 'Asset routes diverged'):
            asset_manifest({**self.entries, '/private': self.entries['/src/game.mjs']}, self.assets, self.root)

    def test_modified_payload_is_rejected(self):
        bad = json.loads(json.dumps(self.entries))
        bad['/src/game.mjs']['b'] = base64.b64encode(gzip.compress(b'unsafe')).decode('ascii')
        with self.assertRaisesRegex(ValueError, 'do not match repository'):
            asset_manifest(bad, self.assets, self.root)

    def test_corrupt_base64_or_gzip_is_rejected(self):
        bad = json.loads(json.dumps(self.entries))
        bad['/src/game.mjs']['b'] = '$$invalid%%'
        with self.assertRaisesRegex(ValueError, 'Unable to decode'):
            asset_manifest(bad, self.assets, self.root)
        bad['/src/game.mjs']['b'] = base64.b64encode(b'not-gzip').decode('ascii')
        with self.assertRaisesRegex(ValueError, 'Unable to decode'):
            asset_manifest(bad, self.assets, self.root)

    def test_mime_mismatch_and_invalid_gzip_flag_are_rejected(self):
        for name, value in [('m', 'text/html'), ('g', True), ('g', 2)]:
            with self.subTest(name=name, value=value):
                bad = json.loads(json.dumps(self.entries))
                bad['/src/game.mjs'][name] = value
                with self.assertRaisesRegex(ValueError, 'Invalid static MIME or gzip flag'):
                    asset_manifest(bad, self.assets, self.root)

    def test_ambiguous_or_invalid_worker_boundary_is_rejected(self):
        good = 'const FILES = ' + json.dumps(self.entries) + ';\nconst SEC = {};'
        self.assertEqual(read_asset_table(good), self.entries)
        for bad in ['', good + good, 'const FILES = blah;\nconst SEC = {};']:
            with self.subTest(bad=bad[:15]), self.assertRaises(ValueError):
                read_asset_table(bad)

if __name__ == '__main__':
    unittest.main()
