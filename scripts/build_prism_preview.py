#!/usr/bin/env python3
"""Build an isolated, device-local Prism Garden preview from the recovered game.

No live Worker, Access, D1 bindings or legacy arcade routes are included.
It deliberately reuses the repository's deterministic static Worker builder.
"""
import hashlib
import importlib.util
import json
import posixpath
import re
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = 'src/prism-garden/'
MIME = {
    '.mjs': 'text/javascript; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
}
SOURCES = (
    'content.mjs', 'engine.mjs', 'achievements.mjs', 'app.mjs',
    'save-guard.mjs', 'backup.mjs', 'backup-ui.mjs', 'prism.css', 'backup.css',
)
ICONS = ('icon.svg', 'icon-192.png', 'icon-512.png', 'icon-1024.png')
BACK_LINK = 'https://brandicade.anevum.com/#home'


def build(root=ROOT):
    root = Path(root)
    spec = importlib.util.spec_from_file_location('brandicade_static_builder', root / 'build_worker.py')
    if not spec or not spec.loader:
        raise RuntimeError('Canonical static Worker builder unavailable')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    files = {}
    for file in SOURCES:
        path = GAME + file
        data = (root / path).read_bytes()
        if file == 'app.mjs':
            source = data.decode('utf-8')
            if 'href="/#home"' not in source:
                raise ValueError('Expected arcade return link absent')
            data = source.replace('href="/#home"', 'href="' + BACK_LINK + '"').encode('utf-8')
        files['/' + path] = data
    for icon in ICONS:
        path = 'assets/' + icon
        files['/' + path] = (root / path).read_bytes()
    html = (root / 'prism-garden.html').read_text('utf-8')
    if '<div id="prism-app"></div>' not in html or 'backup-ui.mjs' not in html:
        raise ValueError('Unexpected Prism Garden entrypoint')
    html = html.replace('<div id="prism-app"></div>',
        '<aside class="preview-notice" role="note"><strong>PRISM GARDEN PREVIEW</strong>'
        '<span>Progress is saved only on this device. Export a backup before switching phones.</span>'
        '</aside><div id="prism-app"></div>')
    html = html.replace('</head>',
        '<link rel="manifest" href="/manifest.webmanifest">'
        '<link rel="stylesheet" href="/preview.css">'
        '<meta name="apple-mobile-web-app-capable" content="yes">'
        '<link rel="apple-touch-icon" href="/assets/icon-192.png"></head>')
    html = html.replace('</body>', '<script defer src="/preview-register.js"></script></body>')
    files['/index.html'] = html.encode('utf-8')
    files['/prism-garden.html'] = files['/index.html']
    files['/preview.css'] = (
        '.preview-notice{position:relative;z-index:3;display:flex;gap:12px;'
        'justify-content:center;align-items:center;flex-wrap:wrap;padding:11px 18px;'
        'background:#0a251f;color:#d5ede1;text-align:center;'
        'font:500 12px/1.4 system-ui,sans-serif;border-bottom:1px solid #7ca89344}'
        '.preview-notice strong{color:#f4d79d;letter-spacing:.11em;font-size:10px}'
    ).encode('utf-8')
    files['/preview-register.js'] = (
        "if('serviceWorker' in navigator){addEventListener('load',()=>"
        "navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{}));}"
    ).encode('utf-8')
    manifest = {
        'id': '/', 'name': 'Prism Garden Preview', 'short_name': 'Prism Garden',
        'start_url': '/', 'scope': '/', 'display': 'standalone',
        'background_color': '#102e29', 'theme_color': '#102e29',
        'icons': [{'src': '/assets/' + icon, 'sizes': 'any' if icon.endswith('.svg') else icon[5:icon.index('.')].replace('-', 'x'),
                   'type': 'image/svg+xml' if icon.endswith('.svg') else 'image/png', 'purpose': 'any'}
                  for icon in ICONS],
    }
    # Explicit sizes prevent a malformed 1024x1024 app icon declaration.
    for entry, dimension in zip(manifest['icons'][1:], (192, 512, 1024)):
        entry['sizes'] = f'{dimension}x{dimension}'
    files['/manifest.webmanifest'] = json.dumps(manifest, separators=(',', ':')).encode('utf-8')
    fingerprint = hashlib.sha256(b''.join(path.encode() + b'\0' + files[path] for path in sorted(files))).hexdigest()[:12]
    cache = 'prism-garden-preview-' + fingerprint
    routes = ['/', *sorted(files)]
    files['/sw.js'] = (
        "const CACHE=" + json.dumps(cache) + ";const URLS=" + json.dumps(routes) + ";"
        "self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)));self.skipWaiting()});"
        "self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n.startsWith('prism-garden-preview-')&&n!==CACHE).map(n=>caches.delete(n)))));self.clients.claim()});"
        "self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!URLS.includes(u.pathname))return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)))});"
    ).encode('utf-8')
    # Fail closed when offline modules or HTML attempt to load absent/external assets.
    for path, data in files.items():
        if path.endswith('.mjs'):
            source = data.decode('utf-8')
            if re.search(r'\bimport\s*\(', source):
                raise ValueError(f'Dynamic imports are not allowed in the offline preview: {path}')
            # Only parse import/export declarations. Matching every ``from '...``
            # also matches literal HTML/text inside app strings (e.g. "Restore from ...").
            for line in source.splitlines():
                declaration = re.match(r'^\s*(?:import|export)\s+(.+)$', line)
                if not declaration:
                    continue
                clause = declaration.group(1)
                specifier_match = re.match(r"^['\"]([^'\"]+)['\"]", clause)
                if not specifier_match:
                    specifier_match = re.search(r"\bfrom\s*['\"]([^'\"]+)['\"]", clause)
                if not specifier_match:
                    continue
                specifier = specifier_match.group(1)
                if not specifier.startswith(('./', '../')):
                    raise ValueError(f'External or bare module is not allowed: {specifier}')
                target = posixpath.normpath(posixpath.join(posixpath.dirname(path), specifier))
                if target not in files:
                    raise ValueError(f'Missing module {specifier} from {path}')
        if path.endswith('.css') and re.search(r'@import\b', data.decode('utf-8'), re.I):
            raise ValueError(f'CSS imports are not allowed in offline preview: {path}')
    for url in re.findall(r"\b(?:src|href)=['\"]([^'\"]+)['\"]", html):
        if url.startswith(('data:', '#')):
            continue
        if not url.startswith('/') or url.split('?', 1)[0].split('#', 1)[0] not in files:
            raise ValueError(f'External or missing HTML asset: {url}')
    with tempfile.TemporaryDirectory(prefix='brandicade-prism-preview-') as tmp:
        staging = Path(tmp)
        mapping = {}
        for route, content in files.items():
            relative = route.lstrip('/')
            destination = staging / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
            mapping[route] = (relative, MIME.get(destination.suffix, 'application/octet-stream'))
        builder.ROOT = staging
        builder.OUT = root / 'dist' / 'prism-garden-preview.worker.js'
        builder.ASSETS = mapping
        builder.main()
    output = builder.OUT
    script = output.read_text('utf-8')
    if '/api/save' in script or 'cf-access-jwt-assertion' in script.lower():
        raise ValueError('Unexpected production cloud-save dependency in preview')
    return {'file': str(output), 'assets': len(files), 'fingerprint': fingerprint, 'bytes': output.stat().st_size}


if __name__ == '__main__':
    print(json.dumps(build()))
