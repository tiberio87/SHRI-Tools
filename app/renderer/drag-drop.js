export function setupSourceDragDrop({ ui, showToast, loadPath }) {
  if (!ui?.sourceSection) {
    return;
  }

  let dragDepth = 0;
  const resetDrag = () => {
    dragDepth = 0;
    ui.sourceSection.classList.remove('drag-active');
  };
  const uriToPath = (uri) => {
    if (!uri) {
      return '';
    }
    try {
      const url = new URL(uri);
      if (url.protocol === 'file:') {
        let filePath = decodeURIComponent(url.pathname || '');
        if (/^\/[A-Za-z]:/.test(filePath)) {
          filePath = filePath.slice(1);
        }
        return filePath.replace(/\//g, '\\');
      }
    } catch {
      // Ignore invalid URL
    }
    if (/^[A-Za-z]:[\\/]/.test(uri)) {
      return uri;
    }
    return '';
  };
  const getDropPath = async (event) => {
    const files = event.dataTransfer?.files;
    let path = files && files.length ? files[0].path : '';
    if (!path && event.dataTransfer?.items?.length) {
      const item = event.dataTransfer.items[0];
      const file = item.getAsFile?.();
      path = file?.path || '';
    }
    if (!path && files && files.length && window.api?.getFilePath) {
      try {
        path = await window.api.getFilePath(files[0]);
      } catch {
        // ignore
      }
    }
    if (!path && event.dataTransfer) {
      const uriList = event.dataTransfer.getData('text/uri-list') || '';
      const text = event.dataTransfer.getData('text/plain') || '';
      const raw = uriList || text;
      const firstLine = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'));
      path = uriToPath(firstLine || '');
    }
    return path;
  };

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  document.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    const items = event.dataTransfer?.items;
    const firstFile = files?.length ? files[0] : null;
    const firstItem = items?.length ? items[0] : null;
  });

  ui.sourceSection.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    ui.sourceSection.classList.add('drag-active');
  });

  ui.sourceSection.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  ui.sourceSection.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      ui.sourceSection.classList.remove('drag-active');
    }
  });

  ui.sourceSection.addEventListener('drop', async (event) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    const items = event.dataTransfer?.items;
    const firstFile = files?.length ? files[0] : null;
    const firstItem = items?.length ? items[0] : null;
    const path = await getDropPath(event);
    if (!path) {
      showToast('Drag & drop non disponibile, usa Seleziona file/cartella.', 'warning');
      resetDrag();
      return;
    }
    await loadPath(path);
    resetDrag();
  });
}
