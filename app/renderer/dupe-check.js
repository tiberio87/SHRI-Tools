import {
  UNIT3D_CATEGORY_ID,
  SHRI_TYPE_ID,
  UNIT3D_RESOLUTION_ID
} from './constants.js';
import { formatBytes } from './media-utils.js';
import { getPathBaseName, stripExtension } from './path-utils.js';

function normalizeNumericId(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const match = raw.match(/(\d+)/);
  return match ? match[1] : '';
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

function getSearchMapping(form, settings) {
  const isTv = form.type.includes('tv') || form.type.includes('anime');
  const categoryKey = isTv ? 'TV' : 'MOVIE';
  const categoryOverrides = parseOverrideMap(
    settings.unit3dCategoryOverrides,
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
    settings.unit3dTypeOverrides,
    (key) => key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  );
  const typeMap = { ...SHRI_TYPE_ID, ...typeOverrides };
  const typeId = typeKey ? typeMap[typeKey] || '' : '';
  const resolutionOverrides = parseOverrideMap(
    settings.unit3dResolutionOverrides,
    (key) => key.trim().toLowerCase()
  );
  const resolutionMap = { ...UNIT3D_RESOLUTION_ID, ...resolutionOverrides };
  const resolutionId = form.resolution ? resolutionMap[form.resolution] || '' : '';
  return {
    isTv,
    categoryId: String(categoryId || ''),
    typeId: String(typeId || ''),
    resolutionId: String(resolutionId || ''),
    season: isTv ? String(form.season || '') : ''
  };
}

function buildDupeItems(rawItems, baseUrl) {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  return rawItems.map((entry) => {
    const attrs = entry?.attributes || {};
    const name = String(attrs.name || entry?.name || '').trim();
    const size = attrs.size ?? entry?.size ?? '';
    const type = String(attrs.type || entry?.type || '').trim();
    const res = String(attrs.resolution || entry?.res || '').trim();
    const trumpable = Boolean(attrs.trumpable ?? entry?.trumpable);
    const internal = Boolean(attrs.internal ?? entry?.internal);
    const details = String(attrs.details_link || entry?.link || '').trim();
    const id = entry?.id || attrs.id;
    const tmdbId = normalizeNumericId(attrs.tmdb_id || attrs.tmdbId || entry?.tmdb_id || entry?.tmdbId);
    const imdbId = normalizeNumericId(attrs.imdb_id || attrs.imdbId || entry?.imdb_id || entry?.imdbId);
    const tvdbId = normalizeNumericId(attrs.tvdb_id || attrs.tvdbId || entry?.tvdb_id || entry?.tvdbId);
    const filesRaw = Array.isArray(attrs.files)
      ? attrs.files
      : Array.isArray(entry?.files)
        ? entry.files
        : [];
    const files = filesRaw
      .map((file) => (typeof file === 'string' ? file : file?.name))
      .filter(Boolean)
      .map((file) => String(file));
    const fileCount = Number.isFinite(attrs.file_count)
      ? Number(attrs.file_count)
      : Number.isFinite(entry?.file_count)
        ? Number(entry.file_count)
        : files.length;
    const fallbackLink = baseUrl && id ? `${baseUrl.replace(/\/+$/, '')}/torrents/${id}` : '';
    return {
      name,
      size,
      type,
      res,
      trumpable,
      internal,
      link: details || fallbackLink,
      files,
      file_count: fileCount,
      tmdbId,
      imdbId,
      tvdbId
    };
  });
}

function normalizeFilename(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/-/g, ' -')
    .replace(/\./g, ' ');
}

function filterByIds(items, { tmdbId, imdbId, tvdbId }) {
  const tmdb = normalizeNumericId(tmdbId);
  const imdb = normalizeNumericId(imdbId);
  const tvdb = normalizeNumericId(tvdbId);
  if (!tmdb && !imdb && !tvdb) {
    return {
      items,
      stats: { matched: 0, mismatched: 0, missing: items.length }
    };
  }
  let matched = 0;
  let mismatched = 0;
  let missing = 0;
  const filtered = items.filter((entry) => {
    const entryTmdb = normalizeNumericId(entry.tmdbId);
    const entryImdb = normalizeNumericId(entry.imdbId);
    const entryTvdb = normalizeNumericId(entry.tvdbId);
    const hasAny = Boolean(entryTmdb || entryImdb || entryTvdb);
    if (!hasAny) {
      missing += 1;
      return true;
    }
    if (tmdb && entryTmdb && tmdb !== entryTmdb) {
      mismatched += 1;
      return false;
    }
    if (imdb && entryImdb && imdb !== entryImdb) {
      mismatched += 1;
      return false;
    }
    if (tvdb && entryTvdb && tvdb !== entryTvdb) {
      mismatched += 1;
      return false;
    }
    matched += 1;
    return true;
  });
  return {
    items: filtered,
    stats: { matched, mismatched, missing }
  };
}

