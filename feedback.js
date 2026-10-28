const panel = document.getElementById('photoFeedback');
const stars = [...document.querySelectorAll('.feedback-star')];
const improve = document.getElementById('feedbackImprove');
const praise = document.getElementById('feedbackPraise');
const comment = document.getElementById('feedbackComment');
const send = document.getElementById('feedbackSend');
const status = document.getElementById('feedbackStatus');
let submission = null;
let rating = 0;
let saving = false;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function resetFeedback() {
  submission = null;
  rating = 0;
  saving = false;
  comment.value = '';
  praise.querySelectorAll('input').forEach(input => { input.checked = false; });
  stars.forEach(star => {
    star.classList.remove('is-filled');
    star.setAttribute('aria-pressed', 'false');
    star.disabled = false;
  });
  improve.hidden = true;
  praise.hidden = true;
  send.hidden = true;
  send.disabled = false;
  setStatus('');
  panel.hidden = true;
}

document.addEventListener('foto:enviada', event => {
  resetFeedback();
  submission = event.detail;
  panel.hidden = false;
});
document.getElementById('again').addEventListener('click', resetFeedback);

stars.forEach(star => star.addEventListener('click', () => {
  if (!submission || saving) return;
  rating = Number(star.dataset.rating);
  stars.forEach(item => {
    item.classList.toggle('is-filled', Number(item.dataset.rating) <= rating);
    item.setAttribute('aria-pressed', String(item === star));
  });
  improve.hidden = rating === 5;
  praise.hidden = rating !== 5;
  send.hidden = false;
  setStatus('');
}));

send.addEventListener('click', async () => {
  if (!submission || !rating || saving) return;
  const positives = [...praise.querySelectorAll('input:checked')].map(input => input.value);
  if (rating === 5 && !positives.length) {
    setStatus('Selecione pelo menos uma opção que funcionou bem.', 'error');
    praise.querySelector('input').focus();
    return;
  }
  saving = true;
  send.disabled = true;
  setStatus('Salvando avaliação…');
  try {
    const response = await fetch(submission.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        acao: 'avaliacao',
        token: submission.token,
        registro_id: submission.registroId,
        cpf: submission.cpf,
        nota: rating,
        pontos_positivos: rating === 5 ? positives : [],
        melhoria: rating < 5 ? comment.value.trim() : ''
      })
    });
    const result = await response.json();
    if (!result.ok) throw new Error(result.erro || 'Falha ao salvar avaliação');
    stars.forEach(item => { item.disabled = true; });
    improve.hidden = true;
    praise.hidden = true;
    send.hidden = true;
    setStatus('Obrigado! Sua avaliação foi salva.', 'success');
  } catch (error) {
    console.error('Não foi possível salvar a avaliação:', error);
    setStatus('Não foi possível salvar a avaliação. Tente novamente.', 'error');
    send.disabled = false;
  } finally {
    saving = false;
  }
});
