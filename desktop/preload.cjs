const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('structogramDesktop', {
  saveFile: payload => ipcRenderer.invoke('file:save', payload),
  openFile: () => ipcRenderer.invoke('file:open'),
  print: () => ipcRenderer.invoke('document:print'),
  onMenuAction: callback => {
    ipcRenderer.on('menu:action', (_event, action) => {
      if (['new', 'open', 'save', 'print', 'guide', 'undo', 'redo'].includes(action)) callback(action);
    });
  }
});
