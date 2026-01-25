export function createLogger({ debugState, ui }) {
  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
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
    const details = data !== undefined ? ` ${safeStringify(data)}` : '';
    const line = `[${stamp}] ${message}${details}`;
    debugState.buffer.push(line);
    if (debugState.buffer.length > debugState.maxEntries) {
      debugState.buffer.shift();
    }
    updateDebugLogView();
  }

  return { logDebug, updateDebugLogView };
}
