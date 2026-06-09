/* =====================================================
   faq.js — Central de Ajuda
   Busca local com Fuse.js (offline, zero custo)
   ===================================================== */
'use strict';

// ── THEME ──────────────────────────────────────────────
// Usa var para evitar conflito de re-declaração quando faq.js
// é carregado junto com calculadora.js / script.js (que também declaram THEME_KEY)
/* globals THEME_KEY, applyTheme */
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
let currentProfile = null;
let isAnimating    = false;

// ── FAQ DATA (carregado da planilha) ───────────────────
let faqDB   = [];   // [{perfil, pergunta, resposta, observacao}, …]
let fuseGestor  = null;
let fuseUsuario = null;
const SHEETS_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTABt-l4NxK1F9pv-zzOgugJpQhIZnCjSC-WuTNo-uTmw4zE0j2wlN5buMAm54SIdGIIiV5hlM7T0vd/pub?output=csv';
const CACHE_KEY  = 'pp-faq-cache';
// Sem TTL fixo — usa stale-while-revalidate: serve cache imediato + rebusca sempre em background

// ── FUSE OPTIONS ───────────────────────────────────────
const FUSE_OPTS = {
  keys: [
    { name: 'pergunta',   weight: 0.6 },
    { name: 'resposta',   weight: 0.3 },
    { name: 'observacao', weight: 0.1 },
  ],
  threshold:          0.45,   // mais restrito na busca principal (mais preciso)
  minMatchCharLength: 2,
  distance:           1200,
  useExtendedSearch:  false,
  includeScore:       true,
  includeMatches:     true,
  ignoreLocation:     true,
};
// Opts mais permissivo p/ fallback com erros ortográficos
const FUSE_OPTS_FUZZY = { ...FUSE_OPTS, threshold: 0.70 };

// ── LEVENSHTEIN (distância de edição simples) ──────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Corrige palavras isoladas por proximidade no vocabulário do FAQ
function corrigeTokens(text, vocab) {
  return text.split(/\s+/).map(token => {
    if (token.length < 4) return token;
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nt = norm(token);
    let best = token, bestDist = 2; // tolera até 2 edições
    for (const w of vocab) {
      const nw = norm(w);
      if (Math.abs(nw.length - nt.length) > 3) continue;
      const d = levenshtein(nt, nw);
      if (d < bestDist) { bestDist = d; best = w; }
    }
    return best;
  }).join(' ');
}

// Extrai vocabulário único das perguntas do FAQ (palavras ≥4 letras)
function buildVocab(items) {
  const set = new Set();
  items.forEach(it => it.pergunta.split(/\s+/).filter(w => w.length >= 4).forEach(w => set.add(w)));
  return [...set];
}


// ── NORMALIZA CHAVE DO HEADER ──────────────────────────
function normKey(str) {
  return String(str).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

// ── FETCH via PapaParse — stale-while-revalidate ───────
// Serve cache imediato (UX rápida) e rebusca planilha em background sempre.
// Se a planilha mudar, próxima interação já usa os dados novos.
function fetchFromSheets(onDone) {
  Papa.parse(SHEETS_CSV, {
    download:        true,
    header:          true,
    skipEmptyLines:  true,
    transformHeader: h => normKey(h),
    complete(results) {
      if (!results.data || !results.data.length) { onDone(null); return; }
      const fresh = results.data
        .map(row => {
          const r = {};
          Object.keys(row).forEach(k => { r[k] = String(row[k] || '').trim(); });
          return r;
        })
        .filter(r => r.pergunta);
      onDone(fresh.length ? fresh : null);
    },
    error(err) { console.warn('[FAQ] PapaParse error:', err); onDone(null); }
  });
}

function loadFaqData() {
  // 1. Serve cache imediato se existir (válido = tem dados reais)
  let hasCachedData = false;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data } = JSON.parse(cached);
      if (Array.isArray(data) && data.length > 0 && data[0].pergunta) {
        faqDB = data;
        buildIndexes();
        renderFaqSections();
        hasCachedData = true;
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
    }
  } catch (_) { localStorage.removeItem(CACHE_KEY); }

  // 2. Rebusca planilha SEMPRE em background (stale-while-revalidate)
  if (!hasCachedData) showLoadingState(true);

  fetchFromSheets(fresh => {
    if (!hasCachedData) showLoadingState(false);

    if (!fresh) {
      if (!hasCachedData) showLoadingError();
      return; // mantém cache anterior se fetch falhar
    }

    // Atualiza só se os dados mudaram (comparação leve por tamanho + última pergunta)
    const changed = fresh.length !== faqDB.length ||
      fresh[fresh.length - 1]?.pergunta !== faqDB[faqDB.length - 1]?.pergunta;

    if (changed) {
      faqDB = fresh;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: faqDB })); } catch (_) {}
      buildIndexes();
      renderFaqSections();
      // reconstrói fuseChat se o chat já estiver com perfil selecionado
      if (chatProfile) _finishSetProfile(chatProfile, p =>
        String(p || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      );
    }
  });
}

