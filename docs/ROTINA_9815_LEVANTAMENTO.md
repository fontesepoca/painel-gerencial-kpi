# Rotina 9815 — GERENCIAL / DRE · Levantamento (Fase 0)

> **Status:** rascunho para aprovação. Tudo aqui foi derivado de evidência concreta
> (prints da rotina + trace SQL do DB Moon + planilhas exportadas em `docs/`).
> O que **não** pôde ser comprovado está na seção *Lacunas em aberto* — nada foi presumido.
>
> **Fonte primária:** `docs/Resultado das consultas na rotina oficial/`
> — `prints/` (7 capturas), `periodo_de_um_mes_sem_AH/` e `periodo_de_dois_meses_com_AH/`
> (queries capturadas + resultado exportado de cada cenário).
>
> Não temos o código-fonte Delphi. O trace registra **o SQL que a rotina montou e enviou
> ao Oracle**, o que expõe a regra de negócio até o nível de coluna.

---

## 1. Identificação

| Item | Valor |
|---|---|
| Código | **9815** |
| Nome oficial | **GERENCIAL** — aba **4-DRE** |
| Versão observada | `v.25.06.18.01` |
| Tecnologia atual | Delphi + FireDAC → Oracle (Winthor) |
| Servidor observado | `10.122.65.50` |
| Usuário do teste | matrícula `4893` |
| Abas da rotina | 1-Compra · 2-Vendas · 3-Logística · **4-DRE** · 5-Financeiro · 6-Fiscal · Parâmetros |

**Escopo desta migração:** somente a aba **4-DRE**. As demais abas ficam fora.

---

## 2. Propósito de negócio

DRE gerencial (Demonstrativo de Resultado) consolidado, com receita, deduções, CMV e despesas
abertas pela dimensão escolhida.

- **Quem usa:** o dono da empresa, para acompanhamento do resultado.
- **Frequência / janela:** consulta de **1 a 4 meses**, conforme o propósito.
- **Natureza:** essencialmente **leitura**. A única escrita é o log de execução (ver §4.9).

---

## 3. Tela e fluxo no Winthor

### 3.1 Filtros (barra superior)

| Controle | Tipo | Valores observados |
|---|---|---|
| **Filial** | multisseleção (checkboxes) | `<TODOS>` + as filiais **pré-selecionadas antes de abrir a rotina**. Nas capturas: `EPC-MAT` (7), `EPC-ES` (12), `VIVALOG-GBH` (25). O cadastro tem 18 (§5.5) |
| **Período** | data inicial + data final | ex.: `01/06/2026` a `31/07/2026` |
| **Análise** | combo | `Grupo de Contas` · `Conta Gerencial` · `C.Custo Principal` · `Centro de Custo` |
| **Regime** | combo | `Caixa` · `Competência` |
| **C.Custo** | lookup | filtro adicional por centro de custo |
| **Fornec.** | lookup | filtro por fornecedor |

Checkboxes: `Deduzir ST`, `Deduzir PIS/COFINS`, `Mostrar Cli.Especial`, `Mostrar Contas Zeradas`,
`Mostrar Investimento`, `Mostrar %AV`, `%AH`, `Mostrar Orçamento`, `Ind.A`, `Ind.B`, `FCont`,
`Mostrar NÃO PAGO`.

Ações: **Apurar**, **Imprimir**, **Exportar** (Excel), **Gráfico**, **Filiais**, **Fechar**.

### 3.2 Grade de resultado

Um bloco de colunas **por mês** do período (`Valor`, `% AV`, `% AH`), seguido de um bloco
**TOTAL** (`VALOR`, `MÉDIA`, `% AV`) e um bloco **SIMULADO** (`VALOR S.`, vazio nas capturas).
Período de 1 mês → apenas o bloco daquele mês (%AH sai `0,00`).

Semântica de cor observada na grade legada: amarelo = linha totalizadora; verde/azul = grupos de
despesa; vermelho/azul no %AH = variação positiva/negativa.

### 3.3 Estrutura de linhas do DRE (idêntica nos 6 cenários exportados)

```
 (+) RECEITA BRUTA
 (-) ABAT./DESC.
 (-) DEVOLUCAO
 (-) ST                     <- NAO subtrai. Informativa (ver §7 regra 0)
 (-) PIS                    <- NAO subtrai. Informativa
 (-) COFINS                 <- NAO subtrai. Informativa
 (=) RECEITAS LIQUIDAS      <- = BRUTA - ABAT - DEVOLUCAO. Base 100% do %AV
 (=) CMV LIQ.
     LUCRO BRUTO            <- = RECEITAS LIQUIDAS - CMV LIQ.
     ... bloco variável, quebrado pela dimensão escolhida em "Análise" ...
     Sub-Total -> Despesas Operacionais
     RESULTADO OPERACIONAL
     ... receitas/despesas não operacionais ...
     Total das Despesas
     LUCRO LIQUIDO
     ... bloco pós-LL (Acerto De Estoque, CONTRATO DE MUTUO, Emprestimo Bancario, ...) ...
```

O cabeçalho (até LUCRO BRUTO) e o rodapé são fixos; só o miolo muda com a dimensão.
A ordem e a composição vêm da tabela **`EPCPARDRE`** (§5), não do código.

### 3.4 Avisos e barra de status

- Aviso em vermelho na barra de filtros: `EXISTEM (1) LANÇAMENTOS COM DIVERGÊNCIA NO RATEIO CC`
  — resultado da consulta de conferência de rateio (§4.3).
