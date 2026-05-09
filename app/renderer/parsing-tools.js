// Parsing helpers: detect format/source/repack from names and MediaInfo/structure.
import { state } from './state.js';
import {
  getAudioTracks,
  getTrackValue,
  getVideoTrack,
  getGeneralTrack,
  hasEncodingSignature
} from './media-utils.js';

function isDiscStructure() {
  if (state.kind !== 'dir' || !Array.isArray(state.videoFiles) || !state.videoFiles.length) {
    return false;
  }
  return state.videoFiles.some((filePath) =>
    /[\\\/](BDMV[\\\/]+STREAM|VIDEO_TS)[\\\/]/i.test(filePath || '')
  );
}

function getDiscSourceHint(width, height) {
  const files = Array.isArray(state.videoFiles) ? state.videoFiles : [];
  const hasVideoTs = files.some((filePath) => /[\\\/]VIDEO_TS[\\\/]/i.test(filePath || ''));
  if (hasVideoTs) {
    return {
      source: 'DVD',
      sourceReason: 'Rilevato da struttura disco: VIDEO_TS'
    };
  }
  const isUhd = width >= 3800 || height >= 2100;
  const isHd = width >= 1800 || height >= 1000;
  if (isUhd) {
    return {
      source: 'UHD BluRay',
      sourceReason: 'Rilevato da struttura disco: BDMV + risoluzione UHD'
    };
  }
  if (isHd) {
    return {
      source: 'BluRay',
      sourceReason: 'Rilevato da struttura disco: BDMV + risoluzione HD'
    };
  }
  return { source: '', sourceReason: '' };
}

// Token priority matters: earlier matches win (e.g., WEB-DL vs WEBRip).
function detectFormatFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\bDVD[-.\s]?RIP\b/.test(upper) || /\bDVDRIP\b/.test(upper)) {
    return 'Encode';
  }
  if (/\bWEB[-.\s]?DL\b/.test(upper) || /\bWEBDL\b/.test(upper)) {
    return 'WEB-DL';
  }
  if (/\bWEB[-.\s]?RIP\b/.test(upper) || /\bWEBRIP\b/.test(upper)) {
    return 'WEBRip';
  }
  if (/\bREMUX\b/.test(upper)) {
    return 'Remux';
  }
  if (/\bFULL\s*DISC\b/.test(upper) || /\bBDMV\b/.test(upper) || /\bBDISO\b/.test(upper)) {
    return 'Full Disc';
  }
  if (/\bBLU[-\s]?RAY\b/.test(upper) || /\bBLURAY\b/.test(upper) || /\bUHD\b/.test(upper)) {
    return 'Encode';
  }
  return '';
}

function detectSourceFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\bHDTV\b/.test(upper)) {
    return 'HDTV';
  }
  if (/\bDVD[-.\s]?RIP\b/.test(upper) || /\bDVDRIP\b/.test(upper)) {
    return 'DVD';
  }
  if (/\bUHD\b/.test(upper) && /(\bBLU[-\s]?RAY\b|\bBLURAY\b)/.test(upper)) {
    return 'UHD BluRay';
  }
  if (/\bBLU[-\s]?RAY\b/.test(upper) || /\bBLURAY\b/.test(upper)) {
    return 'BluRay';
  }
  if (/\bDVD\b/.test(upper)) {
    return 'DVD';
  }
  return '';
}

function detectRepackFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\bRERIP\b/.test(upper)) {
    return 'RERIP';
  }
  if (/\bPROPER\b/.test(upper)) {
    return 'PROPER';
  }
  if (/\bREPACK\b/.test(upper)) {
    return 'REPACK';
  }
  return '';
}

