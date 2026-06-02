// Auto-detect flow: parse names, set inputs, and fetch metadata when possible.
export function createAutoDetectFlow({
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
  fetchMetadata,
  onAmbiguity,
  showToast
}) {
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
      const filenameHint = state.mainVideo
        ? getPathBaseName(state.mainVideo)
        : getPathBaseName(state.targetPath || '');
      const payload = {
        imdbId: ui.imdbInput.value.trim(),
        tvdbId: isTvType ? ui.tvdbInput.value.trim() : '',
        malId: ui.malInput.value.trim(),
        title: guess.title || ui.titleInput.value.trim(),
        year: guess.year || ui.yearInput.value.trim(),
        season: isTvType ? (guess.season || ui.seasonInput.value.trim()) : '',
        episode: isTvType ? (guess.episode || ui.episodeInput.value.trim()) : '',
        typeHint,
        filename: filenameHint,
        omdbKey: settings.omdbKey,
        tmdbKey: settings.tmdbKey,
        tvdbKey: settings.tvdbKey,
        preferredLanguage: Object.prototype.hasOwnProperty.call(settings, 'preferredLanguage')
          ? settings.preferredLanguage
          : 'it-IT'
      };

      const data = await fetchMetadata(payload);
      logDebug('fetchMetadata payload', payload);
      logDebug('fetchMetadata result', data);
      let finalData = data;

      // Disambiguazione: se ci sono più candidati con anni diversi, chiedi all'utente
      if (data?.candidates?.length > 1 && typeof onAmbiguity === 'function') {
        logDebug('fetchMetadata: ambiguità rilevata', { candidates: data.candidates });
        const chosen = await onAmbiguity(data.candidates);
        if (chosen) {
          const disambPayload = { ...payload, forceTmdbId: String(chosen.id), forceTmdbType: chosen.type };
          logDebug('fetchMetadata: disambiguazione', { chosen });
          const disambData = await fetchMetadata(disambPayload);
          logDebug('fetchMetadata: risultato disambiguato', disambData);
          finalData = disambData;
        }
      }

      const hasMatch = Boolean(
        finalData?.title || finalData?.tmdbId || finalData?.imdbId || finalData?.tvdbSeriesId
      );
      if (!hasMatch && payload.title) {
        const cleanedTitle = metadataTools.cleanSearchTitle(payload.title);
        if (cleanedTitle && cleanedTitle !== payload.title) {
          const retryPayload = { ...payload, title: cleanedTitle };
          logDebug('fetchMetadata retry (clean title)', retryPayload);
          const retryData = await fetchMetadata(retryPayload);
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
      const animeRomaji = finalData?.animeRomaji || '';
      let resolvedTitle = finalData.title || '';
      if (finalData?.isAnime && animeRomaji && hasCjkChars(resolvedTitle)) {
        resolvedTitle = animeRomaji;
      }
      if (resolvedTitle) {
        setIfAuto(ui.titleInput, resolvedTitle);
      }
      if (finalData.year) {
        setIfAuto(ui.yearInput, finalData.year);
      }
      if (finalData.imdbId) {
        setIfAuto(ui.imdbInput, finalData.imdbId);
      }
      const resolvedTvdbId = finalData.tvdbSeriesId || finalData.tvdbId || '';
      if (resolvedTvdbId) {
        setIfAuto(ui.tvdbInput, String(resolvedTvdbId));
      }
      if (finalData.malId) {
        setIfAuto(ui.malInput, String(finalData.malId));
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
        finalData?.title ||
          finalData?.tmdbId ||
          finalData?.imdbId ||
          finalData?.tvdbSeriesId ||
          finalData?.malId
      );
      if (isTvType && finalHasMatch && !resolvedTvdbId && !payload.tvdbId && typeof showToast === 'function') {
        showToast('ID TVDB non trovato automaticamente. Inseriscilo manualmente se richiesto dal tracker.', 'warning');
      }
      if (!finalHasMatch) {
        setFetchBadge('error', 'Auto matching fallito');
      } else {
        const usedManualId = Boolean(payload.imdbId || payload.tvdbId || payload.malId);
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
      const discStructure = isDiscStructure();

      guess.title = folderGuess.title || firstFileGuess.title || '';
      guess.year = folderGuess.year || firstFileGuess.year || '';
      guess.season = folderGuess.season || firstFileGuess.season || '';
      guess.typeHint = discStructure && !guess.season ? 'movie' : 'tv-season';

      setIfAuto(ui.typeSelect, guess.typeHint);
      setIfAuto(ui.titleInput, guess.title);
      setIfAuto(ui.yearInput, guess.year);
      if (guess.season && guess.typeHint === 'tv-season') {
        setIfAuto(ui.seasonInput, guess.season);
      }
      // Auto-detect multi-episode season packs by scanning file names.
      if (ui.multiEpisodeToggle && guess.typeHint === 'tv-season' && state.videoFiles.length) {
        const hasMulti = state.videoFiles.some((filePath) => {
          const range = metadataTools.parseSeasonEpisodeRange(getPathBaseName(filePath));
          return Boolean(range.episodeEnd);
        });
        setIfAuto(ui.multiEpisodeToggle, hasMulti);
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
        if (ui.multiEpisodeToggle && Object.prototype.hasOwnProperty.call(guess, 'episodeEnd')) {
          const isMulti = Boolean(guess.episodeEnd);
          setIfAuto(ui.multiEpisodeToggle, isMulti);
          if (isMulti) {
            setIfAuto(ui.episodeTitleInput, '');
          }
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

  return {
    fetchMetadataAuto,
    autoDetectFromPath,
    updateAutoDetectControls,
    manualDetectFromInputs
  };
}
