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
    setHint,
    showToast,
    updateFfmpegHint
  } = deps;

  let uploadMiMode = 'short';
  let uploadMiShortCache = '';
  let uploadMiFullCache = '';
  let uploadIdsText = '';

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

  function buildUploadTitle() {
    const baseForm = getFormState();
    const metaTitle = state.metadata?.title ? String(state.metadata.title).trim() : '';
    const title = metaTitle || baseForm.title;
    const fallback = !metaTitle && Boolean(baseForm.title);
    const form = { ...baseForm, title };
    const isDir = state.kind === 'dir';
    const seasonType = baseForm.type.includes('anime') ? 'anime-season' : 'tv-season';
    const type = isDir ? seasonType : baseForm.type;
    const baseName = computeBaseName(form, { type, separatorStyle: 'spaces' });
    return { title: baseName, fallback };
  }

  function buildUploadIds() {
    const form = getFormState();
    const category = form.type.includes('tv') || form.type.includes('anime') ? 'TV' : 'MOVIE';
    const categoryId = UNIT3D_CATEGORY_ID[category] || '';
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
    const typeId = typeKey ? SHRI_TYPE_ID[typeKey] : '';
    const resolutionId = form.resolution ? UNIT3D_RESOLUTION_ID[form.resolution] || '' : '';

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
    if (categoryId) {
      parts.push({ label: 'Category ID', value: categoryId });
    }
    if (typeId) {
      parts.push({ label: 'Type ID', value: typeId });
    }
    if (resolutionId) {
      parts.push({ label: 'Resolution ID', value: resolutionId });
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
      rows.push(`${items.slice(index, index + 2).join(' ')} \n`);
    }
    let grid = rows.join('').trim();
    if (state.screenshotsMeta?.tonemapped) {
      grid = `${grid}\n[i]Screenshot tonemappati (HDR -> SDR).[/i]`;
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
    let lines = '\n[size=13][b][color=#e8024b]--- LINKS ---[/color][/b][/size]\n';
    if (imdbSlug) {
      lines += `[size=11][color=#FFFFFF]IMDb: https://www.imdb.com/title/${imdbSlug}/[/color][/size]\n`;
    }
    if (tmdbId) {
      lines += `[size=11][color=#FFFFFF]TMDb: https://www.themoviedb.org/${type}/${tmdbId}[/color][/size]\n`;
    }
    lines += '\n';
    return lines;
  }

  function buildReleaseNotesSection(form) {
    const tag = (form.tag || '').replace(/^-/, '').trim();
    const tonemapNote = state.screenshotsMeta?.tonemapped
      ? 'Screenshot tonemappati (HDR -> SDR).'
      : '';
    const isIsland = tag.toLowerCase() === 'island';
    const baseNotes = isIsland
      ? 'Questa e una release interna pubblicata in esclusiva su ShareIsland.\nSi prega di non ricaricare questa release su tracker pubblici o privati. Si prega di mantenerla in seed il piu a lungo possibile. Grazie!'
      : 'Nulla da aggiungere.';
    const notes = tonemapNote ? `${baseNotes}\n${tonemapNote}` : baseNotes;
    return `[size=13][b][color=#e8024b]--- RELEASE NOTES ---[/color][/b][/size]\n[size=11][color=#FFFFFF]${notes}[/color][/size]`;
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
        ? '--- SERIE TV (STAGIONE) ---'
        : '--- SERIE TV (EPISODIO) ---';
    }
    return '--- FILM ---';
  }

  function buildUploadDescription(form) {
    const title = state.metadata?.title || form.title || 'Unknown';
    const rawSummary = state.metadata?.tmdbOverview || '';
    const summary = rawSummary.trim() ? rawSummary.replace(/\s+/g, ' ') : 'Riassunto non disponibile.';
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
      ? `[size=13][b][color=#da8d49]INFO GENERALI[/color][/b][/size]
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
[size=11][color=#FFFFFF]${synthetic.subs}[/color][/size]

`
      : '';

    return `[code]
${logoSection}[center][size=13][b][color=#e8024b]${categoryHeader}[/color][/b][/size][/center]
[center][size=13][b][color=#ffffff]${title}[/color][/b][/size][/center]
[center][size=13][color=#ffffff]${infoLine}[/color][/size][/center]

[center][size=13][b][color=#e8024b]--- RIASSUNTO ---[/color][/b][/size][/center]
${summary}

[center][size=13][b][color=#e8024b]--- SCREENS ---[/color][/b][/size][/center]
${screens}
${linksSection}${mediainfoSection}${releaseNotesSection}

[size=13][b][color=#e8024b]--- SHOUTOUTS ---[/color][/b][/size]
[size=11][color=#FFFFFF]${shoutouts}[/color][/size]

[size=13][color=#0592a3][size=16][b]BUON DOWNLOAD![/b][/size][/color][/size]

[right][size=8]Generated by SHRI-Tools[/size][/right]
[/code]`;
  }

  function buildUploadWarnings(form, settings) {
    const warnings = [];
    const category = form.type.includes('tv') || form.type.includes('anime') ? 'TV' : 'MOVIE';
    const categoryId = UNIT3D_CATEGORY_ID[category] || '';
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
    const typeId = typeKey ? SHRI_TYPE_ID[typeKey] : '';
    const resolutionId = form.resolution ? UNIT3D_RESOLUTION_ID[form.resolution] || '' : '';
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
    } else if (!resolutionId) {
      warnings.push('Risoluzione non mappata per UNIT3D.');
    }
    if (!categoryId) {
      warnings.push('Category ID non disponibile per UNIT3D.');
    }
    if (!typeId) {
      warnings.push('Type ID non disponibile per SHRI.');
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

  async function openUploadKitModal() {
    if (!state.targetPath) {
      setHint(ui.renameHint, 'Seleziona un file o una cartella.');
      return;
    }
    const settings = loadSettings();
    const form = getFormState();
    const { title, fallback } = buildUploadTitle();
    ui.uploadTitleText.textContent = title || '-';
    ui.uploadTitleHint.textContent = fallback ? 'Titolo API non disponibile: uso fallback dal file.' : '';

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
      ? 'Pronto a generare gli screenshot.'
      : 'FFmpeg non configurato.';
    renderScreensList();

    setUploadKitCollapsed('uploadMiSection', true);
    setUploadKitCollapsed('uploadDescSection', true);
    ui.uploadKitModal.classList.remove('hidden');
  }

  function closeUploadKitModal() {
    if (!ui.uploadKitModal) {
      return;
    }
    ui.uploadKitModal.classList.add('hidden');
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
    ui.screensHint.textContent = 'Generazione screenshot in corso...';
    const payload = {
      videoPath,
      ffmpegPath: settings.ffmpegPath,
      count: settings.screenshotsCount || 6,
      primaryHost: settings.imageHostPrimary || 'imgbb',
      fallbackHost: settings.imageHostFallback || 'ptscreens',
      imgbbKey: settings.imgbbKey || '',
      ptscreensKey: settings.ptscreensKey || ''
    };
    const result = await window.api.generateScreenshots(payload);
    if (result?.ok) {
      state.screenshots = result.images || [];
      state.screenshotsMeta = { tonemapped: Boolean(result.tonemapped) };
      ui.screensHint.textContent = `Screenshot caricati: ${state.screenshots.filter((s) => s.ok).length}/${state.screenshots.length}`;
      ui.uploadDescText.textContent = buildUploadDescription(getFormState());
    } else {
      ui.screensHint.textContent = result?.error || 'Errore durante la generazione.';
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
    if (ui.uploadKitModal) {
      ui.uploadKitModal.addEventListener('click', (event) => {
        if (event.target?.classList.contains('modal-backdrop')) {
          closeUploadKitModal();
        }
      });
    }

    if (ui.copyUploadTitleBtn) {
      ui.copyUploadTitleBtn.addEventListener('click', () => {
        copyToClipboard(ui.uploadTitleText.textContent, 'Titolo copiato.');
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
    refreshUploadDescription,
    renderScreensList
  };
}
