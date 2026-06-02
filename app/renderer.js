// ===== Imports =====
import { ui } from './renderer/dom.js';
import { state, debugState } from './renderer/state.js';
import {
  THEME_STORAGE_KEY,
  DEFAULT_GROUP_TAGS,
  LANG_MAP,
  RULES_SECTIONS
} from './renderer/constants.js';
import {
  normalizeLangTag,
  getAudioTracks,
  getTrackLang
} from './renderer/media-utils.js';
import {
  detectFormatFromName,
  detectSourceFromName,
  detectRepackFromName,
  detectFormatFromMediaInfo,
  extractTokensPresent,
  isDiscStructure
} from './renderer/parsing-tools.js';
import { createUploadKit } from './renderer/upload-kit.js';
import { createMetadataTools, hasCjkChars } from './renderer/metadata.js';
import { createRenameTools } from './renderer/rename.js';
import { getParentPath, getPathBaseName, stripExtension } from './renderer/path-utils.js';
import { createLogger } from './renderer/logger.js';
import { createThemeTools } from './renderer/theme.js';
import { createFeedbackTools } from './renderer/feedback.js';
import { createServiceTagTools } from './renderer/service-tags.js';
import { createSettingsTools } from './renderer/settings-tools.js';
import { createRulesCheckTools } from './renderer/rules-check.js';
import { setupSourceDragDrop } from './renderer/drag-drop.js';
import { createRenameFlow } from './renderer/rename-flow.js';
import { createAutoDetectFlow } from './renderer/auto-detect.js';
import { createTrackerAnalysis } from './renderer/tracker-analysis.js';
import { createDupeCheckTools } from './renderer/dupe-check.js';
import { createMkvTagger } from './renderer/mkv-tagger.js';

// ===== Module state & runtime flags =====
let currentTorrentRequestId = null;
let settingsSnapshot = '';
let settingsDirty = false;
let wizardStepIndex = 0;
let torrentGenerator = 'node';
let sourceAskedForPath = '';
let formatAskedForPath = '';
let refreshPreview = async () => {};
let schedulePreview = () => {};
let showMediaInfoReport = async () => {};
let autoDetectFromPath = async () => {};
let fetchMetadataAuto = async () => {};
let updateAutoDetectControls = () => {};
let manualDetectFromInputs = async () => {};
let mkvTagger = null;
const torrentLogLines = [];
const WIZARD_STEP_COUNT = 3;

// ===== Core services (logger/theme/feedback) =====
const LANGUAGE_CODES_PATTERN = Array.from(new Set([...Object.values(LANG_MAP), 'MULTI']))
  .filter(Boolean)
  .map((value) => String(value).toUpperCase())
  .join('|');
const { logDebug, updateDebugLogView } = createLogger({ debugState, ui });
const { applyTheme, loadTheme, saveTheme } = createThemeTools({
  ui,
  storageKey: THEME_STORAGE_KEY
});
const { showToast, copyToClipboard, openConfirmModal, openChoiceModal, bindConfirmHandlers } =
  createFeedbackTools({ ui });

