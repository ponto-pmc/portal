'use strict';

let installEvent = null;
const installButton = document.getElementById('installPortal');
const installHelp = document.getElementById('installHelp');

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function showInstallHelp(message) {
  if (!installHelp) return;
  installHelp.textContent = message;
  installHelp.hidden = !message;
}

function updateInstallButton() {
  if (!installButton) return;
  installButton.hidden = isStandalone();
  if (isStandalone()) {
    showInstallHelp('');
    return;
  }
  installButton.innerHTML = installEvent
    ? '<i class="fas fa-download" aria-hidden="true"></i> Instalar Portal'
    : '<i class="fas fa-mobile-screen-button" aria-hidden="true"></i> Como instalar';
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent = event;
  updateInstallButton();
  showInstallHelp('');
});

window.addEventListener('appinstalled', () => {
  installEvent = null;
  if (installButton) installButton.hidden = true;
  showInstallHelp('');
});

window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateInstallButton);

installButton?.addEventListener('click', async () => {
  if (installEvent) {
    const event = installEvent;
    installEvent = null;
    try {
      await event.prompt();
      await event.userChoice;
    } catch (error) {
      console.warn('Não foi possível abrir a instalação:', error);
    }
    updateInstallButton();
    return;
  }

  const ua = navigator.userAgent || '';
  const ios = /iP(hone|ad|od)/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|TikTok|Bytedance|Line\//i.test(ua);

  if (inApp) {
    showInstallHelp(ios
      ? 'Abra esta página no Safari. Depois toque em Compartilhar → Adicionar à Tela de Início.'
      : 'Abra esta página no Chrome. Depois use o menu do navegador → Instalar app ou Adicionar à tela inicial.');
  } else if (ios) {
    showInstallHelp('No Safari, toque em Compartilhar → Adicionar à Tela de Início.');
  } else if (android) {
    showInstallHelp('No menu do navegador, escolha Instalar app ou Adicionar à tela inicial.');
  } else {
    showInstallHelp('No menu do navegador, escolha Instalar aplicativo ou Adicionar à tela inicial, se disponível.');
  }
});

updateInstallButton();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' }).catch((error) => {
      console.warn('Service worker indisponível:', error);
    });
  });
}
