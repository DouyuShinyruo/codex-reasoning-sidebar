import { app, BrowserWindow, screen, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.setName('codex-reasoning-sidebar');
const port = Number(process.env.PORT || 8792);
const url = `http://127.0.0.1:${port}/`;

function serverAlive(timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeout, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  if (await serverAlive()) return true;
  const serverScript = path.join(__dirname, 'server.mjs');
  if (!fs.existsSync(serverScript)) return false;
  spawn('node', [serverScript], {
    cwd: __dirname,
    windowsHide: true,
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 40; i++) {
    if (await serverAlive(500)) return true;
    await new Promise((r) => setTimeout(r, 125));
  }
  return false;
}

function readState() {
  try {
    const raw = fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8');
    const s = JSON.parse(raw);
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch {}
  return null;
}

let saveTimer = null;
function persistBounds(win) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const b = win.getBounds();
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify(b));
    } catch {}
  }, 500);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    await ensureServer();

    const work = screen.getPrimaryDisplay().workArea;
    const state = readState();
    const width = state?.width || 430;
    const height = state?.height || Math.round(work.height * 0.86);
    const x = Number.isFinite(state?.x) ? state.x : work.x + work.width - width - 10;
    const y = Number.isFinite(state?.y) ? state.y : Math.max(Math.round(work.height * 0.04), 10);

    const win = new BrowserWindow({
      title: 'Codex 思维链',
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      backgroundColor: '#111318',
      width,
      height,
      x,
      y,
      webPreferences: {
        preload: path.join(__dirname, 'float-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.loadURL(url);
    win.on('resize', () => persistBounds(win));
    win.on('move', () => persistBounds(win));
    win.on('close', () => {
      clearTimeout(saveTimer);
      try {
        fs.mkdirSync(app.getPath('userData'), { recursive: true });
        fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify(win.getBounds()));
      } catch {}
    });
    win.on('closed', () => app.quit());

    ipcMain.on('sidebar-quit', () => win.destroy());
  });
}

app.on('window-all-closed', () => app.quit());