- Rodapé: usuário, `Inicio`, `Fim`, `Tempo` e `Ult Processamento: 4-DRE / <Análise>`.

---

## 4. Sequência de execução (reconstruída do trace)

Ordem exata registrada pelo DB Moon ao clicar **Apurar**:

| # | Passo | Custo observado |
|---|---|---|
| 1 | Carrega filiais habilitadas | 0,00 s |
| 2 | Lê restrição de data do usuário | 0,00 s |
| 3 | Confere divergência de rateio de centro de custo (2 execuções) | ~0,9 s + ~2,0 s |
| 4 | Monta a estrutura do DRE (`EPCPARDRE` + contas órfãs) | ~2,2 s |
| 5 | **`GetValorGrupo`** — despesas do período por dimensão | ~3,3 s |
| 6 | Faturamento / CMV / impostos — **uma execução por mês** | **16,9 s por mês** (1 mês) · **115 s por mês** (2 meses) |
| 7 | Grava log de execução + `COMMIT` | ~0,02 s |

Tempo total medido: **00:04:59** para 2 meses / Grupo de Contas; **00:00:57** para 1 mês.

### 4.1 Filiais

```sql
select e.empresa, f.codfil, f.label, e.descricao || ' - ' || f.descricao as UNIDADE,
       nvl(fw.UF,'MG') as UF, f.dblepcti
  from filiais f, empresa e, pcfilial fw
 where f.empresa = e.empresa
   and f.codfil  = fw.codigo (+)
   AND f.codfil IN ('7','12','25')
 order by f.ordem_processa
```

`filiais` e `empresa` são tabelas **customizadas da Época**, não nativas do Winthor.

> **O `IN ('7','12','25')` não é lista fixa da rotina.** Antes de abrir a 9815 o Winthor exibe
> uma **tela de seleção de filiais** (também acessível pelo botão `Filiais`, canto superior
> direito). O que o usuário marca ali é o que entra nesse `IN`, e é o que alimenta o combo
> **Filial** dentro da rotina. As três filiais das capturas são a seleção feita no teste —
> não uma limitação do programa (ver §5.5).

### 4.2 Restrição de data por usuário — regra de permissão

```sql
select dtIni, dtFim from tab_ger_restricao_data_dre where matricula = 4893
```

Cada matrícula pode ter uma janela de datas permitida. É o único controle de acesso encontrado
no trace.

### 4.3 Conferência de rateio de centro de custo

Compara `PCLANC.valor` com a soma de `PCRATEIOCENTROCUSTO.valor` do mesmo `recnum`/`codconta`;
o que não bate alimenta o aviso `EXISTEM (n) LANÇAMENTOS COM DIVERGÊNCIA NO RATEIO CC`.

Roda **duas vezes**: a primeira com período **hardcoded `01/02/2012` a `31/12/2012` e
`codfilial = 7`** (resíduo legado, ignora os filtros da tela); a segunda com o período real.

### 4.4 Estrutura do DRE

Monta as linhas a partir de `EPCPARDRE` unida a `PCCONTA`/`PCGRUPO`, e concatena
(`union all`) as contas que **não** estão parametrizadas mas tiveram movimento no período —
é daí que vem o bloco solto depois do LUCRO LIQUIDO. Deriva três flags por linha:

| Flag | Significado |
|---|---|
| `AntesRO` | linha anterior à linha cujo grupo é `RESULTADO OPERACIONAL` |
| `AntesLL` | linha anterior a `LUCRO LIQUIDO` |
| `AntesLF` | **depende da dimensão** — ver abaixo |

> **Correção de 28/08/2026.** Eu havia registrado que `AntesLL` e `AntesLF` eram sempre
> idênticas. Isso vale só para **Grupo de Contas** e **Conta Gerencial**. Nas duas dimensões
> de centro de custo, a consulta de estrutura compara com o rótulo **`LUCRO FINAL`**:
>
> ```sql
> -- Grupo de Contas / Conta Gerencial
> case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO') ...
> -- C.Custo Principal / Centro de Custo
> case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO FINAL')  ...
> ```
>
> `LUCRO FINAL` não aparece no dump de `EPCPARDRE`. Se de fato não existir, a subconsulta
> devolve `NULL`, `PAR.ID < NULL` é `NULL`, e o `ELSE` fixa `AntesLF = 'N'` em **todas** as
> linhas de estrutura dessas duas dimensões. Pendente de confirmação (§10, item 5).
>
> Atenção: em `GetValorGrupo` a flag `AntesLF` é calculada à parte e usa `LUCRO LIQUIDO`
> nas quatro dimensões. São dois cálculos distintos com o mesmo nome.

### 4.4.1 A consulta de estrutura muda conforme a dimensão

Não é uma consulta parametrizada — são quatro SQLs diferentes:

| Dimensão | Chave e rótulo das linhas de conta | Particularidades |
|---|---|---|
| **Grupo de Contas** | `gr.codgrupo` / `gr.grupo` — agrupa a conta pelo seu **grupo** | — |
| **Conta Gerencial** | `PAR.CODGRUCONTA` / `NVL(CO.CONTA, PAR.GRUPO)` | traz `TIPOCONTA` de `PCCONTA.FIXAVARIAVEL` e `RESPONSAVEL` de **`EPCPARDRE_RESP`** com `codfil = 25` fixo |
| **C.Custo Principal** | só linhas calculadas (`codgruconta <= 0`) | exclui os grupos `DESPESA OPERACIONAL`, `LUCRO OPERACIONAL`, `DESPESA FINANCEIRA`, `LUCRO FINANCEIRO`, `DESPESA TRIBUTARIA`, `LUCRO TRIBUTARIO`; recalcula `ID` deslocando pelo `RESULTADO OPERACIONAL`/`LUCRO LIQUIDO` |
| **Centro de Custo** | idem C.Custo Principal | idem |

