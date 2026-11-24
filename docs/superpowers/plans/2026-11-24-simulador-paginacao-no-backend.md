# Simulador — busca, paginação e classe no back-end — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada página do simulador passa a ser uma consulta ao Oracle (100 linhas, ordem A → B →
C), com busca, filtro de classe e "ver só os simulados" no mesmo pedido; o navegador guarda só a
página.

**Architecture:** O SQL v2 (`SimuladorPrecoQueries.Consulta`) fica intacto e ganha uma constante
nova, `ConsultaPaginada`, que o envolve com a numeração das repetições, os filtros, a ordem, o
total e o `OFFSET/FETCH`. A API devolve `PagedResult`. O front troca o `useMutation` por um
`useQuery` por página, com debounce na busca e cancelamento até o Oracle.

**Tech Stack:** .NET 10 + Dapper + ODP.NET (binds posicionais); Next.js 16, React 19, React Query
v5. Nenhuma biblioteca nova.

**Spec:** `docs/superpowers/specs/2026-11-24-simulador-paginacao-no-backend-design.md`

## Global Constraints

- **Nenhum commit nem push pelo agente.** Onde o modelo diz "Commit", deixar no working tree.
- **O agente nunca conecta no Oracle nem roda script que conecte.** Os scripts com banco ou
  API autenticada (sp6, sp14) são rodados pelo Gabriel; os offline (sp5, sp8 parte 1, sp13,
  sp15, sp17) o agente roda.
- **O SQL v2 não é editado.** A constante `Consulta` fica como está, e o `sp5` continua passando.
- **Binds posicionais:** cada ocorrência de `:nome` é um `Add`, na ordem do texto.
- **Alias das colunas novas em MAIÚSCULAS e sem sublinhado** (`OCORRENCIA`, `TOTALITENS`).
- **Valores da spec:**
  - página de 100 linhas, fixa no servidor;
  - busca de até 60 caracteres, com 500 ms de debounce;
  - até 500 códigos;
  - classes A, B e C;
  - `gcTime` de 60 s;
  - tempo limite do comando de 60 s.
- Ordem: `CLASSEVENDA NULLS LAST, DESCRICAO, CODPROD, CODIGOTRIBUTACAO NULLS LAST, OCORRENCIA`.
- Comandos offline (raiz do repositório):
  - `ALIAS=./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs`
  - `node --experimental-strip-types --import $ALIAS docs/rotinas/simulador-preco/validacao/spNN_*.mjs`

## Review Focus

1. **Busca com `%`, `_`, `\` ou apóstrofo**, por exemplo "50%": é texto literal, e não curinga
   nem erro. Fica no sp15 (o escape é feito no C#, e o texto da query usa `ESCAPE '\'`) e no
   sp6, com uma busca que contém `%`.
2. **Simulação salva antes desta mudança** (chave `49555|1` e `48020|1#1`) tem de achar a mesma
   linha. Fica no sp17: `chaveDaLinha` com ocorrência 1 dá a chave sem `#`, e com ocorrência 2
   dá `#1`.
3. **"VAN" seguido de "VANISH"**: a resposta de "VAN" não pode aparecer depois da de "VANISH",
   e o pedido de "VAN" deve ser cancelado. Conferência no navegador (aba Rede: pedido
   cancelado), na Task 6.
4. **A página fica além do total** (estava na página 7 e um "Consultar de novo" passou a trazer
   menos linhas): a tela vai à última página que existe, e não mostra uma tabela vazia. Fica na
   Task 5, com conferência na tela.
5. **Trocar filial ou região enquanto a página carrega:** a tabela da consulta antiga não pode
   aparecer como se fosse da nova. Fica na Task 5, com `placeholderData` só dentro da mesma
   consulta, e conferência na tela.

---

### Task 1: SQL paginado + conferência da ordem dos binds (sp15)

**Files:**
- Modify: `api-new-kpi/Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs` (nova
  constante `ConsultaPaginada`, depois de `Consulta`)
- Create: `docs/rotinas/simulador-preco/validacao/sp15_consulta_paginada.mjs` (offline, lê os `.cs`)