// ===== UI helper functions =====
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
  if (state.kind === 'tracker') {
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

function updateVideoCodecMenu() {
  if (!ui.videoCodecDropdownMenu) {
    return;
  }
  const isRemuxOrDisc = /^(Remux|Full Disc)$/i.test(ui.formatSelect?.value || '');
  const avcOption = ui.videoCodecDropdownMenu.querySelector('[data-conditional="avc-remux"]');
  if (!avcOption) {
    return;
  }
  avcOption.classList.toggle('hidden', !isRemuxOrDisc);
  if (!isRemuxOrDisc && ui.videoCodecInput?.value === 'AVC') {
    logDebug?.('video codec cleared (menu)', {
      format: ui.formatSelect?.value || '',
      prev: 'AVC'
    });
    ui.videoCodecInput.value = '';
    if (ui.videoCodecSelectBtn) {
      ui.videoCodecSelectBtn.textContent = 'Seleziona codec';
    }
  }
}


function formatMasked(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (text.length <= 6) {
    return `${text[0]}***`;
  }
  return `${text.slice(0, 2)}***${text.slice(-3)}`;
}

function truncateMiddle(value, maxLength = 78) {
  const text = String(value || '');
  if (text.length <= maxLength) {
    return text;
  }
  const keep = Math.floor((maxLength - 1) / 2);
  return `${text.slice(0, keep)}…${text.slice(-keep)}`;
}

function setSelectedPath(pathValue) {
  if (!ui.selectedPath) {
    return;
  }
  const text = pathValue || 'Seleziona un file/cartella o trascinalo qui.';
  ui.selectedPath.textContent = truncateMiddle(text);
  ui.selectedPath.title = text;
}

function setScanHint(label, value) {
  if (!ui.scanHintLabel || !ui.scanHintValue) {
    setHint(ui.scanHint, label ? `${label} ${value || ''}` : value || '');
    return;
  }
  ui.scanHintLabel.textContent = label || '';
  ui.scanHintLabel.classList.toggle('hidden', !label);
  ui.scanHintValue.textContent = value || '';
  ui.scanHintValue.classList.toggle('hidden', !value);
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

function setFetchBadge(mode, label) {
  ui.fetchBadge.classList.remove('auto', 'manual', 'error', 'hidden');
  if (mode === 'manual') {
    ui.fetchBadge.classList.add('manual');
  } else if (mode === 'error') {
    ui.fetchBadge.classList.add('error');
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
    ui.malInput,
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
    ui.formatSelect.value = '';
    ui.formatSelect.dataset.manual = 'false';
    ui.formatSelect.dataset.auto = 'false';
    if (ui.formatSelectBtn) {
      ui.formatSelectBtn.textContent = 'Seleziona formato';
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
    ui.renameFileCheckbox.checked = false;
    ui.renameFileCheckbox.disabled = false;
  }
  if (ui.renameFolderCheckbox) {
    ui.renameFolderCheckbox.checked = false;
    ui.renameFolderCheckbox.disabled = true;
  }
  if (ui.openUploadWizardBtn) {
    ui.openUploadWizardBtn.disabled = false;
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

  if (ui.mediaInfoBadge) {
    setMediaInfoBadgeVisible(false);
  }
  if (ui.renameBadge) {
    ui.renameBadge.classList.add('hidden');
    ui.renameBadge.textContent = '';
  }

  updateAutoDetectControls();
  updateVisibility();
  mkvTagger?.reset();
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
  state.bdInfoRaw = '';
  state.bdInfoParsed = null;
  state.bdInfoError = '';
  state.bdInfoLoading = false;
  state.bdInfoTarget = '';
  state.bdInfoProgress = 0;
  state.bdInfoStage = '';
  state.bdInfoStageText = '';
  state.bdInfoRequestId = '';
  state.bdInfoPlaylists = [];
  state.bdInfoSelectedPlaylist = '';
  state.bdInfoProgressTotal = 0;
  state.bdInfoProgressDone = 0;
  state.bdInfoShowAllPlaylists = false;
  state.mainExtension = '';
  state.audioLangs = [];
  state.episodeMap = {};
  state.metadata = null;
  state.tagSuggestion = '';
  state.autoDetectRunning = false;
  state.lastAutoSuggestKey = '';
  formatAskedForPath = '';
  sourceAskedForPath = '';
  state.lastTorrentPath = '';
  state.screenshots = [];
  state.screenshotsMeta = null;
  state.screenshotsMeta = null;
  state.trackerId = '';
  state.trackerName = '';
  state.trackerData = null;
  state.trackerMediaInfoText = '';

  setSelectedPath('');
  setScanHint('', '');
  ui.resetSourceBtn.classList.add('hidden');
  resetAllInputs();
  updateTagOptions(loadSettings());
}

function mapTypeLabel(value) {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) {
    return '';
  }
  if (normalized.includes('anime')) {
    return 'Anime';
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
  const typeLabel = data?.isAnime
    ? 'Anime'
    : mapTypeLabel(data.type || payload.typeHint || ui.typeSelect.value);
  const formatToken = (value) => {
    if (!value) {
      return '';
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
      return '';
    }
    return /^\d+$/.test(trimmed) ? trimmed.padStart(2, '0') : trimmed;
  };

  if (title) {
    parts.push({ label: 'Titolo', value: title, highlight: true });
  }
  if (year) {
    parts.push({ label: 'Anno', value: year });
  }
  if (typeLabel) {
    parts.push({ label: 'Tipo', value: typeLabel });
  }
  const seasonValue = formatToken(payload.season || ui.seasonInput.value);
  const episodeValue = formatToken(payload.episode || ui.episodeInput.value);
  if (seasonValue) {
    parts.push({ label: 'Stagione', value: seasonValue });
  }
  if (episodeValue) {
    parts.push({ label: 'Episodio', value: episodeValue });
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
  if (data.malId) {
    parts.push({
      label: 'MAL',
      value: data.malId,
      link: `https://myanimelist.net/anime/${data.malId}`
    });
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
      link.className = 'fetch-link fetch-value';
      link.textContent = part.value;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        window.api.openExternal(part.link);
      });
      valueNode = link;
    } else {
      const value = document.createElement('span');
      value.textContent = part.value;
      value.classList.add('fetch-value');
      if (part.highlight) {
        value.classList.add('fetch-title');
      }
      valueNode = value;
    }
    ui.fetchStatus.appendChild(valueNode);
  });

  const visibleWarnings = getAutoMatchWarnings(payload, data);
  if (visibleWarnings.length) {
    ui.fetchStatus.appendChild(document.createTextNode(' | '));
    visibleWarnings.forEach((warning, index) => {
      if (index > 0) {
        ui.fetchStatus.appendChild(document.createTextNode(' | '));
      }
      const warningNode = document.createElement('span');
      warningNode.textContent = warning;
      if (/movie not found/i.test(warning)) {
        warningNode.classList.add('fetch-warning');
      }
      ui.fetchStatus.appendChild(warningNode);
    });
  }
}

function getAutoMatchWarnings(payload, data) {
  const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
  if (!warnings.length) {
    return [];
  }
  const hasTitle = Boolean(data?.title);
  const hasIds = Boolean(data?.tmdbId || data?.imdbId || data?.tvdbSeriesId || data?.malId);
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
  closeAdvancedSettings();
}

function closeSettings() {
  ui.settingsModal.classList.add('hidden');
  closeAdvancedSettings();
}

function setWizardStep(index) {
  if (!ui.uploadWizardTrack) {
    return;
  }
  const safeIndex = Number.isFinite(index) ? index : 0;
  const clamped = Math.max(0, Math.min(safeIndex, WIZARD_STEP_COUNT - 1));
  wizardStepIndex = clamped;
  ui.uploadWizardTrack.style.transform = `translateX(-${clamped * 100}%)`;
  if (ui.uploadWizardSteps) {
    const buttons = ui.uploadWizardSteps.querySelectorAll('.wizard-step-btn');
    buttons.forEach((button) => {
      const stepIndex = Number(button.dataset.step);
      const isActive = stepIndex === clamped;
      button.classList.toggle('active', isActive);
      if (isActive) {
        button.setAttribute('aria-current', 'step');
      } else {
        button.removeAttribute('aria-current');
      }
    });
  }
  if (ui.wizardStepStatus) {
    ui.wizardStepStatus.textContent = `Step ${clamped + 1} di ${WIZARD_STEP_COUNT}`;
  }
  if (ui.wizardPrevBtn) {
    ui.wizardPrevBtn.disabled = clamped === 0;
  }
  if (ui.wizardNextBtn) {
    ui.wizardNextBtn.disabled = clamped === WIZARD_STEP_COUNT - 1;
  }
  if (clamped === 0) {
    updateWizardRulesCheck(getFormState());
    dupeCheck?.runWizardDupeCheck?.();
  } else if (clamped === 1) {
    prepareTorrentStep();
  } else if (clamped === 2) {
    uploadKit?.prepareUploadKitStep?.();
  }
}

async function confirmWizardAdvance(targetStep) {
  if (wizardStepIndex !== 0 || targetStep <= 0) {
    return true;
  }
  if (!dupeCheck?.hasDupes?.()) {
    return true;
  }
  return openConfirmModal('Sono stati trovati possibili duplicati. Vuoi continuare?');
}

function openUploadWizard(step = 0) {
  if (!ui.uploadWizardModal) {
    return;
  }
  if (!state.targetPath) {
    showToast('Carica un file o una cartella per avviare il wizard.', 'warning');
    return;
  }
  ui.uploadWizardModal.classList.remove('hidden');
  setWizardStep(step);
}

function closeUploadWizard() {
  if (!ui.uploadWizardModal) {
    return;
  }
  ui.uploadWizardModal.classList.add('hidden');
}

function openAdvancedSettings() {
  if (!ui.advancedSettingsModal) {
    return;
  }
  ui.advancedSettingsModal.classList.remove('hidden');
}

function closeAdvancedSettings() {
  if (!ui.advancedSettingsModal) {
    return;
  }
  ui.advancedSettingsModal.classList.add('hidden');
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

async function updateAppVersionLabel() {
  if (!ui.appVersion || !window.api?.getAppVersion) {
    return;
  }
  const version = await window.api.getAppVersion();
  if (version) {
    ui.appVersion.textContent = `(v. ${version})`;
  }
}

async function checkForAppUpdate() {
  if (!window.api?.checkUpdate) {
    console.warn('[update] window.api.checkUpdate non disponibile');
    return;
  }
  try {
    const result = await window.api.checkUpdate();
    console.log('[update] risultato check:', JSON.stringify(result));
    if (!result?.hasUpdate) return;
    const banner = document.getElementById('updateBanner');
    if (!banner) {
      console.warn('[update] elemento #updateBanner non trovato');
      return;
    }
    const text = document.getElementById('updateBannerText');
    const dlBtn = document.getElementById('updateBannerDownload');
    const dismissBtn = document.getElementById('updateBannerDismiss');
    if (text) text.textContent = `Nuova versione ${result.latestVersion} disponibile`;
    if (dlBtn && result.releaseUrl) {
      dlBtn.addEventListener('click', () => window.api.openExternal(result.releaseUrl));
    }
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => banner.classList.add('hidden'));
    }
    banner.classList.remove('hidden');
  } catch (err) {
    console.error('[update] errore:', err);
  }
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

function prepareTorrentStep() {
  if (!state.targetPath) {
    setHint(ui.torrentHint, 'Seleziona un file o una cartella.');
    return;
  }

  const settings = loadSettings();
  const useMkbrr = Boolean(settings.torrentMkbrrPath);
  if (ui.torrentOutputInput) {
    ui.torrentOutputInput.value = settings.torrentOutputDir || '';
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

  setHint(ui.torrentHint, '');
  setTorrentGeneratorHint(useMkbrr ? 'mkbrr' : 'node');
  resetTorrentProgress();

  // Ripristina automaticamente torrent dalla cartella job se già generato
  uploadKit?.restoreJobStateIfNeeded?.().then(() => {
    if (state.lastTorrentPath && ui.torrentHint && !ui.torrentHint.textContent) {
      const name = state.lastTorrentPath.replace(/\\/g, '/').split('/').pop();
      setHint(ui.torrentHint, `Torrent trovato: ${name}`);
    }
  }).catch(() => {});
}

function openTorrentModal() {
  if (!state.targetPath) {
    setHint(ui.renameHint, 'Seleziona un file o una cartella.');
    return;
  }
  openUploadWizard(1);
}

function closeTorrentModal() {
  resetTorrentProgress();
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

function updateBdInfoProgressUi() {
  const row = document.getElementById('bdinfoProgressRow');
  const fill = document.getElementById('bdinfoProgressFill');
  const text = document.getElementById('bdinfoProgressText');
  const stageRow = document.getElementById('bdinfoProgressStage');
  const stageText = document.getElementById('bdinfoProgressStageText');
  const cancelBtn = document.getElementById('bdinfoCancelButton');

  if (!stageRow || !stageText) {
    schedulePreview();
    return;
  }

  if (row && fill && text) {
    const progress = Number.isFinite(state.bdInfoProgress) ? state.bdInfoProgress : 0;
    const hasTotal = Number.isFinite(state.bdInfoProgressTotal) && state.bdInfoProgressTotal > 0;
    const showProgress = state.bdInfoLoading ? hasTotal || progress > 0 : progress > 0;
    row.classList.toggle('hidden', !showProgress);
    fill.style.width = `${Math.round(progress * 100)}%`;
    text.textContent = `${Math.round(progress * 100)}%`;
  } else if (row) {
    row.classList.add('hidden');
  }

  const showStage = state.bdInfoLoading || Boolean(state.bdInfoStageText);
  stageRow.classList.toggle('hidden', !showStage);
  stageRow.classList.toggle('done', state.bdInfoStage === 'done');
  stageText.textContent = state.bdInfoStageText || (state.bdInfoLoading ? 'BDInfo in corso...' : '');

  if (cancelBtn) {
    cancelBtn.classList.toggle('hidden', !state.bdInfoLoading);
  }
}

async function cancelBdInfo() {
  if (!state.bdInfoLoading || !state.bdInfoRequestId) {
    return;
  }
  try {
    await window.api.cancelBdInfo?.({ requestId: state.bdInfoRequestId });
  } catch (error) {
    // ignore cancel errors
  }
  state.bdInfoLoading = false;
  state.bdInfoError = 'Operazione annullata.';
  state.bdInfoStage = 'cancelled';
  state.bdInfoStageText = 'Operazione annullata';
  updateBdInfoProgressUi();
  schedulePreview();
}

function setTorrentGeneratorHint(generator) {
  if (!ui.torrentGeneratorHint) {
    return;
  }
  ui.torrentGeneratorHint.innerHTML = '';
  ui.torrentGeneratorHint.classList.toggle('hidden', !generator);
  torrentGenerator = generator || 'node';
  if (!generator) {
    return;
  }

  if (generator === 'mkbrr') {
    ui.torrentGeneratorHint.textContent = 'Generatore .torrent utilizzato: mkbrr (Veloce).';
    return;
  }

  const prefix = document.createElement('span');
  prefix.textContent =
    "Generatore .torrent utilizzato: Node (Lento). Barra di progresso non affidabile. Puoi velocizzare scaricando l'exe di mkbrr ";
  const link = document.createElement('a');
  link.textContent = 'QUI';
  link.href = 'https://github.com/autobrr/mkbrr/releases';
  link.setAttribute('data-external', 'https://github.com/autobrr/mkbrr/releases');
  ui.torrentGeneratorHint.append(prefix, link, document.createTextNode('.'));
}

function resetTorrentLog() {
  torrentLogLines.length = 0;
  if (ui.torrentLog) {
    ui.torrentLog.textContent = '';
    ui.torrentLog.classList.add('hidden');
  }
}

function appendTorrentLog(line) {
  if (!ui.torrentLog || !line) {
    return;
  }
  if (line.startsWith('Hashing pieces') && torrentLogLines.length) {
    const lastIndex = torrentLogLines.length - 1;
    if (torrentLogLines[lastIndex].startsWith('Hashing pieces')) {
      torrentLogLines[lastIndex] = line;
    } else {
      torrentLogLines.push(line);
    }
  } else {
    torrentLogLines.push(line);
  }
  while (torrentLogLines.length > 8) {
    torrentLogLines.shift();
  }
  ui.torrentLog.textContent = torrentLogLines.join('\n');
  ui.torrentLog.classList.remove('hidden');
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
  resetTorrentLog();
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

// ===== Dropdown utilities =====
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


function applyNameSuggestions(format, service, source, repack, settingsOverride) {
  const settings = settingsOverride || getSettings();
  const serviceOptions = buildServiceOptions(settings);
  logDebug?.('applyNameSuggestions start', {
    format: format || '',
    service: service || '',
    source: source || '',
    repack: repack || '',
    prevVideoCodec: ui.videoCodecInput?.value || ''
  });

  if (format) {
    setDropdownValue(ui.formatSelect, ui.formatSelectBtn, format, format);
  }
  if (source) {
    setDropdownValue(ui.sourceInput, ui.sourceInputBtn, source, source);
  }
  if (service) {
    const option = serviceOptions.find((item) => item.code === service);
    if (option) {
      setDropdownValue(ui.serviceInput, ui.serviceInputBtn, service, `${option.label} (${option.code})`);
    }
  }
  if (repack) {
    setDropdownValue(ui.repackSelect, ui.repackSelectBtn, repack, repack);
  }
  logDebug?.('applyNameSuggestions end', {
    format: ui.formatSelect?.value || '',
    videoCodec: ui.videoCodecInput?.value || ''
  });
  schedulePreview();
}

function updateFormatServiceSuggest() {
  if (!ui.formatSuggestRow || !ui.formatSuggestText) {
    return;
  }
  const settings = getSettings();
  if (ui.applyNameSuggestBtn) {
    ui.applyNameSuggestBtn.removeAttribute('data-tooltip');
  }
  if (!state.targetPath) {
    ui.formatSuggestRow.classList.remove('is-empty');
    const emptyText = 'Suggerimento nome/MediaInfo: Nessun suggerimento specifico disponibile.';
    if (ui.formatSuggestText.dataset.lastHtml !== emptyText) {
      ui.formatSuggestText.textContent = emptyText;
      ui.formatSuggestText.dataset.lastHtml = emptyText;
    }
    return;
  }
  const basePath = state.mainVideo || state.videoFiles?.[0] || state.targetPath;
  const baseName = basePath ? stripExtension(getPathBaseName(basePath)) : '';
  if (!baseName) {
    ui.formatSuggestRow.classList.add('is-empty');
    if (ui.formatSuggestText.dataset.lastHtml !== '') {
      ui.formatSuggestText.textContent = '';
      ui.formatSuggestText.dataset.lastHtml = '';
    }
    return;
  }
  const nameFormat = detectFormatFromName(baseName);
  const serviceOptions = buildServiceOptions(settings);
  const serviceCodes = serviceOptions.map((item) => item.code);
  const service = extractTokensPresent(baseName, serviceCodes)[0] || '';
  if (service && ui.serviceInput && ui.serviceInputBtn) {
    const serviceOpt = serviceOptions.find((item) => item.code === service);
    if (serviceOpt) {
      setDropdownAuto(ui.serviceInput, ui.serviceInputBtn, service, `${serviceOpt.label} (${serviceOpt.code})`);
    }
  }
  const sourceFromName = detectSourceFromName(baseName);
  let source = sourceFromName;
  const repack = detectRepackFromName(baseName);
  const mediaInfoFormat = detectFormatFromMediaInfo(state.mediaInfo, baseName, { service, source });
  let format = mediaInfoFormat.value || nameFormat;
  let formatReason = mediaInfoFormat.value
    ? mediaInfoFormat.reason
    : format
      ? 'Rilevato da parsing del nome file: token formato'
      : '';
  let sourceReason = '';
  if (!source && mediaInfoFormat.source) {
    source = mediaInfoFormat.source;
    sourceReason = mediaInfoFormat.sourceReason;
  } else if (source) {
    sourceReason = 'Rilevato da parsing del nome file: token sorgente';
  }
  if (!format && source) {
    format = 'Encode';
    formatReason = 'Rilevato da parsing del nome file: sorgente rilevata (fallback Encode)';
  }
  // Se il formato suggerito è Remux ma il nome contiene x264/x265, potrebbe essere un GPU encode
  const nameHasEncodeMarker = /\bx264\b|\bx265\b/i.test(baseName);
  const isRemuxWithEncodeMarker = format === 'Remux' && nameHasEncodeMarker;
  if (isRemuxWithEncodeMarker) {
    format = 'Encode';
    formatReason = 'Attenzione: il nome file contiene x264/x265 ma MediaInfo non mostra firme encoder (possibile GPU encode). Suggerito Encode — verifica manualmente se si tratta di un REMUX.';
  }
  if (format === 'Encode' && !isRemuxWithEncodeMarker) {
    const webHint =
      nameFormat === 'WEBRip' ||
      nameFormat === 'WEB-DL' ||
      Boolean(service) ||
      Boolean(mediaInfoFormat.value && mediaInfoFormat.value !== 'Encode');
    if (webHint) {
      const webFormat = mediaInfoFormat.value && mediaInfoFormat.value !== 'Encode' ? mediaInfoFormat.value : 'WEBRip';
      format = webFormat;
      formatReason = mediaInfoFormat.reason
        ? `${mediaInfoFormat.reason} (fallback WEB)`
        : 'Rilevato da parsing del nome file: token WEB/servizio';
    }
  }
  const hasItalianSubsOnly = (() => {
    if (!state.mediaInfo || state.mediaInfo.error) {
      return false;
    }
    const audioTracks = getAudioTracks(state.mediaInfo);
    const audioLangs = audioTracks
      .map((track) => normalizeLangTag(getTrackLang(track)))
      .filter(Boolean);
    const hasItalianAudio = audioLangs.includes('ITA');
    if (hasItalianAudio) {
      return false;
    }
    const tracks = state.mediaInfo?.media?.track || [];
    const textTracks = tracks.filter((track) => track['@type'] === 'Text');
    const subLangs = textTracks
      .map((track) => normalizeLangTag(getTrackLang(track)))
      .filter(Boolean);
    return subLangs.includes('ITA');
  })();

  logDebug('suggest: decision', {
    baseName,
    nameFormat,
    mediaInfoFormat,
    mediaInfoSignals: mediaInfoFormat.debug || {},
    serviceFromName: service,
    sourceFromName,
    repack,
    finalFormat: format || '',
    formatReason,
    finalSource: source || '',
    sourceReason,
    extraSubs: hasItalianSubsOnly
  });

  // Se formato sconosciuto o rilevato come Encode (potrebbe essere WEB-DL da NF/HMAX), chiedi all'utente
  if ((!format || format === 'Encode') && state.targetPath !== formatAskedForPath) {
    const askFormatKey = `ask-format:${state.targetPath}`;
    if (state.lastAutoSuggestKey !== askFormatKey) {
      state.lastAutoSuggestKey = askFormatKey;
      formatAskedForPath = state.targetPath;
      sourceAskedForPath = state.targetPath; // previeni doppio ask sorgente dal blocco autoKey
      (async () => {
        const chosenFormat = await openChoiceModal(
          'Formato non rilevato',
          'Non è stato possibile determinare il formato dal nome file o da MediaInfo.<br>Seleziona il formato corretto:',
          [
            { value: 'WEB-DL', label: 'WEB-DL' },
            { value: 'WEBRip', label: 'WEBRip' },
            { value: 'Encode', label: 'Encode' },
            { value: 'Remux', label: 'Remux' },
            { value: 'Full Disc', label: 'Full Disc' }
          ]
        );
        if (!chosenFormat) return;
        let chosenSource = source;
        if (chosenFormat === 'Encode' && !chosenSource) {
          const picked = await openChoiceModal(
            'Sorgente non rilevata',
            'Il formato è <b>Encode</b> ma la sorgente non è determinabile dal nome file o da MediaInfo.<br>Seleziona la sorgente corretta:',
            [
              { value: 'BluRay', label: 'BluRay' },
              { value: 'UHD BluRay', label: 'UHD BluRay' },
              { value: 'WEBRip', label: 'WEBRip' },
              { value: 'DVD', label: 'DVD' },
              { value: 'HDTV', label: 'HDTV' }
            ]
          );
          if (picked) chosenSource = picked;
        }
        applyNameSuggestions(chosenFormat, service, chosenSource, repack, settings);
      })();
    }
  }

  if (!format && !service && !source && !repack && !hasItalianSubsOnly) {
    ui.formatSuggestRow.classList.remove('is-empty');
    const emptyText = 'Suggerimento nome/MediaInfo: Nessun suggerimento specifico disponibile.';
    if (ui.formatSuggestText.dataset.lastHtml !== emptyText) {
      ui.formatSuggestText.textContent = emptyText;
      ui.formatSuggestText.dataset.lastHtml = emptyText;
    }
    if (ui.applyNameSuggestBtn) {
      ui.applyNameSuggestBtn.disabled = true;
      ui.applyNameSuggestBtn.dataset.format = '';
      ui.applyNameSuggestBtn.dataset.service = '';
      ui.applyNameSuggestBtn.dataset.source = '';
      ui.applyNameSuggestBtn.dataset.repack = '';
    }
    return;
  }
  const parts = [];
  if (format) {
    parts.push({ label: 'Formato:', value: format, reason: formatReason });
  }
  const serviceSourceParts = [];
  if (service) {
    serviceSourceParts.push({
      value: service,
      reason: 'Rilevato da parsing del nome file: codice servizio'
    });
  }
  if (source) {
    const sourceLabel = source === 'HDTV' ? 'HDTV (obsoleta)' : source;
    serviceSourceParts.push({
      value: sourceLabel,
      reason: sourceReason || 'Rilevato da parsing del nome file: token sorgente'
    });
  }
  if (serviceSourceParts.length) {
    parts.push({
      label: 'Servizio/Sorgente:',
      value: serviceSourceParts.map((item) => item.value).join(' / '),
      reason: serviceSourceParts.map((item) => item.reason).join(' | ')
    });
  }
  if (repack) {
    parts.push({
      label: 'Repack:',
      value: repack,
      reason: 'Rilevato da parsing del nome file: token repack'
    });
  }
  if (hasItalianSubsOnly) {
    parts.push({
      label: 'Extra:',
      value: 'SUBS',
      reason: 'Rilevato dal parsing MediaInfo: sottotitoli ITA senza audio ITA'
    });
  }
  if (!parts.length) {
    ui.formatSuggestRow.classList.remove('is-empty');
    const emptyText = 'Suggerimento nome/MediaInfo: Nessun suggerimento specifico disponibile.';
    if (ui.formatSuggestText.dataset.lastHtml !== emptyText) {
      ui.formatSuggestText.textContent = emptyText;
      ui.formatSuggestText.dataset.lastHtml = emptyText;
    }
    if (ui.applyNameSuggestBtn) {
      ui.applyNameSuggestBtn.disabled = true;
      ui.applyNameSuggestBtn.dataset.format = '';
      ui.applyNameSuggestBtn.dataset.service = '';
      ui.applyNameSuggestBtn.dataset.source = '';
      ui.applyNameSuggestBtn.dataset.repack = '';
    }
    return;
  }
  const html = parts
    .map((part) => {
      const title = part.reason ? ` data-tooltip="${part.reason}"` : '';
      return `<span class="suggest-label">${part.label}</span> <span class="suggest-value"${title}>${part.value}</span>`;
    })
    .join(' · ');
  const fullHtml = `Suggerimento nome/MediaInfo: ${html}`;
  if (ui.formatSuggestText.dataset.lastHtml !== fullHtml) {
    ui.formatSuggestText.innerHTML = fullHtml;
    ui.formatSuggestText.dataset.lastHtml = fullHtml;
  }
  ui.formatSuggestRow.classList.remove('is-empty');
  if (ui.applyNameSuggestBtn) {
    ui.applyNameSuggestBtn.disabled = false;
    ui.applyNameSuggestBtn.dataset.format = format || '';
    ui.applyNameSuggestBtn.dataset.service = service || '';
    ui.applyNameSuggestBtn.dataset.source = source || '';
    ui.applyNameSuggestBtn.dataset.repack = repack || '';
  }
  {
    const autoKey = JSON.stringify({
      target: state.targetPath || '',
      format,
      service,
      source,
      repack
    });
    if (autoKey && state.lastAutoSuggestKey !== autoKey) {
      state.lastAutoSuggestKey = autoKey;
      (async () => {
        let resolvedSource = source;
        if (format === 'Encode' && !resolvedSource && state.targetPath !== sourceAskedForPath) {
          sourceAskedForPath = state.targetPath;
          logDebug('suggest: source unknown, showing choice modal');
          const chosen = await openChoiceModal(
            'Sorgente non rilevata',
            'Il formato rilevato è <b>Encode</b> ma la sorgente non è determinabile dal nome file o da MediaInfo.<br>Seleziona la sorgente corretta:',
            [
              { value: 'BluRay', label: 'BluRay' },
              { value: 'UHD BluRay', label: 'UHD BluRay' },
              { value: 'WEBRip', label: 'WEBRip' },
              { value: 'DVD', label: 'DVD' },
              { value: 'HDTV', label: 'HDTV' }
            ]
          );
          if (chosen) {
            resolvedSource = chosen;
            logDebug('suggest: source chosen from modal', resolvedSource);
          }
        }
        logDebug('suggest: auto-apply', {
          format: format || '',
          service: service || '',
          source: resolvedSource || '',
          repack: repack || '',
          autoKey
        });
        applyNameSuggestions(format, service, resolvedSource, repack, settings);
        // Se era un GPU encode rilevato dal nome, correggi anche il video codec
        if (isRemuxWithEncodeMarker && ui.videoCodecInput && ui.videoCodecSelectBtn) {
          const codecFromName = /\bx265\b/i.test(baseName) ? 'x265' : /\bx264\b/i.test(baseName) ? 'x264' : '';
          if (codecFromName) {
            ui.videoCodecInput.dataset.manual = 'false';
            setDropdownAuto(ui.videoCodecInput, ui.videoCodecSelectBtn, codecFromName, codecFromName);
          }
        }
      })();
    }
  }
}

const metadataTools = createMetadataTools({
  state,
  ui,
  logDebug,
  setDropdownAuto,
  setInputAuto,
  applyFormatSuggestion
});
const {
  parseSimpleList,
  loadServiceDefaults,
  buildServiceOptions,
  updateServiceOptions,
  updateTagOptions,
  updateTagSuggestion
} = createServiceTagTools({ ui, state, logDebug, metadataTools });
const {
  getAnnounceUrlFromSettings,
  loadSettings,
  saveSettings,
  updateAppHealthStatus,
  updateFfmpegHint,
  updateQbitMappingHint,
  updateClientSections,
  updateSettingsVisibility,
  applySettingsToUI,
  getSettings,
  openHealthCheckModal
} = createSettingsTools({
  ui,
  updateTagSuggestion,
  updateTagOptions,
  loadServiceDefaults,
  updateServiceOptions,
  schedulePreview: () => schedulePreview()
});
const {
  clearWizardRulesCheck,
  updateWizardRulesCheck,
  updateRulesCheckForTargets
} = createRulesCheckTools({
  ui,
  state,
  metadataTools,
  buildServiceOptions,
  loadSettings
});
const dupeCheck = createDupeCheckTools({
  ui,
  state,
  loadSettings,
  getFormState,
  showToast,
  logDebug
});

mkvTagger = createMkvTagger({ ui, loadSettings, saveSettings });

function setIfAuto(input, value) {
  const isCheckbox = input.type === 'checkbox';
  if (!isCheckbox && !value) {
    return;
  }
  if (isCheckbox && typeof value !== 'boolean') {
    return;
  }
  if (!input.dataset.manual || input.dataset.manual === 'false' || (!isCheckbox && !input.value)) {
    if (isCheckbox) {
      input.checked = value;
    } else {
      input.value = value;
    }
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
  if (ui.multiEpisodeToggleWrap) {
    ui.multiEpisodeToggleWrap.classList.toggle('hidden', !isSeason);
  }
  if (ui.metadataRow) {
    ui.metadataRow.classList.toggle('with-multi', isSeason);
  }

  const showService = format === 'WEB-DL' || format === 'WEBRip';
  const showSource = format === 'Encode' || format === 'Remux' || format === 'Full Disc';
  const showRegion = format === 'Full Disc';

  ui.serviceGroup.style.display = showService ? 'block' : 'none';
  ui.sourceGroup.style.display = showSource ? 'block' : 'none';
  ui.regionWrapper.style.display = showRegion ? 'block' : 'none';
  if (ui.formatRow) {
    ui.formatRow.classList.toggle('no-source', !showSource);
    ui.formatRow.classList.toggle('no-service', !showService);
    ui.formatRow.classList.toggle('with-region', showRegion);
  }
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
  const settings = loadSettings();
  const languageTagInFolders = settings.renameLangInFolders !== false;
  const languageTagInFiles = settings.renameLangInFiles !== false;
  const allowNoGroupTag = settings.autoNoGroupTag !== false;
  const subsTag = (() => {
    if (!state.mediaInfo || state.mediaInfo.error) {
      return '';
    }
    const audioTracks = getAudioTracks(state.mediaInfo);
    const hasItalianAudio = audioTracks.some((track) => {
      const lang = normalizeLangTag(getTrackLang(track));
      if (lang !== 'ITA') {
        return false;
      }
      const title = String(track.Title || track.title || '').toLowerCase();
      return !title.includes('commentary');
    });
    if (hasItalianAudio) {
      return '';
    }
    const tracks = state.mediaInfo?.media?.track || [];
    const textTracks = tracks.filter((track) => track['@type'] === 'Text');
    const hasItalianSubs = textTracks.some((track) => normalizeLangTag(getTrackLang(track)) === 'ITA');
    return hasItalianSubs ? '[SUBS]' : '';
  })();

  const type = ui.typeSelect.value;
  const isSeason = type === 'tv-season' || type === 'anime-season';

  return {
    type,
    format: ui.formatSelect.value,
    title: ui.titleInput.value.trim(),
    year: ui.yearInput.value.trim(),
    includeYear: ui.includeYear.checked,
    season: ui.seasonInput.value,
    episode: ui.episodeInput.value,
    episodeTitle: ui.episodeTitleInput.value.trim(),
    multiEpisode: (isSeason && ui.multiEpisodeToggle?.checked) || false,
    part: ui.partInput.value.trim(),
    languageTag: ui.languageTagInput.value.trim(),
    languageTagInFolders,
    languageTagInFiles,
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
    tag: getResolvedTag(),
    subsTag,
    allowNoGroupTag
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

// ===== Flow factories (rename / auto-detect / tracker) =====
const renameTools = createRenameTools({
  state,
  ui,
  getFormState,
  guessMetadataFromName: metadataTools.guessMetadataFromName,
  parseSeasonEpisodeRange: metadataTools.parseSeasonEpisodeRange,
  episodeKey: metadataTools.episodeKey,
  setHint,
  languageCodesPattern: LANGUAGE_CODES_PATTERN,
  getServiceCodes: () => buildServiceOptions(getSettings()).map((item) => item.code)
});

const renameFlow = createRenameFlow({
  ui,
  state,
  renameTools,
  parseSeasonEpisodeRange: metadataTools.parseSeasonEpisodeRange,
  buildBdInfoShort: metadataTools.buildBdInfoShort,
  buildMediaInfoShort: metadataTools.buildMediaInfoShort,
  getFormState,
  logDebug,
  updateRenameBadge,
  clearWizardRulesCheck,
  updateWizardRulesCheck,
  getPathBaseName,
  isDiscStructure,
  showToast,
  openMediaInfoModal,
  cancelBdInfo,
  scanBdInfoPlaylist: () => scanSelectedBdInfoPlaylist(),
  updateVisibility,
  updateFormatServiceSuggest,
  getMediaInfoText: (path) => window.api.getMediaInfoText(path),
  previewRename: (payload) => window.api.previewRename(payload),
  copyToClipboard,
  refreshMainUploadTitle: () => refreshMainUploadTitle()
});

({ refreshPreview, schedulePreview, showMediaInfoReport } = renameFlow);

function openDisambiguationModal(candidates) {
  const modal = document.getElementById('disambiguationModal');
  const list = document.getElementById('disambiguationList');
  const cancelBtn = document.getElementById('disambiguationCancelBtn');
  if (!modal || !list || !candidates?.length) return Promise.resolve(null);

  list.innerHTML = '';
  return new Promise((resolve) => {
    let settled = false;
    function close(value) {
      if (settled) return;
      settled = true;
      modal.classList.add('hidden');
      resolve(value);
    }

    candidates.forEach((c) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'disambiguation-item';

      const poster = document.createElement('div');
      poster.className = 'disambiguation-item-poster';
      if (c.posterUrl) {
        const img = document.createElement('img');
        img.src = c.posterUrl;
        img.alt = '';
        poster.appendChild(img);
      }
      item.appendChild(poster);

      const info = document.createElement('div');
      info.className = 'disambiguation-item-info';
      const title = document.createElement('div');
      title.className = 'disambiguation-item-title';
      title.textContent = c.title || '-';
      const year = document.createElement('div');
      year.className = 'disambiguation-item-year';
      year.textContent = c.year || 'Anno sconosciuto';
      info.appendChild(title);
      info.appendChild(year);
      item.appendChild(info);

      item.addEventListener('click', () => close(c));
      list.appendChild(item);
    });

    if (cancelBtn) {
      const handler = () => close(null);
      cancelBtn.addEventListener('click', handler, { once: true });
    }
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
        close(null);
      }
    }, { once: true });

    modal.classList.remove('hidden');
  });
}

const autoDetectFlow = createAutoDetectFlow({
  ui,
  state,
  metadataTools,
  hasCjkChars,
  normalizeLangTag,
  loadSettings,
  logDebug,
  setHint,
  setFetchBadge,
  setIfAuto,
  setInputAuto,
  updateVisibility,
  schedulePreview,
  renderFetchStatus,
  getPathBaseName,
  getParentPath,
  isDiscStructure,
  fetchMetadata: (payload) => window.api.fetchMetadata(payload),
  onAmbiguity: openDisambiguationModal,
  showToast
});

({ fetchMetadataAuto, autoDetectFromPath, updateAutoDetectControls, manualDetectFromInputs } = autoDetectFlow);

{
  const _origFetchMetadataAuto = fetchMetadataAuto;
  fetchMetadataAuto = async (...args) => {
    await _origFetchMetadataAuto(...args);
    mkvTagger?.syncMetadata();
    mkvTagger?.syncTitle();
  };
  const _origManualDetect = manualDetectFromInputs;
  manualDetectFromInputs = async (...args) => {
    await _origManualDetect(...args);
    mkvTagger?.syncMetadata();
    mkvTagger?.syncTitle();
  };
}

function showBbcodeModal(content) {
  if (!ui.bbcodeModal || !ui.bbcodeTextarea) return;
  ui.bbcodeTextarea.value = content || '';
  ui.bbcodeTextarea.readOnly = true;
  if (ui.bbcodeEditBtn) ui.bbcodeEditBtn.textContent = 'Modifica';
  ui.bbcodeModal.classList.remove('hidden');
}

function closeBbcodeModal() {
  if (!ui.bbcodeModal) return;
  ui.bbcodeModal.classList.add('hidden');
}

if (ui.bbcodeCloseBtn) ui.bbcodeCloseBtn.addEventListener('click', closeBbcodeModal);
ui.bbcodeModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeBbcodeModal);

if (ui.bbcodePreviewBtn) {
  ui.bbcodePreviewBtn.addEventListener('click', () => {
    showBbcodeModal(uploadKit.buildUploadDescription(getFormState()));
  });
}

if (ui.bbcodeDirectCopyBtn) {
  ui.bbcodeDirectCopyBtn.addEventListener('click', () => {
    copyToClipboard(uploadKit.buildUploadDescription(getFormState()), 'BBCode copiato.');
  });
}

if (ui.bbcodeEditBtn) {
  ui.bbcodeEditBtn.addEventListener('click', () => {
    if (!ui.bbcodeTextarea) return;
    const isEditing = !ui.bbcodeTextarea.readOnly;
    ui.bbcodeTextarea.readOnly = isEditing;
    ui.bbcodeEditBtn.textContent = isEditing ? 'Modifica' : 'Blocca';
    if (!isEditing) ui.bbcodeTextarea.focus();
  });
}

if (ui.bbcodeCopyBtn) {
  ui.bbcodeCopyBtn.addEventListener('click', () => {
    copyToClipboard(ui.bbcodeTextarea?.value || '', 'BBCode copiato.');
  });
}

if (ui.bbcodeRenderPreviewBtn) {
  ui.bbcodeRenderPreviewBtn.addEventListener('click', () => {
    uploadKit.showBbcodePreview(ui.bbcodeTextarea?.value || '');
  });
}

const trackerAnalysis = createTrackerAnalysis({
  ui,
  state,
  metadataTools,
  loadSettings,
  logDebug,
  showToast,
  resetAllInputs,
  setSelectedPath,
  setScanHint,
  updateTagSuggestion,
  updateTagOptions,
  setMediaInfoBadgeVisible,
  updateVisibility,
  schedulePreview,
  fetchMetadataAuto,
  setIfAuto,
  setInputAuto,
  refreshUploadDescription: () => showBbcodeModal(uploadKit.buildUploadDescription(getFormState(), { edited: true }))
});
trackerAnalysis.init();

// ===== BDInfo handling =====
function getDiscRootPath(targetPath, mainVideo) {
  const candidate = String(mainVideo || targetPath || '');
  const match = candidate.match(/^(.*?)[\\/](BDMV|VIDEO_TS)[\\/]/i);
  return match ? match[1] : targetPath;
}

async function loadBdInfoPlaylists(targetPath) {
  const settings = loadSettings();
  const bdinfoPath = String(settings.bdinfoPath || '').trim();
  state.bdInfoRaw = '';
  state.bdInfoParsed = null;
  state.bdInfoError = '';
  state.bdInfoLoading = true;
  state.bdInfoTarget = targetPath;
  state.bdInfoProgress = 0;
  state.bdInfoProgressTotal = 0;
  state.bdInfoProgressDone = 0;
  state.bdInfoShowAllPlaylists = false;
  state.bdInfoStage = 'list';
  state.bdInfoStageText = 'Lettura playlist BDInfo...';
  if (state.bdInfoRequestId) {
    await window.api.cancelBdInfo?.({ requestId: state.bdInfoRequestId });
  }
  state.bdInfoRequestId = `bdinfo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  updateBdInfoProgressUi();

  if (!bdinfoPath) {
    state.bdInfoLoading = false;
    state.bdInfoError = 'Percorso BDInfo non configurato.';
    state.bdInfoStage = 'error';
    state.bdInfoStageText = 'BDInfo non configurato';
    schedulePreview();
    return;
  }

  const discRoot = getDiscRootPath(targetPath, state.mainVideo);
  state.bdInfoTarget = discRoot;
  const result = await window.api.getBdInfoText?.({
    path: discRoot,
    bdinfoPath,
    requestId: state.bdInfoRequestId,
    listOnly: true
  });
  if (state.targetPath !== targetPath) {
    return;
  }
  state.bdInfoPlaylists = Array.isArray(result?.playlists) ? result.playlists : [];
  const selected = state.bdInfoSelectedPlaylist;
  const listHasSelected = selected && state.bdInfoPlaylists.some((item) => item.playlist === selected);
  if (!state.bdInfoPlaylists.length) {
    state.bdInfoSelectedPlaylist = '';
  } else if (!listHasSelected) {
    const sorted = state.bdInfoPlaylists
      .slice()
      .filter((item) =>
        Number.isFinite(item?.durationSeconds) ? item.durationSeconds >= 600 : true
      )
      .sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
    state.bdInfoSelectedPlaylist = sorted[0]?.playlist || '';
  }
  if (!result?.ok) {
    state.bdInfoError = result?.error || 'Errore BDInfo.';
    state.bdInfoStage = 'error';
    state.bdInfoStageText = state.bdInfoError;
  } else {
    state.bdInfoError = '';
    state.bdInfoStage = '';
    state.bdInfoStageText = '';
  }
  state.bdInfoLoading = false;
  updateBdInfoProgressUi();
  logDebug('bdinfo playlists', {
    ok: Boolean(result?.ok),
    error: result?.error || '',
    count: state.bdInfoPlaylists.length,
    path: discRoot,
    requestId: state.bdInfoRequestId || ''
  });
  schedulePreview();
}

async function fetchBdInfo(targetPath, playlistOverride = '') {
  const settings = loadSettings();
  const bdinfoPath = String(settings.bdinfoPath || '').trim();
  state.bdInfoRaw = '';
  state.bdInfoParsed = null;
  state.bdInfoError = '';
  state.bdInfoLoading = true;
  state.bdInfoTarget = targetPath;
  state.bdInfoProgress = 0;
  state.bdInfoProgressTotal = 0;
  state.bdInfoProgressDone = 0;
  state.bdInfoStage = 'start';
  state.bdInfoStageText = 'Avvio BDInfo...';
  if (state.bdInfoRequestId) {
    await window.api.cancelBdInfo?.({ requestId: state.bdInfoRequestId });
  }
  state.bdInfoRequestId = `bdinfo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  updateBdInfoProgressUi();

  if (!bdinfoPath) {
    state.bdInfoLoading = false;
    state.bdInfoError = 'Percorso BDInfo non configurato.';
    state.bdInfoStage = 'error';
    state.bdInfoStageText = 'BDInfo non configurato';
    schedulePreview();
    return;
  }

  const discRoot = getDiscRootPath(targetPath, state.mainVideo);
  state.bdInfoTarget = discRoot;
  const result = await window.api.getBdInfoText?.({
    path: discRoot,
    bdinfoPath,
    requestId: state.bdInfoRequestId,
    playlist: playlistOverride
  });
  if (state.targetPath !== targetPath) {
    return;
  }
  if (Array.isArray(result?.playlists) && result.playlists.length) {
    state.bdInfoPlaylists = result.playlists;
  }
  if (result?.playlist) {
    state.bdInfoSelectedPlaylist = result.playlist;
  } else if (playlistOverride) {
    state.bdInfoSelectedPlaylist = playlistOverride;
  }
  if (!result?.ok) {
    state.bdInfoError = result?.error || 'Errore BDInfo.';
    state.bdInfoRaw = result?.text || '';
    state.bdInfoParsed = null;
    state.bdInfoStage = 'error';
    state.bdInfoStageText = state.bdInfoError;
  } else {
    state.bdInfoRaw = result?.text || '';
    state.bdInfoError = '';
    state.bdInfoParsed = null;
    state.bdInfoProgress = 1;
    state.bdInfoStage = 'done';
    state.bdInfoStageText = 'Completato';
    metadataTools.fillFromBdInfo?.();
  }
  state.bdInfoLoading = false;
  updateBdInfoProgressUi();
  logDebug('bdinfo result', {
    ok: Boolean(result?.ok),
    error: result?.error || '',
    bytes: state.bdInfoRaw ? state.bdInfoRaw.length : 0,
    path: discRoot,
    playlist: result?.playlist || playlistOverride || '',
    requestId: state.bdInfoRequestId || ''
  });
  schedulePreview();
}

async function scanSelectedBdInfoPlaylist() {
  if (!state.targetPath || !state.bdInfoSelectedPlaylist || state.bdInfoLoading) {
    return;
  }
  await fetchBdInfo(state.targetPath, state.bdInfoSelectedPlaylist);
}

// ===== Source scanning & load =====
async function loadPath(targetPath) {
  const scan = await window.api.scanPath(targetPath);
  if (!scan) {
    return;
  }

  resetAllInputs({ skipPreview: true });
  clearWizardRulesCheck();

  state.lastAutoSuggestKey = '';
  formatAskedForPath = '';
  sourceAskedForPath = '';
  state.targetPath = targetPath;
  state.kind = scan.kind;
  state.videoFiles = scan.videoFiles || [];
  state.mainVideo = scan.mainVideo;
  state.mediaInfo = scan.mediaInfo;
  state.bdInfoRaw = '';
  state.bdInfoParsed = null;
  state.bdInfoError = '';
  state.bdInfoLoading = false;
  state.bdInfoTarget = '';
  state.bdInfoProgress = 0;
  state.bdInfoStage = '';
  state.bdInfoStageText = '';
  state.bdInfoRequestId = '';
  state.bdInfoPlaylists = [];
  state.bdInfoSelectedPlaylist = '';
  state.bdInfoProgressTotal = 0;
  state.bdInfoProgressDone = 0;
  state.bdInfoShowAllPlaylists = false;
  state.metadata = null;
  state.screenshots = [];
  state.lastTorrentPath = '';
  state.episodeMap = {};
  state.lastTagSuggestion = '';
  state.trackerId = '';
  state.trackerName = '';
  state.trackerData = null;
  state.trackerMediaInfoText = '';
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

  setSelectedPath(targetPath);
  ui.resetSourceBtn.classList.remove('hidden');
  if (scan.mainVideo) {
    setScanHint('File analizzato:', getPathBaseName(scan.mainVideo));
  } else if (scan.kind === 'dir') {
    setScanHint('Cartella analizzata:', getPathBaseName(targetPath));
  } else {
    setScanHint('Nessun file analizzato.', '');
  }

  const settings = loadSettings();
  updateTagSuggestion(settings);
  updateTagOptions(settings);

  if (scan.mediaInfo?.error) {
    setMediaInfoBadgeVisible(false);
    setScanHint('Errore MediaInfo:', scan.mediaInfo.error);
  } else {
    setMediaInfoBadgeVisible(Boolean(scan.mainVideo));
  }

  if (scan.kind === 'dir') {
    ui.renameFolderCheckbox.disabled = false;
  } else {
    ui.renameFolderCheckbox.checked = false;
    ui.renameFolderCheckbox.disabled = true;
  }

  if (ui.renameFileCheckbox) {
    if (scan.kind === 'dir') {
      const discStructure = isDiscStructure();
      ui.renameFileCheckbox.disabled = discStructure;
      if (discStructure) {
        ui.renameFileCheckbox.checked = false;
      }
    } else {
      ui.renameFileCheckbox.disabled = false;
    }
  }

  if (scan.kind === 'dir' && isDiscStructure()) {
    loadBdInfoPlaylists(targetPath);
  }

  if (scan.kind === 'dir') {
    ui.typeSelect.value = ui.typeSelect.value.includes('anime') ? 'anime-season' : 'tv-season';
  }

  metadataTools.fillFromMediaInfo();
  await autoDetectFromPath();
  mkvTagger?.syncMetadata();
  mkvTagger?.syncTitle();
  schedulePreview();
}

// ===== Upload wizard integration =====
const uploadKit = createUploadKit({
  buildMediaInfoShort: metadataTools.buildMediaInfoShort,
  computeBaseName: renameTools.computeBaseName,
  getAudioOverrides: renameTools.getAudioOverrides,
  copyToClipboard,
  getFormState,
  getMissingRenameRequirements: renameTools.getMissingRenameRequirements,
  getPathBaseName,
  loadSettings,
  metadataTools,
  logDebug,
  openWizardStep: (step) => openUploadWizard(step),
  openConfirmModal,
  setHint,
  showToast,
  updateFfmpegHint,
  onUploadTitleChange: () => refreshMainUploadTitle()
});
uploadKit.initUploadKitEvents();

// ===== Titolo Upload (pagina principale) =====
function refreshMainUploadTitle() {
  if (!ui.mainUploadTitleInput) {
    return;
  }
  const { title, overridden } = uploadKit.buildUploadTitle();
  // Non sovrascrivere se l'utente sta editando direttamente il campo
  if (ui.mainUploadTitleInput.dataset.editing === 'true') {
    return;
  }
  ui.mainUploadTitleInput.value = title || '-';
  mkvTagger?.syncTitle();
  if (ui.mainUploadTitleHint) {
    ui.mainUploadTitleHint.textContent = overridden ? 'Titolo modificato manualmente.' : '';
  }
}

if (ui.copyMainUploadTitleBtn) {
  ui.copyMainUploadTitleBtn.addEventListener('click', () => {
    copyToClipboard(ui.mainUploadTitleInput?.value || '', 'Titolo copiato.');
  });
}

if (ui.editMainUploadTitleBtn && ui.mainUploadTitleInput) {
  ui.editMainUploadTitleBtn.addEventListener('click', () => {
    const isEditing = ui.mainUploadTitleInput.dataset.editing === 'true';
    if (!isEditing) {
      ui.mainUploadTitleInput.readOnly = false;
      ui.mainUploadTitleInput.dataset.editing = 'true';
      ui.mainUploadTitleInput.classList.add('editing');
      ui.editMainUploadTitleBtn.classList.add('editing');
      ui.editMainUploadTitleBtn.setAttribute('aria-label', 'Blocca titolo upload');
      ui.editMainUploadTitleBtn.title = 'Blocca titolo';
      ui.mainUploadTitleInput.focus();
      ui.mainUploadTitleInput.select();
      return;
    }
    ui.mainUploadTitleInput.readOnly = true;
    ui.mainUploadTitleInput.dataset.editing = 'false';
    ui.mainUploadTitleInput.classList.remove('editing');
    ui.editMainUploadTitleBtn.classList.remove('editing');
    ui.editMainUploadTitleBtn.setAttribute('aria-label', 'Modifica titolo upload');
    ui.editMainUploadTitleBtn.title = 'Modifica titolo';
    // Sincronizza override nell'upload-kit e aggiorna anche il campo nel wizard
    uploadKit.syncUploadTitleOverride(ui.mainUploadTitleInput.value);
    refreshMainUploadTitle();
  });
}

if (ui.mainUploadTitleInput) {
  ui.mainUploadTitleInput.addEventListener('input', () => {
    if (ui.mainUploadTitleInput.readOnly) {
      return;
    }
    uploadKit.syncUploadTitleOverride(ui.mainUploadTitleInput.value);
    if (ui.mainUploadTitleHint) {
      ui.mainUploadTitleHint.textContent = 'Titolo modificato manualmente.';
    }
  });
}

// ===== Event bindings =====
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

setupSourceDragDrop({ ui, showToast, loadPath });

if (ui.applyNameSuggestBtn) {
  ui.applyNameSuggestBtn.addEventListener('click', () => {
    // Reset flag manual su tutti i campi rilevabili automaticamente
    [
      ui.resolutionInput,
      ui.videoCodecInput,
      ui.audioCodecInput,
      ui.audioChannelsInput,
      ui.audioMetaInput,
      ui.languageTagInput,
      ui.formatSelect,
      ui.sourceInput,
      ui.serviceInput,
      ui.repackSelect
    ].forEach((input) => {
      if (input) {
        input.dataset.manual = 'false';
        input.dataset.auto = 'false';
      }
    });
    // Re-applica i dati MediaInfo (codec, risoluzione, audio, lingua)
    metadataTools.fillFromMediaInfo();
    // Forza re-apply suggerimenti formato/servizio/sorgente azzerando la chiave cache
    state.lastAutoSuggestKey = null;
    updateFormatServiceSuggest();
  });
}

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
    mkvTagger?.syncMetadata();
    mkvTagger?.syncTitle();
  }
});

