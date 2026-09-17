# Schema do banco — tabelas usadas pela DRE Gerencial

Base **Oracle 19c EE High Performance da Época Distribuição**. As tabelas `PC*` são do ERP **Winthor**; as demais
são customizações da Época.

Levantado a partir do trace SQL da rotina 9815. Cada coluna listada é **efetivamente usada**;
não é o dicionário completo das tabelas.

> **Regra absoluta:** nada nesta lista é escrito, exceto `tab_log_exec_rotina`.
> Migration nunca roda em tabela legada. Ver [AGENTS.md](../AGENTS.md).

---

## Resumo

| Acesso | Tabelas |
|---|---|
| **Leitura** | 22 tabelas — todas as listadas abaixo, exceto a próxima linha |
| **Escrita** | `tab_log_exec_rotina` — apenas `INSERT` de log, **e fora do escopo do piloto** |

> **O piloto é 100% leitura.** Decidido em 28/08/2026: a versão web **não grava** o log de
> execução. Consequência prática — a aplicação pode rodar com **usuário Oracle
> somente-leitura** durante toda a validação, e fica impossibilitada de alterar qualquer
> coisa na base de produção.

Confirmado por varredura dos 16 arquivos de trace: **12 `INSERT INTO tab_log_exec_rotina`**,
12 `COMMIT`, 4 `ROLLBACK` (os cenários que falharam), e **nenhum** `UPDATE`, `DELETE`,
`MERGE`, `TRUNCATE` ou DDL.

---

## Tabelas do Winthor — somente leitura

### Financeiro / despesas

**`PCLANC`** — lançamentos financeiros. É a base das despesas do DRE.

| Coluna | Uso |
|---|---|
| `RECNUM` | chave; liga ao rateio e à exclusão de adiantamentos |
| `CODFILIAL` | filtro de filial |
| `CODCONTA` | conta gerencial; liga a `PCCONTA` |
| `VPAGO`, `VALOR` | valor; a rotina usa `nvl(VPAGO, VALOR)` |
| `DTPAGTO` | data de pagamento — regime **caixa**; e `IS NOT NULL` é filtro fixo |
| `DTVENC` | fallback quando `DTPAGTO` é nulo |
| `DTCOMPETENCIA` | regime **competência** |
| `HISTORICO`, `HISTORICO2` | descrição; `HISTORICO` também exclui estorno de borderô |
| `TIPOPARCEIRO`, `CODFORNEC` | identifica o parceiro (F/R/C) |
| `NUMTRANS`, `NUMNOTA`, `DUPLIC`, `NUMBORDERO`, `NUMSEQBORDERO` | rastreabilidade (drill-down) |
| `NUMBANCO`, `NUMCHEQUE`, `NUMCHEQUE2`, `LOCALIZACAO`, `NOMEFUNC` | detalhe do pagamento |
| `CODPROJETO`, `INDICE` | complementares |
| `DTRECLASSIFIC`, `CODFUNCRECLASSIFIC`, `CODFUNCBAIXA` | auditoria |

**`PCRATEIOCENTROCUSTO`** — rateio de lançamento por centro de custo.
`RECNUM`, `CODCONTA`, `CODIGOCENTROCUSTO`, `VALOR`.
Quando existe rateio, o valor rateado **substitui** o valor do lançamento.

**`PCLANCADIANTFORNEC`** — adiantamentos a fornecedor.
`RECNUMADIANTAMENTO`, `RECNUMPAGTO`, `DTESTORNO`. Usada só para **excluir** adiantamentos
já quitados.

### Plano de contas

**`PCCONTA`** — conta gerencial.
`CODCONTA`, `CONTA`, `GRUPOCONTA` (filtro `>= 200`), `USARATEIOCENTROCUSTO`.

**`PCGRUPO`** — grupo de contas. `CODGRUPO`, `GRUPO`.

