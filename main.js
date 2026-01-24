const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { mediaInfoFactory } = require('mediainfo.js');
const { readFile } = require('fs/promises');

const VIDEO_EXTS = new Set([
  '.mkv',
  '.mp4',
  '.ts',
  '.m2ts',
  '.vob',
  '.avi',
  '.mov',
  '.iso'
]);

let mediaInfoInstance = null;
let mediaInfoTextInstance = null;

async function getMediaInfo() {
  if (!mediaInfoInstance) {
    mediaInfoInstance = await mediaInfoFactory({ format: 'object' });
  }
  return mediaInfoInstance;
}

async function getMediaInfoText() {
  if (!mediaInfoTextInstance) {
    mediaInfoTextInstance = await mediaInfoFactory({ format: 'text' });
  }
  return mediaInfoTextInstance;
}

async function analyzeMedia(filePath) {
  const stats = await fs.stat(filePath);
  const handle = await fs.open(filePath, 'r');
  const size = stats.size;
  try {
    const mediaInfo = await getMediaInfo();
    const result = await mediaInfo.analyzeData(
      () => size,
      async (chunkSize, offset) => {
        const buffer = Buffer.alloc(chunkSize);
        const { bytesRead } = await handle.read(buffer, 0, chunkSize, offset);
        return buffer.subarray(0, bytesRead);
      }
    );
    return result;
  } finally {
    await handle.close();
  }
}

async function analyzeMediaText(filePath) {
  const stats = await fs.stat(filePath);
  const handle = await fs.open(filePath, 'r');
  const size = stats.size;
  try {
    const mediaInfo = await getMediaInfoText();
    const result = await mediaInfo.analyzeData(
      () => size,
      async (chunkSize, offset) => {
        const buffer = Buffer.alloc(chunkSize);
        const { bytesRead } = await handle.read(buffer, 0, chunkSize, offset);
        return buffer.subarray(0, bytesRead);
      }
    );
    return result;
  } finally {
    await handle.close();
  }
}

function isVideoFile(name) {
  const ext = path.extname(name).toLowerCase();
  if (!VIDEO_EXTS.has(ext)) {
    return false;
  }
  const base = path.basename(name).toLowerCase();
  if (base.includes('sample') && !base.includes('!sample')) {
    return false;
  }
  return true;
}

async function listVideoFilesInDir(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isVideoFile(entry.name))
    .map((entry) => path.join(dirPath, entry.name));
}

async function collectVideoFiles(rootPath, maxDepth = 3) {
  const streamDir = path.join(rootPath, 'BDMV', 'STREAM');
  if (fsSync.existsSync(streamDir)) {
    const files = await listVideoFilesInDir(streamDir);
    if (files.length) {
      return files;
    }
  }

  const videoTsDir = path.join(rootPath, 'VIDEO_TS');
  if (fsSync.existsSync(videoTsDir)) {
    const files = await listVideoFilesInDir(videoTsDir);
    if (files.length) {
      return files;
    }
  }

  const results = [];
  async function walk(dirPath, depth) {
    if (depth < 0) {
      return;
    }
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth - 1);
      } else if (entry.isFile() && isVideoFile(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootPath, maxDepth);
  return results;
}

async function pickMainVideo(videoFiles) {
  if (!videoFiles.length) {
    return null;
  }
  let best = null;
  let bestSize = 0;
  for (const filePath of videoFiles) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > bestSize) {
        best = filePath;
        bestSize = stats.size;
      }
    } catch {
      // Skip unreadable files
    }
  }
  return best;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

async function fetchOmdbByImdb(imdbId, apiKey) {
  const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&plot=short&i=${encodeURIComponent(imdbId)}`;
  const data = await fetchJson(url);
  if (data.Response === 'False') {
    throw new Error(data.Error || 'Errore OMDb');
  }
  return data;
}

async function fetchOmdbByTitle(title, year, apiKey) {
  const params = new URLSearchParams({ apikey: apiKey, plot: 'short', t: title });
  if (year) {
    params.set('y', String(year));
  }
  const data = await fetchJson(`https://www.omdbapi.com/?${params.toString()}`);
  if (data.Response === 'False') {
    throw new Error(data.Error || 'Errore OMDb');
  }
  return data;
}