**Interfaces:**
- Produces:
  - `SimuladorPrecoQueries.ConsultaPaginada` (`const string`), que interpola `{{Consulta}}`.
  - Os binds depois dos 28 de hoje, nesta ordem: `:buscaNula`, `:buscaCodigo`, `:buscaLike`,
    `:classesNula`, `:classes`, `:codigosNulo`, `:codigos`, `:inicio`, `:tamanho`.
  - Colunas novas: `OCORRENCIA` (inteiro, de 1 em diante) e `TOTALITENS`.

- [ ] **Step 1: Escrever o sp15, com estas conferências sobre o texto de `ConsultaPaginada`:**
  - contém `{{Consulta}}` (ou o texto de `Consulta`), e o `sp5` continua sendo o juiz do miolo;
  - o `ROW_NUMBER() OVER (PARTITION BY` aparece **antes** do primeiro `:buscaNula` (a numeração
    vem antes dos filtros);
  - `COUNT(*) OVER ()` aparece **depois** dos filtros (o total é do conjunto filtrado);
  - o `ORDER BY` final é exatamente o da Global Constraints;
  - contém `ESCAPE '\'`;
  - termina em `OFFSET :inicio ROWS FETCH NEXT :tamanho ROWS ONLY`;
  - **ordem dos binds:** a sequência de `:nome` no texto (o de `Consulta` mais o paginado) é
    igual à sequência de `parametros.Add("nome"` dentro de `ConsultarPaginaAsync` no
    `SimuladorPrecoRepository.cs`.
    - Isto fecha o minor adiado "a ordem dos binds não é conferida por script".
  - Saída: `sp15: N conferências, F falhas`, com exit 1 quando houver falha.
- [ ] **Step 2: Rodar o sp15.** Expected: FALHA, porque `ConsultaPaginada` não existe.
- [ ] **Step 3: Escrever `ConsultaPaginada`.**
  - Camadas, de dentro para fora:
    1. `C` = `Consulta` mais `ROW_NUMBER() OVER (PARTITION BY CODPROD, CODIGOTRIBUTACAO ORDER BY
       DESCRICAO, VLULTPCOMPRA, VLST, PRFINAL) AS OCORRENCIA`;
    2. o `WHERE` com os três filtros (`:buscaNula IS NULL OR TO_CHAR(CODPROD) = :buscaCodigo OR
       UPPER(DESCRICAO) LIKE :buscaLike ESCAPE '\'`, e o `INSTR` das classes e dos códigos,
       como na spec) e `COUNT(*) OVER () AS TOTALITENS`;
    3. o `ORDER BY` com o `OFFSET/FETCH`.
  - O comentário cita a spec e lista a ordem dos binds.
- [ ] **Step 4: Rodar o sp15 e o sp5.** Expected: o sp15 continua FALHANDO só na conferência da
  ordem dos binds, porque o repositório é da Task 2. O sp5 passa.

### Task 2: Repositório, serviço, DTOs e controller paginados

**Files:**
- Modify: `api-new-kpi/Domain/Entities/ProdutoSimulado.cs` (+ `int Ocorrencia`, + `int TotalItens`)
- Modify: `api-new-kpi/Domain/Interfaces/ISimuladorPrecoRepository.cs`,
  `Infrastructure/Persistence/Repositories/SimuladorPrecoRepository.cs`
- Modify: `Application/Features/SimuladorPreco/Dtos/SimuladorPrecoDtos.cs`,
  `SimuladorPrecoService.cs`, `Controllers/SimuladorPrecoController.cs`