**`PCCENTROCUSTO`** — centro de custo. `CODIGOCENTROCUSTO`, `DESCRICAO`.

> `CODIGOCENTROCUSTO` é **`VARCHAR2` hierárquico**: 1666 dos 1757 registros contêm ponto, e
> há códigos com **dois** separadores (`9701.001.02`). Nunca converta para número.
> O "centro de custo principal" é `SUBSTR(CODIGOCENTROCUSTO, 1, 2)`.

**`PCCONTACENTROCUSTO`** — vínculo conta × centro de custo. `CODCONTA`, `CODIGOCENTROCUSTO`.

### Faturamento, CMV e devoluções

**`PCNFSAID`** — nota fiscal de saída.
`NUMTRANSVENDA`, `NUMNOTA`, `CODFILIAL`, `CODCLI`, `DTSAIDA`, `DTCANCEL`, `CONDVENDA`,
`ESPECIE`, `VLTABELA`, `VLTOTAL`, `VLTOTGER`, `VLCUSTOFIN`, `OBS`,
`DTHORACANCELAMENTOSEFAZ`.

**`PCMOV`** — movimentação de item. O coração do cálculo.
`NUMTRANSVENDA`, `NUMTRANSITEM`, `NUMTRANSENT`, `NUMNOTA`, `NUMPED`, `CODPROD`, `CODFISCAL`,
`CODSEC`, `QT`, `QTCONT`, `PUNIT`, `PUNITCONT`, `PTABELA`, `CUSTOFIN`, `CUSTOFINEST`,
`CUSTOCONT`, `ST`, `VLPIS`, `VLCOFINS`, `PERPIS`, `PERCOFINS`, `DTCANCEL`.

**`PCMOVCOMPLE`** — complemento do movimento. `NUMTRANSITEM`, `VLFECP` (fundo de combate à
pobreza, somado ao ST).

**`PCPRODUT`** — produto. `CODPROD`, `CODSEC` (exclui seção 1601).

**`PCNFENT`** — nota de entrada, usada para devolução.
`NUMNOTA`, `NUMTRANSENT`, `CODFILIAL`, `CODFORNEC`, `DTENT`, `TIPODESCARGA` (6 e 7), `OBS`.

**`PCPEDC`** — pedido. `NUMPED`, `CONDVENDA`.

**`PCPREST`** — parcelas. `DUPLIC`, `NUMTRANSVENDA`, `CODCOB`, `DTPAG`, `DTCANCEL`, `VALOR`.
Alimenta o grupo fixo `8501`.

### Cadastros auxiliares

| Tabela | Colunas | Uso |
|---|---|---|
| `PCFORNEC` | `CODFORNEC`, `FORNECEDOR` | nome do parceiro tipo F |
| `PCCLIENT` | `CODCLI`, `CLIENTE`, `CODCLIPRINC` | nome do parceiro tipo C; cliente especial |
| `PCUSUARI` | `CODUSUR`, `NOME` | nome do parceiro tipo R (RCA) |
| `PCEMPR` | `MATRICULA`, `NOME` | quem deu baixa |
| `PCFILIAL` | `CODIGO`, `UF` | UF da filial |

---

## Tabelas customizadas da Época

### `EPCPARDRE` — parametrização do DRE  ⭐

**A tabela mais importante.** Define quais linhas o relatório tem, em que ordem e com que cor.

| Coluna | Tipo | Significado |
|---|---|---|
| `ID` | NUMBER | **ordem de exibição**. Tem lacunas, um valor duplicado (1268) e **uma linha com `ID` nulo** |
| `CODGRUCONTA` | NUMBER | `> 0` referencia `PCCONTA.CODCONTA`; `<= 0` é linha calculada |
| `GRUPO` | VARCHAR2 | rótulo exibido |
| `INFCONTAS` | VARCHAR2 | `'S'` marca as 9 linhas totalizadoras |
| `COR` | NUMBER | `TColor` do Delphi — **BGR**, não RGB |