ui.applyRenameBtn.addEventListener('click', async () => {
  if (!state.targetPath) {
    setHint(ui.renameHint, 'Seleziona un file o una cartella.');
    return;
  }
  if (state.kind === 'tracker') {
    setHint(ui.renameHint, 'In modalità tracker non vengono rinominati file o cartelle.');
    return;
  }

  const form = getFormState();
  const missing = renameTools.getMissingRenameRequirements(form);

  const { folderName, fileRenames } = renameTools.buildRenameTargets();
  if (!fileRenames.length && !folderName) {
    setHint(ui.renameHint, 'Inserisci i campi minimi per generare il nome.');
    return;
  }

  const renameFiles = ui.renameFileCheckbox.checked && !isDiscStructure();
  const renameFolder = state.kind === 'dir' && ui.renameFolderCheckbox.checked;
  const fileCount = renameFiles ? fileRenames.length : 0;
  const folderCount = renameFolder && folderName ? 1 : 0;
  const parts = [];
  if (folderCount > 0) {
    parts.push(`${folderCount} ${folderCount === 1 ? 'cartella' : 'cartelle'}`);
  }
  if (fileCount > 0) {
    parts.push(`${fileCount} file`);
  }
  const confirmMessage = `${missing.length ? `${missing.join('\n')}\n\n` : ''}Stai per rinominare ${
    parts.length ? parts.join(' e ') : '0 elementi'
  }. Confermi?`;
  const proceed = await openConfirmModal(confirmMessage);
  if (!proceed) {
    return;
  }

  const payload = {
    targetPath: state.targetPath,
    renameFiles,
    renameFolder,
    folderName: state.kind === 'dir' ? folderName : '',
    fileRenames
  };

  const result = await window.api.applyRename(payload);
  logDebug('applyRename result', result);
  if (result.ok) {
    setHint(ui.renameHint, 'Rinomina completata.');
    showToast('Rinomina completata.', 'success');
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

    const settings = loadSettings();
    const baseOutputDir = ui.torrentOutputInput?.value.trim() || '';
    const outputName = ui.torrentNameInput?.value.trim() || '';
    const isPrivate = settings.torrentPrivate !== false;
    const announce = getAnnounceUrlFromSettings(settings);
    let outputDir = '';
    if (baseOutputDir) {
      const safeTitle = outputName
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, '.')
        .replace(/\.+$/g, '') || 'job';
      const separator = baseOutputDir.includes('\\') ? '\\' : '/';
      const trimmed = baseOutputDir.replace(/[\\/]+$/, '');
      outputDir = `${trimmed}${separator}${safeTitle}`;
    }

    if (!announce) {
      setHint(ui.torrentHint, 'Imposta il PID/announce nelle Impostazioni.');
      return;
    }
    if (!baseOutputDir) {
      setHint(ui.torrentHint, 'Seleziona la cartella di output.');
      return;
    }
    if (!outputName) {
      setHint(ui.torrentHint, 'Inserisci un nome per il file .torrent.');
      return;
    }

    setHint(ui.torrentHint, 'Generazione in corso...');
    currentTorrentRequestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    resetTorrentLog();
    setTorrentGeneratorHint(settings.torrentMkbrrPath ? 'mkbrr' : 'node');
    setTorrentProgress(0);
    setTorrentStage('hashing');
    const payload = {
      targetPath: state.targetPath,
      announce,
      outputDir,
      outputName: 'BASE',
      private: isPrivate,
      requestId: currentTorrentRequestId,
      mkbrrPath: settings.torrentMkbrrPath || '',
      mkbrrWorkers: settings.torrentMkbrrWorkers
    };
    const result = await window.api.createTorrent(payload);
    logDebug('createTorrent result', result);
    if (result?.ok) {
      state.lastTorrentPath = result.outputPath || '';
      const updated = {
        ...settings,
        torrentOutputDir: baseOutputDir
      };
      saveSettings(updated);
      applySettingsToUI(updated);
      if (isSettingsOpen()) {
        refreshSettingsSnapshot();
      }
      const toastMessage = result.warning
        ? `Torrent creato. ${result.warning}`
        : 'Torrent creato.';
      showToast(toastMessage, 'warning');
      setHint(ui.torrentHint, `Creato: ${result.outputPath}`);
      setTorrentGeneratorHint(result.generator || (settings.torrentMkbrrPath ? 'mkbrr' : 'node'));
      setTorrentProgress(1);
      setTorrentStage('done');
      uploadKit.saveMediaInfoToJobDir?.();
    } else {
      setHint(ui.torrentHint, result?.error || 'Errore nella generazione.');
      resetTorrentProgress();
    }
  });
}

