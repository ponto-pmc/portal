import { measureFaceSharpness } from './face-sharpness.js';
'use strict';

const photoResampler = window.pica();

/* =====================================================================
   CONFIGURAÇÃO  — o que normalmente se mexe fica aqui
   ===================================================================== */
const CONFIG = {
  // Endereço do Web App do Google Apps Script (ver Code.gs) e o token combinado.
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbzsDkA3yCzRNpLZ3ourM0fh3s9fIJiFeNriVKS73hMU5cPXcjc5kqP0Ok_s2ex0aNT4rA/exec',
  TOKEN:    'sKHwQaBbn-3G-DzAjq-RGINix73A_sr1',

  OUT_SIZE: 200,          // tamanho final (px) aceito pelo ponto
  JPEG_QUALITY: 0.93,
  MAX_FILE_MB: 15,
  ANALYSIS_MAX_SIDE: 1280, // lado maior usado na análise
  FOREHEAD_MARGIN: 0.06,   // folga acima do ponto da testa (× altura do rosto)
  SIDE_MARGIN: 0.01,       // o rosto (orelha a orelha) precisa ficar a pelo menos 1% da borda lateral
  CHIN_PAD: 0.05,          // folga abaixo do ponto do queixo detectado (× altura do rosto). O ponto fica ~3-4% acima da ponta real; sem essa folga o queixo corta. Também é o espaço mínimo exigido na foto original.
  HEAD_MARGIN: 0.01,       // folga em volta da cabeça (cabelo até barba), fração da altura da cabeça
  HEAD_BG_DIST: 50,        // quanto o pixel precisa diferir do fundo para contar como cabelo
  BEARD_DARK: 0.62,        // barba = pixel mais escuro que essa fração do brilho da pele
  BEARD_MAX: 0.4,          // até quanto abaixo do queixo procurar barba (× altura do rosto)

  // MediaPipe: tenta primeiro a cópia local (pasta vendor/mediapipe), depois a CDN.
  MP_LOCAL: 'vendor/mediapipe',
  MP_CDN:   'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
  MODEL_LOCAL: 'vendor/mediapipe/face_landmarker.task',
  MODEL_CDN:   'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',

  REJECT_SMILE: false,    // true = também recusa sorriso/boca aberta

  // Limites de aceitação — ajustar com o modo calibragem (?debug=1)
  T: {
    minSide: 200,           // largura e altura mínimas para gerar 200x200 sem ampliar
    faceHeightMin: 0.22,    // altura do rosto / altura da imagem
    faceHeightMax: 0.92,
    centerOffsetMax: 0.22,  // desvio do centro do rosto / largura da imagem
    blinkMax: 0.55,         // blendshape eyeBlink (olho fechado)
    squintMax: 0.5,         // blendshape eyeSquint médio (olhos apertados)
    smileForSquint: 0.35,   // se estiver sorrindo acima disso...
    smileEyeOpenMax: 0.50,  // ...e o olho estiver menos aberto que isso (÷ íris), recusa
    eyeOpenMin: 0.375,       // abertura do olho ÷ diâmetro da íris (calibrar)
    earMin: 0.12,           // abertura do olho (altura/largura); abaixo disso = fechado
    yawMax: 0.14,           // |posição do nariz − 0,5| (rosto virado)
    rollMaxDeg: 12,         // cabeça inclinada
    pitchMin: 0.45, pitchMax: 0.64, // razão vertical nariz (rosto para cima/baixo)
    grayChromaMax: 10,      // só considera P&B quando quase todos os canais RGB são iguais
    grayColorFracMax: 0.02, // tolera pequenos artefatos de compressão JPEG
    faceLumaMin: 70, faceLumaMax: 232,   // rosto escuro / estourado
    lapVarianceMin: 55,     // rosto normalizado a ~100 px; variância do Laplaciano
    tenengradMin: 60,       // energia média do gradiente Sobel nas mesmas regiões
    // fundo
    bgPatch: 0.09,          // lado dos recortes de fundo (fração do menor lado da imagem)
    bgLumaMin: 150,         // fundo claro
    bgSatMax: 0.28,         // saturação média máxima (fundo "sem cor")
    bgStdMax: 30,           // desvio padrão do brilho (fundo liso)
    bgRangeMax: 70,         // amplitude p90−p10 do brilho
    cropBgColorDist: 22,    // cor das partes lisas do fundo no recorte: diferença máxima entre elas
    cropBgNear: 50,         // pixel parecido com o fundo (para achar vão de parede entre um objeto e a pessoa)
    cropGapFrac: 0.03,      // vão de parede lisa (fração da largura do recorte) que separa objeto de cabelo
    bgSideGap: 0.5,         // distância mínima (× largura do rosto) entre o recorte lateral e o rosto
    bgDarkIgnore: 85,       // recorte mais escuro que isso é tratado como cabelo/roupa
    // óculos
    glassesRatioMax: 1,     // ponte e aros inferiores devem aparecer juntos, acima da textura da pele
    // reflexo nos olhos
    glareFracMax: 0.07,     // fração de pixels estourados dentro da íris
    // sombra nos olhos
    eyeShadowRatioMin: 0.50,// brilho da pálpebra ÷ brilho da bochecha
    hairDarkRatio: 0.68,    // pixel mais escuro que essa fração do brilho da pele = possível cabelo
    eyeStrandRatio: 0.55,   // pixel da parte branca do olho mais escuro que essa fração da pele = mecha/sombra
    eyeCoverRatioMax: 0.55, // contraste do olho mais "chapado" ÷ olho mais nítido: abaixo disso, um olho parece coberto
    eyeCoverAsymMin: 0.18,  // e o brilho das duas pálpebras difere mais que isso (eyeAsym)
    hairEyeAboveMax: 0.30,  // entre a sobrancelha e o olho
    hairEyeUnderMax: 0.30,  // embaixo do olho
    hairTempleMax: 0.25,    // têmporas
    hairCheekMax: 0.30,     // parte alta das bochechas
    eyeAsymMax: 0.45,       // diferença entre os dois olhos
    secondFaceMin: 0.45,    // 2º rosto só conta se tiver ao menos essa fração da largura do 1º
    // sorriso (se REJECT_SMILE)
    smileMax: 0.45, jawOpenMax: 0.25,
  },
};

const SECRETARIAS = [
  ['GP','Gabinete da Prefeita'],['GVP','Gabinete do Vice Prefeito'],
  ['SEGOV','Secretaria Municipal de Governo e Participação Popular'],
  ['PGM','Procuradoria Geral do Município'],['CGM','Controladoria Geral do Município'],
  ['SECOM','Secretaria Municipal de Comunicação'],['SEAD','Secretaria Municipal de Administração'],
  ['SEFAZ','Secretaria Municipal de Fazenda'],
  ['SEPLAN','Secretaria Municipal de Planejamento, Orçamento e Gestão'],
  ['SMDSSA','Secretaria Municipal de Desenvolvimento Social e Segurança Alimentar'],
  ['SMDU','Secretaria Municipal de Desenvolvimento Urbano'],['SEDUC','Secretaria Municipal de Educação'],
  ['SMS','Secretaria Municipal de Saúde'],['SEDECON','Secretaria Municipal de Desenvolvimento Econômico'],
  ['SEMOBS','Secretaria Municipal de Obras'],['SEDS','Secretaria Municipal de Defesa Social'],
  ['SMDHC','Secretaria Municipal de Direitos Humanos e Cidadania'],
  ['SEMEL','Secretaria Municipal de Esporte e Lazer'],
  ['SEMAD','Secretaria Municipal de Meio Ambiente e Desenvolvimento Sustentável'],
  ['SECULT','Secretaria Municipal de Cultura'],['STI','Secretaria Municipal de Tecnologia da Informação'],
  ['SG','Secretaria Geral'],['SLC','Secretaria Municipal de Licitação e Contratos'],
  ['SEHAB','Secretaria Municipal de Habitação'],['SSU','Secretaria Municipal de Serviços Urbanos'],
  ['SETGER','Secretaria Municipal de Trabalho e Geração de Renda'],
  ['SMUJ','Secretaria Municipal da Mulher e da Juventude'],
];

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const $ = id => document.getElementById(id);

/* =====================================================================
   TEMA + MENU (mesmo comportamento das outras páginas)
   ===================================================================== */
(function themeAndMenu() {
  const KEY = 'pp-theme';
  const apply = d => { document.documentElement.dataset.theme = d ? 'dark' : 'light';
    const i = $('themeIcon'); if (i) i.className = d ? 'fas fa-sun' : 'fas fa-moon'; };
  try { apply(localStorage.getItem(KEY) === 'dark'); } catch { apply(false); }
  $('themeToggle')?.addEventListener('click', () => {
    const d = document.documentElement.dataset.theme !== 'dark'; apply(d);
    try { localStorage.setItem(KEY, d ? 'dark' : 'light'); } catch {}
  });
  const nav = document.querySelector('.site-nav');
  addEventListener('scroll', () => nav?.classList.toggle('scrolled', scrollY > 10), { passive: true });
  const hb = $('hamburger'), nl = $('navLinks');
  hb?.addEventListener('click', () => {
    const open = nl.classList.toggle('open'); hb.setAttribute('aria-expanded', String(open));
    hb.innerHTML = open ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars" aria-hidden="true"></i>';
  });
})();
if (DEBUG) document.body.classList.add('debug');

/* =====================================================================
   FUNÇÕES PURAS DE ANÁLISE (recebem pixels + pontos do rosto)
   ===================================================================== */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const sat  = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function percentile(arr, p) {
  if (!arr.length) return NaN;
  const s = Float32Array.from(arr).sort(); return s[clamp(Math.round((s.length - 1) * p), 0, s.length - 1)];
}
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const std  = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

// Imagem de análise: { w, h, data (RGBA), gray (Float32Array) }
function makeImg(imageData) {
  const { width: w, height: h, data } = imageData;
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = luma(data[j], data[j + 1], data[j + 2]);
  return { w, h, data, gray };
}
// Caixa em pixels (limitada à imagem). box = {x0,y0,x1,y1} em px
function fixBox(img, b) {
  return { x0: clamp(Math.floor(b.x0), 0, img.w - 1), y0: clamp(Math.floor(b.y0), 0, img.h - 1),
           x1: clamp(Math.ceil(b.x1), 1, img.w),     y1: clamp(Math.ceil(b.y1), 1, img.h) };
}
function boxLumas(img, box) {
  const b = fixBox(img, box), out = [];
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) out.push(img.gray[y * img.w + x]);
  return out;
}
// energia média de gradiente (Sobel simplificado) dentro da caixa
function boxEdge(img, box) {
  const b = fixBox(img, box); let s = 0, n = 0;
  for (let y = Math.max(1, b.y0); y < Math.min(img.h - 1, b.y1); y++)
    for (let x = Math.max(1, b.x0); x < Math.min(img.w - 1, b.x1); x++) {
      const i = y * img.w + x, g = img.gray;
      const gx = g[i + 1] - g[i - 1], gy = g[i + img.w] - g[i - img.w];
      s += Math.hypot(gx, gy); n++;
    }
  return n ? s / n : 0;
}
function boxFromCenter(cx, cy, w, h) { return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 }; }

