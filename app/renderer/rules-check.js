import { LANG_MAP, UNIT3D_RESOLUTION_ID } from './constants.js';
import { getPathBaseName, stripExtension } from './path-utils.js';

const LANGUAGE_CODES = Array.from(new Set([...Object.values(LANG_MAP), 'MULTI']))
  .filter(Boolean)
  .map((value) => String(value).toUpperCase());
const LANGUAGE_CODES_PATTERN = LANGUAGE_CODES.join('|');

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractLanguagesFromName(name) {
  if (!LANGUAGE_CODES_PATTERN) {
    return [];
  }
  const regex = new RegExp(`\\b(${LANGUAGE_CODES_PATTERN})\\b`, 'gi');
  const found = new Set();
  let match;
  while ((match = regex.exec(name)) !== null) {
    if (match[1]) {
      found.add(match[1].toUpperCase());
    }
  }
  return Array.from(found);
}

function extractResolutionFromName(name) {
  const tokens = Object.keys(UNIT3D_RESOLUTION_ID);
  if (!tokens.length) {
    return '';
  }
  const pattern = tokens
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((token) => token.replace(/([.*+?^${}()|[\]\\])/g, '\\$1'))
    .join('|');
  const regex = new RegExp(`\\b(${pattern})\\b`, 'i');
  const match = name.match(regex);
  return match ? match[1] : '';
}

function detectFormatFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\\bWEB[-.\\s]?DL\\b/.test(upper) || /\\bWEBDL\\b/.test(upper)) {
    return { value: 'WEB-DL', isWeb: true };
  }
  if (/\\bWEB[-.\\s]?RIP\\b/.test(upper) || /\\bWEBRIP\\b/.test(upper)) {
    return { value: 'WEBRip', isWeb: true };
  }
  if (/\\bREMUX\\b/.test(upper)) {
    return { value: 'REMUX', isWeb: false };
  }
  if (/\\bFULL\\s*DISC\\b/.test(upper) || /\\bBDMV\\b/.test(upper) || /\\bBDISO\\b/.test(upper)) {
    return { value: 'FULL DISC', isWeb: false };
  }
  if (/\\bBLU[-\\s]?RAY\\b/.test(upper) || /\\bBLURAY\\b/.test(upper) || /\\bUHD\\b/.test(upper)) {
    return { value: 'ENCODE', isWeb: false };
  }
  return { value: '', isWeb: null };
}

function detectSourceFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\\bUHD\\b/.test(upper) && /\\bBLU[-\\s]?RAY\\b/.test(upper)) {
    return 'UHD BluRay';
  }
  if (/\\bBLU[-\\s]?RAY\\b/.test(upper) || /\\bBLURAY\\b/.test(upper)) {
    return 'BluRay';
  }
  if (/\\bHD\\s*DVD\\b/.test(upper)) {
    return 'HD DVD';
  }
  if (/\\bDVD\\b/.test(upper)) {
    return 'DVD';
  }
  if (/\\bPAL\\b/.test(upper)) {
    return 'PAL';
  }
  if (/\\bNTSC\\b/.test(upper)) {
    return 'NTSC';
  }
  return '';
}

function extractVideoCodecFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\\bAV1\\b/.test(upper)) {
    return 'AV1';
  }
  if (/\\bMPEG[-\\s]?2\\b/.test(upper) || /\\bMPEG2\\b/.test(upper)) {
    return 'MPEG-2';
  }
  if (/\\bVC[-\\s]?1\\b/.test(upper) || /\\bVC1\\b/.test(upper)) {
    return 'VC-1';
  }
  if (/\\bX265\\b/.test(upper) || /\\bH\\.?265\\b/.test(upper) || /\\bHEVC\\b/.test(upper)) {
    return 'H.265';
  }
  if (/\\bX264\\b/.test(upper) || /\\bH\\.?264\\b/.test(upper) || /\\bAVC\\b/.test(upper)) {
    return 'H.264';
  }
  return '';
}

