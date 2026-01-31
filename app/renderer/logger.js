export function createLogger({ debugState, ui }) {
  const SENSITIVE_KEY_PATTERN = /(api[_-]?key|apikey|passkey|token|password|secret|authorization)/i;

  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function maskValue(value) {
    if (typeof value !== 'string') {
      return '[redacted]';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.length <= 8) {
      return `${trimmed.slice(0, 2)}••`;
    }
    return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
  }

  function sanitizeForLog(value, seen = new WeakMap()) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value !== 'object') {
      return value;
    }
    if (seen.has(value)) {
      return '[circular]';
    }
    if (Array.isArray(value)) {
      seen.set(value, true);
      return value.map((item) => sanitizeForLog(item, seen));
    }
    const output = {};
    seen.set(value, output);
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = maskValue(val);
        continue;
      }
      output[key] = sanitizeForLog(val, seen);
    }
    return output;
  }

  function updateDebugLogView() {
    if (!ui.debugLogText) {
      return;
    }
    ui.debugLogText.textContent = debugState.buffer.length
      ? debugState.buffer.join('\n')
      : 'Nessun log.';
  }

  function logDebug(message, data) {
    if (!debugState.enabled) {
      return;
    }
    const stamp = new Date().toISOString().slice(11, 19);
    const details = data !== undefined ? ` ${safeStringify(sanitizeForLog(data))}` : '';
    const line = `[${stamp}] ${message}${details}`;
    debugState.buffer.push(line);
    if (debugState.buffer.length > debugState.maxEntries) {
      debugState.buffer.shift();
    }
    updateDebugLogView();
  }

  return { logDebug, updateDebugLogView };
}
