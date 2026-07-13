/* =====================================================
   script.js — Portal Ponto Eletrônico
   ===================================================== */
'use strict';

// ── THEME ──────────────────────────────────────────────
if (typeof window._ppThemeInit === 'undefined') {
  window._ppThemeInit = true;
  window.THEME_KEY = 'pp-theme';
  window.applyTheme = function(isDark) {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  };
  (function () {
    const saved = localStorage.getItem(window.THEME_KEY);
    window.applyTheme(saved === 'dark');
  })();
}

document.addEventListener('DOMContentLoaded', () => {

  // ── THEME TOGGLE ───────────────────────────────────
  // Apenas registra se faq.js ainda não registrou (faq.js carrega antes
  // e agora também seta essa mesma flag — ver faq.js)
  if (!window._ppThemeListenerSet) {
    window._ppThemeListenerSet = true;
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      const isDark = document.documentElement.dataset.theme !== 'dark';
      window.applyTheme(isDark);
      localStorage.setItem(window.THEME_KEY, isDark ? 'dark' : 'light');
    });
  }

  // ── NAVBAR SCROLL ──────────────────────────────────
  const nav = document.querySelector('.site-nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  // ── HAMBURGER ──────────────────────────────────────
  // CORREÇÃO: usar 'click' em vez de 'pointerdown' para funcionar no mobile
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = navLinks.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(open));
      hamburger.innerHTML = open
        ? '<i class="fas fa-times"></i>'
        : '<i class="fas fa-bars"></i>';
    });

    document.addEventListener('click', (e) => {
      if (
        navLinks.classList.contains('open') &&
        !hamburger.contains(e.target) &&
        !navLinks.contains(e.target)
      ) {
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.innerHTML = '<i class="fas fa-bars"></i>';
      }
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.innerHTML = '<i class="fas fa-bars"></i>';
      });
    });
  }

  // ── OS DETECTION ───────────────────────────────────
  updateOSDetection();

  // ── CAROUSEL ───────────────────────────────────────
  initCarousel();

  // ── GLOBAL SEARCH ──────────────────────────────────
  initGlobalSearch();

  // ── CONTENT BLOCKER ────────────────────────────────
  setupContentBlocker();

  // ── STAGGER ANIMATE CARDS ──────────────────────────
  animateOnScroll();
});

// ── UTILS ──────────────────────────────────────────────
function abrirLink(url) {
  window.location.assign(url);
}

// ── OS DETECTION ───────────────────────────────────────
function detectOS() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/Mac/.test(ua) && 'ontouchend' in document) return 'iOS';
  if (/windows phone/i.test(ua)) return 'WindowsPhone';
  if (/Mobile|Tablet|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'Android';
  return 'Desktop';
}

function redirectToAppStore() {
  const os  = detectOS();
  const ios = 'https://apps.apple.com/br/app/forponto-mobile/id6754690842';
  const and = 'https://play.google.com/store/apps/details?id=br.com.tasksistemas.forpontomobile';
  if (os === 'iOS')     { window.open(ios, '_blank', 'noopener,noreferrer'); return; }
  if (os === 'Android') { window.open(and, '_blank', 'noopener,noreferrer'); return; }
  if (confirm('Escolha a plataforma:\nOK = Android (Google Play)\nCancelar = iOS (App Store)')) {
    window.open(and, '_blank', 'noopener,noreferrer');
  } else {
    window.open(ios, '_blank', 'noopener,noreferrer');
  }
}

function updateOSDetection() {
  const el = document.getElementById('osDetection');
  if (!el) return;
  const os = detectOS();
  const map = {
    iOS:         'iOS detectado — toque para ir à App Store',
    Android:     'Android detectado — toque para o Google Play',
    WindowsPhone:'Windows Phone detectado',
    Desktop:     'Acesse via desktop — escolha sua plataforma',
  };
  el.innerHTML = `<small>${map[os] || map.Desktop}</small>`;
}

