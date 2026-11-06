/* =====================================================
   faq.js — Central de Ajuda
   Busca por relevância e interpretação contextual com fontes verificáveis
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
let searchGestor = null;
let searchUsuario = null;
let faqState = 'loading';
const SHEETS_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTABt-l4NxK1F9pv-zzOgugJpQhIZnCjSC-WuTNo-uTmw4zE0j2wlN5buMAm54SIdGIIiV5hlM7T0vd/pub?output=csv';
const CACHE_KEY  = 'pp-faq-cache';
// Sem TTL fixo — usa stale-while-revalidate: serve cache imediato + rebusca sempre em background

// ── NORMALIZA CHAVE DO HEADER ──────────────────────────
function normKey(str) {
  return String(str).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

// ── PERFIL: normalização e correspondência ─────────────
// Suporta perguntas exclusivas de "Gestor", exclusivas de
// "Servidor/Usuário" e perguntas compartilhadas marcadas na
// planilha como "Ambos" / "Todos" / "Geral" (aparecem nos dois perfis).
function normPerfilStr(v) {
  return String(v || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function isSharedPerfil(perfilRaw) {
  return /\b(ambos|todos|geral|all|both)\b/.test(normPerfilStr(perfilRaw));
}
function matchesProfile(perfilRaw, profile) {
  const p = normPerfilStr(perfilRaw);
  if (!p) return false;
  if (isSharedPerfil(perfilRaw)) return true;
  return profile === 'gestor'
    ? p.includes('gestor')
    : (p.includes('usuario') || p.includes('servidor'));
}

// ── ÍCONES SVG (contato) ────────────────────────────────
// Usados em formatResposta() para destacar links, e-mails e
// telefones encontrados no texto das respostas.
const ICON_LINK  = '<svg class="resp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
const ICON_MAIL  = '<svg class="resp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>';
const ICON_PHONE = '<svg class="resp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>';
const ICON_PLAY  = '<svg class="resp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>';

// ── VÍDEO EMBUTIDO A PARTIR DE LINK ENTRE ASPAS SIMPLES ─
// Convenção da planilha: quando a coluna "resposta" contém um trecho
// entre aspas simples 'https://...', esse trecho é sempre o link de um
// vídeo explicativo. Ele nunca deve aparecer como texto cru — em vez
// disso vira um player embutido (YouTube/Vimeo) ou um botão de play
// para outros formatos, exibido apenas quando esse padrão existir.
function extractVideoLink(text) {
  // percorre TODOS os pares de aspas simples do texto — a planilha pode ter
  // aspas simples usadas para outra coisa antes do link (ex.: protocolo
  // 'https'), então não basta pegar o primeiro par, precisa achar o que
  // realmente parece uma URL
  const re = /'([^']+)'/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const candidate = m[1].trim();
    const looksLikeUrl = /^https?:\/\//i.test(candidate) || /^www\./i.test(candidate);
    if (!looksLikeUrl) continue;

    const cleaned = (text.slice(0, m.index) + text.slice(m.index + m[0].length))
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .trim();

    return { text: cleaned, videoUrl: /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}` };
  }
  return { text, videoUrl: null };
}

function buildVideoEmbed(url) {
  const safe  = escHtml(url);
  const yt    = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/i);
  const vimeo = url.match(/vimeo\.com\/(\d+)/i);
  // Google Drive: aceita os formatos /file/d/ID/view, /file/d/ID/preview,
  // /open?id=ID e /uc?id=ID, e normaliza todos para o formato de embed /preview
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/([a-zA-Z0-9_-]+)|open\?id=([a-zA-Z0-9_-]+)|uc\?(?:export=download&)?id=([a-zA-Z0-9_-]+))/i);

  if (drive) {
    const fileId = drive[1] || drive[2] || drive[3];
    return `<div class="resp-video-wrap"><iframe class="resp-video-frame" src="https://drive.google.com/file/d/${fileId}/preview" title="Vídeo explicativo" loading="lazy" allow="autoplay" allowfullscreen></iframe></div>`;
  }
  if (yt) {
    return `<div class="resp-video-wrap"><iframe class="resp-video-frame" src="https://www.youtube.com/embed/${yt[1]}" title="Vídeo explicativo" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if (vimeo) {
    return `<div class="resp-video-wrap"><iframe class="resp-video-frame" src="https://player.vimeo.com/video/${vimeo[1]}" title="Vídeo explicativo" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
    return `<div class="resp-video-wrap"><video class="resp-video-frame" controls preload="metadata" src="${safe}"></video></div>`;
  }
  return `<a class="resp-video-fallback" href="${safe}" target="_blank" rel="noopener">${ICON_PLAY}<span>Assistir vídeo explicativo</span></a>`;
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
        .filter(r => r.pergunta && r.resposta && r.perfil);
      onDone(fresh.length ? fresh : null);
    },
    error(err) { console.warn('[FAQ] PapaParse error:', err); onDone(null); }
  });
}

function loadFaqData() {
  faqState = 'loading';
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
        faqState = 'ready';
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
    }
  } catch (_) { /* Armazenamento indisponível: segue com a planilha. */ }

  // 2. Rebusca planilha SEMPRE em background (stale-while-revalidate)
  if (!hasCachedData) showLoadingState(true);
  else if (chatProfile && !chatIndex) _finishSetProfile(chatProfile);

  fetchFromSheets(fresh => {
    if (!hasCachedData) showLoadingState(false);

    if (!fresh) {
      if (!hasCachedData) {
        faqState = 'error';
        showLoadingError();
        if (chatProfile) chatAddMsg('bot', 'Não consegui carregar a base de ajuda. Selecione seu perfil novamente para tentar outra vez.');
      }
      return; // mantém cache anterior se fetch falhar
    }

    faqState = 'ready';
    // Atualiza sempre que o CONTEÚDO mudar — antes só comparava quantidade
    // de linhas + última pergunta, o que não detectava edição no texto de
    // uma resposta já existente (ex.: acrescentar o link de vídeo entre
    // aspas simples numa pergunta que já existia na planilha)
    const changed = JSON.stringify(fresh) !== JSON.stringify(faqDB);

    if (changed) {
      faqDB = fresh;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: faqDB })); } catch (_) {}
      buildIndexes();
      renderFaqSections();
      const query = document.getElementById('faqSearchInput')?.value.trim();
      if (query) runSearch(query);
      // Atualiza o índice sem reiniciar conversa ou duplicar boas-vindas.
      if (chatProfile) {
        if (chatIndex) chatIndex = chatProfile === 'gestor' ? searchGestor : searchUsuario;
        else _finishSetProfile(chatProfile);
      }
    }
  });
}

