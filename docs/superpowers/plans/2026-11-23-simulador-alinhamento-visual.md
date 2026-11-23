# Simulador de preço: alinhamento visual com o DRE (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer a tela do simulador usar a mesma tabela, a mesma casca e o mesmo piso de
acessibilidade do DRE, sem mudar nenhum número nem comportamento.

**Architecture:** só markup e classes. A tabela passa a usar as classes compartilhadas que já
existem em `client-new-kpi/app/globals.css` (`.tabela-rolagem`, `.celula-descricao`,
`.largura-da-descricao`, `.col-bloco`, `.col-interna`). A página copia a casca de
`app/dre-gerencial/page.tsx`. Nenhum arquivo do DRE e nenhuma regra do `globals.css` é editada.

**Tech Stack:** Next.js 16, React 19, Tailwind 4 com os tokens de `globals.css` e TypeScript strict.

**Spec:** [docs/superpowers/specs/2026-11-23-simulador-alinhamento-visual-design.md](../specs/2026-11-23-simulador-alinhamento-visual-design.md)

## Global Constraints

- **Cores:** só tokens `var(--…)`, nunca hex. Os dois temas e as duas leituras funcionam.
- **Arquivos intocados:** `app/globals.css`, `components/dre-gerencial/*` e `app/dre-gerencial/*`.
- **Comportamento intocado:** cálculo, consulta, simulação guardada, Enter/Shift+Enter, ↺, quadro e produtos novos.
- **Impressão fora** (decisão de 23/11/2026): nem `.nao-imprime` entra.
- **Sem commit pelo agente.** O usuário commita (regra da sessão). Cada tarefa termina num ponto verificável, não num commit.
- **`npx tsc --noEmit` e `npx eslint`** limpos ao fim de cada tarefa.

## Review Focus

1. **375px de largura:** a coluna fixa ocupa no máximo 50vw, e os valores rolam na horizontal ao lado dela.
2. **Rolar para baixo:** os números do corpo não aparecem através do cabeçalho fixo nem da coluna fixa.
3. **Leitura ampliada:** um preço como `1.234,567` cabe inteiro no campo da célula e no quadro.
4. **Teclado:** Tab mostra o foco em código e descrição (que abrem o quadro), ↺, ✕ e nos botões da página e do quadro. O Enter no preço continua pulando para o preço da linha de baixo.
5. **Tema claro:** divisores de grupo visíveis, coluna de compra e preço futuro legíveis, e a marca da linha simulada distinguível.

A tarefa 4 confere os cinco por captura de tela. Não há teste automatizado de aparência no
projeto, e biblioteca nova está fora (AGENTS.md).

---

### Task 1: A tabela usa as classes do DRE

**Files:**
- Modify: `client-new-kpi/components/simulador-preco/TabelaSimulador.tsx` (todo o JSX de `TabelaSimulador` e `Linha`, mais as constantes `TH`, `TH_NUM`, `TD`, `TD_NUM` e `BLOCO`)

**Interfaces:**
- Consumes: nada novo.
- Produces: as props de `TabelaSimulador` **não mudam** (`linhas`, `ajustes`, `onPreco`, `onRedefinir`, `onAbrir`, `modo`, `className`), e `chaveDaLinha` continua igual. A página não precisa mudar por causa desta tarefa.

- [ ] **Step 1: Contêiner e tabela.** O `<div>` de fora passa a ser `className={cn("tabela-rolagem rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]", className)}`. O `<table>` passa a ser `w-full border-collapse text-[length:var(--fs-base)]`, como no `TabelaDre.tsx:1260`. Saem `border-separate`, `border-spacing-0`, `w-max`, as classes `sticky`/`z-*` do `<thead>` e as `border-b` das células: o `.tabela-rolagem` já fixa o `thead` e desenha os separadores.

- [ ] **Step 2: Uma coluna fixa só.** A coluna "Código" sai. A célula da descrição, no cabeçalho e no corpo, recebe `celula-descricao largura-da-descricao`, e o código vai **dentro** dela, antes da descrição, em `tabular` com cor `--text-muted`. A linha de NCM/tributação continua embaixo, e o botão que abre o quadro passa a envolver código e descrição juntos. No modo `novo`, o selo `NOVO` ocupa o lugar do código, dentro da mesma célula. Os dois `<tr>` do cabeçalho ganham uma `th.celula-descricao` cada um: a da faixa de cima vazia, a de baixo com o rótulo "Produto".