// ── CAROUSEL ───────────────────────────────────────────
// CORREÇÃO: usar opacity + pointer-events sem translateX conflitante.
// Cada item ocupa 100% com position:absolute para evitar conflito de layout.
let slideIndex  = 0;
let autoSlideId = null;
let isTrans     = false;

function initCarousel() {
  updateCarousel();
  startAutoSlide();
  const wrapper = document.querySelector('.carousel-wrapper');
  if (!wrapper) return;

  wrapper.addEventListener('mouseenter', stopAutoSlide);
  wrapper.addEventListener('mouseleave', startAutoSlide);
  setupTouchNav(wrapper);

  wrapper.setAttribute('tabindex', '0');
  wrapper.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveCarousel(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveCarousel(1); }
  });

  // CORREÇÃO: links clicáveis dentro do carrossel não devem acionar navegação
  wrapper.querySelectorAll('.carousel-image a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

function updateCarousel() {
  if (isTrans) return;
  isTrans = true;
  const items = document.querySelectorAll('.carousel-item');
  const dots  = document.querySelectorAll('.dot');
  if (!items.length) { isTrans = false; return; }

  // CORREÇÃO: não usar translateX — usar apenas opacity + z-index
  items.forEach((item, i) => {
    item.classList.toggle('active', i === slideIndex);
  });
  dots.forEach((dot, i) => dot.classList.toggle('active', i === slideIndex));
  setTimeout(() => { isTrans = false; }, 700);
}

function moveCarousel(dir) {
  if (isTrans) return;
  const total = document.querySelectorAll('.carousel-item').length;
  slideIndex = (slideIndex + dir + total) % total;
  updateCarousel();
  resetAutoSlide();
}

function currentSlide(n) {
  if (isTrans) return;
  slideIndex = n - 1;
  updateCarousel();
  resetAutoSlide();
}

function startAutoSlide()  { if (!autoSlideId) autoSlideId = setInterval(() => moveCarousel(1), 5500); }
function stopAutoSlide()   { clearInterval(autoSlideId); autoSlideId = null; }
function resetAutoSlide()  { stopAutoSlide(); startAutoSlide(); }

function setupTouchNav(el) {
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  // CORREÇÃO: ignorar toque em links
  let touchOnLink = false;

  el.addEventListener('touchstart', e => {
    touchOnLink = !!e.target.closest('a');
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = false;
    stopAutoSlide();
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > dy && dx > 10) isDragging = true;
  }, { passive: true });

  el.addEventListener('touchend', e => {
    if (!touchOnLink && isDragging) {
      const dx = startX - e.changedTouches[0].clientX;
      if (Math.abs(dx) > 40) moveCarousel(dx > 0 ? 1 : -1);
    }
    startAutoSlide();
  }, { passive: true });
}

document.addEventListener('visibilitychange', () => {
  document.hidden ? stopAutoSlide() : startAutoSlide();
});
window.addEventListener('beforeunload', stopAutoSlide);

// ── GLOBAL SEARCH ──────────────────────────────────────
// Indexa todo texto visível da página e navega até o elemento
function initGlobalSearch() {
  const searchBtn    = document.getElementById('globalSearchBtn');
  const searchOverlay = document.getElementById('globalSearchOverlay');
  const searchInput  = document.getElementById('globalSearchInput');
  const searchResults = document.getElementById('globalSearchResults');
  const searchClose  = document.getElementById('globalSearchClose');

  if (!searchBtn || !searchOverlay) return;

  // Abre/fecha
  searchBtn.addEventListener('click', () => openGlobalSearch());
  searchClose?.addEventListener('click', () => closeGlobalSearch());
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeGlobalSearch();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
      if (!searchOverlay.classList.contains('open')) {
        e.preventDefault();
        openGlobalSearch();
      }
    }
    if (e.key === 'Escape' && searchOverlay.classList.contains('open')) {
      closeGlobalSearch();
    }
  });

  // Busca ao digitar
  let searchTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runGlobalSearch(searchInput.value.trim()), 200);
  });
}

