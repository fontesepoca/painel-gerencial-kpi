# DRE Gerencial — especificação da versão web

Rotina **9815** do Winthor (*GERENCIAL*, aba **4-DRE**) reescrita como aplicação web.

Este documento descreve o que a rotina **será**. O que ela **é hoje** no Delphi está em
[ROTINA_9815_LEVANTAMENTO.md](ROTINA_9815_LEVANTAMENTO.md) — são documentos complementares,
não versões um do outro.

> **Estado:** especificação aprovada, implementação é a Fase 4. Nada aqui foi codificado ainda.

---

## 1. Princípio que governa tudo

**Fidelidade numérica.** A tela web tem que produzir **exatamente os mesmos valores** da 9815,
para os mesmos filtros — inclusive onde o comportamento parece defeito. Decisão do Gabriel em
27/08/2026.

Critério de aceite: para cada um dos 6 cenários exportados em
`docs/Resultado das consultas na rotina oficial/`, a web bate linha a linha com a planilha.

Melhorias de comportamento só entram **depois** dessa validação, uma a uma, com aprovação.

---

## 2. Escopo

### Dentro

- Aba **4-DRE**, com os 4 filtros principais.
- As 4 dimensões de análise, **incluindo Centro de Custo**, que hoje falha sempre.
- Colunas por mês, `AV %` e `AH %`.
- Marcação visual das linhas informativas (`NÃO SOMA`).

### Fora

Simulado · Orçamento · Gráfico · Imprimir · Ind.A / Ind.B / FCont · drill-down ·
autenticação e login · abas 1-Compra, 2-Vendas, 3-Logística, 5-Financeiro, 6-Fiscal.

**Também fora: o log de execução.** A 9815 grava uma linha em `tab_log_exec_rotina` ao fim de
cada apuração; a web não grava. Isso permite rodar todo o piloto com **usuário Oracle
somente-leitura** — a aplicação nova fica incapaz de alterar qualquer coisa na base de
produção enquanto validamos os números. O log volta depois, com sequence própria, se fizer
falta.

Também fora, os checkboxes do Winthor que não aparecem no mockup: `Deduzir ST`,
`Deduzir PIS/COFINS`, `Mostrar Cli.Especial`, `Mostrar Contas Zeradas`,
`Mostrar Investimento`, `Mostrar NÃO PAGO`. O SQL é reproduzido com a combinação capturada no
trace, que vira o comportamento fixo da versão web.

O **drill-down** é a primeira coisa depois da tabela pronta.

---

## 3. Tela

Referência visual: `docs/Resultado das consultas na rotina oficial/prints/Como deve ser a rotina em web.png`.

Rota **`/dre-gerencial`**. Sem login, a raiz redireciona direto para ela.

### 3.1 Filtros

| Filtro | Controle | Origem dos valores |
|---|---|---|
| **Filial** | multisseleção | `GET /api/dre-gerencial/filiais` — **as 18**, ordenadas por `ORDEM_PROCESSA` |
| **Regime** | seleção única | Competência (padrão) · Caixa |
| **Tipo de Análise** | seleção única | Grupo de Contas (padrão) · Conta Gerencial · C.Custo Principal · Centro de Custo |
| **Período** | intervalo de datas | com atalhos: Ontem · Mês Passado · Últimos 3 Meses · Ano Passado |

Botão **Aplicar** dispara a apuração. Nada é apurado enquanto o usuário mexe nos filtros —
a consulta é cara demais para rodar a cada tecla.

**Não existe tela de pré-seleção de filiais.** No Winthor ela aparece antes de abrir a rotina;
aqui a seleção acontece no próprio filtro.

### 3.2 Tabela

Colunas: `Descrição` · `Valor` · `AV %` · `AH %`. Com mais de um mês no período, um bloco de
colunas por mês, mais o bloco de total.