### 4.5 `GetValorGrupo` — despesas

Fonte: `PCLANC` (apenas `DTPAGTO IS NOT NULL`), com rateio opcional por
`PCRATEIOCENTROCUSTO`. Um bloco `UNION ALL` **por filial selecionada**.

Regras extraídas:

- `CT.GRUPOCONTA >= 200` — só contas gerenciais a partir de 200.
- Valor: `DECODE(RC.valor, NULL, NVL(FIN.VPAGO,0)*(-1), NVL(RC.valor,FIN.VPAGO)*(-1))`
  → **usa o valor rateado quando existe rateio**, senão o valor pago; sempre invertido de sinal.
- Exclui `historico like 'REF.CANCEL.BORDERO JA BAIXADO'`.
- Exclui adiantamentos já quitados (`pclancadiantfornec`).
- Exclui contas listadas em `EPCPARDRE_NAOEXIBIR`.
- Centro de custo ausente vira `9998` (*NÃO INFORMADO*) ou `9999` (*NÃO USA CENTRO DE CUSTO*),
  conforme `PCCONTA.usarateiocentrocusto`.
- Centro de custo **principal** = `SUBSTR(CodigoCentroCusto,1,2)`; sem CC → `99`.
- Um `UNION ALL` extra injeta uma linha fixa a partir de `PCNFSAID`+`PCPREST`
  (`condvenda = 0`, sem `DESD`, sem cancelamento, por `fin.dtpag`), com
  `AntesRO = 'N'` e `AntesLL = AntesLF = 'S'`.

  **A chave injetada muda conforme a dimensão** — é o mesmo fato de negócio escrito no
  espaço de chaves de cada análise:

  | Dimensão | Chave | Corresponde a |
  |---|---|---|
  | Grupo de Contas | `400` | grupo *Outras Receitas* (existe em `EPCPARDRE`, ids 577 e 1239) |
  | Conta Gerencial | `4000004` | conta *Receita com Venda de Ativo* (id 1239) |
  | C.Custo Principal | `85` | centro de custo principal 85 |
  | Centro de Custo | `8501` | centro de custo 85.01 |

  > **Correção de 28/08/2026.** Eu havia registrado que `8501` era um grupo sem linha
  > correspondente e que o valor era descartado. **Não procede.** O `8501` só aparece na
  > dimensão Centro de Custo, e é o código do centro de custo, não um grupo. Com
  > `AntesRO = 'N'` e `AntesLL = 'S'`, a linha cai **depois do RESULTADO OPERACIONAL** —
  > em Grupo de Contas, sob *Outras Receitas*.
  >
  > O erro de método: concluí "descartado" porque não achei R$ 225.000 nas planilhas, sem
  > considerar que os xlsx foram exportados em período diferente do trace.

### 4.6 A dimensão de análise é um único trecho de SQL trocado

Toda a diferença entre as quatro opções do combo *Análise* está na expressão de agrupamento:

| Análise | Expressão |
|---|---|
| Grupo de Contas | `to_number(decode(AntesLF,'N',CODCONTA, codgrupo))` |
| Conta Gerencial | `to_number(CODCONTA)` |
| C.Custo Principal | `to_number(decode(AntesLF,'N',CODCONTA, NVL(codccprinc,99)))` |
| Centro de Custo | `to_number(decode(AntesLF,'N',CODCONTA, CODCENTROCUSTO)))` ← **quebrada** |

Leitura correta do `decode(AntesLF, 'N', CODCONTA, <dimensão>)`:

| `AntesLF` | Significado | Agrupa por |
|---|---|---|
| `'S'` | a conta **está** em `EPCPARDRE` com `ID` anterior ao `LUCRO LIQUIDO` | **a dimensão** (grupo, conta, c.custo) |
| `'N'` | a conta não está parametrizada, ou está depois do `LUCRO LIQUIDO` | **a própria conta** |

É por isso que o corpo do DRE mostra grupos e o bloco final mostra contas individuais
(`Acerto De Estoque`, `CONTRATO DE MUTUO`).

> **Correção de 28/08/2026.** Este parágrafo dizia o inverso — "antes do Lucro Líquido agrupa
> por conta; depois, pela dimensão". Errado nos dois sentidos.

Aqui `AntesLF` é derivada de `FIN.CODCONTA in (select codgruconta from EPCPARDRE ... )` e usa
`LUCRO LIQUIDO` nas **quatro** dimensões — não confundir com a `AntesLF` da consulta de
estrutura (§4.4), que é outro cálculo com o mesmo nome.

### 4.7 Regime = apenas o campo de data das despesas

| Regime | Predicado em `PCLANC` |
|---|---|
| Caixa | `nvl(FIN.DTPAGTO, FIN.DTVENC) BETWEEN :ini AND :fim` |
| Competência | `FIN.dtcompetencia BETWEEN :ini AND :fim` |

A consulta de faturamento/CMV é **byte a byte idêntica** nos dois regimes.

> **Consequência:** a diferença de Receita Bruta entre as planilhas de caixa e competência
> **não vem do regime** — vem de as exportações terem usado datas finais diferentes.
> Receita, deduções e CMV não mudam com o regime; **só a despesa muda**.

