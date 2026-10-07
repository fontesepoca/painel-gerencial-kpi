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

## Como confirmar

1. **Apurar a 9815 no Winthor do Minas Rural** e exportar, nos mesmos seis cenários da
   primeira versão (um mês sem `AH`; dois meses com `AH`; as três análises × caixa e
   competência). Guardar em `referencia-oficial-minas-rural/`, com o `queries/` do trace.
2. **Apurar a mesma coisa pela API apontada para o Minas Rural**, com o código **como está**
   — sem o `1401` e sem a conta `3003007`.
3. **A diferença é a medida.** Se a hipótese acima estiver certa, ela se explica toda pelos
   dois mecanismos — e o que sobrar é um terceiro achado. Só então o código é alterado, e cada
   mudança entra no `DIVERGENCIAS.md` com a medida que a justificou.
