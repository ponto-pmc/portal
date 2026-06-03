/* =====================================================
   imagem.js — Processador de Imagens
   ES Module · pica + jszip
   ===================================================== */
'use strict';

import pica   from 'pica';
import JSZip  from 'jszip';

// ── THEME ──────────────────────────────────────────────
// faq.js já pode ter definido estas funções — reutiliza se existir
if (typeof window._ppThemeInit === 'undefined') {
  window._ppThemeInit = true;
  window.THEME_KEY = 'pp-theme';
  window.applyTheme = function(isDark) {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  };
  (function () {
    const s = localStorage.getItem(window.THEME_KEY);
    window.applyTheme(s === 'dark');
  })();
}

// ── STATE ──────────────────────────────────────────────
let selectedFiles = [];
const TARGET_W = 200;
const TARGET_H = 200;
const picaInst = pica();

// ── DOM READY ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Theme toggle
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme !== 'dark';
    window.applyTheme(isDark);
    localStorage.setItem(window.THEME_KEY, isDark ? 'dark' : 'light');
  }, { passive: true });

  // Navbar scroll
  const nav = document.querySelector('.site-nav');
  if (nav) window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 10), { passive: true });

  // Hamburger
  const hb = document.getElementById('hamburger');
  const nl = document.getElementById('navLinks');
  if (hb && nl) {
    hb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const open = nl.classList.toggle('open');
      hb.setAttribute('aria-expanded', String(open));
      hb.innerHTML = open ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
    });
    document.addEventListener('pointerdown', (e) => {
      if (nl.classList.contains('open') && !hb.contains(e.target) && !nl.contains(e.target)) {
        nl.classList.remove('open');
        hb.setAttribute('aria-expanded', 'false');
        hb.innerHTML = '<i class="fas fa-bars"></i>';
      }
    }, { passive: true });
  }

  // Upload zone
  const uploadArea   = document.getElementById('uploadArea');
  const fileInput    = document.getElementById('fileInput');
  const selectButton = document.getElementById('selectButton');

  selectButton?.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  uploadArea?.addEventListener('click', () => fileInput.click());

  uploadArea?.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea?.addEventListener('dragleave', ()  => uploadArea.classList.remove('dragover'));
  uploadArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    addFiles(Array.from(e.dataTransfer.files));
  });

  fileInput?.addEventListener('change', () => {
    addFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });

  document.getElementById('addMoreButton')?.addEventListener('click', () => fileInput.click());
  document.getElementById('clearButton')?.addEventListener('click', clearAll);
  document.getElementById('clearButtonResult')?.addEventListener('click', clearAll);
  document.getElementById('processButton')?.addEventListener('click', processImages);
  document.getElementById('retryButton')?.addEventListener('click', () => {
    showPanel('fileList');
  });

  // Content blocker
  setupContentBlocker();
});

// ── FILE MANAGEMENT ────────────────────────────────────
function addFiles(files) {
  const valid = files.filter(f => f.type.startsWith('image/'));
  if (!valid.length) { showNotification('Nenhuma imagem válida selecionada.', 'error'); return; }
  selectedFiles = [...selectedFiles, ...valid];
  renderPreviews();
  showPanel('fileList');
}

function renderPreviews() {
  const grid  = document.getElementById('previewImages');
  const count = document.getElementById('filesCount');
  if (!grid) return;
  grid.innerHTML = '';
  count.textContent = `${selectedFiles.length} arquivo${selectedFiles.length !== 1 ? 's' : ''}`;

  selectedFiles.forEach((file, idx) => {
    const url   = URL.createObjectURL(file);
    const thumb = document.createElement('div');
    thumb.className = 'img-thumb';
    thumb.innerHTML = `
      <img src="${url}" alt="${file.name}" onload="URL.revokeObjectURL(this.src)" />
      <button class="img-remove" onclick="removeFile(${idx})" aria-label="Remover ${file.name}">
        <i class="fas fa-times"></i>
      </button>`;
    grid.appendChild(thumb);
  });
}

window.removeFile = function (idx) {
  selectedFiles.splice(idx, 1);
  if (!selectedFiles.length) { clearAll(); return; }
  renderPreviews();
};

