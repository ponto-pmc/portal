export function initPhotoFormUX(advance) {
  const card = document.getElementById('photoFormCard');
  const fields = ['nome', 'cpf', 'matricula', 'matricula2', 'email'].map(id => document.getElementById(id));
  const mobile = () => matchMedia('(max-width: 640px)').matches;
  for (const input of fields) {
    input.enterKeyHint = 'next';
    input.spellcheck = false;
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', input.id === 'nome' ? 'words' : 'none');
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      const second = document.getElementById('matricula2');
      if (mobile() && !(input.id === 'matricula' && second.getClientRects().length)) {
        advance();
      } else {
        const next = fields.slice(fields.indexOf(input) + 1).find(el => !el.disabled && !el.readOnly && el.getClientRects().length)
          || document.getElementById('secretariaTrigger');
        next.focus();
      }
    });
  }
  // A navegação inferior não deve disputar espaço com a edição no celular.
  function syncEditing() {
    const active = document.activeElement;
    document.body.classList.toggle('form-editing', card.contains(active)
      && active.matches('input:not([type=radio]):not([type=checkbox]):not([type=file]), textarea'));
  }
  document.addEventListener('focusin', syncEditing);
  document.addEventListener('focusout', () => queueMicrotask(syncEditing));
  // Associa as mensagens aos campos e anuncia o estado de erro sem apagar valores.
  card.querySelectorAll('.field').forEach(field => {
    const error = field.querySelector('.err');
    if (!error) return;
    if (!error.id) error.id = field.id + 'Error';
    const inputs = [...field.querySelectorAll('input, select')];
    const sync = () => {
      const invalid = field.classList.contains('invalid');
      inputs.forEach(input => {
        input.setAttribute('aria-invalid', String(invalid));
        const described = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
        described.delete(error.id);
        if (invalid) described.add(error.id);
        if (described.size) input.setAttribute('aria-describedby', [...described].join(' '));
        else input.removeAttribute('aria-describedby');
      });
    };
    new MutationObserver(sync).observe(field, { attributes: true, attributeFilter: ['class'] });
    sync();
  });
}
