import { STOP_WORDS } from './constants.js';
import {
  detectAudioMeta,
  formatBytes,
  formatDuration,
  getAudioTracks,
  getGeneralTrack,
  getTrackLang,
  getTrackValue,
  getVideoTrack,
  mapAudioCodec,
  mapVideoCodec,
  normalizeLangTag,
  parseChannels,
  scoreAudioTrack
} from './media-utils.js';
import { getParentPath, getPathBaseName, pad2, stripExtension } from './path-utils.js';

const CLEAN_TITLE_TOKENS = new Set([
  'HD',
  'UHD',
  '4K',
  '2160P',
  '1080P',
  '720P',
  '480P',
  'WEB',
  'WEBDL',
  'WEBRIP',
  'WEBMUX',
  'DLMUX',
  'HDTV',
  'BLURAY',
  'BDRIP',
  'BRRIP',
  'BD',
  'BDREMUX',
  'REMUX',
  'H264',
  'H265',
  'X264',
  'X265',
  'HEVC',
  'AVC',
  'HDR',
  'HDR10',
  'DV',
  'DOLBYVISION',
  'AAC',
  'AC3',
  'DD',
  'DDP',
  'DTS',
  'FLAC',
  'EAC3',
  'TRUEHD',
  'ATMOS',
  'MAIN10',
  'SUBS',
  'SUBBED',
  '10BIT',
  '8BIT',
  '12BIT',
  'MULTI',
  'ITA',
  'ENG',
  'JPN',
  'JAP',
  'KOR',
  'SPA',
  'FRA',
  'FRE',
  'DEU',
  'GER',
  'RUS',
  'AMZN',
  'NF',
  'DSNP',
  'ATVP',
  'HMAX',
  'HBO',
  'MAX',
  'HULU',
  'NOW',
  'DAZN',
  'DSCP',
  'CR',
  'IT'
]);
const SEARCH_CLEAN_TOKENS = new Set([
  'UNRATED',
  'UNCUT',
  'EXTENDED',
  'DIRECTOR',
  'DIRECTORS',
  'DIRECTORSCUT',
  'DIRECTORSCUT',
  'THEATRICAL',
  'LIMITED',
  'REMASTERED',
  'SPECIAL',
  'FINAL',
  'VF',
  'VF2',
  'VFF',
  'VFI',
  'VO',
  'VOST',
  'VOSTFR',
  'SUBBED',
  'SUBFRENCH'
]);
const NO_GROUP_PATTERN = /-(nogrp|nogroup|unknown|unk)(?=[._\-\s]|$)/i;
const LANGUAGE_WORDS = new Set([
  'ITALIAN',
  'ENGLISH',
  'FRENCH',
  'GERMAN',
  'SPANISH',
  'PORTUGUESE',
  'DUTCH',
  'POLISH',
  'RUSSIAN',
  'JAPANESE',
  'KOREAN'
]);