**Interfaces:**
- Consumes: `ConsultaPaginada` e a ordem dos binds (Task 1).
- Produces:
  - `SimuladorPrecoFiltroDto(string CodFilial, int NumRegiao, decimal? CodFornec, int Pagina =
    1, string? Busca = null, IReadOnlyList<string>? Classes = null, IReadOnlyList<string>?
    Codigos = null)`
  - `ProdutoSimuladoDto` ganha `int Ocorrencia`, como último campo.
  - `ConsultaSimuladorDto(PagedResult<ProdutoSimuladoDto> Pagina, BaseDto? Base = null)`, com o
    mesmo `with { Base = … }` de hoje.
  - JSON: `{ pagina: { itens, pagina, tamanhoPagina, totalItens, totalPaginas, temAnterior,
    temProxima }, base }`.
  - `ISimuladorPrecoRepository.ConsultarPaginaAsync(string codFilial, int numRegiao, decimal?
    codFornec, int matricula, int pagina, string? busca, IReadOnlyList<string>? classes,
    IReadOnlyList<string>? codigos, CancellationToken ct) → Task<(IReadOnlyList<ProdutoSimulado>
    Itens, int Total)>`. Ele substitui o `ConsultarAsync`.
  - Constante `SimuladorPrecoService.TamanhoDaPagina = 100`.

- [ ] **Step 1: Repositório.**
  - Os mesmos 28 `Add` de hoje, depois os nove novos, na ordem da Task 1.
  - **Busca:**
    - `buscaNula` = a busca aparada, ou `null` se vazia;
    - `buscaCodigo` = a busca aparada;
    - `buscaLike` = `"%" + Escapar(busca.ToUpperInvariant()) + "%"`, em que `Escapar` troca `\`
      por `\\`, `%` por `\%` e `_` por `\_`.
  - **Classes e códigos:**
    - `classesNula`/`classes` = `null` quando a lista é nula; senão, `string.Join(",", …)`;
    - `codigosNulo`/`codigos` seguem a mesma regra.
  - **Paginação:** `inicio` = `(pagina - 1) * 100`, e `tamanho` = 100.
  - `TempoLimiteSegundos` passa a **60**, e o comentário cita a medição sp14 (~3 s).
  - O total vem da primeira linha (`TotalItens`); sem linhas, é 0.
- [ ] **Step 2: Serviço.**
  - Mantém as validações de hoje e acrescenta estas, cada uma com `Result.Invalido` e a frase
    entre aspas:
    - `Pagina < 1` → "Página inválida.";
    - `Classes` vazia → "Marque ao menos uma classe.";
    - classe fora de {A, B, C} → "Classe inválida.";
    - busca acima de 60 caracteres depois do `Trim` → "Busca muito longa (máximo 60 caracteres).";
    - `Codigos` com mais de 500 → "Mais de 500 produtos simulados: use a busca.";
    - código que não é só dígitos → "Código de produto inválido.".
  - **Classes com A, B e C juntas** → vão ao repositório como `null` (sem filtro), como na spec.
  - Monta o `PagedResult` com `TamanhoPagina = 100`.
- [ ] **Step 3: Controller.** A mesma rota, a mesma permissão e a mesma matrícula do token. O
  `CancellationToken` da action continua indo ao serviço.
- [ ] **Step 4: Verificar.**
  - `dotnet build api-new-kpi` passa sem erro.
  - O sp15 passa por inteiro.
  - O sp5 passa.

### Task 3: Front — tipos, chave da linha, códigos e classes (sp17)

**Files:**
- Modify: `client-new-kpi/types/simulador-preco.ts`
- Modify: `client-new-kpi/components/simulador-preco/TabelaSimulador.tsx` (só `chaveDaLinha`)
- Create: `client-new-kpi/lib/filtroSimulador.ts`
- Test: `docs/rotinas/simulador-preco/validacao/sp17_filtro_e_chave.mjs`

**Interfaces:**
- Produces:
  - `ProdutoSimulado.ocorrencia: number`
  - `type Classe = "A" | "B" | "C"`
  - `interface PedidoDePagina { codFilial: string; numRegiao: number; codFornec: number | null;
    pagina: number; busca: string | null; classes: Classe[] | null; codigos: string[] | null }`
  - `interface PaginaSimulador { itens: ProdutoSimulado[]; pagina: number; tamanhoPagina:
    number; totalItens: number; totalPaginas: number }`
  - `interface ConsultaSimulador { pagina: PaginaSimulador; base?: … }`, no lugar do formato de
    hoje.
  - `chaveDaLinha(p)` = `${codProd}|${codigoTributacao ?? "-"}` e, quando `ocorrencia > 1`, o
    sufixo `#${ocorrencia - 1}`.
  - `codigosSimulados(ajustes: Record<string, AjusteDaLinha>): string[]` devolve os códigos
    únicos, tirados do trecho antes do `|`, em ordem numérica.
  - `classesParaApi(marcadas: readonly Classe[]): Classe[] | null` dá `null` quando são as três.
  - `LIMITE_DE_CODIGOS = 500`
  - `ATRASO_DA_BUSCA_MS = 500`