O mês da coluna acompanha o regime — a rotina é coerente:

| Regime | Filtro | `MES_ANO`, `MES`, `ANO` |
|---|---|---|
| Caixa | `nvl(DTPAGTO, DTVENC)` | `nvl(DTPAGTO, DTVENC)` |
| Competência | `DTCOMPETENCIA` | `nvl(DTCOMPETENCIA, DTVENC)` |

> **Correção de 28/08/2026.** Eu havia registrado aqui uma "suspeita de defeito": que mesmo em
> competência o mês sairia por data de pagamento. **Não procede.** Eu tinha lido o `MES_ANO` no
> trace de *caixa* e comparado com o filtro do trace de *competência*. Cada regime distribui
> pela sua própria data. Não há nada a replicar como defeito neste ponto.

**Comportamento validado com o negócio em 27/08/2026 — replicar como está:** o subselect fixa
`WHERE DTPAGTO IS NOT NULL` em ambos os regimes, então **despesa não paga nunca entra no DRE**,
nem em competência. Confirmado como correto.

### 4.8 Faturamento, CMV e impostos

Uma única consulta agregada, com `UNION ALL` por filial, retornando
`VLCUSTOFIN, VLVENDA, VLTABELA, VLDEVOLUCAO, VLCUSTOFINDEVOL, VlVendaLiq, ST_Liq, PIS_Liq, COFINS_Liq`.

- **Vendas:** `PCNFSAID` + `PCMOV` + `PCMOVCOMPLE` + `PCPRODUT`, por `NF.DTSAIDA`,
  `CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,6108,6922,6102,6114,6115,6117,6119,6404,6910)`,
  `CONDVENDA IN (1,3,5,6,8)` ou `ESPECIE = 'CO'`, `codsec <> 1601`.
- **Devoluções:** `PCNFENT` + `PCMOV` + `PCPEDC`, por `NFE.DTENT`,
  `TIPODESCARGA IN ('6','7')`, `CODFISCAL IN (1202,1411,1949,2202,2411,2949)`.
- **Cliente especial:** `cliente_especial` (tabela Época) com `mostra_dre`; entra se
  `mostra_dre = 'S'` **ou** `condvenda = 5`.
- ST considera `MV.st + MVC.vlfecp`; PIS/COFINS são líquidos do crédito
  (`VLPIS - custocont * PERPIS/100`).
- **Executada uma vez por mês** do período (§8).

### 4.9 Única escrita da rotina

```sql
INSERT INTO tab_log_exec_rotina (CODLOG,ROTINA,DTINICIO,DTFIM,DESCRICAO,USUARIO)
VALUES (881723, 9815, <inicio>, <fim>, 'Ult Processamento: 4-DRE / Grupo de Contas - ',
        '4893 - <nome do usuário>');
COMMIT;
```

Chave gerada por `SELECT NVL(max(codlog),0)+1` — sem sequence, sujeito a colisão sob concorrência.
Fora isso a rotina é 100% leitura.

---

## 5. Tabelas e colunas

### 5.1 Tabelas do ERP Winthor — somente leitura

| Tabela | Uso |
|---|---|
| `PCLANC` | lançamentos financeiros (despesas) — base do DRE |
| `PCRATEIOCENTROCUSTO` | rateio de lançamento por centro de custo |
| `PCCONTA` | conta gerencial (`codconta`, `conta`, `grupoconta`, `usarateiocentrocusto`) |
| `PCGRUPO` | grupo de contas (`codgrupo`, `grupo`) |
| `PCCENTROCUSTO` | centro de custo (`CodigoCentroCusto`, `descricao`) |
| `PCCONTACENTROCUSTO` | vínculo conta × centro de custo |
| `PCLANCADIANTFORNEC` | adiantamentos a fornecedor (exclusão) |
| `PCNFSAID`, `PCMOV`, `PCMOVCOMPLE`, `PCPRODUT` | faturamento e CMV |
| `PCNFENT`, `PCPEDC` | devoluções |
| `PCPREST` | parcelas (grupo 8501) |
| `PCFORNEC`, `PCCLIENT`, `PCUSUARI`, `PCEMPR` | descrição de parceiro / funcionário |
| `PCFILIAL` | UF da filial |

### 5.2 Customizadas da Época

| Tabela | Papel |
|---|---|
| `EPCPARDRE` | **parametrização do DRE**: `ID` (ordem), `CODGRUCONTA`, `GRUPO`, `INFCONTAS`, `COR` |
| `EPCPARDRE_NAOEXIBIR` | contas suprimidas do relatório (`codconta`) |
| `filiais`, `empresa` | cadastro de filial/empresa com `label`, `ordem_processa`, `dblepcti`. **18 filiais cadastradas**, mas a 9815 filtra `IN ('7','12','25')` — lista literal no SQL, não derivada de nenhuma coluna (ver §5.5) |
| `cliente_especial` | `codcli`, `codfil`, `mostra_dre` |
| `tab_ger_restricao_data_dre` | `matricula`, `dtIni`, `dtFim` — janela permitida por usuário. **Contém 1 linha**: matrícula `51`, `dtIni = 01/07/2012`, `dtFim` nulo (janela aberta). Não é regra ativa → **fora do piloto** |
| `tab_log_exec_rotina` | **única escrita**: `CODLOG`, `ROTINA`, `DTINICIO`, `DTFIM`, `DESCRICAO`, `USUARIO` |

