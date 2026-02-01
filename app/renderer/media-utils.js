import { AUDIO_CODEC_SCORE, LANG_MAP } from './constants.js';

export function normalizeLangTag(raw) {
  if (!raw) {
    return '';
  }
  const cleaned = String(raw).trim().toLowerCase();
  const token = cleaned.split(/[\s/,(]+/)[0];
  const key = token.replace(/[^a-z]/g, '');
  if (LANG_MAP[key]) {
    return LANG_MAP[key];
  }
  if (token.length === 2 || token.length === 3) {
    return token.toUpperCase();
  }
  return token.toUpperCase().slice(0, 3);
}

export function getTrackLang(track) {
  return (
    track?.Language ||
    track?.['Language/String'] ||
    track?.Language_String ||
    track?.['Language_String'] ||
    track?.['Language/String3'] ||
    track?.Language_String3 ||
    ''
  );
}

export function parseChannels(value) {
  const match = String(value || '').match(/\d+/);
  if (!match) {
    return '';
  }
  const channels = parseInt(match[0], 10);
  const map = {
    1: '1.0',
    2: '2.0',
    3: '3.0',
    4: '4.0',
    5: '5.0',
    6: '5.1',
    7: '6.1',
    8: '7.1'
  };
  return map[channels] || `${channels}.0`;
}

export function mapAudioCodec(track) {
  const formatRaw = String(track?.Format || '').toUpperCase();
  const commercialRaw = String(track?.Format_Commercial || track?.Format_Commercial_IfAny || '').toUpperCase();
  const combined = `${commercialRaw} ${formatRaw}`;

  if (combined.includes('DTS:X')) {
    return 'DTS:X';
  }
  if (combined.includes('DTS-HD') && combined.includes('MASTER')) {
    return 'DTS-HD MA';
  }
  if (combined.includes('DTS-HD') && combined.includes('HIGH')) {
    return 'DTS-HD HRA';
  }
  if (combined.includes('TRUEHD')) {
    return 'TrueHD';
  }
  if (combined.includes('E-AC-3') || combined.includes('EAC3') || combined.includes('DD+')) {
    return 'DD+';
  }
  if (combined.includes('AC-3') || combined.includes('AC3') || combined.includes('DD')) {
    return 'DD';
  }
  if (combined.includes('FLAC')) {
    return 'FLAC';
  }
  if (combined.includes('AAC')) {
    return 'AAC';
  }
  if (combined.includes('OPUS')) {
    return 'OPUS';
  }
  if (combined.includes('DTS')) {
    return 'DTS';
  }
  return String(track?.Format || track?.Format_Commercial || '').trim();
}

export function detectAudioMeta(track) {
  const extra = `${track?.Format_AdditionalFeatures || ''} ${track?.Format_Commercial || ''} ${track?.Title || ''}`
    .toLowerCase();
  if (extra.includes('atmos') || extra.includes('joc')) {
    return 'Atmos';
  }
  if (extra.includes('auro')) {
    return 'Auro3D';
  }
  return '';
}

export function scoreAudioTrack(track) {
  const codec = mapAudioCodec(track);
  const scoreBase = AUDIO_CODEC_SCORE[codec] || 40;
  const channels = parseChannels(track?.Channels || track?.['Channel(s)'] || '');
  const channelsValue = parseFloat(channels) || 0;
  const bitrateMatch = String(track?.BitRate || '').match(/\d+/);
  const bitrateValue = bitrateMatch ? parseInt(bitrateMatch[0], 10) : 0;
  return scoreBase * 1000 + channelsValue * 10 + bitrateValue / 1000000;
}

export function getVideoTrack(mediaInfo) {
  const tracks = mediaInfo?.media?.track || [];
  return tracks.find((track) => track['@type'] === 'Video');
}

export function getAudioTracks(mediaInfo) {
  const tracks = mediaInfo?.media?.track || [];
  return tracks.filter((track) => track['@type'] === 'Audio');
}

export function getGeneralTrack(mediaInfo) {
  const tracks = mediaInfo?.media?.track || [];
  return tracks.find((track) => track['@type'] === 'General');
}

export function hasEncodingSignature(track) {
  if (!track) {
    return false;
  }
  const encoderPattern = /(x264|x265|libx264|libx265|ffmpeg|handbrake|staxrip|megui|nvenc|nvencc|qsv|svt|av1|ripbot)/i;
  const muxerOnlyPattern = /(libebml|libmatroska|mkvmerge|lavf)/i;
  const getValue = (key) => String(track[key] || '').trim();
  const hasAny = (keys) => keys.some((key) => getValue(key));
  const firstValue = (keys) => {
    for (const key of keys) {
      const value = getValue(key);
      if (value) {
        return value;
      }
    }
    return '';
  };
  const isGeneral = track['@type'] === 'General';
  const libraryKeys = ['Encoded_Library', 'Encoded_Library_Name', 'Encoded_Library/String', 'Encoded_Library_Name/String'];
  const settingsKeys = ['Encoded_Library_Settings', 'Encoding_Settings', 'Encoded_Library_Settings/String', 'Encoding_Settings/String'];
  const directKeys = [
    'Encoded_Library',
    'Encoded_Library_Name',
    'Encoded_Library_Settings',
    'Encoding_Settings',
    'Encoded_Library/String',
    'Encoded_Library_Name/String',
    'Encoded_Library_Settings/String',
    'Encoding_Settings/String'
  ];

  if (isGeneral) {
    if (hasAny(settingsKeys)) {
      return true;
    }
    const libraryValue = firstValue(libraryKeys);
    if (libraryValue) {
      if (encoderPattern.test(libraryValue)) {
        return true;
      }
      if (muxerOnlyPattern.test(libraryValue)) {
        return false;
      }
      return true;
    }
  }

  if (!isGeneral && hasAny(directKeys)) {
    return true;
  }

  const writingKeys = ['Writing_library', 'Writing_Application', 'Writing library', 'Writing application'];
  return writingKeys.some((key) => encoderPattern.test(getValue(key)));
}

export function suggestFormatFromMediaInfo(mediaInfo) {
  if (!mediaInfo || mediaInfo.error) {
    return '';
  }
  const videoTrack = getVideoTrack(mediaInfo);
  const generalTrack = getGeneralTrack(mediaInfo);
  const hasEncode = hasEncodingSignature(videoTrack) || hasEncodingSignature(generalTrack);
  return hasEncode ? 'Encode' : 'WEB-DL';
}

export function mapVideoCodec(videoTrack, releaseFormat) {
  const formatRaw = String(videoTrack?.Format || '').toUpperCase();
  if (!formatRaw) {
    return '';
  }

  if (releaseFormat === 'Encode') {
    if (formatRaw.includes('HEVC') || formatRaw.includes('H.265')) {
      return 'x265';
    }
    if (formatRaw.includes('AVC') || formatRaw.includes('H.264')) {
      return 'x264';
    }
    if (formatRaw.includes('AV1')) {
      return 'AV1';
    }
  }

  if (releaseFormat === 'WEB-DL' || releaseFormat === 'WEBRip') {
    if (formatRaw.includes('HEVC') || formatRaw.includes('H.265')) {
      return 'H.265';
    }
    if (formatRaw.includes('AVC') || formatRaw.includes('H.264')) {
      return 'H.264';
    }
    if (formatRaw.includes('AV1')) {
      return 'AV1';
    }
  }

  if (formatRaw.includes('HEVC') || formatRaw.includes('H.265')) {
    return 'HEVC';
  }
  if (formatRaw.includes('AVC') || formatRaw.includes('H.264')) {
    return 'AVC';
  }
  if (formatRaw.includes('AV1')) {
    return 'AV1';
  }
  if (formatRaw.includes('VC-1')) {
    return 'VC-1';
  }
  if (formatRaw.includes('MPEG')) {
    return 'MPEG-2';
  }
  return String(videoTrack?.Format || '').trim();
}

export function getTrackValue(track, keys) {
  if (!track) {
    return '';
  }
  for (const key of keys) {
    const value = track[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
}

export function formatBytes(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return String(raw || '');
  }
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

export function formatDuration(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return String(raw || '');
  }
  const seconds = value > 10000 ? value / 1000 : value;
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs) {
    return `${hrs} h ${String(mins).padStart(2, '0')} min`;
  }
  if (mins) {
    return `${mins} min ${String(secs).padStart(2, '0')} s`;
  }
  return `${secs} s`;
}

export function formatBitrate(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return String(raw || '');
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)} Mb/s`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)} kb/s`;
  }
  return `${value} b/s`;
}

export function formatLangName(tag) {
  const normalized = normalizeLangTag(tag);
  const map = {
    ITA: 'Italiano',
    ENG: 'Inglese',
    JPN: 'Giapponese',
    SPA: 'Spagnolo',
    FRA: 'Francese',
    DEU: 'Tedesco',
    POR: 'Portoghese',
    KOR: 'Coreano',
    RUS: 'Russo',
    ZHO: 'Cinese'
  };
  return map[normalized] || normalized;
}
