/* =====================================================
   calculadora.js — Calculadora de Desconto
   ===================================================== */
'use strict';

// ── THEME ──────────────────────────────────────────────
// faq.js já pode ter definido estas funções — reutiliza se existir
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

// ── ACCORDION ──────────────────────────────────────────
function toggleAcc(id) {
  const item = document.getElementById(id);
  if (!item) return;
  const body = document.getElementById(id + 'Body');
  const isOpen = item.classList.contains('active');

  document.querySelectorAll('.acc-item').forEach(i => {
    i.classList.remove('active');
    const b = i.querySelector('.acc-body');
    const trigger = i.querySelector('.acc-trigger');
    trigger?.setAttribute('aria-expanded', 'false');
    if (b) {
      b.style.maxHeight = '0px';
      b.setAttribute('aria-hidden', 'true');
      b.inert = true;
    }
  });

  if (!isOpen && body) {
    item.classList.add('active');
    item.querySelector('.acc-trigger')?.setAttribute('aria-expanded', 'true');
    body.setAttribute('aria-hidden', 'false');
    body.inert = false;
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

function updateAccHeight(bodyId) {
  const b = document.getElementById(bodyId);
  const item = b?.closest('.acc-item');
  if (b && item?.classList.contains('active')) {
    b.style.maxHeight = b.scrollHeight + 'px';
  }
}

// ── STATE ──────────────────────────────────────────────
let nextOutroId = 0;
let ultimoCalculo = null;

document.addEventListener('DOMContentLoaded', () => {

  // ── THEME TOGGLE ─────────────────────────────────────
  // faq.js carrega antes e já registra o clique — evita registrar de novo
  if (!window._ppThemeListenerSet) {
    window._ppThemeListenerSet = true;
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      const isDark = document.documentElement.dataset.theme !== 'dark';
      window.applyTheme(isDark);
      localStorage.setItem(window.THEME_KEY, isDark ? 'dark' : 'light');
    }, { passive: true });
  }

  // ── NAVBAR SCROLL ─────────────────────────────────────
  const nav = document.querySelector('.site-nav');
  if (nav) window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 10), { passive: true });

  // ── HAMBURGER ─────────────────────────────────────────
  const hb = document.getElementById('hamburger');
  const nl = document.getElementById('navLinks');
  if (hb && nl && !window._ppNavListenerSet) {
    window._ppNavListenerSet = true;
    hb.addEventListener('click', (e) => {
      e.stopPropagation();
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

  // ── TIPO FALTA ────────────────────────────────────────
  document.getElementById('tipoFalta')?.addEventListener('change', onTipoChange);

  // ── MOEDA ─────────────────────────────────────────────
  ['vencimento', 'quinquenio', 'funcao'].forEach(id => {
    document.getElementById(id)?.addEventListener('blur', function () { fmtMoeda(this); });
  });

  // ── OUTROS ────────────────────────────────────────────
  document.getElementById('btnAdicionarOutros')?.addEventListener('click', addOutro);

  // ── AÇÕES ─────────────────────────────────────────────
  document.getElementById('btnCalcular')?.addEventListener('click', calcular);
  document.getElementById('btnLimpar')?.addEventListener('click', limpar);
  document.getElementById('btnPDF')?.addEventListener('click', gerarPDF);

  document.querySelector('.calc-body').addEventListener('input', () => { invalidateCalculation(); clearCalcErrors(); });
  document.querySelector('.calc-body').addEventListener('change', invalidateCalculation);
  setupContentBlocker();
});

// ── TIPO CHANGE ────────────────────────────────────────
function onTipoChange() {
  const v = document.getElementById('tipoFalta').value;
  document.getElementById('campoDias').style.display  = v === 'dia'  ? 'block' : 'none';
  document.getElementById('campoHoras').style.display = v === 'hora' ? 'block' : 'none';
  setTimeout(() => updateAccHeight('acc1Body'), 0);
}

// ── OUTROS FIELDS ──────────────────────────────────────
function addOutro() {
  if (document.querySelectorAll('#outrosFields .outro-row').length >= 5) return;
  const id = ++nextOutroId;
  const div = document.createElement('div');
  div.className = 'outro-row';
  div.id = `outroRow${id}`;
  div.innerHTML = `
    <div class="form-group" style="margin:0">
      <label class="field-label" for="outroDesc${id}">Descrição</label>
      <input class="field-input" type="text" id="outroDesc${id}" placeholder="Nome" maxlength="20" />
    </div>
    <div class="form-group" style="margin:0">
      <label class="field-label" for="outroValor${id}">Valor (R$)</label>
      <input class="field-input" type="text" id="outroValor${id}" placeholder="0,00" inputmode="decimal" />
    </div>
    <button type="button" class="btn-remove-outro" onclick="removeOutro(${id})" aria-label="Remover">
      <i class="fas fa-times"></i>
    </button>
  `;
  document.getElementById('outrosFields').appendChild(div);
  document.getElementById(`outroValor${id}`)?.addEventListener('blur', function () { fmtMoeda(this); });
  const btn = document.getElementById('btnAdicionarOutros');
  btn.disabled = document.querySelectorAll('#outrosFields .outro-row').length >= 5;
  document.getElementById(`outroDesc${id}`).focus();
  invalidateCalculation();
  setTimeout(() => updateAccHeight('acc2Body'), 0);
}

function removeOutro(id) {
  document.getElementById(`outroRow${id}`)?.remove();
  invalidateCalculation();
  document.getElementById('btnAdicionarOutros').focus();
  document.getElementById('btnAdicionarOutros').disabled = false;
  setTimeout(() => updateAccHeight('acc2Body'), 0);
}

// ── CURRENCY ───────────────────────────────────────────
// Limites de consistência da fórmula existente, pendentes de homologação pelo RH.
const CALC_RULES = Object.freeze({ days: 30, minuteMax: 59, maxAmount: 999999.99,
  journeys: [20, 100, 111, 120, 125, 150, 160, 168, 200, 220] });
function fmtMoeda(input) {
  const value = toNum(input.value);
  if (input.value.trim() && Number.isFinite(value) && value >= 0 && value <= CALC_RULES.maxAmount) input.value = fmtBRL(value);
}
function toNum(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) return NaN;
  return Number(text.replace(/\./g, '').replace(',', '.'));
}
function invalidateCalculation() {
  ultimoCalculo = null;
  for (const id of ['resultado', 'resumo', 'btnPDF']) document.getElementById(id).style.display = 'none';
}
function calcError(id, message) {
  const field = document.getElementById(id);
  const error = document.getElementById('calcError');
  error.textContent = message;
  error.hidden = false;
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', 'calcError');
  const accordion = field.closest('.acc-item');
  if (accordion && !accordion.classList.contains('active')) toggleAcc(accordion.id);
  field.focus();
}
function clearCalcErrors() {
  const error = document.getElementById('calcError');
  error.hidden = true;
  error.textContent = '';
  document.querySelectorAll('[aria-describedby="calcError"]').forEach(field => {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
  });
}
function integerValue(id) {
  const field = document.getElementById(id);
  if (field.validity.badInput) return NaN;
  const text = field.value.trim();
  return /^\d+$/.test(text) ? Number(text) : text === '' ? 0 : NaN;
}

