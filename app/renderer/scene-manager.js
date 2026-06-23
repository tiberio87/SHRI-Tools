// Scene-release detection orchestration for the renderer. Calls the main process
// (window.api.detectScene) and reflects the result into shared state + the UI.
// When a scene release is detected, the exact scene name becomes the upload
// title (handled in upload-kit buildUploadTitleBase reading state.sceneInfo).

import { state } from './state.js';

export function createSceneManager(deps) {
  const {
    ui,
    logDebug,
    showToast,
    loadSettings,
    isDiscStructure,
    refreshMainUploadTitle
  } = deps;

  function getPathBaseName(value) {
    const str = String(value || '');
    const idx = Math.max(str.lastIndexOf('/'), str.lastIndexOf('\\'));
    return idx >= 0 ? str.slice(idx + 1) : str;
  }

  function computeReleaseBase() {
    const isDisc = typeof isDiscStructure === 'function' && isDiscStructure();
    // Disc structures keep the release name in the folder, not the inner m2ts.
    const selected = isDisc
      ? (state.targetPath || state.mainVideo || '')
      : (state.mainVideo || state.targetPath || '');
    return { base: getPathBaseName(selected), isDisc };
  }

  function normalizeImdb(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const digits = String(value).replace(/^tt/i, '').replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : null;
  }

  function updateSceneIndicator() {
    if (!ui.sceneIndicator) {
      return;
    }
    const info = state.sceneInfo;
    if (info && info.scene && info.sceneName) {
      ui.sceneIndicator.classList.remove('hidden');
      if (ui.sceneNameText) {
        const src = info.source ? ` (${info.source})` : '';
        ui.sceneNameText.textContent = `${info.sceneName}${src}`;
      }
      if (ui.openSceneNfoBtn) {
        ui.openSceneNfoBtn.classList.toggle('hidden', !info.nfoPath);
      }
    } else {
      ui.sceneIndicator.classList.add('hidden');
      if (ui.sceneNameText) {
        ui.sceneNameText.textContent = '';
      }
      if (ui.openSceneNfoBtn) {
        ui.openSceneNfoBtn.classList.add('hidden');
      }
    }
  }

  function resetScene() {
    state.sceneInfo = null;
    updateSceneIndicator();
  }

  async function runSceneDetection() {
    if (!state.targetPath) {
      return;
    }
    const settings = loadSettings?.() || {};
    if (settings.sceneDetect === false) {
      resetScene();
      return;
    }
    const { base, isDisc } = computeReleaseBase();
    if (!base) {
      resetScene();
      return;
    }
    const payload = {
      base,
      isDisc,
      keepFolder: false,
      filename: state.metadata?.title ? String(state.metadata.title) : '',
      tag: state.tagSuggestion || '',
      imdbId: normalizeImdb(state.metadata?.imdbId),
      imdbManual: false,
      checkPredb: true,
      wantNfo: true
    };
    try {
      logDebug?.('scene: detect start', { base, isDisc });
      const res = await window.api.detectScene(payload);
      if (res && res.ok && res.scene) {
        state.sceneInfo = {
          scene: true,
          sceneName: res.sceneName || '',
          imdb: res.imdb || null,
          source: res.source || '',
          nfoPath: res.nfoPath || '',
          nfo: Boolean(res.nfo),
          tag: res.tag || '',
          needTag: Boolean(res.needTag)
        };
        // Mirror a resolved IMDb id into metadata if we didn't have one.
        if (res.imdb && state.metadata && !state.metadata.imdbId) {
          state.metadata.imdbId = String(res.imdb);
        }
        logDebug?.('scene: detected', state.sceneInfo);
        refreshMainUploadTitle?.();
        showToast?.(`Scene rilevata: ${res.sceneName}`, 'success');
      } else {
        state.sceneInfo = null;
        if (res && res.ok === false && res.error) {
          logDebug?.('scene: error', { error: res.error });
        } else {
          logDebug?.('scene: no match', {});
        }
      }
    } catch (err) {
      state.sceneInfo = null;
      logDebug?.('scene: exception', { error: String(err?.message || err) });
    }
    updateSceneIndicator();
  }

  function initSceneEvents() {
    if (ui.openSceneNfoBtn) {
      ui.openSceneNfoBtn.addEventListener('click', () => {
        const nfoPath = state.sceneInfo?.nfoPath;
        if (nfoPath) {
          window.api.openPath(nfoPath);
        }
      });
    }
  }

  return {
    runSceneDetection,
    resetScene,
    updateSceneIndicator,
    initSceneEvents
  };
}
