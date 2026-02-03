const SECTION_HEADER_PATTERN = /^(general|video|audio|text|menu)(\s+#\d+)?$/i;

function parseTorrentId(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/torrents\/(\d+)/i) || url.pathname.match(/\/api\/torrents\/(\d+)/i);
    return match ? match[1] : '';
  } catch {
    const match = raw.match(/\/torrents\/(\d+)/i) || raw.match(/\/api\/torrents\/(\d+)/i);
    return match ? match[1] : '';
  }
}

function mapKeyValue(track, key, value) {
  if (!key) {
    return;
  }
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) {
    return;
  }
  const normalizedKey = key.replace(/\s+/g, '_');
  track[key] = trimmedValue;
  track[normalizedKey] = trimmedValue;

  const keyLower = key.toLowerCase();
  if (keyLower === 'file size') {
    track['FileSize/String'] = trimmedValue;
    track.FileSize = trimmedValue;
  } else if (keyLower === 'overall bit rate') {
    track['OverallBitRate/String'] = trimmedValue;
    track.OverallBitRate = trimmedValue;
  } else if (keyLower === 'duration') {
    track['Duration/String'] = trimmedValue;
    track.Duration = trimmedValue;
  } else if (keyLower === 'format profile') {
    track.Format_Profile = trimmedValue;
    track['Format_Profile/String'] = trimmedValue;
    const [profile, level] = trimmedValue.split('@').map((part) => part.trim());
    if (profile) {
      track.Format_Profile = profile;
    }
    if (level) {
      track.Format_Level = level.replace(/^L/i, '');
      track['Format_Level/String'] = track.Format_Level;
    }
  } else if (keyLower === 'commercial name') {
    track.Format_Commercial = trimmedValue;
    track.Format_Commercial_IfAny = trimmedValue;
  } else if (keyLower === 'writing library') {
    track.Writing_library = trimmedValue;
    track.Encoded_Library = trimmedValue;
  } else if (keyLower === 'encoding settings') {
    track.Encoding_Settings = trimmedValue;
    track['Encoding_Settings/String'] = trimmedValue;
  } else if (keyLower === 'bit rate') {
    track['BitRate/String'] = trimmedValue;
    track.BitRate = trimmedValue;
  } else if (keyLower === 'channel(s)') {
    track.Channels = trimmedValue;
  } else if (keyLower === 'hdr format') {
    track.HDR_Format = trimmedValue;
    track['HDR format'] = trimmedValue;
  } else if (keyLower === 'hdr format compatibility') {
    track.HDR_Format_Compatibility = trimmedValue;
    track['HDR format compatibility'] = trimmedValue;
  } else if (keyLower === 'hdr format string') {
    track.HDR_Format_String = trimmedValue;
    track['HDR format string'] = trimmedValue;
  } else if (keyLower === 'original source medium') {
    track.OriginalSourceMedium = trimmedValue;
    track['Original source medium'] = trimmedValue;
  }
}

function parseMediaInfoText(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return null;
  }
  const tracks = [];
  let current = null;

  const pushCurrent = () => {
    if (current && current['@type']) {
      tracks.push(current);
    }
  };

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    if (SECTION_HEADER_PATTERN.test(trimmed)) {
      pushCurrent();
      const type = trimmed.split(/\s+/)[0];
      current = { '@type': type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() };
      return;
    }
    if (!current) {
      return;
    }
    const parts = trimmed.split(/\s*:\s*/);
    if (parts.length < 2) {
      return;
    }
    const key = parts.shift();
    const value = parts.join(':');
    mapKeyValue(current, key, value);
  });

  pushCurrent();
  return tracks.length ? { media: { track: tracks } } : null;
}

function formatImdbId(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  const padded = digits.length < 7 ? digits.padStart(7, '0') : digits;
  return `tt${padded}`;
}

function deriveTypeHint(category, guess) {
  const categoryText = String(category || '').toLowerCase();
  if (categoryText.includes('movie')) {
    return 'movie';
  }
  if (categoryText.includes('tv') || categoryText.includes('serie') || categoryText.includes('series')) {
    if (guess?.season && guess?.episode) {
      return 'tv-episode';
    }
    return 'tv-season';
  }
  if (guess?.season && guess?.episode) {
    return 'tv-episode';
  }
  if (guess?.season) {
    return 'tv-season';
  }
  return 'movie';
}

