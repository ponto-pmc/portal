/* Optional asset rebuild: npm install sharp (Node 20.9+), then node design/export-scenes.cjs */
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
async function exportScenes() {
  const root = process.cwd();
  const media = path.join(root, 'assets/home');
  const terminal = 'data:image/png;base64,' + (await sharp(path.join(media, 'terminal.webp')).png().toBuffer()).toString('base64');
  const face = 'data:image/png;base64,' + (await sharp(path.join(media, 'retrato-ficticio.webp')).png().toBuffer()).toString('base64');
  for (const state of ['cadastro', 'registro', 'frequencia']) {
    const tx = state === 'frequencia' ? 75 : 260;
    const tw = state === 'frequencia' ? 405 : 440;
    const sx = tx + tw * .195, sy = 40 + tw * 1.333 * .173, sw = tw * .566, sh = tw * 1.333 * .642;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="700"><defs><radialGradient id="bg"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff"/></radialGradient></defs><rect width="960" height="700" rx="20" fill="#ffffff"/><circle cx="480" cy="340" r="300" fill="url(#bg)" stroke="#eeeeee"/><circle cx="480" cy="340" r="240" fill="none" stroke="#eeeeee"/><image xlink:href="${terminal}" x="${tx}" y="40" width="${tw}" height="${tw*1.333}"/><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="6" fill="#102633"/>`;
    if (state === 'cadastro') svg += `<image xlink:href="${face}" x="${sx+sw*.15}" y="${sy+sh*.15}" width="${sw*.7}" height="${sw*.875}"/><path d="M${sx+sw*.14} ${sy+sh*.2}v-18h18m${sw*.6} 0h18v18M${sx+sw*.14} ${sy+sh*.8}v18h18m${sw*.6} 0h18v-18" fill="none" stroke="#a5e6cf" stroke-width="3"/>`;
    if (state === 'registro') svg += `<text x="${sx+sw/2}" y="${sy+sh*.48}" text-anchor="middle" fill="#e9f7fa" font-family="monospace" font-size="53">08:00</text><circle cx="${sx+sw/2}" cy="${sy+sh*.65}" r="20" fill="none" stroke="#8cd5ae" stroke-width="2"/><path d="m${sx+sw/2-10} ${sy+sh*.65} 7 7 13-15" fill="none" stroke="#8cd5ae" stroke-width="3"/>`;
    if (state === 'frequencia') svg += `<rect x="450" y="280" width="430" height="210" rx="12" fill="#fff" stroke="#d9e4e9"/><g font-family="sans-serif" fill="#122c3c"><text x="475" y="315" font-size="15" fill="#526773">EXEMPLO FICTÍCIO</text><text x="475" y="351" font-size="26" font-weight="bold">Espelho de ponto</text><text x="475" y="389" font-size="18">Data</text><text x="595" y="389" font-size="18">Marcação</text><text x="765" y="389" font-size="18">Tipo</text><path d="M470 400h390" stroke="#d9e4e9"/><rect x="462" y="406" width="410" height="55" rx="5" fill="#eaf4f6"/><text x="475" y="441" font-size="22">05/11</text><text x="595" y="441" font-size="23" font-family="monospace" fill="#075d84">08:00</text><text x="765" y="441" font-size="22">Entrada</text></g>`;
    svg += '</svg>';
    await sharp(Buffer.from(svg)).webp({ quality: 83 }).toFile(path.join(media, `cena-${state}.webp`));
  }
}
module.exports = exportScenes;
if (require.main === module) exportScenes().catch(error => { console.error(error); process.exitCode = 1; });
