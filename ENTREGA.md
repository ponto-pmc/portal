# Portal do Ponto Eletrônico — nova página inicial

Implementado nos arquivos fornecidos, sem etapa de build nem dependências novas no navegador. Não publicado no GitHub Pages: os arquivos estão prontos para revisão e publicação no repositório original.

## Visualizar

Na pasta do projeto, execute `node preview.cjs` e abra http://127.0.0.1:4173/portal/. No PowerShell com restrições de resolução de caminhos do Node, use `Get-Content preview.cjs -Raw | node`. Encerre com Ctrl+C. Também é possível usar qualquer servidor estático; para validar a publicação, teste com o prefixo `/portal/`.

## Experiência contínua e materiais integrados

A revisão atual usa uma única composição fixa para a abertura e as três etapas: o mesmo terminal continua em cena enquanto textos HTML se alternam suavemente. O progresso acompanha a rolagem nativa com amortecimento de 95 ms, sem interceptar a roda do mouse ou os gestos de toque. O fundo da composição é branco; cabeçalho e conteúdo ocupam a largura disponível com margens fluidas. Foram removidos os avisos visuais solicitados. As etapas têm navegação direta por âncora.

As cinco imagens do antigo carrossel também seguem a rolagem, com imagem e texto sincronizados, avanço e retorno e controles de acesso direto. O temporizador legado foi desativado nesta home. O novo arquivo home-highlights.js controla essa sequência; script.js recebeu somente as proteções para impedir o autoplay nesse bloco. URLs, documentos e o acesso ao aplicativo foram preservados. Sem JavaScript ou com movimento reduzido, os materiais ficam disponíveis em uma lista estática.

No HTML, os painéis inativos da composição são retirados da navegação por teclado durante a animação, enquanto os controles das etapas permanecem acessíveis. O conteúdo completo volta ao fluxo normal nas versões estáticas.

Os registros anteriores abaixo descrevem a implementação inicial e a revisão móvel; as informações desta seção prevalecem sobre a descrição antiga da fixação isolada do terminal e do carrossel automático.

## Arquivos alterados e criados

- Alterados também: `script.js` (bloqueio do autoplay apenas neste bloco), `design/export-scenes.cjs` e as três cenas estáticas com fundo branco. Criado: `home-highlights.js`.
- Alterado: `index.html`, com nova abertura, demonstração e orientações; atalhos reais nas lojas de aplicativos; carregamento diferido dos scripts existentes.
- Criados: `home.css`, `home-static.css` e `home.js`, exclusivos da página inicial.
- Criados: `assets/home/terminal.webp`, `terminal-mobile.webp`, `retrato-ficticio.webp`, `cena-cadastro.webp`, `cena-registro.webp` e `cena-frequencia.webp`.
- Criados: `preview.cjs`, esta documentação, `design/ATIVOS.md`, `design/TESTES.md`, `design/export-scenes.cjs` e os dois originais em `design/source/`.
- `.gitignore` exclui ferramentas temporárias em `.tools/`; elas não são necessárias para publicar ou executar o portal.

Mantidos: menu e seus destinos, temas, navegação móvel, carrossel, comunicado de atualização, documentos, aplicativo, instalação PWA, suporte, painel Power BI, chat, VLibras, rodapé e os arquivos das demais páginas. A antiga faixa animada do brasão e o ticker foram substituídos na home pela demonstração. Seus arquivos permanecem no projeto. Formulários e autenticação não foram alterados.

## Destinos e integração

| Ação | Destino | Confirmação |
| --- | --- | --- |
| Enviar foto e orientações | `foto.html` → `https://ponto-pmc.github.io/portal/foto.html` | Arquivo local e página pública conferidos no navegador |
| Acessar o ponto | `https://forponto.contagem.mg.gov.br/ForpontoWeb/login.aspx` | Tela pública de login conferida no navegador |
| Consultar frequência | Mesmo login do Forponto | Destino já usado pelo cartão “Consultar Ponto” e pela busca do projeto; área autenticada não inspecionada |
| Ajuda do servidor | `faq.html#usuario` | Arquivo e roteamento por hash em `faq.js` conferidos |
| Materiais para gestores | `faq.html#gestor` | Arquivo e roteamento por hash em `faq.js` conferidos |
| Orientações na home | `#orientacoes` | Âncora local existente na nova home |

