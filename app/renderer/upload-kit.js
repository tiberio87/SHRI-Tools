// Upload wizard/integrated mode: build payloads, BBCode, and Unit3D upload flow.
import { ui } from './dom.js';
import { state, debugState } from './state.js';
import {
  UNIT3D_CATEGORY_ID,
  SHRI_TYPE_ID,
  UNIT3D_RESOLUTION_ID,
  LAST_UPLOAD_STORAGE_KEY
} from './constants.js';
import { renderBbcodePreview } from './bbcode.js';
import { getParentPath } from './path-utils.js';
import {
  formatLangName,
  getAudioTracks,
  getGeneralTrack,
  getTrackLang,
  getTrackValue,
  getVideoTrack,
  pickBestItalianAudioTrack,
  detectAudioMeta,
  mapAudioCodec,
  mapVideoCodec,
  parseChannels
} from './media-utils.js';

export function createUploadKit(deps) {
  const {
    buildMediaInfoShort,
    computeBaseName,
    copyToClipboard,
    getFormState,
    getAudioOverrides,
    getMissingRenameRequirements,
    getPathBaseName,
    loadSettings,
    metadataTools,
    logDebug,
    openWizardStep,
    openConfirmModal,
    setHint,
    showToast,
    updateFfmpegHint
  } = deps;

  let uploadMiMode = 'short';
  let uploadMiShortCache = '';
  let uploadMiFullCache = '';
  let uploadMiCopyLabel = 'MediaInfo copiato.';
  let uploadIdsText = '';
  let screensProgressUnsub = null;
  let screensProgressRequestId = '';
  let uploadTitleOverride = '';
  let uploadTitleBase = '';
  let uploadTitleFallback = false;
  let uploadTitleSourcePath = '';
  let lastUploadDownloadUrl = '';
  let lastTrackerTorrentPath = '';
  let reopenMode = false;
  let appVersion = '';
  window.api?.getAppVersion?.().then((v) => { appVersion = v || ''; }).catch(() => {});

  function getHdrLabelFromForm(form) {
    const tokens = [];
    if (form.dv) {
      tokens.push('DV');
    }
    if (form.hdr10plus) {
      tokens.push('HDR10+');
    }
    if (form.hdr) {
      tokens.push('HDR');
    }
    return tokens.join(' ');
  }

  function isFullDisc(form) {
    return form?.format === 'Full Disc';
  }

  function isDvdDisc(form) {
    if (!isFullDisc(form)) {
      return false;
    }
    const source = String(form.source || '').toUpperCase();
    if (!source) {
      return false;
    }
    if (source.includes('BLURAY') || source.includes('UHD')) {
      return false;
    }
    return source.includes('DVD') || source.includes('HDDVD') || source.includes('HD DVD');
  }

  function shouldUseBdInfo(form) {
    return isFullDisc(form) && !isDvdDisc(form);
  }

  function extractBdInfoSummary(rawText) {
    const text = String(rawText || '').trim();
    if (!text) {
      return '';
    }
    const quickIndex = text.toLowerCase().indexOf('quick summary');
    if (quickIndex === -1) {
      return text;
    }
    const after = text.slice(quickIndex);
    const lines = after.split(/\r?\n/);
    let startIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].toLowerCase().includes('quick summary')) {
        startIndex = i + 1;
        break;
      }
    }
    if (startIndex === -1) {
      return text;
    }
    const out = [];
    for (let i = startIndex; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (/^\*{5,}/.test(trimmed) || /^files?:/i.test(trimmed) || /^chapters?:/i.test(trimmed)) {
        break;
      }
      out.push(line);
    }
    const summary = out.join('\n').replace(/ +/g, ' ').trim();
    return summary || text;
  }

  function parseBdInfoFiles(rawText, targetPlaylist = '') {
    const text = String(rawText || '');
    if (!text) {
      return [];
    }
    const lines = text.split(/\r?\n/);
    const files = [];
    let inFiles = false;
    const sectionEnd = (line) =>
      /^(chapters?|video|audio|subtitles?|playlist|quick summary|stream diagnostics)\s*:/i.test(line.trim());
    const normalizedPlaylist = String(targetPlaylist || '').trim().toUpperCase();
    const playlistToken = normalizedPlaylist && !normalizedPlaylist.endsWith('.MPLS')
      ? `${normalizedPlaylist}.MPLS`
      : normalizedPlaylist;
    let startIndex = 0;
    if (playlistToken) {
      for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i] || '';
        if (new RegExp(`^\\s*PLAYLIST:\\s*${playlistToken}\\b`, 'i').test(raw)) {
          startIndex = i;
          break;
        }
        if (new RegExp(`^\\s*Name:\\s*${playlistToken}\\b`, 'i').test(raw)) {
          startIndex = i;
          break;
        }
      }
    }
    for (let i = startIndex; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const line = String(rawLine || '');
      if (!inFiles && /^files\s*:/i.test(line.trim())) {
        inFiles = true;
        continue;
      }
      if (!inFiles) {
        continue;
      }
      if (playlistToken && new RegExp(`^\\s*PLAYLIST:\\s*\\d{5}\\.MPLS`, 'i').test(line) && !line.toUpperCase().includes(playlistToken)) {
        break;
      }
      if (!line.trim()) {
        if (files.length) {
          break;
        }
        continue;
      }
      if (sectionEnd(line)) {
        break;
      }
      if (/^name\s+/i.test(line) || /^-+/.test(line.trim())) {
        continue;
      }
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) {
        continue;
      }
      let fileName = parts[0];
      let offset = 0;
      if (parts[1] && parts[1].startsWith('(') && parts[1].endsWith(')')) {
        fileName = `${parts[0]} ${parts[1]}`;
        offset = 1;
      }
      if (!/\.m2ts$/i.test(fileName)) {
        const fileMatch = line.match(/([0-9]{5}\.M2TS)/i);
        if (!fileMatch) {
          continue;
        }
        fileName = fileMatch[1];
      }
      const lengthRaw = parts[2 + offset] || '';
      const length = lengthRaw.split('.').shift() || '';
      const seconds = length
        ? length
          .split(':')
          .map((part) => Number.parseInt(part, 10))
          .reduce((acc, part) => (Number.isNaN(part) ? acc : acc * 60 + part), 0)
        : 0;
      const sizeRaw = parts[3 + offset] || '';
      const size = Number.parseInt(sizeRaw.replace(/[^\d]/g, ''), 10) || 0;
      files.push({
        file: fileName.toUpperCase(),
        length: lengthRaw || '',
        seconds,
        size
      });
    }
    return files;
  }

  function buildStreamPath(rootPath, streamFile) {
    const base = String(rootPath || '');
    if (!base || !streamFile) {
      return '';
    }
    const sep = base.includes('\\') ? '\\' : '/';
    const trimmed = base.replace(/[\\/]+$/, '');
    return `${trimmed}${sep}BDMV${sep}STREAM${sep}${streamFile}`;
  }

  function detectBdInfoSkipFrame(rawText) {
    const text = String(rawText || '');
    if (!text) {
      return '';
    }
    if (/VC-1/i.test(text)) {
      return 'nokey';
    }
    if (/Dolby Vision/i.test(text) || /\bDV\b/i.test(text)) {
      return 'nokey';
    }
    return '';
  }

  function getBdInfoSummaryText() {
    if (state.bdInfoError) {
      return '';
    }
    return extractBdInfoSummary(state.bdInfoRaw || '');
  }

  function buildUploadInfoLine(form) {
    const parts = [];
    if (form.resolution) {
      parts.push(form.resolution);
    }
    let source = String(form.source || '');
    if (!source && (form.format === 'WEB-DL' || form.format === 'WEBRip')) {
      source = form.format;
    }
    if (source) {
      parts.push(source.replace('Blu-ray', 'BluRay').replace('Web', 'WEB-DL'));
    }

    let videoCodec = String(form.videoCodec || '');
    if (!videoCodec && state.mediaInfo) {
      const video = getVideoTrack(state.mediaInfo) || {};
      videoCodec = mapVideoCodec(video, form.format);
    }
    if (videoCodec) {
      const upper = videoCodec.toUpperCase();
      if (upper.includes('HEVC') || upper.includes('H.265')) {
        parts.push('x265');
      } else if (upper.includes('AVC') || upper.includes('H.264')) {
        parts.push('x264');
      } else {
        parts.push(videoCodec);
      }
    }

    const hdrLabel = getHdrLabelFromForm(form);
    if (hdrLabel) {
      parts.push(hdrLabel);
    }

    const bestAudio = state.mediaInfo ? pickBestItalianAudioTrack(state.mediaInfo) : null;
    if (bestAudio) {
      const audioBits = [];
      const audioCodec = mapAudioCodec(bestAudio);
      if (audioCodec) {
        audioBits.push(audioCodec);
      }
      const channels = parseChannels(bestAudio.Channels || bestAudio['Channel(s)'] || '');
      if (channels) {
        audioBits.push(channels);
      }
      const audioMeta = detectAudioMeta(bestAudio);
      if (audioMeta) {
        audioBits.push(audioMeta);
      }
      if (audioBits.length) {
        parts.push(audioBits.join(' '));
      }
    }

    const audioTracks = state.mediaInfo ? getAudioTracks(state.mediaInfo) : [];
    const audioLangs = audioTracks
      .map((track) => formatLangName(getTrackLang(track)))
      .filter(Boolean);
    if (audioLangs.includes('Italiano')) {
      parts.push('Italiano');
    } else if (audioLangs.includes('Inglese')) {
      parts.push('Inglese');
    } else if (audioLangs.length) {
      parts.push(audioLangs[0].title ? audioLangs[0].title() : audioLangs[0]);
    } else if (form.languageTag) {
      if (/ITA/i.test(form.languageTag)) {
        parts.push('Italiano');
      } else if (/ENG/i.test(form.languageTag)) {
        parts.push('Inglese');
      }
    }

    return parts.filter(Boolean).join(' ');
  }

  function buildUploadTitleBase() {
    const baseForm = getFormState();
    const settings = loadSettings?.() || {};
    const metaTitle = state.metadata?.title ? String(state.metadata.title).trim() : '';
    const title = metaTitle || baseForm.title;
    const fallback = !metaTitle && Boolean(baseForm.title);
    let tag = baseForm.tag || '';
    if (!tag && settings.autoNoGroupTag !== false) {
      const path = state.mainVideo || state.targetPath || '';
      tag = metadataTools?.extractGroupTagFromName?.(path, [], { allowNoGroup: true }) || '';
    }
    const form = { ...baseForm, title, tag };
    const isDir = state.kind === 'dir';
    const seasonType = baseForm.type.includes('anime') ? 'anime-season' : 'tv-season';
    const type = isDir ? seasonType : baseForm.type;
    const dropEpisodeTitle = type === 'tv-episode' || type === 'anime-episode';
    const audioOverrides = typeof getAudioOverrides === 'function' ? getAudioOverrides() : {};
    const baseName = computeBaseName(form, {
      type,
      separatorStyle: 'spaces',
      episodeTitle: dropEpisodeTitle ? '' : form.episodeTitle,
      allowNoGroupTag: settings.autoNoGroupTag !== false,
      tokenStyle: 'title',
      ...audioOverrides
    });
    return { title: baseName, fallback };
  }

  function buildUploadTitle() {
    const { title, fallback } = buildUploadTitleBase();
    const baseTitle = title || '';
    const overridden = Boolean(uploadTitleOverride);
    return {
      title: overridden ? uploadTitleOverride : baseTitle,
      baseTitle,
      fallback,
      overridden
    };
  }

  function updateUploadTitleHint() {
    if (!ui.uploadTitleHint) {
      return;
    }
    if (uploadTitleOverride) {
      ui.uploadTitleHint.textContent = 'Titolo modificato manualmente.';
      return;
    }
    ui.uploadTitleHint.textContent = uploadTitleFallback
      ? 'Titolo API non disponibile: uso fallback dal file.'
      : '';
  }

  function syncUploadTitleOverride(value) {
    const nextValue = String(value || '').trim();
    if (!nextValue || nextValue === uploadTitleBase) {
      uploadTitleOverride = '';
      if (ui.uploadTitleInput) {
        ui.uploadTitleInput.value = uploadTitleBase || '-';
      }
    } else {
      uploadTitleOverride = nextValue;
    }
    updateUploadTitleHint();
  }

  function normalizeNumericId(value) {
    if (value === undefined || value === null || value === '') {
      return '0';
    }
    const raw = String(value).trim();
    if (!raw) {
      return '0';
    }
    const numeric = raw.replace(/[^\d]/g, '');
    if (!numeric) {
      return '0';
    }
    const parsed = Number.parseInt(numeric, 10);
    if (!Number.isFinite(parsed) || parsed === 0) {
      return '0';
    }
    return String(parsed);
  }

  // IMDb ids are stored without "tt" in tracker payload/inputs.
  function normalizeImdbValue(value) {
    if (value === undefined || value === null || value === '') {
      return '0';
    }
    let raw = String(value).trim().toLowerCase();
    if (!raw) {
      return '0';
    }
    if (raw.startsWith('tt')) {
      raw = raw.slice(2);
    }
    const numeric = raw.replace(/[^\d]/g, '');
    if (!numeric) {
      return '0';
    }
    const parsed = Number.parseInt(numeric, 10);
    if (!Number.isFinite(parsed) || parsed === 0) {
      return '0';
    }
    return String(parsed).padStart(7, '0');
  }

  function normalizeKeywords(value) {
    if (!value) {
      return '';
    }
    if (Array.isArray(value)) {
      return value
        .map((entry) => String(entry || '').replace(/,/g, ' ').trim())
        .filter(Boolean)
        .join(', ');
    }
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function buildTrackerTorrentFilename() {
    const title = String(ui.uploadTitleInput?.value || '').trim();
    if (!title) {
      return 'tracker.torrent';
    }
    const safe = title
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '.')
      .replace(/\.+$/g, '');
    return safe ? `${safe}.torrent` : 'tracker.torrent';
  }

  function readLastUpload() {
    try {
      const raw = localStorage.getItem(LAST_UPLOAD_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeLastUpload(data) {
    if (!data) {
      return;
    }
    localStorage.setItem(LAST_UPLOAD_STORAGE_KEY, JSON.stringify(data));
  }

  function updateReopenUploadButton() {
    if (!ui.reopenLastUploadBtn) {
      return;
    }
    const last = readLastUpload();
    ui.reopenLastUploadBtn.classList.toggle('hidden', !last);
  }

  function buildQbitBaseUrl(settings) {
    const hostRaw = String(settings?.qbitHost || '').trim();
    if (!hostRaw) {
      return '';
    }
    if (/^https?:\/\//i.test(hostRaw)) {
      return hostRaw.replace(/\/+$/, '');
    }
    const protocol = settings?.qbitHttps ? 'https' : 'http';
    const hostPart = hostRaw.replace(/\/+$/, '');
    const hasPort = /:\d+$/.test(hostPart);
    const port = String(settings?.qbitPort || '').trim();
    const suffix = port && !hasPort ? `:${port}` : '';
    return `${protocol}://${hostPart}${suffix}`;
  }

  function buildTransmissionBaseUrl(settings) {
    const hostRaw = String(settings?.transmissionHost || '').trim();
    if (!hostRaw) {
      return '';
    }
    if (/^https?:\/\//i.test(hostRaw)) {
      return hostRaw.replace(/\/+$/, '');
    }
    const protocol = settings?.transmissionHttps ? 'https' : 'http';
    const hostPart = hostRaw.replace(/\/+$/, '');
    const hasPort = /:\d+$/.test(hostPart);
    const port = String(settings?.transmissionPort || '').trim();
    const suffix = port && !hasPort ? `:${port}` : '';
    return `${protocol}://${hostPart}${suffix}`;
  }

  function applyPathMapping(pathValue, localRoot, remoteRoot) {
    const source = String(pathValue || '').trim();
    const local = String(localRoot || '').trim();
    const remote = String(remoteRoot || '').trim();
    if (!source || !local || !remote) {
      return source;
    }
    const sourceNorm = source.replace(/\\/g, '/');
    const localNorm = local.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!sourceNorm.toLowerCase().startsWith(localNorm.toLowerCase())) {
      return source;
    }
    let remainder = sourceNorm.slice(localNorm.length);
    remainder = remainder.replace(/^\/+/, '');
    const remoteTrimmed = remote.replace(/[\\/]+$/, '');
    const remoteSep = remoteTrimmed.includes('\\') ? '\\' : '/';
    if (!remainder) {
      return remoteTrimmed;
    }
    const normalizedRemainder = remainder.split('/').join(remoteSep);
    return `${remoteTrimmed}${remoteSep}${normalizedRemainder}`;
  }

  function resolveClientSavePath(settings, client) {
    const useTransmission = client === 'transmission';
    let basePath = '';
    const explicitSavePath = useTransmission ? settings?.transmissionSavePath : settings?.qbitSavePath;
    const hasExplicitSavePath = Boolean(explicitSavePath);
    if (explicitSavePath) {
      basePath = String(explicitSavePath).trim();
    } else if (state.kind === 'dir') {
      basePath = getParentPath(state.targetPath);
    } else {
      basePath = getParentPath(state.mainVideo || state.targetPath);
    }
    if (!basePath) {
      return '';
    }
    if (hasExplicitSavePath) {
      return basePath;
    }
    const localMap = String(
      useTransmission ? settings?.transmissionPathMapLocal : settings?.qbitPathMapLocal || ''
    ).trim();
    const remoteMap = String(
      useTransmission ? settings?.transmissionPathMapRemote : settings?.qbitPathMapRemote || ''
    ).trim();
    if (localMap && remoteMap) {
      return applyPathMapping(basePath, localMap, remoteMap);
    }
    return basePath;
  }

  function hasClientSavePath(settings) {
    const client = settings?.torrentClient || 'qbit';
    if (client === 'transmission') {
      return Boolean(settings?.transmissionSavePath);
    }
    return Boolean(settings?.qbitSavePath);
  }

  function extractDownloadUrl(result) {
    const data = result?.data;
    const candidates = [
      data?.data,
      data?.download_url,
      data?.downloadUrl,
      data?.url
    ];
    for (const item of candidates) {
      if (typeof item === 'string' && item.trim()) {
        return item.trim();
      }
    }
    return '';
  }

  function setPostUploadHint(message) {
    if (!ui.postUploadHint) {
      return;
    }
    ui.postUploadHint.textContent = message || '';
  }

  function canSendToClient(settings) {
    const client = settings?.torrentClient || 'qbit';
    if (!lastTrackerTorrentPath) {
      return false;
    }
    if (reopenMode && !hasClientSavePath(settings)) {
      return false;
    }
    if (client === 'transmission') {
      return Boolean(settings?.transmissionHost);
    }
    return Boolean(settings?.qbitHost && settings?.qbitUsername && settings?.qbitPassword);
  }

  function getJobFileTitle() {
    const raw = String(ui.torrentNameInput?.value || '').trim();
    return raw
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '.')
      .replace(/\.+$/g, '') || 'job';
  }

  function buildTrackerOutputDir(settings, title) {
    const baseDir = String(settings?.torrentOutputDir || '').trim();
    if (!baseDir) {
      return '';
    }
    const safeTitle = String(title || 'job')
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '.')
      .replace(/\.+$/g, '') || 'job';
    const separator = baseDir.includes('\\') ? '\\' : '/';
    const trimmed = baseDir.replace(/[\\/]+$/, '');
    return `${trimmed}${separator}${safeTitle}`;
  }

  function openPostUploadModal(result, settings) {
    if (!ui.postUploadModal) {
      return;
    }
    reopenMode = false;
    lastUploadDownloadUrl = extractDownloadUrl(result);
    const outputDir = buildTrackerOutputDir(settings, getJobFileTitle());
    if (ui.downloadTrackerTorrentBtn) {
      ui.downloadTrackerTorrentBtn.disabled = !lastUploadDownloadUrl || !outputDir;
    }
    if (ui.openTrackerOutputBtn) {
      ui.openTrackerOutputBtn.disabled = !outputDir;
    }
    if (ui.sendToClientBtn) {
      ui.sendToClientBtn.disabled = !canSendToClient(settings);
    }
    if (!outputDir) {
      setPostUploadHint('Imposta la cartella output .torrent nelle impostazioni.');
    } else if (!lastUploadDownloadUrl) {
      setPostUploadHint('URL di download non disponibile nella risposta del tracker.');
    } else {
      setPostUploadHint(`Salvataggio in: ${outputDir}`);
    }
    ui.postUploadModal.classList.remove('hidden');
  }

  function openLastUploadModal() {
    const last = readLastUpload();
    if (!last) {
      reopenMode = false;
      showToast('Nessun upload recente.', 'info');
      updateReopenUploadButton();
      return;
    }
    reopenMode = true;
    const settings = loadSettings();
    lastUploadDownloadUrl = last.downloadUrl || '';
    lastTrackerTorrentPath = last.torrentPath || '';
    const outputDir = buildTrackerOutputDir(settings, last.title || '');
    if (ui.downloadTrackerTorrentBtn) {
      ui.downloadTrackerTorrentBtn.disabled = !lastUploadDownloadUrl || !outputDir;
    }
    if (ui.openTrackerOutputBtn) {
      ui.openTrackerOutputBtn.disabled = !outputDir;
    }
    if (ui.sendToClientBtn) {
      ui.sendToClientBtn.disabled = !canSendToClient(settings);
    }
    const timeLabel = last.createdAt ? new Date(last.createdAt).toLocaleString() : '';
    const titleLabel = last.title ? `Ultimo upload: ${last.title}` : 'Ultimo upload';
    const hintParts = [titleLabel, timeLabel].filter(Boolean);
    const baseHint = hintParts.join(' · ');
    const savePathMissing = !hasClientSavePath(settings);
    if (savePathMissing) {
      setPostUploadHint(`${baseHint} | Imposta un Save path nelle impostazioni per riaprire l'ultimo upload.`);
    } else if (!outputDir) {
      setPostUploadHint(`${baseHint} | Imposta la cartella output .torrent nelle impostazioni.`);
    } else if (!lastUploadDownloadUrl) {
      setPostUploadHint(`${baseHint} | URL di download non disponibile nella risposta del tracker.`);
    } else {
      setPostUploadHint(`${baseHint} | Salvataggio in: ${outputDir}`);
    }
    ui.postUploadModal.classList.remove('hidden');
  }

  async function downloadTrackerTorrent() {
    const settings = loadSettings();
    const baseUrl = settings.unit3dBaseUrl || '';
    const apiKey = settings.unit3dApiKey || '';
    const outputDir = buildTrackerOutputDir(settings, getJobFileTitle());
    if (!baseUrl || !apiKey) {
      showToast('Imposta Base URL e API key UNIT3D.', 'warning');
      return;
    }
    if (!outputDir) {
      showToast('Imposta la cartella output .torrent.', 'warning');
      return;
    }
    if (!lastUploadDownloadUrl) {
      showToast('URL di download non disponibile.', 'warning');
      return;
    }
    if (!window.api?.unit3dDownloadTorrent) {
      showToast('Download .torrent non disponibile.', 'error');
      return;
    }
    if (ui.downloadTrackerTorrentBtn) {
      ui.downloadTrackerTorrentBtn.disabled = true;
    }
    try {
      const fileName = buildTrackerTorrentFilename();
      const result = await window.api.unit3dDownloadTorrent({
        baseUrl,
        apiKey,
        downloadUrl: lastUploadDownloadUrl,
        outputDir,
        fileName
      });
      if (result?.ok) {
        lastTrackerTorrentPath = result.outputPath || '';
        showToast('Torrent scaricato.', 'success');
        setPostUploadHint(`Salvato in: ${result.outputPath || outputDir}`);
        const last = readLastUpload() || {};
        writeLastUpload({
          ...last,
          torrentPath: lastTrackerTorrentPath,
          downloadUrl: lastUploadDownloadUrl || last.downloadUrl || '',
          title: last.title || ui.uploadTitleInput?.value || '',
          createdAt: last.createdAt || Date.now()
        });
        if (ui.sendToClientBtn) {
          ui.sendToClientBtn.disabled = !canSendToClient(settings);
        }
      } else {
        showToast(result?.error || 'Errore download.', 'error');
        setPostUploadHint(result?.error || 'Errore download.');
      }
    } finally {
      if (ui.downloadTrackerTorrentBtn) {
        ui.downloadTrackerTorrentBtn.disabled = false;
      }
    }
  }

  async function openTrackerOutputFolder() {
    const settings = loadSettings();
    const outputDir = buildTrackerOutputDir(settings, getJobFileTitle());
    if (!outputDir) {
      showToast('Imposta la cartella output job nelle impostazioni.', 'warning');
      return;
    }
    if (!window.api?.openPath) {
      showToast('Apertura cartella non disponibile.', 'error');
      return;
    }
    const result = await window.api.openPath(outputDir);
    if (!result?.ok) {
      showToast(result?.error || 'Errore apertura cartella.', 'error');
    }
  }

  async function sendToTorrentClient() {
    const settings = loadSettings();
    if (!lastTrackerTorrentPath) {
      showToast('Scarica prima il .torrent del tracker.', 'warning');
      return;
    }
    const client = settings?.torrentClient || 'qbit';
    const isTransmission = client === 'transmission';
    if (!isTransmission && (!settings.qbitHost || !settings.qbitUsername || !settings.qbitPassword)) {
      showToast('Configura qBittorrent nelle Impostazioni.', 'warning');
      return;
    }
    if (isTransmission && !settings.transmissionHost) {
      showToast('Configura Transmission nelle Impostazioni.', 'warning');
      return;
    }
    if (reopenMode && !hasClientSavePath(settings)) {
      showToast('Imposta un Save path nelle impostazioni per riaprire l\'ultimo upload.', 'warning');
      return;
    }
    const mapLocal = isTransmission ? settings.transmissionPathMapLocal : settings.qbitPathMapLocal;
    const mapRemote = isTransmission ? settings.transmissionPathMapRemote : settings.qbitPathMapRemote;
    const hasSavePathSetting = Boolean(
      isTransmission ? settings.transmissionSavePath : settings.qbitSavePath
    );
    if (!hasSavePathSetting && ((mapLocal && !mapRemote) || (!mapLocal && mapRemote))) {
      showToast('Completa il mapping locale/remoto (entrambi i campi).', 'warning');
      return;
    }
    const baseUrl = isTransmission ? buildTransmissionBaseUrl(settings) : buildQbitBaseUrl(settings);
    if (!baseUrl) {
      showToast(isTransmission ? 'Host Transmission non valido.' : 'Host qBittorrent non valido.', 'error');
      return;
    }
    const savePath = resolveClientSavePath(settings, client);
    if (!savePath) {
      showToast('Percorso dati non valido.', 'error');
      return;
    }
    if (isTransmission && !window.api?.transmissionAddTorrent) {
      showToast('Invio al client non disponibile.', 'error');
      return;
    }
    if (!isTransmission && !window.api?.qbitAddTorrent) {
      showToast('Invio al client non disponibile.', 'error');
      return;
    }
    if (ui.sendToClientBtn) {
      ui.sendToClientBtn.disabled = true;
    }
    try {
      let result;
      if (isTransmission) {
        result = await window.api.transmissionAddTorrent({
          baseUrl,
          username: settings.transmissionUsername,
          password: settings.transmissionPassword,
          torrentPath: lastTrackerTorrentPath,
          savePath,
          paused: settings.transmissionAutoStart === false
        });
        logDebug?.('transmission add payload', {
          baseUrl,
          savePath,
          paused: settings.transmissionAutoStart === false
        });
        logDebug?.('transmission add response', result);
      } else {
        result = await window.api.qbitAddTorrent({
          baseUrl,
          username: settings.qbitUsername,
          password: settings.qbitPassword,
          torrentPath: lastTrackerTorrentPath,
          savePath,
          category: settings.qbitCategory || '',
          paused: settings.qbitAutoStart === false
        });
        logDebug?.('qbit add payload', {
          baseUrl,
          savePath,
          category: settings.qbitCategory || '',
          paused: settings.qbitAutoStart === false
        });
        logDebug?.('qbit add response', result);
      }
      if (result?.ok) {
        showToast('Torrent inviato al client.', 'success');
        setPostUploadHint(`Inviato al client: ${result?.message || 'OK'}`);
      } else {
        showToast(result?.error || 'Errore invio al client.', 'error');
        setPostUploadHint(result?.error || 'Errore invio al client.');
      }
    } finally {
      if (ui.sendToClientBtn) {
        ui.sendToClientBtn.disabled = !canSendToClient(settings);
      }
    }
  }

  function normalizeIntValue(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = Number.parseInt(String(value).trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseOverrideMap(raw, normalizeKey) {
    const map = {};
    const lines = String(raw || '').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('=')) {
        continue;
      }
      const parts = trimmed.split('=');
      const keyRaw = parts.shift()?.trim();
      const value = parts.join('=').trim();
      if (!keyRaw || !value) {
        continue;
      }
      const key = normalizeKey ? normalizeKey(keyRaw) : keyRaw;
      if (!key) {
        continue;
      }
      map[key] = value;
    }
    return map;
  }

  function getUploadMapping(form, settings) {
    const resolvedSettings = settings || loadSettings();
    const isTv = form.type.includes('tv') || form.type.includes('anime');
    const categoryKey = isTv ? 'TV' : 'MOVIE';
    const categoryOverrides = parseOverrideMap(
      resolvedSettings.unit3dCategoryOverrides,
      (key) => key.trim().toUpperCase()
    );
    const categoryMap = { ...UNIT3D_CATEGORY_ID, ...categoryOverrides };
    const categoryId = categoryMap[categoryKey] || '';
    const typeKey = form.format === 'WEB-DL'
      ? 'WEBDL'
      : form.format === 'WEBRip'
        ? 'WEBRIP'
        : form.format === 'Remux'
          ? 'REMUX'
          : form.format === 'Full Disc'
            ? 'DISC'
            : form.format === 'Encode'
              ? 'ENCODE'
              : '';
    const typeOverrides = parseOverrideMap(
      resolvedSettings.unit3dTypeOverrides,
      (key) => key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    );
    // Local mapping + settings overrides to match tracker typeId.
    const typeMap = { ...SHRI_TYPE_ID, ...typeOverrides };
    const typeId = typeKey ? typeMap[typeKey] : '';
    const resolutionOverrides = parseOverrideMap(
      resolvedSettings.unit3dResolutionOverrides,
      (key) => key.trim().toLowerCase()
    );
    const resolutionMap = { ...UNIT3D_RESOLUTION_ID, ...resolutionOverrides };
    const resolutionId = form.resolution ? resolutionMap[form.resolution] || '' : '';
    const isSd = ['480p', '480i', '576p', '576i'].includes(form.resolution);
    return {
      isTv,
      categoryKey,
      categoryId,
      typeKey,
      typeId,
      resolutionId,
      isSd
    };
  }

  function buildUploadIds() {
    const form = getFormState();
    const settings = loadSettings();
    const mapping = getUploadMapping(form, settings);

    const parts = [];
    if (state.metadata?.tmdbId && state.metadata.tmdbType) {
      parts.push({
        label: 'TMDB',
        value: state.metadata.tmdbId,
        link: `https://www.themoviedb.org/${state.metadata.tmdbType}/${state.metadata.tmdbId}`
      });
    }
    if (state.metadata?.imdbId) {
      const imdbValue = normalizeImdbValue(state.metadata.imdbId);
      if (imdbValue && imdbValue !== '0') {
      parts.push({
        label: 'IMDb',
        value: imdbValue,
        link: `https://www.imdb.com/title/tt${imdbValue}/`
      });
      }
    }
    if (state.metadata?.tvdbSeriesId) {
      const slug = state.metadata.tvdbSeriesSlug;
      const link = slug
        ? `https://thetvdb.com/series/${slug}`
        : `https://thetvdb.com/?tab=series&id=${state.metadata.tvdbSeriesId}`;
      parts.push({
        label: 'TVDB',
        value: state.metadata.tvdbSeriesId,
        link
      });
    }
    const malValue = normalizeNumericId(state.metadata?.malId || state.metadata?.mal);
    if (malValue && malValue !== '0') {
      parts.push({
        label: 'MAL',
        value: malValue,
        link: `https://myanimelist.net/anime/${malValue}`
      });
    }
    return parts;
  }

  function buildScreensGridBbcode() {
    if (!state.screenshots.length) {
      return '[center]Nessuno screenshot disponibile[/center]';
    }
    const items = state.screenshots
      .filter((shot) => shot.ok && shot.displayUrl)
      .map((shot) => {
        if (shot.viewerUrl) {
          return `[url=${shot.viewerUrl}][img=350]${shot.displayUrl}[/img][/url]`;
        }
        return `[img=350]${shot.displayUrl}[/img]`;
      })
      .slice(0, 6);
    if (!items.length) {
      return '[center]Nessuno screenshot disponibile[/center]';
    }
    const row1 = items.length >= 2 ? `${items.slice(0, 2).join(' ')} \n` : `${items.join(' ')} \n`;
    const row2 = items.length > 2 ? `${items.slice(2, 4).join(' ')} \n` : '';
    const row3 = items.length > 4 ? `${items.slice(4, 6).join(' ')} \n` : '';
    return `[center]${row1}${row2}${row3}[/center]`;
  }

  function buildSyntheticMediaInfo(form) {
    if (!state.mediaInfo) {
      return null;
    }
    const general = getGeneralTrack(state.mediaInfo) || {};
    const video = getVideoTrack(state.mediaInfo) || {};
    const audioTracks = getAudioTracks(state.mediaInfo);
    const textTracks = (state.mediaInfo?.media?.track || []).filter((track) => track['@type'] === 'Text');

    const bestAudio = pickBestItalianAudioTrack(state.mediaInfo) || (audioTracks.length ? audioTracks[0] : null);

    const fileName = state.mainVideo ? getPathBaseName(state.mainVideo) : String(general.FileName || 'file.mkv');
    const fileSizeRaw = getTrackValue(general, ['FileSize', 'FileSize/String', 'FileSize_String']);
    const fileSizeNum = Number(fileSizeRaw);
    const fileSize = Number.isFinite(fileSizeNum) ? `${(fileSizeNum / (1024 ** 3)).toFixed(1)} GiB` : String(fileSizeRaw || '');
    const durationRaw = getTrackValue(general, ['Duration']);
    const durationSec = Number(durationRaw) || 0;
    const hours = Math.floor(durationSec / 3600);
    const minutes = Math.floor((durationSec % 3600) / 60);
    const duration = hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
    const totalBitrateRaw = getTrackValue(general, ['OverallBitRate', 'OverallBitRate/String', 'OverallBitRate_String']);
    const totalBitrateNum = Number(totalBitrateRaw);
    const totalBitrate = Number.isFinite(totalBitrateNum) ? `${(totalBitrateNum / 1000000).toFixed(1)} Mb/s` : String(totalBitrateRaw || '');
    const chapterRaw = getTrackValue(general, ['MenuCount', 'Menu_Count', 'CountOfElements', 'Chapters']);
    const chapters = Number(chapterRaw) > 0 ? 'Si' : 'No';

    const videoFormat = getTrackValue(video, ['Format', 'Format_String', 'Format/Info']) || 'N/A';
    const videoFormatUpper = String(videoFormat || '').toUpperCase();
    let videoCodec = videoFormat;
    if (videoFormatUpper.includes('HEVC')) {
      videoCodec = 'x265';
    } else if (videoFormatUpper.includes('AVC') || videoFormatUpper.includes('H.264')) {
      videoCodec = 'x264';
    } else if (videoFormatUpper.includes('MPEG VIDEO') || videoFormatUpper.includes('MPEG-2')) {
      videoCodec = 'MPEG-2';
    } else if (videoFormatUpper.includes('VC-1') || videoFormatUpper.includes('VC1')) {
      videoCodec = 'VC-1';
    }
    const bitDepthValue = getTrackValue(video, ['BitDepth', 'Bit_depth']) || 10;
    const bitDepth = `${bitDepthValue} bits`;
    const videoBitrateRaw = getTrackValue(video, ['BitRate', 'BitRate/String', 'BitRate_Maximum']);
    const videoBitrateNum = Number(videoBitrateRaw);
    const videoBitrate = Number.isFinite(videoBitrateNum) ? `${(videoBitrateNum / 1000000).toFixed(1)} Mb/s` : String(videoBitrateRaw || '');
    const resolution = form?.resolution || 'N/A';
    const aspectRaw = getTrackValue(video, ['DisplayAspectRatio', 'DisplayAspectRatio/String']);
    const aspectFloat = Number(aspectRaw) || 0;
    let aspect = 'N/A';
    if (aspectFloat) {
      if (aspectFloat >= 1.77 && aspectFloat <= 1.79) {
        aspect = '16:9';
      } else if (aspectFloat >= 1.32 && aspectFloat <= 1.34) {
        aspect = '4:3';
      } else if (aspectFloat >= 2.35 && aspectFloat <= 2.45) {
        aspect = '2.39:1';
      } else {
        aspect = `${aspectFloat.toFixed(2)}:1`;
      }
    }

    const audioFormat = bestAudio ? getTrackValue(bestAudio, ['Format']) : 'N/A';
    let audioName = bestAudio ? getTrackValue(bestAudio, ['Format_Commercial_IfAny', 'Title']) : '';
    if (!audioName && bestAudio) {
      const audioMap = {
        'E-AC-3': 'Dolby Digital Plus',
        'AC-3': 'Dolby Digital',
        TrueHD: 'Dolby TrueHD',
        'MLP FBA': 'Dolby TrueHD',
        'DTS-HD MA': 'DTS-HD Master Audio',
        AAC: 'Advanced Audio Codec'
      };
      audioName = audioMap[String(bestAudio.Format || '')] || String(bestAudio.Format || '');
    }
    let audioChannels = bestAudio ? String(bestAudio.Channels || bestAudio['Channel(s)'] || '') : '';
    if (audioChannels === '6') {
      audioChannels = '5.1';
    } else if (audioChannels === '8') {
      audioChannels = '7.1';
    } else if (audioChannels === '2') {
      audioChannels = '2.0';
    } else {
      audioChannels = parseChannels(audioChannels);
    }
    const audioBitrateRaw = bestAudio ? getTrackValue(bestAudio, ['BitRate', 'BitRate/String']) : '';
    const audioBitrateNum = Number(audioBitrateRaw);
    const audioBitrate = Number.isFinite(audioBitrateNum) ? `${Math.round(audioBitrateNum / 1000)} kb/s` : '0 kb/s';
    const audioLang = bestAudio ? formatLangName(getTrackLang(bestAudio)) || 'Inglese' : 'Inglese';

    let subs = 'Assenti';
    if (textTracks.length) {
      const subLangs = new Set();
      textTracks.forEach((track) => {
        const name = formatLangName(getTrackLang(track));
        if (name) {
          subLangs.add(name);
        }
      });
      subs = subLangs.size ? [...subLangs].sort().join(', ') : 'Assenti';
    }

    return {
      fn: fileName,
      size: fileSize,
      dur: duration,
      totalBr: totalBitrate,
      chap: chapters,
      vidFormat: videoFormat,
      codec: videoCodec,
      depth: bitDepth,
      vidBr: videoBitrate,
      res: resolution,
      asp: aspect,
      audFormat: audioFormat,
      audName: audioName,
      ch: audioChannels,
      audBr: audioBitrate,
      lang: audioLang,
      subs
    };
  }

  function buildLinksSection(form) {
    const imdbId = state.metadata?.imdbId || '';
    const tmdbId = state.metadata?.tmdbId || '';
    if (!imdbId && !tmdbId) {
      return '';
    }
    const type = state.metadata?.tmdbType || (form.type.startsWith('tv') || form.type.startsWith('anime') ? 'tv' : 'movie');
    const imdbSlug = imdbId ? (imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`) : '';
    let lines = '\n[size=13][b][color=#e8024b]--- LINKS ---[/color][/b][/size]\n';
    if (imdbSlug) {
      lines += `[size=11][color=#FFFFFF]IMDb: https://www.imdb.com/title/${imdbSlug}/[/color][/size]\n`;
    }
    if (tmdbId) {
      lines += `[size=11][color=#FFFFFF]TMDb: https://www.themoviedb.org/${type}/${tmdbId}[/color][/size]\n`;
    }
    lines += '\n';
    return lines;
  }

  function buildReleaseNotesSection(form) {
    const tag = (form.tag || '').replace(/^-/, '').trim();
    const tonemapNote = state.screenshotsMeta?.tonemapped ? 'Screenshot tonemappati (HDR -> SDR).' : '';
    const manualNotes = ui.uploadReleaseNotesInput?.value.trim();
    const isIsland = tag.toLowerCase() === 'island';
    const baseNotes = manualNotes || (isIsland
      ? 'Release Shareisland 🏴‍☠️\nFalla girare, condividila e contribuisci a mantenerla viva restando in seed il più possibile.\nGrazie per il supporto!'
      : 'Nulla da aggiungere.');
    let notes = baseNotes;
    if (isIsland) {
      if (tonemapNote) {
        notes = `${baseNotes}\n${tonemapNote}`;
      }
    } else if (tonemapNote) {
      notes = tonemapNote;
    }
    return `[size=13][b][color=#e8024b]--- RELEASE NOTES ---[/color][/b][/size]\n[size=11][color=#FFFFFF]${notes}[/color][/size]`;
  }

  function buildShoutouts(form) {
    const tag = (form.tag || '').replace(/^-/, '').trim();
    if (tag && !['nogroup', 'nogrp', 'unknown', 'unk'].includes(tag.toLowerCase())) {
      return `SHOUTOUTS : ${tag}`;
    }
    const shouts = [
      'The Scene never dies',
      'Arrr! Powered by Rum & Bandwidth',
      'Seed or walk the plank!',
      'Released by Nobody — claimed by Everybody',
      'From the depths of the digital seas',
      'Where bits are free and rum flows endlessly',
      "Pirates don't ask, they share",
      'For the glory of the Scene!',
      'Scene is the paradise'
    ];
    return `SHOUTOUTS : ${shouts[Math.floor(Math.random() * shouts.length)]}`;
  }

  function buildCategoryHeader(form) {
    if (form.type.startsWith('tv') || form.type.startsWith('anime')) {
      return form.type.includes('season')
        ? '--- SERIE TV (STAGIONE) ---'
        : '--- SERIE TV (EPISODIO) ---';
    }
    return '--- FILM ---';
  }

  function buildUploadDescription(form) {
    const title = state.metadata?.title || form.title || 'Unknown';
    const rawSummary = state.metadata?.tmdbOverview || '';
    const summary = rawSummary.trim()
      ? rawSummary.replace(/\s+/g, ' ')
      : 'Riassunto non disponibile.';
    const infoLine = buildUploadInfoLine(form);
    const screens = buildScreensGridBbcode();
    const logoUrl = state.metadata?.tmdbLogoUrl || '';
    const logoSection = logoUrl ? `[center][img=250]${logoUrl}[/img][/center]\n` : '';
    const linksSection = buildLinksSection(form);
    const releaseNotesSection = buildReleaseNotesSection(form);
    const shoutouts = buildShoutouts(form);
    const categoryHeader = buildCategoryHeader(form);

    const useBdInfo = shouldUseBdInfo(form);
    const bdinfoSummary = useBdInfo ? getBdInfoSummaryText() : '';
    const synthetic = useBdInfo ? null : buildSyntheticMediaInfo(form);
    const mediainfoSection = synthetic
      ? `[size=13][b][color=#da8d49]INFO GENERALI[/color][/b][/size]
[size=11][color=#FFFFFF]Nome File       : ${synthetic.fn}[/color][/size]
[size=11][color=#FFFFFF]Dimensioni File : ${synthetic.size}[/color][/size]
[size=11][color=#FFFFFF]Durata          : ${synthetic.dur}[/color][/size]
[size=11][color=#FFFFFF]Bitrate Totale  : ${synthetic.totalBr}[/color][/size]
[size=11][color=#FFFFFF]Capitoli        : ${synthetic.chap}[/color][/size]

[size=13][b][color=#da8d49]VIDEO[/color][/b][/size]
[size=11][color=#FFFFFF]Formato         : ${synthetic.vidFormat}[/color][/size]
[size=11][color=#FFFFFF]Compressore     : ${synthetic.codec}[/color][/size]
[size=11][color=#FFFFFF]Profondità Bit  : ${synthetic.depth}[/color][/size]
[size=11][color=#FFFFFF]Bitrate         : ${synthetic.vidBr}[/color][/size]
[size=11][color=#FFFFFF]Risoluzione     : ${synthetic.res}[/color][/size]
[size=11][color=#FFFFFF]Rapporto        : ${synthetic.asp}[/color][/size]

[size=13][b][color=#da8d49]AUDIO[/color][/b][/size]
[size=11][color=#FFFFFF]Formato         : ${synthetic.audFormat}[/color][/size]
[size=11][color=#FFFFFF]Nome            : ${synthetic.audName}[/color][/size]
[size=11][color=#FFFFFF]Canali          : ${synthetic.ch}[/color][/size]
[size=11][color=#FFFFFF]Bitrate         : ${synthetic.audBr}[/color][/size]
[size=11][color=#FFFFFF]Lingua          : ${synthetic.lang}[/color][/size]

[size=13][b][color=#da8d49]SOTTOTITOLI[/color][/b][/size]
[size=11][color=#FFFFFF]${synthetic.subs}[/color][/size]

`
      : '';
    const bdinfoSection = useBdInfo
      ? `[size=13][b][color=#da8d49]BDINFO[/color][/b][/size]
[size=11][color=#FFFFFF]${bdinfoSummary || 'BDInfo non disponibile.'}[/color][/size]

`
      : '';

    return `[code]
${logoSection}[center][size=13][b][color=#e8024b]${categoryHeader}[/color][/b][/size][/center]
[center][size=13][b][color=#ffffff]${title}[/color][/b][/size][/center]
[center][size=13][color=#ffffff]${infoLine}[/color][/size][/center]

[center][size=13][b][color=#e8024b]--- RIASSUNTO ---[/color][/b][/size][/center]
${summary}

[center][size=13][b][color=#e8024b]--- SCREENS ---[/color][/b][/size][/center]
${screens}
${linksSection}${useBdInfo ? bdinfoSection : mediainfoSection}${releaseNotesSection}

[size=13][b][color=#e8024b]--- SHOUTOUTS ---[/color][/b][/size]
[size=11][color=#FFFFFF]${shoutouts}[/color][/size]

[size=13][color=#0592a3][size=16][b]BUON DOWNLOAD![/b][/size][/color][/size]

[right][size=8]Generated by SHRI-Tools${appVersion ? ` v${appVersion}` : ''}[/size][/right]
[/code]`;
  }

  function buildUploadWarnings(form, settings) {
    const warnings = [];
    const mapping = getUploadMapping(form, settings);
    const useBdInfo = shouldUseBdInfo(form);
    if (useBdInfo && !getBdInfoSummaryText()) {
      warnings.push('BDInfo mancante: necessario per Full Disc.');
    }
    if (isFullDisc(form) && !isDvdDisc(form) && !form.region) {
      warnings.push('Regione non impostata per Full Disc (opzionale).');
    }
    if (isDvdDisc(form) && !form.region) {
      warnings.push('Regione obbligatoria per DVD/HDDVD.');
    }
    if (!state.metadata?.title) {
      warnings.push('Titolo non trovato via API: uso fallback dal file.');
    }
    if (!state.metadata?.tmdbId) {
      warnings.push('TMDB ID mancante (richiesto per upload).');
    }
    if (form.type.includes('tv') && !form.season) {
      warnings.push('Stagione mancante per contenuto TV.');
    }
    if (form.type.includes('episode') && !form.episode) {
      warnings.push('Episodio mancante per contenuto TV.');
    }
    if (!form.resolution) {
      warnings.push('Risoluzione mancante.');
    } else if (!mapping.resolutionId) {
      warnings.push('Risoluzione non mappata per UNIT3D.');
    }
    if (!mapping.categoryId) {
      warnings.push('Category ID non disponibile per UNIT3D.');
    }
    if (!mapping.typeId) {
      warnings.push('Type ID non disponibile per UNIT3D.');
    }
    warnings.push(...getMissingRenameRequirements(form));

    if (!settings.ffmpegPath) {
      warnings.push('FFmpeg non configurato: screenshots non disponibili.');
    }
    if (!settings.imgbbKey && !settings.ptscreensKey) {
      warnings.push('API key immagini mancanti (imgBB/PTScreens).');
    } else {
      if (settings.imageHostPrimary === 'imgbb' && !settings.imgbbKey) {
        warnings.push('Host immagini preferito: chiave imgBB mancante.');
      }
      if (settings.imageHostPrimary === 'ptscreens' && !settings.ptscreensKey) {
        warnings.push('Host immagini preferito: chiave PTScreens mancante.');
      }
    }
    return warnings;
  }

  async function ensureUploadMiFullCache() {
    if (!state.mainVideo) {
      return '';
    }
    if (uploadMiFullCache && uploadMiFullCache !== 'Caricamento...') {
      return uploadMiFullCache;
    }
    uploadMiFullCache = 'Caricamento...';
    if (ui.uploadMiText && uploadMiMode === 'full') {
      ui.uploadMiText.textContent = uploadMiFullCache;
    }
    const result = await window.api.getMediaInfoText(state.mainVideo);
    uploadMiFullCache = result?.text || result?.error || 'Nessun output disponibile.';
    if (ui.uploadMiText && uploadMiMode === 'full') {
      ui.uploadMiText.textContent = uploadMiFullCache;
    }
    const settings = loadSettings();
    const jobDir = buildTrackerOutputDir(settings, getJobFileTitle());
    if (jobDir && uploadMiFullCache && uploadMiFullCache !== 'Nessun output disponibile.') {
      const fileTitle = getJobFileTitle();
      const sep = jobDir.includes('\\') ? '\\' : '/';
      try { await window.api?.saveFileDirect({ filePath: `${jobDir}${sep}${fileTitle}.mediainfo.txt`, content: uploadMiFullCache }); } catch {}
    }
    return uploadMiFullCache;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildUploadSummaryData(form, settings) {
    const mapping = getUploadMapping(form, settings);
    const { title } = buildUploadTitle();
    const tmdb = state.metadata?.tmdbId ? `TMDB ${state.metadata.tmdbId}` : 'TMDB -';
    const imdb = state.metadata?.imdbId ? `IMDb ${state.metadata.imdbId}` : 'IMDb -';
    const tvdb = state.metadata?.tvdbSeriesId ? `TVDB ${state.metadata.tvdbSeriesId}` : 'TVDB -';
    const torrentLabel = state.lastTorrentPath ? state.lastTorrentPath : 'Nessun .torrent';
    const isTv = mapping.isTv;
    const isSeasonPack = isTv && form.type.includes('season');
    const fullDisc = isFullDisc(form);
    const dvdDisc = isDvdDisc(form);
    const needsRegion = dvdDisc;
    const region = form.region || '';
    return {
      title: title || '-',
      category: mapping.categoryKey || '-',
      type: mapping.typeKey || '-',
      resolution: form.resolution || '-',
      ids: [tmdb, imdb, tvdb].join(' | '),
      torrent: torrentLabel,
      isTv,
      season: form.season || '',
      episode: isSeasonPack ? '0' : (form.episode || ''),
      isSeasonPack,
      fullDisc,
      needsRegion,
      region,
      warnRegion: fullDisc && !needsRegion && !region
    };
  }

  function buildUploadSummaryHtml(summary, settings) {
    const anonymousChecked = settings.unit3dAnonymous ? 'checked' : '';
    const personalChecked = settings.unit3dPersonalRelease ? 'checked' : '';
    const modQueueChecked = settings.unit3dModQueue ? 'checked' : '';
    const tvInfo = summary.isTv
      ? `
        <div class="confirm-row">
          <span class="confirm-label">Stagione:</span>
          <span class="confirm-value">${escapeHtml(summary.season || '-')}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">Episodio:</span>
          <span class="confirm-value">${escapeHtml(summary.episode || '-')}${summary.isSeasonPack ? ' / INTERA STAGIONE' : ''}</span>
        </div>`
      : '';
    const regionRow = summary.needsRegion && !summary.region
      ? `
        <div class="confirm-row confirm-row-input">
          <label class="confirm-label" for="confirmRegionInput">Regione:</label>
          <input id="confirmRegionInput" class="confirm-input" type="text" placeholder="Es. 1 / 2 / A / B / C" />
        </div>
        <div class="confirm-row confirm-row-hint">
          <span class="confirm-hint">Regione obbligatoria per DVD/HDDVD.</span>
        </div>`
      : summary.fullDisc
        ? `
        <div class="confirm-row">
          <span class="confirm-label">Regione:</span>
          <span class="confirm-value ${summary.warnRegion ? 'warning' : ''}">${escapeHtml(summary.region || 'Non impostata')}</span>
        </div>`
        : '';
    return `
      <div class="confirm-summary">
        <div class="confirm-intro">Confermi l'upload con questi dati?</div>
        <div class="confirm-row">
          <span class="confirm-label">Titolo:</span>
          <span class="confirm-value highlight-title">${escapeHtml(summary.title)}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">Categoria:</span>
          <span class="confirm-value highlight-category">${escapeHtml(summary.category)}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">Tipo:</span>
          <span class="confirm-value highlight-type">${escapeHtml(summary.type)}</span>
        </div>
        ${tvInfo}
        <div class="confirm-row">
          <span class="confirm-label">Risoluzione:</span>
          <span class="confirm-value">${escapeHtml(summary.resolution)}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">ID:</span>
          <span class="confirm-value">${escapeHtml(summary.ids)}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">Torrent:</span>
          <span class="confirm-value">${escapeHtml(summary.torrent)}</span>
        </div>
        ${regionRow}
        <div class="confirm-flags">
          <div class="confirm-flags-title">Opzioni upload</div>
          <div class="confirm-flags-row">
            <label class="checkbox inline">
              <input id="confirmFlagAnonymous" type="checkbox" ${anonymousChecked} />
              Anonimo
            </label>
            <label class="checkbox inline">
              <input id="confirmFlagPersonal" type="checkbox" ${personalChecked} />
              Personal release
            </label>
            <label class="checkbox inline">
              <input id="confirmFlagModQueue" type="checkbox" ${modQueueChecked} />
              Coda moderazione
            </label>
          </div>
        </div>
      </div>
    `;
  }

  function readUploadConfirmFlags(settings) {
    const anonymous = document.getElementById('confirmFlagAnonymous');
    const personal = document.getElementById('confirmFlagPersonal');
    const modQueue = document.getElementById('confirmFlagModQueue');
    return {
      anonymous: anonymous ? anonymous.checked : settings.unit3dAnonymous,
      personal: personal ? personal.checked : settings.unit3dPersonalRelease,
      modQueue: modQueue ? modQueue.checked : settings.unit3dModQueue
    };
  }

  async function buildUnit3dPayload(form, settings, flagOverrides = {}) {
    const mapping = getUploadMapping(form, settings);
    const { title } = buildUploadTitle();
    const description = buildUploadDescription(form);
    const useBdInfo = shouldUseBdInfo(form);
    const bdinfoSummary = useBdInfo ? getBdInfoSummaryText() : '';
    const mediainfo = useBdInfo ? '' : await ensureUploadMiFullCache();
    const tmdb = normalizeNumericId(state.metadata?.tmdbId || state.metadata?.tmdb);
    const imdb = normalizeImdbValue(state.metadata?.imdbId || state.metadata?.imdb);
    const tvdbSource = mapping.isTv ? (state.metadata?.tvdbSeriesId || state.metadata?.tvdbId) : '';
    const tvdb = normalizeNumericId(tvdbSource);
    const mal = normalizeNumericId(state.metadata?.malId || state.metadata?.mal);
    const keywords = normalizeKeywords(state.metadata?.keywords || '');
    const isSeasonPack = mapping.isTv && form.type.includes('season');
    const seasonNumber = mapping.isTv ? normalizeIntValue(form.season) : null;
    let episodeNumber = mapping.isTv ? normalizeIntValue(form.episode) : null;
    if (isSeasonPack) {
      episodeNumber = 0;
    }
    const categoryId = normalizeIntValue(mapping.categoryId);
    const typeId = normalizeIntValue(mapping.typeId);
    const resolutionId = normalizeIntValue(mapping.resolutionId);

    const useAnonymous = flagOverrides.anonymous ?? settings.unit3dAnonymous;
    const usePersonal = flagOverrides.personal ?? settings.unit3dPersonalRelease;
    const useModQueue = flagOverrides.modQueue ?? settings.unit3dModQueue;

    const payload = {
      name: title || '',
      description,
      mediainfo,
      bdinfo: useBdInfo ? bdinfoSummary : '',
      tmdb,
      imdb,
      tvdb,
      mal: mal || '0',
      anonymous: useAnonymous ? '1' : '0',
      personal_release: usePersonal ? '1' : '0',
      mod_queue_opt_in: useModQueue ? '1' : '0',
      stream: '0',
      sd: mapping.isSd ? '1' : '0',
      keywords,
      internal: '0',
      featured: '0',
      free: '0',
      doubleup: '0',
      sticky: '0'
    };
    if (categoryId !== null) {
      payload.category_id = categoryId;
    }
    if (typeId !== null) {
      payload.type_id = typeId;
    }
    if (resolutionId !== null) {
      payload.resolution_id = resolutionId;
    }
    if (seasonNumber !== null) {
      payload.season_number = seasonNumber;
    }
    if (episodeNumber !== null) {
      payload.episode_number = episodeNumber;
    }
    return payload;
  }

  async function submitUnit3dUpload() {
    if (!state.lastTorrentPath) {
      showToast('Genera prima il .torrent.', 'warning');
      return;
    }
    const settings = loadSettings();
    const baseUrl = settings.unit3dBaseUrl || '';
    const apiKey = settings.unit3dApiKey || '';
    if (!baseUrl || !apiKey) {
      showToast('Imposta Base URL e API key UNIT3D nelle impostazioni.', 'warning');
      return;
    }
    if (!window.api?.unit3dUpload) {
      showToast('Upload UNIT3D non disponibile.', 'error');
      return;
    }
    let form = getFormState();
    const useBdInfo = shouldUseBdInfo(form);
    if (useBdInfo && state.bdInfoLoading) {
      showToast('BDInfo in corso: attendi la scansione.', 'warning');
      return;
    }
    if (useBdInfo && !getBdInfoSummaryText()) {
      showToast('Per i Full Disc serve il BDInfo: seleziona una playlist e avvia la scansione.', 'warning');
      return;
    }
    const summary = buildUploadSummaryData(form, settings);
    const summaryHtml = buildUploadSummaryHtml(summary, settings);
    const confirmed = await openConfirmModal(
      summaryHtml,
      {
        html: true,
        onOpen: () => {
          const regionInput = document.getElementById('confirmRegionInput');
          if (!regionInput || !ui.confirmOkBtn) {
            if (ui.confirmOkBtn) {
              ui.confirmOkBtn.disabled = false;
            }
            return;
          }
          const updateState = () => {
            const value = regionInput.value.trim();
            ui.confirmOkBtn.disabled = !value;
          };
          updateState();
          regionInput.addEventListener('input', updateState);
          regionInput.focus();
        }
      }
    );
    if (!confirmed) {
      return;
    }
    const regionInput = document.getElementById('confirmRegionInput');
    if (regionInput) {
      const value = regionInput.value.trim();
      if (!value) {
        showToast('Inserisci la regione per completare l\'upload.', 'warning');
        return;
      }
      if (ui.regionInput) {
        ui.regionInput.value = value;
      }
      form = { ...form, region: value };
    }
    const flagOverrides = readUploadConfirmFlags(settings);
    if (ui.uploadToUnit3dBtn) {
      ui.uploadToUnit3dBtn.disabled = true;
    }
    try {
      const data = await buildUnit3dPayload(form, settings, flagOverrides);
      logDebug?.('unit3d upload payload', {
        category_id: data.category_id,
        type_id: data.type_id,
        resolution_id: data.resolution_id,
        season_number: data.season_number,
        episode_number: data.episode_number,
        tmdb: data.tmdb,
        imdb: data.imdb,
        tvdb: data.tvdb,
        anonymous: data.anonymous,
        personal_release: data.personal_release,
        mod_queue_opt_in: data.mod_queue_opt_in,
        sd: data.sd
      });
      setHint(ui.uploadTitleHint, 'Upload in corso...');
      const result = await window.api.unit3dUpload({
        baseUrl,
        apiKey,
        torrentPath: state.lastTorrentPath,
        data
      });
      logDebug?.('unit3d upload response', {
        ok: result?.ok,
        error: result?.error || '',
        details: result?.details || '',
        status: result?.status || '',
        raw: result?.raw ? String(result.raw).slice(0, 2000) : ''
      });
      if (result?.ok) {
        showToast(result?.message || 'Upload completato.', 'success');
        setHint(ui.uploadTitleHint, 'Upload completato.');
        const snapshot = {
          title: ui.uploadTitleInput?.value || '',
          downloadUrl: extractDownloadUrl(result),
          torrentPath: '',
          createdAt: Date.now()
        };
        writeLastUpload(snapshot);
        updateReopenUploadButton();
        openPostUploadModal(result, settings);
      } else {
        const error = result?.error || result?.message || 'Errore upload.';
        const details = result?.details ? `\n${result.details}` : '';
        const followup = result?.details || result?.raw ? '' : '\nApri il log per dettagli.';
        showToast(error, 'error');
        setHint(ui.uploadTitleHint, `${error}${details}${followup}`);
      }
    } finally {
      if (ui.uploadToUnit3dBtn) {
        ui.uploadToUnit3dBtn.disabled = false;
      }
    }
  }

  function renderUploadIds(list) {
    if (!ui.uploadIdsList) {
      return;
    }
    ui.uploadIdsList.innerHTML = '';
    if (!list.length) {
      ui.uploadIdsList.textContent = 'Nessun ID rilevato.';
      return;
    }
    list.forEach((item) => {
      const badge = document.createElement(item.link ? 'button' : 'span');
      badge.className = `upload-id-badge${item.link ? ' clickable' : ''}`;
      if (item.link) {
        badge.type = 'button';
        badge.addEventListener('click', () => {
          copyToClipboard(item.value, `${item.label} copiato.`);
        });
      }
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = item.label;
      const value = document.createElement('span');
      value.textContent = item.value;
      badge.appendChild(label);
      badge.appendChild(value);
      ui.uploadIdsList.appendChild(badge);
    });
  }

  function renderUploadWarnings(list) {
    if (!ui.uploadWarnings) {
      return;
    }
    ui.uploadWarnings.innerHTML = '';
    if (!list.length) {
      const ok = document.createElement('div');
      ok.className = 'plan-item empty success';
      ok.textContent = 'Nessun warning.';
      ui.uploadWarnings.appendChild(ok);
      return;
    }
    list.forEach((warning) => {
      const item = document.createElement('div');
      item.className = 'warning-item';
      item.textContent = warning;
      ui.uploadWarnings.appendChild(item);
    });
  }

  function renderScreensList() {
    if (!ui.screensList) {
      return;
    }
    ui.screensList.innerHTML = '';
    if (!state.screenshots.length) {
      ui.screensList.textContent = 'Nessuno screenshot generato.';
      return;
    }
    state.screenshots.forEach((shot, index) => {
      const row = document.createElement('div');
      row.className = `screens-item ${shot.ok ? 'ok' : 'error'}`;
      const label = document.createElement('div');
      label.textContent = shot.ok ? `Screenshot ${index + 1}` : `Screenshot ${index + 1} (errore)`;
      const status = document.createElement('div');
      status.className = 'status';
      status.textContent = shot.ok ? shot.host.toUpperCase() : 'Errore';
      const url = document.createElement('div');
      url.className = 'screens-url';
      url.textContent = shot.ok ? (shot.displayUrl || '') : (shot.error || '');
      row.appendChild(label);
      row.appendChild(url);
      row.appendChild(status);
      if (shot.ok && shot.viewerUrl) {
        row.setAttribute('data-external', shot.viewerUrl);
        row.classList.add('fetch-link');
      }
      ui.screensList.appendChild(row);
    });
  }

  function buildScreensBbcode() {
    return buildScreensGridBbcode();
  }

  function setUploadKitCollapsed(sectionId, collapsed) {
    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }
    section.classList.toggle('collapsed', collapsed);
    section.setAttribute('aria-expanded', String(!collapsed));
  }

  function resetScreensProgress() {
    if (ui.screensProgressRow) {
      ui.screensProgressRow.classList.add('hidden');
    }
    if (ui.screensProgressFill) {
      ui.screensProgressFill.style.width = '0%';
    }
    if (ui.screensProgressText) {
      ui.screensProgressText.textContent = '0%';
    }
    if (ui.screensProgressStage) {
      ui.screensProgressStage.classList.add('hidden');
      ui.screensProgressStage.classList.remove('done');
    }
    if (ui.screensProgressStageText) {
      ui.screensProgressStageText.textContent = 'Preparazione...';
    }
  }

  function setScreensProgress(value) {
    if (!ui.screensProgressRow || !ui.screensProgressFill || !ui.screensProgressText) {
      return;
    }
    const progress = Math.max(0, Math.min(1, Number(value) || 0));
    ui.screensProgressRow.classList.remove('hidden');
    ui.screensProgressFill.style.width = `${Math.round(progress * 100)}%`;
    ui.screensProgressText.textContent = `${Math.round(progress * 100)}%`;
  }

  function setScreensStage(stage, payload = {}) {
    if (!ui.screensProgressStage || !ui.screensProgressStageText) {
      return;
    }
    ui.screensProgressStage.classList.remove('hidden');
    ui.screensProgressStage.classList.remove('done');
    let text = 'Preparazione...';
    if (stage === 'extract') {
      text = `Estrazione frame ${payload.current || 0}/${payload.total || 0}`;
    } else if (stage === 'upload') {
      text = `Upload ${payload.current || 0}/${payload.total || 0}`;
    } else if (stage === 'done') {
      text = 'Completato';
      ui.screensProgressStage.classList.add('done');
    } else if (stage === 'error') {
      text = payload.error ? `Errore: ${payload.error}` : 'Errore durante la generazione.';
    } else if (stage === 'start') {
      text = 'Preparazione...';
    }
    ui.screensProgressStageText.textContent = text;
  }

  async function prepareUploadKitStep() {
    if (!state.targetPath) {
      setHint(ui.renameHint, 'Seleziona un file o una cartella.');
      return;
    }
    const settings = loadSettings();
    const form = getFormState();
    const useBdInfo = shouldUseBdInfo(form);
    const bdinfoSummary = useBdInfo ? getBdInfoSummaryText() : '';
    if (state.targetPath !== uploadTitleSourcePath) {
      uploadTitleOverride = '';
      uploadTitleSourcePath = state.targetPath;
      lastUploadDownloadUrl = '';
      lastTrackerTorrentPath = '';
    }
    const { title, fallback, baseTitle, overridden } = buildUploadTitle();
    uploadTitleBase = baseTitle || '';
    uploadTitleFallback = fallback;
    if (ui.uploadTitleInput) {
      ui.uploadTitleInput.value = title || '-';
      ui.uploadTitleInput.readOnly = true;
      ui.uploadTitleInput.dataset.editing = 'false';
      ui.uploadTitleInput.classList.remove('editing');
    }
    if (ui.editUploadTitleBtn) {
      ui.editUploadTitleBtn.classList.remove('editing');
      ui.editUploadTitleBtn.setAttribute('aria-label', 'Modifica titolo upload');
      ui.editUploadTitleBtn.title = 'Modifica titolo';
    }
    updateUploadTitleHint(fallback, overridden);

    const ids = buildUploadIds();
    renderUploadIds(ids);
    uploadIdsText = ids.length
      ? ids.map((item) => `${item.label}: ${item.value}`).join('\n')
      : '';

    if (ui.uploadMiSection) {
      const titleNode = ui.uploadMiSection.querySelector('.section-header h3');
      if (titleNode) {
        titleNode.textContent = useBdInfo ? 'BDInfo' : 'MediaInfo';
      }
    }
    if (ui.uploadMiShortBtn) {
      ui.uploadMiShortBtn.classList.toggle('hidden', useBdInfo);
    }
    if (ui.uploadMiFullBtn) {
      ui.uploadMiFullBtn.classList.toggle('hidden', useBdInfo);
    }
    uploadMiMode = 'full';
    uploadMiCopyLabel = useBdInfo ? 'BDInfo copiato.' : 'MediaInfo copiato.';
    if (useBdInfo) {
      uploadMiShortCache = bdinfoSummary || 'BDInfo non disponibile.';
      uploadMiFullCache = uploadMiShortCache;
      if (ui.uploadMiText) {
        ui.uploadMiText.textContent = uploadMiFullCache || '-';
      }
    } else {
      uploadMiShortCache = buildMediaInfoShort();
      uploadMiFullCache = 'Caricamento...';
      if (ui.uploadMiFullBtn) {
        ui.uploadMiFullBtn.classList.add('active');
      }
      if (ui.uploadMiShortBtn) {
        ui.uploadMiShortBtn.classList.remove('active');
      }
      if (ui.uploadMiText) {
        ui.uploadMiText.textContent = uploadMiFullCache || '-';
      }
      if (state.mainVideo) {
        const result = await window.api.getMediaInfoText(state.mainVideo);
        uploadMiFullCache = result?.text || result?.error || 'Nessun output disponibile.';
        if (uploadMiMode === 'full' && ui.uploadMiText) {
          ui.uploadMiText.textContent = uploadMiFullCache;
        }
      }
    }

    const descText = buildUploadDescription(form);
    ui.uploadDescText.value = descText || '-';
    refreshUploadDescription();

    renderUploadWarnings(buildUploadWarnings(form, settings));
    updateFfmpegHint(settings);
    ui.screensHint.textContent = settings.ffmpegPath
      ? ''
      : 'FFmpeg non configurato.';
    resetScreensProgress();
    renderScreensList();

    setUploadKitCollapsed('uploadMiSection', true);
    setUploadKitCollapsed('uploadDescSection', true);
    return true;
  }

  function closeUploadKitModal() {
    return;
  }

  async function openUploadKitModal() {
    const ready = await prepareUploadKitStep();
    if (!ready) {
      return;
    }
    if (typeof openWizardStep === 'function') {
      openWizardStep(2);
    }
  }

  async function generateScreenshots() {
    const settings = loadSettings();
    const form = getFormState();
    let videoPath = state.mainVideo || state.videoFiles[0];
    if (!videoPath) {
      ui.screensHint.textContent = 'Nessun file video disponibile.';
      return;
    }
    if (!settings.ffmpegPath) {
      ui.screensHint.textContent = 'FFmpeg non configurato.';
      return;
    }

    if (ui.generateScreensBtn) {
      ui.generateScreensBtn.disabled = true;
    }
    screensProgressRequestId = String(Date.now());
    resetScreensProgress();
    setScreensProgress(0);
    setScreensStage('start');
    ui.screensHint.textContent = 'Generazione screenshot in corso...';
    let skipFrame = '';
    let seekMode = 'fast';
    if (isFullDisc(form) && state.bdInfoRaw) {
      const files = parseBdInfoFiles(state.bdInfoRaw, state.bdInfoSelectedPlaylist);
      if (files.length) {
        const hasDuration = files.some((item) => item.seconds > 0);
        const longest = files
          .slice()
          .sort((a, b) => {
            if (hasDuration) {
              return (b.seconds || 0) - (a.seconds || 0);
            }
            return (b.size || 0) - (a.size || 0);
          })[0];
        const streamDir = state.mainVideo ? getParentPath(state.mainVideo) : '';
        const discRoot = state.bdInfoTarget || getParentPath(streamDir);
        const candidate = streamDir
          ? `${streamDir}\\${longest.file}`
          : buildStreamPath(discRoot, longest.file);
        if (candidate) {
          videoPath = candidate;
          logDebug('screens: source', {
            mode: 'bdinfo',
            file: longest.file,
            length: longest.length || '',
            seconds: longest.seconds || 0,
            size: longest.size || 0,
            playlist: state.bdInfoSelectedPlaylist || '',
            path: candidate
          });
        }
      }
      skipFrame = detectBdInfoSkipFrame(state.bdInfoRaw);
    }

    const payload = {
      videoPath,
      ffmpegPath: settings.ffmpegPath,
      count: settings.screenshotsCount || 6,
      primaryHost: settings.imageHostPrimary || 'imgbb',
      fallbackHost: settings.imageHostFallback || 'ptscreens',
      imgbbKey: settings.imgbbKey || '',
      ptscreensKey: settings.ptscreensKey || '',
      requestId: screensProgressRequestId,
      isDisc: isFullDisc(form),
      category: form.type || 'Movie',
      seekMode,
      skipFrame,
      screensOutputDir: buildTrackerOutputDir(settings, getJobFileTitle()),
      screensJobTitle: getJobFileTitle()
    };
    const result = await window.api.generateScreenshots(payload);
    if (result?.ok) {
      state.screenshots = result.images || [];
      state.screenshotsMeta = { tonemapped: Boolean(result.tonemapped) };
      const okImages = state.screenshots.filter((s) => s.ok);
      logDebug?.('screens: result', {
        total: state.screenshots.length,
        ok: okImages.length,
        tonemapped: result.tonemapped || false,
        images: state.screenshots.map((s, i) => ({
          n: i + 1,
          ok: s.ok,
          host: s.host || '',
          url: s.displayUrl || s.rawUrl || '',
          error: s.error || ''
        }))
      });
      ui.screensHint.textContent = `Screenshot caricati: ${okImages.length}/${state.screenshots.length}`;
      refreshUploadDescription();
      setScreensProgress(1);
      setScreensStage('done');
      // auto-save log nella cartella job
      const settingsForLog = loadSettings();
      const jobDirLog = buildTrackerOutputDir(settingsForLog, getJobFileTitle());
      if (jobDirLog && debugState.buffer.length) {
        const safeTitleLog = getJobFileTitle();
        const sepLog = jobDirLog.includes('\\') ? '\\' : '/';
        try { await window.api?.saveFileDirect({ filePath: `${jobDirLog}${sepLog}${safeTitleLog}.debug-log.txt`, content: debugState.buffer.join('\n') }); } catch {}
      }
    } else {
      logDebug?.('screens: error', { error: result?.error || 'unknown' });
      ui.screensHint.textContent = result?.error || 'Errore durante la generazione.';
      setScreensStage('error', { error: result?.error });
    }
    renderScreensList();
    if (ui.generateScreensBtn) {
      ui.generateScreensBtn.disabled = false;
    }
  }

  function refreshUploadDescription() {
    if (!ui.uploadDescText) {
      return;
    }
    if (ui.uploadDescText.dataset.editing === 'true') {
      return;
    }
    const content = buildUploadDescription(getFormState());
    ui.uploadDescText.value = content;
    const settings = loadSettings();
    const jobDir = buildTrackerOutputDir(settings, getJobFileTitle());
    if (jobDir && content && content !== '-') {
      const fileTitle = getJobFileTitle();
      const sep = jobDir.includes('\\') ? '\\' : '/';
      try { window.api?.saveFileDirect({ filePath: `${jobDir}${sep}${fileTitle}.txt`, content }); } catch {}
    }
  }

  function initUploadKitEvents() {
    if (ui.openUploadKitBtn) {
      ui.openUploadKitBtn.addEventListener('click', () => {
        openUploadKitModal();
      });
    }
    if (ui.closeUploadKitBtn) {
      ui.closeUploadKitBtn.addEventListener('click', closeUploadKitModal);
    }
    if (ui.uploadToUnit3dBtn) {
      ui.uploadToUnit3dBtn.addEventListener('click', submitUnit3dUpload);
    }

    if (ui.copyUploadTitleBtn) {
      ui.copyUploadTitleBtn.addEventListener('click', () => {
        copyToClipboard(ui.uploadTitleInput?.value || '', 'Titolo copiato.');
      });
    }

    if (ui.editUploadTitleBtn && ui.uploadTitleInput) {
      ui.editUploadTitleBtn.addEventListener('click', () => {
        const isEditing = ui.uploadTitleInput.dataset.editing === 'true';
        if (!isEditing) {
          ui.uploadTitleInput.readOnly = false;
          ui.uploadTitleInput.dataset.editing = 'true';
          ui.uploadTitleInput.classList.add('editing');
          ui.editUploadTitleBtn.classList.add('editing');
          ui.editUploadTitleBtn.setAttribute('aria-label', 'Blocca titolo upload');
          ui.editUploadTitleBtn.title = 'Blocca titolo';
          ui.uploadTitleInput.focus();
          ui.uploadTitleInput.select();
          return;
        }
        ui.uploadTitleInput.readOnly = true;
        ui.uploadTitleInput.dataset.editing = 'false';
        ui.uploadTitleInput.classList.remove('editing');
        ui.editUploadTitleBtn.classList.remove('editing');
        ui.editUploadTitleBtn.setAttribute('aria-label', 'Modifica titolo upload');
        ui.editUploadTitleBtn.title = 'Modifica titolo';
        syncUploadTitleOverride(ui.uploadTitleInput.value);
      });
    }

    if (ui.uploadTitleInput) {
      ui.uploadTitleInput.addEventListener('input', () => {
        if (ui.uploadTitleInput.readOnly) {
          return;
        }
        syncUploadTitleOverride(ui.uploadTitleInput.value);
      });
    }

    if (ui.copyUploadIdsBtn) {
      ui.copyUploadIdsBtn.addEventListener('click', () => {
        if (!uploadIdsText) {
          showToast?.('Nessun ID disponibile.', 'warning');
          return;
        }
        copyToClipboard(uploadIdsText, 'ID copiati.');
      });
    }

    if (ui.uploadMiShortBtn) {
      ui.uploadMiShortBtn.addEventListener('click', () => {
        uploadMiMode = 'short';
        ui.uploadMiShortBtn.classList.add('active');
        ui.uploadMiFullBtn.classList.remove('active');
        ui.uploadMiText.textContent = uploadMiShortCache || '-';
      });
    }
    if (ui.uploadMiFullBtn) {
      ui.uploadMiFullBtn.addEventListener('click', () => {
        uploadMiMode = 'full';
        ui.uploadMiFullBtn.classList.add('active');
        ui.uploadMiShortBtn.classList.remove('active');
        ui.uploadMiText.textContent = uploadMiFullCache || '-';
      });
    }
    if (ui.copyUploadMiBtn) {
      ui.copyUploadMiBtn.addEventListener('click', () => {
        const text = uploadMiMode === 'full' ? uploadMiFullCache : uploadMiShortCache;
        copyToClipboard(text, uploadMiCopyLabel);
      });
    }

    if (ui.copyUploadDescBtn) {
      ui.copyUploadDescBtn.addEventListener('click', () => {
        copyToClipboard(ui.uploadDescText.value, 'Descrizione copiata.');
      });
    }
    if (ui.editUploadDescBtn && ui.uploadDescText) {
      ui.editUploadDescBtn.addEventListener('click', () => {
        const isEditing = ui.uploadDescText.dataset.editing === 'true';
        if (!isEditing) {
          ui.uploadDescText.removeAttribute('readonly');
          ui.uploadDescText.dataset.editing = 'true';
          ui.editUploadDescBtn.classList.add('editing');
          ui.editUploadDescBtn.setAttribute('aria-label', 'Blocca BBCode');
          ui.editUploadDescBtn.title = 'Blocca BBCode';
          ui.uploadDescText.focus();
        } else {
          ui.uploadDescText.setAttribute('readonly', '');
          ui.uploadDescText.dataset.editing = 'false';
          ui.editUploadDescBtn.classList.remove('editing');
          ui.editUploadDescBtn.setAttribute('aria-label', 'Modifica BBCode');
          ui.editUploadDescBtn.title = 'Modifica BBCode';
        }
      });
    }
    if (ui.uploadReleaseNotesInput) {
      ui.uploadReleaseNotesInput.addEventListener('input', () => {
        refreshUploadDescription();
      });
    }
    if (ui.previewUploadDescBtn) {
      ui.previewUploadDescBtn.addEventListener('click', () => {
        if (!ui.bbcodePreviewModal || !ui.bbcodePreviewContent) {
          return;
        }
        ui.bbcodePreviewContent.innerHTML = renderBbcodePreview(ui.uploadDescText.value);
        ui.bbcodePreviewModal.classList.remove('hidden');
      });
    }
    if (ui.bbcodePreviewModal) {
      ui.bbcodePreviewModal.addEventListener('click', (event) => {
        if (event.target?.classList.contains('modal-backdrop')) {
          ui.bbcodePreviewModal.classList.add('hidden');
        }
      });
    }
    if (ui.bbcodePreviewContent) {
      ui.bbcodePreviewContent.addEventListener('click', (event) => {
        const target = event.target;
        if (target?.dataset?.external) {
          window.api.openExternal(target.dataset.external);
        }
      });
    }

    if (ui.downloadTrackerTorrentBtn) {
      ui.downloadTrackerTorrentBtn.addEventListener('click', downloadTrackerTorrent);
    }
    if (ui.openTrackerOutputBtn) {
      ui.openTrackerOutputBtn.addEventListener('click', openTrackerOutputFolder);
    }
    if (ui.sendToClientBtn) {
      ui.sendToClientBtn.addEventListener('click', sendToTorrentClient);
    }
    if (ui.closePostUploadBtn) {
      ui.closePostUploadBtn.addEventListener('click', () => {
        ui.postUploadModal?.classList.add('hidden');
      });
    }
    if (ui.postUploadModal) {
      ui.postUploadModal.addEventListener('click', (event) => {
        if (event.target?.classList.contains('modal-backdrop')) {
          ui.postUploadModal.classList.add('hidden');
        }
      });
    }
    if (ui.reopenLastUploadBtn) {
      ui.reopenLastUploadBtn.addEventListener('click', () => {
        openLastUploadModal();
      });
    }

    if (ui.generateScreensBtn) {
      ui.generateScreensBtn.addEventListener('click', generateScreenshots);
    }
    if (ui.copyScreensBbcodeBtn) {
      ui.copyScreensBbcodeBtn.addEventListener('click', () => {
        if (!state.screenshots.length) {
          showToast?.('Nessuno screenshot disponibile.', 'warning');
          return;
        }
        const bbcode = buildScreensBbcode();
        if (!bbcode) {
          return;
        }
        copyToClipboard(bbcode, 'BBCode screenshots copiato.');
      });
    }

    if (window.api?.onScreensProgress && !screensProgressUnsub) {
      screensProgressUnsub = window.api.onScreensProgress((data) => {
        if (!data) {
          return;
        }
        if (screensProgressRequestId && data.requestId && data.requestId !== screensProgressRequestId) {
          return;
        }
        if (data.stage === 'debug' && data.message) {
          logDebug?.(data.message);
        }
        if (typeof data.progress === 'number') {
          setScreensProgress(data.progress);
        }
        if (data.stage) {
          setScreensStage(data.stage, data);
        }
      });
    }

    document.querySelectorAll('.upload-section.collapsible').forEach((section) => {
      const sectionId = section.getAttribute('id');
      if (!sectionId) {
        return;
      }
      setUploadKitCollapsed(sectionId, section.classList.contains('collapsed'));
      section.addEventListener('click', (event) => {
        if (event.target?.closest('.section-actions') || event.target?.closest('button')) {
          return;
        }
        const isCollapsed = section.classList.contains('collapsed');
        setUploadKitCollapsed(sectionId, !isCollapsed);
      });
    });

    if (ui.closeBbcodePreviewBtn) {
      ui.closeBbcodePreviewBtn.addEventListener('click', () => {
        ui.bbcodePreviewModal?.classList.add('hidden');
      });
    }

    updateReopenUploadButton();
  }

  async function saveMediaInfoToJobDir() {
    if (!state.mainVideo) return;
    const settings = loadSettings();
    const jobDir = buildTrackerOutputDir(settings, getJobFileTitle());
    if (!jobDir) return;
    const mi = await ensureUploadMiFullCache();
    if (!mi || mi === 'Caricamento...' || mi === 'Nessun output disponibile.') return;
    const fileTitle = getJobFileTitle();
    const sep = jobDir.includes('\\') ? '\\' : '/';
    try { await window.api?.saveFileDirect({ filePath: `${jobDir}${sep}${fileTitle}.mediainfo.txt`, content: mi }); } catch {}
  }

  return {
    buildScreensBbcode,
    buildUploadDescription,
    buildUploadWarnings,
    closeUploadKitModal,
    generateScreenshots,
    initUploadKitEvents,
    openUploadKitModal,
    prepareUploadKitStep,
    refreshUploadDescription,
    renderScreensList,
    saveMediaInfoToJobDir
  };
}
