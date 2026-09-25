// Storico upload: elenco persistente dei caricamenti con BBCode, esiti, screenshot e ID.
import { renderBbcodePreview } from './bbcode.js';

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }
  try {
    return new Date(value).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return new Date(value).toISOString();
  }
}

function statusMeta(entry) {
  if (entry?.status === 'error') {
    return { label: 'Errore', cls: 'error' };
  }
  if (entry?.moderation) {
    return { label: 'In coda moderazione', cls: 'moderation' };
  }
  return { label: 'Successo', cls: 'success' };
}

export function createUploadHistory(deps) {
  const { ui, showToast, copyToClipboard, logDebug } = deps;
  let entries = [];
  let selectedId = null;

  function openExternal(url) {
    const target = String(url || '').trim();
    if (target) {
      window.api?.openExternal?.(target);
    }
  }

  async function loadEntries() {
    try {
      const res = await window.api?.getUploadHistory?.();
      entries = Array.isArray(res?.entries) ? res.entries : [];
    } catch (error) {
      entries = [];
      logDebug?.('upload-history load error', String(error?.message || error));
    }
  }

  function renderList() {
    if (!ui.historyList) {
      return;
    }
    if (!entries.length) {
      ui.historyList.innerHTML = '<p class="history-list-empty">Nessun upload registrato.</p>';
      return;
    }
    ui.historyList.innerHTML = entries
      .map((entry) => {
        const meta = statusMeta(entry);
        const active = entry.id === selectedId ? ' active' : '';
        return `
          <button type="button" class="history-item${active}" data-id="${escapeHtml(entry.id)}">
            <span class="history-item-title">${escapeHtml(entry.title || '(senza titolo)')}</span>
            <span class="history-item-meta">
              <span class="history-badge ${meta.cls}">${escapeHtml(meta.label)}</span>
              <span class="history-item-date">${escapeHtml(formatDate(entry.createdAt))}</span>
            </span>
            <span class="history-item-tracker">${escapeHtml(entry.tracker || '-')}</span>
          </button>`;
      })
      .join('');
  }

  function renderDetail(entry) {
    if (!ui.historyDetail) {
      return;
    }
    if (!entry) {
      ui.historyDetail.innerHTML = '<p class="history-empty">Seleziona un upload per vederne i dettagli.</p>';
      return;
    }
    const meta = statusMeta(entry);
    const ids = entry.ids || {};
    const idRows = [
      ids.tmdb ? `TMDB ${escapeHtml(ids.tmdb)}` : '',
      ids.imdb ? `IMDb ${escapeHtml(ids.imdb)}` : '',
      ids.tvdb ? `TVDB ${escapeHtml(ids.tvdb)}` : '',
      ids.mal ? `MAL ${escapeHtml(ids.mal)}` : ''
    ].filter(Boolean).join(' &nbsp;|&nbsp; ') || '-';

    const links = [];
    if (entry.torrentPageUrl) {
      links.push(`<button type="button" class="secondary" data-hist-ext="${escapeHtml(entry.torrentPageUrl)}">Pagina torrent</button>`);
    }
    if (entry.downloadUrl) {
      links.push(`<button type="button" class="secondary" data-hist-ext="${escapeHtml(entry.downloadUrl)}">Download .torrent</button>`);
    }

    const shots = Array.isArray(entry.screenshots) ? entry.screenshots.filter((s) => s.displayUrl) : [];
    const shotsHtml = shots.length
      ? `<div class="history-shots">${shots
          .map((s) => `<a href="#" class="history-shot" data-hist-ext="${escapeHtml(s.viewerUrl || s.displayUrl)}" title="${escapeHtml(s.host || '')}"><img src="${escapeHtml(s.displayUrl)}" loading="lazy" alt="screenshot" /></a>`)
          .join('')}</div>`
      : '<p class="history-muted">Nessuno screenshot.</p>';

    const mediaLabel = entry.isBdInfo ? 'BDInfo' : 'MediaInfo';
    const mediaHtml = entry.mediainfo
      ? `<details class="history-collapse"><summary>${mediaLabel} completo</summary><pre class="history-pre">${escapeHtml(entry.mediainfo)}</pre></details>`
      : '<p class="history-muted">Nessun MediaInfo salvato.</p>';

    const bbcodeHtml = entry.bbcode
      ? `<div class="history-bbcode-actions">
           <button type="button" class="secondary" data-hist-copy="1">Copia BBCode</button>
           <button type="button" class="secondary" data-hist-preview="1">Anteprima BBCode</button>
         </div>
         <details class="history-collapse"><summary>Mostra BBCode</summary><pre class="history-pre">${escapeHtml(entry.bbcode)}</pre></details>`
      : '<p class="history-muted">Nessun BBCode salvato.</p>';

    ui.historyDetail.innerHTML = `
      <div class="history-detail-inner">
        <div class="history-detail-header">
          <h3>${escapeHtml(entry.title || '(senza titolo)')}</h3>
          <button type="button" class="secondary danger-outline" data-hist-delete="1">Elimina</button>
        </div>
        <div class="history-detail-meta">
          <span class="history-badge ${meta.cls}">${escapeHtml(meta.label)}</span>
          <span>${escapeHtml(formatDate(entry.createdAt))}</span>
          <span>${escapeHtml(entry.tracker || '-')}</span>
        </div>
        <div class="history-detail-meta history-muted">
          <span>Categoria: ${escapeHtml(entry.category || '-')}</span>
          <span>Tipo: ${escapeHtml(entry.type || '-')}</span>
          <span>Risoluzione: ${escapeHtml(entry.resolution || '-')}</span>
        </div>
        ${entry.statusText ? `<p class="history-status-text">${escapeHtml(entry.statusText)}</p>` : ''}
        ${links.length ? `<div class="history-links">${links.join('')}</div>` : ''}
        <div class="history-section">
          <h4>ID</h4>
          <p class="history-ids">${idRows}</p>
        </div>
        <div class="history-section">
          <h4>Screenshot</h4>
          ${shotsHtml}
        </div>
        <div class="history-section">
          <h4>BBCode</h4>
          ${bbcodeHtml}
        </div>
        <div class="history-section">
          <h4>${mediaLabel}</h4>
          ${mediaHtml}
        </div>
      </div>`;
  }

  function selectEntry(id) {
    selectedId = id;
    renderList();
    renderDetail(entries.find((e) => e.id === id));
  }

  function showPreview(bbcode) {
    if (!ui.bbcodePreviewModal || !ui.bbcodePreviewContent) {
      return;
    }
    ui.bbcodePreviewContent.innerHTML = renderBbcodePreview(String(bbcode || ''));
    ui.bbcodePreviewModal.classList.remove('hidden');
  }

  async function deleteEntry(id) {
    try {
      await window.api?.deleteUploadHistory?.(id);
    } catch (error) {
      logDebug?.('upload-history delete error', String(error?.message || error));
    }
    entries = entries.filter((e) => e.id !== id);
    if (selectedId === id) {
      selectedId = null;
    }
    renderList();
    renderDetail(entries.find((e) => e.id === selectedId));
    showToast?.('Voce eliminata dallo storico.', 'success');
  }

  async function clearAll() {
    if (!entries.length) {
      return;
    }
    try {
      await window.api?.clearUploadHistory?.();
    } catch (error) {
      logDebug?.('upload-history clear error', String(error?.message || error));
    }
    entries = [];
    selectedId = null;
    renderList();
    renderDetail(null);
    showToast?.('Storico svuotato.', 'success');
  }

  async function open() {
    await loadEntries();
    selectedId = entries[0]?.id || null;
    renderList();
    renderDetail(entries.find((e) => e.id === selectedId) || null);
    ui.uploadHistoryModal?.classList.remove('hidden');
  }

  function close() {
    ui.uploadHistoryModal?.classList.add('hidden');
  }

  function init() {
    ui.openHistoryBtn?.addEventListener('click', () => { open(); });
    ui.closeHistoryBtn?.addEventListener('click', close);
    ui.clearHistoryBtn?.addEventListener('click', () => { clearAll(); });
    ui.uploadHistoryModal?.addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) {
        close();
      }
    });

    ui.historyList?.addEventListener('click', (event) => {
      const item = event.target.closest('.history-item');
      if (item?.dataset.id) {
        selectEntry(item.dataset.id);
      }
    });

    ui.historyDetail?.addEventListener('click', (event) => {
      const ext = event.target.closest('[data-hist-ext]');
      if (ext) {
        event.preventDefault();
        openExternal(ext.dataset.histExt);
        return;
      }
      const entry = entries.find((e) => e.id === selectedId);
      if (!entry) {
        return;
      }
      if (event.target.closest('[data-hist-copy]')) {
        copyToClipboard?.(entry.bbcode || '');
        showToast?.('BBCode copiato.', 'success');
        return;
      }
      if (event.target.closest('[data-hist-preview]')) {
        showPreview(entry.bbcode || '');
        return;
      }
      if (event.target.closest('[data-hist-delete]')) {
        deleteEntry(entry.id);
      }
    });
  }

  return { init, open, close };
}