function openGlobalSearch() {
  const overlay = document.getElementById('globalSearchOverlay');
  const input   = document.getElementById('globalSearchInput');
  overlay?.classList.add('open');
  setTimeout(() => input?.focus(), 80);
  document.getElementById('globalSearchResults').innerHTML = renderSearchHint();
}

function closeGlobalSearch() {
  const overlay = document.getElementById('globalSearchOverlay');
  const input   = document.getElementById('globalSearchInput');
  overlay?.classList.remove('open');
  if (input) { input.value = ''; }
  document.getElementById('globalSearchResults').innerHTML = '';
}

// Catálogo de seções do site — fácil de expandir
const SITE_INDEX = [
  { label: 'Consultar Ponto',       desc: 'Acesse o sistema oficial de frequência',          url: 'https://pontopmc.contagem.mg.gov.br/forpontoweb/login.aspx', external: true,  icon: 'fa-user-check' },
  { label: 'Calculadora de Desconto', desc: 'Calcule descontos por faltas e ausências',      url: 'calculadora.html',  external: false, icon: 'fa-calculator' },
  { label: 'Processador de Imagens', desc: 'Redimensione imagens para 200×200 px em ZIP',    url: 'imagem.html',       external: false, icon: 'fa-image' },
  { label: 'Central de Ajuda / FAQ', desc: 'Dúvidas frequentes para gestores e servidores',  url: 'faq.html',          external: false, icon: 'fa-question-circle' },
  { label: 'Ajuda — Gestor',         desc: 'FAQ específico para gestores de equipe',          url: 'faq.html#gestor',   external: false, icon: 'fa-user-tie' },
  { label: 'Ajuda — Servidor',       desc: 'FAQ para servidores: login, app, senha',          url: 'faq.html#usuario',  external: false, icon: 'fa-user' },
  { label: 'Baixar App iOS',         desc: 'Forponto Mobile na App Store',                    url: 'https://apps.apple.com/br/app/forponto-mobile/id6754690842', external: true, icon: 'fa-apple' },
  { label: 'Baixar App Android',     desc: 'Forponto Mobile no Google Play',                  url: 'https://play.google.com/store/apps/details?id=br.com.tasksistemas.forpontomobile', external: true, icon: 'fa-google-play' },
  { label: 'Formulário de Cadastro', desc: 'Formulário para se cadastrar no sistema',         url: 'https://docs.google.com/forms/d/1m0rTgm5ouxhic6TAlXV-KwEM3y44AXZzSZkRV71ARn4/viewform', external: true, icon: 'fa-file-alt' },
  { label: 'Curso do Ponto Eletrônico', desc: 'Capacitação na Escola de Governo',            url: 'http://egcontagemead.contagem.mg.gov.br/course/view.php?id=274', external: true, icon: 'fa-graduation-cap' },
  { label: 'Suporte / Contato',      desc: 'E-mail e WhatsApp da equipe de suporte',          url: '#suporte',          external: false, icon: 'fa-headset' },
  { label: 'Secretarias Integradas', desc: 'Lista de secretarias com ponto eletrônico',       url: '#secretarias',      external: false, icon: 'fa-building' },
  { label: 'Painel Gerencial Power BI', desc: 'Dashboard gerencial do ponto eletrônico',     url: '#powerbi',          external: false, icon: 'fa-chart-bar' },
  { label: 'Página Inicial',         desc: 'Voltar para o portal principal',                  url: 'index.html',        external: false, icon: 'fa-home' },
];

