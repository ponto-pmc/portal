# Validação de acessibilidade

Foram revisados os rótulos e estados de erro, navegação por teclado, isolamento do conteúdo atrás de diálogos, foco inicial e retorno ao acionador. Verificações em DOM simulado passaram para Tab, Shift+Tab, Escape e retorno do foco. Essas verificações não equivalem à avaliação manual com navegador e leitor de tela reais, que permanece pendente.

Roteiro para avaliação manual (registrar navegador, leitor de tela, versão, resultado e problema encontrado):

- [ ] Percorrer as páginas somente com Tab e Shift+Tab: foco visível, ordem coerente e link “Ir para o conteúdo principal” funcionando.
- [ ] Acionar menus, acordeões, seleção de arquivos e botões usando Enter/Espaço; não depender de arrastar arquivos ou células.
- [ ] Abrir e fechar chat, câmera, guia, menu móvel e seletor de secretaria: anúncio do nome, foco dentro do diálogo, circulação com Tab/Shift+Tab, Escape e retorno ao acionador. Confirmar que o leitor de tela não navega pelo fundo de um diálogo modal.
- [ ] Com NVDA/Firefox ou NVDA/Chrome e VoiceOver/Safari, verificar nomes, estados expandido/recolhido, campos obrigatórios, mensagens de erro e mensagens de conclusão.
- [ ] Informar CPF inválido: erro associado e foco no campo. Digitar CPF válido, sair do campo e continuar sem clicar em “Consultar matrícula”: nenhuma consulta deve ocorrer. Ler o aviso antes de acionar a consulta opcional.
- [ ] Na calculadora, informar dias, horas, minutos ou valores inválidos: mensagem específica, campo identificado e foco no campo, inclusive quando estiver em acordeão recolhido. Corrigir e recalcular.
- [ ] No controle mensal, trocar horários com Alt + setas e conferir o anúncio da troca. Alterar mês, inclusive fevereiro, e conferir quantidade de dias, registros e resumo.
- [ ] Verificar ampliação de 200% e 400%, largura de celular, contraste, alto contraste do sistema e redução de movimento.

Pendências de conteúdo: a equipe responsável precisa fornecer os critérios e limites aprovados pelo RH, além da política oficial de conservação, acesso e exclusão dos dados do cadastro. Os arquivos disponíveis não contêm essas definições. A calculadora informa que a regra ainda depende de homologação; o aviso de CPF descreve o fluxo implementado e disponibiliza o contato responsável.