function normalizeHdrTerms(raw) {
  if (!raw) {
    return new Set();
  }
  const upper = String(raw).toUpperCase();
  const terms = new Set();
  if (upper.includes('DV') || upper.includes('DOVI')) {
    terms.add('DV');
  }
  if (upper.includes('HDR')) {
    terms.add('HDR');
  }
  return terms;
}

function hasMatchingHdr(fileHdr, targetHdr, meta) {
  const simplify = (hdrSet) => {
    const simplified = new Set();
    for (const entry of hdrSet) {
      const token = String(entry || '').toUpperCase();
      if (token.includes('HDR')) {
        simplified.add('HDR');
      }
      if (token.includes('DV')) {
        simplified.add('DV');
        const metaType = String(meta.type || '').toLowerCase();
        if (!metaType.includes('web')) {
          simplified.add('HDR');
        }
      }
    }
    return simplified;
  };

  let fileSimple = simplify(fileHdr);
  let targetSimple = simplify(targetHdr);
  const hasBoth = (set) => set.has('DV') && set.has('HDR');
  if (hasBoth(fileSimple)) {
    fileSimple = new Set(['HDR']);
  }
  if (hasBoth(targetSimple)) {
    targetSimple = new Set(['HDR']);
  }
  if (fileSimple.size !== targetSimple.size) {
    return false;
  }
  for (const value of fileSimple) {
    if (!targetSimple.has(value)) {
      return false;
    }
  }
  return true;
}

function isSeasonEpisodeMatch(filename, targetSeason, targetEpisode) {
  const seasonMatch = String(targetSeason || '').match(/[sS](\d+)/);
  const seasonValue = seasonMatch ? Number(seasonMatch[1]) : null;
  const episodeMatches = targetEpisode
    ? String(targetEpisode).match(/\d+/g) || []
    : [];
  const targetEpisodes = episodeMatches.map((ep) => Number(ep)).filter((ep) => Number.isFinite(ep));
  const seasonPattern = seasonValue != null ? new RegExp(`[sS]${String(seasonValue).padStart(2, '0')}`, 'i') : null;
  const episodePatterns = targetEpisodes.map(
    (ep) => new RegExp(`[eE]${String(ep).padStart(2, '0')}`, 'i')
  );
  const isSeasonPack = !/[eE]\d{2}/.test(filename);
  if (!targetEpisodes.length) {
    const seasonMatches = Boolean(seasonPattern && seasonPattern.test(filename));
    return [seasonMatches && isSeasonPack, seasonMatches];
  }
  if (seasonPattern) {
    if (isSeasonPack) {
      return [seasonPattern.test(filename), true];
    }
    if (episodePatterns.length) {
      return [
        seasonPattern.test(filename) && episodePatterns.some((pattern) => pattern.test(filename)),
        false
      ];
    }
  }
  return [false, false];
}

function hasWebDlToken(normalized) {
  return ['web-dl', 'web -dl', 'webdl', 'web dl'].some((token) => normalized.includes(token));
}

