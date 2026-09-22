# O filtro por fornecedor da 9815

**Estado: investigação concluída, nada implementado.** Pausado em 22/09/2026 na branch
`feat/filtro-fornecedor`, à espera de **uma decisão do Gabriel** — a seção *A decisão que
falta* é a razão deste arquivo existir.

O filtro por fornecedor da 9815 não é um filtro. São **três mecanismos diferentes** disparados
pelo mesmo campo da tela, e só o primeiro filtra de verdade. Tudo aqui foi medido contra
exportações reais da rotina; as asserções vivem em
[dc58](validacao/dc58_filtro_por_fornecedor_na_filial_7.mjs) e passam ao centavo.

## O que o filtro faz

A base de tudo é a **participação**, que a 9815 calcula e mostra no lugar do `%AV` da linha
`RECEITAS LIQUIDAS` — onde normalmente estaria `100,000`, aparece `P.23,852%`:

```
participação = RECEITAS LIQUIDAS filtrado ÷ RECEITAS LIQUIDAS total
```

| | O que acontece |
|---|---|
| **Faturamento** | filtra de verdade, por `pr.codfornec` — o fornecedor do **produto**, em `PCPRODUT`, item a item. Não é o fornecedor da nota nem o cliente. Atinge tudo do lucro bruto para cima |
| **Centro 90** (`VERBAS MARGEM`) | valor **exclusivo** do fornecedor, resolvido no SQL. Não é rateado |
| **Centro 25** (`EQUIPE P&G`) | entra **inteiro** se a P&G estiver selecionada; **some** se não |
| **Contas sem centro de custo** | **somem**, por `NULL NOT IN (90)` |
| **Todo o resto** | vem cheio do SQL e é **rateado** pela participação, dentro do Delphi |

O rateio não está no SQL — descobri comparando planilhas, não lendo o log. A prova é o `%AV`:
ele fica **idêntico** ao do DRE sem filtro, porque numerador e denominador são multiplicados
pelo mesmo fator.

## O que rege a implementação

**Remover primeiro, ratear depois.** As duas operações não comutam, e essa é a armadilha que
mais importa:

```
Sub-Total = (Sub-Total sem filtro − EQUIPE P&G) × participação
-2.873.577,62 = (-12.669.998,14 + 622.565,47) × 0,238522     ✓ ao centavo
ratear o Sub-Total inteiro daria -3.022.073,18               ✗ erra 148 mil
```

Uma implementação que rateie o total pronto erra **148 mil reais** na filial 7 sem que nada
pareça errado na tela.

Vale para as três dimensões: em Grupo de Contas o centro 25 não é uma linha visível, está
diluído dentro das contas, e mesmo assim as sete calculadas fecham iguais às de C.Custo
Principal com o filtro ligado.

---

## A decisão que falta

O SQL da 9815 carrega o código da P&G **escrito à mão**:

```sql
AND ( (codccprinc = 25 and 29 in (<seleção>)) or (codccprinc <> 25) )
```

O `29` é literal fixo. A condição lê *"a P&G está entre os selecionados?"*. Das 15 ocorrências
do filtro na execução, 13 usam o fornecedor escolhido e **só estas 2** carregam o `29` — a
mesma condição repetida no `SELECT` e no `WHERE`. É exceção pontual, não padrão.

**Não há de onde ler esse vínculo** ([dc59](validacao/dc59_vinculo_centro_fornecedor.sql)):
`PCCENTROCUSTO` tem oito colunas e nenhuma aponta para fornecedor, nenhuma tabela de centro de
custo tem coluna de fornecedor, não existe tabela `EPC*` para isso, e a regra não está
repetida em view, procedure ou trigger. O controle de privilégio veio completo, então os
vazios são resposta.

### Duas opções, e o que cada uma custa

**Repetir o hardcode.** Fidelidade à 9815, homologação fecha ao centavo, nenhum ruído na
conferência. O preço é herdar as inconsistências abaixo.

**Configuração numa tabela nova nossa.** Resolve as inconsistências, mas é **divergência
deliberada** — precisa de aprovação e registro em `DIVERGENCIAS.md` antes de existir, e exige
a conversa com o negócio sobre quais vínculos cadastrar.

**A recomendação registrada é hardcode agora, configuração depois**: enquanto a homologação não
terminar, qualquer divergência nossa vira ruído numa conferência que já é difícil. O argumento
do outro lado é legítimo — se o setor já sabe que a Unilever deveria receber o mesmo
tratamento, entregar com o defeito conhecido é entregar algo que vai precisar ser refeito.

### O que a decisão herda, se for pelo hardcode

**A P&G não é a única com centro dedicado**, e a regra trata só um deles:

| | |
|---|---|
| `2401` | VENDAS UNILEVER |
| `2601` | UNILEVER |
| `2501` | EQUIPE P&G — **o único tratado** |
| `2806` | TRANSPORTE T - P&G — **P&G também, e não tratado** |

Inconsistente nos dois sentidos: filtrar por Unilever não traz os centros dela, e filtrar por
P&G traz o 25 mas não o 2806, que é rateado junto com o resto do transporte.

**Existem dois cadastros da P&G** — `29` e `2453`, os dois com verba no centro 90, juntos 10,2%
da receita da filial 7. Filtrar só pelo **2453** faz `29 in (2453)` ser falso, e a
`EQUIPE P&G` desaparece do DRE **da própria P&G**. Não é hipótese sobre o futuro: os dois
cadastros existem hoje.

## O que ficou sem medir

**O centro 25 com a P&G selecionada nunca foi visto funcionando.** Que ele entra *inteiro*, e
não rateado, é leitura do SQL — o mesmo par de condições aparece no `CASE` do
`VPAGO_EXCLUSIVO_FORNEC`, que é a coluna do "não rateie", e é a mecânica do centro 90, essa
sim medida. Na filial 27 o centro 25 não teve movimento; na filial 7 exportamos Gillette e
Colgate, e nenhuma ativa a condição.

Fecha com **duas exportações**, filial 7, agosto/2026: uma pelo fornecedor **29** e outra pelo
**2453**. A primeira confirma se a linha entra inteira ou rateada; a segunda prova ou desmente
o problema dos dois cadastros. A dc58 já as compara — basta passar os arquivos.

Também em aberto: `ALL_SOURCE` não teve consulta de controle própria, então o vazio da
consulta 5 da dc59 ainda admite a leitura "não enxergo o código". Um `SELECT COUNT(*) FROM
ALL_SOURCE` resolve.

## Onde está cada coisa

| | |
|---|---|
| [dc56](validacao/dc56_centros_90_e_25.sql) | os centros 90 e 25 — a investigação na filial 27 |
| [dc57](validacao/dc57_fornecedores_para_teste_filial_7.sql) | como o terreno do teste foi escolhido |
| [dc58](validacao/dc58_filtro_por_fornecedor_na_filial_7.mjs) | **a mecânica, com 21 asserções ao centavo** |
| [dc59](validacao/dc59_vinculo_centro_fornecedor.sql) | o vínculo centro→fornecedor não existe no cadastro |
