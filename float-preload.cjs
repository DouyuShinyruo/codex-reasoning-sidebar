const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sidebar', {
  quit: () => ipcRenderer.send('sidebar-quit'),
  setPinned: (v) => ipcRenderer.send('sidebar-pin', !!v),
  onPinned: (cb) => ipcRenderer.on('sidebar-pinned', (_e, v) => cb(!!v)),
});
