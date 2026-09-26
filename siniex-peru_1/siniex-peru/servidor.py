#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servidor local para SINIEX PERU.
Uso:  python servidor.py        ->  http://localhost:8000

Sirve el sitio en localhost (recomendado si vas a conectar la API de
PostgreSQL: abriendo index.html con doble clic el navegador puede
bloquear las llamadas a http://localhost:5000).
"""
import http.server
import os
import socketserver
import webbrowser

PUERTO = int(os.environ.get("PORT", "8000"))
RAIZ = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=RAIZ, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, formato, *args):
        pass  # sin ruido en consola


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PUERTO), Handler) as httpd:
        url = "http://localhost:%d" % PUERTO
        print("SINIEX PERU  ->  %s   (Ctrl+C para detener)" % url)
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")
