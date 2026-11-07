"""Adversarial release-gate tests. No provider requests or real saves."""
import copy
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('check_production_release_gate',ROOT/'scripts/check_production_release_gate.py')
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
MANIFEST = gate.load_manifest(gate.read_json(ROOT/'docs/receipts/brandicade-v11-production-candidate-2026-11-06.json'))
NOW = datetime(2026, 11, 7, 1, 0, tzinfo=timezone.utc)


def example_observation():
    p, s = MANIFEST['production'], MANIFEST['staging']
    return {
        'schema':1,'source_sha':MANIFEST['source_sha'], 'observed_at':(NOW-timedelta(minutes=1)).isoformat(),
        'production':{
            'live_version':p['current_live_version'],'live_percentage':100,
            'latest_uploaded_version':p['inactive_candidate_version'],
            'latest_code_sha256':p['candidate_sha256'],
            'saves_d1_binding':True,'private_access_allowlist':True,
        },
        'staging':{
            'live_version':s['live_version'],'live_percentage':100,
            'latest_code_sha256':s['source_sha256'],
            'saves_d1_binding':True,'private_access_allowlist':True,
        },
        'separate_d1_databases':True,
    }


def example_acceptance():
    return {
        'schema':1,'release':MANIFEST['release'],'source_sha':MANIFEST['source_sha'],
        'candidate_version':MANIFEST['production']['inactive_candidate_version'],
        'checks':{k:{'confirmed':True,'observed_at':(NOW-timedelta(hours=2)).isoformat(),
                     'evidence_ref':'owner-private:record-'+str(i)}
                  for i,k in enumerate(gate.EVIDENCE_IDS)}
    }


class ProductionGateTests(unittest.TestCase):
    def verdict(self, observation=None, acceptance=None):
        return gate.evaluate(MANIFEST, observation, acceptance, now=NOW)

    def test_pinned_source_and_cloudflare_versions_are_exact(self):
        self.assertEqual(MANIFEST['source_sha'],'1e8c4cf85269438ca291a770b814ac186710577a')
        self.assertEqual(MANIFEST['production']['inactive_candidate_version'],'b98da834-ce76-4c45-8f19-95f802f6e904')
        self.assertEqual(MANIFEST['production']['rollback_version'],MANIFEST['production']['current_live_version'])
        self.assertEqual(MANIFEST['production']['candidate_asset_count'],37)

    def test_without_evidence_is_release_no_go(self):
        result=self.verdict()
        self.assertEqual(result['status'],'RELEASE_NO_GO')
        self.assertEqual(len(result['issues']),11)
        self.assertFalse(result['automatic_deployment_authorized'])

    def test_perfect_synthetic_coverage_is_review_not_automatic_go(self):
        result=self.verdict(example_observation(),example_acceptance())
        self.assertEqual(result['status'],'REVIEW_REQUIRED')
        self.assertFalse(result['automatic_deployment_authorized'])
        self.assertTrue(result['manual_review_still_required'])
        self.assertEqual(result['issues'],[])

    def test_prod_candidate_activated_before_evidence_is_refused(self):
        obs=example_observation()
        obs['production']['live_version']=MANIFEST['production']['inactive_candidate_version']
        self.assertIn('production_version_or_digest_drift',self.verdict(obs,example_acceptance())['issues'])

    def test_staging_drift_refused(self):
        obs=example_observation();obs['staging']['live_version']='0e57ae55-d3ab-4157-a4c8-ebdb11f9da89'
        self.assertIn('staging_version_or_digest_drift',self.verdict(obs,example_acceptance())['issues'])

    def test_wrong_uploaded_candidate_hash_refused(self):
        obs=example_observation();obs['production']['latest_code_sha256']='0'*64
        self.assertIn('production_version_or_digest_drift',self.verdict(obs,example_acceptance())['issues'])

    def test_stale_provider_snapshot_refused(self):
        obs=example_observation();obs['observed_at']=(NOW-timedelta(hours=4)).isoformat()
        self.assertIn('stale_provider_observation',self.verdict(obs,example_acceptance())['issues'])

    def test_unspecified_timezone_refused(self):
        obs=example_observation();obs['observed_at']='2026-11-06T20:59:00'
        self.assertIn('time_needs_timezone',self.verdict(obs,example_acceptance())['issues'])

    def test_future_observation_refused(self):
        obs=example_observation();obs['observed_at']=(NOW+timedelta(hours=1)).isoformat()
        self.assertIn('observation_in_future',self.verdict(obs,example_acceptance())['issues'])

    def test_public_access_or_same_database_refused(self):
        obs=example_observation();obs['production']['private_access_allowlist']=False
        self.assertIn('access_policy_unverified',self.verdict(obs,example_acceptance())['issues'])
        obs=example_observation();obs['separate_d1_databases']=False
        self.assertIn('d1_boundary_unverified',self.verdict(obs,example_acceptance())['issues'])

    def test_missing_device_check_denies_review(self):
        a=example_acceptance();del a['checks']['physical_xbox_controller']
        self.assertIn('owner_evidence_missing_or_extra_checks',self.verdict(example_observation(),a)['issues'])

    def test_unconfirmed_backup_refuses_review(self):
        a=example_acceptance();a['checks']['original_iphone_glimmer_export']['confirmed']=False
        self.assertIn('owner_check_incomplete:original_iphone_glimmer_export',self.verdict(example_observation(),a)['issues'])

    def test_license_unreviewed_refuses_review(self):
        a=example_acceptance();a['checks']['source_license_rights_review']['confirmed']=False
        self.assertIn('owner_check_incomplete:source_license_rights_review',self.verdict(example_observation(),a)['issues'])

    def test_owner_approval_must_match_exact_candidate(self):
        a=example_acceptance();a['candidate_version']='0e57ae55-d3ab-4157-a4c8-ebdb11f9da89'
        self.assertIn('owner_evidence_release_mismatch',self.verdict(example_observation(),a)['issues'])

    def test_rejects_duplicate_keys_and_large_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'duplicate.json';path.write_text('{"a":1,"a":2}')
            with self.assertRaisesRegex(gate.GateInputError,'duplicate_json_keys'):
                gate.read_json(path)
            path.write_text('x'*32769)
            with self.assertRaisesRegex(gate.GateInputError,'input_too_large'):
                gate.read_json(path)

    def test_manifest_rejects_changed_candidate_and_extra_gate(self):
        bad=copy.deepcopy(MANIFEST)
        bad['evidence_ids'].append('bypass_all')
        with self.assertRaisesRegex(gate.GateInputError,'manifest_evidence_ids'):
            gate.load_manifest(bad)
        bad=copy.deepcopy(MANIFEST)
        bad['production']['candidate_sha256']='0'*64
        with self.assertRaisesRegex(gate.GateInputError,'manifest_rollback'):
            gate.load_manifest(bad)
        bad=copy.deepcopy(MANIFEST)
        bad['production']['rollback_version']=bad['production']['inactive_candidate_version']
        with self.assertRaisesRegex(gate.GateInputError,'manifest_rollback'):
            gate.load_manifest(bad)


    def test_superseded_v9_and_v10_candidates_cannot_pass_v11_gate(self):
        for generation in (9,10):
            historical=gate.read_json(ROOT/f'docs/receipts/brandicade-v{generation}-production-candidate-2026-11-06.json')
            with self.assertRaisesRegex(gate.GateInputError,'manifest_release'):
                gate.load_manifest(historical)


if __name__=='__main__':
    unittest.main()