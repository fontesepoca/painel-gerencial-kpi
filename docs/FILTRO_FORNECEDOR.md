# O filtro por fornecedor da 9815

**Estado: investigação concluída, nada implementado.** A decisão que segurava esta branch —
repetir o hardcode ou cadastrar o vínculo — **tem desenho fechado e carga pronta** desde
01/10/2026; falta a conversa com o financeiro sobre as linhas que são divergência.

O filtro por fornecedor da 9815 não é um filtro. São **três mecanismos diferentes** disparados
pelo mesmo campo da tela, e só o primeiro filtra de verdade.

## De onde vem o que está escrito aqui

Até 22/09/2026 tudo isto era **dedução a partir de exportações** da 9815, com as asserções da
[dc58](validacao/dc58_filtro_por_fornecedor_na_filial_7.mjs) fechando ao centavo. Em
01/10/2026 o **código-fonte Delphi apareceu**, e o que era dedução virou leitura:

| | |
|---|---|
| Arquivo | `UBase.pas` — a unit `TFBase`, 28.750 linhas, 1,4 MB |
| O hardcode | linha **27217** (o `WHERE`) e **27146** (o `CASE`) |
| O rateio | linhas **5797-5812** |
| A participação | linha **27531**, com a origem em **27317** |
| O `P.23,852%` da tela | linha **6189** |

As medições continuam valendo, e em dois pontos o fonte **corrigiu** o que estava escrito
aqui. Os dois estão marcados abaixo.

## O que o filtro faz

A base de tudo é a **participação**, que a 9815 calcula e mostra no lugar do `%AV` da linha
`RECEITAS LIQUIDAS` — onde normalmente estaria `100,000`, aparece `P.23,852%`:

```pascal
VlPartFornec := VlVendaLiq / VlVendaLiq_Total
//  Sum(VLVENDA - VLDEVOLUCAO) do fornecedor filtrado  ÷  o mesmo sem filtro, por mês
```

Sobre venda **já líquida de desconto** (`VLVENDA`; a bruta é `VLTABELA`).

| | O que acontece |
|---|---|
| **Faturamento** | filtra de verdade, por `pr.codfornec` — o fornecedor do **produto**, em `PCPRODUT`, item a item. Não é o fornecedor da nota nem o cliente. Atinge tudo do lucro bruto para cima |
| **Centro 90** (`VERBAS MARGEM`) | valor **exclusivo** do fornecedor, resolvido no SQL. Não é rateado |
| **Centro 25** (`EQUIPE P&G`) | entra **inteiro** se a P&G estiver selecionada; **some** se não |
| **Contas sem centro de custo** | **somem**, por `NULL NOT IN (90)` |
| **Todo o resto** | vem cheio do SQL e é **rateado** pela participação, dentro do Delphi |

## O rateio, lido no fonte

```pascal
if (length(edDREFornec.Text) > 0) then
begin
   if (sCodGruConta = '90') or (sCodGruConta = '25') then
      rValor := VLREALIZADO                                   // inteiro
   else
   begin
      rValor := (VLREALIZADO - VPAGO_EXCLUSIVO_FORNEC) * VlPartFornec;
      rValor := rValor + VPAGO_EXCLUSIVO_FORNEC;              // devolvido inteiro
   end;
end
else
   rValor := VLREALIZADO;
```

**Correção nº 1 — a regra é mais ampla do que "remover primeiro, ratear depois".** O que o
código faz é **tirar, ratear o resto e somar de volta**: a parte exclusiva nunca é rateada
**em conta nenhuma**, não só nos centros 90 e 25. O resultado numérico é o mesmo nos casos
medidos, e é isso que faz Grupo de Contas fechar igual a C.Custo Principal com o filtro
ligado — lá o valor exclusivo está diluído dentro de contas misturadas, e a subtração o
preserva.

A consequência para quem implementar continua sendo a mesma, e continua sendo a armadilha que
mais importa:

```
Sub-Total = (Sub-Total sem filtro − EQUIPE P&G) × participação
-2.873.577,62 = (-12.669.998,14 + 622.565,47) × 0,238522     ✓ ao centavo
ratear o Sub-Total inteiro daria -3.022.073,18               ✗ erra 148 mil
```

Uma implementação que rateie o total pronto erra **148 mil reais** na filial 7 sem que nada
pareça errado na tela.

O `VPAGO_EXCLUSIVO_FORNEC` é definido no `CASE` da linha 27146, com exatamente as mesmas duas
condições do `WHERE`, e sai `0` quando não há filtro — que é por que as nossas queries já
carregam os três `0 as VPAGO_EXCLUSIVO_FORNEC`. **O encanamento já está no lugar**; é ali que
a regra entra quando for implementada.

---

## A decisão, e o desenho que ela produziu

O SQL da 9815 carrega o código da P&G **escrito à mão**:

```pascal
SQL.Add('  AND ( (CCPrinc.codccprinc = 25  and 29 in ('+edDREFornec.Text+')) or
              (CCPrinc.codccprinc <> 25) ) ');
   //C.Custo 25-Distribuicao P&G (tem que filtrar o fornec. 29 para mostrar
```

