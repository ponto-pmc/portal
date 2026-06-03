/* =====================================================
   script.js — Portal Ponto Eletrônico
   ===================================================== */
'use strict';

// ── THEME ──────────────────────────────────────────────
const THEME_KEY = 'pp-theme';

function applyTheme(isDark) {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  const icon = document.getElementById('themeIcon');
  if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

// Apply theme before DOMContentLoaded to avoid flash
(function () {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'dark');
})();

document.addEventListener('DOMContentLoaded', () => {

  // ── THEME TOGGLE ───────────────────────────────────
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme !== 'dark';
    applyTheme(isDark);
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  }, { passive: true });

  // ── NAVBAR SCROLL ──────────────────────────────────
  const nav = document.querySelector('.site-nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  // ── HAMBURGER ──────────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');

  if (hamburger && navLinks) {
    hamburger.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const open = navLinks.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(open));
      hamburger.innerHTML = open
        ? '<i class="fas fa-times"></i>'
        : '<i class="fas fa-bars"></i>';
    });

    document.addEventListener('pointerdown', (e) => {
      if (
        navLinks.classList.contains('open') &&
        !hamburger.contains(e.target) &&
        !navLinks.contains(e.target)
      ) {
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.innerHTML = '<i class="fas fa-bars"></i>';
      }
    }, { passive: true });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.innerHTML = '<i class="fas fa-bars"></i>';
      }, { passive: true });
    });
  }

  // ── OS DETECTION ───────────────────────────────────
  updateOSDetection();

  // ── CAROUSEL ───────────────────────────────────────
  initCarousel();

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
}

function updateCarousel() {
  if (isTrans) return;
  isTrans = true;
  const items = document.querySelectorAll('.carousel-item');
  const dots  = document.querySelectorAll('.dot');
  const track = document.getElementById('carouselTrack');
  if (!items.length || !track) { isTrans = false; return; }
  items.forEach((item, i) => item.classList.toggle('active', i === slideIndex));
  dots.forEach((dot, i) => dot.classList.toggle('active', i === slideIndex));
  track.style.transform = `translateX(${-slideIndex * 100}%)`;
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

  el.addEventListener('touchstart', e => {
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
    if (isDragging) {
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
  const ALLOWED_IFRAMES = ['drive.google.com', 'app.powerbi.com'];

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