| Elemento | Regra |
|---|---|
| Ordem das linhas | `EPCPARDRE.ID`, com `NULLS LAST` |
| Linhas totalizadoras | `INFCONTAS = 'S'` — 9 linhas, com destaque |
| Cor da linha | `EPCPARDRE.COR` convertido de `TColor` (BGR) para CSS |
| Valor negativo | vermelho, entre parênteses, como no Winthor |
| `NÃO SOMA` | marcador nas linhas que não entram nos totais |
| Números | fonte monoespaçada tabular, alinhados à direita |

**Base do `AV %`:** `RECEITAS LIQUIDAS = 100%`.
**`AH %`:** compara com o mês anterior do período; com um mês só, `0,00`.

### 3.3 Estados

| Estado | Comportamento |
|---|---|
| Inicial | filtros preenchidos com o padrão, tabela vazia, convite a aplicar |
| Apurando | indicador de progresso **com aviso de que pode levar minutos** |
| Erro | mensagem do `ApiResponse.mensagem`, filtros preservados |
| Vazio | "nenhum lançamento no período", não uma tabela em branco |

---

## 4. API

Rota base `/api/dre-gerencial`. Toda resposta no envelope `ApiResponse<T>`.

### `GET /filiais`

Popula o filtro Filial. Sem parâmetros.

```json
{ "sucesso": true, "dados": [
  { "codFilial": "7", "label": "EPC-MAT", "empresa": "EPC", "empresaCodigo": "1",
    "unidade": "EPC - EPC - MAT", "uf": "MG", "ordem": 0 }
] }
```

`empresa` é `EMPRESA.DESCRICAO` — o nome exibido no filtro. `empresaCodigo` é a chave
numérica, útil para agrupar sem depender do texto. ✅ **Implementado e conferido em
28/08/2026: 18 filiais, de `EPC-MAT` (ordem 0) a `EPC-TRANSP` (ordem 31).**

**`codFilial` é `string`, não número.** Em todo o trace da 9815 o código aparece entre aspas
(`CODFILIAL IN ('7','12','25')`) e no Winthor a coluna é `VARCHAR2`. Converter para inteiro
descartaria um eventual zero à esquerda, e o valor deixaria de casar no `IN` da consulta —
a mesma armadilha que derrubou a análise por Centro de Custo.

### `POST /apuracao`

`POST`, não `GET`: a lista de filiais é multivalorada e o corpo fica mais legível que uma
querystring longa.

```json
{
  "filiais": ["7", "12", "25"],
  "dataInicio": "2026-08-01",
  "dataFim": "2026-08-27",
  "regime": "competencia",
  "analise": "grupo-contas"
}
```

Resposta:

```json
{
  "sucesso": true,
  "dados": {
    "periodos": [{ "mesAno": "08/2026", "rotulo": "Agosto/2026" }],
    "linhas": [
      {
        "chave": "-1",
        "descricao": " (+) RECEITA BRUTA",
        "totalizadora": true,
        "naoSoma": false,
        "cor": "#FFFF00",
        "valores": [{ "mesAno": "08/2026", "valor": 41129821.87, "av": null, "ah": null }],
        "total": { "valor": 41129821.87, "media": 41129821.87, "av": null }
      }
    ],
    "avisos": ["EXISTEM (1) LANÇAMENTOS COM DIVERGÊNCIA NO RATEIO CC"],
    "apuradoEm": "2026-08-28T09:14:00-03:00",
    "duracaoMs": 57000
  }
}
```

**`chave` é `string`**, sempre — nunca número. É a decisão que elimina o defeito do Centro de
Custo (ver §6).

### Validações → `Result<T>`

| Regra | Retorno |
|---|---|
| Nenhuma filial selecionada | `Invalido` |
| `dataFim` anterior a `dataInicio` | `Invalido` |
| Período maior que 12 meses | `Invalido` — protege o banco |
| `regime` ou `analise` fora do domínio | `Invalido` |

---

## 5. Regras de negócio

Replicadas do Delphi. Cada uma tem origem rastreável no trace.

### Cabeçalho — aritmética verificada

Conferida contra 4 cenários exportados; bate ao centavo.

```
RECEITAS LIQUIDAS = RECEITA BRUTA − ABAT./DESC. − DEVOLUCAO
LUCRO BRUTO       = RECEITAS LIQUIDAS − CMV LIQ.
```