async function fetchTmdbByImdb(imdbId, apiKey) {
  const url = `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}?external_source=imdb_id&api_key=${encodeURIComponent(apiKey)}`;
  return fetchJson(url);
}

async function fetchTmdbSearch(query, type, apiKey, language) {
  const params = new URLSearchParams({ api_key: apiKey, query });
  if (language) {
    params.set('language', language);
  }
  const url = `https://api.themoviedb.org/3/search/${type}?${params.toString()}`;
  return fetchJson(url);
}

async function fetchTmdbDetails(type, id, apiKey, language) {
  const params = new URLSearchParams({ api_key: apiKey });
  if (language) {
    params.set('language', language);
  }
  const url = `https://api.themoviedb.org/3/${type}/${id}?${params.toString()}`;
  return fetchJson(url);
}

async function fetchTmdbTvSeason(tvId, season, apiKey, language) {
  const params = new URLSearchParams({ api_key: apiKey });
  if (language) {
    params.set('language', language);
  }
  const url = `https://api.themoviedb.org/3/tv/${tvId}/season/${season}?${params.toString()}`;
  return fetchJson(url);
}

async function fetchTmdbConfig(apiKey) {
  const url = `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`;
  return fetchJson(url);
}

function extractYear(value) {
  if (!value) {
    return '';
  }
  return String(value).slice(0, 4);
}

async function tvdbLogin(apiKey) {
  const data = await fetchJson('https://api4.thetvdb.com/v4/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: apiKey })
  });
  const token = data?.data?.token || data?.token;
  if (!token) {
    throw new Error('TVDB login fallito.');
  }
  return token;
}

async function tvdbRequest(pathname, token, language) {
  const headers = { Authorization: `Bearer ${token}` };
  if (language) {
    headers['Accept-Language'] = language;
  }
  return fetchJson(`https://api4.thetvdb.com/v4${pathname}`, { headers });
}

async function tvdbSearchSeries(query, token, language) {
  const data = await tvdbRequest(`/search?query=${encodeURIComponent(query)}&type=series`, token, language);
  const list = Array.isArray(data?.data) ? data.data : [];
  return list[0] || null;
}

async function tvdbFetchSeries(seriesId, token, language) {
  const data = await tvdbRequest(`/series/${seriesId}`, token, language);
  return data?.data || null;
}

async function tvdbFetchEpisodes(seriesId, token, language) {
  const episodes = [];
  let page = 0;
  let hasNext = true;
  let safety = 0;

  while (hasNext && safety < 50) {
    const data = await tvdbRequest(`/series/${seriesId}/episodes/default?page=${page}`, token, language);
    const pageEpisodes = Array.isArray(data?.data) ? data.data : [];
    episodes.push(...pageEpisodes);
    const next = data?.links?.next;
    if (typeof next === 'number') {
      page = next;
      hasNext = true;
    } else if (typeof next === 'string' && next !== '') {
      page = Number(next);
      hasNext = Number.isFinite(page);
    } else {
      hasNext = false;
    }
    safety += 1;
  }

  return episodes.map((ep) => ({
    season: ep.seasonNumber ?? ep.season,
    episode: ep.number ?? ep.episodeNumber ?? ep.absoluteNumber,
    name: ep.name || ep.episodeName || ''
  }));
}

