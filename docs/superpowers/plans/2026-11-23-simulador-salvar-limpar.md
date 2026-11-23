# Simulador — Salvar, Limpar e títulos dos grupos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As edições da tabela passam a ser guardadas só no clique em "Salvar simulação"; um
quadro "Limpar simulações" apaga, com confirmação, as edições e/ou os produtos novos; os títulos
dos grupos ficam centralizados na área visível e separados.

**Architecture:** A lógica pura (rascunho × salvo, pendências, limpeza) num arquivo novo
`lib/rascunhoSimulacao.ts`, testado por `sp13`. A página guarda os rascunhos em `useState`
(memória da aba) e só chama `alterar` do `useSimulacaoGuardada` no Salvar, no Limpar e nos
produtos novos. O quadro de limpar é um `<dialog>` como o `QuadroSimulacao`.

**Tech Stack:** Next.js 16 / React 19, Tailwind 4, sem biblioteca nova.

**Spec:** `docs/superpowers/specs/2026-11-23-simulador-salvar-limpar-design.md`

## Global Constraints

- **Nenhum commit nem push pelo agente** ("não damos commit"). Onde o modelo de plano diz
  "Commit", o passo é: deixar a mudança no working tree para o Gabriel.
- Nenhuma biblioteca nova.
- Produtos novos continuam se guardando sozinhos.
- Limpar apaga tudo do localStorage deste usuário nesta base (a chave `chaveDaSimulacao` já é
  por base + matrícula).
- Todo efeito visual existe nos dois temas (PADROES_DE_TELA); `<ControlesDeExibicao />` já está
  na tela.
- Comando de teste (da raiz do repositório):
  `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/simulador-preco/validacao/sp13_salvar_e_limpar.mjs`

## Review Focus

1. Rascunho editado e depois desfeito até ficar igual ao salvo: o contador deve voltar a 0, e
   não mostrar "1 alteração não salva" (teste em Task 1).
2. Salvar com uma consulta cujo rascunho ficou vazio (o comprador desfez tudo): a consulta tem de
   sair do salvo, e não ficar com as edições antigas (teste em Task 1).
3. Limpar só os produtos novos não pode tocar nas edições salvas, e vice-versa (teste em Task 1).
4. "Desfazer todas" e o ↺ passam a mexer só no rascunho. Sem Salvar, o salvo continua intacto
   (conferência na tela, Task 2).
5. A tela ainda carregando a sessão (`chave` nula): Salvar não grava nada (já garantido por
   `alterar`; conferência na Task 2).

---

### Task 1: Lógica pura do rascunho e da limpeza

**Files:**
- Create: `client-new-kpi/lib/rascunhoSimulacao.ts`
- Test: `docs/rotinas/simulador-preco/validacao/sp13_salvar_e_limpar.mjs` (mesmo esqueleto
  `eq`/contador do sp12)

**Interfaces:**
- Consumes: `AjusteDaLinha` (`@/types/simulador-preco`), `ajusteVazio` (`@/lib/simuladorPreco`),
  `SimulacaoGuardada` (`@/hooks/useSimulacaoGuardada`; importar só o tipo).
- Produces:
  - `type AjustesPorConsulta = Record<string, Record<string, AjusteDaLinha>>`
  - `ajustesNaTela(salvos: AjustesPorConsulta, rascunhos: AjustesPorConsulta, consulta: string | null): Record<string, AjusteDaLinha>`:
    o rascunho, se houver; senão o salvo; senão `{}`.
  - `trocarAjuste(daConsulta: Record<string, AjusteDaLinha>, chave: string, novo: AjusteDaLinha | undefined): Record<string, AjusteDaLinha>`:
    devolve uma cópia; `undefined` ou `ajusteVazio(novo)` apaga a chave.
  - `contarPendencias(salvos: AjustesPorConsulta, rascunhos: AjustesPorConsulta): number`:
    quantas linhas, somando as consultas com rascunho, diferem do salvo. A comparação é por
    conteúdo, com JSON de chaves ordenadas: uma linha a mais, a menos ou com valor diferente
    conta 1.
  - `salvarRascunhos(salvos: AjustesPorConsulta, rascunhos: AjustesPorConsulta): AjustesPorConsulta`:
    os rascunhos substituem o salvo de cada consulta; uma consulta que ficou vazia é removida.
  - `limparSimulacao(s: SimulacaoGuardada, o: { edicoes: boolean; novos: boolean }): SimulacaoGuardada`