// ── INDEXAÇÃO POR PERFIL ──────────────────────────────
function buildIndexes() {
  searchGestor = new PontoSearch.Index(faqDB, 'gestor');
  searchUsuario = new PontoSearch.Index(faqDB, 'usuario');
}

// ── RENDERIZAÇÃO DOS ACORDEONS ─────────────────────────
function renderFaqSections() {
  const gestorItems  = faqDB.filter(r => matchesProfile(r.perfil, 'gestor'));
  const usuarioItems = faqDB.filter(r => matchesProfile(r.perfil, 'usuario'));

  injectAccordions('gestorAccordion',  gestorItems);
  injectAccordions('usuarioAccordion', usuarioItems);

  // re-bind accordion triggers e grupos de tema (DOM foi atualizado)
  bindAccordions();
  bindThemeGroups();
}

// Agrupa os itens do perfil pela coluna "tema" da planilha, preservando
// a ordem de primeira aparição. Itens sem tema caem em "Geral".
function groupByTema(items) {
  const order = [];
  const map = new Map();
  items.forEach(item => {
    const tema = (item.tema || '').trim() || 'Geral';
    if (!map.has(tema)) { map.set(tema, []); order.push(tema); }
    map.get(tema).push(item);
  });
  return order.map(tema => ({ tema, items: map.get(tema) }));
}

function accordionItemHtml(item, key) {
  const obs = item.observacao
    ? `<div class="accordion-obs"><i class="fas fa-info-circle"></i> ${escHtml(item.observacao)}</div>`
    : '';
  const shared = isSharedPerfil(item.perfil)
    ? '<span class="badge accordion-badge"><i class="fas fa-users"></i> Ambos os perfis</span>'
    : '';
  return `
    <div class="accordion-item" data-index="${key}">
      <button class="accordion-trigger" aria-expanded="false">
        <span class="accordion-question">${escHtml(item.pergunta)}${shared}</span>
        <span class="accordion-icon"><i class="fas fa-plus"></i></span>
      </button>
      <div class="accordion-body">
        <div class="accordion-body-inner">
          ${formatResposta(item.resposta)}
          ${obs}
        </div>
      </div>
    </div>`;
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

  const groups = groupByTema(items);

  container.innerHTML = groups.map(({ tema, items: grpItems }, gidx) => {
    const body = grpItems.map((item, idx) => accordionItemHtml(item, `${gidx}-${idx}`)).join('');
    return `
      <div class="theme-group">
        <button class="theme-group-header" aria-expanded="false">
          <span class="theme-group-title"><i class="fas fa-layer-group"></i> ${escHtml(tema)}</span>
          <span class="theme-group-meta">
            <span class="theme-group-count">${grpItems.length}</span>
            <span class="theme-group-hint"><i class="fas fa-hand-pointer"></i> Clique para ver</span>
            <i class="fas fa-chevron-down theme-group-arrow"></i>
          </span>
        </button>
        <div class="theme-group-body collapsed">${body}</div>
      </div>`;
  }).join('');
}

