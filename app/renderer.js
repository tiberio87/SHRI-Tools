import { ui } from './renderer/dom.js';
import { state, debugState } from './renderer/state.js';
import {
  SETTINGS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  DEFAULT_GROUP_TAGS,
  LANG_MAP,
  RULES_SECTIONS,
  ANNOUNCE_BASE
} from './renderer/constants.js';
import { normalizeLangTag } from './renderer/media-utils.js';
import { createUploadKit } from './renderer/upload-kit.js';
import { createMetadataTools } from './renderer/metadata.js';
import { createRenameTools } from './renderer/rename.js';
import { getParentPath, getPathBaseName } from './renderer/path-utils.js';
import { createLogger } from './renderer/logger.js';
import { createThemeTools } from './renderer/theme.js';
import { createFeedbackTools } from './renderer/feedback.js';

let previewTimer = null;
let currentTorrentRequestId = null;
let settingsSnapshot = '';
let settingsDirty = false;

const DEFAULT_SERVICES = [];
let serviceDefaultsLoaded = false;
const LANGUAGE_CODES = Array.from(new Set([...Object.values(LANG_MAP), 'MULTI']))
  .filter(Boolean)
  .map((value) => String(value).toUpperCase());
const LANGUAGE_CODES_PATTERN = LANGUAGE_CODES.join('|');
const { logDebug, updateDebugLogView } = createLogger({ debugState, ui });
const { applyTheme, loadTheme, saveTheme } = createThemeTools({
  ui,
  storageKey: THEME_STORAGE_KEY
});
const { showToast, copyToClipboard, openConfirmModal, bindConfirmHandlers } =
  createFeedbackTools({ ui });

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

function extractPasskeyFromAnnounce(url) {
  if (!url) {
    return '';
  }
  const base = ANNOUNCE_BASE.toLowerCase();
  const normalized = String(url).trim();
  if (normalized.toLowerCase().startsWith(base)) {
    return normalized.slice(base.length);
  }
  return '';
}

function resolveAnnounceInput(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) {
    return { announceUrl: '', passkey: '' };
  }
  if (/^https?:\/\//i.test(cleaned)) {
    const passkey = extractPasskeyFromAnnounce(cleaned);
    return { announceUrl: cleaned, passkey };
  }
  return { announceUrl: `${ANNOUNCE_BASE}${cleaned}`, passkey: cleaned };
}

function getAnnounceUrlFromSettings(settings) {
  if (settings?.torrentPasskey) {
    return `${ANNOUNCE_BASE}${settings.torrentPasskey}`;
  }
  if (settings?.torrentAnnounceUrl) {
    return settings.torrentAnnounceUrl;
  }
  return '';
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
  state.metadata = null;
  state.tagSuggestion = '';
  state.autoDetectRunning = false;
  state.lastTorrentPath = '';
  state.screenshots = [];
  state.screenshotsMeta = null;
  state.screenshotsMeta = null;

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

  const visibleWarnings = getAutoMatchWarnings(payload, data);
  if (visibleWarnings.length) {
    ui.fetchStatus.appendChild(document.createTextNode(` | ${visibleWarnings.join(' | ')}`));
  }
}

function getAutoMatchWarnings(payload, data) {
  const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
  if (!warnings.length) {
    return [];
  }
  const hasTitle = Boolean(data?.title);
  const hasIds = Boolean(data?.tmdbId || data?.imdbId || data?.tvdbSeriesId);
  const typeHint = payload?.typeHint || '';
  const isTv = typeHint.startsWith('tv') || typeHint.startsWith('anime');
  const hasEpisodes = Array.isArray(data?.episodes) && data.episodes.length > 0;

  if (!hasTitle && !hasIds) {
    return warnings;
  }
  if (isTv && !hasEpisodes) {
    return warnings;
  }
  return [];
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
      autoTagDetect: true,
      torrentPasskey: '',
      torrentAnnounceUrl: '',
      torrentOutputDir: '',
      torrentPrivate: true,
      ffmpegPath: '',
      screenshotsCount: 6,
      imageHostPrimary: 'imgbb',
      imageHostFallback: 'ptscreens',
      imgbbKey: '',
      ptscreensKey: '',
      unit3dBaseUrl: 'https://shareisland.org',
      unit3dApiKey: ''
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
      autoTagDetect: true,
      torrentPasskey: '',
      torrentAnnounceUrl: '',
      torrentOutputDir: '',
      torrentPrivate: true,
      ffmpegPath: '',
      screenshotsCount: 6,
      imageHostPrimary: 'imgbb',
      imageHostFallback: 'ptscreens',
      imgbbKey: '',
      ptscreensKey: '',
      unit3dBaseUrl: 'https://shareisland.org',
      unit3dApiKey: ''
    };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function updateFfmpegHint(settings) {
  if (!ui.ffmpegHint) {
    return;
  }
  const hasPath = Boolean(settings?.ffmpegPath);
  if (hasPath) {
    ui.ffmpegHint.textContent = '';
    return;
  }
  ui.ffmpegHint.innerHTML = `FFmpeg non configurato. Scaricalo da <a href="https://ffmpeg.org/download.html" data-external="https://ffmpeg.org/download.html">ffmpeg.org</a> e inserisci il percorso completo del file eseguibile (es. ffmpeg.exe).`;
}

