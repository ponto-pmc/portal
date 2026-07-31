const DAYS_IN_MONTH = 31;

const body = document.querySelector('#days-body');
const positiveTotal = document.querySelector('#positive-total');
const negativeTotal = document.querySelector('#negative-total');
const balanceTotal = document.querySelector('#balance-total');
const fileInput = document.querySelector('#file-input');
const chooseFile = document.querySelector('#choose-file');
const clearSchedule = document.querySelector('#clear-schedule');
const downloadPdf = document.querySelector('#download-pdf');
const importDropzone = document.querySelector('#import-dropzone');
const importStatus = document.querySelector('#import-status');
const serverNameInput = document.querySelector('#server-name');
const referenceMonthInput = document.querySelector('#reference-month');

const SLOT_NAMES = ['entry', 'break-start', 'break-end', 'exit'];
const STORAGE_KEY = 'jornada-state-v2';
// Mantém a quantidade de cada horário encontrado no PDF. Usar apenas um Set
// fazia com que qualquer horário igual ao do PDF fosse tratado como importado,
// mesmo quando era digitado manualmente em uma célula extra.
let importedTimeCounts = {};
let importedFileName = '';
let pdfLibraryPromise;
let ocrLibraryPromise;
let exportPdfLibraryPromise;

function createRows() {
  const fragment = document.createDocumentFragment();

  for (let day = 1; day <= DAYS_IN_MONTH; day += 1) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="day-cell${day === new Date().getDate() ? ' current' : ''}">${String(day).padStart(2, '0')}</td>
      <td><input type="time" draggable="false" aria-label="Dia ${day}, entrada" data-day="${day}" data-slot="entry" /></td>
      <td><input type="time" draggable="false" aria-label="Dia ${day}, saída" data-day="${day}" data-slot="break-start" /></td>
      <td><input type="time" draggable="false" aria-label="Dia ${day}, retorno" data-day="${day}" data-slot="break-end" /></td>
      <td><input type="time" draggable="false" aria-label="Dia ${day}, saída final" data-day="${day}" data-slot="exit" /></td>
      <td class="occurrence-cell"><input type="text" maxlength="120" aria-label="Dia ${day}, ocorrência" placeholder="Ex.: atestado, folga…" data-day="${day}" data-slot="occurrence" /></td>
      <td><span class="result empty" data-result="${day}">—</span></td>
    `;
    fragment.append(row);
  }

  body.append(fragment);
}

function timeToMinutes(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function formatDuration(totalMinutes, withSign = false) {
  const absolute = Math.abs(Math.round(totalMinutes));
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  if (!withSign || totalMinutes === 0) return time;
  return `${totalMinutes > 0 ? '+' : '-'}${time}`;
}

function calculateDay(day) {
  const inputs = [...document.querySelectorAll(`input[type="time"][data-day="${day}"]`)];
  const values = Object.fromEntries(inputs.map((input) => [input.dataset.slot, timeToMinutes(input.value)]));
  if (Object.values(values).some((value) => value === null)) return null;

  // Equivalente à fórmula da planilha:
  // jornada = saída final - entrada - 1h de intervalo - 8h esperadas.
  const jornada = (values.exit - values.entry - 60) - 480;
  const negSaida = Math.max(0, 660 - values['break-start']); // saída antes das 11:00
  const inicioAlmoco = Math.max(values['break-start'], 660);
  const fimAlmoco = inicioAlmoco + 60;
  const negRetorno = Math.max(0, values['break-end'] - fimAlmoco);
  const negLimite15 = Math.max(0, values['break-end'] - 900); // retorno após 15:00
  const negAlmoco = Math.max(negRetorno, negLimite15);

  return jornada - negSaida - negAlmoco;
}

function updateDay(day) {
  const result = document.querySelector(`[data-result="${day}"]`);
  const value = calculateDay(day);
  result.className = 'result';

  if (value === null) {
    result.classList.add('empty');
    result.textContent = '—';
    return null;
  }

  result.classList.add(value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero');
  result.textContent = formatDuration(value, true);
  return value;
}

function updateSummary() {
  let positive = 0;
  let negative = 0;

  for (let day = 1; day <= DAYS_IN_MONTH; day += 1) {
    const value = updateDay(day);
    if (value > 0) positive += value;
    if (value < 0) negative += Math.abs(value);
  }

  const balance = positive - negative;
  positiveTotal.textContent = formatDuration(positive);
  negativeTotal.textContent = formatDuration(negative);
  balanceTotal.textContent = formatDuration(balance, true);
  balanceTotal.classList.toggle('is-negative', balance < 0);
}

function setImportStatus(message, state = '') {
  importStatus.textContent = message;
  importStatus.className = state ? `is-${state}` : '';
}

function readGridValues() {
  const values = {};
  for (let day = 1; day <= DAYS_IN_MONTH; day += 1) {
    const dayValues = {};
    for (const slot of SLOT_NAMES) {
      const input = document.querySelector(`input[data-day="${day}"][data-slot="${slot}"]`);
      if (input?.value) dayValues[slot] = input.value;
    }
    if (Object.keys(dayValues).length) values[day] = dayValues;
  }
  return values;
}

function readOccurrences() {
  const occurrences = {};
  body.querySelectorAll('input[data-slot="occurrence"]').forEach((input) => {
    if (input.value.trim()) occurrences[input.dataset.day] = input.value.trim();
  });
  return occurrences;
}

function readManualRows() {
  const rows = [];
  for (let day = 1; day <= DAYS_IN_MONTH; day += 1) {
    const values = SLOT_NAMES.map((slot) => {
      const input = document.querySelector(`input[data-day="${day}"][data-slot="${slot}"]`);
      return input?.dataset.classification === 'manual' ? input.value : '';
    });
    const occurrenceInput = document.querySelector(`input[data-day="${day}"][data-slot="occurrence"]`);
    const occurrence = occurrenceInput?.value.trim() || '';
    if (values.some(Boolean) || occurrence) rows.push({ day, values, occurrence });
  }
  return rows;
}

function updateDownloadState() {
  const hasServerName = Boolean(serverNameInput.value.trim());
  const hasReferenceMonth = Boolean(referenceMonthInput.value);
  downloadPdf.disabled = readManualRows().length === 0 || !hasServerName || !hasReferenceMonth;
}

function persistState() {
  try {
    const importedAssignments = {};
    body.querySelectorAll('input[type="time"]').forEach((input) => {
      if (input.value && input.dataset.classification === 'imported') {
        importedAssignments[`${input.dataset.day}:${input.dataset.slot}`] = input.value;
      }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      values: readGridValues(),
      occurrences: readOccurrences(),
      serverName: serverNameInput.value.trim(),
      referenceMonth: referenceMonthInput.value,
      importedTimeCounts,
      importedAssignments,
      importedFileName,
    }));
  } catch (error) {
    console.warn('Não foi possível salvar os horários localmente.', error);
  }
}

function reconcileInputHighlights() {
  const inputs = [...body.querySelectorAll('input[type="time"]')];
  const remaining = { ...importedTimeCounts };
  const preservedImported = new Set();

  // Mantém a origem de uma célula importada quando ela não foi alterada;
  // as demais células são redistribuídas pelo conjunto de horários do PDF.
  inputs.forEach((input) => {
    if (
      input.value
      && input.dataset.classification === 'imported'
      && input.dataset.classifiedValue === input.value
      && remaining[input.value] > 0
    ) {
      remaining[input.value] -= 1;
      preservedImported.add(input);
    }
  });

  inputs.forEach((input) => {
    input.classList.remove('is-imported', 'is-manual');
    const canDrag = Boolean(input.value);
    input.draggable = canDrag;
    const cell = input.closest('td');
    if (cell) {
      cell.draggable = canDrag;
      cell.classList.toggle('is-draggable-cell', canDrag);
    }
    if (!input.value) {
      input.dataset.classification = '';
      input.dataset.classifiedValue = '';
      return;
    }

    const isPreservedImported = preservedImported.has(input);
    // A classificação depende do horário e da quantidade de ocorrências no
    // PDF, não da célula em que ele está. Assim, reposicionar uma batida
    // importada não a transforma em horário manual.
    const isImported = isPreservedImported || remaining[input.value] > 0;
    if (isImported) {
      if (!isPreservedImported) remaining[input.value] -= 1;
      input.dataset.classification = 'imported';
      input.classList.add('is-imported');
    } else {
      input.dataset.classification = 'manual';
      input.classList.add('is-manual');
    }
    input.dataset.classifiedValue = input.value;
  });
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) return;

    if (saved.importedTimeCounts && typeof saved.importedTimeCounts === 'object') {
      importedTimeCounts = Object.fromEntries(
        Object.entries(saved.importedTimeCounts)
          .filter(([value, count]) => /^\d{2}:\d{2}$/.test(value) && Number.isInteger(count) && count > 0)
          .map(([value, count]) => [value, count]),
      );
    } else {
      // Migração dos estados salvos pela versão anterior, que não guardava
      // ocorrências repetidas.
      importedTimeCounts = Object.fromEntries(
        (Array.isArray(saved.importedTimes) ? saved.importedTimes : []).map((value) => [value, 1]),
      );
    }
    importedFileName = typeof saved.importedFileName === 'string' ? saved.importedFileName : '';
    if (typeof saved.serverName === 'string') serverNameInput.value = saved.serverName;
    if (typeof saved.referenceMonth === 'string') referenceMonthInput.value = saved.referenceMonth;
    for (const [day, dayValues] of Object.entries(saved.values || {})) {
      for (const [slot, value] of Object.entries(dayValues || {})) {
        const input = document.querySelector(`input[data-day="${day}"][data-slot="${slot}"]`);
        if (input && SLOT_NAMES.includes(slot) && typeof value === 'string') {
          input.value = value;
        }
      }
    }

    for (const [day, occurrence] of Object.entries(saved.occurrences || {})) {
      const input = document.querySelector(`input[data-day="${day}"][data-slot="occurrence"]`);
      if (input && typeof occurrence === 'string') input.value = occurrence;
    }

    for (const [key, value] of Object.entries(saved.importedAssignments || {})) {
      const [day, slot] = key.split(':');
      const input = document.querySelector(`input[data-day="${day}"][data-slot="${slot}"]`);
      if (input && input.value === value) {
        input.dataset.classification = 'imported';
        input.dataset.classifiedValue = value;
      }
    }
    reconcileInputHighlights();

    const savedCount = Object.values(saved.values || {}).reduce((total, dayValues) => total + Object.keys(dayValues || {}).length, 0);
    if (savedCount) {
      const label = importedFileName ? `${importedFileName} • horários restaurados` : 'Horários restaurados do armazenamento local';
      setImportStatus(label, 'success');
    }
  } catch (error) {
    console.warn('Não foi possível restaurar os horários salvos.', error);
  }
}

function clearGrid() {
  body.querySelectorAll('input[type="time"]').forEach((input) => {
    input.value = '';
    input.draggable = false;
    input.closest('td')?.classList.remove('is-draggable-cell', 'is-dragging-cell', 'is-drop-target');
    input.closest('td')?.removeAttribute('draggable');
    input.classList.remove('is-imported', 'is-manual');
    input.dataset.classification = '';
    input.dataset.classifiedValue = '';
  });
  body.querySelectorAll('input[data-slot="occurrence"]').forEach((input) => {
    input.value = '';
  });
  importedTimeCounts = {};
  importedFileName = '';
  persistState();
  setImportStatus('Arraste o espelho de ponto até aqui ou selecione um arquivo');
  updateDownloadState();
  updateSummary();
}

let draggedInput = null;
let dropTargetInput = null;

function clearDragIndicators() {
  draggedInput?.classList.remove('is-dragging');
  draggedInput?.closest('td')?.classList.remove('is-dragging-cell');
  dropTargetInput?.classList.remove('is-drop-target');
  dropTargetInput?.closest('td')?.classList.remove('is-drop-target');
  draggedInput = null;
  dropTargetInput = null;
}

function setDropTarget(input) {
  if (dropTargetInput === input) return;
  dropTargetInput?.classList.remove('is-drop-target');
  dropTargetInput?.closest('td')?.classList.remove('is-drop-target');
  dropTargetInput = input;
  dropTargetInput?.closest('td')?.classList.add('is-drop-target');
}

function getScheduleInput(target) {
  const element = target instanceof Element ? target : target?.parentElement;
  if (!element) return null;
  return element.closest('input[type="time"]')
    || element.closest('td')?.querySelector('input[type="time"]')
    || null;
}

function moveInputValue(source, target) {
  const sourceValue = source.value;
  const targetValue = target.value;

  // Troca os valores quando o destino já está preenchido. Assim o DE/PARA
  // nunca apaga um horário que já estava na célula de destino.
  source.value = targetValue;
  target.value = sourceValue;
  reconcileInputHighlights();
  persistState();
  updateDownloadState();
  updateSummary();
}

body.addEventListener('dragstart', (event) => {
  const input = getScheduleInput(event.target);
  if (!input?.value) {
    event.preventDefault();
    return;
  }

  draggedInput = input;
  draggedInput.classList.add('is-dragging');
  draggedInput.closest('td')?.classList.add('is-dragging-cell');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `${input.dataset.day}:${input.dataset.slot}`);
});

body.addEventListener('dragover', (event) => {
  const target = getScheduleInput(event.target);
  if (!draggedInput || !target || target === draggedInput) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  setDropTarget(target);
});

body.addEventListener('drop', (event) => {
  const target = getScheduleInput(event.target);
  if (!draggedInput || !target || target === draggedInput) return;

  event.preventDefault();
  moveInputValue(draggedInput, target);
  clearDragIndicators();
});

body.addEventListener('dragend', clearDragIndicators);

async function loadExportPdfLibrary() {
  if (!exportPdfLibraryPromise) {
    exportPdfLibraryPromise = import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
  }
  return exportPdfLibraryPromise;
}

function drawPdfTable(doc, rows, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 40;
  const tableWidth = pageWidth - (left * 2);
  const rowHeight = 20;
  const headerHeight = 26;
  const columnWidths = [38, 70, 70, 70, 70, tableWidth - 318];
  const headers = ['Dia', 'Entrada', 'Saída intervalo', 'Retorno', 'Saída final', 'Ocorrência'];
  let y = startY;

  doc.setFillColor(16, 26, 49);
  doc.roundedRect(left, y, tableWidth, headerHeight, 5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  let x = left;
  headers.forEach((header, index) => {
    doc.text(header, x + (columnWidths[index] / 2), y + 17, { align: 'center' });
    x += columnWidths[index];
  });
  y += headerHeight;

  rows.forEach(({ day, values, occurrence }, rowIndex) => {
    if (rowIndex % 2 === 0) {
      doc.setFillColor(247, 248, 250);
      doc.rect(left, y, tableWidth, rowHeight, 'F');
    }
    doc.setDrawColor(232, 235, 240);
    doc.line(left, y + rowHeight, left + tableWidth, y + rowHeight);
    doc.setFont('helvetica', rowIndex === 0 ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(23, 32, 51);
    x = left;
    const cells = [String(day).padStart(2, '0'), ...values.map((value) => value || '—'), occurrence || '—'];
    cells.forEach((cell, index) => {
      const text = index === cells.length - 1
        ? doc.splitTextToSize(cell, columnWidths[index] - 12).slice(0, 1)
        : cell;
      doc.text(text, x + (columnWidths[index] / 2), y + 14, { align: 'center' });
      x += columnWidths[index];
    });
    y += rowHeight;
  });
}

function formatReferenceMonth(value) {
  if (!value) return 'não informado';
  const date = new Date(`${value}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'não informado';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
}

