const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectAnyFile: () => ipcRenderer.invoke('select-any-file'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanPath: (targetPath) => ipcRenderer.invoke('scan-path', targetPath),
  getMediaInfoText: (filePath) => ipcRenderer.invoke('mediainfo-text', filePath),
  getBdInfoText: (payload) => ipcRenderer.invoke('bdinfo-text', payload),
  cancelBdInfo: (payload) => ipcRenderer.invoke('bdinfo-cancel', payload),
  readServices: () => ipcRenderer.invoke('read-services'),
  previewRename: (payload) => ipcRenderer.invoke('preview-rename', payload),
  applyRename: (payload) => ipcRenderer.invoke('apply-rename', payload),
  fetchMetadata: (payload) => ipcRenderer.invoke('fetch-metadata', payload),
  verifyApiKey: (payload) => ipcRenderer.invoke('verify-api-key', payload),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  createTorrent: (payload) => ipcRenderer.invoke('create-torrent', payload),
  unit3dUpload: (payload) => ipcRenderer.invoke('unit3d-upload', payload),
  unit3dFetchTorrent: (payload) => ipcRenderer.invoke('unit3d-fetch-torrent', payload),
  unit3dDownloadTorrent: (payload) => ipcRenderer.invoke('unit3d-download-torrent', payload),
  unit3dSearchDuplicates: (payload) => ipcRenderer.invoke('unit3d-search-duplicates', payload),
  qbitAddTorrent: (payload) => ipcRenderer.invoke('qbit-add-torrent', payload),
  qbitTest: (payload) => ipcRenderer.invoke('qbit-test', payload),
  transmissionAddTorrent: (payload) => ipcRenderer.invoke('transmission-add-torrent', payload),
  transmissionTest: (payload) => ipcRenderer.invoke('transmission-test', payload),
  generateScreenshots: (payload) => ipcRenderer.invoke('generate-screenshots', payload),
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  uaStart: (payload) => ipcRenderer.invoke('ua-start', payload),
  uaSendInput: (text) => ipcRenderer.invoke('ua-input', text),
  uaStop: () => ipcRenderer.invoke('ua-stop'),
  uaReadConfig: (payload) => ipcRenderer.invoke('ua-read-config', payload),
  uaCheckVersion: (payload) => ipcRenderer.invoke('ua-check-version', payload),
  uaOpenUpdateTerminal: (payload) => ipcRenderer.invoke('ua-open-update-terminal', payload),
  uaUpdateStart: (payload) => ipcRenderer.invoke('ua-update-start', payload),
  uaUpdateSendInput: (text) => ipcRenderer.invoke('ua-update-input', text),
  uaUpdateStop: () => ipcRenderer.invoke('ua-update-stop'),
  getFilePath: (file) => (file ? webUtils.getPathForFile(file) : ''),
  onTorrentProgress: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('torrent-progress', listener);
    return () => ipcRenderer.removeListener('torrent-progress', listener);
  },
  onScreensProgress: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('screens-progress', listener);
    return () => ipcRenderer.removeListener('screens-progress', listener);
  },
  onBdInfoProgress: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('bdinfo-progress', listener);
    return () => ipcRenderer.removeListener('bdinfo-progress', listener);
  },
  onUaOutput: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('ua-output', listener);
    return () => ipcRenderer.removeListener('ua-output', listener);
  },
  onUaExit: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('ua-exit', listener);
    return () => ipcRenderer.removeListener('ua-exit', listener);
  },
  onUaUpdateOutput: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('ua-update-output', listener);
    return () => ipcRenderer.removeListener('ua-update-output', listener);
  },
  onUaUpdateExit: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('ua-update-exit', listener);
    return () => ipcRenderer.removeListener('ua-update-exit', listener);
  }
});
