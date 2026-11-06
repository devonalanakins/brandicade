#!/usr/bin/env python3
"""Verify a hash-only Cloudflare preview receipt against public-safe arcade source.

Read-only/offline verification. It neither contacts Cloudflare nor handles
credentials, player data, or a production Worker. A matching receipt verifies
only the stated frontend asset bytes at the recorded staging deployment.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

from verify_release_assets import verify as verify_static

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_HOST = "prism.anevum.com"
EXPECTED_WORKER = "brandicade-prism-preview-20261103"
SOURCE_CACHE = b"const CACHE='brandicade-glimmer-cascade-v8'"
STAGING_CACHE = b"const CACHE='brandicade-glimmer-cascade-cloud-bridge-v8'"
SOURCE_ASSETS = b"const ASSETS=["
STAGING_ASSETS = b"const ASSETS=['/src/cloud-sync.mjs',"
STAGING_SCOPE = "private-staging-frontend-assets-only"
DIGEST = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")


def _digest(data):
    return hashlib.sha256(data).hexdigest()


def _unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate attestation key: " + str(key))
        result[key] = value
    return result


def load_attestation(path):
    """Reject duplicate JSON fields, including nested route digests."""
    return json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=_unique_pairs)


def _valid_asset(asset):
    if not isinstance(asset, dict) or set(asset) != {"route", "sha256", "mime", "size_bytes"}:
        raise ValueError("Unexpected asset attestation fields")
    if not isinstance(asset["route"], str) or not asset["route"].startswith("/") or "//" in asset["route"]:
        raise ValueError("Invalid asset route")
    if not isinstance(asset["sha256"], str) or not DIGEST.fullmatch(asset["sha256"]):
        raise ValueError("Invalid asset digest")
    if not isinstance(asset["mime"], str) or not asset["mime"]:
        raise ValueError("Invalid asset MIME")
    if type(asset["size_bytes"]) is not int or asset["size_bytes"] < 0:
        raise ValueError("Invalid asset byte count")


def _expected_staging_sw(source):
    for previous, replacement in ((SOURCE_CACHE, STAGING_CACHE), (SOURCE_ASSETS, STAGING_ASSETS)):
        if source.count(previous) != 1 or source.count(replacement) != 0:
            raise ValueError("Unexpected service-worker bridge transformation boundary")
        source = source.replace(previous, replacement, 1)
    return source


def verify_attestation(manifest, attestation, root=ROOT):
    """Compare 35 source assets and the first-party opt-in bridge, fail closed."""
    if not isinstance(manifest, dict) or manifest.get("schema") != 1 or manifest.get("scope") != "static-frontend-only":
        raise ValueError("Unsupported source asset manifest")
    if not isinstance(attestation, dict) or set(attestation) != {
        "schema", "scope", "hostname", "worker", "deployment_id", "version_id",
        "source_head", "source_manifest_sha256", "observed_date", "assets"
    }:
        raise ValueError("Unexpected staging attestation fields")
    if (attestation["schema"] != 1 or attestation["scope"] != STAGING_SCOPE
            or attestation["hostname"] != EXPECTED_HOST
            or attestation["worker"] != EXPECTED_WORKER):
        raise ValueError("Attestation is not for the intended private staging worker")
    for field in ("deployment_id", "version_id"):
        if not isinstance(attestation[field], str) or not UUID.fullmatch(attestation[field]):
            raise ValueError("Missing or malformed immutable staging deployment identifier")
    if not isinstance(attestation["source_head"], str) or not COMMIT.fullmatch(attestation["source_head"]):
        raise ValueError("Invalid source commit")
    if not isinstance(attestation["observed_date"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", attestation["observed_date"]):
        raise ValueError("Invalid observation date")
    if attestation["source_manifest_sha256"] != manifest.get("manifest_sha256"):
        raise ValueError("Staging receipt references a different source manifest")
    source = manifest.get("assets")
    if not isinstance(source, list) or manifest.get("route_count") != len(source):
        raise ValueError("Malformed source asset manifest")
    root = Path(root).resolve()
    expected = {}
    for item in source:
        if not isinstance(item, dict) or not {"route", "source", "sha256", "mime", "size_bytes"} <= set(item):
            raise ValueError("Malformed source asset entry")
        route = item["route"]
        if route in expected:
            raise ValueError("Duplicate source asset route")
        path = (root / item["source"]).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError("Source asset path is missing or outside the repository")
        raw = path.read_bytes()
        if len(raw) != item["size_bytes"] or _digest(raw) != item["sha256"]:
            raise ValueError("Source manifest no longer matches local asset: " + route)
        expected[route] = {"route": route, "sha256": item["sha256"],
                           "size_bytes": len(raw), "mime": item["mime"]}
    if "/sw.js" not in expected:
        raise ValueError("Source service worker was not included")
    sw = _expected_staging_sw((root / "sw.js").read_bytes())
    expected["/sw.js"] = {"route": "/sw.js", "sha256": _digest(sw),
                          "size_bytes": len(sw), "mime": "text/javascript; charset=utf-8"}
    if "/src/cloud-sync.mjs" in expected:
        raise ValueError("Cloud bridge must be added only by the protected runtime")
    bridge = (root / "src/cloud-sync.mjs").read_bytes()
    expected["/src/cloud-sync.mjs"] = {
        "route": "/src/cloud-sync.mjs", "sha256": _digest(bridge),
        "size_bytes": len(bridge), "mime": "text/javascript; charset=utf-8"}
    assets = attestation["assets"]
    if not isinstance(assets, list):
        raise ValueError("Missing staging assets")
    actual = {}
    for asset in assets:
        _valid_asset(asset)
        if asset["route"] in actual:
            raise ValueError("Duplicate staged asset route")
        actual[asset["route"]] = asset
    if set(actual) != set(expected):
        raise ValueError("Staging routes differ: missing="
                         + str(sorted(set(expected) - set(actual)))
                         + "; extra=" + str(sorted(set(actual) - set(expected))))
    for route, required in expected.items():
        if actual[route] != required:
            raise ValueError("Staging asset bytes, size or MIME differ: " + route)
    return {
        "matched": len(expected),
        "scope": STAGING_SCOPE,
        "hostname": EXPECTED_HOST,
        "deployment_id": attestation["deployment_id"],
        "manifest_sha256": manifest["manifest_sha256"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--attestation", type=Path, required=True)
    args = parser.parse_args()
    manifest = verify_static()
    receipt = load_attestation(args.attestation)
    result = verify_attestation(manifest, receipt)
    print(f"VERIFIED {result['matched']} private staging frontend assets at {result['hostname']}")
    print("Source manifest SHA256:", result["manifest_sha256"])
    print("Staging deployment:", result["deployment_id"])
    print("NOT VERIFIED: real user login, Access policies, D1 writes/backups, device acceptance or production")


if __name__ == "__main__":
    main()
