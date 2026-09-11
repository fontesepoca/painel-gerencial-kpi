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
- Marcação visual das linhas informativas (selo `INFORMATIVO`).

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

Rota **`/dre-gerencial`**. Sem login, a raiz redireciona direto para ela. Há uma segunda
rota, `/dre-gerencial/detalhe/[id]`, que mostra um detalhamento já apurado — ver §16.5.

**Controles da tela, e onde cada um está documentado:**

| Controle | Onde fica | Seção |
|---|---|---|
| Tema claro/escuro e leitura ampliada | cabeçalho da aplicação | — |
| Mostrar contas zeradas | cabeçalho da tabela | §3.3 |
| Tela cheia | cabeçalho da tabela | §18 |
| Imprimir | cabeçalho da tabela | §17 |
| Punho de arrastar e `Alt`+`↑`/`↓` | primeira coluna | §15 |
| Duplo clique no valor | células de valor | §16 |

### 3.1 Filtros

| Filtro | Controle | Origem dos valores |
|---|---|---|
| **Filial** | multisseleção | `GET /api/dre-gerencial/filiais` — **as 9 apuráveis**, ordenadas por `ORDEM_PROCESSA` |
| **Regime** | seleção única | Competência (padrão) · Caixa |
| **Tipo de Análise** | seleção única | Grupo de Contas · Conta Gerencial · C.Custo Principal (padrão) · Centro de Custo |
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
| `INFORMATIVO` | marcador nas linhas que não entram nos totais — a 9815 escreve `NÃO SOMA` |
| Números | fonte monoespaçada tabular, alinhados à direita |

**Base do `AV %` — são DUAS bases**, verificado em 28/08/2026:

| Linhas | Base |
|---|---|
| `(-) ABAT./DESC.`, `(-) DEVOLUCAO`, `(-) ST`, `(-) PIS`, `(-) COFINS` | **RECEITA BRUTA** |
| de `(=) RECEITAS LIQUIDAS` para baixo, inclusive | **RECEITAS LIQUIDAS** |
| `(+) RECEITA BRUTA` | sem `%AV` |

Usar a receita líquida nas cinco deduções daria 8,659 no lugar de 7,742 em ABAT./DESC.

**`AH %`:** compara com o mês anterior do período; com um mês só, `0,00`.

**A cor do `AH %` julga o efeito no resultado, não o sinal do número.** Decisão do Gabriel
em 11/09/2026, replicando o que a 9815 sempre fez:

| Linha | `AH %` | Leitura |
|---|---|---|
| `(+) RECEITA BRUTA` | `+4,424` | favorável — receita subiu |
| `(+) RECEITA BRUTA` | `(5,636)` | desfavorável — receita caiu |
| `(-) DEVOLUCAO` | `(9,778)` | **favorável** — devolução caiu |
| `(-) DEVOLUCAO` | `+42,766` | desfavorável — devolução subiu |

A devolução é o caso que define a regra: `(9,778)` é um número negativo, entre parênteses,
e é a melhor notícia da coluna. Até 11/09/2026 a tela pintava de vermelho tudo que fosse
negativo, e com isso invertia a leitura de **metade da tabela** — toda dedução e toda
despesa.

**O sentido sai do sinal do valor da linha**, não de uma lista de contas: no DRE, receita e
resultado chegam positivos, e dedução, custo e despesa chegam negativos. A estrutura já
separa o que é bom crescer do que é ruim crescer, e uma lista de nomes envelheceria a cada
conta nova no cadastro. A regra cabe numa frase — *favorável quando o `AH %` tem o mesmo
sinal do valor da linha* — e se estende ao prejuízo, que é o caso que ninguém quer ver e
que precisa ler certo: resultado negativo ficando mais negativo dá `AH %` positivo, mesmo
sinal do valor, e sai desfavorável.

O sentido vem do **total do período**, não do valor da coluna: uma conta que oscila de sinal
entre dois meses trocaria de cor no meio da tabela se cada coluna se julgasse sozinha.

**Zero é neutro**, e aqui divergimos da 9815 de propósito: a primeira coluna traz `0,00` por
não haver mês anterior (§13), e pintá-la com a cor de "favorável" anunciaria uma boa notícia
em todas as linhas de uma coluna inteira, sem nada ter acontecido.

**A cor não carrega a informação sozinha.** Cada célula julgada leva `title` com *Efeito
favorável/desfavorável ao resultado* — sem isso, quem lê em tons de cinza vê `(9,778)` e
conclui o oposto. O sinal do número mostra a direção; a cor, o juízo.

Conferido na dc22: **60/60**, com as 19 linhas da exportação de junho a agosto de 2026 e a
cor que a rotina antiga deu a cada célula.

### 3.3 Estados

| Estado | Comportamento |
|---|---|
| Inicial | filtros preenchidos com o padrão, tabela vazia, convite a aplicar |
| Apurando | indicador de progresso **com aviso de que pode levar minutos** |
| Erro | mensagem do `ApiResponse.mensagem`, filtros preservados |
| Sem movimento | **o esqueleto zerado**, como na 9815 — ver abaixo |

**Não existe estado "vazio".** A especificação prometia a mensagem *"nenhum lançamento no
período"*; a 9815 não faz isso. Conferido em 31/08/2026 com dezembro/2026 na filial 7, um
mês inteiramente sem movimento: a rotina exporta **as 13 linhas calculadas, todas zeradas** —
as nove do cabeçalho e os quatro totalizadores. Nossa tela mostra exatamente as mesmas 13.

A promessa foi escrita antes de alguém observar o comportamento, e replicá-la seria divergir
sem motivo. O `if (visiveis.length === 0)` do `TabelaDre` fica como defesa para o caso de a
API não devolver linha nenhuma, mas na prática não dispara: linha calculada nunca é escondida.

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

> **Desde 31/08/2026 são 13.** Cinco têm os dados em outra base — `DBLEPCTI` preenchido,
> que é database link — e apurá-las aqui devolveria zero falso. Ver `docs/DIVERGENCIAS.md`,
> seção do filtro de filiais, com o motivo e como reverter.

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

Conferida contra 4 cenários exportados.

```
RECEITAS LIQUIDAS = RECEITA BRUTA − ABAT./DESC. − DEVOLUCAO
LUCRO BRUTO       = RECEITAS LIQUIDAS − CMV LIQ.
```

