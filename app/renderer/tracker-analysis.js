import { LANG_MAP } from './constants.js';
import { normalizeLangTag, getTrackLang, parseChannels, mapAudioCodec, scoreAudioTrack } from './media-utils.js';

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

function extractSourceFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (!upper) {
    return '';
  }
  if (upper.includes('UHD') && (upper.includes('BLURAY') || upper.includes('BLU-RAY'))) {
    return 'UHD BluRay';
  }
  if (upper.includes('BLURAY') || upper.includes('BLU-RAY')) {
    return 'BluRay';
  }
  if (upper.includes('WEB-DL') || upper.includes('WEBDL')) {
    return 'WEB-DL';
  }
  if (upper.includes('WEBRIP')) {
    return 'WEBRip';
  }
  if (upper.includes('HDTV')) {
    return 'HDTV';
  }
  if (upper.includes('DVD')) {
    return 'DVD';
  }
  return '';
}

const LANGUAGE_VALUES = new Set(Object.values(LANG_MAP));
const LANGUAGE_KEYS = new Set(Object.keys(LANG_MAP));

function extractLangsFromName(name) {
  const raw = String(name || '').toLowerCase();
  if (!raw) {
    return [];
  }
  const tokens = raw.split(/[^a-z]+/).filter(Boolean);
  const langs = [];
  for (const token of tokens) {
    if (LANGUAGE_KEYS.has(token)) {
      langs.push(normalizeLangTag(token));
      continue;
    }
    if (token.length <= 3) {
      const upper = token.toUpperCase();
      if (LANGUAGE_VALUES.has(upper)) {
        langs.push(upper);
      }
    }
  }
  return [...new Set(langs.filter(Boolean))];
}

function extractAudioFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (!upper) {
    return { codec: '', channels: '' };
  }
  let codec = '';
  if (/DTS[\s._-]*HD[\s._-]*MA/.test(upper)) {
    codec = 'DTS-HD MA';
  } else if (/TRUEHD/.test(upper)) {
    codec = 'TrueHD';
  } else if (/(DDP|DD\+|E-?AC-?3)/.test(upper)) {
    codec = 'DD+';
  } else if (/\bDD\b/.test(upper)) {
    codec = 'DD';
  } else if (/\bAC3\b/.test(upper)) {
    codec = 'AC3';
  } else if (/\bDTS\b/.test(upper)) {
    codec = 'DTS';
  } else if (/\bAAC\b/.test(upper)) {
    codec = 'AAC';
  } else if (/\bFLAC\b/.test(upper)) {
    codec = 'FLAC';
  }
  const channelMatch = upper.match(/\b(7\.1|5\.1|2\.0|1\.0)\b/);
  return { codec, channels: channelMatch ? channelMatch[1] : '' };
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
    const fileCount = Number.parseInt(attrs.num_file || attrs.files_count || '', 10);
    const hasMultipleFiles = Number.isFinite(fileCount)
      ? fileCount > 1
      : Array.isArray(attrs.files) && attrs.files.length > 1;
    const fileHasEpisode = Boolean(fileName && /S\d{1,2}E\d{1,2}/i.test(fileName));
    const nameForGuess = !hasMultipleFiles && fileHasEpisode ? fileName : name;
    const guess = metadataTools.guessMetadataFromName(nameForGuess || name);
    const typeHint = hasMultipleFiles
      ? 'tv-season'
      : deriveTypeHint(attrs.category, guess);

    state.targetPath = link;
    state.kind = 'tracker';
    state.videoFiles = [];
    state.mainVideo = fileName || name;
    state.mediaInfo = mediaInfo;
    state.trackerMediaInfoText = mediaInfoText;
    state.trackerData = payload;
    state.trackerId = payload?.id || '';
    state.trackerName = name;
    state.trackerVideoCodecFallback = '';
    state.trackerIdMismatch = null;
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
    }

    const inferredVideo = extractVideoCodecFromName(nameForGuess || name, trackerFormat);
    if (inferredVideo && !ui.videoCodecInput.value.trim()) {
      setInputAuto(ui.videoCodecInput, inferredVideo);
      state.trackerVideoCodecFallback = inferredVideo;
      logDebug?.('tracker codec fallback', {
        inferred: inferredVideo,
        applied: ui.videoCodecInput.value || ''
      });
    }
    const inferredSource = extractSourceFromName(nameForGuess || name);
    if (inferredSource && !ui.sourceInput.value.trim()) {
      setInputAuto(ui.sourceInput, inferredSource);
    }

    const audioTracks = Array.isArray(mediaInfo?.media?.track)
      ? mediaInfo.media.track.filter((track) => track['@type'] === 'Audio')
      : [];
    const audioLangs = audioTracks
      .map((track) => normalizeLangTag(getTrackLang(track)))
      .filter(Boolean);
    const nameLangs = extractLangsFromName(nameForGuess || name || fileName);
    const finalLangs = audioLangs.length ? audioLangs : nameLangs;
    if (finalLangs.length && (!ui.languageTagInput.dataset.manual || ui.languageTagInput.dataset.manual === 'false')) {
      const computedLang = metadataTools.buildLanguageTag(finalLangs, ui.originalLanguageInput.value);
      if (computedLang) {
        setInputAuto(ui.languageTagInput, computedLang);
      }
    }

    let inferredAudioCodec = '';
    let inferredAudioChannels = '';
    if (audioTracks.length) {
      const preferred = audioTracks.filter((track) => normalizeLangTag(getTrackLang(track)) === 'ITA');
      const selectionPool = preferred.length ? preferred : audioTracks;
      const best = selectionPool.reduce((bestTrack, track) => {
        if (!bestTrack) {
          return track;
        }
        return scoreAudioTrack(track) > scoreAudioTrack(bestTrack) ? track : bestTrack;
      }, null);
      if (best) {
        inferredAudioCodec = mapAudioCodec(best);
        inferredAudioChannels = parseChannels(best.Channels || best['Channel(s)'] || '');
      }
    }
    if (!inferredAudioCodec || !inferredAudioChannels) {
      const fromName = extractAudioFromName(nameForGuess || name);
      inferredAudioCodec = inferredAudioCodec || fromName.codec;
      inferredAudioChannels = inferredAudioChannels || fromName.channels;
    }
    if (inferredAudioCodec && !ui.audioCodecInput.value.trim()) {
      setInputAuto(ui.audioCodecInput, inferredAudioCodec);
    }
    if (inferredAudioChannels && !ui.audioChannelsInput.value.trim()) {
      setInputAuto(ui.audioChannelsInput, inferredAudioChannels);
    }

    updateVisibility();
    await fetchMetadataAuto({
      title: guess.title,
      year: guess.year,
      season: guess.season,
      episode: guess.episode,
      typeHint
    });

    const expectedYear = String(attrs.release_year || guess.year || '').trim();
    const resolvedMeta = state.metadata || {};
    const resolvedTitle = String(resolvedMeta.title || ui.titleInput.value || '').trim();
    const resolvedYear = String(resolvedMeta.year || ui.yearInput.value || '').trim();
    const trackerTitle = String(nameForGuess || name || '').trim();
    const isTvType = typeHint.startsWith('tv') || typeHint.startsWith('anime');
    const normalizeTitle = (value) => {
      const cleaned = metadataTools.cleanSearchTitle(String(value || ''));
      return cleaned
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    };
    const titleLooksSimilar = (a, b) => {
      const left = normalizeTitle(a);
      const right = normalizeTitle(b);
      if (!left || !right) {
        return true;
      }
      if (left === right || left.includes(right) || right.includes(left)) {
        return true;
      }
      const leftTokens = left.split(/\s+/).filter(Boolean);
      const rightTokens = right.split(/\s+/).filter(Boolean);
      if (!leftTokens.length || !rightTokens.length) {
        return true;
      }
      const rightSet = new Set(rightTokens);
      const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
      const ratio = overlap / Math.max(leftTokens.length, rightTokens.length);
      return ratio >= 0.5;
    };
    const mismatchReasons = [];
    if (expectedYear && resolvedYear && expectedYear !== resolvedYear) {
      mismatchReasons.push('year');
    }
    const titleBasis = isTvType ? (guess.title || trackerTitle) : trackerTitle;
    if (titleBasis && resolvedTitle && !titleLooksSimilar(titleBasis, resolvedTitle)) {
      mismatchReasons.push('title');
    }
    const idProvided = Boolean(attrs.imdb_id || attrs.tmdb_id);
    if (idProvided && mismatchReasons.length) {
      state.trackerIdMismatch = {
        active: true,
        reasons: mismatchReasons,
        provided: {
          imdb: attrs.imdb_id || '',
          tmdb: attrs.tmdb_id || '',
          tvdb: attrs.tvdb_id || '',
          mal: attrs.mal_id || ''
        },
        resolved: {
          title: resolvedTitle,
          year: resolvedYear
        },
        expected: {
          title: trackerTitle,
          year: expectedYear
        },
        usedFallback: false
      };
      logDebug?.('tracker id mismatch', {
        reasons: mismatchReasons,
        provided: state.trackerIdMismatch.provided,
        expected: state.trackerIdMismatch.expected,
        resolved: state.trackerIdMismatch.resolved
      });

      const skipFallback = isTvType && mismatchReasons.length === 1 && mismatchReasons[0] === 'year';
      if (!skipFallback) {
        const imdbBackup = ui.imdbInput.value;
        ui.imdbInput.value = '';
        ui.imdbInput.dataset.manual = 'false';

        const anchorYear = expectedYear;
        const parseYear = (value) => {
          const parsed = Number.parseInt(String(value || ''), 10);
          return Number.isFinite(parsed) ? parsed : null;
        };
        const isYearCoherent = (candidateYear) => {
          if (!anchorYear) {
            return true;
          }
          const anchor = parseYear(anchorYear);
          const candidate = parseYear(candidateYear);
          if (!anchor || !candidate) {
            return false;
          }
          return Math.abs(candidate - anchor) <= 5;
        };
        const tryFallback = async (yearValue) => {
          const yearBackup = ui.yearInput.value;
          if (!yearValue) {
            ui.yearInput.value = '';
            ui.yearInput.dataset.manual = 'false';
          }
          await fetchMetadataAuto({
            title: guess.title,
            year: yearValue,
            season: guess.season,
            episode: guess.episode,
            typeHint
          });
          if (!yearValue) {
            ui.yearInput.value = yearBackup;
          }
          const fallbackTitle = String(state.metadata?.title || '').trim();
          const fallbackYear = String(state.metadata?.year || '').trim();
          const fallbackImdb = state.metadata?.imdbId || '';
          const fallbackTmdb = state.metadata?.tmdbId || '';
          const hasFallback = Boolean(fallbackTitle || fallbackImdb || fallbackTmdb);
          const yearOk = isYearCoherent(fallbackYear);
          const titleOk = titleLooksSimilar(titleBasis, fallbackTitle);
          return {
            ok: hasFallback && yearOk && titleOk,
            title: fallbackTitle,
            year: fallbackYear,
            imdb: fallbackImdb,
            tmdb: fallbackTmdb,
            tvdb: state.metadata?.tvdbSeriesId || state.metadata?.tvdbId || '',
            mal: state.metadata?.malId || ''
          };
        };

        let fallbackResult = await tryFallback(guess.year || anchorYear);
        if (!fallbackResult.ok) {
          fallbackResult = await tryFallback('');
        }

        state.trackerIdMismatch.usedFallback = Boolean(fallbackResult.ok);
        state.trackerIdMismatch.fallback = {
          title: fallbackResult.title,
          year: fallbackResult.year,
          imdb: fallbackResult.imdb,
          tmdb: fallbackResult.tmdb,
          tvdb: fallbackResult.tvdb,
          mal: fallbackResult.mal
        };
        if (fallbackResult.ok) {
          if (fallbackResult.title) {
            setInputAuto(ui.titleInput, fallbackResult.title);
          }
          if (fallbackResult.year) {
            setInputAuto(ui.yearInput, fallbackResult.year);
          }
          if (fallbackResult.imdb) {
            setInputAuto(ui.imdbInput, String(fallbackResult.imdb));
          }
          if (fallbackResult.tmdb) {
            state.metadata = {
              ...(state.metadata || {}),
              tmdbId: String(fallbackResult.tmdb)
            };
          }
        } else if (imdbBackup) {
          ui.imdbInput.value = imdbBackup;
        }
        if (!fallbackResult.ok) {
          const safeTitle = guess.title || trackerTitle || resolvedTitle;
          if (safeTitle) {
            setInputAuto(ui.titleInput, safeTitle);
          }
          if (anchorYear) {
            setInputAuto(ui.yearInput, anchorYear);
          }
          state.metadata = {
            ...(state.metadata || {}),
            title: safeTitle,
            year: anchorYear || '',
            imdbId: '',
            tmdbId: '',
            tvdbSeriesId: '',
            tvdbId: '',
            malId: ''
          };
        }
      }
    }

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
        videoCodec: ui.videoCodecInput.value.trim(),
        source: ui.sourceInput.value.trim()
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