function applySettingsToUI(settings) {
  const preferredLanguage = Object.prototype.hasOwnProperty.call(settings, 'preferredLanguage')
    ? settings.preferredLanguage
    : 'it-IT';
  ui.omdbKeyInput.value = settings.omdbKey || '';
  ui.tmdbKeyInput.value = settings.tmdbKey || '';
  ui.tvdbKeyInput.value = settings.tvdbKey || '';
  if (ui.imgbbKeyInput) {
    ui.imgbbKeyInput.value = settings.imgbbKey || '';
  }
  if (ui.ptscreensKeyInput) {
    ui.ptscreensKeyInput.value = settings.ptscreensKey || '';
  }
  ui.preferredLanguageSelect.value = preferredLanguage;
  ui.serviceListInput.value = settings.serviceList || '';
  ui.tagListInput.value = settings.tagList || '';
  if (ui.ffmpegPathInput) {
    ui.ffmpegPathInput.value = settings.ffmpegPath || '';
  }
  if (ui.screenshotsCountInput) {
    ui.screenshotsCountInput.value = settings.screenshotsCount || 6;
  }
  if (ui.imageHostPrimarySelect) {
    ui.imageHostPrimarySelect.value = settings.imageHostPrimary || 'imgbb';
  }
  if (ui.imageHostFallbackSelect) {
    ui.imageHostFallbackSelect.value = settings.imageHostFallback || 'ptscreens';
  }
  if (ui.unit3dBaseUrlInput) {
    ui.unit3dBaseUrlInput.value = settings.unit3dBaseUrl || 'https://shareisland.org';
  }
  if (ui.unit3dApiKeyInput) {
    ui.unit3dApiKeyInput.value = settings.unit3dApiKey || '';
  }
  if (ui.settingsAnnounceInput) {
    const passkey = settings.torrentPasskey || '';
    const fallback = extractPasskeyFromAnnounce(settings.torrentAnnounceUrl || '');
    ui.settingsAnnounceInput.value = passkey || fallback || '';
  }
  if (ui.settingsTorrentOutputInput) {
    ui.settingsTorrentOutputInput.value = settings.torrentOutputDir || '';
  }
  if (ui.settingsTorrentPrivateToggle) {
    ui.settingsTorrentPrivateToggle.checked = settings.torrentPrivate !== false;
  }
  if (ui.autoTagDetectToggle) {
    ui.autoTagDetectToggle.checked = settings.autoTagDetect !== false;
  }
  updateFfmpegHint(settings);
  updateTagSuggestion(settings);
  loadServiceDefaults().then(() => updateServiceOptions(settings));
  updateTagOptions(settings);
  schedulePreview();
}