> **A identidade descreve a origem, não a subtração dos valores exibidos.** As quatro linhas
> vêm da consulta de faturamento como colunas próprias — `RECEITAS LIQUIDAS` é
> `SUM(VLVENDA) − SUM(VLDEVOLUCAO)`, arredondada **uma vez**. Subtrair os valores já
> arredondados na tela pode dar um centavo de diferença.
>
> Observado em 31/08/2026, julho, filiais 7/12/25: `58.925.173,30 − 4.033.440,49 −
> 1.350.947,10` dá `53.540.785,71`, e as duas telas mostram `53.540.785,70`. O mesmo em
> `LUCRO BRUTO`. **Não é divergência**: a exportação da 9815 traz exatamente os mesmos
> valores, porque ela lê as mesmas colunas. Conferir a identidade somando o que está na
> tela leva a um falso positivo.

**ST, PIS e COFINS não entram no cálculo** — são informativas, e recebem o selo
`INFORMATIVO` na tela. Deduzi-las erra o resultado em milhões.

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
| Tela de pré-seleção de filiais antes de abrir | seleção no próprio filtro, com as 9 apuráveis |
| Grade estilo planilha | tabela responsiva, tema escuro |
| Sem atalhos de período | Ontem · Mês Passado · Últimos 3 Meses · Ano Passado |
| Linhas soltas após o LUCRO LIQUIDO | mesmas linhas, marcadas com `INFORMATIVO` |
| 12 checkboxes | 4 filtros |

### O que continua igual, de propósito

Valores, ordem das linhas, cores, quais linhas somam, o comportamento do regime e os problemas
de dado de `EPCPARDRE`. Tudo replicado.

---

## 7. Plano da Fase 4

Em incrementos revisáveis, um por vez:

| # | Entrega | Como valido |
|---|---|---|
| 1 | `GET /filiais` | ✅ **conferido em 28/08/2026** — 18 filiais; **13 desde 31/08/2026**, ver DIVERGENCIAS.md |
| 2 | Estrutura do DRE a partir de `EPCPARDRE` | ✅ **conferido em 28/08/2026** — ordem, rótulos e cores batem. As outras 3 dimensões têm SQL próprio (§4.4.1 do levantamento) |
| 5a | Contas órfãs na estrutura | ✅ **conferido em 28/08/2026** — zero divergências contra o SQL original, e 123 linhas contra as 123 da exportação limpa (§11) |
| 3 | Despesas (`GetValorGrupo`) | ✅ **conferido em 28/08/2026** — as 15 linhas batem ao centavo, incluindo o bloco de contas órfãs |
| 4 | Faturamento e CMV | ✅ **conferido em 28/08/2026** — as 9 colunas batem ao centavo |
| 5b | Montagem do DRE completo | ✅ **conferido em 28/08/2026** — 123 linhas, zero divergência de valor e de %AV, contra exportação com parâmetros e horário conhecidos |
| 6 | Filtros na tela | — |
| 7 | Tabela | comparação visual com o print |
| 8 | Multi-mês, `AV` e `AH` | ✅ **conferido em 28/08/2026** — 145 linhas; valores, `%AV` e `%AH` exatos; MÉDIA com divergência aceita (§14) |
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
totalizador nenhum** — é o que a tela marca como `INFORMATIVO`.

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

Como **essas três** colunas guardam sempre meia-noite, o recorte mensal é exato e a passada
única é equivalente. A otimização está liberada, e com 4 meses o faturamento deixa de custar 4×.

### Nem toda coluna de data guarda meia-noite

Medição de 31/08/2026, `docs/validacao/fase5b_horas_em_dtcompetencia.sql`, junho a agosto:

| Coluna | Onde entra | Linhas | Com hora |
|---|---|---:|---:|
| `PCLANC.DTCOMPETENCIA` | filtro em competência | 56.023 | 0 |
| `PCLANC.DTVENC` | fallback do bucket | 54.070 | 0 |
| **`PCPREST.DTPAG`** | **linha injetada de receita** | 214.800 | **5** |

A generalização anterior — "as colunas guardam sempre meia-noite" — era falsa: valia para as
três que a `inc8` mediu, e ninguém tinha olhado as outras.

Consequência prática das cinco linhas: uma prestação com hora só é perdida quando **o dia
dela é o último do período**, porque nos demais dias `data com hora <= fim` continua
verdadeiro. **Não é divergência** — a 9815 usa o mesmo `To_Date` nas duas pontas e perde as
mesmas cinco. Mas é falso dizer que o recorte é exato para toda coluna.

> Ao levar isto para outra base ou outro período, reexecute **as duas** medições. E prefira
> medir a coluna que a consulta realmente usa, em vez de generalizar a partir das vizinhas.

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

---

## 14. Divergência aceita: a coluna MÉDIA, em um centavo

> O catálogo completo de divergências está em [DIVERGENCIAS.md](DIVERGENCIAS.md).
> Esta seção é o detalhamento de uma delas.

Conferido em 28/08/2026, cenário de dois meses (01/06 a 31/07/2026, competência, Grupo de
Contas, filiais 7/12/25), 145 linhas × 9 campos = 1305 células comparadas.

| Campo | Divergências |
|---|---|
| Valor de cada mês | 0 |
| `%AV` de cada mês | 0 |
| `%AH` de cada mês | 0 |
| Valor do TOTAL | 0 |
| `%AV` do TOTAL | 0 |
| **`MÉDIA` do TOTAL** | **9, todas de um centavo** |

### Por que não fecha

O arredondamento da 9815 nessas nove linhas não segue modo nenhum: sete sobem em módulo,
duas descem. Três hipóteses testadas:

| Hipótese | Falhas em 145 |
|---|---|
| Soma dos arredondados ÷ n, half-to-even — o que fazemos | 9 |
| Aritmética em `double` | 2 |
| Soma crua ÷ n | 7 |

O padrão é assinatura do tipo de ponto flutuante interno do Delphi, provavelmente `Extended`
de 80 bits. O .NET não tem equivalente, e as nove linhas caem todas em ponto médio exato
(`x,xx5`), onde a menor diferença de representação decide o arredondamento.

### O mecanismo, medido em 31/08/2026

Com dois meses, `MÉDIA = TOTAL ÷ 2`. Um TOTAL com número **ímpar** de centavos cai exatamente
em `x,xx5` — o ponto médio, onde só a regra de desempate decide. Conferido em Conta
Gerencial, 133 linhas:

| | |
|---|---:|
| Linhas com TOTAL de centavo **ímpar** | 60 |
| Linhas com TOTAL de centavo **par** | 73 |
| Divergências em linha ímpar | **32** |
| Divergências em linha par | **0** |

