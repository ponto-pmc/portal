const source = document.querySelector('#navLinks');
if (source) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 5 2 2 5-5"/>',
    calculator: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 6h8M8 11h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    camera: '<path d="M8 5 9 3h6l1 2h4a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1z"/><circle cx="12" cy="12" r="4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 3m0 3h.01"/>',
    access: '<path d="M14 4h6v16h-6M3 12h12m-4-4 4 4-4 4"/>',
    menu: '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="15" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.menu}</svg>`;
  const iconFor = {'index.html':'home', 'controle.html':'calendar', 'controle-mensal.html':'calendar', 'calculadora.html':'calculator', 'imagem.html':'image', 'foto.html':'camera', 'faq.html':'help'};
  const current = location.pathname.split('/').pop() || 'index.html';
  const links = [...source.querySelectorAll('a')];
  function makeLink(original, className) {
    const link = document.createElement('a');
    const href = original.getAttribute('href');
    link.href = href;
    link.className = className;
    if (original.target) { link.target = original.target; link.rel = 'noopener noreferrer'; }
    const active = href === current || (current === 'controle-mensal.html' && href === 'controle.html');
    if (active) link.setAttribute('aria-current', 'page');
    link.innerHTML = icon(iconFor[href] || 'access');
    const label = document.createElement('span');
    label.textContent = original.textContent.trim();
    link.append(label);
    return link;
  }
  const nav = document.createElement('nav');
  nav.className = 'mobile-bank-nav';
  nav.setAttribute('aria-label', 'Navegação do celular');
  const mainLinks = ['index.html', 'controle.html', 'access', 'faq.html'];
  for (const target of mainLinks) {
    const original = links.find(link => target === 'access' ? link.href.startsWith('https://forponto.') : link.getAttribute('href') === target)
      || (target === 'controle.html' ? links.find(link => link.getAttribute('href') === 'controle-mensal.html') : null);
    if (original) {
      const link = makeLink(original, 'mobile-bank-item');
      if (target === 'access') link.classList.add('mobile-bank-access');
      if (target === 'controle.html') link.querySelector('span').textContent = 'Controle';
      nav.append(link);
    }
  }
  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'mobile-bank-item';
  menu.innerHTML = `${icon('menu')}<span>Menu</span>`;
  menu.setAttribute('aria-haspopup', 'dialog');
  menu.setAttribute('aria-controls', 'mobile-bank-sheet');
  menu.setAttribute('aria-expanded', 'false');
  if (['calculadora.html', 'imagem.html', 'foto.html'].includes(current)) menu.classList.add('is-active');
  nav.append(menu);
  const sheet = document.createElement('dialog');
  sheet.id = 'mobile-bank-sheet';
  sheet.className = 'mobile-bank-sheet';
  sheet.setAttribute('aria-labelledby', 'mobile-bank-title');
  sheet.innerHTML = `<div class="mobile-bank-handle" aria-hidden="true"></div><div class="mobile-bank-heading"><h2 id="mobile-bank-title">Menu</h2><button type="button" aria-label="Fechar menu" autofocus>${icon('close')}</button></div><nav class="mobile-bank-grid" aria-label="Todos os serviços"></nav>`;
  const grid = sheet.querySelector('.mobile-bank-grid');
  links.forEach(link => grid.append(makeLink(link, 'mobile-bank-card')));
  document.body.append(nav, sheet);
  document.body.classList.add('has-mobile-bank-nav');
  const mobile = matchMedia('(max-width: 900px)');
  let previousOverflow;
  menu.addEventListener('click', () => {
    if (sheet.open) return;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.showModal();
    menu.setAttribute('aria-expanded', 'true');
  });
  sheet.querySelector('button').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', event => {
    if (event.target === sheet) {
      const rect = sheet.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) sheet.close();
    }
    if (event.target.closest('a')) sheet.close();
  });
  sheet.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow || '';
    menu.setAttribute('aria-expanded', 'false');
  });
  mobile.addEventListener('change', event => { if (!event.matches && sheet.open) sheet.close(); });
}
