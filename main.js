// ===== Imports & globals =====
// Electron main process: IPC + filesystem + media analysis + tracker API integration.
const { app, BrowserWindow, dialog, ipcMain, Menu, shell, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const fsSync = require('fs');
const { spawn } = require('child_process');
const { buildUaScreenshotTimes, buildUaScreenshotTimesDebug } = require('./app/screenshot-times');

function createFormData() {
  if (!global.FormData) {
    throw new Error('FormData non disponibile. Aggiorna Electron/Node o abilita una versione che includa fetch.');
  }
  return new global.FormData();
}

function appendFormField(form, key, value) {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value === 'boolean') {
    form.append(key, value ? '1' : '0');
    return;
  }
  form.append(key, String(value));
}
const { mediaInfoFactory } = require('mediainfo.js');
const { readFile } = require('fs/promises');

// ===== Constants =====
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

const MIN_PIECE_LENGTH = 16 * 1024;
const MAX_PIECE_LENGTH = 4 * 1024 * 1024;
const MAX_TORRENT_SIZE = 2 * 1024 * 1024;
const MAX_PIECES_TARGET = 100000;
const TINY_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ===== Runtime state =====
let mediaInfoInstance = null;
let mediaInfoTextInstance = null;
let createTorrentModule = null;
const transmissionSessions = new Map();
const bdinfoJobs = new Map();
let uaProcess = null;
let uaSender = null;
let uaUpdateProcess = null;
let uaUpdateSender = null;

// ===== UA process helpers =====
function getMainSender() {
  return uaSender || BrowserWindow.getFocusedWindow()?.webContents || BrowserWindow.getAllWindows()[0]?.webContents;
}

function getUpdateSender() {
  return (
    uaUpdateSender ||
    BrowserWindow.getFocusedWindow()?.webContents ||
    BrowserWindow.getAllWindows()[0]?.webContents
  );
}

function sendUaOutput(text, type = 'stdout') {
  if (!text) {
    return;
  }
  const sender = getMainSender();
  if (sender) {
    sender.send('ua-output', { text: String(text), type });
  }
}

function sendUaExit(code = 0, signal = '') {
  const sender = getMainSender();
  if (sender) {
    sender.send('ua-exit', { code, signal });
  }
  uaSender = null;
}

function sendUaUpdateOutput(text, type = 'stdout') {
  if (!text) {
    return;
  }
  const sender = getUpdateSender();
  if (sender) {
    sender.send('ua-update-output', { text: String(text), type });
  }
}

function sendUaUpdateExit(code = 0, signal = '') {
  const sender = getUpdateSender();
  if (sender) {
    sender.send('ua-update-exit', { code, signal });
  }
  uaUpdateSender = null;
}

// ===== Process execution helpers =====
function stripAnsi(text) {
  return String(text || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        ...options,
        windowsHide: true
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        resolve({
          ok: false,
          error,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: -1
        });
      });
      child.on('close', (code) => {
        resolve({
          ok: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code
        });
      });
    } catch (error) {
      resolve({ ok: false, error, stdout: '', stderr: '', code: -1 });
    }
  });
}

function runCommandWithTimeout(command, args, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120000;
  const spawnOptions = { ...options };
  const onStdout = typeof spawnOptions.onStdout === 'function' ? spawnOptions.onStdout : null;
  const onStderr = typeof spawnOptions.onStderr === 'function' ? spawnOptions.onStderr : null;
  delete spawnOptions.timeoutMs;
  delete spawnOptions.onStdout;
  delete spawnOptions.onStderr;

  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        ...spawnOptions,
        windowsHide: true
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch (error) {
          // ignore kill errors
        }
        finish({
          ok: false,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: -1,
          timeout: true
        });
      }, timeoutMs);

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (onStdout) {
          onStdout(text);
        }
      });
      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        if (onStderr) {
          onStderr(text);
        }
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        finish({
          ok: false,
          error,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: -1
        });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        finish({
          ok: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code
        });
      });
    } catch (error) {
      resolve({ ok: false, error, stdout: '', stderr: '', code: -1 });
    }
  });
}

// ===== MediaInfo helpers =====
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

function getVideoTrack(mediaInfo) {
  const tracks = mediaInfo?.media?.track || [];
  return tracks.find((track) => track['@type'] === 'Video');
}

function parseNumber(value, fallback = 0) {
  if (typeof value === 'number') {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRatio(value, fallback = 0) {
  if (typeof value === 'number') {
    return value;
  }
  if (!value) {
    return fallback;
  }
  const text = String(value).trim();
  if (text.includes(':')) {
    const [left, right] = text.split(':');
    const num = parseFloat(left);
    const den = parseFloat(right);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
  }
  const cleaned = text.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFrameRate(videoTrack, fallback = 24) {
  if (!videoTrack) {
    return fallback;
  }
  const direct = parseNumber(videoTrack.FrameRate, 0);
  if (direct) {
    return direct;
  }
  const num = parseNumber(videoTrack.FrameRate_Num, 0);
  const den = parseNumber(videoTrack.FrameRate_Den, 0);
  if (num && den) {
    return num / den;
  }
  return fallback;
}

function deriveSar(width, height, par, dar) {
  if (!width || !height) {
    return { wSar: 1, hSar: 1 };
  }
  if (!par || par === 1) {
    return { wSar: 1, hSar: 1 };
  }
  if (!dar) {
    dar = width / height;
  }
  if (par < 1) {
    const newHeight = dar * height;
    const sar = newHeight ? width / newHeight : 1;
    return { wSar: 1, hSar: sar || 1 };
  }
  return { wSar: par, hSar: 1 };
}

function detectHdr(mediaInfo) {
  const videoTrack = getVideoTrack(mediaInfo);
  if (!videoTrack) {
    return false;
  }
  const fields = [
    videoTrack.HDR_Format,
    videoTrack.HDR_Format_String,
    videoTrack.HDR_Format_Compatibility,
    videoTrack['HDR format'],
    videoTrack['HDR format string'],
    videoTrack['HDR format compatibility'],
    videoTrack.Transfer_characteristics,
    videoTrack['Transfer characteristics'],
    videoTrack.ColorPrimaries,
    videoTrack['Color primaries']
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    fields.includes('hdr') ||
    fields.includes('dolby vision') ||
    fields.includes('hlg') ||
    fields.includes('pq')
  );
}

async function verifyImgbbKey(apiKey) {
  const form = createFormData();
  form.append('image', TINY_GIF_BASE64);
  const url = `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { method: 'POST', body: form });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
}

async function verifyPtscreensKey(apiKey) {
  const form = createFormData();
  form.append('source', TINY_GIF_BASE64);
  const response = await fetch('https://ptscreens.com/api/1/upload', {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: form
  });
  const data = await response.json().catch(() => null);
  const statusCode = data?.status_code || data?.success?.code || response.status;
  if (!response.ok || String(statusCode) !== '200') {
    const message = data?.status_txt || data?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
}

// ===== Unit3D API helpers =====
async function verifyUnit3dKey(apiKey, baseUrl) {
  const base = (baseUrl || 'https://shareisland.org').replace(/\/+$/, '');
  const response = await fetch(`${base}/api/user`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json'
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text || 'Errore API'}`);
  }
}

async function fetchUnit3dTorrent({ baseUrl, apiKey, torrentId }) {
  if (!baseUrl || !apiKey) {
    return { ok: false, error: 'Base URL o API key mancanti.' };
  }
  if (!torrentId) {
    return { ok: false, error: 'ID torrent mancante.' };
  }
  const base = String(baseUrl).replace(/\/+$/, '');
  const response = await fetch(`${base}/api/torrents/${encodeURIComponent(torrentId)}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json'
    }
  });
  const text = await response.text();
  const raw = text || '';
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.message || raw || `HTTP ${response.status}`,
      raw
    };
  }
  return { ok: true, status: response.status, data: payload, raw };
}

async function searchUnit3dDuplicates({
  baseUrl,
  apiKey,
  tmdbId,
  categoryId,
  typeId,
  resolutionId,
  season
}) {
  if (!baseUrl || !apiKey) {
    return { ok: false, error: 'Base URL o API key mancanti.' };
  }
  if (!tmdbId) {
    return { ok: false, error: 'TMDb ID mancante.' };
  }
  const base = String(baseUrl).replace(/\/+$/, '');
  const seasonValue = String(season || '').trim();
  const baseParams = new URLSearchParams();
  baseParams.append('tmdbId', String(tmdbId));
  if (categoryId) {
    baseParams.append('categories[]', String(categoryId));
  }
  baseParams.append('perPage', '100');
  const resValue = String(resolutionId || '').trim();
  if (resValue) {
    if (resValue === '3' || resValue === '4') {
      baseParams.append('resolutions[]', '3');
      baseParams.append('resolutions[]', '4');
    } else {
      baseParams.append('resolutions[]', resValue);
    }
  }
  const typeValue = String(typeId || '').trim();
  if (typeValue) {
    baseParams.append('types[]', typeValue);
  }

  const fetchWithName = async (nameValue) => {
    const params = new URLSearchParams(baseParams);
    params.append('name', nameValue);
    const response = await fetch(`${base}/api/torrents/filter?${params.toString()}`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json'
      }
    });
    const text = await response.text();
    const raw = text || '';
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload?.message || raw || `HTTP ${response.status}`,
        raw
      };
    }
    return { ok: true, status: response.status, data: payload, raw };
  };

  // UA-style dupe search: use name filter for season packs and fallback for ShareIsland.
  const initialName = seasonValue ? ` ${seasonValue}` : '';
  let result = await fetchWithName(initialName);

  const allowSeasonFallback = Boolean(seasonValue)
    && /shareisland\.org$/i.test(base);
  const hasResults = Array.isArray(result?.data?.data) && result.data.data.length > 0;
  if (allowSeasonFallback && !hasResults) {
    const numericSeason = seasonValue.match(/^\d+$/)
      ? seasonValue.padStart(2, '0')
      : seasonValue.replace(/^S/i, '');
    const fallbackName = `S${numericSeason}`;
    const fallbackResult = await fetchWithName(fallbackName);
    if (fallbackResult?.ok) {
      result = fallbackResult;
    }
  }

  return result;
}

async function uploadUnit3dTorrent({ baseUrl, apiKey, torrentPath, data }) {
  if (!baseUrl || !apiKey) {
    return { ok: false, error: 'Base URL o API key mancanti.' };
  }
  if (!torrentPath) {
    return { ok: false, error: 'File .torrent non disponibile.' };
  }
  const base = String(baseUrl).replace(/\/+$/, '');
  const form = createFormData();
  const torrentBytes = await fs.readFile(torrentPath);
  if (!global.Blob) {
    throw new Error('Blob non disponibile. Aggiorna Electron/Node o abilita una versione che includa fetch.');
  }
  const torrentBlob = new global.Blob([torrentBytes], { type: 'application/x-bittorrent' });
  form.append('torrent', torrentBlob, path.basename(torrentPath));

  Object.entries(data || {}).forEach(([key, value]) => {
    appendFormField(form, key, value);
  });

  const response = await fetch(`${base}/api/torrents/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json'
    },
    body: form
  });
  const text = await response.text();
  const raw = text || '';
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  const details = payload?.errors
    ? Object.entries(payload.errors)
        .map(([field, messages]) => {
          const list = Array.isArray(messages) ? messages.join(', ') : String(messages);
          return `${field}: ${list}`;
        })
        .join(' | ')
    : '';

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.message || text || 'Errore API',
      details,
      raw
    };
  }
  if (payload && payload.success === false) {
    return {
      ok: false,
      status: response.status,
      error: payload.message || 'Errore API',
      details,
      raw
    };
  }
  return { ok: true, status: response.status, data: payload, raw };
}