Nenhuma linha de centavo par diverge: ali a divisão é exata e não há empate. Das 60 ímpares,
32 divergem — praticamente metade, o esperado quando duas regras de desempate diferentes
decidem cada empate de forma independente.

Isso explica a diferença de taxa entre as dimensões (6% em Grupo de Contas, 24% em Conta
Gerencial): não é a dimensão, é quantos totais caem em centavo ímpar naquele conjunto.

### Por que é aceitável

`MÉDIA` é coluna derivada — `TOTAL ÷ número de meses`. Não entra em identidade contábil
nenhuma: não afeta receita, deduções, CMV, despesas, os totalizadores nem os percentuais.
Um leitor que precise da média exata tem o TOTAL e o número de meses na tela.

Reproduzir o comportamento exigiria trocar `decimal` por `double` em cálculo financeiro — e
mesmo assim erraria em 2 linhas. Um centavo documentado numa coluna auxiliar é troca melhor
que ponto flutuante em valores de dinheiro.

> **Se um dia isso importar**, o caminho é medir em qual coluna o negócio realmente confia.
> Se a MÉDIA for lida para decisão, vale reabrir; se for enfeite de relatório, fica como está.

## 15. Reordenar linhas — preferência de leitura, nunca de cálculo

A tabela deixa arrastar linhas para a ordem que o usuário preferir. Três decisões
estruturam isso, e a primeira é a que importa para a regra de fidelidade:

> **Arrastar move uma linha, sempre.** Até 09/09/2026 um totalizador levava consigo o bloco
> que ele encabeça — ele mais as linhas não-calculadas abaixo, até a próxima calculada —,
> com um interruptor na barra (*Totalizador arrasta o bloco inteiro*) para desligar isso.
> Removido por decisão do Gabriel: mover várias linhas num gesto muda a leitura de todas
> elas de uma vez, e num relatório onde a posição sugere o que compõe o quê, é efeito grande
> demais para um arraste. Saíram o interruptor, o `blocoDe` e o `moverIntervalo`; o `mover`
> que restou foi conferido contra o comportamento anterior em 46 asserções.

**A ordem não entra em cálculo nenhum.** Os totalizadores somam pelas marcações do
cadastro (`ANTESRO`, `ANTESLL`, `ANTESLF`), no `MontadorDre`, no servidor — muito antes
de a ordem do usuário existir. Reordenar não altera um centavo, e não há caminho pelo
qual pudesse alterar.

**O que a ordem altera é a leitura.** Uma despesa operacional arrastada para baixo de
`RESULTADO OPERACIONAL` continua compondo o subtotal, mas passa a *parecer* que está
fora dele. Quem imprimir a tabela vê uma coisa e a conta faz outra. Por isso:

- movimento que muda essa relação abre um aviso antes de aplicar, dizendo de onde a
  linha sai, onde vai parar e quais despesas passam a aparecer fora do total que compõem;
- a linha deslocada carrega o selo `FORA DO BLOCO` enquanto estiver assim;
- o botão *Restaurar ordem do cadastro* desfaz tudo de uma vez.

O critério do selo é o **conjunto de linhas calculadas abaixo da linha** — o que ela
parece compor. Conjunto, não sequência: dois totalizadores trocando entre si não muda
nada para quem está acima dos dois. A primeira versão comparava as duas âncoras
imediatas e acendia o selo em 8 de 10 linhas ao mover um único totalizador; um aviso
que acende em quase tudo não avisa nada.

**A ordem é local e por dimensão.** Fica no `localStorage` do navegador, na chave
`epoca:dre:ordem:v1:<analise>`, como lista de `chaveOrdem`. Não vai para o banco de
propósito: é preferência de quem está lendo, não cadastro — duas pessoas conferindo o
mesmo DRE não deveriam ver tabelas diferentes porque uma delas arrastou uma linha.

Guardar **chaves**, e não posições, é o que faz a ordem sobreviver a um período novo:
linha sem movimento não volta do banco, e uma linha que não existia quando a ordem foi
salva é inserida logo depois da vizinha que ela seguia no cadastro. A chave é
`LinhaDreDto.ChaveOrdem` — `CODGRUCONTA` mais as três flags, a mesma tupla que o
montador usa para achar o valor da linha. Nem `ID` (é ordem de exibição, e é anulável)
nem `CODGRUCONTA` sozinho (repete entre linhas com flags diferentes) serviriam.

Arrastar tem par no teclado (`Alt` + `↑`/`↓` sobre o punho). Não é formalidade: arrastar
é o gesto que quem tem tremor ou pouca mobilidade não consegue executar, e esta tela
abre em leitura ampliada justamente por ser usada por quem costuma ter essa dificuldade.

**A tabela rola sozinha** quando o arraste chega perto da borda. Sem isso, levar a primeira
linha para o fim de uma tabela de 140 linhas exige soltar no meio do caminho, rolar e pegar
de novo.

O laço é `requestAnimationFrame`, e **não** o próprio `dragover`: este só dispara quando o
ponteiro se move, e segurar a linha parada na beirada — que é justamente o gesto de esperar
a tabela rolar — não gera evento nenhum. A velocidade é por segundo multiplicada pelo tempo
real do quadro, não por quadro, senão um monitor de 144 Hz rolaria ao dobro de um de 72 Hz.

A conta mora em `lib/rolagemAutomatica.ts`, fora do componente, porque é a única parte disto
conferível sem navegador — 20 asserções, incluindo simetria entre subir e descer, saturação
ao passar da borda e independência de taxa de quadros.

| | |
|---|---|
| Faixa sensível | 18% da altura visível, no máximo 72px |
| Na entrada da faixa | 140 px/s — devagar o bastante para mirar |
| Encostado na borda | 1.300 px/s |
| Rampa | ao quadrado; linear, qualquer tremida na entrada já dispara rápido |

---

## 16. Detalhamento — o duplo clique no valor

Duplo clique numa célula de valor abre o detalhamento daquela linha **naquele mês**. O
período é o do mês clicado, recortado pelo período apurado: com 01/08 a 27/08, agosto
detalha 01/08 a 27/08, não o mês calendário.

### 16.1 Quatro telas, e qual linha abre cada uma