function detectOriginalSourceMedium(mediaInfo, { width = 0, height = 0 } = {}) {
  const sourceKeys = [
    'Original source medium',
    'Original source medium/String',
    'Original_source_medium',
    'Original_source_medium/String',
    'OriginalSourceMedium',
    'Original_Source_Medium',
    'Original_Source_Medium/String'
  ];
  const resolveSource = (raw) => {
    if (!raw) {
      return '';
    }
    const upper = String(raw).toUpperCase();
    if (upper.includes('BLU-RAY') || upper.includes('BLURAY')) {
      if (width >= 3800 || height >= 2100) {
        return 'UHD BluRay';
      }
      return 'BluRay';
    }
    if (upper.includes('HD DVD') || upper.includes('HDDVD')) {
      return 'HD DVD';
    }
    if (upper.includes('DVD')) {
      return 'DVD';
    }
    return '';
  };

  const audioTracks = getAudioTracks(mediaInfo);
  for (const track of audioTracks) {
    const raw =
      getTrackValue(track, sourceKeys) ||
      getTrackValue(track?.extra || {}, sourceKeys);
    const resolved = resolveSource(raw);
    if (resolved) {
      return resolved;
    }
  }

  const textTracks = (mediaInfo?.media?.track || []).filter((track) => track['@type'] === 'Text');
  for (const track of textTracks) {
    const raw =
      getTrackValue(track, sourceKeys) ||
      getTrackValue(track?.extra || {}, sourceKeys);
    const resolved = resolveSource(raw);
    if (resolved) {
      return resolved;
    }
  }
  return '';
}

function normalizeNumber(raw) {
  const cleaned = String(raw || '').replace(/[^0-9]/g, '');
  if (!cleaned) {
    return 0;
  }
  return Number.parseInt(cleaned, 10) || 0;
}

