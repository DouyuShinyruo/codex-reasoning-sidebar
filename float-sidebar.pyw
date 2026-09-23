"""Floating always-on-top window for the Codex reasoning sidebar.

Double-click this file (it runs with pythonw.exe, so no console appears).
It makes sure the local server is running, then opens a frameless,
always-on-top, draggable window docked to the right edge of the screen.

Requires: pywebview (pip install pywebview)
"""

import os
import subprocess
import sys
import time
import urllib.request

import webview

URL = os.environ.get("CODEX_REASONING_URL", "http://127.0.0.1:8792/")
HERE = os.path.dirname(os.path.abspath(__file__))


def server_alive(timeout=1.5):
    try:
        with urllib.request.urlopen(URL, timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def start_server():
    node = "node"
    server = os.path.join(HERE, "server.mjs")
    if not os.path.exists(server):
        return
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.Popen(
        [node, server],
        cwd=HERE,
        creationflags=creationflags,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


class Api:
    def quit(self):
        for w in webview.windows:
            w.destroy()
        return True


def main():
    if not server_alive():
        start_server()
        for _ in range(40):  # wait up to ~5s for the server
            if server_alive(0.5):
                break
            time.sleep(0.125)

    screen = webview.screens[0]
    width = 430
    height = int(screen.height * 0.86)
    x = max(screen.width - width - 10, 10)
    y = max(int(screen.height * 0.04), 10)

    webview.create_window(
        "Codex 思维链",
        URL,
        js_api=Api(),
        frameless=True,
        on_top=True,
        easy_drag=True,
        resizable=True,
        width=width,
        height=height,
        x=x,
        y=y,
        background_color="#111318",
    )
    webview.start()


if __name__ == "__main__":
    main()