**ST, PIS e COFINS não entram no cálculo** — são informativas, e recebem o marcador
`NÃO SOMA` na tela. Deduzi-las erra o resultado em milhões.

Os checkboxes `Deduzir ST` e `Deduzir PIS/COFINS` do Winthor mudariam isso; estavam
desmarcados em todas as capturas, e a web replica o comportamento desmarcado.

| Linha | Coluna da consulta de faturamento |
|---|---|
| `(+) RECEITA BRUTA` | `VLTABELA` |
| `(-) ABAT./DESC.` | `VLTABELA − VLVENDA` |
| `(-) DEVOLUCAO` | `VLDEVOLUCAO` |
| `(=) RECEITAS LIQUIDAS` | `VlVendaLiq` — a consulta já calcula |
| `(-) ST` · `(-) PIS` · `(-) COFINS` | `ST_Liq` · `PIS_Liq` · `COFINS_Liq` — **não somam** |
| `(=) CMV LIQ.` | `VLCUSTOFIN − VLCUSTOFINDEVOL` |

### Despesas

1. Fonte `PCLANC`, com `DTPAGTO IS NOT NULL` — **despesa não paga nunca entra**, nem em
   competência. Confirmado como correto pelo negócio.
2. Só contas com `PCCONTA.GRUPOCONTA >= 200`.
3. Havendo rateio em `PCRATEIOCENTROCUSTO`, o valor rateado **substitui** o do lançamento.
4. Despesa entra com sinal invertido (`* -1`).
5. Exclui `HISTORICO like 'REF.CANCEL.BORDERO JA BAIXADO'`.
6. Exclui adiantamentos já quitados.
7. Exclui contas de `EPCPARDRE_NAOEXIBIR`.
8. Sem centro de custo: `9998` (*NÃO INFORMADO*) ou `9999` (*NÃO USA CENTRO DE CUSTO*),
   conforme `PCCONTA.USARATEIOCENTROCUSTO`.

### Regime

| Regime | Filtro em `PCLANC` |
|---|---|
| Caixa | `nvl(DTPAGTO, DTVENC)` |
| Competência | `DTCOMPETENCIA` |

Receita, deduções e CMV são **idênticos** nos dois regimes.

**O mês da coluna acompanha o regime:** caixa distribui por `nvl(DTPAGTO, DTVENC)`, competência
por `nvl(DTCOMPETENCIA, DTVENC)`. A rotina é coerente — a "suspeita de defeito" que eu havia
registrado aqui não procedia (ver correção no levantamento, §4.7).

### Dimensão de análise

Só a expressão de agrupamento muda. Antes do Lucro Líquido (`AntesLF = 'N'`), sempre por conta:

| Análise | Agrupamento (`AntesLF = 'S'`) |
|---|---|
| Grupo de Contas | `codgrupo` |
| Conta Gerencial | `codconta` |
| C.Custo Principal | `NVL(codccprinc, 99)` |
| Centro de Custo | `CODCENTROCUSTO` |

### Faturamento e CMV

Uma consulta agregada. Vendas por `PCNFSAID.DTSAIDA`, devoluções por `PCNFENT.DTENT`.
Códigos fiscais, `CONDVENDA` e cliente especial conforme o levantamento §4.8.

### Estrutura das linhas

Vem de `EPCPARDRE`, ordenada por `ID`. Contas com movimento e sem parametrização aparecem
**depois** do LUCRO LIQUIDO e não somam. A linha com `ID` nulo cai no mesmo bloco.

---

## 6. O que muda em relação ao Winthor

### Centro de Custo passa a funcionar

Hoje falha sempre, com `ORA-00923`. A causa é um parêntese sobrando no SQL montado pelo
Delphi — e, atrás dele, um `ORA-01722` esperando, porque o código de centro de custo tem até
dois separadores e não sobrevive a `TO_NUMBER`.

**Correção de projeto: a chave de agrupamento é `VARCHAR2`.** Sem `TO_NUMBER` no caminho, o
defeito deixa de existir por construção. Grupo e conta entram via `TO_CHAR`.