// ── INDEXAÇÃO COM FUSE.JS ──────────────────────────────
function buildIndexes() {
  const gestorItems  = faqDB.filter(r => /gestor/i.test(r.perfil  || ''));
  const usuarioItems = faqDB.filter(r => /usuario|servidor/i.test(r.perfil || ''));

  fuseGestor  = new Fuse(gestorItems,  FUSE_OPTS);
  fuseUsuario = new Fuse(usuarioItems, FUSE_OPTS);
}

// ── RENDERIZAÇÃO DOS ACORDEONS ─────────────────────────
function renderFaqSections() {
  const gestorItems  = faqDB.filter(r => /gestor/i.test(r.perfil  || ''));
  const usuarioItems = faqDB.filter(r => /usuario|servidor/i.test(r.perfil || ''));

  injectAccordions('gestorAccordion',  gestorItems);
  injectAccordions('usuarioAccordion', usuarioItems);

  // re-bind accordion triggers (DOM foi atualizado)
  bindAccordions();
}

function injectAccordions(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <p class="faq-empty-msg">
        <i class="fas fa-inbox"></i> Nenhuma entrada encontrada para este perfil.
      </p>`;
    return;
  }

  container.innerHTML = items.map((item, idx) => {
    const obs = item.observacao
      ? `<div class="accordion-obs"><i class="fas fa-info-circle"></i> ${escHtml(item.observacao)}</div>`
      : '';
    return `
      <div class="accordion-item" data-index="${idx}">
        <button class="accordion-trigger" aria-expanded="false">
          <span class="accordion-question">${escHtml(item.pergunta)}</span>
          <span class="accordion-icon"><i class="fas fa-plus"></i></span>
        </button>
        <div class="accordion-body">
          <div class="accordion-body-inner">
            <p>${formatResposta(item.resposta)}</p>
            ${obs}
          </div>
        </div>
      </div>`;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Converte \n e **negrito** para HTML
function formatResposta(text) {
  return escHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// ── LOADING / ERROR STATES ─────────────────────────────
function showLoadingState(show) {
  ['gestorAccordion', 'usuarioAccordion'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) {
      el.innerHTML = `
        <div class="faq-loading">
          <span class="faq-spinner"></span> Carregando perguntas…
        </div>`;
    }
  });
}

function showLoadingError() {
  ['gestorAccordion', 'usuarioAccordion'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div class="faq-error">
        <i class="fas fa-exclamation-triangle"></i>
        Não foi possível carregar as perguntas. Verifique sua conexão e recarregue a página.
        <button class="btn-retry" onclick="location.reload()">Tentar novamente</button>
      </div>`;
  });
}

// ── BUSCA FUZZY ────────────────────────────────────────
let searchTimer = null;

function setupSearch() {
  const input = document.getElementById('faqSearchInput');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(input.value.trim()), 220);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      input.value = '';
      runSearch('');
      input.blur();
    }
  });

  document.getElementById('faqSearchClear')?.addEventListener('click', () => {
    input.value = '';
    runSearch('');
    input.focus();
  });
}

