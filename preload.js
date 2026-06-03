const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStoredSecrets: () => ipcRenderer.sendSync('secret-store:get'),
  setStoredSecrets: (settings) => ipcRenderer.sendSync('secret-store:set', settings),
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
  reuploadScreenshots: (payload) => ipcRenderer.invoke('reupload-screenshots', payload),
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
  saveFileDirect: (payload) => ipcRenderer.invoke('save-file-direct', payload),
  listDir: (dirPath) => ipcRenderer.invoke('list-dir', dirPath),
  readFileText: (filePath) => ipcRenderer.invoke('read-file-text', filePath),
  mkvGetTracks: (payload) => ipcRenderer.invoke('mkv-get-tracks', payload),
  mkvApplyTags: (payload) => ipcRenderer.invoke('mkv-apply-tags', payload),
  mkvClearTags: (payload) => ipcRenderer.invoke('mkv-clear-tags', payload),
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
  }
});
