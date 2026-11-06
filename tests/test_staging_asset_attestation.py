"""Security-negative coverage of static-only preview provenance checks."""
import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from attest_staging_assets import (
    AttestationError, attestation, load_json, observed_index, source_index,
    SOURCE_CACHE, STAGING_CACHE, SOURCE_ASSETS, STAGING_ASSETS,
)


class StagingAssetAttestationTests(unittest.TestCase):
    def setUp(self):
        self.sw = ("/* synthetic offline Worker */\n" + SOURCE_CACHE + ';\n'
                   + SOURCE_ASSETS + "'/index.html'];\n").encode('utf-8')
        self.cloud = b'/* synthetic bridge */ export const safe = true;\n'
        self.game = b'export const arcade = true;\n'
        sw_alt = self.sw.decode().replace(SOURCE_CACHE, STAGING_CACHE).replace(SOURCE_ASSETS, STAGING_ASSETS).encode()
        source_assets = [
            self.entry('/src/game.mjs', 'text/javascript; charset=utf-8', self.game, source='src/game.mjs'),
            self.entry('/sw.js', 'text/javascript; charset=utf-8', self.sw, source='sw.js'),
        ]
        self.source = {'schema': 1, 'scope': 'static-frontend-only', 'route_count': 2,
                       'assets': source_assets}
        self.source['manifest_sha256'] = self.manifest_hash(self.source)
        observed_assets = [
            self.entry('/src/cloud-sync.mjs', 'text/javascript; charset=utf-8', self.cloud),
            self.entry('/src/game.mjs', 'text/javascript; charset=utf-8', self.game),
            self.entry('/sw.js', 'text/javascript; charset=utf-8', sw_alt),
        ]
        self.observed = {
            'schema': 1, 'scope': 'staging-static-assets-only',
            'hostname': 'prism.anevum.com', 'script': 'brandicade-prism-preview-20261103',
            'deployment_id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            'version_id': 'ffffffff-1111-2222-3333-444444444444',
            'asset_count': 3, 'assets': observed_assets,
        }

    @staticmethod
    def entry(route, mime, body, source=None):
        v = {'route': route, 'mime': mime, 'size_bytes': len(body),
             'sha256': hashlib.sha256(body).hexdigest()}
        if source is not None:
            v['source'] = source
        return v

    @staticmethod
    def manifest_hash(source):
        body = {k: v for k, v in source.items() if k != 'manifest_sha256'}
        return hashlib.sha256(json.dumps(body, sort_keys=True,
                    separators=(',', ':')).encode('utf-8')).hexdigest()

    def verify(self, source=None, observed=None, sw=None, cloud=None, version=None):
        return attestation(
            self.source if source is None else source,
            self.observed if observed is None else observed,
            self.sw if sw is None else sw,
            self.cloud if cloud is None else cloud,
            self.observed['version_id'] if version is None else version,
        )

    def test_valid_snapshot_requires_exact_source_assets_and_two_known_changes(self):
        result = self.verify()
        self.assertEqual(result['verified_asset_count'], 3)
        self.assertEqual(result['unchanged_source_routes'], 1)
        self.assertEqual(result['deterministic_service_worker_rewrites'], 1)
        self.assertEqual(result['first_party_cloud_bridge_routes'], 1)
        self.assertFalse(result['live_authentication_verified'])
        self.assertFalse(result['backend_parity_verified'])
        self.assertFalse(result['production_deployment_verified'])

    def test_changed_static_asset_bytes_or_mime_fails(self):
        for key, value in [('sha256', '0' * 64), ('size_bytes', 900), ('mime', 'text/html')]:
            with self.subTest(key=key), self.assertRaisesRegex(AttestationError, 'mismatch'):
                observed = copy.deepcopy(self.observed)
                observed['assets'][1][key] = value
                self.verify(observed=observed)

    def test_extra_or_missing_assets_fail_even_when_claimed_count_is_updated(self):
        for remove in (False, True):
            with self.subTest(remove=remove), self.assertRaisesRegex(AttestationError, 'route set mismatch'):
                observed = copy.deepcopy(self.observed)
                if remove:
                    observed['assets'].pop(0)
                else:
                    observed['assets'].insert(0, self.entry('/secret', 'text/plain', b'synthetic'))
                observed['asset_count'] = len(observed['assets'])
                self.verify(observed=observed)

    def test_service_worker_wrong_rewrite_is_rejected(self):
        for bad in (b'wrong service worker', self.sw + b'\nextra change'):
            with self.subTest(bad=bad[:12]), self.assertRaises(AttestationError):
                self.verify(sw=bad)
        observed = copy.deepcopy(self.observed)
        observed['assets'][2] = self.entry('/sw.js', 'text/javascript; charset=utf-8', self.sw)
        with self.assertRaisesRegex(AttestationError, 'Asset byte mismatch'):
            self.verify(observed=observed)

    def test_changed_or_mislabeled_cloud_bridge_is_rejected(self):
        for cloud in (self.cloud + b'evil', b''):
            with self.subTest(cloud=cloud[:10]), self.assertRaisesRegex(AttestationError, 'Injected cloud-sync'):
                self.verify(cloud=cloud)
        observed = copy.deepcopy(self.observed)
        observed['assets'][0]['mime'] = 'text/html'
        with self.assertRaisesRegex(AttestationError, 'Injected cloud-sync'):
            self.verify(observed=observed)

    def test_provider_host_script_and_version_are_pinned(self):
        for key, bad in [('hostname', 'public.anevum.com'), ('script', 'brandicade'),
                         ('version_id', '00000000-0000-0000-0000-000000000000'),
                         ('deployment_id', 'bad'), ('schema', 2)]:
            with self.subTest(key=key), self.assertRaises(AttestationError):
                observed = copy.deepcopy(self.observed)
                observed[key] = bad
                self.verify(observed=observed)

    def test_modified_source_manifest_is_rejected_even_if_route_hash_matches(self):
        for key, value in [('route_count', 4), ('manifest_sha256', 'f' * 64)]:
            with self.subTest(key=key), self.assertRaises(AttestationError):
                src = copy.deepcopy(self.source)
                src[key] = value
                self.verify(source=src)

    def test_duplicate_or_out_of_order_routes_are_rejected(self):
        observed = copy.deepcopy(self.observed)
        observed['assets'].append(observed['assets'][-1])
        observed['asset_count'] = 4
        with self.assertRaisesRegex(AttestationError, 'duplicate route'):
            self.verify(observed=observed)
        observed = copy.deepcopy(self.observed)
        observed['assets'].reverse()
        with self.assertRaisesRegex(AttestationError, 'not canonically sorted'):
            self.verify(observed=observed)

    def test_duplicate_json_keys_in_untrusted_receipt_rejected(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as tmp:
            f = Path(tmp) / 'receipt.json'
            f.write_text('{"schema":1,"schema":1}', 'utf-8')
            with self.assertRaisesRegex(AttestationError, 'Duplicate JSON key'):
                load_json(f)

    def test_no_cloud_bridge_in_source_and_sw_rewrite_boundary_changes_rejected(self):
        src = copy.deepcopy(self.source)
        src['assets'].insert(0, self.entry('/src/cloud-sync.mjs', 'text/javascript; charset=utf-8', self.cloud, source='src/cloud-sync.mjs'))
        src['route_count'] += 1
        src['manifest_sha256'] = self.manifest_hash(src)
        with self.assertRaisesRegex(AttestationError, 'route ownership changed'):
            self.verify(source=src)
        sw = self.sw.replace(SOURCE_CACHE.encode(), b'const CACHE="changed"')
        src = copy.deepcopy(self.source)
        src['assets'][-1] = self.entry('/sw.js', 'text/javascript; charset=utf-8', sw, source='sw.js')
        src['manifest_sha256'] = self.manifest_hash(src)
        with self.assertRaisesRegex(AttestationError, 'rewrite boundary changed'):
            self.verify(source=src, sw=sw)

if __name__ == '__main__':
    unittest.main()
