const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanPath: (targetPath) => ipcRenderer.invoke('scan-path', targetPath),
  getMediaInfoText: (filePath) => ipcRenderer.invoke('mediainfo-text', filePath),
  readServices: () => ipcRenderer.invoke('read-services'),
  previewRename: (payload) => ipcRenderer.invoke('preview-rename', payload),
  applyRename: (payload) => ipcRenderer.invoke('apply-rename', payload),
  fetchMetadata: (payload) => ipcRenderer.invoke('fetch-metadata', payload),
  verifyApiKey: (payload) => ipcRenderer.invoke('verify-api-key', payload),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