const fmtBRL = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── EXTENSO ────────────────────────────────────────────
function numToText(n) {
  const un   = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const dez  = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezs = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const cents = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  if (n === 0) return 'zero';
  if (n === 100) return 'cem';
  let r = '';
  const mil = Math.floor(n / 1000);
  if (mil > 0) {
    r += mil === 1 ? 'mil' : numToText(mil) + ' mil';
    n %= 1000;
    if (n) r += ' e ';
  }
  const c = Math.floor(n / 100);
  if (c) { r += cents[c]; n %= 100; if (n) r += ' e '; }
  if (n >= 10 && n < 20) {
    r += dez[n - 10];
  } else {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (d) { r += dezs[d]; if (u) r += ' e '; }
    if (u) r += un[u];
  }
  return r;
}

function valorPorExtenso(v) {
  const [rp, cp] = v.toFixed(2).split('.');
  const r = parseInt(rp, 10);
  const c = parseInt(cp, 10);
  let s = r === 0 ? 'zero reais' : r === 1 ? 'um real' : numToText(r) + ' reais';
  if (c > 0) s += ` e ${c === 1 ? 'um centavo' : numToText(c) + ' centavos'}`;
  return s;
}

// ── CALCULAR ───────────────────────────────────────────
function calcular() {
  invalidateCalculation();
  clearCalcErrors();
  const moneyFields = [...document.querySelectorAll('#vencimento, #quinquenio, #funcao, #outrosFields input[id^="outroValor"]')];
  for (const field of moneyFields) {
    const value = toNum(field.value);
    if (!Number.isFinite(value) || value < 0 || value > CALC_RULES.maxAmount) {
      calcError(field.id, 'Informe um valor de 0,00 a 999.999,99, usando vírgula para centavos. Este é o limite técnico da simulação.');
      return;
    }
  }
  const ven  = toNum(document.getElementById('vencimento').value);
  const quin = toNum(document.getElementById('quinquenio').value);
  const func = toNum(document.getElementById('funcao').value);

  let outrosTotal = 0;
  const outrosDet = [];

  for (const row of document.querySelectorAll('#outrosFields .outro-row')) {
    const vEl = row.querySelector('input[id^=outroValor]');
    const dEl = row.querySelector('input[id^=outroDesc]');
    if (vEl && dEl) {
      const val = toNum(vEl.value);
      if (val > 0) {
        outrosTotal += val;
        outrosDet.push({ descricao: dEl.value.trim() || 'Outros', valor: val });
      }
    }
  }

  const total = ven + quin + func + outrosTotal;
  if (!Number.isFinite(total) || total <= 0 || total > CALC_RULES.maxAmount) { calcError('vencimento', 'A remuneração total deve ser maior que zero e não ultrapassar o limite técnico de R$ 999.999,99.'); return; }
  const tipo  = document.getElementById('tipoFalta').value;
  let desconto = 0;
  let resumo = '';
  let dadosCalculo = {};

  if (tipo === 'dia') {
    const dias = integerValue('diasFalta');
    if (!Number.isInteger(dias) || dias < 1 || dias > CALC_RULES.days) { calcError('diasFalta', 'Informe de 1 a 30 dias inteiros, dentro da base mensal desta simulação.'); return; }
    desconto = (total / CALC_RULES.days) * dias;
    const ext = valorPorExtenso(desconto);
    resumo = `Com remuneração de R$ ${fmtBRL(total)}, ${dias} ${dias === 1 ? 'dia de falta' : 'dias de faltas'} resultaram em desconto de R$ ${fmtBRL(desconto)} (${ext}).`;
    dadosCalculo = { tipo: 'dia', quantidade: dias, vencimento: ven, quinquenio: quin, funcao: func, outros: outrosDet, total, desconto, resumo };

  } else if (tipo === 'hora') {
    const hJornada = parseFloat(document.getElementById('jornada').value);
    if (!CALC_RULES.journeys.includes(hJornada)) { calcError('jornada', 'Selecione uma jornada mensal da lista.'); return; }
    const h = integerValue('horaInput');
    const m = integerValue('minutoInput');
    if (!Number.isInteger(h) || h < 0 || h > hJornada) { calcError('horaInput', 'Informe horas inteiras entre zero e a jornada mensal selecionada.'); return; }
    if (!Number.isInteger(m) || m < 0 || m > CALC_RULES.minuteMax) { calcError('minutoInput', 'Informe minutos inteiros entre 0 e 59.'); return; }
    const totalMin = (h * 60) + m;
    if (totalMin <= 0 || totalMin > hJornada * 60) { calcError('horaInput', 'A ausência deve ser maior que zero e não pode superar a jornada mensal.'); return; }
    desconto = (total / (hJornada * 60)) * totalMin;
    const ext = valorPorExtenso(desconto);
    resumo = `Com remuneração de R$ ${fmtBRL(total)} e jornada de ${hJornada}h mensais, ${totalMin} minutos de ausência resultaram em desconto de R$ ${fmtBRL(desconto)} (${ext}).`;
    dadosCalculo = { tipo: 'hora', horas: h, minutos: m, totalMinutos: totalMin, jornada: hJornada, vencimento: ven, quinquenio: quin, funcao: func, outros: outrosDet, total, desconto, resumo };

  } else {
    calcError('tipoFalta', 'Selecione o tipo de falta.');
    return;
  }



  ultimoCalculo = dadosCalculo;

  const resBox  = document.getElementById('resultado');
  const resVal  = document.getElementById('resultValue');
  const resSumm = document.getElementById('resumo');
  const btnPDF  = document.getElementById('btnPDF');

  resVal.textContent   = `R$ ${fmtBRL(desconto)}`;
  resSumm.textContent  = resumo;

  resBox.style.display  = 'block';
  resSumm.style.display = 'block';
  btnPDF.style.display  = 'inline-flex';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resBox.classList.add('visible');
      resSumm.classList.add('visible');
    });
  });

  setTimeout(() => {
    resBox.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }, 150);
}