function sanitizeTorrentFilename(name) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return 'tracker.torrent';
  }
  const base = cleaned.replace(/\.+$/, '');
  return base.toLowerCase().endsWith('.torrent') ? base : `${base}.torrent`;
}

async function downloadUnit3dTorrent({ baseUrl, apiKey, downloadUrl, outputDir, fileName }) {
  if (!baseUrl || !apiKey) {
    return { ok: false, error: 'Base URL o API key mancanti.' };
  }
  if (!downloadUrl) {
    return { ok: false, error: 'URL di download mancante.' };
  }
  if (!outputDir) {
    return { ok: false, error: 'Cartella output mancante.' };
  }
  const base = String(baseUrl).replace(/\/+$/, '');
  const rawUrl = String(downloadUrl).trim();
  const resolvedUrl = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `${base}/${rawUrl.replace(/^\/+/, '')}`;

  const response = await fetch(resolvedUrl, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/x-bittorrent'
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      error: text || `HTTP ${response.status}`
    };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(outputDir, { recursive: true });
  const safeName = sanitizeTorrentFilename(fileName);
  const outputPath = path.join(outputDir, safeName);
  await fs.writeFile(outputPath, buffer);
  return { ok: true, outputPath, status: response.status };
}

// ===== Torrent client integrations =====

// Use Node.js native http/https for login to avoid Electron's Chromium session
// intercepting Set-Cookie headers before they reach the fetch response object.
const _http = require('http');
const _https = require('https');

function _httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? _https : _http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function loginQbittorrent(baseUrl, username, password) {
  const body = new URLSearchParams({ username, password }).toString();
  let res;
  try {
    res = await _httpRequest(new URL(`${baseUrl}/api/v2/auth/login`), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(body),
        'referer': baseUrl,
        'origin': baseUrl
      }
    }, body);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (res.status === 403) {
    return { ok: false, error: 'IP bannato per troppi tentativi falliti.' };
  }
  // qBittorrent >= 5.2.0 returns 204 No Content on success (empty body)
  // Older versions return 200 with "Ok." text
  if (res.status !== 200 && res.status !== 204) {
    return { ok: false, error: normalizeHttpError(res.body, res.status) };
  }
  if (res.status === 200 && !res.body.toLowerCase().includes('ok')) {
    return { ok: false, error: normalizeHttpError(res.body, res.status) };
  }
  // res.headers['set-cookie'] is always an array in Node.js http module
  // qBittorrent >= 5.2.0 uses cookie name: QBT_SID_<port> (e.g. QBT_SID_8080)
  // Older versions use: SID
  const setCookies = res.headers['set-cookie'] || [];
  const sidEntry = setCookies.find(c => /(?:QBT_)?SID(?:_\d+)?=/i.test(c));
  if (!sidEntry) {
    return { ok: false, error: 'Cookie SID non trovato.' };
  }
  const match = sidEntry.match(/((?:QBT_)?SID(?:_\d+)?)=([^;]+)/i);
  if (!match) {
    return { ok: false, error: 'Cookie SID non trovato.' };
  }
  return { ok: true, cookie: `${match[1]}=${match[2]}` };
}

async function addQbittorrentTorrent({ baseUrl, username, password, torrentPath, savePath, category, paused }) {
  if (!baseUrl || !username || !password) {
    return { ok: false, error: 'Credenziali qBittorrent mancanti.' };
  }
  if (!torrentPath) {
    return { ok: false, error: 'File .torrent mancante.' };
  }
  const login = await loginQbittorrent(baseUrl, username, password);
  if (!login.ok) {
    return login;
  }
  const torrentBytes = await fs.readFile(torrentPath);
  const form = createFormData();
  const torrentBlob = new global.Blob([torrentBytes], { type: 'application/x-bittorrent' });
  form.append('torrents', torrentBlob, path.basename(torrentPath));
  if (savePath) {
    form.append('savepath', savePath);
  }
  if (category) {
    form.append('category', category);
  }
  if (paused) {
    form.append('paused', 'true');
  }
  const response = await fetch(`${baseUrl}/api/v2/torrents/add`, {
    method: 'POST',
    headers: {
      cookie: login.cookie
    },
    body: form
  });
  // qBittorrent >= 5.2.0 returns 204 No Content on success (empty body)
  const text = await response.text();
  // qBit 5.2.0 returns JSON {success_count, failure_count, ...} or 204 No Content
  // Older versions return plain "Ok."
  if (response.status === 204) {
    return { ok: true, message: 'Torrent aggiunto con successo.' };
  }
  if (response.ok) {
    try {
      const json = JSON.parse(text);
      if (json.failure_count > 0) {
        return { ok: false, error: `qBittorrent: ${json.failure_count} torrent non aggiunto.` };
      }
      return { ok: true, message: 'Torrent aggiunto con successo.' };
    } catch {
      // plain text response (older qBit)
      if (text.toLowerCase().includes('ok')) {
        return { ok: true, message: 'Torrent aggiunto con successo.' };
      }
      return { ok: false, error: normalizeHttpError(text, response.status) };
    }
  }
  return { ok: false, error: normalizeHttpError(text, response.status) };
}

function buildQbitBaseUrl(host, port, useHttps) {
  const raw = String(host || '').trim();
  if (!raw) {
    return '';
  }
  if (/^https?:\/\//i.test(raw)) {
    const trimmed = raw.replace(/\/+$/, '');
    if (port && !/:\d+$/.test(trimmed)) {
      return `${trimmed}:${port}`;
    }
    return trimmed;
  }
  const protocol = useHttps ? 'https' : 'http';
  const hostTrim = raw.replace(/\/+$/, '');
  const hasPort = /:\d+$/.test(hostTrim);
  const portPart = port && !hasPort ? `:${port}` : '';
  return `${protocol}://${hostTrim}${portPart}`;
}

async function testQbittorrentConnection({ host, port, https, username, password }) {
  const baseUrl = buildQbitBaseUrl(host, port, https);
  if (!baseUrl) {
    return { ok: false, error: 'Host qBittorrent non valido.' };
  }
  if (!username || !password) {
    return { ok: false, error: 'Credenziali mancanti.' };
  }
  const login = await loginQbittorrent(baseUrl, username, password);
  if (!login.ok) {
    return login;
  }
  const response = await fetch(`${baseUrl}/api/v2/app/version`, {
    headers: {
      cookie: login.cookie
    }
  });
  const text = await response.text();
  if (!response.ok) {
    return { ok: false, error: normalizeHttpError(text, response.status) };
  }
  return { ok: true, version: text.trim() };
}

function buildTransmissionBaseUrl(host, port, useHttps) {
  const raw = String(host || '').trim();
  if (!raw) {
    return '';
  }
  if (/^https?:\/\//i.test(raw)) {
    const trimmed = raw.replace(/\/+$/, '');
    if (port && !/:\d+$/.test(trimmed)) {
      return `${trimmed}:${port}`;
    }
    return trimmed;
  }
  const protocol = useHttps ? 'https' : 'http';
  const hostTrim = raw.replace(/\/+$/, '');
  const hasPort = /:\d+$/.test(hostTrim);
  const portPart = port && !hasPort ? `:${port}` : '';
  return `${protocol}://${hostTrim}${portPart}`;
}

function resolveTransmissionRpcUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  if (/\/transmission\/rpc$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/transmission$/i.test(trimmed)) {
    return `${trimmed}/rpc`;
  }
  return `${trimmed}/transmission/rpc`;
}

async function transmissionRpc({ rpcUrl, username, password, sessionId, body }) {
  const headers = {
    'content-type': 'application/json'
  };
  if (sessionId) {
    headers['x-transmission-session-id'] = sessionId;
  }
  if (username || password) {
    const token = Buffer.from(`${username || ''}:${password || ''}`).toString('base64');
    headers.authorization = `Basic ${token}`;
  }
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (response.status === 409) {
    const newId = response.headers.get('x-transmission-session-id') || '';
    return { ok: false, status: response.status, sessionId: newId, error: 'Session ID richiesto.' };
  }
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, status: response.status, error: normalizeHttpError(text, response.status) };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, error: normalizeHttpError(text, response.status) };
  }
  if (json?.result && json.result !== 'success') {
    return { ok: false, status: response.status, error: json.result, data: json };
  }
  return { ok: true, status: response.status, data: json, sessionId };
}

async function transmissionRequest({ rpcUrl, username, password, body }) {
  const key = `${rpcUrl}|${username || ''}`;
  let sessionId = transmissionSessions.get(key) || '';
  let response = await transmissionRpc({ rpcUrl, username, password, sessionId, body });
  if (response.status === 409 && response.sessionId) {
    sessionId = response.sessionId;
    transmissionSessions.set(key, sessionId);
    response = await transmissionRpc({ rpcUrl, username, password, sessionId, body });
  }
  if (response.ok && sessionId) {
    transmissionSessions.set(key, sessionId);
  }
  return response;
}

async function addTransmissionTorrent({ baseUrl, username, password, torrentPath, savePath, paused }) {
  const rpcUrl = resolveTransmissionRpcUrl(baseUrl);
  if (!rpcUrl) {
    return { ok: false, error: 'Host Transmission non valido.' };
  }
  if (!torrentPath) {
    return { ok: false, error: 'File .torrent mancante.' };
  }
  const torrentBytes = await fs.readFile(torrentPath);
  const argumentsPayload = {
    metainfo: torrentBytes.toString('base64')
  };
  if (savePath) {
    argumentsPayload['download-dir'] = savePath;
  }
  if (paused) {
    argumentsPayload.paused = true;
  }
  const response = await transmissionRequest({
    rpcUrl,
    username,
    password,
    body: {
      method: 'torrent-add',
      arguments: argumentsPayload
    }
  });
  if (!response.ok) {
    return { ok: false, error: response.error || 'Errore invio.' };
  }
  return { ok: true, message: response.data?.result || 'success' };
}

async function testTransmissionConnection({ host, port, https, username, password }) {
  const baseUrl = buildTransmissionBaseUrl(host, port, https);
  const rpcUrl = resolveTransmissionRpcUrl(baseUrl);
  if (!rpcUrl) {
    return { ok: false, error: 'Host Transmission non valido.' };
  }
  const response = await transmissionRequest({
    rpcUrl,
    username,
    password,
    body: { method: 'session-get' }
  });
  if (!response.ok) {
    return { ok: false, error: response.error || 'Errore connessione.' };
  }
  const version = response.data?.arguments?.version || '';
  return { ok: true, version };
}

function normalizeHttpError(text, status) {
  const raw = String(text || '').trim();
  if (!raw) {
    return `HTTP ${status}`;
  }
  if (/<html|<!doctype/i.test(raw)) {
    return `HTTP ${status}: risposta HTML (verifica host/porta)`;
  }
  const cleaned = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return `HTTP ${status}`;
  }
  return cleaned.length > 200 ? `${cleaned.slice(0, 200)}…` : cleaned;
}