O comentário é do autor. O `29` é literal fixo, e a condição lê *"a P&G está entre os
selecionados?"*. Das 15 ocorrências do filtro na execução, 13 usam o fornecedor escolhido e
**só estas 2** carregam o `29` — a mesma condição repetida no `SELECT` e no `WHERE`. Logo
acima do rateio há a versão anterior dessa regra, comentada: foi decisão consciente, não
descuido.

Uma varredura de todas as ocorrências de `codccprinc`, `codigocentrocusto` e `codccusto` nas
28.750 linhas confirma que **este é o único vínculo centro→fornecedor do fonte**. Os outros
literais de centro são `90` (que não tem vínculo fixo — casa com o `CODFORNEC` do próprio
lançamento), `22`/`28`/`18` em outras telas, e `99`/`9998`/`9999` como sentinelas de "sem
centro".

**Não há de onde ler esse vínculo** ([dc59](validacao/dc59_vinculo_centro_fornecedor.sql)):
`PCCENTROCUSTO` tem oito colunas e nenhuma aponta para fornecedor, nenhuma tabela de centro de
custo tem coluna de fornecedor, não existe tabela `EPC*` para isso, e a regra não está
repetida em view, procedure ou trigger. O controle de privilégio veio completo, então os
vazios são resposta.

### A escolha deixou de ser "hardcode ou tabela"

Se a tabela nascer com **uma linha só** — centro `25` → fornecedor `29` —, o SQL produz
exatamente o que a 9815 produz, ao centavo, inclusive o defeito dos dois cadastros. A
homologação não sente nada. Cada linha **a mais** é que vira divergência, e vira uma
divergência com data, responsável e motivo, cadastrada pelo negócio.

