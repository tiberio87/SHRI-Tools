import { ui } from './dom.js';
import { state } from './state.js';
import { UNIT3D_CATEGORY_ID, SHRI_TYPE_ID, UNIT3D_RESOLUTION_ID } from './constants.js';
import { renderBbcodePreview } from './bbcode.js';
import {
  formatBitrate,
  formatBytes,
  formatDuration,
  formatLangName,
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

export function createUploadKit(deps) {
  const {
    buildMediaInfoShort,
    computeBaseName,
    copyToClipboard,
    getFormState,
    getMissingRenameRequirements,
    getPathBaseName,
    loadSettings,
    logDebug,
    openWizardStep,
    openConfirmModal,
    setHint,
    showToast,
    updateFfmpegHint
  } = deps;

  let uploadMiMode = 'short';
  let uploadMiShortCache = '';
  let uploadMiFullCache = '';
  let uploadIdsText = '';
  let screensProgressUnsub = null;
  let screensProgressRequestId = '';
  let uploadTitleOverride = '';
  let uploadTitleBase = '';
  let uploadTitleFallback = false;
  let uploadTitleSourcePath = '';

  function getHdrLabelFromForm(form) {
    const tokens = [];
    if (form.dv) {
      tokens.push('DV');
    }
    if (form.hdr10plus) {
      tokens.push('HDR10+');
    }
    if (form.hdr) {
      tokens.push('HDR');
    }
    return tokens.join(' ');
  }

  function buildUploadInfoLine(form) {
    const parts = [];
    if (form.resolution) {
      parts.push(form.resolution);
    }
    if (form.format === 'WEB-DL' || form.format === 'WEBRip') {
      if (form.service) {
        parts.push(form.service);
      }
      parts.push(form.format);
    } else if (form.source) {
      parts.push(form.source);
    }

    const videoCodec = String(form.videoCodec || '');
    if (videoCodec) {
      const upper = videoCodec.toUpperCase();
      if (upper.includes('HEVC') || upper.includes('H.265')) {
        parts.push('x265');
      } else if (upper.includes('AVC') || upper.includes('H.264')) {
        parts.push('x264');
      } else {
        parts.push(videoCodec);
      }
    }

    const hdrLabel = getHdrLabelFromForm(form);
    if (hdrLabel) {
      parts.push(hdrLabel);
    }

    const audioParts = [];
    if (form.audioCodec) {
      audioParts.push(form.audioCodec);
    }
    if (form.audioChannels) {
      audioParts.push(form.audioChannels);
    }
    if (form.audioMeta) {
      audioParts.push(form.audioMeta);
    }
    if (audioParts.length) {
      parts.push(audioParts.join(' '));
    }

    if (form.languageTag) {
      parts.push(form.languageTag);
    }

    return parts.filter(Boolean).join(' ');
  }

  function buildUploadTitleBase() {
    const baseForm = getFormState();
    const metaTitle = state.metadata?.title ? String(state.metadata.title).trim() : '';
    const title = metaTitle || baseForm.title;
    const fallback = !metaTitle && Boolean(baseForm.title);
    const form = { ...baseForm, title };
    const isDir = state.kind === 'dir';
    const seasonType = baseForm.type.includes('anime') ? 'anime-season' : 'tv-season';
    const type = isDir ? seasonType : baseForm.type;
    const dropEpisodeTitle = type === 'tv-episode' || type === 'anime-episode';
    const baseName = computeBaseName(form, {
      type,
      separatorStyle: 'spaces',
      episodeTitle: dropEpisodeTitle ? '' : form.episodeTitle
    });
    return { title: baseName, fallback };
  }

  function buildUploadTitle() {
    const { title, fallback } = buildUploadTitleBase();
    const baseTitle = title || '';
    const overridden = Boolean(uploadTitleOverride);
    return {
      title: overridden ? uploadTitleOverride : baseTitle,
      baseTitle,
      fallback,
      overridden
    };
  }

  function updateUploadTitleHint() {
    if (!ui.uploadTitleHint) {
      return;
    }
    if (uploadTitleOverride) {
      ui.uploadTitleHint.textContent = 'Titolo modificato manualmente.';
      return;
    }
    ui.uploadTitleHint.textContent = uploadTitleFallback
      ? 'Titolo API non disponibile: uso fallback dal file.'
      : '';
  }

  function syncUploadTitleOverride(value) {
    const nextValue = String(value || '').trim();
    if (!nextValue || nextValue === uploadTitleBase) {
      uploadTitleOverride = '';
      if (ui.uploadTitleInput) {
        ui.uploadTitleInput.value = uploadTitleBase || '-';
      }
    } else {
      uploadTitleOverride = nextValue;
    }
    updateUploadTitleHint();
  }

  function normalizeIdValue(value) {
    if (value === undefined || value === null || value === '') {
      return '0';
    }
    return String(value);
  }

  function normalizeIntValue(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = Number.parseInt(String(value).trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
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

  function getUploadMapping(form, settings) {
    const resolvedSettings = settings || loadSettings();
    const isTv = form.type.includes('tv') || form.type.includes('anime');
    const categoryKey = isTv ? 'TV' : 'MOVIE';
    const categoryOverrides = parseOverrideMap(
      resolvedSettings.unit3dCategoryOverrides,
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
      resolvedSettings.unit3dTypeOverrides,
      (key) => key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    );
    const typeMap = { ...SHRI_TYPE_ID, ...typeOverrides };
    const typeId = typeKey ? typeMap[typeKey] : '';
    const resolutionOverrides = parseOverrideMap(
      resolvedSettings.unit3dResolutionOverrides,
      (key) => key.trim().toLowerCase()
    );
    const resolutionMap = { ...UNIT3D_RESOLUTION_ID, ...resolutionOverrides };
    const resolutionId = form.resolution ? resolutionMap[form.resolution] || '' : '';
    const isSd = ['480p', '480i', '576p', '576i'].includes(form.resolution);
    return {
      isTv,
      categoryKey,
      categoryId,
      typeKey,
      typeId,
      resolutionId,
      isSd
    };
  }

  function buildUploadIds() {
    const form = getFormState();
    const settings = loadSettings();
    const mapping = getUploadMapping(form, settings);

    const parts = [];
    if (state.metadata?.tmdbId && state.metadata.tmdbType) {
      parts.push({
        label: 'TMDB',
        value: state.metadata.tmdbId,
        link: `https://www.themoviedb.org/${state.metadata.tmdbType}/${state.metadata.tmdbId}`
      });
    }
    if (state.metadata?.imdbId) {
      parts.push({
        label: 'IMDb',
        value: state.metadata.imdbId,
        link: `https://www.imdb.com/title/${state.metadata.imdbId}/`
      });
    }
    if (state.metadata?.tvdbSeriesId) {
      const slug = state.metadata.tvdbSeriesSlug;
      const link = slug
        ? `https://thetvdb.com/series/${slug}`
        : `https://thetvdb.com/?tab=series&id=${state.metadata.tvdbSeriesId}`;
      parts.push({
        label: 'TVDB',
        value: state.metadata.tvdbSeriesId,
        link
      });
    }
    return parts;
  }

  function buildScreensGridBbcode() {
    if (!state.screenshots.length) {
      return '[center]Nessuno screenshot disponibile[/center]';
    }
    const items = state.screenshots
      .filter((shot) => shot.ok && shot.displayUrl)
      .map((shot) => {
        if (shot.viewerUrl) {
          return `[url=${shot.viewerUrl}][img=350]${shot.displayUrl}[/img][/url]`;
        }
        return `[img=350]${shot.displayUrl}[/img]`;
      })
      .slice(0, 6);
    if (!items.length) {
      return '[center]Nessuno screenshot disponibile[/center]';
    }
    const rows = [];
    for (let index = 0; index < items.length; index += 2) {
      const row = items.slice(index, index + 2).join(' ');
      rows.push(`[center]${row}[/center]`);
    }
    let grid = rows.join('\n').trim();
    if (state.screenshotsMeta?.tonemapped) {
      grid = `${grid}\n[center][i]Screenshot tonemappati (HDR -> SDR).[/i][/center]`;
    }
    return grid;
  }

  function buildSyntheticMediaInfo() {
    if (!state.mediaInfo) {
      return null;
    }
    const general = getGeneralTrack(state.mediaInfo) || {};
    const video = getVideoTrack(state.mediaInfo) || {};
    const audioTracks = getAudioTracks(state.mediaInfo);
    const textTracks = (state.mediaInfo?.media?.track || []).filter((track) => track['@type'] === 'Text');

    const bestItalian = audioTracks.filter((track) => normalizeLangTag(getTrackLang(track)) === 'ITA');
    const audioCandidates = bestItalian.length ? bestItalian : audioTracks;
    const bestAudio = audioCandidates.reduce((best, track) => {
      if (!best) {
        return track;
      }
      return scoreAudioTrack(track) > scoreAudioTrack(best) ? track : best;
    }, null);

    const fileName = state.mainVideo ? getPathBaseName(state.mainVideo) : '';
    const fileSizeRaw = getTrackValue(general, ['FileSize_String', 'FileSize/String', 'FileSize']);
    const fileSize = Number.isFinite(Number(fileSizeRaw)) ? formatBytes(fileSizeRaw) : fileSizeRaw;
    const durationRaw = getTrackValue(general, ['Duration/String3', 'Duration/String2', 'Duration/String', 'Duration']);
    const duration = Number.isFinite(Number(durationRaw)) ? formatDuration(durationRaw) : durationRaw;
    const totalBitrateRaw = getTrackValue(general, ['OverallBitRate/String', 'OverallBitRate', 'OverallBitRate_String']);
    const totalBitrate = Number.isFinite(Number(totalBitrateRaw)) ? formatBitrate(totalBitrateRaw) : totalBitrateRaw;
    const chapters = getTrackValue(general, ['MenuCount', 'Menu_Count', 'CountOfElements', 'Chapters']) || 'N/A';

    const videoFormat = getTrackValue(video, ['Format', 'Format_String', 'Format/Info']);
    const videoCodec = mapVideoCodec(video, ui.formatSelect.value);
    const bitDepth = getTrackValue(video, ['BitDepth', 'Bit_depth']);
    const videoBitrateRaw = getTrackValue(video, ['BitRate/String', 'BitRate', 'BitRate_Maximum']);
    const videoBitrate = Number.isFinite(Number(videoBitrateRaw)) ? formatBitrate(videoBitrateRaw) : videoBitrateRaw;
    const width = getTrackValue(video, ['Width']);
    const height = getTrackValue(video, ['Height']);
    const resolution = width && height ? `${width}x${height}` : '';
    const aspect = getTrackValue(video, ['DisplayAspectRatio/String', 'DisplayAspectRatio']);

    const audioFormat = bestAudio ? mapAudioCodec(bestAudio) : '';
    const audioName = bestAudio ? getTrackValue(bestAudio, ['Title', 'CommercialName', 'Format']) : '';
    const audioChannels = bestAudio ? parseChannels(bestAudio.Channels || bestAudio['Channel(s)'] || '') : '';
    const audioBitrateRaw = bestAudio ? getTrackValue(bestAudio, ['BitRate/String', 'BitRate']) : '';
    const audioBitrate = Number.isFinite(Number(audioBitrateRaw)) ? formatBitrate(audioBitrateRaw) : audioBitrateRaw;
    const audioLang = bestAudio ? formatLangName(getTrackLang(bestAudio)) : '';

    const subLangs = textTracks
      .map((track) => formatLangName(getTrackLang(track)))
      .filter(Boolean);
    const subs = subLangs.length ? [...new Set(subLangs)].join(', ') : 'Nessuno';

    return {
      fn: fileName,
      size: fileSize,
      dur: duration,
      totalBr: totalBitrate,
      chap: chapters,
      vidFormat: videoFormat || videoCodec,
      codec: videoCodec || videoFormat,
      depth: bitDepth ? `${bitDepth} bit` : '',
      vidBr: videoBitrate,
      res: resolution,
      asp: aspect,
      audFormat: audioFormat,
      audName: audioName,
      ch: audioChannels,
      audBr: audioBitrate,
      lang: audioLang,
      subs
    };
  }

  function buildLinksSection(form) {
    const imdbId = state.metadata?.imdbId || '';
    const tmdbId = state.metadata?.tmdbId || '';
    if (!imdbId && !tmdbId) {
      return '';
    }
    const type = state.metadata?.tmdbType || (form.type.startsWith('tv') || form.type.startsWith('anime') ? 'tv' : 'movie');
    const imdbSlug = imdbId ? (imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`) : '';
    let lines = '[size=13][b][color=#e8024b][ LINKS ][/color][/b][/size]\n';
    if (imdbSlug) {
      lines += `[size=11][color=#FFFFFF]IMDb: https://www.imdb.com/title/${imdbSlug}/[/color][/size]\n`;
    }
    if (tmdbId) {
      lines += `[size=11][color=#FFFFFF]TMDb: https://www.themoviedb.org/${type}/${tmdbId}[/color][/size]\n`;
    }
    return lines;
  }

  function buildReleaseNotesSection(form) {
    const tag = (form.tag || '').replace(/^-/, '').trim();
    const tonemapNote = state.screenshotsMeta?.tonemapped
      ? 'Screenshot tonemappati (HDR -> SDR).'
      : '';
    const manualNotes = ui.uploadReleaseNotesInput?.value.trim();
    const isIsland = tag.toLowerCase() === 'island';
    const baseNotes = manualNotes || (isIsland
      ? 'Questa e una release interna pubblicata in esclusiva su ShareIsland.\nSi prega di non ricaricare questa release su tracker pubblici o privati. Si prega di mantenerla in seed il piu a lungo possibile. Grazie!'
      : 'Nulla da aggiungere.');
    const notes = tonemapNote ? `${baseNotes}\n${tonemapNote}` : baseNotes;
    return `[size=13][b][color=#e8024b][ RELEASE NOTES ][/color][/b][/size]\n[size=11][color=#FFFFFF]${notes}[/color][/size]`;
  }

  function buildShoutouts(form) {
    const tag = (form.tag || '').replace(/^-/, '').trim();
    if (tag) {
      return `SHOUTOUTS : ${tag}`;
    }
    const shouts = [
      'The Scene never dies',
      'Seed or walk the plank!',
      'Released by Nobody - claimed by Everybody',
      'From the depths of the digital seas'
    ];
    return `SHOUTOUTS : ${shouts[Math.floor(Math.random() * shouts.length)]}`;
  }

  function buildCategoryHeader(form) {
    if (form.type.startsWith('tv') || form.type.startsWith('anime')) {
      return form.type.includes('season')
        ? '[ SERIE TV (STAGIONE) ]'
        : '[ SERIE TV (EPISODIO) ]';
    }
    return '[ FILM ]';
  }

  function buildUploadDescription(form) {
    const title = state.metadata?.title || form.title || 'Unknown';
    const rawSummary = state.metadata?.tmdbOverview || '';
    const summary = rawSummary.trim()
      ? rawSummary.replace(/\s+/g, ' ')
      : 'Riassunto non disponibile.';
    const infoLine = buildUploadInfoLine(form);
    const screens = buildScreensGridBbcode();
    const logoUrl = state.metadata?.tmdbLogoUrl || '';
    const logoSection = logoUrl ? `[center][img=250]${logoUrl}[/img][/center]\n` : '';
    const linksSection = buildLinksSection(form);
    const releaseNotesSection = buildReleaseNotesSection(form);
    const shoutouts = buildShoutouts(form);
    const categoryHeader = buildCategoryHeader(form);

    const synthetic = buildSyntheticMediaInfo();
    const mediainfoSection = synthetic
      ? `[code][size=13][b][color=#da8d49]MEDIAINFO SINTENTICO[/color][/b][/size]
[size=11][color=#FFFFFF]Nome File       : ${synthetic.fn}[/color][/size]
[size=11][color=#FFFFFF]Dimensioni File : ${synthetic.size}[/color][/size]
[size=11][color=#FFFFFF]Durata          : ${synthetic.dur}[/color][/size]
[size=11][color=#FFFFFF]Bitrate Totale  : ${synthetic.totalBr}[/color][/size]
[size=11][color=#FFFFFF]Capitoli        : ${synthetic.chap}[/color][/size]

[size=13][b][color=#da8d49]VIDEO[/color][/b][/size]
[size=11][color=#FFFFFF]Formato         : ${synthetic.vidFormat}[/color][/size]
[size=11][color=#FFFFFF]Compressore     : ${synthetic.codec}[/color][/size]
[size=11][color=#FFFFFF]Profondita Bit  : ${synthetic.depth}[/color][/size]
[size=11][color=#FFFFFF]Bitrate         : ${synthetic.vidBr}[/color][/size]
[size=11][color=#FFFFFF]Risoluzione     : ${synthetic.res}[/color][/size]
[size=11][color=#FFFFFF]Rapporto        : ${synthetic.asp}[/color][/size]

[size=13][b][color=#da8d49]AUDIO[/color][/b][/size]
[size=11][color=#FFFFFF]Formato         : ${synthetic.audFormat}[/color][/size]
[size=11][color=#FFFFFF]Nome            : ${synthetic.audName}[/color][/size]
[size=11][color=#FFFFFF]Canali          : ${synthetic.ch}[/color][/size]
[size=11][color=#FFFFFF]Bitrate         : ${synthetic.audBr}[/color][/size]
[size=11][color=#FFFFFF]Lingua          : ${synthetic.lang}[/color][/size]

[size=13][b][color=#da8d49]SOTTOTITOLI[/color][/b][/size]
[size=11][color=#FFFFFF]${synthetic.subs}[/color][/size][/code]`
      : '';

    const infoBlock = infoLine
      ? `[center][size=13][color=#ffffff]${infoLine}[/color][/size][/center]`
      : '';
    const summaryBlock = `[center][size=13][b][color=#e8024b][ RIASSUNTO ][/color][/b][/size][/center]
[center][size=13]${summary}[/size][/center]`;
    const screensBlock = `[center][size=13][b][color=#e8024b][ SCREENSHOT ][/color][/b][/size][/center]
${screens}`;
    const extras = [
      linksSection,
      releaseNotesSection,
      `[size=13][b][color=#e8024b][ SHOUTOUTS ][/color][/b][/size]\n[size=11][color=#FFFFFF]${shoutouts}[/color][/size]`
    ]
      .filter(Boolean)
      .join('\n\n');
    const extrasBlock = extras ? `[center]\n${extras}\n[/center]` : '';
    const downloadBlock = '[size=13][color=#0592a3][size=16][b][center]BUON DOWNLOAD![/center][/b][/size][/color][/size]';

    return `${logoSection}[center][size=13][b][color=#e8024b]${categoryHeader}[/color][/b][/size][/center]
[center][size=13][b][color=#ffffff]${title}[/color][/b][/size][/center]
${infoBlock}

${summaryBlock}

${screensBlock}
${extrasBlock}

${mediainfoSection}

${downloadBlock}

[right][size=8]Generated by SHRI-Tools[/size][/right]`;
  }

  function buildUploadWarnings(form, settings) {
    const warnings = [];
    const mapping = getUploadMapping(form, settings);
    if (!state.metadata?.title) {
      warnings.push('Titolo non trovato via API: uso fallback dal file.');
    }
    if (!state.metadata?.tmdbId) {
      warnings.push('TMDB ID mancante (richiesto per upload).');
    }
    if (form.type.includes('tv') && !form.season) {
      warnings.push('Stagione mancante per contenuto TV.');
    }
    if (form.type.includes('episode') && !form.episode) {
      warnings.push('Episodio mancante per contenuto TV.');
    }
    if (!form.resolution) {
      warnings.push('Risoluzione mancante.');
    } else if (!mapping.resolutionId) {
      warnings.push('Risoluzione non mappata per UNIT3D.');
    }
    if (!mapping.categoryId) {
      warnings.push('Category ID non disponibile per UNIT3D.');
    }
    if (!mapping.typeId) {
      warnings.push('Type ID non disponibile per UNIT3D.');
    }
    warnings.push(...getMissingRenameRequirements(form));

    if (!settings.ffmpegPath) {
      warnings.push('FFmpeg non configurato: screenshots non disponibili.');
    }
    if (!settings.imgbbKey && !settings.ptscreensKey) {
      warnings.push('API key immagini mancanti (imgBB/PTScreens).');
    } else {
      if (settings.imageHostPrimary === 'imgbb' && !settings.imgbbKey) {
        warnings.push('Host immagini preferito: chiave imgBB mancante.');
      }
      if (settings.imageHostPrimary === 'ptscreens' && !settings.ptscreensKey) {
        warnings.push('Host immagini preferito: chiave PTScreens mancante.');
      }
    }
    return warnings;
  }

  async function ensureUploadMiFullCache() {
    if (!state.mainVideo) {
      return '';
    }
    if (uploadMiFullCache && uploadMiFullCache !== 'Caricamento...') {
      return uploadMiFullCache;
    }
    uploadMiFullCache = 'Caricamento...';
    if (ui.uploadMiText && uploadMiMode === 'full') {
      ui.uploadMiText.textContent = uploadMiFullCache;
    }
    const result = await window.api.getMediaInfoText(state.mainVideo);
    uploadMiFullCache = result?.text || result?.error || 'Nessun output disponibile.';
    if (ui.uploadMiText && uploadMiMode === 'full') {
      ui.uploadMiText.textContent = uploadMiFullCache;
    }
    return uploadMiFullCache;
  }

  function buildUploadSummary(form, settings) {
    const mapping = getUploadMapping(form, settings);
    const { title } = buildUploadTitle();
    const tmdb = state.metadata?.tmdbId ? `TMDB ${state.metadata.tmdbId}` : 'TMDB -';
    const imdb = state.metadata?.imdbId ? `IMDb ${state.metadata.imdbId}` : 'IMDb -';
    const tvdb = state.metadata?.tvdbSeriesId ? `TVDB ${state.metadata.tvdbSeriesId}` : 'TVDB -';
    const flags = [
      settings.unit3dAnonymous ? 'Anonimo' : null,
      settings.unit3dPersonalRelease ? 'Personal' : null,
      settings.unit3dModQueue ? 'Mod Queue' : null
    ].filter(Boolean);
    const torrentLabel = state.lastTorrentPath ? state.lastTorrentPath : 'Nessun .torrent';
    return [
      `Titolo: ${title || '-'}`,
      `Categoria: ${mapping.categoryKey || '-'}`,
      `Tipo: ${mapping.typeKey || '-'}`,
      `Risoluzione: ${form.resolution || '-'}`,
      `ID: ${[tmdb, imdb, tvdb].join(' | ')}`,
      `Flags: ${flags.length ? flags.join(', ') : 'Nessuno'}`,
      `Torrent: ${torrentLabel}`
    ].join('\n');
  }

  async function buildUnit3dPayload(form, settings) {
    const mapping = getUploadMapping(form, settings);
    const { title } = buildUploadTitle();
    const description = buildUploadDescription(form);
    const mediainfo = await ensureUploadMiFullCache();
    const tmdb = normalizeIdValue(state.metadata?.tmdbId || state.metadata?.tmdb);
    const imdb = normalizeIdValue(state.metadata?.imdbId || state.metadata?.imdb);
    const tvdb = normalizeIdValue(state.metadata?.tvdbSeriesId || state.metadata?.tvdbId);
    const seasonNumber = mapping.isTv ? normalizeIntValue(form.season) : null;
    const episodeNumber = mapping.isTv ? normalizeIntValue(form.episode) : null;
    const categoryId = normalizeIntValue(mapping.categoryId);
    const typeId = normalizeIntValue(mapping.typeId);
    const resolutionId = normalizeIntValue(mapping.resolutionId);

    const payload = {
      name: title || '',
      description,
      mediainfo,
      bdinfo: '',
      tmdb,
      imdb,
      tvdb,
      anonymous: settings.unit3dAnonymous ? '1' : '0',
      personal_release: settings.unit3dPersonalRelease ? '1' : '0',
      mod_queue_opt_in: settings.unit3dModQueue ? '1' : '0',
      stream: '0',
      sd: mapping.isSd ? '1' : '0',
      keywords: '',
      internal: '0',
      featured: '0',
      free: '0',
      doubleup: '0',
      sticky: '0'
    };
    if (categoryId !== null) {
      payload.category_id = categoryId;
    }
    if (typeId !== null) {
      payload.type_id = typeId;
    }
    if (resolutionId !== null) {
      payload.resolution_id = resolutionId;
    }
    if (seasonNumber !== null) {
      payload.season_number = seasonNumber;
    }
    if (episodeNumber !== null) {
      payload.episode_number = episodeNumber;
    }
    return payload;
  }

  async function submitUnit3dUpload() {
    if (!state.lastTorrentPath) {
      showToast('Genera prima il .torrent.');
      return;
    }
    const settings = loadSettings();
    const baseUrl = settings.unit3dBaseUrl || '';
    const apiKey = settings.unit3dApiKey || '';
    if (!baseUrl || !apiKey) {
      showToast('Imposta Base URL e API key UNIT3D nelle impostazioni.');
      return;
    }
    if (!window.api?.unit3dUpload) {
      showToast('Upload UNIT3D non disponibile.');
      return;
    }
    const form = getFormState();
    const summary = buildUploadSummary(form, settings);
    const confirmed = await openConfirmModal(
      `Confermi l'upload con questi dati?\n\n${summary}`
    );
    if (!confirmed) {
      return;
    }
    if (ui.uploadToUnit3dBtn) {
      ui.uploadToUnit3dBtn.disabled = true;
    }
    try {
      const data = await buildUnit3dPayload(form, settings);
      logDebug?.('unit3d upload payload', {
        category_id: data.category_id,
        type_id: data.type_id,
        resolution_id: data.resolution_id,
        season_number: data.season_number,
        episode_number: data.episode_number,
        tmdb: data.tmdb,
        imdb: data.imdb,
        tvdb: data.tvdb,
        anonymous: data.anonymous,
        personal_release: data.personal_release,
        mod_queue_opt_in: data.mod_queue_opt_in,
        sd: data.sd
      });
      setHint(ui.uploadTitleHint, 'Upload in corso...');
      const result = await window.api.unit3dUpload({
        baseUrl,
        apiKey,
        torrentPath: state.lastTorrentPath,
        data
      });
      logDebug?.('unit3d upload response', {
        ok: result?.ok,
        error: result?.error || '',
        details: result?.details || '',
        status: result?.status || '',
        raw: result?.raw ? String(result.raw).slice(0, 2000) : ''
      });
      if (result?.ok) {
        showToast(result?.message || 'Upload completato.');
        setHint(ui.uploadTitleHint, 'Upload completato.');
      } else {
        const error = result?.error || result?.message || 'Errore upload.';
        const details = result?.details ? `\n${result.details}` : '';
        const followup = result?.details || result?.raw ? '' : '\nApri il log per dettagli.';
        showToast(error);
        setHint(ui.uploadTitleHint, `${error}${details}${followup}`);
      }
    } finally {
      if (ui.uploadToUnit3dBtn) {
        ui.uploadToUnit3dBtn.disabled = false;
      }
    }
  }

  function renderUploadIds(list) {
    if (!ui.uploadIdsList) {
      return;
    }
    ui.uploadIdsList.innerHTML = '';
    if (!list.length) {
      ui.uploadIdsList.textContent = 'Nessun ID rilevato.';
      return;
    }
    list.forEach((item) => {
      const badge = document.createElement(item.link ? 'button' : 'span');
      badge.className = `upload-id-badge${item.link ? ' clickable' : ''}`;
      if (item.link) {
        badge.type = 'button';
        badge.addEventListener('click', () => {
          copyToClipboard(item.value, `${item.label} copiato.`);
        });
      }
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = item.label;
      const value = document.createElement('span');
      value.textContent = item.value;
      badge.appendChild(label);
      badge.appendChild(value);
      ui.uploadIdsList.appendChild(badge);
    });
  }

  function renderUploadWarnings(list) {
    if (!ui.uploadWarnings) {
      return;
    }
    ui.uploadWarnings.innerHTML = '';
    if (!list.length) {
      const ok = document.createElement('div');
      ok.className = 'plan-item empty success';
      ok.textContent = 'Nessun warning.';
      ui.uploadWarnings.appendChild(ok);
      return;
    }
    list.forEach((warning) => {
      const item = document.createElement('div');
      item.className = 'warning-item';
      item.textContent = warning;
      ui.uploadWarnings.appendChild(item);
    });
  }

  function renderScreensList() {
    if (!ui.screensList) {
      return;
    }
    ui.screensList.innerHTML = '';
    if (!state.screenshots.length) {
      ui.screensList.textContent = 'Nessuno screenshot generato.';
      return;
    }
    state.screenshots.forEach((shot, index) => {
      const row = document.createElement('div');
      row.className = `screens-item ${shot.ok ? 'ok' : 'error'}`;
      const label = document.createElement('div');
      label.textContent = shot.ok ? `Screenshot ${index + 1}` : `Screenshot ${index + 1} (errore)`;
      const status = document.createElement('div');
      status.className = 'status';
      status.textContent = shot.ok ? shot.host.toUpperCase() : 'Errore';
      const url = document.createElement('div');
      url.className = 'screens-url';
      url.textContent = shot.ok ? (shot.displayUrl || '') : (shot.error || '');
      row.appendChild(label);
      row.appendChild(url);
      row.appendChild(status);
      if (shot.ok && shot.viewerUrl) {
        row.setAttribute('data-external', shot.viewerUrl);
        row.classList.add('fetch-link');
      }
      ui.screensList.appendChild(row);
    });
  }

  function buildScreensBbcode() {
    return buildScreensGridBbcode();
  }

  function setUploadKitCollapsed(sectionId, collapsed) {
    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }
    section.classList.toggle('collapsed', collapsed);
    section.setAttribute('aria-expanded', String(!collapsed));
  }

  function resetScreensProgress() {
    if (ui.screensProgressRow) {
      ui.screensProgressRow.classList.add('hidden');
    }
    if (ui.screensProgressFill) {
      ui.screensProgressFill.style.width = '0%';
    }
    if (ui.screensProgressText) {
      ui.screensProgressText.textContent = '0%';
    }
    if (ui.screensProgressStage) {
      ui.screensProgressStage.classList.add('hidden');
      ui.screensProgressStage.classList.remove('done');
    }
    if (ui.screensProgressStageText) {
      ui.screensProgressStageText.textContent = 'Preparazione...';
    }
  }

  function setScreensProgress(value) {
    if (!ui.screensProgressRow || !ui.screensProgressFill || !ui.screensProgressText) {
      return;
    }
    const progress = Math.max(0, Math.min(1, Number(value) || 0));
    ui.screensProgressRow.classList.remove('hidden');
    ui.screensProgressFill.style.width = `${Math.round(progress * 100)}%`;
    ui.screensProgressText.textContent = `${Math.round(progress * 100)}%`;
  }

  function setScreensStage(stage, payload = {}) {
    if (!ui.screensProgressStage || !ui.screensProgressStageText) {
      return;
    }
    ui.screensProgressStage.classList.remove('hidden');
    ui.screensProgressStage.classList.remove('done');
    let text = 'Preparazione...';
    if (stage === 'extract') {
      text = `Estrazione frame ${payload.current || 0}/${payload.total || 0}`;
    } else if (stage === 'upload') {
      text = `Upload ${payload.current || 0}/${payload.total || 0}`;
    } else if (stage === 'done') {
      text = 'Completato';
      ui.screensProgressStage.classList.add('done');
    } else if (stage === 'error') {
      text = payload.error ? `Errore: ${payload.error}` : 'Errore durante la generazione.';
    } else if (stage === 'start') {
      text = 'Preparazione...';
    }
    ui.screensProgressStageText.textContent = text;
  }

  async function prepareUploadKitStep() {
    if (!state.targetPath) {
      setHint(ui.renameHint, 'Seleziona un file o una cartella.');
      return;
    }
    const settings = loadSettings();
    const form = getFormState();
    if (state.targetPath !== uploadTitleSourcePath) {
      uploadTitleOverride = '';
      uploadTitleSourcePath = state.targetPath;
    }
    const { title, fallback, baseTitle, overridden } = buildUploadTitle();
    uploadTitleBase = baseTitle || '';
    uploadTitleFallback = fallback;
    if (ui.uploadTitleInput) {
      ui.uploadTitleInput.value = title || '-';
      ui.uploadTitleInput.readOnly = true;
      ui.uploadTitleInput.dataset.editing = 'false';
      ui.uploadTitleInput.classList.remove('editing');
    }
    if (ui.editUploadTitleBtn) {
      ui.editUploadTitleBtn.textContent = 'Modifica';
    }
    updateUploadTitleHint(fallback, overridden);

    const ids = buildUploadIds();
    renderUploadIds(ids);
    uploadIdsText = ids.length
      ? ids.map((item) => `${item.label}: ${item.value}`).join('\n')
      : '';

    uploadMiShortCache = buildMediaInfoShort();
    uploadMiFullCache = 'Caricamento...';
    uploadMiMode = 'full';
    ui.uploadMiFullBtn.classList.add('active');
    ui.uploadMiShortBtn.classList.remove('active');
    ui.uploadMiText.textContent = uploadMiFullCache || '-';

    if (state.mainVideo) {
      const result = await window.api.getMediaInfoText(state.mainVideo);
      uploadMiFullCache = result?.text || result?.error || 'Nessun output disponibile.';
      if (uploadMiMode === 'full') {
        ui.uploadMiText.textContent = uploadMiFullCache;
      }
    }

    const descText = buildUploadDescription(form);
    ui.uploadDescText.textContent = descText || '-';

    renderUploadWarnings(buildUploadWarnings(form, settings));
    updateFfmpegHint(settings);
    ui.screensHint.textContent = settings.ffmpegPath
      ? ''
      : 'FFmpeg non configurato.';
    resetScreensProgress();
    renderScreensList();

    setUploadKitCollapsed('uploadMiSection', true);
    setUploadKitCollapsed('uploadDescSection', true);
    return true;
  }

  function closeUploadKitModal() {
    return;
  }

  async function openUploadKitModal() {
    const ready = await prepareUploadKitStep();
    if (!ready) {
      return;
    }
    if (typeof openWizardStep === 'function') {
      openWizardStep(2);
    }
  }

  async function generateScreenshots() {
    const settings = loadSettings();
    const videoPath = state.mainVideo || state.videoFiles[0];
    if (!videoPath) {
      ui.screensHint.textContent = 'Nessun file video disponibile.';
      return;
    }
    if (!settings.ffmpegPath) {
      ui.screensHint.textContent = 'FFmpeg non configurato.';
      return;
    }

    if (ui.generateScreensBtn) {
      ui.generateScreensBtn.disabled = true;
    }
    screensProgressRequestId = String(Date.now());
    resetScreensProgress();
    setScreensProgress(0);
    setScreensStage('start');
    ui.screensHint.textContent = 'Generazione screenshot in corso...';
    const payload = {
      videoPath,
      ffmpegPath: settings.ffmpegPath,
      count: settings.screenshotsCount || 6,
      primaryHost: settings.imageHostPrimary || 'imgbb',
      fallbackHost: settings.imageHostFallback || 'ptscreens',
      imgbbKey: settings.imgbbKey || '',
      ptscreensKey: settings.ptscreensKey || '',
      requestId: screensProgressRequestId
    };
    const result = await window.api.generateScreenshots(payload);
    if (result?.ok) {
      state.screenshots = result.images || [];
      state.screenshotsMeta = { tonemapped: Boolean(result.tonemapped) };
      ui.screensHint.textContent = `Screenshot caricati: ${state.screenshots.filter((s) => s.ok).length}/${state.screenshots.length}`;
      ui.uploadDescText.textContent = buildUploadDescription(getFormState());
      setScreensProgress(1);
      setScreensStage('done');
    } else {
      ui.screensHint.textContent = result?.error || 'Errore durante la generazione.';
      setScreensStage('error', { error: result?.error });
    }
    renderScreensList();
    if (ui.generateScreensBtn) {
      ui.generateScreensBtn.disabled = false;
    }
  }

  function refreshUploadDescription() {
    if (!ui.uploadDescText) {
      return;
    }
    ui.uploadDescText.textContent = buildUploadDescription(getFormState());
  }

  function initUploadKitEvents() {
    if (ui.openUploadKitBtn) {
      ui.openUploadKitBtn.addEventListener('click', () => {
        openUploadKitModal();
      });
    }
    if (ui.closeUploadKitBtn) {
      ui.closeUploadKitBtn.addEventListener('click', closeUploadKitModal);
    }
    if (ui.uploadToUnit3dBtn) {
      ui.uploadToUnit3dBtn.addEventListener('click', submitUnit3dUpload);
    }

    if (ui.copyUploadTitleBtn) {
      ui.copyUploadTitleBtn.addEventListener('click', () => {
        copyToClipboard(ui.uploadTitleInput?.value || '', 'Titolo copiato.');
      });
    }

    if (ui.editUploadTitleBtn && ui.uploadTitleInput) {
      ui.editUploadTitleBtn.addEventListener('click', () => {
        const isEditing = ui.uploadTitleInput.dataset.editing === 'true';
        if (!isEditing) {
          ui.uploadTitleInput.readOnly = false;
          ui.uploadTitleInput.dataset.editing = 'true';
          ui.uploadTitleInput.classList.add('editing');
          ui.editUploadTitleBtn.textContent = 'Blocca';
          ui.uploadTitleInput.focus();
          ui.uploadTitleInput.select();
          return;
        }
        ui.uploadTitleInput.readOnly = true;
        ui.uploadTitleInput.dataset.editing = 'false';
        ui.uploadTitleInput.classList.remove('editing');
        ui.editUploadTitleBtn.textContent = 'Modifica';
        syncUploadTitleOverride(ui.uploadTitleInput.value);
      });
    }

    if (ui.uploadTitleInput) {
      ui.uploadTitleInput.addEventListener('input', () => {
        if (ui.uploadTitleInput.readOnly) {
          return;
        }
        syncUploadTitleOverride(ui.uploadTitleInput.value);
      });
    }

    if (ui.copyUploadIdsBtn) {
      ui.copyUploadIdsBtn.addEventListener('click', () => {
        if (!uploadIdsText) {
          showToast?.('Nessun ID disponibile.');
          return;
        }
        copyToClipboard(uploadIdsText, 'ID copiati.');
      });
    }

    if (ui.uploadMiShortBtn) {
      ui.uploadMiShortBtn.addEventListener('click', () => {
        uploadMiMode = 'short';
        ui.uploadMiShortBtn.classList.add('active');
        ui.uploadMiFullBtn.classList.remove('active');
        ui.uploadMiText.textContent = uploadMiShortCache || '-';
      });
    }
    if (ui.uploadMiFullBtn) {
      ui.uploadMiFullBtn.addEventListener('click', () => {
        uploadMiMode = 'full';
        ui.uploadMiFullBtn.classList.add('active');
        ui.uploadMiShortBtn.classList.remove('active');
        ui.uploadMiText.textContent = uploadMiFullCache || '-';
      });
    }
    if (ui.copyUploadMiBtn) {
      ui.copyUploadMiBtn.addEventListener('click', () => {
        const text = uploadMiMode === 'full' ? uploadMiFullCache : uploadMiShortCache;
        copyToClipboard(text, 'MediaInfo copiato.');
      });
    }

    if (ui.copyUploadDescBtn) {
      ui.copyUploadDescBtn.addEventListener('click', () => {
        copyToClipboard(ui.uploadDescText.textContent, 'Descrizione copiata.');
      });
    }
    if (ui.uploadReleaseNotesInput) {
      ui.uploadReleaseNotesInput.addEventListener('input', () => {
        refreshUploadDescription();
      });
    }
    if (ui.previewUploadDescBtn) {
      ui.previewUploadDescBtn.addEventListener('click', () => {
        if (!ui.bbcodePreviewModal || !ui.bbcodePreviewContent) {
          return;
        }
        ui.bbcodePreviewContent.innerHTML = renderBbcodePreview(ui.uploadDescText.textContent);
        ui.bbcodePreviewModal.classList.remove('hidden');
      });
    }
    if (ui.bbcodePreviewModal) {
      ui.bbcodePreviewModal.addEventListener('click', (event) => {
        if (event.target?.classList.contains('modal-backdrop')) {
          ui.bbcodePreviewModal.classList.add('hidden');
        }
      });
    }
    if (ui.bbcodePreviewContent) {
      ui.bbcodePreviewContent.addEventListener('click', (event) => {
        const target = event.target;
        if (target?.dataset?.external) {
          window.api.openExternal(target.dataset.external);
        }
      });
    }

    if (ui.generateScreensBtn) {
      ui.generateScreensBtn.addEventListener('click', generateScreenshots);
    }
    if (ui.copyScreensBbcodeBtn) {
      ui.copyScreensBbcodeBtn.addEventListener('click', () => {
        if (!state.screenshots.length) {
          showToast?.('Nessuno screenshot disponibile.');
          return;
        }
        const bbcode = buildScreensBbcode();
        if (!bbcode) {
          return;
        }
        copyToClipboard(bbcode, 'BBCode screenshots copiato.');
      });
    }

    if (window.api?.onScreensProgress && !screensProgressUnsub) {
      screensProgressUnsub = window.api.onScreensProgress((data) => {
        if (!data) {
          return;
        }
        if (screensProgressRequestId && data.requestId && data.requestId !== screensProgressRequestId) {
          return;
        }
        if (typeof data.progress === 'number') {
          setScreensProgress(data.progress);
        }
        if (data.stage) {
          setScreensStage(data.stage, data);
        }
      });
    }

    document.querySelectorAll('.upload-section.collapsible').forEach((section) => {
      const sectionId = section.getAttribute('id');
      if (!sectionId) {
        return;
      }
      setUploadKitCollapsed(sectionId, section.classList.contains('collapsed'));
      section.addEventListener('click', (event) => {
        if (event.target?.closest('.section-actions') || event.target?.closest('button')) {
          return;
        }
        const isCollapsed = section.classList.contains('collapsed');
        setUploadKitCollapsed(sectionId, !isCollapsed);
      });
    });

    if (ui.closeBbcodePreviewBtn) {
      ui.closeBbcodePreviewBtn.addEventListener('click', () => {
        ui.bbcodePreviewModal?.classList.add('hidden');
      });
    }
  }

  return {
    buildScreensBbcode,
    buildUploadDescription,
    buildUploadWarnings,
    closeUploadKitModal,
    generateScreenshots,
    initUploadKitEvents,
    openUploadKitModal,
    prepareUploadKitStep,
    refreshUploadDescription,
    renderScreensList
  };
}