Não foi inventada uma rota de consulta separada: a home informa que a frequência fica no Forponto. A existência e a disponibilidade das opções após autenticação dependem do perfil do servidor e não foram validadas com credenciais. A nomenclatura “espelho de ponto” e as colunas do cartão são uma representação explicativa, não uma reprodução da interface autenticada; validar a correspondência com a versão e o perfil usados pela Prefeitura antes da publicação.

Os links legados de Drive, capacitação, lojas, contatos e Power BI foram preservados. O painel Power BI e o vídeo de atualização abriram durante a revisão. Os demais documentos externos, as lojas e o curso não foram integralmente revalidados. Nenhum novo endereço de serviço ficou com `href="#"` ou destino fictício.

## Editar e integrar

- Textos e destinos: seções `home-intro`, `home-step` e `home-orientations` em `index.html`. Os textos operacionais e as ações são HTML.
- Paleta e fontes: `home.css` reutiliza `--text-primary`, `--text-secondary`, `--accent`, `--bg`, `--border` e as famílias originais de `tokens.css`. O azul é novamente `#2d7de0` no tema claro; DM Sans e DM Mono mantêm os pesos e padrões originais. Cabeçalho e botões voltaram aos estilos do portal.
- Terminal: imagem única em `.terminal-image`; o visor HTML é posicionado por `.terminal-screen`. Se trocar o equipamento, ajustar as porcentagens do visor para o novo render.
- Animação: limites dos trechos em `render()` de `home.js`. A rolagem nativa gera um estado absoluto; não há reprodução acumulativa nem interpolação dependente da direção.
- Horário: um único `.time-travel` se desloca até o centro medido de `.destination`. O valor estático só aparece na chegada. Coordenadas são recalculadas em resize, carregamento de fontes, páginas restauradas e mudança de preferência.
- Foto: a mesma `.photo-travel` diminui, recebe recorte e se acomoda dentro da área do visor. Os cantos seguem o enquadramento.
- Fixação: somente `.visual-sticky` usa `position: sticky`; é liberada antes das orientações. O terminal se mantém entre as etapas e muda discretamente de posição ao abrir espaço para o espelho.
- Celular e telas baixas: a mesma sequência animada responde à rolagem nativa, para frente e para trás. Um único terminal fica em `position: sticky` acima dos textos durante as três etapas; a altura do cabeçalho e do painel é medida para preservar a leitura. O ritmo é vinculado às posições reais de cada seção. Movimento reduzido e falha de mídia: cenas estáticas por etapa. Sem JavaScript, `home-static.css` mantém o menu disponível. O mecanismo animado só oculta as cenas quando ativado.
- Camadas da demonstração são decorativas para leitores de tela. A explicação equivalente, os links e a indicação de dados fictícios permanecem em HTML.
- Os arquivos usados pela home têm caminhos relativos. Não é necessário mudar o service worker: o existente busca HTML, CSS e JavaScript pela rede e mantém a política de cache e o escopo originais.

## Recursos e desempenho

A abordagem das três cenas combina um render original recortado com HTML/CSS. Não há vídeo, sequência pesada ou biblioteca de animação. O render principal tem 41.372 bytes, a alternativa móvel 15.768 bytes e o retrato 5.866 bytes. As seis imagens web somam 93.008 bytes. As cenas estáticas usam lazy loading; a imagem do terminal tem prioridade alta e `srcset`. Originais de produção em `design/source/` não são solicitados pelo site.

Origem, condições de uso e prompts estão em `design/ATIVOS.md`. A matriz de testes e as limitações estão em `design/TESTES.md`.
