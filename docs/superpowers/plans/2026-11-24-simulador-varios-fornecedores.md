# Simulador — vários fornecedores · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o filtro do simulador aceita vários fornecedores, e a simulação salva passa a ser
guardada por filial + região.

**Architecture:** o SQL troca o filtro de um código pela lista em `INSTR`, como já faz com as
classes. Essa troca entra no sp5 como a adaptação A8. A API recebe `Fornecedores: int[]`. O
front libera a ficha múltipla do `SelecaoDeFornecedores` e junta as chaves antigas do
localStorage na leitura.

**Tech Stack:** .NET 10 + Dapper + ODP.NET (binds posicionais) · Next.js 16 + React Query v5 ·
scripts Node de validação.

**Spec:** `docs/superpowers/specs/2026-11-24-simulador-varios-fornecedores-design.md`

## Global Constraints

- **Gabriel:** não commitar; não conectar no Oracle (é o Gabriel quem roda o sp14 e o sp6);
  nenhuma biblioteca nova.
- **Binds:** o ODP.NET liga por posição. Cada `parametros.Add` segue a ordem do texto e continua
  somando 37 (28 da `Consulta` mais 9 da paginação).
- **API, fornecedores:** até **50** por consulta. Acima disso, a mensagem é "Mais de 50
  fornecedores: consulte sem filtro de fornecedor.".
- **Códigos:** inteiros > 0. Código inválido dá "Código de fornecedor inválido.". Repetidos são
  ignorados.
- **Todos:** lista vazia ou nula traz todos.
- **Chave da simulação:** `${codFilial}|${numRegiao}`. Na junção das chaves antigas, vence a do
  fornecedor específico (≠ 0) sobre a de "todos" (0).

## Review Focus

1. **Ordem dos binds:** `:fornecedoresNulo, :fornecedores` entram exatamente onde estavam
   `:codFornec1/2`, antes de `:matricula1`. O sp15 confere.
2. **Ordem da lista:** 234,500 e 500,234 contam como o mesmo filtro. Não podem refazer a
   consulta nem trocar o `placeholderData` (Tarefa 4: ordenar ao montar o filtro).
3. **Junção das chaves antigas:** precisa ser idempotente. Uma chave nova (`7|90`) já no formato
   novo é mantida, e ler duas vezes dá o mesmo resultado (sp18).
4. **Rascunho em memória:** o rascunho ainda não salvo usa a chave nova. Não se perde ao trocar
   fornecedores dentro da mesma filial e região.
5. **Fornecedor 0 ou negativo vindo da API:** é recusado, e não tratado como "todos".

---

### Tarefa 1: a chave nova e a junção das chaves antigas (front, lógica pura)

**Arquivos:** `client-new-kpi/lib/rascunhoSimulacao.ts`,
`client-new-kpi/hooks/useSimulacaoGuardada.ts`. Teste novo:
`docs/rotinas/simulador-preco/validacao/sp18_chave_sem_fornecedor.mjs`.

**Interfaces:**
- Produz `chaveDaConsulta(codFilial: string, numRegiao: number): string`, que fica em
  `useSimulacaoGuardada.ts` e perde o terceiro parâmetro.
- Produz `juntarChavesAntigas(consultas: AjustesPorConsulta): AjustesPorConsulta`, em
  `rascunhoSimulacao.ts`.

- [ ] **Passo 1: o teste sp18 (RED).** Os casos de `juntarChavesAntigas`:
  - `{"7|90|0": {a:{preco:"1"}}, "7|90|234": {a:{preco:"2"}, b:{preco:"3"}}}` dá
    `{"7|90": {a:{preco:"2"}, b:{preco:"3"}}}` (vence o específico);
  - `{"7|90": {x:{preco:"1"}}}` dá o mesmo objeto, pois já está no formato novo;
  - `{"7|90": {a:{preco:"9"}}, "7|90|0": {a:{preco:"1"}}}` dá `{"7|90": {a:{preco:"9"}}}`,
    porque a chave nova vence as antigas;
  - `{"7|90|0": {...}, "8|90|0": {...}}` dá duas chaves, `7|90` e `8|90`;
  - `{}` dá `{}`;
  - aplicar duas vezes dá o mesmo resultado que aplicar uma.

  O teste também confere `chaveDaConsulta("7", 90) === "7|90"`.
  Rode com `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/simulador-preco/validacao/sp18_chave_sem_fornecedor.mjs`.
  Esperado: falha, porque a função não existe.
- [ ] **Passo 2: implementar.**
  - **Prioridade:** a chave nova vem primeiro, depois a antiga com fornecedor ≠ 0, depois a
    antiga com 0.
  - **Junção:** a prioridade vale por linha (por `chaveDaLinha`), e não por consulta inteira.
  - **`ler()`:** em `useSimulacaoGuardada.ts`, aplicar `juntarChavesAntigas` a
    `lido.consultas`. Só na leitura: a próxima gravação já sai no formato novo.
- [ ] **Passo 3: GREEN.** O sp18 passa, e o sp13 e o sp17 continuam passando.

### Tarefa 2: o SQL, a adaptação A8 e os testes offline

**Arquivos:**
- `api-new-kpi/Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs`, linha do
  `F.CODFORNEC = DECODE(...)`;
