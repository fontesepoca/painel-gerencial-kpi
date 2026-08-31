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

**Base do `AV %` — são DUAS bases**, verificado em 28/08/2026:

| Linhas | Base |
|---|---|
| `(-) ABAT./DESC.`, `(-) DEVOLUCAO`, `(-) ST`, `(-) PIS`, `(-) COFINS` | **RECEITA BRUTA** |
| de `(=) RECEITAS LIQUIDAS` para baixo, inclusive | **RECEITAS LIQUIDAS** |
| `(+) RECEITA BRUTA` | sem `%AV` |

Usar a receita líquida nas cinco deduções daria 8,659 no lugar de 7,742 em ABAT./DESC.

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
| 2 | Estrutura do DRE a partir de `EPCPARDRE` | ✅ **conferido em 28/08/2026** — ordem, rótulos e cores batem. As outras 3 dimensões têm SQL próprio (§4.4.1 do levantamento) |
| 5a | Contas órfãs na estrutura | ✅ **conferido em 28/08/2026** — zero divergências contra o SQL original, e 123 linhas contra as 123 da exportação limpa (§11) |
| 3 | Despesas (`GetValorGrupo`) | ✅ **conferido em 28/08/2026** — as 15 linhas batem ao centavo, incluindo o bloco de contas órfãs |
| 4 | Faturamento e CMV | ✅ **conferido em 28/08/2026** — as 9 colunas batem ao centavo |
| 5b | Montagem do DRE completo | ✅ **conferido em 28/08/2026** — 123 linhas, zero divergência de valor e de %AV, contra exportação com parâmetros e horário conhecidos |
| 6 | Filtros na tela | — |
| 7 | Tabela | comparação visual com o print |
| 8 | Multi-mês, `AV` e `AH` | 🔄 implementado; conferir o cenário de 2 meses |
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

---

## 11. Duas armadilhas da validação contra a 9815

Descobertas em 28/08/2026, ao conferir o incremento 5a. Nenhuma é defeito nosso, mas as duas
invalidam uma comparação se ignoradas.

### A grade da 9815 não é limpa entre apurações

A primeira exportação com contas zeradas trouxe **124 linhas**; a segunda, feita depois de
fechar e reabrir a rotina, trouxe **123** — as mesmas 123 da nossa estrutura. A linha a mais
era `Verba Ind Merc Vencida e Avaria` (conta `3000165`), resíduo de uma execução anterior.

Que não veio daquela apuração é demonstrável: a conta está parametrizada em `EPCPARDRE` e tem
vínculo em `PCCONTACENTROCUSTO`, então o `NOT IN` do par a exclui da estrutura; e como está
antes do `LUCRO LIQUIDO`, o `GetValorGrupo` a agrupa no grupo `300` em vez de emiti-la. As
duas consultas a excluem.

> **Decisão: não replicar.** A regra de fidelidade cobre regra de negócio, não estado sujo de
> tela. Linha remanescente de execução anterior não é reproduzível de forma determinística
> numa API sem sessão, e reproduzi-la seria copiar um defeito de interface.
>
> **Protocolo de conferência:** feche e reabra a 9815 antes de exportar uma referência.

### A base é produção viva

Duas exportações dos **mesmos parâmetros**, com cerca de uma hora de intervalo:

| Linha | Antes | Depois | Δ |
|---|---|---|---|
| `(-) DEVOLUCAO` | 1.178.713,60 | 1.178.684,15 | −29,45 |
| `(=) RECEITAS LIQUIDAS` | 37.017.463,39 | 37.017.492,84 | +29,45 |
| `(=) CMV LIQ.` | 27.169.880,12 | 27.169.901,73 | +21,61 |
| `Despesas Adm e Vendas` | 7.808.400,86 | 7.832.168,86 | +23.768,00 |

Uma devolução foi ajustada e quase 24 mil em despesas foram lançados no intervalo.

