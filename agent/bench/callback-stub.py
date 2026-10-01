"""The benchmark's stand-in for the Worker and for Drive's metadata calls.

    python callback-stub.py <inbox dir> <port file>

Listens on 127.0.0.1, on a free port it writes to <port file>, and answers:

- GET  /runner/vaults/<id>     the vault info run.sh reads (fixed fake values)
- POST anything                200, the status callback; nothing is recorded
- GET  /drive/v3/files/<id>    the Bower folder check: there, not in the Bin
- GET  /drive/v3/files?q=...   the instruction-origin listing: every
                               `Bower - *.md` directly in <inbox dir>, as if
                               the app had written it

run-bench.sh's curl wrapper sends Drive's URLs here. Nothing else is served.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

INBOX = Path(sys.argv[1])
PORT_FILE = Path(sys.argv[2])

VAULT_INFO = {
    'folderId': 'BENCH_FOLDER',
    'inboxFolderId': 'BENCH_INBOX',
    'driveAccessToken': 'bench-drive-token',
    'expiresAt': '2099-01-01T00:00:00.000Z',
    'maxTurns': 60,
}


class Handler(BaseHTTPRequestHandler):
    def answer(self, body: object) -> None:
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802 (http.server's name)
        path = self.path.split('?', 1)[0]
        if path.startswith('/runner/vaults/'):
            self.answer(VAULT_INFO)
        elif path == '/drive/v3/files':
            names = sorted(
                p.name
                for p in INBOX.iterdir()
                if p.is_file() and p.name.lower().startswith('bower - ') and p.name.endswith('.md')
            )
            self.answer({'files': [{'name': n} for n in names]})
        elif path.startswith('/drive/v3/files/'):
            self.answer({'id': path.rsplit('/', 1)[1], 'trashed': False})
        else:
            self.send_error(404)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get('Content-Length') or 0)
        if length:
            self.rfile.read(length)
        self.answer({'ok': True})

    def log_message(self, *args: object) -> None:
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
PORT_FILE.write_text(str(server.server_address[1]))
server.serve_forever()
