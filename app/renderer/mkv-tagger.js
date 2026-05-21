// MKV Tagger — gestisce caricamento tracce (mkvmerge -J) e scrittura tag (mkvpropedit).
import { state } from './state.js';

/**
 * Costruisce la stringa XML dei tag globali MKV (senza TrackUID).
 * I Source per traccia vengono applicati separatamente con --tags track:N:file.xml
 * per evitare problemi di precisione con i UID a 64-bit.
 */
function buildTagsXml({ imdb, tmdb, tvdb, encoder }) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const simples = [];
  if (imdb) simples.push(`    <Simple><Name>IMDB</Name><String>${esc(imdb)}</String></Simple>`);
  if (tmdb) simples.push(`    <Simple><Name>TMDB</Name><String>${esc(tmdb)}</String></Simple>`);
  if (tvdb) simples.push(`    <Simple><Name>TVDB</Name><String>${esc(tvdb)}</String></Simple>`);
  if (encoder) simples.push(`    <Simple><Name>Encoder</Name><String>${esc(encoder)}</String></Simple>`);

  const globalTag = `  <Tag>\n    <Targets/>\n${simples.join('\n')}\n  </Tag>`;

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE Tags SYSTEM "matroska-tags.dtd">\n<Tags>\n${globalTag}\n</Tags>`;
}

/**
 * Restituisce il selettore mkvpropedit per la traccia (es. "track:v1").
 */
function buildEditSelector(track, counters) {
  const type = track.type;
  if (type === 'video') {
    counters.v = (counters.v || 0) + 1;
    return `track:v${counters.v}`;
  }
  if (type === 'audio') {
    counters.a = (counters.a || 0) + 1;
    return `track:a${counters.a}`;
  }
  if (type === 'subtitles') {
    counters.s = (counters.s || 0) + 1;
    return `track:s${counters.s}`;
  }
  return null;
}

export function createMkvTagger({ ui, loadSettings, saveSettings }) {
  let loadedTracks = []; // [{uid, type, codec, language, trackTitle, editSelector, source}]

  // ── Helper UI ──────────────────────────────────────────────────────────────

  function setLog(msg, isError = false) {
    if (!ui.mkvTagsLog) return;
    ui.mkvTagsLog.textContent = msg;
    ui.mkvTagsLog.className = isError ? 'mkv-log mkv-log-error' : 'mkv-log';
    ui.mkvTagsLog.classList.remove('hidden');
  }

  function clearLog() {
    if (!ui.mkvTagsLog) return;
    ui.mkvTagsLog.textContent = '';
    ui.mkvTagsLog.classList.add('hidden');
  }

  // ── Popola il titolo dal form (titleInput + yearInput) ────────────────────

  function syncTitle() {
    if (!ui.mkvTagsMkvTitle) return;
    if (ui.mkvTagsMkvTitle.dataset.manual === 'true') return;
    const title = ui.titleInput?.value.trim() || '';
    const year = ui.yearInput?.value.trim() || '';
    const includeYear = ui.includeYear?.checked !== false;
    if (title) {
      ui.mkvTagsMkvTitle.value = year && includeYear ? `${title} (${year})` : title;
    }
  }

  // ── Popola IMDb/TMDB/TVDB da state.metadata ────────────────────────────────

  function syncMetadata() {
    const meta = state.metadata;
    if (!meta) return;
    if (ui.mkvTagsImdb && ui.mkvTagsImdb.dataset.manual !== 'true') {
      ui.mkvTagsImdb.value = meta.imdbId || '';
    }
    if (ui.mkvTagsTmdb && ui.mkvTagsTmdb.dataset.manual !== 'true') {
      const tmdbType = meta.tmdbType || 'movie';
      ui.mkvTagsTmdb.value = meta.tmdbId ? `${tmdbType}/${meta.tmdbId}` : '';
    }
    if (ui.mkvTagsTvdb && ui.mkvTagsTvdb.dataset.manual !== 'true') {
      ui.mkvTagsTvdb.value = meta.tvdbSeriesId ? String(meta.tvdbSeriesId) : '';
    }
  }

  // ── Renderizza tabella tracce ──────────────────────────────────────────────

  function renderTracksTable() {
    if (!ui.mkvTagsTracksBody) return;
    if (loadedTracks.length === 0) {
      ui.mkvTagsTracksBody.innerHTML =
        '<tr><td colspan="6" class="mkv-tracks-empty">Carica le tracce per iniziare.</td></tr>';
      return;
    }
    ui.mkvTagsTracksBody.innerHTML = loadedTracks
      .map(
        (t, i) => `<tr>
  <td class="mkv-uid" title="${t.uid}">${String(t.uid).slice(0, 8)}&hellip;</td>
  <td>${t.type}</td>
  <td>${t.codec}</td>
  <td><input class="mkv-track-input" data-idx="${i}" data-field="language" type="text" value="${escHtml(t.language)}" placeholder="ita" /></td>
  <td><input class="mkv-track-input" data-idx="${i}" data-field="trackTitle" type="text" value="${escHtml(t.trackTitle)}" placeholder="Titolo traccia" /></td>
  <td><input class="mkv-track-input" data-idx="${i}" data-field="source" type="text" value="${escHtml(t.source)}" placeholder="BluRay / WEB-DL…" /></td>
