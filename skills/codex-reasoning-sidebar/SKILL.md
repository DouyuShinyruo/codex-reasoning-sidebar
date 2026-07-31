---
name: codex-reasoning-sidebar
description: Show the current Codex window's live reasoning chain in the in-app browser side panel. Use when the user asks to open, start, stop, or check the Codex reasoning sidebar.
---

# Codex Reasoning Sidebar

The plugin ships a local HTTP + SSE server that tails the most recently active Codex session file and streams reasoning text to a browser page with typing-style display.

## Start

1. Run `powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin>/start-codex-reasoning-sidebar.ps1"`.
2. Open `http://127.0.0.1:8792/` in the Codex in-app browser (side panel).

The server auto-follows whichever Codex session is writing most recently, so switching windows switches the feed automatically.

## Stop

Run `powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin>/stop-codex-reasoning-sidebar.ps1"`.

## Behavior rules

- The feed shows reasoning, assistant messages, tool calls, and user messages; reasoning is the default filter.
- If the user says the feed shows duplicates, the server already deduplicates identical reasoning events within 30 seconds.
- If the page was opened as `file://...`, tell the user to use `http://127.0.0.1:8792/` instead, because SSE only works over HTTP.
- If the port is taken by another local service, the server must be restarted on a free port and the new URL opened.