function runSearch(query) {
  const clearBtn    = document.getElementById('faqSearchClear');
  const resultInfo  = document.getElementById('searchResultInfo');
  if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

  if (!query) {
    // restaura listagem completa
    renderFaqSections();
    if (resultInfo) resultInfo.textContent = '';
    return;
  }

  const fuse    = currentProfile === 'gestor' ? fuseGestor : fuseUsuario;
  if (!fuse) return;

  const results = fuse.search(query);

  const targetId = currentProfile === 'gestor' ? 'gestorAccordion' : 'usuarioAccordion';
  const container = document.getElementById(targetId);
  if (!container) return;

  if (!results.length) {
    container.innerHTML = `
      <div class="faq-no-results">
        <i class="fas fa-search"></i>
        <p>Nenhuma pergunta encontrada para <strong>"${escHtml(query)}"</strong>.</p>
      </div>`;
    if (resultInfo) resultInfo.textContent = '';
    return;
  }

  if (resultInfo) resultInfo.textContent = `${results.length} resultado${results.length > 1 ? 's' : ''} encontrado${results.length > 1 ? 's' : ''}`;

  container.innerHTML = results.map(({ item, matches }, idx) => {
    const perguntaHL  = highlight(item.pergunta,   getMatchIndices(matches, 'pergunta'));
    const respostaHL  = highlight(item.resposta,   getMatchIndices(matches, 'resposta'));
    const obs = item.observacao
      ? `<div class="accordion-obs"><i class="fas fa-info-circle"></i> ${escHtml(item.observacao)}</div>`
      : '';
    return `
      <div class="accordion-item search-result" data-index="${idx}">
        <button class="accordion-trigger" aria-expanded="${idx === 0 ? 'true' : 'false'}">
          <span class="accordion-question">${perguntaHL}</span>
          <span class="accordion-icon"><i class="fas fa-plus"></i></span>
        </button>
        <div class="accordion-body ${idx === 0 ? 'active' : ''}">
          <div class="accordion-body-inner">
            <p>${respostaHL.replace(/\n/g, '<br>')}</p>
            ${obs}
          </div>
        </div>
      </div>`;
  }).join('');

  bindAccordions();
}

function getMatchIndices(matches, key) {
  const m = (matches || []).find(m => m.key === key);
  return m ? m.indices : [];
}

function highlight(text, indices) {
  if (!indices.length) return escHtml(text);
  let result = '', last = 0;
  const safe = escHtml(text);
  // mapeia índices do texto original para o escaped (aproximação segura)
  indices.forEach(([start, end]) => {
    result += escHtml(text.slice(last, start));
    result += `<mark class="faq-hl">${escHtml(text.slice(start, end + 1))}</mark>`;
    last = end + 1;
  });
  result += escHtml(text.slice(last));
  return result;
}

// ── ACCORDION ──────────────────────────────────────────
function bindAccordions() {
  document.querySelectorAll('.accordion-trigger').forEach(btn => {
    btn.removeEventListener('click', toggleAccordion);
    btn.addEventListener('click', toggleAccordion);
  });
}

function toggleAccordion(e) {
  const trigger = e.currentTarget;
  const body    = trigger.nextElementSibling;
  const isOpen  = trigger.getAttribute('aria-expanded') === 'true';

  document.querySelectorAll('.accordion-trigger').forEach(t => {
    t.setAttribute('aria-expanded', 'false');
    t.nextElementSibling?.classList.remove('active');
  });

  if (!isOpen && body) {
    trigger.setAttribute('aria-expanded', 'true');
    body.classList.add('active');
    setTimeout(() => {
      trigger.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 180);
  }
}

function resetAccordions() {
  document.querySelectorAll('.accordion-trigger').forEach(t => {
    t.setAttribute('aria-expanded', 'false');
    t.nextElementSibling?.classList.remove('active');
  });
}

function animateAccordionItems() {
  document.querySelectorAll('.accordion-item').forEach((item, i) => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(10px)';
    setTimeout(() => {
      item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
    }, i * 60);
  });
}

// ── PROFILE SELECTION ──────────────────────────────────
function selectProfile(profile) {
  if (isAnimating) return;
  isAnimating = true;
  currentProfile = profile;
  history.pushState({ profile }, '', `#${profile}`);

  const mainView    = document.getElementById('mainView');
  const contentArea = document.getElementById('contentArea');
  const gc = document.getElementById('gestorContent');
  const uc = document.getElementById('usuarioContent');

  mainView.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  mainView.style.opacity    = '0';
  mainView.style.transform  = 'translateY(-10px)';

  setTimeout(() => {
    mainView.style.display = 'none';
    gc.classList.remove('visible');
    uc.classList.remove('visible');

    const target = profile === 'gestor' ? gc : uc;
    target.classList.add('visible');

    contentArea.style.display    = 'block';
    contentArea.style.opacity    = '0';
    contentArea.style.transform  = 'translateY(12px)';
    contentArea.style.transition = 'opacity 0.28s ease, transform 0.28s ease';

    requestAnimationFrame(() => {
      contentArea.style.opacity   = '1';
      contentArea.style.transform = 'translateY(0)';
    });

    isAnimating = false;
    document.getElementById('backButton')?.focus();
    animateAccordionItems();

    // mostra campo de busca e configura eventos
    const searchWrap = document.getElementById('faqSearchWrap');
    if (searchWrap) searchWrap.style.display = 'flex';
    setupSearch();
  }, 240);
}

