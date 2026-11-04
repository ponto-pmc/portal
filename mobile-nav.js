const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  calculator: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 6h8M8 10h2m4 0h2M8 14h2m4 0h2M8 18h2m4 0h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 16v-4m5 4V8m5 8v-6"/>',
  more: '<rect x="3" y="3" width="6" height="6" rx="2"/><rect x="15" y="3" width="6" height="6" rx="2"/><rect x="3" y="15" width="6" height="6" rx="2"/><rect x="15" y="15" width="6" height="6" rx="2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  camera: '<path d="m8 5 2-2h4l2 2h4a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1Z"/><circle cx="12" cy="12" r="4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2m0 3h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const page = location.pathname.split('/').pop() || 'index.html';
const mobile = matchMedia('(max-width: 900px)');
const extras = [
  ['imagem.html', 'Imagens', 'image'],
  ['foto.html', 'Enviar foto', 'camera'],
  ['controle-mensal.html', 'Controle mensal', 'calendar'],
  ['faq.html', 'Ajuda', 'help']
];
const nav = document.createElement('nav');
nav.className = 'bank-nav';
nav.setAttribute('aria-label', 'Navegação no celular');
const links = [
  ['index.html', 'Início', 'home'],
  ['calculadora.html', 'Calculadora', 'calculator'],
  ['https://forponto.contagem.mg.gov.br/ForpontoWeb/login.aspx', 'Meu ponto', 'clock'],
  ['controle.html', 'Controle', 'chart']
];
nav.innerHTML = links.map(([href, title, glyph]) => `<a class="bank-tab${glyph === 'clock' ? ' bank-tab-point' : ''}" href="${href}"${page === href ? ' aria-current="page"' : ''}${href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer" aria-label="Meu ponto, abrir sistema em nova aba"' : ''}><span class="bank-tab-icon">${icon(glyph)}</span><span>${title}</span></a>`).join('');
const more = document.createElement('button');
more.type = 'button';
more.className = 'bank-tab';
more.setAttribute('aria-haspopup', 'dialog');
more.setAttribute('aria-controls', 'bank-services');
more.setAttribute('aria-expanded', 'false');
if (extras.some(([href]) => href === page)) more.classList.add('bank-tab-selected');
more.innerHTML = `<span class="bank-tab-icon">${icon('more')}</span><span>Mais</span>`;
nav.append(more);
const sheet = document.createElement('dialog');
sheet.id = 'bank-services';
sheet.className = 'bank-sheet';
sheet.setAttribute('aria-labelledby', 'bank-services-title');
sheet.innerHTML = `<div class="bank-sheet-handle" aria-hidden="true"></div><div class="bank-sheet-heading"><h2 id="bank-services-title">Mais serviços</h2><button type="button" class="bank-sheet-close" aria-label="Fechar menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="bank-services-grid">${extras.map(([href, title, glyph]) => `<a href="${href}"${page === href ? ' aria-current="page"' : ''}>${icon(glyph)}<span>${title}</span></a>`).join('')}</div>`;
document.body.append(nav, sheet);
document.body.classList.add('has-bank-nav');
const close = () => { if (sheet.open) sheet.close(); };
more.addEventListener('click', () => {
  sheet.showModal();
  document.body.classList.add('bank-menu-open');
  more.setAttribute('aria-expanded', 'true');
});
sheet.querySelector('.bank-sheet-close').addEventListener('click', close);
sheet.addEventListener('click', event => {
  if (event.target !== sheet) return;
  const box = sheet.getBoundingClientRect();
  if (event.clientY < box.top || event.clientY > box.bottom || event.clientX < box.left || event.clientX > box.right) close();
});
sheet.addEventListener('close', () => {
  document.body.classList.remove('bank-menu-open');
  more.setAttribute('aria-expanded', 'false');
  if (mobile.matches) more.focus();
});
sheet.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
mobile.addEventListener('change', () => { if (!mobile.matches) close(); });
window.addEventListener('pagehide', close);
