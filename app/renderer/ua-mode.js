// Upload Assistant modal: build CLI args, run UA process, and stream logs.
export function createUAMode({
  ui,
  state,
  showToast,
  loadSettings,
  updateAppHealthStatus,
  setUaUpdateAvailable,
  updateRulesCheckForTargets,
  buildServiceOptions,
  getFormState,
  setupDropdown,
  closeSettings,
  isTrackerConfigured,
  isPlaceholderAnnounce,
  parseUploadAssistantConfig,
  formatMasked
}) {
  let uaRunning = false;
  let uaLogBufferRaw = '';
  let uaLogBufferHtml = '';
  let uaUpdateRunning = false;
  let uaUpdateLogBufferRaw = '';
  let uaUpdateLogBufferHtml = '';
  let uaUpdateSummary = null;

  const UA_UPDATE_COMMANDS = [
    'git fetch --all --tags',
    'git pull',
    'python -m pip install --user -U -r requirements.txt'
  ];

  const buildUaUpdateCommands = () => UA_UPDATE_COMMANDS.join('\n');

  const resetUaUpdateSummary = () => {
    uaUpdateSummary = {
      git: { updated: false, noop: false, error: false },
      pip: { updated: false, noop: false, error: false }
    };
  };

  const updateUaUpdateSummaryFromLine = (line) => {
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
  };

  const openUploadAssistantModal = () => {
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
    updateUaTypeOptions();
    updateUaSourceOptions();
    updateUaResolutionOptions();
    updateUaControlsState();
  };

  const closeUploadAssistantModal = () => {
    if (!ui.uploadAssistantModal) {
      return;
    }
    ui.uploadAssistantModal.classList.add('hidden');
  };

  const openUaUpdateModal = () => {
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
  };

  const closeUaUpdateModal = () => {
    if (!ui.uaUpdateModal) {
      return;
    }
    ui.uaUpdateModal.classList.add('hidden');
  };

  const startUaUpdate = async () => {
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
  };

  const sendUaUpdateInput = async () => {
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
  };

  const openUaConfigGeneratorTerminal = async () => {
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
  };

  const makeUaHealthBadge = (text, tone) => {
    const badge = document.createElement('span');
    badge.className = `ua-health-badge ${tone || ''}`.trim();
    badge.textContent = text;
    return badge;
  };

  const addUaHealthRow = (container, label, value) => {
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
  };

  const renderUaHealthCard = (title, rows) => {
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
  };

  const renderUaHealthDetails = (parsed) => {
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
    trackerList.className = 'ua-health-list ua-health-list--trackers';
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
  };

  const refreshUaHealthModal = async () => {
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
  };

  const openUaHealthModal = () => {
    if (!ui.uaHealthModal) {
      return;
    }
    ui.uaHealthModal.classList.remove('hidden');
    refreshUaHealthModal();
  };

  const closeUaHealthModal = () => {
    if (!ui.uaHealthModal) {
      return;
    }
    ui.uaHealthModal.classList.add('hidden');
  };

  const setUaUpdateAvailability = (available) => {
    if (!ui.uaHealthUpdateBtn) {
      return;
    }
    ui.uaHealthUpdateBtn.disabled = !available;
    ui.uaHealthUpdateBtn.dataset.mode = available ? 'run' : 'disabled';
    ui.uaHealthUpdateBtn.textContent = 'Avvia aggiornamento';
    if (ui.uaHealthUpdateHint) {
      ui.uaHealthUpdateHint.classList.toggle('hidden', Boolean(available));
    }
  };

  const checkUaVersion = async () => {
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
  };

  const getUploadAssistantTargetPath = () => {
    if (state.kind === 'dir') {
      return state.targetPath || '';
    }
    return state.mainVideo || state.targetPath || '';
  };

  const updateUaControlsState = () => {
    const tagEnabled = Boolean(ui.uaTagToggle?.checked);
    if (ui.uaTagInput) {
      ui.uaTagInput.disabled = false;
      ui.uaTagInput.readOnly = !tagEnabled;
      ui.uaTagInput.setAttribute('aria-disabled', String(!tagEnabled));
      const group = ui.uaTagInput.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !tagEnabled);
      }
    }
    const screensEnabled = Boolean(ui.uaScreensToggle?.checked);
    if (ui.uaScreensInput) {
      ui.uaScreensInput.disabled = false;
      ui.uaScreensInput.readOnly = !screensEnabled;
      ui.uaScreensInput.setAttribute('aria-disabled', String(!screensEnabled));
      const group = ui.uaScreensInput.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !screensEnabled);
      }
    }
    const serviceEnabled = Boolean(ui.uaServiceToggle?.checked);
    if (ui.uaServiceBtn) {
      ui.uaServiceBtn.disabled = false;
      ui.uaServiceBtn.setAttribute('aria-disabled', String(!serviceEnabled));
      const group = ui.uaServiceBtn.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !serviceEnabled);
      }
    }
    const typeEnabled = Boolean(ui.uaTypeToggle?.checked);
    if (ui.uaTypeBtn) {
      ui.uaTypeBtn.disabled = false;
      ui.uaTypeBtn.setAttribute('aria-disabled', String(!typeEnabled));
      const group = ui.uaTypeBtn.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !typeEnabled);
      }
    }
    const sourceEnabled = Boolean(ui.uaSourceToggle?.checked);
    if (ui.uaSourceBtn) {
      ui.uaSourceBtn.disabled = false;
      ui.uaSourceBtn.setAttribute('aria-disabled', String(!sourceEnabled));
      const group = ui.uaSourceBtn.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !sourceEnabled);
      }
    }
    const resEnabled = Boolean(ui.uaResToggle?.checked);
    if (ui.uaResBtn) {
      ui.uaResBtn.disabled = false;
      ui.uaResBtn.setAttribute('aria-disabled', String(!resEnabled));
      const group = ui.uaResBtn.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !resEnabled);
      }
    }
    const tmdbEnabled = Boolean(ui.uaTmdbToggle?.checked);
    if (ui.uaTmdbInput) {
      ui.uaTmdbInput.disabled = false;
      ui.uaTmdbInput.readOnly = !tmdbEnabled;
      ui.uaTmdbInput.setAttribute('aria-disabled', String(!tmdbEnabled));
      const group = ui.uaTmdbInput.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !tmdbEnabled);
      }
    }
    const imdbEnabled = Boolean(ui.uaImdbToggle?.checked);
    if (ui.uaImdbInput) {
      ui.uaImdbInput.disabled = false;
      ui.uaImdbInput.readOnly = !imdbEnabled;
      ui.uaImdbInput.setAttribute('aria-disabled', String(!imdbEnabled));
      const group = ui.uaImdbInput.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !imdbEnabled);
      }
    }
    const tvdbEnabled = Boolean(ui.uaTvdbToggle?.checked);
    if (ui.uaTvdbInput) {
      ui.uaTvdbInput.disabled = false;
      ui.uaTvdbInput.readOnly = !tvdbEnabled;
      ui.uaTvdbInput.setAttribute('aria-disabled', String(!tvdbEnabled));
      const group = ui.uaTvdbInput.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !tvdbEnabled);
      }
    }
    const malEnabled = Boolean(ui.uaMalToggle?.checked);
    if (ui.uaMalInput) {
      ui.uaMalInput.disabled = false;
      ui.uaMalInput.readOnly = !malEnabled;
      ui.uaMalInput.setAttribute('aria-disabled', String(!malEnabled));
      const group = ui.uaMalInput.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !malEnabled);
      }
    }
    const seasonEnabled = Boolean(ui.uaSeasonToggle?.checked);
    if (ui.uaSeasonInput) {
      ui.uaSeasonInput.disabled = false;
      ui.uaSeasonInput.readOnly = !seasonEnabled;
      ui.uaSeasonInput.setAttribute('aria-disabled', String(!seasonEnabled));
      const group = ui.uaSeasonInput.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !seasonEnabled);
      }
    }
    const episodeEnabled = Boolean(ui.uaEpisodeToggle?.checked);
    if (ui.uaEpisodeInput) {
      ui.uaEpisodeInput.disabled = false;
      ui.uaEpisodeInput.readOnly = !episodeEnabled;
      ui.uaEpisodeInput.setAttribute('aria-disabled', String(!episodeEnabled));
      const group = ui.uaEpisodeInput.closest('.ua-arg-group');
      if (group) {
        group.classList.toggle('is-disabled', !episodeEnabled);
      }
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
  };

  const updateUaServiceOptions = () => {
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
  };

  const buildUaTypeOptions = () => ([
    { code: 'disc', label: 'Disc' },
    { code: 'remux', label: 'Remux' },
    { code: 'encode', label: 'Encode' },
    { code: 'webdl', label: 'WEB-DL' },
    { code: 'webrip', label: 'WEBRip' },
    { code: 'hdtv', label: 'HDTV' },
    { code: 'dvdrip', label: 'DVDRip' }
  ]);

  const buildUaSourceOptions = () => ([
    { code: 'Blu-ray', label: 'Blu-ray' },
    { code: 'BluRay', label: 'BluRay' },
    { code: 'DVD', label: 'DVD' },
    { code: 'DVD5', label: 'DVD5' },
    { code: 'DVD9', label: 'DVD9' },
    { code: 'HDDVD', label: 'HDDVD' },
    { code: 'WEB', label: 'WEB' },
    { code: 'HDTV', label: 'HDTV' },
    { code: 'UHDTV', label: 'UHDTV' }
  ]);

  const buildUaResolutionOptions = () => ([
    { code: '2160p', label: '2160p' },
    { code: '1080p', label: '1080p' },
    { code: '1080i', label: '1080i' },
    { code: '720p', label: '720p' },
    { code: '576p', label: '576p' },
    { code: '576i', label: '576i' },
    { code: '480p', label: '480p' },
    { code: '480i', label: '480i' },
    { code: '8640p', label: '8640p' },
    { code: '4320p', label: '4320p' },
    { code: 'other', label: 'Other' }
  ]);

  const updateUaTypeOptions = () => {
    if (!ui.uaTypeMenu || !ui.uaTypeBtn || !ui.uaTypeInput) {
      return;
    }
    const options = buildUaTypeOptions();
    const current = ui.uaTypeInput.value;
    ui.uaTypeMenu.innerHTML = '';

    const blank = document.createElement('button');
    blank.type = 'button';
    blank.className = 'dropdown-item';
    blank.dataset.value = '';
    blank.textContent = 'Seleziona tipo';
    ui.uaTypeMenu.appendChild(blank);

    for (const option of options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item';
      item.dataset.value = option.code;
      item.textContent = option.label;
      ui.uaTypeMenu.appendChild(item);
    }

    const currentOption = options.find((option) => option.code === current);
    if (currentOption) {
      ui.uaTypeInput.value = current;
      ui.uaTypeBtn.textContent = currentOption.label;
    } else {
      ui.uaTypeInput.value = '';
      ui.uaTypeBtn.textContent = 'Seleziona tipo';
    }
  };

  const updateUaSourceOptions = () => {
    if (!ui.uaSourceMenu || !ui.uaSourceBtn || !ui.uaSourceInput) {
      return;
    }
    const options = buildUaSourceOptions();
    const current = ui.uaSourceInput.value;
    ui.uaSourceMenu.innerHTML = '';

    const blank = document.createElement('button');
    blank.type = 'button';
    blank.className = 'dropdown-item';
    blank.dataset.value = '';
    blank.textContent = 'Seleziona sorgente';
    ui.uaSourceMenu.appendChild(blank);

    for (const option of options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item';
      item.dataset.value = option.code;
      item.textContent = option.label;
      ui.uaSourceMenu.appendChild(item);
    }

    const currentOption = options.find((option) => option.code === current);
    if (currentOption) {
      ui.uaSourceInput.value = current;
      ui.uaSourceBtn.textContent = currentOption.label;
    } else {
      ui.uaSourceInput.value = '';
      ui.uaSourceBtn.textContent = 'Seleziona sorgente';
    }
  };

  const updateUaResolutionOptions = () => {
    if (!ui.uaResMenu || !ui.uaResBtn || !ui.uaResInput) {
      return;
    }
    const options = buildUaResolutionOptions();
    const current = ui.uaResInput.value;
    ui.uaResMenu.innerHTML = '';

    const blank = document.createElement('button');
    blank.type = 'button';
    blank.className = 'dropdown-item';
    blank.dataset.value = '';
    blank.textContent = 'Seleziona risoluzione';
    ui.uaResMenu.appendChild(blank);

    for (const option of options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item';
      item.dataset.value = option.code;
      item.textContent = option.label;
      ui.uaResMenu.appendChild(item);
    }

    const currentOption = options.find((option) => option.code === current);
    if (currentOption) {
      ui.uaResInput.value = current;
      ui.uaResBtn.textContent = currentOption.label;
    } else {
      ui.uaResInput.value = '';
      ui.uaResBtn.textContent = 'Seleziona risoluzione';
    }
  };

  const escapeHtml = (text) =>
    String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const highlightUaLine = (line) => {
    const raw = String(line || '');
    const trim = raw.trim();
    const linkifyUrl = (url) => {
      const safeUrl = escapeHtml(url);
      return `<a class="ua-hl-link" data-external="${safeUrl}" href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`;
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
    const numberLineMatch = trim.match(
      /^(Screenshots|Total Frames|Start frame|End frame|Usable frames|frame interval):\s*(\d+)$/i
    );
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
  };

  const highlightUaChunk = (chunk) =>
    String(chunk || '')
      .split('\n')
      .map((line) => highlightUaLine(line))
      .join('\n');

  const ansiToHtml = (text) => {
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
      const codes = codeText
        .split(';')
        .map((value) => parseInt(value, 10))
        .filter(Number.isFinite);
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
  };

  const appendUaLog = (text) => {
    if (!ui.uaConsoleLog) {
      return;
    }
    uaLogBufferRaw += text;
    uaLogBufferHtml += ansiToHtml(text);
    ui.uaConsoleLog.innerHTML = uaLogBufferHtml;
    ui.uaConsoleLog.scrollTop = ui.uaConsoleLog.scrollHeight;
  };

  const appendUaUpdateLog = (text) => {
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
  };

  const appendUaUpdateSystemLine = (text, tone = 'info') => {
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
  };

  const setUaStatus = (text) => {
    if (ui.uaStatus) {
      ui.uaStatus.textContent = text || '';
    }
  };

  const setUaUpdateStatus = (text) => {
    if (ui.uaUpdateStatus) {
      ui.uaUpdateStatus.textContent = text || '';
    }
  };

  const updateUaUpdateControlsState = () => {
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
  };

  // Build UA args from toggles/inputs; toggles are the single source of truth.
  const buildUploadAssistantArgs = () => {
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
    }
    if (ui.uaPersonalToggle?.checked) {
      args.push('-pr');
    }
    if (ui.uaAnonymousToggle?.checked) {
      args.push('-a');
    }
    if (ui.uaWebdvToggle?.checked) {
      args.push('-edition', 'Hybrid');
    }
    if (ui.uaEditionRepackToggle?.checked) {
      args.push('-edition', 'Repack');
    }
    if (ui.uaNoSeedToggle?.checked) {
      args.push('-ns');
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
    if (ui.uaTypeToggle?.checked) {
      const typeValue = ui.uaTypeInput?.value.trim();
      if (typeValue) {
        args.push('-t', typeValue);
      }
    }
    if (ui.uaSourceToggle?.checked) {
      const sourceValue = ui.uaSourceInput?.value.trim();
      if (sourceValue) {
        args.push('--source', sourceValue);
      }
    }
    if (ui.uaResToggle?.checked) {
      const resValue = ui.uaResInput?.value.trim();
      if (resValue) {
        args.push('-res', resValue);
      }
    }
    if (ui.uaTmdbToggle?.checked) {
      const tmdbValue = ui.uaTmdbInput?.value.trim();
      if (tmdbValue) {
        args.push('-tmdb', tmdbValue);
      }
    }
    if (ui.uaImdbToggle?.checked) {
      const imdbValue = ui.uaImdbInput?.value.trim();
      if (imdbValue) {
        args.push('-imdb', imdbValue);
      }
    }
    if (ui.uaTvdbToggle?.checked) {
      const tvdbValue = ui.uaTvdbInput?.value.trim();
      if (tvdbValue) {
        args.push('-tvdb', tvdbValue);
      }
    }
    if (ui.uaMalToggle?.checked) {
      const malValue = ui.uaMalInput?.value.trim();
      if (malValue) {
        args.push('-mal', malValue);
      }
    }
    if (ui.uaSeasonToggle?.checked) {
      const seasonValue = ui.uaSeasonInput?.value.trim();
      if (seasonValue) {
        args.push('-season', seasonValue);
      }
    }
    if (ui.uaEpisodeToggle?.checked) {
      const episodeValue = ui.uaEpisodeInput?.value.trim();
      if (episodeValue) {
        args.push('-episode', episodeValue);
      }
    }
    if (ui.uaDebugToggle?.checked) {
      args.push('-debug');
    }

    return { baseDir, args };
  };

  const copyUaLog = async () => {
    if (!uaLogBufferRaw) {
      return;
    }
    await navigator.clipboard.writeText(uaLogBufferRaw);
    showToast('Log copiato.', 'success');
  };

  const openUaFolder = () => {
    const baseDir = String(loadSettings().uploadAssistantPath || '').trim();
    if (baseDir) {
      window.api.openPath?.(baseDir);
    } else {
      showToast('Percorso Upload Assistant non impostato.', 'warning');
    }
  };

  const bindEvents = () => {
    const ensureUaToggle = (toggleEl) => {
      if (toggleEl && !toggleEl.checked) {
        toggleEl.checked = true;
        updateUaControlsState();
      }
    };
    const getUaTooltip = () => {
      let el = document.querySelector('.ua-tooltip-floating');
      if (!el) {
        el = document.createElement('div');
        el.className = 'ua-tooltip-floating';
        document.body.appendChild(el);
      }
      return el;
    };
    const positionUaTooltip = (target, tooltipEl) => {
      const text = target.getAttribute('data-tooltip') || '';
      if (!text) {
        tooltipEl.style.opacity = '0';
        return;
      }
      tooltipEl.textContent = text;
      tooltipEl.style.opacity = '1';
      const rect = target.getBoundingClientRect();
      const tipRect = tooltipEl.getBoundingClientRect();
      const margin = 8;
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
      let top = rect.top - tipRect.height - 10;
      if (top < margin) {
        top = rect.bottom + 10;
      }
      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;
    };
    const showUaTooltip = (target) => {
      const tooltipEl = getUaTooltip();
      positionUaTooltip(target, tooltipEl);
    };
    const hideUaTooltip = () => {
      const tooltipEl = document.querySelector('.ua-tooltip-floating');
      if (tooltipEl) {
        tooltipEl.style.opacity = '0';
      }
    };
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
    if (ui.openUploadAssistantBtn) {
      ui.openUploadAssistantBtn.addEventListener('click', openUploadAssistantModal);
    }
    if (ui.closeUploadAssistantBtn) {
      ui.closeUploadAssistantBtn.addEventListener('click', closeUploadAssistantModal);
    }
    if (ui.uploadAssistantModal) {
      ui.uploadAssistantModal.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal-backdrop')) {
          closeUploadAssistantModal();
        }
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
    if (ui.uaTypeToggle) {
      ui.uaTypeToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaSourceToggle) {
      ui.uaSourceToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaResToggle) {
      ui.uaResToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaTmdbToggle) {
      ui.uaTmdbToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaImdbToggle) {
      ui.uaImdbToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaTvdbToggle) {
      ui.uaTvdbToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaMalToggle) {
      ui.uaMalToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaSeasonToggle) {
      ui.uaSeasonToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaEpisodeToggle) {
      ui.uaEpisodeToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaTrackerShriToggle) {
      ui.uaTrackerShriToggle.addEventListener('change', () => {
      });
    }
    if (ui.uaTrackerShriToggle) {
      ui.uaTrackerShriToggle.addEventListener('change', updateUaControlsState);
    }
    if (ui.uaServiceDropdown && ui.uaServiceBtn && ui.uaServiceInput && ui.uaServiceMenu) {
      setupDropdown(ui.uaServiceDropdown, ui.uaServiceBtn, ui.uaServiceInput, ui.uaServiceMenu);
    }
    if (ui.uaTypeDropdown && ui.uaTypeBtn && ui.uaTypeInput && ui.uaTypeMenu) {
      setupDropdown(ui.uaTypeDropdown, ui.uaTypeBtn, ui.uaTypeInput, ui.uaTypeMenu);
    }
    if (ui.uaSourceDropdown && ui.uaSourceBtn && ui.uaSourceInput && ui.uaSourceMenu) {
      setupDropdown(ui.uaSourceDropdown, ui.uaSourceBtn, ui.uaSourceInput, ui.uaSourceMenu);
    }
    if (ui.uaResDropdown && ui.uaResBtn && ui.uaResInput && ui.uaResMenu) {
      setupDropdown(ui.uaResDropdown, ui.uaResBtn, ui.uaResInput, ui.uaResMenu);
    }
    if (ui.uaTagInput) {
      const activateTag = () => ensureUaToggle(ui.uaTagToggle);
      ui.uaTagInput.addEventListener('focus', activateTag);
      ui.uaTagInput.addEventListener('click', activateTag);
    }
    if (ui.uaScreensInput) {
      const activateScreens = () => ensureUaToggle(ui.uaScreensToggle);
      ui.uaScreensInput.addEventListener('focus', activateScreens);
      ui.uaScreensInput.addEventListener('click', activateScreens);
    }
    if (ui.uaServiceBtn) {
      const activateService = () => ensureUaToggle(ui.uaServiceToggle);
      ui.uaServiceBtn.addEventListener('click', activateService);
    }
    if (ui.uaServiceDropdown) {
      ui.uaServiceDropdown.addEventListener('mousedown', () => ensureUaToggle(ui.uaServiceToggle));
    }
    if (ui.uaTypeBtn) {
      const activateType = () => ensureUaToggle(ui.uaTypeToggle);
      ui.uaTypeBtn.addEventListener('click', activateType);
    }
    if (ui.uaTypeDropdown) {
      ui.uaTypeDropdown.addEventListener('mousedown', () => ensureUaToggle(ui.uaTypeToggle));
    }
    if (ui.uaSourceBtn) {
      const activateSource = () => ensureUaToggle(ui.uaSourceToggle);
      ui.uaSourceBtn.addEventListener('click', activateSource);
    }
    if (ui.uaSourceDropdown) {
      ui.uaSourceDropdown.addEventListener('mousedown', () => ensureUaToggle(ui.uaSourceToggle));
    }
    if (ui.uaResBtn) {
      const activateRes = () => ensureUaToggle(ui.uaResToggle);
      ui.uaResBtn.addEventListener('click', activateRes);
    }
    if (ui.uaResDropdown) {
      ui.uaResDropdown.addEventListener('mousedown', () => ensureUaToggle(ui.uaResToggle));
    }
    if (ui.uaTmdbInput) {
      const activateTmdb = () => ensureUaToggle(ui.uaTmdbToggle);
      ui.uaTmdbInput.addEventListener('focus', activateTmdb);
      ui.uaTmdbInput.addEventListener('click', activateTmdb);
    }
    if (ui.uaImdbInput) {
      const activateImdb = () => ensureUaToggle(ui.uaImdbToggle);
      ui.uaImdbInput.addEventListener('focus', activateImdb);
      ui.uaImdbInput.addEventListener('click', activateImdb);
    }
    if (ui.uaTvdbInput) {
      const activateTvdb = () => ensureUaToggle(ui.uaTvdbToggle);
      ui.uaTvdbInput.addEventListener('focus', activateTvdb);
      ui.uaTvdbInput.addEventListener('click', activateTvdb);
    }
    if (ui.uaMalInput) {
      const activateMal = () => ensureUaToggle(ui.uaMalToggle);
      ui.uaMalInput.addEventListener('focus', activateMal);
      ui.uaMalInput.addEventListener('click', activateMal);
    }
    if (ui.uaSeasonInput) {
      const activateSeason = () => ensureUaToggle(ui.uaSeasonToggle);
      ui.uaSeasonInput.addEventListener('focus', activateSeason);
      ui.uaSeasonInput.addEventListener('click', activateSeason);
    }
    if (ui.uaEpisodeInput) {
      const activateEpisode = () => ensureUaToggle(ui.uaEpisodeToggle);
      ui.uaEpisodeInput.addEventListener('focus', activateEpisode);
      ui.uaEpisodeInput.addEventListener('click', activateEpisode);
    }
    if (ui.uploadAssistantModal) {
      ui.uploadAssistantModal.querySelectorAll('.ua-arg-btn[data-tooltip]').forEach((btn) => {
        if (btn.dataset.tooltipBound === '1') {
          return;
        }
        btn.dataset.tooltipBound = '1';
        btn.addEventListener('mouseenter', () => showUaTooltip(btn));
        btn.addEventListener('focus', () => showUaTooltip(btn));
        btn.addEventListener('mouseleave', hideUaTooltip);
        btn.addEventListener('blur', hideUaTooltip);
      });
      ui.uploadAssistantModal.addEventListener('scroll', hideUaTooltip, true);
      window.addEventListener('resize', hideUaTooltip);
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
      ui.uaCopyLogBtn.addEventListener('click', copyUaLog);
    }
    if (ui.uaOpenFolderBtn) {
      ui.uaOpenFolderBtn.addEventListener('click', openUaFolder);
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
  };

  return {
    bindEvents,
    openUploadAssistantModal,
    closeUploadAssistantModal,
    openUaUpdateModal,
    closeUaUpdateModal,
    startUaUpdate,
    sendUaUpdateInput,
    openUaConfigGeneratorTerminal,
    openUaHealthModal,
    closeUaHealthModal,
    refreshUaHealthModal,
    checkUaVersion,
    updateUaControlsState,
    updateUaServiceOptions,
    buildUploadAssistantArgs,
    appendUaLog,
    appendUaUpdateLog,
    appendUaUpdateSystemLine,
    setUaStatus,
    setUaUpdateStatus,
    updateUaUpdateControlsState,
    getUploadAssistantTargetPath,
    copyUaLog,
    openUaFolder
  };
}