| Tela | Linhas que abrem | Consulta |
|---|---|---|
| **Receita por cliente** | `(+) RECEITA BRUTA`, `(=) RECEITAS LIQUIDAS`, `(-) ABAT./DESC.`, `(=) CMV LIQ.` | `ReceitaPorCliente` |
| **Devolução por motivo** | `(-) DEVOLUCAO` | `DevolucaoPorMotivo` |
| **Imposto por produto** | `(-) ST`, `(-) PIS`, `(-) COFINS` | `ImpostoPorProduto` |
| **Lançamentos** | toda linha não-calculada | `Lancamentos` |
| **Composição** | os 5 totalizadores | *nenhuma* — aritmética sobre a resposta |

**A 9815 abre só três dessas linhas** — receita bruta, receitas líquidas e devolução. As
outras nove passaram a abrir na web, e cada acréscimo tem um motivo diferente:

- `ABAT./DESC.` e `CMV LIQ.` reaproveitam a tela de receita, onde as colunas `DESCONTO` e
  `CUSTO Liq` já existiam e já fechavam ao centavo (dc9, 02/09/2026). Era detalhamento
  pronto atrás de um duplo clique que ninguém tinha ligado.
- ST, PIS e COFINS ganharam **consulta própria**, quebrada por produto — ST é imposto de
  item, nasce da classificação fiscal da mercadoria, e é nesse eixo que "por que subiu"
  tem resposta. Decisão do Gabriel em 03/09/2026, entre produto, cliente, nota e fornecedor.
- Os cinco totalizadores mostram **de que linhas o total é feito**. Não passa pelo banco:
  o valor deles é aritmética sobre linhas que já estão na resposta, e perguntar ao Oracle
  de onde vem o `LUCRO LIQUIDO` seria refazer lá uma conta já feita aqui.

As parcelas da composição vão **por referência**, não com o valor copiado: a tela lê o valor
na própria linha citada, e é isso que impede a composição de mostrar um total que discorda
das linhas que ela lista.

### 16.2 Como se chega no total

No topo do detalhamento, um bloco mostra a conta da linha com os valores dela:

```
COMO SE CHEGA NO TOTAL
    ST + FECP das vendas          1.538.087,47
  − ST + FECP das devoluções        100.350,74
  ─────────────────────────────────────────────
  = (-) ST                        1.437.736,73
```

Pedido do dono da empresa em 03/09/2026. A tabela responde "de onde vem"; isto responde
"como se calcula", que é outra pergunta.

**Os números saem das mesmas linhas que a tabela lista**, somando as colunas dela — não há
segunda consulta, e por construção o resumo não pode discordar do que está logo abaixo.

Aparece só onde existe conta: em ST, PIS, COFINS (vendas − devoluções) e em
`RECEITAS LIQUIDAS` (bruta − descontos − devoluções). `RECEITA BRUTA`, `ABAT./DESC.` e
`CMV LIQ.` são cada uma a soma de **uma** coluna, e inventar uma identidade ali faria o
bloco exibir um total que não é o da célula clicada.

Quando o resumo não bate com a célula, aparece um aviso com os dois números. **Não existe
"✓ confere"** — um selo verde em toda abertura vira enfeite, e enfeite é o que o olho
aprende a pular.

### 16.3 Os cabeçalhos, em negrito

Decisão do Gabriel em 10/09/2026: os cabeçalhos do detalhamento precisam se separar dos
dados. Valem para os três que a tela tem — o de coluna, o título `COMO SE CHEGA NO TOTAL`, e
as linhas de grupo dos lançamentos (`Centro Custo Princ`, `Conta`).

| | Antes | Agora |
|---|---|---|
| Peso | `font-medium` (500) | **`font-bold` (700)** |
| Cor | `--text-muted` | `--text-primary` |

**A cor subiu junto, e isso foi medido, não escolhido no escuro.** Com o cabeçalho em
`--text-secondary`, os números do corpo ficavam em `rgb(241,245,249)` e o cabeçalho em
`rgb(203,213,225)`: no tema escuro **mais claro é o que salta**, então o cabeçalho continuava
atrás do dado por mais negrito que tivesse. Igualada a cor, o que separa os dois passa a ser
peso, caixa alta e letter-spacing — e o cabeçalho vem para a frente. Confere nos dois temas:
no claro, `#0f172a` sobre branco em 700 contra o mesmo tom em 400.

Nas linhas de grupo os **dois níveis** ficaram em 700. O que os separa entre si passa a ser o
recuo e a cor; dois pesos diferentes ali competiriam com a distinção que importa, que é
cabeçalho contra dado.

**A tabela do DRE não mudou** — o pedido era o detalhamento. Os cabeçalhos dela seguem em
`font-medium` com `--text-muted`, então as duas telas têm hierarquias diferentes hoje.

### 16.4 Qual coluna é o valor da tabela do DRE

Toda tela de detalhamento tem **uma** coluna cujo somatório é o número que estava na célula
clicada; as demais são contexto. A de imposto tem três colunas de dinheiro e só `Líquido`
fecha, e nada na tela dizia isso — quem abria escolhia pela aparência.

Três coisas dizem qual é, e todas apontam para a mesma:

| | |
|---|---|
| Uma frase acima da tabela | *O valor de `(-) ST` na tabela do DRE é a soma da coluna `(ST) Líquido`.* |
| O cabeçalho da coluna | ganha o nome da linha acima do rótulo — `(ST)` sobre `LÍQUIDO` |
| O rodapé daquela coluna | pintado na cor de destaque, para o olho ligar as duas pontas |

**O nome entra acima do rótulo, não no lugar dele.** Quem confere contra a 9815 procura a
coluna pelo nome que ela sempre teve, e trocar `Líquido` por `ST` faria a coluna sumir para
esse olhar.

**Sem repetir o nome quando já é o mesmo.** `(DEVOLUCAO) Devolução` diria duas vezes a mesma
coisa e ainda sugeriria que são dois números diferentes; a comparação ignora acento, caixa e
pontuação, que é o que separa a grafia da tela nova da grafia da 9815.

A escolha da coluna é decisão pura, mora em `client-new-kpi/lib/colunaDoTotal.ts` e é
testada por `docs/validacao/dc12_coluna_que_fecha_o_total.mjs` — **30 asserções, todas
passando**. Vale um teste porque a tela de receita abre a partir de quatro linhas do DRE
que fecham em quatro colunas diferentes da mesma tabela, e `CMV LIQ.` casa tanto com a
regra do CMV quanto com a de "líquida": apontar a coluna errada seria a tela mentindo com
ar de certeza. Sem saber a linha de origem, **nada é apontado** — é o caso da abertura por
link direto, e um palpite ali seria pior que o silêncio.

