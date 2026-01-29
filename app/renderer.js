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
  getGeneralTrack,
  getAudioTracks,
  getTrackLang,
  getTrackValue,
  getVideoTrack,
  hasEncodingSignature
} from './renderer/media-utils.js';
import { createUploadKit } from './renderer/upload-kit.js';
import { createMetadataTools } from './renderer/metadata.js';
import { createRenameTools } from './renderer/rename.js';
import { getParentPath, getPathBaseName, stripExtension } from './renderer/path-utils.js';
import { createLogger } from './renderer/logger.js';
import { createThemeTools } from './renderer/theme.js';
import { createFeedbackTools } from './renderer/feedback.js';
import { createServiceTagTools } from './renderer/service-tags.js';
import { createSettingsTools } from './renderer/settings-tools.js';
import { createRulesCheckTools } from './renderer/rules-check.js';

let previewTimer = null;
let currentTorrentRequestId = null;
let settingsSnapshot = '';
let settingsDirty = false;
let wizardStepIndex = 0;
let torrentGenerator = 'node';
let uaRunning = false;
let uaLogBufferRaw = '';
let uaLogBufferHtml = '';
let uaUpdateRunning = false;
let uaUpdateLogBufferRaw = '';
let uaUpdateLogBufferHtml = '';
let uaUpdateSummary = null;
const torrentLogLines = [];
const WIZARD_STEP_COUNT = 3;

function applyUploadMode(mode, persist = false) {
  const normalized = mode === 'ua' ? 'ua' : 'integrated';
  document.body.dataset.uploadMode = normalized;
  if (ui.uploadModeToggle) {
    ui.uploadModeToggle.textContent =
      normalized === 'ua' ? 'Modalita Upload Assistant' : 'Modalita Integrata';
  }
  if (ui.openUploadAssistantBtn) {
    ui.openUploadAssistantBtn.classList.toggle('push-right', normalized === 'ua');
  }
  if (ui.reopenLastUploadBtn) {
    ui.reopenLastUploadBtn.classList.toggle('push-right', normalized === 'integrated');
  }
  if (persist) {
    const settings = loadSettings();
    settings.uploadMode = normalized;
    saveSettings(settings);
    updateAppHealthStatus(settings);
    updateSettingsVisibility(settings);
  } else {
    const settings = loadSettings();
    updateAppHealthStatus(settings);
    updateSettingsVisibility(settings);
  }
  if (normalized === 'ua') {
    checkUaVersion();
  }
}
const LANGUAGE_CODES_PATTERN = Array.from(new Set([...Object.values(LANG_MAP), 'MULTI']))
  .filter(Boolean)
  .map((value) => String(value).toUpperCase())
  .join('|');
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

function stripConfigLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return '';
  }
  return line;
}

function extractConfigBlock(content, key) {
  const marker = `"${key}"`;
  const start = content.indexOf(marker);
  if (start === -1) {
    return '';
  }
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) {
    return '';
  }
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    const char = content[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(braceStart + 1, i);
      }
    }
  }
  return '';
}

function extractConfigValue(block, key) {
  const regex = new RegExp(`"${key}"\\s*:\\s*([^,\\n]+)`);
  const match = regex.exec(block);
  if (!match) {
    return '';
  }
  let value = match[1].trim().replace(/,$/, '');
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (/^(True|False)$/i.test(value)) {
    return value.toLowerCase() === 'true';
  }
  return value;
}