- [ ] **Step 1: Escrever sp13 com estes casos**
  - `ajustesNaTela`: rascunho presente vence o salvo; sem rascunho dá o salvo; com `null` dá `{}`.
  - `trocarAjuste`: com `{preco:undefined, percentuais:undefined, st:undefined}`, a chave
    some; com `{preco:"10"}`, a chave entra; o objeto de entrada não é alterado.
  - `contarPendencias`:
    - salvo `{c:{a:{preco:"1"}}}` × rascunho `{c:{a:{preco:"1"}}}` → `0` (Review Focus 1);
    - × `{c:{a:{preco:"2"}}}` → `1`;
    - × `{c:{a:{preco:"1"},b:{preco:"3"}}}` → `1`;
    - × `{c:{}}` → `1`;
    - mesmo ajuste com as chaves em outra ordem → `0`.
  - `salvarRascunhos`:
    - salvo `{c:{a:…}, d:{x:…}}` + rascunho `{c:{}}` → `{d:{x:…}}` (Review Focus 2);
    - rascunho `{e:{y:…}}` acrescenta `e` e mantém o resto.
  - `limparSimulacao`, com `s = {consultas:{c:{a:…}}, novos:[n1]}`:
    - `{edicoes:true, novos:false}` → `{consultas:{}, novos:[n1]}`;
    - `{edicoes:false, novos:true}` → `{consultas:{c:…}, novos:[]}` (Review Focus 3);
    - `{true,true}` → os dois vazios;
    - `{false,false}` → igual a `s`.
  - Termina com `process.exit(falhas ? 1 : 0)` e imprime `sp13: N conferências, F falhas`.

- [ ] **Step 2: Rodar o comando de teste**
  Expected: falha ao importar `@/lib/rascunhoSimulacao.ts` (o módulo não existe).

- [ ] **Step 3: Implementar `lib/rascunhoSimulacao.ts`** com as assinaturas acima e um
  comentário de topo que cita a spec.

- [ ] **Step 4: Rodar o comando de teste**
  Expected: `sp13: N conferências, 0 falhas`, com exit 0.

- [ ] **Step 5: Deixar no working tree**, sem commit.

### Task 2: Página: rascunho, Salvar, contador, aviso ao sair

**Files:**
- Modify: `client-new-kpi/app/simulador-preco/page.tsx`. Partes atingidas: `ajustes`/`ajustar`
  (linhas ~95–115), "Desfazer todas" (~231), a barra de ações e o comentário do topo (D22).

**Interfaces:**
- Consumes: tudo da Task 1; `alterar`/`simulacao` de `useSimulacaoGuardada`.
- Produces: o estado `rascunhos: AjustesPorConsulta` (useState) e `salvar(): void`, que a
  Task 3 usa (o Limpar com "edições" zera `rascunhos`).

- [ ] **Step 1: Rascunho.**
  - `ajustes = ajustesNaTela(simulacao.consultas, rascunhos, consultaAtual)`.
  - `ajustar` grava em `rascunhos[consultaAtual]` via `trocarAjuste`, partindo de `ajustes`
    (salvo se ainda não há rascunho).
  - "Desfazer todas" põe `rascunhos[consultaAtual] = {}`.
  - Produtos novos continuam chamando `alterar` direto.
- [ ] **Step 2: Salvar.**
  - `pendencias = contarPendencias(simulacao.consultas, rascunhos)`.
  - O botão "Salvar simulação" (estilo primário, igual a "+ Simular novo produto") chama
    `alterar(s => ({...s, consultas: salvarRascunhos(s.consultas, rascunhos)}))` e depois
    `setRascunhos({})`.
  - O botão fica `disabled` quando `pendencias === 0`.
  - Ao lado, `<span aria-live="polite">`: "1 alteração não salva" ou "N alterações não
    salvas", só quando `pendencias > 0`; com `pendencias = 0` e algo salvo, nada aparece.
  - O botão aparece sempre que há consulta na tela.
- [ ] **Step 3: Aviso ao sair.** `useEffect` registra `beforeunload` (com `preventDefault` e
  `returnValue = ""`) enquanto `pendencias > 0`.
- [ ] **Step 4: Textos.**
  - O comentário do topo explica que a D22 foi revista: edições da tabela só no Salvar,
    produtos novos sozinhos.
  - O aviso inicial troca "A simulação fica guardada só neste navegador" por "Clique em
    Salvar simulação para guardá-la neste navegador".
