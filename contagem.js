import { fallbackData } from './contagem-data.js';

const $ = id => document.getElementById(id);
const carousel = $('contagem-carousel');
const stage = $('contagem-stage');
const status = $('contagem-status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const CACHE_KEY = 'ponto-contagem-feed-v1';
const REFRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;
let refreshTimer;
let banners = [], current = 0, timer, hovering = false, paused = reducedMotion.matches;
let lastData, signature = '', loading = false, lastAttempt = 0;

function externalLink(url, className) {
  const a = document.createElement('a');
  a.href = url; a.className = className;
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}
function validUrl(value) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
function validData(data) {
  return data && Array.isArray(data.banners) && data.banners.length > 0 && data.banners.every(b => validUrl(b.image) && validUrl(b.url) && typeof b.title === 'string') && Number.isFinite(Date.parse(data.fetchedAt));
}
function schedule() {
  clearTimeout(timer);
  if (paused || hovering || document.hidden || carousel.contains(document.activeElement) || banners.length < 2) return;
  timer = setTimeout(() => show(current + 1), 6500);
}
function show(index) {
  if (!banners.length) return;
  current = (index + banners.length) % banners.length;
  [...stage.children].forEach((slide, i) => { slide.hidden = i !== current; });
  $('contagem-caption').textContent = banners[current].title;
  $('contagem-count').textContent = `${current + 1} / ${banners.length}`;
  schedule();
}
function updatePause() {
  $('contagem-pause').setAttribute('aria-label', paused ? 'Retomar rotação' : 'Pausar rotação');
  $('contagem-pause').firstElementChild.className = paused ? 'fas fa-play' : 'fas fa-pause';
  schedule();
}
function render(data, stale) {
  lastData = data;
  // A nova consulta também renova imagens substituídas no mesmo endereço.
  const nextSignature = JSON.stringify([data.banners, data.fetchedAt]);
  if (signature !== nextSignature) {
    signature = nextSignature;
    const previousImage = banners[current]?.image;
    banners = data.banners;
    stage.replaceChildren();
    banners.forEach((banner, i) => {
      const a = externalLink(banner.url, 'contagem-slide');
      a.setAttribute('aria-label', `${banner.title} — abrir no portal oficial`);
      a.hidden = i !== 0;
      const img = document.createElement('img');
      img.alt = banner.title;
      const imageUrl = new URL(banner.image);
      imageUrl.searchParams.set('_consulta', String(Date.parse(data.fetchedAt)));
      img.src = imageUrl.href;
      img.loading = i === 0 ? 'eager' : 'lazy'; img.decoding = 'async';
      img.addEventListener('error', () => {
        a.replaceChildren();
        a.classList.add('contagem-empty');
        a.textContent = `${banner.title} — ver no portal oficial ↗`;
      }, {once: true});
      a.append(img); stage.append(a);
    });
    $('contagem-controls').hidden = false;
    for (const id of ['contagem-prev', 'contagem-next', 'contagem-pause']) $(id).hidden = banners.length < 2;
    show(Math.max(0, banners.findIndex(banner => banner.image === previousImage)));

  }
  const date = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'}).format(new Date(data.fetchedAt));
  status.textContent = stale
    ? `Não foi possível atualizar agora. Exibindo a consulta de ${date} (Brasília).`
    : '';
  status.hidden = !stale;
  stage.setAttribute('aria-busy', 'false');
}
async function refresh() {
  if (loading) return;
  clearTimeout(refreshTimer);
  let nextRefresh = RETRY_MS;
  loading = true; lastAttempt = Date.now();
  try {
    const response = await fetch('/api/contagem', {cache: 'no-store', signal: AbortSignal.timeout(18000)});
    if (!response.ok) throw new Error('Fonte indisponível');
    const data = await response.json();
    if (!validData(data)) throw new Error('Resposta inválida');
    render(data, data.stale);
    nextRefresh = data.stale ? RETRY_MS : REFRESH_MS;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
  } catch {
    if (lastData) render(lastData, true);
    else {
      try {
        const data = fallbackData;
        if (!validData(data)) throw new Error('Sem cópia');
        render(data, true);
      } catch {
        status.textContent = 'Conteúdo temporariamente indisponível. Acesse os links oficiais acima.';
        status.hidden = false;
      }
    }
  } finally {
    loading = false; stage.setAttribute('aria-busy', 'false');
    refreshTimer = setTimeout(() => { if (!document.hidden) refresh(); }, nextRefresh);
  }
}
$('contagem-prev').addEventListener('click', () => show(current - 1));
$('contagem-next').addEventListener('click', () => show(current + 1));
$('contagem-pause').addEventListener('click', () => { paused = !paused; updatePause(); });
carousel.addEventListener('mouseenter', () => { hovering = true; schedule(); });
carousel.addEventListener('mouseleave', () => { hovering = false; schedule(); });
carousel.addEventListener('focusin', schedule);
carousel.addEventListener('focusout', () => setTimeout(schedule, 0));
carousel.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); show(current + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});
reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; updatePause(); });
document.addEventListener('visibilitychange', () => {
  schedule();
  if (!document.hidden && Date.now() - lastAttempt >= RETRY_MS) refresh();
  else if (!document.hidden) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, RETRY_MS - (Date.now() - lastAttempt));
  }
});
window.addEventListener('online', refresh);
try {
  const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
  if (validData(cached)) render(cached, true);
} catch {}
updatePause();
refresh();