### 5.3 `EPCPARDRE` em detalhe — a tabela que define a tela

Consultada integralmente em 27/08/2026 (~230 linhas, `ID` de 1 a 1349 com lacunas).

**`CODGRUCONTA` negativo = linha calculada, não é conta:**

| Valor | Linhas |
|---|---|
| `-1` | ` (+) RECEITA BRUTA`, ` (-) ABAT./DESC.`, ` (-) DEVOLUCAO`, ` (-) ST`, ` (-) PIS`, ` (-) COFINS`, ` (=) RECEITAS LIQUIDAS`, ` (=) CMV LIQ.` |
| `-2` | `Sub-Total -> Despesas Operacionais` |
| `-3` | `Total das Despesas` |
| `-4` | `LUCRO BRUTO`, `RESULTADO OPERACIONAL`, `LUCRO LIQUIDO` |

`CODGRUCONTA` positivo referencia `PCCONTA.codconta`.

**`INFCONTAS = 'S'`** marca exatamente as 9 linhas totalizadoras (as amarelas do print).

**`COR` é `TColor` do Delphi — BGR, não RGB.** Conversão: `#RRGGBB` = bytes invertidos.

| Valor | Hex `TColor` | CSS correto | Uso observado |
|---|---|---|---|
| `65535` | `0x00FFFF` | `#FFFF00` | amarelo — totalizadores |
| `65280` | `0x00FF00` | `#00FF00` | verde |
| `12639424` | `0xC0DCC0` | `#C0DCC0` | verde claro |
| `15780518` | `0xF0CAA6` | `#A6CAF0` | azul claro — impostos |
| `12632256` | `0xC0C0C0` | `#C0C0C0` | cinza — imobilizado |
| `32896` | `0x008080` | `#808000` | oliva |

> **Armadilha:** tratar `TColor` como RGB inverte os canais. `15780518` viraria laranja
> (`#F0CAA6`) em vez de azul (`#A6CAF0`). Sempre inverter os bytes.

### 5.4 Problemas de dado em `EPCPARDRE` — tratar na versão web

Encontrados na consulta completa. Nenhum deles é hipótese; todos estão na tabela hoje.

| # | Problema | Efeito |
|---|---|---|
| 1 | **`ID` nulo** na linha `Pneus e Câmaras` | `ORDER BY ID` joga nulo para o fim → a linha aparece **depois do LUCRO LIQUIDO**. É a segunda origem do bloco solto (a primeira são as contas órfãs) e explica o `PNEUS E CAMARAS` nas planilhas |
| 2 | **`ID` 1268 duplicado** (`Verba Composicao Margem` e `Desconto Financeiro Fornecedor`) | ordem indefinida entre as duas linhas |
| 3 | **`CODGRUCONTA` 3000161 duplicado** com rótulos diferentes (`Rateio Epoca ES` / `Rateio Corporativo`) | o agrupamento por `CODGRUCONTA, GRUPO` gera duas linhas para a mesma conta — risco de o valor ser exibido em dobro |
| 4 | **`GRUPO` repetido** em `CODGRUCONTA` distintos: `Despesas Não Operacionais` (3005001 e 3005002), `Salario Desc Funcionarios` (3000086, 3000114, 3000115), `Telefone`, `Honorário Advocatício`, `Veículos` | duas ou mais linhas com o mesmo rótulo na tela, indistinguíveis para o usuário |
| 5 | **`8501` não existe em `EPCPARDRE`** | a rotina injeta `GRUPOCONTA = 8501` (§4.5) mas não há linha para recebê-lo — os R$ 225.000 do período provavelmente são descartados na exibição |
| 6 | Os `case when ... (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')` dependem de o rótulo existir **exatamente uma vez** | hoje `LUCRO LIQUIDO` e `RESULTADO OPERACIONAL` são únicos; um rótulo duplicado quebraria tudo com `ORA-01427` |

### 5.5 Filiais — cadastro completo vs. filiais do DRE

Consulta executada em 27/08/2026: **18 filiais** em `filiais`/`empresa`.

Conferida em 28/08/2026 contra o retorno de `GET /api/dre-gerencial/filiais` — a listagem
abaixo veio da API, não da transcrição do screenshot, que trazia `SUP-SM` como filial 27
em vez de 18.

| codfil | label | empresa | cód. empresa | ordem |
|---|---|---|---|---|
| **7** | **EPC-MAT** | EPC | 1 | 0 |
| 20 | EPC-CEASA | EPC | 1 | 1 |
| 27 | FUTURA | FUT | 6 | 1 |
| **12** | **EPC-ES** | EPC | 1 | 2 |
| 22 | EPC-RJ | GB | 2 | 2 |
| 24 | POTENCIAL CONTAGEM | VIVALOG | 7 | 3 |
| **25** | **VIVALOG-GBH** | VIVALOG | 7 | 3 |
| 34 | POTENCIAL | VIVALOG | 7 | 3 |
| 35 | VIVALOG-SUL | VIVALOG | 7 | 3 |
| 19 | FUT-2013- | FUT | 6 | 5 |
| 31 | CeM-ES | EPC | 1 | 5 |
| 91 | CeM-MG | EPC | 1 | 5 |
| 13 | MR::BH - BELO HORIZONTE | MRURAL | 3 | 9 |
| 1 | ALFALOG | VALE | 5 | 26 |
| 16 | SUP-NP | SUP | 4 | 27 |
| 17 | SUP-PL | SUP | 4 | 28 |
| 18 | SUP-SM | SUP | 4 | 29 |
| 28 | EPC-TRANSP | EPC | 1 | 31 |