function goBack() {
  if (isAnimating) return;
  isAnimating = true;
  history.pushState({}, '', window.location.pathname);

  const mainView    = document.getElementById('mainView');
  const contentArea = document.getElementById('contentArea');

  // limpa busca
  const input = document.getElementById('faqSearchInput');
  if (input) input.value = '';
  const resultInfo = document.getElementById('searchResultInfo');
  if (resultInfo) resultInfo.textContent = '';

  contentArea.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  contentArea.style.opacity    = '0';
  contentArea.style.transform  = 'translateY(-10px)';

  setTimeout(() => {
    contentArea.style.display = 'none';
    resetAccordions();

    // restaura acordeons completos
    renderFaqSections();

    mainView.style.display    = 'block';
    mainView.style.opacity    = '0';
    mainView.style.transform  = 'translateY(12px)';
    mainView.style.transition = 'opacity 0.28s ease, transform 0.28s ease';

    requestAnimationFrame(() => {
      mainView.style.opacity   = '1';
      mainView.style.transform = 'translateY(0)';
    });

    currentProfile = null;
    isAnimating    = false;
  }, 240);
}

// ── POPSTATE ───────────────────────────────────────────
window.addEventListener('popstate', e => {
  if (e.state?.profile) selectProfile(e.state.profile);
  else if (currentProfile) goBack();
});

// ── CONTENT BLOCKER ────────────────────────────────────
function setupContentBlocker() {
  const ALLOWED = ['drive.google.com'];

  function cleanNode(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('.web-floating-button, iframe[src*="websim"]')) { node.remove(); return; }
    if (node.tagName === 'IFRAME') {
      try { if (!ALLOWED.includes(new URL(node.src).hostname)) node.remove(); } catch (_) {}
      return;
    }
    node.querySelectorAll?.('.web-floating-button, iframe[src*="websim"], iframe').forEach(el => {
      if (el.tagName === 'IFRAME') {
        try { if (!ALLOWED.includes(new URL(el.src).hostname)) el.remove(); } catch (_) {}
      } else { el.remove(); }
    });
  }

  cleanNode(document.body);
  new MutationObserver(mutations => {
    for (const m of mutations) for (const node of m.addedNodes) cleanNode(node);
  }).observe(document.body, { childList: true, subtree: true });
}

// ── CHAT ───────────────────────────────────────────────
let chatProfile  = null;   // 'gestor' | 'usuario'
let fuseChat     = null;   // índice Fuse ativo para o chat
let chatOpen     = false;
let chatGreeted  = false;

/* ---- abertura/fechamento ---- */
function toggleChat() {
  chatOpen = !chatOpen;
  const modal = document.getElementById('chatModal');
  const fab   = document.getElementById('chatFab');
  const badge = document.getElementById('chatBadge');

  if (chatOpen) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('chat-modal--open'));
    fab.setAttribute('aria-expanded', 'true');
    badge.style.display = 'none';
    if (!chatGreeted) { chatGreeted = true; chatWelcome(); }
    else setTimeout(() => document.getElementById('chatInput')?.focus(), 300);
  } else {
    modal.classList.remove('chat-modal--open');
    setTimeout(() => { modal.style.display = 'none'; }, 280);
    fab.setAttribute('aria-expanded', 'false');
  }
}

/* ---- mensagem de boas-vindas ---- */
function chatWelcome() {
  const picker = document.getElementById('chatProfilePicker');
  if (picker) picker.style.display = 'flex';
  chatAddMsg('bot', 'Olá! 👋 Sou o Antonio, o assistente do <strong>Ponto.PMC</strong>. Antes de começar, selecione o seu perfil acima para que eu possa buscar as informações corretas.');
}

