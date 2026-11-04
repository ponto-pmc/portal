const PORTAL = 'https://portal.contagem.mg.gov.br/';
const TTL = 60 * 1000;
// Cache temporário em JavaScript; recriado após reinícios, sem banco de dados.
let cached;
let pending;

function decode(value = '') {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return {amp:'&', quot:'"', apos:"'", lt:'<', gt:'>', nbsp:' '}[entity.toLowerCase()] || match;
  });
}
function attribute(tag, name) {
  return decode(tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] || '');
}
function safeUrl(value, image = false) {
  if (!value || value.startsWith('#')) return null;
  try {
    const url = new URL(value, PORTAL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (image && url.hostname !== new URL(PORTAL).hostname) return null;
    return url.href;
  } catch { return null; }
}
export function parsePortal(html) {
  // Read only the homepage's rotating banner module, not service icons or news images.
  const bannerArea = html.match(/<div\b[^>]*id=["']p_area_banner["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
  const banners = [];
  for (const match of bannerArea.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)) {
    const img = match[2].match(/<img\b[^>]*>/i)?.[0];
    if (!img) continue;
    const image = safeUrl(attribute(img, 'src'), true);
    if (!image || banners.some(b => b.image === image)) continue;
    banners.push({image, title: attribute(match[1], 'aria-label') || attribute(img, 'alt') || 'Destaque da Prefeitura', url: safeUrl(attribute(match[2].match(/<a\b[^>]*>/i)?.[0] || '', 'href')) || PORTAL});
  }
  // A changed upstream layout must not silently replace a good cache with empty data.
  if (!banners.length) throw new Error('Conteúdo oficial não identificado');
  return {banners: banners.slice(0, 20), source: PORTAL, fetchedAt: new Date().toISOString()};
}
async function refresh() {
  const response = await fetch(PORTAL, {headers: {Accept: 'text/html', 'Cache-Control': 'no-cache'}, signal: AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error(`Portal: ${response.status}`);
  const data = parsePortal(await response.text());
  cached = {data, fetchedAt: Date.now()};
  return data;
}
export default {
  async fetch(request) {
    if (new URL(request.url).pathname !== '/api/contagem') return new Response('Not found', {status: 404});
    if (request.method !== 'GET') return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET'}});
    const headers = {'Cache-Control': 'no-store'};
    try {
      if (cached && Date.now() - cached.fetchedAt < TTL) return Response.json({...cached.data, stale: false}, {headers});
      if (!pending) pending = refresh().finally(() => { pending = null; });
      return Response.json({...await pending, stale: false}, {headers});
    } catch (error) {
      console.error('Contagem feed:', error.message);
      if (cached) return Response.json({...cached.data, stale: true}, {headers});
      return Response.json({error: 'Não foi possível atualizar o conteúdo da Prefeitura.'}, {status: 503, headers});
    }
  }
};