ui.openSettingsBtn.addEventListener('click', openSettings);
ui.closeSettingsBtn.addEventListener('click', requestCloseSettings);

// Health Check modal
ui.appHealth.addEventListener('click', () => openHealthCheckModal());
if (ui.closeHealthCheckBtn) {
  ui.closeHealthCheckBtn.addEventListener('click', () => {
    ui.healthCheckModal?.classList.add('hidden');
  });
}
if (ui.healthCheckModal) {
  ui.healthCheckModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      ui.healthCheckModal.classList.add('hidden');
    }
  });
}

if (ui.openAdvancedSettingsBtn) {
  ui.openAdvancedSettingsBtn.addEventListener('click', openAdvancedSettings);
}
if (ui.closeAdvancedSettingsBtn) {
  ui.closeAdvancedSettingsBtn.addEventListener('click', closeAdvancedSettings);
}
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
if (ui.advancedSettingsModal) {
  ui.advancedSettingsModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      closeAdvancedSettings();
    }
  });
  ui.advancedSettingsModal.addEventListener('input', (event) => {
    if (!event.target.closest('.advanced-settings-body')) {
      return;
    }
    updateSettingsDirtyFlag();
  });
  ui.advancedSettingsModal.addEventListener('change', (event) => {
    if (!event.target.closest('.advanced-settings-body')) {
      return;
    }
    updateSettingsDirtyFlag();
  });
}

