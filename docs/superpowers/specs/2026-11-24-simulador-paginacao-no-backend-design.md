# Simulador de preço — busca, paginação e filtro por classe no back-end

**Data:** 24/11/2026 · **Spec mãe:** `2026-11-18-simulador-de-preco-design.md` ·
**Substitui:** a paginação no navegador da `2026-11-23-simulador-paginacao-design.md`.

## Por quê

A orientação do Dev é trabalhar os dados no back-end e guardar no navegador o mínimo possível.

Hoje a API devolve os ~9.811 produtos de uma vez, e a busca, a paginação e as contagens correm
na memória da aba. A partir desta spec, **cada página é uma consulta ao Oracle** que devolve
só as 100 linhas que aparecem. A página 1 traz as linhas 1 a 100, a página 2 traz as linhas
101 a 200, e assim por diante. O cache do React Query passa a guardar só páginas.

## Medição que sustenta a decisão (sp14, 24/11/2026, filial 7, região 90, todos os fornecedores)

| O quê | Resultado |
|---|---|
| Página 1 e página 50, sem busca (SQL v2 + filtro + `ORDER BY` + `OFFSET/FETCH` + `COUNT(*) OVER ()`) | **~3 s cada** (a consulta inteira de hoje leva 8,7 s) |
| Busca "VANISH", página 1 | **1,51 s**, TOTAL 32 |
| TOTAL sem busca | 9.811, igual à consulta inteira |
| Classes de venda | **A 1.102 · B 1.571 · C 7.138**. Só A, B e C, nenhuma linha sem classe |

Com esses tempos não há cache no servidor: cada página vai ao Oracle (forma A).

## Decisões do Gabriel (24/11/2026)

1. **A paginação é do back-end, por linhas do Oracle**, 100 por página.
2. **A ordem é a classe de venda, A → B → C.**
3. **A classe ganha coluna própria**, "Classe", estreita, logo depois do Produto. Ela sai da
   segunda linha da célula do produto.
4. **O filtro por classe tem quadradinhos A, B e C, que podem ser marcados juntos.** Os três
   vêm marcados por padrão, e o filtro vai ao Oracle no mesmo pedido da página.
5. **A busca, por código ou por trecho da descrição, vai ao back-end e dispara quando a pessoa
   para de digitar.**
6. **O contador "N simulados" continua**, com os códigos dos itens simulados.
7. **"Ver só os simulados" é uma opção que o comprador liga e desliga.** Ligada, a tabela
   mostra só os produtos que ele alterou, pedidos à API pelos códigos, com paginação também.

## Minhas decisões (corrigíveis)

- **Desempate da ordem: descrição, código e tributação**, depois da classe (`CLASSEVENDA NULLS
  LAST`, `DESCRICAO`, `CODPROD`, `CODIGO_TRIBUTACAO NULLS LAST`). Sem desempate, a página 2
  poderia repetir ou pular produto da página 1. As linhas que empatam em tudo são as linhas
  repetidas idênticas que o SQL já devolve, e trocar uma de lugar com a outra não muda o que
  aparece na tela.
- **A chave da linha não muda: `codProd|tributação`, e `#n` na n-ésima repetição.** Quem
  numera as repetições agora é o Oracle, com `ROW_NUMBER() OVER (PARTITION BY CODPROD,
  CODIGO_TRIBUTACAO …)`, porque uma repetição pode cair noutra página.
  - O número é calculado **antes** da busca, do filtro de classe e da paginação. Assim a mesma
    linha tem a mesma chave em qualquer página e com qualquer filtro.
  - Com a chave igual à de hoje, as simulações já salvas continuam valendo.
- **O SQL v2 continua intacto por dentro.** Só ganha camadas por fora, como a A7 já faz: a
  numeração, o filtro (busca, classes e códigos), a ordem, o `COUNT(*) OVER ()` e o
  `OFFSET/FETCH`.
- **A busca:**
  - código **exato** ou trecho da descrição, sem diferença entre maiúsculas e minúsculas,
    igual à busca de hoje;
  - espera 500 ms depois da última tecla;
  - texto vazio é "sem busca";
  - no máximo 60 caracteres, conferido na API.
- **O debounce da busca é um hook reutilizável** (aprovado pelo Gabriel em 24/11/2026):
  `hooks/useValorComAtraso.ts`, `useValorComAtraso<T>(valor: T, atrasoMs: number): T`.
  - Ele devolve o valor só depois de `atrasoMs` sem mudança, e cada mudança nova reinicia o
    relógio. São umas 15 linhas com `setTimeout`/`clearTimeout`, sem biblioteca nova.
  - O simulador o usa com 500 ms. A chave do React Query usa o valor **atrasado**, e o campo
    mostra o valor digitado na hora.
  - O debounce da busca de fornecedores do DRE (`SelecaoDeFornecedores.tsx`, 250 ms, escrito
    dentro do componente) **não é migrado agora**, para não misturar assuntos. Fica anotado como
    candidato a usar o mesmo hook depois.
  - O debounce sozinho não impede uma busca intermediária ("VAN" antes de "VANISH"). Por isso
    continua valendo o cancelamento descrito abaixo.
- **"Ver só os simulados" manda os códigos dos produtos alterados**, do rascunho e do que foi
  salvo na consulta, por um único bind de texto separado por vírgula:
  - o filtro é `INSTR(',' || :codigos || ',', ',' || CODPROD || ',') > 0`;
  - o limite é de **500 códigos**, conferido na API, para o texto caber num `VARCHAR2`;
  - com nenhum código, a opção fica desabilitada.
  - Os códigos são só filtro **por cima** do SQL, que já aplica a PCLIB do usuário. Mandar um
    código de fora não revela nada que a pessoa já não veria.