Isso dissolve o argumento que sustentava a recomendação anterior ("hardcode agora,
configuração depois"): o risco não era a tabela, era mudar o comportamento no meio da
conferência. Com a carga inicial fiel, o comportamento não muda.

### A tabela de vínculo

Uma tabela, pares diretos, com o código do centro guardado **como ele é cadastrado**:

```sql
CREATE TABLE EPCKPI_CENTRO_FORNEC (
  CODCENTRO   VARCHAR2(10) NOT NULL,   -- '25' (principal inteiro) ou '2806' (um centro só)
  CODFORNEC   NUMBER       NOT NULL,
  DTCADASTRO  DATE         DEFAULT SYSDATE NOT NULL,
  USUARIO     VARCHAR2(60),
  OBSERVACAO  VARCHAR2(400),           -- fiel à 9815, ou divergência aprovada por quem
  CONSTRAINT PK_EPCKPI_CENTRO_FORNEC PRIMARY KEY (CODCENTRO, CODFORNEC),
  CONSTRAINT CK_EPCKPI_CENTRO_NIVEL  CHECK (LENGTH(CODCENTRO) >= 2)
);
```

O prefixo `EPCKPI_` é **proposta, não decisão** — `EPCPARDRE` é da Época e legado, e o
CLAUDE.md pede prefixo próprio para as nossas. Cravar antes da primeira migration.

**Por que uma coluna de centro basta para os dois níveis.** O filtro da 9815 compara
`codccprinc`, que é `SUBSTR(codigocentrocusto, 1, 2)`. Os códigos reais são `2501` na raiz e
`2501.001` nas folhas, e nenhum centro fora do principal 25 começa com "25" — logo
`SUBSTR(cod,1,2) = '25'` e `cod LIKE '25%'` são equivalentes. A comparação por prefixo serve
aos dois níveis de uma vez:

```sql
AND ( NOT EXISTS (SELECT 1 FROM EPCKPI_CENTRO_FORNEC D
                   WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%')
      OR EXISTS (SELECT 1 FROM EPCKPI_CENTRO_FORNEC D
                  WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%'
                    AND D.CODFORNEC IN (<seleção>)) )
```

O primeiro ramo diz *"este centro não é dedicado a ninguém, passa"*; o segundo, *"é dedicado,
e a seleção contém alguém da marca dele"*. Tabela vazia é neutra. Substitui o par do centro 25
nos dois lugares; **o par do centro 90 não muda**.

**Por que a granularidade mista é necessária.** O `25` da 9815 não é uma escolha de nível —
ali o principal **é** a equipe P&G. O `2806` é o único que exige descer:

| Marca | Centro | O principal serve? |
|---|---|---|
| P&G | `2501` EQUIPE P&G | sim, `25` — o principal só tem este centro |
| Unilever | `2401` VENDAS UNILEVER | sim, `24` |
| Unilever | `2601` UNILEVER | sim, `26` |
| P&G | `2806` TRANSPORTE T - P&G | **não** — o principal 28 tem 20 centros de transporte |

**O que se perde com os pares diretos.** O produto cartesiano. A Unilever tem **quatro**
cadastros de fornecedor e dois centros: oito linhas, e um quinto cadastro amanhã exige lembrar
de inserir duas. A carga completa fica em torno de 14 linhas. Escolhemos a clareza de leitura
— quem abre a tabela entende a regra sem cruzar nada —, e um relatório de dez linhas de SQL
pega o "esqueci de replicar". Se o cadastro crescer, o modelo com uma entidade "marca" no meio
envelhece melhor, e o motivo está registrado aqui para quando alguém reabrir.

### A carga

Uma linha fiel, e as demais esperando o financeiro. O DDL, os `INSERT` e o levantamento que os
produziu estão em
[dc73](validacao/dc73_carga_do_vinculo_centro_fornecedor.sql):

```sql
INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
VALUES ('25', 29, USER,
        'Fiel a 9815 - UBase.pas:27217, literal escrito a mao. Centro 2501 EQUIPE P&G');
```

### O que o negócio precisa decidir

Os fornecedores com verba no centro 90 em 2026, que são os candidatos a vínculo:

```
    29   PROCTER & GAMBLE INDUSTRIAL E COMERCIAL LTDA    2.466.610,41   ← o do hardcode
   815   GILLETTE DO BRASIL LTDA                         2.265.040,81   ← subsidiária da P&G
  2453   PROCTER & GAMBLE INDUSTRIAL E COML LTDA         1.868.982,34   ← 2º cadastro da P&G
  1044   UNILEVER BRASIL LTDA HC                            10.136,68
    51   UNILEVER BRASIL LTDA FR                             4.517,31
    89   UNILEVER FOODS SOLUTIONS                            3.211,70
    11   UNILEVER BRASIL LTDA                                2.787,70
```

**A Gillette é P&G**, e tem mais verba que o segundo cadastro da própria P&G. Foi por ela que
a dc58 descobriu o hardcode: filtrando por `815` a `EQUIPE P&G` desaparece. Pela regra da 9815
isso está certo; pelo organograma do fornecedor, é discutível. É a linha de maior impacto, e a
única cuja resposta não está no cadastro nem no código.

**Os dois cadastros da P&G** (`29` e `2453`) existem hoje e juntos somam 10,2% da receita da
filial 7. Filtrar só pelo `2453` faz `29 in (2453)` ser falso, e a `EQUIPE P&G` desaparece do
DRE **da própria P&G**.

**A Unilever não é tratada em nada**: filtrar por ela não traz os centros dela.

**O `2806`** (`TRANSPORTE T - P&G`) é P&G e vai rateado junto com o resto do transporte.

A Colgate (`1`, R$ 838 mil) tem verba e **não** tem centro dedicado — é o controle que mostra
que verba no 90 não implica centro próprio.

---

## O que ainda falta medir

**Lançamento sem centro de custo.** Na 9815, `codccprinc` nulo faz as duas condições virarem
nulas e a linha é excluída. Com o `NOT EXISTS`, `NULL LIKE '25%'` é nulo, nenhuma linha casa e
o lançamento **passa**. O resultado final não deve mudar, porque o par do centro 90 continua
como está e já elimina esses lançamentos antes — mas isso precisa ser **medido, não deduzido**.
Em agosto/2026 os afetados eram `FECH-RESULTADO`, `FECH. VB APLICAR` e `DESPESAS SOCIOS`.

**A dc58 quebra na primeira linha de divergência.** As 21 asserções foram escritas contra o
comportamento atual: com `2453` ou `815` cadastrados, a `EQUIPE P&G` passa a aparecer onde hoje
ela some, e o script acusa. Isso é o teste funcionando — mas ele precisa aprender a diferença
entre "fiel" e "divergência aprovada" no mesmo movimento.

**Correção nº 2 — o centro 25 entrar inteiro deixou de ser hipótese.** Esta seção dizia que
*"o centro 25 com a P&G selecionada nunca foi visto funcionando"*, e pedia duas exportações
para decidir se ele entra inteiro ou rateado. O fonte responde: `if (sCodGruConta = '90') or
(sCodGruConta = '25') then rValor := VLREALIZADO`. **Inteiro.** As duas exportações (filial 7,
agosto/2026, pelo `29` e pelo `2453`) continuam valendo como conferência de ponta a ponta — a
dc58 já as compara, basta passar os arquivos —, mas não bloqueiam mais nada.

Também deixou de importar o `ALL_SOURCE` sem consulta de controle, que mantinha viva a leitura
"não enxergo o código": a regra está no Delphi, e nós a lemos.

## Onde está cada coisa

| | |
|---|---|
| `UBase.pas` | **o fonte da 9815** — fora do repositório, com o Gabriel |
| [dc56](validacao/dc56_centros_90_e_25.sql) | os centros 90 e 25 — a investigação na filial 27 |
| [dc57](validacao/dc57_fornecedores_para_teste_filial_7.sql) | como o terreno do teste foi escolhido |
| [dc58](validacao/dc58_filtro_por_fornecedor_na_filial_7.mjs) | **a mecânica, com 21 asserções ao centavo** |
| [dc59](validacao/dc59_vinculo_centro_fornecedor.sql) | o vínculo centro→fornecedor não existe no cadastro |
| [dc73](validacao/dc73_carga_do_vinculo_centro_fornecedor.sql) | **a tabela, a carga e o levantamento que a produziu** |
