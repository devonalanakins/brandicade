"""Synthetic, offline release guard tests. Never uses real identities or D1."""
import copy
import hashlib
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from prepare_frontend_only_cutover import (
    ReleaseGuardError, compose, digest, extract_module, load_receipt, private_write,
)


class FrontendOnlyCutoverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.preamble = b'/* BRANDICADE synthetic Worker */\nconst FILES = '
        self.prod_table = b'{"/index.html":{"m":"text/html","g":0,"b":"AAAA"}}'
        self.stage_table = b'{"/index.html":{"m":"text/html","g":0,"b":"BBBB"},"/new.mjs":{"m":"text/javascript","g":0,"b":"CCCC"}}'
        self.prod = self.worker(self.prod_table, b'production')
        self.stage = self.worker(self.stage_table, b'preview')
        self.receipt = self.build_receipt(self.prod, self.stage)

    def worker(self, table, aud, *, issuer=b'https://access.example.invalid', player=b'player@example.invalid', admin=b'admin@example.invalid', code=b''):
        suffix = (b';\nconst SEC = {};\nconst BRANDICADE_AUTH = {aud:\'' + aud +
                  b'\',issuer:\'' + issuer + b'\',player:\'' + player +
                  b'\',admin:\'' + admin + b'\'};\n' +
                  b'export default { fetch() { return new Response("ok"); } };\n' + code)
        return self.preamble + table + suffix

    def build_receipt(self, prod, stage):
        start = prod.index(b'const FILES = ') + len(b'const FILES = ')
        end = prod.index(b';\nconst SEC = ')
        start2 = stage.index(b'const FILES = ') + len(b'const FILES = ')
        end2 = stage.index(b';\nconst SEC = ')
        candidate = prod[:start] + stage[start2:end2] + prod[end:]
        return {
            'schema': 1, 'scope': 'asset-only-worker-cutover-preflight',
            'production': {'script': 'brandicade', 'deployment_id': '11111111-1111-1111-1111-111111111111',
                           'version_id': '22222222-2222-2222-2222-222222222222',
                           'module_sha256': digest(prod), 'asset_table_sha256': digest(prod[start:end])},
            'preview': {'script': 'brandicade-prism-preview-20261103',
                        'deployment_id': '33333333-3333-3333-3333-333333333333',
                        'version_id': '44444444-4444-4444-4444-444444444444',
                        'module_sha256': digest(stage), 'asset_table_sha256': digest(stage[start2:end2])},
            'candidate_sha256': digest(candidate),
        }

    def wrap(self, module):
        boundary = b'--0123456789abcdef'
        return (boundary + b'\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"'
                b'\r\nContent-Type: application/javascript+module\r\n\r\n' +
                module + b'\r\n' + boundary + b'--\r\n')

    def test_exact_candidate_inherits_production_runtime_and_preview_table(self):
        candidate = compose(self.prod, self.stage, self.receipt)
        self.assertEqual(candidate, self.worker(self.stage_table, b'production'))
        self.assertNotIn(b"aud:'preview'", candidate)
        self.assertIn(b"aud:'production'", candidate)
        self.assertEqual(digest(candidate), self.receipt['candidate_sha256'])

    def test_real_content_v2_multipart_format_is_unwrapped(self):
        self.assertEqual(extract_module(self.wrap(self.prod)), self.prod)
        self.assertEqual(compose(self.wrap(self.prod), self.wrap(self.stage), self.receipt),
                         compose(self.prod, self.stage, self.receipt))

    def test_prod_or_preview_digest_drift_rejected_before_readback(self):
        with self.assertRaisesRegex(ReleaseGuardError, 'Production Worker changed'):
            compose(self.prod + b' ', self.stage, self.receipt)
        with self.assertRaisesRegex(ReleaseGuardError, 'Preview Worker changed'):
            compose(self.prod, self.stage + b' ', self.receipt)

    def test_bad_table_digest_rejected_even_with_matching_module_hash(self):
        for key, label in [('production', 'Production asset table'), ('preview', 'Preview asset table')]:
            with self.subTest(key=key), self.assertRaisesRegex(ReleaseGuardError, label):
                receipt = copy.deepcopy(self.receipt)
                receipt[key]['asset_table_sha256'] = '0' * 64
                compose(self.prod, self.stage, receipt)

    def test_issuer_or_allowlisted_identity_change_rejected(self):
        for changes in ({'issuer': b'https://bad.example.invalid'}, {'player': b'other@example.invalid'},
                        {'admin': b'newadmin@example.invalid'}):
            with self.subTest(changes=changes), self.assertRaisesRegex(ReleaseGuardError, 'Issuer or allowlisted'):
                stage = self.worker(self.stage_table, b'preview', **changes)
                compose(self.prod, stage, self.build_receipt(self.prod, stage))

    def test_server_code_change_rejected_even_if_hashes_re_pinned(self):
        stage = self.worker(self.stage_table, b'preview', code=b'/* altered API writer */\n')
        with self.assertRaisesRegex(ReleaseGuardError, 'Signed backend or API code differs'):
            compose(self.prod, stage, self.build_receipt(self.prod, stage))

    def test_source_preamble_change_rejected_even_if_hashes_re_pinned(self):
        stage = self.stage.replace(b'/* BRANDICADE synthetic', b'/* BRANDICADE altered', 1)
        with self.assertRaisesRegex(ReleaseGuardError, 'Worker code before assets differs'):
            compose(self.prod, stage, self.build_receipt(self.prod, stage))

    def test_identical_access_audience_rejected(self):
        stage = self.worker(self.stage_table, b'production')
        with self.assertRaisesRegex(ReleaseGuardError, 'audiences must differ'):
            compose(self.prod, stage, self.build_receipt(self.prod, stage))

    def test_empty_frontend_upgrade_rejected(self):
        stage = self.worker(self.prod_table, b'preview')
        with self.assertRaisesRegex(ReleaseGuardError, 'No frontend upgrade'):
            compose(self.prod, stage, self.build_receipt(self.prod, stage))

    def test_candidate_hash_mismatch_rejected(self):
        bad = copy.deepcopy(self.receipt)
        bad['candidate_sha256'] = 'f' * 64
        with self.assertRaisesRegex(ReleaseGuardError, 'Proposed Worker digest'):
            compose(self.prod, self.stage, bad)

    def test_multiple_asset_tables_rejected_even_when_hash_pinned(self):
        changed = self.prod.replace(b'const SEC = ', b'const FILES = {};\nconst SEC = ')
        with self.assertRaisesRegex(ReleaseGuardError, 'asset boundary missing or ambiguous'):
            compose(changed, self.stage, self.build_receipt(changed, self.stage))

    def test_truncated_or_multiple_part_multipart_rejected(self):
        for bad in (self.wrap(self.prod)[:-10], self.wrap(self.prod) + b'--extra',
                    self.wrap(self.prod).replace(b'name="worker.js"', b'name="unexpected.js"')):
            with self.subTest(), self.assertRaises(ReleaseGuardError):
                extract_module(bad)

    def test_receipt_shape_and_duplicate_fields_rejected(self):
        path = self.root / 'receipt.json'
        path.write_text(json.dumps(self.receipt))
        self.assertEqual(load_receipt(path), self.receipt)
        path.write_text('{"schema":1,"schema":1}')
        with self.assertRaisesRegex(ReleaseGuardError, 'Duplicate release receipt field'):
            load_receipt(path)
        for key in ('schema', 'scope', 'candidate_sha256'):
            data = copy.deepcopy(self.receipt)
            data[key] = {'schema': True, 'scope': 'anything', 'candidate_sha256': 'bad'}[key]
            path.write_text(json.dumps(data))
            with self.subTest(key=key), self.assertRaises(ReleaseGuardError):
                load_receipt(path)

    def test_private_output_permissions_no_overwrite(self):
        destination = self.root / 'dist/private/candidate.worker.js'
        written = private_write(destination, self.prod, root=self.root)
        self.assertEqual(written.read_bytes(), self.prod)
        self.assertEqual(stat.S_IMODE(written.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(written.parent.stat().st_mode), 0o700)
        with self.assertRaisesRegex(ReleaseGuardError, 'already exists'):
            private_write(destination, self.stage, root=self.root)
        self.assertEqual(written.read_bytes(), self.prod)

    def test_private_output_rejects_paths_outside_ignored_directory(self):
        for path in (self.root / 'README.md', self.root / 'dist/candidate.js'):
            with self.assertRaisesRegex(ReleaseGuardError, 'inside dist/private'):
                private_write(path, self.prod, root=self.root)

    def test_private_output_rejects_world_readable_directory(self):
        directory = self.root / 'dist/private'
        directory.mkdir(parents=True)
        directory.chmod(0o755)
        with self.assertRaisesRegex(ReleaseGuardError, 'accessible to other users'):
            private_write(directory / 'candidate.js', self.prod, root=self.root)


if __name__ == '__main__':
    unittest.main()
