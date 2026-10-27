/**
 * Receptor das fotos do Portal Ponto.PMC (foto.html)
 * Salva a foto como <matricula>.jpg numa pasta do Drive e registra uma linha na planilha.
 *
 * COMO PUBLICAR
 *  1. Crie uma pasta no Drive (ex.: "Fotos Ponto Facial") e copie o ID dela (trecho final da URL).
 *  2. Crie uma planilha Google (ex.: "Fotos Ponto - Registro") e copie o ID dela.
 *  3. Em script.google.com crie um projeto, cole este arquivo e preencha as 3 constantes abaixo.
 *  4. Implantar > Nova implantação > tipo "App da Web"
 *       Executar como: Eu   |   Quem pode acessar: Qualquer pessoa
 *  5. Autorize quando pedir e copie a URL (termina em /exec) para CONFIG.ENDPOINT no foto.html.
 *  6. Sempre que mudar este código: Implantar > Gerenciar implantações > editar > Nova versão.
 */
const FOLDER_ID = 'COLE_AQUI_O_ID_DA_PASTA';
const SHEET_ID  = 'COLE_AQUI_O_ID_DA_PLANILHA';
const TOKEN     = 'troque-este-token';   // o mesmo valor de CONFIG.TOKEN no foto.html

const MAX_BYTES = 300 * 1024;            // fotos 200x200 têm ~10-30 KB
const SHEET_NAME = 'Fotos';

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse(e.postData.contents);

    if (d.token !== TOKEN) return resposta_({ ok: false, erro: 'não autorizado' });

    const cpf = String(d.cpf || '').replace(/\D/g, '');
    if (!cpfValido_(cpf)) return resposta_({ ok: false, erro: 'CPF inválido' });

    // Com matrícula: arquivo <matricula>.jpg. Sem matrícula (servidor recém-chegado): arquivo <cpf>.jpg
    const semMatricula = d.sem_matricula === true;
    const matricula = semMatricula ? '' : String(d.matricula || '').replace(/\D/g, '').replace(/^0+/, '');
    if (!semMatricula && !/^\d{3,10}$/.test(matricula)) return resposta_({ ok: false, erro: 'matrícula inválida' });
    const idArquivo = semMatricula ? cpf : matricula;
    const cpfFmt = cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

    const email = String(d.email || '').trim().toLowerCase().slice(0, 120);
    if (!/^(?!\.)(?!.*\.\.)[a-z0-9._%+\-]{1,64}(?<!\.)@(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(email)) return resposta_({ ok: false, erro: 'e-mail inválido' });

    const nome = limpar_(d.nome, 120);
    const secretaria = limpar_(d.secretaria, 20);
    if (nome.length < 5) return resposta_({ ok: false, erro: 'nome inválido' });

    const bytes = Utilities.base64Decode(String(d.foto_base64 || ''));
    if (bytes.length < 500 || bytes.length > MAX_BYTES) return resposta_({ ok: false, erro: 'tamanho de foto inválido' });
    // JPEG começa com FF D8 FF (bytes com sinal no Apps Script)
    if (!(bytes[0] === -1 && bytes[1] === -40 && bytes[2] === -1)) return resposta_({ ok: false, erro: 'arquivo não é JPEG' });

    const pasta = DriveApp.getFolderById(FOLDER_ID);
    const nomeArquivo = idArquivo + '.jpg';

    // se a pessoa reenviar, a foto antiga vai para a lixeira (fica a mais recente)
    const antigos = pasta.getFilesByName(nomeArquivo);
    let substituiu = false;
    while (antigos.hasNext()) { antigos.next().setTrashed(true); substituiu = true; }

    const arquivo = pasta.createFile(Utilities.newBlob(bytes, 'image/jpeg', nomeArquivo));

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let aba = ss.getSheetByName(SHEET_NAME);
    if (!aba) {
      aba = ss.insertSheet(SHEET_NAME);
      aba.appendRow(['Data/hora', 'Nome', 'Matrícula', 'CPF', 'E-mail', 'Secretaria', 'Arquivo', 'Link', 'Reenvio?']);
      aba.setFrozenRows(1);
    }
    // coluna do CPF como texto (preserva zeros à esquerda e a máscara)
    aba.getRange(aba.getLastRow() + 1, 4).setNumberFormat('@');
    aba.appendRow([new Date(), nome, semMatricula ? 'SEM MATRÍCULA' : matricula, cpfFmt, limpar_(email, 120), secretaria, nomeArquivo, arquivo.getUrl(), substituiu ? 'sim' : 'não']);

    return resposta_({ ok: true });
  } catch (err) {
    return resposta_({ ok: false, erro: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// Abrir a URL no navegador só mostra que o serviço está no ar.
function doGet() { return resposta_({ ok: true, servico: 'ponto-fotos' }); }

function cpfValido_(c) {
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) {
    let sum = 0; for (let i = 0; i < n; i++) sum += Number(c[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(c[n])) return false;
  }
  return true;
}
function limpar_(v, max) {
  // remove caracteres de controle e fórmulas (evita injeção de fórmula na planilha)
  let s = String(v || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
