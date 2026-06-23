// Scene-release detection via srrdb.com (JSON API) and predb.pw (HTML scrape),
// ported from a Python SceneManager. Runs in the Electron main process where
// Node's fetch, fs and path are available. Results are cached on disk.

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

const SRRDB_API = 'https://api.srrdb.com/v1';
const SRRDB_DOWNLOAD = 'https://www.srrdb.com/download/file';
const PREDB_SEARCH = 'https://predb.pw/search.php';

function quote(value) {
  return encodeURIComponent(String(value || ''));
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, '');
}

async function readJsonCache(file) {
  try {
    const text = await fs.readFile(file, 'utf-8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeJsonCache(file, data) {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data), 'utf-8');
  } catch {
    // Caching is best-effort; ignore write failures.
  }
}

async function fetchJson(url, timeoutMs = 30000) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'SHRI-Tools-scene', accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (response.status !== 200) {
    return null;
  }
  return response.json();
}

// Replicates the Python predb_check: scrape the predb.pw results table and look
// for a row whose release name matches the basename exactly (case-insensitive).
// Returns { found, sceneName, group } where group is the release group, if any.
function parsePredbHtml(html, videoBase) {
  const target = String(videoBase || '').toLowerCase();
  const tableMatch = html.match(
    /<table[^>]*class="[^"]*zebra-striped[^"]*"[^>]*>([\s\S]*?)<\/table>/i
  );
  const scope = tableMatch ? tableMatch[1] : html;
  const rows = scope.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (cells.length < 3) {
      continue;
    }
    // The 3rd <td> holds the release name link with a title attribute.
    const titleMatch = cells[2].match(/<a[^>]*\btitle="([^"]*)"[^>]*>/i);
    if (!titleMatch) {
      continue;
    }
    const releaseAttr = decodeHtmlEntities(titleMatch[1]).trim();
    if (!releaseAttr) {
      continue;
    }
    if (releaseAttr.toLowerCase() === target) {
      let group = '';
      // The 4th <td> holds the group link.
      if (cells.length >= 4) {
        const groupMatch = cells[3].match(/<a[^>]*>([\s\S]*?)<\/a>/i);
        if (groupMatch) {
          group = decodeHtmlEntities(stripTags(groupMatch[1])).trim();
        }
      }
      return { found: true, sceneName: releaseAttr, group };
    }
  }
  return { found: false, sceneName: '', group: '' };
}

async function predbCheck(videoBase, log) {
  const url = `${PREDB_SEARCH}?search=${quote(videoBase)}`;
  log.push(`predb url ${url}`);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SHRI-Tools-scene' },
      signal: AbortSignal.timeout(10000)
    });
    if (response.status !== 200) {
      log.push(`predb http ${response.status}`);
      return { found: false };
    }
    const html = await response.text();
    return parsePredbHtml(html, videoBase);
  } catch (err) {
    log.push(`predb error ${String(err?.message || err)}`);
    return { found: false };
  }
}

