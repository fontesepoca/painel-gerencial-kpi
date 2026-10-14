# Coluna PROVISIONADO no regime competência — especificação

**Data:** 14/10/2026 · **Branch:** `feat/provisionado-competencia` · **Pedido:** Gabriel

## 1. O problema

Em competência, o DRE mostra só o que já foi **pago** (`PCLANC.DTPAGTO IS NOT NULL`). Uma
despesa de setembro lançada e ainda em aberto não aparece em lugar nenhum: o mês parece mais
barato do que é, e cresce sozinho conforme os títulos são pagos. Quem lê o DRE de um mês recente
não sabe quanto ainda vai entrar nele.

O pedido é mostrar, ao lado do valor de hoje, **o que está em aberto naquele mês** e a soma dos
dois — sem mudar o valor que já existe, e com um checkbox para esconder tudo isso.

**Há "lixo" no aberto, e é de propósito que ele apareça.** Títulos esquecidos, duplicados ou
nunca pagos ficam visíveis para que quem os cadastrou seja cobrado. Nenhum filtro a mais.

## 2. As decisões

| # | Decisão | Por quê |
|---|---|---|
| D1 | Só no regime **competência**. Em caixa nada muda. | Em caixa a data do filtro é a do pagamento: título em aberto não tem mês. |
| D2 | **Em aberto = a mesma consulta de despesas, trocando só `DTPAGTO IS NOT NULL` por `DTPAGTO IS NULL`.** Mesmos filtros, mesmo rateio, mesmos marcadores da base. | Um título que é pago sai do Provisionado e entra no Valor da mesma linha, sem mexer no Total. Nenhum critério próprio para divergir. |
| D3 | Sem exclusão de "lixo" (vencidos antigos, valor zero…). | Visibilidade para cobrança (pedido do Gabriel). |
| D4 | Valor do título em aberto = `VALOR` (o `nvl(VPAGO, VALOR)` da consulta já cai nele). | `VPAGO` só existe depois do pagamento. |
| D5 | O ramo `RECEITA VENDA ATIVO` (`PCNFSAID`/`PCPREST`, chave `85`/`400`/`8501`) **não entra** no aberto. | É receita já recebida (`fin.dtpag`); entraria duas vezes. |
| D6 | **Só as linhas de despesa** ganham Provisionado. Totalizadores, receita e CMV não. | Opção 2 do Gabriel. Ver §8 para a evolução. |
| D7 | **%AV e %AH continuam só sobre o Valor**, fiéis à 9815. Provisionado e Total não têm percentual. | Um %AH sobre Total misturaria pago com não pago. |
| D8 | As colunas aparecem **só nos meses com algo em aberto**; o bloco do período as ganha se algum mês tiver. | Pedido: "neste mês deve existir colunas diferentes". |
| D9 | Checkbox **"Mostrar provisionado"**, marcado por padrão, ao lado de AV% e AH%; só aparece em competência com algo em aberto. Desmarcado, a tela é idêntica à de hoje. | Pedido. |
| D10 | Duplo clique em **Provisionado** abre os títulos em aberto da linha e do mês, com **Vencimento**, **Dias em atraso** e **Lançado por**. Valor continua abrindo os pagos; Total não abre nada. | Cobrança. Total é soma de duas células já na tela. |
| D11 | Excel e impressão seguem o checkbox. | O arquivo conta o que a tela conta. |

## 3. Arquitetura

### 3.1 API — a consulta

Uma segunda execução da consulta de despesas da análise (`AnaliseDre.SqlDespesas`), **em
paralelo** com a de hoje e só quando `regime == competencia`:

- o `WHERE DTPAGTO IS NOT NULL` do subselect `FIN` vira `WHERE DTPAGTO IS NULL`;
- o ramo `union all … from pcnfsaid nf, pcprest fin` sai.

A versão em aberto é **derivada** do texto de hoje por `DreGerencialQueries.EmAberto(sql)`, que
troca dois trechos que aparecem **exatamente uma vez** em cada consulta — e lança se a
contagem for outra, em vez de seguir com uma troca parcial:

- `WHERE DTPAGTO IS NOT NULL` → `WHERE DTPAGTO IS NULL`;
- `nf.codfilial IN ({3})` → `nf.codfilial IN ({3}) AND 1 = 0` (o ramo de venda de ativo fica
  vazio).

O texto das constantes **não muda**: dc86 e dc76 continuam valendo sem reapontar. O ramo é
desligado, e não removido, para que **a lista de parâmetros seja idêntica nas duas versões**
— o ODP.NET liga por posição, e duas listas diferentes são o jeito mais fácil de errar a
ordem sem nenhum erro de compilação. O fornecedor entra igual (`{4}`/`{5}`).

O detalhamento usa o mesmo mecanismo sobre `DreDetalheQueries.Lancamentos`
(`WHERE DTPAGTO IS NOT NULL) FIN` e `nf.codfilial IN ({2})`).

### 3.2 API — o montador

`ColunaApuracao` ganha a lista de despesas em aberto daquela coluna. O `MontadorDre`:

- indexa o aberto pela **mesma tupla** e pelo **mesmo `Destino`** do pago (inclusive contas
  subidas e sobra — §14 do DIVERGENCIAS);
- aplica o **mesmo rateio por fornecedor** do Valor:
  `(aberto − exclusivo) × participação + exclusivo`;
- preenche `Provisionado` só em linhas de conta (não calculadas); totalizadores ficam `null`;
- arredonda por coluna, half-to-even, antes de somar o período — como o Valor;
- **visibilidade**: uma linha sem pago e com aberto **tem movimento** (`SemMovimento = false`).

### 3.3 Contrato (DTOs)

| DTO | Campo novo | Significado |
|---|---|---|
| `ValorMesDto` | `decimal? Provisionado` | Aberto da linha na coluna. `null` em caixa, em totalizador e quando a coluna não tem aberto. |
| `TotalLinhaDto` | `decimal? Provisionado` | Soma do período. Mesmas regras de `null`. |
| `PeriodoDto` | `bool TemProvisionado` | A coluna tem algum aberto em qualquer linha. Decide se as colunas aparecem. |

O TOTAL (Valor + Provisionado) é calculado na tela: é soma de dois números que já vieram.

### 3.4 Detalhamento

`DetalheFiltroDto` ganha `bool Provisionado`. Com ele, `DreDetalheQueries.Lancamentos` roda
com o mesmo ponto de troca (`DTPAGTO IS NULL`) e sem o ramo de venda de ativo. O
`DetalheLancamentoDto` ganha `DtVenc`; **Dias em atraso** é calculado na tela (hoje − vencimento,
só quando positivo); **Lançado por** é o `NomeFunc` que já existe.

O rodapé fecha com a célula de Provisionado — inclusive com fornecedor (coluna `No DRE`).

### 3.5 Front

- `TabelaDre`: duas colunas por mês com `TemProvisionado` e no bloco do período; cabeçalho de
  banda acompanha; zebra, colunas fixas e os dois temas como o resto da tabela.
- Checkbox "Mostrar provisionado" na barra de controles, ao lado de AV% e AH% e com o mesmo
  comportamento deles (marcado ao abrir a tela).
- Duplo clique em Provisionado → detalhamento com `provisionado: true`; o modal mostra
  "Títulos em aberto" no título e as três colunas novas.
- `lib/exportarExcel.ts` e `impressao.tsx`: as colunas entram quando o checkbox está marcado.
- O recálculo da reordenação (`lib/recalculoDoDre.ts`) não muda: os totalizadores não usam
  Provisionado (D6).

## 4. Bases

Vale para Época e Minas Rural sem configuração: a regra não é literal de nenhuma base. O
`RegrasDaBase.Aplicar` continua expandindo os marcadores nas duas versões da consulta.

## 5. Desempenho

A apuração em competência passa a varrer `PCLANC` duas vezes. As duas rodam em paralelo; o
aberto é uma fração pequena do pago, e o custo dominante da apuração é o faturamento. Medir o
tempo de um mês e de três meses antes e depois (registrar no DIVERGENCIAS).

## 6. Divergência com a 9815

A 9815 não tem nada disso. As colunas novas são **acréscimo**: o Valor, %AV, %AH e todos os
totalizadores continuam idênticos aos da rotina antiga. Entra no DIVERGENCIAS.md como
divergência a pedido, com a medição de um mês.

## 7. Provas

| Prova | O que garante |
|---|---|
| Teste do montador, sem banco (`.cs`, como a dc91) | aberto na linha certa; linha só com aberto aparece; totalizador sem Provisionado; caixa sem nada; rateio por fornecedor; conta subida e sobra; `TemProvisionado` por coluna |
| dc86 | sem provisionado, o SQL da Época é o de antes, caractere por caractere |
| dc34 (API) | o LUCRO LIQUIDO não mudou nas três análises |
| dc6 adaptada (API) | o detalhe de cada célula de Provisionado fecha com ela |
| dc78 (API) | com fornecedor, o detalhe do Provisionado fecha com a célula rateada |
| Consulta para o Gabriel | o Provisionado de um mês bate com o `PCLANC` em aberto, por centro |
| Tela | checkbox liga/desliga; meses sem aberto sem colunas; Excel e impressão; dois temas |

## 8. Fora desta versão (evolução documentada)

**Provisionado e Total nos totalizadores** (opção 1 da conversa de 14/10): o Provisionado do
`Sub-Total` seria a soma dos provisionados das despesas operacionais, e o TOTAL do `LUCRO
LIQUIDO` mostraria o lucro do mês se tudo em aberto fosse pago. O contrato já comporta —
`Provisionado` é `null` nos totalizadores hoje; ligar é preenchê-lo no `MontarMes` com as
mesmas regras de bloco (`AntesRo`/`AntesLl`) e somar no front. Teria de entrar também no
recálculo da reordenação (`recalculoDoDre.ts`) e na sua invariante (dc35).

Também fora: Provisionado em caixa, %AV/%AH sobre Provisionado ou Total, e filtro de "lixo".