function sanitizeFileName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'nao-informado';
}

async function exportManualPdf() {
  const rows = readManualRows();
  if (!rows.length || !serverNameInput.value.trim() || !referenceMonthInput.value) return;

  downloadPdf.disabled = true;
  downloadPdf.textContent = 'Gerando…';
  try {
    const { jsPDF } = await loadExportPdfLibrary();
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 40;
    const title = 'Relação de horários';
    const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date());

    doc.setTextColor(16, 26, 49);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text(title, left, 54);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(124, 135, 153);
    doc.text(`Servidor: ${serverNameInput.value.trim() || 'não informado'}`, left, 73);
    doc.text(`Mês de referência: ${formatReferenceMonth(referenceMonthInput.value)} • gerado em ${date}`, left, 87);
    doc.text(`${rows.length} ${rows.length === 1 ? 'dia' : 'dias'} com registros`, pageWidth - left, 73, { align: 'right' });
    drawPdfTable(doc, rows, 112);
    const serverFileName = sanitizeFileName(serverNameInput.value.trim());
    const monthFileName = sanitizeFileName(formatReferenceMonth(referenceMonthInput.value));
    doc.save(`relacao-de-horarios-${serverFileName}-${monthFileName}.pdf`);
  } catch (error) {
    console.error('Falha ao gerar PDF:', error);
    setImportStatus('Não foi possível gerar o PDF. Tente novamente.', 'error');
  } finally {
    downloadPdf.textContent = 'Baixar PDF';
    updateDownloadState();
  }
}