### 16.5 Página própria e nova aba

O botão **Abrir em nova aba**, ao lado de Fechar, leva o mesmo detalhamento para
`/dre-gerencial/detalhe/[id]` numa aba nova, deixando a atual como está — com a apuração e
o modal intactos, porque reapurar o DRE custa minutos.

**Não consulta o banco de novo.** O objeto atravessa por `localStorage`, e a escolha não é
arbitrária: memória de módulo é por documento, `sessionStorage` é por aba, e `target=_blank`
implica `noopener` — sem vínculo com a aba de origem, nem a cópia do session storage
acontece. Guarda **só o último** detalhamento, senão uma tarde de trabalho enche a cota.

Quando o dado não está mais disponível, a página **diz isso e manda voltar ao DRE**. Não
busca: um link colado viraria minutos de espera que ninguém pediu, e o número voltaria de
outro instante do banco.

O corpo do detalhamento é o mesmo componente nas duas telas (`CorpoDoDetalhe`). Duas
implementações começariam iguais e divergiriam na primeira correção feita em uma delas.

---

## 17. Impressão

`Ctrl+P` e o botão **Imprimir** passam pelo mesmo caminho — quem reconfigura a página é o
bloco `@media print` do `globals.css`, e o botão só chama `window.print()`.

### 17.1 O que muda no papel

| | |
|---|---|
| Altura | a casca prende tudo na janela; no papel volta a fluxo de bloco e a tabela transborda para as páginas seguintes |
| Cabeçalho | deixa de ser `sticky` — e estático, **o navegador o repete no topo de cada página**, que é o ganho que a tela não tem |
| Tema | forçado a claro no `beforeprint`; impressora descarta fundo, e o escuro sairia texto branco em papel branco |
| Barra de `%AV` | **sai** — empilha sob o número e faz cada célula ter duas linhas de altura |
| Cromo da aplicação | sidebar, trilha, filtros, barra de reordenação e botões saem via `.nao-imprime` |
| Quebra | `break-inside: avoid` na linha: metade dos valores numa folha é linha lida errado |

### 17.2 O papel diz QUAIS filiais foram apuradas

Na tela normal o cabeçalho conta — `2 filiais` —, e isso basta para quem acabou de
preencher o filtro. **No papel e na tela cheia ele lista**, com nome e código:

```
01/09/2026 a 03/09/2026 · Competência · 1 mês · apurado em 21 s
Filiais: EPC-MAT (7), EPC-ES (12)
```

Um DRE impresso circula, é arquivado e é conferido semanas depois, quando ninguém lembra o
que foi marcado. O código vai junto porque é por ele que se confere contra o Winthor, e
porque distingue unidades de nome parecido. Quando são todas as do cadastro o texto diz
isso — `Filiais (todas as 10): …` —, que é o que a lista sozinha não revela.

**Em linha própria, e não como mais um item da sequência.** Na primeira versão a lista
entrava entre o regime e a contagem de meses; com dez filiais ela empurrava os controles da
direita para baixo e o cabeçalho ia de 76px para 138px — 62px que, na tela cheia, saem da
tabela. Numa linha só dela, medido com as mesmas dez: **76px, controles no lugar, sem
rolagem lateral**.

**Quem escolhe é o CSS, não um estado de React** (bloco FILIAIS APURADAS no fim do
`globals.css`). As duas formas ficam no DOM e `@media print` troca qual aparece — `Ctrl+P`
não espera re-render, que é a mesma razão do par de `%AH` em `Variacao`. As regras ficam
**no fim do arquivo** porque disputam `display` com utilitários de mesma especificidade, e
em empate vence quem vem depois.

`display: revert`, e não `block`: a mesma lição de `.so-no-papel` — a classe marca um
`<p>`, e um valor fixo tiraria dele o display que o navegador já dá.

Conferido na dc21 (13/13) e pela tela: a lista some e volta nos três estados, e a invariante
que importa é que **a forma longa cita exatamente as mesmas filiais que a curta conta** —
inclusive um código que o cadastro não conhece, que sai cru em vez de desaparecer.

### 17.3 A folha e a fonte, por número de colunas

Cada valor abaixo é o **maior que coube na medição** de 03/09/2026, com a tabela presa na
largura útil da respectiva folha:

| Meses | Colunas | Folha | Fonte | Sobra | O que estourou |
|---:|---:|---|---|---:|---|
| 1 | 4 | A4 em pé | 13pt | 171px | — |
| 2 | 10 | A3 deitada | 13pt | 38px | 14pt encosta no limite |
| 3 | 13 | A3 deitada | 11pt | 0 | 12pt pede 1.598 de 1.512 |
| 4+ | 16 | A3 deitada | 8,5pt | 0 | 9pt pede 1.530 de 1.512 |

**Com quatro meses a fonte não sobe**, e é aritmética da folha: 16 colunas em 1.512px não
cabem maiores. Quem precisar de fonte maior nesse caso precisa de menos colunas — omitir o
`AH %` do papel é o caminho, e é decisão de negócio.

**Esta tabela foi medida com `AV %` e `AH %` de três casas e a descrição em 15rem.** Desde
09/09/2026 os dois percentuais saem com **uma casa** no papel e a descrição vai a 18rem, o
que muda o balanço de largura — provavelmente para melhor. A recalibragem depende de uma
impressão nova com 3 e 4 meses.

### 17.4 Os percentuais e a descrição, no papel

Três diferenças entre a tela e a folha, e todas nascem da mesma restrição: no papel não há
hover nem rolagem, e cada milímetro decide se a última coluna sai.

| | Tela | Papel |
|---|---|---|
| `AV %` e `AH %` | três casas, como a 9815 | **uma casa** — `19,474` vira `19,5` |
| `% part.` do detalhamento | duas casas | **uma casa** |
| Nome da conta, cliente, produto | cortado com reticências, `title` no hover | **inteiro, quebrando em duas linhas** |

**As duas grafias do número vivem no DOM**, e o CSS escolhe qual sai (`so-na-tela` /
`so-no-papel`). Não é estado trocado no `beforeprint`: aquele evento é onde a impressão já
enganou este projeto uma vez, e um `Ctrl+P` direto não espera por re-render.

**O corte da descrição não estava onde parecia.** O `@media print` já mandava
`white-space: normal` na célula, e o nome continuava saindo com reticências: quem carrega o
`nowrap` é o `truncate` do próprio `<span>`, e propriedade declarada no elemento vence a
herdada do pai. As três propriedades do `truncate` precisam cair juntas — derrubar só o
`white-space` deixa o `overflow: hidden` cortando na segunda linha.

