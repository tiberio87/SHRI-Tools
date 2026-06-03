// Settings UI + localStorage persistence for app and upload configuration.
import { ANNOUNCE_BASE, SETTINGS_STORAGE_KEY } from './constants.js';

// Default settings for a clean install (merged with stored values).
const _isLinux = typeof navigator !== 'undefined' && navigator.platform.startsWith('Linux');

const DEFAULT_SETTINGS = {
  omdbKey: '',
  tmdbKey: '',
  tvdbKey: '',
  preferredLanguage: 'it-IT',
  serviceList: '',
  tagList: '',
  autoTagDetect: true,
  autoNoGroupTag: true,
  renameLangInFolders: true,
  renameLangInFiles: true,
  renameOmitNoGroupInPaths: false,
  bdinfoPath: _isLinux ? '/usr/local/bin/bdinfo' : '',
  torrentPasskey: '',
  torrentAnnounceUrl: '',
  torrentOutputDir: '',
  torrentMkbrrPath: _isLinux ? '/usr/local/bin/mkbrr' : '',
  torrentMkbrrWorkers: 1,
  torrentPrivate: true,
  ffmpegPath: _isLinux ? '/usr/bin/ffmpeg' : '',
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
  torrentClient: 'qbit',
  qbitHost: '',
  qbitPort: '',
  qbitUsername: '',
  qbitPassword: '',
  qbitHttps: false,
  qbitSavePath: '',
  qbitCategories: '',
  qbitAutoStart: true,
  qbitPathMapLocal: '',
  qbitPathMapRemote: '',
  transmissionHost: '',
  transmissionPort: '',
  transmissionUsername: '',
  transmissionPassword: '',
  transmissionHttps: false,
  transmissionSavePath: '',
  transmissionAutoStart: true,
  transmissionPathMapLocal: '',
  transmissionPathMapRemote: '',
  mkvpropeditPath: _isLinux ? '/usr/bin/mkvpropedit' : '',
  mkvTaggerEncoder: 'SHRI'
};

const SECRET_SETTING_KEYS = [
  'omdbKey',
  'tmdbKey',
  'tvdbKey',
  'imgbbKey',
  'ptscreensKey',
  'unit3dApiKey',
  'qbitPassword',
  'transmissionPassword',
  'torrentPasskey'
];

const NON_SECRET_STORAGE_KEYS = Object.keys(DEFAULT_SETTINGS).filter(
  (key) => !SECRET_SETTING_KEYS.includes(key)
);