- [ ] **Step 3: Divisores.** Cada grupo (Compra, Entrada, Custo, Saída e Preço) abre com `col-bloco` na primeira coluna, e as demais colunas do grupo levam `col-interna`. Vale para a faixa de cima (`colSpan`), para os rótulos de baixo e para cada `td`. A constante `BLOCO` (`border-l`) sai. A faixa de cima segue a faixa dos meses do DRE (`TabelaDre.tsx:1295`): `bg-[var(--surface-2)] pt-3 pb-1 text-center font-semibold text-[var(--text-primary)]`, mantendo a cor de destaque só nos grupos Compra e Preço.

- [ ] **Step 4: Marca da linha simulada.** A `border-l-2` da célula do código (que sumiu) vira `shadow-[inset_3px_0_0_var(--primary)]` na `celula-descricao` quando `simulado`. Sombra por dentro, e não borda: com `border-collapse`, a borda é da tabela (`globals.css`, "SOMBRA POR DENTRO"). O fundo da linha simulada continua `bg-[var(--surface-2)]` também na célula fixa.

- [ ] **Step 5: Foco e larguras.** Todo `<button>` da tabela ganha `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)] rounded-[var(--radius-sm)]`. O campo de preço troca `w-28` por `w-[8.5em]`, que cresce com `--fs-base`.

- [ ] **Step 6: Verificar.**
  Run (em `client-new-kpi/`): `npx tsc --noEmit && npx eslint components/simulador-preco`
  Expected: nenhuma saída de erro.

---

### Task 2: A casca da página igual à do DRE

**Files:**
- Modify: `client-new-kpi/app/simulador-preco/page.tsx` (o `AppShell` e os dois primeiros `div`/`section`)
- Modify: `client-new-kpi/components/simulador-preco/FiltrosSimulador.tsx` (classe do botão Consultar)

**Interfaces:**
- Consumes: `TabelaSimulador` da Task 1, com as props inalteradas.
- Produces: nada.

- [ ] **Step 1:** a trilha passa a ser `["Época Analytics", "Simulador de Preço"]`.
- [ ] **Step 2:** o `div` de conteúdo passa a ser `mx-auto flex h-full min-h-0 w-full max-w-[110rem] flex-col gap-3`, como no `app/dre-gerencial/page.tsx:357`.
- [ ] **Step 3:** a `section` dos filtros ganha `shadow-[var(--shadow-card)]`, igual ao cartão de filtros do DRE.
- [ ] **Step 4:** os botões "Desfazer todas", "+ Simular novo produto" e "Consultar" ganham o mesmo `focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]` da Task 1.
- [ ] **Step 5: Verificar.** Run: `npx tsc --noEmit && npx eslint app/simulador-preco components/simulador-preco`. Expected: limpo.

---

### Task 3: O quadro com foco visível

**Files:**
- Modify: `client-new-kpi/components/simulador-preco/QuadroSimulacao.tsx` (botões ✕, ↺, Cancelar e Confirmar)

**Interfaces:** nenhuma muda.

- [ ] **Step 1:** os botões ✕, ↺ (dentro de `Campo`), Cancelar e Confirmar ganham `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]`.
- [ ] **Step 2: Verificar.** Run: `npx tsc --noEmit && npx eslint components/simulador-preco`. Expected: limpo.

---

### Task 4: Prova de que nada mudou, e capturas

**Files:** nenhum.

- [ ] **Step 1: Números.** Run, da raiz:
  `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/simulador-preco/validacao/sp8_recalculo_reproduz_o_sql.mjs "$TEMP/sp6_7_90.json"`
  Expected: `Contra o SQL: 9788 linha(s), 0 com diferença.` e `sp8: 137072 conferências, todas passaram.`
- [ ] **Step 2: Capturas**, com o usuário logado no navegador do painel e a consulta da filial 7, região 90, conferindo um a um os cinco itens do Review Focus:
  - tema escuro e claro;
  - leitura ampliada;
  - `resize_window` com 375×812;
  - rolagem vertical e horizontal;
  - Tab até os botões.
- [ ] **Step 3: Registrar.** Atualizar a §3.5 da [spec do simulador](../specs/2026-11-18-simulador-de-preco-design.md) com uma linha: "Alinhamento visual com o DRE (23/11/2026)", com o que foi conferido. Parar e entregar para o usuário commitar.
