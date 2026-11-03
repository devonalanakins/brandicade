import gzip
import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'build_prism_preview.py'
spec = spec_from_file_location('preview_builder', SCRIPT)
builder = module_from_spec(spec)
spec.loader.exec_module(builder)

class PreviewBuildTests(unittest.TestCase):
    def setUp(self):
        self.context = tempfile.TemporaryDirectory(prefix='prism-test-')
        self.root = Path(self.context.name)
        original = (Path(__file__).resolve().parents[1] / 'build_worker.py').read_bytes()
        self.write('build_worker.py', original)
        for file in builder.SOURCES:
            self.write(builder.GAME + file,
                ('export const test=1;\n' if file.endswith('.mjs') else 'body{}').encode())
        self.write('src/prism-garden/app.mjs',
            b'''import {test} from './content.mjs';const back='<a href="/#home">Arcade</a>';''')
        for icon in builder.ICONS:
            self.write('assets/' + icon, b'dummy-image-bytes')
        self.write('prism-garden.html',
            b'''<html><head></head><body><div id="prism-app"></div><script type="module" src="/src/prism-garden/backup-ui.mjs"></script></body></html>''')

    def tearDown(self):
        self.context.cleanup()

    def write(self, relative, bytes_value):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(bytes_value)

    def files(self):
        output = (self.root / 'dist/prism-garden-preview.worker.js').read_text('utf-8')
        raw = re.search(r'const FILES = (\{.*?\});\s*const SEC', output, re.S).group(1)
        encoded = json.loads(raw)
        import base64
        decoded = {}
        for route, item in encoded.items():
            value = base64.b64decode(item['b'])
            if item['g']:
                value = gzip.decompress(value)
            decoded[route] = value
        return output, decoded

    def test_only_prism_and_preview_assets_with_no_api(self):
        result = builder.build(self.root)
        source, assets = self.files()
        self.assertEqual(result['assets'], 19)
        self.assertNotIn('/src/app.mjs', assets)
        self.assertNotIn('/api/save', assets)
        self.assertNotIn('D1_DATABASE', source)
        self.assertIn('PRISM GARDEN PREVIEW', assets['/index.html'].decode())
        self.assertIn('/manifest.webmanifest', assets['/index.html'].decode())
        self.assertIn(builder.BACK_LINK, assets['/src/prism-garden/app.mjs'].decode())
        manifest = json.loads(assets['/manifest.webmanifest'])
        self.assertEqual(manifest['start_url'], '/')
        self.assertEqual(manifest['icons'][1]['sizes'], '192x192')
        self.assertEqual(manifest['icons'][2]['sizes'], '512x512')
        self.assertNotIn('/src/engine.mjs', assets['/sw.js'].decode())
        self.assertNotIn('/api/save', assets['/sw.js'].decode())
        self.assertEqual(result['bytes'], len(source.encode()))
        syntax = subprocess.run(['node','--input-type=module','--check'], input=source, text=True, capture_output=True)
        self.assertEqual(syntax.returncode, 0, syntax.stderr)

    def test_deterministic_and_cache_rotates(self):
        a = builder.build(self.root)
        src = (self.root / 'dist/prism-garden-preview.worker.js').read_bytes()
        b = builder.build(self.root)
        self.assertEqual(a['fingerprint'], b['fingerprint'])
        self.assertEqual(src, (self.root / 'dist/prism-garden-preview.worker.js').read_bytes())
        self.write('src/prism-garden/backup.css',b'body{color:teal}')
        c = builder.build(self.root)
        self.assertNotEqual(a['fingerprint'], c['fingerprint'])

    def test_missing_import_fails_closed(self):
        self.write('src/prism-garden/engine.mjs', b"import {nope} from './nonexistent.mjs'\n")
        with self.assertRaisesRegex(ValueError, 'Missing module'):
            builder.build(self.root)

    def test_external_and_dynamic_modules_fail_closed(self):
        attacks = [
            b"import {a} from 'https://cdn.example/evil.mjs'",
            b"import 'https://cdn.example/side-effect.mjs'",
            b"import {a} from 'third-party-package'",
            b"const code=import('./content.mjs')",
            b"import './missing-side-effect.mjs'",
        ]
        for attack in attacks:
            with self.subTest(attack=attack):
                self.write('src/prism-garden/engine.mjs', attack)
                with self.assertRaisesRegex(ValueError, 'not allowed|Missing module'):
                    builder.build(self.root)

    def test_literal_html_with_from_does_not_trigger_fake_imports(self):
        self.write('src/prism-garden/backup-ui.mjs',
            b"const markup=\"<label>Choose from '<input type=file>'</label>\";\n")
        result = builder.build(self.root)
        self.assertEqual(result['assets'], 19)

    def test_html_external_asset_fails_closed(self):
        self.write('prism-garden.html',
            b'<html><head><script src="https://cdn.example/track.js"></script></head><body><div id="prism-app"></div><script type="module" src="/src/prism-garden/backup-ui.mjs"></script></body></html>')
        with self.assertRaisesRegex(ValueError, 'External or missing HTML asset'):
            builder.build(self.root)

    def test_css_import_fails_closed(self):
        self.write('src/prism-garden/prism.css', b'@import url(https://evil.example/style.css);')
        with self.assertRaisesRegex(ValueError, 'CSS imports are not allowed'):
            builder.build(self.root)

    def test_wrong_entrypoint_fails_closed(self):
        self.write('prism-garden.html', b'<html>not a game</html>')
        with self.assertRaisesRegex(ValueError, 'Unexpected Prism Garden'):
            builder.build(self.root)

if __name__=='__main__':
    unittest.main()