if (ui.openUploadWizardBtn) {
  ui.openUploadWizardBtn.addEventListener('click', openUploadWizard);
}
if (ui.closeUploadWizardBtn) {
  ui.closeUploadWizardBtn.addEventListener('click', closeUploadWizard);
}
if (ui.uploadWizardModal) {
  ui.uploadWizardModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      closeUploadWizard();
    }
  });
}
if (ui.uploadWizardSteps) {
  ui.uploadWizardSteps.addEventListener('click', (event) => {
    const button = event.target.closest('.wizard-step-btn');
    if (!button) {
      return;
    }
    const step = Number(button.dataset.step);
    if (!Number.isFinite(step)) {
      return;
    }
    if (step > wizardStepIndex) {
      confirmWizardAdvance(step).then((proceed) => {
        if (!proceed) {
          return;
        }
        setWizardStep(step);
      });
      return;
    }
    setWizardStep(step);
  });
}
if (ui.wizardPrevBtn) {
  ui.wizardPrevBtn.addEventListener('click', () => {
    setWizardStep(Number(wizardStepIndex) - 1);
  });
}
if (ui.wizardNextBtn) {
  ui.wizardNextBtn.addEventListener('click', () => {
    const nextStep = Number(wizardStepIndex) + 1;
    confirmWizardAdvance(nextStep).then((proceed) => {
      if (!proceed) {
        return;
      }
      setWizardStep(nextStep);
    });
  });
}
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

