// Shared keyboard behavior for navigation and open dialogs.
document.addEventListener('keydown', (event) => {
  const menu = document.getElementById('navLinks');
  const hamburger = document.getElementById('hamburger');
  if (event.key === 'Escape' && menu?.classList.contains('open')) {
    menu.classList.remove('open');
    hamburger?.setAttribute('aria-expanded', 'false');
    hamburger?.setAttribute('aria-label', 'Abrir menu');
    hamburger?.focus();
    event.stopImmediatePropagation();
    return;
  }

  if (event.key !== 'Tab') return;
  const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
  const dialog = dialogs.reverse().find(el => el.getClientRects().length && !el.hidden && !el.inert);
  if (!dialog) return;
  const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.getClientRects().length && !el.closest('[inert]'));
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
}, true);

const themeButton = document.getElementById('themeToggle');
if (themeButton) {
  const syncThemeName = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    themeButton.setAttribute('aria-label', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
  };
  syncThemeName();
  new MutationObserver(syncThemeName).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

const navButton = document.getElementById('hamburger');
if (navButton) {
  const syncNavName = () => navButton.setAttribute('aria-label', navButton.getAttribute('aria-expanded') === 'true' ? 'Fechar menu' : 'Abrir menu');
  syncNavName();
  new MutationObserver(syncNavName).observe(navButton, { attributes: true, attributeFilter: ['aria-expanded'] });
}