/* ---- seleção de perfil no chat ---- */
function setChatProfile(profile) {
  chatProfile = profile;

  // normaliza o campo perfil da planilha antes de filtrar (remove acentos, lowercase)
  function normPerfil(v) {
    return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // se faqDB ainda não carregou, aguarda até 5s e tenta de novo
  if (!faqDB.length) {
    chatAddMsg('bot', '⏳ Ainda carregando o manual, aguarde um instante…');
    const waitStart = Date.now();
    const waitInterval = setInterval(() => {
      if (faqDB.length || Date.now() - waitStart > 5000) {
        clearInterval(waitInterval);
        if (!faqDB.length) {
          chatAddMsg('bot', '⚠️ Não foi possível carregar o manual. Verifique sua conexão e recarregue a página.');
          return;
        }
        _finishSetProfile(profile, normPerfil);
      }
    }, 300);
    return;
  }

  _finishSetProfile(profile, normPerfil);
}

function _finishSetProfile(profile, normPerfil) {
  function normPerfil(v) {
    return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  const items = faqDB.filter(r => {
    const p = normPerfil(r.perfil);
    return profile === 'gestor'
      ? p.includes('gestor')
      : (p.includes('usuario') || p.includes('servidor'));
  });

  // Fallback: se o campo perfil não existir / vier diferente, usa todos os itens
  const finalItems = items.length ? items : faqDB;
  fuseChat = new Fuse(finalItems, FUSE_OPTS);

  const picker = document.getElementById('chatProfilePicker');
  if (picker) picker.style.display = 'none';

  const label = profile === 'gestor' ? 'Gestor' : 'Servidor';
  chatAddMsg('bot', `Perfeito! Estou configurado para o perfil <strong>${label}</strong>. Pode perguntar — vou buscar no manual oficial. 🔍`);

  const input   = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (input)   { input.disabled = false; input.focus(); }
  if (sendBtn) sendBtn.disabled = false;

  // sugestões rápidas
  if (finalItems.length) {
    setTimeout(() => chatAddSuggestions(finalItems.slice(0, 3).map(i => i.pergunta)), 400);
  }
}

/* ---- adiciona bolha de mensagem ---- */
function chatAddMsg(role, html, extra = '') {
  const log = document.getElementById('chatMessages');
  if (!log) return;

  const wrap = document.createElement('div');
  wrap.className = `chat-msg chat-msg--${role}`;
  wrap.innerHTML = `
    <div class="chat-bubble">${html}</div>
    ${extra ? `<div class="chat-msg-extra">${extra}</div>` : ''}`;
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  return wrap;
}

/* ---- chips de sugestão ---- */
function chatAddSuggestions(questions) {
  const log = document.getElementById('chatMessages');
  if (!log) return;
  const wrap = document.createElement('div');
  wrap.className = 'chat-suggestions';
  wrap.innerHTML = questions.map(q =>
    `<button class="chat-chip" data-q="${escHtml(q)}">${escHtml(q)}</button>`
  ).join('');
  wrap.querySelectorAll('.chat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.remove();
      chatSend(btn.dataset.q);
    });
  });
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

/* ── ENVIO DE MENSAGEM ── */
function chatSend(text) {
  text = (text || '').trim();
  if (!text) return;

  // se fuseChat ainda null, perfil não selecionado
  if (!fuseChat) {
    chatAddMsg('bot', 'Por favor, selecione seu perfil (Gestor ou Servidor) antes de perguntar.');
    return;
  }

  chatAddMsg('user', escHtml(text));
  chatTyping();

  setTimeout(() => {
    removeTyping();

    const docs = fuseChat._docs || [];

    // busca principal
    let results = fuseChat.search(text);

    // fallback 1: busca sem acentos
    if (!results.length) {
      const semAcento = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      results = fuseChat.search(semAcento);
    }

    // fallback 2: correção ortográfica via levenshtein no vocabulário do FAQ
    if (!results.length && docs.length) {
      const vocab     = buildVocab(docs);
      const corrigido = corrigeTokens(text, vocab);
      if (corrigido.toLowerCase() !== text.toLowerCase()) {
        const fuseP = new Fuse(docs, FUSE_OPTS_FUZZY);
        results = fuseP.search(corrigido);
      }
    }

    // fallback 3: palavras individuais (≥4 letras) com threshold permissivo
    if (!results.length && docs.length) {
      const palavras = text.split(/\s+/).filter(w => w.length >= 4);
      const fuseP    = new Fuse(docs, FUSE_OPTS_FUZZY);
      for (const p of palavras) {
        const r = fuseP.search(p);
        if (r.length) { results = r; break; }
      }
    }

    if (!results.length) {
      // sem resultado: mostra perguntas frequentes do perfil como sugestão
      const sugestoes = docs.slice(0, 4).map(i => i.pergunta);
      chatAddMsg('bot',
        `Não encontrei nada sobre <strong>"${escHtml(text)}"</strong> no manual. ` +
        `Veja perguntas frequentes ou tente reformular:`
      );
      if (sugestoes.length) chatAddSuggestions(sugestoes);
      return;
    }

    const top = results[0].item;
    const obs = top.observacao
      ? `<div class="chat-obs"><i class="fas fa-info-circle"></i> ${escHtml(top.observacao)}</div>`
      : '';

    chatAddMsg('bot',
      `<strong>${escHtml(top.pergunta)}</strong><br><br>` +
      formatResposta(top.resposta) + obs
    );

    // até 4 perguntas relacionadas
    const relacionadas = results.slice(1, 5).map(r => r.item.pergunta);
    if (relacionadas.length) {
      setTimeout(() => {
        chatAddMsg('bot', 'Perguntas relacionadas:');
        chatAddSuggestions(relacionadas);
      }, 200);
    }
  }, 600 + Math.random() * 300);
}