- [ ] **Step 5: Verificar.**
  - `npx tsc --noEmit` (em `client-new-kpi`). Expected: sem erro.
  - `npm run lint`. Expected: sem erro novo.
  - sp13 continua com 0 falhas.

### Task 3: Quadro "Limpar simulações"

**Files:**
- Create: `client-new-kpi/components/simulador-preco/QuadroLimpar.tsx`
- Modify: `client-new-kpi/app/simulador-preco/page.tsx` (botão e montagem do quadro)

**Interfaces:**
- Consumes: `limparSimulacao` (Task 1); `rascunhos`/`setRascunhos` (Task 2).
- Produces: `QuadroLimpar({ aberto: boolean, temEdicoes: boolean, temNovos: boolean, onLimpar(o: {edicoes: boolean; novos: boolean}): void, onFechar(): void })`

- [ ] **Step 1: Componente.**
  - Um `<dialog>` modal com os mesmos padrões do `QuadroSimulacao` (abrir com `showModal`,
    Esc fecha, foco).
  - Título "Limpar simulações".
  - Dois checkboxes, ambos marcados ao abrir:
    - "Edições dos produtos da consulta (todas as filiais, regiões e fornecedores)";
    - "Produtos novos simulados".
  - Uma caixa sem nada a limpar (`temEdicoes`/`temNovos` falso) aparece desabilitada e
    desmarcada.
  - O botão "Limpar" fica desabilitado sem nenhum marcado.
  - Clicar em "Limpar" passa ao **segundo passo**, no mesmo diálogo:
    - o texto "Tem certeza? Isto apaga do navegador o que foi marcado e não dá para desfazer.";
    - os botões "Sim, limpar" (tom de perigo, `--danger` ou o token de erro do projeto) e
      "Voltar".
- [ ] **Step 2: Na página.**
  - Botão "Limpar simulações" (estilo `BOTAO`) na barra de ações.
  - Ele aparece quando há algo salvo, rascunho ou produto novo:
    `Object.keys(simulacao.consultas).length > 0 || pendencias > 0 || simulacao.novos.length > 0`.
  - `onLimpar` chama `alterar(s => limparSimulacao(s, o))` e, se `o.edicoes`,
    `setRascunhos({})`.
  - Se o quadro de simulação aberto for de um produto novo que acabou de ser apagado, ele
    fecha.
- [ ] **Step 3: Verificar:** `npx tsc --noEmit` e `npm run lint`, sem erro.

### Task 4: Títulos dos grupos centralizados e separados

**Files:**
- Modify: `client-new-kpi/components/simulador-preco/TabelaSimulador.tsx`. Partes atingidas:
  `TituloDoGrupo` (~195) e o `tbody` (~154–170).

- [ ] **Step 1: `TituloDoGrupo`.**
  - Uma única `<th scope="colgroup" colSpan={1 + COLUNAS_DEPOIS_DO_PRODUTO}>` com o fundo
    atual.
  - Dentro dela, um `<span>` com `position: sticky; left: 50%; transform: translateX(-50%);
    display: inline-block`. O texto fica no centro da área visível e acompanha a rolagem
    lateral.
  - Texto em peso semibold.
- [ ] **Step 2: Separação.** Entre o último produto novo e o título "Produtos da consulta",
  uma linha vazia `<tr aria-hidden="true"><td colSpan={…} className="h-4 border-0" style={{ backgroundColor: "var(--surface-1)" }} /></tr>`.
  Usar o token do fundo da página que o arquivo já usa; conferir em `globals.css`.
- [ ] **Step 3: Verificar no navegador** (filial 7, região 90), nos dois temas e a 375 px:
  - o título está no centro e continua visível ao rolar para os lados;
  - há espaço entre os grupos;
  - o cabeçalho fixo não se sobrepõe ao título.

### Task 5: Conferência final e spec

- [ ] **Step 1: Na tela.**
  - Editar um preço mostra "1 alteração não salva", e F5 pede confirmação.
  - Salvar zera o contador, e o valor volta depois de F5 e de consultar de novo.
  - Desfazer sem salvar e dar F5 mantém o salvo.
  - O produto novo continua sem Salvar.
  - Limpar com só uma caixa marcada apaga só aquele tipo, depois da confirmação.
  - sessionStorage vazio.
- [ ] **Step 2:** Atualizar a §3.5 da spec mãe com uma linha "Salvar / Limpar / títulos —
  23/11/2026" e o que foi verificado.
- [ ] **Step 3:** Revisor final (subagente, opus) sobre o diff destas tarefas; corrigir
  Critical/Important com teste RED→GREEN.
