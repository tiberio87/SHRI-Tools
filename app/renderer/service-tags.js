import { DEFAULT_GROUP_TAGS } from './constants.js';

const DEFAULT_SERVICES = [];
let serviceDefaultsLoaded = false;

function parseServiceList(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let label = '';
      let code = '';
      if (line.includes('=')) {
        [label, code] = line.split('=');
      } else if (line.includes('|')) {
        [label, code] = line.split('|');
      } else if (line.includes(':')) {
        [label, code] = line.split(':');
      } else {
        code = line;
        label = line;
      }
      label = (label || '').trim();
      code = (code || '').trim();
      if (!code) {
        return null;
      }
      return { label: label || code, code };
    })
    .filter(Boolean);
}

function parseSimpleList(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function createServiceTagTools({ ui, state, logDebug, metadataTools }) {
  async function loadServiceDefaults() {
    if (serviceDefaultsLoaded) {
      return DEFAULT_SERVICES;
    }
    try {
      let data = [];
      if (window.api?.readServices) {
        const result = await window.api.readServices();
        if (result?.ok) {
          data = Array.isArray(result.data) ? result.data : [];
        } else {
          throw new Error(result?.error || 'read-services failed');
        }
      } else {
        const response = await fetch('services.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const fallback = await response.json();
        data = Array.isArray(fallback) ? fallback : [];
      }
      DEFAULT_SERVICES.splice(0, DEFAULT_SERVICES.length, ...data);
      serviceDefaultsLoaded = true;
      logDebug?.('services.json loaded', { count: DEFAULT_SERVICES.length });
    } catch (error) {
      serviceDefaultsLoaded = true;
      logDebug?.('services.json load failed', String(error));
    }
    return DEFAULT_SERVICES;
  }

  function buildServiceOptions(settings) {
    const map = new Map();
    for (const service of DEFAULT_SERVICES) {
      map.set(service.code, service.label);
    }
    const custom = parseServiceList(settings?.serviceList || '');
    for (const service of custom) {
      map.set(service.code, service.label);
    }
    return [...map.entries()].map(([code, label]) => ({ code, label }));
  }

  function updateServiceOptions(settings) {
    if (!ui.serviceInput || !ui.serviceDropdownMenu || !ui.serviceInputBtn) {
      return;
    }
    const current = ui.serviceInput.value;
    const options = buildServiceOptions(settings);
    ui.serviceDropdownMenu.innerHTML = '';

    const blank = document.createElement('button');
    blank.type = 'button';
    blank.className = 'dropdown-item';
    blank.dataset.value = '';
    blank.textContent = 'Seleziona servizio';
    ui.serviceDropdownMenu.appendChild(blank);

    for (const option of options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item';
      item.dataset.value = option.code;
      item.textContent = `${option.label} (${option.code})`;
      ui.serviceDropdownMenu.appendChild(item);
    }
    const currentOption = options.find((option) => option.code === current);
    if (currentOption) {
      ui.serviceInput.value = current;
      ui.serviceInputBtn.textContent = `${currentOption.label} (${currentOption.code})`;
    } else {
      ui.serviceInput.value = '';
      ui.serviceInputBtn.textContent = 'Seleziona servizio';
    }
  }

  function updateTagOptions(settings) {
    if (!ui.tagDropdownMenu || !ui.tagInputBtn || !ui.tagInput) {
      return;
    }
    const tags = parseSimpleList(settings?.tagList || '');
    const unique = [...new Set(tags)];
    const suggestion = state.tagSuggestion || '';
    const autoDetect = settings?.autoTagDetect !== false;
    ui.tagDropdownMenu.innerHTML = '';

    const blank = document.createElement('button');
    blank.type = 'button';
    blank.className = 'dropdown-item';
    blank.dataset.value = '';
    if (!unique.length) {
      blank.dataset.disabled = 'true';
      blank.classList.add('disabled');
      blank.textContent = 'Aggiungili nelle Impostazioni';
    } else {
      blank.textContent = 'Seleziona tag gruppo';
    }
    ui.tagDropdownMenu.appendChild(blank);

    for (const tag of unique) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item';
      item.dataset.value = tag;
      item.textContent = tag;
      ui.tagDropdownMenu.appendChild(item);
    }

    const manual = ui.tagInput.dataset.manual === 'true';
    const current = ui.tagInput.value;
    const currentInList = current && unique.includes(current);

    if (autoDetect && suggestion && !manual) {
      ui.tagInput.value = suggestion;
      ui.tagInput.dataset.manual = 'false';
      ui.tagInputBtn.textContent = `Rilevato: ${suggestion}`;
      return;
    }

    if (!autoDetect && !currentInList) {
      ui.tagInput.value = '';
      ui.tagInput.dataset.manual = 'false';
    }

    if (currentInList) {
      ui.tagInputBtn.textContent = current;
      return;
    }

    if (!unique.length) {
      ui.tagInputBtn.textContent = suggestion && autoDetect
        ? `Rilevato: ${suggestion}`
        : 'Aggiungili nelle Impostazioni';
      return;
    }

    ui.tagInputBtn.textContent = suggestion && autoDetect
      ? `Rilevato: ${suggestion}`
      : 'Seleziona tag gruppo';
  }

  function buildKnownGroupTags(settings) {
    const map = new Map();
    for (const tag of DEFAULT_GROUP_TAGS) {
      const clean = String(tag || '').trim();
      if (clean) {
        map.set(clean.toUpperCase(), clean);
      }
    }
    const custom = parseSimpleList(settings?.tagList || '');
    for (const tag of custom) {
      const clean = String(tag || '').trim();
      if (clean) {
        map.set(clean.toUpperCase(), clean);
      }
    }
    return [...map.values()];
  }

  function updateTagSuggestion(settings) {
    const allowNoGroup = settings?.autoNoGroupTag !== false;
    const path = state.kind === 'tracker'
      ? (state.mainVideo || state.trackerName || state.targetPath)
      : (state.mainVideo || state.targetPath);
    if (!path) {
      state.tagSuggestion = '';
      return;
    }
    state.tagSuggestion = metadataTools.extractGroupTagFromName(
      path,
      buildKnownGroupTags(settings),
      { allowNoGroup }
    );
    if (!state.tagSuggestion && allowNoGroup) {
      const raw = String(path || '');
      const looksLikeGroup = /[-_.]\s*[A-Za-z0-9]{2,}$/.test(raw);
      if (!looksLikeGroup) {
        state.tagSuggestion = 'NoGroup';
      }
    }
    if (state.tagSuggestion !== state.lastTagSuggestion) {
      logDebug?.('tag suggestion', {
        path,
        suggestion: state.tagSuggestion,
        settingsAuto: settings?.autoTagDetect !== false
      });
      state.lastTagSuggestion = state.tagSuggestion;
    }
  }

  return {
    parseSimpleList,
    loadServiceDefaults,
    buildServiceOptions,
    updateServiceOptions,
    updateTagOptions,
    updateTagSuggestion
  };
}