const IDX = {
  rEye: [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],
  lEye: [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398],
  rIris: [468,469,470,471,472], lIris: [473,474,475,476,477],
};

// pts = landmarks normalizados -> converte para pixels
function toPx(lm, img) { return lm.map(p => ({ x: p.x * img.w, y: p.y * img.h })); }
function ptsBox(pts, ids) {
  const xs = ids.map(i => pts[i].x), ys = ids.map(i => pts[i].y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/* ---- Fundo: recortes nos cantos e laterais altas da foto ----
   Em fotos 3x4 o rosto ocupa quase tudo, então o fundo só aparece nos cantos.
   Recortes muito escuros são tratados como cabelo/roupa e ignorados. */
function patchStats(img, x0, y0, side) {
  const lum = [], sats = []; const rgb = [0, 0, 0]; let n = 0;
  const b = fixBox(img, { x0, y0, x1: x0 + side, y1: y0 + side });
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const j = (y * img.w + x) * 4, r = img.data[j], g = img.data[j + 1], bl = img.data[j + 2];
    lum.push(luma(r, g, bl)); sats.push(sat(r, g, bl)); rgb[0] += r; rgb[1] += g; rgb[2] += bl; n++;
  }
  if (!n) return null;
  return { luma: mean(lum), sat: mean(sats), std: std(lum), range: percentile(lum, 0.9) - percentile(lum, 0.1), rgb: rgb.map(v => Math.round(v / n)) };
}
function checkBackground(img, P, T) {
  const side = Math.max(8, T.bgPatch * Math.min(img.w, img.h));
  const chinY = P[152].y, eyeY = (P[33].y + P[263].y) / 2;
  const spots = [['TL', 0, 0], ['TR', img.w - side, 0]];
  // laterais, do alto até o queixo, mas só onde estão longe da cabeça (senão pegaria cabelo)
  const gap = T.bgSideGap * dist(P[234], P[454]);
  for (let fy = 0.18; fy < 0.95; fy += 0.12) {
    const y = fy * img.h; if (y + side > chinY) break;
    if (side <= P[234].x - gap) spots.push(['L' + fy.toFixed(2), 0, y]);
    if (img.w - side >= P[454].x + gap) spots.push(['R' + fy.toFixed(2), img.w - side, y]);
  }
  // o 1º par (alto) continua valendo mesmo em foto fechada, como antes
  if (!spots.some(sp => sp[0].startsWith('L'))) spots.push(['L0.18', 0, 0.18 * img.h]);
  if (!spots.some(sp => sp[0].startsWith('R'))) spots.push(['R0.18', img.w - side, 0.18 * img.h]);
  const patches = [];
  for (const [name, x, y] of spots) {
    const st = patchStats(img, x, y, side); if (!st) continue;
    st.name = name; st.x = x; st.y = y; st.side = side; st.dark = st.luma < T.bgDarkIgnore;
    st.plain = st.luma >= T.bgLumaMin && st.sat <= T.bgSatMax && st.std <= T.bgStdMax && st.range <= T.bgRangeMax;
    patches.push(st);
  }
  const m = { bgPatches: patches.map(p => `${p.name}:${p.luma.toFixed(0)}/${p.sat.toFixed(2)}/${p.std.toFixed(0)}${p.plain ? '+' : p.dark ? 'd' : '-'}`).join(' ') };
  const considered = patches.filter(p => !p.dark);   // escuros podem ser cabelo
  const darkTop = patches.filter(p => p.dark && (p.name === 'TL' || p.name === 'TR')).length;
  m.bgOk = considered.length ? considered.every(p => p.plain) : false;
  m.bgBad = considered.filter(p => !p.plain).length;
  m.bgDarkAll = patches.length > 0 && considered.length === 0;
  const ref = (considered.find(p => p.plain) || patches[0]);
  m.bgColor = ref ? ref.rgb : null;
  m.bgLuma = ref ? ref.luma : NaN;
  m.bgSat = considered.length ? mean(considered.map(p => p.sat)) : NaN;
  m.bgStd = considered.length ? Math.max(...considered.map(p => p.std)) : NaN;
  m.bgRange = considered.length ? Math.max(...considered.map(p => p.range)) : NaN;
  m.bgDarkTop = darkTop;
  m.bgRaw = patches;
  return m;
}

/* ---- Óculos: ponte e aros abaixo dos olhos vs pele abaixo da armação ---- */
function checkGlasses(img, P) {
  const rb = ptsBox(P, IDX.rEye), lb = ptsBox(P, IDX.lEye);
  const eyeW = (rb.x1 - rb.x0 + lb.x1 - lb.x0) / 2;
  const bridge = boxFromCenter((P[133].x + P[362].x) / 2, (P[168].y + P[6].y) / 2, (P[362].x - P[133].x) * 0.8, Math.abs(P[6].y - P[168].y) * 1.0);
  // Aros grandes descem bem abaixo dos olhos. A referência antiga caía sobre o próprio aro.
  const lowerRim = b => ({ x0: b.x0 - 0.25 * eyeW, x1: b.x1 + 0.25 * eyeW,
    y0: b.y1 + 0.16 * eyeW, y1: b.y1 + 0.68 * eyeW });
  const cheekR = boxFromCenter(P[50].x, P[50].y + 0.65 * eyeW, 0.7 * eyeW, 0.4 * eyeW);
  const cheekL = boxFromCenter(P[280].x, P[280].y + 0.65 * eyeW, 0.7 * eyeW, 0.4 * eyeW);
  const ref = (boxEdge(img, cheekR) + boxEdge(img, cheekL)) / 2;
  const eb = boxEdge(img, bridge), er = boxEdge(img, lowerRim(rb)), el = boxEdge(img, lowerRim(lb));
  const bridgeRatio = eb / (ref + 3), rimRatio = Math.min(er, el) / (ref + 3);
  // Exige evidência nos dois aros e na ponte para não confundir sombras ou sobrancelhas com óculos.
  const score = Math.min(bridgeRatio / 1.5, rimRatio / 1.2);
  return { glassesRatio: score, glassesBridgeRatio: bridgeRatio, glassesRimRatio: rimRatio,
    edgeBridge: eb, edgeUnder: (er + el) / 2, edgeCheek: ref };
}

/* ---- Reflexo (pixels estourados e sem cor dentro da íris) ---- */
function checkGlare(img, P) {
  const out = {};
  for (const [name, ids] of [['R', IDX.rIris], ['L', IDX.lIris]]) {
    const c = P[ids[0]];
    const r = mean(ids.slice(1).map(i => dist(P[i], c))) || 1;
    let hit = 0, tot = 0;
    for (let y = Math.floor(c.y - r); y <= Math.ceil(c.y + r); y++)
      for (let x = Math.floor(c.x - r); x <= Math.ceil(c.x + r); x++) {
        if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
        if ((x - c.x) ** 2 + (y - c.y) ** 2 > (0.85 * r) ** 2) continue;
        const j = (y * img.w + x) * 4, R = img.data[j], G = img.data[j + 1], B = img.data[j + 2];
        tot++; if (luma(R, G, B) > 235 && sat(R, G, B) < 0.2) hit++;
      }
    out['glare' + name] = tot ? hit / tot : 0;
  }
  out.glare = Math.max(out.glareR, out.glareL);
  return out;
}

/* ---- Sombra nos olhos: pálpebra/órbita vs bochecha ---- */
function checkEyeShadow(img, P) {
  const rb = ptsBox(P, IDX.rEye), lb = ptsBox(P, IDX.lEye);
  const eyeW = (rb.x1 - rb.x0 + lb.x1 - lb.x0) / 2;
  const sock = b => ({ x0: b.x0, x1: b.x1, y0: b.y0 - 0.30 * eyeW, y1: b.y0 + 0.05 * eyeW });
  const cheek = c => boxFromCenter(c.x, c.y + 0.1 * eyeW, 0.8 * eyeW, 0.5 * eyeW);
  const sR = percentile(boxLumas(img, sock(rb)), 0.75), sL = percentile(boxLumas(img, sock(lb)), 0.75);
  const cR = percentile(boxLumas(img, cheek(P[50])), 0.6), cL = percentile(boxLumas(img, cheek(P[280])), 0.6);
  const ref = (cR + cL) / 2 || 1;
  return { eyeShadow: Math.min(sR, sL) / ref, eyeSockR: sR, eyeSockL: sL, cheekRef: ref,
           eyeAsym: Math.abs(sR - sL) / Math.max(sR, sL, 1) };
}

/* ---- Rosto: brilho médio e nitidez localizada ---- */
function checkFaceQuality(img, P, sharpImg = img, sharpP = P) {
  const f = fixBox(img, { x0: P[234].x, x1: P[454].x, y0: P[10].y, y1: P[152].y });
  const vals = []; for (let y = f.y0; y < f.y1; y += 2) for (let x = f.x0; x < f.x1; x += 2) vals.push(img.gray[y * img.w + x]);
  return { faceLuma: mean(vals), ...measureFaceSharpness(sharpImg, sharpP, CONFIG.T) };
}

/* ---- Cor: detecta somente imagens realmente acromáticas ---- */
function checkColor(img, P) {
  const f = fixBox(img, { x0: P[234].x, x1: P[454].x, y0: P[10].y, y1: P[152].y });
  let sum = 0, n = 0, colored = 0, strong = 0, csum = 0;
  for (let y = f.y0; y < f.y1; y += 2) for (let x = f.x0; x < f.x1; x += 2) {
    const j = (y * img.w + x) * 4, r = img.data[j], g = img.data[j + 1], b = img.data[j + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 40) continue;                       // ignora sombras profundas
    sum += (mx - mn) / mx; csum += mx - mn; n++; if (mx - mn > 14) colored++; if (mx - mn > 30) strong++;
  }
  // Pele pode ser pouco saturada; a evidência de cor vem da foto toda.
  // Em P&B de verdade, R, G e B ficam quase iguais em praticamente todos os pixels.
  let imageN = 0, imageColor = 0;
  const chromas = [];
  const step = Math.max(1, Math.round(Math.min(img.w, img.h) / 200));
  for (let y = 0; y < img.h; y += step) for (let x = 0; x < img.w; x += step) {
    const j = (y * img.w + x) * 4, r = img.data[j], g = img.data[j + 1], b = img.data[j + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 40 || mx > 245) continue;
    const chroma = mx - mn;
    chromas.push(chroma); imageN++;
    if (chroma >= CONFIG.T.grayChromaMax) imageColor++;
  }
  const imageColorFrac = imageN ? imageColor / imageN : 0;
  const imageChromaP95 = percentile(chromas, 0.95);
  const grayscale = imageN >= 100 && imageColorFrac < CONFIG.T.grayColorFracMax && imageChromaP95 < CONFIG.T.grayChromaMax;
  return { faceSat: n ? sum / n : 0, colorFrac: n ? colored / n : 0,
    faceChroma: n ? csum / n : 0, strongFrac: n ? strong / n : 0,
    imageColorFrac, imageChromaP95, grayscale };
}

/* ---- Pose e enquadramento ---- */
function checkPose(img, P) {
  const top = P[10], chin = P[152], left = P[234], right = P[454], nose = P[1];
  const fh = dist(top, chin), fw = dist(left, right);
  const yaw = (nose.x - left.x) / (right.x - left.x) - 0.5;
  const rollDeg = Math.atan2(P[263].y - P[33].y, P[263].x - P[33].x) * 180 / Math.PI;
  const pitch = (nose.y - top.y) / (chin.y - top.y);
  return {
    faceHeightFrac: fh / img.h, faceWidthFrac: fw / img.w,
    centerOffset: Math.abs((left.x + right.x) / 2 - img.w / 2) / img.w,
    yaw, rollDeg, pitch,
  };
}

function blend(blendshapes, name) {
  const c = blendshapes?.[0]?.categories?.find(c => c.categoryName === name); return c ? c.score : 0;
}

/* =====================================================================
   REGRAS → MENSAGENS (o que a pessoa lê quando a foto é recusada)
   ===================================================================== */
function evaluate(img, faces, blendshapes, sharpImg = img) {
  const T = CONFIG.T, reasons = [], M = {};
  const lm = faces[0]; let nFaces = faces.length;
  if (nFaces > 1) {   // 2º rosto só conta se for relevante (evita falso positivo em fundo/estampa)
    const wd = f => Math.abs(f[454].x - f[234].x);
    const cen = f => ({ x: (f[234].x + f[454].x) / 2, y: (f[10].y + f[152].y) / 2 });
    const c0 = cen(lm), w0 = wd(lm);
    // conta só rostos de tamanho relevante e que não sejam duplicata do primeiro (mesmo lugar)
    nFaces = 1 + faces.slice(1).filter(f => wd(f) >= T.secondFaceMin * w0 && Math.hypot(cen(f).x - c0.x, cen(f).y - c0.y) > 0.6 * w0).length;
  }
  const R = (code, titulo, texto) => reasons.push({ code, titulo, texto });

  if (nFaces === 0) {
    R('sem_rosto', 'Não encontramos um rosto na foto',
      'Use uma foto em que seu rosto apareça inteiro, de frente, sem máscara, boné ou nada cobrindo. Evite fotos muito escuras ou tremidas.');
    return { ok: false, reasons, metrics: M };
  }
  if (nFaces > 1) {
    R('varios_rostos', 'Há mais de uma pessoa na foto', 'Envie uma foto em que apareça somente você.');
    return { ok: false, reasons, metrics: M };
  }
  const P = toPx(lm, img);
  Object.assign(M, checkPose(img, P));

  // Enquadramento
  if (M.faceHeightFrac < T.faceHeightMin)
    R('longe', 'Você está longe demais', 'O rosto ficou muito pequeno. Chegue mais perto ou enquadre da cabeça até os ombros.');
  else if (M.faceHeightFrac > T.faceHeightMax)
    R('perto', 'Você está perto demais', 'O rosto ocupa quase toda a foto. Afaste um pouco a câmera para mostrar a cabeça até os ombros, com um pouco de espaço ao redor.');
  if (M.centerOffset > T.centerOffsetMax)
    R('descentralizado', 'Rosto fora do centro', 'Centralize o rosto na foto.');
  if (Math.abs(M.yaw) > T.yawMax)
    R('rosto_virado', 'Rosto não está de frente', 'Olhe diretamente para a câmera, sem virar a cabeça para os lados.');
  if (M.pitch < T.pitchMin)
    R('camera_baixa', 'Foto tirada de baixo para cima', 'A câmera está abaixo do rosto. Deixe o celular na altura dos olhos e olhe para a lente.');
  else if (M.pitch > T.pitchMax)
    R('camera_alta', 'Foto tirada de cima para baixo', 'A câmera está acima do rosto. Deixe o celular na altura dos olhos e olhe para a lente.');
  if (Math.abs(M.rollDeg) > T.rollMaxDeg)
    R('inclinado', 'Cabeça inclinada', 'Mantenha a cabeça reta e a câmera na altura dos olhos.');

  // Olhos abertos
  M.blink = Math.max(blend(blendshapes, 'eyeBlinkLeft'), blend(blendshapes, 'eyeBlinkRight'));
  const ear = (a, b, c, d, w1, w2) => (dist(P[a], P[b]) + dist(P[c], P[d])) / (2 * dist(P[w1], P[w2]));
  M.ear = Math.min(ear(159, 145, 158, 153, 33, 133), ear(386, 374, 385, 380, 362, 263));
  const openRatio = (top1, bot1, top2, bot2, i1, i2) => ((dist(P[top1], P[bot1]) + dist(P[top2], P[bot2])) / 2) / Math.max(1, dist(P[i1], P[i2]));
  M.eyeOpen = Math.min(openRatio(159, 145, 158, 153, 469, 471), openRatio(386, 374, 385, 380, 476, 474));
  // olhos apertados (sorriso largo, riso, luz forte): a íris fica difícil de ver
  M.squint = (blend(blendshapes, 'eyeSquintLeft') + blend(blendshapes, 'eyeSquintRight')) / 2;
  M.smile = (blend(blendshapes, 'mouthSmileLeft') + blend(blendshapes, 'mouthSmileRight')) / 2;
  const apertados = M.squint > T.squintMax || (M.smile > T.smileForSquint && M.eyeOpen < T.smileEyeOpenMax);
  if (apertados)
    R('olhos_apertados', 'Olhos apertados (sorriso)', 'Os olhos ficaram apertados e a íris quase não aparece. Fique com o rosto relaxado, sem sorrir, e com os olhos bem abertos.');
  if (!apertados && (M.blink > T.blinkMax || M.ear < T.earMin || M.eyeOpen < T.eyeOpenMin))
    R('olhos_fechados', 'Olhos fechados ou semicerrados', 'Mantenha os dois olhos bem abertos, olhando para a câmera.');

  // Expressão (opcional)
  if (CONFIG.REJECT_SMILE) {
    M.jawOpen = blend(blendshapes, 'jawOpen');
    if (M.smile > T.smileMax || M.jawOpen > T.jawOpenMax)
      R('expressao', 'Expressão não neutra', 'Mantenha o rosto relaxado, sem sorrir e com a boca fechada.');
  }

  // Foto em preto e branco
  Object.assign(M, checkColor(img, P));
  if (M.grayscale)
    R('preto_branco', 'Foto em preto e branco', 'Envie uma foto colorida, sem filtro. Desative filtros ou o modo preto e branco da câmera e tire outra foto.');

  // Qualidade do rosto
  Object.assign(M, checkFaceQuality(img, P, sharpImg, toPx(lm, sharpImg)));
  if (M.faceLuma < T.faceLumaMin)
    R('escura', 'Foto muito escura', 'Vá para um local bem iluminado, com a luz vindo de frente (de uma janela, por exemplo).');
  else if (M.faceLuma > T.faceLumaMax)
    R('estourada', 'Foto muito clara (estourada)', 'Há luz demais no rosto. Evite flash e luz direta muito forte.');
  if (M.blurred)
    R('desfocada', 'Rosto sem nitidez', 'Os detalhes dos olhos, sobrancelhas ou nariz estão suavizados. Limpe a lente, segure o aparelho firme, toque no rosto para focar e tire outra foto.');

  // Fundo
  const bg = checkBackground(img, P, T); Object.assign(M, bg);
  if (bg.bgDarkAll) {
    R('fundo', 'Fundo fora do padrão', 'O fundo está escuro. Use uma parede branca ou de cor bem clara.');
  } else if (!bg.bgOk) {
    let why = 'O fundo precisa ser liso e claro. Use uma parede lisa, sem objetos, quadros ou sombras atrás de você.';
    if (bg.bgLuma < T.bgLumaMin) why = 'O fundo está escuro. Use uma parede branca ou de cor bem clara.';
    else if (bg.bgSat > T.bgSatMax) why = 'O fundo é colorido. Use uma parede branca ou de cor bem clara e neutra.';
    R('fundo', 'Fundo fora do padrão', why);
  }

  // Óculos
  Object.assign(M, checkGlasses(img, P));
  if (M.glassesRatio > T.glassesRatioMax)
    R('oculos', 'Parece que você está de óculos', 'Tire os óculos (inclusive os de grau) e envie a foto novamente.');

  // Reflexo nos olhos
  Object.assign(M, checkGlare(img, P));
  if (M.glare > T.glareFracMax)
    R('reflexo', 'Reflexo de luz nos olhos', 'Há um brilho forte nos olhos. Evite flash e fontes de luz muito fortes de frente (janela ou lâmpada), e olhe para a câmera.');

  // Sombra nos olhos
  Object.assign(M, checkEyeShadow(img, P));
  if (M.eyeShadow < T.eyeShadowRatioMin)
    R('sombra_olhos', 'Sombra nos olhos', 'Há sombra sobre os olhos (boné, franja ou luz vindo de cima). Deixe os olhos visíveis e use luz de frente, sem luz forte vindo do alto.');
  else if (M.eyeAsym > T.eyeAsymMax)
    R('luz_desigual', 'Iluminação desigual no rosto', 'Um lado do rosto está mais escuro que o outro. Fique de frente para a janela ou fonte de luz.');

  // Cabelo na testa é permitido; reprova somente quando há evidência de olho coberto.
  Object.assign(M, checkHairOnFace(img, P, T));
  if (M.eyeContrastRatio < T.eyeCoverRatioMax && M.eyeAsym > T.eyeCoverAsymMin)
    R('cabelo_olhos', 'Um dos olhos está coberto', 'Um dos olhos parece estar escondido por cabelo ou sombra. Afaste o cabelo dos olhos e deixe os dois totalmente visíveis.');

  return { ok: reasons.length === 0, reasons, metrics: M, P };
}

/* =====================================================================
   RECORTE + REDUÇÃO PARA 200×200
   ===================================================================== */

/** Mede regiões escuras do rosto para diagnóstico e a visibilidade dos olhos.
 *  Cabelo sobre a testa é permitido; a região da testa não reprova a foto. */
function checkHairOnFace(img, P, T) {
  const fw = dist(P[234], P[454]), fh = dist(P[10], P[152]);
  const sk = [P[50], P[280]].map(p => percentile(boxLumas(img, boxFromCenter(p.x, p.y, 0.12 * fw, 0.12 * fw)), 0.5));
  const skin = mean(sk);
  const thr = T.hairDarkRatio * skin;
  const frac = (x0, y0, x1, y1) => {
    const b = fixBox(img, { x0, y0, x1, y1 }); let n = 0, t = 0;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { t++; if (img.gray[y * img.w + x] < thr) n++; }
    return t >= 12 ? n / t : 0;
  };
  const minY = ids => Math.min(...ids.map(i => P[i].y)), maxY = ids => Math.max(...ids.map(i => P[i].y));
  const browTop = minY([70, 63, 105, 66, 107, 336, 296, 334, 293, 300]);
  const browBotR = maxY([46, 53, 52, 65, 55]), browBotL = maxY([276, 283, 282, 295, 285]);
  const rb = ptsBox(P, IDX.rEye), lb = ptsBox(P, IDX.lEye);
  const m = { hairSkin: skin };
  // testa: entre ~30% da distância "ponto do topo → sobrancelha" e a sobrancelha
  const fy0 = P[10].y + 0.30 * (browTop - P[10].y), fy1 = browTop - 0.03 * fh;
  m.hairForehead = fy1 - fy0 >= 4 ? frac(P[105].x, fy0, P[334].x, fy1) : 0;
  // pálpebra (entre a sobrancelha e o olho) e abaixo do olho
  const above = (b, browBot) => { const y0 = browBot + 0.045 * fh, y1 = b.y0 - 0.005 * fh; return y1 - y0 >= 4 ? frac(b.x0, y0, b.x1, y1) : 0; };
  const under = b => frac(b.x0, b.y1 + 0.02 * fh, b.x1, b.y1 + 0.10 * fh);
  m.hairEyeAbove = Math.max(above(rb, browBotR), above(lb, browBotL));
  m.hairEyeUnder = Math.max(under(rb), under(lb));
  // mecha cruzando o olho: faixa horizontal no meio da abertura, só na parte branca (esclera), fora da íris
  const eyeStrand = (b, iris) => {
    const cx = P[iris[0]].x, cy = P[iris[0]].y, r = Math.max(2, dist(P[iris[1]], P[iris[3]]) / 2);
    const w = b.x1 - b.x0, hgt = Math.max(3, b.y1 - b.y0);
    const y0 = cy - 0.22 * hgt, y1 = cy + 0.22 * hgt;
    let n = 0, t = 0; const bb = fixBox(img, { x0: b.x0 + 0.12 * w, y0, x1: b.x1 - 0.12 * w, y1 });
    for (let y = bb.y0; y < bb.y1; y++) for (let x = bb.x0; x < bb.x1; x++) {
      if (Math.abs(x - cx) < 1.35 * r) continue;           // pula a íris/pupila
      t++; if (img.gray[y * img.w + x] < T.eyeStrandRatio * skin) n++;
    }
    return t >= 10 ? n / t : 0;
  };
  m.eyeStrand = Math.max(eyeStrand(rb, [468, 469, 470, 471, 472]), eyeStrand(lb, [473, 474, 475, 476, 477]));
  // contraste dentro de cada olho: olho visível tem branco (esclera) e íris escura; olho coberto por cabelo é uma região "chapada"
  const eyeContrast = b => { const w = b.x1 - b.x0, h = b.y1 - b.y0;
    const l = boxLumas(img, { x0: b.x0 + 0.08 * w, y0: b.y0 + 0.05 * h, x1: b.x1 - 0.08 * w, y1: b.y1 - 0.05 * h });
    return l.length >= 20 ? (percentile(l, 0.95) - percentile(l, 0.05)) / (skin || 1) : 1; };
  m.eyeContrastR = eyeContrast(rb); m.eyeContrastL = eyeContrast(lb);
  m.eyeContrast = Math.min(m.eyeContrastR, m.eyeContrastL);
  m.eyeContrastRatio = m.eyeContrast / Math.max(m.eyeContrastR, m.eyeContrastL, 0.01);
  // têmporas: do canto externo do olho até a borda do rosto, na altura dos olhos
  const eyeW = (rb.x1 - rb.x0 + lb.x1 - lb.x0) / 2;
  m.hairTemple = Math.max(
    frac(P[234].x + 0.03 * fw, rb.y0 - 0.05 * fh, rb.x0 - 0.05 * eyeW, rb.y1 + 0.05 * fh),
    frac(lb.x1 + 0.05 * eyeW, lb.y0 - 0.05 * fh, P[454].x - 0.03 * fw, lb.y1 + 0.05 * fh));
  // parte alta das bochechas (acima da ponta do nariz)
  const cy0 = Math.max(rb.y1, lb.y1) + 0.10 * fh, cy1 = P[1].y;
  m.hairCheek = cy1 - cy0 >= 4 ? Math.max(frac(P[234].x + 0.03 * fw, cy0, P[129].x, cy1), frac(P[358].x, cy0, P[454].x - 0.03 * fw, cy1)) : 0;
  return m;
}

/* ---- Extensão da cabeça: cabelo (topo) e barba (base) ----
   Os pontos do rosto marcam só a pele (testa→queixo). Cabelo e barba ficam de fora,
   então medimos: topo = onde termina o que é diferente do fundo; base = onde termina a barba escura. */

/** Fundo dentro do RECORTE FINAL. Um trecho que não é "parede lisa" só é aceito se for cabelo/corpo ligado à
 *  cabeça (contínuo até o rosto). Se houver parede lisa entre ele e a pessoa, é objeto solto (porta, quadro,
 *  moldura, parede de outra cor) e reprova. */
function checkCropBackground(img, P, T) {
  const bg = checkBackground(img, P, T);
  const raw = bg.bgRaw || [];
  const plains = raw.filter(p => p.plain);
  const out = { ok: false, why: 'plain', patches: bg.bgPatches };
  if (!plains.length) return Object.assign(out, { why: raw.length && raw.every(p => p.dark) ? 'dark' : 'plain' });
  // todas as partes lisas precisam ter praticamente a mesma cor (parede única)
  const ref = plains[0].rgb;
  const chroma = c => { const l = luma(c[0], c[1], c[2]); return [c[0] - l, c[1] - l, c[2] - l]; };
  const cd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const refC = chroma(ref);
  if (plains.some(p => cd(chroma(p.rgb), refC) > T.cropBgColorDist)) return Object.assign(out, { why: 'color' });
  const near = (x, y) => { const j = (Math.min(img.h - 1, Math.max(0, Math.round(y))) * img.w + Math.min(img.w - 1, Math.max(0, Math.round(x)))) * 4;
    return Math.hypot(img.data[j] - ref[0], img.data[j + 1] - ref[1], img.data[j + 2] - ref[2]) <= T.cropBgNear; };
  const faceCx = (P[234].x + P[454].x) / 2, minGap = T.cropGapFrac * img.w;
  for (const p of raw) {
    if (p.plain) continue;
    // anda do trecho em direção ao centro do rosto; se achar um vão de parede lisa, o trecho é objeto solto
    const y = p.y + p.side / 2, x0 = p.x + p.side / 2, dir = faceCx >= x0 ? 1 : -1;
    let run = 0, maxRun = 0;
    for (let x = x0; dir > 0 ? x <= faceCx : x >= faceCx; x += dir) { if (near(x, y)) { run++; if (run > maxRun) maxRun = run; } else run = 0; }
    (out.runs = out.runs || []).push(p.name + ':' + maxRun + '/' + Math.round(minGap));
    if (maxRun >= minGap) return Object.assign(out, { why: 'object', bad: p.name });
  }
  out.ok = true; return out;
}

function headExtent(img, P, bg) {
  if (!bg) return null;
  const fw = dist(P[234], P[454]), fh = dist(P[10], P[152]);
  const cx = (P[234].x + P[454].x) / 2;
  const rowFrac = (y, xa, xb, test) => {
    let n = 0, t = 0; y = Math.round(y);
    if (y < 0 || y >= img.h) return 0;
    for (let x = Math.max(0, Math.floor(xa)); x < Math.min(img.w, Math.ceil(xb)); x++) { t++; if (test((y * img.w + x) * 4)) n++; }
    return t ? n / t : 0;
  };
  // topo: acompanha o cabelo acima da testa, tolerando pequenos vãos entre mechas
  const d2 = (CONFIG.HEAD_BG_DIST * 0.7) ** 2;
  const isFg = j => { const a = img.data[j] - bg[0], b = img.data[j + 1] - bg[1], c = img.data[j + 2] - bg[2]; return a * a + b * b + c * c > d2; };
  let top = P[10].y, miss = 0;
  const maxGap = Math.max(4, Math.round(0.04 * fh));
  for (let y = Math.floor(P[10].y); y >= 0; y--) {
    if (rowFrac(y, cx - 0.65 * fw, cx + 0.65 * fw, isFg) >= 0.05) { top = y; miss = 0; } else if (++miss >= maxGap) break;
  }
  // base: barba = pixels bem mais escuros que a pele da bochecha, logo abaixo do queixo
  const sk = [P[50], P[280]].map(p => percentile(boxLumas(img, boxFromCenter(p.x, p.y, 0.12 * fw, 0.12 * fw)), 0.5));
  const skin = mean(sk), isDark = j => luma(img.data[j], img.data[j + 1], img.data[j + 2]) < CONFIG.BEARD_DARK * skin;
  let bottom = P[152].y + CONFIG.CHIN_PAD * fh; miss = 0;
  const lim = P[152].y + CONFIG.BEARD_MAX * fh;
  // só procura barba se ela realmente existe no queixo (evita confundir sombra do pescoço ou gola escura)
  let chinDark = 0;
  for (let k = 1; k <= 4; k++) chinDark = Math.max(chinDark, rowFrac(P[152].y - k * 0.03 * fh, P[152].x - 0.2 * fw, P[152].x + 0.2 * fw, isDark));
  const hasBeard = chinDark >= 0.3;
  for (let y = Math.floor(P[152].y - 0.08 * fh); hasBeard && y <= lim && y < img.h; y++) {
    if (rowFrac(y, P[152].x - 0.35 * fw, P[152].x + 0.35 * fw, isDark) >= 0.12) { bottom = Math.max(bottom, y); miss = 0; } else if (++miss >= 4) break;
  }
  // barba que continua até a última linha da foto = barba cortada pela borda
  return { topN: top / img.h, botN: bottom / img.h, topCut: top <= 2, beardCut: hasBeard && bottom >= img.h - 3 };
}
function findCropWindow(bitmap, P_norm, ext) {
  const W = bitmap.width, H = bitmap.height;
  const top = { x: P_norm[10].x * W, y: P_norm[10].y * H }, chin = { x: P_norm[152].x * W, y: P_norm[152].y * H };
  const fh = dist(top, chin);
  const faceL = P_norm[234].x * W, faceR = P_norm[454].x * W;

  const fw = faceR - faceL;

  // 1) O rosto inteiro e o topo do cabelo precisam existir na foto original.
  //    As pontas laterais do cabelo podem ficar fora do quadrado final.
  const faceTop = top.y - CONFIG.FOREHEAD_MARGIN * fh;
  if (faceTop < 0 || ext?.topCut) return { tooTight: true, parte: 'topo' };
  if (faceL < CONFIG.SIDE_MARGIN * W || faceR > (1 - CONFIG.SIDE_MARGIN) * W) return { tooTight: true, parte: 'lado' };
  let faceBot = chin.y + CONFIG.CHIN_PAD * fh;
  if (ext && ext.botN > ext.topN) faceBot = Math.max(faceBot, ext.botN * H);    // barba, quando houver
  const cutBottom = faceBot > H || (ext && ext.beardCut);
  faceBot = Math.min(faceBot, H);
  // O recorte contém cabelo, rosto e barba; seu tamanho varia com a escala
  // do rosto, sem ultrapassar os limites da fotografia original.
  let hTop = faceTop;
  if (ext && ext.botN > ext.topN) hTop = Math.min(hTop, ext.topN * H);
  const headPad = CONFIG.HEAD_MARGIN * (faceBot - hTop);
  const requiredTop = Math.max(0, hTop - headPad);
  const requiredBottom = Math.min(H, faceBot + headPad);
  const minSide = Math.max(requiredBottom - requiredTop, fw * 1.1);
  const maxSide = Math.min(W, H);
  if (minSide > maxSide) return { tooTight: true, parte: 'perto' };
  if (cutBottom) return { tooTight: true, parte: 'queixo' };
  // Deixa o rosto maior no quadrado, preservando o cabelo e a margem do queixo.
  const S = Math.ceil(clamp(fh / 0.65, minSide, maxSide));
  if (S < CONFIG.OUT_SIZE) return { tooTight: true, parte: 'resolucao', side: S };

  // Centraliza lateralmente e reduz o espaço vazio abaixo do queixo.
  const lowX = Math.max(0, faceR - S), highX = Math.min(W - S, faceL);
  const lowY = Math.max(0, requiredBottom - S), highY = Math.min(H - S, requiredTop);
  if (lowX > highX + 0.5 || lowY > highY + 0.5) return { tooTight: true, parte: 'perto' };
  const x0 = clamp(Math.round(clamp((faceL + faceR) / 2 - S / 2, lowX, highX)), 0, W - S);
  const y0 = clamp(Math.round(clamp((requiredTop + requiredBottom) / 2 - 0.52 * S, lowY, highY)), 0, H - S);
  return { win: { x0, y0, S } };
}

async function cropTo200(bitmap, P_norm, bgColor, ext, plannedWin) {
  const plan = plannedWin ? { win: plannedWin } : findCropWindow(bitmap, P_norm, ext);
  if (plan.tooTight) return plan;
  const { x0, y0, S } = plan.win;
  const src = document.createElement('canvas'); src.width = src.height = S;
  const sc = src.getContext('2d', { colorSpace: 'srgb' });
  sc.fillStyle = bgColor ? `rgb(${bgColor.join(',')})` : '#fff';
  sc.fillRect(0, 0, S, S);
  // Origem e lado inteiros: copia o quadrado direto da imagem decodificada,
  // em sua resolução original, antes de qualquer redução de saída.
  sc.drawImage(bitmap, x0, y0, S, S, 0, 0, S, S);

  const out = document.createElement('canvas'); out.width = out.height = CONFIG.OUT_SIZE;
  const oc = out.getContext('2d', { colorSpace: 'srgb' });
  if (S > CONFIG.OUT_SIZE) {
    // Pica aplica amostragem antialiasing em uma única redução. Uma nitidez
    // leve compensa a suavização quando o recorte é ao menos 1,5× maior.
    await photoResampler.resize(src, out, {
      filter: 'mks2013',
      unsharpAmount: S / CONFIG.OUT_SIZE >= 1.5 ? 40 : 0,
      unsharpRadius: 0.6,
      unsharpThreshold: 3,
    });
  } else {
    // Recortes de 200 px são copiados sem nova amostragem.
    oc.drawImage(src, 0, 0);
  }
  return { canvas: out, win: plan.win };
}
const canvasToJpeg = c => new Promise((resolve, reject) => c.toBlob(blob => {
  if (blob?.type === 'image/jpeg') resolve(blob);
  else reject(new Error('Não foi possível converter a foto para JPG'));
}, 'image/jpeg', CONFIG.JPEG_QUALITY));
const blobToBase64 = b => new Promise((res, rej) => { const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });

/* =====================================================================
   DETECTOR (MediaPipe Face Landmarker, roda no navegador)
   ===================================================================== */
let landmarkerPromise = null;
function loadLandmarker() {
  if (landmarkerPromise) return landmarkerPromise;
  const attempt = async (base, model) => {
    const mod = await import(base + '/vision_bundle.mjs');
    const fileset = await mod.FilesetResolver.forVisionTasks(base + '/wasm');
    return mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model, delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 2, outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5,
    });
  };
  landmarkerPromise = (async () => {
    try { return await attempt(CONFIG.MP_LOCAL, CONFIG.MODEL_LOCAL); }
    catch (e1) { console.warn('MediaPipe local indisponível, tentando CDN', e1);
      return await attempt(CONFIG.MP_CDN, CONFIG.MODEL_CDN); }
  })();
  return landmarkerPromise;
}

