export function createFeedbackTools({ ui }) {
  let toastTimer = null;
  let toastHideTimer = null;
  let confirmResolver = null;
  let choiceResolver = null;

  function showToast(message, tone = 'info') {
    if (!ui.toast) {
      return;
    }

    const allowedTones = new Set(['info', 'success', 'warning', 'error']);
    const safeTone = allowedTones.has(tone) ? tone : 'info';

    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    if (toastHideTimer) {
      clearTimeout(toastHideTimer);
    }

    ui.toast.textContent = message;
    ui.toast.classList.remove('toast-info', 'toast-success', 'toast-warning', 'toast-error');
    ui.toast.classList.add(`toast-${safeTone}`);
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
      showToast(successMessage || 'Copiato negli appunti.', 'success');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      showToast(successMessage || 'Copiato negli appunti.', 'success');
    }
  }

  function closeConfirmModal() {
    if (!ui.confirmModal) {
      return;
    }
    ui.confirmModal.classList.add('hidden');
  }

  function closeChoiceModal() {
    if (!ui.choiceModal) {
      return;
    }
    ui.choiceModal.classList.add('hidden');
    if (ui.choiceButtons) {
      ui.choiceButtons.innerHTML = '';
    }
  }

  function openChoiceModal(title, message, choices) {
    if (!ui.choiceModal || !ui.choiceMessage || !ui.choiceButtons) {
      return Promise.resolve(null);
    }
    if (ui.choiceModalTitle) {
      ui.choiceModalTitle.textContent = title;
    }
    ui.choiceMessage.innerHTML = message;
    ui.choiceButtons.innerHTML = '';
    for (const choice of choices) {
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = choice.label;
      btn.addEventListener('click', () => resolveChoice(choice.value));
      ui.choiceButtons.appendChild(btn);
    }
    ui.choiceModal.classList.remove('hidden');
    return new Promise((resolve) => {
      choiceResolver = resolve;
    });
  }

  function resolveChoice(value) {
    if (choiceResolver) {
      choiceResolver(value);
      choiceResolver = null;
    }
    closeChoiceModal();
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
    if (ui.choiceCancelBtn) {
      ui.choiceCancelBtn.addEventListener('click', () => resolveChoice(null));
    }
    if (ui.choiceModal) {
      ui.choiceModal.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal-backdrop')) {
          resolveChoice(null);
        }
      });
    }
  }

  return { showToast, copyToClipboard, openConfirmModal, openChoiceModal, resolveConfirm, bindConfirmHandlers };
}