if (ui.browseMkbrrPathBtn) {
  ui.browseMkbrrPathBtn.addEventListener('click', async () => {
    const filePath = await window.api.selectAnyFile?.();
    if (filePath && ui.settingsMkbrrPathInput) {
      ui.settingsMkbrrPathInput.value = filePath;
    }
  });
}

if (ui.browseBdinfoPathBtn) {
  ui.browseBdinfoPathBtn.addEventListener('click', async () => {
    const filePath = await window.api.selectAnyFile?.();
    if (filePath && ui.settingsBdinfoPathInput) {
      ui.settingsBdinfoPathInput.value = filePath;
    }
  });
}

if (ui.browseMkvpropeditPathBtn) {
  ui.browseMkvpropeditPathBtn.addEventListener('click', async () => {
    const filePath = await window.api.selectAnyFile?.();
    if (filePath && ui.settingsMkvpropeditPathInput) {
      ui.settingsMkvpropeditPathInput.value = filePath;
    }
  });
}

bindConfirmHandlers();
mkvTagger.bind();

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
    if (data.generator) {
      setTorrentGeneratorHint(data.generator);
    }
    if (data.logLine) {
      appendTorrentLog(data.logLine);
    }
  });
}

if (window.api?.onBdInfoProgress) {
  window.api.onBdInfoProgress((data) => {
    if (!data) {
      return;
    }
    if (data.requestId && state.bdInfoRequestId && data.requestId !== state.bdInfoRequestId) {
      return;
    }
    if (state.bdInfoTarget && data.targetPath && data.targetPath !== state.bdInfoTarget) {
      return;
    }
    if (typeof data.totalM2ts === 'number') {
      state.bdInfoProgressTotal = Math.max(0, data.totalM2ts);
    }
    if (typeof data.processedM2ts === 'number') {
      state.bdInfoProgressDone = Math.max(0, data.processedM2ts);
    }
    if (typeof data.progress === 'number') {
      state.bdInfoProgress = Math.max(0, Math.min(1, data.progress));
    } else if (state.bdInfoProgressTotal > 0 && Number.isFinite(state.bdInfoProgressDone)) {
      state.bdInfoProgress = Math.max(
        0,
        Math.min(1, state.bdInfoProgressDone / state.bdInfoProgressTotal)
      );
    }
    if (data.stage) {
      state.bdInfoStage = data.stage;
    }
    if (data.text) {
      state.bdInfoStageText = data.text;
    }
    updateBdInfoProgressUi();
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
if (ui.saveDebugBtn) {
  ui.saveDebugBtn.addEventListener('click', async () => {
    const content = debugState.buffer.length ? debugState.buffer.join('\n') : '';
    if (!content) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    await window.api?.saveFile({ defaultName: `shri-log-${stamp}.txt`, content });
  });
}
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
updateVideoCodecMenu();

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
  showToast('Impostazioni salvate.', 'success');
  refreshSettingsSnapshot();
});

if (ui.qbitTestBtn) {
  ui.qbitTestBtn.addEventListener('click', async () => {
    const settings = getSettings();
    if (!settings.qbitHost || !settings.qbitUsername || !settings.qbitPassword) {
      setHint(ui.qbitTestHint, 'Completa host, username e password.');
      showToast('Configura qBittorrent prima del test.', 'warning');
      return;
    }
    if (!window.api?.qbitTest) {
      showToast('Test qBittorrent non disponibile.', 'warning');
      return;
    }
    ui.qbitTestBtn.disabled = true;
    setHint(ui.qbitTestHint, 'Verifica in corso...');
    try {
      const result = await window.api.qbitTest({
        host: settings.qbitHost,
        port: settings.qbitPort,
        https: settings.qbitHttps,
        username: settings.qbitUsername,
        password: settings.qbitPassword
      });
      if (result?.ok) {
        const version = result.version ? ` (v${result.version})` : '';
        setHint(ui.qbitTestHint, `Connessione OK${version}.`);
        showToast(`qBittorrent OK${version}`, 'success');
      } else {
        const error = result?.error || 'Errore connessione.';
        setHint(ui.qbitTestHint, error);
        showToast(error, 'error');
      }
    } finally {
      ui.qbitTestBtn.disabled = false;
    }
  });
}

if (ui.transmissionTestBtn) {
  ui.transmissionTestBtn.addEventListener('click', async () => {
    const settings = getSettings();
    if (!settings.transmissionHost) {
      setHint(ui.transmissionTestHint, 'Completa host e porta.');
      showToast('Configura Transmission prima del test.', 'warning');
      return;
    }
    if (!window.api?.transmissionTest) {
      showToast('Test Transmission non disponibile.', 'warning');
      return;
    }
    ui.transmissionTestBtn.disabled = true;
    setHint(ui.transmissionTestHint, 'Verifica in corso...');
    try {
      const result = await window.api.transmissionTest({
        host: settings.transmissionHost,
        port: settings.transmissionPort,
        https: settings.transmissionHttps,
        username: settings.transmissionUsername,
        password: settings.transmissionPassword
      });
      if (result?.ok) {
        const version = result.version ? ` (v${result.version})` : '';
        setHint(ui.transmissionTestHint, `Connessione OK${version}.`);
        showToast(`Transmission OK${version}`, 'success');
      } else {
        const error = result?.error || 'Errore connessione.';
        setHint(ui.transmissionTestHint, error);
        showToast(error, 'error');
      }
    } finally {
      ui.transmissionTestBtn.disabled = false;
    }
  });
}

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

if (ui.qbitSavePathInput) {
  ui.qbitSavePathInput.addEventListener('input', () => {
    updateQbitMappingHint({ qbitSavePath: ui.qbitSavePathInput.value.trim() });
  });
}

if (ui.transmissionSavePathInput) {
  ui.transmissionSavePathInput.addEventListener('input', () => {
    updateQbitMappingHint({ torrentClient: 'transmission', transmissionSavePath: ui.transmissionSavePathInput.value.trim() });
  });
}

if (ui.multiEpisodeToggle) {
  ui.multiEpisodeToggle.addEventListener('change', () => {
    if (ui.multiEpisodeToggle.checked) {
      if (!ui.episodeTitleInput.dataset.manual || ui.episodeTitleInput.dataset.manual === 'false') {
        setInputAuto(ui.episodeTitleInput, '');
      }
    }
  });
}

if (ui.torrentClientSelect) {
  ui.torrentClientSelect.addEventListener('change', () => {
    const settings = getSettings();
    updateClientSections(settings);
    updateQbitMappingHint(settings);
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
  ui.multiEpisodeToggle,
  ui.imdbInput,
  ui.tvdbInput,
  ui.malInput
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
      logDebug?.('format change: reset video codec', {
        format: ui.formatSelect.value || '',
        prevVideoCodec: ui.videoCodecInput?.value || ''
      });
      resetDropdown(ui.videoCodecInput, ui.videoCodecSelectBtn, 'Seleziona codec');
      metadataTools.fillFromMediaInfo();
      if (
        state.kind === 'tracker' &&
        state.trackerVideoCodecFallback &&
        !ui.videoCodecInput.value
      ) {
        if (ui.videoCodecSelectBtn) {
          setDropdownAuto(
            ui.videoCodecInput,
            ui.videoCodecSelectBtn,
            state.trackerVideoCodecFallback,
            state.trackerVideoCodecFallback
          );
        } else {
          setInputAuto(ui.videoCodecInput, state.trackerVideoCodecFallback);
        }
      }
      logDebug?.('format change: after MediaInfo fill', {
        videoCodec: ui.videoCodecInput?.value || ''
      });
    }
    if (element === ui.formatSelect) {
      updateVideoCodecMenu();
    }
    schedulePreview();
  });
});

// ===== App bootstrap =====
const initialSettings = loadSettings();
applySettingsToUI(initialSettings);
applyTheme(loadTheme());
updateAutoDetectControls();
updateVisibility();
updateVideoCodecMenu();
refreshPreview();
updateAppVersionLabel();
checkForAppUpdate();

logDebug('Renderer loaded');