function buildDupeMeta({ form, state }) {
  const rawName = state.mainVideo || state.targetPath || '';
  const baseName = rawName ? stripExtension(getPathBaseName(rawName)) : '';
  const format = String(form.format || '');
  const type = format === 'WEB-DL'
    ? 'WEBDL'
    : format === 'WEBRip'
      ? 'WEBRIP'
      : format === 'Remux'
        ? 'REMUX'
        : format === 'Full Disc'
          ? 'DISC'
          : format === 'Encode'
            ? 'ENCODE'
            : format === 'HDTV'
              ? 'HDTV'
              : '';
  const hasDisc = Array.isArray(state.videoFiles) && state.videoFiles.some((filePath) =>
    /[\\\/](BDMV[\\\/]+STREAM|VIDEO_TS)[\\\/]/i.test(filePath || '')
  );
  const isDvd = Array.isArray(state.videoFiles) && state.videoFiles.some((filePath) =>
    /[\\\/]VIDEO_TS[\\\/]/i.test(filePath || '')
  );
  const filelist = Array.isArray(state.videoFiles) && state.videoFiles.length
    ? state.videoFiles
    : state.mainVideo
      ? [state.mainVideo]
      : [];
  const filenames = filelist.map((filePath) => getPathBaseName(filePath || ''));
  return {
    name: baseName,
    uuid: baseName || rawName,
    tag: String(form.tag || '').toLowerCase().replace(/-/g, ' '),
    type,
    format,
    resolution: String(form.resolution || ''),
    source: String(form.source || ''),
    season: form.season || '',
    episode: form.episode || '',
    category: form.type?.includes('tv') || form.type?.includes('anime') ? 'TV' : 'MOVIE',
    hdr: (form.hdrTokens || []).join(' '),
    uhd: Boolean(form.uhd),
    is_disc: hasDisc ? (isDvd ? 'DVD' : 'BDMV') : false,
    filelist,
    filenames
  };
}

function filterUaDupes(items, meta) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }
  const hasRepackInUuid = String(meta.uuid || '').toLowerCase().includes('repack');
  const targetResolution = String(meta.resolution || '').toLowerCase();
  const targetHdr = normalizeHdrTerms(meta.hdr);
  const tag = String(meta.tag || '');
  const isDvd = meta.is_disc === 'DVD';
  const isDvdrip = meta.type === 'DVDRIP';
  const webDl = meta.type === 'WEBDL';
  const isHdtv = meta.type === 'HDTV';
  const targetSource = String(meta.source || '');
  const skipResolution = isDvd || /DVD/i.test(targetSource) || isDvdrip;
  const remuxFlag = meta.format === 'Remux' || String(meta.name || '').toLowerCase().includes('remux');
  const uhdFlag = Boolean(meta.uhd) || String(meta.name || '').toLowerCase().includes('uhd');

  return items.filter((entry) => {
    const each = String(entry.name || '');
    const normalized = normalizeFilename(each);
    const files = Array.isArray(entry.files) ? entry.files : [];
    const fileCount = Number(entry.file_count || files.length || 0);
    const fileHdr = normalizeHdrTerms(normalized);

    if (!meta.is_disc) {
      for (const file of meta.filenames || []) {
        const fileLower = String(file || '').toLowerCase();
        if (!fileLower) {
          continue;
        }
        if (files.some((dupeFile) => String(dupeFile || '').toLowerCase().endsWith(fileLower))) {
          if (fileCount && fileCount === (meta.filelist || []).length) {
            return true;
          }
          return true;
        }
      }
    } else if (meta.is_disc && fileCount && fileCount < 2) {
      return false;
    }

    if (hasRepackInUuid && !normalized.includes('repack') && tag && normalized.includes(tag)) {
      return false;
    }

    if (remuxFlag && !normalized.includes('remux')) {
      return false;
    }
    if (!remuxFlag && normalized.includes('remux')) {
      return false;
    }

    if (uhdFlag && !normalized.includes('uhd')) {
      return false;
    }
    if (!uhdFlag && normalized.includes('uhd')) {
      return false;
    }

    if (webDl) {
      if (normalized.includes('hdtv') && !hasWebDlToken(normalized)) {
        return false;
      }
      if (
        ['blu-ray', 'blu ray', 'bluray', 'blu -ray'].some((token) => normalized.includes(token))
        && !hasWebDlToken(normalized)
      ) {
        return false;
      }
    }
    if (!webDl && hasWebDlToken(normalized)) {
      return false;
    }

    if (!skipResolution) {
      if (targetResolution && !normalized.includes(targetResolution)) {
        return false;
      }
      if (!hasMatchingHdr(fileHdr, targetHdr, meta)) {
        return false;
      }
    }

    if (isDvd && !normalized.includes('dvd') && /(?:1080|720|2160)/.test(normalized)) {
      return true;
    }

    if (meta.category === 'TV') {
      const [match] = isSeasonEpisodeMatch(normalized, meta.season, meta.episode);
      if (!match) {
        return false;
      }
    }

    if (isHdtv && hasWebDlToken(normalized)) {
      return true;
    }

    if (meta.is_disc && each.toLowerCase().endsWith('.m2ts')) {
      return true;
    }
    if (meta.is_disc && /\.\w{2,4}$/.test(each)) {
      return false;
    }

    return true;
  });
}