function extractAudioCodecFromName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\\bTRUEHD\\b/.test(upper)) {
    return 'TrueHD';
  }
  if (/\\bDTS[-\\s]?X\\b/.test(upper) || /\\bDTSX\\b/.test(upper)) {
    return 'DTS:X';
  }
  if (/\\bDTS[-\\s]?HD\\s*MA\\b/.test(upper) || /\\bDTSHDMA\\b/.test(upper)) {
    return 'DTS-HD MA';
  }
  if (/\\bDTS[-\\s]?HD\\s*HRA\\b/.test(upper) || /\\bDTSHDHRA\\b/.test(upper)) {
    return 'DTS-HD HRA';
  }
  if (/\\bDTS\\b/.test(upper)) {
    return 'DTS';
  }
  if (/DD\\+/.test(upper) || /\\bDDP\\b/.test(upper) || /\\bEAC3\\b/.test(upper) || /\\bE-AC-3\\b/.test(upper)) {
    return 'DD+';
  }
  if (/\\bDD\\b/.test(upper) || /\\bAC3\\b/.test(upper)) {
    return 'DD';
  }
  if (/\\bAAC\\b/.test(upper)) {
    return 'AAC';
  }
  if (/\\bFLAC\\b/.test(upper)) {
    return 'FLAC';
  }
  if (/\\bOPUS\\b/.test(upper)) {
    return 'OPUS';
  }
  if (/\\bPCM\\b/.test(upper)) {
    return 'PCM';
  }
  return '';
}

function extractAudioChannelsFromName(name) {
  const match = String(name || '').match(/\\b([1-7]\\.[01])\\b/);
  return match ? match[1] : '';
}

function extractTokensPresent(name, tokens) {
  const matches = [];
  const safeName = String(name || '');
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    const escaped = escapeRegExp(token);
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(safeName)) {
      matches.push(token);
    }
  }
  return matches;
}

function parseLanguageTag(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .replace(/\\.-\\./g, '-')
    .split('-')
    .map((token) => token.trim())
    .filter(Boolean);
}

function cleanEpisodeTitle(raw, tokensToRemove) {
  if (!raw) {
    return '';
  }
  let cleaned = String(raw);
  cleaned = cleaned.replace(/\\b\\d\\.\\d\\b/gi, ' ');
  cleaned = cleaned.replace(/\\b(H\\.?265|H\\.?264|X265|X264|HEVC|AVC|AV1)\\b/gi, ' ');
  cleaned = cleaned.replace(/\\b(H|X)\\s*26[45]\\b/gi, ' ');
  cleaned = cleaned.replace(/DD\\+/gi, ' ');
  cleaned = cleaned.replace(/\\b(DDP|DD|DTS(?:-HD)?|TRUEHD|ATMOS|AAC|FLAC|PCM|OPUS|MP3|EAC3)\\b/gi, ' ');
  cleaned = cleaned.replace(/\\b([1-7])\\s*0\\b/gi, ' ');
  cleaned = cleaned.replace(/\\b([1-7])\\s*1\\b/gi, ' ');
  cleaned = cleaned.replace(/\\b(HDR10\\+|HDR10PLUS|HDR10|HDR|DV|DOLBYVISION)\\b/gi, ' ');
  const uniqueTokens = [...new Set(tokensToRemove.filter(Boolean))];
  for (const token of uniqueTokens) {
    const escaped = escapeRegExp(token);
    const regex = new RegExp(`(^|[\\s._-])${escaped}(?=[\\s._-]|$)`, 'gi');
    cleaned = cleaned.replace(regex, ' ');
  }
  cleaned = cleaned.replace(/[._+-]+/g, ' ');
  cleaned = cleaned.replace(/\\s+/g, ' ').trim();
  if (cleaned) {
    const tokens = cleaned.split(' ');
    const last = tokens[tokens.length - 1];
    if (/^[HX]$/i.test(last)) {
      tokens.pop();
      cleaned = tokens.join(' ').trim();
    }
  }
  return cleaned;
}

function resolveRuleStatus(isPresent, isMismatch) {
  if (!isPresent) {
    return 'bad';
  }
  if (isMismatch) {
    return 'warn';
  }
  return 'ok';
}

function buildWizardRuleBadge(label, value, status) {
  const badge = document.createElement('div');
  badge.className = `wizard-rule-badge ${status || 'bad'}`;
  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  const valueSpan = document.createElement('span');
  valueSpan.className = 'value';
  valueSpan.textContent = value || '—';
  badge.appendChild(labelSpan);
  badge.appendChild(valueSpan);
  return badge;
}

