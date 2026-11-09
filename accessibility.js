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

// Os diálogos recebem foco, isolam o conteúdo de fundo e devolvem o foco ao acionador.
(() => {
  const selector = 'dialog, [role="dialog"][aria-modal="true"]';
  const visible = element => !element.hidden && !element.inert && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden'
    && (element.tagName !== 'DIALOG' || element.open);
  const controls = dialog => [...dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter(element => visible(element) && !element.closest('[inert]'));
  let current = null;
  let opener = null;
  let lastTrigger = document.activeElement;
  const isolated = new Map();
  document.addEventListener('click', event => {
    if (!event.target.closest(selector)) lastTrigger = event.target.closest('button, a, [tabindex]') || document.activeElement;
  }, true);
  document.addEventListener('focusin', event => {
    if (!event.target.closest(selector)) lastTrigger = event.target;
  });
  function release() {
    for (const [element, wasInert] of isolated) if (element.inert !== wasInert) element.inert = wasInert;
    isolated.clear();
  }
  function sync() {
    // Fundo isolado por este gerenciador não impede descobrir um diálogo nativo novo.
    const dialogs = [...document.querySelectorAll(selector)].filter(visible);
    const next = dialogs.filter(el => el.tagName === 'DIALOG').at(-1) || dialogs.at(-1) || null;
    if (next === current) return;
    const old = current;
    release();
    current = next;
    if (!next) {
      if (opener?.isConnected && visible(opener)) opener.focus({ preventScroll: true });
      opener = null;
      return;
    }
    if (!old) opener = lastTrigger;
    for (let branch = next; branch && branch !== document.body; branch = branch.parentElement) {
      for (const sibling of branch.parentElement?.children || []) {
        if (sibling === branch || /^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) continue;
        isolated.set(sibling, sibling.inert);
        if (!sibling.inert) sibling.inert = true;
      }
    }
    if (!next.contains(document.activeElement)) {
      if (!next.hasAttribute('tabindex')) next.tabIndex = -1;
      (next.querySelector('[autofocus]') || controls(next)[0] || next).focus({ preventScroll: true });
    }
  }
  new MutationObserver(sync).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open', 'style', 'class', 'inert'] });
  document.addEventListener('keydown', event => {
    if (!current || !visible(current)) return;
    if (event.key === 'Escape') {
      const close = current.querySelector('#chatCloseBtn, #camCancel, .app-modal-close, [data-tour="skip"], [aria-label^="Fechar"]');
      if (current.tagName === 'DIALOG' || close) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (current.tagName === 'DIALOG') current.close();
        else close.click();
      }
    }
    if (event.key === 'Tab') {
      const items = controls(current);
      const first = items[0] || current, last = items.at(-1) || current;
      if (!items.length || !current.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  }, true);
  sync();
})();