function normalizeText(text) {
  return text
    .replace(/[–—]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[Oo](?=\d)/g, '0')
    .replace(/[Il](?=\d)/g, '1');
}

function normalizeTime(hour, minute) {
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function extractTimes(line) {
  const normalized = normalizeText(line)
    .replace(/(\d{1,2})\s*([:hH.,])\s*(\d{2})/g, '$1:$3')
  const dayPrefix = normalized.match(/^\s*(?:0?[1-9]|[12]\d|3[01])(?=\s|$)/);
  const timePart = dayPrefix ? normalized.slice(dayPrefix[0].length) : normalized;
  // Corrige OCR que separa "08:09" em "08 09", sem juntar o dia
  // "01" ao início do primeiro horário "08:09".
  const prepared = (dayPrefix ? dayPrefix[0] : '') + timePart.replace(
    /\b([01]?\d|2[0-3])\s+([0-5]\d)(?!\s*:)(?=\b)/g,
    '$1:$2',
  );

  // A coluna "Ocorrências" costuma trazer códigos no formato "05:51 - 128".
  // O horário antes do traço é uma referência da ocorrência, não uma batida.
  // Removemos esse bloco antes de procurar os horários da jornada.
  const withoutOccurrences = prepared.replace(
    /\b(?:[01]?\d|2[0-3])\s*:\s*[0-5]\d\s*-\s*[A-Za-zÀ-ÿ0-9]+\b/g,
    ' ',
  );
  const matches = [...withoutOccurrences.matchAll(/\b(\d{1,2})\s*:\s*(\d{2})\b/g)];
  const times = [];
  for (const match of matches) {
    const value = normalizeTime(match[1], match[2]);
    if (value && !times.includes(value)) times.push(value);
  }
  return times;
}

function extractDay(line) {
  const normalized = normalizeText(line).trim();
  const dateMatch = normalized.match(/^(?:\|\s*)?(0?[1-9]|[12]\d|3[01])\s*[/-]\s*\d{1,2}(?:\s*[/-]\s*\d{2,4})?\b/);
  if (dateMatch) return Number(dateMatch[1]);

  // Sem uma data completa, só aceitamos o dia no começo da linha e exigimos
  // que o restante contenha uma batida. Isso evita transformar totais,
  // códigos e textos do rodapé em um novo dia.
  const dayMatch = normalized.match(/^(?:\|\s*)?(0?[1-9]|[12]\d|3[01])(?=\s+|\|)/);
  if (!dayMatch) return null;
  const remainder = normalized.slice(dayMatch[0].length);
  const hasTime = /\b(?:[01]?\d|2[0-3])\s*(?::|[hH.]|\s)\s*[0-5]\d\b/.test(remainder);
  return hasTime ? Number(dayMatch[1]) : null;
}

function extractRowsFromText(text) {
  const rows = new Map();
  const lines = normalizeText(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const times = extractTimes(line).slice(0, 4);
    // Dias incompletos também são válidos: um espelho pode ter 1, 2 ou 3 batidas.
    // Só descartamos a linha quando nenhum horário foi encontrado.
    if (!times.length) continue;
    const day = extractDay(line);
    if (!day || day > DAYS_IN_MONTH) continue;
    const previous = rows.get(day) || [];
    if (times.length > previous.length) rows.set(day, times);
  }
  return rows;
}

function textFromPdfContent(content) {
  const items = content.items.filter((item) => item.str && item.str.trim());
  items.sort((a, b) => {
    const yDifference = b.transform[5] - a.transform[5];
    return Math.abs(yDifference) > 3 ? yDifference : a.transform[4] - b.transform[4];
  });

  const lines = [];
  for (const item of items) {
    const y = item.transform[5];
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 3);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.items.sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str).join(' '))
    .join('\n');
}