// ===== Screenshot pipeline (FFmpeg/FFprobe) =====
function resolveFfprobePath(ffmpegPath) {
  if (!ffmpegPath) {
    return '';
  }
  const dir = path.dirname(ffmpegPath);
  const ext = path.extname(ffmpegPath);
  return path.join(dir, `ffprobe${ext}`);
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Exit code ${code}`));
      }
    });
  });
}

async function getVideoDurationSeconds(ffprobePath, videoPath) {
  const args = [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    videoPath
  ];
  const { stdout } = await runProcess(ffprobePath, args);
  const value = parseFloat(stdout.trim());
  if (!Number.isFinite(value)) {
    throw new Error('Durata non rilevata.');
  }
  return value;
}

function buildScreenshotTimes(duration, count) {
  const safeCount = Math.max(3, Math.min(12, Number(count) || 6));
  const start = duration * 0.1;
  const end = duration * 0.9;
  const step = safeCount > 1 ? (end - start) / (safeCount - 1) : 0;
  return Array.from({ length: safeCount }, (_, index) => start + step * index);
}

function buildScreenshotFilters({ scaleWidth, scaleHeight, tonemap }) {
  const filters = [];
  if (scaleWidth && scaleHeight) {
    filters.push(`scale=${scaleWidth}:${scaleHeight}`);
  }
  if (tonemap) {
    filters.push(
      'zscale=transfer=linear',
      'tonemap=tonemap=hable:desat=0',
      'zscale=transfer=bt709'
    );
  }
  filters.push('format=rgb24');
  return filters.join(',');
}

async function captureScreenshot(ffmpegPath, videoPath, outputPath, timestamp, options) {
  const filterChain = buildScreenshotFilters(options);
  const seekMode = options?.seekMode === 'accurate' ? 'accurate' : 'fast';
  const skipFrame = String(options?.skipFrame || '').trim();
  const args = ['-hide_banner', '-y'];
  if (skipFrame) {
    args.push('-skip_frame', skipFrame);
  }
  if (seekMode === 'fast') {
    args.push('-ss', String(timestamp));
  }
  args.push('-i', videoPath);
  if (seekMode === 'accurate') {
    args.push('-ss', String(timestamp));
  }
  args.push(
    '-map',
    '0:v:0',
    '-an',
    '-sn',
    '-frames:v',
    '1',
    '-vf',
    filterChain,
    '-compression_level',
    '3',
    '-pred',
    'mixed',
    outputPath
  );
  await runProcess(ffmpegPath, args);
}

async function uploadToImgbb(filePath, apiKey) {
  if (!apiKey) {
    throw new Error('Chiave imgBB mancante.');
  }
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');
  const form = createFormData();
  form.append('image', base64);
  const url = `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { method: 'POST', body: form });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return {
    displayUrl: data?.data?.display_url || data?.data?.url,
    viewerUrl: data?.data?.url_viewer || '',
    rawUrl: data?.data?.image?.url || data?.data?.url
  };
}

async function uploadToPtscreens(filePath, apiKey) {
  if (!apiKey) {
    throw new Error('Chiave PTScreens mancante.');
  }
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');
  const form = createFormData();
  form.append('source', base64);
  const response = await fetch('https://ptscreens.com/api/1/upload', {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: form
  });
  const data = await response.json().catch(() => null);
  const statusCode = data?.status_code || data?.success?.code || response.status;
  if (!response.ok || String(statusCode) !== '200') {
    const message = data?.status_txt || data?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  const image = data?.image || {};
  return {
    displayUrl: image.display_url || image.url_frame || image.url,
    viewerUrl: image.url_viewer || '',
    rawUrl: image.url || image.display_url
  };
}

async function uploadWithFallback(filePath, primaryHost, fallbackHost, keys) {
  const hosts = [primaryHost, fallbackHost].filter(Boolean);
  const errors = [];
  for (const host of hosts) {
    try {
      if (host === 'imgbb') {
        const result = await uploadToImgbb(filePath, keys.imgbbKey);
        return { ok: true, host, ...result };
      }
      if (host === 'ptscreens') {
        const result = await uploadToPtscreens(filePath, keys.ptscreensKey);
        return { ok: true, host, ...result };
      }
      errors.push(`Host non supportato: ${host}`);
    } catch (error) {
      errors.push(`${host}: ${error.message || error}`);
    }
  }
  return { ok: false, host: primaryHost, error: errors.join(' | ') };
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

// ===== Torrent creation helpers =====
async function getTotalSize(targetPath) {
  const stats = await fs.stat(targetPath);
  if (stats.isFile()) {
    return stats.size;
  }
  if (!stats.isDirectory()) {
    return 0;
  }
  let total = 0;
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      total += await getTotalSize(fullPath);
    } else if (entry.isFile()) {
      const fileStats = await fs.stat(fullPath);
      total += fileStats.size;
    }
  }
  return total;
}

function calculatePieceLength(totalBytes) {
  if (!totalBytes) {
    return MIN_PIECE_LENGTH;
  }
  let target = Math.ceil(totalBytes / MAX_PIECES_TARGET);
  let piece = MIN_PIECE_LENGTH;
  while (piece < target) {
    piece *= 2;
  }
  if (piece > MAX_PIECE_LENGTH) {
    piece = MAX_PIECE_LENGTH;
  }
  return piece;
}

async function getCreateTorrent() {
  if (!createTorrentModule) {
    createTorrentModule = await import('create-torrent');
  }
  return createTorrentModule.default || createTorrentModule;
}

async function createTorrentBuffer(targetPath, options) {
  const createTorrent = await getCreateTorrent();
  return new Promise((resolve, reject) => {
    createTorrent(targetPath, options, (error, torrent) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(torrent);
    });
  });
}

async function runMkbrrCreate({
  mkbrrPath,
  targetPath,
  announce,
  outputPath,
  isPrivate,
  mkbrrWorkers,
  onLine
}) {
  return new Promise((resolve, reject) => {
    const args = ['create', targetPath, '-t', announce, '-o', outputPath];
    if (Number.isFinite(mkbrrWorkers) && mkbrrWorkers > 0) {
      args.push('--workers', String(mkbrrWorkers));
    }
    if (isPrivate === false) {
      args.push('--private=false');
    }
    const child = spawn(mkbrrPath, args, { windowsHide: true });
    let stdoutBuffer = '';
    let stdout = '';
    let stderr = '';
    const flushLines = (buffer) => {
      const lines = buffer.split(/[\r\n]+/);
      const tail = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && onLine) {
          onLine(trimmed);
        }
      }
      return tail;
    };
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      stdoutBuffer = flushLines(stdoutBuffer + chunk);
    });
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (onLine) {
        for (const line of chunk.split(/[\r\n]+/)) {
          const trimmed = line.trim();
          if (trimmed) {
            onLine(trimmed);
          }
        }
      }
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (stdoutBuffer.trim() && onLine) {
        onLine(stdoutBuffer.trim());
      }
      if (code === 0) {
        resolve();
        return;
      }
      const message = stderr.trim() || stdout.trim() || `mkbrr exited with code ${code}`;
      reject(new Error(message));
    });
  });
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

// ===== Metadata providers (OMDb/TMDb/TVDb/AniList) =====
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