function shortenDebugValue(value, limit = 220) {
  if (!value) {
    return '';
  }
  const text = String(value);
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}…`;
}

function hasLosslessAudio(mediaInfo) {
  const audioTracks = getAudioTracks(mediaInfo);
  const losslessPattern = /\b(TRUEHD|MLP\s*FBA|DTS[-\s]?HD\s*MA|DTS:X|FLAC|PCM|LPCM)\b/i;
  return audioTracks.some((track) => {
    const combined = `${track?.Format || ''} ${track?.Format_Commercial_IfAny || ''} ${track?.Title || ''}`.trim();
    return losslessPattern.test(combined);
  });
}

function detectFormatFromMediaInfo(mediaInfo, baseName, { service, source } = {}) {
  if (!mediaInfo || mediaInfo.error) {
    return {
      value: '',
      reason: '',
      source: '',
      sourceReason: '',
      debug: { error: 'mediaInfo missing or error' }
    };
  }
  const videoTrack = getVideoTrack(mediaInfo);
  const generalTrack = getGeneralTrack(mediaInfo);
  if (!videoTrack && !generalTrack) {
    return {
      value: '',
      reason: '',
      source: '',
      sourceReason: '',
      debug: { error: 'no video/general tracks' }
    };
  }

  const width = normalizeNumber(getTrackValue(videoTrack, ['Width', 'Width/String', 'Width_Original', 'Width_Original/String']));
  const height = normalizeNumber(
    getTrackValue(videoTrack, ['Height', 'Height/String', 'Height_Original', 'Height_Original/String'])
  );
  const isUhd = width >= 3800 || height >= 2100;
  const isHd = width >= 1800 || height >= 1000;
  const sourceGuess = isUhd ? 'UHD BluRay' : isHd ? 'BluRay' : '';
  const originalSource = detectOriginalSourceMedium(mediaInfo, { width, height });
  const sourceHint = originalSource || sourceGuess;
  const sourceHintReason = originalSource
    ? 'Rilevato dal parsing MediaInfo: original source medium'
    : (sourceGuess ? 'Rilevato dal parsing MediaInfo: risoluzione disco' : '');

  const debugInfo = {
    width,
    height,
    isUhd,
    isHd,
    isDiscStructure: isDiscStructure(),
    sourceGuess,
    originalSource,
    sourceHint,
    sourceHintReason,
    service: String(service || ''),
    source: String(source || '')
  };
  const withDebug = (result) => ({ ...result, debug: debugInfo });

  if (isDiscStructure()) {
    const discHint = getDiscSourceHint(width, height);
    return withDebug({
      value: 'Full Disc',
      reason: 'Rilevato da struttura disco: BDMV/VIDEO_TS',
      source: discHint.source || sourceGuess,
      sourceReason: discHint.sourceReason || (sourceGuess ? 'Rilevato da struttura disco: risoluzione' : '')
    });
  }

  if (/\b(UNTOUCHED|VU1080|VU720|VU)\b/i.test(String(baseName || ''))) {
    return withDebug({
      value: 'Remux',
      reason: 'Rilevato da parsing del nome file: marker UNTOUCHED/VU',
      source: '',
      sourceReason: ''
    });
  }

  const encodingSettings = String(
    getTrackValue(videoTrack, [
      'Encoded_Library_Settings',
      'Encoded_Library_Settings/String',
      'Encoding_Settings',
      'Encoding_Settings/String'
    ]) || ''
  ).toLowerCase();
  const encodedLibrary = String(
    getTrackValue(videoTrack, [
      'Encoded_Library',
      'Encoded_Library/String',
      'Encoded_Library_Name',
      'Encoded_Library_Name/String'
    ]) || ''
  ).toLowerCase();
  const generalApp = String(
    getTrackValue(generalTrack, ['Encoded_Application', 'Writing_Application', 'Writing application']) || ''
  ).toLowerCase();
  const generalLibrary = String(
    getTrackValue(generalTrack, ['Encoded_Library', 'Writing_Library', 'Writing library']) || ''
  ).toLowerCase();
  const generalFrontend = String(generalTrack?.extra?.Writing_frontend || '').toLowerCase();
  const toolString = `${generalApp} ${generalFrontend}`.trim();
  const encoderSignature = `${encodingSettings} ${encodedLibrary} ${generalApp} ${generalFrontend} ${generalLibrary}`.trim();
  const fingerprintLibrary = `${encodedLibrary} ${generalLibrary}`.trim();
  const hasEncodingTools = /(handbrake|staxrip|megui|megatagger|x264|x265)/.test(toolString);
  const hasEncoderTool = /(x264|x265|libx264|libx265|nvenc|nvencc|qsv|svt|av1|ffmpeg|handbrake|staxrip|megui)/.test(
    encoderSignature
  );
  const hasEncodingSettings = Boolean(encodingSettings);
  const hasEncodeSignature =
    hasEncodingSignature(videoTrack) || hasEncodingSignature(generalTrack);
  const hasEncode = hasEncodingSettings || hasEncodingTools || hasEncodeSignature;
  const isHandbrake = toolString.includes('handbrake') || generalApp.includes('handbrake') || generalLibrary.includes('handbrake');

  if ((generalApp.includes('makemkv') || generalLibrary.includes('makemkv')) && !hasEncodingSettings) {
    return withDebug({
      value: 'Remux',
      reason: 'Rilevato dal parsing MediaInfo: MakeMKV senza encoding',
      source: '',
      sourceReason: ''
    });
  }

  const hdrProfile = String(videoTrack?.HDR_Format_Profile || '').toLowerCase();
  const hasStreamingDv = hdrProfile.includes('dvhe.05') || hdrProfile.includes('dvhe.08');

  const upperName = String(baseName || '').toUpperCase();
  const nameHasWeb = /\bWEB\b/.test(upperName);
  // Distingue WEB-DL esplicito da generico WEB/WEBRip: i servizi streaming (HMAX, NF, ecc.)
  // codificano alla fonte, quindi i loro file sono WEB-DL puri anche se MediaInfo mostra x264.
  const nameHasWebDL = /\bWEB[-.\s]?DL\b/.test(upperName);
  const serviceUpper = String(service || '').toUpperCase();
  const sourceUpper = String(source || '').toUpperCase();
  const sourceIsBluRay = sourceUpper.includes('BLURAY') || sourceUpper.includes('BLU-RAY');
  const losslessAudio = hasLosslessAudio(mediaInfo);
  const videoFormatRaw = String(videoTrack?.Format || '').toUpperCase();
  const isHevc = videoFormatRaw.includes('HEVC') || videoFormatRaw.includes('H.265') || videoFormatRaw.includes('X265');

  Object.assign(debugInfo, {
    nameHasWeb,
    nameHasWebDL,
    serviceUpper,
    sourceUpper,
    sourceIsBluRay,
    losslessAudio,
    hasEncodingSettings,
    hasEncodingTools,
    hasEncoderTool,
    hasEncodeSignature,
    hasEncode,
    isHandbrake,
    hasStreamingDv,
    hdrProfile: hdrProfile || '',
    isHevc,
    encodedLibrary: shortenDebugValue(encodedLibrary),
    generalLibrary: shortenDebugValue(generalLibrary),
    generalApp: shortenDebugValue(generalApp),
    generalFrontend: shortenDebugValue(generalFrontend),
    encodingSettings: shortenDebugValue(encodingSettings),
    encodingSettingsLength: encodingSettings.length,
    fingerprintLibrary: shortenDebugValue(fingerprintLibrary)
  });

  if (/\bREMUX\b/.test(upperName) && sourceIsBluRay && losslessAudio) {
    return withDebug({
      value: 'Remux',
      reason: 'Rilevato dal parsing del nome file: REMUX con audio lossless',
      source: '',
      sourceReason: ''
    });
  }

  if (!serviceUpper && !nameHasWeb && !sourceIsBluRay && sourceHint && losslessAudio) {
    if (!isUhd && isHevc) {
      return withDebug({
        value: 'Encode',
        reason: 'Rilevato dal parsing MediaInfo: HEVC 1080p senza marker disco',
        source: '',
        sourceReason: ''
      });
    }
    if (hasEncoderTool) {
      return withDebug({
        value: 'Encode',
        reason: 'Rilevato dal parsing MediaInfo: audio lossless con encoding',
        source: sourceHint,
        sourceReason: sourceHintReason
      });
    }
    return withDebug({
      value: 'Remux',
      reason: 'Rilevato dal parsing MediaInfo: audio lossless senza encoding',
      source: sourceHint,
      sourceReason: sourceHintReason
    });
  }

  if (hasStreamingDv && !hasEncodingTools && !hasEncodingSettings && !sourceIsBluRay) {
    return withDebug({
      value: 'WEB-DL',
      reason: 'Rilevato dal parsing MediaInfo: DV streaming profile',
      source: '',
      sourceReason: ''
    });
  }
  if (encodingSettings.includes('crf=')) {
    if (nameHasWebDL && serviceUpper) {
      return withDebug({
        value: 'WEB-DL',
        reason: 'Rilevato dal parsing del nome file: WEB-DL + servizio streaming (CRF alla fonte)',
        source: '',
        sourceReason: ''
      });
    }
    return withDebug({
      value: nameHasWeb || serviceUpper ? 'WEBRip' : 'Encode',
      reason: 'Rilevato dal parsing MediaInfo: CRF rilevato',
      source: '',
      sourceReason: ''
    });
  }
  if (serviceUpper === 'CR') {
    if (nameHasWebDL) {
      return withDebug({
        value: 'WEB-DL',
        reason: 'Rilevato dal parsing del nome file: WEB-DL esplicito (Crunchyroll streaming source)',
        source: '',
        sourceReason: ''
      });
    }
    if (fingerprintLibrary.includes('core 142')) {
      return withDebug({
        value: 'WEB-DL',
        reason: 'Rilevato dal parsing MediaInfo: fingerprint Crunchyroll (core 142)',
        source: '',
        sourceReason: ''
      });
    }
    const coreMatch = fingerprintLibrary.match(/core\s+(\d+)/);
    if (coreMatch && Number(coreMatch[1]) >= 152) {
      return withDebug({
        value: 'WEBRip',
        reason: 'Rilevato dal parsing MediaInfo: fingerprint Crunchyroll (core >= 152)',
        source: '',
        sourceReason: ''
      });
    }
    if (encodingSettings.includes('bitrate=')) {
      return withDebug({
        value: 'WEB-DL',
        reason: 'Rilevato dal parsing MediaInfo: Crunchyroll bitrate=',
        source: '',
        sourceReason: ''
      });
    }
  }
  const formatProfile = String(videoTrack?.Format_Profile || '');
  if (
    formatProfile.includes('Main@L4.0') &&
    encodingSettings.includes('rc=2pass') &&
    (fingerprintLibrary.includes('core 118') || fingerprintLibrary.includes('core 148'))
  ) {
    return withDebug({
      value: 'WEB-DL',
      reason: 'Rilevato dal parsing MediaInfo: fingerprint Netflix',
      source: '',
      sourceReason: ''
    });
  }
  if (nameHasWeb) {
    // Se il filename ha sia WEB-DL che un codice servizio (NF, HMAX, CR, ecc.) → WEB-DL definitivo.
    // Il servizio nel nome è il discriminatore: i file senza servizio seguono la logica normale.
    if (nameHasWebDL && serviceUpper) {
      return withDebug({
        value: 'WEB-DL',
        reason: 'Rilevato dal parsing del nome file: WEB-DL + servizio streaming',
        source: '',
        sourceReason: ''
      });
    }
    if (hasEncodingTools) {
      return withDebug({
        value: 'WEBRip',
        reason: 'Rilevato dal parsing MediaInfo: tool encoding su sorgente WEB',
        source: '',
        sourceReason: ''
      });
    }
    if (!hasEncode) {
      return withDebug({
        value: 'WEB-DL',
        reason: 'Rilevato dal parsing MediaInfo: WEB senza encoding',
        source: '',
        sourceReason: ''
      });
    }
  }
  if (serviceUpper && (!hasEncode || !hasEncodingTools)) {
    return withDebug({
      value: 'WEB-DL',
      reason: 'Rilevato dal parsing MediaInfo: servizio streaming senza tool di encoding',
      source: '',
      sourceReason: ''
    });
  }
  if (originalSource && !nameHasWeb && !serviceUpper && !sourceIsBluRay) {
    return withDebug({
      value: hasEncode ? 'Encode' : 'Remux',
      reason: hasEncode
        ? 'Rilevato dal parsing MediaInfo: encoding rilevato'
        : 'Rilevato dal parsing MediaInfo: source disco senza encoding',
      source: originalSource,
      sourceReason: sourceHintReason
    });
  }
  if (isHandbrake && !nameHasWeb && !serviceUpper && !sourceIsBluRay) {
    return withDebug({
      value: 'Encode',
      reason: 'Rilevato dal parsing MediaInfo: HandBrake indica encode',
      source: '',
      sourceReason: ''
    });
  }
  if (sourceIsBluRay) {
    return withDebug({
      value: hasEncode ? 'Encode' : 'Remux',
      reason: hasEncode
        ? 'Rilevato dal parsing MediaInfo: BluRay con encoding'
        : 'Rilevato dal parsing MediaInfo: BluRay senza encoding',
      source: '',
      sourceReason: ''
    });
  }
  return withDebug({ value: '', reason: '', source: '', sourceReason: '' });
}

function extractTokensPresent(name, tokens) {
  const matches = [];
  const safeName = String(name || '');
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(safeName)) {
      matches.push(token);
    }
  }
  return matches;
}

export {
  detectFormatFromName,
  detectSourceFromName,
  detectRepackFromName,
  detectFormatFromMediaInfo,
  extractTokensPresent,
  isDiscStructure,
  getDiscSourceHint
};
