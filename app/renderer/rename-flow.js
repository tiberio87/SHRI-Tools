export function createRenameFlow({
  ui,
  state,
  renameTools,
  buildBdInfoShort,
  buildMediaInfoShort,
  getFormState,
  logDebug,
  updateRenameBadge,
  clearWizardRulesCheck,
  updateWizardRulesCheck,
  getPathBaseName,
  isDiscStructure,
  showToast,
  openMediaInfoModal,
  cancelBdInfo,
  scanBdInfoPlaylist,
  updateVisibility,
  updateFormatServiceSuggest,
  getMediaInfoText,
  previewRename,
  copyToClipboard
}) {
  let previewTimer = null;

  async function showMediaInfoReport() {
    if (state.kind === 'tracker') {
      ui.mediaInfoText.textContent = state.trackerMediaInfoText || 'MediaInfo non disponibile.';
      ui.mediaInfoPath.textContent = `Tracker: ${state.targetPath || ''}`;
      openMediaInfoModal();
      return;
    }
    if (!state.mainVideo || state.mediaInfo?.error) {
      return;
    }
    ui.mediaInfoText.textContent = 'Caricamento...';
    ui.mediaInfoPath.textContent = `File: ${state.mainVideo}`;
    openMediaInfoModal();
    const result = await getMediaInfoText(state.mainVideo);
    if (result?.error) {
      ui.mediaInfoText.textContent = `Errore MediaInfo: ${result.error}`;
    } else {
      ui.mediaInfoText.textContent = result?.text || 'Nessun output disponibile.';
    }
  }

  async function updateRenamePlan() {
    if (!state.targetPath) {
      ui.renamePlanList.innerHTML = '';
      ui.warningList.innerHTML = '';
      updateRenameBadge(null);
      clearWizardRulesCheck();
      return;
    }
    if (ui.applyRenameBtn) {
      ui.applyRenameBtn.disabled = false;
    }
    if (state.kind === 'tracker') {
      const form = getFormState();
      logDebug?.('form state', form);
      const isEpisode = form.type === 'tv-episode' || form.type === 'anime-episode';
      const baseName = renameTools.computeBaseName(form, {
        tokenStyle: 'title',
        separatorStyle: 'spaces',
        ...(isEpisode ? { episodeTitle: '' } : {})
      });
      if (ui.renameFileCheckbox) {
        ui.renameFileCheckbox.checked = false;
        ui.renameFileCheckbox.disabled = true;
      }
      if (ui.renameFolderCheckbox) {
        ui.renameFolderCheckbox.checked = false;
        ui.renameFolderCheckbox.disabled = true;
      }
      if (ui.applyRenameBtn) {
        ui.applyRenameBtn.disabled = true;
      }
      ui.renamePlanList.innerHTML = '';
      ui.warningList.innerHTML = '';
      updateRenameBadge(null);
      clearWizardRulesCheck();

      const trackerLabel = document.createElement('div');
      trackerLabel.className = 'plan-label';
      trackerLabel.textContent = 'Tracker';
      ui.renamePlanList.appendChild(trackerLabel);

      const trackerInfo = document.createElement('div');
      trackerInfo.className = 'plan-info';
      const currentLine = document.createElement('div');
      currentLine.className = 'plan-text old';
      currentLine.textContent = state.trackerName || 'Titolo non disponibile';
      trackerInfo.appendChild(currentLine);
      ui.renamePlanList.appendChild(trackerInfo);

      const suggestedLabel = document.createElement('div');
      suggestedLabel.className = 'plan-label';
      suggestedLabel.textContent = 'Titolo suggerito';
      ui.renamePlanList.appendChild(suggestedLabel);

      const suggestedInfo = document.createElement('div');
      suggestedInfo.className = 'plan-info with-copy';
      const suggestedLine = document.createElement('div');
      suggestedLine.className = 'plan-text new';
      suggestedLine.textContent = baseName || 'Compila i campi per generare il titolo.';
      suggestedInfo.appendChild(suggestedLine);
      logDebug?.('tracker title suggestion', {
        tracker: state.trackerName || '',
        suggested: baseName || ''
      });
      const copySuggestedBtn = document.createElement('button');
      copySuggestedBtn.type = 'button';
      copySuggestedBtn.className = 'icon-button';
      copySuggestedBtn.title = 'Copia titolo suggerito';
      copySuggestedBtn.setAttribute('aria-label', 'Copia titolo suggerito');
      copySuggestedBtn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="9" width="10" height="10" rx="2"></rect>
          <rect x="5" y="5" width="10" height="10" rx="2"></rect>
        </svg>
      `;
      copySuggestedBtn.addEventListener('click', () => {
        const text = suggestedLine.textContent || '';
        if (!text) {
          showToast?.('Nessun titolo da copiare.', 'warning');
          return;
        }
        if (copyToClipboard) {
          copyToClipboard(text, 'Titolo suggerito copiato.');
        } else {
          navigator.clipboard?.writeText(text);
          showToast?.('Titolo suggerito copiato.', 'success');
        }
      });
      suggestedInfo.appendChild(copySuggestedBtn);
      ui.renamePlanList.appendChild(suggestedInfo);

      const normalizeImdbId = (value) => {
        if (!value) {
          return '';
        }
        let raw = String(value).trim().toLowerCase();
        if (raw.startsWith('tt')) {
          raw = raw.slice(2);
        }
        const digits = raw.replace(/[^\d]/g, '');
        if (!digits) {
          return '';
        }
        const parsed = Number.parseInt(digits, 10);
        if (!Number.isFinite(parsed) || parsed === 0) {
          return '';
        }
        return String(parsed).padStart(7, '0');
      };

      const attrs = state.trackerData?.attributes || {};
      const allowTrackerIds = !(state.trackerIdMismatch?.active && !state.trackerIdMismatch?.usedFallback);
      const tmdbId = String(state.metadata?.tmdbId || (allowTrackerIds ? attrs.tmdb_id : '') || '').trim();
      const imdbId = normalizeImdbId(state.metadata?.imdbId || (allowTrackerIds ? attrs.imdb_id : '') || '');
      const tvdbId = String(state.metadata?.tvdbSeriesId || state.metadata?.tvdbId || (allowTrackerIds ? attrs.tvdb_id : '') || '').trim();
      const malId = String(state.metadata?.malId || (allowTrackerIds ? attrs.mal_id : '') || '').trim().replace(/[^\d]/g, '');
      const ids = [];
      const isTvType = form.type.startsWith('tv') || form.type.startsWith('anime');
      const tmdbType = state.metadata?.tmdbType || (isTvType ? 'tv' : 'movie');
      if (tmdbId) {
        ids.push({
          label: 'TMDB',
          value: tmdbId,
          link: `https://www.themoviedb.org/${tmdbType}/${tmdbId}`
        });
      }
      if (imdbId) {
        ids.push({
          label: 'IMDb',
          value: imdbId,
          link: `https://www.imdb.com/title/tt${imdbId}/`
        });
      }
      if (tvdbId) {
        const slug = state.metadata?.tvdbSeriesSlug;
        const link = slug
          ? `https://thetvdb.com/series/${slug}`
          : `https://thetvdb.com/?tab=series&id=${tvdbId}`;
        ids.push({
          label: 'TVDB',
          value: tvdbId,
          link
        });
      }
      if (malId) {
        ids.push({
          label: 'MAL',
          value: malId,
          link: `https://myanimelist.net/anime/${malId}`
        });
      }
      const mismatch = state.trackerIdMismatch;
      const shouldShowMismatch = Boolean(mismatch?.active);
      if (ids.length || shouldShowMismatch) {
        const mismatchWrap = document.createElement('div');
        mismatchWrap.className = 'upload-ids';
        const idsWrap = document.createElement('div');
        idsWrap.className = 'upload-ids';
        if (shouldShowMismatch) {
          const formatImdbDisplay = (value) => {
            const raw = String(value || '').trim();
            if (!raw) {
              return '';
            }
            const stripped = raw.toLowerCase().startsWith('tt') ? raw.slice(2) : raw;
            const digits = stripped.replace(/[^\d]/g, '');
            if (!digits) {
              return '';
            }
            const padded = digits.length < 7 ? digits.padStart(7, '0') : digits;
            return `tt${padded}`;
          };
          const mismatchBadge = document.createElement('span');
          mismatchBadge.className = 'upload-id-badge mismatch';

          const mismatchLabel = document.createElement('span');
          mismatchLabel.className = 'label';
          mismatchLabel.textContent = 'ID MISMATCH RILEVATO (TRACKER):';

          mismatchBadge.appendChild(mismatchLabel);

          if (mismatch.provided?.imdb) {
            const imdbId = formatImdbDisplay(mismatch.provided.imdb);
            const imdbBtn = document.createElement('button');
            imdbBtn.type = 'button';
            imdbBtn.className = 'id-pill external';
            imdbBtn.textContent = `IMDb ${imdbId}`;
            imdbBtn.setAttribute('data-external', `https://www.imdb.com/title/${imdbId}/`);
            mismatchBadge.appendChild(imdbBtn);
          }
          if (mismatch.provided?.tmdb) {
            const tmdbBtn = document.createElement('button');
            tmdbBtn.type = 'button';
            tmdbBtn.className = 'id-pill external';
            tmdbBtn.textContent = `TMDb ${mismatch.provided.tmdb}`;
            tmdbBtn.setAttribute('data-external', `https://www.themoviedb.org/${tmdbType}/${mismatch.provided.tmdb}`);
            mismatchBadge.appendChild(tmdbBtn);
          }
          if (mismatch.provided?.tvdb) {
            const tvdbBtn = document.createElement('button');
            tvdbBtn.type = 'button';
            tvdbBtn.className = 'id-pill external';
            tvdbBtn.textContent = `TVDB ${mismatch.provided.tvdb}`;
            tvdbBtn.setAttribute('data-external', `https://thetvdb.com/?tab=series&id=${mismatch.provided.tvdb}`);
            mismatchBadge.appendChild(tvdbBtn);
          }
          if (mismatch.provided?.mal) {
            const malBtn = document.createElement('button');
            malBtn.type = 'button';
            malBtn.className = 'id-pill external';
            malBtn.textContent = `MAL ${mismatch.provided.mal}`;
            malBtn.setAttribute('data-external', `https://myanimelist.net/anime/${mismatch.provided.mal}`);
            mismatchBadge.appendChild(malBtn);
          }

          const reasonText = Array.isArray(mismatch.reasons) && mismatch.reasons.length
            ? mismatch.reasons.join(', ')
            : 'titolo/anno';
          mismatchBadge.setAttribute(
            'data-tooltip',
            `ID non coerente con ${reasonText}. Usato fallback titolo/anno.`
          );
          mismatchWrap.appendChild(mismatchBadge);
        }
        if (mismatchWrap.children.length) {
          ui.renamePlanList.appendChild(mismatchWrap);
        }
        if (ids.length) {
          const suggestedBadge = document.createElement('span');
          suggestedBadge.className = 'upload-id-badge suggested';

          const suggestedLabel = document.createElement('span');
          suggestedLabel.className = 'label';
          suggestedLabel.textContent = 'ID SUGGERITI:';
          suggestedBadge.appendChild(suggestedLabel);

          ids.forEach((item) => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'id-pill suggested';
            pill.textContent = `${item.label} ${item.value}`;
            pill.addEventListener('click', () => {
              if (copyToClipboard) {
                copyToClipboard(item.value, `${item.label} copiato.`);
              } else {
                navigator.clipboard?.writeText(item.value);
                showToast?.(`${item.label} copiato.`, 'success');
              }
            });
            suggestedBadge.appendChild(pill);
          });

          idsWrap.appendChild(suggestedBadge);
          ui.renamePlanList.appendChild(idsWrap);
        }
      }

      if (state.mediaInfo || state.trackerMediaInfoText) {
        const infoHeader = document.createElement('div');
        infoHeader.className = 'plan-label-row tracker-mediainfo';

        const infoLabel = document.createElement('div');
        infoLabel.className = 'plan-label';
        infoLabel.textContent = 'MediaInfo (sintetico)';

        const infoBtn = document.createElement('button');
        infoBtn.className = 'status clickable';
        infoBtn.textContent = 'Apri mediainfo completo';
        infoBtn.addEventListener('click', async () => {
          await showMediaInfoReport();
        });

        infoHeader.appendChild(infoLabel);
        infoHeader.appendChild(infoBtn);
        ui.renamePlanList.appendChild(infoHeader);

        const info = document.createElement('pre');
        info.className = 'plan-mediainfo tracker-mediainfo';
        info.textContent = buildMediaInfoShort();
        ui.renamePlanList.appendChild(info);
      }
      return;
    }

    const form = getFormState();
    const { folderName, fileRenames, warnings } = renameTools.buildRenameTargets();
    const discStructure = isDiscStructure();
    const plan = await previewRename({
      targetPath: state.targetPath,
      renameFiles: ui.renameFileCheckbox.checked && !discStructure,
      renameFolder: state.kind === 'dir' && ui.renameFolderCheckbox.checked,
      folderName: state.kind === 'dir' ? folderName : '',
      fileRenames
    });
    updateRenameBadge(plan);

    ui.renamePlanList.innerHTML = '';
    ui.warningList.innerHTML = '';
    const planWarnings = plan.warnings || [];
    const hasWarnings = warnings.length > 0 || planWarnings.length > 0;

    let folderOp = null;
    let filteredOps = plan.ops || [];
    if (state.kind === 'dir') {
      const targetFolder = state.targetPath;
      folderOp = filteredOps.find((op) => op.from === targetFolder) || null;
      if (folderOp) {
        filteredOps = filteredOps.filter((op) => op !== folderOp);
      }
    }

    if (state.kind === 'dir') {
      const infoPath = state.targetPath;
      const infoName = folderName || getPathBaseName(state.targetPath);
      if (infoName || folderOp) {
        const folderLabel = document.createElement('div');
        folderLabel.className = 'plan-label';
        folderLabel.textContent = 'Cartella';
        ui.renamePlanList.appendChild(folderLabel);

        const info = document.createElement('div');
        info.className = 'plan-info';
        if (folderOp) {
          const fromLine = document.createElement('div');
          fromLine.className = 'plan-text old';
          fromLine.textContent = getPathBaseName(folderOp.from);
          const toLine = document.createElement('div');
          toLine.className = 'plan-text new';
          toLine.textContent = getPathBaseName(folderOp.to);
          info.appendChild(fromLine);
          info.appendChild(toLine);
        } else {
          info.textContent = `Cartella: ${infoName}`;
        }
        if (infoPath) {
          info.title = infoPath;
        }
        ui.renamePlanList.appendChild(info);
      }
    }

    const filesLabel = document.createElement('div');
    filesLabel.className = 'plan-label';
    filesLabel.textContent = 'File';
    ui.renamePlanList.appendChild(filesLabel);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'plan-items';
    ui.renamePlanList.appendChild(itemsContainer);

    if (filteredOps.length) {
      for (const op of filteredOps) {
        const item = document.createElement('div');
        item.className = 'plan-item rename';

        const fromLine = document.createElement('div');
        fromLine.className = 'plan-text old';
        fromLine.textContent = getPathBaseName(op.from);

        const toLine = document.createElement('div');
        toLine.className = 'plan-text new';
        toLine.textContent = getPathBaseName(op.to);

        item.appendChild(fromLine);
        item.appendChild(toLine);
        itemsContainer.appendChild(item);
      }
    } else {
      const empty = document.createElement('div');
      empty.className = `plan-item empty${hasWarnings ? '' : ' success'}`;
      empty.textContent = hasWarnings
        ? 'Nessuna operazione pronta.'
        : 'Nessuna rinomina necessaria con le configurazioni attuali.';
      itemsContainer.appendChild(empty);
    }

    if (discStructure) {
      const infoHeader = document.createElement('div');
      infoHeader.className = 'plan-label-row';

      const infoLabel = document.createElement('div');
      infoLabel.className = 'plan-label';
      infoLabel.textContent = 'BDInfo (sintetico)';

      const actions = document.createElement('div');
      actions.className = 'bdinfo-actions';

      const scanBtn = document.createElement('button');
      scanBtn.id = 'bdinfoScanButton';
      scanBtn.className = 'primary small bdinfo-scan';
      scanBtn.textContent = 'Scansiona playlist selezionata';

      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'bdinfoCancelButton';
      cancelBtn.className = 'secondary small bdinfo-cancel';
      cancelBtn.textContent = 'Interrompi';
      cancelBtn.classList.toggle('hidden', !state.bdInfoLoading);
      cancelBtn.addEventListener('click', () => {
        cancelBdInfo?.();
      });
      scanBtn.addEventListener('click', () => {
        scanBdInfoPlaylist?.();
      });

      const hasPlaylists = Array.isArray(state.bdInfoPlaylists) && state.bdInfoPlaylists.length > 0;
      scanBtn.disabled = !hasPlaylists || !state.bdInfoSelectedPlaylist || state.bdInfoLoading;
      scanBtn.classList.toggle('hidden', !hasPlaylists);

      actions.appendChild(scanBtn);
      actions.appendChild(cancelBtn);
      infoHeader.appendChild(infoLabel);
      infoHeader.appendChild(actions);
      ui.renamePlanList.appendChild(infoHeader);

      const stageRow = document.createElement('div');
      stageRow.id = 'bdinfoProgressStage';
      stageRow.className = 'progress-stage bdinfo-progress-stage';
      const showStage = state.bdInfoLoading || Boolean(state.bdInfoStageText);
      stageRow.classList.toggle('hidden', !showStage);
      stageRow.classList.toggle('done', state.bdInfoStage === 'done');

      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      const check = document.createElement('div');
      check.className = 'progress-check';
      check.setAttribute('aria-hidden', 'true');
      check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"></path></svg>';

      const stageText = document.createElement('div');
      stageText.id = 'bdinfoProgressStageText';
      stageText.className = 'progress-stage-text';
      stageText.textContent = state.bdInfoStageText || (state.bdInfoLoading ? 'BDInfo in corso...' : '');

      stageRow.appendChild(spinner);
      stageRow.appendChild(check);
      stageRow.appendChild(stageText);
      ui.renamePlanList.appendChild(stageRow);

      const extractBdInfoSummary = (rawText) => {
        const text = String(rawText || '').trim();
        if (!text) {
          return '';
        }
        const quickIndex = text.toLowerCase().indexOf('quick summary');
        if (quickIndex === -1) {
          return text;
        }
        const after = text.slice(quickIndex);
        const lines = after.split(/\r?\n/);
        let startIndex = -1;
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i].toLowerCase().includes('quick summary')) {
            startIndex = i + 1;
            break;
          }
        }
        if (startIndex === -1) {
          return text;
        }
        const out = [];
        for (let i = startIndex; i < lines.length; i += 1) {
          const line = lines[i];
          const trimmed = line.trim();
          if (/^\*{5,}/.test(trimmed) || /^files?:/i.test(trimmed) || /^chapters?:/i.test(trimmed)) {
            break;
          }
          out.push(line);
        }
        const summary = out.join('\n').replace(/ +/g, ' ').trim();
        return summary || text;
      };

      const info = document.createElement('pre');
      info.className = 'plan-mediainfo bdinfo-report';
      const rawReport = String(state.bdInfoRaw || '').trim();
      const summary = extractBdInfoSummary(rawReport);
      info.textContent = summary || buildBdInfoShort();
      ui.renamePlanList.appendChild(info);

      if (hasPlaylists) {
        const playlistWrap = document.createElement('div');
        playlistWrap.className = 'bdinfo-playlist-table';

        const headerRow = document.createElement('div');
        headerRow.className = 'bdinfo-playlist-row header';
        const headerPlaylist = document.createElement('div');
        headerPlaylist.className = 'bdinfo-playlist-cell';
        headerPlaylist.textContent = 'Playlist';
        const headerDuration = document.createElement('div');
        headerDuration.className = 'bdinfo-playlist-cell';
        headerDuration.textContent = 'Durata';
        const headerComment = document.createElement('div');
        headerComment.className = 'bdinfo-playlist-cell';
        headerComment.textContent = 'Commento';
        headerRow.appendChild(headerPlaylist);
        headerRow.appendChild(headerDuration);
        headerRow.appendChild(headerComment);
        playlistWrap.appendChild(headerRow);

        const listBody = document.createElement('div');
        listBody.className = 'bdinfo-playlist-body';
        const sorted = state.bdInfoPlaylists
          .slice()
          .filter((item) =>
            Number.isFinite(item?.durationSeconds) ? item.durationSeconds >= 600 : true
          )
          .sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
        const showAll = Boolean(state.bdInfoShowAllPlaylists);
        const visible = showAll ? sorted : sorted.slice(0, 5);
        const parsed = state.bdInfoParsed;
        visible.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'bdinfo-playlist-row';
          const isSelected = item.playlist === state.bdInfoSelectedPlaylist;
          row.classList.toggle('selected', isSelected);
          row.addEventListener('click', () => {
            const nextPlaylist = item.playlist || '';
            state.bdInfoSelectedPlaylist = nextPlaylist;
            state.bdInfoShowAllPlaylists = showAll;
            updateRenamePlan();
          });

          const playlistCell = document.createElement('div');
          playlistCell.className = 'bdinfo-playlist-cell';
          playlistCell.textContent = item.playlist || '';

          const durationCell = document.createElement('div');
          durationCell.className = 'bdinfo-playlist-cell';
          durationCell.textContent = item.duration || '';

          const commentCell = document.createElement('div');
          commentCell.className = 'bdinfo-playlist-cell';
          const comment =
            item.comment ||
            item.label ||
            (isSelected ? parsed?.playlistLabel : '') ||
            '';
          commentCell.textContent = comment || '—';

          row.appendChild(playlistCell);
          row.appendChild(durationCell);
          row.appendChild(commentCell);
          listBody.appendChild(row);
        });
        playlistWrap.appendChild(listBody);

        if (sorted.length > 5) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'bdinfo-playlist-more';
          toggle.textContent = showAll
            ? 'Mostra meno'
            : `Mostra altre (${sorted.length - 5})`;
          toggle.addEventListener('click', () => {
            state.bdInfoShowAllPlaylists = !showAll;
            updateRenamePlan();
          });
          playlistWrap.appendChild(toggle);
        }

        ui.renamePlanList.appendChild(playlistWrap);
      }
    } else if (state.kind === 'file' && state.mainVideo) {
      const infoHeader = document.createElement('div');
      infoHeader.className = 'plan-label-row';

      const infoLabel = document.createElement('div');
      infoLabel.className = 'plan-label';
      infoLabel.textContent = 'MediaInfo (sintetico)';

      const infoBtn = document.createElement('button');
      infoBtn.className = 'status clickable';
      infoBtn.textContent = 'Apri mediainfo completo';
      infoBtn.addEventListener('click', async () => {
        if (!state.mainVideo) {
          showToast('MediaInfo non disponibile.', 'warning');
          return;
        }
        await showMediaInfoReport();
      });

      infoHeader.appendChild(infoLabel);
      infoHeader.appendChild(infoBtn);
      ui.renamePlanList.appendChild(infoHeader);

      const info = document.createElement('pre');
      info.className = 'plan-mediainfo';
      info.textContent = buildMediaInfoShort();
      ui.renamePlanList.appendChild(info);
    }

    const allWarnings = [...warnings, ...planWarnings];
    if (allWarnings.length) {
      for (const warning of allWarnings) {
        const item = document.createElement('div');
        item.className = 'warning-item';
        item.textContent = warning;
        ui.warningList.appendChild(item);
      }
    }

    updateWizardRulesCheck(form);
  }

  async function refreshPreview() {
    updateVisibility();
    updateFormatServiceSuggest();
    await updateRenamePlan();
  }

  function schedulePreview() {
    if (previewTimer) {
      clearTimeout(previewTimer);
    }
    previewTimer = setTimeout(() => {
      refreshPreview();
    }, 120);
  }

  return {
    updateRenamePlan,
    refreshPreview,
    schedulePreview,
    showMediaInfoReport
  };
}