async function readBitmap(file) {
  const decodeNative = async blob => {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch { return createImageBitmap(blob); }
  };
  // Alguns navegadores exibem formatos que createImageBitmap ainda não decodifica.
  const decodeImageElement = blob => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        resolve(canvas);
      } catch (error) { reject(error); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato não reconhecido pelo navegador')); };
    image.src = url;
  });
  try { return await decodeNative(file); }
  catch { try { return await decodeImageElement(file); } catch {} }

  const heif = /\.(heic|heif)$/i.test(file.name) || /^image\/(heic|heif|heic-sequence|heif-sequence)$/i.test(file.type);
  if (heif) {
    const convert = await loadImageDecoder('vendor/image-decoders/heic2any.min.js', 'heic2any');
    const result = await convert({ blob: file, toType: 'image/png' });
    return decodeNative(Array.isArray(result) ? result[0] : result);
  }

  const tiff = /\.(tif|tiff)$/i.test(file.name) || /^image\/tiff$/i.test(file.type);
  if (tiff) {
    await loadImageDecoder('vendor/image-decoders/pako.min.js', 'pako');
    const UTIF = await loadImageDecoder('vendor/image-decoders/UTIF.js', 'UTIF');
    const buffer = await file.arrayBuffer(), ifd = UTIF.decode(buffer)[0];
    if (!ifd) throw new Error('TIFF sem imagem');
    UTIF.decodeImage(buffer, ifd);
    if (!ifd.width || !ifd.height) throw new Error('TIFF sem imagem');
    const canvas = document.createElement('canvas');
    canvas.width = ifd.width; canvas.height = ifd.height;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(ifd.width, ifd.height);
    pixels.data.set(UTIF.toRGBA8(ifd)); ctx.putImageData(pixels, 0, 0);
    return canvas;
  }
  throw new Error('Formato de imagem não decodificável');
}