export function createRulesCheckTools({
  ui,
  state,
  metadataTools,
  buildServiceOptions,
  loadSettings
}) {
  function clearWizardRulesCheck() {
    if (ui.wizardRulesFolderBadges) {
      ui.wizardRulesFolderBadges.innerHTML = '';
    }
    if (ui.wizardRulesFolderHint) {
      ui.wizardRulesFolderHint.textContent = '';
      ui.wizardRulesFolderHint.classList.add('hidden');
    }
    if (ui.wizardRulesFolderPath) {
      ui.wizardRulesFolderPath.textContent = '-';
      ui.wizardRulesFolderPath.removeAttribute('title');
    }
    if (ui.wizardRulesFolderBlock) {
      ui.wizardRulesFolderBlock.classList.add('hidden');
    }
    if (ui.wizardRulesFileBadges) {
      ui.wizardRulesFileBadges.innerHTML = '';
    }
    if (ui.wizardRulesFileHint) {
      ui.wizardRulesFileHint.textContent = '';
      ui.wizardRulesFileHint.classList.add('hidden');
    }
    if (ui.wizardRulesFilePath) {
      ui.wizardRulesFilePath.textContent = '-';
      ui.wizardRulesFilePath.removeAttribute('title');
    }
    if (ui.wizardRulesFileLabel) {
      ui.wizardRulesFileLabel.textContent = 'File';
    }
    if (ui.wizardRulesFileNote) {
      ui.wizardRulesFileNote.textContent = '';
      ui.wizardRulesFileNote.classList.add('hidden');
    }
    if (ui.wizardRulesFileBlock) {
      ui.wizardRulesFileBlock.classList.add('hidden');
    }
  }

  function buildRulesCheckSummary({ namePath, baseName, form, settings, typeOverride }) {
    if (!namePath) {
      return null;
    }

    const guess = metadataTools.guessMetadataFromName(namePath);
    const actualTitle = guess.title || '';
    const actualYear = guess.year || '';
    const actualSeason = guess.season || '';
    const actualEpisode = guess.episode || '';
    const actualEpisodeTitle = guess.episodeTitle || '';
    const actualLanguages = extractLanguagesFromName(baseName);
    const actualResolution = extractResolutionFromName(baseName);
    const actualFormat = detectFormatFromName(baseName);
    const serviceOptions = buildServiceOptions(settings).map((item) => item.code);
    const actualService = extractTokensPresent(baseName, serviceOptions)[0] || '';
    const actualSource = detectSourceFromName(baseName);
    const actualVideoCodec = extractVideoCodecFromName(baseName);
    const actualAudioCodec = extractAudioCodecFromName(baseName);
    const actualAudioChannels = extractAudioChannelsFromName(baseName);

    const expectedTitle = form.title || state.metadata?.title || '';
    const expectedYear = form.year || state.metadata?.year || '';
    const expectedSeason = form.season || '';
    const expectedEpisode = form.episode || '';
    const expectedEpisodeTitle = form.episodeTitle || '';
    const expectedLanguages = parseLanguageTag(form.languageTag);
    const expectedResolution = form.resolution || '';
    const expectedFormat = form.format || '';
    const expectedService = form.service || '';
    const expectedSource = form.source || '';
    const expectedVideoCodec = form.videoCodec || '';
    const expectedAudioCodec = form.audioCodec || '';
    const expectedAudioChannels = form.audioChannels || '';

    const formatTokens = [
      'WEB-DL',
      'WEBDL',
      'WEBRIP',
      'WEB-RIP',
      'REMUX',
      'ENCODE',
      'DISC',
      'BRRIP',
      'DVDRIP',
      'BDRIP',
      'HDTV',
      'UHD',
      'BLURAY',
      'BLU-RAY'
    ];
    const serviceCodes = buildServiceOptions(settings).map((item) => item.code);
    const tokensFromName = [
      ...extractTokensPresent(baseName, formatTokens),
      ...extractTokensPresent(baseName, serviceCodes),
      ...actualLanguages
    ];
    if (actualResolution) {
      tokensFromName.push(actualResolution);
    }
    if (form.service) {
      tokensFromName.push(form.service);
    }
    if (form.source) {
      tokensFromName.push(form.source);
    }
    if (actualVideoCodec) {
      tokensFromName.push(actualVideoCodec);
    }
    if (actualAudioCodec) {
      tokensFromName.push(actualAudioCodec);
    }
    if (actualAudioChannels) {
      tokensFromName.push(actualAudioChannels);
    }

    const cleanedActualEpisodeTitle = cleanEpisodeTitle(actualEpisodeTitle, tokensFromName);
    const cleanedExpectedEpisodeTitle = cleanEpisodeTitle(expectedEpisodeTitle, tokensFromName);

    const effectiveType = typeOverride || form.type || '';
    const isEpisode = effectiveType.includes('episode');
    const isSeason = effectiveType.includes('season');
    const needsYear = form.includeYear || effectiveType === 'movie';

    const missing = [];
    const mismatchDetails = [];

    const titleOk = Boolean(actualTitle);
    let titleMismatch = false;
    if (!titleOk) {
      missing.push('Titolo');
    } else if (expectedTitle && normalizeForMatch(expectedTitle) !== normalizeForMatch(actualTitle)) {
      titleMismatch = true;
      mismatchDetails.push(`Titolo (file: ${actualTitle}, impostazioni: ${expectedTitle})`);
    }

    let yearOk = true;
    let yearMismatch = false;
    if (needsYear) {
      yearOk = Boolean(actualYear);
      if (!yearOk) {
        missing.push('Anno');
      } else if (expectedYear && String(expectedYear) !== String(actualYear)) {
        yearMismatch = true;
        mismatchDetails.push(`Anno (file: ${actualYear}, impostazioni: ${expectedYear})`);
      }
    }

    let seasonOk = true;
    let episodeOk = true;
    let seasonMismatch = false;
    let episodeMismatch = false;
    if (isSeason || isEpisode) {
      seasonOk = Boolean(actualSeason);
      if (!seasonOk) {
        missing.push('Stagione');
      } else if (expectedSeason && String(expectedSeason) !== String(actualSeason)) {
        seasonMismatch = true;
        mismatchDetails.push(`Stagione (file: ${actualSeason}, impostazioni: ${expectedSeason})`);
      }
    }
    if (isEpisode) {
      episodeOk = Boolean(actualEpisode);
      if (!episodeOk) {
        missing.push('Episodio');
      } else if (expectedEpisode && String(expectedEpisode) !== String(actualEpisode)) {
        episodeMismatch = true;
        mismatchDetails.push(`Episodio (file: ${actualEpisode}, impostazioni: ${expectedEpisode})`);
      }
    }

    let episodeTitleOk = true;
    let episodeTitleMismatch = false;
    if (isEpisode) {
      episodeTitleOk = Boolean(cleanedActualEpisodeTitle);
      if (!episodeTitleOk) {
        missing.push('Titolo episodio');
      } else if (cleanedExpectedEpisodeTitle) {
        const expectedNorm = normalizeForMatch(cleanedExpectedEpisodeTitle);
        const actualNorm = normalizeForMatch(cleanedActualEpisodeTitle);
        if (expectedNorm && !actualNorm.includes(expectedNorm)) {
          episodeTitleMismatch = true;
          mismatchDetails.push(
            `Titolo episodio (file: ${cleanedActualEpisodeTitle}, impostazioni: ${cleanedExpectedEpisodeTitle})`
          );
        }
      }
    }

    const languageOk = actualLanguages.length > 0;
    let languageMismatch = false;
    if (!languageOk) {
      missing.push('Lingua');
    } else if (expectedLanguages.length) {
      const expectedSet = new Set(expectedLanguages.map((value) => value.toUpperCase()));
      const actualSet = new Set(actualLanguages.map((value) => value.toUpperCase()));
      const same = expectedSet.size === actualSet.size
        && Array.from(expectedSet).every((value) => actualSet.has(value));
      if (!same) {
        languageMismatch = true;
        mismatchDetails.push(
          `Lingua (file: ${actualLanguages.join('-') || '—'}, impostazioni: ${expectedLanguages.join('-')})`
        );
      }
    }

    const resolutionOk = Boolean(actualResolution);
    let resolutionMismatch = false;
    if (!resolutionOk) {
      missing.push('Risoluzione');
    } else if (expectedResolution && normalizeForMatch(expectedResolution) !== normalizeForMatch(actualResolution)) {
      resolutionMismatch = true;
      mismatchDetails.push(`Risoluzione (file: ${actualResolution}, impostazioni: ${expectedResolution})`);
    }

    const formatOk = Boolean(actualFormat.value);
    let formatMismatch = false;
    if (!formatOk) {
      missing.push('Formato');
    } else if (expectedFormat && normalizeForMatch(expectedFormat) !== normalizeForMatch(actualFormat.value)) {
      formatMismatch = true;
      mismatchDetails.push(`Formato (file: ${actualFormat.value}, impostazioni: ${expectedFormat})`);
    }

    let serviceOk = true;
    let sourceOk = true;
    let serviceMismatch = false;
    let sourceMismatch = false;
    if (actualFormat.isWeb === true) {
      serviceOk = Boolean(actualService);
      if (!serviceOk) {
        missing.push('Servizio');
      } else if (expectedService && normalizeForMatch(expectedService) !== normalizeForMatch(actualService)) {
        serviceMismatch = true;
        mismatchDetails.push(`Servizio (file: ${actualService}, impostazioni: ${expectedService})`);
      }
    } else if (actualFormat.isWeb === false) {
      sourceOk = Boolean(actualSource);
      if (!sourceOk) {
        missing.push('Sorgente');
      } else if (expectedSource && normalizeForMatch(expectedSource) !== normalizeForMatch(actualSource)) {
        sourceMismatch = true;
        mismatchDetails.push(`Sorgente (file: ${actualSource}, impostazioni: ${expectedSource})`);
      }
    }

    const videoCodecOk = Boolean(actualVideoCodec);
    let videoCodecMismatch = false;
    if (!videoCodecOk) {
      missing.push('VCodec');
    } else if (expectedVideoCodec && normalizeForMatch(expectedVideoCodec) !== normalizeForMatch(actualVideoCodec)) {
      videoCodecMismatch = true;
      mismatchDetails.push(`VCodec (file: ${actualVideoCodec}, impostazioni: ${expectedVideoCodec})`);
    }

    const audioCodecOk = Boolean(actualAudioCodec);
    let audioCodecMismatch = false;
    if (!audioCodecOk) {
      missing.push('ACodec');
    } else if (expectedAudioCodec && normalizeForMatch(expectedAudioCodec) !== normalizeForMatch(actualAudioCodec)) {
      audioCodecMismatch = true;
      mismatchDetails.push(`ACodec (file: ${actualAudioCodec}, impostazioni: ${expectedAudioCodec})`);
    }

    const audioChannelsOk = Boolean(actualAudioChannels);
    let audioChannelsMismatch = false;
    if (!audioChannelsOk) {
      missing.push('Canali');
    } else if (expectedAudioChannels && normalizeForMatch(expectedAudioChannels) !== normalizeForMatch(actualAudioChannels)) {
      audioChannelsMismatch = true;
      mismatchDetails.push(`Canali (file: ${actualAudioChannels}, impostazioni: ${expectedAudioChannels})`);
    }

    const badges = [
      { label: 'Titolo', value: actualTitle, status: resolveRuleStatus(titleOk, titleMismatch) }
    ];
    if (needsYear) {
      badges.push({ label: 'Anno', value: actualYear, status: resolveRuleStatus(yearOk, yearMismatch) });
    }
    if (isSeason || isEpisode) {
      badges.push({ label: 'Stagione', value: actualSeason, status: resolveRuleStatus(seasonOk, seasonMismatch) });
    }
    if (isEpisode) {
      badges.push({ label: 'Episodio', value: actualEpisode, status: resolveRuleStatus(episodeOk, episodeMismatch) });
      badges.push({
        label: 'Titolo episodio',
        value: cleanedActualEpisodeTitle,
        status: resolveRuleStatus(episodeTitleOk, episodeTitleMismatch)
      });
    }
    badges.push({
      label: 'Lingua',
      value: actualLanguages.length ? actualLanguages.join('-') : '',
      status: resolveRuleStatus(languageOk, languageMismatch)
    });
    badges.push({
      label: 'Risoluzione',
      value: actualResolution,
      status: resolveRuleStatus(resolutionOk, resolutionMismatch)
    });
    badges.push({
      label: 'Formato',
      value: actualFormat.value,
      status: resolveRuleStatus(formatOk, formatMismatch)
    });
    if (actualFormat.isWeb === true) {
      badges.push({
        label: 'Servizio',
        value: actualService,
        status: resolveRuleStatus(serviceOk, serviceMismatch)
      });
    } else if (actualFormat.isWeb === false) {
      badges.push({
        label: 'Sorgente',
        value: actualSource,
        status: resolveRuleStatus(sourceOk, sourceMismatch)
      });
    }
    badges.push({
      label: 'VCodec',
      value: actualVideoCodec,
      status: resolveRuleStatus(videoCodecOk, videoCodecMismatch)
    });
    badges.push({
      label: 'ACodec',
      value: actualAudioCodec,
      status: resolveRuleStatus(audioCodecOk, audioCodecMismatch)
    });
    badges.push({
      label: 'Canali',
      value: actualAudioChannels,
      status: resolveRuleStatus(audioChannelsOk, audioChannelsMismatch)
    });

    const hintParts = [];
    if (missing.length) {
      hintParts.push(`Token mancati o non correttamente rilevati nel nome: ${missing.join(', ')}.`);
    }
    if (mismatchDetails.length) {
      hintParts.push(`Campi non allineati alle impostazioni: ${mismatchDetails.join('; ')}.`);
    }
    if (!hintParts.length) {
      hintParts.push('Nome file conforme alle regole principali.');
    }

    return {
      namePath,
      badges,
      hintText: hintParts.join(' ')
    };
  }

  function renderRulesCheckSection({ block, label, path, badges, hint, note }, data, labelText) {
    if (!block || !path || !badges || !hint) {
      return;
    }
    if (!data) {
      block.classList.add('hidden');
      return;
    }
    block.classList.remove('hidden');
    if (label) {
      label.textContent = labelText || label.textContent;
    }
    const displayText = data.displayName || data.namePath || '-';
    path.textContent = displayText;
    if (data.namePath) {
      path.title = data.namePath;
    } else {
      path.removeAttribute('title');
    }
    badges.innerHTML = '';
    for (const badge of data.badges) {
      badges.appendChild(buildWizardRuleBadge(badge.label, badge.value, badge.status));
    }
    hint.textContent = data.hintText || '';
    hint.classList.toggle('hidden', !data.hintText);
    if (note) {
      note.classList.add('hidden');
    }
  }

  function updateWizardRulesCheck(form) {
    if (!ui.wizardRulesFileBadges || !ui.wizardRulesFileHint || !ui.wizardRulesFilePath) {
      return;
    }
    if (!state.targetPath) {
      clearWizardRulesCheck();
      return;
    }

    const settings = loadSettings();
    const isDir = state.kind === 'dir';
    const fileCount = state.videoFiles.length;
    const filePath = state.mainVideo || state.videoFiles[0] || '';

    if (isDir) {
      const folderName = getPathBaseName(state.targetPath);
      const folderData = buildRulesCheckSummary({
        namePath: state.targetPath,
        baseName: folderName,
        form,
        settings,
        typeOverride: form.type.includes('episode') ? 'tv-season' : form.type
      });
      renderRulesCheckSection(
        {
          block: ui.wizardRulesFolderBlock,
          label: ui.wizardRulesFolderLabel,
          path: ui.wizardRulesFolderPath,
          badges: ui.wizardRulesFolderBadges,
          hint: ui.wizardRulesFolderHint
        },
        folderData,
        'Cartella'
      );

      const fileBase = filePath ? stripExtension(getPathBaseName(filePath)) : '';
      const fileData = buildRulesCheckSummary({
        namePath: filePath,
        baseName: fileBase,
        form,
        settings,
        typeOverride: form.type
      });
      if (fileData && filePath) {
        fileData.displayName = getPathBaseName(filePath);
      }
      renderRulesCheckSection(
        {
          block: ui.wizardRulesFileBlock,
          label: ui.wizardRulesFileLabel,
          path: ui.wizardRulesFilePath,
          badges: ui.wizardRulesFileBadges,
          hint: ui.wizardRulesFileHint,
          note: ui.wizardRulesFileNote
        },
        fileData,
        `File (${fileCount || 0})`
      );
      if (ui.wizardRulesFileNote) {
        if (fileCount > 1) {
          ui.wizardRulesFileNote.textContent = 'Verifica basata sul primo file: altri episodi potrebbero differire.';
          ui.wizardRulesFileNote.classList.remove('hidden');
        } else {
          ui.wizardRulesFileNote.textContent = '';
          ui.wizardRulesFileNote.classList.add('hidden');
        }
      }
    } else {
      if (ui.wizardRulesFolderBlock) {
        ui.wizardRulesFolderBlock.classList.add('hidden');
      }
      const namePath = state.mainVideo || state.targetPath;
      const baseName = stripExtension(getPathBaseName(namePath));
      const fileData = buildRulesCheckSummary({
        namePath,
        baseName,
        form,
        settings,
        typeOverride: form.type
      });
      if (fileData) {
        fileData.displayName = getPathBaseName(namePath);
      }
      renderRulesCheckSection(
        {
          block: ui.wizardRulesFileBlock,
          label: ui.wizardRulesFileLabel,
          path: ui.wizardRulesFilePath,
          badges: ui.wizardRulesFileBadges,
          hint: ui.wizardRulesFileHint,
          note: ui.wizardRulesFileNote
        },
        fileData,
        'File'
      );
      if (ui.wizardRulesFileNote) {
        ui.wizardRulesFileNote.textContent = '';
        ui.wizardRulesFileNote.classList.add('hidden');
      }
    }
  }

  return {
    clearWizardRulesCheck,
    updateWizardRulesCheck
  };
}
