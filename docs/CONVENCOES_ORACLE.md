# Convenções Oracle · ODP.NET · Dapper

Base: **Oracle 11g** da Época. Driver: `Oracle.ManagedDataAccess.Core` (ODP.NET).
Micro-ORM: **Dapper**.

As armadilhas da última seção são reais — cada uma já custou tempo neste projeto ou está
documentada no trace da 9815.

---

## 1. Binds são posicionais

**`BindByName = false` é o padrão do ODP.NET.** Ele ignora o nome do parâmetro e casa pela
**ordem** em que aparecem no SQL. `OracleConnectionFactory` deixa isso explícito, em vez de
depender do padrão:

```csharp
conexao.BindByName = false;
```

Consequência prática: a ordem das propriedades do objeto anônimo tem que bater com a ordem
dos `:placeholders` no SQL.

```csharp
// SQL:  ... WHERE codfilial = :codfilial AND dtpagto BETWEEN :dtIni AND :dtFim
// CERTO — mesma ordem
new { codfilial = 7, dtIni = inicio, dtFim = fim }

// ERRADO — compila, roda, e traz o resultado errado ou ORA-01858
new { dtIni = inicio, dtFim = fim, codfilial = 7 }
```

### Nome repetido precisa de alias único

Com bind posicional, usar `:dtIni` duas vezes exige **dois** parâmetros:

```sql
-- ERRADO
WHERE dtpagto BETWEEN :dtIni AND :dtFim
  AND dtvenc  BETWEEN :dtIni AND :dtFim

-- CERTO
WHERE dtpagto BETWEEN :dtIni1 AND :dtFim1
  AND dtvenc  BETWEEN :dtIni2 AND :dtFim2
```

```csharp
new { dtIni1 = inicio, dtFim1 = fim, dtIni2 = inicio, dtFim2 = fim }
```

> Alternativa: `conexao.BindByName = true` faz o ODP.NET casar por nome, como o SQL Server.
> **Não usamos.** A base inteira e as queries herdadas da 9815 pressupõem posicional; misturar
> os dois modos é fonte garantida de bug intermitente.

---

## 2. Lista de filiais no `IN`

Dapper expande coleção automaticamente, mas com bind posicional o resultado é frágil em
consultas grandes. Para o `IN` de filiais, prefira expansão explícita:

```csharp
var filiais = new[] { 7, 12, 25 };
var placeholders = string.Join(",", filiais.Select((_, i) => $":filial{i}"));
var sql = $"... WHERE FIN.CODFILIAL IN ({placeholders}) ...";

var parametros = new DynamicParameters();
for (var i = 0; i < filiais.Length; i++)
{
    parametros.Add($"filial{i}", filiais[i]);
}
```

Os valores entram na mesma ordem em que os placeholders aparecem no SQL — que é o que o bind
posicional exige.

---

## 3. Paginação: Oracle 11g não tem `OFFSET/FETCH`

`OFFSET n ROWS FETCH NEXT m ROWS ONLY` é 12c+. No 11g dá erro de sintaxe. Use `ROWNUM` em
subconsulta aninhada — e são **duas** camadas, não uma:

```sql
SELECT * FROM (
  SELECT interna.*, ROWNUM AS RN FROM (
    SELECT c.CODCLI, c.CLIENTE
      FROM PCCLIENT c
     WHERE c.CODCLI > 0
     ORDER BY c.CLIENTE
  ) interna
  WHERE ROWNUM <= :limiteSuperior
)
WHERE RN > :limiteInferior
```

`limiteSuperior = pagina * tamanho`, `limiteInferior = (pagina - 1) * tamanho`.

**Por que duas camadas:** `ROWNUM` é atribuído **antes** do `ORDER BY`. Filtrar `ROWNUM` no
mesmo nível do `ORDER BY` numera as linhas fora de ordem e devolve um conjunto arbitrário.

**Por que `ROWNUM <= x` e não `BETWEEN`:** `ROWNUM > n` nunca é verdadeiro no mesmo nível —
a primeira linha candidata seria `ROWNUM = 1`, que falha o predicado, então nenhuma linha é
numerada e o resultado vem vazio. Por isso o limite inferior vai na camada de fora, sobre o
alias `RN`.

