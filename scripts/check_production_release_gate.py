#!/usr/bin/env python3
"""Read-only, fail-closed Brandicade release-evidence checker. Never deploys.

Provider observations and owner acknowledgments are private, locally held
inputs; the public pinned manifest contains hashes/versions only. Successful
checks return REVIEW_REQUIRED, never automatic release authorization.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = ROOT / 'docs/receipts/brandicade-v10-production-candidate-2026-11-06.json'
HEX64 = re.compile(r'^[0-9a-f]{64}$')
GUID = re.compile(r'^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
PINNED_SOURCE = 'b4f3f1469c13a6ee7a8ee165486f8cb6f833968a'
PINNED_PRODUCTION_VERSION = '9b88b22c-d740-4e8f-b35a-5178a627a8e2'
PINNED_CANDIDATE_VERSION = '167e4379-4634-4936-b7ea-c6ce1833e878'
PINNED_CANDIDATE_SHA256 = 'ad94d4f63c7c4e5ba0f3ac8057f0e04d080ebe70cdc5c384811eaa80aa0d95f2'
PINNED_STAGING_VERSION = 'e346cfcd-afd0-4cdb-98a3-0b46f9d20737'
PINNED_STAGING_SHA256 = 'f50d0c627087e0c12829e660e6c375819c3abaf5352abc6af3a7ea697de18f40'

EVIDENCE_IDS = (
    'original_iphone_glimmer_export',
    'original_iphone_prism_export',
    'independent_owner_held_copy',
    'isolated_restore_no_original_changes',
    'authorized_player_and_denied_user_login',
    'iphone_pwa_offline_and_landscape',
    'physical_xbox_controller',
    'source_license_rights_review',
    'rollback_procedure_rehearsed',
    'owner_final_release_approval',
)


class GateInputError(ValueError):
    pass


def unique_object(pairs):
    result = {}
    for k, v in pairs:
        if k in result:
            raise GateInputError('duplicate_json_keys')
        result[k] = v
    return result


def read_json(path):
    p = Path(path)
    if p.stat().st_size > 32768:
        raise GateInputError('input_too_large')
    try:
        return json.loads(p.read_text('utf-8'), object_pairs_hook=unique_object)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise GateInputError('invalid_json') from exc


def expect_keys(value, expected, code):
    if not isinstance(value, dict) or set(value) != set(expected):
        raise GateInputError(code)


def load_manifest(raw):
    expect_keys(raw, ('schema', 'release', 'source_sha', 'ci_url',
                      'production', 'staging', 'evidence_ids'), 'manifest_shape')
    if type(raw['schema']) is not int or raw['schema'] != 1:
        raise GateInputError('manifest_schema')
    if raw['release'] != 'brandicade-v10-production-2026-11-06' or raw['source_sha'] != PINNED_SOURCE:
        raise GateInputError('manifest_release')
    if not isinstance(raw['source_sha'], str) or not re.fullmatch(r'[0-9a-f]{40}', raw['source_sha']):
        raise GateInputError('manifest_source_sha')
    if raw['ci_url'] != 'https://github.com/devonalanakins/brandicade/actions/runs/42326554686':
        raise GateInputError('manifest_ci_url')
    if raw['evidence_ids'] != list(EVIDENCE_IDS):
        raise GateInputError('manifest_evidence_ids')
    prod, stage = raw['production'], raw['staging']
    expect_keys(prod, ('script','hostname','current_live_version','current_deployment',
                       'inactive_candidate_version','candidate_sha256','candidate_asset_count',
                       'rollback_version'), 'manifest_prod_shape')
    expect_keys(stage, ('script','hostname','live_version','deployment','source_sha256','asset_count'),
                'manifest_staging_shape')
    if prod['script'] != 'brandicade' or prod['hostname'] != 'brandicade.anevum.com' or stage['script'] != 'brandicade-prism-preview-20261103' or stage['hostname'] != 'prism.anevum.com':
        raise GateInputError('manifest_host_mismatch')
    for x in (prod['current_live_version'],prod['current_deployment'],prod['inactive_candidate_version'],prod['rollback_version'],stage['live_version'],stage['deployment']):
        if not isinstance(x,str) or not GUID.fullmatch(x):
            raise GateInputError('manifest_uuid')
    for x in (prod['candidate_sha256'], stage['source_sha256']):
        if not isinstance(x,str) or not HEX64.fullmatch(x):
            raise GateInputError('manifest_sha')
    if (prod['rollback_version'] != prod['current_live_version'] or
        prod['current_live_version'] != PINNED_PRODUCTION_VERSION or
        prod['inactive_candidate_version'] != PINNED_CANDIDATE_VERSION or
        prod['candidate_sha256'] != PINNED_CANDIDATE_SHA256 or
        stage['live_version'] != PINNED_STAGING_VERSION or
        stage['source_sha256'] != PINNED_STAGING_SHA256):
        raise GateInputError('manifest_rollback')
    if prod['candidate_asset_count'] != 37 or stage['asset_count'] != 37:
        raise GateInputError('manifest_asset_count')
    return raw


def parse_time(value, now, *, freshness=None):
    if not isinstance(value, str) or len(value) > 40:
        raise GateInputError('invalid_observed_time')
    try:
        dt = datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError as exc:
        raise GateInputError('invalid_observed_time') from exc
    if dt.tzinfo is None:
        raise GateInputError('time_needs_timezone')
    dt = dt.astimezone(timezone.utc)
    if dt > now + timedelta(minutes=2):
        raise GateInputError('observation_in_future')
    if freshness is not None and now - dt > freshness:
        raise GateInputError('stale_provider_observation')
    return dt


def check_provider(manifest, observed, now):
    expect_keys(observed, ('schema','source_sha','observed_at','production',
                           'staging','separate_d1_databases'), 'provider_shape')
    if type(observed['schema']) is not int or observed['schema'] != 1 or observed['source_sha'] != manifest['source_sha']:
        raise GateInputError('provider_source_mismatch')
    parse_time(observed['observed_at'],now,freshness=timedelta(minutes=30))
    p,s = observed['production'],observed['staging']
    expected_p = ('live_version','live_percentage','latest_uploaded_version',
                  'latest_code_sha256','saves_d1_binding','private_access_allowlist')
    expected_s = ('live_version','live_percentage','latest_code_sha256',
                  'saves_d1_binding','private_access_allowlist')
    expect_keys(p, expected_p, 'provider_prod_shape')
    expect_keys(s, expected_s, 'provider_staging_shape')
    wanted_p = manifest['production']; wanted_s = manifest['staging']
    if (p['live_version'] != wanted_p['current_live_version'] or
        p['live_percentage'] != 100 or
        p['latest_uploaded_version'] != wanted_p['inactive_candidate_version'] or
        p['latest_code_sha256'] != wanted_p['candidate_sha256']):
        raise GateInputError('production_version_or_digest_drift')
    if (s['live_version'] != wanted_s['live_version'] or
        s['live_percentage'] != 100 or
        s['latest_code_sha256'] != wanted_s['source_sha256']):
        raise GateInputError('staging_version_or_digest_drift')
    if (observed['separate_d1_databases'] is not True or
        p['saves_d1_binding'] is not True or
        s['saves_d1_binding'] is not True):
        raise GateInputError('d1_boundary_unverified')
    if p['private_access_allowlist'] is not True or s['private_access_allowlist'] is not True:
        raise GateInputError('access_policy_unverified')


def check_acceptance(manifest, acceptance, now):
    expect_keys(acceptance, ('schema','release','source_sha','candidate_version','checks'),
                'owner_evidence_shape')
    if (type(acceptance['schema']) is not int or acceptance['schema'] != 1 or acceptance['release'] != manifest['release'] or
        acceptance['source_sha'] != manifest['source_sha'] or
        acceptance['candidate_version'] != manifest['production']['inactive_candidate_version']):
        raise GateInputError('owner_evidence_release_mismatch')
    checks = acceptance['checks']
    if not isinstance(checks,dict) or set(checks) != set(EVIDENCE_IDS):
        raise GateInputError('owner_evidence_missing_or_extra_checks')
    for key in EVIDENCE_IDS:
        entry = checks[key]
        expect_keys(entry, ('confirmed','observed_at','evidence_ref'), 'owner_check_shape')
        if entry['confirmed'] is not True:
            raise GateInputError('owner_check_incomplete:'+key)
        parse_time(entry['observed_at'],now)
        ref = entry['evidence_ref']
        if (not isinstance(ref,str) or not re.fullmatch(r'[a-zA-Z0-9:_./-]{4,100}',ref)):
            raise GateInputError('owner_check_missing_private_evidence_ref:'+key)


def evaluate(manifest, observation=None, acceptance=None, now=None):
    now = now or datetime.now(timezone.utc)
    problems=[]
    if observation is None:
        problems.append('fresh_provider_observation_missing')
    else:
        try:
            check_provider(manifest,observation,now)
        except GateInputError as exc:
            problems.append(str(exc))
    if acceptance is None:
        problems.extend('pending:'+key for key in EVIDENCE_IDS)
    else:
        try:
            check_acceptance(manifest,acceptance,now)
        except GateInputError as exc:
            problems.append(str(exc))
    return {'status':'RELEASE_NO_GO' if problems else 'REVIEW_REQUIRED',
            'automatic_deployment_authorized':False,
            'manual_review_still_required':True,
            'issues':problems}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,default=DEFAULT_MANIFEST)
    parser.add_argument('--provider-observation',type=Path,help='Fresh provider snapshot, privately held')
    parser.add_argument('--owner-acceptance',type=Path,help='Owner-held evidence metadata, no save contents')
    args=parser.parse_args(argv)
    try:
        manifest=load_manifest(read_json(args.manifest))
        observation=read_json(args.provider_observation) if args.provider_observation else None
        acceptance=read_json(args.owner_acceptance) if args.owner_acceptance else None
        result=evaluate(manifest, observation, acceptance)
    except (GateInputError, OSError) as exc:
        result={'status':'RELEASE_NO_GO','automatic_deployment_authorized':False,
                'manual_review_still_required':True,'issues':['invalid_release_evidence:'+str(exc)]}
    print(json.dumps(result,indent=2,sort_keys=True))
    return 0 if result['status']=='REVIEW_REQUIRED' else 3


if __name__=='__main__':
    sys.exit(main())