function extractConfigList(block, key) {
  const regex = new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`);
  const match = regex.exec(block);
  if (!match) {
    return [];
  }
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function isPlaceholderAnnounce(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return true;
  }
  const lower = raw.toLowerCase();
  if (lower.includes('<') || lower.includes('>')) {
    return true;
  }
  if (
    lower.includes('customannounceurl') ||
    lower.includes('custom_announce_url') ||
    lower.includes('get from') ||
    lower.includes('yourpasskey') ||
    lower.includes('passkeyhere') ||
    lower.includes('insertyourpasskeyhere')
  ) {
    return true;
  }
  const passkeyMatch = /passkey=([^&]+)/i.exec(raw);
  if (passkeyMatch) {
    const token = passkeyMatch[1];
    if (!token || /passkey|your|insert|here/i.test(token) || token.length < 6) {
      return true;
    }
    return false;
  }
  const pathToken = /\/([a-z0-9]{6,})\/announce/i.exec(raw);
  if (pathToken) {
    return false;
  }
  if (/\/announce\/?$/i.test(raw)) {
    return true;
  }
  return false;
}

function isTrackerConfigured(entry) {
  const apiKey = String(entry.api_key || '').trim();
  if (apiKey) {
    return true;
  }
  const announce = String(entry.announce_url || '').trim();
  if (announce && !isPlaceholderAnnounce(announce)) {
    return true;
  }
  return false;
}

function extractTrackerBlocks(section) {
  const cleaned = section
    .split('\n')
    .map(stripConfigLine)
    .filter(Boolean)
    .join('\n');
  const blocks = {};
  const trackerRegex = /"([A-Za-z0-9_]+)"\s*:\s*\{/g;
  let match = trackerRegex.exec(cleaned);
  while (match) {
    const name = match[1];
    const braceStart = cleaned.indexOf('{', match.index);
    let depth = 0;
    let end = braceStart;
    for (let i = braceStart; i < cleaned.length; i += 1) {
      const char = cleaned[i];
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    blocks[name] = cleaned.slice(braceStart + 1, end);
    match = trackerRegex.exec(cleaned);
  }
  return blocks;
}

function parseUploadAssistantConfig(content) {
  const cleaned = content
    .split('\n')
    .map(stripConfigLine)
    .filter(Boolean)
    .join('\n');
  const defaultsBlock = extractConfigBlock(cleaned, 'DEFAULT');
  const trackersBlock = extractConfigBlock(cleaned, 'TRACKERS');
  const clientsBlock = extractConfigBlock(cleaned, 'TORRENT_CLIENTS');
  const trackerBlocks = trackersBlock ? extractTrackerBlocks(trackersBlock) : {};
  const clientBlocks = clientsBlock ? extractTrackerBlocks(clientsBlock) : {};

  return {
    defaults: {
      tmdb_api: extractConfigValue(defaultsBlock, 'tmdb_api'),
      btn_api: extractConfigValue(defaultsBlock, 'btn_api'),
      img_host_1: extractConfigValue(defaultsBlock, 'img_host_1'),
      img_host_2: extractConfigValue(defaultsBlock, 'img_host_2'),
      imgbb_api: extractConfigValue(defaultsBlock, 'imgbb_api'),
      ptscreens_api: extractConfigValue(defaultsBlock, 'ptscreens_api'),
      screens: extractConfigValue(defaultsBlock, 'screens'),
      min_successful_image_uploads: extractConfigValue(defaultsBlock, 'min_successful_image_uploads'),
      tone_map: extractConfigValue(defaultsBlock, 'tone_map'),
      default_torrent_client: extractConfigValue(defaultsBlock, 'default_torrent_client'),
      injecting_client_list: extractConfigList(defaultsBlock, 'injecting_client_list')
    },
    trackers: {
      default_trackers: extractConfigValue(trackersBlock, 'default_trackers'),
      entries: Object.entries(trackerBlocks).map(([name, block]) => ({
        name,
        api_key: extractConfigValue(block, 'api_key'),
        announce_url:
          extractConfigValue(block, 'announce_url') || extractConfigValue(block, 'my_announce_url'),
        anon: extractConfigValue(block, 'anon'),
        use_italian_title: extractConfigValue(block, 'use_italian_title')
      }))
    },
    clients: {
      names: Object.keys(clientBlocks),
      default_client: extractConfigValue(defaultsBlock, 'default_torrent_client')
    }
  };
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
  } else if (clamped === 1) {
    prepareTorrentStep();
  } else if (clamped === 2) {
    uploadKit?.prepareUploadKitStep?.();
  }
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

function openUploadAssistantModal() {
  if (!ui.uploadAssistantModal) {
    return;
  }
  if (!state.targetPath) {
    showToast('Carica un file o una cartella prima di avviare Upload Assistant.', 'warning');
    return;
  }
  const form = getFormState();
  updateUaServiceOptions();
  updateRulesCheckForTargets(form, {
    folderBlock: ui.uaRulesFolderBlock,
    folderLabel: ui.uaRulesFolderLabel,
    folderPath: ui.uaRulesFolderPath,
    folderBadges: ui.uaRulesFolderBadges,
    folderHint: ui.uaRulesFolderHint,
    fileBlock: ui.uaRulesFileBlock,
    fileLabel: ui.uaRulesFileLabel,
    filePath: ui.uaRulesFilePath,
    fileBadges: ui.uaRulesFileBadges,
    fileHint: ui.uaRulesFileHint,
    fileNote: ui.uaRulesFileNote
  });
  if (ui.uaRulesFolderBlock) {
    const showFolder = state.kind === 'dir';
    ui.uaRulesFolderBlock.classList.toggle('hidden', !showFolder);
  }
  if (ui.uaConsoleLog) {
    ui.uaConsoleLog.textContent = '';
    uaLogBufferRaw = '';
    uaLogBufferHtml = '';
  }
  if (ui.uaStatus) {
    ui.uaStatus.textContent = '';
  }
  if (ui.uaInput) {
    ui.uaInput.value = '';
  }
  ui.uploadAssistantModal.classList.remove('hidden');
  updateUaControlsState();
}

function closeUploadAssistantModal() {
  if (!ui.uploadAssistantModal) {
    return;
  }
  ui.uploadAssistantModal.classList.add('hidden');
}

const UA_UPDATE_COMMANDS = [
  'git fetch --all --tags',
  'git pull',
  'python -m pip install --user -U -r requirements.txt'
];

function buildUaUpdateCommands() {
  return UA_UPDATE_COMMANDS.join('\n');
}

function resetUaUpdateSummary() {
  uaUpdateSummary = {
    git: { updated: false, noop: false, error: false },
    pip: { updated: false, noop: false, error: false }
  };
}

function updateUaUpdateSummaryFromLine(line) {
  if (!uaUpdateSummary) {
    resetUaUpdateSummary();
  }
  const raw = String(line || '').trim();
  if (!raw) {
    return;
  }
  const lower = raw.toLowerCase();

  if (lower.includes('already up to date')) {
    uaUpdateSummary.git.noop = true;
  }
  if (/^updating\s+[0-9a-f]+\.\.[0-9a-f]+/i.test(raw) || lower.includes('fast-forward')) {
    uaUpdateSummary.git.updated = true;
  }
  if (lower.includes('files changed') || lower.includes('changed,') || lower.includes('insertion')) {
    uaUpdateSummary.git.updated = true;
  }
  if (lower.startsWith('fatal:') || lower.includes('fatal:')) {
    uaUpdateSummary.git.error = true;
  }

  if (lower.includes('requirement already satisfied')) {
    uaUpdateSummary.pip.noop = true;
  }
  if (lower.includes('successfully installed')) {
    uaUpdateSummary.pip.updated = true;
  }
  if (lower.startsWith('error:') || lower.includes('error:') || lower.includes('could not')) {
    uaUpdateSummary.pip.error = true;
  }
}

function openUaUpdateModal() {
  if (!ui.uaUpdateModal) {
    return;
  }
  if (ui.uaUpdateCommands) {
    ui.uaUpdateCommands.textContent = buildUaUpdateCommands();
  }
  if (ui.uaUpdateConsole) {
    ui.uaUpdateConsole.textContent = '';
    uaUpdateLogBufferRaw = '';
    uaUpdateLogBufferHtml = '';
    resetUaUpdateSummary();
  }
  if (ui.uaUpdateStatus) {
    ui.uaUpdateStatus.textContent = '';
  }
  if (ui.uaUpdateInput) {
    ui.uaUpdateInput.value = '';
  }
  ui.uaUpdateModal.classList.remove('hidden');
  updateUaUpdateControlsState();
}

function closeUaUpdateModal() {
  if (!ui.uaUpdateModal) {
    return;
  }
  ui.uaUpdateModal.classList.add('hidden');
}

async function startUaUpdate() {
  if (!window.api?.uaUpdateStart) {
    showToast('Aggiornamento UA non disponibile.', 'warning');
    return;
  }
  const baseDir = String(loadSettings().uploadAssistantPath || '').trim();
  if (!baseDir) {
    showToast('Percorso Upload Assistant non impostato.', 'warning');
    return;
  }
  if (ui.uaUpdateConsole) {
    ui.uaUpdateConsole.textContent = '';
    uaUpdateLogBufferRaw = '';
    uaUpdateLogBufferHtml = '';
    resetUaUpdateSummary();
  }
  uaUpdateRunning = true;
  updateUaUpdateControlsState();
  setUaUpdateStatus('Aggiornamento in corso...');
  const result = await window.api.uaUpdateStart({
    baseDir,
    commands: [...UA_UPDATE_COMMANDS]
  });
  if (!result?.ok) {
    uaUpdateRunning = false;
    updateUaUpdateControlsState();
    setUaUpdateStatus(result?.error || 'Avvio aggiornamento fallito.');
    showToast(result?.error || 'Aggiornamento non avviato.', 'error');
  }
}

async function sendUaUpdateInput() {
  if (!window.api?.uaUpdateSendInput) {
    return;
  }
  if (!uaUpdateRunning) {
    return;
  }
  const text = ui.uaUpdateInput?.value.trim();
  if (!text) {
    return;
  }
  const result = await window.api.uaUpdateSendInput(text);
  if (!result?.ok) {
    showToast(result?.error || 'Input non inviato.', 'error');
    return;
  }
  if (ui.uaUpdateInput) {
    ui.uaUpdateInput.value = '';
  }
}

async function openUaConfigGeneratorTerminal() {
  if (!window.api?.uaOpenUpdateTerminal) {
    return;
  }
  const baseDir = String(loadSettings().uploadAssistantPath || '').trim();
  if (!baseDir) {
    showToast('Percorso Upload Assistant non impostato.', 'warning');
    return;
  }
  const result = await window.api.uaOpenUpdateTerminal({
    baseDir,
    command: 'python config-generator.py'
  });
  if (!result?.ok) {
    showToast(result?.error || 'Impossibile aprire il terminale.', 'error');
    return;
  }
  showToast('Terminale config-generator aperto.', 'success');
}

function makeUaHealthBadge(text, tone) {
  const badge = document.createElement('span');
  badge.className = `ua-health-badge ${tone || ''}`.trim();
  badge.textContent = text;
  return badge;
}

function addUaHealthRow(container, label, value) {
  const row = document.createElement('div');
  row.className = 'ua-health-row';
  const name = document.createElement('span');
  name.className = 'label';
  name.textContent = label;
  row.appendChild(name);
  if (value instanceof HTMLElement) {
    row.appendChild(value);
  } else {
    const val = document.createElement('span');
    val.className = 'value';
    val.textContent = value || '—';
    row.appendChild(val);
  }
  container.appendChild(row);
}

function renderUaHealthCard(title, rows) {
  const card = document.createElement('div');
  card.className = 'ua-health-card';
  const heading = document.createElement('h4');
  heading.textContent = title;
  card.appendChild(heading);
  const list = document.createElement('div');
  list.className = 'ua-health-list';
  rows.forEach((row) => addUaHealthRow(list, row.label, row.value));
  card.appendChild(list);
  return card;
}

function renderUaHealthDetails(parsed) {
  if (!ui.uaHealthContent) {
    return;
  }
  ui.uaHealthContent.innerHTML = '';

  const defaults = parsed.defaults || {};
  const trackers = parsed.trackers || {};
  const clientNames = parsed.clients?.names || [];

  const trackersValue = trackers.default_trackers || '—';
  const trackerEntries = Array.isArray(trackers.entries) ? trackers.entries : [];
  const configuredTrackers = trackerEntries.filter((entry) => isTrackerConfigured(entry));
  const trackerSummary = configuredTrackers.length
    ? configuredTrackers.map((entry) => entry.name).join(', ')
    : 'Nessun tracker configurato';

  ui.uaHealthContent.appendChild(
    renderUaHealthCard('Tracker', [
      { label: 'Default', value: trackersValue },
      { label: 'Configurati (API/announce)', value: trackerSummary }
    ])
  );

  const trackerListCard = document.createElement('div');
  trackerListCard.className = 'ua-health-card';
  const trackerTitle = document.createElement('h4');
  trackerTitle.textContent = 'Dettaglio tracker';
  trackerListCard.appendChild(trackerTitle);
  const trackerList = document.createElement('div');
  trackerList.className = 'ua-health-list';
  if (trackerEntries.length) {
    trackerEntries.forEach((entry) => {
      const rowLabel = `${entry.name} · API key`;
      const hasKey = Boolean(entry.api_key);
      const badge = makeUaHealthBadge(hasKey ? 'Presente' : 'Manca', hasKey ? 'ok' : 'bad');
      addUaHealthRow(trackerList, rowLabel, badge);
      const announce = entry.announce_url;
      const announceOk = Boolean(announce && !isPlaceholderAnnounce(announce));
      addUaHealthRow(
        trackerList,
        `${entry.name} · Announce`,
        makeUaHealthBadge(announceOk ? 'Presente' : 'Manca', announceOk ? 'ok' : 'warn')
      );
      addUaHealthRow(
        trackerList,
        `${entry.name} · Anon`,
        makeUaHealthBadge(entry.anon ? 'Attivo' : 'Off', entry.anon ? 'warn' : '')
      );
      addUaHealthRow(
        trackerList,
        `${entry.name} · Titolo ITA`,
        makeUaHealthBadge(entry.use_italian_title ? 'Si' : 'No', entry.use_italian_title ? 'ok' : '')
      );
    });
  } else {
    addUaHealthRow(trackerList, '—', 'Nessun tracker');
  }
  trackerListCard.appendChild(trackerList);
  ui.uaHealthContent.appendChild(trackerListCard);

  ui.uaHealthContent.appendChild(
    renderUaHealthCard('Metadata & immagini', [
      {
        label: 'TMDB API',
        value: defaults.tmdb_api
          ? makeUaHealthBadge(`OK (${formatMasked(defaults.tmdb_api)})`, 'ok')
          : makeUaHealthBadge('Manca', 'bad')
      },
      {
        label: 'BTN API',
        value: defaults.btn_api
          ? makeUaHealthBadge(`OK (${formatMasked(defaults.btn_api)})`, 'ok')
          : makeUaHealthBadge('Non configurata', 'warn')
      },
      {
        label: 'Image host',
        value: [defaults.img_host_1, defaults.img_host_2].filter(Boolean).join(' · ') || '—'
      },
      {
        label: 'IMGBB key',
        value: defaults.imgbb_api
          ? makeUaHealthBadge(`OK (${formatMasked(defaults.imgbb_api)})`, 'ok')
          : makeUaHealthBadge('Manca', 'warn')
      },
      {
        label: 'PTSscreens key',
        value: defaults.ptscreens_api
          ? makeUaHealthBadge(`OK (${formatMasked(defaults.ptscreens_api)})`, 'ok')
          : makeUaHealthBadge('Manca', 'warn')
      }
    ])
  );

  ui.uaHealthContent.appendChild(
    renderUaHealthCard('Screenshot', [
      { label: 'Screens', value: defaults.screens || '—' },
      {
        label: 'Min success',
        value: defaults.min_successful_image_uploads || '—'
      },
      {
        label: 'Tonemap',
        value: defaults.tone_map ? makeUaHealthBadge('Attivo', 'ok') : makeUaHealthBadge('Off', '')
      }
    ])
  );

  ui.uaHealthContent.appendChild(
    renderUaHealthCard('Client torrent', [
      { label: 'Default', value: defaults.default_torrent_client || '—' },
      {
        label: 'Inject list',
        value: defaults.injecting_client_list?.length
          ? defaults.injecting_client_list.join(', ')
          : 'Usa default'
      },
      {
        label: 'Client presenti',
        value: clientNames.length ? clientNames.join(', ') : 'Nessuno'
      }
    ])
  );
}

async function refreshUaHealthModal() {
  if (!ui.uaHealthModal) {
    return;
  }
  const settings = loadSettings();
  const baseDir = String(settings.uploadAssistantPath || '').trim();
  if (ui.uaHealthPath) {
    ui.uaHealthPath.textContent = baseDir || 'Non configurato';
    ui.uaHealthPath.dataset.path = baseDir || '';
  }
  if (ui.uaHealthConfigPath) {
    ui.uaHealthConfigPath.textContent = baseDir ? `${baseDir}\\data\\config.py` : '-';
    ui.uaHealthConfigPath.dataset.path = baseDir ? `${baseDir}\\data\\config.py` : '';
  }
  if (!baseDir) {
    if (ui.uaHealthContent) {
      ui.uaHealthContent.innerHTML = '';
      ui.uaHealthContent.appendChild(
        renderUaHealthCard('Config Upload Assistant', [
          { label: 'Stato', value: makeUaHealthBadge('Percorso non configurato', 'warn') }
        ])
      );
    }
    return;
  }
  if (!window.api?.uaReadConfig) {
    return;
  }
  const result = await window.api.uaReadConfig({ baseDir });
  if (!result?.ok) {
    if (ui.uaHealthContent) {
      ui.uaHealthContent.innerHTML = '';
      ui.uaHealthContent.appendChild(
        renderUaHealthCard('Config Upload Assistant', [
          {
            label: 'Errore',
            value: makeUaHealthBadge(result?.error || 'Impossibile leggere config.py.', 'bad')
          }
        ])
      );
    }
    return;
  }
  if (ui.uaHealthConfigPath && result.configPath) {
    ui.uaHealthConfigPath.textContent = result.configPath;
  }
  const parsed = parseUploadAssistantConfig(result.content || '');
  renderUaHealthDetails(parsed);
}

function openUaHealthModal() {
  if (!ui.uaHealthModal) {
    return;
  }
  ui.uaHealthModal.classList.remove('hidden');
  refreshUaHealthModal();
}

function closeUaHealthModal() {
  if (!ui.uaHealthModal) {
    return;
  }
  ui.uaHealthModal.classList.add('hidden');
}

function setUaUpdateAvailability(available) {
  if (!ui.uaHealthUpdateBtn) {
    return;
  }
  ui.uaHealthUpdateBtn.disabled = !available;
  ui.uaHealthUpdateBtn.dataset.mode = available ? 'run' : 'disabled';
  ui.uaHealthUpdateBtn.textContent = 'Avvia aggiornamento';
  if (ui.uaHealthUpdateHint) {
    ui.uaHealthUpdateHint.classList.toggle('hidden', Boolean(available));
  }
}

async function checkUaVersion() {
  if (!window.api?.uaCheckVersion) {
    return;
  }
  const settings = loadSettings();
  const baseDir = String(settings.uploadAssistantPath || '').trim();
  if (!baseDir) {
    if (ui.uaHealthVersion) {
      ui.uaHealthVersion.textContent = 'Percorso Upload Assistant non configurato.';
    }
    setUaUpdateAvailability(false);
    setUaUpdateAvailable(null);
    updateAppHealthStatus(settings);
    return;
  }
  if (ui.uaHealthVersion) {
    ui.uaHealthVersion.textContent = 'Verifica aggiornamenti in corso...';
  }
  setUaUpdateAvailability(false);
  setUaUpdateAvailable(null);
  updateAppHealthStatus(settings);
  const result = await window.api.uaCheckVersion({ baseDir });
  if (!ui.uaHealthVersion) {
    return;
  }
  if (!result?.ok) {
    ui.uaHealthVersion.textContent = result?.error || 'Verifica non disponibile.';
    setUaUpdateAvailability(false);
    setUaUpdateAvailable(null);
    updateAppHealthStatus(settings);
    return;
  }
  const parts = [];
  if (result.tag) {
    parts.push(`Tag: ${result.tag}`);
  }
  if (result.branch) {
    parts.push(`Branch: ${result.branch}`);
  }
  if (result.lastCommit) {
    parts.push(`Ultimo commit: ${result.lastCommit}`);
  }
  if (typeof result.behindCount === 'number') {
    parts.push(
      result.behindCount > 0
        ? `Aggiornamento disponibile (${result.behindCount} commit)`
        : 'Aggiornato'
    );
    setUaUpdateAvailability(result.behindCount > 0);
    setUaUpdateAvailable(result.behindCount > 0);
    updateAppHealthStatus(settings);
  } else if (result.fetchError) {
    parts.push(`Fetch fallito: ${result.fetchError}`);
    setUaUpdateAvailability(false);
    setUaUpdateAvailable(null);
    updateAppHealthStatus(settings);
  }
  ui.uaHealthVersion.textContent = parts.join(' · ') || 'Verifica completata.';
}

function getUploadAssistantTargetPath() {
  if (state.kind === 'dir') {
    return state.targetPath || '';
  }
  return state.mainVideo || state.targetPath || '';
}

function updateUaControlsState() {
  if (ui.uaTagInput) {
    ui.uaTagInput.disabled = !ui.uaTagToggle?.checked;
  }
  if (ui.uaScreensInput) {
    ui.uaScreensInput.disabled = !ui.uaScreensToggle?.checked;
  }
  if (ui.uaServiceBtn) {
    ui.uaServiceBtn.disabled = !ui.uaServiceToggle?.checked;
  }
  if (ui.uaInput) {
    ui.uaInput.disabled = !uaRunning;
  }
  if (ui.uaSendBtn) {
    ui.uaSendBtn.disabled = !uaRunning;
  }
  if (ui.uaStartBtn) {
    ui.uaStartBtn.disabled = uaRunning;
  }
  if (ui.uaStopBtn) {
    ui.uaStopBtn.disabled = !uaRunning;
  }
}

function updateUaServiceOptions() {
  if (!ui.uaServiceMenu || !ui.uaServiceBtn || !ui.uaServiceInput) {
    return;
  }
  const settings = loadSettings();
  const options = buildServiceOptions(settings);
  const current = ui.uaServiceInput.value;
  ui.uaServiceMenu.innerHTML = '';

  const blank = document.createElement('button');
  blank.type = 'button';
  blank.className = 'dropdown-item';
  blank.dataset.value = '';
  blank.textContent = 'Seleziona servizio';
  ui.uaServiceMenu.appendChild(blank);

  for (const option of options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dropdown-item';
    item.dataset.value = option.code;
    item.textContent = `${option.label} (${option.code})`;
    ui.uaServiceMenu.appendChild(item);
  }

  const currentOption = options.find((option) => option.code === current);
  if (currentOption) {
    ui.uaServiceInput.value = current;
    ui.uaServiceBtn.textContent = `${currentOption.label} (${currentOption.code})`;
  } else {
    ui.uaServiceInput.value = '';
    ui.uaServiceBtn.textContent = 'Seleziona servizio';
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightUaLine(line) {
  const raw = String(line || '');
  const trim = raw.trim();
  const linkifyUrl = (url) => {
    const safeUrl = escapeHtml(url);
    return `<a class="ua-hl-link" href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`;
  };
  const formatKeyNumber = (label, value) =>
    `${escapeHtml(label)} <span class="ua-hl-info">${escapeHtml(value)}</span>`;
  const formatKeyValue = (label, value, valueClass = 'ua-hl-success') =>
    `${escapeHtml(label)} <span class="${valueClass}">${escapeHtml(value)}</span>`;

  if (/^DEBUG:\s*True\s*-\s*Will not actually upload!/i.test(trim)) {
    return `<span class="ua-hl-error">${escapeHtml(raw)}</span>`;
  }
  if (/^Upload process interrupted!/i.test(trim)) {
    return `<span class="ua-hl-error">${escapeHtml(raw)}</span>`;
  }
  if (/^An unexpected error occurred:/i.test(trim)) {
    return `<span class="ua-hl-error">${escapeHtml(raw)}</span>`;
  }

  const nameMatch = trim.match(/^Name:\s*(.+)$/i);
  if (nameMatch) {
    return formatKeyValue('Name:', nameMatch[1], 'ua-hl-warn');
  }

  if (/^Screenshots information:/i.test(trim)) {
    return `<span class="ua-hl-info">${escapeHtml(raw)}</span>`;
  }
  const numberLineMatch =
    trim.match(/^(Screenshots|Total Frames|Start frame|End frame|Usable frames|frame interval):\s*(\d+)$/i);
  if (numberLineMatch) {
    return formatKeyNumber(`${numberLineMatch[1]}:`, numberLineMatch[2]);
  }
  if (/^Chosen Frames$/i.test(trim)) {
    return `<span class="ua-hl-info">${escapeHtml(raw)}</span>`;
  }
  if (/^\[\s*\d/.test(trim)) {
    return escapeHtml(raw).replace(/\d+/g, (value) => `<span class="ua-hl-info">${value}</span>`);
  }

  const processingMatch = trim.match(/^Processing file:\s*(.+)$/i);
  if (processingMatch) {
    return formatKeyValue('Processing file:', processingMatch[1], 'ua-hl-info');
  }
  const ffmpegMatch = trim.match(/^FFmpeg command:\s*(.+)$/i);
  if (ffmpegMatch) {
    return formatKeyValue('FFmpeg command:', ffmpegMatch[1], 'ua-hl-warn');
  }

  const urlMatch = raw.match(/^(TMDB|IMDB|TVDB|TVMaze):\s*(https?:\/\/\S+)/i);
  if (urlMatch) {
    const label = escapeHtml(urlMatch[1].toUpperCase());
    return `${label}: ${linkifyUrl(urlMatch[2])}`;
  }
  if (/^https?:\/\/\S+/i.test(raw)) {
    return `<span class="ua-hl-success">${linkifyUrl(raw)}</span>`;
  }
  if (/is this correct\?\s*y\/n/i.test(raw)) {
    return `<span class="ua-hl-success">${escapeHtml(raw)}</span>`;
  }
  if (/enter\s+'y'\s+to\s+upload/i.test(raw)) {
    return `<span class="ua-hl-success">${escapeHtml(raw)}</span>`;
  }
  if (/all tracker uploads processed/i.test(raw)) {
    return `<span class="ua-hl-success">${escapeHtml(raw)}</span>`;
  }
  if (/processing uploads to trackers/i.test(raw)) {
    return `<span class="ua-hl-warn">${escapeHtml(raw)}</span>`;
  }
  if (/hashing/i.test(raw)) {
    return `<span class="ua-hl-info">${escapeHtml(raw)}</span>`;
  }
  const escaped = escapeHtml(raw);
  return escaped.replace(/https?:\/\/\S+/gi, (url) => linkifyUrl(url));
}

function highlightUaChunk(chunk) {
  return String(chunk || '')
    .split('\n')
    .map((line) => highlightUaLine(line))
    .join('\n');
}

function ansiToHtml(text) {
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let result = '';
  let lastIndex = 0;
  let currentClass = '';
  let match;

  const applyCodes = (codeText) => {
    if (!codeText) {
      currentClass = '';
      return;
    }
    const codes = codeText.split(';').map((value) => parseInt(value, 10)).filter(Number.isFinite);
    if (!codes.length) {
      currentClass = '';
      return;
    }
    for (const code of codes) {
      if (code === 0) {
        currentClass = '';
      } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
        currentClass = `ansi-fg-${code}`;
      }
    }
  };

  while ((match = ansiRegex.exec(text)) !== null) {
    const chunk = text.slice(lastIndex, match.index);
    if (chunk) {
      const escaped = currentClass ? escapeHtml(chunk) : highlightUaChunk(chunk);
      result += currentClass ? `<span class="${currentClass}">${escaped}</span>` : escaped;
    }
    applyCodes(match[1]);
    lastIndex = ansiRegex.lastIndex;
  }

  const tail = text.slice(lastIndex);
  if (tail) {
    const escaped = currentClass ? escapeHtml(tail) : highlightUaChunk(tail);
    result += currentClass ? `<span class="${currentClass}">${escaped}</span>` : escaped;
  }
  return result;
}

function appendUaLog(text) {
  if (!ui.uaConsoleLog) {
    return;
  }
  uaLogBufferRaw += text;
  uaLogBufferHtml += ansiToHtml(text);
  ui.uaConsoleLog.innerHTML = uaLogBufferHtml;
  ui.uaConsoleLog.scrollTop = ui.uaConsoleLog.scrollHeight;
}

function appendUaUpdateLog(text) {
  if (!ui.uaUpdateConsole) {
    return;
  }
  String(text || '')
    .split(/\r?\n/)
    .forEach((line) => updateUaUpdateSummaryFromLine(line));
  uaUpdateLogBufferRaw += text;
  uaUpdateLogBufferHtml += ansiToHtml(text);
  ui.uaUpdateConsole.innerHTML = uaUpdateLogBufferHtml;
  ui.uaUpdateConsole.scrollTop = ui.uaUpdateConsole.scrollHeight;
}

function appendUaUpdateSystemLine(text, tone = 'info') {
  if (!ui.uaUpdateConsole) {
    return;
  }
  const className =
    tone === 'success'
      ? 'ua-hl-success'
      : tone === 'warn'
      ? 'ua-hl-warn'
      : tone === 'error'
      ? 'ua-hl-error'
      : 'ua-hl-info';
  const safe = escapeHtml(text);
  uaUpdateLogBufferRaw += `${text}\n`;
  uaUpdateLogBufferHtml += `<span class="${className}">${safe}</span>\n`;
  ui.uaUpdateConsole.innerHTML = uaUpdateLogBufferHtml;
  ui.uaUpdateConsole.scrollTop = ui.uaUpdateConsole.scrollHeight;
}

function setUaStatus(text) {
  if (ui.uaStatus) {
    ui.uaStatus.textContent = text || '';
  }
}

function setUaUpdateStatus(text) {
  if (ui.uaUpdateStatus) {
    ui.uaUpdateStatus.textContent = text || '';
  }
}

function updateUaUpdateControlsState() {
  if (ui.uaUpdateInput) {
    ui.uaUpdateInput.disabled = !uaUpdateRunning;
  }
  if (ui.uaUpdateSendBtn) {
    ui.uaUpdateSendBtn.disabled = !uaUpdateRunning;
  }
  if (ui.uaUpdateRunBtn) {
    ui.uaUpdateRunBtn.disabled = uaUpdateRunning;
  }
  if (ui.uaUpdateConfigBtn) {
    ui.uaUpdateConfigBtn.disabled = uaUpdateRunning;
  }
}

function buildUploadAssistantArgs() {
  const settings = loadSettings();
  const baseDir = String(settings.uploadAssistantPath || '').trim();
  const targetPath = getUploadAssistantTargetPath();
  const args = [];

  if (!baseDir) {
    return { error: 'Imposta il percorso di Upload Assistant nelle Impostazioni.' };
  }
  if (!targetPath) {
    return { error: 'Nessun file/cartella selezionato.' };
  }

  args.push('upload.py', targetPath);

  if (ui.uaUnattendedToggle?.checked) {
    args.push('-ua');
  }
  if (ui.uaTrackerShriToggle?.checked) {
    args.push('-tk', 'SHRI');
  } else if (ui.uaTrackerTestingToggle?.checked) {
    args.push('-tk', 'TESTING');
  }
  if (ui.uaPersonalToggle?.checked) {
    args.push('-pr');
  }
  if (ui.uaAnonymousToggle?.checked) {
    args.push('-a');
  }
  if (ui.uaWebdvToggle?.checked) {
    args.push('-webdv');
  }
  if (ui.uaTagToggle?.checked) {
    const tagValue = ui.uaTagInput?.value.trim();
    if (tagValue) {
      args.push('-g', tagValue);
    }
  }
  if (ui.uaScreensToggle?.checked) {
    const screensValue = Number(ui.uaScreensInput?.value || 0);
    if (Number.isFinite(screensValue) && screensValue > 0) {
      args.push('-s', String(Math.min(8, Math.max(1, screensValue))));
    }
  }
  if (ui.uaServiceToggle?.checked) {
    const serviceValue = ui.uaServiceInput?.value.trim();
    if (serviceValue) {
      args.push('-serv', serviceValue);
    }
  }
  if (ui.uaDebugToggle?.checked) {
    args.push('-debug');
  }

  return { baseDir, args };
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

function detectFormatFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\bWEB[-.\s]?DL\b/.test(upper) || /\bWEBDL\b/.test(upper)) {
    return 'WEB-DL';
  }
  if (/\bWEB[-.\s]?RIP\b/.test(upper) || /\bWEBRIP\b/.test(upper)) {
    return 'WEBRip';
  }
  if (/\bREMUX\b/.test(upper)) {
    return 'Remux';
  }
  if (/\bFULL\s*DISC\b/.test(upper) || /\bBDMV\b/.test(upper) || /\bBDISO\b/.test(upper)) {
    return 'Full Disc';
  }
  if (/\bBLU[-\s]?RAY\b/.test(upper) || /\bBLURAY\b/.test(upper) || /\bUHD\b/.test(upper)) {
    return 'Encode';
  }
  return '';
}

function detectSourceFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\bHDTV\b/.test(upper)) {
    return 'HDTV';
  }
  if (/\bUHD\b/.test(upper) && /(\bBLU[-\s]?RAY\b|\bBLURAY\b)/.test(upper)) {
    return 'UHD BluRay';
  }
  if (/\bBLU[-\s]?RAY\b/.test(upper) || /\bBLURAY\b/.test(upper)) {
    return 'BluRay';
  }
  if (/\bDVD\b/.test(upper)) {
    return 'DVD';
  }
  return '';
}

function detectRepackFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\bRERIP\b/.test(upper)) {
    return 'RERIP';
  }
  if (/\bPROPER\b/.test(upper)) {
    return 'PROPER';
  }
  if (/\bREPACK\b/.test(upper)) {
    return 'REPACK';
  }
  return '';
}

function detectFormatFromMediaInfo(mediaInfo, baseName, { service, source } = {}) {
  if (!mediaInfo || mediaInfo.error) {
    return { value: '', reason: '' };
  }
  const videoTrack = getVideoTrack(mediaInfo);
  const generalTrack = getGeneralTrack(mediaInfo);
  if (!videoTrack && !generalTrack) {
    return { value: '', reason: '' };
  }

  if (/\b(UNTOUCHED|VU1080|VU720|VU)\b/i.test(String(baseName || ''))) {
    return { value: 'Remux', reason: 'Rilevato da parsing del nome file: marker UNTOUCHED/VU' };
  }

  const encodingSettings = String(
    getTrackValue(videoTrack, [
      'Encoded_Library_Settings',
      'Encoded_Library_Settings/String',
      'Encoding_Settings',
      'Encoding_Settings/String'
    ]) || ''
  ).toLowerCase();
  const encodedLibrary = String(
    getTrackValue(videoTrack, [
      'Encoded_Library',
      'Encoded_Library/String',
      'Encoded_Library_Name',
      'Encoded_Library_Name/String'
    ]) || ''
  ).toLowerCase();
  const generalApp = String(
    getTrackValue(generalTrack, ['Encoded_Application', 'Writing_Application', 'Writing application']) || ''
  ).toLowerCase();
  const generalLibrary = String(
    getTrackValue(generalTrack, ['Encoded_Library', 'Writing_Library', 'Writing library']) || ''
  ).toLowerCase();
  const generalFrontend = String(generalTrack?.extra?.Writing_frontend || '').toLowerCase();
  const toolString = `${generalApp} ${generalFrontend}`.trim();
  const hasEncodingTools = /(handbrake|staxrip|megatagger|x264|x265)/.test(toolString);
  const hasEncodingSettings = Boolean(encodingSettings);
  const hasEncodeSignature =
    hasEncodingSignature(videoTrack) || hasEncodingSignature(generalTrack);
  const hasEncode = hasEncodingSettings || hasEncodingTools || hasEncodeSignature;

  if ((generalApp.includes('makemkv') || generalLibrary.includes('makemkv')) && !hasEncodingSettings) {
    return { value: 'Remux', reason: 'Rilevato dal parsing MediaInfo: MakeMKV senza encoding' };
  }

  const hdrProfile = String(videoTrack?.HDR_Format_Profile || '').toLowerCase();
  const hasStreamingDv =
    hdrProfile.includes('dvhe.05') || hdrProfile.includes('dvhe.07') || hdrProfile.includes('dvhe.08');

  const upperName = String(baseName || '').toUpperCase();
  const nameHasWeb = /\bWEB\b/.test(upperName);
  const serviceUpper = String(service || '').toUpperCase();
  const sourceUpper = String(source || '').toUpperCase();
  const sourceIsBluRay = sourceUpper.includes('BLURAY') || sourceUpper.includes('BLU-RAY');

  if (hasStreamingDv && !hasEncodingTools && !hasEncodingSettings) {
    return { value: 'WEB-DL', reason: 'Rilevato dal parsing MediaInfo: DV streaming profile' };
  }
  if (encodingSettings.includes('crf=')) {
    return {
      value: nameHasWeb || serviceUpper ? 'WEBRip' : 'Encode',
      reason: 'Rilevato dal parsing MediaInfo: CRF rilevato'
    };
  }
  if (serviceUpper === 'CR') {
    if (encodedLibrary.includes('core 142')) {
      return {
        value: 'WEB-DL',
        reason: 'Rilevato dal parsing MediaInfo: fingerprint Crunchyroll (core 142)'
      };
    }
    const coreMatch = encodedLibrary.match(/core\s+(\d+)/);
    if (coreMatch && Number(coreMatch[1]) >= 152) {
      return {
        value: 'WEBRip',
        reason: 'Rilevato dal parsing MediaInfo: fingerprint Crunchyroll (core >= 152)'
      };
    }
    if (encodingSettings.includes('bitrate=')) {
      return { value: 'WEB-DL', reason: 'Rilevato dal parsing MediaInfo: Crunchyroll bitrate=' };
    }
  }
  const formatProfile = String(videoTrack?.Format_Profile || '');
  if (
    formatProfile.includes('Main@L4.0') &&
    encodingSettings.includes('rc=2pass') &&
    (encodedLibrary.includes('core 118') || encodedLibrary.includes('core 148'))
  ) {
    return { value: 'WEB-DL', reason: 'Rilevato dal parsing MediaInfo: fingerprint Netflix' };
  }
  if (nameHasWeb) {
    if (hasEncodingTools) {
      return { value: 'WEBRip', reason: 'Rilevato dal parsing MediaInfo: tool encoding su sorgente WEB' };
    }
    if (!hasEncode) {
      return { value: 'WEB-DL', reason: 'Rilevato dal parsing MediaInfo: WEB senza encoding' };
    }
  }
  if (serviceUpper && !hasEncode) {
    return {
      value: 'WEB-DL',
      reason: 'Rilevato dal parsing MediaInfo: servizio presente senza encoding'
    };
  }
  if (sourceIsBluRay) {
    return {
      value: hasEncode ? 'Encode' : 'Remux',
      reason: hasEncode
        ? 'Rilevato dal parsing MediaInfo: BluRay con encoding'
        : 'Rilevato dal parsing MediaInfo: BluRay senza encoding'
    };
  }
  return { value: '', reason: '' };
}

function extractTokensPresent(name, tokens) {
  const matches = [];
  const safeName = String(name || '');
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(safeName)) {
      matches.push(token);
    }
  }
  return matches;
}

function updateFormatServiceSuggest() {
  if (!ui.formatSuggestRow || !ui.formatSuggestText) {
    return;
  }
  if (!state.targetPath) {
    ui.formatSuggestRow.classList.remove('is-empty');
    ui.formatSuggestText.textContent = 'Suggerimento nome/MediaInfo: Nessun suggerimento specifico disponibile.';
    return;
  }
  const basePath = state.mainVideo || state.videoFiles?.[0] || state.targetPath;
  const baseName = basePath ? stripExtension(getPathBaseName(basePath)) : '';
  if (!baseName) {
    ui.formatSuggestRow.classList.add('is-empty');
    ui.formatSuggestText.textContent = '';
    return;
  }
  const settings = getSettings();
  const nameFormat = detectFormatFromName(baseName);
  const serviceCodes = buildServiceOptions(settings).map((item) => item.code);
  const service = extractTokensPresent(baseName, serviceCodes)[0] || '';
  const source = detectSourceFromName(baseName);
  const repack = detectRepackFromName(baseName);
  const mediaInfoFormat = detectFormatFromMediaInfo(state.mediaInfo, baseName, { service, source });
  let format = mediaInfoFormat.value || nameFormat;
  let formatReason = mediaInfoFormat.value
    ? mediaInfoFormat.reason
    : format
      ? 'Rilevato da parsing del nome file: token formato'
      : '';
  if (!format && source) {
    format = 'Encode';
    formatReason = 'Rilevato da parsing del nome file: sorgente rilevata (fallback Encode)';
  }
  if (!format && !service && !source && !repack) {
    ui.formatSuggestRow.classList.remove('is-empty');
    ui.formatSuggestText.textContent = 'Suggerimento nome/MediaInfo: Nessun suggerimento specifico disponibile.';
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
      reason: 'Rilevato da parsing del nome file: token sorgente'
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
  if (hasItalianSubsOnly) {
    parts.push({
      label: 'Extra:',
      value: 'SUBS',
      reason: 'Rilevato dal parsing MediaInfo: sottotitoli ITA senza audio ITA'
    });
  }
  if (!parts.length) {
    ui.formatSuggestRow.classList.remove('is-empty');
    ui.formatSuggestText.textContent = 'Suggerimento nome/MediaInfo: Nessun suggerimento specifico disponibile.';
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
  ui.formatSuggestText.innerHTML = `Suggerimento nome/MediaInfo: ${html}`;
  ui.formatSuggestRow.classList.remove('is-empty');
  if (ui.applyNameSuggestBtn) {
    ui.applyNameSuggestBtn.disabled = false;
    ui.applyNameSuggestBtn.dataset.format = format || '';
    ui.applyNameSuggestBtn.dataset.service = service || '';
    ui.applyNameSuggestBtn.dataset.source = source || '';
    ui.applyNameSuggestBtn.dataset.repack = repack || '';
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
  setUaUpdateAvailable,
  updateFfmpegHint,
  updateQbitMappingHint,
  updateClientSections,
  updateSettingsVisibility,
  applySettingsToUI,
  getSettings
} = createSettingsTools({
  ui,
  updateTagSuggestion,
  updateTagOptions,
  loadServiceDefaults,
  updateServiceOptions,
  schedulePreview
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
    clearWizardRulesCheck();
    return;
  }

  const form = getFormState();
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

  if (state.kind === 'dir') {
    const infoPath = state.targetPath;
    const infoName = folderName || getPathBaseName(state.targetPath);
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
      item.className = 'plan-item rename';

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

  if (state.kind === 'file' && state.mainVideo) {
    const infoHeader = document.createElement('div');
    infoHeader.className = 'plan-label-row';

    const infoLabel = document.createElement('div');
    infoLabel.className = 'plan-label';
    infoLabel.textContent = 'MediaInfo (sintetico)';

    const infoBtn = document.createElement('button');
    infoBtn.className = 'secondary small';
    infoBtn.textContent = 'Apri mediainfo completo';
    infoBtn.addEventListener('click', async () => {
      if (!state.mainVideo) {
        showToast('MediaInfo non disponibile.', 'warning');
        return;
      }
      await showMediaInfoReport();
    });

    infoHeader.appendChild(infoLabel);
    infoHeader.appendChild(infoBtn);
    ui.renamePlanList.appendChild(infoHeader);

    const info = document.createElement('pre');
    info.className = 'plan-mediainfo';
    info.textContent = metadataTools.buildMediaInfoShort();
    ui.renamePlanList.appendChild(info);
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

  updateWizardRulesCheck(form);

}

async function refreshPreview() {
  updateVisibility();
  updateFormatServiceSuggest();
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
    return { hasMatch: false, data: null };
  }
  const settings = loadSettings();
  if (!settings.omdbKey && !settings.tmdbKey && !settings.tvdbKey) {
    setHint(ui.fetchStatus, 'Imposta le API key nelle impostazioni.');
    logDebug('fetchMetadata: nessuna API key disponibile');
    ui.fetchBadge.classList.add('hidden');
    return { hasMatch: false, data: null };
  }

  state.autoDetectRunning = true;
  setHint(ui.fetchStatus, 'Ricerca in corso...');
  ui.fetchBadge.classList.remove('error');

  try {
    const typeHint = guess.typeHint || ui.typeSelect.value;
    const isTvType = typeHint.startsWith('tv') || typeHint.startsWith('anime');
    const payload = {
      imdbId: ui.imdbInput.value.trim(),
      tvdbId: isTvType ? ui.tvdbInput.value.trim() : '',
      title: guess.title || ui.titleInput.value.trim(),
      year: guess.year || ui.yearInput.value.trim(),
      season: isTvType ? (guess.season || ui.seasonInput.value.trim()) : '',
      episode: isTvType ? (guess.episode || ui.episodeInput.value.trim()) : '',
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
    if (finalData?.isAnime) {
      const currentType = ui.typeSelect.value;
      if (currentType === 'tv-episode') {
        setIfAuto(ui.typeSelect, 'anime-episode');
      } else if (currentType === 'tv-season') {
        setIfAuto(ui.typeSelect, 'anime-season');
      }
    }
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

    const finalHasMatch = Boolean(
      finalData?.title || finalData?.tmdbId || finalData?.imdbId || finalData?.tvdbSeriesId
    );
    if (!finalHasMatch) {
      setFetchBadge('error', 'Auto matching fallito');
    } else {
      const usedManualId = Boolean(payload.imdbId || payload.tvdbId);
      const modeLabel = usedManualId ? 'Matching manuale' : 'Auto Matching';
      setFetchBadge(usedManualId ? 'manual' : 'auto', modeLabel);
    }
    renderFetchStatus(payload, finalData);
    return { hasMatch: finalHasMatch, data: finalData };
  } catch (error) {
    ui.fetchBadge.classList.add('hidden');
    setHint(ui.fetchStatus, `Errore: ${error.message || error}`);
    return { hasMatch: false, data: null, error };
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
  const result = await fetchMetadataAuto(guess);
  if (!result?.hasMatch && state.kind !== 'dir' && state.mainVideo) {
    const parentPath = getParentPath(state.mainVideo);
    const parentName = parentPath ? getPathBaseName(parentPath) : '';
    const parentGuess = parentName ? metadataTools.guessMetadataFromName(parentName) : {};
    const fallbackTitle = parentGuess.title || '';
    const fallbackYear = parentGuess.year || '';
    const fallbackSeason = parentGuess.season || guess.season;
    const isEpisodeGuess = guess.typeHint === 'tv-episode' || guess.typeHint === 'anime-episode';
    const shouldRetry = isEpisodeGuess && fallbackTitle && fallbackTitle !== guess.title;

    if (shouldRetry) {
      const fallback = {
        ...guess,
        title: fallbackTitle,
        year: fallbackYear || guess.year,
        season: fallbackSeason,
        typeHint: 'tv-episode'
      };
      logDebug('autoDetect: fallback', { title: fallback.title, year: fallback.year, season: fallback.season });
      await fetchMetadataAuto(fallback);
    }
  }
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
  clearWizardRulesCheck();

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
  metadataTools,
  logDebug,
  openWizardStep: (step) => openUploadWizard(step),
  openConfirmModal,
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

if (ui.sourceSection) {
  let dragDepth = 0;
  const resetDrag = () => {
    dragDepth = 0;
    ui.sourceSection.classList.remove('drag-active');
  };
  const uriToPath = (uri) => {
    if (!uri) {
      return '';
    }
    try {
      const url = new URL(uri);
      if (url.protocol === 'file:') {
        let filePath = decodeURIComponent(url.pathname || '');
        if (/^\/[A-Za-z]:/.test(filePath)) {
          filePath = filePath.slice(1);
        }
        return filePath.replace(/\//g, '\\');
      }
    } catch {
      // Ignore invalid URL
    }
    if (/^[A-Za-z]:[\\/]/.test(uri)) {
      return uri;
    }
    return '';
  };
  const getDropPath = (event) => {
    const files = event.dataTransfer?.files;
    let path = files && files.length ? files[0].path : '';
    if (!path && event.dataTransfer?.items?.length) {
      const item = event.dataTransfer.items[0];
      const file = item.getAsFile?.();
      path = file?.path || '';
    }
    if (!path && event.dataTransfer) {
      const uriList = event.dataTransfer.getData('text/uri-list') || '';
      const text = event.dataTransfer.getData('text/plain') || '';
      const raw = uriList || text;
      const firstLine = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'));
      path = uriToPath(firstLine || '');
    }
    return path;
  };

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  document.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    const items = event.dataTransfer?.items;
    const firstFile = files?.length ? files[0] : null;
    const firstItem = items?.length ? items[0] : null;
    logDebug?.('dragdrop: document drop', {
      files: files?.length || 0,
      items: items?.length || 0,
      types: event.dataTransfer?.types || [],
      fileInfo: firstFile
        ? {
            name: firstFile.name || '',
            path: firstFile.path || '',
            webkitRelativePath: firstFile.webkitRelativePath || '',
            size: Number.isFinite(firstFile.size) ? firstFile.size : null,
            type: firstFile.type || ''
          }
        : null,
      itemInfo: firstItem
        ? {
            kind: firstItem.kind || '',
            type: firstItem.type || ''
          }
        : null,
      uriList: event.dataTransfer?.getData?.('text/uri-list') || '',
      text: event.dataTransfer?.getData?.('text/plain') || ''
    });
  });

  ui.sourceSection.addEventListener('dragenter', (event) => {
    event.preventDefault();
    logDebug?.('dragdrop: enter source');
    dragDepth += 1;
    ui.sourceSection.classList.add('drag-active');
  });

  ui.sourceSection.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  ui.sourceSection.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      ui.sourceSection.classList.remove('drag-active');
    }
  });

  ui.sourceSection.addEventListener('drop', async (event) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    const items = event.dataTransfer?.items;
    const firstFile = files?.length ? files[0] : null;
    const firstItem = items?.length ? items[0] : null;
    const path = getDropPath(event);
    logDebug?.('dragdrop: drop source', {
      files: files?.length || 0,
      items: items?.length || 0,
      types: event.dataTransfer?.types || [],
      fileInfo: firstFile
        ? {
            name: firstFile.name || '',
            path: firstFile.path || '',
            webkitRelativePath: firstFile.webkitRelativePath || '',
            size: Number.isFinite(firstFile.size) ? firstFile.size : null,
            type: firstFile.type || ''
          }
        : null,
      itemInfo: firstItem
        ? {
            kind: firstItem.kind || '',
            type: firstItem.type || ''
          }
        : null,
      path: path || ''
    });
    if (!path) {
      showToast('Drag & drop non disponibile, usa Seleziona file/cartella.', 'warning');
      resetDrag();
      return;
    }
    await loadPath(path);
    resetDrag();
  });
}

if (ui.applyNameSuggestBtn) {
  ui.applyNameSuggestBtn.addEventListener('click', () => {
    const format = ui.applyNameSuggestBtn.dataset.format || '';
    const service = ui.applyNameSuggestBtn.dataset.service || '';
    const source = ui.applyNameSuggestBtn.dataset.source || '';
    const repack = ui.applyNameSuggestBtn.dataset.repack || '';
    const settings = getSettings();
    const serviceOptions = buildServiceOptions(settings);

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
    schedulePreview();
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
  }
});

ui.applyRenameBtn.addEventListener('click', async () => {
  if (!state.targetPath) {
    setHint(ui.renameHint, 'Seleziona un file o una cartella.');
    return;
  }

  const form = getFormState();
  const missing = renameTools.getMissingRenameRequirements(form);

  const { folderName, fileRenames } = renameTools.buildRenameTargets();
  if (!fileRenames.length && !folderName) {
    setHint(ui.renameHint, 'Inserisci i campi minimi per generare il nome.');
    return;
  }

  const renameFiles = ui.renameFileCheckbox.checked;
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
      const separator = baseOutputDir.includes('\\') ? '\\' : '/';
      const trimmed = baseOutputDir.replace(/[\\/]+$/, '');
      outputDir = `${trimmed}${separator}app_generated`;
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
      outputName,
      private: isPrivate,
      requestId: currentTorrentRequestId,
      mkbrrPath: settings.torrentMkbrrPath || ''
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
    } else {
      setHint(ui.torrentHint, result?.error || 'Errore nella generazione.');
      resetTorrentProgress();
    }
  });
}

ui.openSettingsBtn.addEventListener('click', openSettings);
ui.closeSettingsBtn.addEventListener('click', requestCloseSettings);
if (ui.appHealth) {
  ui.appHealth.addEventListener('click', () => {
    openUaHealthModal();
  });
}
if (ui.closeUaHealthBtn) {
  ui.closeUaHealthBtn.addEventListener('click', closeUaHealthModal);
}
if (ui.uaHealthModal) {
  ui.uaHealthModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      closeUaHealthModal();
    }
  });
}
if (ui.uaUpdateModal) {
  ui.uaUpdateModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      closeUaUpdateModal();
    }
  });
}
if (ui.closeUaUpdateBtn) {
  ui.closeUaUpdateBtn.addEventListener('click', closeUaUpdateModal);
}
if (ui.uaUpdateRunBtn) {
  ui.uaUpdateRunBtn.addEventListener('click', startUaUpdate);
}
if (ui.uaUpdateSendBtn) {
  ui.uaUpdateSendBtn.addEventListener('click', sendUaUpdateInput);
}
if (ui.uaUpdateInput) {
  ui.uaUpdateInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendUaUpdateInput();
    }
  });
}
if (ui.uaUpdateConfigBtn) {
  ui.uaUpdateConfigBtn.addEventListener('click', openUaConfigGeneratorTerminal);
}
if (ui.uaHealthUpdateBtn) {
  ui.uaHealthUpdateBtn.addEventListener('click', async () => {
    const mode = ui.uaHealthUpdateBtn.dataset.mode || 'terminal';
    if (ui.uaHealthUpdateBtn.disabled || mode === 'disabled') {
      return;
    }
    if (mode === 'run') {
      openUaUpdateModal();
      return;
    }
    const baseDir = String(loadSettings().uploadAssistantPath || '').trim();
    if (!baseDir) {
      showToast('Percorso Upload Assistant non impostato.', 'warning');
      return;
    }
    const result = await window.api?.uaOpenUpdateTerminal?.({ baseDir });
    if (!result?.ok) {
      showToast(result?.error || 'Impossibile aprire il terminale.', 'error');
      return;
    }
    showToast('Terminale aggiornamento aperto.', 'success');
  });
}
if (ui.uaHealthOpenPathBtn) {
  ui.uaHealthOpenPathBtn.addEventListener('click', async () => {
    const targetPath = ui.uaHealthPath?.dataset.path || '';
    if (!targetPath) {
      showToast('Percorso Upload Assistant non impostato.', 'warning');
      return;
    }
    const result = await window.api?.openPath?.(targetPath);
    if (!result?.ok) {
      showToast(result?.error || 'Impossibile aprire il percorso.', 'error');
    }
  });
}
if (ui.uaHealthOpenConfigBtn) {
  ui.uaHealthOpenConfigBtn.addEventListener('click', async () => {
    const targetPath = ui.uaHealthConfigPath?.dataset.path || '';
    if (!targetPath) {
      showToast('Config Upload Assistant non disponibile.', 'error');
      return;
    }
    const result = await window.api?.openPath?.(targetPath);
    if (!result?.ok) {
      showToast(result?.error || 'Impossibile aprire il file.', 'error');
    }
  });
}
if (ui.openUaHealthFromSettingsBtn) {
  ui.openUaHealthFromSettingsBtn.addEventListener('click', () => {
    closeSettings();
    openUaHealthModal();
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
if (ui.openUploadAssistantBtn) {
  ui.openUploadAssistantBtn.addEventListener('click', openUploadAssistantModal);
}
if (ui.closeUploadWizardBtn) {
  ui.closeUploadWizardBtn.addEventListener('click', closeUploadWizard);
}
if (ui.closeUploadAssistantBtn) {
  ui.closeUploadAssistantBtn.addEventListener('click', closeUploadAssistantModal);
}
if (ui.uploadWizardModal) {
  ui.uploadWizardModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      closeUploadWizard();
    }
  });
}
if (ui.uploadAssistantModal) {
  ui.uploadAssistantModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      closeUploadAssistantModal();
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
    setWizardStep(Number(wizardStepIndex) + 1);
  });
}

if (ui.uaTagToggle) {
  ui.uaTagToggle.addEventListener('change', updateUaControlsState);
}
if (ui.uaScreensToggle) {
  ui.uaScreensToggle.addEventListener('change', updateUaControlsState);
}
if (ui.uaServiceToggle) {
  ui.uaServiceToggle.addEventListener('change', updateUaControlsState);
}
if (ui.uaTrackerTestingToggle) {
  ui.uaTrackerTestingToggle.addEventListener('change', () => {
    if (ui.uaTrackerTestingToggle.checked && ui.uaTrackerShriToggle) {
      ui.uaTrackerShriToggle.checked = false;
    }
  });
}
if (ui.uaTrackerShriToggle) {
  ui.uaTrackerShriToggle.addEventListener('change', () => {
    if (ui.uaTrackerShriToggle.checked && ui.uaTrackerTestingToggle) {
      ui.uaTrackerTestingToggle.checked = false;
    }
  });
}
if (ui.uaTrackerTestingToggle) {
  ui.uaTrackerTestingToggle.addEventListener('change', updateUaControlsState);
}
if (ui.uaTrackerShriToggle) {
  ui.uaTrackerShriToggle.addEventListener('change', updateUaControlsState);
}
if (ui.uaServiceDropdown && ui.uaServiceBtn && ui.uaServiceInput && ui.uaServiceMenu) {
  setupDropdown(ui.uaServiceDropdown, ui.uaServiceBtn, ui.uaServiceInput, ui.uaServiceMenu);
}
if (ui.uaScreensInput) {
  ui.uaScreensInput.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -1 : 1;
    const current = Number(ui.uaScreensInput.value || 0);
    const next = Math.min(8, Math.max(1, (Number.isFinite(current) ? current : 6) + delta));
    ui.uaScreensInput.value = String(next);
  });
}
if (ui.uaStartBtn) {
  ui.uaStartBtn.addEventListener('click', async () => {
    const { baseDir, args, error } = buildUploadAssistantArgs();
    if (error) {
      showToast(error, 'error');
      return;
    }
    if (!window.api?.uaStart) {
      showToast('Upload Assistant non disponibile.', 'error');
      return;
    }
    uaRunning = true;
    updateUaControlsState();
    setUaStatus('Avvio in corso...');
    if (ui.uaInput) {
      ui.uaInput.focus();
    }
    appendUaLog(`> python ${args.map((part) => `"${part}"`).join(' ')}\n`);
    const result = await window.api.uaStart({ baseDir, args });
    if (!result?.ok) {
      uaRunning = false;
      updateUaControlsState();
      setUaStatus(result?.error || 'Avvio fallito.');
    }
  });
}
if (ui.uaStopBtn) {
  ui.uaStopBtn.addEventListener('click', async () => {
    if (!window.api?.uaStop) {
      return;
    }
    await window.api.uaStop();
    uaRunning = false;
    updateUaControlsState();
    setUaStatus('Interrotto.');
  });
}
if (ui.uaSendBtn && ui.uaInput) {
  const sendInput = async () => {
    const text = ui.uaInput.value;
    if (!text || !uaRunning) {
      return;
    }
    if (!window.api?.uaSendInput) {
      return;
    }
    appendUaLog(`> ${text}\n`);
    ui.uaInput.value = '';
    await window.api.uaSendInput(text);
  };
  ui.uaSendBtn.addEventListener('click', sendInput);
  ui.uaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendInput();
    }
  });
}
if (ui.uaCopyLogBtn) {
  ui.uaCopyLogBtn.addEventListener('click', async () => {
    if (!uaLogBufferRaw) {
      return;
    }
    await navigator.clipboard.writeText(uaLogBufferRaw);
    showToast('Log copiato.', 'success');
  });
}
if (ui.uaOpenFolderBtn) {
  ui.uaOpenFolderBtn.addEventListener('click', () => {
    const baseDir = String(loadSettings().uploadAssistantPath || '').trim();
    if (baseDir) {
      window.api.openPath?.(baseDir);
    } else {
      showToast('Percorso Upload Assistant non impostato.', 'warning');
    }
  });
}
if (window.api?.onUaOutput) {
  window.api.onUaOutput((data) => {
    if (!data?.text) {
      return;
    }
    appendUaLog(data.text);
  });
}
if (window.api?.onUaExit) {
  window.api.onUaExit((data) => {
    uaRunning = false;
    updateUaControlsState();
    const code = data?.code;
    const label = code === 0 ? 'Completato.' : `Terminato (code ${code ?? 'n/d'}).`;
    setUaStatus(label);
  });
}
if (window.api?.onUaUpdateOutput) {
  window.api.onUaUpdateOutput((data) => {
    if (!data?.text) {
      return;
    }
    appendUaUpdateLog(data.text);
  });
}
if (window.api?.onUaUpdateExit) {
  window.api.onUaUpdateExit((data) => {
    uaUpdateRunning = false;
    updateUaUpdateControlsState();
    const code = data?.code;
    const label =
      code === 0
        ? 'Aggiornamento completato.'
        : `Aggiornamento terminato (code ${code ?? 'n/d'}).`;
    setUaUpdateStatus(label);
    if (code === 0) {
      appendUaUpdateSystemLine('Aggiornamento completato.', 'success');
      if (uaUpdateSummary?.git) {
        const gitStatus = uaUpdateSummary.git.error
          ? 'Errore durante git pull.'
          : uaUpdateSummary.git.updated
          ? 'Git: aggiornato.'
          : uaUpdateSummary.git.noop
          ? 'Git: nessun aggiornamento.'
          : '';
        if (gitStatus) {
          appendUaUpdateSystemLine(
            gitStatus,
            uaUpdateSummary.git.error ? 'error' : 'info'
          );
        }
      }
      if (uaUpdateSummary?.pip) {
        const pipStatus = uaUpdateSummary.pip.error
          ? 'Pip: errore durante installazione dipendenze.'
          : uaUpdateSummary.pip.updated
          ? 'Pip: dipendenze aggiornate.'
          : uaUpdateSummary.pip.noop
          ? 'Pip: dipendenze gia presenti.'
          : '';
        if (pipStatus) {
          appendUaUpdateSystemLine(
            pipStatus,
            uaUpdateSummary.pip.error ? 'error' : 'info'
          );
        }
      }
    } else {
      appendUaUpdateSystemLine('Aggiornamento fallito.', 'error');
    }
    checkUaVersion();
  });
}

if (ui.themeToggle) {
  ui.themeToggle.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light') ? 'dark' : 'light';
    applyTheme(nextTheme);
    saveTheme(nextTheme);
  });
}

if (ui.uploadModeToggle) {
  ui.uploadModeToggle.addEventListener('click', () => {
    const current = document.body.dataset.uploadMode === 'ua' ? 'ua' : 'integrated';
    const next = current === 'ua' ? 'integrated' : 'ua';
    applyUploadMode(next, true);
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

if (ui.browseUploadAssistantPathBtn) {
  ui.browseUploadAssistantPathBtn.addEventListener('click', async () => {
    const dir = await window.api.selectFolder();
    if (dir && ui.settingsUploadAssistantPathInput) {
      ui.settingsUploadAssistantPathInput.value = dir;
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
    if (data.generator) {
      setTorrentGeneratorHint(data.generator);
    }
    if (data.logLine) {
      appendTorrentLog(data.logLine);
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
  showToast('Impostazioni salvate.', 'success');
  updateUaServiceOptions();
  refreshSettingsSnapshot();
  if (settings.uploadMode === 'ua') {
    checkUaVersion();
  }
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
applyUploadMode(initialSettings.uploadMode || 'integrated');
updateAutoDetectControls();
updateVisibility();
refreshPreview();
updateAppVersionLabel();
updateUaControlsState();

logDebug('Renderer loaded');