function runGlobalSearch(query) {
  const resultsEl = document.getElementById('globalSearchResults');
  if (!resultsEl) return;

  if (!query) {
    resultsEl.innerHTML = renderSearchHint();
    return;
  }

  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const hits = SITE_INDEX.filter(item => {
    const haystack = (item.label + ' ' + item.desc)
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return haystack.includes(q);
  });

  if (!hits.length) {
    resultsEl.innerHTML = `
      <div class="gs-empty">
        <i class="fas fa-search"></i>
        <p>Nenhum resultado para <strong>"${escHtmlSearch(query)}"</strong></p>
        <small>Tente palavras como: calculadora, app, login, senha, gestor, servidor</small>
      </div>`;
    return;
  }

  resultsEl.innerHTML = hits.map(item => `
    <a class="gs-result" href="${item.url}" ${item.external ? 'target="_blank" rel="noopener"' : ''}>
      <span class="gs-icon"><i class="fas ${item.icon}"></i></span>
      <span class="gs-info">
        <span class="gs-label">${highlight(item.label, q)}</span>
        <span class="gs-desc">${highlight(item.desc, q)}</span>
      </span>
      <span class="gs-arrow"><i class="fas fa-arrow-${item.external ? 'up-right-from-square' : 'right'}"></i></span>
    </a>`).join('');

  // Fecha ao clicar no resultado
  resultsEl.querySelectorAll('.gs-result').forEach(r => {
    r.addEventListener('click', () => closeGlobalSearch());
  });
}

function highlight(text, query) {
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escHtmlSearch(text).replace(re, '<mark class="gs-hl">$1</mark>');
}

function escHtmlSearch(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderSearchHint() {
  return `
    <div class="gs-hint">
      <p>Digite para buscar páginas, ferramentas e recursos do portal.</p>
      <div class="gs-suggestions">
        <button class="gs-chip" onclick="document.getElementById('globalSearchInput').value='calculadora';document.getElementById('globalSearchInput').dispatchEvent(new Event('input'))">Calculadora</button>
        <button class="gs-chip" onclick="document.getElementById('globalSearchInput').value='app';document.getElementById('globalSearchInput').dispatchEvent(new Event('input'))">App</button>
        <button class="gs-chip" onclick="document.getElementById('globalSearchInput').value='gestor';document.getElementById('globalSearchInput').dispatchEvent(new Event('input'))">Gestor</button>
        <button class="gs-chip" onclick="document.getElementById('globalSearchInput').value='servidor';document.getElementById('globalSearchInput').dispatchEvent(new Event('input'))">Servidor</button>
        <button class="gs-chip" onclick="document.getElementById('globalSearchInput').value='imagem';document.getElementById('globalSearchInput').dispatchEvent(new Event('input'))">Imagens</button>
        <button class="gs-chip" onclick="document.getElementById('globalSearchInput').value='suporte';document.getElementById('globalSearchInput').dispatchEvent(new Event('input'))">Suporte</button>
      </div>
    </div>`;
}

// ── SCROLL ANIMATION ───────────────────────────────────
function animateOnScroll() {
  const cards = document.querySelectorAll('.action-card');
  if (!cards.length) return;

  if (!('IntersectionObserver' in window)) {
    cards.forEach(c => { c.style.opacity = '1'; c.style.transform = 'none'; });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const idx = Array.from(cards).indexOf(entry.target);
        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, idx * 55);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.06 });

  cards.forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    observer.observe(card);
  });
}

// ── CONTENT BLOCKER ────────────────────────────────────
function setupContentBlocker() {
  // drive.google.com e app.powerbi.com já eram permitidos; youtube/vimeo
  // liberados para os vídeos embutidos gerados por formatResposta() (faq.js)
  const ALLOWED_IFRAMES = ['drive.google.com', 'app.powerbi.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'];

  function cleanNode(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('.web-floating-button, iframe[src*="websim"]')) { node.remove(); return; }
    if (node.tagName === 'IFRAME') {
      try {
        const hostname = new URL(node.src).hostname;
        if (!ALLOWED_IFRAMES.includes(hostname)) node.remove();
      } catch (_) {}
      return;
    }
    node.querySelectorAll?.('.web-floating-button, iframe[src*="websim"], iframe').forEach(el => {
      if (el.tagName === 'IFRAME') {
        try {
          if (!ALLOWED_IFRAMES.includes(new URL(el.src).hostname)) el.remove();
        } catch (_) {}
      } else { el.remove(); }
    });
  }

  cleanNode(document.body);
  new MutationObserver(mutations => {
    for (const m of mutations) for (const node of m.addedNodes) cleanNode(node);
  }).observe(document.body, { childList: true, subtree: true });
}
