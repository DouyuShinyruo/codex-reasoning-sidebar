import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8792);
const codexHome = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || os.homedir(), '.codex');
const sessionsRoot = path.join(codexHome, 'sessions');

// A session counts as "recently active" for this long after its last write.
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
// Keep following the current session for this long after its last write, even
// if another session also wrote something. Prevents ping-ponging between two
// simultaneously active windows.
const STICKY_WINDOW_MS = 2500;
// When attaching to a session (start or switch), only replay the tail instead
// of the whole file, so the sidebar becomes useful immediately.
// REPLAY_TAIL_KB=0 replays the full session history instead.
const TAIL_BYTES = Math.max(0, Number(process.env.REPLAY_TAIL_KB ?? 64)) * 1024;

const clients = new Set();
let currentFile = null;
let currentOffset = 0;
let carry = '';
let lastSwitchNotified = '';
let scanTimer = null;
const recentItems = new Map();
// Ring buffer of recently broadcast items. Late-joining clients (e.g. a
// floating window opened later) receive this as instant catch-up history.
const history = [];
const HISTORY_MAX = 300;
// True while draining the tail of a freshly attached session; those entries
// are marked as replay so clients render them instantly, not typewriter-style.
let replaying = false;

// path -> last observed { size, mtime }
const fileTimes = new Map();
// path -> Date.now() of the last poll in which the file changed
const lastWrite = new Map();
// path -> { id, label } parsed from the session_meta header line
const sessionMeta = new Map();

function walkRollouts(dir, depth = 0) {
  if (depth > 4) return [];
  let out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) out = out.concat(walkRollouts(path.join(dir, e.name), depth + 1));
    else if (e.isFile() && /^rollout-.+\.jsonl$/.test(e.name)) {
      const full = path.join(dir, e.name);
      try {
        const st = fs.statSync(full);
        out.push({ full, mtime: st.mtimeMs, size: st.size });
      } catch {}
    }
  }
  return out;
}

function scanSessions() {
  const all = walkRollouts(sessionsRoot);
  const now = Date.now();
  for (const f of all) {
    const prev = fileTimes.get(f.full);
    if (prev === undefined) {
      // First sighting: seed activity from mtime so a recently-used session
      // can win immediately on startup.
      lastWrite.set(f.full, f.mtime);
    } else if (f.size !== prev.size || f.mtime > prev.mtime) {
      // Activity = size change (appended events) OR an mtime-only touch.
      // Focusing an already-loaded idle session touches the file without
      // appending anything; that touch is the only focus signal we get.
      lastWrite.set(f.full, now);
    }
    fileTimes.set(f.full, { size: f.size, mtime: f.mtime });
  }
  // Forget sessions that have been quiet for a long time.
  const cutoff = now - ACTIVE_WINDOW_MS;
  for (const p of lastWrite.keys()) {
    if ((lastWrite.get(p) || 0) < cutoff) {
      lastWrite.delete(p);
      fileTimes.delete(p);
      sessionMeta.delete(p);
    }
  }
  return all;
}

function readSessionMeta(file) {
  if (sessionMeta.has(file)) return sessionMeta.get(file);
  let info = { id: null, label: null };
  let handle;
  try {
    handle = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(32768, fs.fstatSync(handle).size));
    fs.readSync(handle, buf, 0, buf.length, 0);
    const firstLine = buf.toString('utf8').split('\n', 1)[0].trim();
    const obj = firstLine ? JSON.parse(firstLine) : null;
    if (obj && obj.type === 'session_meta') {
      const id = obj.payload?.session_id || obj.payload?.id || null;
      const cwd = obj.payload?.cwd || '';
      info = {
        id,
        label: cwd ? path.basename(cwd) : null,
      };
    }
  } catch {}
  finally {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch {}
    }
  }
  sessionMeta.set(file, info);
  return info;
}

function shortId(id) {
  return id ? `${id.slice(0, 4)}…${id.slice(-4)}` : '未知会话';
}

function pickSession() {
  scanSessions();
  const now = Date.now();

  // Stay with the current session while it is still producing output.
  if (currentFile) {
    const last = lastWrite.get(currentFile) || 0;
    if (now - last < STICKY_WINDOW_MS) return currentFile;
    if (!lastWrite.has(currentFile)) return currentFile; // quiet, but keep until a better candidate
  }

  // Follow whichever session wrote most recently.
  let best = null;
  let bestAt = -1;
  for (const [file, at] of lastWrite) {
    if (at > bestAt) {
      best = file;
      bestAt = at;
    }
  }
  if (best && now - bestAt < ACTIVE_WINDOW_MS) return best;

  // Nothing active recently: keep current, otherwise attach to the newest file.
  if (currentFile) return currentFile;
  const all = walkRollouts(sessionsRoot).sort((a, b) => b.mtime - a.mtime);
  return all[0] ? all[0].full : null;
}