`EMPRESA.EMPRESA` é a chave numérica; `EMPRESA.DESCRICAO` é o nome (`EPC`, `FUT`, …). O
filtro exibe a descrição.

As três em negrito são as que aparecem nas capturas **porque foram as marcadas na tela de
seleção de filiais que o Winthor exibe antes de abrir a rotina** (§4.1). Não é limitação da
9815: o `IN` do SQL é montado com o que o usuário selecionou.

> **Decisão para a web (27/08/2026):** o filtro **Filial** deve listar **as 18 filiais**,
> lidas de `filiais`/`empresa` em tempo de execução — nada de lista fixa em código nem em
> `appsettings.json`. `ordem_processa` define a ordem de exibição; `label` é o rótulo.
> A web dispensa a tela de pré-seleção do Winthor: a multisseleção acontece no próprio filtro,
> e o que estiver marcado vira o `IN` da consulta.

### 5.6 Stored procedures / functions

**Nenhuma.** Todo o processamento é SQL montado por concatenação de string no Delphi
(`GetValorGrupo` é um método Delphi, não uma procedure Oracle).

---

## 6. O defeito do "Centro de Custo" — causa confirmada

Erro exibido: `Falha ao apurar DRE (GetValorGrupo)` /
`[FireDAC][Phys][Ora] ORA-00923: FROM keyword not found where expected`.

**Causa:** parêntese sobrando no literal Delphi que define a expressão de agrupamento dessa
dimensão. Comparando as quatro variantes no trace:

```sql
-- C.Custo Principal (funciona)
SELECT to_number(decode(AntesLF,'N',CODCONTA,  NVL(codccprinc,99)))  as GRUPOCONTA
   ...  GROUP BY decode(AntesLF,'N',CODCONTA,  NVL(codccprinc,99)),  AntesRO, ...

-- Centro de Custo (quebra sempre)
SELECT to_number(decode(AntesLF,'N',CODCONTA,  CODCENTROCUSTO)))    as GRUPOCONTA
   ...  GROUP BY decode(AntesLF,'N',CODCONTA,  CODCENTROCUSTO)),     AntesRO, ...
--                                                            ^ parêntese extra
```

Ocorre nas 3 ocorrências da expressão, em ambos os regimes — por isso falha **sempre**, com
qualquer filtro. É defeito de código, não de dado.

**Remover o parêntese NÃO resolve.** Consulta executada em `PCCENTROCUSTO` (27/08/2026):

| total | com ponto | menor | maior | máx. de pontos | colisões ao numerizar |
|---|---|---|---|---|---|
| 1757 | **1666 (95%)** | `1001` | `9701.001` | **2** | 0 |

`CODCENTROCUSTO` resolve para `PCCENTROCUSTO.CodigoCentroCusto`, que é **texto hierárquico com
até dois separadores** (ex.: `9701.001.02`).

**`TO_NUMBER('9701.001.02')` é inválido em qualquer NLS, com ou sem máscara de formato**
→ `ORA-01722`. Não existe correção do `to_number()` que funcione com esse dado.

> **Conclusão:** corrigir o parêntese apenas trocaria `ORA-00923` por `ORA-01722` na linha
> seguinte. O erro de sintaxe estava **mascarando** um erro de tipo — o que indica que a análise
> por Centro de Custo provavelmente **nunca chegou a funcionar** nesta rotina.

(As colisões de arredondamento — `9701.10` e `9701.1` convergindo para a mesma chave — foram
verificadas e não ocorrem hoje. Ponto discutível apenas se a chave fosse numérica, o que não
será o caso.)

> **Decisão de projeto:** na versão web a chave da dimensão de agrupamento é **`VARCHAR2`**,
> nunca número. Grupo e Conta entram via `TO_CHAR`; Centro de Custo entra como está.
> Sem `to_number()` no caminho, os três problemas acima deixam de existir por construção — o
> defeito da 9815 não é remendado, é eliminado no desenho.

---

## 7. Regras de negócio consolidadas

0. **A aritmética do cabeçalho** — verificada contra 4 cenários exportados, bate ao centavo:

   ```
   RECEITAS LIQUIDAS = RECEITA BRUTA − ABAT./DESC. − DEVOLUCAO
   LUCRO BRUTO       = RECEITAS LIQUIDAS − CMV LIQ.
   ```

   **ST, PIS e COFINS não são deduzidos** — são linhas informativas. Deduzi-los erra o
   resultado em ~3 milhões em todos os cenários. É por isso que o mockup da versão web marca
   `ST Líquido`, `PIS Líquido` e `COFINS Líquido` com o badge `NÃO SOMA`.

   Isso também explica os checkboxes `Deduzir ST` e `Deduzir PIS/COFINS`: eles alterariam o
   número, e estavam **desmarcados** em todas as capturas. A web replica o comportamento
   desmarcado.

   Mapa para a consulta de faturamento (§4.8):

   | Linha | Coluna |
   |---|---|
   | `(+) RECEITA BRUTA` | `VLTABELA` |
   | `(-) ABAT./DESC.` | `VLTABELA − VLVENDA` |
   | `(-) DEVOLUCAO` | `VLDEVOLUCAO` |
   | `(=) RECEITAS LIQUIDAS` | `VlVendaLiq` (a própria consulta já calcula) |
   | `(-) ST` · `(-) PIS` · `(-) COFINS` | `ST_Liq` · `PIS_Liq` · `COFINS_Liq` — informativas |
   | `(=) CMV LIQ.` | `VLCUSTOFIN − VLCUSTOFINDEVOL` |