### 17.5 A impressão do detalhamento

**O botão do modal abre a página dedicada e manda imprimir lá.** Um `<dialog>` aberto vive
na *top layer* do navegador, e conteúdo da top layer **não se fragmenta entre páginas**:
`window.print()` no modal sairia com a primeira folha e o resto cortado, o que numa lista de
15 mil clientes é o pior defeito possível. A página é HTML em fluxo normal — pagina, e o
cabeçalho se repete. O parâmetro `?imprimir=1` é o que dispara o diálogo lá, uma vez só.

**A página dedicada também diz as filiais**, e ali aparecem na tela e no papel — ao
contrário do DRE, onde a tela normal fica com a contagem (§17.2). Esta página já é a versão
de tela cheia do detalhamento: tem endereço próprio, é aberta para ler com calma e é
impressa direto, e em nenhuma dessas situações quem lê tem o filtro à vista.

**O texto atravessa junto do detalhamento**, em `DetalheAberto.filiais`, e não é
reconstruído lá. O destino é outra aba, sem o cadastro de filiais em memória: mandá-la
buscar custaria uma requisição só para reescrever uma frase que a aba de origem já tinha, e
abriria a chance de as duas descreverem a mesma apuração com palavras diferentes. O campo é
opcional — um detalhamento guardado antes desta mudança não o tem, e a página abre do mesmo
jeito, sem a linha.

**A folha e a fonte são decididas na hora de imprimir**, medindo a tabela — não há escala
fixa por tela, e a ausência dela é o resultado de quatro tentativas.

`hooks/useEscalaDeImpressao.ts`, no `beforeprint`:

1. **mede** a tabela com 13pt e `width: max-content` — a largura que ela pede quando nada a
   comprime;
2. **escolhe** a menor folha em que ela caiba com pelo menos 13pt, entre A4 em pé (190mm
   úteis), A4 deitada (277mm) e A3 deitada (400mm);
3. **calcula** a fonte por regra de três contra essa largura, com 2% de folga, presa entre
   7pt e 20pt;
4. **aplica** as variáveis inline com `important` e reescreve a regra `@page`, e desfaz tudo
   no `afterprint`.

**Isto não é a armadilha do `beforeprint`.** O erro antigo foi medir naquele evento
esperando as métricas do papel, que ainda não existem. Aqui a medição é de tela por
construção, e a folha entra como número conhecido: 400mm úteis são 1.512px, e isso não
depende de quando o navegador aplica a página.

A folha que o React desenha (`FolhaDaImpressao`, por tipo de tela) é a **folha segura**: se
o ajuste do `beforeprint` não pegar, sobra papel em vez de cortar conteúdo.

#### Quatro tentativas, e por que as três primeiras falharam

Nenhuma falhou de forma visível — todas produziram números plausíveis:

| Tentativa | O que produziu |
|---|---|
| Contar colunas, supondo ≈16mm cada | receita em A3 com 69% de papel branco |
| Medir o PDF impresso, lendo o fluxo errado | receita em A4 em pé, **valores cortados** |
| Medir no navegador, com conteúdo pessimista | folha 2x maior que o necessário |
| Medir a tabela real antes de cada impressão | — |

1. **Contar colunas.** Coluna de data, de nome de cliente e de valor de nove dígitos têm
   larguras que não se parecem; uma média de 16mm não descreve nenhuma delas.
2. **Ler o X errado no PDF.** Concluiu 130mm para a receita, contra ≈316mm reais. Os
   operadores `Tm` lidos eram do bloco "Como se chega no total": o primeiro fluxo de
   conteúdo com texto não é necessariamente o da tabela. E a régua tinha um segundo defeito
   — inferia a escala pelo maior retângulo pintado, que é o fundo da página **até** a tabela
   transbordar, e aí passa a medir com a própria coisa medida. A escala verdadeira está na
   matriz `cm` do fluxo (0,24 nos PDFs do Chrome).
3. **Medir com conteúdo pessimista.** Nomes de 50 caracteres e valores de nove dígitos
   davam 314mm para o imposto por produto; os PDFs reais de 09/09/2026 mostraram ≈150mm.
   Produto chamado `ARROZ 5KG` com valor de seis dígitos não ocupa o que a amostra ocupava,
   e **nada no CSS sabe qual dos dois vem na consulta** — foi este o argumento que encerrou
   a busca por uma escala fixa.

**O que sobra do PDF como fonte de verdade:** o `/MediaBox` (tamanho da folha que saiu) e a
matriz `cm` (a escala). Ambos confiáveis. Largura de conteúdo se mede no navegador.

**O teto de 20pt deixa sobra nas telas estreitas.** A devolução por motivo, com 5 colunas de
dado curto, aceitaria fonte maior que qualquer relatório deveria ter: ela enche cerca de dois
terços da A4 em pé e para ali. É limite tipográfico, não de folha — e a alternativa, esticar
a tabela, devolveria o vão de papel entre o nome e o número que a §17.1 existe para evitar.

A tabela **não estica** para a largura da folha. Com `width: 100%` as colunas se espalhavam
e o olho atravessava um vão de papel branco para ligar o nome da conta ao número dela;
encostadas à esquerda, ficam vizinhas.

### 17.6 Duas armadilhas de `@page`, as duas com o mesmo sintoma

Ambas produzem **A4 em pé com a tabela cortada**, que é o que se vê quando a regra de
tamanho é descartada:

1. **`A2` não existe em CSS.** Os nomes de tamanho param no A3 — A5, A4, A3, B5, B4,
   JIS-B5, JIS-B4, letter, legal, ledger. Nome desconhecido invalida a declaração inteira.
   Provado no navegador: `@page { size: A2 landscape }` volta como `@page { }`, enquanto
   `A3 landscape` e `594mm 420mm` sobrevivem.
2. **Páginas nomeadas** (`@page nome` + `page: nome`) têm suporte irregular.

Por isso o tamanho **não está no CSS**: é escrito pelo componente `FolhaDaImpressao`, numa
regra `@page` só, com a medida em milímetros — sem nome de tamanho e sem página nomeada.

Descartado no caminho: calcular uma escala no `beforeprint`. Esse evento dispara **antes**
de o navegador aplicar a folha de impressão, então a medida sai com as métricas da tela e a
conta erra justamente no caso que ela existia para resolver.

---

## 18. Tela cheia