function getSettings() {
  const existing = loadSettings();
  const announceInput = ui.settingsAnnounceInput?.value.trim() || '';
  const announceResolved = resolveAnnounceInput(announceInput);
  const passkey = announceResolved.passkey || '';
  const announceUrl = passkey ? '' : existing.torrentAnnounceUrl || '';

  return {
    omdbKey: ui.omdbKeyInput.value.trim(),
    tmdbKey: ui.tmdbKeyInput.value.trim(),
    tvdbKey: ui.tvdbKeyInput.value.trim(),
    imgbbKey: ui.imgbbKeyInput?.value.trim() || '',
    ptscreensKey: ui.ptscreensKeyInput?.value.trim() || '',
    preferredLanguage: ui.preferredLanguageSelect.value,
    serviceList: ui.serviceListInput.value.trim(),
    tagList: ui.tagListInput.value.trim(),
    autoTagDetect: Boolean(ui.autoTagDetectToggle?.checked),
    ffmpegPath: ui.ffmpegPathInput?.value.trim() || '',
    screenshotsCount: parseInt(ui.screenshotsCountInput?.value || '6', 10) || 6,
    imageHostPrimary: ui.imageHostPrimarySelect?.value || 'imgbb',
    imageHostFallback: ui.imageHostFallbackSelect?.value || 'ptscreens',
    unit3dBaseUrl: ui.unit3dBaseUrlInput?.value.trim() || 'https://shareisland.org',
    unit3dApiKey: ui.unit3dApiKeyInput?.value.trim() || '',
    torrentPasskey: passkey,
    torrentAnnounceUrl: announceUrl,
    torrentOutputDir: ui.settingsTorrentOutputInput?.value.trim() || '',
    torrentPrivate: Boolean(ui.settingsTorrentPrivateToggle?.checked)
  };
}

function refreshSettingsSnapshot() {
  settingsSnapshot = JSON.stringify(getSettings());
  settingsDirty = false;
}

function updateSettingsDirtyFlag() {
  settingsDirty = JSON.stringify(getSettings()) !== settingsSnapshot;
}

function isSettingsOpen() {
  return ui.settingsModal && !ui.settingsModal.classList.contains('hidden');
}

function openSettings() {
  refreshSettingsSnapshot();
  ui.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  ui.settingsModal.classList.add('hidden');
}