export function createMetadataTools(deps) {
  const { state, ui, logDebug, setDropdownAuto, setInputAuto, applyFormatSuggestion } = deps;

  function getHdrTokens(videoTrack) {
    const hdrFields = {
      HDR_Format: videoTrack?.HDR_Format || '',
      HDR_Format_String: videoTrack?.HDR_Format_String || '',
      HDR_Format_Compatibility: videoTrack?.HDR_Format_Compatibility || '',
      'HDR format': videoTrack?.['HDR format'] || '',
      'HDR format string': videoTrack?.['HDR format string'] || '',
      'HDR format compatibility': videoTrack?.['HDR format compatibility'] || ''
    };
    const hdrRaw = Object.values(hdrFields)
      .filter(Boolean)
      .join(' | ')
      .toLowerCase();
    logDebug?.('HDR fields', hdrFields);
    logDebug?.('HDR combined', hdrRaw);

    const tokens = [];
    const hasDv = hdrRaw.includes('dolby vision');
    const hasHdr10Plus = hdrRaw.includes('hdr10+') || hdrRaw.includes('hdr10 plus');
    const hasHdr = hdrRaw.includes('hdr10') || hdrRaw.includes('hdr');

    if (hasDv) {
      tokens.push('DV');
    }
    if (hasHdr10Plus) {
      tokens.push('HDR10+');
    } else if (hasHdr) {
      tokens.push('HDR');
    }
    return tokens;
  }

  function getResolution(videoTrack) {
    const width = parseInt(videoTrack?.Width || 0, 10);
    const height = parseInt(videoTrack?.Height || 0, 10);
    if (width >= 3800 || height >= 2160) {
      return '2160p';
    }
    if (width >= 1900 || height >= 1080) {
      return '1080p';
    }
    if (width >= 1200 || height >= 720) {
      return '720p';
    }
    if (width >= 700 || height >= 576) {
      return '576p';
    }
    if (width >= 640 || height >= 480) {
      return '480p';
    }
    return '';
  }

  function buildLanguageTag(audioLangs, originalLangTag) {
    const langs = [...new Set(audioLangs.filter(Boolean))];
    if (!langs.length) {
      return '';
    }

    const separator = ' - ';
    if (langs.length >= 3) {
      if (langs.includes('ITA')) {
        return `ITA${separator}MULTI`;
      }
      const original = normalizeLangTag(originalLangTag);
      if (original && langs.includes(original)) {
        return `${original}${separator}MULTI`;
      }
      return `${langs[0]}${separator}MULTI`;
    }

    if (langs.length === 1) {
      return langs[0];
    }

    const original = normalizeLangTag(originalLangTag);
    if (original && langs.includes(original)) {
      if (original === 'ITA') {
        const other = langs.find((lang) => lang !== original);
        return other ? `${original}${separator}${other}` : original;
      }
      if (langs.includes('ITA')) {
        return `${original}${separator}ITA`;
      }
      const other = langs.find((lang) => lang !== original);
      return other ? `${original}${separator}${other}` : original;
    }
    if (langs.includes('ITA')) {
      const other = langs.find((lang) => lang !== 'ITA');
      return other ? `ITA${separator}${other}` : 'ITA';
    }
    return langs.join(separator);
  }

  function extractYear(raw) {
    const match = String(raw || '').match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : '';
  }

  function isNoiseTag(token) {
    if (!token) {
      return true;
    }
    const upper = token.toUpperCase();
    const compact = upper.replace(/[._-]/g, '');
    if (STOP_WORDS.has(upper) || STOP_WORDS.has(compact)) {
      return true;
    }
    if (/^\d{3,4}P$/.test(upper) || /^(19|20)\d{2}$/.test(upper)) {
      return true;
    }
    if (
      /^(ITA|ENG|FRE|GER|SPA|POR|JPN|RUS|CHI|KOR|UKR|NLD|POL|SWE)([-_.](ITA|ENG|FRE|GER|SPA|POR|JPN|RUS|CHI|KOR|UKR|NLD|POL|SWE))+$/i.test(
        upper
      )
    ) {
      return true;
    }
    return false;
  }

  function extractGroupTagFromName(filePath, knownTags = [], options = {}) {
    if (!filePath) {
      return '';
    }
    const allowNoGroup = options?.allowNoGroup === true;
    const base = stripExtension(getPathBaseName(filePath)).trim();
    if (!base) {
      return '';
    }

    if (/\s-\s/.test(base)) {
      return allowNoGroup ? 'NoGroup' : '';
    }

    if (NO_GROUP_PATTERN.test(base)) {
      logDebug?.('tag detect', { mode: 'invalid-token', base });
      return allowNoGroup ? 'NoGroup' : '';
    }

    const knownMap = new Map();
    for (const tag of knownTags) {
      const clean = String(tag || '').trim();
      if (clean) {
        knownMap.set(clean.toUpperCase(), clean);
      }
    }
    if (knownMap.size) {
      const tokens = base.split(/[._\s-]+/).filter(Boolean);
      const last = tokens[tokens.length - 1] || '';
      const known = knownMap.get(last.toUpperCase());
      if (known && !isNoiseTag(last)) {
        logDebug?.('tag detect', { mode: 'known', base, last, known });
        return known;
      }
    }

    let candidate = '';
    const bracketMatch = base.match(/[\[\(\{]([A-Za-z0-9][A-Za-z0-9._-]{1,})[\]\)\}]\s*$/);
    if (bracketMatch) {
      candidate = bracketMatch[1];
    } else {
      const tailMatch = base.match(/[-–—]\s*([A-Za-z0-9]{2,20})\s*$/);
      if (tailMatch) {
        candidate = tailMatch[1];
      }
    }

    candidate = candidate.replace(/^[.\-]+|[.\-]+$/g, '').trim();
    logDebug?.('tag detect', {
      mode: 'suffix',
      base,
      rawCandidate: candidate
    });
    if (!candidate || candidate.length < 2 || candidate.length > 20 || /\s/.test(candidate)) {
      return allowNoGroup ? 'NoGroup' : '';
    }
    if (candidate.length <= 2 && !knownMap.has(candidate.toUpperCase())) {
      return allowNoGroup ? 'NoGroup' : '';
    }
    if (isNoiseTag(candidate)) {
      return allowNoGroup ? 'NoGroup' : '';
    }
    return candidate;
  }

  function parseSeasonEpisode(text) {
    const match =
      text.match(/S[.\s_-]*(\d{1,2})[.\s_-]*E[.\s_-]*(\d{1,2})/i) ||
      text.match(/(\d{1,2})\s*[xX]\s*(\d{1,2})/i);
    if (match) {
      return { season: match[1], episode: match[2], index: match.index };
    }
    return { season: '', episode: '', index: -1 };
  }

  function parseSeasonOnly(text) {
    const match = text.match(/\bS[.\s-]*(\d{1,2})\b/i);
    if (match) {
      return { season: match[1], index: match.index };
    }
    const matchSeason = text.match(/\bSeason\s+(\d{1,2})\b/i);
    if (matchSeason) {
      return { season: matchSeason[1], index: matchSeason.index };
    }
    return { season: '', index: -1 };
  }

  function parseBareEpisode(text) {
    if (!text) {
      return { episode: '', index: -1 };
    }
    const cleaned = String(text);
    const episodeMatch =
      cleaned.match(/\b(?:EP|E|Episode)\s*[-_.]?\s*(\d{1,3})(?:v\d+)?\b/i) ||
      cleaned.match(/\s[-–—]\s*(\d{1,3})(?:v\d+)?\b/);
    if (episodeMatch) {
      return { episode: episodeMatch[1], index: episodeMatch.index };
    }
    return { episode: '', index: -1 };
  }

  function isEpisodeNoiseToken(token) {
    const raw = String(token || '').replace(/[()[\]{}]/g, '').trim();
    if (!raw) {
      return true;
    }
    const upper = raw.toUpperCase();
    const normalized = upper.replace(/[^A-Z0-9]/g, '');
    if (!normalized) {
      return true;
    }
    if (normalized.length === 1) {
      return true;
    }
    if (/^(?:SUBS?|SUBBED|HARDSUBS?|HDTV|DLMUX)$/i.test(upper)) {
      return true;
    }
    if (/(?:\b10BIT\b|\b8BIT\b|\b12BIT\b)/i.test(upper)) {
      return true;
    }
    if (CLEAN_TITLE_TOKENS.has(normalized) || SEARCH_CLEAN_TOKENS.has(normalized)) {
      return true;
    }
    if (/^\d{3,4}P$/i.test(normalized)) {
      return true;
    }
    if (/^\d{4}$/.test(normalized)) {
      return true;
    }
    if (/^(?:S?\d{1,2}E\d{1,2}|\d{1,2}X\d{1,2})$/i.test(normalized)) {
      return true;
    }
    if (/^(?:DDP?|DTS|AAC|AC3|EAC3|TRUEHD|ATMOS|FLAC|MP3|OPUS)$/i.test(normalized)) {
      return true;
    }
    if (/^(?:H264|H265|X264|X265|HEVC|AVC|AV1)$/i.test(normalized)) {
      return true;
    }
    if (/(?:E-?AC3|AC3|DDP|DD\+?|DTS|TRUEHD|ATMOS)/i.test(upper)) {
      return true;
    }
    if (/^\d+(?:\.\d+)?$/.test(raw.replace(/[^0-9.]/g, ''))) {
      return true;
    }
    const parts = raw.split(/[-_/]/).filter(Boolean);
    if (parts.length > 1 && parts.every((part) => CLEAN_TITLE_TOKENS.has(part.toUpperCase()))) {
      return true;
    }
    return false;
  }

  function parseEpisodeTitleFromName(rawName) {
    const cleaned = stripExtension(rawName)
      .replace(/[_\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const match =
      cleaned.match(/S[.\s_-]*\d{1,2}[.\s_-]*E[.\s_-]*\d{1,2}/i) ||
      cleaned.match(/\d{1,2}\s*[xX]\s*\d{1,2}/i);
    if (!match) {
      return '';
    }

    const matchIndex = cleaned.indexOf(match[0]);
    const after = cleaned.slice(matchIndex + match[0].length).trim();
    if (!after) {
      return '';
    }

    const tokens = after.split(' ').filter((token) => token && !STOP_WORDS.has(token.toUpperCase()));
    const kept = [];
    for (const token of tokens) {
      if (isEpisodeNoiseToken(token)) {
        if (kept.length) {
          break;
        }
        continue;
      }
      kept.push(token);
    }
    if (kept.length === 1 && LANGUAGE_WORDS.has(kept[0].toUpperCase())) {
      return '';
    }
    return kept.join(' ').trim();
  }

  function guessTitleFromName(rawName) {
    let cleaned = stripExtension(rawName);
    cleaned = cleaned.replace(/\[[^\]]+\]|\([^\)]+\)|\{[^}]+\}/g, (match) => {
      const year = match.match(/\b(19|20)\d{2}\b/);
      return year ? ` ${year[0]} ` : ' ';
    });
    cleaned = cleaned.replace(/[_\.]/g, ' ');
    cleaned = cleaned.replace(/\b(?:stagione|stag|season)\s*\d+(?:\s*[.\-]\s*\d+)*\b/gi, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    const seasonEpisode = parseSeasonEpisode(cleaned);
    const bareEpisode = parseBareEpisode(cleaned);
    let cutIndex = cleaned.length;
    const hasFansubMarkers =
      /^\s*\[[^\]]+\]/.test(rawName) ||
      /\[[A-F0-9]{8}\]/i.test(rawName) ||
      /\b(?:BD|FLAC|MAIN10|X265|H\.?265|HEVC|AVC)\b/i.test(rawName);
    if (seasonEpisode.index !== -1) {
      cutIndex = seasonEpisode.index;
    } else if (bareEpisode.index !== -1 && bareEpisode.episode && hasFansubMarkers) {
      cutIndex = bareEpisode.index;
    } else {
      const seasonOnly = parseSeasonOnly(cleaned);
      if (seasonOnly.index !== -1) {
        cutIndex = seasonOnly.index;
      }
    }
    const yearMatch = cleaned.match(/\b(19|20)\d{2}\b/);
    if (yearMatch && yearMatch.index < cutIndex) {
      cutIndex = yearMatch.index;
    }
    const titleChunk = cleaned.slice(0, cutIndex).trim();
    const tokens = titleChunk
      .split(' ')
      .filter((token) => token && !STOP_WORDS.has(token.toUpperCase()))
      .filter((token) => !/^[\-\u2013\u2014]+$/.test(token))
      .filter((token) => !/^[()\[\]{}]+$/.test(token));
    return tokens.join(' ').trim();
  }

  function cleanSearchTitle(title) {
    if (!title) {
      return '';
    }
    let cleaned = String(title)
      .replace(/\[[^\]]+\]|\([^\)]+\)|\{[^}]+\}/g, ' ')
      .replace(/\b(x265|x264|h\.?265|h\.?264|hevc|avc|av1)\b[-_.]([A-Za-z0-9]{2,12})$/gi, '$1')
      .replace(/^\s*[A-Za-z][A-Za-z0-9]{1,9}[-_.]+/, '')
      .replace(/^\s*\d{1,2}\s*[-_.]\s*/g, ' ');

    const akaIndex = cleaned.search(/\b(?:aka|a\.k\.a\.?)\b/i);
    if (akaIndex >= 0) {
      cleaned = cleaned.slice(0, akaIndex).trim();
    }

    cleaned = cleaned
      .replace(/[_\.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    while (/[-_.][A-Za-z0-9]{2,20}$/.test(cleaned)) {
      cleaned = cleaned.replace(/[-_.][A-Za-z0-9]{2,20}$/, '').trim();
    }

    const tokens = cleaned.split(' ');
    let end = tokens.length;
    while (end > 0) {
      const token = tokens[end - 1].replace(/[()[\]{}]/g, '');
      const normalized = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!normalized) {
        end -= 1;
        continue;
      }
      if (CLEAN_TITLE_TOKENS.has(normalized) || SEARCH_CLEAN_TOKENS.has(normalized)) {
        end -= 1;
        continue;
      }
      break;
    }
    return tokens.slice(0, end).join(' ').trim();
  }

  function guessMetadataFromName(filePath) {
    const base = getPathBaseName(filePath);
    const cleaned = stripExtension(base);
    const seasonEpisode = parseSeasonEpisode(cleaned);
    const bareEpisode = seasonEpisode.episode ? { episode: '', index: -1 } : parseBareEpisode(cleaned);
    const seasonOnly = seasonEpisode.episode ? { season: '', index: -1 } : parseSeasonOnly(cleaned);
    const year = extractYear(cleaned);
    let title = guessTitleFromName(cleaned);
    let episodeTitle = parseEpisodeTitleFromName(cleaned);
    const hasFansubMarkers =
      /^\s*\[[^\]]+\]/.test(base) ||
      /\[[A-F0-9]{8}\]/i.test(base) ||
      /\b(?:BD|FLAC|MAIN10|X265|H\.?265|HEVC|AVC)\b/i.test(base);
    const useBareEpisode = Boolean(bareEpisode.episode && hasFansubMarkers);

    const bracketed = (() => {
      const match = cleaned.match(/^\s*\[\s*(S[.\s_-]*\d{1,2}[.\s_-]*E[.\s_-]*\d{1,2}|\d{1,2}\s*[xX]\s*\d{1,2})\s*\]\s*/);
      if (!match) {
        return null;
      }
      const rest = cleaned.slice(match[0].length).trim();
      const parts = rest.split(/\s[-–—]\s/);
      if (parts.length < 2) {
        return null;
      }
      const seriesPart = parts.shift().trim();
      const episodePart = parts.join(' - ').trim();
      if (!seriesPart || !episodePart) {
        return null;
      }
      const cleanedEpisode = episodePart.replace(/[-_.]?\s*\d+$/g, '').trim();
      return {
        title: seriesPart,
        episodeTitle: cleanedEpisode || episodePart
      };
    })();

    if (bracketed?.title) {
      title = bracketed.title;
    }
    if (bracketed?.episodeTitle) {
      episodeTitle = bracketed.episodeTitle;
    }
    if (!title && seasonEpisode.index === 0) {
      const tail = cleaned
        .replace(/^\s*\[[^\]]+\]\s*/, '')
        .replace(
          /^\s*(S[.\s_-]*\d{1,2}[.\s_-]*E[.\s_-]*\d{1,2}|\d{1,2}\s*[xX]\s*\d{1,2})\s*/i,
          ''
        )
        .replace(/^\s*[-_.]+\s*/, '')
        .trim();
      if (tail) {
        title = guessTitleFromName(tail) || tail;
      }
    }
    if (!title) {
      const parentPath = getParentPath(filePath);
      const parentName = parentPath ? getPathBaseName(parentPath) : '';
      const parentTitle = parentName ? guessTitleFromName(parentName) : '';
      if (parentTitle) {
        title = parentTitle;
      }
    }
    return {
      title,
      year,
      season: seasonEpisode.season || seasonOnly.season || (useBareEpisode ? '01' : ''),
      episode: seasonEpisode.episode || (useBareEpisode ? bareEpisode.episode : ''),
      episodeTitle
    };
  }

  function episodeKey(season, episode) {
    if (!season || !episode) {
      return '';
    }
    return `S${pad2(season)}E${pad2(episode)}`;
  }

  function fillFromMediaInfo() {
    if (!state.mediaInfo || state.mediaInfo.error) {
      return;
    }

    const videoTrack = getVideoTrack(state.mediaInfo);
    const audioTracks = getAudioTracks(state.mediaInfo);
    logDebug?.('MediaInfo tracks', {
      video: Boolean(videoTrack),
      audioCount: audioTracks.length
    });

    if (videoTrack) {
      const resolution = getResolution(videoTrack);
      if (ui.resolutionSelectBtn) {
        setDropdownAuto(ui.resolutionInput, ui.resolutionSelectBtn, resolution, resolution);
      } else {
        setInputAuto(ui.resolutionInput, resolution);
      }

      const hdrTokens = getHdrTokens(videoTrack);
      ui.dvCheckbox.checked = hdrTokens.includes('DV');
      ui.hdr10plusCheckbox.checked = hdrTokens.includes('HDR10+');
      ui.hdrCheckbox.checked = hdrTokens.includes('HDR') && !hdrTokens.includes('HDR10+');

      const format = ui.formatSelect.value;
      const videoCodec = mapVideoCodec(videoTrack, format);
      if (ui.videoCodecSelectBtn) {
        setDropdownAuto(ui.videoCodecInput, ui.videoCodecSelectBtn, videoCodec, videoCodec);
      } else {
        setInputAuto(ui.videoCodecInput, videoCodec);
      }

      if (resolution === '2160p') {
        ui.uhdCheckbox.checked = true;
      }
    }

    applyFormatSuggestion('');

    if (audioTracks.length) {
      const cleanAudio = audioTracks.filter((track) => {
        const title = String(track.Title || '').toLowerCase();
        return !title.includes('commentary');
      });

      const audioLangs = cleanAudio
        .map((track) => normalizeLangTag(getTrackLang(track)))
        .filter(Boolean);
      const uniqueLangs = [...new Set(audioLangs)];
      state.audioLangs = uniqueLangs;
      ui.audioLangHint.textContent = uniqueLangs.length
        ? `Lingue audio rilevate: ${uniqueLangs.join(', ')}`
        : 'Lingue audio rilevate: -';

      const preferredTracks = cleanAudio.filter((track) => normalizeLangTag(getTrackLang(track)) === 'ITA');
      const selectionPool = preferredTracks.length ? preferredTracks : cleanAudio;
      const best = selectionPool.reduce((bestTrack, track) => {
        if (!bestTrack) {
          return track;
        }
        return scoreAudioTrack(track) > scoreAudioTrack(bestTrack) ? track : bestTrack;
      }, null);

      if (best) {
        const mappedAudio = mapAudioCodec(best);
        const channels = parseChannels(best.Channels || best['Channel(s)'] || '');
        if (ui.audioCodecSelectBtn) {
          setDropdownAuto(ui.audioCodecInput, ui.audioCodecSelectBtn, mappedAudio, mappedAudio);
        } else {
          setInputAuto(ui.audioCodecInput, mappedAudio);
        }
        if (ui.audioChannelsSelectBtn) {
          setDropdownAuto(ui.audioChannelsInput, ui.audioChannelsSelectBtn, channels, channels);
        } else {
          setInputAuto(ui.audioChannelsInput, channels);
        }
        setInputAuto(ui.audioMetaInput, detectAudioMeta(best));
      }

      if (!ui.languageTagInput.dataset.manual || !ui.languageTagInput.value) {
        const computedLang = buildLanguageTag(uniqueLangs, ui.originalLanguageInput.value);
        if (computedLang) {
          setInputAuto(ui.languageTagInput, computedLang);
        }
      }
    }
  }

  function buildMediaInfoShort() {
    if (!state.mediaInfo) {
      return 'MediaInfo non disponibile.';
    }
    const general = getGeneralTrack(state.mediaInfo) || {};
    const video = getVideoTrack(state.mediaInfo) || {};
    const audioTracks = getAudioTracks(state.mediaInfo);
    const textTracks = (state.mediaInfo?.media?.track || []).filter((track) => track['@type'] === 'Text');
    const resolveLangName = (track) =>
      String(
        getTrackValue(track, [
          'Language/String',
          'Language_String',
          'Language/String3',
          'Language_String3',
          'Language'
        ]) || ''
      ).trim();
    const formatMaybeBytes = (raw) => {
      const cleaned = String(raw || '').trim();
      if (!cleaned) {
        return '';
      }
      if (/[A-Za-z]/.test(cleaned)) {
        return cleaned;
      }
      const numeric = Number(cleaned);
      return Number.isFinite(numeric) ? formatBytes(numeric) : cleaned;
    };
    const formatMaybeDuration = (raw) => {
      const cleaned = String(raw || '').trim();
      if (!cleaned) {
        return '';
      }
      if (/[A-Za-z]/.test(cleaned) || cleaned.includes(':')) {
        return cleaned;
      }
      const numeric = Number(cleaned);
      return Number.isFinite(numeric) ? formatDuration(numeric) : cleaned;
    };
    const formatMaybeBitrate = (raw) => {
      const cleaned = String(raw || '').trim();
      if (!cleaned) {
        return '';
      }
      if (/[A-Za-z]/.test(cleaned)) {
        return cleaned;
      }
      const numeric = Number(cleaned);
      if (!Number.isFinite(numeric)) {
        return cleaned;
      }
      const mbps = numeric / 1_000_000;
      return `${mbps.toFixed(2)} Mb/s`;
    };
    const simplifyWritingLibrary = (raw) => {
      const cleaned = String(raw || '').trim();
      if (!cleaned) {
        return '';
      }
      return cleaned.split(/[\s/]+/)[0] || cleaned;
    };

    const lines = [];
    lines.push('General');
    const fileSize = getTrackValue(general, ['FileSize/String', 'FileSize_String', 'FileSize']);
    const duration = getTrackValue(general, ['Duration/String3', 'Duration/String2', 'Duration/String', 'Duration']);
    const bitrate = getTrackValue(general, [
      'OverallBitRate/String',
      'OverallBitRate_String',
      'OverallBitRate'
    ]);
    if (fileSize) {
      lines.push(`File size       : ${formatMaybeBytes(fileSize)}`);
    }
    if (duration) {
      lines.push(`Durata          : ${formatMaybeDuration(duration)}`);
    }
    if (bitrate) {
      lines.push(`Bitrate         : ${formatMaybeBitrate(bitrate)}`);
    }

    if (video && Object.keys(video).length) {
      lines.push('');
      lines.push('Video');
      const format = getTrackValue(video, ['Format', 'Format/String']);
      const width = getTrackValue(video, ['Width']);
      const height = getTrackValue(video, ['Height']);
      const bitDepth = getTrackValue(video, ['BitDepth', 'Bit_depth']);
      const hdrSources = [
        video?.HDR_Format_String,
        video?.['HDR format string'],
        video?.HDR_Format,
        video?.['HDR format'],
        video?.HDR_Format_Compatibility,
        video?.['HDR format compatibility']
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      const hdrTextRaw = hdrSources.join(' | ');
      const hdrTokensSet = new Set();
      const addHdrToken = (token) => {
        if (!token) {
          return;
        }
        hdrTokensSet.add(token);
      };
      const hasHdr10 = /hdr10/i.test(hdrTextRaw);
      const hasHdr10Plus = /hdr10\+/i.test(hdrTextRaw);
      const hasSmpte = /smpte\s*st\s*2086/i.test(hdrTextRaw);
      const hasHlg = /hlg/i.test(hdrTextRaw);
      if (hasHdr10Plus) {
        addHdrToken('HDR10+');
      } else if (hasHdr10) {
        addHdrToken('HDR10');
      }
      if (hasSmpte) {
        addHdrToken('SMPTE ST 2086');
      }
      if (hasHlg) {
        addHdrToken('HLG');
      }
      const writingLibrary = simplifyWritingLibrary(
        getTrackValue(video, [
          'Writing_library',
          'Writing library',
          'Encoded_Library',
          'Encoded_Library/String',
          'Encoded_Library_Name',
          'Encoded_Library_Name/String'
        ])
      );
      const hdrDetailSources = [hdrTextRaw];
      const addHdrDetail = (sourceTrack) => {
        if (!sourceTrack) {
          return;
        }
        for (const [key, value] of Object.entries(sourceTrack)) {
          const raw = String(value || '').trim();
          if (!raw) {
            continue;
          }
          if (/hdr/i.test(key) || /dolby\s*vision|dvhe/i.test(raw)) {
            hdrDetailSources.push(raw);
          }
        }
      };
      addHdrDetail(video);
      addHdrDetail(general);
      const hdrDetailRaw = hdrDetailSources.join(' | ');
      const dvProfileValue =
        getTrackValue(video, ['HDR_Format_Profile', 'HDR_Format_Profile/String', 'HDR_Format_Profile_String']) ||
        getTrackValue(general, ['HDR_Format_Profile', 'HDR_Format_Profile/String', 'HDR_Format_Profile_String']);
      const dvLevelValue =
        getTrackValue(video, [
          'HDR_Format_Level',
          'HDR_Format_Level/String',
          'HDR_Format_Profile_Level',
          'HDR_Format_Profile_Level/String',
          'HDR_Format_Profile_Level_String'
        ]) ||
        getTrackValue(general, [
          'HDR_Format_Level',
          'HDR_Format_Level/String',
          'HDR_Format_Profile_Level',
          'HDR_Format_Profile_Level/String',
          'HDR_Format_Profile_Level_String'
        ]);
      const dvProfileMatch = hdrDetailRaw.match(/Profile\s*([0-9.]+)/i);
      let dvProfile = dvProfileMatch ? dvProfileMatch[1] : '';
      if (!dvProfile && dvProfileValue) {
        const match = String(dvProfileValue).match(/([0-9]+(?:\.[0-9]+)?)/);
        dvProfile = match ? match[1] : '';
      }
      const dvheMatch = hdrDetailRaw.match(/dvhe\.\d{2}\.\d{2}/i);
      let dvhe = dvheMatch ? dvheMatch[0] : '';
      if (!dvhe && dvProfileValue) {
        const match = String(dvProfileValue).match(/dvhe\.\d{2}\.\d{2}/i);
        dvhe = match ? match[0] : '';
      }
      if (!dvhe && dvProfile && dvLevelValue) {
        const profileDigits = String(dvProfile).replace(/[^\d]/g, '');
        const levelDigitsMatch = String(dvLevelValue).match(/(\d{2})/);
        const levelDigits = levelDigitsMatch ? levelDigitsMatch[1] : '';
        if (profileDigits && levelDigits) {
          const normalizedProfile = profileDigits.padStart(2, '0').slice(-2);
          dvhe = `dvhe.${normalizedProfile}.${levelDigits}`;
        }
      }
      if (dvhe) {
        if (!dvProfile || !dvProfile.includes('.')) {
          if (/dvhe\.08\.06/i.test(dvhe)) {
            dvProfile = '8.1';
          } else if (/dvhe\.08\.07/i.test(dvhe)) {
            dvProfile = '8.2';
          } else if (/dvhe\.08\.04/i.test(dvhe)) {
            dvProfile = '8.4';
          }
        }
      }
      const hasDV =
        /dolby\s*vision/i.test(hdrDetailRaw) || Boolean(dvProfile) || Boolean(dvhe);
      let hdrText = '';
      if (hasDV) {
        const dvParts = [];
        if (dvProfile) {
          dvParts.push(`Profile ${dvProfile}`);
        }
        if (dvhe) {
          dvParts.push(dvhe);
        }
        const dvLabel = dvParts.length ? `Dolby Vision (${dvParts.join(', ')})` : 'Dolby Vision';
        const ordered = [...hdrTokensSet];
        ordered.push(dvLabel);
        hdrText = ordered.filter(Boolean).join(' | ');
      } else {
        hdrText = [...hdrTokensSet].filter(Boolean).join(' | ');
      }

      if (format) {
        lines.push(`Format          : ${format}`);
      }
      if (width && height) {
        lines.push(`Risoluzione     : ${width}x${height}`);
      }
      if (bitDepth) {
        lines.push(`Bit depth       : ${bitDepth}`);
      }
      if (hdrText) {
        lines.push(`HDR/DV          : ${hdrText}`);
      }
      lines.push(`Writing library : ${writingLibrary || 'Non presente'}`);
    }

    if (audioTracks.length) {
      lines.push('');
      lines.push('Audio');
      audioTracks.forEach((track, index) => {
        const format = getTrackValue(track, ['Format', 'Format/String', 'Format_Commercial', 'Format_Commercial_IfAny']);
        const lang = resolveLangName(track);
        const title = getTrackValue(track, ['Title', 'Title/String']) || '';
        const labelParts = [];
        if (lang) {
          labelParts.push(lang);
        }
        if (format) {
          labelParts.unshift(format);
        }
        const detail = title ? ` | Title: ${title}` : '';
        lines.push(`#${index + 1}            : ${labelParts.join(' / ') || 'Traccia audio'}${detail}`);
      });
    }

    if (textTracks.length) {
      lines.push('');
      lines.push('Sottotitoli');
      const visibleSubs = textTracks.slice(0, 5);
      visibleSubs.forEach((track, index) => {
        const lang = resolveLangName(track);
        const title = getTrackValue(track, ['Title', 'Title/String']) || '';
        const detail = title ? ` | Title: ${title}` : '';
        lines.push(`#${index + 1}            : ${lang || 'Sottotitolo'}${detail}`);
      });
      if (textTracks.length > visibleSubs.length) {
        const remaining = textTracks.length - visibleSubs.length;
        lines.push(`Altri ${remaining} sottotitoli presenti e non mostrati`);
      }
    }

    return lines.join('\n').trim() || 'MediaInfo non disponibile.';
  }

  return {
    buildLanguageTag,
    buildMediaInfoShort,
    cleanSearchTitle,
    extractGroupTagFromName,
    fillFromMediaInfo,
    getHdrTokens,
    getResolution,
    guessMetadataFromName,
    episodeKey
  };
}