1. **%AV tem duas bases.** As cinco linhas de dedução (`ABAT./DESC.`, `DEVOLUCAO`, `ST`, `PIS`,
   `COFINS`) são percentuais da **RECEITA BRUTA**; de `RECEITAS LIQUIDAS` para baixo, a base
   é a **RECEITAS LIQUIDAS**. Verificado em 28/08/2026 contra a planilha de parâmetros
   conhecidos. `RECEITA BRUTA` não exibe %AV.
2. **%AH** compara o mês com o mês anterior do período; com 1 mês só, sai `0,00`.
3. Só entram contas com `PCCONTA.GRUPOCONTA >= 200`.
4. Havendo rateio em `PCRATEIOCENTROCUSTO`, o valor rateado **substitui** o valor do lançamento.
5. Despesa entra sempre com sinal invertido (`* -1`).
6. Contas em `EPCPARDRE_NAOEXIBIR` são suprimidas.
7. Contas com movimento e sem parametrização em `EPCPARDRE` aparecem **depois** do LUCRO LIQUIDO
   e não somam nos totais.
8. A ordem das linhas é a coluna `ID` de `EPCPARDRE`.
9. Acesso do usuário limitado pela janela de `tab_ger_restricao_data_dre`.
10. Filial é multisseleção; o SQL gera um `UNION ALL` por filial.

---

## 8. Performance — o problema a resolver na web

| Cenário | Faturamento/CMV | Total da rotina |
|---|---|---|
| 1 mês, 3 filiais | 1 execução × 16,9 s | **00:00:57** |
| 2 meses, 3 filiais | 2 execuções × ~115 s | **00:04:59** |

O salto de 17 s para 115 s por mês entre as duas capturas indica plano de execução instável.
Com 4 meses (limite de uso citado), a projeção é de **8 a 10 minutos por apuração**.

Causas prováveis, na ordem: consulta refeita por mês em vez de uma passada agrupada por mês;
`UNION ALL` por filial em vez de `IN`; junções sem outer join explícito (sintaxe `(+)` legada).

---

## 9. O que muda na versão web

Referência visual aprovada: `prints/Como deve ser a rotina em web.png` — tema escuro,
"Epoca Analytics / Inteligência Financeira", cabeçalho "DRE Gerencial".

**Escopo do piloto (acordado):**

- **Sem autenticação e sem escrita no banco** — — a raiz redireciona direto para a tela DRE Gerencial.
- **4 filtros:** Filial (multisseleção com **as 18 filiais**, lidas do banco — §5.5),
  Intervalo de datas, Regime (Caixa/Competência),
  Tipo de Análise (Grupo de Contas · Conta Gerencial · C.Custo Principal · Centro de Custo).
- **Sem tela de pré-seleção de filiais.** No Winthor ela existe antes de abrir a rotina; na web
  a seleção acontece direto no filtro Filial, que já nasce com as 18 disponíveis.
- **Tabela primeiro.** Drill-down fica para depois da tabela pronta.
- Colunas: `Descrição`, `Valor`, `AV %`, `AH %`, com atalhos de período
  (Ontem · Mês Passado · Últimos 3 Meses · Ano Passado).
- Marcador `NÃO SOMA` para as linhas informativas (as que hoje ficam soltas após o LUCRO LIQUIDO).

**Fora do escopo do piloto:** Simulado, Orçamento, Gráfico, Imprimir, Ind.A/Ind.B, FCont,
e as abas 1-Compra, 2-Vendas, 3-Logística, 5-Financeiro, 6-Fiscal.

**Fora do piloto — decidido em 27/08/2026:** os checkboxes do Winthor que não aparecem no
mockup (`Deduzir ST`, `Deduzir PIS/COFINS`, `Mostrar Cli.Especial`, `Mostrar Contas Zeradas`,
`Mostrar Investimento`, `Mostrar NÃO PAGO`, `Ind.A`, `Ind.B`, `FCont`) **ficam de fora**.
A tela web segue o print `Como deve ser a rotina em web.png` — nada além dele.
O SQL é reproduzido com a combinação capturada no trace (a mesma em todos os cenários), que
passa a ser o comportamento fixo da versão web.

**Estilo:** cores, tipografia e desenho de componentes serão extraídos de
`Projeto KPI Ian/epoca-fechamentos` — **somente estilo**, sem copiar regra de negócio,
trecho de código ou dependência. Toda biblioteca nova passa por aprovação.

---

## 10. Lacunas em aberto

**Todas resolvidas em 28/08/2026.** Nenhuma lacuna bloqueia a implementação.