// ── GRUPOS DE TEMA: expandir/recolher ───────────────────
function bindThemeGroups() {
  document.querySelectorAll('.theme-group-header').forEach(btn => {
    const body = btn.nextElementSibling;
    if (body) {
      if (!body.id) body.id = `faq-theme-${Array.from(document.querySelectorAll('.theme-group-header')).indexOf(btn)}`;
      btn.setAttribute('aria-controls', body.id);
      body.inert = btn.getAttribute('aria-expanded') !== 'true';
    }
    btn.removeEventListener('click', toggleThemeGroup);
    btn.addEventListener('click', toggleThemeGroup);
  });
}
function toggleThemeGroup(e) {
  const header    = e.currentTarget;
  const body      = header.nextElementSibling;
  const isOpen    = header.getAttribute('aria-expanded') === 'true';
  const container = header.closest('.faq-accordion');

  // fecha e desmarca os demais temas (só um tema em destaque por vez)
  container?.querySelectorAll('.theme-group-header').forEach(h => {
    if (h !== header) {
      h.setAttribute('aria-expanded', 'false');
      h.nextElementSibling?.classList.add('collapsed');
      if (h.nextElementSibling) h.nextElementSibling.inert = true;
    }
  });

  header.setAttribute('aria-expanded', String(!isOpen));
  if (body) {
    body.classList.toggle('collapsed', isOpen);
    body.inert = isOpen;
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── QUEBRA DE LINHA INTELIGENTE ─────────────────────────

// 1) Se a resposta veio como um "bloco" só (planilha sem \n\n),
//    agrupa as frases em parágrafos de ~2 frases / ~80+ caracteres
//    para evitar parede de texto. Não mexe se já houver parágrafos
//    definidos pelo autor ou se for uma lista.
function autoParagraph(text) {
  if (/\n\s*\n/.test(text)) return text;
  if (/^\s*(?:[•\-]|\d+[.)])\s+/m.test(text)) return text;
  // não reagrupa textos com e-mail/link/telefone — são curtos e
  // sensíveis a uma divisão incorreta em "frases"
  if (/https?:\/\//.test(text)) return text;
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) return text;

  // divide em frases sem perder nenhum caractere: quebra apenas no
  // espaço que vem depois de ./!/? e antes de uma letra maiúscula
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/);
  if (sentences.length < 3) return text;

  const paragraphs = [];
  let current = [];
  let charCount = 0;
  for (const s of sentences) {
    current.push(s);
    charCount += s.length;
    if (current.length >= 2 && charCount > 80) {
      paragraphs.push(current.join(' '));
      current = [];
      charCount = 0;
    }
  }
  if (current.length) paragraphs.push(current.join(' '));
  return paragraphs.length > 1 ? paragraphs.join('\n\n') : text;
}

// 1b) Quebra de linha antes de "rótulos" tipo "Campo:" — comum em respostas
//     da planilha que juntam vários dados num só parágrafo (ex.: "Prazo: 5
//     dias úteis. Local: sala 202. Contato: (31) 3391-8000."). Cada rótulo
//     passa a iniciar seu próprio parágrafo. Não afeta horários (8:00),
//     valores (R$ 100) ou URLs, pois estes nunca começam com letra maiúscula
//     seguida só de ":" — e o link de vídeo já foi extraído antes deste passo.
const LABEL_BREAK_RE = /(\S)[ \t]+([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9]*(?:[ \t][A-Za-zÀ-ÿ0-9]+){0,3}:)(?=[ \t]|$)/g;
function breakBeforeLabels(text) {
  return text.replace(LABEL_BREAK_RE, '$1\n\n$2');
}

