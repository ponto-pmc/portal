# Validação — 23/11/2026

## Revisão atual: composição contínua e imagens por rolagem

Esta revisão substitui a fixação separada e o carrossel automático descritos nos registros anteriores. Há um único painel fixo para equipamento e informações, com transições reversíveis e suavização de 95 ms. O antigo carrossel usa o mesmo modelo de rolagem nativa, com seleção direta e sem temporizador.

- Desktop em 1920 × 1080: composição de 1915 px de largura (descontada a barra vertical), margens fluidas de cerca de 77 px, atalhos visíveis na abertura e fundo branco rgb(255, 255, 255).
- Celular em 390 × 844: conteúdo da etapa de frequência terminou em y≈661 px, acima da navegação em y=769 px. Horário alinhado à célula com erro inferior a 0,001 px nos dois eixos.
- Materiais em 320 × 740: legislação e seu link legíveis, controles terminando em y≈653 px, acima da navegação em y=665 px; nenhuma rolagem horizontal.
- Sequência de imagens: seleção Legislação estável por 31,6 segundos sem rolagem. Avanço por rolagem mostrou Aplicativo; retorno mostrou Legislação, mantendo o painel em y=63 px. Os controles também navegam para as informações correspondentes.
- HTML verificado: nenhum recurso local ausente, ID duplicado, âncora inválida ou comando antigo de navegação do carrossel. As frases solicitadas foram removidas.
- Fixture sem JavaScript: zero scripts, quatro painéis de texto no fluxo, três cenas estáticas e cinco materiais visíveis em posição relativa.
- Fixture de movimento reduzido: sem composição fixada, sem materiais fixados e cinco materiais estáticos visíveis.
- As cenas estáticas foram reexportadas com fundo branco para acompanhar a nova direção visual.

Os testes de tamanho móvel e preferências são simulações no navegador integrado. As limitações de aparelhos físicos, leitor de tela e rede descritas abaixo continuam válidas.

## Revisão: sequência móvel e identidade original

A versão revisada usa animação por rolagem também no celular e em telas baixas. A versão estática fica reservada à ausência de JavaScript, movimento reduzido ou falha de mídia. A paleta e a tipografia vêm diretamente de tokens.css, sem a paleta azul-petróleo introduzida na primeira entrega.

Conferidos no navegador integrado: painel móvel fixado abaixo do cabeçalho, avanço da foto, exibição de 08:00, transferência ao espelho e retorno das camadas ao rolar para cima. Na revisão final em 390 × 844, o progresso 0,9241 exibiu o horário na célula com diferenças horizontal e vertical de 0 px; o painel permaneceu fixo a 63 px do topo. Após voltar, o progresso 0,3244 mostrou a foto no visor e o horário oculto, sem estado residual. Nenhum erro ou aviso apareceu no console nessa checagem. Também conferidos: 320 × 740 sem rolagem horizontal (largura do documento de 315 px) e animação ativa; desktop em 1440 × 900 com espelho preenchido e diferenças de 0 px na horizontal e menos de 0,001 px na vertical. Na abertura desktop, o estilo calculado confirmou DM Sans, peso 300, texto rgb(22, 22, 15) e azul #2d7de0. A altura do painel e as posições das etapas são recalculadas após redimensionamento e carregamento de fontes.

Abaixo está a validação da implementação inicial. Os itens que descrevem a versão móvel estática foram substituídos pelo comportamento desta revisão. As limitações de dispositivos físicos e de rede continuam válidas.

## Validação inicial

Ambiente: navegador integrado do Codex no Windows, com motor Chromium. Servidor estático local em `http://127.0.0.1:4173/portal/`. Nenhum envio de formulário, acesso autenticado, captura de câmera ou registro de ponto foi realizado.