| # | Pergunta | Como resolver |
|---|---|---|
| ~~1~~ | ~~Mapa das linhas de cabeçalho para as colunas de faturamento~~ | **RESOLVIDO** por aritmética sobre as planilhas — ver §7 regra 0 |
| ~~2~~ | ~~`CodigoCentroCusto` é numérico ou hierárquico com ponto?~~ | **RESOLVIDO** — 1666 de 1757 têm ponto; chave da dimensão será `VARCHAR2` (§6) |
| ~~3~~ | ~~Grupo 8501 seria descartado~~ | **REVISTO em 28/08/2026** — a chave injetada muda por dimensão (400, 4000004, 85, 8501) e corresponde a linha existente. O valor NÃO é descartado: entra em *Outras Receitas*, depois do RESULTADO OPERACIONAL (§4.5) |
| ~~4~~ | ~~Efeito dos checkboxes não mapeados~~ | **FORA DO PILOTO** (§9). Exceção documentada: `Deduzir ST` e `Deduzir PIS/COFINS` afetam o número, e a web replica o comportamento desmarcado (§7 regra 0) |
| ~~5~~ | ~~`AntesLF` usa `LUCRO FINAL` nas dimensões de centro de custo~~ | **RESOLVIDO em 28/08/2026** — `LUCRO FINAL` **não existe** em `EPCPARDRE` (só `LUCRO BRUTO`, `DESPESA OPERACIONAL ECL` e `LUCRO LIQUIDO`). Logo `AntesLF = N` em todas as linhas de estrutura dessas duas dimensões |
| ~~6~~ | ~~Distribuir por `nvl(DTPAGTO,DTVENC)` em Competência está correto?~~ | **CONFIRMADO correto** — replicar (§4.7) |
| ~~6b~~ | ~~Despesa não paga fora do DRE em Competência está correto?~~ | **CONFIRMADO correto** — replicar (§4.7) |
| ~~7~~ | ~~Quantas matrículas têm restrição de data?~~ | **RESOLVIDO** — 1 linha, janela aberta; fora do piloto (§5.2) |
| ~~8~~ | ~~Filiais serão sempre 7/12/25?~~ | **RESOLVIDO** — o `IN` vem da pré-seleção do Winthor; a web lista **as 18** direto do banco (§5.5) |
| 9 | Os 6 problemas de dado de `EPCPARDRE` (§5.4): replicar o comportamento atual ou corrigir na web? | Decisão de negócio antes da Fase 4 |
| ~~10~~ | ~~`EPCPARDRE_RESP` — tabela nova, com `codfil = 25` fixo no SQL~~ | **RESOLVIDO em 28/08/2026** — colunas `CODCONTA`, `CODFIL`, `MATRICULA`; `MATRICULA` vem **vazia** na amostra, então `RESPONSAVEL` resultaria nulo. Não está no mockup: **omitir da implementação** |

### Queries de exploração propostas

**A — natureza do código de centro de custo** — ✅ executada em 27/08/2026, resultado no §6.

```sql
SELECT COUNT(*) AS total,
       SUM(CASE WHEN CodigoCentroCusto LIKE '%.%' THEN 1 ELSE 0 END) AS com_ponto,
       MIN(CodigoCentroCusto) AS menor, MAX(CodigoCentroCusto) AS maior
  FROM PCCENTROCUSTO;
-- total 1757 | com_ponto 1666 | menor 1001 | maior 9701.001
```

**A2 — colisões e profundidade da hierarquia** — ✅ executada: `max_pontos = 2`, nenhuma colisão.

```sql
SELECT MAX(LENGTH(CodigoCentroCusto) - LENGTH(REPLACE(CodigoCentroCusto,'.',''))) AS max_pontos
  FROM PCCENTROCUSTO;
```

```sql
SELECT chave_num, COUNT(*) AS qde,
       MIN(CodigoCentroCusto) AS cod_a, MAX(CodigoCentroCusto) AS cod_b
  FROM (SELECT CodigoCentroCusto,
               CASE WHEN INSTR(CodigoCentroCusto,'.') = 0 THEN CodigoCentroCusto
                    ELSE RTRIM(CodigoCentroCusto,'0') END AS chave_num
          FROM PCCENTROCUSTO)
 GROUP BY chave_num HAVING COUNT(*) > 1;
```

**A3 — configuração NLS da sessão** — dispensada. Com dois separadores no código, `TO_NUMBER`
falha independentemente do NLS.

**B — o que é o grupo 8501** — ✅ executada: 1 registro, `CODCOB = 'CAR'`, total `225.000`
no período de 01/08 a 27/08/2026. Falta só o rótulo, que vem da Query D.

```sql
SELECT fin.codcob, COUNT(*) AS qde, SUM(fin.valor) AS total
  FROM pcnfsaid nf, pcprest fin
 WHERE nf.numnota = fin.duplic AND nf.numtransvenda = fin.numtransvenda
   AND nf.condvenda = 0 AND nf.vltotal > 0 AND fin.codcob <> 'DESD' AND fin.dtcancel IS NULL
   AND fin.dtpag BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy') AND TO_DATE('27/08/2026','dd/mm/yyyy')
 GROUP BY fin.codcob ORDER BY 3 DESC;
```

**C — restrição de data por usuário** — ✅ executada: 1 linha, matrícula `51`,
`dtIni = 01/07/2012`, `dtFim` nulo. Fora do piloto.

```sql
SELECT matricula, dtIni, dtFim FROM tab_ger_restricao_data_dre ORDER BY matricula;
```

**D — parametrização do DRE** — ✅ executada, resultado analisado em §5.3 e §5.4.

```sql
SELECT ID, CODGRUCONTA, GRUPO, INFCONTAS, COR FROM EPCPARDRE ORDER BY ID;
```

**D2 — filiais** — ✅ executada: 18 filiais, listadas em §5.5. **Esta é a consulta que a versão
web deve usar para popular o filtro Filial** (sem o `IN` da pré-seleção do Winthor).

```sql
SELECT f.codfil, f.label, e.descricao, f.ordem_processa
  FROM filiais f, empresa e WHERE f.empresa = e.empresa ORDER BY f.ordem_processa;
```
