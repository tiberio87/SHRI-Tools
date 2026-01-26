const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectAnyFile: () => ipcRenderer.invoke('select-any-file'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanPath: (targetPath) => ipcRenderer.invoke('scan-path', targetPath),
  getMediaInfoText: (filePath) => ipcRenderer.invoke('mediainfo-text', filePath),
  readServices: () => ipcRenderer.invoke('read-services'),
  previewRename: (payload) => ipcRenderer.invoke('preview-rename', payload),
  applyRename: (payload) => ipcRenderer.invoke('apply-rename', payload),
  fetchMetadata: (payload) => ipcRenderer.invoke('fetch-metadata', payload),
  verifyApiKey: (payload) => ipcRenderer.invoke('verify-api-key', payload),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  createTorrent: (payload) => ipcRenderer.invoke('create-torrent', payload),
  unit3dUpload: (payload) => ipcRenderer.invoke('unit3d-upload', payload),
  unit3dDownloadTorrent: (payload) => ipcRenderer.invoke('unit3d-download-torrent', payload),
  qbitAddTorrent: (payload) => ipcRenderer.invoke('qbit-add-torrent', payload),
  qbitTest: (payload) => ipcRenderer.invoke('qbit-test', payload),
  transmissionAddTorrent: (payload) => ipcRenderer.invoke('transmission-add-torrent', payload),
  transmissionTest: (payload) => ipcRenderer.invoke('transmission-test', payload),
  generateScreenshots: (payload) => ipcRenderer.invoke('generate-screenshots', payload),
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  onTorrentProgress: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('torrent-progress', listener);
    return () => ipcRenderer.removeListener('torrent-progress', listener);
  },
  onScreensProgress: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('screens-progress', listener);
    return () => ipcRenderer.removeListener('screens-progress', listener);
  }
});