// Rótulos de destaque (Importante/Atenção/Observação/Nota/Dica/Aviso) viram
// um callout visual (como .accordion-obs) em vez de um parágrafo comum.
const CALLOUT_RE = /^\s*(?:<strong>)?\s*(importante|atenc?ao|observac?ao|obs|nota|dica|aviso)\s*:(?:<\/strong>)?/i;
const CALLOUT_ICONS = {
  importante: 'fa-triangle-exclamation',
  atencao:    'fa-triangle-exclamation',
  aviso:      'fa-triangle-exclamation',
  observacao: 'fa-circle-info',
  obs:        'fa-circle-info',
  nota:       'fa-circle-info',
  dica:       'fa-lightbulb',
};
function normAscii(str) {
  return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// 2) Tipografia fina, linha a linha: liga com espaço inseparável (nbsp)
//    palavras que nunca deveriam "sobrar" sozinhas no início/fim de
//    linha — preposições/conjunções curtas, "R$ 100", "nº 5", "5 dias" —
//    e cola as duas últimas palavras de cada linha para evitar a
//    clássica "palavra órfã" isolada na última linha do parágrafo.
const GLUE_WORDS = ['a','à','e','é','o','ao','de','da','do','em','no','na','ou','um','uma','se','que','por','com'];
const GLUE_WORDS_RE = new RegExp('(^|\\s)(' + GLUE_WORDS.join('|') + ')\\s+(?=\\S)', 'gi');

function smartTypography(t) {
  return t.split('\n').map(line => {
    if (!line.trim()) return line;
    let l = line;
    // moeda: "R$ 100,00" nunca quebra entre o símbolo e o valor
    l = l.replace(/(R\$)\s+(?=\d)/g, '$1\u00A0');
    // número + unidade: "200 horas", "5 dias", "30 minutos"
    l = l.replace(/(\d+)\s+(dias?|horas?|minutos?|meses?|anos?)\b/gi, '$1\u00A0$2');
    // "nº 5", "Art. 37", "§ 2"
    l = l.replace(/(n[ºo°]|art\.?|§)\s+(?=\S)/gi, (m, p1) => p1 + '\u00A0');
    // preposições/conjunções curtas nunca sozinhas no fim da linha
    l = l.replace(GLUE_WORDS_RE, (m, pre, word) => pre + word + '\u00A0');
    // evita palavra órfã isolada na última linha do parágrafo
    l = l.replace(/\s+(\S+)\s*$/, '\u00A0$1');
    return l;
  }).join('\n');
}

// Converte \n, **negrito**, URLs e e-mails para HTML com quebras inteligentes
function formatResposta(text) {
  // 0a. extrai link de vídeo entre aspas simples '...' — por convenção da
  //     planilha, esse trecho é sempre um vídeo e nunca deve aparecer como
  //     texto cru. Só existe player quando esse padrão está presente.
  const { text: semVideo, videoUrl } = extractVideoLink(String(text));

  // 0b. quebra de linha antes de rótulos "Campo:" (Prazo:, Local:, Passo 2:)
  let raw = breakBeforeLabels(semVideo);

  // 0c. agrupa em parágrafos legíveis quando o texto vem como bloco único
  raw = autoParagraph(raw);

  // 1. escapa HTML
  let t = escHtml(raw);

  // 1b. tipografia fina (nbsp em pontos que não devem quebrar)
  t = smartTypography(t);

  // 2. negrito **...**
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 2b. rótulo no início da linha ("Prazo: 5 dias") ganha negrito automático
  t = t.replace(/(^|\n)([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9]*(?:[ \t][A-Za-zÀ-ÿ0-9]+){0,3}:)([ \t])/g, '$1<strong>$2</strong>$3');

  // 3. links — URL (chip com ícone SVG de link)
  t = t.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    (m) => `<a class="resp-chip resp-chip--link" href="${m}" target="_blank" rel="noopener">${ICON_LINK}<span>${m}</span></a>`
  );

  // 4. e-mails (chip com ícone SVG de envelope)
  t = t.replace(
    /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g,
    (m) => `<a class="resp-chip resp-chip--mail" href="mailto:${m}">${ICON_MAIL}<span>${m}</span></a>`
  );

  // 5. telefones no padrão BR — ex: (31) 3391-8000 ou 31 3391-8000
  //    (chip com ícone SVG de telefone; href usa apenas dígitos)
  t = t.replace(
    /(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})/g,
    (m) => `<a class="resp-chip resp-chip--phone" href="tel:+55${m.replace(/\D/g, '')}">${ICON_PHONE}<span>${m}</span></a>`
  );

  // 6. lista com bullet "• item" / "- item" → <ul>, ou "1. item" / "1) item" → <ol>
  const lines = t.split(/\n/);
  const out = [];
  let inList = null; // 'ul' | 'ol' | null
  for (const line of lines) {
    const trimmed = line.trim();
    const isBullet   = /^[•\-]\s+/.test(trimmed);
    const isNumbered = !isBullet && /^\d+[.)]\s+/.test(trimmed);

    if (isBullet || isNumbered) {
      const type = isBullet ? 'ul' : 'ol';
      if (inList && inList !== type) { out.push(`</${inList}>`); inList = null; }
      if (!inList) { out.push(type === 'ul' ? '<ul class="resp-list">' : '<ol class="resp-list resp-list--ol">'); inList = type; }
      const cleaned = isBullet ? trimmed.replace(/^[•\-]\s+/, '') : trimmed.replace(/^\d+[.)]\s+/, '');
      out.push('<li>' + cleaned + '</li>');
    } else {
      if (inList) { out.push(`</${inList}>`); inList = null; }
      out.push(line);
    }
  }
  if (inList) out.push(`</${inList}>`);

  // 7. parágrafos: duas quebras de linha seguidas viram separador de parágrafo.
  //    Antes disso, remove quebras de linha coladas nas tags de lista para
  //    que <ul>/<ol>/<li> nunca ganhem <br> indevido.
  let joined = out.join('\n')
    .replace(/\n(<\/?(?:ul|ol)[^>]*>)/g, '$1')
    .replace(/(<\/?(?:ul|ol)[^>]*>)\n/g, '$1')
    .replace(/\n(<li>)/g, '$1')
    .replace(/(<\/li>)\n/g, '$1');

  // 8. cada parágrafo vira <p> (o 1º sem margem extra, os demais com a
  //    classe .resp-p); rótulos de destaque (Importante/Atenção/Observação/
  //    Nota/Dica/Aviso) viram um callout visual, no estilo do .accordion-obs.
  const html = joined.split(/\n{2,}/).map((par, idx) => {
    const withBr  = par.replace(/\n/g, '<br>');
    const callout = par.match(CALLOUT_RE);
    if (callout) {
      const icon = CALLOUT_ICONS[normAscii(callout[1])] || 'fa-circle-info';
      // remove o <strong> do rótulo dentro do callout — o destaque visual
      // já vem do ícone/borda da caixa, evitando negrito duplicado
      const cleaned = withBr.replace(/^\s*<strong>([^<]+:)<\/strong>\s*/i, '$1 ');
      return `<div class="resp-callout"><i class="fas ${icon}"></i><div>${cleaned}</div></div>`;
    }
    return idx === 0 ? `<p>${withBr}</p>` : `<p class="resp-p">${withBr}</p>`;
  }).join('');

  // 9. player de vídeo embutido, se a resposta tinha um link entre aspas simples
  return videoUrl ? html + buildVideoEmbed(videoUrl) : html;
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