**Linhas calculadas:**

| `CODGRUCONTA` | Linhas |
|---|---|
| `-1` | RECEITA BRUTA, ABAT./DESC., DEVOLUCAO, ST, PIS, COFINS, RECEITAS LIQUIDAS, CMV LIQ. |
| `-2` | Sub-Total → Despesas Operacionais |
| `-3` | Total das Despesas |
| `-4` | LUCRO BRUTO, RESULTADO OPERACIONAL, LUCRO LIQUIDO |

**Conversão de `COR`** (inverter os bytes):

| Valor | `TColor` | CSS | Uso |
|---|---|---|---|
| 65535 | `0x00FFFF` | `#FFFF00` | amarelo — totalizadores |
| 65280 | `0x00FF00` | `#00FF00` | verde |
| 12639424 | `0xC0DCC0` | `#C0DCC0` | verde claro |
| 15780518 | `0xF0CAA6` | `#A6CAF0` | azul claro — impostos |
| 12632256 | `0xC0C0C0` | `#C0C0C0` | cinza — imobilizado |
| 32896 | `0x008080` | `#808000` | oliva |

**Problemas de dado conhecidos** — replicar, não corrigir. Detalhe em
[ROTINA_9815_LEVANTAMENTO.md](ROTINA_9815_LEVANTAMENTO.md) §5.4:
`ID` nulo · `ID` 1268 duplicado · `CODGRUCONTA` 3000161 em duas linhas · rótulos repetidos ·
grupo `8501` sem linha correspondente.

### Demais

| Tabela | Colunas | Uso |
|---|---|---|
| `EPCPARDRE_NAOEXIBIR` | `CODCONTA` | contas suprimidas do relatório |
| `filiais` | `CODFIL`, `LABEL`, `DESCRICAO`, `EMPRESA`, `ORDEM_PROCESSA`, `DBLEPCTI` | **18 filiais**; popula o filtro Filial |
| `empresa` | `EMPRESA`, `DESCRICAO` | agrupador (EPC, FUT, VIVALOG, GB, MRURAL, VALE, SUP) |
| `cliente_especial` | `CODCLI`, `CODFIL`, `MOSTRA_DRE` | entra se `MOSTRA_DRE = 'S'` **ou** `CONDVENDA = 5` |
| `tab_ger_restricao_data_dre` | `MATRICULA`, `DTINI`, `DTFIM` | janela de data por usuário. **1 linha só** (matrícula 51, janela aberta) — fora do escopo do piloto |

### `tab_log_exec_rotina` — a única escrita da 9815, **não usada no piloto**

| Coluna | Conteúdo |
|---|---|
| `CODLOG` | chave, gerada por `SELECT NVL(max(codlog),0)+1` |
| `ROTINA` | `9815` |
| `DTINICIO`, `DTFIM` | início e fim da apuração |
| `DESCRICAO` | `'Ult Processamento: 4-DRE / <Análise> - '` |
| `USUARIO` | `'<matrícula> - <nome>'` |

> **Decisão de 28/08/2026: o piloto não grava aqui.** A tabela é da Época, não do Winthor, e
> gravar nela não violaria a regra de tabela legada — mas ficar sem escrita nenhuma permite
> usuário Oracle somente-leitura, o que elimina qualquer risco durante a validação.
>
> Quando o log voltar, terá que resolver a concorrência: a chave vem de `max(codlog)+1`, sem
> sequence. No Delphi monousuário quase nunca colidia; numa API web com várias abas, colide.
> A correção é uma sequence Oracle — objeto **novo**, não mexe em nada legado.

---

## Stored procedures e functions

**Nenhuma.** A 9815 monta todo o SQL por concatenação de string no Delphi. `GetValorGrupo`,
que aparece na mensagem de erro da rotina, é um método Delphi — não existe no banco.