async function loadPdfLibrary() {
  if (!pdfLibraryPromise) {
    pdfLibraryPromise = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
  }
  return pdfLibraryPromise;
}

async function loadOcrLibrary() {
  if (!ocrLibraryPromise) ocrLibraryPromise = import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/+esm');
  return ocrLibraryPromise;
}

async function extractPdfText(file, onProgress) {
  const pdfjs = await loadPdfLibrary();
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(`Lendo página ${pageNumber} de ${pdf.numPages}…`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push({ page, text: textFromPdfContent(content) });
  }
  return { pdfjs, pages };
}

async function recognizePdfPages(pdfData, onProgress) {
  const { createWorker } = await loadOcrLibrary();
  const worker = await createWorker('por', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') {
        onProgress(`Reconhecendo espelho… ${Math.round(message.progress * 100)}%`);
      }
    },
  });
  let text = '';
  try {
    for (let index = 0; index < pdfData.pages.length; index += 1) {
      const { page } = pdfData.pages[index];
      onProgress(`Preparando página ${index + 1} para leitura…`);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const result = await worker.recognize(canvas);
      text += `\n${result.data.text}`;
    }
  } finally {
    await worker.terminate();
  }
  return text;
}

function applyImportedRows(rows, fileName) {
  let days = 0;
  let times = 0;
  importedTimeCounts = {};
  importedFileName = fileName || '';

  // Um novo PDF representa uma nova grade. Limpa o conteúdo anterior apenas
  // depois que a leitura terminou com sucesso, sem apagar dados em caso de erro.
  body.querySelectorAll('input[type="time"]').forEach((input) => {
    input.value = '';
    input.classList.remove('is-imported', 'is-manual');
    input.dataset.classification = '';
    input.dataset.classifiedValue = '';
  });

  for (const [day, values] of rows) {
    let filledThisDay = 0;
    values.forEach((value, index) => {
      const input = document.querySelector(`input[data-day="${day}"][data-slot="${SLOT_NAMES[index]}"]`);
      if (!input) return;
      input.value = value;
      importedTimeCounts[value] = (importedTimeCounts[value] || 0) + 1;
      filledThisDay += 1;
      times += 1;
    });
    if (filledThisDay) days += 1;
  }
  reconcileInputHighlights();
  updateSummary();
  persistState();
  return { days, times };
}