const imageDecoderLoads = new Map();
function loadImageDecoder(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!imageDecoderLoads.has(src)) {
    imageDecoderLoads.set(src, new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src;
      script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error('Decodificador indisponível'));
      script.onerror = () => reject(new Error('Não foi possível carregar o decodificador'));
      document.head.appendChild(script);
    }).catch(error => { imageDecoderLoads.delete(src); throw error; }));
  }
  return imageDecoderLoads.get(src);
}

/** Analisa um arquivo. Retorna { ok, reasons, metrics, canvas? , jpeg? } */
async function analyzeFile(file, detector) {
  if (file.size > CONFIG.MAX_FILE_MB * 1048576)
    return { ok: false, reasons: [{ code: 'grande', titulo: 'Arquivo muito grande', texto: `O arquivo passa de ${CONFIG.MAX_FILE_MB} MB. Envie uma foto menor.` }], metrics: {} };
  let bmp;
  try { bmp = await readBitmap(file); }
  catch (error) { console.warn('Não foi possível decodificar a foto:', error);
    return { ok: false, reasons: [{ code: 'ilegivel', titulo: 'Não foi possível abrir a imagem', texto: 'O arquivo não contém uma foto válida ou usa um formato que este navegador não consegue ler. Tente outro arquivo de imagem.' }], metrics: {} }; }

  if (Math.min(bmp.width, bmp.height) < CONFIG.T.minSide)
    return { ok: false, reasons: [{ code: 'pequena', titulo: 'Imagem com resolução baixa', texto: `A foto tem ${bmp.width}×${bmp.height} px. Envie uma foto com pelo menos ${CONFIG.T.minSide} px de largura e altura para gerar 200×200 px sem ampliar.` }], metrics: { w: bmp.width, h: bmp.height } };

  // imagem de análise (reduzida)
  const k = Math.min(1, CONFIG.ANALYSIS_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const aw = Math.round(bmp.width * k), ah = Math.round(bmp.height * k);
  const ac = document.createElement('canvas'); ac.width = aw; ac.height = ah;
  const actx = ac.getContext('2d', { willReadFrequently: true }); actx.imageSmoothingQuality = 'high';
  actx.drawImage(bmp, 0, 0, aw, ah);
  const img = makeImg(actx.getImageData(0, 0, aw, ah));

  const res = await detector.detect(ac);
  const faces = res.faceLandmarks || [];

  // Imagem de análise normalizada: rosto com ~320 px de largura, para que as medidas
  // (bordas, nitidez) não dependam da resolução da foto original.
  let aimg = img, acan = ac;
  if (faces[0]) {
    const faceWpx = Math.abs(faces[0][454].x - faces[0][234].x) * aw;
    const s2 = clamp(320 / Math.max(1, faceWpx), 0.2, 1);   // só reduz; nunca amplia (ampliar suaviza e parece desfoque)
    const nw = Math.min(1600, Math.round(aw * s2)), nh = Math.round(ah * nw / aw);
    const nc = document.createElement('canvas'); nc.width = nw; nc.height = nh;
    const nctx = nc.getContext('2d', { willReadFrequently: true }); nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(bmp, 0, 0, nw, nh);
    aimg = makeImg(nctx.getImageData(0, 0, nw, nh)); acan = nc;
  }
  // A nitidez deve corresponder ao detalhe visível no retrato final. Reduzir
  // para uma largura facial fixa impede que a resolução altere os limites.
  let sharpImg = aimg;
  if (faces[0]) {
    const faceWidth = Math.abs(faces[0][454].x - faces[0][234].x) * aimg.w;
    const factor = Math.min(1, 100 / Math.max(1, faceWidth));
    if (factor < 0.98) {
      const sc = document.createElement('canvas');
      sc.width = Math.max(1, Math.round(aimg.w * factor));
      sc.height = Math.max(1, Math.round(aimg.h * factor));
      const sx = sc.getContext('2d', { willReadFrequently: true });
      sx.imageSmoothingQuality = 'high';
      sx.drawImage(acan, 0, 0, sc.width, sc.height);
      sharpImg = makeImg(sx.getImageData(0, 0, sc.width, sc.height));
    }
  }
  const ev = evaluate(aimg, faces, res.faceBlendshapes, sharpImg);
  ev.metrics.w = bmp.width; ev.metrics.h = bmp.height;
  ev.analysisCanvas = acan; ev.faceLm = faces[0];
  if (!ev.ok) return ev;

  const ext = headExtent(aimg, toPx(faces[0], aimg), ev.metrics.bgColor);
  if (ext) { ev.metrics.headTop = ext.topN; ev.metrics.headBottom = ext.botN; }
  const crop = findCropWindow(bmp, faces[0], ext);
  if (crop.tooTight) {
    ev.ok = false;
    const M = {
      resolucao: { code: 'pequena', titulo: 'Recorte com resolução baixa', texto: `O recorte do rosto ficou com ${crop.side}×${crop.side} px. Envie uma foto com o rosto maior ou com mais resolução para gerar 200×200 px sem ampliar.` },
      queixo: { code: 'corte', titulo: 'Pouco espaço abaixo do queixo ou da barba', texto: 'O queixo (ou a barba) ficou rente à borda de baixo da foto, então não dá para recortar com segurança sem cortar o rosto. Afaste a câmera e mostre os ombros, com espaço abaixo do queixo.' },
      topo:   { code: 'corte', titulo: 'Topo da cabeça cortado', texto: 'O alto da cabeça ou do cabelo ficou rente à borda da foto, então não dá para recortar sem cortar. Afaste a câmera para aparecer a cabeça inteira, com espaço acima.' },
      lado:   { code: 'corte', titulo: 'Rosto cortado na lateral', texto: 'O rosto ficou rente à lateral da foto, então não dá para recortar sem cortar. Afaste a câmera e centralize o rosto, com espaço dos dois lados.' },
      perto:  { code: 'corte', titulo: 'Rosto muito perto da câmera', texto: 'O rosto está grande demais para a foto: não é possível recortar sem cortar parte do rosto ou do cabelo. Afaste a câmera e enquadre da cabeça até os ombros, com espaço ao redor.' },
    };
    ev.reasons.push(M[crop.parte] || { code: 'corte', titulo: 'Rosto cortado pela borda da foto', texto: 'Parte da cabeça ficou fora da foto. Afaste um pouco a câmera para aparecer a cabeça inteira, com um pouco de espaço ao redor.' });
    return ev;
  }
  // O fundo também é conferido DENTRO do recorte final (é o que vai para o ponto): porta, quadro,
  // moldura ou parede de cor diferente que apareçam só na área recortada precisam reprovar.
  const cs = 240, cc = document.createElement('canvas'); cc.width = cc.height = cs;
  const cg = cc.getContext('2d', { willReadFrequently: true }); cg.imageSmoothingQuality = 'high';
  cg.drawImage(bmp, crop.win.x0, crop.win.y0, crop.win.S, crop.win.S, 0, 0, cs, cs);
  const cimg = makeImg(cg.getImageData(0, 0, cs, cs)), Pc = {};
  for (const i of [152, 234, 454, 33, 263]) Pc[i] = { x: (faces[0][i].x * bmp.width - crop.win.x0) / crop.win.S * cs, y: (faces[0][i].y * bmp.height - crop.win.y0) / crop.win.S * cs };
  const bgc = checkCropBackground(cimg, Pc, CONFIG.T);
  ev.metrics.bgCropPatches = bgc.patches; ev.metrics.bgCropOk = bgc.ok; ev.metrics.bgCropWhy = bgc.why + ' ' + (bgc.runs || []).join(',');
  if (!bgc.ok) {
    ev.ok = false;
    ev.reasons.push({ code: 'fundo', titulo: 'Fundo fora do padrão', texto: bgc.why === 'dark'
      ? 'O fundo está escuro. Use uma parede branca ou de cor bem clara.'
      : 'Aparece algo atrás de você na área da foto (porta, moldura, quadro, objeto, sombra ou parede de outra cor). Use uma parede lisa, clara e sem nada ao redor, e fique um pouco afastado dela.' });
    return ev;
  }
  ev.canvas = (await cropTo200(bmp, faces[0], ev.metrics.bgColor, ext, crop.win)).canvas;
  return ev;
}

/* =====================================================================
   INTERFACE
   ===================================================================== */
const state = { detector: null, jpeg: null, ok: false, busy: false };

for (const [sigla, nome] of SECRETARIAS) {
  const o = document.createElement('option'); o.value = sigla; o.textContent = `${sigla} — ${nome}`; $('secretaria').appendChild(o);
}

function normMatricula(v) { return String(v || '').replace(/\D/g, '').replace(/^0+/, ''); }
function cpfValido(c) {
  c = String(c || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) {
    let sum = 0; for (let i = 0; i < n; i++) sum += +c[i] * (n + 1 - i);
    const d = (sum * 10) % 11 % 10; if (d !== +c[n]) return false;
  }
  return true;
}
function maskCpf(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}
function emailValido(e) {
  e = String(e || '').trim().toLowerCase();
  return e.length <= 120 && /^(?!\.)(?!.*\.\.)[a-z0-9._%+\-]{1,64}(?<!\.)@(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(e);
}
function temMatricula() { const r = document.querySelector('input[name=temMat]:checked'); return r ? r.value : ''; }
function duasMatriculas() { return document.querySelector('input[name=duasMat]:checked')?.value || ''; }
let matAlertFrame = 0;
function openMatAlert() {
  const dialog = $('avisoMat');
  const message = $('matAlertMessage').textContent;
  const text = $('matAlertText');
  const close = $('matAlertClose');
  cancelAnimationFrame(matAlertFrame);
  text.textContent = '';
  $('matAlertTyping').dataset.text = message;
  $('matAlertTyping').classList.add('is-typing');
  close.disabled = true;
  document.body.classList.add('mat-alert-open');
  if (!dialog.open) dialog.showModal();
  $('matAlertTitle').focus({ preventScroll: true });
  const finish = () => {
    text.textContent = message;
    $('matAlertTyping').classList.remove('is-typing');
    close.disabled = false;
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }
  const started = performance.now();
  const type = now => {
    const count = Math.floor((now - started) / 28);
    text.textContent = message.slice(0, count);
    if (count < message.length) matAlertFrame = requestAnimationFrame(type);
    else finish();
  };
  matAlertFrame = requestAnimationFrame(type);
}
$('matAlertClose').addEventListener('click', () => {
  if (!$('matAlertClose').disabled) $('avisoMat').close();
});
$('avisoMat').addEventListener('cancel', event => {
  if ($('matAlertClose').disabled) event.preventDefault();
});
$('avisoMat').addEventListener('close', () => {
  cancelAnimationFrame(matAlertFrame);
  document.body.classList.remove('mat-alert-open');
});
function syncMat() {
  const t = temMatricula();
  const duas = t === 'sim' && duasMatriculas() === 'sim';
  $('duasMatriculas').hidden = t !== 'sim';
  $('fMat').hidden = t !== 'sim' || !duasMatriculas();
  $('segundaMatricula').hidden = !duas;
  $('matricula2').disabled = !duas;
  $('matLabel').textContent = duas ? 'Primeira matrícula' : 'Matrícula';
  $('matHint').textContent = duas ? 'A foto será salva com esta primeira matrícula. Informe o número conforme o contracheque, sem zeros à esquerda.' : 'Somente a matrícula, sem zeros à esquerda.';
  $('infoNao').hidden = t !== 'nao';
  $('fMat').classList.remove('invalid');
  if (t !== 'sim') {
    document.querySelectorAll('input[name=duasMat]').forEach(r => { r.checked = false; });
    $('matricula2').value = '';
  }
  $('fTem').classList.remove('invalid');
}
document.querySelectorAll('input[name=temMat]').forEach(r => r.addEventListener('change', () => {
  cancelPendingCpfLookup();
  if (autoSelectedMat && temMatricula() === 'nao') $('matricula').value = '';
  autoSelectedMat = false;
  autoMatricula = '';
  autoMatricula2 = '';
  syncMat();
  wizardRender();
}));
document.querySelectorAll('input[name=duasMat]').forEach(r => r.addEventListener('change', () => {
  cancelPendingCpfLookup();
  if (duasMatriculas() !== 'sim') $('matricula2').value = '';
  syncMat();
  wizardRender();
  openMatAlert();
}));
function validate(showErrors) {
  const nome = $('nome').value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  const mat = normMatricula($('matricula').value);
  const okNome = nome.split(' ').length >= 2 && nome.length >= 5;
  const tem = temMatricula();
  const duas = tem === 'sim' && duasMatriculas() === 'sim';
  const mat2 = duas ? normMatricula($('matricula2').value) : '';
  const okTem = !!tem && (tem === 'nao' || !!duasMatriculas());
  const okPrimeira = /^\d{3,10}$/.test(mat);
  const okSegunda = !duas || (/^\d{3,10}$/.test(mat2) && mat2 !== mat);
  const okMat = tem === 'nao' || (tem === 'sim' && okPrimeira && okSegunda);
  $('temErr').textContent = tem === 'sim' ? 'Responda se você possui duas matrículas.' : 'Responda se você já tem matrícula.';
  $('matErr').textContent = !okPrimeira ? 'Informe uma matrícula válida (somente números).' : mat2 === mat ? 'A segunda matrícula deve ser diferente da primeira.' : 'Informe uma segunda matrícula válida (somente números).';
  const email = $('email').value.trim().toLowerCase();
  const okEmail = emailValido(email);
  const cpf = $('cpf').value.replace(/\D/g, '');
  const okCpf = cpfValido(cpf);
  const okSec = !!$('secretaria').value;
  const okCons = $('consent').checked;
  if (showErrors) {
    $('fNome').classList.toggle('invalid', !okNome); $('fTem').classList.toggle('invalid', !okTem); $('fMat').classList.toggle('invalid', tem === 'sim' && !okMat); $('fCpf').classList.toggle('invalid', !okCpf); $('fEmail').classList.toggle('invalid', !okEmail);
    $('fSec').classList.toggle('invalid', !okSec);   $('fConsent').classList.toggle('invalid', !okCons);
  }
  return { tem, okTem, semMat: tem === 'nao', ok: okNome && okTem && okMat && okCpf && okEmail && okSec && okCons, nome, mat, mat2, duas, cpf, email, okNome, okMat, okCpf, okEmail, okSec, okCons };
}
// O botão fica sempre clicável (só trava durante o envio); ao clicar, a página mostra o que falta.
function refreshSend() { $('send').disabled = state.busy; }

// No celular, apresenta um campo por vez, como no fluxo de inscrição de referência.
const wizardFields = ['fNome', 'fCpf', 'fTem', 'fMat', 'fEmail', 'fSec', 'photo', 'fConsent'];
const wizardLabels = {
  fNome: 'Qual é o seu nome completo?',
  fTem: 'Você já tem matrícula?',
  fMat: 'Qual é a sua matrícula?',
  fCpf: 'Qual é o seu CPF?',
  fEmail: 'Qual é o seu e-mail?',
  fSec: 'Qual é a sua secretaria ou órgão?',
  photo: 'Escolha a foto para o cadastro',
  fConsent: 'Autorize o envio da foto'
};
const wizardPhotoIds = ['drop', 'camRow', 'modelStatus', 'result', 'previewBox'];
let wizardStep = 'fNome';
function wizardSteps() { return wizardFields.filter(id => id !== 'fMat' || temMatricula() === 'sim'); }
function wizardRender() {
  const steps = wizardSteps();
  if (!steps.includes(wizardStep)) wizardStep = 'fCpf';
  const current = steps.indexOf(wizardStep);
  $('wizardProgress').textContent = `${current + 1} de ${steps.length}`;
  $('wizardTitle').textContent = wizardStep === 'fMat' && duasMatriculas() === 'sim' ? 'Quais são as suas matrículas?' : wizardLabels[wizardStep];
  $('wizardBack').setAttribute('aria-label', current ? 'Voltar à etapa anterior' : 'Voltar ao início');
  ['dataHeading', 'photoHeading', ...wizardFields.filter(id => id !== 'photo'), ...wizardPhotoIds].forEach(id => {
    $(id).classList.toggle('wizard-step-hidden', id !== wizardStep && !(wizardStep === 'photo' && wizardPhotoIds.includes(id)));
  });
  $('photoTipsContainer').classList.toggle('wizard-step-hidden', wizardStep !== 'photo');
  $('send').parentElement.classList.toggle('wizard-step-hidden', wizardStep !== 'fConsent');
  $('sendMsg').classList.toggle('wizard-step-hidden', wizardStep !== 'fConsent');
  $('wizardControls').classList.toggle('wizard-step-hidden', wizardStep === 'fConsent');
}
function wizardShowStep(id) {
  wizardStep = id;
  wizardRender();
  $('photoFormCard').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
function wizardCurrentValid() {
  const v = validate(false);
  const checks = { fNome: v.okNome, fTem: v.okTem, fMat: v.okMat, fCpf: v.okCpf, fEmail: v.okEmail, fSec: v.okSec, fConsent: v.okCons };
  if (wizardStep === 'photo') {
    if (state.ok && state.jpeg) return true;
    if (!state.busy) showResult('bad', '<h3><i class="fas fa-exclamation-circle"></i> Escolha uma foto aprovada</h3><p>Selecione ou tire uma foto para continuar.</p>');
    return false;
  }
  const valid = checks[wizardStep];
  $(wizardStep).classList.toggle('invalid', !valid);
  if (!valid) {
    if (wizardStep === 'fTem' && temMatricula() === 'sim') $('duasSim').focus();
    else if (wizardStep === 'fMat' && /^\d{3,10}$/.test(v.mat) && v.duas) $('matricula2').focus();
    else $(wizardStep).querySelector('input:not([type=radio]), select, input[type=radio]')?.focus();
  }
  return valid;
}
$('wizardBack').addEventListener('click', () => {
  const steps = wizardSteps(), index = steps.indexOf(wizardStep);
  if (index > 0) wizardShowStep(steps[index - 1]);
  else if (matchMedia('(max-width: 640px)').matches) {
    document.body.dataset.formStage = 'intro';
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    $('startPhotoForm').focus({ preventScroll: true });
  } else location.href = 'index.html';
});
$('startPhotoForm').addEventListener('click', () => {
  document.body.dataset.formStage = 'form';
  scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('wizardTitle').focus({ preventScroll: true });
});
$('wizardNext').addEventListener('click', async () => {
  if (!wizardCurrentValid()) return;
  const step = wizardStep;
  if (step === 'fCpf') await ensureCpfLookup();
  if (wizardStep !== step) return;
  if (!wizardCurrentValid()) return;
  const steps = wizardSteps(), index = steps.indexOf(wizardStep);
  if (index < steps.length - 1) wizardShowStep(steps[index + 1]);
});
wizardRender();
refreshSend();
function uppercaseName() {
  const input = $('nome');
  const start = input.selectionStart, end = input.selectionEnd;
  const before = input.value.slice(0, start).toLocaleUpperCase('pt-BR');
  const selected = input.value.slice(start, end).toLocaleUpperCase('pt-BR');
  const upper = input.value.toLocaleUpperCase('pt-BR');
  if (input.value !== upper) {
    input.value = upper;
    input.setSelectionRange(before.length, before.length + selected.length);
  }
}
$('nome').addEventListener('input', e => { if (!e.isComposing) uppercaseName(); });
$('nome').addEventListener('compositionend', uppercaseName);

let cpfLookupVersion = 0;
let cpfLookupTimer = 0;
let lookedUpCpf = '';
let activeLookupCpf = '';
let activeLookupVersion = -1;
let activeLookupPromise = null;
let autoMatricula = '';
let autoMatricula2 = '';
let autoSelectedMat = false;
function setCpfLookupStatus(message) {
  $('cpfLookupStatus').textContent = message;
  $('cpfLookupStatus').hidden = !message;
  $('matLookupStatus').textContent = message;
  $('matLookupStatus').hidden = !message;
}
function cancelPendingCpfLookup() {
  cpfLookupVersion++;
  clearTimeout(cpfLookupTimer);
  lookedUpCpf = $('cpf').value.replace(/\D/g, '');
  setCpfLookupStatus('');
}
async function ensureCpfLookup() {
  clearTimeout(cpfLookupTimer);
  const cpf = $('cpf').value.replace(/\D/g, '');
  if (!cpfValido(cpf) || lookedUpCpf === cpf) return;
  if (activeLookupCpf === cpf && activeLookupVersion === cpfLookupVersion && activeLookupPromise) return activeLookupPromise;
  const version = cpfLookupVersion;
  if (CONFIG.ENDPOINT.startsWith('COLE_AQUI')) {
    setCpfLookupStatus('Consulta indisponível. Informe a matrícula se já tiver uma.');
    return;
  }
  setCpfLookupStatus('Consultando matrículas…');
  activeLookupCpf = cpf;
  activeLookupVersion = version;
  const task = (async () => {
    try {
      const response = await fetch(CONFIG.ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ token: CONFIG.TOKEN, acao: 'buscar_matricula', cpf })
      });
      if (!response.ok) throw new Error('consulta indisponível');
      const data = await response.json();
      if (!data.ok) throw new Error(data.erro || 'consulta indisponível');
      if (version !== cpfLookupVersion || $('cpf').value.replace(/\D/g, '') !== cpf) return;
      lookedUpCpf = cpf;
      const matriculas = [...new Set((Array.isArray(data.matriculas) ? data.matriculas : [data.matricula])
        .map(normMatricula).filter(m => /^\d{3,10}$/.test(m)))].slice(0, 2);
      if (data.encontrada && matriculas.length) {
        const [matricula, segundaMatricula = ''] = matriculas;
        $('temSim').checked = true;
        $(segundaMatricula ? 'duasSim' : 'duasNao').checked = true;
        $('matricula').value = matricula;
        $('matricula2').value = segundaMatricula;
        autoMatricula = matricula;
        autoMatricula2 = segundaMatricula;
        autoSelectedMat = true;
        syncMat();
        wizardRender();
        setCpfLookupStatus(segundaMatricula
          ? 'Matrículas ' + matricula + ' e ' + segundaMatricula + ' encontradas e preenchidas automaticamente. A foto será salva com a matrícula ' + matricula + '.'
          : 'Matrícula ' + matricula + ' encontrada e preenchida automaticamente.');
      } else {
        setCpfLookupStatus('CPF não encontrado. Informe sua matrícula, se já tiver uma.');
      }
    } catch (error) {
      if (version === cpfLookupVersion && $('cpf').value.replace(/\D/g, '') === cpf)
        setCpfLookupStatus('Não foi possível consultar a matrícula. Informe-a se já tiver uma.');
      console.error('Falha na consulta da matrícula:', error);
    }
  })();
  activeLookupPromise = task;
  try { await task; } finally {
    if (activeLookupPromise === task) { activeLookupCpf = ''; activeLookupVersion = -1; activeLookupPromise = null; }
  }
}
$('cpf').addEventListener('input', () => {
  $('cpf').value = maskCpf($('cpf').value);
  cpfLookupVersion++;
  lookedUpCpf = '';
  clearTimeout(cpfLookupTimer);
  setCpfLookupStatus('');
  if (autoSelectedMat) {
    if ($('matricula').value === autoMatricula) $('matricula').value = '';
    if ($('matricula2').value === autoMatricula2) $('matricula2').value = '';
    $('temSim').checked = false;
    autoSelectedMat = false;
    autoMatricula = '';
    autoMatricula2 = '';
    syncMat();
    wizardRender();
  }
  if (cpfValido($('cpf').value)) cpfLookupTimer = setTimeout(ensureCpfLookup, 400);
});
$('cpf').addEventListener('blur', () => { if (cpfValido($('cpf').value)) ensureCpfLookup(); });
$('email').addEventListener('blur', () => { const v = $('email').value.trim(); $('email').value = v; $('fEmail').classList.toggle('invalid', !!v && !emailValido(v)); });
$('email').addEventListener('input', () => { if (emailValido($('email').value)) $('fEmail').classList.remove('invalid'); });
$('cpf').addEventListener('blur', () => { const v = $('cpf').value; $('fCpf').classList.toggle('invalid', !!v && !cpfValido(v)); });
$('cpf').addEventListener('input', () => { if (cpfValido($('cpf').value)) $('fCpf').classList.remove('invalid'); });
['nome', 'matricula', 'cpf', 'email', 'secretaria', 'consent'].forEach(id => $(id).addEventListener('input', () => { $('fNome').classList.remove('invalid'); }));
$('consent').addEventListener('change', refreshSend);
$('matricula').addEventListener('input', () => {
  cancelPendingCpfLookup();
  const v = $('matricula').value, n = v.replace(/\D/g, ''); if (v !== n) $('matricula').value = n;
});
$('matricula').addEventListener('blur', () => { const m = normMatricula($('matricula').value); if (m) $('matricula').value = m; });
$('matricula2').addEventListener('input', () => {
  cancelPendingCpfLookup();
  $('matricula2').value = $('matricula2').value.replace(/\D/g, '');
});
$('matricula2').addEventListener('blur', () => { $('matricula2').value = normMatricula($('matricula2').value); });

