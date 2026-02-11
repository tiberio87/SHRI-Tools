import {
  applyFolderRenamePath,
  getParentPath,
  getPathBaseName,
  isSamePath,
  normalizePathValue,
  pad2,
  sanitizeName,
  stripExtension
} from './path-utils.js';

export function createRenameTools(deps) {
  const {
    state,
    ui,
    getFormState,
    guessMetadataFromName,
    parseSeasonEpisodeRange,
    episodeKey,
    setHint,
    languageCodesPattern
  } = deps;

  function computeBaseName(form, overrides = {}) {
    const data = { separatorStyle: 'spaces', ...form, ...overrides };
    const tokens = [];
    const type = data.type;
    const format = data.format;
    const isEpisode = type === 'tv-episode' || type === 'anime-episode';
    const isSeason = type === 'tv-season' || type === 'anime-season';

    if (data.title) {
      tokens.push(data.title);
    }

    if (data.includeYear && data.year) {
      tokens.push(data.year);
    }

    if (isEpisode) {
      if (data.season && data.episode) {
        const episodeEnd = data.episodeEnd ? pad2(data.episodeEnd) : '';
        const episodeToken = episodeEnd
          ? `S${pad2(data.season)}E${pad2(data.episode)}-E${episodeEnd}`
          : `S${pad2(data.season)}E${pad2(data.episode)}`;
        tokens.push(episodeToken);
      } else {
        if (data.season) {
          tokens.push(`S${pad2(data.season)}`);
        }
        if (data.episode) {
          tokens.push(`E${pad2(data.episode)}`);
        }
      }
      if (data.episodeTitle && !data.episodeEnd) {
        tokens.push(data.episodeTitle);
      }
      if (data.part) {
        tokens.push(data.part);
      }
    } else if (isSeason && data.season) {
      tokens.push(`S${pad2(data.season)}`);
    }

    if (format === 'Remux' || format === 'Full Disc') {
      if (data.is3d) {
        tokens.push('3D');
      }
    }

    if (format !== 'Full Disc' && data.languageTag) {
      tokens.push(data.languageTag);
    }

    if (data.edition) {
      tokens.push(data.edition);
    }
    if (data.hybrid) {
      tokens.push('Hybrid');
    }
    if (data.repack) {
      tokens.push(data.repack);
    }
    if (data.resolution) {
      tokens.push(data.resolution);
    }
    if (format === 'Full Disc' && data.region) {
      tokens.push(data.region);
    }
    const uhdFromEncodeBluray = format === 'Encode' &&
      typeof data.source === 'string' &&
      /BLURAY/i.test(data.source) &&
      /2160p/i.test(String(data.resolution || ''));
    const wantsUhd = data.tokenStyle === 'title' ? data.uhd : uhdFromEncodeBluray;
    if (wantsUhd) {
      const sourceHasUhd = typeof data.source === 'string' && /\bUHD\b/i.test(data.source);
      if (!sourceHasUhd) {
        tokens.push('UHD');
      }
    }

    const hdrTokens = data.hdrTokens || [];

    if (format === 'WEB-DL' || format === 'WEBRip') {
      if (data.service) {
        tokens.push(data.service);
      }
      tokens.push(format);
      if (data.audioCodec) {
        tokens.push(data.audioCodec);
      }
      if (data.audioChannels) {
        tokens.push(data.audioChannels);
      }
      if (data.audioMeta) {
        tokens.push(data.audioMeta);
      }
      tokens.push(...hdrTokens);
      if (data.videoCodec) {
        tokens.push(data.videoCodec);
      }
    } else if (format === 'HDTV') {
      tokens.push('HDTV');
      if (data.audioCodec) {
        tokens.push(data.audioCodec);
      }
      if (data.audioChannels) {
        tokens.push(data.audioChannels);
      }
      if (data.audioMeta) {
        tokens.push(data.audioMeta);
      }
      tokens.push(...hdrTokens);
      if (data.videoCodec) {
        const normalizedCodec = data.videoCodec === 'HEVC'
          ? 'H.265'
          : data.videoCodec === 'AVC'
            ? 'H.264'
            : data.videoCodec;
        tokens.push(normalizedCodec);
      }
    } else if (format === 'Encode') {
      if (data.source) {
        tokens.push(data.source === 'DVD' ? 'DVDRip' : data.source);
      }
      if (data.audioCodec) {
        tokens.push(data.audioCodec);
      }
      if (data.audioChannels) {
        tokens.push(data.audioChannels);
      }
      if (data.audioMeta) {
        tokens.push(data.audioMeta);
      }
      tokens.push(...hdrTokens);
      if (data.videoCodec) {
        tokens.push(data.videoCodec);
      }
    } else if (format === 'Remux') {
      if (data.source) {
        tokens.push(data.source);
      }
      tokens.push('REMUX');
      tokens.push(...hdrTokens);
      if (data.videoCodec) {
        tokens.push(data.videoCodec);
      }
      if (data.audioCodec) {
        tokens.push(data.audioCodec);
      }
      if (data.audioChannels) {
        tokens.push(data.audioChannels);
      }
      if (data.audioMeta) {
        tokens.push(data.audioMeta);
      }
    } else if (format === 'Full Disc') {
      if (data.source) {
        tokens.push(data.source);
      }
      tokens.push(...hdrTokens);
      if (data.videoCodec) {
        tokens.push(data.videoCodec);
      }
      if (data.audioCodec) {
        tokens.push(data.audioCodec);
      }
      if (data.audioChannels) {
        tokens.push(data.audioChannels);
      }
      if (data.audioMeta) {
        tokens.push(data.audioMeta);
      }
    }

    if (data.tokenStyle === 'title' && data.subsTag) {
      tokens.push(data.subsTag);
    }

    if (data.tokenStyle !== 'title') {
      for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (!token) {
          continue;
        }
        let updated = String(token);
        updated = updated.replace(/HDR10\+/g, 'HDR10Plus');
        updated = updated.replace(/DD\+/g, 'DDP');
        tokens[i] = updated;
      }
    }

    const tag = data.tag ? data.tag.replace(/^[\-\s]+/, '') : '';
    const allowNoGroupTag = data.allowNoGroupTag === true;
    if (tag && tokens.length && (allowNoGroupTag || tag.toLowerCase() !== 'nogroup')) {
      tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}-${tag}`;
    }

    const joiner = data.separatorStyle === 'dots' ? '.' : ' ';
    const tokensToJoin = tokens
      .filter(Boolean)
      .map((token) => (data.separatorStyle === 'dots' ? token.replace(/\s*-\s*/g, '-') : token));
    let name = tokensToJoin.join(joiner);
    if (data.separatorStyle === 'dots') {
      name = name.replace(/\s+/g, '.').replace(/\.+/g, '.');
    } else {
      name = name.replace(/\s+/g, ' ').trim();
    }

    return sanitizeName(name);
  }

  function getMissingRenameRequirements(form) {
    const missing = [];
    const format = form.format;
    if ((format === 'WEB-DL' || format === 'WEBRip') && !form.service) {
      missing.push(`Servizio mancante per il formato ${format}.`);
    }
    if ((format === 'Encode' || format === 'Remux' || format === 'Full Disc') && !form.source) {
      missing.push(`Sorgente mancante per il formato ${format}.`);
    }
    return missing;
  }

  function buildRenameTargets() {
    if (!state.targetPath) {
      return { folderName: '', baseName: '', fileRenames: [], warnings: [] };
    }

    const warnings = [];
    const form = getFormState();
    const isDir = state.kind === 'dir';
    const isSeason = isDir || form.type.includes('season');
    const seasonType = form.type.includes('anime') ? 'anime-season' : 'tv-season';
    const episodeType = form.type.includes('anime') ? 'anime-episode' : 'tv-episode';
    const useLangFolders = form.languageTagInFolders !== false;
    const useLangFiles = form.languageTagInFiles !== false;
    const isDiscStructure =
      isDir &&
      state.videoFiles.some((filePath) => /[\\\/](BDMV[\\\/]+STREAM|VIDEO_TS)[\\\/]/i.test(filePath || ''));

    const getEpisodeSortInfo = (filePath) => {
      const base = getPathBaseName(filePath);
      const range = parseSeasonEpisodeRange(base);
      const guess = guessMetadataFromName(filePath) || {};
      const season = Number(guess.season || range.season || 0);
      const episode = Number(guess.episode || range.episode || 0);
      const hasSE = season > 0 && episode > 0;
      return { hasSE, season, episode, base };
    };

    const sortedVideoFiles = isDir && !isDiscStructure
      ? [...state.videoFiles].sort((a, b) => {
        const aInfo = getEpisodeSortInfo(a);
        const bInfo = getEpisodeSortInfo(b);
        if (aInfo.hasSE && bInfo.hasSE) {
          if (aInfo.season !== bInfo.season) {
            return aInfo.season - bInfo.season;
          }
          if (aInfo.episode !== bInfo.episode) {
            return aInfo.episode - bInfo.episode;
          }
          return aInfo.base.localeCompare(bInfo.base, undefined, { numeric: true, sensitivity: 'base' });
        }
        if (aInfo.hasSE !== bInfo.hasSE) {
          return aInfo.hasSE ? -1 : 1;
        }
        return aInfo.base.localeCompare(bInfo.base, undefined, { numeric: true, sensitivity: 'base' });
      })
      : state.videoFiles;

    const folderName = isDir
      ? computeBaseName(form, {
          type: seasonType,
          separatorStyle: 'dots',
          languageTag: useLangFolders ? form.languageTag : ''
        })
      : '';

    const fileRenames = [];

    if (isDir) {
      if (!isDiscStructure) {
        const seasonValue = form.season;
        for (const filePath of sortedVideoFiles) {
          const range = parseSeasonEpisodeRange(getPathBaseName(filePath));
          const guess = guessMetadataFromName(filePath);
          const season = guess.season || seasonValue;
          const episode = guess.episode;
          const episodeEnd = form.multiEpisode ? (guess.episodeEnd || range.episodeEnd || '') : '';
          const key = episodeKey(season, episode);
          const episodeTitle = key && state.episodeMap[key] ? state.episodeMap[key] : guess.episodeTitle;
          const baseName = computeBaseName(form, {
            type: episodeType,
            separatorStyle: 'dots',
            season,
            episode,
            episodeEnd,
            episodeTitle: episodeEnd ? '' : (episodeTitle || form.episodeTitle),
            languageTag: useLangFiles ? form.languageTag : ''
          });
          if (!episode || !season) {
            warnings.push(`Stagione/episodio mancante per ${getPathBaseName(filePath)}`);
          }
          fileRenames.push({ path: filePath, baseName });
        }
      }
    } else {
      const episodeEnd = form.multiEpisode && state.mainVideo
        ? (guessMetadataFromName(state.mainVideo)?.episodeEnd || parseSeasonEpisodeRange(getPathBaseName(state.mainVideo)).episodeEnd || '')
        : '';
      let baseName = computeBaseName(form, {
        separatorStyle: 'dots',
        episodeEnd,
        languageTag: useLangFiles ? form.languageTag : ''
      });
      if (form.type === 'tv-episode' || form.type === 'anime-episode') {
        const key = episodeKey(form.season, form.episode);
        const mappedTitle = key && state.episodeMap[key] ? state.episodeMap[key] : '';
        if (mappedTitle && !episodeEnd) {
          baseName = computeBaseName(form, {
            separatorStyle: 'dots',
            episodeEnd,
            episodeTitle: mappedTitle,
            languageTag: useLangFiles ? form.languageTag : ''
          });
        } else if (!form.episodeTitle && !episodeEnd) {
          const guess = state.mainVideo ? guessMetadataFromName(state.mainVideo) : null;
          if (guess?.episodeTitle) {
            baseName = computeBaseName(form, {
              separatorStyle: 'dots',
              episodeEnd,
              episodeTitle: guess.episodeTitle,
              languageTag: useLangFiles ? form.languageTag : ''
            });
          }
        }
      }
      const targetFile = state.mainVideo || state.targetPath;
      fileRenames.push({ path: targetFile, baseName });
    }

    const previewBase = fileRenames[0]?.baseName || '';
    return { folderName, baseName: previewBase, fileRenames, warnings };
  }

  function applyRenameResults(result, payload) {
    if (!result || !Array.isArray(result.results) || !result.results.length) {
      return;
    }

    const okResults = result.results.filter((item) => item && item.ok);
    if (!okResults.length) {
      return;
    }

    const fileMap = new Map();
    for (const item of okResults) {
      fileMap.set(normalizePathValue(item.from).toLowerCase(), item.to);
    }

    const expectedFolderFrom = payload?.renameFolder
      ? (state.kind === 'dir' ? state.targetPath : getParentPath(state.targetPath))
      : '';
    const folderResult = expectedFolderFrom
      ? okResults.find((item) => isSamePath(item.from, expectedFolderFrom))
      : null;
    const folderFrom = folderResult?.from || '';
    const folderTo = folderResult?.to || '';

    const applyFileRename = (value) => {
      if (!value) {
        return value;
      }
      const mapped = fileMap.get(normalizePathValue(value).toLowerCase());
      return mapped || value;
    };

    const applyAllRenames = (value) => {
      let updated = applyFileRename(value);
      if (folderTo && folderFrom) {
        updated = applyFolderRenamePath(updated, folderFrom, folderTo);
      }
      return updated;
    };

    if (state.kind === 'dir' && folderTo) {
      state.targetPath = folderTo;
    } else {
      state.targetPath = applyAllRenames(state.targetPath);
    }

    state.mainVideo = applyAllRenames(state.mainVideo);
    state.videoFiles = state.videoFiles.map((pathValue) => applyAllRenames(pathValue));

    if (state.mainVideo) {
      const lastDot = state.mainVideo.lastIndexOf('.');
      state.mainExtension = lastDot !== -1 ? state.mainVideo.slice(lastDot) : '';
    }

    if (state.targetPath) {
      ui.selectedPath.textContent = state.targetPath;
    }
    if (state.mainVideo) {
      setHint(ui.scanHint, `File analizzato: ${state.mainVideo}`);
    }
  }

  function getTorrentNameSuggestion() {
    const { folderName, baseName } = buildRenameTargets();
    const formatLanguageSeparators = (value) => {
      if (!value || !languageCodesPattern) {
        return value;
      }
      const pattern = new RegExp(`\\b(${languageCodesPattern})-(${languageCodesPattern})\\b`, 'g');
      return value.replace(pattern, '$1.-.$2');
    };
    if (state.kind === 'dir') {
      return formatLanguageSeparators(folderName || getPathBaseName(state.targetPath));
    }
    if (baseName) {
      return formatLanguageSeparators(baseName);
    }
    const targetFile = state.mainVideo || state.targetPath;
    return formatLanguageSeparators(stripExtension(getPathBaseName(targetFile)));
  }

  function buildTorrentWarnings() {
    const warnings = [];
    const { folderName, fileRenames } = buildRenameTargets();
    if (state.kind === 'dir') {
      const currentFolder = getPathBaseName(state.targetPath);
      if (folderName && folderName !== currentFolder) {
        warnings.push(`Cartella non conforme: ${currentFolder} → ${folderName}`);
      }
    }

    const mismatches = fileRenames.filter((item) => {
      if (!item?.path || !item?.baseName) {
        return false;
      }
      const current = stripExtension(getPathBaseName(item.path));
      return item.baseName !== current;
    });

    if (mismatches.length) {
      const sample = mismatches[0];
      const current = stripExtension(getPathBaseName(sample.path));
      warnings.push(
        `${mismatches.length} file non conformi alle rules (es. ${current} → ${sample.baseName}).`
      );
    }
    return warnings;
  }

  return {
    applyRenameResults,
    buildRenameTargets,
    buildTorrentWarnings,
    computeBaseName,
    getMissingRenameRequirements,
    getTorrentNameSuggestion
  };
}