Botão `⛶ Tela cheia` ao lado de "Mostrar contas zeradas". A seção da tabela vira
`position: fixed; inset: 0` e cobre sidebar, trilha e filtros. `Esc` também sai.

**Não usa o Fullscreen API do navegador.** O `requestFullscreen` esconde a barra do sistema
e a do navegador — num relatório financeiro isso tira as referências de onde a pessoa está —
e sai com qualquer `Esc`, inclusive o que ela deu para fechar o detalhamento.

O cabeçalho troca a contagem de filiais pela **lista com nome e código**, como no papel —
ver §17.2. Aqui sobra largura, e quem está com a tabela cobrindo a tela costuma estar
conferindo.

O `Esc` daqui **só sai quando não há modal aberto**. O detalhamento é um `<dialog>` e fecha
no `Esc` sozinho; sem a guarda, um `Esc` fecharia os dois e quem só queria fechar o detalhe
perderia a tela cheia junto.

---

## 19. Celular

Tudo medido em 09/09/2026, viewport de 375px com leitura ampliada. O ponto de corte é
`max-width: 767px` para o que é questão de largura, e `(hover: none) and (pointer: coarse)`
para o que é questão de dispositivo.

### 19.1 A coluna de descrição

**Ela ocupava 622px numa tela de 375px — 166% da largura da janela**, e a tabela inteira
1.722px. Como a coluna é fixa na rolagem lateral, ela cobria a tela toda: não havia como ver
um valor, e rolar não resolvia, porque o que rolava passava por baixo dela.

A causa é o `min-w-[32rem]` da descrição — 512px reservados para caber o nome mais comprido
do cadastro **e** um selo ao lado. Numa tela de 375px isso não é folga, é a tela inteira
mais uma vez.

| | Antes | Depois |
|---|---:|---:|
| Coluna de descrição | 622px (166% da tela) | 188px (50%) |
| Tabela inteira | 1.722px | 1.108px |
| Visível para valores | 0 | 162px |

O teto é `50vw`: o suficiente para ler o nome da conta, e o suficiente para o primeiro valor
aparecer ao lado **sem nenhum gesto**.

### 19.2 Quebrar ou cortar, e onde

As duas telas resolvem o nome comprido de formas opostas, e é medição que decide:

- **Tabela do DRE — quebra livre.** São 13 nomes de conta, e ler `(=) RECEITAS LIQUIDAS` em
  duas linhas é melhor que ler `(=) RECEITAS LIQ…`.
- **Detalhamento — duas linhas e para.** Com quebra livre,
  `ARROZ TIPO 1 PACOTE DE 5KG MARCA REGIONAL 0` virou **sete linhas** numa coluna de 150px;
  uma lista de 15 mil produtos assim não se percorre. `line-clamp: 2` corta no fim da
  segunda linha, e o `title` continua guardando o nome inteiro.

### 19.3 A altura da tabela

Antes: **107px de tabela**, e a `main` não rolava — o conteúdo dela tem `h-full` e nunca
passa da própria altura, então o resto da tabela era simplesmente inalcançável. Com
`min-height: 65svh` a tabela tem 528px e a `main` passa a rolar.

`svh` e não `vh`: no celular a barra do navegador aparece e desaparece, e `vh` toma a janela
grande como referência, deixando a tabela mais alta que a tela.

**A rolagem interna fica**, em vez de a tabela crescer e a página rolar tudo: é ela que
mantém o cabeçalho grudado no topo. Numa lista de 15 mil clientes, rolar sem saber de que mês
é a coluna pesa mais que a segunda barra de rolagem incomoda.

### 19.4 O que sai em dispositivo de toque

**O punho de arrastar e a barra que explica o arraste.** O reordenamento usa a API de
drag-and-drop do HTML, que **não recebe eventos de dedo**: no celular o punho é um controle
morto ocupando 24px da coluna mais disputada da tela, e a dica manda usar `Alt`+setas num
aparelho sem tecla `Alt`.

A mira é o **dispositivo**, não a largura da janela — num desktop com janela estreita o mouse
continua arrastando, e ali os dois seguem valendo.

### 19.5 O selo, em quatro letras

`INFORMATIVO` ocupava mais que o nome que qualifica: numa coluna de 188px, `(-) ST` era
empurrado para duas linhas com o selo no meio. Em tela estreita o selo mostra `INFO`, e a
linha volta de 62px para 42px.

**O texto acessível continua sendo o longo** — quem usa leitor de tela ouve "Informativo",
não a abreviação, e o `title` guarda a frase inteira para quem passa o ponteiro.

### 19.6 A armadilha que apareceu três vezes aqui

As regras de celular vivem **no fim do `globals.css`**, e isso não é organização: é
necessidade. Elas sobrescrevem declarações de mesma especificidade que estão acima —
`min-height: 0` da `.tabela-rolagem`, `display: flex` do `.puxador`, `display: none` do
`.selo-curto` — e na mesma especificidade **quem ganha é quem vem por último**.

Escritas no começo do arquivo, não faziam efeito nenhum, e nada acusava: nem erro de
sintaxe, nem aviso, nem diferença visível até alguém medir o elemento. Aconteceu três vezes
na mesma sessão, com três propriedades diferentes.

---

## 20. Exportar

Um botão **Exportar** no cabeçalho da tabela abre um popover com três saídas — mesmo padrão
do popover de atalhos de período: `mousedown` fora fecha, `Esc` fecha, `role="menu"`.

| Item | O que faz |
|---|---|
| **Imprimir** | `window.print()` |
| **Exportar PDF** | `window.print()` — o destino *Salvar como PDF* é escolhido no diálogo |
| **Exportar Excel** | gera e baixa um `.xlsx` |

**O botão Imprimir separado saiu**, porque *Imprimir* passou a ser um item do menu. Se a
intenção era manter os dois, é uma linha de volta.

### 20.1 PDF é a impressão, e isso é decisão

Os dois itens chamam o mesmo `window.print()`, com a folha e a fonte que
`useEscalaDeImpressao` calibra. **Um gerador de PDF no navegador seria uma segunda
implementação dos padrões da §17** — cabeçalho repetido a cada página, folha por largura
medida, as duas armadilhas de `@page` — e divergiria da impressão na primeira correção feita
em um dos dois lados. Escolhido pelo Gabriel em 09/09/2026, entre este caminho, `jsPDF` e
gerar no back-end.

O que muda entre os dois itens é **o que se diz a quem clica**: nenhuma API do navegador
pré-seleciona o destino "PDF", então o item avisa que ele é escolhido no diálogo. Prometer o
contrário deixaria a pessoa esperando um download que não vem.

