"""Synthetic regression checks for Brandicade save-critical asset parity."""
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from save_contract_parity import (
    PINNED_SAVE_ROUTE_SHA256, SaveContractParityError, require_save_contract_parity,
)


class SaveContractParityTests(unittest.TestCase):
    @staticmethod
    def asset(route, contents):
        return f'"{route}":{{"m":"text/javascript","g":0,"b":"{contents}"}}'.encode()

    @staticmethod
    def table(entries):
        return b"{" + b",".join(entries) + b"}"

    def setUp(self):
        self.a = self.asset("/src/progression.mjs", "YWJj")
        self.b = self.asset("/src/cloud-sync.mjs", "ZGVm")
        self.pins = {
            "/src/progression.mjs": hashlib.sha256(self.a.split(b":", 1)[1]).hexdigest(),
            "/src/cloud-sync.mjs": hashlib.sha256(self.b.split(b":", 1)[1]).hexdigest(),
        }
        self.prod = self.table([self.a, self.b])
        self.preview = self.table([self.a, self.b, self.asset("/src/app.mjs", "Z2hp")])

    def test_matching_pinned_contract_is_accepted_amid_ui_changes(self):
        receipt = require_save_contract_parity(self.prod, self.preview, self.pins)
        self.assertEqual(receipt["verified_save_contract_routes"], 2)
        self.assertEqual(receipt["scope"], "static-asset-contract-parity-only")

    def test_changed_preview_save_module_rejected(self):
        altered = self.preview.replace(b"YWJj", b"YWJl")
        with self.assertRaisesRegex(SaveContractParityError, "changed in preview"):
            require_save_contract_parity(self.prod, altered, self.pins)

    def test_both_changed_save_modules_rejected_against_pins(self):
        altered = self.prod.replace(b"YWJj", b"YWJl")
        with self.assertRaisesRegex(SaveContractParityError, "changed since pinned production"):
            require_save_contract_parity(altered, altered, self.pins)

    def test_missing_save_route_rejected(self):
        with self.assertRaisesRegex(SaveContractParityError, "module missing"):
            require_save_contract_parity(self.prod, self.table([self.a]), self.pins)

    def test_duplicate_asset_key_rejected(self):
        with self.assertRaisesRegex(SaveContractParityError, "Duplicate Worker asset route"):
            require_save_contract_parity(self.table([self.a, self.a, self.b]), self.preview, self.pins)

    def test_pin_must_be_sha256_and_path(self):
        for bad in ({"/src/progression.mjs": "anything"}, {"/api/save": "0" * 64}, {}):
            with self.subTest(bad=bad), self.assertRaises(SaveContractParityError):
                require_save_contract_parity(self.prod, self.preview, bad)

    def test_malformed_asset_table_is_rejected(self):
        for bad in (b"", b"not-a-table", b"[]", b"\x00"):
            with self.subTest(bad=bad), self.assertRaisesRegex(SaveContractParityError, "Malformed"):
                require_save_contract_parity(bad, self.preview, self.pins)

    def test_private_release_cli_gate_accepts_unmodified_save_routes(self):
        from prepare_frontend_only_cutover import verify_save_contract_before_release
        def worker(table):
            return b"/* BRANDICADE synthetic */\nconst FILES = " + table + b";\nconst SEC = {};\n"
        result = verify_save_contract_before_release(
            worker(self.prod), worker(self.preview), self.pins)
        self.assertEqual(result["verified_save_contract_routes"], 2)

    def test_private_release_cli_gate_rejects_changed_save_routes(self):
        from prepare_frontend_only_cutover import verify_save_contract_before_release
        def worker(table):
            return b"/* BRANDICADE synthetic */\nconst FILES = " + table + b";\nconst SEC = {};\n"
        changed = self.preview.replace(b"YWJj", b"YWJl")
        with self.assertRaisesRegex(SaveContractParityError, "changed in preview"):
            verify_save_contract_before_release(worker(self.prod), worker(changed), self.pins)

    def test_pinned_constants_cover_all_existing_game_save_modules(self):
        self.assertEqual(set(PINNED_SAVE_ROUTE_SHA256), {
            "/src/progression.mjs", "/src/prism-garden/save-guard.mjs",
            "/src/prism-garden/backup.mjs", "/src/prism-garden/achievements.mjs",
            "/src/prism-garden/engine.mjs", "/src/arcade-passport.mjs",
            "/src/cloud-sync.mjs",
        })


if __name__ == "__main__":
    unittest.main()