---

## 4. Aliases em UPPERCASE

O Dapper casa coluna com propriedade ignorando maiúsculas, mas o Oracle devolve o nome em
caixa alta quando não há aspas. Escreva o alias já em maiúscula, sempre:

```sql
SELECT c.CODCLI      AS CODCLI,
       c.CLIENTE     AS NOME,
       SUM(p.VALOR)  AS VALORTOTAL
```

```csharp
public class ClienteResumo
{
    public int CodCli { get; init; }
    public string Nome { get; init; } = string.Empty;
    public decimal ValorTotal { get; init; }
}
```

**Nunca use aspas duplas no alias** (`AS "ValorTotal"`). Isso torna o nome case-sensitive e o
mapeamento quebra de um jeito difícil de enxergar: a propriedade fica com o valor padrão, sem
erro nenhum.

---

## 5. Entidades: class com `init`, DTOs: record

Dapper materializa por construtor sem parâmetros e setters. `record` com construtor posicional
funciona em alguns casos e falha em outros — não vale o risco.

```csharp
// Entidade mapeada por Dapper
public class LancamentoDre
{
    public string GrupoConta { get; init; } = string.Empty;
    public decimal ValorRealizado { get; init; }
    public DateTime? DtPagto { get; init; }
}

// DTO de resposta
public record LinhaDreDto(string Descricao, decimal Valor, decimal? PercentualAv);
```

`decimal` para dinheiro. Nunca `double` — erro de arredondamento em DRE é inaceitável.
Coluna anulável vira tipo anulável (`DateTime?`), senão o Dapper lança em silêncio na primeira
linha com `NULL`.

---

## 6. Datas

Oracle `DATE` carrega hora. `BETWEEN :ini AND :fim` com `fim = 31/08/2026 00:00` **perde o dia
31 inteiro**, exceto a meia-noite exata.

A 9815 usa `To_Date('31/08/2026','dd/mm/yyyy')` e convive com isso. Replicando a rotina,
mantenha o mesmo comportamento — senão os números não batem. Em consulta nova, use
`>= :ini AND < :fimMaisUm`.

Passe `DateTime` como parâmetro. **Nunca concatene data formatada no SQL.**

---

## 7. Stored procedures

Nenhuma na 9815 — ela monta SQL por concatenação no Delphi. Quando aparecer:

```csharp
var parametros = new DynamicParameters();
parametros.Add("pCodFilial", codFilial, DbType.Int32, ParameterDirection.Input);
parametros.Add("pResultado", dbType: DbType.String, direction: ParameterDirection.Output, size: 4000);

await conexao.ExecuteAsync(
    "PKG_ALGUMA_COISA.PROCEDIMENTO",
    parametros,
    commandType: CommandType.StoredProcedure);

var resultado = parametros.Get<string>("pResultado");
```

Parâmetro `OUT` de string **exige `size`**. Sem isso, `ORA-06502: character string buffer too small`.

Para cursor de saída, o tipo é `OracleDbType.RefCursor` — precisa de `OracleParameter`, não do
`DynamicParameters` genérico.

---

## 8. Conexão

Peça, use, descarte. O pool do ODP.NET cuida do resto.

```csharp
using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);
var linhas = await conexao.QueryAsync<LinhaDre>(sql, parametros);
```

Consulta pesada precisa de timeout explícito — a apuração da 9815 leva minutos:

```csharp
await conexao.QueryAsync<LinhaDre>(
    new CommandDefinition(sql, parametros, commandTimeout: 600, cancellationToken: ct));
```

O padrão do Dapper é 30 segundos. A consulta de faturamento da 9815 levou **115 segundos por
mês** no cenário de 2 meses; com 4 meses a projeção passa de 8 minutos.

---

## 9. Armadilhas que já custaram tempo

