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
      // reconstrói fuseChat se o chat já estiver com perfil selecionado
      if (chatProfile) _finishSetProfile(chatProfile);
    }
  });
}

// ── INDEXAÇÃO COM FUSE.JS ──────────────────────────────
function buildIndexes() {
  const gestorItems  = faqDB.filter(r => matchesProfile(r.perfil, 'gestor'));
  const usuarioItems = faqDB.filter(r => matchesProfile(r.perfil, 'usuario'));

  fuseGestor  = new Fuse(gestorItems,  FUSE_OPTS);
  fuseUsuario = new Fuse(usuarioItems, FUSE_OPTS);
}

// ── RENDERIZAÇÃO DOS ACORDEONS ─────────────────────────
function renderFaqSections() {
  const gestorItems  = faqDB.filter(r => matchesProfile(r.perfil, 'gestor'));
  const usuarioItems = faqDB.filter(r => matchesProfile(r.perfil, 'usuario'));

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
    const shared = isSharedPerfil(item.perfil)
      ? '<span class="badge accordion-badge"><i class="fas fa-users"></i> Ambos os perfis</span>'
      : '';
    return `
      <div class="accordion-item" data-index="${idx}">
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
  }).join('');
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
    const shared = isSharedPerfil(item.perfil)
      ? '<span class="badge accordion-badge"><i class="fas fa-users"></i> Ambos os perfis</span>'
      : '';
    return `
      <div class="accordion-item search-result" data-index="${idx}">
        <button class="accordion-trigger" aria-expanded="${idx === 0 ? 'true' : 'false'}">
          <span class="accordion-question">${perguntaHL}${shared}</span>
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
let fuseChat     = null;   // índice Fuse ativo para o chat
let chatOpen     = false;
let chatGreeted  = false;

// Comandos e respostas rápidas — reconhecidos antes da busca no FAQ
const RE_SWITCH_PROFILE = /\b(trocar|mudar|alterar|selecionar)\s+(de\s+)?perfil\b|\boutro\s+perfil\b/i;
const CHAT_SMALLTALK = [
  { re: /^(oi+|ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite|e[ai]+|hey|hello)[\s!.,?]*$/i,
    reply: 'Olá! 😊 Pode digitar sua dúvida ou tocar em uma das sugestões abaixo.' },
  { re: /^(muito\s+)?(obrigad[oa]o?s?|grato|valeu|vlw)[\s!.,?]*$/i,
    reply: 'De nada! 🙌 Posso ajudar com mais alguma coisa?' },
  { re: /^(tchau|at[eé]\s+(mais|logo)|falou|adeus|bye)[\s!.,?]*$/i,
    reply: 'Até mais! 👋 Estou por aqui se precisar de algo.' },
  { re: /\b(atendente|humano|pessoa\s+real|falar\s+com\s+algu[eé]m)\b/i,
    reply: 'Para atendimento humano, contate a equipe SEAD ou acesse o <a class="chat-link" href="https://forponto.contagem.mg.gov.br/ForpontoWeb/login.aspx" target="_blank" rel="noopener">ForPonto Web</a>. Enquanto isso, me diga sua dúvida que eu tento ajudar por aqui. 🙂' },
];

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
  chatAddMsg('bot',
    'Olá! 👋 Sou o <strong>Antonio</strong>, assistente virtual do <strong>Ponto.PMC</strong>.<br><br>' +
    'Posso te ajudar com:<br>' +
    '<ul class="resp-list">' +
      '<li>Dúvidas sobre o <strong>ForPonto Web</strong></li>' +
      '<li>Registro e abono de ponto</li>' +
      '<li>Configuração do app e senha</li>' +
      '<li>Relatórios e gestão de equipe</li>' +
    '</ul>' +
    'Selecione seu <strong>perfil abaixo</strong> para começar. 👆'
  );
}

/* ---- seleção de perfil no chat ---- */
function setChatProfile(profile) {
  chatProfile = profile;

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
        _finishSetProfile(profile);
      }
    }, 300);
    return;
  }

  _finishSetProfile(profile);
}

function _finishSetProfile(profile) {
  const items = faqDB.filter(r => matchesProfile(r.perfil, profile));

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

  // comandos e conversas rápidas — respondem direto, sem acionar busca no FAQ
  if (RE_SWITCH_PROFILE.test(text)) { promptSwitchProfile(); return; }
  const smalltalk = CHAT_SMALLTALK.find(r => r.re.test(text));
  if (smalltalk) {
    chatTyping();
    setTimeout(() => { removeTyping(); chatAddMsg('bot', smalltalk.reply); }, 450 + Math.random() * 200);
    return;
  }

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
      // sem resultado: tenta uma busca bem permissiva antes de cair nas perguntas genéricas
      let sugestoes = [];
      if (docs.length) {
        const fuseLoose = new Fuse(docs, { ...FUSE_OPTS_FUZZY, threshold: 0.9 });
        sugestoes = fuseLoose.search(text).slice(0, 4).map(r => r.item.pergunta);
      }
      if (!sugestoes.length) sugestoes = docs.slice(0, 4).map(i => i.pergunta);
      chatAddMsg('bot',
        `Não encontrei nada exato sobre <strong>"${escHtml(text)}"</strong> no manual. 🔍<br><br>` +
        `Tente reformular a pergunta ou clique em uma das sugestões abaixo:`
      );
      if (sugestoes.length) chatAddSuggestions(sugestoes);
      return;
    }

    const top   = results[0].item;
    const score = typeof results[0].score === 'number' ? results[0].score : 0;
    const lead  = score > 0.4 ? 'Não achei uma correspondência exata, mas isso talvez ajude:<br><br>' : '';
    const obs = top.observacao
      ? `<div class="chat-obs"><i class="fas fa-info-circle"></i> ${escHtml(top.observacao)}</div>`
      : '';

    chatAddMsg('bot',
      lead + `<strong>${escHtml(top.pergunta)}</strong><br><br>` +
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

/* ---- troca de perfil sem perder o histórico da conversa ---- */
function promptSwitchProfile() {
  chatProfile = null;
  fuseChat    = null;

  const input   = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (input)   input.disabled   = true;
  if (sendBtn) sendBtn.disabled = true;

  chatAddMsg('bot', 'Sem problemas! Selecione o novo perfil abaixo. 👇');
  const picker = document.getElementById('chatProfilePicker');
  if (picker) picker.style.display = 'flex';
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
