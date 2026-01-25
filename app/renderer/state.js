export const state = {
  targetPath: null,
  kind: null,
  videoFiles: [],
  mainVideo: null,
  mediaInfo: null,
  mainExtension: '',
  audioLangs: [],
  episodeMap: {},
  metadata: null,
  tagSuggestion: '',
  autoDetectRunning: false,
  lastTagSuggestion: '',
  lastTagResolveKey: '',
  lastTorrentPath: '',
  screenshots: [],
  screenshotsMeta: null
};

export const debugState = {
  enabled: true,
  buffer: [],
  maxEntries: 400
};