function showResult(kind, html) {
  const r = $('result'); r.className = 'result show ' + kind; r.innerHTML = html;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function clearPhoto() {
  state.jpeg = null; state.ok = false;
  $('result').className = 'result'; $('previewBox').classList.remove('show'); $('file').value = '';
  refreshSend();
}

async function handleFile(file) {
  if (!file) return;
  clearPhoto();
  if (!state.detector) {
    showResult('work', '<h3><i class="fas fa-circle-notch fa-spin"></i> Aguarde…</h3><p>O verificador ainda está carregando.</p>');
    try { state.detector = await loadLandmarker(); } catch (e) { return fatalDetector(e); }
    $('modelStatus').style.display = 'none';
  }
  showResult('work', '<h3><i class="fas fa-circle-notch fa-spin"></i> Conferindo sua foto…</h3>');
  state.busy = true;
  let ev;
  try { ev = await analyzeFile(file, state.detector); }
  catch (e) { console.error(e); state.busy = false;
    return showResult('bad', '<h3><i class="fas fa-exclamation-triangle"></i> Não foi possível analisar</h3><p>Tente novamente com outra foto. Se o problema continuar, avise a equipe do Ponto Eletrônico.</p>'); }
  state.busy = false;
  if (DEBUG) debugShow(ev, file.name);

  if (!ev.ok) {
    const items = ev.reasons.map(r => `<li><b>${esc(r.titulo)}</b>${esc(r.texto)}</li>`).join('');
    showResult('bad', `<h3><i class="fas fa-times-circle"></i> Foto não aprovada</h3><p>Corrija o que está abaixo e envie outra foto:</p><ul>${items}</ul>`);
    return;
  }
  let blob;
  try { blob = await canvasToJpeg(ev.canvas); }
  catch (error) { console.error(error);
    return showResult('bad', '<h3><i class="fas fa-exclamation-triangle"></i> Não foi possível converter</h3><p>Tente novamente com outra foto.</p>'); }
  state.jpeg = blob; state.ok = true;
  const pc = $('previewCanvas').getContext('2d'); pc.clearRect(0, 0, 200, 200); pc.drawImage(ev.canvas, 0, 0);
  $('previewBox').classList.add('show');
  showResult('ok', '<h3><i class="fas fa-check-circle"></i> Foto aprovada</h3><p>Sua foto está dentro do padrão e já foi ajustada para 200 × 200 px. Preencha os dados, autorize e clique em enviar.</p>');
  refreshSend();
}
function fatalDetector(e) {
  console.error(e);
  $('modelStatus').innerHTML = '<i class="fas fa-exclamation-triangle"></i> Não foi possível carregar o verificador de fotos.';
  showResult('bad', '<h3><i class="fas fa-exclamation-triangle"></i> Verificador indisponível</h3><p>Verifique sua conexão com a internet e recarregue a página. Se continuar, avise a equipe do Ponto Eletrônico.</p>');
}

/* ---- Tirar foto na hora ---- */
let camStream = null, camBusy = false;
function stopCam() { camStream?.getTracks().forEach(t => t.stop()); camStream = null; $('camVideo').srcObject = null; $('camModal').hidden = true; $('camCount').textContent = ''; camBusy = false; $('camShot').disabled = false; $('btnCam').focus(); }
async function openCam() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch (e) {
    console.warn(e);
    showResult('bad', '<h3><i class="fas fa-video-slash"></i> Não foi possível abrir a câmera</h3><p>Permita o acesso à câmera no navegador ou escolha uma foto já tirada.</p>');
    return;
  }
  const v = $('camVideo'); v.srcObject = camStream; $('camModal').hidden = false;
  try { await v.play(); } catch {}
  if (v.videoWidth) $('camView').style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
  $('camShot').focus();
}
$('btnCam').addEventListener('click', () => {
  const touch = matchMedia('(pointer: coarse)').matches;
  // no celular, a câmera nativa dá melhor qualidade e foco; no computador usa a webcam
  if (touch || !navigator.mediaDevices?.getUserMedia) { $('fileCam').click(); return; }
  openCam();
});
$('fileCam').addEventListener('change', e => handleFile(e.target.files[0]));
$('camCancel').addEventListener('click', stopCam);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('camModal').hidden) stopCam(); });
$('camShot').addEventListener('click', async () => {
  if (camBusy) return; camBusy = true; $('camShot').disabled = true;
  for (let n = 3; n >= 1; n--) { $('camCount').textContent = n; await new Promise(r => setTimeout(r, 1000)); }
  $('camCount').textContent = '';
  const v = $('camVideo'), c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);   // sem espelhar
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.98));
  stopCam();
  handleFile(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
});