- [ ] **Step 1: sp17.**
  - `chaveDaLinha`:
    - `{codProd:49555, codigoTributacao:"1", ocorrencia:1}` → `"49555|1"`;
    - ocorrência 2 → `"49555|1#1"`;
    - ocorrência 3 → `"49555|1#2"`;
    - tributação nula → `"49555|-"`.
  - `codigosSimulados`:
    - `{"49555|1":…, "49555|1#1":…, "100|-":…}` → `["100","49555"]`;
    - `{}` → `[]`.
  - `classesParaApi`:
    - `["A","B","C"]` → `null`;
    - `["C","A"]` → `["A","C"]` (em ordem);
    - `["B"]` → `["B"]`.
- [ ] **Step 2: Rodar o sp17.** Expected: FALHA, porque `lib/filtroSimulador.ts` não existe.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar o sp17 e o sp13.** Expected: os dois passam.

### Task 4: Debounce, cancelamento e o hook da página

**Files:**
- Create: `client-new-kpi/hooks/useValorComAtraso.ts`. Assinatura
  `useValorComAtraso<T>(valor: T, atrasoMs: number): T`, com `setTimeout`/`clearTimeout` num
  `useEffect`.
- Modify: `client-new-kpi/services/apiClient.ts`. Se o `fetch` falhar porque o `signal` foi
  abortado, **relançar** o erro de abort. Hoje ele vira um `ApiError("Não foi possível conectar…")`.
- Modify: `client-new-kpi/app/api/[...caminho]/route.ts`. Quando o `request.signal` do pedido
  que chega abortar, destruir o pedido `node:http` para a API. A API recebe o abort pelo
  `RequestAborted`, e o Dapper cancela o comando.
- Modify: `client-new-kpi/hooks/useSimuladorPreco.ts`. `useConsultaSimulador` (mutation) sai, e
  entra `usePaginaSimulador(pedido: PedidoDePagina | null)`.

**Interfaces:**
- Produces: `usePaginaSimulador(pedido)` devolve o `UseQueryResult<ConsultaSimulador>`.
  - Chave: `["simulador-preco", baseId, pedido]`.
  - `enabled: pedido !== null`.
  - `queryFn` com `signal`, passado pelo `exigirMesmaBase`.
  - `gcTime: 60_000`.
  - `placeholderData: (anterior, consultaAnterior) =>` devolve a página anterior **só se** a
    chave anterior tiver os mesmos `codFilial`, `numRegiao` e `codFornec`.

- [ ] **Step 1: Escrever os três arquivos e o hook.**
- [ ] **Step 2: Rodar `npx tsc --noEmit` e `npx eslint` sobre os arquivos tocados.** Expected:
  sem erro. A prova do cancelamento é na Task 6, no navegador.

### Task 5: Página e tabela

**Files:**
- Modify: `client-new-kpi/app/simulador-preco/page.tsx`
- Modify: `client-new-kpi/components/simulador-preco/TabelaSimulador.tsx`
- Create: `client-new-kpi/components/simulador-preco/FiltroDeClasses.tsx`. Três checkboxes A, B
  e C, no mínimo uma marcada: a última não desmarca.
- Delete: `client-new-kpi/lib/paginacao.ts` e `docs/rotinas/simulador-preco/validacao/sp10_paginacao.mjs`,
  se nada mais os importar (confirmar com grep).

