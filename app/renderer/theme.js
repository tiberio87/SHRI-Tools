export function createThemeTools({ ui, storageKey }) {
  function updateThemeToggleLabel() {
    if (!ui.themeToggle) {
      return;
    }
    const useLight = document.body.classList.contains('light');
    ui.themeToggle.setAttribute(
      'aria-label',
      useLight ? 'Attiva tema scuro' : 'Attiva tema chiaro'
    );
  }

  function applyTheme(theme) {
    const useLight = theme === 'light';
    document.body.classList.toggle('light', useLight);
    updateThemeToggleLabel();
  }

  function loadTheme() {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    return 'dark';
  }

  function saveTheme(theme) {
    localStorage.setItem(storageKey, theme);
  }

  return { applyTheme, loadTheme, saveTheme };
}
