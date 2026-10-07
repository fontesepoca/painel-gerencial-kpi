# A 9815 na base do Minas Rural — o que o Delphi faz diferente

**Origem:** leitura do fonte Delphi (`UBase.pas`, `ULanc.pas`, `UDevolucaoPorMotivo.pas`,
`UBase.pas` — login) em 07/10/2026, **antes** de a API rodar contra essa base. O objetivo é
saber o que esperar da primeira apuração em vez de descobrir pelo número errado.

> Tudo aqui é **leitura de código, não medição.** Cada achado vira hipótese a confirmar com
> a primeira apuração real — ver [o plano](#como-confirmar).

---

## Como o Delphi escolhe a base

O login tem uma lista com duas opções, `EPOCA` e `MRURAL` (`UBase.pas:26174-26175`). A escolha
vira o **alias** de conexão (`DM.FD_Conexao.Params.Database := BANCO`); o usuário e a senha
do banco são os mesmos nas duas (`ESQUEMA`, `SENHA`). Depois da conexão, uma flag é calculada
uma vez e guia o resto da sessão (`UBase.pas:26218-26219`):

```pascal
bBaseEPOCA  := (BANCO = 'EPC')  or (BANCO = 'EPOCA');
bBaseMRURAL := (BANCO = 'MINR') or (BANCO = 'MRURAL');
```

**O comportamento não é configuração: é código com `if bBaseMRURAL`.** Isso importa para o
desenho da bifurcação — a base escolhida muda **regra de negócio**, não só host e porta. As
duas formas de ler o nome (`MINR` e `MRURAL`) existem porque o alias já mudou de nome uma vez.

## O que muda no DRE — só duas coisas

Das dezenas de ocorrências de `bBaseMRURAL` no fonte, **a maioria é Pré-Compra e Faturamento
Gerencial**, rotinas que não migramos. O bloco que parece do DRE em `btnApuraDREClick`
(`UBase.pas:5496`) está **entre chaves**, comentado. No que é do DRE sobram dois mecanismos:

### 1. A seção excluída do CMV: `1601` na Época, `1401` no Minas Rural

Mercadoria dessa seção é tratada como custo zero — `GetVlfat` (`UBase.pas:27419` e `27489`),
e as duas consultas da devolução por motivo (`UDevolucaoPorMotivo.pas:196` e `237`):

```pascal
if bBaseMRURAL then  SQL.Add(' AND nvl(PR.codsec,0) <> 1401 ')
else                 SQL.Add(' AND nvl(PR.codsec,0) <> 1601 ');
```

**Nosso código tem `1601` fixo em 8 lugares:** `DreGerencialQueries.cs:1099` e `:1124`, e
`DreDetalheQueries.cs` nas linhas 105, 130, 183, 266, 553 e 583. Numa base do Minas Rural a
seção 1601 não exclui nada e a 1401 não é excluída — o **CMV sai maior** e a **margem menor**
do que na 9815.

### 2. As contas de ICMS viram uma conta só

Em `GetValorGrupo` (`UBase.pas:27161` e `27169`) e em `ULanc.pas:282-292`, nas duas fontes de
despesa — o lançamento (`PCLANC`) **e** o rateio (`PCRATEIOCENTROCUSTO`):

```pascal
case when upper(conta) like '%ICMS%' and grupoconta = 303
     then 3003007 else codconta end
```

Toda conta cujo nome contém `ICMS` e cujo grupo é 303 passa a ser a conta **`3003007`** antes
de casar com a parametrização do DRE. Sem isto, o ICMS do Minas Rural cai em linhas separadas
ou no bloco de contas órfãs, em vez de somar na linha que o financeiro de lá espera ver.

**Nosso código não tem isso.** Aparece em dois lugares: a apuração (despesa) e o
detalhamento (`ULanc` é o equivalente do nosso duplo clique). Os dois têm de concordar — foi
exatamente a lição da divergência 4: o detalhamento fecha com a linha, ou o número mente.

## O que NÃO muda, e vale registrar

- **`ckDRE_Deduzir_ST` e `ckDRE_Deduzir_PISCOFINS`** seriam por base (`bBaseEPOCA`), mas estão
  comentados e valem `false` nas duas. A regra de negócio nº 1 — ST, PIS e COFINS são
  informativos — vale igual no Minas Rural.
- **A regra do filtro por fornecedor** (`codccprinc IN (90)`, `codccprinc = 25 e 29`) não tem
  desvio por base. É regra da Época que o Delphi aplica nas duas — e que no nosso código
  virou a tabela `TAB_WEB_CENTROC_FORNEC`, **que no Minas Rural precisa ser criada e carregada
  do zero**, porque o vínculo de centro de custo × fornecedor de lá é outro.
- **O `DBL`** (sufixo de database link por filial) existe no Delphi para filiais em outra
  base. Nosso filtro de filiais já exclui as que têm `DBLEPCTI`.

## O que o fonte NÃO responde

**O filtro de filiais é da Época, e não sei como é o do Minas Rural.** Nossa consulta
(`DreGerencialQueries.cs:82`) exclui os códigos `20`, `31`, `35` e `91` e exige
`DBLEPCTI IS NULL`. Esses números vieram da lista de filiais da Época; o Minas Rural tem
outras. O Delphi não distingue por base — ele só lê a tabela `FILIAIS`. **Aplicar o filtro
da Época ao Minas Rural pode esconder uma filial real ou mostrar uma morta.** Só uma consulta
na base responde.

## Como confirmar — o roteiro

O Minas Rural **sobe com os valores da Época** (`SecaoSemCusto` 1601, `AgrupaIcms` falso). A
medição é a diferença entre a nossa apuração e a 9815 de lá, e **cada regra só é ligada
depois de a diferença que ela explica ter sido medida**.

**O cenário de referência** (as exportações em `referencia-oficial-miras-rural/`, do trace do
Delphi em 07/10/2026): análise **C. Custo Principal**, filiais **10 e 37**, sem filtro de
fornecedor, regime **caixa** (o trace mostra `nvl(FIN.DTPAGTO, …)` no mês da coluna —
confirme na tela), nos dois períodos exportados:

| Exportação | Período | Colunas |
|---|---|---|
| `Export_mes_anterior_MR.xlsx` | 01/09/2026 a 30/09/2026 | Setembro, com `% AV` |
| `Export_ult3meses_mr.xlsx` | 01/07/2026 a 30/09/2026 | Julho, Agosto, Setembro, com `% AV` e `% AH`, total e média |

1. **Entrar no Minas Rural** pela nossa tela (credencial do Minas Rural, do próprio Gabriel) e
   apurar os dois cenários, **sem ligar regra nenhuma**.
2. **Comparar com os `.xlsx`**, por script (a skill `conferir-dre`), com tolerância de meio
   centavo. **Registrar o que divergiu, linha a linha, sem corrigir.**
3. **Atribuir cada diferença a um mecanismo.** Se a leitura do fonte estiver certa, a diferença
   se explica pelos dois mecanismos acima (a seção `1401` no CMV; o ICMS na despesa). O que
   sobrar é um **terceiro achado** — e **não se liga nada** antes de entendê-lo.
4. **Ligar uma regra por vez**, em `appsettings.json` → `Bases:MinasRural:Regras`:
   `SecaoSemCusto` para `1401`; depois, em outro commit, `AgrupaIcms` para `true`. Cada uma:
   reiniciar a API, repetir os dois cenários, e **só então** commitar, com a entrada
   correspondente no `DIVERGENCIAS.md` (a medida antes e depois, e o script que a mede).
5. **Conferir que a Época não mexeu:** o `dc64` (45/45) e o `dc86` depois de cada commit.

**Duas coisas a olhar com atenção ao ligar o ICMS:**

- O Delphi remapeia para a conta `3003007`, e a consulta de despesa faz `FIN.CODCONTA =
  CT.CODCONTA` com o `PCCONTA`: **se a `3003007` não existir no `PCCONTA` do Minas Rural, as
  linhas de ICMS somem da despesa** em vez de se agruparem. Confira com uma consulta antes de
  ligar.
- A apuração e o duplo clique têm de concordar (divergência 4): depois de ligar, o `dc78` —
  o detalhamento fecha com a célula — roda nas duas bases.

**O que a lista de filiais do Minas Rural ainda não diz:** começa com **todas**, inclusive a
`2` e as `**FECHOU**`. Compare com a lista que o Delphi mostra na tela dele e esconda, em
`FiliaisForaDoFiltro`, só o que a 9815 esconde.

## Medições

### 1 — filial 10, setembro/2026, competência, C. Custo Principal (07/10/2026)

Exportação `referencia-oficial-miras-rural/Export_filial10_set2026_competencia_ccusto.xlsx`,
sem contas zeradas, contra a API do Minas Rural **com as regras da Época** (seção 1601, ICMS
desligado). Medido com o `dc89`:

**Todos os valores batem ao centavo**, de `RECEITA BRUTA` a `LUCRO LIQUIDO`. As 16 linhas que o
`dc89` acusou na primeira passada são apresentação já aprovada: a nº 12 (a 9815 soma
`MATERIAL DE CONSUMO - F13…F38` em `ADMINISTRATIVO`, as `TRANSPORTES - CD …` e `TRANSPORTE
MINAS RURAL` em `TRANSPORTES`, e `MG - GRANDE BH` em `VENDAS` — cada diferença é exatamente a
soma das linhas avulsas), a nº 11 (`Total das Despesas`) e a nº 9 (`SUBTOTAL POSITIVO`).

**O que esta medição NÃO prova:**

- **A seção sem custo.** A seção sai da venda inteira (`nvl(PR.codsec,0) <> …` filtra o item,
  não só o custo), e a `RECEITA BRUTA` bateu: neste recorte nem a 1401 nem a 1601 parecem ter
  movimento. Bater com 1601 aqui não distingue as duas (ver a medição 2).
- **O ICMS.** Setembro da filial 10 não tem lançamento de conta de ICMS do grupo 303 — a regra
  não tinha o que remapear. (Ela muda linhas **também** no C. Custo Principal: conta sem linha
  no DRE sai avulsa, por conta, e o remapeamento a leva para a 3003007, que tem linha.)

### 2 — filial 41, julho/2026, competência, Grupo de Contas (07/10/2026)

O único recorte de julho a setembro com venda da seção 1401 (um item, R$ 666,16). **A 9815 trava
nesta análise** — `'' is not a valid floating point value`, em 20%, depois de rodar as consultas
— e a exportação sai só até a primeira linha de despesa
(`Export_filial41_jul2026_competencia_grupo_INCOMPLETA.xlsx`; trace ao lado). Defeito da 9815,
não reproduzido.

**Da RECEITA BRUTA ao LUCRO BRUTO, e a primeira `Despesas Adm e Vendas`, bate ao centavo — com a
regra da seção ainda em 1601.** O item da 1401 não pesou (não passa nos demais filtros da venda).
Nenhum recorte dos três meses distingue 1401 de 1601: a regra foi ligada pela prova do trace —
[DIVERGENCIAS.md nº 17](./DIVERGENCIAS.md#17-minas-rural-a-seção-sem-custo-é-a-1401--07102026).

### O ICMS: onde a regra pesa

Consultado em 07/10/2026: a **3003007 "Icms"** existe no Minas Rural, é do grupo 303 e tem linha
no DRE — o ICMS remapeado não some. As contas `Icms Mrural F__` (uma por filial, só em
agosto/2026: 37.704,69 na filial 10, 39.879,26 na 13…) **não** têm linha no DRE: hoje saem
avulsas, fora dos totais; com a regra, entram na despesa e movem o `LUCRO LIQUIDO`. Próxima
medição: **filial 10, agosto/2026, competência, C. Custo Principal** — com a regra desligada e
depois ligada.

### 3 — filial 10, agosto/2026, competência, C. Custo Principal (07/10/2026)

Com a seção 1401 ligada e o ICMS **desligado**: tudo bate, menos DESPESAS TRIBUTÁRIAS, Sub-Total,
RESULTADO OPERACIONAL e LUCRO LIQUIDO, os quatro com **38.054,11** — a soma exata das duas
contas de ICMS que só a web mostrava avulsas (`Icms Mrural F10` 37.704,69 e `Icms Diferencial
De Aliquota F10` 349,42). Regra ligada: [DIVERGENCIAS.md nº 18](./DIVERGENCIAS.md#18-minas-rural-as-contas-de-icms-viram-a-3003007--07102026).