function readNewEntries() {
  if (!currentFile) return [];
  let handle;
  try {
    handle = fs.openSync(currentFile, 'r');
  } catch {
    return [];
  }
  try {
    const st = fs.fstatSync(handle);
    if (st.size < currentOffset) {
      currentOffset = 0;
      carry = '';
    }
    if (st.size === currentOffset) return [];
    const buf = Buffer.alloc(st.size - currentOffset);
    fs.readSync(handle, buf, 0, buf.length, currentOffset);
    currentOffset = st.size;
    const text = buf.toString('utf8');
    carry += text;
    const parts = carry.split('\n');
    carry = parts.pop() || '';
    const entries = [];
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {}
    }
    return entries;
  } finally {
    fs.closeSync(handle);
  }
}

function mapEntry(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const ts = obj.timestamp || '';
  const p = obj.payload || {};
  if (obj.type === 'response_item') {
    if (p.type === 'reasoning') {
      const text = p.content?.[0]?.text || p.summary?.map((s) => s.text).filter(Boolean).join('\n') || '';
      if (!text) return null;
      return { kind: 'reasoning', ts, text };
    }
    if (p.type === 'function_call') {
      return { kind: 'tool', ts, text: `${p.name}(${p.arguments || ''})` };
    }
    if (p.type === 'message' && p.role === 'user') {
      const text = p.content?.map((c) => c.text || '').join('') || '';
      return text ? { kind: 'user', ts, text } : null;
    }
    if (p.type === 'message' && p.role === 'assistant') {
      const text = p.content?.map((c) => c.text || '').join('') || '';
      return text ? { kind: 'assistant', ts, text } : null;
    }
  }
  if (obj.type === 'event_msg') {
    if (p.type === 'agent_reasoning_raw_content' || p.type === 'agent_reasoning') {
      return p.text ? { kind: 'reasoning', ts, text: p.text } : null;
    }
    if (p.type === 'agent_message' && p.message) {
      return { kind: 'assistant', ts, text: p.message };
    }
    if (p.type === 'user_message' && p.message) {
      return { kind: 'user', ts, text: p.message };
    }
  }
  return null;
}

function broadcast(obj) {
  const payload = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) res.write(payload);
}

function emit(item, { replay = false } = {}) {
  const full = replay ? { ...item, replay: true } : item;
  broadcast(full);
  history.push(full);
  while (history.length > HISTORY_MAX) history.shift();
}

function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function dedupe(obj) {
  if (obj.kind === 'system') return true;
  const key = `${obj.kind}|${shortHash(obj.text)}`;
  const now = Date.now();
  const prev = recentItems.get(key);
  if (prev && now - prev < 30_000) return false;
  recentItems.set(key, now);
  if (recentItems.size > 500) {
    for (const [k, v] of recentItems) {
      if (now - v > 60_000) recentItems.delete(k);
    }
  }
  return true;
}

function switchTo(file) {
  currentFile = file;
  carry = '';
  history.length = 0;
  replaying = true;

  // Attach near the tail so switching is instant instead of replaying the
  // entire session history with the typewriter effect.
  let start = 0;
  try {
    const st = fs.statSync(file);
    if (st.size > TAIL_BYTES) {
      start = st.size - TAIL_BYTES;
      const handle = fs.openSync(file, 'r');
      try {
        const buf = Buffer.alloc(Math.min(st.size - start, 4096));
        fs.readSync(handle, buf, 0, buf.length, start);
        const nl = buf.indexOf(10);
        start = nl >= 0 ? start + nl + 1 : 0; // align to the next full line
      } finally {
        fs.closeSync(handle);
      }
    }
  } catch {}
  currentOffset = start;

  const info = readSessionMeta(file);
  const note = info.label
    ? `已监听 ${info.label}（${shortId(info.id)}）`
    : `已监听会话 ${shortId(info.id)}`;
  if (note !== lastSwitchNotified) {
    lastSwitchNotified = note;
    broadcast({ kind: 'system', ts: new Date().toISOString(), text: note });
  }
}

function poll() {
  const latest = pickSession();
  if (!latest) return;
  if (!currentFile || latest !== currentFile) switchTo(latest);
  const entries = readNewEntries();
  for (const raw of entries) {
    const mapped = mapEntry(raw);
    if (mapped && dedupe(mapped)) emit(mapped, { replay: replaying });
  }
  replaying = false;
}

scanTimer = setInterval(poll, 1000);
poll();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/') {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ kind: 'system', ts: new Date().toISOString(), text: '已连接' })}\n\n`);
    if (currentFile) {
      const info = readSessionMeta(currentFile);
      const note = info.label
        ? `已监听 ${info.label}（${shortId(info.id)}）`
        : `已监听会话 ${shortId(info.id)}`;
      res.write(`data: ${JSON.stringify({ kind: 'system', ts: new Date().toISOString(), text: note })}\n\n`);
    }
    // Catch the new client up with recent history so a freshly opened window
    // shows the session context immediately.
    for (const item of history) {
      res.write(`data: ${JSON.stringify({ ...item, catchup: true })}\n\n`);
    }
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/session') {
    const info = currentFile ? readSessionMeta(currentFile) : { id: null, label: null };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      file: currentFile || null,
      session: info.id,
      label: info.label,
    }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`codex reasoning sidebar on http://127.0.0.1:${port}`);
});

function shutdown() {
  clearInterval(scanTimer);
  for (const res of clients) res.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