> **Protocolo de conferência:** exportação da 9815 e chamada da API têm que ser feitas
> **em sequência, com minutos de diferença**. Comparar uma exportação da manhã com uma
> chamada da tarde produz divergência que não é erro de código — e a caçada ao "bug"
> inexistente custa horas.
>
> Os incrementos 3 e 4 bateram ao centavo justamente porque a chamada veio logo após a
> exportação.

---

## 12. A execução mensal do faturamento é otimizável — provado

A 9815 roda a consulta de faturamento **uma vez por mês** do período. Trocar isso por uma
passada única sobre o intervalo inteiro parecia otimização óbvia, mas havia motivo concreto
para desconfiar: `DATE` no Oracle carrega hora, e o recorte mensal da rotina vai de
`01/06 00:00` a `30/06 00:00` e de `01/07 00:00` a `31/07 00:00`. Uma venda em 30/06 às 14h
não cairia em nenhum dos dois, enquanto a passada única a incluiria — e a diferença não seria
desempenho, seria **número diferente**.

Verificado em 28/08/2026, em duas frentes:

| Verificação | Resultado |
|---|---|
| Hora nas colunas de data, no período (`docs/validacao/inc8_horas_nas_datas.sql`) | `DTSAIDA` 70.435 linhas · `DTENT` 13.245 · `DTPAGTO` 30.922 — **zero com hora** |
| Duas execuções mensais somadas vs. uma única (`inc8_mensal_vs_periodo.sql`) | **zero divergências** |

Como as colunas guardam sempre meia-noite, o recorte mensal é exato e a passada única é
equivalente. A otimização está liberada, e com 4 meses o faturamento deixa de custar 4×.

> **Se um dia essas colunas passarem a gravar hora**, essa equivalência cai — e a 9815
> passaria a perder movimento na virada de cada mês. Vale reexecutar
> `inc8_horas_nas_datas.sql` antes de confiar nesta seção em outra base ou outro período.

---

## 13. Arredondamento, `%AH` do primeiro mês e `%AV` do total

Três comportamentos descobertos ao conferir o cenário de dois meses (01/06 a 31/07/2026)
contra a exportação da 9815. Nenhum aparecia com um mês só.

### O total soma os meses já arredondados

A rotina leva **cada mês para duas casas antes de totalizar**. Somar a precisão cheia e
arredondar no fim produz um centavo a mais:

```
ABAT./DESC.   mês 1  -3.485.531,6636  →  a 9815 usa  -3.485.531,66
              mês 2  -4.033.440,4935  →              -4.033.440,49
                                          soma dos arredondados = -7.518.972,15  ← a planilha
              soma da precisão cheia = -7.518.972,1571 → arredonda para -7.518.972,16  ✗
```

O arredondamento é **half-to-even**, o padrão do `Math.Round` do .NET: a média
`-1.477.974,065` vira `-1.477.974,06`, e `-110.608,085` vira `-110.608,08`. Meio-para-cima
daria `,07` e `,09`.

A média é `total ÷ nº de meses`, arredondada depois da divisão.

### `%AH` do primeiro mês é zero, não vazio

Não há mês anterior para comparar, mas a 9815 escreve `0,00` na coluna inteira do primeiro
mês. Vazio fica reservado para outra situação:

| Caso | `%AH` |
|---|---|
| Primeiro mês do período | `0,00` |
| Mês anterior igual a zero | **vazio** — `AJUSTE ESTOQUE ALMOXARIFADO` sai de `0,00` para `43.490,64` e a célula fica em branco |
| Mês atual zero, anterior não | `(100,000)` — `Receitas Financeiras` cai de `477.269,87` para `0,00` |

### O bloco TOTAL não tem `%AV` nas deduções

Nas colunas mensais, `ABAT./DESC.`, `DEVOLUCAO`, `ST`, `PIS` e `COFINS` têm `%AV` sobre a
RECEITA BRUTA. **No bloco TOTAL, essas cinco vêm vazias** — o preenchimento começa em
`RECEITAS LIQUIDAS`, junto com `RECEITA BRUTA`, que nunca exibe percentual.
