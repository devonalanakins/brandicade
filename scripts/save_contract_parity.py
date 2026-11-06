"""Refuse Brandicade upgrades that silently change existing save-critical modules.

Only public-safe static asset entries are compared. Digests are for exact
packaged entries observed on both protected Workers on November 6, 2026.
No user data, Access identity, JWT, or D1 information is included.
"""
import hashlib
import re


class SaveContractParityError(ValueError):
    """A proposed frontend cutover changes an established save contract."""


PINNED_SAVE_ROUTE_SHA256 = {
    '/src/progression.mjs': '4d9a78d9beccb94c6983593a3859928469fb04faa2025afb16e357f9910684af',
    '/src/prism-garden/save-guard.mjs': '97c4c3b46de4acf624f12a254e4e74d33c2c9b6be84bdfe461e67d3acbf25a87',
    '/src/prism-garden/backup.mjs': '26b7ff912a9b0de4456fe6ff853e6ed6829ff61732fc166f48f37fd4f97deef8',
    '/src/prism-garden/achievements.mjs': '7de77ad2fcfb2bf9a8d0191a711dbf8f6be4d22e513e33f19fdadaa63d9444f0',
    '/src/prism-garden/engine.mjs': '57b23211d5b754e7effa0a7415dc60b29c3f6911b248bb5a814d462f453f4dc7',
    '/src/arcade-passport.mjs': '9b9cc4f77d05957f41284027dc6acf52e8189791f2374bd1c3633929271c2445',
    '/src/cloud-sync.mjs': 'f6fcf2cf2e04815b91a165806eb190e096739d222206eb8df64962ba6defe96b',
}
ENTRY = re.compile(rb'"(?P<route>/[a-zA-Z0-9._/-]+)"\s*:\s*(?P<asset>\{[^{}]*\})')


def _entries(asset_table):
    if not isinstance(asset_table, bytes):
        raise SaveContractParityError('Expected Worker asset table bytes')
    body = asset_table.strip()
    if not (body.startswith(b'{') and body.endswith(b'}')):
        raise SaveContractParityError('Malformed Worker asset table')
    routes = {}
    for match in ENTRY.finditer(body):
        route = match.group('route').decode('ascii')
        if route in routes:
            raise SaveContractParityError('Duplicate Worker asset route: ' + route)
        routes[route] = match.group('asset')
    return routes


def require_save_contract_parity(production_table, preview_table, expected_hashes=None):
    """Verify unchanged, pinned save modules; real-player backup remains separate."""
    if expected_hashes is None:
        expected_hashes = PINNED_SAVE_ROUTE_SHA256
    if not isinstance(expected_hashes, dict) or not expected_hashes:
        raise SaveContractParityError('Missing pinned save-contract invariants')
    original = _entries(production_table)
    proposed = _entries(preview_table)
    for route, pinned in expected_hashes.items():
        if (not isinstance(route, str) or not route.startswith('/src/')
                or not isinstance(pinned, str) or not re.fullmatch(r'[a-f0-9]{64}', pinned)):
            raise SaveContractParityError('Invalid save-contract pin')
        if route not in original or route not in proposed:
            raise SaveContractParityError('Save-contract module missing: ' + route)
        if original[route] != proposed[route]:
            raise SaveContractParityError('Save-contract module changed in preview: ' + route)
        if hashlib.sha256(original[route]).hexdigest() != pinned:
            raise SaveContractParityError('Save-contract module changed since pinned production: ' + route)
    return {'verified_save_contract_routes': len(expected_hashes),
            'scope': 'static-asset-contract-parity-only'}