### 20.2 O Excel

Biblioteca: **SheetJS `xlsx` 0.20.3**, aprovada pelo Gabriel em 09/09/2026.

> **Instalada da CDN oficial**, não do npm: `https://cdn.sheetjs.com/xlsx-0.20.3/…`. O
> pacote `xlsx` do registro público parou na 0.18.5, de 2022, e carrega CVEs de
> *prototype pollution* e ReDoS. Nosso uso é só escrita, o que não exercita nenhum dos
> dois, mas instalar dependência com alerta conhecido é dívida que aparece na próxima
> auditoria. `npm audit`: **0 vulnerabilidades**.

Três decisões dentro dele:

**Número é número.** A tela mostra `(617.283,95)`, mas a célula recebe `-617283.95` com o
*formato* `#,##0.00;(#,##0.00)` mandando exibir os parênteses. Quem abre vê a mesma tabela e
consegue somar, filtrar e montar tabela dinâmica. Exportar o texto formatado dá uma planilha
bonita e inútil — e é o defeito mais fácil de cometer aqui, porque na tela ele não aparece:
quem descobre é o contador, na frente do cliente.

**A ordem é a da tela.** As chaves são lidas do DOM (`tr[data-chave]`), então linhas
arrastadas e zeradas escondidas valem no arquivo. É o mesmo critério da impressão, que
imprime o que está renderizado; divergir faria o Excel e o papel discordarem sobre a mesma
apuração. A alternativa era levantar o `useOrdemSalva` e o cálculo de visíveis para fora da
`TabelaDre` — refatorar o dono de três estados para servir a um botão.

**O `xlsx` entra por `import()` dinâmico**, ~400KB que só interessam a quem exporta.

Também: largura de coluna (sem ela o Excel mostra `#######` na coluna de dinheiro, o
primeiro motivo de alguém achar que a exportação veio quebrada), faixa do mês unindo as três
colunas, e painel congelado nas duas linhas de cabeçalho mais a coluna da descrição.

**Não faz negrito nos totalizadores** — estilo de célula é recurso da versão paga do
SheetJS. A community escreve valor, formato, largura e congelamento, e é o que está aqui.

### 20.3 O menu está nas três telas

| Tela | Imprimir e PDF | Excel |
|---|---|---|
| Tabela do DRE | `window.print()` | a apuração, na ordem da tela |
| **Modal** de detalhamento | abre a página em nova aba e imprime lá | **daqui mesmo** |
| **Página** de detalhamento | `window.print()` | daqui mesmo |

**No modal, o Excel não passa pela outra aba.** O que impede a impressão de sair do
`<dialog>` — conteúdo da *top layer* não se fragmenta entre páginas — não vale para um
arquivo: planilha não tem folha nem paginação. Os dados já estão carregados; é só montar.

O texto de apoio dos itens muda no modal, para dizer que a impressão abre uma aba — aba que
aparece sem avisar parece defeito.

**A composição dos totalizadores não exporta**, pelo mesmo motivo de não ter página: ela é
aritmética sobre linhas da tabela que está atrás do modal, e a tabela inteira já exporta.

### 20.4 O Excel do detalhamento

Uma matriz por tela, com **duas diferenças deliberadas em relação à tela**:

**Código e nome em colunas separadas.** Na tela os dois moram na mesma célula, porque duas
colunas fixas teriam que concordar até o pixel sobre onde uma termina (§15). Em planilha isso
se inverte: quem vai cruzar com outra base precisa do código sozinho, e `100 ARROZ 5KG` numa
célula só obriga fórmula de texto para separar.

**Centro de custo e conta viram colunas, nos lançamentos.** Na tela são linhas de grupo —
hierarquia visual, como a 9815 faz. Planilha quer dado tabular: repetidas em cada linha, uma
tabela dinâmica reagrupa sozinha e o subtotal que a tela desenha o Excel calcula. São 27
colunas: as 25 da 9815 mais essas duas.

**A coluna que fecha o total leva o nome da linha do DRE**, como na tela — `(ST) Líquido`.
Quem abre a planilha semanas depois não tem o cabeçalho da tela ao lado para lembrar qual das
colunas de dinheiro bate com o DRE.

### 20.5 Como isto foi verificado

Duas validações, ambas rodando os **módulos reais** do front no Node — sem bundler, sem
navegador, sem banco:

| | |
|---|---|
| [dc13](validacao/dc13_excel_da_apuracao.mjs) | **20 asserções** — a apuração. Gera o arquivo, **reabre** e confere célula por célula, inclusive que `B3.t === "n"` (tipo numérico) e que o formato pede parênteses |
| [dc14](validacao/dc14_excel_do_detalhamento.mjs) | **25 asserções** — as quatro telas do detalhamento, rótulo por rótulo. Um teste que só olhasse "gerou o arquivo" passaria com a matriz errada |

Rodam com o resolvedor de alias:

```bash
node --experimental-strip-types --import ./docs/validacao/_alias.mjs docs/validacao/dc14_excel_do_detalhamento.mjs
```

`docs/validacao/_alias.mjs` ensina o Node a resolver o `@/` do `tsconfig`. Existe porque a
alternativa era trocar os imports do código de produção por caminhos relativos — mudar o
código para o teste passar.

**E pela interface, com a API de verdade** (autorizado pelo Gabriel em 09/09/2026, para os
endpoints já validados). Uma filial, 01/09 a 09/09/2026, apuração em 14 s e 52 linhas:

- tabela do DRE → `DRE_ccusto-principal_2026-09-01_a_2026-09-09.xlsx`, 13.299 bytes;
- duplo clique em `(-) DEVOLUCAO` → modal com 20 motivos fechando em **413.947,02**, o mesmo
  valor da célula clicada → 11.203 bytes;
- página dedicada, mesma consulta → 11.170 bytes.

O download foi **espiado, não disparado**: `URL.createObjectURL` e `HTMLAnchorElement.click`
interceptados no navegador, para não abrir diálogo de salvar na máquina de ninguém. É a mesma
razão de `gerarPlanilha` e `baixar` serem funções separadas.

**Um defeito que só a exportação real mostrou:** o nome do arquivo saía
`Detalhe (-) DEVOLUCAO · Setembro2026` — o `nomeSeguro` remove a barra, proibida em nome de
arquivo, e o mês perdia o separador. A troca por hífen agora acontece **antes** da limpeza.
