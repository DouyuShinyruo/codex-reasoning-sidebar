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
from webview.window import FixPoint

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
    def __init__(self):
        self.win = None
        self.x = self.y = self.w = self.h = 0

    def bind(self, win, x, y, w, h):
        self.win = win
        self.x, self.y, self.w, self.h = x, y, w, h

    def _clamp(self, w, h):
        screen = webview.screens[0]
        return (
            max(300, min(w, int(screen.width * 0.95))),
            max(240, min(h, int(screen.height * 0.98))),
        )

    def resize_by(self, dx=0, dy=0):
        """Resize by a delta in logical (CSS) pixels.

        pywebview converts to physical pixels and performs ONE atomic
        SetWindowPos call, anchoring the top-right corner.
        """
        if not self.win:
            return False
        try:
            dx, dy = int(dx), int(dy)
        except (TypeError, ValueError):
            return False
        w, h = self._clamp(self.w + dx, self.h + dy)
        self.w, self.h = w, h
        self.win.resize(w, h, FixPoint.NORTH | FixPoint.EAST)
        return True

    def apply_size(self, w, h):
        """Restore a saved size, docked to the right edge of the screen."""
        if not self.win:
            return False
        try:
            w, h = int(w), int(h)
        except (TypeError, ValueError):
            return False
        screen = webview.screens[0]
        w, h = self._clamp(w, h)
        self.w, self.h = w, h
        self.x = max(10, screen.width - w - 10)
        self.y = self.y or max(int(screen.height * 0.04), 10)
        self.win.move(self.x, self.y)
        self.win.resize(w, h, FixPoint.NORTH | FixPoint.WEST)
        return True

    def get_size(self):
        return {"w": self.w, "h": self.h}

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

    # Persistent WebView2 profile: more reliable startup than a fresh temp
    # user-data-folder per launch, and localStorage (theme, saved size)
    # survives restarts.
    storage_path = os.path.join(
        os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
        "codex-reasoning-sidebar",
    )

    width = 430
    height = int(screen.height * 0.86)
    x = max(screen.width - width - 10, 10)
    y = max(int(screen.height * 0.04), 10)

    api = Api()
    window = webview.create_window(
        "Codex 思维链",
        URL,
        js_api=api,
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
    api.bind(window, x, y, width, height)
    webview.start(private_mode=False, storage_path=storage_path)


if __name__ == "__main__":
    main()