async function requestCloseSettings() {
  if (!settingsDirty) {
    closeSettings();
    return;
  }
  const proceed = await openConfirmModal('Hai modifiche non salvate. Vuoi chiudere senza salvare?');
  if (!proceed) {
    return;
  }
  applySettingsToUI(loadSettings());
  refreshSettingsSnapshot();
  closeSettings();
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
  const baseId = button.dataset.base;
  const input = document.getElementById(inputId);
  const apiKey = input ? input.value.trim() : '';
  const baseInput = baseId ? document.getElementById(baseId) : null;
  const baseUrl = baseInput ? baseInput.value.trim() : '';

  if (!apiKey) {
    setKeyVerifyState(button, 'error', 'Inserisci una chiave.');
    return;
  }

  setKeyVerifyState(button, 'loading', 'Verifica in corso...');
  button.disabled = true;
  const result = await window.api.verifyApiKey({ service, apiKey, baseUrl });
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

function renderTorrentWarnings(list) {
  if (!ui.torrentWarnings) {
    return;
  }
  ui.torrentWarnings.innerHTML = '';
  const warnings = Array.isArray(list) ? list : [];
  if (!warnings.length) {
    return;
  }
  for (const warning of warnings) {
    const item = document.createElement('div');
    item.className = 'warning-item';
    item.textContent = warning;
    ui.torrentWarnings.appendChild(item);
  }
}

function openTorrentModal() {
  if (!state.targetPath) {
    setHint(ui.renameHint, 'Seleziona un file o una cartella.');
    return;
  }

  const settings = loadSettings();
  if (ui.torrentAnnounceInput) {
    ui.torrentAnnounceInput.value = getAnnounceUrlFromSettings(settings);
  }
  if (ui.torrentOutputInput) {
    ui.torrentOutputInput.value = settings.torrentOutputDir || '';
  }
  if (ui.torrentPrivateToggle) {
    ui.torrentPrivateToggle.checked = settings.torrentPrivate !== false;
  }
  if (ui.torrentNameInput) {
    ui.torrentNameInput.value = renameTools.getTorrentNameSuggestion() || '';
  }
  if (ui.torrentRootName) {
    const rootName = state.kind === 'dir'
      ? getPathBaseName(state.targetPath)
      : getPathBaseName(state.mainVideo || state.targetPath);
    ui.torrentRootName.textContent = rootName || '-';
  }

  renderTorrentWarnings(renameTools.buildTorrentWarnings());
  setHint(ui.torrentHint, '');
  resetTorrentProgress();
  ui.torrentModal.classList.remove('hidden');
}

function closeTorrentModal() {
  if (!ui.torrentModal) {
    return;
  }
  resetTorrentProgress();
  ui.torrentModal.classList.add('hidden');
}

function setTorrentProgress(value) {
  if (!ui.torrentProgressRow || !ui.torrentProgressFill || !ui.torrentProgressText) {
    return;
  }
  const progress = Math.max(0, Math.min(1, Number(value) || 0));
  ui.torrentProgressRow.classList.remove('hidden');
  ui.torrentProgressFill.style.width = `${Math.round(progress * 100)}%`;
  ui.torrentProgressText.textContent = `${Math.round(progress * 100)}%`;
}

function setTorrentStage(stage) {
  if (!ui.torrentProgressStage || !ui.torrentProgressStageText) {
    return;
  }
  const map = {
    hashing: 'Hashing in corso...',
    encoding: 'Creazione buffer...',
    writing: 'Salvataggio file...',
    done: 'Completato'
  };
  const label = map[stage] || 'Generazione in corso...';
  ui.torrentProgressStageText.textContent = label;
  ui.torrentProgressStage.classList.toggle('done', stage === 'done');
  ui.torrentProgressStage.classList.remove('hidden');
}

function resetTorrentProgress() {
  if (!ui.torrentProgressRow || !ui.torrentProgressFill || !ui.torrentProgressText) {
    return;
  }
  ui.torrentProgressRow.classList.add('hidden');
  ui.torrentProgressFill.style.width = '0%';
  ui.torrentProgressText.textContent = '0%';
  if (ui.torrentProgressStage) {
    ui.torrentProgressStage.classList.remove('done');
    ui.torrentProgressStage.classList.add('hidden');
  }
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
  state.tagSuggestion = metadataTools.extractGroupTagFromName(path, buildKnownGroupTags(settings));
  if (state.tagSuggestion !== state.lastTagSuggestion) {
    logDebug('tag suggestion', {
      path,
      suggestion: state.tagSuggestion,
      settingsAuto: settings?.autoTagDetect !== false
    });
    state.lastTagSuggestion = state.tagSuggestion;
  }
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

const metadataTools = createMetadataTools({
  state,
  ui,
  logDebug,
  setDropdownAuto,
  setInputAuto,
  applyFormatSuggestion
});

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

const renameTools = createRenameTools({
  state,
  ui,
  getFormState,
  guessMetadataFromName: metadataTools.guessMetadataFromName,
  episodeKey: metadataTools.episodeKey,
  setHint,
  languageCodesPattern: LANGUAGE_CODES_PATTERN
});

async function updateRenamePlan() {
  if (!state.targetPath) {
    ui.renamePlanList.innerHTML = '';
    ui.warningList.innerHTML = '';
    updateRenameBadge(null);
    return;
  }

  const { folderName, baseName, fileRenames, warnings } = renameTools.buildRenameTargets();
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
    let finalData = data;
    const hasMatch = Boolean(
      data?.title || data?.tmdbId || data?.imdbId || data?.tvdbSeriesId
    );
    if (!hasMatch && payload.title) {
      const cleanedTitle = metadataTools.cleanSearchTitle(payload.title);
      if (cleanedTitle && cleanedTitle !== payload.title) {
        const retryPayload = { ...payload, title: cleanedTitle };
        logDebug('fetchMetadata retry (clean title)', retryPayload);
        const retryData = await window.api.fetchMetadata(retryPayload);
        logDebug('fetchMetadata retry result', retryData);
        const retryHasMatch = Boolean(
          retryData?.title || retryData?.tmdbId || retryData?.imdbId || retryData?.tvdbSeriesId
        );
        if (retryHasMatch) {
          finalData = retryData;
        }
      }
    }
    state.metadata = finalData;
    if (finalData.title) {
      setIfAuto(ui.titleInput, finalData.title);
    }
    if (finalData.year) {
      setIfAuto(ui.yearInput, finalData.year);
    }
    if (finalData.originalLanguage) {
      const normalizedOriginal = normalizeLangTag(finalData.originalLanguage);
      setInputAuto(ui.originalLanguageInput, normalizedOriginal);
      if (!ui.languageTagInput.dataset.manual || ui.languageTagInput.dataset.manual === 'false') {
        const recomputed = metadataTools.buildLanguageTag(state.audioLangs, normalizedOriginal);
        if (recomputed) {
          setInputAuto(ui.languageTagInput, recomputed);
        }
      }
    }
    if (Array.isArray(finalData.episodes)) {
      const map = {};
      finalData.episodes.forEach((ep) => {
        const key = metadataTools.episodeKey(ep.season, ep.episode);
        if (key && ep.name) {
          map[key] = ep.name;
        }
      });
      state.episodeMap = map;
    }

    if (state.kind !== 'dir') {
      const season = ui.seasonInput.value;
      const episode = ui.episodeInput.value;
      const key = metadataTools.episodeKey(season, episode);
      if (key && state.episodeMap[key]) {
        setIfAuto(ui.episodeTitleInput, state.episodeMap[key]);
      }
    }

    const usedManualId = Boolean(payload.imdbId || payload.tvdbId);
    const modeLabel = usedManualId ? 'Matching manuale' : 'Auto Matching';
    setFetchBadge(usedManualId ? 'manual' : 'auto', modeLabel);
    renderFetchStatus(payload, finalData);
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
    const folderGuess = metadataTools.guessMetadataFromName(folderName);
    const firstFileGuess = state.videoFiles.length ? metadataTools.guessMetadataFromName(state.videoFiles[0]) : {};

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
    const fileGuess = metadataTools.guessMetadataFromName(state.mainVideo);
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
  state.metadata = null;
  state.screenshots = [];
  state.lastTorrentPath = '';
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

  metadataTools.fillFromMediaInfo();
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

const uploadKit = createUploadKit({
  buildMediaInfoShort: metadataTools.buildMediaInfoShort,
  computeBaseName: renameTools.computeBaseName,
  copyToClipboard,
  getFormState,
  getMissingRenameRequirements: renameTools.getMissingRenameRequirements,
  getPathBaseName,
  loadSettings,
  setHint,
  showToast,
  updateFfmpegHint
});
uploadKit.initUploadKitEvents();

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

if (ui.openTorrentBtn) {
  ui.openTorrentBtn.addEventListener('click', () => {
    openTorrentModal();
  });
}

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
  const missing = renameTools.getMissingRenameRequirements(form);
  if (missing.length) {
    const message = `${missing.join('\n')}\n\nVuoi procedere comunque?`;
    const proceed = await openConfirmModal(message);
    if (!proceed) {
      return;
    }
  }

  const { folderName, fileRenames } = renameTools.buildRenameTargets();
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
    renameTools.applyRenameResults(result, payload);
  } else {
    const warning = result.warnings.length ? result.warnings.join(' | ') : 'Errore nella rinomina.';
    setHint(ui.renameHint, warning);
  }
  schedulePreview();
});