export function createDupeCheckTools({
  ui,
  state,
  loadSettings,
  getFormState,
  showToast,
  logDebug
}) {
  const dupeState = {
    key: '',
    status: 'idle',
    items: [],
    expanded: false,
    message: '',
    pendingTimer: null
  };

  function setStatus(status, message) {
    if (!ui.wizardDupeStatus) {
      return;
    }
    ui.wizardDupeStatus.textContent = message;
    ui.wizardDupeStatus.className = `wizard-dupe-status ${status}`;
  }

  function setBlockVisible(visible) {
    if (!ui.wizardDupeBlock) {
      return;
    }
    ui.wizardDupeBlock.classList.toggle('hidden', !visible);
  }

  function renderItems() {
    if (!ui.wizardDupeList) {
      return;
    }
    const limit = dupeState.expanded ? dupeState.items.length : 3;
    const visibleItems = dupeState.items.slice(0, limit);
    ui.wizardDupeList.innerHTML = '';

    if (dupeState.status === 'error') {
      const errorRow = document.createElement('div');
      errorRow.className = 'wizard-dupe-item';
      errorRow.textContent = dupeState.message || 'Verifica duplicati non disponibile.';
      ui.wizardDupeList.appendChild(errorRow);
    } else if (dupeState.status === 'loading') {
      const loadingRow = document.createElement('div');
      loadingRow.className = 'wizard-dupe-item';
      loadingRow.textContent = 'Attendi il completamento della verifica.';
      ui.wizardDupeList.appendChild(loadingRow);
    } else if (!visibleItems.length) {
      const empty = document.createElement('div');
      empty.className = 'wizard-dupe-item';
      empty.textContent = 'Nessun duplicato trovato.';
      ui.wizardDupeList.appendChild(empty);
    } else {
      visibleItems.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'wizard-dupe-item';

        const nameBtn = document.createElement('button');
        nameBtn.type = 'button';
        nameBtn.className = 'wizard-dupe-name';
        nameBtn.textContent = item.name || 'Release senza nome';
        if (item.link) {
          nameBtn.dataset.external = item.link;
        }

        const meta = document.createElement('div');
        meta.className = 'wizard-dupe-meta';
        const parts = [];
        if (item.res) {
          parts.push(item.res);
        }
        if (item.type) {
          parts.push(item.type);
        }
        if (item.size) {
          parts.push(formatBytes(item.size));
        }
        if (item.trumpable) {
          parts.push('Trumpable');
        }
        if (item.internal) {
          parts.push('Internal');
        }
        meta.textContent = parts.filter(Boolean).join(' · ');

        row.appendChild(nameBtn);
        if (meta.textContent) {
          row.appendChild(meta);
        }
        ui.wizardDupeList.appendChild(row);
      });
    }

    if (ui.wizardDupeMoreBtn) {
      const shouldShow = dupeState.items.length > 3;
      ui.wizardDupeMoreBtn.classList.toggle('hidden', !shouldShow);
      ui.wizardDupeMoreBtn.textContent = dupeState.expanded ? 'Mostra meno' : 'Mostra tutti';
    }
  }

  function setError(message) {
    dupeState.status = 'error';
    dupeState.items = [];
    dupeState.message = message;
    setStatus('error', message);
    renderItems();
  }

  function setLoading() {
    dupeState.status = 'loading';
    dupeState.items = [];
    dupeState.message = '';
    setStatus('loading', 'Verifica in corso…');
    renderItems();
  }

  function setOk(items) {
    dupeState.status = items.length ? 'dupe' : 'ok';
    dupeState.items = items;
    dupeState.message = '';
    if (items.length) {
      setStatus('warn', `Possibili duplicati trovati (${items.length})`);
    } else {
      setStatus('ok', 'Nessun duplicato trovato');
    }
    renderItems();
  }

  async function runWizardDupeCheck() {
    const isIntegrated = document.body.dataset.uploadMode !== 'ua';
    if (!isIntegrated || state.kind === 'tracker') {
      setBlockVisible(false);
      return;
    }

    setBlockVisible(true);
    if (state.autoDetectRunning) {
      setStatus('loading', 'In attesa dei metadati…');
      renderItems();
      if (dupeState.pendingTimer) {
        clearTimeout(dupeState.pendingTimer);
      }
      dupeState.pendingTimer = setTimeout(runWizardDupeCheck, 500);
      return;
    }
    const settings = loadSettings();
    const baseUrl = String(settings.unit3dBaseUrl || '').trim();
    const apiKey = String(settings.unit3dApiKey || '').trim();
    if (!baseUrl || !apiKey) {
      setError('Config Unit3D non disponibile');
      return;
    }

    const form = getFormState();
    const mapping = getSearchMapping(form, settings);
    const tmdbId = normalizeNumericId(state.metadata?.tmdbId || state.metadata?.tmdb);
    if (!tmdbId) {
      setError('TMDb mancante: verifica non disponibile');
      return;
    }
    if (!mapping.categoryId || !mapping.resolutionId) {
      setError('Dati insufficienti per la verifica');
      return;
    }

    const targetKey = state.mainVideo || state.videoFiles?.[0] || state.targetPath || '';
    const key = JSON.stringify({
      tmdbId,
      categoryId: mapping.categoryId,
      typeId: mapping.typeId,
      resolutionId: mapping.resolutionId,
      season: mapping.season || '',
      baseUrl,
      target: targetKey
    });
    if (dupeState.key === key && dupeState.status !== 'idle') {
      return;
    }
    dupeState.key = key;
    dupeState.expanded = false;
    setLoading();

    if (!window.api?.unit3dSearchDuplicates) {
      setError('Verifica duplicati non disponibile');
      return;
    }

    try {
      logDebug?.('unit3d dupe request', {
        target: targetKey,
        tmdbId,
        categoryId: mapping.categoryId,
        typeId: mapping.typeId,
        resolutionId: mapping.resolutionId,
        season: mapping.season || '',
        baseUrl
      });
      const result = await window.api.unit3dSearchDuplicates({
        baseUrl,
        apiKey,
        tmdbId,
        categoryId: mapping.categoryId,
        typeId: mapping.typeId,
        resolutionId: mapping.resolutionId,
        season: mapping.season
      });
      logDebug?.('unit3d dupe search', {
        ok: result?.ok,
        status: result?.status || 0,
        count: Array.isArray(result?.data?.data) ? result.data.data.length : 0
      });
      if (!result?.ok) {
        setError(result?.error || 'Errore verifica duplicati');
        return;
      }
      const items = buildDupeItems(result?.data?.data || [], baseUrl);
      const sample = items.slice(0, 5).map((item) => ({
        name: item.name,
        tmdbId: item.tmdbId,
        imdbId: item.imdbId
      }));
      logDebug?.('unit3d dupe sample', sample);
      const idFiltered = filterByIds(items, {
        tmdbId,
        imdbId: state.metadata?.imdbId,
        tvdbId: state.metadata?.tvdbSeriesId || state.metadata?.tvdbId
      });
      logDebug?.('unit3d dupe id filter', {
        total: items.length,
        matched: idFiltered.stats.matched,
        mismatched: idFiltered.stats.mismatched,
        missing: idFiltered.stats.missing
      });
      const meta = buildDupeMeta({ form, state });
      const filtered = filterUaDupes(idFiltered.items, meta);
      logDebug?.('unit3d dupe filter', {
        total: idFiltered.items.length,
        filtered: filtered.length
      });
      setOk(filtered);
    } catch (error) {
      setError(error?.message || 'Errore verifica duplicati');
    }
  }

  function hasDupes() {
    return dupeState.status === 'dupe' && dupeState.items.length > 0;
  }

  function isLoading() {
    return dupeState.status === 'loading';
  }

  function bindDupeHandlers() {
    if (ui.wizardDupeMoreBtn) {
      ui.wizardDupeMoreBtn.addEventListener('click', () => {
        dupeState.expanded = !dupeState.expanded;
        renderItems();
      });
    }
    if (ui.wizardDupeList) {
      ui.wizardDupeList.addEventListener('click', (event) => {
        const target = event.target.closest('[data-external]');
        if (target && target.dataset.external) {
          window.api?.openExternal?.(target.dataset.external);
        }
      });
    }
  }

  bindDupeHandlers();

  return {
    runWizardDupeCheck,
    hasDupes,
    isLoading
  };
}