- `sp5_sql_da_api_igual_a_referencia.mjs`;
- `sp15_consulta_paginada.mjs` (só se a lista de binds esperada estiver escrita nele);
- `sp14_tempo_da_pagina.sql`, com o bloco 4 novo.

- [ ] **Passo 1: sp5 (RED primeiro).** Acrescentar a adaptação **A8** à referência:
  - de: `F.CODFORNEC = DECODE(NVL(:CODFORNEC,0),0,P.CODFORNEC,:CODFORNEC)`
  - para: `(:FORNECEDORESNULO IS NULL OR INSTR(',' || :FORNECEDORES || ',', ',' || TO_CHAR(F.CODFORNEC) || ',') > 0)`
  - A troca é aplicada **antes** do A1, para os binds ganharem o camelCase
    `:fornecedoresNulo` / `:fornecedores`. Conferir que o `camel()` do sp5 produz esses nomes.
    Se não produzir, ajustar a regra e registrar a decisão (Ruling).
  - Atualizar o cabeçalho e a mensagem "IDENTICO" para incluir A8.
  - Esperado: com o .cs ainda antigo, o sp5 diverge.
- [ ] **Passo 2:** trocar a linha na `Consulta` e o comentário dos 28 binds (`:codFornec1/2` vira
  `:fornecedoresNulo`, `:fornecedores`). Esperado: sp5 IDENTICO.
- [ ] **Passo 3:** no sp14, criar o bloco 4 com a `Consulta` paginada para um fornecedor, para
  três fornecedores (`'234,…'`, que o Gabriel escolhe) e para nulo (todos). Seguir as instruções
  de bind e de "Null" que os blocos 1–3 já têm.

### Tarefa 3: a API

**Arquivos:** `SimuladorPrecoDtos.cs`, `SimuladorPrecoService.cs`, `ISimuladorPrecoRepository.cs`,
`SimuladorPrecoRepository.cs`, `sp6_consulta_pela_api.mjs`.

**Interfaces:**
- Muda `SimuladorPrecoFiltroDto(..., IReadOnlyList<int>? Fornecedores = null, ...)`, que
  substitui `decimal? CodFornec`. A posição continua a terceira.
- Muda `ConsultarPaginaAsync(codFilial, numRegiao, IReadOnlyList<int>? fornecedores, matricula, ...)`.

- [ ] **Passo 1: sp6 (os casos novos).** São casos com o banco, que o Gabriel roda depois:
  - `fornecedores:[A,B]` traz um total igual à soma de `[A]` e `[B]` consultados um a um;
  - `[0]` é recusado; `[-1]` é recusado;
  - 51 códigos são recusados com a mensagem da Global Constraints;
  - `[]` traz o mesmo total que sem o campo;
  - **migração:** onde o sp6 hoje manda `codFornec`, passa a mandar `fornecedores`.
- [ ] **Passo 2: implementar.**
  - **Validação, no serviço:** limite de 50, cada código > 0, `Distinct`; vazio vira nulo.
  - **No repositório:** `fornecedoresNulo` e `fornecedores` saem do `string.Join(",", lista)`, ou
    `null` quando não há lista. Os dois vão como `DbType.String`, no lugar de `codFornec1/2`.
- [ ] **Passo 3:**
  - Rodar `dotnet build -o "$TEMP/kpi-build"` na `api-new-kpi`. Esperado: 0 erros.
  - Rodar sp15 e sp5. Esperado: passam.

### Tarefa 4: a tela

**Arquivos:**
- `types/simulador-preco.ts`: o `PedidoDePagina` passa de `codFornec` para
  `fornecedores: number[]`;
- `components/simulador-preco/FiltrosSimulador.tsx`: `fornecedores: Fornecedor[]`, com
  `onMudar` recebendo a lista inteira; atualizar o comentário "UM por vez";
- `hooks/useSimuladorPreco.ts`: a comparação do `placeholderData`;
- `app/simulador-preco/page.tsx`: `paraFiltro`, `mesmoFiltro`, o `consultaAtual`, que passa a
  usar `chaveDaConsulta(filial, região)`, e o aviso de vazio.

- [ ] **Passo 1: implementar.**
  - **`paraFiltro`:** gera `fornecedores` **ordenado** por código.
  - **`mesmoFiltro` e `placeholderData`:** comparam a lista pelo texto (`join(",")`).
  - **Aviso de vazio:**
    - 0 fornecedores: sem complemento;
    - 1 fornecedor: "com este fornecedor";
    - vários: "com estes fornecedores".
- [ ] **Passo 2:** rodar `npx tsc --noEmit -p .` e `npx eslint` nos arquivos tocados. Rodar
  também sp13, sp17 e sp18. Esperado: todos limpos e passando.
- [ ] **Passo 3: conferência na tela, pelo Gabriel.** Testar:
  - 234 + Enter, depois outro código + Enter, e Consultar;
  - editar um produto, trocar a combinação de fornecedores e ver a edição;
  - dar F5;
  - conferir que as simulações antigas continuam lá.

### Final

Revisão de todo o diff por um revisor novo. Atualizar a spec com os Rulings, se houver. Não
commitar.