**Interfaces:**
- Consumes: Tasks 3 e 4. `ajustesNaTela`, `rascunhos` e `simulacao` ficam como hoje.

- [ ] **Step 1: Estado da página.**
  - `filtroAplicado`, fixado no Consultar.
  - `busca` (o que foi digitado) e `buscaAtrasada = useValorComAtraso(busca, ATRASO_DA_BUSCA_MS)`.
  - `classes: Classe[]`, começando nas três.
  - `soSimulados: boolean`.
  - `pagina`.
  - Mudar `buscaAtrasada`, `classes` ou `soSimulados`, ou fazer um novo Consultar, leva
    `pagina` a 1.
  - O `pedido` sai da combinação de tudo isso. Com `soSimulados`, os códigos são
    `codigosSimulados(ajustes)`.
- [ ] **Step 2: Barra.**
  - "N produtos" vem de `totalItens`.
  - "N simulados" = `Object.keys(ajustes).length`, com `title` "Códigos: …" (os
    `codigosSimulados`).
  - O botão "Ver só os simulados" alterna a opção (`aria-pressed`).
    - Fica desabilitado sem simulados.
    - Acima de `LIMITE_DE_CODIGOS`, também fica desabilitado, com `title` "Mais de 500 produtos
      simulados: use a busca".
  - `<FiltroDeClasses>` fica ao lado da busca.
  - O aviso de repetidas sai.
  - "Consultado às" mostra o `dataUpdatedAt` da query, e "Consultar de novo" chama `refetch()`.
- [ ] **Step 3: Paginação.** Ela vem de `totalPaginas`. Se a resposta chegar com `itens` vazio,
  `totalItens > 0` e `pagina > totalPaginas`, a tela vai para `totalPaginas` (Review Focus 4).
- [ ] **Step 4: Estados.**
  - Carregando sem página anterior: "Consultando…".
  - Carregando sobre a página anterior: a tabela continua, com `aria-busy`.
  - Erro: a mensagem da API.
  - Nenhum resultado: o aviso de hoje, com o texto da busca.
- [ ] **Step 5: Tabela.**
  - Coluna "Classe" logo depois de Produto: estreita, centralizada, com cabeçalho igual ao do
    Produto. A classe sai da segunda linha da célula do produto.
  - `TOTAL_DE_COLUNAS` acompanha a mudança.
  - Os produtos novos são filtrados no navegador pela busca, por descrição em maiúsculas.
- [ ] **Step 6: Verificar.**
  - `npx tsc --noEmit` e `npx eslint` limpos.
  - sp13 e sp17 passam.

### Task 6: Scripts com banco, tela e revisão

**Files:**
- Modify: `docs/rotinas/simulador-preco/validacao/sp6_consulta_pela_api.mjs` (rodado pelo Gabriel)

- [ ] **Step 1: O sp6 passa a pedir páginas e conferir.** Com filial 7 e região 90:
  - página 1 e página 2 sem chave repetida entre elas;
  - `totalItens` = 9.811;
  - a página 1 começa na classe A;
  - "VANISH" dá 32;
  - classes `["A"]` dão 1.102;
  - "50%" não dá erro;
  - os `codigos` de 3 produtos da página 1 trazem só esses produtos;
  - cada um destes pedidos dá **400**:
    - página 0;
    - classe "D";
    - busca de 61 caracteres;
    - 501 códigos.
  - Grava a união dos itens das páginas 1, 2 e 50 em `$TEMP/sp6_7_90.json`, como
    `{ produtos: [...] }`, que é o formato que o sp8 parte 2 já lê.
- [ ] **Step 2: Pedir ao Gabriel** que rode o sp6 e o sp8 parte 2.
- [ ] **Step 3: No navegador.**
  - Itens 1 a 5 do Review Focus.
  - A simulação salva antes aparece na linha certa.
  - Nos dois temas e a 375 px.
  - O sessionStorage e o localStorage não têm a lista de produtos.
- [ ] **Step 4: Atualizar a §3.5 da spec mãe** e chamar o revisor final (opus) sobre o diff.