if (ui.generateTorrentBtn) {
  ui.generateTorrentBtn.addEventListener('click', async () => {
    if (!state.targetPath) {
      setHint(ui.torrentHint, 'Seleziona un file o una cartella.');
      return;
    }

    const announceInput = ui.torrentAnnounceInput?.value.trim() || '';
    const outputDir = ui.torrentOutputInput?.value.trim() || '';
    const outputName = ui.torrentNameInput?.value.trim() || '';
    const isPrivate = ui.torrentPrivateToggle?.checked !== false;
    const announceResolved = resolveAnnounceInput(announceInput);
    const announce = announceResolved.announceUrl;

    if (!announce) {
      setHint(ui.torrentHint, 'Inserisci l\'announce URL.');
      return;
    }
    if (!outputDir) {
      setHint(ui.torrentHint, 'Seleziona la cartella di output.');
      return;
    }
    if (!outputName) {
      setHint(ui.torrentHint, 'Inserisci un nome per il file .torrent.');
      return;
    }

    setHint(ui.torrentHint, 'Generazione in corso...');
    currentTorrentRequestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setTorrentProgress(0);
    setTorrentStage('hashing');
    const payload = {
      targetPath: state.targetPath,
      announce,
      outputDir,
      outputName,
      private: isPrivate,
      requestId: currentTorrentRequestId
    };
    const result = await window.api.createTorrent(payload);
    logDebug('createTorrent result', result);
    if (result?.ok) {
      state.lastTorrentPath = result.outputPath || '';
      const updated = {
        ...loadSettings(),
        torrentPasskey: announceResolved.passkey || '',
        torrentAnnounceUrl: announceResolved.passkey ? '' : announce,
        torrentOutputDir: outputDir,
        torrentPrivate: isPrivate
      };
      saveSettings(updated);
      applySettingsToUI(updated);
      if (isSettingsOpen()) {
        refreshSettingsSnapshot();
      }
      const toastMessage = result.warning
        ? `Torrent creato. ${result.warning}`
        : 'Torrent creato.';
      showToast(toastMessage);
      setHint(ui.torrentHint, `Creato: ${result.outputPath}`);
      setTorrentProgress(1);
      setTorrentStage('done');
    } else {
      setHint(ui.torrentHint, result?.error || 'Errore nella generazione.');
      resetTorrentProgress();
    }
  });
}

