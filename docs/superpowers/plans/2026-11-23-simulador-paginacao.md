# Simulador de preço: paginação, produtos novos na mesma tabela e consulta guardada (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a tela fica rápida com a filial inteira: desenha 100 produtos por vez, mostra os
produtos novos dentro da mesma tabela e volta depois de um F5 sem consultar de novo.

**Architecture:** dois módulos puros novos em `client-new-kpi/lib/`, testados no Node:
- `paginacao.ts` recorta a lista;
- `consultaGuardada.ts` comprime e descomprime a consulta com o `CompressionStream` nativo.

A tabela passa a receber os produtos novos como um grupo de linhas no topo. A página guarda o
resultado da consulta num estado próprio, que vem da consulta ou do sessionStorage, e pagina a
lista filtrada pela busca.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Web Streams (`CompressionStream`, `DecompressionStream`), Node 26 para os testes.

**Spec:** [docs/superpowers/specs/2026-11-23-simulador-paginacao-design.md](../specs/2026-11-23-simulador-paginacao-design.md)

## Global Constraints

- **`TAMANHO_DA_PAGINA = 100`.**
- **Nenhuma biblioteca nova:** a compressão é `new CompressionStream("gzip")`.
- **Chave do sessionStorage:** `epoca:simulador-preco:consulta:v1:<base>:<matrícula>`, definida em `lib/chavesPorBase.ts`.
- **Só a última consulta é guardada;** consultar de novo substitui.
- **Consulta guardada de outra base é ignorada.**
- **Toda leitura e escrita de storage vai em `try/catch`.** Falha = não guarda, e a tela segue igual.
- **Intocados:** o cálculo, a API, o `globals.css`, o DRE e a simulação guardada no localStorage (D22).
- **Sem commit pelo agente;** o usuário commita.
- **`npx tsc --noEmit` e `npx eslint`** limpos, e a `sp8` em 137.072/137.072.

## Review Focus

1. **Busca que reduz a lista estando numa página alta** (ex.: página 50, e a busca deixa 3 produtos): volta à página 1, sem tabela vazia. A `sp10` testa a página presa ao limite, e a Task 4 zera a página ao mudar a busca.
2. **Trocar de base pelo menu com uma consulta guardada:** a consulta da outra base não aparece. A Task 4 compara `dados.base.id` com a base da sessão antes de restaurar.
3. **sessionStorage cheio, bloqueado, ou texto guardado corrompido:** sem erro na tela, e sem restaurar. A `sp11` testa o texto corrompido, e a Task 4 faz o `try/catch` no acesso.
4. **Consultar outra filial com uma consulta guardada:** a nova substitui a guardada, a página volta a 1, e as simulações da consulta antiga continuam no localStorage, separadas pela chave da consulta.
5. **Enter na última linha da página:** fica onde está, sem pular para fora da tabela. O `irParaOutroPreco` só procura dentro da `<table>`, que agora tem só a página. Conferido por captura.

---

### Task 1: `lib/paginacao.ts`

**Files:**
- Create: `client-new-kpi/lib/paginacao.ts`
- Test: `docs/rotinas/simulador-preco/validacao/sp10_paginacao.mjs`

**Interfaces:**
- Produces:
  - `export const TAMANHO_DA_PAGINA = 100;`
  - `export function paginar<T>(lista: readonly T[], pagina: number, tamanho: number): { itens: T[]; pagina: number; totalPaginas: number }`. A `pagina` devolvida é a efetiva, presa entre 1 e `totalPaginas`, e `totalPaginas = max(1, ceil(lista.length / tamanho))`.

- [ ] **Step 1: Escrever a `sp10`**, no formato da `sp8` (`eq`, a contagem de conferências e `process.exit`), importando `@/lib/paginacao.ts`. Asserções:
  - `paginar([1..250], 1, 100)` → `itens.length 100`, `itens[0] 1`, `totalPaginas 3`;
  - `paginar([1..250], 3, 100)` → `itens.length 50`, `itens[0] 201`, `pagina 3`;
  - `paginar([1..250], 9, 100).pagina` → `3`, presa no fim;
  - `paginar([1..250], 0, 100).pagina` → `1`;
  - `paginar([], 1, 100)` → `{ itens: [], pagina: 1, totalPaginas: 1 }`;
  - `paginar([1..100], 1, 100).totalPaginas` → `1`.
- [ ] **Step 2: Rodar e ver falhar.** Run (raiz): `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/simulador-preco/validacao/sp10_paginacao.mjs`. Expected: erro de módulo não encontrado.
- [ ] **Step 3: Implementar `paginar` e `TAMANHO_DA_PAGINA`** em `lib/paginacao.ts`.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando. Expected: `sp10: N conferências, todas passaram.`

