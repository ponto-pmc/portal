/* One native scroll timeline, one pinned composition, reversible visual state. */
(() => {
  'use strict';
  const journey = document.querySelector('.journey');
  if (!journey) return;
  const layout = journey.querySelector('.journey-layout');
  const stage = journey.querySelector('.demo-stage');
  const visual = journey.querySelector('.visual-column');
  const terminal = stage.querySelector('.terminal');
  const screen = stage.querySelector('.terminal-screen');
  const standby = stage.querySelector('.standby');
  const photo = stage.querySelector('.photo-travel');
  const signalPath = stage.querySelector('.terminal-path');
  const clock = stage.querySelector('.time-travel');
  const confirmation = stage.querySelector('.confirm-symbol');
  const report = stage.querySelector('.report-card');
  const cell = stage.querySelector('.destination');
  const row = cell.closest('tr');
  const panels = [journey.querySelector('.home-intro'), ...journey.querySelectorAll('.home-step')];
  const compact = matchMedia('(max-width: 900px)');
  const shortViewport = matchMedia('(max-width: 900px) and (max-height: 620px), (max-width: 350px) and (max-height: 650px), (max-height: 475px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phases = { '#cadastro': .30, '#registro': .57, '#frequencia': .94 };
  const clamp = x => Math.max(0, Math.min(1, x));
  const range = (p, a, b) => clamp((p - a) / (b - a));
  const ease = t => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;
  let geometry, frame = 0, current = null, lastTick = 0, failed = false, interacted = false;

  function reset() {
    cancelAnimationFrame(frame); frame = 0; geometry = null; current = null;
    document.body.classList.remove('motion-ready');
    for (const element of [terminal, standby, photo, signalPath, clock, confirmation, report, row, visual, ...panels]) element.removeAttribute('style');
    for (const panel of panels) { panel.inert = false; panel.removeAttribute('aria-hidden'); }
    cell.querySelector('span').style.visibility = '';
    stage.style.removeProperty('--scene-height');
    stage.style.removeProperty('--field-scale');
  }

  function rawProgress() {
    return geometry ? clamp((scrollY - geometry.start) / geometry.distance) : 0;
  }

  function measure() {
    if (failed || reduced.matches || shortViewport.matches) { reset(); return; }
    const nav = Math.ceil(document.querySelector('.site-nav').getBoundingClientRect().height);
    const bottom = document.querySelector('.mobile-bank-nav')?.getBoundingClientRect().height || 0;
    document.body.style.setProperty('--home-nav-height', `${nav}px`);
    document.body.style.setProperty('--home-bottom-nav', `${bottom}px`);
    document.body.classList.add('motion-ready');
    const pin = layout.getBoundingClientRect();
    const mobile = compact.matches;
    const copyGap = 16;
    const bottomGap = 8;
    let openingY = 0;
    visual.style.transform = 'none';
    stage.style.removeProperty('--scene-height');
    if (mobile) {
      openingY = panels[0].offsetTop + panels[0].getBoundingClientRect().height + 12;
      const tallestCopy = Math.max(...panels.slice(1).map(panel => panel.getBoundingClientRect().height));
      const stageHeight = stage.getBoundingClientRect().height;
      const footerHeight = visual.getBoundingClientRect().height - stageHeight;
      const availableHeight = Math.floor(pin.height - footerHeight - tallestCopy - copyGap - bottomGap);
      if (availableHeight < stageHeight) stage.style.setProperty('--scene-height', `${Math.max(120, availableHeight)}px`);
    }
    terminal.style.transform = 'none';
    report.style.transform = 'none';
    const box = stage.getBoundingClientRect();
    const display = screen.getBoundingClientRect();
    const target = cell.getBoundingClientRect();
    const bounds = journey.getBoundingClientRect();
    const width = Math.min(display.width * .82, display.height * .64);
    const visualHeight = visual.getBoundingClientRect().height;
    if (mobile) document.body.style.setProperty('--mobile-copy-top', `${visualHeight + copyGap}px`);
    geometry = {
      start: bounds.top + scrollY - nav,
      distance: Math.max(1, bounds.height - pin.height),
      width: box.width,
      screenX: display.left - box.left + display.width / 2,
      screenY: display.top - box.top + display.height * .46,
      photoX: display.left - box.left + (display.width - width) / 2,
      photoY: display.top - box.top + (display.height - width * 1.25) / 2,
      photoScale: width / 144,
      cellX: target.left - box.left + target.width / 2,
      cellY: target.top - box.top + target.height / 2,
      openingY,
      openingScale: mobile ? clamp((pin.height - openingY - bottomGap) / visualHeight) : 1
    };
    current = rawProgress();
    paint(current);
  }

  function paint(p) {
    const g = geometry;
    if (!g) return;
    stage.dataset.progress = p.toFixed(4);
    const enter = [1, ease(range(p, .15, .22)), ease(range(p, .42, .49)), ease(range(p, .69, .76))];
    const leave = [ease(range(p, compact.matches ? .08 : .15, compact.matches ? .18 : .22)), ease(range(p, .42, .49)), ease(range(p, .69, .76)), 0];
    const mobileTravel = compact.matches ? ease(range(p, .02, .20)) : 1;
    panels.forEach((panel, i) => {
      const opacity = enter[i] * (1 - leave[i]);
      panel.style.opacity = String(opacity);
      panel.style.visibility = opacity > .001 ? 'visible' : 'hidden';
      const mobileOffset = compact.matches ? (i === 0 ? -g.openingY * mobileTravel : g.openingY * (1 - mobileTravel)) : 0;
      panel.style.transform = `translateY(${mobileOffset + (1 - enter[i]) * 20 - leave[i] * 16}px)`;
      const hidden = opacity < .5;
      if (panel.inert !== hidden) panel.inert = hidden;
      if (panel.getAttribute('aria-hidden') !== String(hidden)) panel.setAttribute('aria-hidden', String(hidden));
    });
    visual.style.transform = compact.matches
      ? `translateY(${g.openingY * (1 - mobileTravel)}px) scale(${mix(g.openingScale, 1, mobileTravel)})`
      : 'none';
    const dock = ease(range(p, .17, .34));
    const photoOut = ease(range(p, .41, .49));
    const shift = ease(range(p, .64, .73)) * -g.width * .17;
    const transfer = ease(range(p, .73, .90));
    const tilt = (1 - ease(range(p, 0, .16))) * (compact.matches ? -3 : -10);
    terminal.style.transform = `translateX(${shift}px) rotateY(${tilt}deg)`;
    stage.style.setProperty('--field-scale', String(1 + .075 * Math.sin(Math.PI * p)));
    standby.style.opacity = String(1 - ease(range(p, .14, .22)));
    photo.style.opacity = String(ease(range(p, .15, .21)) * (1 - photoOut));
    photo.style.transform = `translate(${mix(g.width * .04, g.photoX, dock)}px, ${mix(g.width * .24, g.photoY, dock)}px) scale(${mix(1.02, g.photoScale, dock)})`;
    photo.style.clipPath = `inset(${dock * 7}px round 6px)`;
    photo.querySelector('.photo-corners').style.transform = `scale(${mix(1.12, 1, dock)})`;
    photo.style.setProperty('--scan-offset', `${100 * range(p, .33, .45)}%`);
    photo.style.setProperty('--scan-opacity', String(ease(range(p, .33, .36)) * (1 - ease(range(p, .42, .45)))));
    confirmation.style.opacity = String(ease(range(p, .52, .57)) * (1 - ease(range(p, .66, .72))));
    const card = ease(range(p, .65, .73));
    report.style.opacity = String(card);
    report.style.transform = `translateY(${(1 - card) * 22}px)`;
    const x = mix(g.screenX + shift, g.cellX, transfer) - 60;
    const y = mix(g.screenY, g.cellY, transfer) - 29 - Math.sin(transfer * Math.PI) * 28;
    const trailX = x + 60 - (g.screenX + shift);
    const trailY = y + 29 - g.screenY;
    signalPath.style.left = `${g.screenX + shift}px`;
    signalPath.style.top = `${g.screenY}px`;
    signalPath.style.width = `${Math.hypot(trailX, trailY)}px`;
    signalPath.style.transform = `rotate(${Math.atan2(trailY, trailX)}rad)`;
    signalPath.style.setProperty('--wire-opacity', String(ease(range(p, .73, .77)) * (1 - ease(range(p, .87, .93)))));
    clock.style.transform = `translate(${x}px, ${y}px) scale(${mix(1, 16 / 33.6, transfer)})`;
    const tint = ease(range(transfer, .05, .55));
    clock.style.color = `rgb(${mix(234, 45, tint)}, ${mix(248, 125, tint)}, ${mix(250, 224, tint)})`;
    const arrived = p >= .90;
    clock.style.opacity = arrived ? '0' : String(ease(range(p, .46, .51)));
    cell.querySelector('span').style.visibility = arrived ? 'visible' : 'hidden';
    row.style.backgroundColor = `rgba(45, 125, 224, ${ease(range(p, .88, .93)) * .075})`;
  }

  function tick(time) {
    frame = 0;
    if (!geometry || failed || reduced.matches) return;
    const target = rawProgress();
    if (current === target) { lastTick = time; return; }
    const elapsed = Math.min(64, lastTick ? time - lastTick : 16);
    lastTick = time;
    if (current === null || Math.abs(target - current) < .00008) current = target;
    else current += (target - current) * (1 - Math.exp(-elapsed / 95));
    paint(current);
    if (current !== target) frame = requestAnimationFrame(tick);
  }
  function schedule() { if (!frame && geometry) frame = requestAnimationFrame(tick); }

  function toHash(behavior = 'instant') {
    if (!geometry || !(location.hash in phases)) return;
    window.scrollTo({ top: geometry.start + phases[location.hash] * geometry.distance, behavior });
    if (behavior === 'instant') { current = rawProgress(); paint(current); }
    schedule();
  }

  try {
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', measure, { passive: true });
    addEventListener('pageshow', measure);
    addEventListener('load', () => { measure(); if (!interacted) requestAnimationFrame(() => toHash()); }, { once: true });
    addEventListener('hashchange', () => requestAnimationFrame(() => { measure(); toHash(); }));
    for (const name of ['pointerdown', 'wheel', 'touchstart', 'keydown']) addEventListener(name, () => { interacted = true; }, { once: true, passive: true });
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!geometry || !link || event.button || event.ctrlKey || event.metaKey || event.shiftKey || link.target) return;
      const destination = new URL(link.href);
      if (destination.origin !== location.origin || destination.pathname !== location.pathname || !(destination.hash in phases)) return;
      event.preventDefault();
      history.pushState(null, '', destination.hash);
      toHash('smooth');
    });
    compact.addEventListener('change', measure);
    shortViewport.addEventListener('change', measure);
    reduced.addEventListener('change', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(layout); observer.observe(stage); observer.observe(document.querySelector('.site-nav'));
    panels.forEach(panel => observer.observe(panel));
    document.fonts?.ready.then(measure);
    const failMedia = () => { failed = true; reset(); };
    for (const image of [stage.querySelector('.terminal-image'), photo.querySelector('img')]) {
      image.addEventListener('error', failMedia);
      image.addEventListener('load', measure);
      if (image.complete && !image.naturalWidth) failMedia();
    }
    measure();
    requestAnimationFrame(() => toHash());
  } catch (error) {
    reset();
    console.warn('Conteúdo estático preservado:', error);
  }
})();

// Keep the official Libras launcher away from the primary mobile service buttons.
(() => {
  const mobile = matchMedia('(max-width: 900px)');
  function placeLibras() {
    const launcher = document.getElementById('vlibras-access-wrapper')?.shadowRoot?.querySelector('#vlibras-access');
    if (!launcher) return false;
    launcher.style.top = mobile.matches ? '84px' : '';
    return true;
  }
  mobile.addEventListener('change', placeLibras);
  addEventListener('load', placeLibras, { once: true });
  const observer = new MutationObserver(() => { if (placeLibras()) observer.disconnect(); });
  observer.observe(document.body, { childList: true, subtree: true });
  placeLibras();
})();
