import { createTextBand } from './hero-text-band.js';

const original = document.querySelector('.hero-brand-band .hero-brasao');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

async function prepareWave() {
  if (!original) return;
  const response = await fetch(original.getAttribute('src'));
  if (!response.ok) throw new Error('Não foi possível carregar o brasão.');
  const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  // Extract only the original colors: the renderer supplies one continuous
  // text grid for both the crest and the full-width band.
  svg.querySelectorAll('[mask]').forEach(node => node.removeAttribute('mask'));
  svg.querySelector('defs')?.remove();
  svg.querySelector('style')?.remove();
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  const colors = new Image();
  try {
    colors.src = url;
    await colors.decode();
  } finally {
    URL.revokeObjectURL(url);
  }

  const band = original.parentElement;
  const textBand = createTextBand(band, reducedMotion, colors);
  const field = band.querySelector('.hero-text-field');
  field.removeAttribute('aria-hidden');
  field.setAttribute('role', 'img');
  field.setAttribute('aria-label', 'Brasão de Contagem formado pela frase Ponto Eletrônico da Prefeitura de Contagem, que continua por toda a faixa.');
  band.classList.add('is-unified');

  let visible = true, frame = 0, lastTime = -Infinity;
  function tick(time) {
    if (time - lastTime >= 1000 / 30) {
      textBand.draw(time);
      lastTime = time;
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    textBand.draw(reducedMotion.matches || lastTime === -Infinity ? 0 : lastTime);
    if (!reducedMotion.matches && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(band);
  reducedMotion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  sync();
}

prepareWave().catch(error => console.warn('Brasão original mantido:', error));
