export const state = {
  targetPath: null,
  kind: null,
  videoFiles: [],
  mainVideo: null,
  mediaInfo: null,
  mainExtension: '',
  audioLangs: [],
  episodeMap: {},
  tagSuggestion: '',
  autoDetectRunning: false,
  lastTagSuggestion: '',
  lastTagResolveKey: ''
};

export const debugState = {
  enabled: true,
  buffer: [],
  maxEntries: 400
};
