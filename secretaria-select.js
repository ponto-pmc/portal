// O select original continua sendo a fonte do valor enviado pelo formulário.
export function enhanceSecretariaSelect(select, entries) {
  const field = select.closest('.field');
  const label = field.querySelector('label');
  const picker = document.createElement('div');
  picker.className = 'secretaria-picker';
  picker.innerHTML = `
    <button type="button" id="secretariaTrigger" class="secretaria-trigger" aria-expanded="false" aria-controls="secretariaPanel" aria-haspopup="dialog">
      <span class="secretaria-value"></span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <dialog id="secretariaPanel" class="secretaria-panel" aria-labelledby="secretariaTitle">
      <div class="secretaria-heading">
        <h3 id="secretariaTitle" tabindex="-1" autofocus>Secretaria ou órgão</h3>
        <button type="button" class="secretaria-close" aria-label="Fechar lista"><svg xmlns="http://www.w3.org/2000/svg" class="inline-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align:-0.125em"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
      </div>
      <div class="secretaria-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
        <input type="text" id="secretariaSearch" role="combobox" aria-label="Buscar secretaria ou órgão por sigla ou nome" aria-autocomplete="list" aria-expanded="false" aria-controls="secretariaOptions" autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="Buscar por sigla ou nome" />
      </div>
      <div id="secretariaOptions" class="secretaria-options" role="listbox" tabindex="0" aria-label="Secretarias e órgãos"></div>
      <p class="secretaria-empty" role="status" hidden>Nenhuma secretaria encontrada.</p>
    </dialog>`;
  select.after(picker);
  select.hidden = true;
  label.htmlFor = 'secretariaTrigger';
  const trigger = picker.querySelector('.secretaria-trigger');
  const value = picker.querySelector('.secretaria-value');
  const panel = picker.querySelector('.secretaria-panel');
  const search = picker.querySelector('input');
  const list = picker.querySelector('[role=listbox]');
  const empty = picker.querySelector('.secretaria-empty');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  let filtered = sorted;
  let active = -1;

  function optionContent(entry, target) {
    const sigla = document.createElement('strong');
    sigla.textContent = entry[0];
    const name = document.createElement('span');
    name.textContent = entry[1];
    target.replaceChildren(sigla, name);
  }
  function syncValue() {
    const selected = entries.find(([sigla]) => sigla === select.value);
    if (selected) optionContent(selected, value);
    else value.textContent = 'Selecione sua secretaria';
    trigger.classList.toggle('has-value', !!selected);
    if (selected) field.classList.remove('invalid');
  }
  function setActive(index, scroll = true) {
    active = filtered.length ? Math.max(0, Math.min(index, filtered.length - 1)) : -1;
    [...list.children].forEach((option, i) => option.classList.toggle('is-active', i === active));
    list.removeAttribute('aria-activedescendant');
    if (active < 0) search.removeAttribute('aria-activedescendant');
    else {
      const option = list.children[active];
      search.setAttribute('aria-activedescendant', option.id);
      list.setAttribute('aria-activedescendant', option.id);
      if (scroll) {
        const top = option.offsetTop;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (top + option.offsetHeight > list.scrollTop + list.clientHeight)
          list.scrollTop = top + option.offsetHeight - list.clientHeight;
      }
    }
  }
  function render() {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    filtered = sorted.filter(entry => terms.every(term => normalize(entry.join(' ')).includes(term)));
    list.replaceChildren();
    filtered.forEach(entry => {
      const option = document.createElement('div');
      option.id = 'secretaria-option-' + entry[0];
      option.className = 'secretaria-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(entry[0] === select.value));
      optionContent(entry, option);
      option.addEventListener('click', () => choose(entry));
      list.append(option);
    });
    empty.hidden = filtered.length > 0;
    setActive(Math.max(0, filtered.findIndex(entry => entry[0] === select.value)), false);
    list.scrollTop = 0;
  }
  function updateViewport() {
    const viewport = window.visualViewport;
    panel.style.setProperty('--picker-height', `${viewport?.height || window.innerHeight}px`);
    panel.style.setProperty('--picker-top', `${viewport?.offsetTop || 0}px`);
  }
  function close() {
    if (panel.open) panel.close();
  }
  panel.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
    search.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    document.body.classList.remove('secretaria-open');
    window.visualViewport?.removeEventListener('resize', updateViewport);
    window.visualViewport?.removeEventListener('scroll', updateViewport);
    window.removeEventListener('resize', updateViewport);
    if (trigger.getClientRects().length) trigger.focus({ preventScroll: true });
  });
  panel.querySelector('.secretaria-close').addEventListener('click', close);
  panel.addEventListener('click', event => {
    const rect = panel.getBoundingClientRect();
    if (event.target === panel && (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom)) close();
  });
  function open() {
    if (panel.open) return;
    search.value = '';
    render();
    updateViewport();
    document.body.classList.add('secretaria-open');
    panel.showModal();
    panel.querySelector('h3').focus({ preventScroll: true });
    trigger.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-expanded', 'true');
    setActive(active);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
  }
  function choose(entry) {
    select.value = entry[0];
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  }
  trigger.addEventListener('click', () => panel.open ? close() : open());
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
      if (event.key === 'ArrowUp') setActive(filtered.length - 1);
      list.focus({ preventScroll: true });
    }
  });
  search.addEventListener('input', render);
  function navigateOptions(event) {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.target === list && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : filtered.length - 1);
    } else if (event.key === 'Enter' || (event.target === list && event.key === ' ')) {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
  search.addEventListener('keydown', navigateOptions);
  list.addEventListener('keydown', navigateOptions);
  // Mantém o foco ao clicar com o mouse sem impedir a rolagem por toque.
  list.addEventListener('mousedown', event => event.preventDefault());
  select.addEventListener('change', syncValue);
  const syncInvalid = () => {
    const invalid = field.classList.contains('invalid');
    trigger.setAttribute('aria-invalid', String(invalid));
    if (invalid) trigger.setAttribute('aria-describedby', 'secretariaError');
    else trigger.removeAttribute('aria-describedby');
  };
  new MutationObserver(syncInvalid).observe(field, { attributes: true, attributeFilter: ['class'] });
  syncInvalid();
  syncValue();
  return { close, focus: () => trigger.focus() };
}