function extractVideoCodecFromName(name, releaseFormat) {
  const upper = String(name || '').toUpperCase();
  if (!upper) {
    return '';
  }
  const isWeb = releaseFormat === 'WEB-DL' || releaseFormat === 'WEBRip';
  const isEncode = releaseFormat === 'Encode';
  if (upper.includes('X265') || upper.includes('H.265') || upper.includes('HEVC')) {
    if (isEncode) {
      return 'x265';
    }
    if (isWeb) {
      return 'H.265';
    }
    return 'HEVC';
  }
  if (upper.includes('X264') || upper.includes('H.264') || upper.includes('AVC')) {
    if (isEncode) {
      return 'x264';
    }
    if (isWeb) {
      return 'H.264';
    }
    return 'AVC';
  }
  if (upper.includes('AV1')) {
    return 'AV1';
  }
  return '';
}

export function createTrackerAnalysis({
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
  setInputAuto
}) {
  const openModal = () => {
    if (!ui.trackerModal) {
      return;
    }
    ui.trackerModal.classList.remove('hidden');
    if (ui.trackerUrlInput) {
      ui.trackerUrlInput.focus();
    }
  };

  const closeModal = () => {
    if (!ui.trackerModal) {
      return;
    }
    ui.trackerModal.classList.add('hidden');
  };

  const setAnalyzeLoading = (isLoading) => {
    if (!ui.trackerAnalyzeBtn) {
      return;
    }
    ui.trackerAnalyzeBtn.disabled = isLoading;
    ui.trackerAnalyzeBtn.textContent = isLoading ? 'Analisi…' : 'Analizza';
  };

  async function applyTrackerData(link, payload) {
    resetAllInputs({ skipPreview: true });

    const attrs = payload?.attributes || {};
    const name = attrs.name || '';
    const fileName = Array.isArray(attrs.files) ? attrs.files[0]?.name || '' : '';
    const mediaInfoText = attrs.media_info || '';
    const mediaInfo = parseMediaInfoText(mediaInfoText);
    const nameForGuess = fileName && /S\d{1,2}E\d{1,2}/i.test(fileName) ? fileName : name;
    const guess = metadataTools.guessMetadataFromName(nameForGuess || name);
    const typeHint = deriveTypeHint(attrs.category, guess);

    state.targetPath = link;
    state.kind = 'tracker';
    state.videoFiles = [];
    state.mainVideo = fileName || name;
    state.mediaInfo = mediaInfo;
    state.trackerMediaInfoText = mediaInfoText;
    state.trackerData = payload;
    state.trackerId = payload?.id || '';
    state.trackerName = name;
    state.metadata = null;
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
    state.episodeMap = {};
    state.screenshots = [];
    state.lastTorrentPath = '';

    setSelectedPath(link);
    setScanHint('Torrent:', name || `ID ${state.trackerId || ''}`.trim());
    if (ui.resetSourceBtn) {
      ui.resetSourceBtn.classList.remove('hidden');
    }
    setMediaInfoBadgeVisible(Boolean(mediaInfoText));

    if (ui.renameFileCheckbox) {
      ui.renameFileCheckbox.checked = false;
      ui.renameFileCheckbox.disabled = true;
    }
    if (ui.renameFolderCheckbox) {
      ui.renameFolderCheckbox.checked = false;
      ui.renameFolderCheckbox.disabled = true;
    }
    if (ui.openUploadAssistantBtn) {
      ui.openUploadAssistantBtn.disabled = true;
    }
    if (ui.openUploadWizardBtn) {
      ui.openUploadWizardBtn.disabled = true;
    }

    if (typeHint) {
      setIfAuto(ui.typeSelect, typeHint);
    }
    const trackerFormat = attrs.type ? String(attrs.type) : '';
    if (trackerFormat) {
      setIfAuto(ui.formatSelect, trackerFormat);
    }
    if (attrs.resolution) {
      setInputAuto(ui.resolutionInput, String(attrs.resolution));
    }
    if (guess.title) {
      setIfAuto(ui.titleInput, guess.title);
    }
    if (attrs.release_year) {
      setIfAuto(ui.yearInput, String(attrs.release_year));
    } else if (guess.year) {
      setIfAuto(ui.yearInput, guess.year);
    }
    if (guess.season) {
      setIfAuto(ui.seasonInput, guess.season);
    }
    if (guess.episode) {
      setIfAuto(ui.episodeInput, guess.episode);
    }
    if (guess.episodeTitle) {
      setIfAuto(ui.episodeTitleInput, guess.episodeTitle);
    }

    const imdbId = formatImdbId(attrs.imdb_id);
    if (imdbId) {
      setInputAuto(ui.imdbInput, imdbId);
    }
    if (attrs.tvdb_id) {
      setInputAuto(ui.tvdbInput, String(attrs.tvdb_id));
    }
    if (attrs.mal_id) {
      setInputAuto(ui.malInput, String(attrs.mal_id));
    }

    updateTagSuggestion(loadSettings());
    updateTagOptions(loadSettings());

    if (mediaInfo) {
      metadataTools.fillFromMediaInfo();
    } else {
      const inferredVideo = extractVideoCodecFromName(nameForGuess || name, trackerFormat);
      if (inferredVideo) {
        setInputAuto(ui.videoCodecInput, inferredVideo);
      }
    }

    updateVisibility();
    await fetchMetadataAuto({
      title: guess.title,
      year: guess.year,
      season: guess.season,
      episode: guess.episode,
      typeHint
    });

    logDebug?.('tracker title suggestion inputs', {
      trackerId: state.trackerId || '',
      name,
      fileName,
      usedForGuess: nameForGuess || name,
      typeHint,
      trackerType: attrs.type || '',
      trackerResolution: attrs.resolution || '',
      trackerYear: attrs.release_year || '',
      trackerIds: {
        imdb: attrs.imdb_id || '',
        tmdb: attrs.tmdb_id || '',
        tvdb: attrs.tvdb_id || '',
        mal: attrs.mal_id || ''
      },
      guess,
      resolved: {
        title: ui.titleInput.value.trim(),
        year: ui.yearInput.value.trim(),
        season: ui.seasonInput.value.trim(),
        episode: ui.episodeInput.value.trim(),
        format: ui.formatSelect.value,
        resolution: ui.resolutionInput.value.trim(),
        videoCodec: ui.videoCodecInput.value.trim()
      }
    });

    schedulePreview();
  }

  async function handleAnalyze() {
    const link = String(ui.trackerUrlInput?.value || '').trim();
    const torrentId = parseTorrentId(link);
    if (!link || !torrentId) {
      showToast('Inserisci un link torrent valido (es. /torrents/123).');
      return;
    }
    const settings = loadSettings();
    const baseUrl = String(settings?.unit3dBaseUrl || '').trim();
    const apiKey = String(settings?.unit3dApiKey || '').trim();
    if (!baseUrl || !apiKey) {
      showToast('Configura base URL e API key Unit3D nelle impostazioni.');
      return;
    }

    setAnalyzeLoading(true);
    try {
      const result = await window.api.unit3dFetchTorrent({
        baseUrl,
        apiKey,
        torrentId
      });
      logDebug?.('unit3d torrent fetch', {
        ok: Boolean(result?.ok),
        status: result?.status || 0,
        id: torrentId
      });
      if (!result?.ok || !result?.data) {
        throw new Error(result?.error || 'Risposta tracker non valida.');
      }
      await applyTrackerData(link, result.data);
      closeModal();
    } catch (error) {
      showToast(`Errore analisi tracker: ${error.message || error}`);
    } finally {
      setAnalyzeLoading(false);
    }
  }

  function init() {
    if (!ui.trackerModal || !ui.trackerOpenBtn) {
      return;
    }
    ui.trackerOpenBtn.addEventListener('click', openModal);
    ui.trackerAnalyzeBtn?.addEventListener('click', handleAnalyze);
    ui.trackerCloseBtn?.addEventListener('click', closeModal);
    ui.trackerModal.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);
    ui.trackerUrlInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAnalyze();
      }
    });
  }

  return { init };
}