---

### Task 2: `lib/consultaGuardada.ts`

**Files:**
- Create: `client-new-kpi/lib/consultaGuardada.ts`
- Modify: `client-new-kpi/lib/chavesPorBase.ts` (acrescentar a chave)
- Test: `docs/rotinas/simulador-preco/validacao/sp11_consulta_comprimida.mjs`

**Interfaces:**
- Produces:
  - em `chavesPorBase.ts`: `export const chaveDaConsultaGuardada = (baseId: string, matricula: number) => \`epoca:simulador-preco:consulta:v1:${baseId}:${matricula}\``;
  - `export interface ConsultaGuardada { filtro: { codFilial: string; regiao: string; fornecedor: Fornecedor | null }; consultadoEm: string; dados: ConsultaSimulador }`. O `filtro` tem a forma de `EstadoDosFiltros`, para voltar direto ao formulário; `consultadoEm` é ISO, de `new Date().toISOString()`;
  - `export async function serializar(c: ConsultaGuardada): Promise<string>`: JSON, gzip pelo `CompressionStream`, depois base64;
  - `export async function desserializar(texto: string): Promise<ConsultaGuardada | null>`: o inverso. **Qualquer falha** (base64 inválido, gzip inválido, JSON inválido, falta de `dados.produtos`) devolve `null`, e nunca lança;
  - `export function lerDoNavegador(chave: string): string | null` e `export function gravarNoNavegador(chave: string, texto: string): boolean`: `sessionStorage` em `try/catch`; `false` quando não grava.