const drop = $('drop');
drop.addEventListener('click', () => $('file').click());
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
$('file').addEventListener('change', e => handleFile(e.target.files[0]));
$('reset').addEventListener('click', () => { clearPhoto(); $('sendMsg').className = 'result'; });
$('again').addEventListener('click', () => { $('doneArea').classList.remove('show'); $('formArea').style.display = ''; clearPhoto(); $('consent').checked = false; wizardStep = 'fNome'; wizardRender(); refreshSend(); scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });

$('send').addEventListener('click', async () => {
  if (state.busy) return;
  if (cpfValido($('cpf').value)) {
    state.busy = true; refreshSend();
    try { await ensureCpfLookup(); }
    finally { state.busy = false; refreshSend(); }
  }
  const v = validate(true);
  const sm = $('sendMsg');
  const falta = [];
  if (!state.ok || !state.jpeg) falta.push('uma foto aprovada');
  if (!v.okNome) falta.push('nome completo');
  if (!v.okCpf) falta.push('CPF válido');
  if (!v.okTem) falta.push(v.tem === 'sim' ? 'se você possui duas matrículas' : 'se você tem matrícula');
  else if (!v.okMat) falta.push(v.duas ? 'duas matrículas válidas e diferentes' : 'matrícula');
  if (!v.okEmail) falta.push('e-mail válido');
  if (!v.okSec) falta.push('secretaria');
  if (!v.okCons) falta.push('a autorização');
  if (falta.length) {
    sm.className = 'result show bad';
    sm.innerHTML = '<h3><i class="fas fa-exclamation-circle"></i> Ainda falta</h3><p>Confira: ' + falta.join(', ') + '.</p>';
    if (matchMedia('(max-width: 640px)').matches) {
      const firstMissing = !v.okNome ? 'fNome' : !v.okCpf ? 'fCpf' : !v.okTem ? 'fTem' : !v.okMat ? 'fMat' : !v.okEmail ? 'fEmail' : !v.okSec ? 'fSec' : (!state.ok || !state.jpeg) ? 'photo' : 'fConsent';
      wizardShowStep(firstMissing);
      return;
    }
    (document.querySelector('.field.invalid') || $('drop')).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    return;
  }
  sm.className = 'result';
  if (CONFIG.ENDPOINT.startsWith('COLE_AQUI')) {
    // modo teste: sem destino configurado, baixa o arquivo
    const a = document.createElement('a'); a.href = URL.createObjectURL(state.jpeg); a.download = (v.semMat ? v.cpf : v.mat) + '.jpg'; a.click();
    sm.className = 'result show work'; sm.innerHTML = '<p><b>Modo teste:</b> o destino de envio ainda não foi configurado, então a foto foi baixada no seu aparelho como <b>' + esc(v.semMat ? v.cpf : v.mat) + '.jpg</b>.</p>';
    return;
  }
  state.busy = true; refreshSend();
  sm.className = 'result show work'; sm.innerHTML = '<h3><i class="fas fa-circle-notch fa-spin"></i> Enviando…</h3>';
  try {
    const payload = { token: CONFIG.TOKEN, registro_id: crypto.randomUUID(), nome: v.nome, matricula: v.semMat ? '' : v.mat, segunda_matricula: v.mat2, sem_matricula: v.semMat, cpf: v.cpf, email: v.email, secretaria: $('secretaria').value,
      foto_base64: await blobToBase64(state.jpeg) };
    const resp = await fetch(CONFIG.ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    const j = await resp.json();
    if (!j.ok) throw new Error(j.erro || 'Falha no envio');
    sm.className = 'result'; $('formArea').style.display = 'none';
    $('doneThumb').getContext('2d').drawImage($('previewCanvas'), 0, 0);
    $('doneMeta').textContent = (v.semMat ? 'CPF ' + maskCpf(v.cpf) : 'Matrícula ' + v.mat) + ' · ' + $('secretaria').value;
    $('doneArea').classList.add('show');
    document.dispatchEvent(new CustomEvent('foto:enviada', { detail: { endpoint: CONFIG.ENDPOINT, token: CONFIG.TOKEN, registroId: j.registro_id || payload.registro_id, cpf: v.cpf } }));
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } catch (e) {
    console.error(e);
    sm.className = 'result show bad';
    sm.innerHTML = '<h3><i class="fas fa-times-circle"></i> Não foi possível enviar</h3><p>Verifique sua conexão e tente novamente. Se o erro continuar, avise a equipe do Ponto Eletrônico informando sua matrícula (ou o CPF, se ainda não tiver matrícula).</p>';
  } finally { state.busy = false; refreshSend(); }
});

/* Pré-carrega o modelo assim que a página abre */
loadLandmarker().then(d => { state.detector = d; $('modelStatus').style.display = 'none'; }).catch(e => fatalDetector(e));

/* =====================================================================
   MODO CALIBRAGEM (?debug=1)
   ===================================================================== */
const batchRows = [];
function fmt(v) { return typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3)) : (Array.isArray(v) ? v.join(',') : String(v)); }
const KEYS = ['faceHeightFrac', 'centerOffset', 'yaw', 'pitch', 'rollDeg', 'ear', 'eyeOpen', 'blink', 'squint', 'smile', 'faceSat', 'colorFrac', 'faceChroma', 'strongFrac', 'imageColorFrac', 'imageChromaP95', 'grayscale', 'faceLuma', 'lapVarianceEyes', 'tenengradEyes', 'lapVarianceNose', 'tenengradNose', 'sharpWeakRegions', 'bgLuma', 'bgSat', 'bgStd', 'bgRange', 'bgBad', 'bgPatches', 'headTop', 'headBottom', 'hairForehead', 'eyeContrast', 'eyeContrastRatio', 'eyeContrastR', 'eyeContrastL', 'eyeStrand', 'hairEyeAbove', 'hairEyeUnder', 'hairTemple', 'hairCheek', 'glassesRatio', 'glassesBridgeRatio', 'glassesRimRatio', 'glare', 'eyeShadow', 'eyeAsym'];
function debugShow(ev, name) {
  $('lastMetrics').textContent = name + '\n' + JSON.stringify(ev.metrics, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v, 2) +
    '\n\nMotivos: ' + (ev.reasons.map(r => r.code).join(', ') || '(aprovada)');
  if (ev.analysisCanvas && ev.faceLm) {
    const c = $('dbgCanvas'), s = ev.analysisCanvas; c.width = s.width; c.height = s.height;
    const g = c.getContext('2d'); g.drawImage(s, 0, 0);
    g.fillStyle = 'rgba(255,0,0,.8)';
    for (const p of ev.faceLm) g.fillRect(p.x * s.width - 1, p.y * s.height - 1, 2, 2);
    const P = ev.P; if (P) {
      g.strokeStyle = 'lime'; g.lineWidth = 2;
      const fw = dist(P[234], P[454]), fh = dist(P[10], P[152]);
      g.strokeRect(0, 0, P[234].x - 0.45 * fw, P[152].y + 0.6 * fh);                     // faixa lateral esquerda
      g.strokeRect(P[454].x + 0.45 * fw, 0, s.width - (P[454].x + 0.45 * fw), P[152].y + 0.6 * fh); // direita
    }
  }
}
$('batch').addEventListener('change', async e => {
  const files = [...e.target.files]; if (!files.length) return;
  const det = state.detector || await loadLandmarker(); state.detector = det;
  const t = $('batchTable'); batchRows.length = 0;
  t.innerHTML = '<tr><th>arquivo</th><th>resultado</th><th>motivos</th>' + KEYS.map(k => `<th>${k}</th>`).join('') + '</tr>';
  for (const f of files) {
    let ev; try { ev = await analyzeFile(f, det); } catch (err) { ev = { ok: false, reasons: [{ code: 'erro:' + err.message }], metrics: {} }; }
    const row = { arquivo: f.name, resultado: ev.ok ? 'APROVADA' : 'RECUSADA', motivos: ev.reasons.map(r => r.code).join('|') };
    KEYS.forEach(k => row[k] = ev.metrics[k] ?? ''); batchRows.push(row);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(f.name)}</td><td class="${ev.ok ? 'ok' : 'bad'}">${row.resultado}</td><td>${esc(row.motivos)}</td>` + KEYS.map(k => `<td>${row[k] === '' ? '' : fmt(row[k])}</td>`).join('');
    t.appendChild(tr);
  }
  $('csvBtn').disabled = false;
});
$('csvBtn').addEventListener('click', () => {
  const head = Object.keys(batchRows[0]);
  const csv = [head.join(';')].concat(batchRows.map(r => head.map(h => String(r[h]).replace('.', ',')).join(';'))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'calibragem_fotos.csv'; a.click();
});

/* Para testes automatizados */
window.__foto = { emailValido, headExtent, cpfValido, maskCpf, CONFIG, evaluate, analyzeFile, makeImg, findCropWindow, cropTo200, normMatricula, checkBackground, checkGlare, checkEyeShadow, checkGlasses };