function buildRenamePlan(payload) {
  const warnings = [];
  const ops = [];

  if (!payload || !payload.targetPath) {
    warnings.push('Percorso mancante.');
    return { ops, warnings };
  }

  const targetPath = payload.targetPath;
  const baseName = payload.baseName || '';
  const renameFiles = Boolean(payload.renameFiles);
  const renameFolder = Boolean(payload.renameFolder);
  const fileRenames = Array.isArray(payload.fileRenames) ? payload.fileRenames : [];
  const folderName = payload.folderName || baseName;
  const stats = fsSync.existsSync(targetPath) ? fsSync.statSync(targetPath) : null;

  if (!stats) {
    warnings.push('Percorso non trovato.');
    return { ops, warnings };
  }

  if (stats.isFile()) {
    if (renameFiles) {
      const renameBase = fileRenames[0]?.baseName || baseName;
      if (!renameBase) {
        warnings.push('Nome base mancante per il file.');
      } else {
        const parsed = path.parse(targetPath);
        const newFilePath = path.join(parsed.dir, `${renameBase}${parsed.ext}`);
        if (path.resolve(newFilePath) !== path.resolve(targetPath)) {
          ops.push({ from: targetPath, to: newFilePath, type: 'file' });
        }
      }
    }

    if (renameFolder && folderName) {
      const parentDir = path.dirname(targetPath);
      const parentParsed = path.parse(parentDir);
      const newFolderPath = path.join(parentParsed.dir, folderName);
      if (path.resolve(newFolderPath) !== path.resolve(parentDir)) {
        ops.push({ from: parentDir, to: newFolderPath, type: 'folder' });
      }
    }
  } else if (stats.isDirectory()) {
    if (renameFiles) {
      if (!fileRenames.length) {
        warnings.push('Nessun file pronto per la rinomina.');
      } else {
        for (const item of fileRenames) {
          if (!item?.path || !item?.baseName) {
            warnings.push('Nome base mancante per uno dei file.');
            continue;
          }
          const parsed = path.parse(item.path);
          const newFilePath = path.join(parsed.dir, `${item.baseName}${parsed.ext}`);
          if (path.resolve(newFilePath) !== path.resolve(item.path)) {
            ops.push({ from: item.path, to: newFilePath, type: 'file' });
          }
        }
      }
    }

    if (renameFolder && folderName) {
      const dirParsed = path.parse(targetPath);
      const newFolderPath = path.join(dirParsed.dir, folderName);
      if (path.resolve(newFolderPath) !== path.resolve(targetPath)) {
        ops.push({ from: targetPath, to: newFolderPath, type: 'folder' });
      }
    }
  }

  const collisions = ops.filter(
    (op) => fsSync.existsSync(op.to) && path.resolve(op.to) !== path.resolve(op.from)
  );
  if (collisions.length) {
    warnings.push('Uno o piu percorsi di destinazione esistono gia.');
  }

  const seenTargets = new Set();
  const duplicateTargets = [];
  for (const op of ops) {
    const resolved = path.resolve(op.to);
    if (seenTargets.has(resolved)) {
      duplicateTargets.push(op.to);
    } else {
      seenTargets.add(resolved);
    }
  }
  if (duplicateTargets.length) {
    warnings.push('Alcuni file verrebbero rinominati sullo stesso nome.');
  }

  return { ops, warnings };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1560,
    height: 960,
    minWidth: 1280,
    minHeight: 840,
    autoHideMenuBar: true,
    backgroundColor: '#111319',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Video',
        extensions: ['mkv', 'mp4', 'ts', 'm2ts', 'vob', 'avi', 'mov', 'iso']
      }
    ]
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('scan-path', async (_event, targetPath) => {
  if (!targetPath) {
    return null;
  }

  const stats = await fs.stat(targetPath);
  let kind = 'file';
  let videoFiles = [];
  let mainVideo = null;

  if (stats.isDirectory()) {
    kind = 'dir';
    videoFiles = await collectVideoFiles(targetPath);
    mainVideo = await pickMainVideo(videoFiles);
  } else {
    videoFiles = [targetPath];
    mainVideo = targetPath;
  }

  let mediaInfo = null;
  if (mainVideo) {
    try {
      mediaInfo = await analyzeMedia(mainVideo);
    } catch (error) {
      mediaInfo = { error: String(error) };
    }
  }

  return {
    kind,
    videoFiles,
    mainVideo,
    mediaInfo
  };
});

ipcMain.handle('mediainfo-text', async (_event, filePath) => {
  if (!filePath) {
    return { text: '', error: 'Percorso file mancante.' };
  }
  try {
    const text = await analyzeMediaText(filePath);
    return { text };
  } catch (error) {
    return { text: '', error: String(error) };
  }
});