- [ ] **Step 1: Escrever a `sp11`**, que recebe como argumento o caminho do JSON da `sp6`. Asserções:
  - `desserializar(await serializar(c))` devolve um objeto igual a `c` (comparado por `JSON.stringify`);
  - `(await serializar(c)).length < 5_000_000`, com o tamanho impresso;
  - `await desserializar("isto não é base64 nem gzip")` → `null`;
  - `await desserializar(btoa("{}"))` → `null`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/simulador-preco/validacao/sp11_consulta_comprimida.mjs "$TEMP/sp6_7_90.json"`. Expected: erro de módulo não encontrado.
- [ ] **Step 3: Implementar.** O base64 se monta em pedaços: `String.fromCharCode(...bytes)` de uma vez estoura a pilha com 500 mil bytes.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando. Expected: todas passaram, com o tamanho comprimido impresso na casa de 0,57 milhão.

---

### Task 3: A tabela com os produtos novos no topo

**Files:**
- Modify: `client-new-kpi/components/simulador-preco/TabelaSimulador.tsx`

**Interfaces:**
- Produces: as props de `TabelaSimulador` passam a ser:
  - `linhas`, `ajustes`, `onPreco`, `onRedefinir` e `onAbrir`, como hoje, para os produtos da consulta;
  - `novos: { produto: ProdutoSimulado; chave: string }[]`, mais `onAbrirNovo(chave: string)` e `onRemoverNovo(chave: string)`;
  - `className?`.

  Saem `modo` e `compacta`. O modo "novo" passa a ser por linha, dentro do componente.

- [ ] **Step 1: Os novos primeiro.** Quando `novos.length > 0`, o `<tbody>` começa com:
  - uma linha de título, com `th.celula-descricao` (texto "Produtos novos simulados (N)", estilo `TH_GRUPO` à esquerda) e uma célula com `colSpan={17}` vazia, as duas com o fundo `TD_FUNDO_SIMULADA`;
  - as linhas dos novos, com `modo="novo"`, `onRedefinir={onRemoverNovo}` e `onAbrir={onAbrirNovo}`;
  - uma linha de título "Produtos da consulta", **só se `linhas.length > 0`**.
- [ ] **Step 2: Tirar** a prop `modo` do componente e do cabeçalho: o rótulo da coluna fixa passa a ser sempre "Produto". Tirar também `compacta` e o `style` de `minHeight` que ela punha.
- [ ] **Step 3: Verificar.** Run (em `client-new-kpi/`): `npx tsc --noEmit`. Expected: erros **só** em `app/simulador-preco/page.tsx`, que ainda passa as props antigas e é corrigida na Task 4.

---

### Task 4: A página com paginação e consulta guardada

**Files:**
- Modify: `client-new-kpi/app/simulador-preco/page.tsx`

**Interfaces:**
- Consumes:
  - `paginar` e `TAMANHO_DA_PAGINA` (Task 1);
  - `serializar`, `desserializar`, `lerDoNavegador`, `gravarNoNavegador` e `ConsultaGuardada` (Task 2);
  - `chaveDaConsultaGuardada` (Task 2);
  - as novas props de `TabelaSimulador` (Task 3).

- [ ] **Step 1: O resultado num estado próprio.**
  - Criar `const [resultado, setResultado] = useState<{ dados: ConsultaSimulador; consultadoEm: string } | null>(null)`.
  - A consulta passa a usar `consulta.mutate(filtro, { onSuccess })`. O `onSuccess` faz `setResultado`, `setPagina(1)`, monta o `ConsultaGuardada` com os `filtros` daquele momento, e chama `serializar` e depois `gravarNoNavegador`, sem esperar o resultado na tela.
  - Tudo que hoje lê `consulta.data` passa a ler `resultado?.dados`. Os avisos de estado seguem a mesma lógica: inicial quando não há `resultado` nem consulta em andamento.
- [ ] **Step 2: Restaurar ao abrir.**
  - Um efeito que roda quando `usuario` fica conhecido.
  - Ele lê `lerDoNavegador(chaveDaConsultaGuardada(base, matrícula))` e chama `desserializar`. **Só** se `dados.base?.id === usuario.base.id`, faz `setFiltros(guardada.filtro)`, `setResultado`, `setConsultaAtual(chaveDaConsulta(...))` e `setPagina(1)`.
  - O `setState` acontece dentro do `.then` (assíncrono), e não no corpo do efeito, para a regra de lint do React 19.
  - Um `cancelado` no cleanup evita gravar estado depois de desmontar.
- [ ] **Step 3: Paginar.**
  - Criar `const [pagina, setPagina] = useState(1)`.
  - Calcular `const recorte = paginar(visiveis, pagina, TAMANHO_DA_PAGINA)`. A tabela recebe `linhas={recorte.itens}`.
  - Mudar a busca faz `setPagina(1)`.
  - A contagem de produtos, a de simulados e o "Desfazer todas" **continuam calculados sobre `linhas`, a consulta inteira**, e não sobre a página (objetivo 3 da spec).
  - Os controles ficam na barra de ações: "‹ Anterior", "Página {recorte.pagina} de {recorte.totalPaginas}" e "Próxima ›". Ficam desligados nas pontas, levam o `FOCO`, e não aparecem com `totalPaginas === 1`.
- [ ] **Step 4: Produtos novos dentro da tabela.**
  - A `<section>` dos novos sai.
  - A tabela principal passa a receber `novos`, `onAbrirNovo={abrirNovo}` e `onRemoverNovo={removerNovo}`.
  - A tabela aparece quando há resultado com produtos **ou** quando há produtos novos. Com produto novo e sem consulta, ela mostra só o grupo dos novos.
- [ ] **Step 5: "Consultado às".** Ao lado da contagem, mostrar `Consultado às HH:MM` (a hora local de `consultadoEm`, formatada com `Intl` em pt-BR, `hour` e `minute` 2-digit) e um botão "Consultar de novo", que chama `consultar()`. O botão leva o `FOCO` e fica desligado durante uma consulta.
- [ ] **Step 6: Verificar.** Run (em `client-new-kpi/`): `npx tsc --noEmit && npx eslint app/simulador-preco components/simulador-preco lib`. Expected: limpo.

---

### Task 5: Provas e capturas

**Files:** a §3.5 da [spec do simulador](../specs/2026-11-18-simulador-de-preco-design.md).

- [ ] **Step 1: Rodar as provas**, da raiz, com o `_alias.mjs`:
  - `sp8` com `"$TEMP/sp6_7_90.json"` → `137072 conferências, todas passaram.`;
  - `sp10` → todas passaram;
  - `sp11` com o mesmo JSON → todas passaram.
- [ ] **Step 2: Capturas**, com o usuário logado, na filial 7, região 90, sem fornecedor:
  - abrir, fechar e confirmar o quadro respondem sem demora perceptível;
  - as colunas dos produtos novos ficam alinhadas;
  - a busca acha um produto de outra página;
  - uma simulação sobrevive à troca de página;
  - depois de um F5, a tabela volta com "Consultado às …";
  - os 5 itens do Review Focus deste plano;
  - os itens pendentes do plano do alinhamento visual (375px, cabeçalho fixo, leitura ampliada, Tab e tema claro).
- [ ] **Step 3: Registrar** na §3.5 da spec do simulador uma linha para a paginação e a consulta guardada, e outra para o alinhamento visual, com o que foi conferido. Parar e entregar para o usuário commitar.
