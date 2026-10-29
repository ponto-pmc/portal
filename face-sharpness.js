// Nitidez facial por processamento de imagem clássico. As medidas são feitas
// depois de reduzir o rosto a aproximadamente 100 px de largura.
const EYES = [
  { eye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], brow: [70, 63, 105, 66, 107] },
  { eye: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398], brow: [336, 296, 334, 293, 300] },
];

function bounds(points, ids) {
  return {
    x0: Math.min(...ids.map(i => points[i].x)), x1: Math.max(...ids.map(i => points[i].x)),
    y0: Math.min(...ids.map(i => points[i].y)), y1: Math.max(...ids.map(i => points[i].y)),
  };
}

function regionScores(gray, width, height, box) {
  const x0 = Math.max(2, Math.floor(box.x0));
  const y0 = Math.max(2, Math.floor(box.y0));
  const x1 = Math.min(width - 2, Math.ceil(box.x1));
  const y1 = Math.min(height - 2, Math.ceil(box.y1));
  let count = 0, sumLap = 0, sumLapSq = 0, sumGradSq = 0;

  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * width + x;
    const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
    // Sobel / 8 mantém o gradiente na escala de brilho por pixel.
    const gx = (gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1]
      - gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1]) / 8;
    const gy = (gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1]
      - gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]) / 8;
    sumLap += lap; sumLapSq += lap * lap; sumGradSq += gx * gx + gy * gy; count++;
  }
  if (count < 100) return { lapVariance: 0, tenengrad: 0 };
  const lapMean = sumLap / count;
  return { lapVariance: Math.max(0, sumLapSq / count - lapMean * lapMean), tenengrad: sumGradSq / count };
}

export function measureFaceSharpness(img, points, limits) {
  const { w, h } = img;
  // Uma suavização gaussiana leve reduz ruído de sensor e artefatos JPEG que
  // poderiam aumentar artificialmente a variância do Laplaciano.
  const smooth = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, g = img.gray;
    smooth[i] = (g[i - w - 1] + 2 * g[i - w] + g[i - w + 1]
      + 2 * g[i - 1] + 4 * g[i] + 2 * g[i + 1]
      + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]) / 16;
  }

  const eyeBoxes = EYES.map(({ eye, brow }) => {
    const e = bounds(points, eye), b = bounds(points, brow);
    const eyeWidth = e.x1 - e.x0;
    return { x0: e.x0 - 0.12 * eyeWidth, x1: e.x1 + 0.12 * eyeWidth,
      y0: Math.min(b.y0, e.y0 - 0.35 * eyeWidth), y1: e.y1 + 0.2 * eyeWidth };
  });
  const eyeWidth = (eyeBoxes[0].x1 - eyeBoxes[0].x0 + eyeBoxes[1].x1 - eyeBoxes[1].x0) / 2;
  const nose = {
    x0: Math.min(points[129].x, points[6].x) - 0.12 * eyeWidth,
    x1: Math.max(points[358].x, points[6].x) + 0.12 * eyeWidth,
    y0: points[6].y,
    y1: Math.max(points[1].y, points[2].y) + 0.15 * eyeWidth,
  };
  const regions = [...eyeBoxes, nose].map(box => regionScores(smooth, w, h, box));
  const weak = regions.map(r => r.lapVariance < limits.lapVarianceMin && r.tenengrad < limits.tenengradMin);
  const weakCount = weak.filter(Boolean).length;
  const severeEye = regions.slice(0, 2).some(r =>
    r.lapVariance < limits.lapVarianceMin * 0.35 && r.tenengrad < limits.tenengradMin * 0.35);
  return {
    lapVarianceEyes: (regions[0].lapVariance + regions[1].lapVariance) / 2,
    tenengradEyes: (regions[0].tenengrad + regions[1].tenengrad) / 2,
    lapVarianceNose: regions[2].lapVariance,
    tenengradNose: regions[2].tenengrad,
    sharpWeakRegions: weakCount,
    blurred: weakCount >= 2 || severeEye,
  };
}