// Download the NFO for a release. Returns { saved, path } or { saved: false }.
async function downloadNfo({ release, releaseLower, outputDir, cacheDir }, log) {
  const targetDir = outputDir || path.join(cacheDir, 'nfo');
  const nfoPath = path.join(targetDir, `${releaseLower}.nfo`);

  // Local cache: if already downloaded, reuse it.
  if (fsSync.existsSync(nfoPath)) {
    log.push(`nfo cached ${nfoPath}`);
    return { saved: true, path: nfoPath };
  }

  const nfoUrl = `${SRRDB_DOWNLOAD}/${quote(release)}/${quote(releaseLower)}.nfo`;
  log.push(`nfo url ${nfoUrl}`);
  try {
    const response = await fetch(nfoUrl, {
      headers: { 'User-Agent': 'SHRI-Tools-scene' },
      signal: AbortSignal.timeout(30000)
    });
    if (response.status !== 200) {
      log.push(`nfo http ${response.status}`);
      return { saved: false };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(nfoPath, buffer);
    log.push(`nfo saved ${nfoPath}`);
    return { saved: true, path: nfoPath };
  } catch (err) {
    log.push(`nfo error ${String(err?.message || err)}`);
    return { saved: false };
  }
}

// Resolve the correct .nfo basename from the srrdb release details (falls back
// to the lowercased release name, matching the Python behaviour).
async function resolveNfoBasename(release, cacheDir, log) {
  let releaseLower = release.toLowerCase();
  const detailsCacheFile = path.join(cacheDir, 'details', `${release}.json`);
  let details = await readJsonCache(detailsCacheFile);
  if (!details) {
    const detailsUrl = `${SRRDB_API}/details/${quote(release)}`;
    log.push(`details url ${detailsUrl}`);
    try {
      details = await fetchJson(detailsUrl);
      if (details) {
        await writeJsonCache(detailsCacheFile, details);
      }
    } catch (err) {
      log.push(`details error ${String(err?.message || err)}`);
    }
  } else {
    log.push(`details cached ${release}`);
  }
  if (details && Array.isArray(details.files)) {
    for (const file of details.files) {
      const name = file && file.name ? String(file.name) : '';
      if (name.toLowerCase().endsWith('.nfo')) {
        releaseLower = name.replace(/\.[^.]+$/, '');
        break;
      }
    }
  }
  return releaseLower;
}

// Main entry point. Mirrors the Python is_scene() + predb_check() flow.
// payload: {
//   base, isDisc, keepFolder, filename, tag, imdbId, imdbManual,
//   checkPredb, wantNfo, debug, outputDir, cacheDir
// }
async function detectScene(payload = {}) {
  const {
    base: rawBase = '',
    isDisc = false,
    keepFolder = false,
    filename = '',
    tag = '',
    imdbId = null,
    imdbManual = false,
    checkPredb = true,
    wantNfo = true,
    outputDir = '',
    cacheDir = ''
  } = payload;

  const log = [];
  const result = {
    ok: true,
    scene: false,
    sceneName: '',
    imdb: imdbId ? Number(imdbId) || null : null,
    source: null,
    nfo: false,
    nfoPath: null,
    tag: null,
    needTag: false,
    log
  };

  // Strip a real 3-char file extension unless this is an untouched disc folder.
  let base = String(rawBase || '').trim();
  const extMatch = base.match(/^(.+)\.[a-zA-Z0-9]{3}$/);
  if (extMatch && (!isDisc || keepFolder)) {
    base = extMatch[1];
  }
  if (!base) {
    result.ok = false;
    log.push('empty base');
    return result;
  }
  const isAllLowercase = base === base.toLowerCase() && base !== base.toUpperCase();
  const quotedBase = quote(base);
  const searchCacheDir = path.join(cacheDir, 'search');

  // ===== Primary search: srrdb r:{base} =====
  const searchCacheFile = path.join(searchCacheDir, `${quotedBase}.json`);
  let searchJson = await readJsonCache(searchCacheFile);
  if (searchJson) {
    log.push(`search cached ${base}`);
  } else {
    const url = `${SRRDB_API}/search/r:${quotedBase}`;
    log.push(`search url ${url}`);
    try {
      searchJson = await fetchJson(url);
      if (searchJson) {
        await writeJsonCache(searchCacheFile, searchJson);
      }
    } catch (err) {
      log.push(`search error ${String(err?.message || err)}`);
    }
  }

  if (searchJson && Number(searchJson.resultsCount || 0) > 0) {
    const first = searchJson.results[0];
    result.scene = true;
    result.sceneName = first.release;
    result.source = 'srrdb';
    log.push(`scene match ${first.release}`);

    if (isAllLowercase && !tag) {
      result.needTag = true;
    }
    if (first.imdbId) {
      const imdbStr = String(first.imdbId);
      const imdbVal = /^\d+$/.test(imdbStr) && !imdbManual ? parseInt(imdbStr, 10) : 0;
      result.imdb = imdbVal !== 0 ? imdbVal : result.imdb;
    }

    if (wantNfo && first.hasNFO === 'yes') {
      const release = first.release;
      const releaseLower = await resolveNfoBasename(release, cacheDir, log);
      const nfo = await downloadNfo({ release, releaseLower, outputDir, cacheDir }, log);
      if (nfo.saved) {
        result.nfo = true;
        result.nfoPath = nfo.path;
      }
    }

    return result;
  }
  log.push('no primary match');

  // ===== Secondary search: srrdb start:{name}/group:{tag} (the Python "lower"
  // branch) — only confirms when the IMDb id matches the known one. =====
  const name = filename ? String(filename).replace(/ /g, '.') : '';
  const cleanTag = tag ? String(tag).replace(/-/g, '') : '';
  const knownImdb = imdbId ? parseInt(String(imdbId), 10) : 0;
  if (name && cleanTag && knownImdb) {
    const url = `${SRRDB_API}/search/start:${quote(name)}/group:${quote(cleanTag)}`;
    log.push(`lower url ${url}`);
    try {
      const lowerJson = await fetchJson(url, 10000);
      if (lowerJson && Number(lowerJson.resultsCount || 0) > 0) {
        const first = lowerJson.results[0];
        const imdbStr = first.imdbId ? String(first.imdbId) : '';
        const padded = String(knownImdb).padStart(7, '0');
        if (imdbStr && imdbStr === padded) {
          result.scene = true;
          result.sceneName = first.release;
          result.source = 'srrdb-lower';
          log.push(`lower match ${first.release}`);
          if (wantNfo && first.hasNFO === 'yes') {
            const release = first.release;
            const releaseLower = release.toLowerCase();
            const nfo = await downloadNfo({ release, releaseLower, outputDir, cacheDir }, log);
            if (nfo.saved) {
              result.nfo = true;
              result.nfoPath = nfo.path;
            }
          }
          return result;
        }
      }
      log.push('no lower match');
    } catch (err) {
      log.push(`lower error ${String(err?.message || err)}`);
    }
  }

  // ===== Fallback: predb.pw scrape =====
  if (checkPredb) {
    const predb = await predbCheck(base, log);
    if (predb.found) {
      result.scene = true;
      result.sceneName = predb.sceneName;
      result.source = 'predb';
      if (predb.group) {
        result.tag = predb.group.startsWith('-') ? predb.group : `-${predb.group}`;
      }
      log.push(`predb match ${predb.sceneName}`);
      return result;
    }
  }

  return result;
}

module.exports = { detectScene, parsePredbHtml };