/* ---- typing indicator ---- */
function chatTyping() {
  const log = document.getElementById('chatMessages');
  if (!log || log.querySelector('.chat-typing')) return;
  const el = document.createElement('div');
  el.className = 'chat-msg chat-msg--bot chat-typing';
  el.innerHTML = `<div class="chat-bubble"><span></span><span></span><span></span></div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}
function removeTyping() {
  document.querySelector('.chat-typing')?.remove();
}

/* ---- limpar conversa ---- */
function clearChat() {
  const log = document.getElementById('chatMessages');
  if (log) log.innerHTML = '';
  chatProfile  = null;
  fuseChat     = null;
  chatGreeted  = false;

  const picker  = document.getElementById('chatProfilePicker');
  if (picker) picker.style.display = 'flex';

  const input   = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (input)   { input.value = ''; input.disabled   = true; }
  if (sendBtn) sendBtn.disabled = true;

  chatWelcome();
}

/* ---- auto-resize textarea ---- */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

/* ---- setup do chat ---- */
function setupChat() {
  document.getElementById('chatFab')?.addEventListener('click', toggleChat);
  document.getElementById('chatCloseBtn')?.addEventListener('click', toggleChat);
  document.getElementById('chatClearBtn')?.addEventListener('click', clearChat);

  // seleção de perfil
  document.querySelectorAll('[data-chat-profile]').forEach(btn => {
    btn.addEventListener('click', () => setChatProfile(btn.dataset.chatProfile));
  });

  // input
  const input   = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');

  input?.addEventListener('input', () => autoResize(input));
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = input.value.trim();
      if (val) { chatSend(val); input.value = ''; input.style.height = 'auto'; }
    }
  });
  sendBtn?.addEventListener('click', () => {
    const val = input?.value.trim();
    if (val) { chatSend(val); input.value = ''; input.style.height = 'auto'; }
  });

  // ESC fecha chat
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && chatOpen) toggleChat();
  });

  // badge de boas-vindas após 3s
  setTimeout(() => {
    if (!chatOpen) {
      const badge = document.getElementById('chatBadge');
      if (badge) badge.style.display = 'flex';
    }
  }, 3000);
}

// ── INIT ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Tema
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

  // Cards de perfil
  ['cardGestor', 'cardUsuario'].forEach(id => {
    const card = document.getElementById(id);
    if (!card) return;
    card.addEventListener('click', () => selectProfile(card.dataset.profile));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectProfile(card.dataset.profile); }
    });
  });

  // Botão voltar
  document.getElementById('backButton')?.addEventListener('click', goBack);

  // ESC = voltar
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && currentProfile && !isAnimating) goBack();
  });

  // Animação de entrada dos cards
  setTimeout(() => {
    document.querySelectorAll('.view-transition').forEach((el, i) => {
      setTimeout(() => el.classList.add('in'), i * 80);
    });
  }, 60);

  // Hash routing
  const hash = window.location.hash.slice(1);
  if (['gestor', 'usuario'].includes(hash)) selectProfile(hash);

  setupContentBlocker();
  setupChat();

  // Carrega dados da planilha e constrói índice Fuse
  loadFaqData();
});
