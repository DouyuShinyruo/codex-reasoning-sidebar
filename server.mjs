import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8792);
const codexHome = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || 'C:/Users/34169', '.codex');
const sessionsRoot = path.join(codexHome, 'sessions');

const clients = new Set();
let currentFile = null;
let currentOffset = 0;
let carry = '';
let lastSwitchNotified = '';
let scanTimer = null;
const recentItems = new Map();

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

function findLatestFile() {
  const all = walkRollouts(sessionsRoot);
  if (!all.length) return null;
  const now = Date.now();
  const active = all
    .filter((f) => now - f.mtime < 10 * 60 * 1000)
    .sort((a, b) => b.mtime - a.mtime);
  return (active[0] || all.sort((a, b) => b.mtime - a.mtime)[0]).full;
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
  currentOffset = 0;
  carry = '';
  const id = path.basename(file).match(/([0-9a-f-]{36})/)?.[1] || file;
  const note = `已监听会话 ${id}`;
  if (note !== lastSwitchNotified) {
    lastSwitchNotified = note;
    broadcast({ kind: 'system', ts: new Date().toISOString(), text: note });
  }
}

function poll() {
  const latest = findLatestFile();
  if (!latest) return;
  if (!currentFile || latest !== currentFile) switchTo(latest);
  const entries = readNewEntries();
  for (const raw of entries) {
    const mapped = mapEntry(raw);
    if (mapped && dedupe(mapped)) broadcast(mapped);
  }
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
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/session') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      file: currentFile || null,
      session: currentFile ? (path.basename(currentFile).match(/([0-9a-f-]{36})/)?.[1] || null) : null,
    }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`reasoning sidebar on http://127.0.0.1:${port}`);
});

function shutdown() {
  clearInterval(scanTimer);
  for (const res of clients) res.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
