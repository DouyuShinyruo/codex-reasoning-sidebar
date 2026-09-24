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

function log(...args) {
  try {
    fs.appendFileSync(path.join(__dirname, 'float-main.log'),
      `${new Date().toISOString()} ${args.join(' ')}\n`);
  } catch {}
}

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
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) {
      return { ...s, pinned: s.pinned !== false };
    }
  } catch {}
  return null;
}

let saveTimer = null;
let pinned = true;

function persistBounds(win) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const b = { ...win.getBounds(), pinned };
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify(b));
    } catch {}
  }, 500);
}

function createWindow() {
  const work = screen.getPrimaryDisplay().workArea;
  const state = readState();
  pinned = state ? state.pinned !== false : true;
  const width = state?.width || 430;
  const height = state?.height || Math.round(work.height * 0.86);
  let x = Number.isFinite(state?.x) ? state.x : work.x + work.width - width - 10;
  let y = Number.isFinite(state?.y) ? state.y : Math.max(Math.round(work.height * 0.04), 10);

  // Sanity check: if the saved position is no longer on any visible display
  // (resolution/monitor changed), fall back to the default docked position.
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return x + width > a.x + 20 && x < a.x + a.width - 20
      && y + height > a.y + 20 && y < a.y + a.height - 20;
  });
  if (!visible) {
    x = work.x + work.width - width - 10;
    y = Math.max(Math.round(work.height * 0.04), 10);
  }

  const win = new BrowserWindow({
    title: 'Codex 思维链',
    frame: false,
    resizable: true,
    alwaysOnTop: pinned,
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
  win.show();
  win.on('resize', () => persistBounds(win));
  win.on('move', () => persistBounds(win));
  win.on('close', () => {
    clearTimeout(saveTimer);
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify({ ...win.getBounds(), pinned }));
    } catch {}
  });
  win.on('closed', () => app.quit());
  win.webContents.on('did-finish-load', () => {
    try { win.webContents.send('sidebar-pinned', pinned); } catch {}
  });
  return win;
}

let win = null;

if (!app.requestSingleInstanceLock()) {
  log('no single instance lock, quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    log('second-instance: win?', !!win);
    // Self-heal: if the running instance somehow has no window, recreate it.
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else {
      win = createWindow();
    }
  });

  app.whenReady().then(async () => {
    try {
      log('ready, ensuring server');
      await ensureServer();
      log('server ok, creating window');
      win = createWindow();
      log('window created id=' + win.id);
      ipcMain.on('sidebar-quit', () => win.destroy());
      ipcMain.on('sidebar-pin', (_e, v) => {
        pinned = !!v;
        if (win) win.setAlwaysOnTop(pinned);
        try { win.webContents.send('sidebar-pinned', pinned); } catch {}
      });
    } catch (err) {
      log('STARTUP ERROR:', err && err.stack ? err.stack : String(err));
    }
  });
}

app.on('window-all-closed', () => app.quit());
