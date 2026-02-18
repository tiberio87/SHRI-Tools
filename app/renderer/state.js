// Shared mutable state for renderer modules; keep in sync with UI lifecycle.
export const state = {
  targetPath: null,
  kind: null,
  videoFiles: [],
  mainVideo: null,
  mediaInfo: null,
  bdInfoRaw: '',
  bdInfoParsed: null,
  bdInfoError: '',
  bdInfoLoading: false,
  bdInfoTarget: '',
  bdInfoProgress: 0,
  bdInfoStage: '',
  bdInfoStageText: '',
  bdInfoRequestId: '',
  bdInfoPlaylists: [],
  bdInfoSelectedPlaylist: '',
  bdInfoProgressTotal: 0,
  bdInfoProgressDone: 0,
  bdInfoShowAllPlaylists: false,
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
  screenshotsMeta: null,
  trackerId: '',
  trackerName: '',
  trackerData: null,
  trackerMediaInfoText: ''
};

// In-memory debug log (UI only, not persisted).
export const debugState = {
  enabled: true,
  buffer: [],
  maxEntries: 400
};