async function importFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');
  if (!isPdf && !isImage) {
    setImportStatus('Escolha um PDF ou uma imagem do espelho de ponto.', 'error');
    return;
  }

  chooseFile.disabled = true;
  setImportStatus(`Analisando ${file.name}…`, 'working');
  try {
    let text = '';
    if (isPdf) {
      const pdfData = await extractPdfText(file, (message) => setImportStatus(message, 'working'));
      text = pdfData.pages.map((page) => page.text).join('\n');
      let rows = extractRowsFromText(text);
      const hasCompleteDay = [...rows.values()].some((values) => values.length >= 4);
      if (!hasCompleteDay) {
        text = await recognizePdfPages(pdfData, (message) => setImportStatus(message, 'working'));
        rows = extractRowsFromText(text);
      }
      if (!rows.size) throw new Error('Nenhuma linha com dia e horários foi reconhecida.');
      const result = applyImportedRows(rows, file.name);
      setImportStatus(`${file.name} • ${result.days} dias e ${result.times} horários preenchidos`, 'success');
    } else {
      const { createWorker } = await loadOcrLibrary();
      const worker = await createWorker('por', 1, { logger: (message) => message.status === 'recognizing text' && setImportStatus(`Reconhecendo imagem… ${Math.round(message.progress * 100)}%`, 'working') });
      const result = await worker.recognize(file);
      await worker.terminate();
      const rows = extractRowsFromText(result.data.text);
      if (!rows.size) throw new Error('Nenhuma linha com dia e horários foi reconhecida.');
      const imported = applyImportedRows(rows, file.name);
      setImportStatus(`${file.name} • ${imported.days} dias e ${imported.times} horários preenchidos`, 'success');
    }
  } catch (error) {
    console.error('Falha ao importar espelho:', error);
    setImportStatus('Não foi possível reconhecer este arquivo. Confira a qualidade do PDF e tente novamente.', 'error');
  } finally {
    chooseFile.disabled = false;
    fileInput.value = '';
  }
}