> Como a análise por Centro de Custo nunca funcionou, **não há resultado antigo para comparar**.
> Esta é a única dimensão cujos números precisarão de validação manual com o negócio.

### Apuração deixa de levar minutos

| Cenário | Winthor |
|---|---|
| 1 mês, 3 filiais | 00:00:57 |
| 2 meses, 3 filiais | 00:04:59 |
| 4 meses (projeção) | 8 a 10 minutos |

Três causas, atacáveis sem mudar resultado:

1. A consulta de faturamento roda **uma vez por mês**. Uma passada agrupando por mês resolve.
2. `UNION ALL` por filial — com 18 filiais seriam 18 blocos. `CODFILIAL IN (:lista)` resolve.
3. A conferência de rateio roda **duas vezes**, e a primeira com período hardcoded
   `01/02/2012 a 31/12/2012` e `codfilial = 7`, ignorando os filtros da tela. Resíduo legado:
   remover.

Nenhuma dessas mexe em regra de cálculo. Qualquer uma que altere um centavo é revertida.

### Interface

| Winthor | Web |
|---|---|
| Tela de pré-seleção de filiais antes de abrir | seleção no próprio filtro, com as 18 |
| Grade estilo planilha | tabela responsiva, tema escuro |
| Sem atalhos de período | Ontem · Mês Passado · Últimos 3 Meses · Ano Passado |
| Linhas soltas após o LUCRO LIQUIDO | mesmas linhas, marcadas com `NÃO SOMA` |
| 12 checkboxes | 4 filtros |

### O que continua igual, de propósito

Valores, ordem das linhas, cores, quais linhas somam, o comportamento do regime e os problemas
de dado de `EPCPARDRE`. Tudo replicado.

---

## 7. Plano da Fase 4

Em incrementos revisáveis, um por vez:

| # | Entrega | Como valido |
|---|---|---|
| 1 | `GET /filiais` | ✅ **conferido em 28/08/2026** — 18 filiais, de EPC-MAT (0) a EPC-TRANSP (31) |
| 2 | Estrutura do DRE a partir de `EPCPARDRE` | ✅ **conferido em 28/08/2026** — Grupo de Contas bate com o print: ordem, rótulos e cores. As linhas a mais são as zeradas, que o print esconde. As outras 3 dimensões têm SQL próprio (§4.4.1 do levantamento) |
| 3 | Despesas (`GetValorGrupo`) | ✅ **conferido em 28/08/2026** — as 15 linhas batem ao centavo, incluindo o bloco de contas órfãs |
| 4 | Faturamento e CMV | cabeçalho bate com a planilha |
| 5 | Montagem do DRE completo | os 6 cenários batem linha a linha |
| 6 | Filtros na tela | — |
| 7 | Tabela | comparação visual com o print |
| 8 | Multi-mês, `AV` e `AH` | cenário de 2 meses bate |
| 9 | Centro de Custo | validação manual com o negócio |

Cada incremento pronto: eu escrevo a query, **você executa no banco**, e comparamos com a
planilha antes de seguir.

---

## 8. Pendências — todas fechadas em 28/08/2026

| # | Assunto | Decisão |
|---|---|---|
| 1 | Linha injetada por `PCNFSAID` + `PCPREST` | **REVISTO em 28/08/2026.** Não há descarte. A chave muda conforme a dimensão — `400` (Grupo de Contas), `4000004` (Conta Gerencial), `85` e `8501` (centro de custo) — e corresponde a linha existente do DRE. Em Grupo de Contas entra sob *Outras Receitas*, depois do RESULTADO OPERACIONAL. **Replicar o `UNION ALL` como está** |
| 2 | `AntesLL` e `AntesLF` com condição idêntica | **Sem impacto.** Calcular uma vez, expor com os dois nomes para rastreabilidade |
| 3 | Mapa das linhas de cabeçalho para as colunas de faturamento | **Resolvido** por aritmética sobre as planilhas — ver §5, *Cabeçalho* |
| 4 | Log de execução | **Fora do piloto.** A web não grava `tab_log_exec_rotina`, o que permite rodar com usuário Oracle **somente-leitura** durante toda a validação. Volta depois, com sequence, se fizer falta |

