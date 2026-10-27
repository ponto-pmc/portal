/* Guia interativo das ferramentas do portal. */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const trigger = document.getElementById('guide-launch');
  const hole = document.getElementById('tour-hole');
  const card = document.getElementById('tour-card');
  if (!trigger || !hole || !card) return;

  const controlSteps = [
    { title: 'Bem-vindo ao Controle', text: 'Vou mostrar o registro do mês em poucos passos. Use Próximo, Voltar ou Pular. Reabra o guia pelo botão Guia.' },
    { target: '.header-fields', title: 'Servidor e mês', text: 'Informe seu nome e o mês de referência. Esses dados também identificam o PDF que você baixar.' },
    { target: '#import-dropzone', title: 'Importar espelho', text: 'Selecione um PDF ou uma imagem do ponto para preencher as marcações encontradas. Você também pode digitar os horários.' },
    { target: '#work-regime', title: 'Regime de trabalho', text: 'Escolha Expediente ou Plantão. No plantão, registre só entrada e saída, mesmo acima de 6 horas; o cálculo considera 1 hora de almoço nesses dias.' },
    { target: '.daily-settings-action', title: 'Jornada diária', text: 'O padrão é 08:00. Defina outra duração e aplique a todos os dias; depois, altere dias específicos na tabela.' },
    { target: '.time-template', title: 'Repetir horários', text: 'Abra esta seção para preencher as mesmas batidas em todo o mês. No plantão, bastam duas; no expediente acima de 6 horas, são quatro.' },
    { target: '#days-body tr:first-child', title: 'Ajustar cada dia', text: 'Edite a jornada, as marcações e as ocorrências diretamente na linha do dia. O resultado aparece à direita ou abaixo no celular.' },
    { target: '.summary-card', title: 'Saldo do mês', text: 'Confira horas positivas, negativas e saldo. O cálculo usa a jornada de cada dia e o regime escolhido.' },
    { target: '.sheet-actions', title: 'Baixar ou limpar', text: 'Para baixar a relação em PDF, informe servidor e mês e registre ao menos uma marcação manual. Limpar registros recomeça a grade.' },
    { title: 'Pronto', text: 'Você pode voltar a este passo a passo pelo botão Guia quando quiser.' },
  ];
  const calculatorSteps = [
    { title: 'Bem-vindo à Calculadora', text: 'Vou mostrar como calcular descontos por faltas. Use Próximo, Voltar ou Pular. Reabra este percurso pelo botão Guia.' },
    { target: '#acc1', title: 'Tipo de falta', text: 'Abra esta etapa e escolha se a ausência será informada em dias ou em horas.' },
    { target: '#tipoFalta', openAcc: 'acc1', title: 'Quantidade da ausência', text: 'Para dias, informe a quantidade de faltas. Para horas, selecione a jornada mensal e informe horas e minutos.' },
    { target: '#acc2', title: 'Remuneração', text: 'Preencha os valores que entram na remuneração, como vencimento, quinquênio e gratificação.' },
    { target: '.outros-panel', openAcc: 'acc2', title: 'Outros vencimentos', text: 'Use o botão + para acrescentar outros valores que devem compor o cálculo.' },
    { target: '.btn-row', title: 'Calcular e exportar', text: 'Clique em Calcular para ver o desconto. Depois você pode exportar o PDF ou limpar os campos.' },
    { title: 'Pronto', text: 'O botão Guia permite rever estas etapas a qualquer momento.' },
  ];
  const steps = document.body.classList.contains('control-page') ? controlSteps : calculatorSteps;
  let index = -1;
  let placeFrame = 0;

  function currentTarget() {
    const selector = steps[index]?.target;
    return selector ? document.querySelector(selector) : null;
  }

  function position() {
    if (index < 0) return;
    const element = currentTarget();
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    const edge = 12;
    if (!element) {
      hole.style.left = '50%';
      hole.style.top = '50%';
      hole.style.width = '0';
      hole.style.height = '0';
      card.style.left = `${Math.max(edge, (innerWidth - cardWidth) / 2)}px`;
      card.style.top = `${Math.max(edge, (innerHeight - cardHeight) / 2)}px`;
      return;
    }
    const r = element.getBoundingClientRect();
    const pad = 7;
    const gap = 17;
    hole.style.left = `${r.left - pad}px`;
    hole.style.top = `${r.top - pad}px`;
    hole.style.width = `${r.width + pad * 2}px`;
    hole.style.height = `${r.height + pad * 2}px`;
    const clamp = (value, max) => Math.max(edge, Math.min(value, Math.max(edge, max)));
    const candidates = [
      { x: r.right + gap, y: r.top },
      { x: r.left - cardWidth - gap, y: r.top },
      { x: r.left, y: r.bottom + gap },
      { x: r.left, y: r.top - cardHeight - gap },
    ].map(({ x, y }) => ({ x: clamp(x, innerWidth - cardWidth - edge), y: clamp(y, innerHeight - cardHeight - edge) }));
    const overlaps = ({ x, y }) => x < r.right + pad && x + cardWidth > r.left - pad && y < r.bottom + pad && y + cardHeight > r.top - pad;
    candidates.sort((a, b) => Number(overlaps(a)) - Number(overlaps(b)) || Math.abs(a.x - r.left) + Math.abs(a.y - r.top) - Math.abs(b.x - r.left) - Math.abs(b.y - r.top));
    card.style.left = `${candidates[0].x}px`;
    card.style.top = `${candidates[0].y}px`;
  }

  function schedulePosition() {
    if (index < 0 || placeFrame) return;
    placeFrame = requestAnimationFrame(() => { placeFrame = 0; position(); });
  }

  function showStep() {
    const step = steps[index];
    const target = currentTarget();
    if (step.openAcc && typeof window.toggleAcc === 'function' && !document.getElementById(step.openAcc)?.classList.contains('active')) {
      window.toggleAcc(step.openAcc);
    }
    if (target?.tagName === 'DETAILS') target.open = true;
    for (let parent = target?.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    card.innerHTML = `
      <div class="tour-step">Passo ${index + 1} de ${steps.length}</div>
      <h3>${step.title}</h3>
      <p>${step.text}</p>
      <div class="tour-dots" aria-hidden="true">${steps.map((_, i) => `<span class="${i <= index ? 'on' : ''}"></span>`).join('')}</div>
      <div class="tour-actions">
        <button type="button" data-tour="skip">Pular</button>
        <div class="tour-nav">
          <button type="button" data-tour="prev" ${index === 0 ? 'disabled' : ''}>Voltar</button>
          <button type="button" data-tour="next">${index === steps.length - 1 ? 'Concluir' : 'Próximo'}</button>
        </div>
      </div>`;
    hole.hidden = false;
    card.hidden = false;
    target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    schedulePosition();
    setTimeout(schedulePosition, 380);
    card.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  }

  function close() {
    index = -1;
    hole.hidden = true;
    card.hidden = true;
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => { index = 0; showStep(); });
  card.addEventListener('click', (event) => {
    const action = event.target.closest('[data-tour]')?.dataset.tour;
    if (action === 'skip' || (action === 'next' && index === steps.length - 1)) close();
    else if (action === 'next') { index += 1; showStep(); }
    else if (action === 'prev' && index > 0) { index -= 1; showStep(); }
  });
  window.addEventListener('keydown', (event) => {
    if (index < 0) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowRight' && index < steps.length - 1) { event.preventDefault(); index += 1; showStep(); }
    else if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); index -= 1; showStep(); }
  });
  window.addEventListener('scroll', schedulePosition, { passive: true });
  window.addEventListener('resize', schedulePosition);
});