| Verificação | Resultado e evidência |
| --- | --- |
| Primeira tela no desktop | Em 1440 × 900, os dois atalhos estão visíveis, com a área de ações por volta de y=519 px. Título e ilustração em duas colunas. |
| Primeira tela móvel | Em viewport de 390 × 844, os atalhos ficam entre y=419 e 473 px e a ilustração começa abaixo deles. |
| Largura mínima | Viewport de 320 × 740: largura do documento de 315 px, sem overflow horizontal. Os botões se reorganizam verticalmente. Em 390 px, largura do documento de 385 px. |
| Continuidade visual | Mesmo nó `.terminal` e mesmo arquivo de imagem em todas as etapas do desktop; fixação CSS única e rolagem nativa. Cadastro e registro conferidos visualmente. |
| Foto no visor | Foto fictícia visível e enquadrada dentro do visor, com os cantos e o corpo do terminal preservados. Estado conferido na seção `#cadastro`. |
| Marcação e confirmação | Na região de registro, 08:00 aparece no visor e o sinal de confirmação surge depois. Conferido visualmente. |
| Encaixe no espelho | Na cena final, diferença entre o centro do elemento em movimento e o centro da célula renderizada: x=0 px e y≈0,00003 px, dentro do arredondamento de layout. Valor estático visível após a chegada. |
| Rolagem e estados intermediários | Conferidos abertura, foto, horário e trajeto até o espelho. Estados são calculados a partir da posição atual, inclusive saltos de rolagem e navegação por âncora; não dependem de animações anteriores concluídas. |
| Recarregar por âncora | Recarregamento de `#frequencia` conferido após o evento de carga: seção a 110 px do topo, espelho preenchido e encaixe preservado. Corrigida interferência da ancoragem automática ao ocultar as imagens de fallback. |
| Teclado | Tab a partir de “Enviar foto” leva a “Acessar o ponto”, com contorno de foco sólido. Links operacionais usam elementos `a` e a ordem segue o conteúdo. |
| Sem JavaScript | Fixture local com todas as tags `script` removidas: zero scripts, dois atalhos com destinos corretos e três figuras estáticas presentes. As figuras são carregadas sob demanda. A versão final inclui também `home-static.css` via `noscript` para expor todo o menu móvel. |
| Movimento reduzido | Preferência simulada em fixture local que retorna `matches=true` para a consulta de movimento reduzido e aplica o mesmo bloco CSS: sem classe de animação, visual sem sticky e três cenas estáticas disponíveis. Não foi alterada a preferência do sistema operacional. |
| Falha do render | Fixture com URL do terminal indisponível: animação desativada, três cenas estáticas preservadas e dois atalhos acessíveis. O 404 deliberado pertence somente ao teste negativo. |
| Console | Na página normal, consultas ao console retornaram listas vazias para erros e avisos durante a revisão das cenas. Verificação de sintaxe de `home.js`, `preview.cjs` e do exportador de cenas aprovada. |
| Arquivos e âncoras | Verificador de HTML: nenhuma referência local ausente, nenhum ID duplicado, nenhuma âncora inválida e nenhum `href="#"`. |
| Subdiretório | Página servida com prefixo `/portal/`; URLs de foto, calculadora, controle, imagens, ajuda e mídias resolvem nesse mesmo prefixo. Página inicial responde HTTP 200. |
| Rotas públicas | Envio de foto e login oficial do Forponto abertos e confirmados no navegador. O envio e a consulta após autenticação não foram executados. |
| Integrações existentes | Menus, tema, PWA, assistente, comunicados, carrossel, vídeo, Power BI e contatos preservados. Vídeo e painel abriram durante a revisão. Não foram revalidados todos os fluxos de todas as páginas. |
| Recursos | Transparência e composição das imagens revisadas. Seis imagens finais WebP com 95.674 bytes no total; originais fora do caminho de carregamento. Não há vídeo novo ou biblioteca de animação. |

## Limitações e verificações posteriores

- Viewports móveis são simulações de tamanho, não execução em Safari do iPhone ou Chrome do Android. Esses navegadores e dispositivos físicos não estavam disponíveis para a validação.
- Movimento reduzido e ausência de JavaScript foram conferidos por fixtures isoladas de QA; não por mudanças nas preferências do navegador ou do Windows. As fixtures ficam em `.tools/`, ignorada pelo Git, e não devem ser publicadas.
- Não foi realizada auditoria com leitor de tela real, Lighthouse ou axe. O HTML semântico, os focos e a navegação básica foram inspecionados; isso não equivale a uma certificação completa de acessibilidade.
- Não houve limitação artificial da conexão. Foi verificado o orçamento de arquivos e o carregamento tardio das cenas. Não se deve interpretar esses números como resultado de teste em 3G, Safari ou dispositivo de baixo desempenho. Fontes, ícones e integrações legadas continuam dependentes de serviços externos.
- O servidor local não representa a configuração definitiva do GitHub Pages. Confirmar a publicação em `/portal/` depois do deploy no repositório original.
- A interface autenticada do Forponto não foi acessada; a correspondência exata entre os rótulos do exemplo e o espelho real deve ser confirmada pela equipe responsável. Nenhum novo endpoint autenticado foi criado ou presumido.
- A disponibilidade dos documentos externos legados, do curso e das lojas, bem como suas licenças, não foi auditada integralmente. As URLs originais foram mantidas.

As capturas em `design/qa/` são evidências da prévia local, não comprovantes de publicação.