---

## 9. A chave de uma linha do DRE

Descoberto em 28/08/2026, ao comparar a consulta de despesas original com a adaptada.

**A identidade de uma linha não é a chave sozinha.** É a combinação:

```
(GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO)
```

O `GROUP BY` externo do `GetValorGrupo` inclui as três flags, e a consulta de estrutura
agrupa pelos mesmos campos. O mesmo grupo aparece **mais de uma vez** no relatório com flags
diferentes — `Despesas Adm e Vendas` (chave `300`) surge antes do `RESULTADO OPERACIONAL`
(`ID 18`, `AntesRO = 'S'`) e de novo depois dele (`ID 1249`, `AntesRO = 'N'`), com valores
distintos.

| Chave | Ocorrências na estrutura |
|---|---|
| `300` — Despesas Adm e Vendas | `ID 18`, `ID 1249`, e a de `ID` nulo |
| `301` — Receitas Financeiras | `ID 144`, `ID 1248` |
| `302` — Despesas Financeiras | `ID 153`, `ID 1261` |
| `303` — Despesas Encargos / Impostos | `ID 32`, `ID 1269`, `ID 1348` |
| `400` — Outras Receitas | `ID 577`, `ID 1239` |

> **Consequência para a implementação:** casar estrutura com valores apenas por
> `GRUPOCONTA` faria as duas linhas receberem o mesmo número — e o total do DRE ficaria
> errado sem nenhum erro aparente. O dicionário de valores tem que ser indexado pela
> tupla completa.

---

## 10. Aritmética dos totalizadores — verificada

Deduzida e conferida em 28/08/2026 contra a exportação de parâmetros conhecidos
(`docs/Resultado das consultas na rotina oficial/periodo_conhecido_01-08_a_27-08_competencia/`).
As quatro identidades batem ao centavo.

```
RECEITAS LIQUIDAS  = RECEITA BRUTA − ABAT./DESC. − DEVOLUCAO
LUCRO BRUTO        = RECEITAS LIQUIDAS − CMV LIQ.

Sub-Total Desp.Op. = Σ linhas com AntesRO = 'S'          (fora o cabeçalho)
RESULTADO OPER.    = LUCRO BRUTO + Sub-Total
Total das Despesas = Sub-Total + Σ linhas com AntesRO = 'N' e AntesLL = 'S'
LUCRO LIQUIDO      = LUCRO BRUTO + Total das Despesas
```

Conferência no cenário 01/08 a 27/08/2026, competência, filiais 7/12/25:

| Linha | Cálculo | Planilha |
|---|---|---|
| Sub-Total | −8.395.125,78 | (8.395.125,78) |
| RESULTADO OPERACIONAL | 9.847.583,27 − 8.395.125,78 = 1.452.457,49 | 1.452.457,49 |
| Total das Despesas | −8.395.125,78 + 980.109,22 = −7.415.016,56 | (7.415.016,56) |
| LUCRO LIQUIDO | 9.847.583,27 − 7.415.016,56 = 2.432.566,71 | 2.432.566,71 |

**As flags são o que separa os blocos.** `AntesRO = 'S'` é o corpo operacional;
`AntesRO = 'N'` com `AntesLL = 'S'` é o bloco entre RESULTADO OPERACIONAL e Total das
Despesas; `AntesLL = 'N'` é o bloco informativo depois do LUCRO LIQUIDO, que **não entra em
totalizador nenhum** — é o que a tela marca como `NÃO SOMA`.

### O bloco informativo ignora "Mostrar Contas Zeradas"

`CONTRATO DE MUTUO` aparece com `0,00` mesmo na exportação **sem** contas zeradas, enquanto
linhas zeradas do corpo (`VERBAS P&G`, `% SALDO FINAL`, …) somem. O filtro de zeradas vale
para as linhas parametrizadas, não para as órfãs.