// ── BUSCA POR RELEVÂNCIA ────────────────────────────────────────
let searchTimer = null;

function setupSearch() {
  const input = document.getElementById('faqSearchInput');
  if (!input || input.dataset.searchBound) return;
  input.dataset.searchBound = 'true';

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
    clearTimeout(searchTimer);
    // restaura listagem completa
    renderFaqSections();
    if (resultInfo) resultInfo.textContent = '';
    return;
  }

  const index = currentProfile === 'gestor' ? searchGestor : searchUsuario;
  if (!index) return;

  const results = index.search(query);

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
    const obs = item.observacao
      ? `<div class="accordion-obs"><i class="fas fa-info-circle"></i> ${escHtml(item.observacao)}</div>`
      : '';
    const shared = isSharedPerfil(item.perfil)
      ? '<span class="badge accordion-badge"><i class="fas fa-users"></i> Ambos os perfis</span>'
      : '';
    const temaBadge = item.tema
      ? `<span class="badge accordion-badge accordion-badge-tema"><i class="fas fa-layer-group"></i> ${escHtml(item.tema)}</span>`
      : '';
    return `
      <div class="accordion-item search-result" data-index="${idx}">
        <button class="accordion-trigger" aria-expanded="${idx === 0 ? 'true' : 'false'}">
          <span class="accordion-question">${perguntaHL}${temaBadge}${shared}</span>
          <span class="accordion-icon"><i class="fas fa-plus"></i></span>
        </button>
        <div class="accordion-body ${idx === 0 ? 'active' : ''}">
          <div class="accordion-body-inner">
            ${formatResposta(item.resposta)}
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
    const body = btn.nextElementSibling;
    if (body) {
      if (!body.id) body.id = `faq-answer-${Array.from(document.querySelectorAll('.accordion-trigger')).indexOf(btn)}`;
      btn.setAttribute('aria-controls', body.id);
      body.inert = btn.getAttribute('aria-expanded') !== 'true';
    }
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
    if (t.nextElementSibling) t.nextElementSibling.inert = true;
  });

  if (!isOpen && body) {
    trigger.setAttribute('aria-expanded', 'true');
    body.classList.add('active');
    body.inert = false;
    setTimeout(() => {
      trigger.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    }, 180);
  }
}

function resetAccordions() {
  document.querySelectorAll('.accordion-trigger').forEach(t => {
    t.setAttribute('aria-expanded', 'false');
    t.nextElementSibling?.classList.remove('active');
    if (t.nextElementSibling) t.nextElementSibling.inert = true;
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
  const previousProfile = currentProfile;
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
    document.getElementById(previousProfile === 'gestor' ? 'cardGestor' : 'cardUsuario')?.focus();
  }, 240);
}

// ── POPSTATE ───────────────────────────────────────────
window.addEventListener('popstate', e => {
  if (e.state?.profile) selectProfile(e.state.profile);
  else if (currentProfile) goBack();
});

// ── CONTENT BLOCKER ────────────────────────────────────
function setupContentBlocker() {
  // drive.google.com já era permitido; youtube/vimeo liberados para os
  // vídeos embutidos gerados por formatResposta() (ver buildVideoEmbed)
  const ALLOWED = ['drive.google.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'];

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
let chatIndex = null;
let chatHistory = [];
let chatLastItem = null;
let chatChoices = [];
let chatBusy = false;
let chatEpoch = 0;
let chatAbort = null;
let chatOpen     = false;
let chatGreeted  = false;

// Comandos e respostas rápidas — reconhecidos antes da busca no FAQ
const RE_SWITCH_PROFILE = /\b(trocar|mudar|alterar|selecionar)\s+(de\s+)?perfil\b|\boutro\s+perfil\b/i;
const CHAT_SMALLTALK = [
  { re: /^(oi+|ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite|e[ai]+|hey|hello)[\s!.,?]*$/i,
    reply: 'Olá! <svg xmlns="http://www.w3.org/2000/svg" class="inline-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align:-0.125em"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 3 4 3 4-3 4-3M8 9h.01M16 9h.01"/></svg> Pode digitar sua dúvida ou tocar em uma das sugestões abaixo.' },
  { re: /^(muito\s+)?(obrigad[oa]o?s?|grato|valeu|vlw)[\s!.,?]*$/i,
    reply: 'De nada! <svg xmlns="http://www.w3.org/2000/svg" class="inline-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align:-0.125em"><path d="m4 20 3-10 7 7-10 3ZM10 5l1-3M16 8l4-4M19 13l3 1M14 3l1 2M20 8l2-1"/></svg> Posso ajudar com mais alguma coisa?' },
  { re: /^(tchau|at[eé]\s+(mais|logo)|falou|adeus|bye)[\s!.,?]*$/i,
    reply: 'Até mais! <svg xmlns="http://www.w3.org/2000/svg" class="inline-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align:-0.125em"><path d="M8 13V6a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-4-6a1.5 1.5 0 0 1 2-2l2 2Z"/></svg> Estou por aqui se precisar de algo.' },
  { re: /\b(atendente|humano|pessoa\s+real|falar\s+com\s+algu[eé]m)\b/i,
    reply: 'Fale com a equipe do Ponto Eletrônico: <a class="chat-link" href="mailto:pontoeletronico@contagem.mg.gov.br">pontoeletronico@contagem.mg.gov.br</a> ou <a class="chat-link" href="https://wa.me/553175130029" target="_blank" rel="noopener">WhatsApp</a>.' },
];

/* ---- abertura/fechamento ---- */
function toggleChat() {
  chatOpen = !chatOpen;
  const modal = document.getElementById('chatModal');
  const fab   = document.getElementById('chatFab');
  const badge = document.getElementById('chatBadge');

  if (chatOpen) {
    modal.style.display = 'flex';
    modal.inert = false;
    requestAnimationFrame(() => modal.classList.add('chat-modal--open'));
    fab.setAttribute('aria-expanded', 'true');
    fab.setAttribute('aria-label', 'Fechar assistente de ajuda');
    badge.style.display = 'none';
    if (!chatGreeted) { chatGreeted = true; chatWelcome(); }
    setTimeout(() => {
      const target = document.getElementById('chatInput')?.disabled
        ? modal.querySelector('[data-chat-profile]')
        : document.getElementById('chatInput');
      target?.focus();
    }, 0);
  } else {
    modal.classList.remove('chat-modal--open');
    modal.inert = true;
    setTimeout(() => { modal.style.display = 'none'; }, 280);
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-label', 'Abrir assistente de ajuda');
    fab.focus();
  }
}

/* ---- mensagem de boas-vindas ---- */
function chatWelcome() {
  const picker = document.getElementById('chatProfilePicker');
  if (picker) picker.style.display = 'flex';
  chatAddMsg('bot', 'Olá! Sou o <strong>Antonio</strong>, assistente do Ponto.PMC. Selecione seu perfil acima para começar. <svg xmlns="http://www.w3.org/2000/svg" class="inline-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align:-0.125em"><path d="M12 20V4m-6 6 6-6 6 6"/></svg>');
}

/* ---- seleção de perfil no chat ---- */
function setChatProfile(profile) {
  if (!['gestor', 'usuario'].includes(profile)) return;
  cancelChatRequest();
  chatProfile = profile;
  chatIndex = null;
  setChatBusy(false);
  chatHistory = [];
  chatLastItem = null;
  chatChoices = [];
  if (!faqDB.length) {
    chatAddMsg('bot', 'Estou carregando a base de ajuda para o seu perfil…');
    if (faqState === 'error') loadFaqData();
    return;
  }
  _finishSetProfile(profile);
}

function _finishSetProfile(profile) {
  if (chatProfile !== profile) return;
  chatIndex = profile === 'gestor' ? searchGestor : searchUsuario;
  const picker = document.getElementById('chatProfilePicker');
  if (!chatIndex?.items.length) {
    chatIndex = null;
    chatAddMsg('bot', 'Ainda não há respostas cadastradas para esse perfil. A equipe do Ponto Eletrônico pode orientar pelo <a class="chat-link" href="mailto:pontoeletronico@contagem.mg.gov.br">e-mail de suporte</a>.');
    return;
  }
  if (picker) picker.style.display = 'none';
  const label = profile === 'gestor' ? 'Gestor' : 'Servidor';
  chatAddMsg('bot', `Perfil <strong>${label}</strong>. Qual é sua dúvida?`);
  setChatBusy(false);
  document.getElementById('chatInput')?.focus();
  // Temas distintos tornam os atalhos iniciais mais úteis.
  const themes = new Set();
  const suggestions = chatIndex.items.filter(item => {
    if (themes.has(item.tema)) return false;
    themes.add(item.tema); return true;
  }).slice(0, 3);
  chatAddSuggestions(suggestions.map(item => item.pergunta));
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
function setChatBusy(busy) {
  chatBusy = busy;
  const input = document.getElementById('chatInput');
  const button = document.getElementById('chatSendBtn');
  if (input) input.disabled = busy || !chatIndex;
  if (button) button.disabled = busy || !chatIndex;
  document.querySelectorAll('.chat-chip').forEach(chip => { chip.disabled = busy; });
  const status = document.querySelector('.chat-header-status');
  if (status) status.innerHTML = `<span class="chat-status-dot"></span> ${busy ? 'Buscando na base…' : 'Central de ajuda'}`;
  document.getElementById('chatMessages')?.setAttribute('aria-busy', String(busy));
}

function cancelChatRequest() {
  chatEpoch++;
  chatAbort?.abort();
  chatAbort = null;
  removeTyping();
  setChatBusy(false);
}

function showChatSource(item) {
  const obs = item.observacao ? `<div class="chat-obs"><i class="fas fa-info-circle"></i> ${escHtml(item.observacao)}</div>` : '';
  chatAddMsg('bot', `<span class="chat-source-label">Base de ajuda${item.tema ? ' · ' + escHtml(item.tema) : ''}</span>` +
    `<strong>${escHtml(item.pergunta)}</strong><br><br>${formatResposta(item.resposta)}${obs}`);
  chatLastItem = item;
  chatHistory.push({role: 'assistant', content: item.pergunta + '\n' + item.resposta});
  chatHistory = chatHistory.slice(-6);
}

async function chatSend(text) {
  text = String(text || '').trim().slice(0, 1500);
  if (!text || chatBusy) return;
  if (!chatIndex) {
    chatAddMsg('bot', 'Selecione seu perfil (Gestor ou Servidor) para começar.');
    return;
  }
  chatAddMsg('user', escHtml(text));
  document.querySelectorAll('.chat-suggestions').forEach(el => el.remove());
  if (RE_SWITCH_PROFILE.test(text)) { promptSwitchProfile(); return; }
  const smalltalk = CHAT_SMALLTALK.find(r => r.re.test(text));
  if (smalltalk) { chatAddMsg('bot', smalltalk.reply); return; }

  // Permite responder "a segunda" às opções apresentadas pelo próprio chat.
  const ordinal = PontoSearch.normalize(text).match(/^(?:a |o |opcao )?(1|2|3|primeir[ao]|segund[ao]|terceir[ao])$/);
  let chosen = null;
  if (ordinal) {
    const n = /^1|primeir/.test(ordinal[1]) ? 0 : /^2|segund/.test(ordinal[1]) ? 1 : 2;
    chosen = chatChoices[n];
  }
  const history = chatHistory.slice();
  chatHistory.push({role: 'user', content: text});
  chatHistory = chatHistory.slice(-6);
  chatChoices = [];
  if (chosen) { showChatSource(chosen); return; }

  const index = chatIndex;
  const epoch = ++chatEpoch;
  let results = index.search(text);
  const followup = !!chatLastItem && /^(e |mas |nesse caso|neste caso|isso|essa |esse |qual (?:e )?o prazo|quanto tempo)/.test(PontoSearch.normalize(text));
  let decision = null;
  let localFallback = false;
  // Só pula a interpretação para pergunta exata ou correspondência forte.
  if (results[0]?.exact || (!followup && index.confident(results))) {
    decision = {status: 'answer', items: [results[0].item]};
  } else {
    setChatBusy(true);
    chatTyping();
    const controller = new AbortController();
    chatAbort = controller;
    let timeout;
    try {
      decision = await Promise.race([
        PontoSearch.interpret(index, text, history, controller.signal),
        new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('Tempo de busca excedido')); }, 14000); })
      ]);
    } catch (_) {
      localFallback = true;
      if (followup) results = index.search(`${text} ${chatLastItem.pergunta}`);
      decision = {status: results.length ? 'clarify' : 'none', items: results.slice(0, 3).map(r => r.item)};
    } finally {
      clearTimeout(timeout);
      if (epoch === chatEpoch) { removeTyping(); chatAbort = null; setChatBusy(false); }
    }
  }
  // Limpar a conversa ou trocar perfil invalida respostas em andamento.
  if (epoch !== chatEpoch || chatProfile === null) return;
  if (decision.status === 'answer') {
    decision.items.forEach(showChatSource);
  } else if (decision.status === 'clarify') {
    chatAddMsg('bot', (localFallback ? 'A interpretação por IA está indisponível agora. Pela busca local, encontrei estas possibilidades. ' : '') +
      'Qual destas perguntas corresponde à sua dúvida?');
    chatChoices = decision.items;
    chatHistory.push({role: 'assistant', content: 'Opções: ' + decision.items.map((item, i) => `${i + 1}. ${item.pergunta}`).join(' | ')});
    chatAddSuggestions(decision.items.map(item => item.pergunta));
  } else {
    chatAddMsg('bot', (localFallback ? 'A interpretação por IA está indisponível e a busca local não encontrou uma resposta segura. ' : 'Não encontrei uma resposta na base para essa dúvida. ') +
      'Conte o que você tentou fazer e a mensagem de erro, se houver. Você também pode falar com a <a class="chat-link" href="mailto:pontoeletronico@contagem.mg.gov.br">equipe do Ponto Eletrônico</a>.');
  }
  document.getElementById('chatInput')?.focus();
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

/* ---- troca de perfil sem perder o histórico da conversa ---- */
function promptSwitchProfile() {
  chatProfile = null;
  chatIndex = null;
  cancelChatRequest();
  chatHistory = [];
  chatLastItem = null;
  chatChoices = [];

  const input   = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (input)   input.disabled   = true;
  if (sendBtn) sendBtn.disabled = true;

  chatAddMsg('bot', 'Sem problemas! Selecione o novo perfil abaixo. <svg xmlns="http://www.w3.org/2000/svg" class="inline-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align:-0.125em"><path d="M12 4v16m-6-6 6 6 6-6"/></svg>');
  const picker = document.getElementById('chatProfilePicker');
  if (picker) picker.style.display = 'flex';
}

/* ---- limpar conversa ---- */
function clearChat() {
  const log = document.getElementById('chatMessages');
  if (log) log.innerHTML = '';
  chatProfile  = null;
  chatIndex = null;
  cancelChatRequest();
  chatHistory = [];
  chatLastItem = null;
  chatChoices = [];
  chatGreeted  = true;

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
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !chatBusy) {
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

  // Tema — registra o clique só uma vez mesmo quando faq.js é carregado
  // junto com outro script da página (calculadora.js/imagem.js/script.js),
  // evitando dois listeners no mesmo botão (o que cancelava o clique)
  if (!window._ppThemeListenerSet) {
    window._ppThemeListenerSet = true;
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      const isDark = document.documentElement.dataset.theme !== 'dark';
      window.applyTheme(isDark);
      localStorage.setItem(window.THEME_KEY, isDark ? 'dark' : 'light');
    }, { passive: true });
  }

  // Navbar scroll
  const nav = document.querySelector('.site-nav');
  if (nav) window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 10), { passive: true });

  // Hamburger
  const hb = document.getElementById('hamburger');
  const nl = document.getElementById('navLinks');
  if (hb && nl && !window._ppNavListenerSet) {
    window._ppNavListenerSet = true;
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

  // Carrega dados da planilha e constrói índices por perfil
  loadFaqData();
});