// ── LIMPAR ─────────────────────────────────────────────
function limpar() {
  clearCalcErrors();
  document.querySelectorAll('.field-input, .field-select').forEach(el => { el.value = ''; });
  document.getElementById('outrosFields').innerHTML = '';
  // IDs não são reutilizados durante esta sessão.
  document.getElementById('btnAdicionarOutros').disabled = false;
  document.getElementById('campoDias').style.display  = 'none';
  document.getElementById('campoHoras').style.display = 'none';

  const resBox  = document.getElementById('resultado');
  const resSumm = document.getElementById('resumo');
  const btnPDF  = document.getElementById('btnPDF');

  resBox.classList.remove('visible');
  resSumm.classList.remove('visible');

  setTimeout(() => {
    resBox.style.display  = 'none';
    resSumm.style.display = 'none';
    btnPDF.style.display  = 'none';
  }, 320);

  ultimoCalculo = null;
}

// ── PDF ────────────────────────────────────────────────
async function gerarPDF() {
  if (!ultimoCalculo) { alert('Realize um cálculo antes de gerar o PDF.'); return; }

  if (typeof window.jspdf === 'undefined') {
    alert('A biblioteca de PDF ainda está carregando. Aguarde um momento e tente novamente.');
    return;
  }

  const calculation = ultimoCalculo;
  const btn = document.getElementById('btnPDF');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
  btn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const mL = 20, mR = 190, util = mR - mL;
    let y = 20;

    try {
      const logo = new Image();
      await new Promise((res) => {
        logo.onload = res;
        logo.onerror = res;
        setTimeout(res, 3000);
        logo.src = 'assets/logo-prefeitura-contagem.png';
      });
      if (logo.complete && logo.naturalWidth > 0) {
        doc.addImage(logo, 'PNG', mL, y, 40, 40 * logo.naturalHeight / logo.naturalWidth);
      }
    } catch (_) {}

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('PREFEITURA MUNICIPAL DE CONTAGEM', mR, y + 5, { align: 'right' });
    doc.text('Secretaria de Administração — Equipe Ponto Eletrônico', mR, y + 12, { align: 'right' });
    y += 35;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(mL, y, mR, y);
    y += 12;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text('CÁLCULO DE DESCONTO POR AUSÊNCIA', doc.internal.pageSize.width / 2, y, { align: 'center' });
    y += 14;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    const dt = new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    doc.text(`Emitido em: ${dt}`, mR, y, { align: 'right' });
    y += 14;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text('TIPO DE AUSÊNCIA', mL, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    if (calculation.tipo === 'dia') {
      doc.text(`• Falta por dias: ${calculation.quantidade} ${calculation.quantidade === 1 ? 'dia' : 'dias'}`, mL + 5, y);
    } else {
      doc.text(`• Falta por horas: ${calculation.horas}h ${calculation.minutos}min (${calculation.totalMinutos} min)`, mL + 5, y);
      y += 6;
      doc.text(`• Jornada mensal: ${calculation.jornada} horas`, mL + 5, y);
    }
    y += 14;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text('COMPOSIÇÃO DA REMUNERAÇÃO', mL, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const itens = [
      { desc: 'Vencimento', val: calculation.vencimento },
      { desc: 'Quinquênio', val: calculation.quinquenio },
      { desc: 'Função/Gratificação', val: calculation.funcao },
      ...(calculation.outros || []).map(o => ({ desc: o.descricao, val: o.valor }))
    ];

    itens.forEach(it => {
      if (it.val > 0) {
        doc.text(`• ${it.desc}:`, mL + 5, y);
        doc.text(`R$ ${fmtBRL(it.val)}`, mR, y, { align: 'right' });
        y += 6;
      }
    });

    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(mL, y, mR, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text('REMUNERAÇÃO TOTAL:', mL + 5, y);
    doc.text(`R$ ${fmtBRL(calculation.total)}`, mR, y, { align: 'right' });
    y += 14;

    doc.setFillColor(17, 17, 17);
    doc.rect(mL, y - 5, util, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('VALOR DO DESCONTO', doc.internal.pageSize.width / 2, y + 4, { align: 'center' });
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${fmtBRL(calculation.desconto)}`, doc.internal.pageSize.width / 2, y + 16, { align: 'center' });
    y += 36;

    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    const extLines = doc.splitTextToSize(`(${valorPorExtenso(calculation.desconto)})`, util);
    doc.text(extLines, doc.internal.pageSize.width / 2, y, { align: 'center' });
    y += extLines.length * 5 + 12;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 120, 120);
    doc.text('OBSERVAÇÕES:', mL, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    [
      '• Este documento é uma simulação de cálculo e não possui validade oficial.',
      '• Para efeitos oficiais, consulte o setor de Recursos Humanos.',
      '• O cálculo considera 30 dias por mês para faltas diárias.',
      '• Critérios e limites pendentes de homologação pelo RH.',
    ].forEach(t => { doc.text(t, mL + 3, y); y += 5; });

    const fy = doc.internal.pageSize.height - 22;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.line(mL, fy, mR, fy);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Prefeitura Municipal de Contagem — Secretaria de Administração', doc.internal.pageSize.width / 2, fy + 6, { align: 'center' });
    doc.text('Equipe Ponto Eletrônico', doc.internal.pageSize.width / 2, fy + 11, { align: 'center' });
    doc.text('www.contagem.mg.gov.br', doc.internal.pageSize.width / 2, fy + 16, { align: 'center' });

    doc.save(`calculo_desconto_${Date.now()}.pdf`);

  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    alert(`Erro ao gerar PDF: ${err.message || 'Tente novamente.'}`);
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
}

// ── CONTENT BLOCKER ────────────────────────────────────
function setupContentBlocker() {
  function cleanNode(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('.web-floating-button, iframe[src*="websim"]')) { node.remove(); return; }
    node.querySelectorAll?.('.web-floating-button, iframe[src*="websim"]').forEach(el => el.remove());
  }
  cleanNode(document.body);
  new MutationObserver(mutations => {
    for (const m of mutations) for (const node of m.addedNodes) cleanNode(node);
  }).observe(document.body, { childList: true, subtree: true });
}