ipcMain.handle('read-services', async () => {
  const servicesPath = path.join(__dirname, 'app', 'services.json');
  try {
    const raw = await readFile(servicesPath, 'utf-8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, data: [], error: String(error) };
  }
});

ipcMain.handle('preview-rename', async (_event, payload) => {
  return buildRenamePlan(payload);
});

ipcMain.handle('apply-rename', async (_event, payload) => {
  const plan = buildRenamePlan(payload);
  if (!plan.ops.length) {
    return { ok: false, warnings: plan.warnings, results: [] };
  }

  if (plan.warnings.some((warning) => warning.includes('esistono gia'))) {
    return { ok: false, warnings: plan.warnings, results: [] };
  }

  const sortedOps = [...plan.ops].sort((a, b) => b.from.length - a.from.length);
  const results = [];

  for (const op of sortedOps) {
    try {
      await fs.rename(op.from, op.to);
      results.push({ from: op.from, to: op.to, ok: true });
    } catch (error) {
      results.push({ from: op.from, to: op.to, ok: false, error: String(error) });
    }
  }

  const failed = results.filter((result) => !result.ok);
  return {
    ok: failed.length === 0,
    warnings: plan.warnings,
    results
  };
});

ipcMain.handle('verify-api-key', async (_event, payload) => {
  const service = payload?.service || '';
  const apiKey = payload?.apiKey || '';
  if (!service || !apiKey) {
    return { ok: false, error: 'Chiave mancante.' };
  }
  try {
    if (service === 'omdb') {
      await fetchOmdbByImdb('tt0111161', apiKey);
    } else if (service === 'tmdb') {
      await fetchTmdbConfig(apiKey);
    } else if (service === 'tvdb') {
      await tvdbLogin(apiKey);
    } else {
      return { ok: false, error: 'Servizio non supportato.' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string') {
    return { ok: false, error: 'URL non valido.' };
  }
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: 'Schema non supportato.' };
  }
  try {
    await shell.openExternal(trimmed);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle('fetch-metadata', async (_event, payload) => {
  const result = {
    title: '',
    year: '',
    type: '',
    originalLanguage: '',
    episodes: [],
    warnings: [],
    imdbId: '',
    tmdbId: '',
    tmdbType: '',
    tvdbAttempted: false,
    tvdbSeriesId: '',
    tvdbSeriesSlug: '',
    tmdbFallback: false
  };

  if (!payload) {
    return result;
  }

  const imdbId = payload.imdbId || '';
  const tvdbId = payload.tvdbId || '';
  const titleGuess = payload.title || '';
  const yearGuess = payload.year || '';
  const typeHint = payload.typeHint || '';
  const seasonHint = payload.season || '';

  const omdbKey = payload.omdbKey || '';
  const tmdbKey = payload.tmdbKey || '';
  const tvdbKey = payload.tvdbKey || '';
  const preferredLanguage = payload.preferredLanguage || '';
  let tmdbTvId = '';

  try {
    if (imdbId && omdbKey) {
      const omdbData = await fetchOmdbByImdb(imdbId, omdbKey);
      result.title = omdbData.Title || result.title;
      result.year = String(omdbData.Year || result.year).slice(0, 4);
      result.type = omdbData.Type || result.type;
      result.imdbId = omdbData.imdbID || result.imdbId;
    } else if (titleGuess && omdbKey) {
      const omdbData = await fetchOmdbByTitle(titleGuess, yearGuess, omdbKey);
      result.title = omdbData.Title || result.title;
      result.year = String(omdbData.Year || result.year).slice(0, 4);
      result.type = omdbData.Type || result.type;
      result.imdbId = omdbData.imdbID || result.imdbId;
    }
  } catch (error) {
    result.warnings.push(String(error));
  }

  try {
    if (tmdbKey && imdbId) {
      const tmdbFind = await fetchTmdbByImdb(imdbId, tmdbKey);
      const movie = tmdbFind?.movie_results?.[0];
      const tv = tmdbFind?.tv_results?.[0];
      const isTvHint = typeHint.startsWith('tv') || typeHint.startsWith('anime');
      if (tv?.id) {
        tmdbTvId = String(tv.id);
      }
      if (movie?.original_language) {
        result.originalLanguage = movie.original_language;
      } else if (tv?.original_language) {
        result.originalLanguage = tv.original_language;
      }
      if (!result.title) {
        result.title = movie?.title || tv?.name || result.title;
      }
      if (!result.year) {
        result.year = extractYear(movie?.release_date || tv?.first_air_date);
      }
      if (movie?.id && !isTvHint) {
        result.tmdbId = String(movie.id);
        result.tmdbType = 'movie';
      } else if (tv?.id) {
        result.tmdbId = String(tv.id);
        result.tmdbType = 'tv';
      } else if (movie?.id) {
        result.tmdbId = String(movie.id);
        result.tmdbType = 'movie';
      }
    } else if (tmdbKey && titleGuess) {
      const isTvHint = typeHint.startsWith('tv') || typeHint.startsWith('anime');
      const type = isTvHint ? 'tv' : 'movie';
      const search = await fetchTmdbSearch(titleGuess, type, tmdbKey, preferredLanguage);
      const first = search?.results?.[0];
      if (first?.id) {
        if (type === 'tv') {
          tmdbTvId = String(first.id);
        }
        const details = await fetchTmdbDetails(type, first.id, tmdbKey, preferredLanguage);
        if (details?.original_language) {
          result.originalLanguage = details.original_language;
        }
        if (!result.title) {
          result.title = details.title || details.name || result.title;
        }
        if (!result.year) {
          result.year = extractYear(details.release_date || details.first_air_date);
        }
        result.tmdbId = String(first.id);
        result.tmdbType = type;
      }
    }
  } catch (error) {
    result.warnings.push(String(error));
  }

  try {
    const tvdbWanted =
      typeHint.startsWith('tv') ||
      typeHint.startsWith('anime') ||
      result.type === 'series' ||
      seasonHint ||
      tvdbId;
    if (!tvdbKey && tvdbWanted) {
      result.warnings.push('TVDB key mancante: episodi non recuperati.');
    }

    if (tvdbKey && tvdbWanted) {
      result.tvdbAttempted = true;
      const token = await tvdbLogin(tvdbKey);
      let seriesId = tvdbId;
      let seriesName = '';
      let seriesSlug = '';

      if (!seriesId) {
        const series = await tvdbSearchSeries(titleGuess || result.title, token, preferredLanguage);
        if (series) {
          seriesId = String(series.tvdb_id || series.id || '');
          seriesName = series.name || series.seriesName || '';
          seriesSlug = series.slug || series.slugName || '';
        }
      } else {
        const series = await tvdbFetchSeries(seriesId, token, preferredLanguage);
        if (series) {
          seriesName = series.name || series.seriesName || '';
          seriesSlug = series.slug || series.slugName || '';
        }
      }

      if (seriesId) {
        result.tvdbSeriesId = seriesId;
      }
      if (seriesSlug) {
        result.tvdbSeriesSlug = seriesSlug;
      }
      if (seriesName && !result.title) {
        result.title = seriesName;
      }

      if (seriesId) {
        const episodes = await tvdbFetchEpisodes(seriesId, token, preferredLanguage);
        result.episodes = episodes;
      }
    }
  } catch (error) {
    result.warnings.push(String(error));
  }

  if (result.tvdbAttempted && result.episodes.length === 0) {
    if (tmdbKey && tmdbTvId && seasonHint) {
      try {
        const seasonData = await fetchTmdbTvSeason(tmdbTvId, seasonHint, tmdbKey, preferredLanguage);
        const seasonEpisodes = Array.isArray(seasonData?.episodes) ? seasonData.episodes : [];
        result.episodes = seasonEpisodes.map((ep) => ({
          season: seasonHint,
          episode: ep.episode_number,
          name: ep.name || ''
        }));
        if (result.episodes.length) {
          result.tmdbFallback = true;
        }
        if (!result.tmdbId) {
          result.tmdbId = tmdbTvId;
          result.tmdbType = 'tv';
        }
      } catch (error) {
        result.warnings.push(`TMDb fallback errore: ${error}`);
      }
    }
  }

  if (result.tvdbAttempted && result.episodes.length === 0) {
    result.warnings.push('TVDB: nessun episodio trovato.');
  }

  return result;
});