- **O contador "N simulados"** passa a contar as linhas com ajuste, no rascunho ou no salvo, da
  consulta atual, sem precisar dos produtos. Os códigos aparecem no `title` do contador.
- **O aviso "N linhas repetidas por NCM" sai da barra.** Ele contava a lista inteira. As
  repetições continuam visíveis nas linhas.
- **"Consultar" fixa o filtro** de filial, região e fornecedor e vai à página 1. Mudar a busca,
  as classes ou "só simulados" também volta à página 1.
- **"Consultado às…"** mostra a hora da última página recebida. O botão "Consultar de novo" saiu em
  24/11/2026 (Gabriel: redundante); o "Consultar" com o mesmo filtro pede a página de novo.
- **Os produtos novos continuam no topo da tabela**, como hoje. Eles são do navegador e não
  entram na contagem nem na ordem do Oracle.
- **No React Query, `useQuery` toma o lugar do `useMutation`.**
  - A chave é `["simulador-preco", base, filtro aplicado, classes, busca, códigos, página]`.
  - A consulta só roda depois do primeiro Consultar.
  - Enquanto a próxima página carrega, a anterior continua na tela (`placeholderData`).
  - Páginas fora de uso saem do cache em 60 s (`gcTime`).
- **Cancelamento.** Uma busca nova cancela a anterior: o `signal` do React Query chega à API, e
  a API repassa o `CancellationToken` ao comando no Oracle.
  - Hoje o `apiClient` e o proxy do BFF **não** repassam o cancelamento. Faz parte do trabalho
    acrescentar isso, sem biblioteca nova.
- **O contrato da API.**
  - O `POST /api/simulador-preco/consulta` passa a receber `pagina`, `busca`, `classes` e
    `codigos`, além dos filtros de hoje.
  - Ele devolve a página com `PagedResult<ProdutoSimuladoDto>` (`Itens`, `Pagina`,
    `TamanhoPagina`, `TotalItens`) e a `Base`.
  - O tamanho da página é **fixo em 100 no servidor**, e a tela não escolhe.
  - A API recusa com 400: página < 1; classe fora de A, B e C; nenhuma classe marcada; busca
    acima de 60 caracteres; mais de 500 códigos.
- **O tempo limite do comando** cai de 300 s (provisório) para **60 s**. A medição deu ~3 s.

### Casos de borda (do revisor de construção, 24/11/2026; decisões minhas)

- **Produtos novos diante dos filtros.**
  - Eles obedecem à busca por descrição, aplicada no navegador porque são do navegador.
  - O filtro de classe não os esconde, já que não têm classe.
  - Com "só simulados" ligado, continuam aparecendo, porque também são simulação.
  - Não entram no "N simulados": têm o contador próprio no título do grupo.
- **"Só simulados" com mais de 500 produtos alterados:** a opção fica desabilitada, com o aviso
  "Mais de 500 produtos simulados: use a busca".
- **"Só simulados" com um ajuste de produto que o Oracle já não devolve** (o cadastro mudou ou a
  PCLIB tirou o acesso): o produto simplesmente não vem. O contador conta os ajustes, então pode
  dizer "5 simulados" e a lista mostrar 4. A diferença é aceitável e não é erro.
- **Numeração das repetições (`#n`).**
  - Dentro da partição, o `ROW_NUMBER` ordena pelas mesmas colunas do desempate e, depois, por
    todas as colunas de valor.
  - A sp14 mostrou que as repetições de mesma chave são **idênticas em todas as colunas**. Para
    elas, trocar o `#1` com o `#2` não muda nada na tela nem no recálculo.
  - **Risco remanescente:** uma repetição de mesma chave com valores diferentes poderia ter o
    `#n` trocado em relação à numeração antiga. Não foi visto na medição.
- **Classes.**
  - Com os três quadradinhos marcados, **não vai filtro de classe ao Oracle**. Assim uma linha
    sem classe, ou de outra letra, em outra base (Minas Rural ainda não medido) não some do
    total.
  - Se aparecer outra classe, entra um quadradinho novo depois de medir.
- **Ao trocar o filtro (Consultar com outra filial, região ou fornecedor),** a tela mostra
  "Consultando…" em vez da página antiga.
  - O `placeholderData` vale só dentro da mesma consulta: troca de página, busca, classes e
    "só simulados".
- **Curingas na busca.** `%` e `_` digitados valem como texto, e não como curinga (`LIKE …
  ESCAPE`), como na busca de hoje.

## O que sai

- A busca, a paginação e o `paginar` no navegador. O `lib/paginacao.ts` e o `sp10` saem ou se
  reduzem ao que ainda for usado.
- O `useMutation` da consulta inteira.

## Fora do escopo

- Cache no servidor.
- Ordenar clicando na coluna.
- Exportação.
- A conferência de filial contra o token (pendência de segurança à parte).
- A orientação de localStorage do Dev.

## Verificação

- **`sp5`:** a SQL da API continua contendo o SQL v2 idêntico.
- **Novo script `sp15`:**
  - a camada de fora, com a ordem, o `ROW_NUMBER` antes dos filtros, o `OFFSET` da página e
    os filtros;
  - a ordem dos binds;
  - as recusas do contrato.
- **`sp8` parte 2 (recálculo contra o SQL)** volta a rodar sobre algumas páginas reais.
- **Na tela:**
  - página 1 e 2 sem repetir produto;
  - busca "VANISH" com 32 linhas;
  - filtro só A com 1.102;
  - "Ver só os simulados";
  - simulação salva antes desta mudança ainda aparece;
  - sessionStorage e localStorage sem a lista de produtos.
