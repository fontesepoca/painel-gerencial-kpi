# Simulador de preço: paginação e produtos novos na mesma tabela (spec curta)

**Data:** 23/11/2026 · **Branch:** `feat/simula-preco` · **Pedido:** Gabriel · **Tamanho:** mudança pequena

**Base:** [spec do simulador](2026-11-18-simulador-de-preco-design.md) e
[alinhamento visual](2026-11-23-simulador-alinhamento-visual-design.md).

## Intenção e o porquê

A tela fica lenta com a filial inteira e sem filtro de fornecedor (9.788 linhas na filial 7,
região 90). **Qualquer** mudança de estado demora: abrir o quadro, fechar, confirmar.

**A causa foi medida em 23/11/2026**, injetando na própria página uma tabela de 9.788 × 18:

| Situação | Custo |
|---|---|
| Mudar o texto de uma célula | 263 a 318 ms |
| O `<dialog>` deixando a página inerte e devolvendo | ~460 ms |

O custo é o mesmo com o estilo de antes e com o de hoje, e também com `table-layout: fixed`.
**A causa é o tamanho:** ~176 mil células na página ao mesmo tempo, mais o React percorrendo
9.788 linhas a cada mudança. Estilo nenhum resolve. Só resolve ter menos linhas na página.

Além disso, as colunas da seção "Produtos novos simulados" não ficam alinhadas com as da tabela
principal. Ela é uma **segunda tabela**, e cada tabela calcula a largura das colunas pelo próprio
conteúdo.

## Objetivos

1. **Paginação: 100 produtos por página**, com controles "anterior / próxima" e "página N de M"
   logo acima da tabela, junto da barra de ações.
2. **A busca procura nos 9.788** e pagina o resultado. Mudar o texto da busca volta à página 1.
3. **A contagem de produtos e de simulados, e o "Desfazer todas", valem para a consulta inteira**,
   não só para a página. A simulação de um produto fora da página continua guardada (D22).
4. **Os produtos novos entram na MESMA tabela**, como um grupo de linhas no topo, aberto por uma
   linha de título "Produtos novos simulados (N)". Com isso:
   - as colunas batem por construção;
   - os produtos novos aparecem em toda página;
   - a seção separada e a prop `compacta` saem.
5. **Enter no preço** continua indo ao preço da linha de baixo **dentro da página**. Na última
   linha da página, ele fica onde está.

6. **A última consulta fica guardada no sessionStorage, comprimida** (decisão do Gabriel em
   23/11/2026). Depois de um F5, a tabela volta na hora, sem os ~9 s da consulta, e some ao
   fechar a aba.
   - **Por que comprimida.** Medido com a filial 7, região 90:
     - como vem da API: **6,0 milhões** de caracteres, acima do teto do sessionStorage (~5
       milhões), e o navegador recusaria;
     - em colunas: 2,0 milhões;
     - **comprimida: 0,57 milhão**, com folga de ~9×.
   - **Como comprime.** Com o `CompressionStream("gzip")`, que já vem no navegador e no Node:
     **nenhuma biblioteca nova**. O resultado vira texto em base64 para caber numa string.
   - **O que se guarda:** **só a última consulta**, com o filtro, a hora em que foi feita, a
     base e as linhas. Consultar de novo substitui. Isso mantém o tamanho preso a uma consulta.
   - **A chave:** `epoca:simulador-preco:consulta:v1:<base>:<matrícula>`, em `chavesPorBase`.
     Outra pessoa que entrar na mesma aba não vê a consulta anterior.
   - **Ao abrir a tela**, se houver consulta guardada **da mesma base da sessão**, ela volta: os
     filtros, a tabela e a simulação (que já vinha do localStorage). Base diferente é ignorada,
     pela mesma barreira de `exigirMesmaBase`.
   - **O dado envelhece, e a tela diz isso:** "Consultado às 14:32 · Consultar de novo", ao lado
     da contagem de produtos. Sem esse aviso, alguém simularia sobre o custo da manhã achando que
     é o de agora.
   - **Falha silenciosa e segura.** Cota cheia, aba anônima ou navegador sem
     `CompressionStream`: a tela funciona igual, só não guarda. Toda leitura e escrita vai em
     `try/catch`, e um texto guardado corrompido é descartado.

## Não-objetivos

- **Rolagem virtual.** Descartada pelo Gabriel em 23/11/2026: é complexa sem biblioteca, e
  biblioteca nova precisa de aprovação.
- **Ordenação de colunas**, mudar o tamanho da página e a impressão.
- **Mudar cálculo, consulta ou simulação guardada.**
- **Apagar ao "Sair" o que está guardado no navegador** (o localStorage das simulações e o
  sessionStorage da consulta). O Gabriel decidiu ver isso depois (23/11/2026). Fica registrado
  como pendência de segurança: até lá, as simulações ficam no computador indefinidamente, e a
  consulta fica até a aba fechar.

## Antiobjetivos

- **Perder a simulação ao trocar de página ou buscar.** Ela mora no armazenamento por chave de
  linha, e não na página.
- **Qualquer número mudar** (`sp8` 137.072/137.072).

## Caminhos considerados

| # | Caminho | Troca | Decisão |
|---|---|---|---|
| 1 | **Paginação** | Simples e previsível, o mesmo desenho do detalhamento do DRE. A pessoa troca de página para percorrer. | **Escolhido pelo Gabriel em 23/11/2026** |
| 2 | Rolagem virtual | Sensação de uma tabela única, mas complexa com altura variável e coluna fixa, e sem biblioteca | descartado |
| 3 | Exigir filtro antes de mostrar | O mais simples, mas impede olhar a filial inteira | descartado |

## Decisões de quem constrói (minhas, a conferir)

- **Tamanho da página: 100.** Pelo custo medido (~0,3 s com 9.788 linhas, proporcional ao número
  de células), 100 linhas custam na ordem de milissegundos, e ainda é uma página que se percorre
  rolando.
- **A paginação mora num módulo puro**, `lib/paginacao.ts`, com `paginar(lista, pagina,
  tamanho)` e o total de páginas, testado no Node, como as outras validações de `lib/`.
- **Os controles ficam desligados nas pontas** (anterior na página 1, próxima na última). Uma
  consulta nova volta à página 1.
- **A linha de título dos produtos novos** usa a faixa de grupo da tabela (fundo `--surface-2`),
  ocupa todas as colunas, e a célula fixa leva o texto. Os produtos novos não entram na contagem
  de páginas.

## Verificação

- Teste de `lib/paginacao.ts` (`sp10`), no Node:
  - fatia certa;
  - última página parcial;
  - página fora do intervalo, presa ao limite;
  - lista vazia, que dá 1 página e 0 itens.
- Teste da compressão (`sp11`), no Node, com o JSON real da `sp6`:
  - comprimir e descomprimir devolve exatamente a mesma consulta;
  - o texto comprimido fica abaixo de 5 milhões de caracteres;
  - um texto corrompido dá "nada guardado", e não um erro.
- `tsc`, `eslint` e a `sp8` igual.
- **Na tela, com login:**
  - abrir e fechar o quadro e confirmar devem ficar rápidos sem filtro de fornecedor;
  - as colunas dos produtos novos devem ficar alinhadas;
  - a busca deve achar um produto de outra página;
  - uma simulação deve sobreviver à troca de página;
  - depois de um F5, a tabela deve voltar na hora, com "Consultado às …".