async function fetchTmdbSearch(query, type, apiKey, language, year) {
  const params = new URLSearchParams({ api_key: apiKey, query });
  if (language) {
    params.set('language', language);
  }
  if (year) {
    if (type === 'tv') {
      params.set('first_air_date_year', String(year));
    } else {
      params.set('year', String(year));
    }
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

async function fetchTmdbExternalIds(type, id, apiKey) {
  const params = new URLSearchParams({ api_key: apiKey });
  const url = `https://api.themoviedb.org/3/${type}/${id}/external_ids?${params.toString()}`;
  return fetchJson(url);
}

async function fetchTmdbImages(type, id, apiKey) {
  const params = new URLSearchParams({ api_key: apiKey });
  const url = `https://api.themoviedb.org/3/${type}/${id}/images?${params.toString()}`;
  return fetchJson(url);
}

async function fetchTmdbKeywords(type, id, apiKey) {
  const params = new URLSearchParams({ api_key: apiKey });
  const endpoint = type === 'tv' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${endpoint}/${id}/keywords?${params.toString()}`;
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

function getTmdbLangCode(language) {
  if (!language) {
    return '';
  }
  return String(language).split('-')[0].toLowerCase();
}

async function fetchImdbAkas(imdbId) {
  if (!imdbId) {
    return [];
  }
  const normalized = String(imdbId).startsWith('tt') ? String(imdbId) : `tt${String(imdbId).padStart(7, '0')}`;
  const query = {
    query: `
      query GetAkas {
        title(id: "${normalized}") {
          akas(first: 100) {
            edges {
              node {
                text
                country { text }
                language { text }
                attributes { text }
              }
            }
          }
        }
      }
    `
  };

  const response = await fetchJson('https://api.graphql.imdb.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });
  const edges = response?.data?.title?.akas?.edges || [];
  return edges.map((edge) => ({
    title: edge?.node?.text || '',
    country: edge?.node?.country?.text || '',
    language: edge?.node?.language?.text || '',
    attributes: edge?.node?.attributes || []
  }));
}

async function fetchAniListAnime(searchTerm) {
  const rawTerm = String(searchTerm || '').trim();
  if (!rawTerm) {
    return null;
  }
  const cleaned = rawTerm
    .replace(/\[[^\]]+]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[_\\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const candidates = [
    rawTerm,
    cleaned,
    cleaned.replace(/\bthe movie\b/i, '').trim()
  ].filter(Boolean);
  const query = `
    query ($search: String) {
      Page (page: 1, perPage: 5) {
        media (search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          seasonYear
          episodes
          tags {
            name
          }
        }
      }
    }
  `;
  const demographics = ['Shounen', 'Seinen', 'Shoujo', 'Josei', 'Kodomo', 'Mina'];

  for (const candidate of candidates) {
    try {
      const response = await fetchJson('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { search: candidate } })
      });
      const media = response?.data?.Page?.media;
      if (!Array.isArray(media) || !media.length) {
        continue;
      }
      const best = media[0] || {};
      const titles = best.title || {};
      const tags = Array.isArray(best.tags) ? best.tags : [];
      let demographic = '';
      for (const tag of demographics) {
        if (tags.some((entry) => String(entry?.name || '').toLowerCase() === tag.toLowerCase())) {
          demographic = tag;
          break;
        }
      }
      return {
        romaji: String(titles.romaji || ''),
        english: String(titles.english || ''),
        native: String(titles.native || ''),
        malId: Number(best.idMal || 0),
        seasonYear: Number(best.seasonYear || 0),
        episodes: Number(best.episodes || 0),
        demographic
      };
    } catch {
      // Try next candidate
    }
  }

  return null;
}

async function fetchAniListByMalId(malId) {
  const numericId = Number(String(malId || '').replace(/[^\d]/g, ''));
  if (!numericId) {
    return null;
  }
  const query = `
    query ($id: Int) {
      Media (idMal: $id, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        seasonYear
        episodes
        tags {
          name
        }
      }
    }
  `;
  const demographics = ['Shounen', 'Seinen', 'Shoujo', 'Josei', 'Kodomo', 'Mina'];
  const response = await fetchJson('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { id: numericId } })
  });
  const best = response?.data?.Media;
  if (!best) {
    return null;
  }
  const titles = best.title || {};
  const tags = Array.isArray(best.tags) ? best.tags : [];
  let demographic = '';
  for (const tag of demographics) {
    if (tags.some((entry) => String(entry?.name || '').toLowerCase() === tag.toLowerCase())) {
      demographic = tag;
      break;
    }
  }
  return {
    romaji: String(titles.romaji || ''),
    english: String(titles.english || ''),
    native: String(titles.native || ''),
    malId: Number(best.idMal || numericId || 0),
    seasonYear: Number(best.seasonYear || 0),
    episodes: Number(best.episodes || 0),
    demographic
  };
}

function pickItalianImdbTitle(akas) {
  if (!Array.isArray(akas)) {
    return '';
  }
  const hasAttrs = (attrs) => Array.isArray(attrs) && attrs.length > 0;
  const countryMatch = akas.find((aka) => aka?.country === 'Italy' && !hasAttrs(aka?.attributes));
  if (countryMatch?.title) {
    return String(countryMatch.title);
  }
  const languageMatch = akas.find((aka) => aka?.language === 'Italy' && !hasAttrs(aka?.attributes));
  return languageMatch?.title ? String(languageMatch.title) : '';
}

function hasCjkChars(value) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uF900-\uFAFF]/.test(String(value || ''));
}

function toEpisodeKey(season, episode) {
  const seasonNum = Number(season || 0);
  const episodeNum = Number(episode || 0);
  if (!seasonNum && !episodeNum) {
    return '';
  }
  return `${seasonNum}-${episodeNum}`;
}

function buildEpisodeFallbackMap(episodes, seasonHint = '') {
  const map = new Map();
  const seasonTarget = Number(seasonHint || 0);
  if (!Array.isArray(episodes)) {
    return map;
  }
  episodes.forEach((ep) => {
    const season = Number(ep?.season ?? ep?.season_number ?? seasonTarget);
    const episode = Number(ep?.episode ?? ep?.episode_number ?? 0);
    const name = ep?.name || '';
    const key = toEpisodeKey(season, episode);
    if (key && name) {
      map.set(key, name);
    }
  });
  return map;
}

function pickTmdbLogo(logos, preferredLang, originalLang) {
  if (!Array.isArray(logos) || !logos.length) {
    return '';
  }
  const preferred = getTmdbLangCode(preferredLang);
  const original = getTmdbLangCode(originalLang);
  if (preferred) {
    const match = logos.find((logo) => logo?.iso_639_1 === preferred);
    if (match?.file_path) {
      return match.file_path;
    }
  }
  if (original) {
    const match = logos.find((logo) => logo?.iso_639_1 === original);
    if (match?.file_path) {
      return match.file_path;
    }
  }
  const fallback = logos.find((logo) => logo?.file_path);
  return fallback?.file_path || '';
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
  const debug = { language: language || '', pages: 0, pageSizes: [], lastKeys: [], lastLinks: null };

  while (hasNext && safety < 50) {
    const data = await tvdbRequest(`/series/${seriesId}/episodes/default?page=${page}`, token, language);
    const dataNode = data?.data;
    const pageEpisodes = Array.isArray(dataNode)
      ? dataNode
      : Array.isArray(dataNode?.episodes)
        ? dataNode.episodes
        : Array.isArray(dataNode?.items)
          ? dataNode.items
          : [];
    episodes.push(...pageEpisodes);
    debug.pages += 1;
    debug.pageSizes.push(pageEpisodes.length);
    debug.lastKeys = Object.keys(data || {});
    debug.lastLinks = data?.links || null;
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

  return {
    episodes: episodes.map((ep) => ({
      season: ep.seasonNumber ?? ep.season,
      episode: ep.number ?? ep.episodeNumber ?? ep.absoluteNumber,
      name: ep.name || ep.episodeName || ''
    })),
    debug
  };
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
  const iconPath = path.join(
    __dirname,
    'assets',
    'icons',
    process.platform === 'win32' ? 'app.ico' : 'app.png'
  );
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1280,
    minHeight: 840,
    autoHideMenuBar: true,
    backgroundColor: '#111319',
    icon: iconPath,
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
  const toggleDevTools = () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      return;
    }
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
    } else {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  };
  globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);
  globalShortcut.register('F12', toggleDevTools);

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

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ===== IPC handlers =====
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

ipcMain.handle('select-any-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Executable', extensions: ['exe'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('app-version', () => app.getVersion());

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

ipcMain.handle('check-update', async () => {
  try {
    const resp = await fetch('https://api.github.com/repos/tiberio87/SHRI-Tools/releases/latest', {
      headers: { 'User-Agent': 'SHRI-Tools-updater' }
    });
    if (!resp.ok) return { hasUpdate: false };
    const data = await resp.json();
    const latest = String(data.tag_name || '').replace(/^v/, '');
    const current = app.getVersion();
    const hasUpdate = latest && compareVersions(latest, current) > 0;
    return { hasUpdate: !!hasUpdate, latestVersion: latest, releaseUrl: data.html_url || '' };
  } catch {
    return { hasUpdate: false };
  }
});

ipcMain.handle('generate-screenshots', async (_event, payload) => {
  const videoPath = payload?.videoPath || '';
  const ffmpegPath = payload?.ffmpegPath || '';
  const count = payload?.count || 6;
  const primaryHost = payload?.primaryHost || 'imgbb';
  const fallbackHost = payload?.fallbackHost || 'ptscreens';
  const imgbbKey = payload?.imgbbKey || '';
  const ptscreensKey = payload?.ptscreensKey || '';
  const requestId = payload?.requestId || '';
  const sendProgress = (data) => {
    if (!_event?.sender) {
      return;
    }
    _event.sender.send('screens-progress', {
      requestId,
      ...data
    });
  };

  if (!videoPath) {
    return { ok: false, error: 'File video mancante.' };
  }
  if (!ffmpegPath) {
    return { ok: false, error: 'FFmpeg non configurato.' };
  }

  const ffprobePath = resolveFfprobePath(ffmpegPath);
  if (!fsSync.existsSync(ffprobePath)) {
    return { ok: false, error: 'FFprobe non trovato vicino a FFmpeg.' };
  }

  const outputDir = path.join(app.getPath('temp'), 'shri-tools', 'screenshots', String(Date.now()));
  await fs.mkdir(outputDir, { recursive: true });

  sendProgress({
    stage: 'debug',
    message: `[screens:init] video="${videoPath}" count=${count} primaryHost=${primaryHost} fallbackHost=${fallbackHost} imgbbKey=${imgbbKey ? 'present' : 'missing'} ptscreensKey=${ptscreensKey ? 'present' : 'missing'} isDisc=${payload?.isDisc || false} category=${payload?.category || 'Movie'} seekMode=${payload?.seekMode || 'fast'} skipFrame=${payload?.skipFrame || '(none)'} outputDir="${outputDir}"`
  });

  try {
    let duration;
    try {
      duration = await getVideoDurationSeconds(ffprobePath, videoPath);
      sendProgress({ stage: 'debug', message: `[screens:duration] ${duration.toFixed(3)}s` });
    } catch (err) {
      sendProgress({ stage: 'debug', message: `[screens:duration:error] ${err.message || err}` });
      throw err;
    }
    let mediaInfo = null;
    try {
      mediaInfo = await analyzeMedia(videoPath);
    } catch {
      mediaInfo = null;
    }
    const videoTrack = getVideoTrack(mediaInfo);
    const frameRate = parseFrameRate(videoTrack, 24);
    sendProgress({
      stage: 'debug',
      message: `[screens:video] ${videoTrack?.Width || '?'}x${videoTrack?.Height || '?'} PAR=${videoTrack?.PixelAspectRatio || '?'} DAR=${videoTrack?.DisplayAspectRatio || '?'} fps=${frameRate}`
    });
    const timesDebug = buildUaScreenshotTimesDebug({
      durationSeconds: duration,
      frameRate,
      count,
      isDisc: Boolean(payload?.isDisc),
      category: payload?.category || 'Movie',
      retakeCount: payload?.retakeCount || 0
    });
    const times = timesDebug.times;
    sendProgress({
      stage: 'debug',
      message: `[screens:times] requested=${count} totalScreens=${timesDebug.totalScreens} totalFrames=${timesDebug.totalFrames} startFrame=${timesDebug.startFrame} endFrame=${timesDebug.endFrame} usableFrames=${timesDebug.usableFrames} frameInterval=${timesDebug.frameInterval} category=${timesDebug.category} isDisc=${timesDebug.isDisc} retake=${timesDebug.retakeCount} computed=${times.length} times=[${times.map((t) => Number(t).toFixed(3)).join(', ')}]`
    });
    const usedFallbackTimes = !times.length;
    if (usedFallbackTimes) {
      times.push(...buildScreenshotTimes(duration, count));
      sendProgress({
        stage: 'debug',
        message: `[screens:times:fallback] frameRate=${frameRate} duration=${duration} → fallback times=[${times.map((t) => Number(t).toFixed(3)).join(', ')}]`
      });
    }
    const totalShots = times.length;
    const totalSteps = totalShots * 2;
    let stepIndex = 0;
    sendProgress({ progress: 0, stage: 'start', current: 0, total: totalShots });
    const width = parseNumber(videoTrack?.Width, 1920);
    const height = parseNumber(videoTrack?.Height, 1080);
    const par = parseNumber(videoTrack?.PixelAspectRatio, 1);
    const dar = parseRatio(
      videoTrack?.DisplayAspectRatio,
      width && height ? width / height : 16 / 9
    );
    const { wSar, hSar } = deriveSar(width, height, par, dar);
    const scaledWidth = Math.round(width * wSar);
    const scaledHeight = Math.round(height * hSar);
    const needsScale = Boolean(scaledWidth && scaledHeight) &&
      (Math.round(width) !== scaledWidth || Math.round(height) !== scaledHeight);
    let tonemapEnabled = detectHdr(mediaInfo);
    let tonemapApplied = false;

    sendProgress({
      stage: 'debug',
      message: `[screens:scale] source=${width}x${height} PAR=${par.toFixed(4)} DAR=${dar.toFixed(4)} scaled=${scaledWidth}x${scaledHeight} needsScale=${needsScale} hdr=${tonemapEnabled} seekMode=${payload?.seekMode || 'fast'} skipFrame=${payload?.skipFrame || '(none)'}`
    });

    const images = [];
    let index = 0;
    for (const time of times) {
      index += 1;
      const fileName = `shot_${String(index).padStart(2, '0')}.png`;
      const filePath = path.join(outputDir, fileName);
      const options = {
        scaleWidth: needsScale ? scaledWidth : 0,
        scaleHeight: needsScale ? scaledHeight : 0,
        tonemap: tonemapEnabled,
        skipFrame: payload?.skipFrame || '',
        seekMode: payload?.seekMode || ''
      };
      let captureError = null;
      try {
        await captureScreenshot(ffmpegPath, videoPath, filePath, time, options);
        tonemapApplied = tonemapApplied || tonemapEnabled;
        sendProgress({
          stage: 'debug',
          message: `[screens:capture:ok] #${index} t=${Number(time).toFixed(3)}s file="${fileName}"`
        });
      } catch (error) {
        captureError = error;
        if (tonemapEnabled) {
          sendProgress({
            stage: 'debug',
            message: `[screens:capture:tonemap-retry] #${index} t=${Number(time).toFixed(3)}s err="${error.message || error}"`
          });
          tonemapEnabled = false;
          try {
            await captureScreenshot(ffmpegPath, videoPath, filePath, time, {
              scaleWidth: needsScale ? scaledWidth : 0,
              scaleHeight: needsScale ? scaledHeight : 0,
              tonemap: false,
              skipFrame: payload?.skipFrame || '',
              seekMode: payload?.seekMode || ''
            });
            captureError = null;
            sendProgress({
              stage: 'debug',
              message: `[screens:capture:ok-no-tonemap] #${index} t=${Number(time).toFixed(3)}s`
            });
          } catch (err2) {
            captureError = err2;
            sendProgress({
              stage: 'debug',
              message: `[screens:capture:fail] #${index} t=${Number(time).toFixed(3)}s err="${err2.message || err2}"`
            });
            throw err2;
          }
        } else {
          sendProgress({
            stage: 'debug',
            message: `[screens:capture:fail] #${index} t=${Number(time).toFixed(3)}s err="${error.message || error}"`
          });
          throw error;
        }
      }
      stepIndex += 1;
      sendProgress({
        progress: totalSteps ? stepIndex / totalSteps : 0,
        stage: 'extract',
        current: index,
        total: totalShots
      });

      const upload = await uploadWithFallback(filePath, primaryHost, fallbackHost, {
        imgbbKey,
        ptscreensKey
      });
      if (upload.ok) {
        sendProgress({
          stage: 'debug',
          message: `[screens:upload:ok] #${index} host=${upload.host} url="${upload.displayUrl || upload.rawUrl || ''}"`
        });
        try {
          await fs.unlink(filePath);
        } catch {}
      } else {
        sendProgress({
          stage: 'debug',
          message: `[screens:upload:fail] #${index} host=${upload.host} err="${upload.error || 'unknown'}"`
        });
      }
      stepIndex += 1;
      sendProgress({
        progress: totalSteps ? stepIndex / totalSteps : 0,
        stage: 'upload',
        current: index,
        total: totalShots,
        host: upload.host
      });

      images.push({
        ok: upload.ok,
        host: upload.host,
        filePath,
        displayUrl: upload.displayUrl || '',
        viewerUrl: upload.viewerUrl || '',
        rawUrl: upload.rawUrl || '',
        error: upload.error || ''
      });
    }

    const okCount = images.filter((img) => img.ok).length;
    sendProgress({
      stage: 'debug',
      message: `[screens:done] ok=${okCount}/${images.length} tonemapped=${tonemapApplied}`
    });
    sendProgress({ progress: 1, stage: 'done', current: totalShots, total: totalShots });
    return { ok: true, outputDir, images, tonemapped: tonemapApplied };
  } catch (error) {
    sendProgress({ stage: 'debug', message: `[screens:fatal] ${error.message || error}` });
    sendProgress({ stage: 'error', error: String(error) });
    return { ok: false, error: String(error) };
  }
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