| Erro real | Causa | Correção |
|---|---|---|
| `ORA-00923: FROM keyword not found where expected` | Parêntese sobrando na expressão de agrupamento por Centro de Custo, concatenada no Delphi | Não é problema de dado. Ver `ROTINA_9815_LEVANTAMENTO.md` §6 |
| `ORA-01722: invalid number` | `TO_NUMBER('9701.001.02')` — código de centro de custo tem até **dois** separadores. Estava escondido atrás do `ORA-00923` acima | **Chave de agrupamento é `VARCHAR2`.** Nunca converta código hierárquico para número |
| Duas linhas do DRE somadas numa só, sem erro | `TO_NUMBER` colapsa `9701.10` e `9701.1` na mesma chave | Mesma correção: chave textual |
| Cor do DRE saindo laranja em vez de azul | `EPCPARDRE.COR` é `TColor` do Delphi: **BGR**, não RGB. `15780518` = `0xF0CAA6` → `#A6CAF0` | Inverter os bytes ao converter para CSS |
| `ORA-01427: single-row subquery returns more than one row` | A 9815 faz `(select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')`. Hoje é único; um rótulo duplicado quebra tudo | Ao replicar, tratar o caso ou documentar a premissa |
| Linha aparecendo depois do LUCRO LIQUIDO sem motivo | `EPCPARDRE` tem uma linha com `ID` **nulo**, e `ORDER BY ID` joga nulo para o fim | Comportamento a replicar. `ORDER BY ID NULLS LAST` explícito |
| Resultado diferente ao trocar `(+)` por `LEFT JOIN` | A sintaxe `(+)` do Oracle tem regras próprias quando combinada com `IN`, `OR` e subconsulta | Ao replicar a 9815, **mantenha `(+)`**. Só modernize com validação numérica lado a lado |
| Parâmetro certo, resultado errado | Ordem do objeto anônimo diferente da ordem dos `:placeholders` (bind posicional) | Seção 1 |
| `ORA-01858: a non-numeric character was found where a numeric was expected` | Idem — um parâmetro de data recebeu o valor de um número | Seção 1 |

---

## 10. Antes de dar uma query por pronta

- [ ] Ordem dos parâmetros bate com a ordem dos `:placeholders`?
- [ ] Nome repetido tem alias único?
- [ ] Aliases em UPPERCASE, sem aspas duplas?
- [ ] Colunas anuláveis mapeadas para tipos anuláveis?
- [ ] Dinheiro em `decimal`?
- [ ] Paginação com `ROWNUM` em duas camadas?
- [ ] `commandTimeout` compatível com o custo da consulta?
- [ ] Nenhum valor concatenado direto no SQL?
- [ ] Se replica a 9815: os números batem com a planilha exportada da rotina?

---

## 11. `NLS_DATE_FORMAT` — a dependência escondida

A 9815 escreve, em toda coluna de mês:

```sql
TO_CHAR(To_Date(nvl(FIN.DTCOMPETENCIA, FIN.DTVENC), 'dd/mm/yyyy'), 'mm/yyyy')
```

`DTCOMPETENCIA` **já é `DATE`**. Aplicar `TO_DATE` sobre `DATE` obriga o Oracle a converter
para texto antes, usando o **`NLS_DATE_FORMAT` da sessão**, e só então reinterpretar com a
máscara `dd/mm/yyyy`. Funciona enquanto a sessão estiver nesse formato — era o caso do
FireDAC. Em qualquer outra sessão, sobra caractere e estoura:

```
ORA-01830: date format picture ends before converting entire input string
```

**Não replique o round-trip.** É um no-op que só adiciona dependência de ambiente:

```sql
-- Frágil: depende do NLS_DATE_FORMAT da sessão
TO_CHAR(To_Date(<data>, 'dd/mm/yyyy'), 'mm/yyyy')

-- Correto: equivalente e independente de NLS
TO_CHAR(<data>, 'mm/yyyy')
```

São equivalentes: `mm/yyyy` ignora a hora, e o round-trip só a descartaria.

**Por que isso importa na API:** a sessão do ODP.NET não herda o `NLS_DATE_FORMAT` do
FireDAC. Replicar o SQL verbatim colocaria na aplicação um erro que depende de configuração
de ambiente — o tipo que passa em desenvolvimento e quebra em produção.

A mesma regra vale para o inverso: **nunca compare `DATE` com literal de texto** confiando na
conversão implícita. Sempre `DATE` com `DATE`, via parâmetro.