</tr>`
      )
      .join('');

    // bind input changes → aggiorna loadedTracks
    ui.mkvTagsTracksBody.querySelectorAll('.mkv-track-input').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.idx, 10);
        const field = inp.dataset.field;
        if (loadedTracks[idx]) loadedTracks[idx][field] = inp.value;
      });
    });
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Carica tracce via mkvmerge -J ──────────────────────────────────────────

  async function loadTracks() {
    const filePath = state.targetPath;
    if (!filePath || !filePath.toLowerCase().endsWith('.mkv')) {
      setLog('Nessun file .mkv selezionato.', true);
      return;
    }
    // Aggiorna sempre titolo e ID prima di caricare
    syncTitle();
    syncMetadata();
    clearLog();
    if (ui.loadMkvTracksBtn) ui.loadMkvTracksBtn.disabled = true;
    try {
      // mkvmerge è nella stessa directory di mkvpropedit; usa path di sistema
      const settings = loadSettings();
      const mkvpropeditPath = settings.mkvpropeditPath || '';
      // Costruisce percorso mkvmerge accanto a mkvpropedit se configurato
      let mkvmergePath = 'mkvmerge';
      if (mkvpropeditPath) {
        const dir = mkvpropeditPath.replace(/[/\\][^/\\]+$/, '');
        mkvmergePath = dir + (mkvpropeditPath.includes('\\') ? '\\' : '/') + 'mkvmerge' + (mkvpropeditPath.endsWith('.exe') ? '.exe' : '');
      }

      const result = await window.api.mkvGetTracks({ filePath, mkvmergePath });
      if (!result.ok) {
        setLog(`Errore mkvmerge: ${result.error}`, true);
        return;
      }

      const counters = {};
      loadedTracks = (result.data.tracks || []).map((t) => {
        const editSelector = buildEditSelector({ type: t.type }, counters);
        return {
          uid: String(t.properties?.uid ?? t.id ?? ''),
          trackNumber: typeof t.id === 'number' ? t.id + 1 : null, // 1-based per --tags track:N:
          type: t.type || '',
          codec: t.codec || '',
          language: t.properties?.language || '',
          trackTitle: t.properties?.track_name || '',
          editSelector,
          source: ''
        };
      });

      renderTracksTable();
      setLog(`${loadedTracks.length} tracce caricate.`);
    } catch (err) {
      setLog(`Errore: ${err?.message || err}`, true);
    } finally {
      if (ui.loadMkvTracksBtn) ui.loadMkvTracksBtn.disabled = false;
    }
  }

  // ── Applica tag via mkvpropedit ────────────────────────────────────────────

  async function applyTags() {
    const filePath = state.targetPath;
    if (!filePath || !filePath.toLowerCase().endsWith('.mkv')) {
      setLog('Nessun file .mkv selezionato.', true);
      return;
    }
    clearLog();
    if (ui.applyMkvTagsBtn) ui.applyMkvTagsBtn.disabled = true;
    try {
      const settings = loadSettings();
      const mkvpropeditPath = settings.mkvpropeditPath || '';
      const encoder = ui.mkvTagsEncoder?.value.trim() || settings.mkvTaggerEncoder || 'SHRI';

      const imdb = ui.mkvTagsImdb?.value.trim() || '';
      const tmdb = ui.mkvTagsTmdb?.value.trim() || '';
      const tvdb = ui.mkvTagsTvdb?.value.trim() || '';
      const title = ui.mkvTagsMkvTitle?.value.trim() || '';

      const xmlContent = buildTagsXml({ imdb, tmdb, tvdb, encoder });

      const tracks = loadedTracks.map((t) => ({
        editSelector: t.editSelector,
        trackNumber: t.trackNumber,
        language: t.language,
        trackTitle: t.trackTitle,
        source: t.source
      }));

      const result = await window.api.mkvApplyTags({
        filePath,
        mkvpropeditPath,
        xmlContent,
        title,
        tracks
      });

      if (!result.ok) {
        setLog(`Errore mkvpropedit: ${result.error}`, true);
      } else {
        setLog('Tag MKV applicati con successo.');
      }
    } catch (err) {
      setLog(`Errore: ${err?.message || err}`, true);
    } finally {
      if (ui.applyMkvTagsBtn) ui.applyMkvTagsBtn.disabled = false;
    }
  }

  async function clearTags() {
    const filePath = state.targetPath;
    if (!filePath || !filePath.toLowerCase().endsWith('.mkv')) {
      setLog('Nessun file .mkv selezionato.', true);
      return;
    }
    clearLog();
    if (ui.clearMkvTagsBtn) ui.clearMkvTagsBtn.disabled = true;
    try {
      const settings = loadSettings();
      const mkvpropeditPath = settings.mkvpropeditPath || '';
      const result = await window.api.mkvClearTags({ filePath, mkvpropeditPath });
      if (!result.ok) {
        setLog(`Errore mkvpropedit: ${result.error}`, true);
      } else {
        setLog('Tag MKV rimossi con successo.');
      }
    } catch (err) {
      setLog(`Errore: ${err?.message || err}`, true);
    } finally {
      if (ui.clearMkvTagsBtn) ui.clearMkvTagsBtn.disabled = false;
    }
  }

  // ── Bind eventi ──────────────────────────────────────────────────────

  function bind() {
    if (ui.clearMkvTagsBtn) {
      ui.clearMkvTagsBtn.addEventListener('click', clearTags);
    }
    if (ui.loadMkvTracksBtn) {
      ui.loadMkvTracksBtn.addEventListener('click', loadTracks);
    }
    if (ui.applyMkvTagsBtn) {
      ui.applyMkvTagsBtn.addEventListener('click', applyTags);
    }
    // Marca come manuale se l'utente scrive direttamente nei campi
    [ui.mkvTagsMkvTitle, ui.mkvTagsImdb, ui.mkvTagsTmdb, ui.mkvTagsTvdb].forEach((el) => {
      if (!el) return;
      el.addEventListener('input', () => {
        el.dataset.manual = 'true';
      });
    });
    // Popola il campo encoder dalla configurazione salvata e salva al cambiamento
    if (ui.mkvTagsEncoder) {
      const initSettings = loadSettings();
      ui.mkvTagsEncoder.value = initSettings.mkvTaggerEncoder || 'SHRI';
      if (saveSettings) {
        ui.mkvTagsEncoder.addEventListener('input', () => {
          const s = loadSettings();
          s.mkvTaggerEncoder = ui.mkvTagsEncoder.value.trim() || 'SHRI';
          saveSettings(s);
        });
      }
    }
    // Aggiorna il titolo MKV quando cambiano title/year nel form principale
    [ui.titleInput, ui.yearInput, ui.includeYear].forEach((el) => {
      if (!el) return;
      el.addEventListener('input', syncTitle);
      el.addEventListener('change', syncTitle);
    });
    // Sync iniziale
    syncTitle();
    syncMetadata();
  }

  function reset() {
    loadedTracks = [];
    if (ui.mkvTagsTracksBody) ui.mkvTagsTracksBody.innerHTML = '';
    if (ui.mkvTagsMkvTitle) { ui.mkvTagsMkvTitle.value = ''; ui.mkvTagsMkvTitle.dataset.manual = 'false'; }
    if (ui.mkvTagsImdb)     { ui.mkvTagsImdb.value = '';     ui.mkvTagsImdb.dataset.manual = 'false'; }
    if (ui.mkvTagsTmdb)     { ui.mkvTagsTmdb.value = '';     ui.mkvTagsTmdb.dataset.manual = 'false'; }
    if (ui.mkvTagsTvdb)     { ui.mkvTagsTvdb.value = '';     ui.mkvTagsTvdb.dataset.manual = 'false'; }
    clearLog();
  }

  return { bind, syncTitle, syncMetadata, loadTracks, reset };
}
