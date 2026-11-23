# Recursos visuais e procedência

Produzidos em 23/11/2026. Modo utilizado: ferramenta integrada `image_gen`, sem CLI ou chave de API. Nenhuma imagem de banco ou modelo de fabricante foi incorporado.

| Arquivo | Finalidade | Origem e autoria | Uso / licença |
| --- | --- | --- | --- |
| `assets/home/terminal.webp` | Equipamento persistente, fundo transparente, 814 × 1086 | Render original gerado para este projeto com `image_gen` | Saída gerada, uso conforme termos aplicáveis da OpenAI; sem exigência de crédito de banco |
| `assets/home/terminal-mobile.webp` | Alternativa de 430 px | Derivada do mesmo render, preservando transparência | Mesmas condições do original |
| `assets/home/retrato-ficticio.webp` | Foto demonstrativa de 240 × 300 | Pessoa adulta fictícia gerada com `image_gen` | Saída gerada; sem uso de dados ou retrato de servidor real |
| `assets/home/cena-cadastro.webp` | Quadro estático da foto no visor | Composição original do render, retrato e enquadramento | Mesmas condições das imagens geradas; composição própria |
| `assets/home/cena-registro.webp` | Quadro estático com horário fictício 08:00 | Composição original do mesmo terminal e interface ilustrativa | Composição própria; não comprova registro real |
| `assets/home/cena-frequencia.webp` | Quadro estático do espelho | Mesmo terminal e cartão original | Composição própria, dados fictícios |
| `design/source/terminal-original.png` | Mestre de produção | Saída original da ferramenta integrada | Mesmas condições do render |
| `design/source/retrato-original.png` | Mestre de produção | Saída original da ferramenta integrada | Mesmas condições do retrato |
| `assets/logo-prefeitura-contagem.png` | Identidade institucional no cabeçalho e rodapé | Arquivo oficial já fornecido no projeto, Prefeitura de Contagem | Uso institucional preexistente; licença de redistribuição não acompanhava o projeto |

O equipamento não contém marca de fabricante. O retrato não representa uma pessoa identificada. Horário e informações do espelho são fictícios. Sombras e anéis da composição animada são CSS; relógio, confirmação e cartão são HTML. Não existem instruções operacionais embutidas nas imagens. Os campos do espelho estático são exemplos explicativos; os textos completos ficam em HTML.

Tipografia DM Sans e recursos Font Awesome, Google Fonts, VLibras e imagens externas do conteúdo legado já eram utilizados no portal. Não foram adicionadas novas bibliotecas ou fontes externas. As licenças e a autorização dos materiais legados não foram fornecidas; devem ser mantidas e verificadas pelo responsável pelo conteúdo institucional. As origens continuam explícitas nos links e atributos `src` do HTML e em `tokens.css`.

## Prompts finais

Terminal: “Use case: product-mockup. Create one isolated realistic product render for a Brazilian municipal attendance portal. A generic wall mounted facial recognition time clock terminal, matte graphite rectangular body with softly rounded corners, vertical portrait orientation, front view with only a very subtle three-quarter perspective (right side visible, front screen nearly rectangular). Small camera lens centered above a large clean completely blank black rectangular screen. A small horizontal muted green light under the screen. No stand, no buttons, no logos, no words, no numbers, no brands, no background or floor. Soft studio light from upper left. Device centered with generous transparent margins. High detail, beautiful industrial product photography. Genuine transparent background. Single object only. Screen must be flat and blank for HTML UI overlay.”

Retrato: “Use case: photorealistic-natural. A small illustrative ID photo for a fictional employee in a public service attendance terminal demonstration. A wholly fictional adult Brazilian woman aged around 35 with medium brown skin, dark brown straight shoulder length hair tucked behind ears, neutral calm expression, looking straight at camera, head and upper shoulders centered, plain pale cool grey background, even diffuse natural lighting, simple navy shirt, no jewelry. Front facing passport style portrait, fully visible head with margin, natural realistic features. One fictional person, no text, no borders, no watermarks. Portrait 4:5 composition.”

## Reproduzir as cenas estáticas

Os arquivos finais já estão incluídos e não exigem ferramentas de produção no servidor. Para reconstruir as composições, use Node 20.9 ou superior com `sharp` instalado e execute `node design/export-scenes.cjs` a partir da raiz. Sharp é uma ferramenta de produção, não uma dependência carregada pelo portal. A transparência do terminal é preservada na otimização.
