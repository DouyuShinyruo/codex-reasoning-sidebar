const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sidebar', {
  quit: () => ipcRenderer.send('sidebar-quit'),
});
