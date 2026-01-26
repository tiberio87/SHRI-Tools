export function createFeedbackTools({ ui }) {
  let toastTimer = null;
  let toastHideTimer = null;
  let confirmResolver = null;

  function showToast(message) {
    if (!ui.toast) {
      return;
    }

    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    if (toastHideTimer) {
      clearTimeout(toastHideTimer);
    }

    ui.toast.textContent = message;
    ui.toast.classList.remove('hidden');
    requestAnimationFrame(() => {
      ui.toast.classList.add('show');
    });

    toastTimer = setTimeout(() => {
      ui.toast.classList.remove('show');
      toastHideTimer = setTimeout(() => {
        ui.toast.classList.add('hidden');
      }, 220);
    }, 2400);
  }

  async function copyToClipboard(text, successMessage) {
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage || 'Copiato negli appunti.');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      showToast(successMessage || 'Copiato negli appunti.');
    }
  }

  function closeConfirmModal() {
    if (!ui.confirmModal) {
      return;
    }
    ui.confirmModal.classList.add('hidden');
  }

  function openConfirmModal(message, options = {}) {
    if (!ui.confirmModal || !ui.confirmMessage) {
      return Promise.resolve(false);
    }
    if (options.html) {
      ui.confirmMessage.innerHTML = message;
    } else {
      ui.confirmMessage.textContent = message;
    }
    if (typeof options.onOpen === 'function') {
      options.onOpen();
    }
    ui.confirmModal.classList.remove('hidden');
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function resolveConfirm(value) {
    if (confirmResolver) {
      confirmResolver(value);
      confirmResolver = null;
    }
    closeConfirmModal();
  }

  function bindConfirmHandlers() {
    if (ui.confirmCancelBtn) {
      ui.confirmCancelBtn.addEventListener('click', () => resolveConfirm(false));
    }
    if (ui.confirmOkBtn) {
      ui.confirmOkBtn.addEventListener('click', () => resolveConfirm(true));
    }
    if (ui.confirmModal) {
      ui.confirmModal.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal-backdrop')) {
          resolveConfirm(false);
        }
      });
    }
  }

  return { showToast, copyToClipboard, openConfirmModal, resolveConfirm, bindConfirmHandlers };
}