createRows();
restoreState();
body.addEventListener('input', (event) => {
  if (event.target.matches('input[type="time"], input[data-slot="occurrence"]')) {
    reconcileInputHighlights();
    persistState();
    updateDownloadState();
  }
  updateSummary();
});
body.addEventListener('change', (event) => {
  if (!event.target.matches('input[type="time"], input[data-slot="occurrence"]')) return;
  reconcileInputHighlights();
  persistState();
  updateDownloadState();
  updateSummary();
});
serverNameInput.addEventListener('input', () => {
  persistState();
  updateDownloadState();
});
referenceMonthInput.addEventListener('change', () => {
  persistState();
  updateDownloadState();
});
chooseFile.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => importFile(event.target.files[0]));
clearSchedule.addEventListener('click', clearGrid);
downloadPdf.addEventListener('click', exportManualPdf);
['dragenter', 'dragover'].forEach((eventName) => importDropzone.addEventListener(eventName, (event) => {
  event.preventDefault();
  importDropzone.classList.add('is-dragging');
}));
['dragleave', 'drop'].forEach((eventName) => importDropzone.addEventListener(eventName, (event) => {
  event.preventDefault();
  importDropzone.classList.remove('is-dragging');
}));
importDropzone.addEventListener('drop', (event) => importFile(event.dataTransfer.files[0]));
updateSummary();
updateDownloadState();

