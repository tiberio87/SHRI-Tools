import { ANNOUNCE_BASE, SETTINGS_STORAGE_KEY } from './constants.js';

const DEFAULT_SETTINGS = {
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
  unit3dApiKey: '',
  unit3dAnonymous: false,
  unit3dPersonalRelease: false,
  unit3dModQueue: false,
  unit3dCategoryOverrides: '',
  unit3dTypeOverrides: '',
  unit3dResolutionOverrides: '',
  qbitHost: '',
  qbitPort: '',
  qbitUsername: '',
  qbitPassword: '',
  qbitHttps: false,
  qbitSavePath: '',
  qbitCategory: '',
  qbitAutoStart: true,
  qbitPathMapLocal: '',
  qbitPathMapRemote: ''
};

export function createSettingsTools({
  ui,
  updateTagSuggestion,
  updateTagOptions,
  loadServiceDefaults,
  updateServiceOptions,
  schedulePreview
}) {
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

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_SETTINGS };
      }
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
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

  function updateQbitMappingHint(settings) {
    const savePath = String(settings?.qbitSavePath || '').trim();
    const disableMapping = Boolean(savePath);
    if (ui.qbitPathMapLocalInput) {
      ui.qbitPathMapLocalInput.disabled = disableMapping;
    }
    if (ui.qbitPathMapRemoteInput) {
      ui.qbitPathMapRemoteInput.disabled = disableMapping;
    }
    if (ui.qbitMappingHint) {
      ui.qbitMappingHint.textContent = disableMapping
        ? 'Mapping ignorato quando Save path è impostato.'
        : "Usa il mapping solo se il client gira su un'altra macchina.";
    }
  }

  function buildAppHealthStatus(settings) {
    const missingCritical = [];
    const missingWarn = [];
    const notes = [];
    const metadataCount = [settings.tmdbKey, settings.tvdbKey, settings.omdbKey].filter(Boolean).length;

    if (metadataCount === 0) {
      missingWarn.push({
        label: 'API Metadata',
        detail: 'Auto-matching non disponibile.'
      });
    } else if (metadataCount < 3) {
      notes.push(`Hai salvato solo ${metadataCount}/3 chiavi metadata. L'Auto-matching potrebbe essere meno efficace.`);
    }

    if (!getAnnounceUrlFromSettings(settings)) {
      missingCritical.push({
        label: 'Announce PID/URL',
        detail: 'Necessario per generare il .torrent.'
      });
    }

    if (!settings.ffmpegPath) {
      missingWarn.push({
        label: 'Percorso FFmpeg',
        detail: 'Screenshot non generabili.'
      });
    }

    if (!settings.imgbbKey && !settings.ptscreensKey) {
      missingWarn.push({
        label: 'API immagini',
        detail: 'Screenshot non caricabili.'
      });
    }

    if (!settings.unit3dBaseUrl || !settings.unit3dApiKey) {
      missingWarn.push({
        label: 'UNIT3D Base URL + API key',
        detail: 'Upload automatico non disponibile.'
      });
    }

    const status = missingCritical.length ? 'red' : missingWarn.length ? 'yellow' : 'green';
    return { status, missingCritical, missingWarn, notes };
  }

  function updateAppHealthStatus(settings = loadSettings()) {
    if (!ui.appHealth || !ui.appHealthTooltip) {
      return;
    }
    const report = buildAppHealthStatus(settings);
    ui.appHealth.dataset.status = report.status;

    const tooltip = ui.appHealthTooltip;
    tooltip.innerHTML = '';

    if (report.status === 'green') {
      const item = document.createElement('div');
      item.className = 'item';
      item.textContent = 'Tutto configurato: rinomina, torrent, screenshot e upload automatico pronti.';
      tooltip.appendChild(item);
    } else {
      const list = [...report.missingCritical, ...report.missingWarn];
      list.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'item';
        item.innerHTML = `<strong>${entry.label}</strong>: ${entry.detail}`;
        tooltip.appendChild(item);
      });
    }

    if (report.notes.length) {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = report.notes.join(' ');
      tooltip.appendChild(note);
    }

    ui.appHealth.setAttribute('aria-label', `Stato app: ${report.status}`);
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
    if (ui.unit3dAnonymousToggle) {
      ui.unit3dAnonymousToggle.checked = settings.unit3dAnonymous === true;
    }
    if (ui.unit3dPersonalReleaseToggle) {
      ui.unit3dPersonalReleaseToggle.checked = settings.unit3dPersonalRelease === true;
    }
    if (ui.unit3dModQueueToggle) {
      ui.unit3dModQueueToggle.checked = settings.unit3dModQueue === true;
    }
    if (ui.unit3dCategoryOverridesInput) {
      ui.unit3dCategoryOverridesInput.value = settings.unit3dCategoryOverrides || '';
    }
    if (ui.unit3dTypeOverridesInput) {
      ui.unit3dTypeOverridesInput.value = settings.unit3dTypeOverrides || '';
    }
    if (ui.unit3dResolutionOverridesInput) {
      ui.unit3dResolutionOverridesInput.value = settings.unit3dResolutionOverrides || '';
    }
    if (ui.qbitHostInput) {
      ui.qbitHostInput.value = settings.qbitHost || '';
    }
    if (ui.qbitPortInput) {
      ui.qbitPortInput.value = settings.qbitPort || '';
    }
    if (ui.qbitUsernameInput) {
      ui.qbitUsernameInput.value = settings.qbitUsername || '';
    }
    if (ui.qbitPasswordInput) {
      ui.qbitPasswordInput.value = settings.qbitPassword || '';
    }
    if (ui.qbitHttpsToggle) {
      ui.qbitHttpsToggle.checked = settings.qbitHttps === true;
    }
    if (ui.qbitSavePathInput) {
      ui.qbitSavePathInput.value = settings.qbitSavePath || '';
    }
    if (ui.qbitCategoryInput) {
      ui.qbitCategoryInput.value = settings.qbitCategory || '';
    }
    if (ui.qbitAutoStartToggle) {
      ui.qbitAutoStartToggle.checked = settings.qbitAutoStart !== false;
    }
    if (ui.qbitPathMapLocalInput) {
      ui.qbitPathMapLocalInput.value = settings.qbitPathMapLocal || '';
    }
    if (ui.qbitPathMapRemoteInput) {
      ui.qbitPathMapRemoteInput.value = settings.qbitPathMapRemote || '';
    }
    updateQbitMappingHint(settings);
    if (ui.settingsAnnounceInput) {
      const passkey = settings.torrentPasskey || '';
      const announceUrl = settings.torrentAnnounceUrl || '';
      const fallback = extractPasskeyFromAnnounce(announceUrl);
      ui.settingsAnnounceInput.value = passkey || fallback || announceUrl || '';
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
    updateAppHealthStatus(settings);
    schedulePreview();
  }

  function getSettings() {
    const announceInput = ui.settingsAnnounceInput?.value.trim() || '';
    const announceResolved = resolveAnnounceInput(announceInput);
    const passkey = announceResolved.passkey || '';
    const announceUrl = passkey ? '' : announceResolved.announceUrl || '';

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
      unit3dAnonymous: Boolean(ui.unit3dAnonymousToggle?.checked),
      unit3dPersonalRelease: Boolean(ui.unit3dPersonalReleaseToggle?.checked),
      unit3dModQueue: Boolean(ui.unit3dModQueueToggle?.checked),
      unit3dCategoryOverrides: ui.unit3dCategoryOverridesInput?.value.trim() || '',
      unit3dTypeOverrides: ui.unit3dTypeOverridesInput?.value.trim() || '',
      unit3dResolutionOverrides: ui.unit3dResolutionOverridesInput?.value.trim() || '',
      qbitHost: ui.qbitHostInput?.value.trim() || '',
      qbitPort: ui.qbitPortInput?.value.trim() || '',
      qbitUsername: ui.qbitUsernameInput?.value.trim() || '',
      qbitPassword: ui.qbitPasswordInput?.value.trim() || '',
      qbitHttps: Boolean(ui.qbitHttpsToggle?.checked),
      qbitSavePath: ui.qbitSavePathInput?.value.trim() || '',
      qbitCategory: ui.qbitCategoryInput?.value.trim() || '',
      qbitAutoStart: Boolean(ui.qbitAutoStartToggle?.checked),
      qbitPathMapLocal: ui.qbitPathMapLocalInput?.value.trim() || '',
      qbitPathMapRemote: ui.qbitPathMapRemoteInput?.value.trim() || '',
      torrentPasskey: passkey,
      torrentAnnounceUrl: announceUrl,
      torrentOutputDir: ui.settingsTorrentOutputInput?.value.trim() || '',
      torrentPrivate: Boolean(ui.settingsTorrentPrivateToggle?.checked)
    };
  }

  return {
    extractPasskeyFromAnnounce,
    resolveAnnounceInput,
    getAnnounceUrlFromSettings,
    loadSettings,
    saveSettings,
    updateFfmpegHint,
    updateQbitMappingHint,
    buildAppHealthStatus,
    updateAppHealthStatus,
    applySettingsToUI,
    getSettings
  };
}
