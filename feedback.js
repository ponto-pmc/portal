const panel = document.getElementById('photoFeedback');
const form = document.getElementById('feedbackForm');
const stars = [...document.querySelectorAll('.feedback-star')];
const improve = document.getElementById('feedbackImprove');
const praise = document.getElementById('feedbackPraise');
const issues = document.getElementById('feedbackIssues');
const comment = document.getElementById('feedbackComment');
const send = document.getElementById('feedbackSend');
const skip = document.getElementById('feedbackSkip');
const status = document.getElementById('feedbackStatus');
const ratingLabel = document.getElementById('feedbackRatingLabel');
const thanks = document.getElementById('feedbackThanks');
const discovery = document.getElementById('portalDiscovery');
const ratingLabels = ['', 'Muito difícil', 'Difícil', 'Regular', 'Fácil', 'Muito fácil'];
let submission = null;
let rating = 0;
let saving = false;
let request = null;
let generation = 0;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function setBusy(busy) {
  saving = busy;
  form.setAttribute('aria-busy', String(busy));
  form.querySelectorAll('button, input, textarea').forEach(control => { control.disabled = busy; });
  skip.disabled = busy;
  send.textContent = busy ? 'Enviando…' : `Enviar avaliação · ${rating}/5`;
}

function resetFeedback() {
  generation++;
  request?.abort();
  request = null;
  submission = null;
  rating = 0;
  setBusy(false);
  comment.value = '';
  panel.querySelectorAll('input').forEach(input => { input.checked = false; });
  stars.forEach(star => {
    star.classList.remove('is-filled');
    star.setAttribute('aria-pressed', 'false');
  });
  ratingLabel.textContent = 'Toque em uma estrela para avaliar';
  improve.hidden = true;
  praise.hidden = true;
  send.hidden = true;
  form.hidden = false;
  skip.hidden = false;
  thanks.hidden = true;
  discovery.hidden = true;
  setStatus('');
  panel.hidden = true;
}

function revealDiscovery(saved) {
  form.hidden = true;
  skip.hidden = true;
  thanks.hidden = !saved;
  discovery.hidden = false;
  panel.hidden = !saved;
  setStatus('');
  document.getElementById(saved ? 'feedbackThanksTitle' : 'discoveryTitle').focus({ preventScroll: true });
  (saved ? thanks : discovery).scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'nearest'
  });
}

document.addEventListener('foto:enviada', event => {
  resetFeedback();
  submission = event.detail;
  panel.hidden = false;
  document.getElementById('feedbackTitle').focus({ preventScroll: true });
});
document.getElementById('again').addEventListener('click', resetFeedback);
skip.addEventListener('click', () => { if (!saving) revealDiscovery(false); });

stars.forEach(star => star.addEventListener('click', () => {
  if (!submission || saving) return;
  rating = Number(star.dataset.rating);
  stars.forEach(item => {
    item.classList.toggle('is-filled', Number(item.dataset.rating) <= rating);
    item.setAttribute('aria-pressed', String(item === star));
  });
  ratingLabel.textContent = `${rating}/5 · ${ratingLabels[rating]}`;
  improve.hidden = rating === 5;
  praise.hidden = rating !== 5;
  send.hidden = false;
  send.textContent = `Enviar avaliação · ${rating}/5`;
  setStatus('');
}));

send.addEventListener('click', async () => {
  if (!submission || !rating || saving) return;
  const positives = [...praise.querySelectorAll('input:checked')].map(input => input.value);
  if (rating === 5 && !positives.length) {
    setStatus('Toque em pelo menos uma opção que fez a diferença.', 'error');
    praise.querySelector('input').focus();
    return;
  }
  const selectedIssues = [...issues.querySelectorAll('input:checked')].map(input => input.value);
  const improvement = [selectedIssues.join('; '), comment.value.trim()].filter(Boolean).join('. ').slice(0, 500);
  const activeGeneration = generation;
  const controller = new AbortController();
  request = controller;
  const timeout = setTimeout(() => controller.abort(), 20000);
  setBusy(true);
  setStatus('Salvando sua avaliação…');
  try {
    const response = await fetch(submission.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        acao: 'avaliacao',
        token: submission.token,
        registro_id: submission.registroId,
        cpf: submission.cpf,
        nota: rating,
        pontos_positivos: rating === 5 ? positives : [],
        melhoria: rating < 5 ? improvement : ''
      })
    });
    if (!response.ok) throw new Error('Resposta inválida do serviço');
    const result = await response.json();
    if (!result.ok) throw new Error('Avaliação não confirmada');
    if (generation !== activeGeneration) return;
    revealDiscovery(true);
  } catch (error) {
    if (generation !== activeGeneration) return;
    setStatus('Não foi possível confirmar sua avaliação. Tente novamente ou continue explorando. Sua foto já foi enviada.', 'error');
  } finally {
    clearTimeout(timeout);
    if (generation === activeGeneration) {
      request = null;
      setBusy(false);
    }
  }
});
