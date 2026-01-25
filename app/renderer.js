const ui = {
  mediaInfoBadge: document.getElementById('mediaInfoBadge'),
  renameBadge: document.getElementById('renameBadge'),
  autoDetectToggle: document.getElementById('autoDetectToggle'),
  autoDetectBtn: document.getElementById('autoDetectBtn'),
  themeToggle: document.getElementById('themeToggle'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  mediaInfoModal: document.getElementById('mediaInfoModal'),
  mediaInfoText: document.getElementById('mediaInfoText'),
  mediaInfoPath: document.getElementById('mediaInfoPath'),
  closeMediaInfoBtn: document.getElementById('closeMediaInfoBtn'),
  formatRow: document.getElementById('formatRow'),
  openDebugBtn: document.getElementById('openDebugBtn'),
  debugModal: document.getElementById('debugModal'),
  debugLogText: document.getElementById('debugLogText'),
  closeDebugBtn: document.getElementById('closeDebugBtn'),
  clearDebugBtn: document.getElementById('clearDebugBtn'),
  selectFileBtn: document.getElementById('selectFileBtn'),
  selectFolderBtn: document.getElementById('selectFolderBtn'),
  resetSourceBtn: document.getElementById('resetSourceBtn'),
  selectedPath: document.getElementById('selectedPath'),
  scanHint: document.getElementById('scanHint'),
  imdbInput: document.getElementById('imdbInput'),
  tvdbInput: document.getElementById('tvdbInput'),
  fetchStatus: document.getElementById('fetchStatus'),
  fetchBadge: document.getElementById('fetchBadge'),
  typeSelect: document.getElementById('typeSelect'),
  formatSelect: document.getElementById('formatSelect'),
  formatSelectBtn: document.getElementById('formatSelectBtn'),
  formatDropdown: document.getElementById('formatDropdown'),
  formatDropdownMenu: document.getElementById('formatDropdownMenu'),
  titleInput: document.getElementById('titleInput'),
  yearInput: document.getElementById('yearInput'),
  includeYear: document.getElementById('includeYear'),
  seasonInput: document.getElementById('seasonInput'),
  episodeInput: document.getElementById('episodeInput'),
  episodeTitleInput: document.getElementById('episodeTitleInput'),
  partInput: document.getElementById('partInput'),
  seasonEpisodeGroup: document.getElementById('seasonEpisodeGroup'),
  episodeTitleGroup: document.getElementById('episodeTitleGroup'),
  originalLanguageInput: document.getElementById('originalLanguageInput'),
  languageTagInput: document.getElementById('languageTagInput'),
  audioLangHint: document.getElementById('audioLangHint'),
  audioCodecInput: document.getElementById('audioCodecInput'),
  audioCodecSelectBtn: document.getElementById('audioCodecSelectBtn'),
  audioCodecDropdown: document.getElementById('audioCodecDropdown'),
  audioCodecDropdownMenu: document.getElementById('audioCodecDropdownMenu'),
  audioChannelsInput: document.getElementById('audioChannelsInput'),
  audioChannelsSelectBtn: document.getElementById('audioChannelsSelectBtn'),
  audioChannelsDropdown: document.getElementById('audioChannelsDropdown'),
  audioChannelsDropdownMenu: document.getElementById('audioChannelsDropdownMenu'),
  audioMetaInput: document.getElementById('audioMetaInput'),
  resolutionInput: document.getElementById('resolutionInput'),
  resolutionSelectBtn: document.getElementById('resolutionSelectBtn'),
  resolutionDropdown: document.getElementById('resolutionDropdown'),
  resolutionDropdownMenu: document.getElementById('resolutionDropdownMenu'),
  videoCodecInput: document.getElementById('videoCodecInput'),
  videoCodecSelectBtn: document.getElementById('videoCodecSelectBtn'),
  videoCodecDropdown: document.getElementById('videoCodecDropdown'),
  videoCodecDropdownMenu: document.getElementById('videoCodecDropdownMenu'),
  uhdCheckbox: document.getElementById('uhdCheckbox'),
  hdrCheckbox: document.getElementById('hdrCheckbox'),
  hdr10plusCheckbox: document.getElementById('hdr10plusCheckbox'),
  dvCheckbox: document.getElementById('dvCheckbox'),
  threeDCheckbox: document.getElementById('threeDCheckbox'),
  threeDWrapper: document.getElementById('threeDWrapper'),
  editionInput: document.getElementById('editionInput'),
  hybridCheckbox: document.getElementById('hybridCheckbox'),
  repackSelect: document.getElementById('repackSelect'),
  serviceInput: document.getElementById('serviceInput'),
  sourceInputBtn: document.getElementById('sourceInputBtn'),
  sourceDropdown: document.getElementById('sourceDropdown'),
  sourceDropdownMenu: document.getElementById('sourceDropdownMenu'),
  sourceInput: document.getElementById('sourceInput'),
  regionInput: document.getElementById('regionInput'),
  regionWrapper: document.getElementById('regionWrapper'),
  serviceGroup: document.getElementById('serviceGroup'),
  sourceGroup: document.getElementById('sourceGroup'),
  tagInput: document.getElementById('tagInput'),
  tagInputBtn: document.getElementById('tagInputBtn'),
  tagDropdown: document.getElementById('tagDropdown'),
  tagDropdownMenu: document.getElementById('tagDropdownMenu'),
  renameFileCheckbox: document.getElementById('renameFileCheckbox'),
  renameFolderCheckbox: document.getElementById('renameFolderCheckbox'),
  applyRenameBtn: document.getElementById('applyRenameBtn'),
  renameHint: document.getElementById('renameHint'),
  fileNamePreview: document.getElementById('fileNamePreview'),
  folderNamePreview: document.getElementById('folderNamePreview'),
  renamePlanList: document.getElementById('renamePlanList'),
  warningList: document.getElementById('warningList'),
  omdbKeyInput: document.getElementById('omdbKeyInput'),
  tmdbKeyInput: document.getElementById('tmdbKeyInput'),
  tvdbKeyInput: document.getElementById('tvdbKeyInput'),
  preferredLanguageSelect: document.getElementById('preferredLanguageSelect'),
  serviceListInput: document.getElementById('serviceListInput'),
  tagListInput: document.getElementById('tagListInput'),
  autoTagDetectToggle: document.getElementById('autoTagDetectToggle'),
  serviceInputBtn: document.getElementById('serviceInputBtn'),
  serviceDropdown: document.getElementById('serviceDropdown'),
  serviceDropdownMenu: document.getElementById('serviceDropdownMenu'),
  repackSelectBtn: document.getElementById('repackSelectBtn'),
  repackDropdown: document.getElementById('repackDropdown'),
  openRulesBtn: document.getElementById('openRulesBtn'),
  rulesModal: document.getElementById('rulesModal'),
  rulesContent: document.getElementById('rulesContent'),
  closeRulesBtn: document.getElementById('closeRulesBtn'),
  openGroupDefaultsBtn: document.getElementById('openGroupDefaultsBtn'),
  groupDefaultsModal: document.getElementById('groupDefaultsModal'),
  groupDefaultsList: document.getElementById('groupDefaultsList'),
  closeGroupDefaultsBtn: document.getElementById('closeGroupDefaultsBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  settingsHint: document.getElementById('settingsHint'),
  confirmModal: document.getElementById('confirmModal'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmOkBtn: document.getElementById('confirmOkBtn'),
  toast: document.getElementById('toast')
};

const state = {
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

let toastTimer = null;
let toastHideTimer = null;
let confirmResolver = null;

const debugState = {
  enabled: true,
  buffer: [],
  maxEntries: 400
};

const SETTINGS_STORAGE_KEY = 'shri-renamer-settings';
const THEME_STORAGE_KEY = 'shri-renamer-theme';

const DEFAULT_GROUP_TAGS = [
  'Blackbit',
  'G66',
  'Ubi',
  'Prometheus',
  'NST',
  'Ned',
  'GP',
  'NovaRip',
  'Odino',
  'CreW',
  'YELLO',
  'SpyRo',
  'iVy',
  'NTb',
  'Morpheus',
  'MRSK',
  'T7',
  'TrollHD',
  'B66',
  'P67',
  'MIKE',
  'TRiADE',
  'Vitello',
  'gattopollo',
  'SAW',
  'Jsph69',
  'Mem',
  'BORDURE',
  'GeD',
  'IlSommo',
  'Pir8',
  'successfulcrab',
  'AMBER',
  'Me7alh',
  'Pennywise',
  'ToVaR',
  'playWEB',
  'DSR',
  'M109',
  'TVSmash',
  'bamboozle',
  'ettv',
  'memento',
  'TOXiC',
  'ETHEL',
  'AMCON',
  'cielos',
  'Darksidemux',
  'ELiTE',
  'lucidtv',
  'METCON',
  'tbs',
  'FHC',
  'FraMeSToR',
  'EPSiLON',
  'CiNEPHiLES',
  'SGF',
  'EbP',
  'ZioRip',
  'TheEmojiCrew',
  'CYBER',
  'LFi',
  'Krikk',
  'SBuR',
  'CtrlHD',
  'iSlaNd',
  'PRiME',
  'NAHOM',
  'TMT'
];

const LANG_MAP = {
  it: 'ITA',
  ita: 'ITA',
  italian: 'ITA',
  italiano: 'ITA',
  en: 'ENG',
  eng: 'ENG',
  english: 'ENG',
  fr: 'FRE',
  fre: 'FRE',
  fra: 'FRE',
  french: 'FRE',
  de: 'GER',
  deu: 'GER',
  ger: 'GER',
  german: 'GER',
  es: 'SPA',
  spa: 'SPA',
  spanish: 'SPA',
  pt: 'POR',
  por: 'POR',
  portuguese: 'POR',
  ja: 'JPN',
  jpn: 'JPN',
  japanese: 'JPN',
  ru: 'RUS',
  rus: 'RUS',
  russian: 'RUS',
  zh: 'CHI',
  zho: 'CHI',
  chi: 'CHI',
  chinese: 'CHI',
  ko: 'KOR',
  kor: 'KOR',
  korean: 'KOR',
  uk: 'UKR',
  ukr: 'UKR',
  ukrainian: 'UKR'
};

const DEFAULT_SERVICES = [];
let serviceDefaultsLoaded = false;

const RULES_SECTIONS = [
  {
    title: 'Regole generali',
    items: [
      {
        label: 'Separatore file/cartelle',
        pattern: 'Usiamo il punto "." tra i token. Stagione/Episodio: S01E01.'
      },
      {
        label: 'Lingue audio',
        pattern: 'Tag in maiuscolo, più lingue separate da "-": ITA-ENG / ITA-MULTI.'
      },
      {
        label: 'Tag gruppo',
        pattern: 'Aggiunto in coda con trattino: ... VCodec-Tag.'
      }
    ]
  },
  {
    title: 'Film',
    items: [
      {
        label: 'WEB-DL / WEBRip',
        pattern:
          'Titolo Anno LINGUA Edizione Hybrid Repack Risoluzione UHD Servizio WEB-DL ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Encode',
        pattern:
          'Titolo Anno LINGUA Edizione Hybrid Repack Risoluzione UHD Src ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Remux',
        pattern:
          'Titolo Anno 3D LINGUA Edizione Hybrid Repack Risoluzione UHD Src REMUX HDR VCodec ACodec Canali Meta-Tag'
      },
      {
        label: 'Full Disc',
        pattern:
          'Titolo Anno 3D Edizione Repack Risoluzione Regione UHD Src HDR VCodec ACodec Canali Meta-Tag'
      }
    ]
  },
  {
    title: 'Serie TV - Stagioni',
    items: [
      {
        label: 'WEB-DL / WEBRip',
        pattern:
          'Titolo Anno S## LINGUA Edizione Hybrid Repack Risoluzione UHD Servizio WEB-DL ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Encode',
        pattern:
          'Titolo Anno S## LINGUA Edizione Hybrid Repack Risoluzione UHD Src ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Remux',
        pattern:
          'Titolo Anno S## 3D LINGUA Edizione Hybrid Repack Risoluzione UHD Src REMUX HDR VCodec ACodec Canali Meta-Tag'
      },
      {
        label: 'Full Disc',
        pattern:
          'Titolo Anno S## 3D Edizione Repack Risoluzione Regione UHD Src HDR VCodec ACodec Canali Meta-Tag'
      }
    ]
  },
  {
    title: 'Serie TV - Episodi',
    items: [
      {
        label: 'WEB-DL / WEBRip',
        pattern:
          'Titolo Anno S##E## Tit_Ep Parte LINGUA Edizione Hybrid Repack Risoluzione UHD Servizio WEB-DL ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Encode',
        pattern:
          'Titolo Anno S##E## Tit_Ep Parte LINGUA Edizione Hybrid Repack Risoluzione UHD Src ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Remux',
        pattern:
          'Titolo Anno S##E## Tit_Ep Parte 3D LINGUA Edizione Hybrid Repack Risoluzione UHD Src REMUX HDR VCodec ACodec Canali Meta-Tag'
      }
    ]
  }
];

const AUDIO_CODEC_SCORE = {
  'DTS:X': 90,
  'TrueHD': 88,
  'DTS-HD MA': 86,
  'FLAC': 80,
  'DTS-HD HRA': 75,
  'DTS': 70,
  'DD+': 65,
  'DD': 60,
  'AAC': 50,
  'OPUS': 45
};

const STOP_WORDS = new Set([
  '2160P', '1080P', '720P', '576P', '480P',
  '4K', '8K',
  'WEB', 'WEBDL', 'WEB-DL', 'WEBRIP', 'WEBRIP',
  'BLURAY', 'BLU-RAY', 'REMUX', 'UHD', 'HDR', 'HDR10', 'HDR10+', 'DV', 'DOVI',
  'X264', 'X265', 'H264', 'H265', 'HEVC', 'AVC', 'AV1',
  'DTS', 'DTS-HD', 'DTSHD', 'TRUEHD', 'AAC', 'DD', 'DDP', 'EAC3', 'AC3', 'FLAC',
  'ATMOS', 'AURO3D', 'IMAX', 'EXTENDED', 'REPACK', 'PROPER', 'RERIP',
  'MULTI', 'ITA', 'ENG', 'FRE', 'GER', 'SPA', 'JPN', 'RUS'
]);

let previewTimer = null;

function setMediaInfoBadgeVisible(isVisible) {
  ui.mediaInfoBadge.classList.toggle('hidden', !isVisible);
  ui.mediaInfoBadge.classList.toggle('clickable', isVisible);
}

function updateRenameBadge(plan) {
  if (!ui.renameBadge) {
    return;
  }
  if (!state.targetPath) {
    ui.renameBadge.classList.add('hidden');
    ui.renameBadge.textContent = '';
    return;
  }

  const totalOps = Array.isArray(plan?.ops) ? plan.ops.length : 0;
  ui.renameBadge.textContent = `Rinomine: ${totalOps}`;
  ui.renameBadge.classList.remove('hidden');
}

function setHint(target, text) {
  target.textContent = text || '';
}

function setAutoFieldState(input, active) {
  if (!input) {
    return;
  }
  const field = input.closest('.field');
  if (!field) {
    return;
  }
  field.classList.toggle('auto-field', Boolean(active));
}

function applyTheme(theme) {
  const useLight = theme === 'light';
  document.body.classList.toggle('light', useLight);
  updateThemeToggleLabel();
}

function updateThemeToggleLabel() {
  if (!ui.themeToggle) {
    return;
  }
  const useLight = document.body.classList.contains('light');
  ui.themeToggle.setAttribute(
    'aria-label',
    useLight ? 'Attiva tema scuro' : 'Attiva tema chiaro'
  );
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  return 'dark';
}

function saveTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function updateDebugLogView() {
  if (!ui.debugLogText) {
    return;
  }
  ui.debugLogText.textContent = debugState.buffer.length
    ? debugState.buffer.join('\n')
    : 'Nessun log.';
}

function logDebug(message, data) {
  if (!debugState.enabled) {
    return;
  }
  const stamp = new Date().toISOString().slice(11, 19);
  const details = data !== undefined ? ` ${safeStringify(data)}` : '';
  const line = `[${stamp}] ${message}${details}`;
  debugState.buffer.push(line);
  if (debugState.buffer.length > debugState.maxEntries) {
    debugState.buffer.shift();
  }
  updateDebugLogView();
}

function setFetchBadge(mode, label) {
  ui.fetchBadge.classList.remove('auto', 'manual', 'hidden');
  if (mode === 'manual') {
    ui.fetchBadge.classList.add('manual');
  } else {
    ui.fetchBadge.classList.add('auto');
  }
  ui.fetchBadge.textContent = label;
}

function resetDropdown(input, trigger, label) {
  if (!input || !trigger) {
    return;
  }
  input.value = '';
  input.dataset.manual = 'false';
  input.dataset.auto = 'false';
  trigger.textContent = label;
  setAutoFieldState(input, false);
}

function resetMetadataInputs() {
  [
    ui.imdbInput,
    ui.tvdbInput,
    ui.titleInput,
    ui.yearInput,
    ui.seasonInput,
    ui.episodeInput,
    ui.episodeTitleInput,
    ui.partInput
  ].forEach((input) => {
    if (!input) {
      return;
    }
    input.value = '';
    input.dataset.manual = 'false';
  });

  if (ui.typeSelect) {
    ui.typeSelect.dataset.manual = 'false';
  }

  if (ui.fetchBadge) {
    ui.fetchBadge.classList.add('hidden');
  }
  setHint(ui.fetchStatus, '');

  resetDropdown(ui.tagInput, ui.tagInputBtn, 'Seleziona tag gruppo');
}

function resetAllInputs(options = {}) {
  resetMetadataInputs();

  if (ui.typeSelect) {
    ui.typeSelect.value = 'movie';
    ui.typeSelect.dataset.manual = 'false';
  }
  if (ui.formatSelect) {
    ui.formatSelect.value = 'WEB-DL';
    ui.formatSelect.dataset.manual = 'false';
    ui.formatSelect.dataset.auto = 'false';
    if (ui.formatSelectBtn) {
      ui.formatSelectBtn.textContent = 'WEB-DL';
    }
  }

  if (ui.includeYear) {
    ui.includeYear.checked = true;
  }
  [
    ui.resolutionInput,
    ui.videoCodecInput,
    ui.originalLanguageInput,
    ui.languageTagInput,
    ui.audioCodecInput,
    ui.audioChannelsInput,
    ui.audioMetaInput,
    ui.editionInput,
    ui.regionInput,
    ui.tagInput
  ].forEach((input) => {
    if (!input) {
      return;
    }
    input.value = '';
    input.dataset.manual = 'false';
    input.dataset.auto = 'false';
    setAutoFieldState(input, false);
  });

  [
    ui.uhdCheckbox,
    ui.hdrCheckbox,
    ui.hdr10plusCheckbox,
    ui.dvCheckbox,
    ui.threeDCheckbox,
    ui.hybridCheckbox
  ].forEach((checkbox) => {
    if (checkbox) {
      checkbox.checked = false;
    }
  });

  resetDropdown(ui.serviceInput, ui.serviceInputBtn, 'Seleziona servizio');
  resetDropdown(ui.repackSelect, ui.repackSelectBtn, 'Nessuno');
  resetDropdown(ui.sourceInput, ui.sourceInputBtn, 'Seleziona sorgente');
  resetDropdown(ui.tagInput, ui.tagInputBtn, 'Seleziona tag gruppo');
  resetDropdown(ui.resolutionInput, ui.resolutionSelectBtn, 'Seleziona risoluzione');
  resetDropdown(ui.videoCodecInput, ui.videoCodecSelectBtn, 'Seleziona codec');
  resetDropdown(ui.audioCodecInput, ui.audioCodecSelectBtn, 'Seleziona codec');
  resetDropdown(ui.audioChannelsInput, ui.audioChannelsSelectBtn, 'Seleziona canali');

  if (ui.audioLangHint) {
    ui.audioLangHint.textContent = 'Lingue audio rilevate: -';
  }

  if (ui.renameFileCheckbox) {
    ui.renameFileCheckbox.checked = true;
  }
  if (ui.renameFolderCheckbox) {
    ui.renameFolderCheckbox.checked = false;
    ui.renameFolderCheckbox.disabled = true;
  }

  if (ui.renameHint) {
    setHint(ui.renameHint, '');
  }
  if (ui.renamePlanList) {
    ui.renamePlanList.innerHTML = '';
  }
  if (ui.warningList) {
    ui.warningList.innerHTML = '';
  }
  if (ui.folderNamePreview) {
    ui.folderNamePreview.textContent = '-';
  }
  if (ui.fileNamePreview) {
    ui.fileNamePreview.textContent = '-';
  }

  if (ui.mediaInfoBadge) {
    setMediaInfoBadgeVisible(false);
  }
  if (ui.renameBadge) {
    ui.renameBadge.classList.add('hidden');
    ui.renameBadge.textContent = '';
  }

  updateAutoDetectControls();
  updateVisibility();
  if (!options.skipPreview) {
    refreshPreview();
  }
}

function resetSource() {
  state.targetPath = null;
  state.kind = null;
  state.videoFiles = [];
  state.mainVideo = null;
  state.mediaInfo = null;
  state.mainExtension = '';
  state.audioLangs = [];
  state.episodeMap = {};
  state.tagSuggestion = '';
  state.autoDetectRunning = false;

  ui.selectedPath.textContent = 'Nessun percorso selezionato.';
  setHint(ui.scanHint, '');
  ui.resetSourceBtn.classList.add('hidden');
  resetAllInputs();
  updateTagOptions(loadSettings());
}

function mapTypeLabel(value) {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) {
    return '';
  }
  if (normalized.includes('movie')) {
    return 'Film';
  }
  if (normalized.includes('tv') || normalized.includes('anime')) {
    return 'Serie TV';
  }
  return '';
}

function renderFetchStatus(payload, data) {
  const targetLabel = state.kind === 'dir' ? 'Serie TV' : 'File';
  const parts = [];
  const title = data.title || payload.title;
  const year = data.year || payload.year;
  const typeLabel = mapTypeLabel(data.type || payload.typeHint || ui.typeSelect.value);

  if (title) {
    parts.push({ label: 'Titolo', value: title, highlight: true });
  }
  if (year) {
    parts.push({ label: 'Anno', value: year });
  }
  if (typeLabel) {
    parts.push({ label: 'Tipo', value: typeLabel });
  }
  if (data.originalLanguage) {
    parts.push({ label: 'Lingua originale', value: normalizeLangTag(data.originalLanguage) });
  }
  if (data.tvdbSeriesId) {
    const slug = data.tvdbSeriesSlug;
    const link = slug
      ? `https://thetvdb.com/series/${slug}`
      : `https://thetvdb.com/?tab=series&id=${data.tvdbSeriesId}`;
    parts.push({ label: 'TVDB ID', value: data.tvdbSeriesId, link });
  }

  if (data.imdbId) {
    parts.push({
      label: 'IMDb',
      value: data.imdbId,
      link: `https://www.imdb.com/title/${data.imdbId}/`
    });
  }

  if (data.tmdbId && data.tmdbType) {
    parts.push({
      label: 'TMDb',
      value: data.tmdbId,
      link: `https://www.themoviedb.org/${data.tmdbType}/${data.tmdbId}`
    });
  }
  if (data.tvdbAttempted) {
    const count = Array.isArray(data.episodes) ? data.episodes.length : 0;
    const label = data.tmdbFallback ? 'Episodi TMDb' : 'Episodi TVDB';
    parts.push({ label, value: String(count) });
  }

  ui.fetchStatus.innerHTML = '';
  if (!parts.length) {
    setHint(ui.fetchStatus, `Rilevato ${targetLabel}: Nessun dato rilevato.`);
    return;
  }

  const prefix = document.createElement('span');
  prefix.textContent = `Rilevato ${targetLabel}: `;
  ui.fetchStatus.appendChild(prefix);

  parts.forEach((part, index) => {
    if (index > 0) {
      ui.fetchStatus.appendChild(document.createTextNode(' | '));
    }
    const label = document.createElement('span');
    label.textContent = `${part.label}: `;
    ui.fetchStatus.appendChild(label);

    let valueNode;
    if (part.link) {
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'fetch-link';
      link.textContent = part.value;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        window.api.openExternal(part.link);
      });
      valueNode = link;
    } else {
      const value = document.createElement('span');
      value.textContent = part.value;
      if (part.highlight) {
        value.classList.add('fetch-title');
      }
      valueNode = value;
    }
    ui.fetchStatus.appendChild(valueNode);
  });

  if (data.warnings && data.warnings.length) {
    ui.fetchStatus.appendChild(document.createTextNode(` | ${data.warnings.join(' | ')}`));
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const defaults = {
      omdbKey: '',
      tmdbKey: '',
      tvdbKey: '',
      preferredLanguage: 'it-IT',
      serviceList: '',
      tagList: '',
      autoTagDetect: true
    };
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return {
      omdbKey: '',
      tmdbKey: '',
      tvdbKey: '',
      preferredLanguage: 'it-IT',
      serviceList: '',
      tagList: '',
      autoTagDetect: true
    };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function applySettingsToUI(settings) {
  const preferredLanguage = Object.prototype.hasOwnProperty.call(settings, 'preferredLanguage')
    ? settings.preferredLanguage
    : 'it-IT';
  ui.omdbKeyInput.value = settings.omdbKey || '';
  ui.tmdbKeyInput.value = settings.tmdbKey || '';
  ui.tvdbKeyInput.value = settings.tvdbKey || '';
  ui.preferredLanguageSelect.value = preferredLanguage;
  ui.serviceListInput.value = settings.serviceList || '';
  ui.tagListInput.value = settings.tagList || '';
  if (ui.autoTagDetectToggle) {
    ui.autoTagDetectToggle.checked = settings.autoTagDetect !== false;
  }
  updateTagSuggestion(settings);
  loadServiceDefaults().then(() => updateServiceOptions(settings));
  updateTagOptions(settings);
  schedulePreview();
}

function getSettings() {
  return {
    omdbKey: ui.omdbKeyInput.value.trim(),
    tmdbKey: ui.tmdbKeyInput.value.trim(),
    tvdbKey: ui.tvdbKeyInput.value.trim(),
    preferredLanguage: ui.preferredLanguageSelect.value,
    serviceList: ui.serviceListInput.value.trim(),
    tagList: ui.tagListInput.value.trim(),
    autoTagDetect: Boolean(ui.autoTagDetectToggle?.checked)
  };
}

function openSettings() {
  ui.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  ui.settingsModal.classList.add('hidden');
}

function openMediaInfoModal() {
  ui.mediaInfoModal.classList.remove('hidden');
}

function closeMediaInfoModal() {
  ui.mediaInfoModal.classList.add('hidden');
}

function openDebugModal() {
  updateDebugLogView();
  ui.debugModal.classList.remove('hidden');
}

function closeDebugModal() {
  ui.debugModal.classList.add('hidden');
}

function setSecretVisibility(input, button, visible) {
  input.type = visible ? 'text' : 'password';
  button.classList.toggle('active', visible);
  const label = button.getAttribute('aria-label') || 'Mostra chiave';
  button.setAttribute('aria-label', visible ? label.replace('Mostra', 'Nascondi') : label.replace('Nascondi', 'Mostra'));
  button.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

function setKeyVerifyState(button, state, message) {
  button.classList.remove('success', 'error', 'loading');
  if (state) {
    button.classList.add(state);
  }
  if (message) {
    button.title = message;
  } else {
    button.removeAttribute('title');
  }
}

async function verifyApiKey(button) {
  const service = button.dataset.service;
  const inputId = button.dataset.input;
  const input = document.getElementById(inputId);
  const apiKey = input ? input.value.trim() : '';

  if (!apiKey) {
    setKeyVerifyState(button, 'error', 'Inserisci una chiave.');
    return;
  }

  setKeyVerifyState(button, 'loading', 'Verifica in corso...');
  button.disabled = true;
  const result = await window.api.verifyApiKey({ service, apiKey });
  button.disabled = false;

  if (result?.ok) {
    setKeyVerifyState(button, 'success', 'Chiave valida.');
  } else {
    setKeyVerifyState(button, 'error', result?.error || 'Chiave non valida.');
  }
}

function openRulesModal() {
  renderRulesContent();
  ui.rulesModal.classList.remove('hidden');
}

function closeRulesModal() {
  ui.rulesModal.classList.add('hidden');
}

function openGroupDefaultsModal() {
  renderGroupDefaults();
  ui.groupDefaultsModal.classList.remove('hidden');
}

function closeGroupDefaultsModal() {
  ui.groupDefaultsModal.classList.add('hidden');
}

function renderRulesContent() {
  if (!ui.rulesContent) {
    return;
  }
  ui.rulesContent.innerHTML = '';
  for (const section of RULES_SECTIONS) {
    const wrapper = document.createElement('section');
    wrapper.className = 'rules-section';

    const title = document.createElement('h3');
    title.textContent = section.title;
    wrapper.appendChild(title);

    const list = document.createElement('div');
    list.className = 'rules-list';

    for (const item of section.items) {
      const entry = document.createElement('div');
      entry.className = 'rules-item';

      const label = document.createElement('div');
      label.className = 'rules-label';
      label.textContent = item.label;

      const pattern = document.createElement('div');
      pattern.className = 'rules-pattern';
      pattern.textContent = item.pattern;

      entry.appendChild(label);
      entry.appendChild(pattern);
      list.appendChild(entry);
    }

    wrapper.appendChild(list);
    ui.rulesContent.appendChild(wrapper);
  }
}

function renderGroupDefaults() {
  if (!ui.groupDefaultsList) {
    return;
  }
  ui.groupDefaultsList.innerHTML = '';
  const currentList = parseSimpleList(ui.tagListInput.value || '');
  const currentSet = new Set(currentList.map((tag) => tag.trim().toUpperCase()));
  const unique = [...new Set(DEFAULT_GROUP_TAGS)]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  for (const tag of unique) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'group-chip';
    chip.textContent = tag;
    if (currentSet.has(tag.toUpperCase())) {
      chip.classList.add('active');
    }
    chip.addEventListener('click', () => {
      const list = parseSimpleList(ui.tagListInput.value || '');
      const key = tag.toUpperCase();
      const index = list.findIndex((item) => item.trim().toUpperCase() === key);
      if (index >= 0) {
        list.splice(index, 1);
        chip.classList.remove('active');
      } else {
        list.push(tag);
        chip.classList.add('active');
      }
      ui.tagListInput.value = list.join('\n');
      const settings = getSettings();
      updateTagSuggestion(settings);
      updateTagOptions(settings);
      schedulePreview();
    });
    ui.groupDefaultsList.appendChild(chip);
  }
}

function parseServiceList(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let label = '';
      let code = '';
      if (line.includes('=')) {
        [label, code] = line.split('=');
      } else if (line.includes('|')) {
        [label, code] = line.split('|');
      } else if (line.includes(':')) {
        [label, code] = line.split(':');
      } else {
        code = line;
        label = line;
      }
      label = (label || '').trim();
      code = (code || '').trim();
      if (!code) {
        return null;
      }
      return { label: label || code, code };
    })
    .filter(Boolean);
}

function parseSimpleList(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function closeAllDropdowns(except) {
  document.querySelectorAll('.dropdown.open').forEach((dropdown) => {
    if (dropdown !== except) {
      dropdown.classList.remove('open');
    }
  });
}

function setDropdownValue(input, trigger, value, label) {
  input.value = value;
  trigger.textContent = label;
  input.dataset.manual = 'true';
  input.dataset.auto = 'false';
  setAutoFieldState(input, false);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function setDropdownAuto(input, trigger, value, label) {
  if (!input || !trigger || !value) {
    return;
  }
  const manual = input.dataset.manual === 'true';
  if (manual && input.value) {
    return;
  }
  input.value = value;
  input.dataset.manual = 'false';
  input.dataset.auto = 'true';
  trigger.textContent = `Rilevato: ${label || value}`;
  setAutoFieldState(input, true);
}

function setInputAuto(input, value) {
  if (!input || !value) {
    return;
  }
  const manual = input.dataset.manual === 'true';
  if (manual && input.value) {
    return;
  }
  input.value = value;
  input.dataset.manual = 'false';
  input.dataset.auto = 'true';
  setAutoFieldState(input, true);
}

function setupDropdown(dropdown, trigger, input, menu) {
  if (!dropdown || !trigger || !input || !menu) {
    return;
  }

  trigger.addEventListener('click', () => {
    const isOpen = dropdown.classList.contains('open');
    closeAllDropdowns(dropdown);
    dropdown.classList.toggle('open', !isOpen);
  });

  menu.addEventListener('click', (event) => {
    const target = event.target.closest('.dropdown-item');
    if (!target) {
      return;
    }
    if (target.dataset.disabled === 'true' || target.classList.contains('disabled')) {
      return;
    }
    const value = target.dataset.value || '';
    const label = target.textContent || '';
    setDropdownValue(input, trigger, value, label);
    dropdown.classList.remove('open');
  });
}

async function loadServiceDefaults() {
  if (serviceDefaultsLoaded) {
    return DEFAULT_SERVICES;
  }
  try {
    let data = [];
    if (window.api?.readServices) {
      const result = await window.api.readServices();
      if (result?.ok) {
        data = Array.isArray(result.data) ? result.data : [];
      } else {
        throw new Error(result?.error || 'read-services failed');
      }
    } else {
      const response = await fetch('services.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const fallback = await response.json();
      data = Array.isArray(fallback) ? fallback : [];
    }
    DEFAULT_SERVICES.splice(0, DEFAULT_SERVICES.length, ...data);
    serviceDefaultsLoaded = true;
    logDebug('services.json loaded', { count: DEFAULT_SERVICES.length });
  } catch (error) {
    serviceDefaultsLoaded = true;
    logDebug('services.json load failed', String(error));
  }
  return DEFAULT_SERVICES;
}

function buildServiceOptions(settings) {
  const map = new Map();
  for (const service of DEFAULT_SERVICES) {
    map.set(service.code, service.label);
  }
  const custom = parseServiceList(settings?.serviceList || '');
  for (const service of custom) {
    map.set(service.code, service.label);
  }
  return [...map.entries()].map(([code, label]) => ({ code, label }));
}

function updateServiceOptions(settings) {
  if (!ui.serviceInput || !ui.serviceDropdownMenu || !ui.serviceInputBtn) {
    return;
  }
  const current = ui.serviceInput.value;
  const options = buildServiceOptions(settings);
  ui.serviceDropdownMenu.innerHTML = '';

  const blank = document.createElement('button');
  blank.type = 'button';
  blank.className = 'dropdown-item';
  blank.dataset.value = '';
  blank.textContent = 'Seleziona servizio';
  ui.serviceDropdownMenu.appendChild(blank);

  for (const option of options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dropdown-item';
    item.dataset.value = option.code;
    item.textContent = `${option.label} (${option.code})`;
    ui.serviceDropdownMenu.appendChild(item);
  }
  const currentOption = options.find((option) => option.code === current);
  if (currentOption) {
    ui.serviceInput.value = current;
    ui.serviceInputBtn.textContent = `${currentOption.label} (${currentOption.code})`;
  } else {
    ui.serviceInput.value = '';
    ui.serviceInputBtn.textContent = 'Seleziona servizio';
  }
}

function updateTagOptions(settings) {
  if (!ui.tagDropdownMenu || !ui.tagInputBtn || !ui.tagInput) {
    return;
  }
  const tags = parseSimpleList(settings?.tagList || '');
  const unique = [...new Set(tags)];
  const suggestion = state.tagSuggestion || '';
  const autoDetect = settings?.autoTagDetect !== false;
  ui.tagDropdownMenu.innerHTML = '';

  const blank = document.createElement('button');
  blank.type = 'button';
  blank.className = 'dropdown-item';
  blank.dataset.value = '';
  if (!unique.length) {
    blank.dataset.disabled = 'true';
    blank.classList.add('disabled');
    blank.textContent = 'Aggiungili nelle Impostazioni';
  } else {
    blank.textContent = 'Seleziona tag gruppo';
  }
  ui.tagDropdownMenu.appendChild(blank);

  for (const tag of unique) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dropdown-item';
    item.dataset.value = tag;
    item.textContent = tag;
    ui.tagDropdownMenu.appendChild(item);
  }

  const manual = ui.tagInput.dataset.manual === 'true';
  const current = ui.tagInput.value;
  const currentInList = current && unique.includes(current);

  if (autoDetect && suggestion && !manual) {
    ui.tagInput.value = suggestion;
    ui.tagInput.dataset.manual = 'false';
    ui.tagInputBtn.textContent = `Rilevato: ${suggestion}`;
    return;
  }

  if (!autoDetect && !currentInList) {
    ui.tagInput.value = '';
    ui.tagInput.dataset.manual = 'false';
  }

  if (currentInList) {
    ui.tagInputBtn.textContent = current;
    return;
  }

  if (!unique.length) {
    ui.tagInputBtn.textContent = suggestion && autoDetect
      ? `Rilevato: ${suggestion}`
      : 'Aggiungili nelle Impostazioni';
    return;
  }

  ui.tagInputBtn.textContent = suggestion && autoDetect
    ? `Rilevato: ${suggestion}`
    : 'Seleziona tag gruppo';
}

function buildKnownGroupTags(settings) {
  const map = new Map();
  for (const tag of DEFAULT_GROUP_TAGS) {
    const clean = String(tag || '').trim();
    if (clean) {
      map.set(clean.toUpperCase(), clean);
    }
  }
  const custom = parseSimpleList(settings?.tagList || '');
  for (const tag of custom) {
    const clean = String(tag || '').trim();
    if (clean) {
      map.set(clean.toUpperCase(), clean);
    }
  }
  return [...map.values()];
}

function updateTagSuggestion(settings) {
  const path = state.mainVideo || state.targetPath;
  if (!path) {
    state.tagSuggestion = '';
    return;
  }
  state.tagSuggestion = extractGroupTagFromName(path, buildKnownGroupTags(settings));
  if (state.tagSuggestion !== state.lastTagSuggestion) {
    logDebug('tag suggestion', {
      path,
      suggestion: state.tagSuggestion,
      settingsAuto: settings?.autoTagDetect !== false
    });
    state.lastTagSuggestion = state.tagSuggestion;
  }
}

function pad2(value) {
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) {
    return '';
  }
  return String(num).padStart(2, '0');
}

function sanitizeName(name) {
  return name
    .replace(/:/g, '')
    .replace(/[<>"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+/g, '.')
    .replace(/[. ]+$/g, '')
    .trim();
}

function normalizeLangTag(raw) {
  if (!raw) {
    return '';
  }
  const cleaned = String(raw).trim().toLowerCase();
  const token = cleaned.split(/[\s/,(]+/)[0];
  const key = token.replace(/[^a-z]/g, '');
  if (LANG_MAP[key]) {
    return LANG_MAP[key];
  }
  if (token.length === 2 || token.length === 3) {
    return token.toUpperCase();
  }
  return token.toUpperCase().slice(0, 3);
}

function getTrackLang(track) {
  return (
    track.Language ||
    track['Language/String'] ||
    track.Language_String ||
    track['Language_String'] ||
    track['Language/String3'] ||
    track.Language_String3 ||
    ''
  );
}

function parseChannels(value) {
  const match = String(value || '').match(/\d+/);
  if (!match) {
    return '';
  }
  const channels = parseInt(match[0], 10);
  const map = {
    1: '1.0',
    2: '2.0',
    3: '3.0',
    4: '4.0',
    5: '5.0',
    6: '5.1',
    7: '6.1',
    8: '7.1'
  };
  return map[channels] || `${channels}.0`;
}

function mapAudioCodec(track) {
  const formatRaw = String(track.Format || '').toUpperCase();
  const commercialRaw = String(track.Format_Commercial || track.Format_Commercial_IfAny || '').toUpperCase();
  const combined = `${commercialRaw} ${formatRaw}`;

  if (combined.includes('DTS:X')) {
    return 'DTS:X';
  }
  if (combined.includes('DTS-HD') && combined.includes('MASTER')) {
    return 'DTS-HD MA';
  }
  if (combined.includes('DTS-HD') && combined.includes('HIGH')) {
    return 'DTS-HD HRA';
  }
  if (combined.includes('TRUEHD')) {
    return 'TrueHD';
  }
  if (combined.includes('E-AC-3') || combined.includes('EAC3') || combined.includes('DD+')) {
    return 'DD+';
  }
  if (combined.includes('AC-3') || combined.includes('AC3') || combined.includes('DD')) {
    return 'DD';
  }
  if (combined.includes('FLAC')) {
    return 'FLAC';
  }
  if (combined.includes('AAC')) {
    return 'AAC';
  }
  if (combined.includes('OPUS')) {
    return 'OPUS';
  }
  if (combined.includes('DTS')) {
    return 'DTS';
  }
  return (track.Format || track.Format_Commercial || '').trim();
}

function detectAudioMeta(track) {
  const extra = `${track.Format_AdditionalFeatures || ''} ${track.Format_Commercial || ''} ${track.Title || ''}`
    .toLowerCase();
  if (extra.includes('atmos') || extra.includes('joc')) {
    return 'Atmos';
  }
  if (extra.includes('auro')) {
    return 'Auro3D';
  }
  return '';
}

function scoreAudioTrack(track) {
  const codec = mapAudioCodec(track);
  const scoreBase = AUDIO_CODEC_SCORE[codec] || 40;
  const channels = parseChannels(track.Channels || track['Channel(s)'] || '');
  const channelsValue = parseFloat(channels) || 0;
  const bitrateMatch = String(track.BitRate || '').match(/\d+/);
  const bitrateValue = bitrateMatch ? parseInt(bitrateMatch[0], 10) : 0;
  return scoreBase * 1000 + channelsValue * 10 + bitrateValue / 1000000;
}

function getVideoTrack(mediaInfo) {
  const tracks = mediaInfo?.media?.track || [];
  return tracks.find((track) => track['@type'] === 'Video');
}

function getAudioTracks(mediaInfo) {
  const tracks = mediaInfo?.media?.track || [];
  return tracks.filter((track) => track['@type'] === 'Audio');
}

function getGeneralTrack(mediaInfo) {
  const tracks = mediaInfo?.media?.track || [];
  return tracks.find((track) => track['@type'] === 'General');
}

function hasEncodingSignature(track) {
  if (!track) {
    return false;
  }
  const keys = [
    'Encoded_Library',
    'Encoded_Library_Name',
    'Encoded_Library_Settings',
    'Encoding_Settings',
    'Writing_library',
    'Writing_Application',
    'Encoded_Library/String',
    'Encoded_Library_Name/String',
    'Encoded_Library_Settings/String',
    'Encoding_Settings/String',
    'Writing library',
    'Writing application'
  ];
  return keys.some((key) => String(track[key] || '').trim());
}

function suggestFormatFromMediaInfo(mediaInfo) {
  if (!mediaInfo || mediaInfo.error) {
    return '';
  }
  const videoTrack = getVideoTrack(mediaInfo);
  const generalTrack = getGeneralTrack(mediaInfo);
  const hasEncode = hasEncodingSignature(videoTrack) || hasEncodingSignature(generalTrack);
  return hasEncode ? 'Encode' : 'WEB-DL';
}

function applyFormatSuggestion(suggested) {
  const select = ui.formatSelect;
  const trigger = ui.formatSelectBtn;
  if (!select || !trigger) {
    return;
  }
  const manual = select.dataset.manual === 'true';
  if (manual || !suggested) {
    return;
  }
  setDropdownAuto(select, trigger, suggested, suggested);
}

function getResolution(videoTrack) {
  const width = parseInt(videoTrack?.Width || 0, 10);
  const height = parseInt(videoTrack?.Height || 0, 10);
  if (width >= 3800 || height >= 2160) {
    return '2160p';
  }
  if (width >= 1900 || height >= 1080) {
    return '1080p';
  }
  if (width >= 1200 || height >= 720) {
    return '720p';
  }
  if (width >= 700 || height >= 576) {
    return '576p';
  }
  if (width >= 640 || height >= 480) {
    return '480p';
  }
  return '';
}

function getHdrTokens(videoTrack) {
  const hdrFields = {
    HDR_Format: videoTrack?.HDR_Format || '',
    HDR_Format_String: videoTrack?.HDR_Format_String || '',
    HDR_Format_Compatibility: videoTrack?.HDR_Format_Compatibility || '',
    'HDR format': videoTrack?.['HDR format'] || '',
    'HDR format string': videoTrack?.['HDR format string'] || '',
    'HDR format compatibility': videoTrack?.['HDR format compatibility'] || ''
  };
  const hdrRaw = Object.values(hdrFields)
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();
  logDebug('HDR fields', hdrFields);
  logDebug('HDR combined', hdrRaw);

  const tokens = [];
  const hasDv = hdrRaw.includes('dolby vision');
  const hasHdr10Plus = hdrRaw.includes('hdr10+') || hdrRaw.includes('hdr10 plus');
  const hasHdr = hdrRaw.includes('hdr10') || hdrRaw.includes('hdr');

  if (hasDv) {
    tokens.push('DV');
  }
  if (hasHdr10Plus) {
    tokens.push('HDR10+');
  } else if (hasHdr) {
    tokens.push('HDR');
  }
  return tokens;
}

function mapVideoCodec(videoTrack, releaseFormat) {
  const formatRaw = String(videoTrack?.Format || '').toUpperCase();
  if (!formatRaw) {
    return '';
  }

  if (releaseFormat === 'Encode') {
    if (formatRaw.includes('HEVC') || formatRaw.includes('H.265')) {
      return 'x265';
    }
    if (formatRaw.includes('AVC') || formatRaw.includes('H.264')) {
      return 'x264';
    }
    if (formatRaw.includes('AV1')) {
      return 'AV1';
    }
  }

  if (releaseFormat === 'WEB-DL' || releaseFormat === 'WEBRip') {
    if (formatRaw.includes('HEVC') || formatRaw.includes('H.265')) {
      return 'H.265';
    }
    if (formatRaw.includes('AVC') || formatRaw.includes('H.264')) {
      return 'H.264';
    }
    if (formatRaw.includes('AV1')) {
      return 'AV1';
    }
  }

  if (formatRaw.includes('HEVC') || formatRaw.includes('H.265')) {
    return 'HEVC';
  }
  if (formatRaw.includes('AVC') || formatRaw.includes('H.264')) {
    return 'AVC';
  }
  if (formatRaw.includes('VC-1')) {
    return 'VC-1';
  }
  if (formatRaw.includes('MPEG')) {
    return 'MPEG-2';
  }
  return videoTrack?.Format || '';
}

function buildLanguageTag(audioLangs, originalLangTag) {
  const langs = [...new Set(audioLangs.filter(Boolean))];
  if (!langs.length) {
    return '';
  }

  const separator = ' - ';
  if (langs.length >= 3) {
    return langs.includes('ITA') ? `ITA${separator}MULTI` : `${langs[0]}${separator}MULTI`;
  }

  if (langs.length === 1) {
    return langs[0];
  }

  const original = normalizeLangTag(originalLangTag);
  if (langs.includes('ITA') && original && langs.includes(original)) {
    return `ITA${separator}${original}`;
  }
  if (langs.includes('ITA')) {
    const other = langs.find((lang) => lang !== 'ITA');
    return other ? `ITA${separator}${other}` : 'ITA';
  }
  return langs.join(separator);
}

function extractYear(raw) {
  const match = String(raw || '').match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : '';
}

function getPathBaseName(filePath) {
  const parts = String(filePath).split(/[/\\]/);
  return parts[parts.length - 1] || '';
}

function getParentPath(filePath) {
  const value = String(filePath || '');
  if (!value) {
    return '';
  }
  const separator = value.includes('\\') ? '\\' : '/';
  const parts = value.split(/[/\\]/);
  parts.pop();
  return parts.join(separator);
}

function normalizePathValue(value) {
  return String(value || '').replace(/\//g, '\\');
}

function isSamePath(left, right) {
  return normalizePathValue(left).toLowerCase() === normalizePathValue(right).toLowerCase();
}

function applyFolderRenamePath(value, folderFrom, folderTo) {
  if (!value || !folderFrom || !folderTo) {
    return value;
  }
  const normValue = normalizePathValue(value);
  const normFrom = normalizePathValue(folderFrom);
  const normTo = normalizePathValue(folderTo);
  const valueLower = normValue.toLowerCase();
  const fromLower = normFrom.toLowerCase();

  if (valueLower === fromLower) {
    return normTo;
  }

  const prefix = fromLower.endsWith('\\') ? fromLower : `${fromLower}\\`;
  if (valueLower.startsWith(prefix)) {
    return `${normTo}\\${normValue.slice(prefix.length)}`;
  }
  return value;
}

function showToast(message) {
  if (!ui.toast) {
    return;
  }

  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
  }

  ui.toast.textContent = message;
  ui.toast.classList.remove('hidden');
  requestAnimationFrame(() => {
    ui.toast.classList.add('show');
  });

  toastTimer = setTimeout(() => {
    ui.toast.classList.remove('show');
    toastHideTimer = setTimeout(() => {
      ui.toast.classList.add('hidden');
    }, 220);
  }, 2400);
}

function closeConfirmModal() {
  if (!ui.confirmModal) {
    return;
  }
  ui.confirmModal.classList.add('hidden');
}

function openConfirmModal(message) {
  if (!ui.confirmModal || !ui.confirmMessage) {
    return Promise.resolve(false);
  }
  ui.confirmMessage.textContent = message;
  ui.confirmModal.classList.remove('hidden');
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function resolveConfirm(value) {
  if (confirmResolver) {
    confirmResolver(value);
    confirmResolver = null;
  }
  closeConfirmModal();
}

function stripExtension(name) {
  return name.replace(/\.[^/.]+$/, '');
}

function isNoiseTag(token) {
  if (!token) {
    return true;
  }
  const upper = token.toUpperCase();
  const compact = upper.replace(/[._-]/g, '');
  if (STOP_WORDS.has(upper) || STOP_WORDS.has(compact)) {
    return true;
  }
  if (/^\d{3,4}P$/.test(upper) || /^(19|20)\d{2}$/.test(upper)) {
    return true;
  }
  if (/^(ITA|ENG|FRE|GER|SPA|POR|JPN|RUS|CHI|KOR|UKR)([-_.](ITA|ENG|FRE|GER|SPA|POR|JPN|RUS|CHI|KOR|UKR))+$/i.test(upper)) {
    return true;
  }
  return false;
}

function extractGroupTagFromName(filePath, knownTags = []) {
  if (!filePath) {
    return '';
  }
  const base = stripExtension(getPathBaseName(filePath)).trim();
  if (!base) {
    return '';
  }

  if (/\s-\s/.test(base)) {
    return '';
  }

  const knownMap = new Map();
  for (const tag of knownTags) {
    const clean = String(tag || '').trim();
    if (clean) {
      knownMap.set(clean.toUpperCase(), clean);
    }
  }
  if (knownMap.size) {
    const tokens = base.split(/[._\s-]+/).filter(Boolean);
    const last = tokens[tokens.length - 1] || '';
    const known = knownMap.get(last.toUpperCase());
    if (known && !isNoiseTag(last)) {
      logDebug('tag detect', { mode: 'known', base, last, known });
      return known;
    }
  }

  let candidate = '';
  const bracketMatch = base.match(/[\[\(\{]([A-Za-z0-9][A-Za-z0-9._-]{1,})[\]\)\}]\s*$/);
  if (bracketMatch) {
    candidate = bracketMatch[1];
  } else {
    const tailMatch = base.match(/[-–—]\s*([A-Za-z0-9]{2,20})\s*$/);
    if (tailMatch) {
      candidate = tailMatch[1];
    }
  }

  candidate = candidate.replace(/^[.\-]+|[.\-]+$/g, '').trim();
  logDebug('tag detect', {
    mode: 'suffix',
    base,
    rawCandidate: candidate
  });
  if (!candidate || candidate.length < 2 || candidate.length > 20 || /\s/.test(candidate)) {
    return '';
  }
  if (candidate.length <= 2 && !knownMap.has(candidate.toUpperCase())) {
    return '';
  }
  if (isNoiseTag(candidate)) {
    return '';
  }
  return candidate;
}

function parseSeasonEpisode(text) {
  const match = text.match(/S(\d{1,2})E(\d{1,2})/i) || text.match(/(\d{1,2})x(\d{1,2})/i);
  if (match) {
    return { season: match[1], episode: match[2], index: match.index };
  }
  return { season: '', episode: '', index: -1 };
}

function parseSeasonOnly(text) {
  const match = text.match(/\bS(\d{1,2})\b/i);
  if (match) {
    return { season: match[1], index: match.index };
  }
  const matchSeason = text.match(/\bSeason\s+(\d{1,2})\b/i);
  if (matchSeason) {
    return { season: matchSeason[1], index: matchSeason.index };
  }
  return { season: '', index: -1 };
}

function parseEpisodeTitleFromName(rawName) {
  const cleaned = stripExtension(rawName)
    .replace(/[_\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match =
    cleaned.match(/S\d{1,2}E\d{1,2}/i) ||
    cleaned.match(/\d{1,2}x\d{1,2}/i);
  if (!match) {
    return '';
  }

  const matchIndex = cleaned.indexOf(match[0]);
  const after = cleaned.slice(matchIndex + match[0].length).trim();
  if (!after) {
    return '';
  }

  const tokens = after.split(' ').filter((token) => token && !STOP_WORDS.has(token.toUpperCase()));
  const filtered = tokens
    .filter((token) => !/^\d{3,4}p$/i.test(token) && !/^\d{4}$/.test(token))
    .filter((token) => !/^(S?\d{1,2}E\d{1,2}|S?\d{1,2}x\d{1,2}|\d{1,2}x\d{1,2})$/i.test(token));
  return filtered.join(' ').trim();
}

function guessTitleFromName(rawName) {
  let cleaned = stripExtension(rawName);
  cleaned = cleaned.replace(/\[[^\]]+\]|\([^\)]+\)|\{[^}]+\}/g, ' ');
  cleaned = cleaned.replace(/[_\.]/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  const seasonEpisode = parseSeasonEpisode(cleaned);
  let cutIndex = cleaned.length;
  if (seasonEpisode.index !== -1) {
    cutIndex = seasonEpisode.index;
  } else {
    const seasonOnly = parseSeasonOnly(cleaned);
    if (seasonOnly.index !== -1) {
      cutIndex = seasonOnly.index;
    }
  }
  const yearMatch = cleaned.match(/\b(19|20)\d{2}\b/);
  if (yearMatch && yearMatch.index < cutIndex) {
    cutIndex = yearMatch.index;
  }
  const titleChunk = cleaned.slice(0, cutIndex).trim();
  const tokens = titleChunk
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token.toUpperCase()))
    .filter((token) => !/^[\-\u2013\u2014]+$/.test(token))
    .filter((token) => !/^[()\[\]{}]+$/.test(token));
  return tokens.join(' ').trim();
}

function guessMetadataFromName(filePath) {
  const base = getPathBaseName(filePath);
  const cleaned = stripExtension(base);
  const seasonEpisode = parseSeasonEpisode(cleaned);
  const seasonOnly = seasonEpisode.episode ? { season: '', index: -1 } : parseSeasonOnly(cleaned);
  const year = extractYear(cleaned);
  let title = guessTitleFromName(cleaned);
  if (!title) {
    const parentPath = getParentPath(filePath);
    const parentName = parentPath ? getPathBaseName(parentPath) : '';
    const parentTitle = parentName ? guessTitleFromName(parentName) : '';
    if (parentTitle) {
      title = parentTitle;
    } else if (parentPath) {
      const grandParent = getParentPath(parentPath);
      const grandName = grandParent ? getPathBaseName(grandParent) : '';
      const grandTitle = grandName ? guessTitleFromName(grandName) : '';
      if (grandTitle) {
        title = grandTitle;
      }
    }
  }
  const episodeTitle = parseEpisodeTitleFromName(cleaned);
  return {
    title,
    year,
    season: seasonEpisode.season || seasonOnly.season,
    episode: seasonEpisode.episode,
    episodeTitle
  };
}

function episodeKey(season, episode) {
  if (!season || !episode) {
    return '';
  }
  return `S${pad2(season)}E${pad2(episode)}`;
}

function setIfAuto(input, value) {
  if (!value) {
    return;
  }
  if (!input.dataset.manual || input.dataset.manual === 'false' || !input.value) {
    input.value = value;
    input.dataset.manual = 'false';
    input.dataset.auto = 'false';
  }
}

function fillFromMediaInfo() {
  if (!state.mediaInfo || state.mediaInfo.error) {
    return;
  }

  const videoTrack = getVideoTrack(state.mediaInfo);
  const audioTracks = getAudioTracks(state.mediaInfo);
  logDebug('MediaInfo tracks', {
    video: Boolean(videoTrack),
    audioCount: audioTracks.length
  });

  if (videoTrack) {
    const resolution = getResolution(videoTrack);
    if (ui.resolutionSelectBtn) {
      setDropdownAuto(ui.resolutionInput, ui.resolutionSelectBtn, resolution, resolution);
    } else {
      setInputAuto(ui.resolutionInput, resolution);
    }

    const hdrTokens = getHdrTokens(videoTrack);
    ui.dvCheckbox.checked = hdrTokens.includes('DV');
    ui.hdr10plusCheckbox.checked = hdrTokens.includes('HDR10+');
    ui.hdrCheckbox.checked = hdrTokens.includes('HDR') && !hdrTokens.includes('HDR10+');

    const format = ui.formatSelect.value;
    const videoCodec = mapVideoCodec(videoTrack, format);
    if (ui.videoCodecSelectBtn) {
      setDropdownAuto(ui.videoCodecInput, ui.videoCodecSelectBtn, videoCodec, videoCodec);
    } else {
      setInputAuto(ui.videoCodecInput, videoCodec);
    }

    if (resolution === '2160p') {
      ui.uhdCheckbox.checked = true;
    }
  }

  applyFormatSuggestion('');

  if (audioTracks.length) {
    const cleanAudio = audioTracks.filter((track) => {
      const title = String(track.Title || '').toLowerCase();
      return !title.includes('commentary');
    });

    const audioLangs = cleanAudio
      .map((track) => normalizeLangTag(getTrackLang(track)))
      .filter(Boolean);
    const uniqueLangs = [...new Set(audioLangs)];
    state.audioLangs = uniqueLangs;
    ui.audioLangHint.textContent = uniqueLangs.length
      ? `Lingue audio rilevate: ${uniqueLangs.join(', ')}`
      : 'Lingue audio rilevate: -';

    const preferredTracks = cleanAudio.filter((track) => normalizeLangTag(getTrackLang(track)) === 'ITA');
    const selectionPool = preferredTracks.length ? preferredTracks : cleanAudio;
    const best = selectionPool.reduce((bestTrack, track) => {
      if (!bestTrack) {
        return track;
      }
      return scoreAudioTrack(track) > scoreAudioTrack(bestTrack) ? track : bestTrack;
    }, null);

    if (best) {
      const mappedAudio = mapAudioCodec(best);
      const channels = parseChannels(best.Channels || best['Channel(s)'] || '');
      if (ui.audioCodecSelectBtn) {
        setDropdownAuto(ui.audioCodecInput, ui.audioCodecSelectBtn, mappedAudio, mappedAudio);
      } else {
        setInputAuto(ui.audioCodecInput, mappedAudio);
      }
      if (ui.audioChannelsSelectBtn) {
        setDropdownAuto(ui.audioChannelsInput, ui.audioChannelsSelectBtn, channels, channels);
      } else {
        setInputAuto(ui.audioChannelsInput, channels);
      }
      setInputAuto(ui.audioMetaInput, detectAudioMeta(best));
    }

    if (!ui.languageTagInput.dataset.manual || !ui.languageTagInput.value) {
      const computedLang = buildLanguageTag(uniqueLangs, ui.originalLanguageInput.value);
      if (computedLang) {
        setInputAuto(ui.languageTagInput, computedLang);
      }
    }
  }
}

function updateVisibility() {
  const type = ui.typeSelect.value;
  const format = ui.formatSelect.value;
  const isEpisode = type === 'tv-episode' || type === 'anime-episode';
  const isSeason = type === 'tv-season' || type === 'anime-season';

  ui.seasonEpisodeGroup.style.display = isSeason || isEpisode ? 'grid' : 'none';
  ui.episodeTitleGroup.style.display = isEpisode ? 'grid' : 'none';

  const showService = format === 'WEB-DL' || format === 'WEBRip';
  const showSource = format === 'Encode' || format === 'Remux' || format === 'Full Disc';

  ui.serviceGroup.style.display = showService ? 'block' : 'none';
  ui.sourceGroup.style.display = showSource ? 'block' : 'none';
  if (ui.formatRow) {
    ui.formatRow.classList.toggle('no-source', !showSource);
    ui.formatRow.classList.toggle('no-service', !showService);
  }
  ui.regionWrapper.style.display = format === 'Full Disc' ? 'block' : 'none';
  ui.threeDWrapper.style.display = format === 'Remux' || format === 'Full Disc' ? 'inline-flex' : 'none';
  ui.languageTagInput.disabled = format === 'Full Disc';
}

function getFormState() {
  const hdrTokens = [];
  if (ui.dvCheckbox.checked) {
    hdrTokens.push('DV');
  }
  if (ui.hdr10plusCheckbox.checked) {
    hdrTokens.push('HDR10+');
  } else if (ui.hdrCheckbox.checked) {
    hdrTokens.push('HDR');
  }

  return {
    type: ui.typeSelect.value,
    format: ui.formatSelect.value,
    title: ui.titleInput.value.trim(),
    year: ui.yearInput.value.trim(),
    includeYear: ui.includeYear.checked,
    season: ui.seasonInput.value,
    episode: ui.episodeInput.value,
    episodeTitle: ui.episodeTitleInput.value.trim(),
    part: ui.partInput.value.trim(),
    languageTag: ui.languageTagInput.value.trim(),
    edition: ui.editionInput.value.trim(),
    hybrid: ui.hybridCheckbox.checked,
    repack: ui.repackSelect.value,
    resolution: ui.resolutionInput.value.trim(),
    region: ui.regionInput.value.trim(),
    uhd: ui.uhdCheckbox.checked,
    service: ui.serviceInput.value.trim(),
    source: ui.sourceInput.value.trim(),
    audioCodec: ui.audioCodecInput.value.trim(),
    audioChannels: ui.audioChannelsInput.value.trim(),
    audioMeta: ui.audioMetaInput.value.trim(),
    hdrTokens,
    videoCodec: ui.videoCodecInput.value.trim(),
    is3d: ui.threeDCheckbox.checked,
    tag: getResolvedTag()
  };
}

function getResolvedTag() {
  const value = ui.tagInput.value.trim();
  if (value) {
    return value;
  }
  const manual = ui.tagInput.dataset.manual === 'true';
  const settings = loadSettings();
  const resolved = manual || settings.autoTagDetect === false
    ? ''
    : (state.tagSuggestion || '');
  const key = `${value}|${manual}|${settings.autoTagDetect}|${state.tagSuggestion}|${resolved}`;
  if (key !== state.lastTagResolveKey) {
    logDebug('tag resolve', {
      value,
      manual,
      autoDetect: settings.autoTagDetect !== false,
      suggestion: state.tagSuggestion,
      resolved
    });
    state.lastTagResolveKey = key;
  }
  return resolved;
}

function computeBaseName(form, overrides = {}) {
  const data = { separatorStyle: 'spaces', ...form, ...overrides };
  const tokens = [];
  const type = data.type;
  const format = data.format;
  const isEpisode = type === 'tv-episode' || type === 'anime-episode';
  const isSeason = type === 'tv-season' || type === 'anime-season';

  if (data.title) {
    tokens.push(data.title);
  }

  if (data.includeYear && data.year) {
    tokens.push(data.year);
  }

  if (isEpisode) {
    if (data.season && data.episode) {
      tokens.push(`S${pad2(data.season)}E${pad2(data.episode)}`);
    } else {
      if (data.season) {
        tokens.push(`S${pad2(data.season)}`);
      }
      if (data.episode) {
        tokens.push(`E${pad2(data.episode)}`);
      }
    }
    if (data.episodeTitle) {
      tokens.push(data.episodeTitle);
    }
    if (data.part) {
      tokens.push(data.part);
    }
  } else if (isSeason && data.season) {
    tokens.push(`S${pad2(data.season)}`);
  }

  if (format === 'Remux' || format === 'Full Disc') {
    if (data.is3d) {
      tokens.push('3D');
    }
  }

  if (format !== 'Full Disc' && data.languageTag) {
    tokens.push(data.languageTag);
  }

  if (data.edition) {
    tokens.push(data.edition);
  }
  if (data.hybrid) {
    tokens.push('Hybrid');
  }
  if (data.repack) {
    tokens.push(data.repack);
  }
  if (data.resolution) {
    tokens.push(data.resolution);
  }
  if (format === 'Full Disc' && data.region) {
    tokens.push(data.region);
  }
  if (data.uhd) {
    tokens.push('UHD');
  }

  const hdrTokens = data.hdrTokens || [];

  if (format === 'WEB-DL' || format === 'WEBRip') {
    if (data.service) {
      tokens.push(data.service);
    }
    tokens.push(format);
    if (data.audioCodec) {
      tokens.push(data.audioCodec);
    }
    if (data.audioChannels) {
      tokens.push(data.audioChannels);
    }
    if (data.audioMeta) {
      tokens.push(data.audioMeta);
    }
    tokens.push(...hdrTokens);
    if (data.videoCodec) {
      tokens.push(data.videoCodec);
    }
  } else if (format === 'Encode') {
    if (data.source) {
      tokens.push(data.source);
    }
    if (data.audioCodec) {
      tokens.push(data.audioCodec);
    }
    if (data.audioChannels) {
      tokens.push(data.audioChannels);
    }
    if (data.audioMeta) {
      tokens.push(data.audioMeta);
    }
    tokens.push(...hdrTokens);
    if (data.videoCodec) {
      tokens.push(data.videoCodec);
    }
  } else if (format === 'Remux') {
    if (data.source) {
      tokens.push(data.source);
    }
    tokens.push('REMUX');
    tokens.push(...hdrTokens);
    if (data.videoCodec) {
      tokens.push(data.videoCodec);
    }
    if (data.audioCodec) {
      tokens.push(data.audioCodec);
    }
    if (data.audioChannels) {
      tokens.push(data.audioChannels);
    }
    if (data.audioMeta) {
      tokens.push(data.audioMeta);
    }
  } else if (format === 'Full Disc') {
    if (data.source) {
      tokens.push(data.source);
    }
    tokens.push(...hdrTokens);
    if (data.videoCodec) {
      tokens.push(data.videoCodec);
    }
    if (data.audioCodec) {
      tokens.push(data.audioCodec);
    }
    if (data.audioChannels) {
      tokens.push(data.audioChannels);
    }
    if (data.audioMeta) {
      tokens.push(data.audioMeta);
    }
  }

  const tag = data.tag ? data.tag.replace(/^[\-\s]+/, '') : '';
  if (tag && tokens.length) {
    tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}-${tag}`;
  }

  const joiner = data.separatorStyle === 'dots' ? '.' : ' ';
  const tokensToJoin = tokens
    .filter(Boolean)
    .map((token) => (data.separatorStyle === 'dots' ? token.replace(/\s*-\s*/g, '-') : token));
  let name = tokensToJoin.join(joiner);
  if (data.separatorStyle === 'dots') {
    name = name.replace(/\s+/g, '.').replace(/\.+/g, '.');
  } else {
    name = name.replace(/\s+/g, ' ').trim();
  }

  return sanitizeName(name);
}

function getMissingRenameRequirements(form) {
  const missing = [];
  const format = form.format;
  if ((format === 'WEB-DL' || format === 'WEBRip') && !form.service) {
    missing.push(`Servizio mancante per il formato ${format}.`);
  }
  if ((format === 'Encode' || format === 'Remux' || format === 'Full Disc') && !form.source) {
    missing.push(`Sorgente mancante per il formato ${format}.`);
  }
  return missing;
}

function buildRenameTargets() {
  if (!state.targetPath) {
    return { folderName: '', baseName: '', fileRenames: [], warnings: [] };
  }

  const warnings = [];
  const form = getFormState();
  const isDir = state.kind === 'dir';
  const isSeason = isDir || form.type.includes('season');
  const seasonType = form.type.includes('anime') ? 'anime-season' : 'tv-season';
  const episodeType = form.type.includes('anime') ? 'anime-episode' : 'tv-episode';

  const folderName = isDir ? computeBaseName(form, { type: seasonType, separatorStyle: 'dots' }) : '';

  const fileRenames = [];

  if (isDir) {
    const seasonValue = form.season;
    for (const filePath of state.videoFiles) {
      const guess = guessMetadataFromName(filePath);
      const season = guess.season || seasonValue;
      const episode = guess.episode;
      const key = episodeKey(season, episode);
      const episodeTitle = key && state.episodeMap[key] ? state.episodeMap[key] : guess.episodeTitle;
      const baseName = computeBaseName(form, {
        type: episodeType,
        separatorStyle: 'dots',
        season,
        episode,
        episodeTitle: episodeTitle || form.episodeTitle
      });
      if (!episode || !season) {
        warnings.push(`Stagione/episodio mancante per ${getPathBaseName(filePath)}`);
      }
      fileRenames.push({ path: filePath, baseName });
    }
  } else {
    let baseName = computeBaseName(form, { separatorStyle: 'dots' });
    if (form.type === 'tv-episode' || form.type === 'anime-episode') {
      const key = episodeKey(form.season, form.episode);
      const mappedTitle = key && state.episodeMap[key] ? state.episodeMap[key] : '';
      if (mappedTitle) {
        baseName = computeBaseName(form, { separatorStyle: 'dots', episodeTitle: mappedTitle });
      } else if (!form.episodeTitle) {
        const guess = state.mainVideo ? guessMetadataFromName(state.mainVideo) : null;
        if (guess?.episodeTitle) {
          baseName = computeBaseName(form, { separatorStyle: 'dots', episodeTitle: guess.episodeTitle });
        }
      }
    }
    const targetFile = state.mainVideo || state.targetPath;
    fileRenames.push({ path: targetFile, baseName });
  }

  const previewBase = fileRenames[0]?.baseName || '';
  return { folderName, baseName: previewBase, fileRenames, warnings };
}

function applyRenameResults(result, payload) {
  if (!result || !Array.isArray(result.results) || !result.results.length) {
    return;
  }

  const okResults = result.results.filter((item) => item && item.ok);
  if (!okResults.length) {
    return;
  }

  const fileMap = new Map();
  for (const item of okResults) {
    fileMap.set(normalizePathValue(item.from).toLowerCase(), item.to);
  }

  const expectedFolderFrom = payload?.renameFolder
    ? (state.kind === 'dir' ? state.targetPath : getParentPath(state.targetPath))
    : '';
  const folderResult = expectedFolderFrom
    ? okResults.find((item) => isSamePath(item.from, expectedFolderFrom))
    : null;
  const folderFrom = folderResult?.from || '';
  const folderTo = folderResult?.to || '';

  const applyFileRename = (value) => {
    if (!value) {
      return value;
    }
    const mapped = fileMap.get(normalizePathValue(value).toLowerCase());
    return mapped || value;
  };

  const applyAllRenames = (value) => {
    let updated = applyFileRename(value);
    if (folderTo && folderFrom) {
      updated = applyFolderRenamePath(updated, folderFrom, folderTo);
    }
    return updated;
  };

  if (state.kind === 'dir' && folderTo) {
    state.targetPath = folderTo;
  } else {
    state.targetPath = applyAllRenames(state.targetPath);
  }

  state.mainVideo = applyAllRenames(state.mainVideo);
  state.videoFiles = state.videoFiles.map((pathValue) => applyAllRenames(pathValue));

  if (state.mainVideo) {
    const lastDot = state.mainVideo.lastIndexOf('.');
    state.mainExtension = lastDot !== -1 ? state.mainVideo.slice(lastDot) : '';
  }

  if (state.targetPath) {
    ui.selectedPath.textContent = state.targetPath;
  }
  if (state.mainVideo) {
    setHint(ui.scanHint, `File analizzato: ${state.mainVideo}`);
  }
}

async function updateRenamePlan() {
  if (!state.targetPath) {
    ui.renamePlanList.innerHTML = '';
    ui.warningList.innerHTML = '';
    updateRenameBadge(null);
    return;
  }

  const { folderName, baseName, fileRenames, warnings } = buildRenameTargets();
  const plan = await window.api.previewRename({
    targetPath: state.targetPath,
    renameFiles: ui.renameFileCheckbox.checked,
    renameFolder: state.kind === 'dir' && ui.renameFolderCheckbox.checked,
    folderName: state.kind === 'dir' ? folderName : '',
    fileRenames
  });
  updateRenameBadge(plan);

  ui.renamePlanList.innerHTML = '';
  ui.warningList.innerHTML = '';
  const planWarnings = plan.warnings || [];
  const hasWarnings = warnings.length > 0 || planWarnings.length > 0;

  let folderOp = null;
  let filteredOps = plan.ops || [];
  if (state.kind === 'dir') {
    const targetFolder = state.targetPath;
    folderOp = filteredOps.find((op) => op.from === targetFolder) || null;
    if (folderOp) {
      filteredOps = filteredOps.filter((op) => op !== folderOp);
    }
  }

  const infoPath = state.kind === 'dir' ? state.targetPath : getParentPath(state.targetPath);
  const infoName = state.kind === 'dir'
    ? (folderName || getPathBaseName(state.targetPath))
    : getPathBaseName(infoPath || '');
  if (infoName || folderOp) {
    const folderLabel = document.createElement('div');
    folderLabel.className = 'plan-label';
    folderLabel.textContent = 'Cartella';
    ui.renamePlanList.appendChild(folderLabel);

    const info = document.createElement('div');
    info.className = 'plan-info';
    if (folderOp) {
      const fromLine = document.createElement('div');
      fromLine.className = 'plan-text old';
      fromLine.textContent = getPathBaseName(folderOp.from);
      const toLine = document.createElement('div');
      toLine.className = 'plan-text new';
      toLine.textContent = getPathBaseName(folderOp.to);
      info.appendChild(fromLine);
      info.appendChild(toLine);
    } else {
      info.textContent = `Cartella: ${infoName}`;
    }
    if (infoPath) {
      info.title = infoPath;
    }
    ui.renamePlanList.appendChild(info);
  }

  const filesLabel = document.createElement('div');
  filesLabel.className = 'plan-label';
  filesLabel.textContent = 'File';
  ui.renamePlanList.appendChild(filesLabel);

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'plan-items';
  ui.renamePlanList.appendChild(itemsContainer);

  if (filteredOps.length) {
    for (const op of filteredOps) {
      const item = document.createElement('div');
      item.className = 'plan-item';

      const fromLine = document.createElement('div');
      fromLine.className = 'plan-text old';
      fromLine.textContent = getPathBaseName(op.from);

      const toLine = document.createElement('div');
      toLine.className = 'plan-text new';
      toLine.textContent = getPathBaseName(op.to);

      item.appendChild(fromLine);
      item.appendChild(toLine);
      itemsContainer.appendChild(item);
    }
  } else {
    const empty = document.createElement('div');
    empty.className = `plan-item empty${hasWarnings ? '' : ' success'}`;
    empty.textContent = hasWarnings
      ? 'Nessuna operazione pronta.'
      : 'Nessuna rinomina necessaria con le configurazioni attuali.';
    itemsContainer.appendChild(empty);
  }

  const allWarnings = [...warnings, ...planWarnings];
  if (allWarnings.length) {
    for (const warning of allWarnings) {
      const item = document.createElement('div');
      item.className = 'warning-item';
      item.textContent = warning;
      ui.warningList.appendChild(item);
    }
  }

  const extension = state.mainExtension;
  ui.folderNamePreview.textContent = folderName || '-';
  ui.fileNamePreview.textContent = baseName && extension ? `${baseName}${extension}` : '-';
}

async function refreshPreview() {
  updateVisibility();
  await updateRenamePlan();
}

function schedulePreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
  }
  previewTimer = setTimeout(() => {
    refreshPreview();
  }, 120);
}

async function fetchMetadataAuto(guess) {
  if (state.autoDetectRunning) {
    return;
  }
  const settings = loadSettings();
  if (!settings.omdbKey && !settings.tmdbKey && !settings.tvdbKey) {
    setHint(ui.fetchStatus, 'Imposta le API key nelle impostazioni.');
    logDebug('fetchMetadata: nessuna API key disponibile');
    ui.fetchBadge.classList.add('hidden');
    return;
  }

  state.autoDetectRunning = true;
  setHint(ui.fetchStatus, 'Ricerca in corso...');

  try {
    const typeHint = guess.typeHint || ui.typeSelect.value;
    const isTvType = typeHint.startsWith('tv') || typeHint.startsWith('anime');
    const payload = {
      imdbId: ui.imdbInput.value.trim(),
      tvdbId: isTvType ? ui.tvdbInput.value.trim() : '',
      title: guess.title || ui.titleInput.value.trim(),
      year: guess.year || ui.yearInput.value.trim(),
      season: isTvType ? (guess.season || ui.seasonInput.value.trim()) : '',
      typeHint,
      omdbKey: settings.omdbKey,
      tmdbKey: settings.tmdbKey,
      tvdbKey: settings.tvdbKey,
      preferredLanguage: Object.prototype.hasOwnProperty.call(settings, 'preferredLanguage')
        ? settings.preferredLanguage
        : 'it-IT'
    };

    const data = await window.api.fetchMetadata(payload);
    logDebug('fetchMetadata payload', payload);
    logDebug('fetchMetadata result', data);
    if (data.title) {
      setIfAuto(ui.titleInput, data.title);
    }
    if (data.year) {
      setIfAuto(ui.yearInput, data.year);
    }
    if (data.originalLanguage) {
      setInputAuto(ui.originalLanguageInput, normalizeLangTag(data.originalLanguage));
    }
    if (Array.isArray(data.episodes)) {
      const map = {};
      data.episodes.forEach((ep) => {
        const key = episodeKey(ep.season, ep.episode);
        if (key && ep.name) {
          map[key] = ep.name;
        }
      });
      state.episodeMap = map;
    }

    if (state.kind !== 'dir') {
      const season = ui.seasonInput.value;
      const episode = ui.episodeInput.value;
      const key = episodeKey(season, episode);
      if (key && state.episodeMap[key]) {
        setIfAuto(ui.episodeTitleInput, state.episodeMap[key]);
      }
    }

    const usedManualId = Boolean(payload.imdbId || payload.tvdbId);
    const modeLabel = usedManualId ? 'Matching manuale' : 'Auto Matching';
    setFetchBadge(usedManualId ? 'manual' : 'auto', modeLabel);
    renderFetchStatus(payload, data);
  } catch (error) {
    ui.fetchBadge.classList.add('hidden');
    setHint(ui.fetchStatus, `Errore: ${error.message || error}`);
  } finally {
    state.autoDetectRunning = false;
    schedulePreview();
  }
}

async function autoDetectFromPath() {
  if (!ui.autoDetectToggle.checked || !state.targetPath) {
    return;
  }

  logDebug('autoDetect: start', { targetPath: state.targetPath });
  let guess = { title: '', year: '', season: '', episode: '', typeHint: '' };

  if (state.kind === 'dir') {
    const folderName = getPathBaseName(state.targetPath);
    const folderGuess = guessMetadataFromName(folderName);
    const firstFileGuess = state.videoFiles.length ? guessMetadataFromName(state.videoFiles[0]) : {};

    guess.title = folderGuess.title || firstFileGuess.title || '';
    guess.year = folderGuess.year || firstFileGuess.year || '';
    guess.season = folderGuess.season || firstFileGuess.season || '';
    guess.typeHint = 'tv-season';

    setIfAuto(ui.typeSelect, 'tv-season');
    setIfAuto(ui.titleInput, guess.title);
    setIfAuto(ui.yearInput, guess.year);
    if (guess.season) {
      setIfAuto(ui.seasonInput, guess.season);
    }
  } else if (state.mainVideo) {
    const fileGuess = guessMetadataFromName(state.mainVideo);
    guess = {
      ...guess,
      ...fileGuess,
      typeHint: fileGuess.season && fileGuess.episode ? 'tv-episode' : 'movie'
    };

    if (guess.typeHint === 'tv-episode') {
      setIfAuto(ui.typeSelect, 'tv-episode');
      if (guess.season) {
        setIfAuto(ui.seasonInput, guess.season);
      }
      if (guess.episode) {
        setIfAuto(ui.episodeInput, guess.episode);
      }
      if (guess.episodeTitle) {
        setIfAuto(ui.episodeTitleInput, guess.episodeTitle);
      }
    } else {
      setIfAuto(ui.typeSelect, 'movie');
    }

    setIfAuto(ui.titleInput, guess.title);
    setIfAuto(ui.yearInput, guess.year);
  }

  logDebug('autoDetect: guess', guess);
  updateVisibility();
  await fetchMetadataAuto(guess);
}

function updateAutoDetectControls() {
  const isAuto = ui.autoDetectToggle.checked;
  ui.autoDetectBtn.disabled = isAuto;
}

async function manualDetectFromInputs() {
  const guess = {
    title: ui.titleInput.value.trim(),
    year: ui.yearInput.value.trim(),
    season: ui.seasonInput.value.trim(),
    episode: ui.episodeInput.value.trim(),
    typeHint: ui.typeSelect.value
  };
  await fetchMetadataAuto(guess);
}

async function loadPath(targetPath) {
  const scan = await window.api.scanPath(targetPath);
  if (!scan) {
    return;
  }

  resetAllInputs({ skipPreview: true });

  state.targetPath = targetPath;
  state.kind = scan.kind;
  state.videoFiles = scan.videoFiles || [];
  state.mainVideo = scan.mainVideo;
  state.mediaInfo = scan.mediaInfo;
  state.episodeMap = {};
  logDebug('scanPath result', {
    kind: scan.kind,
    mainVideo: scan.mainVideo,
    videoCount: state.videoFiles.length,
    mediaInfoError: scan.mediaInfo?.error || ''
  });

  if (scan.mainVideo) {
    const lastDot = scan.mainVideo.lastIndexOf('.');
    state.mainExtension = lastDot !== -1 ? scan.mainVideo.slice(lastDot) : '';
  } else {
    state.mainExtension = '';
  }

  ui.selectedPath.textContent = targetPath;
  ui.resetSourceBtn.classList.remove('hidden');
  setHint(ui.scanHint, scan.mainVideo ? `File analizzato: ${scan.mainVideo}` : 'Nessun file analizzato.');

  const settings = loadSettings();
  updateTagSuggestion(settings);
  updateTagOptions(settings);

  if (scan.mediaInfo?.error) {
    setMediaInfoBadgeVisible(false);
    setHint(ui.scanHint, `Errore MediaInfo: ${scan.mediaInfo.error}`);
  } else {
    setMediaInfoBadgeVisible(Boolean(scan.mainVideo));
  }

  if (scan.kind === 'dir') {
    ui.renameFolderCheckbox.disabled = false;
    if (!ui.renameFolderCheckbox.checked) {
      ui.renameFolderCheckbox.checked = true;
    }
  } else {
    ui.renameFolderCheckbox.checked = false;
    ui.renameFolderCheckbox.disabled = true;
  }

  if (scan.kind === 'dir') {
    ui.typeSelect.value = ui.typeSelect.value.includes('anime') ? 'anime-season' : 'tv-season';
  }

  fillFromMediaInfo();
  await autoDetectFromPath();
  schedulePreview();
}

async function showMediaInfoReport() {
  if (!state.mainVideo || state.mediaInfo?.error) {
    return;
  }
  ui.mediaInfoText.textContent = 'Caricamento...';
  ui.mediaInfoPath.textContent = `File: ${state.mainVideo}`;
  openMediaInfoModal();
  const result = await window.api.getMediaInfoText(state.mainVideo);
  if (result?.error) {
    ui.mediaInfoText.textContent = `Errore MediaInfo: ${result.error}`;
  } else {
    ui.mediaInfoText.textContent = result?.text || 'Nessun output disponibile.';
  }
}

ui.selectFileBtn.addEventListener('click', async () => {
  const filePath = await window.api.selectFile();
  if (filePath) {
    await loadPath(filePath);
  }
});

ui.selectFolderBtn.addEventListener('click', async () => {
  const folderPath = await window.api.selectFolder();
  if (folderPath) {
    await loadPath(folderPath);
  }
});

ui.resetSourceBtn.addEventListener('click', () => {
  resetSource();
});

ui.autoDetectBtn.addEventListener('click', async () => {
  await manualDetectFromInputs();
});

ui.autoDetectToggle.addEventListener('change', async () => {
  updateAutoDetectControls();
  if (ui.autoDetectToggle.checked) {
    await autoDetectFromPath();
  }
});

ui.applyRenameBtn.addEventListener('click', async () => {
  if (!state.targetPath) {
    setHint(ui.renameHint, 'Seleziona un file o una cartella.');
    return;
  }

  const form = getFormState();
  const missing = getMissingRenameRequirements(form);
  if (missing.length) {
    const message = `${missing.join('\n')}\n\nVuoi procedere comunque?`;
    const proceed = await openConfirmModal(message);
    if (!proceed) {
      return;
    }
  }

  const { folderName, fileRenames } = buildRenameTargets();
  if (!fileRenames.length && !folderName) {
    setHint(ui.renameHint, 'Inserisci i campi minimi per generare il nome.');
    return;
  }

  const payload = {
    targetPath: state.targetPath,
    renameFiles: ui.renameFileCheckbox.checked,
    renameFolder: state.kind === 'dir' && ui.renameFolderCheckbox.checked,
    folderName: state.kind === 'dir' ? folderName : '',
    fileRenames
  };

  const result = await window.api.applyRename(payload);
  logDebug('applyRename result', result);
  if (result.ok) {
    setHint(ui.renameHint, 'Rinomina completata.');
    showToast('Rinomina completata.');
    applyRenameResults(result, payload);
  } else {
    const warning = result.warnings.length ? result.warnings.join(' | ') : 'Errore nella rinomina.';
    setHint(ui.renameHint, warning);
  }
  schedulePreview();
});

ui.openSettingsBtn.addEventListener('click', openSettings);
ui.closeSettingsBtn.addEventListener('click', closeSettings);
ui.settingsModal.addEventListener('click', (event) => {
  if (event.target.classList.contains('modal-backdrop')) {
    closeSettings();
  }
});

if (ui.themeToggle) {
  ui.themeToggle.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light') ? 'dark' : 'light';
    applyTheme(nextTheme);
    saveTheme(nextTheme);
  });
}

ui.mediaInfoBadge.addEventListener('click', async () => {
  if (!ui.mediaInfoBadge.classList.contains('clickable')) {
    return;
  }
  await showMediaInfoReport();
});

ui.closeMediaInfoBtn.addEventListener('click', closeMediaInfoModal);

if (ui.confirmCancelBtn) {
  ui.confirmCancelBtn.addEventListener('click', () => resolveConfirm(false));
}

if (ui.confirmOkBtn) {
  ui.confirmOkBtn.addEventListener('click', () => resolveConfirm(true));
}

if (ui.confirmModal) {
  ui.confirmModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      resolveConfirm(false);
    }
  });
}
ui.mediaInfoModal.addEventListener('click', (event) => {
  if (event.target.classList.contains('modal-backdrop')) {
    closeMediaInfoModal();
  }
});

document.querySelectorAll('.icon-button[data-target]').forEach((button) => {
  const targetId = button.dataset.target;
  const input = document.getElementById(targetId);
  if (!input) {
    return;
  }
  setSecretVisibility(input, button, false);
  button.addEventListener('click', () => {
    const visible = input.type === 'password';
    setSecretVisibility(input, button, visible);
  });
});

document.querySelectorAll('.key-verify').forEach((button) => {
  button.addEventListener('click', () => {
    verifyApiKey(button);
  });
});

['omdbKeyInput', 'tmdbKeyInput', 'tvdbKeyInput'].forEach((id) => {
  const input = document.getElementById(id);
  if (!input) {
    return;
  }
  input.addEventListener('input', () => {
    const button = document.querySelector(`.key-verify[data-input="${id}"]`);
    if (button) {
      setKeyVerifyState(button, '', '');
    }
  });
});

ui.openDebugBtn.addEventListener('click', openDebugModal);
ui.closeDebugBtn.addEventListener('click', closeDebugModal);
ui.clearDebugBtn.addEventListener('click', () => {
  debugState.buffer = [];
  updateDebugLogView();
});
ui.debugModal.addEventListener('click', (event) => {
  if (event.target.classList.contains('modal-backdrop')) {
    closeDebugModal();
  }
});

ui.openRulesBtn.addEventListener('click', openRulesModal);
ui.closeRulesBtn.addEventListener('click', closeRulesModal);
ui.rulesModal.addEventListener('click', (event) => {
  if (event.target.classList.contains('modal-backdrop')) {
    closeRulesModal();
  }
});

if (ui.openGroupDefaultsBtn) {
  ui.openGroupDefaultsBtn.addEventListener('click', openGroupDefaultsModal);
}
if (ui.closeGroupDefaultsBtn) {
  ui.closeGroupDefaultsBtn.addEventListener('click', closeGroupDefaultsModal);
}
if (ui.groupDefaultsModal) {
  ui.groupDefaultsModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      closeGroupDefaultsModal();
    }
  });
}

setupDropdown(ui.serviceDropdown, ui.serviceInputBtn, ui.serviceInput, ui.serviceDropdownMenu);
setupDropdown(ui.formatDropdown, ui.formatSelectBtn, ui.formatSelect, ui.formatDropdownMenu);
setupDropdown(
  ui.repackDropdown,
  ui.repackSelectBtn,
  ui.repackSelect,
  ui.repackDropdown.querySelector('.dropdown-menu')
);
setupDropdown(ui.sourceDropdown, ui.sourceInputBtn, ui.sourceInput, ui.sourceDropdownMenu);
setupDropdown(ui.resolutionDropdown, ui.resolutionSelectBtn, ui.resolutionInput, ui.resolutionDropdownMenu);
setupDropdown(ui.videoCodecDropdown, ui.videoCodecSelectBtn, ui.videoCodecInput, ui.videoCodecDropdownMenu);
setupDropdown(ui.audioCodecDropdown, ui.audioCodecSelectBtn, ui.audioCodecInput, ui.audioCodecDropdownMenu);
setupDropdown(ui.audioChannelsDropdown, ui.audioChannelsSelectBtn, ui.audioChannelsInput, ui.audioChannelsDropdownMenu);
setupDropdown(ui.tagDropdown, ui.tagInputBtn, ui.tagInput, ui.tagDropdownMenu);

document.addEventListener('click', (event) => {
  if (!event.target.closest('.dropdown')) {
    closeAllDropdowns();
  }
});

ui.saveSettingsBtn.addEventListener('click', () => {
  const settings = getSettings();
  saveSettings(settings);
  applySettingsToUI(settings);
  setHint(ui.settingsHint, 'Impostazioni salvate.');
});

ui.languageTagInput.addEventListener('input', () => {
  ui.languageTagInput.dataset.manual = 'true';
});

ui.originalLanguageInput.addEventListener('input', () => {
  if (!ui.languageTagInput.dataset.manual || ui.languageTagInput.dataset.manual === 'false') {
    ui.languageTagInput.value = buildLanguageTag(state.audioLangs, ui.originalLanguageInput.value);
  }
  schedulePreview();
});

[
  ui.typeSelect,
  ui.formatSelect,
  ui.titleInput,
  ui.yearInput,
  ui.includeYear,
  ui.seasonInput,
  ui.episodeInput,
  ui.episodeTitleInput,
  ui.partInput,
  ui.originalLanguageInput,
  ui.languageTagInput,
  ui.audioCodecInput,
  ui.audioChannelsInput,
  ui.audioMetaInput,
  ui.resolutionInput,
  ui.videoCodecInput,
  ui.uhdCheckbox,
  ui.hdrCheckbox,
  ui.hdr10plusCheckbox,
  ui.dvCheckbox,
  ui.threeDCheckbox,
  ui.editionInput,
  ui.hybridCheckbox,
  ui.repackSelect,
  ui.serviceInput,
  ui.sourceInput,
  ui.regionInput,
  ui.tagInput,
  ui.renameFileCheckbox,
  ui.renameFolderCheckbox,
  ui.imdbInput,
  ui.tvdbInput
].forEach((element) => {
  element.addEventListener('input', () => {
    if (element.dataset.auto === 'true') {
      element.dataset.auto = 'false';
    } else {
      element.dataset.manual = 'true';
    }
    setAutoFieldState(element, false);
    schedulePreview();
  });
  element.addEventListener('change', () => {
    if (element === ui.formatSelect && state.mediaInfo) {
      resetDropdown(ui.videoCodecInput, ui.videoCodecSelectBtn, 'Seleziona codec');
      fillFromMediaInfo();
    }
    schedulePreview();
  });
});

const initialSettings = loadSettings();
applySettingsToUI(initialSettings);
applyTheme(loadTheme());
updateAutoDetectControls();
updateVisibility();
refreshPreview();

logDebug('Renderer loaded');
