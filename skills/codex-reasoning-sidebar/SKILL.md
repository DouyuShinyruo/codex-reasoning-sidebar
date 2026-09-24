---
name: codex-reasoning-sidebar
description: Show the current Codex window's live reasoning chain in the in-app browser side panel. Use when the user asks to open, start, stop, or check the Codex reasoning sidebar.
---

# Codex Reasoning Sidebar

The plugin ships a local HTTP + SSE server that tails the most recently active Codex session file and streams reasoning text to a browser page with typing-style display.

## Start

1. Run `powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin>/start-codex-reasoning-sidebar.ps1"`.
2. Open `http://127.0.0.1:8792/` in the Codex in-app browser (side panel).

Or launch the floating always-on-top window instead:

1. Run `powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin>/start-codex-reasoning-sidebar-float.ps1"` (installs the Electron runtime automatically on first run).
2. A frameless draggable window opens docked to the right edge of the screen; it also starts the server automatically.
3. Drag the title bar to move the window; all edges and corners resize natively; size and position are remembered.
4. The 📌 pin button toggles always-on-top (default on, persisted).

The server auto-follows whichever Codex session is writing most recently, so switching windows switches the feed automatically.

## Stop

Run `powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin>/stop-codex-reasoning-sidebar.ps1"`.

## Behavior rules

- The feed shows reasoning, assistant messages, tool calls, and user messages; reasoning is the default filter.
- If the user says the feed shows duplicates, the server already deduplicates identical reasoning events within 30 seconds.
- If the page was opened as `file://...`, tell the user to use `http://127.0.0.1:8792/` instead, because SSE only works over HTTP.
- If the port is taken by another local service, the server must be restarted on a free port and the new URL opened.
- Theme follows the OS by default; the user can cycle 自动 / 浅色 / 深色 with the header button and the choice is remembered.
- All four filters (reasoning / assistant / tool / user) are enabled by default.
- The 调用 button toggles a tool-call index strip; clicking a chip jumps to and highlights that entry.
- Ctrl+F opens in-page search (Enter / Shift+Enter to cycle matches, Esc to close).
- The search bar has VSCode-style toggles: match case (Alt+C), whole word (Alt+W), regex (Alt+R); invalid regex shows an error hint.
