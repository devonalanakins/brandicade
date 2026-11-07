"""Synthetic source-exact staging preflight tests; no Cloudflare or player data."""
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from prepare_frontend_only_cutover import ReleaseGuardError, digest, split_worker
from prepare_current_preview import (
    encode_asset, preview_sw_bytes, build_preview_asset_table,
    prepare_current_preview, SOURCE_SW_CACHE, PREVIEW_SW_CACHE,
)


class PreviewSourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'src').mkdir()
        self.files = {
            'index.html': b'<html>New v10 arcade backup verifier</html>',
            'src/progression.mjs': b'/* unchanged progression */\nexport const schema=1;\n',
            'src/backup-file-check.mjs': b'export const checkBackup = () => true;\n',
            'src/cloud-sync.mjs': b'/* Brandicade cloud-save bridge first-party */\nexport const safe=true;\n',
            'sw.js': (SOURCE_SW_CACHE + b';\n' +
                      b"const ASSETS=['/','/src/progression.mjs'];\n"),
        }
        for path, source in self.files.items():
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(source)
        self.mapping = {
            '/index.html': ('index.html', 'text/html; charset=utf-8'),
            '/src/progression.mjs': ('src/progression.mjs', 'text/javascript; charset=utf-8'),
            '/src/backup-file-check.mjs': ('src/backup-file-check.mjs', 'text/javascript; charset=utf-8'),
            '/sw.js': ('sw.js', 'text/javascript; charset=utf-8'),
        }
        self.static_assets = {
            route: encode_asset(self.files[path], mime)
            for route, (path, mime) in self.mapping.items()
        }
        self.source_worker = self.worker(self.static_assets, b'production')
        self.old_assets = {
            '/index.html': encode_asset(b'<html>Old v9 arcade</html>', 'text/html; charset=utf-8'),
            '/src/progression.mjs': self.static_assets['/src/progression.mjs'],
            '/sw.js': encode_asset(b"const CACHE='brandicade-glimmer-cascade-v9';\nconst ASSETS=[];\n", 'text/javascript; charset=utf-8'),
            '/src/cloud-sync.mjs': encode_asset(self.files['src/cloud-sync.mjs'], 'text/javascript; charset=utf-8'),
        }
        self.prod_assets = copy.deepcopy(self.old_assets)
        self.prod_assets['/index.html'] = encode_asset(
            b'<html>Older production interface</html>', 'text/html; charset=utf-8'
        )
        self.prod = self.worker(self.prod_assets, b'production')
        self.preview = self.worker(self.old_assets, b'preview')
        self.receipt = self.pinned_receipt(self.prod, self.preview)
        self.pins = {
            route: hashlib.sha256(json.dumps(self.old_assets[route], separators=(',', ':')).encode()).hexdigest()
            for route in ('/src/progression.mjs', '/src/cloud-sync.mjs')
        }

    def worker(self, entries, audience, trailer=b''):
        return (b'/* BRANDICADE synthetic */\nconst FILES = ' +
                json.dumps(entries, separators=(',', ':')).encode() +
                b";\nconst SEC = {};\nconst BRANDICADE_AUTH = {aud:'" + audience +
                b"',issuer:'https://access.example.invalid',player:'player@example.invalid',admin:'admin@example.invalid'};\n" +
                b'export default { fetch() { return new Response("ok"); } };\n' + trailer)

    def pinned_receipt(self, prod, stage):
        a = split_worker(prod)[1]
        b = split_worker(stage)[1]
        pfix, _, suffix = split_worker(prod)
        return {
            'schema': 1, 'scope': 'asset-only-worker-cutover-preflight',
            'production': {'script': 'brandicade', 'deployment_id': '11111111-1111-1111-1111-111111111111',
                           'version_id': '22222222-2222-2222-2222-222222222222',
                           'module_sha256': digest(prod), 'asset_table_sha256': digest(a)},
            'preview': {'script': 'brandicade-prism-preview-20261103',
                        'deployment_id': '33333333-3333-3333-3333-333333333333',
                        'version_id': '44444444-4444-4444-4444-444444444444',
                        'module_sha256': digest(stage), 'asset_table_sha256': digest(b)},
            'candidate_sha256': digest(pfix+b+suffix),
        }

    def prepare(self, **changes):
        config = dict(production_payload=self.prod, preview_payload=self.preview,
                      old_receipt=self.receipt, static_worker_payload=self.source_worker,
                      root=self.root, assets=self.mapping, save_pins=self.pins)
        config.update(changes)
        return prepare_current_preview(**config)

    def test_new_preview_contains_latest_backup_verifier_and_original_backend(self):
        candidate, receipt = self.prepare()
        prefix, table, suffix = split_worker(candidate)
        old_prefix, _, old_suffix = split_worker(self.preview)
        self.assertEqual((prefix, suffix), (old_prefix, old_suffix))
        entries = json.loads(table)
        self.assertEqual(set(entries), set(self.mapping)|{'/src/cloud-sync.mjs'})
        self.assertEqual(entries['/src/cloud-sync.mjs'], self.old_assets['/src/cloud-sync.mjs'])
        self.assertEqual(entries['/src/progression.mjs'], self.old_assets['/src/progression.mjs'])
        self.assertEqual(receipt['source_route_count'], len(self.mapping))
        self.assertEqual(receipt['staged_route_count'], len(self.mapping)+1)
        self.assertEqual(receipt['preview_candidate_sha256'], digest(candidate))
        self.assertEqual(receipt['scope'], 'source-exact-private-staging-preflight-only')
        self.assertFalse(receipt['deployed'])
        self.assertFalse(receipt['signed_login_verified'])

    def test_staged_sw_is_exact_expected_bridge_rewrite(self):
        stage_assets = json.loads(split_worker(self.prepare()[0])[1])
        encoded = stage_assets['/sw.js']
        import base64, gzip
        blob = base64.b64decode(encoded['b'], validate=True)
        data = gzip.decompress(blob) if encoded['g'] else blob
        self.assertIn(PREVIEW_SW_CACHE, data)
        self.assertIn(b"const ASSETS=['/src/cloud-sync.mjs',", data)
        self.assertNotIn(SOURCE_SW_CACHE, data)
        self.assertEqual(data, preview_sw_bytes(self.files['sw.js']))

    def test_exact_same_source_is_deterministic(self):
        first, a = self.prepare()
        second, b = self.prepare()
        self.assertEqual(first, second)
        self.assertEqual(a, b)

    def test_changed_preview_runtime_denied_even_if_readback_receipt_re_pinned(self):
        stage = self.preview + b'/* unexpected server change */'
        receipt = self.pinned_receipt(self.prod, stage)
        with self.assertRaisesRegex(ReleaseGuardError, 'backend|API|code'):
            self.prepare(preview_payload=stage, old_receipt=receipt)

    def test_changing_input_without_repinning_is_denied(self):
        with self.assertRaisesRegex(ReleaseGuardError, 'Preview Worker changed'):
            self.prepare(preview_payload=self.preview+b' ')
        with self.assertRaisesRegex(ReleaseGuardError, 'Production Worker changed'):
            self.prepare(production_payload=self.prod+b' ')

    def test_stale_source_service_worker_cache_fails_closed(self):
        (self.root/'sw.js').write_bytes(self.files['sw.js'].replace(b'v10', b'v9'))
        entries = copy.deepcopy(self.static_assets)
        entries['/sw.js'] = encode_asset((self.root/'sw.js').read_bytes(), 'text/javascript; charset=utf-8')
        with self.assertRaisesRegex(ReleaseGuardError, 'service worker cache'):
            self.prepare(static_worker_payload=self.worker(entries, b'production'))

    def test_stale_source_artifact_missing_backup_verifier_fails(self):
        stale = copy.deepcopy(self.static_assets)
        stale.pop('/src/backup-file-check.mjs')
        with self.assertRaisesRegex(ReleaseGuardError, 'source mismatch'):
            self.prepare(static_worker_payload=self.worker(stale, b'production'))

    def test_unexpected_source_cloud_bridge_is_refused(self):
        (self.root/'src/cloud-sync.mjs').write_bytes(b'unknown third-party script')
        with self.assertRaisesRegex(ReleaseGuardError, 'cloud bridge source'):
            self.prepare()

    def test_save_critical_drift_denied_even_if_all_other_checks_pass(self):
        self.files['src/progression.mjs'] = b'export const schema=2;'
        (self.root/'src/progression.mjs').write_bytes(self.files['src/progression.mjs'])
        updated = copy.deepcopy(self.static_assets)
        updated['/src/progression.mjs'] = encode_asset(self.files['src/progression.mjs'], 'text/javascript; charset=utf-8')
        with self.assertRaisesRegex(ValueError, '[Ss]ave-contract module changed'):
            self.prepare(static_worker_payload=self.worker(updated, b'production'))

    def test_asset_tampering_after_build_rejected(self):
        (self.root/'index.html').write_bytes(b'<html>changed after build</html>')
        with self.assertRaisesRegex(ReleaseGuardError, 'Static source mismatch'):
            self.prepare()

    def test_missing_source_bridge_rejected_before_write(self):
        (self.root/'src/cloud-sync.mjs').unlink()
        with self.assertRaisesRegex(ReleaseGuardError, 'Missing trusted source file'):
            self.prepare()

    def test_output_path_does_not_get_created_by_preflight(self):
        self.prepare()
        self.assertFalse((self.root/'dist').exists())


if __name__ == '__main__':
    unittest.main()
