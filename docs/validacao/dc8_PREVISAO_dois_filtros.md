# dc8 — Previsão registrada antes de alinhar os dois filtros

**Escrita em 02/09/2026, antes de rodar.** Se o resultado não bater, a explicação está
errada e o caminho é outro — não é para ajustar a previsão depois.

## O que a dc7 mostrou

A apuração e o detalhamento divergem em exatamente **dois filtros**:

| Filtro | Apuração | Detalhamento |
|---|---|---|
| `FIN.DTESTORNOBAIXA IS NULL` | não tem | **tem** |
| `FIN.CODCONTA NOT IN (SELECT codconta FROM EPCPARDRE_NAOEXIBIR)` | **tem** | não tem |

Os dois vieram de traces da própria 9815 — o primeiro da tela de detalhamento, o segundo
da tela do DRE. É a terceira vez neste levantamento que as duas telas dela discordam
entre si (as outras duas estão em `DIVERGENCIAS.md` §4).

## A mudança

O detalhamento passa a usar o critério da apuração: sai o `DTESTORNOBAIXA IS NULL`, entra
o `NOT IN (EPCPARDRE_NAOEXIBIR)`. Mesma decisão da divergência 4, pelo mesmo motivo — uma
resposta que não soma o valor perguntado não responde a pergunta que o duplo clique faz.

## Previsão

**`VENDAS`** — apuração 626 lançamentos, detalhamento 601, diferença −471,87. Os 25 que
faltam têm `DTESTORNOBAIXA` preenchida. Depois da mudança:

    626 lançamentos, −2.025.585,87, idêntico à linha.

**`RATEIO DESP. CORPORATIVAS`**, as duas linhas da chave 96. Um lançamento de +36.726,00
sai do bloco operacional e um de −36.726,00 sai do pós-operacional; por isso as duas erram
em sentidos opostos e o total geral continuava batendo. Depois da mudança:

    operacional      3 lançamentos,   −134.261,90
    pos-operacional  6 lançamentos,    866.743,00

**As 18 órfãs em 0,00** — esta é a parte incerta. A hipótese é que `Verbas Rebaixa Custo`,
`Estoque De Transporte`, `Estoque De Terceiros` e as demais estejam em
`EPCPARDRE_NAOEXIBIR`, e que o detalhamento passe a devolver **zero lançamentos** para
elas, fechando com a linha.

Se **não** fecharem, a causa é outra e já está documentada: o bloco de órfãs da estrutura
marca `AntesLF = 'N'` enquanto os valores dessas contas saem com `AntesLF = 'S'`, e as
chaves nunca se encontram (`DIVERGENCIAS.md` §2). Nesse caso o 0,00 da linha é a 9815
sendo reproduzida fielmente, e o detalhamento estaria mostrando um dinheiro que o DRE
esconde — o que é defensável, mas precisa de rótulo, não de silêncio.

**Placar previsto:** de 136/157 para **139/157** no mínimo, e **157/157** se a hipótese das
órfãs estiver certa.

## O que NÃO pode acontecer

As cinco linhas conferidas contra as planilhas da 9815 na `dc5` — DIRETORIA, COMPRAS-RAT,
RECEITAS FINANCEIRAS, ACERTO DE ESTOQUE e DISTRIBUIÇÃO DE LUCROS — **têm que continuar
fechando**. Elas passaram nos dois critérios, o que significa que não têm estorno de baixa
nem conta escondida envolvidos. Se alguma quebrar, a mudança pegou mais do que devia.
