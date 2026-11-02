# -*- coding: utf-8 -*-
"""产物预览服务器：强制 no-store，杜绝任何缓存层拿旧构建。"""
import os
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8617


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print('serving %s at http://127.0.0.1:%d' % (ROOT, PORT), flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
