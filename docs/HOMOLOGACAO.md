# Homologação — matriz de cenários contra a 9815

Os incrementos da Fase 4 validam **um caminho** cada um. Esta fase valida a **combinação**:
períodos, regimes e dimensões, todos contra a rotina em produção.

> **Estado:** plano aprovado, execução depois dos incrementos 8 e 9.
> Exceção já liberada: o **regime de caixa**, que está implementado e nunca foi executado.

---

## Por que uma fase separada

Cada incremento provou uma consulta isolada, quase sempre no mesmo cenário — 01/08 a
27/08/2026, competência, Grupo de Contas, filiais 7/12/25. Isso não cobre:

- **Virada de mês**, onde o bucket `MES_ANO` decide em qual coluna o lançamento cai.
- **Regime de caixa**, que usa três expressões de data diferentes das de competência.
- **Período de vários meses**, onde a 9815 executa o faturamento uma vez por mês.
- **Filial isolada vs. todas**, onde o `IN` cresce de 1 para 18.
- **Mês fechado vs. mês corrente**, onde o segundo ainda recebe lançamentos.
- **Período sem movimento**, onde tudo deveria vir zerado em vez de quebrar.

Bug que só aparece em combinação é o mais caro de achar depois, porque ninguém sabe qual
das variáveis introduziu o erro.

---

## Protocolo de cada cenário

Vale o que está em `docs/ROTINA_9815.md` §11 e na skill `conferir-dre`:

1. **Feche e reabra a 9815.** A grade não se limpa entre apurações, e sobra linha da
   execução anterior.
2. Rode a apuração na rotina e **exporte com contas zeradas**.
3. **Logo em seguida**, chame `POST /api/dre-gerencial/apuracao` com os mesmos parâmetros.
   A base é produção viva: uma hora de intervalo já muda os números.
4. Compare por script, com `sprintf("%.2f")` — nunca `%s` num campo numérico.
5. Registre o resultado na matriz abaixo, com data e hora das duas coletas.

---

## Matriz

Legenda: ✅ confere · ❌ diverge · ⬜ não testado · ⛔ bloqueado por incremento pendente

### Eixo 1 — Regime (dimensão Grupo de Contas, 1 mês, filiais 7/12/25)

O cabeçalho sai **idêntico** nos dois regimes — receita, deduções e CMV não dependem dele.
A diferença está nas despesas e, por tabela, no conjunto de contas órfãs: 123 linhas em
competência contra 129 em caixa.


| Cenário | Competência | Caixa |
|---|---|---|
| 01/08 a 27/08/2026 | ✅ 28/08/2026 — 123 linhas | ✅ 28/08/2026 — 129 linhas |
| Mês fechado (julho/2026 inteiro) | ⬜ | ⬜ |

### Eixo 2 — Período

| Cenário | Estado | Observação |
|---|---|---|
| 1 mês, mês corrente parcial | ✅ | validado nos dois regimes |
| 1 mês fechado (01/07 a 31/07) | ⬜ | sem lançamentos novos entrando |
| 2 meses (01/06 a 31/07) | ✅ 28/08/2026 | 145 linhas; valores, `%AV` e `%AH` exatos. Única divergência: MÉDIA, 1 centavo em 9 linhas (§14) |
| 4 meses | ⬜ | limite de uso citado pelo negócio; mede o custo real |
| Virada de mês (25/07 a 05/08) | ⬜ | testa o bucket `MES_ANO` |
| Período sem movimento | ⬜ | tudo zerado, sem erro |
| Um único dia | ⬜ | caso degenerado |

### Eixo 3 — Dimensão de análise

| Dimensão | Estado | Observação |
|---|---|---|
| Grupo de Contas | ✅ | 123 linhas, zero divergência |
| Conta Gerencial | ⛔ | SQL de estrutura próprio, com `TIPOCONTA` e `EPCPARDRE_RESP` |
| C. Custo Principal | ⛔ | estrutura só com linhas calculadas, seis grupos excluídos por nome |
| Centro de Custo | ⛔ | incremento 9 — **sem referência**, nunca funcionou na 9815 |

### Eixo 4 — Filiais

| Cenário | Estado | Observação |
|---|---|---|
| 3 filiais (7, 12, 25) | ✅ | o cenário já validado |
| 1 filial isolada | ⬜ | |
| As 18 | ⬜ | mede o custo real; na 9815 seriam 36 blocos no SQL de faturamento |
| Filial sem movimento | ⬜ | |

---

## O que fazer quando divergir

Divergência **não** é motivo para ajustar o número até bater. O caminho é:

1. Isolar em qual das três consultas está — chamar `/despesas`, `/faturamento` e
   `/estrutura` separadamente com os mesmos parâmetros.
2. Comparar a consulta suspeita com a original do trace, lado a lado, como nos
   `docs/validacao/*.sql`.
3. Se as duas consultas concordarem e ainda assim divergir da tela, o problema está na
   montagem ou é comportamento do Delphi fora do SQL — como o resíduo de grade da §11.
4. Documentar antes de corrigir.

## Divergências conhecidas e aceitas

| O quê | Decisão |
|---|---|
| Resíduo de grade da 9815 entre apurações | **Não replicar.** É estado de tela, não regra |
| MÉDIA do bloco TOTAL, 1 centavo em 9 de 145 linhas | **Aceita.** Ponto flutuante interno do Delphi; coluna derivada, sem efeito em identidade contábil (`ROTINA_9815.md` §14) |
