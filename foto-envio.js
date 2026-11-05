// Mantém o motivo da falha visível sem descartar os dados e a foto do formulário.
export async function enviarFoto(endpoint, payload) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error('Não foi possível confirmar o envio com o serviço. Verifique sua conexão. Se o problema continuar, avise a equipe do Ponto Eletrônico.');
  }

  if (!response.ok) {
    throw new Error('O serviço de envio respondeu com erro HTTP ' + response.status + '. Avise a equipe do Ponto Eletrônico.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('O serviço retornou uma resposta inválida e não foi possível confirmar o envio. A equipe do Ponto Eletrônico precisa conferir o acesso ao serviço de fotos.');
  }

  if (!data || typeof data.ok !== 'boolean') {
    throw new Error('O serviço não confirmou o recebimento da foto. Avise a equipe do Ponto Eletrônico.');
  }
  if (!data.ok) {
    const motivo = typeof data.erro === 'string' ? data.erro.trim() : '';
    if (!motivo) throw new Error('O serviço recusou a foto sem informar o motivo. Avise a equipe do Ponto Eletrônico.');

    let orientacao = '';
    if (/COLE_AQUI_O_ID_DA_PASTA/.test(motivo)) {
      orientacao = 'A pasta de destino das fotos ainda não foi configurada. ';
    } else if (/getFolderById|DriveApp|drive\.google\.com|Google Drive/i.test(motivo)) {
      orientacao = 'O serviço não conseguiu acessar o Google Drive. A equipe do Ponto Eletrônico precisa conferir a pasta de fotos e as permissões. ';
    } else if (/Illegal spreadsheet id or key:/i.test(motivo)) {
      orientacao = 'A planilha de registro dos envios não está configurada corretamente. ';
    } else if (motivo === 'não autorizado') {
      orientacao = 'O serviço não autorizou o envio da foto. Avise a equipe do Ponto Eletrônico. ';
    }
    throw new Error(orientacao + 'Motivo informado pelo serviço: ' + motivo);
  }
  return data;
}