ipcMain.handle('bdinfo-cancel', async (_event, payload) => {
  const requestId = String(payload?.requestId || '').trim();
  if (!requestId) {
    return { ok: false, error: 'RequestId mancante.' };
  }
  const job = bdinfoJobs.get(requestId);
  if (!job) {
    return { ok: false, error: 'Nessun processo BDInfo attivo.' };
  }
  job.cancelled = true;
  if (job.child) {
    try {
      job.child.kill();
    } catch {
      // ignore kill errors
    }
  }
  if (job.sender) {
    job.sender.send('bdinfo-progress', {
      requestId,
      targetPath: job.targetPath,
      stage: 'cancelled',
      text: 'Operazione annullata',
      progress: 0
    });
  }
  return { ok: true };
});

ipcMain.handle('bdinfo-text', async (_event, payload) => {
  const targetPath = String(payload?.path || '').trim();
  const bdinfoPath = String(payload?.bdinfoPath || '').trim();
  const requestId = String(payload?.requestId || '').trim();
  const listOnly = Boolean(payload?.listOnly);
  const playlistOverride = String(payload?.playlist || '').trim();
  const sendProgress = (data) => {
    if (_event?.sender) {
      _event.sender.send('bdinfo-progress', {
        requestId,
        targetPath,
        ...data
      });
    }
  };
  if (!targetPath) {
    return { ok: false, text: '', error: 'Percorso disco mancante.' };
  }
  if (!bdinfoPath) {
    return { ok: false, text: '', error: 'Percorso BDInfo mancante.' };
  }
  if (!fsSync.existsSync(bdinfoPath)) {
    return { ok: false, text: '', error: 'BDInfo non trovato al percorso indicato.' };
  }

  const job = requestId
    ? {
        requestId,
        targetPath,
        sender: _event?.sender || null,
        cancelled: false,
        child: null
      }
    : null;
  if (job) {
    bdinfoJobs.set(requestId, job);
  }

  let reportDir = '';
  try {
    reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bdinfo-'));
    sendProgress({ stage: 'start', text: 'Avvio BDInfo...' });
    const parseDurationSeconds = (value) => {
      const parts = String(value || '').trim().split(':').map((part) => Number.parseInt(part, 10));
      if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
        return 0;
      }
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    };
    const parsePlaylistList = (output) => {
      const lines = String(output || '').split(/\r?\n/);
      const entries = [];
      const lineReLegacy = /^\s*\d+\s+\d+\s+([0-9]{5}\.MPLS)\s+([0-9]{2}:[0-9]{2}:[0-9]{2})\s+([0-9\.,]+)\s+/i;
      const lineReSimple = /^\s*\d+\s*:\s*([0-9]{5}\.MPLS)\s+([0-9]{2}:[0-9]{2}:[0-9]{2})\b/i;
      for (const line of lines) {
        let match = lineReLegacy.exec(line);
        if (match) {
          const playlist = match[1];
          const duration = match[2];
          const estimatedRaw = match[3] || '';
          const estimated = Number(estimatedRaw.replace(/[^\d]/g, ''));
          entries.push({
            playlist,
            duration,
            durationSeconds: parseDurationSeconds(duration),
            estimated
          });
          continue;
        }
        match = lineReSimple.exec(line);
        if (match) {
          const playlist = match[1];
          const duration = match[2];
          entries.push({
            playlist,
            duration,
            durationSeconds: parseDurationSeconds(duration),
            estimated: 0
          });
        }
      }
      return entries;
    };

    const listResult = await runCommand(bdinfoPath, ['-l', targetPath], { cwd: reportDir });
    const playlists = listResult.ok ? parsePlaylistList(listResult.stdout) : [];
    const hasEstimated = playlists.some((item) => item.estimated > 0);
    const selected = playlists
      .slice()
      .sort((a, b) => {
        if (hasEstimated) {
          return (b.estimated || 0) - (a.estimated || 0);
        }
        return (b.durationSeconds || 0) - (a.durationSeconds || 0);
      })[0]?.playlist || '';
    if (job?.cancelled) {
      return { ok: false, text: listResult.stdout || listResult.stderr || '', error: 'Operazione annullata.' };
    }

    if (listOnly) {
      sendProgress({ stage: 'list', text: 'Playlist BDInfo caricate.' });
      return { ok: listResult.ok, text: listResult.stdout || '', error: listResult.stderr || '', playlists };
    }

    const chosenPlaylist = playlistOverride || selected;
    const scanArgs = chosenPlaylist
      ? ['-m', chosenPlaylist, targetPath, reportDir]
      : ['-w', targetPath, reportDir];
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let collectingM2ts = false;
    const totalM2tsSet = new Set();
    const processedM2tsSet = new Set();
    const sendM2tsProgress = (text, overrideProgress) => {
      const totalM2ts = totalM2tsSet.size;
      const processedM2ts = processedM2tsSet.size;
      const payload = {
        stage: 'scan',
        text,
        totalM2ts,
        processedM2ts
      };
      if (Number.isFinite(overrideProgress)) {
        payload.progress = Math.max(0, Math.min(1, overrideProgress));
      } else if (totalM2ts > 0) {
        payload.progress = Math.max(0, Math.min(1, processedM2ts / totalM2ts));
      }
      sendProgress(payload);
    };
    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      if (/please wait while we scan the disc/i.test(trimmed)) {
        collectingM2ts = false;
        sendM2tsProgress('Scansione BDInfo in corso...');
        return;
      }
      if (/preparing to analyze/i.test(trimmed)) {
        collectingM2ts = true;
        sendM2tsProgress('Analisi playlist BDInfo...');
        return;
      }
      if (/^\s*file\s+elapsed\s+remaining/i.test(trimmed)) {
        collectingM2ts = false;
        return;
      }
      if (/please wait while we generate the report/i.test(trimmed)) {
        collectingM2ts = false;
        sendProgress({
          stage: 'report',
          text: 'Generazione report BDInfo...',
          totalM2ts: totalM2tsSet.size,
          processedM2ts: processedM2tsSet.size
        });
        return;
      }
      const match = trimmed.match(/Scanning\s+(\d+)%/i);
      if (match) {
        const pct = Math.max(0, Math.min(100, Number.parseInt(match[1], 10)));
        collectingM2ts = false;
        const pctTokens = trimmed.match(/\b(\d{5}\.M2TS)\b/gi);
        if (pctTokens && pctTokens.length) {
          pctTokens.forEach((token) => processedM2tsSet.add(token.toUpperCase()));
        }
        sendProgress({
          stage: 'scan',
          progress: pct / 100,
          text: `Scansione ${pct}%`,
          totalM2ts: totalM2tsSet.size,
          processedM2ts: processedM2tsSet.size
        });
        return;
      }
      const m2tsTokens = trimmed.match(/\b(\d{5}\.M2TS)\b/gi);
      if (m2tsTokens && m2tsTokens.length) {
        if (collectingM2ts) {
          m2tsTokens.forEach((token) => totalM2tsSet.add(token.toUpperCase()));
          sendM2tsProgress('Analisi playlist BDInfo...');
          return;
        }
        m2tsTokens.forEach((token) => processedM2tsSet.add(token.toUpperCase()));
        sendM2tsProgress(`Elaborazione: ${m2tsTokens[0]}`);
        return;
      }
      if (/scan completed successfully/i.test(trimmed)) {
        sendProgress({
          stage: 'report',
          progress: 1,
          text: 'Scansione completata',
          totalM2ts: totalM2tsSet.size,
          processedM2ts: processedM2tsSet.size
        });
      }
    };
    const feedBuffer = (buffer, chunk) => {
      const next = buffer + chunk;
      const parts = next.split(/[\r\n]+/);
      const tail = parts.pop() || '';
      parts.forEach(handleLine);
      return tail;
    };
    const onStdout = (chunk) => {
      stdoutBuffer = feedBuffer(stdoutBuffer, chunk);
    };
    const onStderr = (chunk) => {
      stderrBuffer = feedBuffer(stderrBuffer, chunk);
    };
    const result = await new Promise((resolve) => {
      try {
        const child = spawn(bdinfoPath, scanArgs, { cwd: reportDir, windowsHide: true });
        let stdout = '';
        let stderr = '';
        if (job) {
          job.child = child;
        }
        child.stdout?.on('data', (chunk) => {
          const text = chunk.toString();
          stdout += text;
          onStdout(text);
        });
        child.stderr?.on('data', (chunk) => {
          const text = chunk.toString();
          stderr += text;
          onStderr(text);
        });
        child.on('error', (error) => {
          resolve({
            ok: false,
            error,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            code: -1
          });
        });
        child.on('close', (code) => {
          resolve({
            ok: code === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            code
          });
        });
      } catch (error) {
        resolve({ ok: false, error, stdout: '', stderr: '', code: -1 });
      }
    });

    if (job) {
      job.child = null;
    }

    if (job?.cancelled) {
      return { ok: false, text: result.stdout || result.stderr || '', error: 'Operazione annullata.' };
    }

    if (!result.ok) {
      sendProgress({ stage: 'error', text: 'Errore BDInfo' });
      return {
        ok: false,
        text: result.stdout || result.stderr || '',
        error: result.stderr || result.stdout || `BDInfo exited with code ${result.code}`
      };
    }

    if (job?.cancelled) {
      return { ok: false, text: '', error: 'Operazione annullata.' };
    }

    const findLatestReport = async (dir, depth = 0) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      let best = null;
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (depth < 2) {
            const nested = await findLatestReport(entryPath, depth + 1);
            if (nested && (!best || nested.mtimeMs > best.mtimeMs)) {
              best = nested;
            }
          }
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (ext !== '.txt' && ext !== '.log') {
          continue;
        }
        const stat = await fs.stat(entryPath);
        if (!best || stat.mtimeMs > best.mtimeMs) {
          best = { path: entryPath, mtimeMs: stat.mtimeMs };
        }
      }
      return best;
    };

    const report = await findLatestReport(reportDir);
    if (!report?.path) {
      return { ok: false, text: '', error: 'BDInfo non ha generato alcun report.' };
    }
    const text = await readFile(report.path, 'utf-8');
    sendProgress({ stage: 'done', progress: 1, text: 'Completato' });
    return { ok: true, text, error: '', playlist: chosenPlaylist || selected, playlists };
  } catch (error) {
    sendProgress({ stage: 'error', text: 'Errore BDInfo' });
    return { ok: false, text: '', error: String(error) };
  } finally {
    if (job && requestId) {
      bdinfoJobs.delete(requestId);
    }
    if (reportDir) {
      try {
        await fs.rm(reportDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
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

ipcMain.handle('create-torrent', async (_event, payload) => {
  try {
    const targetPath = payload?.targetPath || '';
    const announce = payload?.announce || '';
    const outputDir = payload?.outputDir || '';
    const outputName = payload?.outputName || '';
    const isPrivate = payload?.private !== false;
    const mkbrrPath = String(payload?.mkbrrPath || '').trim();
    const mkbrrWorkersRaw = payload?.mkbrrWorkers;
    const mkbrrWorkers = Number.isFinite(Number(mkbrrWorkersRaw))
      ? Number(mkbrrWorkersRaw)
      : Number.parseInt(String(mkbrrWorkersRaw || ''), 10);
    const requestId = payload?.requestId || '';
    const sendProgress = (progress, stage, logLine, generator) => {
      if (_event?.sender) {
        const payload = { requestId };
        if (typeof progress === 'number') {
          payload.progress = progress;
        }
        if (stage) {
          payload.stage = stage;
        }
        if (logLine) {
          payload.logLine = logLine;
        }
        if (generator) {
          payload.generator = generator;
        }
        _event.sender.send('torrent-progress', payload);
      }
    };

    if (!targetPath) {
      return { ok: false, error: 'Percorso mancante.' };
    }
    if (!announce) {
      return { ok: false, error: 'Announce URL mancante.' };
    }
    if (!outputDir) {
      return { ok: false, error: 'Cartella output mancante.' };
    }
    if (!outputName) {
      return { ok: false, error: 'Nome file .torrent mancante.' };
    }
    if (!fsSync.existsSync(targetPath)) {
      return { ok: false, error: 'Percorso non trovato.' };
    }

    const safeName = path.basename(outputName);
    const outputFile = safeName.toLowerCase().endsWith('.torrent')
      ? safeName
      : `${safeName}.torrent`;
    const outputPath = path.join(outputDir, outputFile);
    if (fsSync.existsSync(outputPath)) {
      return { ok: false, error: 'File .torrent già esistente.' };
    }

    await fs.mkdir(outputDir, { recursive: true });
    let pieceLength = null;
    let torrent = null;
    let warning = '';
    let generator = 'node';

    if (mkbrrPath) {
      try {
        sendProgress(0, 'hashing', null, 'mkbrr');
        const handleMkbrrLine = (rawLine) => {
          let line = stripAnsi(rawLine).replace(/\s+/g, ' ').trim();
          if (!line) {
            return;
          }
          if (line.startsWith('Hashing pieces')) {
            if (line.includes('Hashing pieces', 1)) {
              const parts = line.split('Hashing pieces').filter(Boolean);
              const last = parts[parts.length - 1] || '';
              line = `Hashing pieces${last}`;
            }
            line = line
              .replace(/\[[= >]+\]/g, '')
              .replace(/\[\d+s:\d+s\]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            const percentMatch = line.match(/(\d{1,3})%/);
            if (percentMatch) {
              const percent = Math.min(100, parseInt(percentMatch[1], 10) || 0);
              sendProgress(percent / 100, 'hashing', line, 'mkbrr');
              return;
            }
            sendProgress(null, null, line, 'mkbrr');
            return;
          }
          if (line.startsWith('Concurrency:') || line.startsWith('Files being hashed:')) {
            sendProgress(null, null, line, 'mkbrr');
            return;
          }
          if (/^[└├]─/.test(line) && !/\((?:\d+(?:\.\d+)?\s)?(GiB|MiB|KiB|GB|MB|KB)\)/.test(line)) {
            sendProgress(null, null, line, 'mkbrr');
            return;
          }
          if (line.startsWith('Wrote ')) {
            sendProgress(null, null, line, 'mkbrr');
          }
        };
        await runMkbrrCreate({
          mkbrrPath,
          targetPath,
          announce,
          outputPath,
          isPrivate,
          mkbrrWorkers,
          onLine: handleMkbrrLine
        });
        generator = 'mkbrr';
        sendProgress(0.99, 'writing');
        const stats = await fs.stat(outputPath);
        if (stats.size > MAX_TORRENT_SIZE) {
          warning = 'Il file .torrent supera 2MB. Aumenta la piece size.';
        }
        sendProgress(1, 'done');
        return {
          ok: true,
          outputPath,
          pieceLength: null,
          warning,
          generator
        };
      } catch {
        generator = 'node';
        sendProgress(null, 'hashing', 'mkbrr non disponibile, uso Node.', 'node');
      }
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      sendProgress(0, 'hashing');
      const options = {
        announce: [announce],
        private: isPrivate,
        name: path.basename(targetPath),
        createdBy: 'SHRI-Tools',
        pad: false,
        onProgress: (progress) => {
          const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
          const clamped = normalized >= 1 ? 0.98 : normalized;
          sendProgress(clamped, 'hashing');
        }
      };
      if (pieceLength) {
        options.pieceLength = pieceLength;
      }
      torrent = await createTorrentBuffer(targetPath, options);
      sendProgress(0.99, 'encoding');

      if (!torrent || torrent.length <= MAX_TORRENT_SIZE || pieceLength >= MAX_PIECE_LENGTH) {
        break;
      }
      pieceLength = pieceLength ? Math.min(pieceLength * 2, MAX_PIECE_LENGTH) : MIN_PIECE_LENGTH;
    }

    if (torrent && torrent.length > MAX_TORRENT_SIZE) {
      warning = 'Il file .torrent supera 2MB. Aumenta la piece size.';
    }

    if (!torrent) {
      return { ok: false, error: 'Impossibile generare il torrent.' };
    }

    sendProgress(0.99, 'writing');
    await fs.writeFile(outputPath, torrent);
    sendProgress(1, 'done');
    return {
      ok: true,
      outputPath,
      pieceLength,
      warning,
      generator
    };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle('verify-api-key', async (_event, payload) => {
  const service = payload?.service || '';
  const apiKey = payload?.apiKey || '';
  const baseUrl = payload?.baseUrl || '';
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
    } else if (service === 'imgbb') {
      await verifyImgbbKey(apiKey);
    } else if (service === 'ptscreens') {
      await verifyPtscreensKey(apiKey);
    } else if (service === 'unit3d') {
      await verifyUnit3dKey(apiKey, baseUrl);
    } else {
      return { ok: false, error: 'Servizio non supportato.' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle('unit3d-upload', async (_event, payload) => {
  try {
    const result = await uploadUnit3dTorrent(payload || {});
    if (result.ok) {
      const message = result.data?.message || 'Upload completato.';
      return {
        ok: true,
        message,
        data: result.data || null,
        raw: result.raw || '',
        status: result.status || 0
      };
    }
    return {
      ok: false,
      error: result.error || 'Errore upload.',
      details: result.details || '',
      raw: result.raw || '',
      status: result.status || 0
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Errore upload.' };
  }
});

ipcMain.handle('unit3d-fetch-torrent', async (_event, payload) => {
  try {
    const result = await fetchUnit3dTorrent(payload || {});
    if (result.ok) {
      return {
        ok: true,
        status: result.status || 0,
        data: result.data || null,
        raw: result.raw || ''
      };
    }
    return {
      ok: false,
      status: result.status || 0,
      error: result.error || 'Errore fetch torrent.',
      raw: result.raw || ''
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Errore fetch torrent.' };
  }
});

ipcMain.handle('unit3d-search-duplicates', async (_event, payload) => {
  try {
    const result = await searchUnit3dDuplicates(payload || {});
    if (result.ok) {
      return {
        ok: true,
        status: result.status || 0,
        data: result.data || null,
        raw: result.raw || ''
      };
    }
    return {
      ok: false,
      status: result.status || 0,
      error: result.error || 'Errore verifica duplicati.',
      raw: result.raw || ''
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Errore verifica duplicati.' };
  }
});

ipcMain.handle('unit3d-download-torrent', async (_event, payload) => {
  try {
    const result = await downloadUnit3dTorrent(payload || {});
    if (result.ok) {
      return {
        ok: true,
        outputPath: result.outputPath || '',
        status: result.status || 0
      };
    }
    return {
      ok: false,
      error: result.error || 'Errore download.',
      status: result.status || 0
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Errore download.' };
  }
});

ipcMain.handle('qbit-add-torrent', async (_event, payload) => {
  try {
    const result = await addQbittorrentTorrent(payload || {});
    if (result.ok) {
      return { ok: true, message: result.message || 'Ok.' };
    }
    return { ok: false, error: result.error || 'Errore qBittorrent.' };
  } catch (error) {
    return { ok: false, error: error?.message || 'Errore qBittorrent.' };
  }
});

ipcMain.handle('qbit-test', async (_event, payload) => {
  try {
    const result = await testQbittorrentConnection(payload || {});
    if (result.ok) {
      return { ok: true, version: result.version || '' };
    }
    return { ok: false, error: result.error || 'Errore qBittorrent.' };
  } catch (error) {
    return { ok: false, error: error?.message || 'Errore qBittorrent.' };
  }
});

ipcMain.handle('transmission-add-torrent', async (_event, payload) => {
  try {
    const result = await addTransmissionTorrent(payload || {});
    if (result.ok) {
      return { ok: true, message: result.message || 'Ok.' };
    }
    return { ok: false, error: result.error || 'Errore Transmission.' };
  } catch (error) {
    return { ok: false, error: error?.message || 'Errore Transmission.' };
  }
});

ipcMain.handle('transmission-test', async (_event, payload) => {
  try {
    const result = await testTransmissionConnection(payload || {});
    if (result.ok) {
      return { ok: true, version: result.version || '' };
    }
    return { ok: false, error: result.error || 'Errore Transmission.' };
  } catch (error) {
    return { ok: false, error: error?.message || 'Errore Transmission.' };
  }
});

ipcMain.handle('ua-start', async (event, payload) => {
  if (uaProcess) {
    return { ok: false, error: 'Upload Assistant gia in esecuzione.' };
  }
  const baseDir = String(payload?.baseDir || '').trim();
  const args = Array.isArray(payload?.args) ? payload.args : [];
  if (!baseDir || !fsSync.existsSync(baseDir)) {
    return { ok: false, error: 'Percorso Upload Assistant non valido.' };
  }
  if (!args.length) {
    return { ok: false, error: 'Comando Upload Assistant mancante.' };
  }

  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  try {
    uaSender = event.sender;
    uaProcess = spawn(pythonBin, args, {
      cwd: baseDir,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        FORCE_COLOR: '1',
        TERM: 'xterm-256color'
      }
    });

    uaProcess.stdout.on('data', (chunk) => {
      sendUaOutput(chunk.toString(), 'stdout');
    });
    uaProcess.stderr.on('data', (chunk) => {
      sendUaOutput(chunk.toString(), 'stderr');
    });
    uaProcess.on('error', (error) => {
      sendUaOutput(`Errore: ${error.message}\n`, 'stderr');
      uaProcess = null;
      sendUaExit(1);
    });
    uaProcess.on('exit', (code, signal) => {
      uaProcess = null;
      sendUaExit(code ?? 0, signal || '');
    });

    return { ok: true };
  } catch (error) {
    uaProcess = null;
    sendUaOutput(`Errore: ${error.message}\n`, 'stderr');
    sendUaExit(1);
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle('ua-input', async (_event, text) => {
  if (!uaProcess || !uaProcess.stdin || !uaProcess.stdin.writable) {
    return { ok: false, error: 'Processo non attivo.' };
  }
  const line = String(text || '').replace(/\r?\n/g, '').trim();
  if (!line) {
    return { ok: false, error: 'Input vuoto.' };
  }
  uaProcess.stdin.write(`${line}\n`);
  return { ok: true };
});

ipcMain.handle('ua-stop', async () => {
  if (!uaProcess) {
    return { ok: false, error: 'Processo non attivo.' };
  }
  uaProcess.kill();
  uaProcess = null;
  sendUaExit(0, 'killed');
  return { ok: true };
});

function normalizeUaUpdateCommands(commands) {
  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  return commands
    .map((command) => String(command || '').trim())
    .filter(Boolean)
    .map((command) => command.replace(/\bpython\b/g, pythonBin));
}

ipcMain.handle('ua-update-start', async (event, payload) => {
  if (uaUpdateProcess) {
    return { ok: false, error: 'Aggiornamento gia in esecuzione.' };
  }
  if (uaProcess) {
    return { ok: false, error: 'Upload Assistant e gia in esecuzione.' };
  }
  const baseDir = String(payload?.baseDir || '').trim();
  const commands = normalizeUaUpdateCommands(payload?.commands || []);
  if (!baseDir || !fsSync.existsSync(baseDir)) {
    return { ok: false, error: 'Percorso Upload Assistant non valido.' };
  }
  if (!commands.length) {
    return { ok: false, error: 'Comandi di aggiornamento mancanti.' };
  }

  const isWin = process.platform === 'win32';
  const commandLine = commands.join(' && ');
  const shell = isWin ? 'cmd.exe' : '/bin/sh';
  const shellArgs = isWin
    ? ['/d', '/s', '/c', `chcp 65001>nul && ${commandLine}`]
    : ['-lc', commandLine];

  try {
    uaUpdateSender = event.sender;
    uaUpdateProcess = spawn(shell, shellArgs, {
      cwd: baseDir,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        FORCE_COLOR: '1',
        TERM: 'xterm-256color'
      }
    });

    uaUpdateProcess.stdout.on('data', (chunk) => {
      sendUaUpdateOutput(chunk.toString(), 'stdout');
    });
    uaUpdateProcess.stderr.on('data', (chunk) => {
      sendUaUpdateOutput(chunk.toString(), 'stderr');
    });
    uaUpdateProcess.on('error', (error) => {
      sendUaUpdateOutput(`Errore: ${error.message}\n`, 'stderr');
      uaUpdateProcess = null;
      sendUaUpdateExit(1);
    });
    uaUpdateProcess.on('exit', (code, signal) => {
      uaUpdateProcess = null;
      sendUaUpdateExit(code ?? 0, signal || '');
    });

    return { ok: true };
  } catch (error) {
    uaUpdateProcess = null;
    sendUaUpdateOutput(`Errore: ${error.message}\n`, 'stderr');
    sendUaUpdateExit(1);
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle('ua-update-input', async (_event, text) => {
  if (!uaUpdateProcess || !uaUpdateProcess.stdin || !uaUpdateProcess.stdin.writable) {
    return { ok: false, error: 'Aggiornamento non attivo.' };
  }
  const line = String(text || '').replace(/\r?\n/g, '').trim();
  if (!line) {
    return { ok: false, error: 'Input vuoto.' };
  }
  uaUpdateProcess.stdin.write(`${line}\n`);
  return { ok: true };
});

ipcMain.handle('ua-update-stop', async () => {
  if (!uaUpdateProcess) {
    return { ok: false, error: 'Aggiornamento non attivo.' };
  }
  uaUpdateProcess.kill();
  uaUpdateProcess = null;
  sendUaUpdateExit(0, 'killed');
  return { ok: true };
});

ipcMain.handle('ua-read-config', async (_event, payload) => {
  const baseDir = String(payload?.baseDir || '').trim();
  if (!baseDir) {
    return { ok: false, error: 'Percorso Upload Assistant non valido.' };
  }
  const configPath = path.join(baseDir, 'data', 'config.py');
  if (!fsSync.existsSync(configPath)) {
    return { ok: false, error: 'config.py non trovato.', configPath };
  }
  try {
    const content = await fs.readFile(configPath, 'utf8');
    return { ok: true, content, configPath };
  } catch (error) {
    return { ok: false, error: error?.message || 'Impossibile leggere config.py.' };
  }
});

ipcMain.handle('ua-check-version', async (_event, payload) => {
  const baseDir = String(payload?.baseDir || '').trim();
  if (!baseDir) {
    return { ok: false, error: 'Percorso Upload Assistant non valido.' };
  }
  const gitDir = path.join(baseDir, '.git');
  if (!fsSync.existsSync(gitDir)) {
    return { ok: false, isGit: false, error: 'Repo git non trovato.' };
  }
  const branchRes = await runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: baseDir });
  if (!branchRes.ok) {
    return { ok: false, isGit: true, error: branchRes.stderr || 'Git non disponibile.' };
  }
  const branch = branchRes.stdout;
  const headRes = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: baseDir });
  const logRes = await runCommand('git', ['log', '-1', '--format=%ci'], { cwd: baseDir });
  const tagRes = await runCommand('git', ['describe', '--tags', '--abbrev=0'], { cwd: baseDir });
  const fetchRes = await runCommand('git', ['fetch', '--all', '--tags'], { cwd: baseDir });
  let behindCount = null;
  let fetchError = '';
  if (!fetchRes.ok) {
    fetchError = fetchRes.stderr || 'Impossibile eseguire git fetch.';
  } else {
    const behindRes = await runCommand(
      'git',
      ['rev-list', '--count', `HEAD..origin/${branch}`],
      { cwd: baseDir }
    );
    if (behindRes.ok) {
      behindCount = Number.parseInt(behindRes.stdout, 10);
    }
  }
  return {
    ok: true,
    isGit: true,
    branch,
    head: headRes.ok ? headRes.stdout : '',
    lastCommit: logRes.ok ? logRes.stdout : '',
    tag: tagRes.ok ? tagRes.stdout : '',
    behindCount,
    fetchError
  };
});

ipcMain.handle('ua-open-update-terminal', async (_event, payload) => {
  const baseDir = String(payload?.baseDir || '').trim();
  const commandRaw = String(payload?.command || '').trim();
  const command = commandRaw
    ? process.platform === 'win32'
      ? commandRaw
      : commandRaw.replace(/\bpython\b/g, 'python3')
    : '';
  if (!baseDir) {
    return { ok: false, error: 'Percorso Upload Assistant non valido.' };
  }
  try {
    if (process.platform === 'win32') {
      const args = command
        ? ['/c', 'start', '""', '/D', baseDir, 'cmd.exe', '/k', command]
        : ['/c', 'start', '""', '/D', baseDir, 'cmd.exe', '/k'];
      const child = spawn(
        'cmd.exe',
        args,
        {
          windowsHide: true,
          detached: true,
          stdio: 'ignore'
        }
      );
      child.unref();
      return { ok: true };
    }
    if (process.platform === 'darwin') {
      const cmd = command ? `${command.replace(/"/g, '\\"')}` : '';
      const script = `tell application "Terminal" to do script "cd '${baseDir.replace(/'/g, "'\"'\"'")}'${
        cmd ? `; ${cmd}` : ''
      }"`;
      const child = spawn('osascript', ['-e', script], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return { ok: true };
    }
    const script = `bash -lc "cd '${baseDir.replace(/'/g, "'\"'\"'")}'${
      command ? `; ${command.replace(/"/g, '\\"')}` : ''
    }"`;
    const child = spawn('x-terminal-emulator', ['-e', script], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Impossibile aprire il terminale.' };
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

ipcMain.handle('open-path', async (_event, targetPath) => {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    return { ok: false, error: 'Percorso non valido.' };
  }
  try {
    const result = await shell.openPath(targetPath);
    if (result) {
      return { ok: false, error: result };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

async function enrichTmdbMetadata(result, tmdbKey, preferredLanguage, typeHint, fallbackTitle = '') {
  if (!tmdbKey || !result?.tmdbId) {
    return;
  }
  const hint = typeHint || '';
  const inferredType = hint.startsWith('tv') || hint.startsWith('anime') ? 'tv' : 'movie';
  const type = result.tmdbType || inferredType;

  const details = await fetchTmdbDetails(type, result.tmdbId, tmdbKey, preferredLanguage);
  if (!result.title) {
    result.title = details?.title || details?.name || result.title;
  }
  if (!result.year) {
    result.year = extractYear(details?.release_date || details?.first_air_date);
  }
  if (!result.originalLanguage && details?.original_language) {
    result.originalLanguage = details.original_language;
  }
  if (details?.overview) {
    result.tmdbOverview = details.overview;
  } else if (preferredLanguage && preferredLanguage !== 'en-US') {
    const fallback = await fetchTmdbDetails(type, result.tmdbId, tmdbKey, 'en-US');
    if (fallback?.overview) {
      result.tmdbOverview = fallback.overview;
    }
  }
  result.tmdbType = type;

  const genres = Array.isArray(details?.genres) ? details.genres : [];
  const isAnimation =
    genres.some((genre) => /animation/i.test(String(genre?.name || ''))) ||
    genres.some((genre) => Number(genre?.id) === 16);
  const originalLanguage = String(details?.original_language || result.originalLanguage || '').toLowerCase();
  if (isAnimation && originalLanguage === 'ja') {
    result.isAnime = true;
    if (!result.type) {
      result.type = 'anime';
    }
  }

  const shouldFetchAniList = result.isAnime || hint.startsWith('anime');
  if (shouldFetchAniList) {
    const searchTitle =
      result.title || details?.title || details?.name || details?.original_title || details?.original_name || '';
    let animeInfo = await fetchAniListAnime(searchTitle);
    if (!animeInfo && fallbackTitle && fallbackTitle !== searchTitle) {
      animeInfo = await fetchAniListAnime(fallbackTitle);
    }
    if (animeInfo) {
      result.malId = animeInfo.malId || result.malId || '';
      result.animeRomaji = animeInfo.romaji || result.animeRomaji || '';
      result.animeEnglish = animeInfo.english || result.animeEnglish || '';
      result.animeNative = animeInfo.native || result.animeNative || '';
      result.animeYear = animeInfo.seasonYear || result.animeYear || '';
      result.animeEpisodes = animeInfo.episodes || result.animeEpisodes || '';
      result.animeDemographic = animeInfo.demographic || result.animeDemographic || '';
      if (!result.isAnime) {
        result.isAnime = true;
      }
      if (!result.type) {
        result.type = 'anime';
      }
    }
  }

  const keywordsData = await fetchTmdbKeywords(type, result.tmdbId, tmdbKey);
  const keywordsList = Array.isArray(keywordsData?.keywords)
    ? keywordsData.keywords
    : Array.isArray(keywordsData?.results)
      ? keywordsData.results
      : [];
  if (keywordsList.length) {
    const keywords = keywordsList
      .map((entry) => String(entry?.name || '').replace(/,/g, ' ').trim())
      .filter(Boolean);
    if (keywords.length) {
      result.keywords = keywords.join(', ');
    }
  }

  const images = await fetchTmdbImages(type, result.tmdbId, tmdbKey);
  const logoPath = pickTmdbLogo(images?.logos, preferredLanguage, result.originalLanguage);
  if (logoPath) {
    const normalized = logoPath.startsWith('/') ? logoPath : `/${logoPath}`;
    result.tmdbLogoPath = normalized;
    result.tmdbLogoUrl = `https://image.tmdb.org/t/p/w300${normalized}`;
  }
}

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
    tmdbOverview: '',
    tmdbLogoPath: '',
    tmdbLogoUrl: '',
    keywords: '',
    tvdbAttempted: false,
    tvdbSeriesId: '',
    tvdbSeriesSlug: '',
    tvdbEpisodesInfo: null,
    tmdbFallback: false,
    isAnime: false,
    malId: '',
    animeRomaji: '',
    animeEnglish: '',
    animeNative: '',
    animeYear: '',
    animeEpisodes: '',
    animeDemographic: ''
  };

  if (!payload) {
    return result;
  }

  const imdbId = payload.imdbId || '';
  const tvdbId = payload.tvdbId || '';
  const malId = payload.malId || '';
  const titleGuess = payload.title || '';
  const yearGuess = payload.year || '';
  const typeHint = payload.typeHint || '';
  const seasonHint = payload.season || '';

  const omdbKey = payload.omdbKey || '';
  const tmdbKey = payload.tmdbKey || '';
  const tvdbKey = payload.tvdbKey || '';
  const preferredLanguage = payload.preferredLanguage || '';
  let tmdbTvId = '';
  const preferredLangCode = getTmdbLangCode(preferredLanguage);
  const wantsItalianTitle = preferredLangCode === 'it';

  const normalizedMal = String(malId).replace(/[^\d]/g, '');
  const hasManualAnime = Boolean(normalizedMal);
  const isTvHint =
    typeHint.startsWith('tv') || typeHint.startsWith('anime') || hasManualAnime;
  if (imdbId) {
    result.imdbId = imdbId;
  }
  if (normalizedMal) {
    result.malId = normalizedMal;
    result.isAnime = true;
    if (!result.type) {
      result.type = 'anime';
    }
  }

  if (normalizedMal) {
    try {
      const animeInfo = await fetchAniListByMalId(normalizedMal);
      if (animeInfo) {
        result.malId = animeInfo.malId || result.malId || '';
        result.animeRomaji = animeInfo.romaji || result.animeRomaji || '';
        result.animeEnglish = animeInfo.english || result.animeEnglish || '';
        result.animeNative = animeInfo.native || result.animeNative || '';
        result.animeYear = animeInfo.seasonYear || result.animeYear || '';
        result.animeEpisodes = animeInfo.episodes || result.animeEpisodes || '';
        result.animeDemographic = animeInfo.demographic || result.animeDemographic || '';
        if (!result.title) {
          result.title = animeInfo.romaji || animeInfo.english || animeInfo.native || result.title;
        }
        if (!result.year && animeInfo.seasonYear) {
          result.year = String(animeInfo.seasonYear);
        }
        if (!result.isAnime) {
          result.isAnime = true;
        }
        if (!result.type) {
          result.type = 'anime';
        }
      } else {
        result.warnings.push('AniList: MAL ID non trovato.');
      }
    } catch (error) {
      result.warnings.push(String(error));
    }
  }

  try {
    if (!isTvHint) {
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
    }
  } catch (error) {
    result.warnings.push(String(error));
  }

  try {
    if (tmdbKey && imdbId) {
      const tmdbFind = await fetchTmdbByImdb(imdbId, tmdbKey);
      const movie = tmdbFind?.movie_results?.[0];
      const tv = tmdbFind?.tv_results?.[0];
      if (tv?.id) {
        tmdbTvId = String(tv.id);
      }
      const hasTv = Boolean(tv?.id);
      const hasMovie = Boolean(movie?.id);
      const type = hasTv && (!hasMovie || isTvHint) ? 'tv' : 'movie';
      const tmdbId = type === 'tv' ? tv?.id : movie?.id;
      if (tmdbId) {
        const details = await fetchTmdbDetails(type, tmdbId, tmdbKey, preferredLanguage);
        if (details?.original_language) {
          result.originalLanguage = details.original_language;
        }
        const tmdbTitle = details?.title || details?.name || '';
        const tmdbOriginalTitle = details?.original_title || details?.original_name || '';
        const preferTmdbTitle = wantsItalianTitle && tmdbTitle;
        if (preferTmdbTitle) {
          result.title = tmdbTitle;
        } else if (!result.title) {
          result.title = tmdbTitle || result.title;
        }
        if (!result.year) {
          result.year = extractYear(details.release_date || details.first_air_date);
        }
        result.tmdbId = String(tmdbId);
        result.tmdbType = type;
        if (details?.imdb_id && !result.imdbId) {
          result.imdbId = details.imdb_id;
        }
        const originalLang = String(details?.original_language || '');
        const tmdbMissingLocalizedTitle =
          wantsItalianTitle &&
          tmdbTitle &&
          tmdbOriginalTitle &&
          tmdbTitle === tmdbOriginalTitle &&
          originalLang &&
          originalLang !== preferredLangCode;
        if (wantsItalianTitle && !tmdbTitle) {
          result.warnings.push('TMDB: titolo localizzato non disponibile.');
        }
        if (tmdbMissingLocalizedTitle || (wantsItalianTitle && !result.title)) {
          let imdbLookup = result.imdbId || '';
          if (imdbLookup) {
            const akas = await fetchImdbAkas(imdbLookup);
            const italianTitle = pickItalianImdbTitle(akas);
            if (italianTitle) {
              result.title = italianTitle;
            }
          }
        }
      } else {
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
      }
    } else if (tmdbKey && titleGuess) {
      const type = isTvHint ? 'tv' : 'movie';
      const search = await fetchTmdbSearch(titleGuess, type, tmdbKey, preferredLanguage, yearGuess);
      const results = Array.isArray(search?.results) ? search.results : [];
      let first = results[0];
      if (yearGuess && results.length) {
        const targetYear = String(yearGuess);
        const match = results.find((item) => {
          const date = item?.first_air_date || item?.release_date || '';
          return date.startsWith(targetYear);
        });
        if (match) {
          first = match;
        }
      }
      if (first?.id) {
        if (type === 'tv') {
          tmdbTvId = String(first.id);
        }
        const details = await fetchTmdbDetails(type, first.id, tmdbKey, preferredLanguage);
        if (details?.original_language) {
          result.originalLanguage = details.original_language;
        }
        const tmdbTitle = details?.title || details?.name || '';
        const tmdbOriginalTitle = details?.original_title || details?.original_name || '';
        const preferTmdbTitle = wantsItalianTitle && tmdbTitle;
        if (preferTmdbTitle) {
          result.title = tmdbTitle;
        } else if (!result.title) {
          result.title = tmdbTitle || result.title;
        }
        if (!result.year) {
          result.year = extractYear(details.release_date || details.first_air_date);
        }
        result.tmdbId = String(first.id);
        result.tmdbType = type;
        if (details?.imdb_id && !result.imdbId) {
          result.imdbId = details.imdb_id;
        }
        const originalLang = String(details?.original_language || '');
        const tmdbMissingLocalizedTitle =
          wantsItalianTitle &&
          tmdbTitle &&
          tmdbOriginalTitle &&
          tmdbTitle === tmdbOriginalTitle &&
          originalLang &&
          originalLang !== preferredLangCode;
        if (wantsItalianTitle && !tmdbTitle) {
          result.warnings.push('TMDB: titolo localizzato non disponibile.');
        }
        if (tmdbMissingLocalizedTitle || (wantsItalianTitle && !result.title)) {
          let imdbLookup = result.imdbId || '';
          if (!imdbLookup && tmdbKey) {
            const external = await fetchTmdbExternalIds(type, first.id, tmdbKey);
            imdbLookup = external?.imdb_id || '';
            if (imdbLookup) {
              result.imdbId = imdbLookup;
            }
          }
          if (imdbLookup) {
            const akas = await fetchImdbAkas(imdbLookup);
            const italianTitle = pickItalianImdbTitle(akas);
            if (italianTitle) {
              result.title = italianTitle;
            }
          }
        }
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
        let episodesResponse = await tvdbFetchEpisodes(seriesId, token, preferredLanguage);
        let episodes = episodesResponse.episodes;
        const tvdbDebug = {
          seriesId,
          primary: episodesResponse.debug,
          fallback: null
        };
        if (preferredLanguage && episodes.length === 0) {
          const fallbackResponse = await tvdbFetchEpisodes(seriesId, token, '');
          episodes = fallbackResponse.episodes;
          tvdbDebug.fallback = fallbackResponse.debug;
        }
        result.episodes = episodes;
        result.tvdbEpisodesInfo = tvdbDebug;
      }
    }
  } catch (error) {
    result.warnings.push(String(error));
  }

  if (result.tvdbAttempted && result.episodes.length === 0) {
    if (tmdbKey && tmdbTvId && seasonHint) {
      try {
        const firstSeasonData = await fetchTmdbTvSeason(tmdbTvId, seasonHint, tmdbKey, preferredLanguage);
        let seasonEpisodes = Array.isArray(firstSeasonData?.episodes) ? firstSeasonData.episodes : [];
        if (!seasonEpisodes.length && preferredLanguage && preferredLanguage !== 'en-US') {
          const fallbackSeasonData = await fetchTmdbTvSeason(tmdbTvId, seasonHint, tmdbKey, 'en-US');
          seasonEpisodes = Array.isArray(fallbackSeasonData?.episodes) ? fallbackSeasonData.episodes : [];
        }
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

  try {
    await enrichTmdbMetadata(result, tmdbKey, preferredLanguage, typeHint, payload?.filename || '');
  } catch (error) {
    result.warnings.push(String(error));
  }

  const needsEpisodeFallback =
    result.isAnime &&
    Array.isArray(result.episodes) &&
    result.episodes.some((ep) => hasCjkChars(ep?.name || ''));

  if (needsEpisodeFallback) {
    let fallbackMap = new Map();
    const seasonTarget = String(seasonHint || '').trim();
    if (tmdbKey && (tmdbTvId || result.tmdbId) && seasonTarget) {
      try {
        const tmdbSeason = await fetchTmdbTvSeason(tmdbTvId || result.tmdbId, seasonTarget, tmdbKey, 'en-US');
        const tmdbEpisodes = Array.isArray(tmdbSeason?.episodes) ? tmdbSeason.episodes : [];
        fallbackMap = buildEpisodeFallbackMap(tmdbEpisodes, seasonTarget);
      } catch (error) {
        result.warnings.push(`Anime fallback TMDb episodi: ${error}`);
      }
    }

    if (!fallbackMap.size && tvdbKey && result.tvdbSeriesId) {
      try {
        const token = await tvdbLogin(tvdbKey);
        const fallbackResponse = await tvdbFetchEpisodes(result.tvdbSeriesId, token, '');
        fallbackMap = buildEpisodeFallbackMap(fallbackResponse.episodes, seasonTarget);
      } catch (error) {
        result.warnings.push(`Anime fallback TVDB episodi: ${error}`);
      }
    }

    if (fallbackMap.size) {
      result.episodes = result.episodes.map((ep) => {
        const key = toEpisodeKey(ep?.season ?? ep?.season_number ?? seasonTarget, ep?.episode ?? ep?.episode_number ?? 0);
        if (!key) {
          return ep;
        }
        const fallbackName = fallbackMap.get(key);
        if (fallbackName && hasCjkChars(ep?.name || '') && !hasCjkChars(fallbackName)) {
          return { ...ep, name: fallbackName };
        }
        return ep;
      });
    }
  }

  return result;
});