ui.openSettingsBtn.addEventListener('click', openSettings);
ui.closeSettingsBtn.addEventListener('click', requestCloseSettings);
ui.settingsModal.addEventListener('click', (event) => {
  if (event.target.classList.contains('modal-backdrop')) {
    requestCloseSettings();
  }
});
ui.settingsModal.addEventListener('input', (event) => {
  if (!event.target.closest('.settings-body')) {
    return;
  }
  updateSettingsDirtyFlag();
});
ui.settingsModal.addEventListener('change', (event) => {
  if (!event.target.closest('.settings-body')) {
    return;
  }
  updateSettingsDirtyFlag();
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

if (ui.closeTorrentBtn) {
  ui.closeTorrentBtn.addEventListener('click', closeTorrentModal);
}

if (ui.torrentModal) {
  ui.torrentModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      closeTorrentModal();
    }
  });
}

if (ui.browseTorrentOutputBtn) {
  ui.browseTorrentOutputBtn.addEventListener('click', async () => {
    const dir = await window.api.selectFolder();
    if (dir && ui.torrentOutputInput) {
      ui.torrentOutputInput.value = dir;
    }
  });
}

if (ui.browseTorrentOutputSettingsBtn) {
  ui.browseTorrentOutputSettingsBtn.addEventListener('click', async () => {
    const dir = await window.api.selectFolder();
    if (dir && ui.settingsTorrentOutputInput) {
      ui.settingsTorrentOutputInput.value = dir;
    }
  });
}

if (ui.browseFfmpegBtn) {
  ui.browseFfmpegBtn.addEventListener('click', async () => {
    const filePath = await window.api.selectAnyFile?.();
    if (filePath && ui.ffmpegPathInput) {
      ui.ffmpegPathInput.value = filePath;
      updateFfmpegHint({ ffmpegPath: filePath });
    }
  });
}

bindConfirmHandlers();

if (window.api?.onTorrentProgress) {
  window.api.onTorrentProgress((data) => {
    if (!data) {
      return;
    }
    if (currentTorrentRequestId && data.requestId !== currentTorrentRequestId) {
      return;
    }
    if (typeof data.progress === 'number') {
      setTorrentProgress(data.progress);
    }
    if (data.stage) {
      setTorrentStage(data.stage);
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
  const external = event.target.closest('[data-external]');
  if (external) {
    event.preventDefault();
    const url = external.getAttribute('data-external') || external.getAttribute('href') || '';
    if (url) {
      window.api.openExternal(url);
    }
    return;
  }
  if (!event.target.closest('.dropdown')) {
    closeAllDropdowns();
  }
});

ui.saveSettingsBtn.addEventListener('click', () => {
  const settings = getSettings();
  saveSettings(settings);
  applySettingsToUI(settings);
  setHint(ui.settingsHint, 'Impostazioni salvate.');
  refreshSettingsSnapshot();
});

ui.languageTagInput.addEventListener('input', () => {
  ui.languageTagInput.dataset.manual = 'true';
});

ui.originalLanguageInput.addEventListener('input', () => {
  if (!ui.languageTagInput.dataset.manual || ui.languageTagInput.dataset.manual === 'false') {
    ui.languageTagInput.value = metadataTools.buildLanguageTag(state.audioLangs, ui.originalLanguageInput.value);
  }
  schedulePreview();
});

if (ui.ffmpegPathInput) {
  ui.ffmpegPathInput.addEventListener('input', () => {
    updateFfmpegHint({ ffmpegPath: ui.ffmpegPathInput.value.trim() });
  });
}

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
      metadataTools.fillFromMediaInfo();
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
