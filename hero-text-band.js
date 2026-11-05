const phrase = 'Ponto Eletrônico da Prefeitura de Contagem';

export function createTextBand(band, reducedMotion, colors) {
  const original = band.querySelector('.hero-brasao');
  const field = band.querySelector('.hero-text-field');
  const scene = document.createElement('canvas');
  const lensScene = document.createElement('canvas');
  const lens = document.createElement('canvas');
  lens.className = 'hero-text-lens';
  lens.setAttribute('aria-hidden', 'true');
  lens.hidden = true;
  band.append(lens);
  let width = 0, height = 0, ratio = 1, period = 0, fontSize = 3, rowHeight = 4;
  let crestX = 0, crestY = 0, crestWidth = 0, crestHeight = 0;
  let time = 0, active = false, x = 0, y = 0, gesture = null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const measure = scene.getContext('2d');
  let textColor = '#fdfdfd';
  let lensColor = '#34485e';

  function updatePalette() {
    const styles = getComputedStyle(band);
    lensColor = styles.getPropertyValue('--text-primary').trim() || '#34485e';
    const background = styles.getPropertyValue('--bg').trim() || '#ffffff';
    // Keep the surrounding text almost invisible until the lens reveals it.
    textColor = `color-mix(in srgb, ${background} 99%, ${lensColor} 1%)`;
    draw(time);
  }

  function resize() {
    width = band.clientWidth;
    height = band.clientHeight;
    if (!width || !height) return;
    const base = band.getBoundingClientRect();
    const bounds = original.getBoundingClientRect();
    crestX = bounds.left - base.left;
    crestY = bounds.top - base.top;
    crestWidth = bounds.width;
    crestHeight = bounds.height;
    ratio = Math.min(devicePixelRatio || 1, 2);
    // Extend the crest's original 10px type / 12px rows across the whole band.
    fontSize = 10 * crestWidth / 504;
    rowHeight = 12 * crestWidth / 504;
    measure.font = `700 ${fontSize}px monospace`;
    period = measure.measureText(`${phrase} `).width;
    draw(time);
  }

  function wave(globalX) {
    if (reducedMotion.matches) return 0;
    const position = (globalX - crestX) / crestWidth;
    const phase = time / 1000 * Math.PI * 2 * 0.28;
    const angle = position * Math.PI * 2 / 0.55 - phase;
    return crestWidth * 0.014 * clamp(0.55 + 0.45 * position, 0.3, 1.3)
      * (Math.sin(angle) + 0.35 * Math.sin(angle * 2.3 + phase * 0.6 + 1));
  }

  // Both views use one text grid, one color silhouette, and one displacement.
  function render(target, buffer, left, top, viewWidth, viewHeight, zoom, enlarged) {
    const scale = ratio * zoom;
    const pad = 12;
    const pixelWidth = Math.round(viewWidth * scale);
    const pixelHeight = Math.round(viewHeight * scale);
    const bufferHeight = Math.ceil((viewHeight + pad * 2) * scale);
    if (target.width !== pixelWidth || target.height !== pixelHeight) {
      target.width = pixelWidth; target.height = pixelHeight;
    }
    if (buffer.width !== pixelWidth || buffer.height !== bufferHeight) {
      buffer.width = pixelWidth; buffer.height = bufferHeight;
    }
    const ink = buffer.getContext('2d');
    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.globalCompositeOperation = 'source-over';
    ink.clearRect(0, 0, buffer.width, buffer.height);
    ink.setTransform(scale, 0, 0, scale, -left * scale, (pad - top) * scale);
    ink.font = `700 ${fontSize}px monospace`;
    ink.fillStyle = '#fff';
    const offset = reducedMotion.matches ? 0 : (time / 18000 * 258 * crestWidth / 504) % period;
    const firstRow = Math.floor((top - pad - crestY - fontSize) / rowHeight);
    const lastRow = Math.ceil((top + viewHeight + pad - crestY) / rowHeight);
    for (let row = firstRow; row <= lastRow; row++) {
      const baseline = crestY + fontSize + row * rowHeight;
      const origin = crestX + (((row % 3) + 3) % 3) * period / 3 - offset;
      const start = origin + Math.floor((left - origin) / period) * period;
      for (let column = start; column < left + viewWidth; column += period) {
        ink.fillText(`${phrase} `, column, baseline);
      }
    }
    // Change only glyph colors at the crest: no second layer of lettering.
    ink.globalCompositeOperation = 'source-in';
    ink.fillStyle = enlarged ? lensColor : textColor;
    ink.fillRect(left, top - pad, viewWidth, viewHeight + pad * 2);
    ink.globalCompositeOperation = 'source-atop';
    ink.drawImage(colors, crestX, crestY, crestWidth, crestHeight);
    ink.globalCompositeOperation = 'source-over';

    const out = target.getContext('2d');
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.clearRect(0, 0, pixelWidth, pixelHeight);
    out.save();
    out.beginPath();
    out.rect(-left * scale, -top * scale, width * scale, height * scale);
    out.clip();
    for (let column = 0; column < pixelWidth; column += 2) {
      const slice = Math.min(2, pixelWidth - column);
      const dy = wave(left + column / scale);
      out.drawImage(buffer, column, (pad - dy) * scale, slice, pixelHeight,
        column, 0, slice, pixelHeight);
    }
    out.restore();
  }

  function renderLens() {
    if (!active || !period) return;
    const size = Math.min(260, width * 0.68, height - 12);
    const zoom = 6;
    x = clamp(x, 0, width);
    y = clamp(y, 0, height);
    lens.style.width = `${size}px`;
    lens.style.height = `${size}px`;
    lens.style.left = `${clamp(x - size / 2, 6, width - size - 6)}px`;
    lens.style.top = `${clamp(y - size / 2, 6, height - size - 6)}px`;
    render(lens, lensScene, x - size / zoom / 2, y - size / zoom / 2, size / zoom, size / zoom, zoom, true);
  }

  function draw(timestamp) {
    time = timestamp;
    if (!period) return;
    render(field, scene, 0, 0, width, height, 1, false);
    renderLens();
  }

  function activate(value) {
    active = value;
    lens.hidden = !value;
    band.classList.toggle('is-magnifying', value);
    band.setAttribute('aria-pressed', String(value));
    band.setAttribute('aria-label', value ? 'Fechar lupa do texto' : 'Ampliar texto da faixa com a lupa');
    renderLens();
  }

  function position(event) {
    const bounds = band.getBoundingClientRect();
    x = event.clientX - bounds.left;
    y = event.clientY - bounds.top;
  }
  band.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, wasActive: active, moved: false };
    band.setPointerCapture(event.pointerId);
    position(event);
    activate(true);
  });
  band.addEventListener('pointermove', event => {
    if (!event.isPrimary || !active) return;
    if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.moved = true;
    position(event);
    renderLens();
  });
  band.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const close = gesture.wasActive && !gesture.moved;
    gesture = null;
    if (band.hasPointerCapture(event.pointerId)) band.releasePointerCapture(event.pointerId);
    if (close) activate(false);
  });
  band.addEventListener('pointercancel', () => { gesture = null; activate(false); });
  band.addEventListener('click', event => {
    if (event.detail === 0) {
      x = width / 2; y = height / 2;
      activate(!active);
    }
  });
  band.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!active) { x = width / 2; y = height / 2; }
      activate(!active);
    } else if (active && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      x += event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
      y += event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0;
      renderLens();
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') activate(false); });
  document.addEventListener('pointerdown', event => { if (active && !band.contains(event.target)) activate(false); });
  reducedMotion.addEventListener('change', () => draw(time));
  new ResizeObserver(resize).observe(band);
  new MutationObserver(updatePalette).observe(document.documentElement, {
    attributes: true, subtree: true, attributeFilter: ['data-theme']
  });
  updatePalette();
  resize();
  return { draw };
}
