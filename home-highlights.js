/* Scroll-controlled materials. No timer, autoplay or horizontal touch interception. */
(() => {
  const section = document.querySelector('.scroll-highlights');
  if (!section) return;
  const pin = section.querySelector('.highlights-pin');
  const items = [...section.querySelectorAll('.carousel-item')];
  const controls = [...section.querySelectorAll('[data-highlight]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => n * n * (3 - 2 * n);
  let geometry, current = null, frame = 0, previousTime = 0;

  function reset() {
    cancelAnimationFrame(frame); frame = 0; geometry = null; current = null;
    section.classList.remove('highlights-ready');
    items.forEach(item => {
      item.removeAttribute('style'); item.inert = false; item.removeAttribute('aria-hidden');
      item.querySelector('.carousel-image img')?.removeAttribute('style');
      item.querySelector('.carousel-text')?.removeAttribute('style');
    });
  }
  function progress() { return geometry ? clamp((scrollY - geometry.start) / geometry.distance) : 0; }
  function paint(p) {
    section.dataset.progress = p.toFixed(4);
    const position = Math.max(0, Math.min(items.length - 1, p * items.length - .5));
    const index = Math.min(items.length - 1, Math.floor(position));
    const transition = ease(clamp((position - index - .48) / .52));
    const active = Math.min(items.length - 1, index + (transition > .5 ? 1 : 0));
    items.forEach((item, i) => {
      const opacity = i === index ? 1 - transition : i === index + 1 ? transition : 0;
      item.style.opacity = String(opacity);
      item.style.visibility = opacity > .001 ? 'visible' : 'hidden';
      item.style.zIndex = String(i === active ? 2 : 1);
      item.style.pointerEvents = i === active ? 'auto' : 'none';
      const hidden = i !== active;
      if (item.inert !== hidden) item.inert = hidden;
      if (item.getAttribute('aria-hidden') !== String(hidden)) item.setAttribute('aria-hidden', String(hidden));
      item.classList.toggle('active', i === active);
      const image = item.querySelector('.carousel-image img');
      if (image) image.style.transform = `scale(${1.035 - clamp(position - i + .5) * .025})`;
      const text = item.querySelector('.carousel-text');
      if (text) text.style.transform = `translateY(${(i === index ? -transition : 1 - transition) * 12}px)`;
    });
    controls.forEach((control, i) => {
      if (i === active) control.setAttribute('aria-current','step');
      else control.removeAttribute('aria-current');
    });
  }
  function measure() {
    if (reduced.matches) { reset(); return; }
    section.classList.add('highlights-ready');
    const top = document.querySelector('.site-nav').getBoundingClientRect().height;
    const rect = section.getBoundingClientRect();
    geometry = { start: rect.top + scrollY - top, distance: Math.max(1, rect.height - pin.getBoundingClientRect().height) };
    current = progress(); paint(current);
  }
  function tick(time) {
    frame = 0;
    if (!geometry) return;
    const target = progress();
    if (current === target) { previousTime = time; return; }
    const delta = Math.min(64, previousTime ? time - previousTime : 16); previousTime = time;
    if (current === null || Math.abs(target-current) < .00008) current = target;
    else current += (target-current) * (1-Math.exp(-delta/95));
    paint(current);
    if (current !== target) frame = requestAnimationFrame(tick);
  }
  function schedule() { if (!frame && geometry) frame = requestAnimationFrame(tick); }
  controls.forEach((control, i) => control.addEventListener('click', () => {
    if (geometry) scrollTo({ top: geometry.start + ((i+.5)/items.length) * geometry.distance, behavior: 'smooth' });
  }));
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',measure,{passive:true});
  addEventListener('pageshow',measure);
  reduced.addEventListener('change',measure);
  const observer = new ResizeObserver(measure); observer.observe(pin);
  document.fonts?.ready.then(measure);
  measure();
})();