function toNonSecretSettingsForStorage(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const stored = {};
  for (const key of NON_SECRET_STORAGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      stored[key] = source[key];
    }
  }
  return stored;
}

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
        return mergeSettings({}, getStoredSecrets());
      }
      const parsed = JSON.parse(raw);
      const secrets = extractSecretSettings(parsed);
      if (Object.keys(secrets).length && window.api?.setStoredSecrets) {
        window.api.setStoredSecrets(secrets);
      }
      const sanitized = stripSecretSettings(parsed);
      if (sanitized.hadSecrets) {
        localStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify(toNonSecretSettingsForStorage(sanitized.settings))
        );
      }
      return mergeSettings(sanitized.settings, getStoredSecrets());
    } catch {
      return mergeSettings({}, getStoredSecrets());
    }
  }

  function saveSettings(settings) {
    const sanitized = stripSecretSettings(settings);
    const nonSecretSettings = {
      ...DEFAULT_SETTINGS,
      ...(sanitized.settings && typeof sanitized.settings === 'object' ? sanitized.settings : {})
    };
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(toNonSecretSettingsForStorage(nonSecretSettings))
    );
    if (window.api?.setStoredSecrets) {
      window.api.setStoredSecrets(extractSecretSettings(settings));
    }
  }

  function mergeSettings(settings = {}, secrets = {}) {
    return { ...DEFAULT_SETTINGS, ...settings, ...secrets };
  }

  function getStoredSecrets() {
    if (!window.api?.getStoredSecrets) {
      return {};
    }
    return window.api.getStoredSecrets() || {};
  }

  function extractSecretSettings(settings = {}) {
    const secretSettings = {};
    for (const key of SECRET_SETTING_KEYS) {
      if (String(settings?.[key] || '').trim()) {
        secretSettings[key] = String(settings[key]).trim();
      }
    }
    return secretSettings;
  }

  function stripSecretSettings(settings = {}) {
    const {
      omdbKey,
      tmdbKey,
      tvdbKey,
      imgbbKey,
      ptscreensKey,
      unit3dApiKey,
      qbitPassword,
      transmissionPassword,
      torrentPasskey,
      ...rest
    } = settings || {};
    return { settings: rest, hadSecrets: Boolean(
      omdbKey || tmdbKey || tvdbKey || imgbbKey || ptscreensKey || unit3dApiKey || qbitPassword || transmissionPassword || torrentPasskey
    ) };
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
    const client = settings?.torrentClient || 'qbit';
    const isTransmission = client === 'transmission';
    const savePath = isTransmission
      ? String(settings?.transmissionSavePath || '').trim()
      : String(settings?.qbitSavePath || '').trim();
    const disableMapping = Boolean(savePath);
    if (ui.qbitPathMapLocalInput) {
      ui.qbitPathMapLocalInput.disabled = false;
    }
    if (ui.qbitPathMapRemoteInput) {
      ui.qbitPathMapRemoteInput.disabled = false;
    }
    if (ui.transmissionPathMapLocalInput) {
      ui.transmissionPathMapLocalInput.disabled = false;
    }
    if (ui.transmissionPathMapRemoteInput) {
      ui.transmissionPathMapRemoteInput.disabled = false;
    }
    if (ui.qbitMappingHint) {
      ui.qbitMappingHint.textContent = disableMapping
        ? 'Mapping ignorato quando Save path è impostato.'
        : "Usa il mapping solo se il client gira su un'altra macchina.";
    }
    if (ui.transmissionMappingHint) {
      ui.transmissionMappingHint.textContent = disableMapping
        ? 'Mapping ignorato quando Save path è impostato.'
        : "Usa il mapping solo se il client gira su un'altra macchina.";
    }
  }

  function updateClientSections(settings) {
    const client = settings?.torrentClient || 'qbit';
    if (ui.torrentClientSelect) {
      ui.torrentClientSelect.value = client;
    }
    if (ui.qbitSettingsSection) {
      ui.qbitSettingsSection.classList.toggle('hidden', client !== 'qbit');
    }
    if (ui.transmissionSettingsSection) {
      ui.transmissionSettingsSection.classList.toggle('hidden', client !== 'transmission');
    }
    if (ui.qbitTestBtn) ui.qbitTestBtn.classList.toggle('hidden', client !== 'qbit');
    if (ui.qbitTestHint) ui.qbitTestHint.classList.toggle('hidden', client !== 'qbit');
    if (ui.transmissionTestBtn) ui.transmissionTestBtn.classList.toggle('hidden', client !== 'transmission');
    if (ui.transmissionTestHint) ui.transmissionTestHint.classList.toggle('hidden', client !== 'transmission');
  }

  function buildIntegratedHealthStatus(settings) {
    const rows = [];
    const notes = [];

    // API Metadata
    const tmdbOk = Boolean(settings.tmdbKey);
    const tvdbOk = Boolean(settings.tvdbKey);
    const omdbOk = Boolean(settings.omdbKey);
    const metadataCount = [tmdbOk, tvdbOk, omdbOk].filter(Boolean).length;
    rows.push({ section: 'api', label: 'TMDb Key', ok: tmdbOk, optional: false, detail: tmdbOk ? 'Configurata.' : 'Auto-matching film/serie non disponibile.' });
    rows.push({ section: 'api', label: 'TVDb Key', ok: tvdbOk, optional: true, detail: tvdbOk ? 'Configurata.' : 'Auto-matching serie TV tramite TVDb non disponibile (opzionale).' });
    rows.push({ section: 'api', label: 'OMDb Key', ok: omdbOk, optional: true, detail: omdbOk ? 'Configurata.' : 'Fallback metadata via IMDb non disponibile (opzionale).' });
    if (metadataCount > 0 && metadataCount < 3) {
      notes.push(`Hai ${metadataCount}/3 chiavi metadata. L'auto-matching potrebbe essere meno efficace.`);
    }

    // API Upload/Immagini
    const unit3dOk = Boolean(settings.unit3dBaseUrl && settings.unit3dApiKey);
    const imgbbOk = Boolean(settings.imgbbKey);
    const ptscreensOk = Boolean(settings.ptscreensKey);
    const eitherImageOk = imgbbOk || ptscreensOk;
    rows.push({ section: 'api', label: 'UNIT3D URL + API Key', ok: unit3dOk, optional: false, detail: unit3dOk ? 'Configurati.' : 'Upload automatico, dupe check e analisi tracker non disponibili.' });
    rows.push({ section: 'api', label: 'imgBB Key', ok: imgbbOk, optional: true, detail: imgbbOk ? `Configurata${settings.imageHostPrimary === 'imgbb' ? ' (host primario)' : ' (fallback)'}.` : 'Host imgBB non configurato (opzionale se PTScreens disponibile).' });
    rows.push({ section: 'api', label: 'PTScreens Key', ok: ptscreensOk, optional: true, detail: ptscreensOk ? `Configurata${settings.imageHostPrimary === 'ptscreens' ? ' (host primario)' : ' (fallback)'}.` : 'Host PTScreens non configurato (opzionale se imgBB disponibile).' });
    if (!eitherImageOk) {
      notes.push('Nessun host immagini configurato: gli screenshot non potranno essere caricati.');
    }

    // Eseguibili
    const ffmpegOk = Boolean(settings.ffmpegPath);
    const bdinfoOk = Boolean(settings.bdinfoPath);
    const mkbrrOk = Boolean(settings.torrentMkbrrPath);
    rows.push({ section: 'exe', label: 'FFmpeg', ok: ffmpegOk, optional: false, detail: ffmpegOk ? settings.ffmpegPath : 'Generazione screenshot non disponibile.' });
    rows.push({ section: 'exe', label: 'mkbrr', ok: mkbrrOk, optional: true, detail: mkbrrOk ? settings.torrentMkbrrPath : 'Creazione .torrent tramite mkbrr non disponibile (opzionale).' });
    rows.push({ section: 'exe', label: 'BDInfo', ok: bdinfoOk, optional: true, detail: bdinfoOk ? settings.bdinfoPath : 'Analisi Blu-ray (Full Disc) non disponibile (opzionale).' });

    // Configurazione torrent/upload
    const announceOk = Boolean(getAnnounceUrlFromSettings(settings));
    const outputDirOk = Boolean(settings.torrentOutputDir);
    const torrentClientOk = Boolean(
      (settings.torrentClient === 'qbit' && settings.qbitHost && settings.qbitPort) ||
      (settings.torrentClient === 'transmission' && settings.transmissionHost && settings.transmissionPort)
    );
    rows.push({ section: 'config', label: 'Announce URL / Passkey', ok: announceOk, optional: false, detail: announceOk ? 'Configurato.' : 'Necessario per generare il .torrent.' });
    rows.push({ section: 'config', label: 'Cartella output .torrent', ok: outputDirOk, optional: false, detail: outputDirOk ? settings.torrentOutputDir : 'Necessaria per salvare .torrent, BBCode e MediaInfo.' });
    rows.push({ section: 'config', label: 'Client torrent', ok: torrentClientOk, optional: true, detail: torrentClientOk ? `${settings.torrentClient === 'transmission' ? 'Transmission' : 'qBittorrent'} configurato.` : 'Invio automatico .torrent al client non disponibile (opzionale).' });

    const criticalFail = rows.filter((r) => !r.ok && !r.optional);
    const warnFail = rows.filter((r) => !r.ok && r.optional);
    const status = criticalFail.length ? 'red' : warnFail.length ? 'yellow' : 'green';
    return { status, rows, notes };
  }

  function buildAppHealthStatus(settings) {
    return buildIntegratedHealthStatus(settings);
  }

  function renderHealthCheckModal(settings = loadSettings()) {
    if (!ui.healthCheckBody) return;
    const report = buildIntegratedHealthStatus(settings);
    const body = ui.healthCheckBody;
    body.innerHTML = '';

    // Summary
    const summary = document.createElement('div');
    summary.className = 'hc-summary';
    summary.dataset.status = report.status;
    const dot = document.createElement('span');
    dot.className = 'hc-summary-dot';
    const label = document.createElement('span');
    label.textContent = report.status === 'green'
      ? 'Tutto configurato: pronto per rinomina, torrent, screenshot e upload.'
      : report.status === 'yellow'
        ? 'Configurazione parziale: alcune funzionalità opzionali non disponibili.'
        : 'Configurazione incompleta: alcune funzionalità essenziali mancanti.';
    summary.appendChild(dot);
    summary.appendChild(label);
    body.appendChild(summary);

    // Sezioni
    const sections = [
      { key: 'api', title: 'API Key' },
      { key: 'exe', title: 'Eseguibili' },
      { key: 'config', title: 'Configurazione' }
    ];

    for (const sec of sections) {
      const secRows = report.rows.filter((r) => r.section === sec.key);
      if (!secRows.length) continue;
      const secEl = document.createElement('div');
      secEl.className = 'hc-section';
      const title = document.createElement('div');
      title.className = 'hc-section-title';
      title.textContent = sec.title;
      secEl.appendChild(title);
      for (const row of secRows) {
        const rowEl = document.createElement('div');
        rowEl.className = 'hc-row';
        const icon = document.createElement('div');
        icon.className = `hc-row-icon ${row.ok ? 'ok' : row.optional ? 'optional' : 'error'}`;
        icon.textContent = row.ok ? '✓' : row.optional ? '−' : '✕';
        const info = document.createElement('div');
        info.className = 'hc-row-info';
        const lbl = document.createElement('div');
        lbl.className = 'hc-row-label';
        lbl.textContent = row.label;
        const detail = document.createElement('div');
        detail.className = 'hc-row-detail';
        detail.textContent = row.detail;
        info.appendChild(lbl);
        info.appendChild(detail);
        rowEl.appendChild(icon);
        rowEl.appendChild(info);
        secEl.appendChild(rowEl);
      }
      body.appendChild(secEl);
    }

    if (report.notes.length) {
      const notes = document.createElement('div');
      notes.className = 'hc-notes';
      notes.textContent = report.notes.join(' ');
      body.appendChild(notes);
    }
  }

  function openHealthCheckModal() {
    if (!ui.healthCheckModal) return;
    renderHealthCheckModal();
    ui.healthCheckModal.classList.remove('hidden');
  }

  function updateAppHealthStatus(settings = loadSettings()) {
    if (!ui.appHealth) {
      return;
    }
    const report = buildAppHealthStatus(settings);
    ui.appHealth.dataset.status = report.status;

    if (ui.appHealthTooltip) {
      const tooltip = ui.appHealthTooltip;
      tooltip.innerHTML = '';
      if (report.status === 'green') {
        const item = document.createElement('div');
        item.className = 'item';
        item.textContent = 'Tutto configurato. Clicca per i dettagli.';
        tooltip.appendChild(item);
      } else {
        const failRows = report.rows.filter((r) => !r.ok && !r.optional);
        const warnRows = report.rows.filter((r) => !r.ok && r.optional);
        [...failRows, ...warnRows].slice(0, 4).forEach((row) => {
          const item = document.createElement('div');
          item.className = 'item';
          item.innerHTML = `<strong>${row.label}</strong>: ${row.detail}`;
          tooltip.appendChild(item);
        });
        if (failRows.length + warnRows.length > 4) {
          const more = document.createElement('div');
          more.className = 'note';
          more.textContent = 'Clicca per vedere tutti i dettagli.';
          tooltip.appendChild(more);
        }
      }
      if (report.notes.length) {
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = report.notes.join(' ');
        tooltip.appendChild(note);
      }
    }

    ui.appHealth.setAttribute('aria-label', `Stato app: ${report.status}`);
  }

  function updateSettingsVisibility() {
    document.querySelectorAll('[data-settings-scope]').forEach((block) => {
      block.classList.remove('hidden');
    });
    if (ui.openAdvancedSettingsBtn) {
      ui.openAdvancedSettingsBtn.classList.remove('hidden');
    }
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
    if (ui.renameLangFoldersToggle) {
      ui.renameLangFoldersToggle.checked = settings.renameLangInFolders !== false;
    }
    if (ui.renameLangFilesToggle) {
      ui.renameLangFilesToggle.checked = settings.renameLangInFiles !== false;
    }
    if (ui.renameOmitNoGroupToggle) {
      ui.renameOmitNoGroupToggle.checked = settings.renameOmitNoGroupInPaths === true;
    }

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
    if (ui.torrentClientSelect) {
      ui.torrentClientSelect.value = settings.torrentClient || 'qbit';
    }
    updateClientSections(settings);
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
    if (ui.qbitCategoriesInput) {
      ui.qbitCategoriesInput.value = settings.qbitCategories || settings.qbitCategory || '';
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
    if (ui.transmissionHostInput) {
      ui.transmissionHostInput.value = settings.transmissionHost || '';
    }
    if (ui.transmissionPortInput) {
      ui.transmissionPortInput.value = settings.transmissionPort || '';
    }
    if (ui.transmissionUsernameInput) {
      ui.transmissionUsernameInput.value = settings.transmissionUsername || '';
    }
    if (ui.transmissionPasswordInput) {
      ui.transmissionPasswordInput.value = settings.transmissionPassword || '';
    }
    if (ui.transmissionHttpsToggle) {
      ui.transmissionHttpsToggle.checked = settings.transmissionHttps === true;
    }
    if (ui.transmissionSavePathInput) {
      ui.transmissionSavePathInput.value = settings.transmissionSavePath || '';
    }
    if (ui.transmissionAutoStartToggle) {
      ui.transmissionAutoStartToggle.checked = settings.transmissionAutoStart !== false;
    }
    if (ui.transmissionPathMapLocalInput) {
      ui.transmissionPathMapLocalInput.value = settings.transmissionPathMapLocal || '';
    }
    if (ui.transmissionPathMapRemoteInput) {
      ui.transmissionPathMapRemoteInput.value = settings.transmissionPathMapRemote || '';
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
    if (ui.settingsMkbrrPathInput) {
      ui.settingsMkbrrPathInput.value = settings.torrentMkbrrPath || '';
    }
    if (ui.settingsMkvpropeditPathInput) {
      ui.settingsMkvpropeditPathInput.value = settings.mkvpropeditPath || '';
    }
    if (ui.settingsMkbrrWorkersInput) {
      const workers = Number.isFinite(settings.torrentMkbrrWorkers)
        ? settings.torrentMkbrrWorkers
        : 1;
      ui.settingsMkbrrWorkersInput.value = String(workers);
    }
    if (ui.settingsBdinfoPathInput) {
      ui.settingsBdinfoPathInput.value = settings.bdinfoPath || '';
    }
    if (ui.settingsTorrentPrivateToggle) {
      ui.settingsTorrentPrivateToggle.checked = settings.torrentPrivate !== false;
    }
    if (ui.autoTagDetectToggle) {
      ui.autoTagDetectToggle.checked = settings.autoTagDetect !== false;
    }
    if (ui.autoNoGroupTagToggle) {
      ui.autoNoGroupTagToggle.checked = settings.autoNoGroupTag !== false;
    }
    updateFfmpegHint(settings);
    updateTagSuggestion(settings);
    loadServiceDefaults().then(() => updateServiceOptions(settings));
    updateTagOptions(settings);
    updateAppHealthStatus(settings);
    updateSettingsVisibility(settings);
    schedulePreview();
  }

  function getSettings() {
    const stored = loadSettings();
    const announceInput = ui.settingsAnnounceInput?.value.trim() || '';
    const announceResolved = resolveAnnounceInput(announceInput);
    const passkey = announceResolved.passkey || '';
    const announceUrl = passkey ? '' : announceResolved.announceUrl || '';
    const mkbrrWorkersRaw = ui.settingsMkbrrWorkersInput?.value.trim() || '';
    let mkbrrWorkers = Number.parseInt(mkbrrWorkersRaw, 10);
    if (!mkbrrWorkersRaw) {
      mkbrrWorkers = Number.isFinite(stored.torrentMkbrrWorkers)
        ? stored.torrentMkbrrWorkers
        : 1;
    }
    if (!Number.isFinite(mkbrrWorkers) || mkbrrWorkers < 0) {
      mkbrrWorkers = 1;
    }

    return {
      omdbKey: ui.omdbKeyInput.value.trim(),
      tmdbKey: ui.tmdbKeyInput.value.trim(),
      tvdbKey: ui.tvdbKeyInput.value.trim(),
      imgbbKey: ui.imgbbKeyInput?.value.trim() || '',
      ptscreensKey: ui.ptscreensKeyInput?.value.trim() || '',
      preferredLanguage: ui.preferredLanguageSelect.value,
      renameLangInFolders: Boolean(ui.renameLangFoldersToggle?.checked),
      renameLangInFiles: Boolean(ui.renameLangFilesToggle?.checked),
      renameOmitNoGroupInPaths: Boolean(ui.renameOmitNoGroupToggle?.checked),

      bdinfoPath: ui.settingsBdinfoPathInput?.value.trim() || '',
      serviceList: ui.serviceListInput.value.trim(),
      tagList: ui.tagListInput.value.trim(),
      autoTagDetect: Boolean(ui.autoTagDetectToggle?.checked),
      autoNoGroupTag: Boolean(ui.autoNoGroupTagToggle?.checked),
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
      torrentClient: ui.torrentClientSelect?.value || 'qbit',
      qbitHost: ui.qbitHostInput?.value.trim() || '',
      qbitPort: ui.qbitPortInput?.value.trim() || '',
      qbitUsername: ui.qbitUsernameInput?.value.trim() || '',
      qbitPassword: ui.qbitPasswordInput?.value.trim() || '',
      qbitHttps: Boolean(ui.qbitHttpsToggle?.checked),
      qbitSavePath: ui.qbitSavePathInput?.value.trim() || '',
      qbitCategories: ui.qbitCategoriesInput?.value.trim() || '',
      qbitAutoStart: Boolean(ui.qbitAutoStartToggle?.checked),
      qbitPathMapLocal: ui.qbitPathMapLocalInput?.value.trim() || '',
      qbitPathMapRemote: ui.qbitPathMapRemoteInput?.value.trim() || '',
      transmissionHost: ui.transmissionHostInput?.value.trim() || '',
      transmissionPort: ui.transmissionPortInput?.value.trim() || '',
      transmissionUsername: ui.transmissionUsernameInput?.value.trim() || '',
      transmissionPassword: ui.transmissionPasswordInput?.value.trim() || '',
      transmissionHttps: Boolean(ui.transmissionHttpsToggle?.checked),
      transmissionSavePath: ui.transmissionSavePathInput?.value.trim() || '',
      transmissionAutoStart: Boolean(ui.transmissionAutoStartToggle?.checked),
      transmissionPathMapLocal: ui.transmissionPathMapLocalInput?.value.trim() || '',
      transmissionPathMapRemote: ui.transmissionPathMapRemoteInput?.value.trim() || '',
      torrentPasskey: passkey,
      torrentAnnounceUrl: announceUrl,
      torrentOutputDir: ui.settingsTorrentOutputInput?.value.trim() || '',
      torrentMkbrrPath: ui.settingsMkbrrPathInput?.value.trim() || '',
      torrentMkbrrWorkers: mkbrrWorkers,
      torrentPrivate: Boolean(ui.settingsTorrentPrivateToggle?.checked),
      mkvpropeditPath: ui.settingsMkvpropeditPathInput?.value.trim() || '',
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
    updateClientSections,
    buildAppHealthStatus,
    updateAppHealthStatus,
    openHealthCheckModal,
    updateSettingsVisibility,
    applySettingsToUI,
    getSettings
  };
}