function clearAll() {
  selectedFiles = [];
  document.getElementById('previewImages').innerHTML = '';
  showPanel('upload');
}

// ── PANEL SWITCHER ─────────────────────────────────────
function showPanel(name) {
  const ids = ['uploadArea', 'fileList', 'progressSection', 'resultSection', 'errorSection'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const map = {
    upload:   'uploadArea',
    fileList: 'fileList',
    progress: 'progressSection',
    result:   'resultSection',
    error:    'errorSection',
  };
  const target = document.getElementById(map[name]);
  if (target) target.style.display = name === 'fileList' ? 'block' : (name === 'upload' ? 'block' : 'block');
}

// ── PROGRESS ───────────────────────────────────────────
function setProgress(pct, text) {
  const fill = document.getElementById('progressFill');
  const pctEl = document.getElementById('progressPercentage');
  const txtEl = document.getElementById('progressText');
  if (fill)  fill.style.width = pct + '%';
  if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  if (txtEl) txtEl.textContent = text || '';
}

// ── PROCESS IMAGES ─────────────────────────────────────
async function processImages() {
  if (!selectedFiles.length) { showNotification('Nenhuma imagem para processar.', 'error'); return; }

  showPanel('progress');
  setProgress(0, 'Iniciando processamento...');

  try {
    const zip = new JSZip();
    const total = selectedFiles.length;

    for (let i = 0; i < total; i++) {
      const file = selectedFiles[i];
      setProgress((i / total) * 90, `Processando ${i + 1} de ${total}: ${file.name}`);

      const blob = await resizeImage(file);
      const ext  = 'jpg';
      const base = file.name.replace(/\.[^.]+$/, '');
      zip.file(`${base}.${ext}`, blob);
    }

    setProgress(92, 'Gerando arquivo ZIP...');
    const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
      setProgress(92 + (meta.percent / 100) * 8, `Compactando... ${Math.round(meta.percent)}%`);
    });

    setProgress(100, 'Concluído!');

    const url  = URL.createObjectURL(zipBlob);
    const link = document.getElementById('downloadLink');
    if (link) {
      link.href = url;
      link.download = `imagens_processadas_${Date.now()}.zip`;
    }

    setTimeout(() => showPanel('result'), 300);

  } catch (err) {
    console.error('Erro no processamento:', err);
    const errText = document.getElementById('errorText');
    if (errText) errText.textContent = err.message || 'Erro desconhecido. Verifique os arquivos e tente novamente.';
    showPanel('error');
  }
}

// ── RESIZE ─────────────────────────────────────────────
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        const src = document.createElement('canvas');
        src.width  = img.naturalWidth;
        src.height = img.naturalHeight;
        src.getContext('2d').drawImage(img, 0, 0);

        const dst = document.createElement('canvas');
        dst.width  = TARGET_W;
        dst.height = TARGET_H;

        await picaInst.resize(src, dst, { quality: 3 });

        dst.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error(`Falha ao converter ${file.name}`));
        }, 'image/jpeg', 0.92);

      } catch (e) { reject(e); }
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Não foi possível carregar ${file.name}`)); };
    img.src = url;
  });
}

// ── NOTIFICATION ───────────────────────────────────────
function showNotification(msg, type = 'info') {
  let notif = document.getElementById('ppNotification');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'ppNotification';
    notif.className = 'notification';
    document.body.appendChild(notif);
  }
  notif.textContent = msg;
  notif.className = `notification ${type}`;
  requestAnimationFrame(() => notif.classList.add('visible'));
  setTimeout(() => notif.classList.remove('visible'), 3200);
}

// ── CONTENT BLOCKER ────────────────────────────────────
function setupContentBlocker() {
  function cleanNode(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('.web-floating-button, iframe[src*="websim"]')) { node.remove(); return; }
    node.querySelectorAll?.('.web-floating-button, iframe[src*="websim"]').forEach(el => el.remove());
  }
  cleanNode(document.body);
  new MutationObserver(mutations => {
    for (const m of mutations) for (const node of m.addedNodes) cleanNode(node);
  }).observe(document.body, { childList: true, subtree: true });
}
