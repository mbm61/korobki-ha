# Мок-сервер: настоящая логика слияния из model.py + раздача файлов приложения. Запуск: python3 mockserver.py PORT
import sys, types, json, time, pathlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
D = (pathlib.Path(__file__).resolve().parents[2]/'custom_components'/'korobki')
pkg = types.ModuleType('korobki'); pkg.__path__ = [str(D)]; sys.modules['korobki'] = pkg
import importlib; C = importlib.import_module('korobki.const'); M = importlib.import_module('korobki.model')
d = {'rev': 0, 'recs': {}, 'log': [], 'conflicts': [], 'devices': {}}
VER = json.loads((D / 'manifest.json').read_text())['version']
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype='application/json'):
        if not isinstance(body, bytes): body = json.dumps(body).encode()
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        u = self.path.split('?')[0]
        if u == '/korobki_app/index.html': return self._send(200, (D / 'app/index.html').read_bytes(), 'text/html')
        if u == '/korobki_app/manifest.json': return self._send(200, b'{}')
        if u == '/korobki_static/korobki-panel.js': return self._send(200, (D / 'frontend/korobki-panel.js').read_text().replace('__KOROBKI_VERSION__', VER).encode(), 'text/javascript')
        if u == '/api/korobki/log': return self._send(200, {'rev': d['rev'], 'log': list(reversed(d['log'][-50:])), 'conflicts': list(reversed(d['conflicts'])), 'devices': d['devices']})
        if u == '/api/korobki/stats': return self._send(200, {'photos': 0, 'bytes': 0, 'orphans': 0, 'orphan_bytes': 0})
        if u == '/__state': return self._send(200, {'recs': d['recs'], 'nconf': len(d['conflicts'])})
        self._send(404, b'')
    def do_POST(self):
        u = self.path.split('?')[0]; n = int(self.headers.get('Content-Length') or 0); body = json.loads(self.rfile.read(n) or b'{}')
        if u == '/api/korobki/sync':
            now = int(time.time() * 1000); dev = str(body.get('device') or '')[:64]
            res = M.apply_batch(d, body.get('records', []), dev, now)
            out = [r for r in d['recs'].values() if r['r'] > body.get('since', 0) or r['id'] in res['touched']]
            d['devices'][dev] = {'last': now, 'label': body.get('label', '')}
            if res['sent'] or out: d['log'].append({'t': now, 'dev': dev[:8], 'lb': body.get('label', ''), 'sent': res['sent'], 'acc': res['accepted'], 'same': res['same'], 'ign': res['ignored'], 'rej': res['rejected'], 'con': len(res['conflicts']), 'fix': len(res['fixes']), 'clk': res['clock'], 'pull': len(out), 'rev': d['rev']})
            return self._send(200, {'rev': d['rev'], 'version': VER, 'records': out, 'conflicts': res['conflicts'], 'nconf': len(d['conflicts']), 'fixes': len(res['fixes'])})
        if u.startswith('/api/korobki/conflicts/'):
            cid = u.rsplit('/', 1)[1]; d['conflicts'] = [c for c in d['conflicts'] if c['id'] != cid]; return self._send(200, {'ok': True, 'nconf': len(d['conflicts'])})
        self._send(404, b'')
    def do_PUT(self): self._send(200, b'{}')
    def do_DELETE(self): self._send(200, b'{}')
ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
