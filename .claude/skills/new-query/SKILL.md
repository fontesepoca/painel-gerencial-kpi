---
description: Criar uma consulta Oracle com Dapper — arquivo de SQL, entidade, método no repositório e registro no módulo, respeitando os binds posicionais do ODP.NET.
---

# new-query — consulta Oracle com Dapper

Acrescenta uma consulta a uma rotina existente. Vale para tabela legada do Winthor (`PC*`) e
para tabela customizada da Época.
Referência: `api-new-kpi/Infrastructure/Persistence/Context/OracleConnectionFactory.cs`.

Referência de convenções: [docs/CONVENCOES_ORACLE.md](../../../docs/CONVENCOES_ORACLE.md).
Esta skill é o **procedimento**; aquele documento é a **referência**.

Placeholders: `{Rotina}` = `ExtratoCliente`, `{Consulta}` = `Linhas`.

## 1. SQL — `api-new-kpi/Infrastructure/Persistence/Queries/{Rotina}Queries.cs`

SQL fica em constante `const string`, fora do repositório. Consulta da 9815 tem centenas de
linhas; misturada com C# ninguém revisa.

```csharp
namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// Consultas da rotina {Rotina}. Somente leitura — tabela legada do Winthor
/// nunca é escrita.
/// </summary>
public static class {Rotina}Queries
{
    /// <summary>
    /// Ordem dos binds: :dtIni, :dtFim, depois a lista de filiais.
    /// O ODP.NET usa bind POSICIONAL — a ordem dos parâmetros tem que bater.
    /// </summary>
    public const string {Consulta} = """
        SELECT LANC.CODCONTA           AS CHAVE,
               CT.CONTA                AS DESCRICAO,
               SUM(NVL(LANC.VPAGO, 0)) AS VALOR
          FROM PCLANC LANC, PCCONTA CT
         WHERE LANC.CODCONTA = CT.CODCONTA
           AND CT.GRUPOCONTA >= 200
           AND LANC.DTPAGTO IS NOT NULL
           AND LANC.DTPAGTO BETWEEN :dtIni AND :dtFim
           AND LANC.CODFILIAL IN ({0})
         GROUP BY LANC.CODCONTA, CT.CONTA
         ORDER BY CT.CONTA
        """;
}
```

`{0}` é preenchido com os placeholders das filiais no passo 3 — não é interpolação de valor,
é interpolação de **nomes de bind**. Valor nunca entra concatenado no SQL.

**Aliases em UPPERCASE, sem aspas duplas.** Com aspas o nome vira case-sensitive e o Dapper
deixa a propriedade no valor padrão, sem erro nenhum — o bug mais silencioso da stack.

## 2. Entidade — `api-new-kpi/Domain/Entities/{Rotina}Linha.cs`

```csharp
namespace Epoca.Kpi.Api.Domain.Entities;

public class {Rotina}Linha
{
    public string Chave { get; init; } = string.Empty;
    public string Descricao { get; init; } = string.Empty;
    public decimal Valor { get; init; }
    public DateTime? DtPagto { get; init; }
}
```

`class` com `init`, nunca `record` posicional. `decimal` para dinheiro. Coluna anulável em
tipo anulável.

## 3. Método no repositório — `api-new-kpi/Infrastructure/Persistence/Repositories/{Rotina}Repository.cs`

A lista de filiais é o ponto delicado: com bind posicional, os valores precisam ser adicionados
na **mesma ordem** em que os placeholders aparecem no SQL.

```csharp
public async Task<IReadOnlyList<{Rotina}Linha>> Obter{Consulta}Async(
    IReadOnlyList<int> filiais,
    DateOnly dataInicio,
    DateOnly dataFim,
    CancellationToken cancellationToken = default)
{
    if (filiais.Count == 0)
    {
        return [];
    }

    // Placeholders de filial, na ordem: :filial0, :filial1, ...
    var placeholders = string.Join(", ", filiais.Select((_, i) => $":filial{i}"));
    var sql = string.Format({Rotina}Queries.{Consulta}, placeholders);

    // A ordem de Add TEM que espelhar a ordem no SQL: datas primeiro, filiais depois.
    var parametros = new DynamicParameters();
    parametros.Add("dtIni", dataInicio.ToDateTime(TimeOnly.MinValue));
    parametros.Add("dtFim", dataFim.ToDateTime(TimeOnly.MaxValue));
    for (var i = 0; i < filiais.Count; i++)
    {
        parametros.Add($"filial{i}", filiais[i]);
    }

    using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

    var linhas = await conexao.QueryAsync<{Rotina}Linha>(
        new CommandDefinition(
            sql,
            parametros,
            commandTimeout: 600,
            cancellationToken: cancellationToken));

    return linhas.ToList();
}
```

`TimeOnly.MaxValue` no fim do dia é deliberado: `DATE` do Oracle carrega hora, e
`BETWEEN` até `00:00` descartaria o último dia inteiro.

**`commandTimeout: 600`.** O padrão do Dapper é 30 segundos. A consulta de faturamento da 9815
levou **115 segundos por mês**; com 4 meses passa de 8 minutos.

## 4. Paginação, quando houver

O banco é 19c, então `OFFSET/FETCH` funciona. A forma abaixo, com `ROWNUM`, é a que o código
existente usa — as duas servem:

```sql
SELECT * FROM (
  SELECT interna.*, ROWNUM AS RN FROM (
    SELECT c.CODCLI AS CODCLI, c.CLIENTE AS NOME
      FROM PCCLIENT c
     WHERE c.CODCLI > 0
     ORDER BY c.CLIENTE
  ) interna
  WHERE ROWNUM <= :limiteSuperior
)
WHERE RN > :limiteInferior
```

São **duas** camadas, não uma. `ROWNUM` é atribuído antes do `ORDER BY`: filtrar no mesmo nível
numera fora de ordem e devolve conjunto arbitrário. E `ROWNUM > n` no mesmo nível nunca é
verdadeiro — a primeira linha candidata seria `ROWNUM = 1`, que falha o predicado, então
nenhuma linha é numerada e o resultado vem vazio. Por isso o limite inferior fica na camada de
fora, sobre `RN`.

## 5. Registro — `api-new-kpi/Application/Features/{Rotina}/{Rotina}Module.cs`

Se o repositório é novo, registre nele. Se já existe, não há nada a fazer.

```csharp
public void Instalar(IServiceCollection services, IConfiguration configuration)
{
    services.AddScoped<I{Rotina}Repository, {Rotina}Repository>();
}
```

Nunca no `Program.cs`.

## 6. Conferência do número

Replicando comportamento da 9815, o resultado tem que bater com a planilha exportada. Use a
skill `conferir-dre`. Query nova sem número conferido não está pronta.

## Regras / Armadilhas

| Problema | Causa | Solução |
|---|---|---|
| `ORA-01858: a non-numeric character was found where a numeric was expected` | Bind posicional: ordem do `DynamicParameters` diferente da ordem dos `:placeholders`. Um parâmetro de data recebeu um número | Adicionar na mesma ordem do SQL |
| Resultado errado, sem erro nenhum | Idem — dois parâmetros do mesmo tipo trocados de posição | Idem |
| Nome de bind repetido | `:dtIni` usado duas vezes no SQL, com um só parâmetro | Aliases únicos: `:dtIni1`, `:dtIni2`, e dois `Add` |
| Propriedade da entidade sempre no valor padrão | Alias entre aspas duplas (`AS "Valor"`), que vira case-sensitive | Alias UPPERCASE sem aspas |
| `ORA-00933`/`ORA-00907` na paginação | Tentou `OFFSET/FETCH`, que é 12c+ | `ROWNUM` em duas camadas |
| Paginação devolve vazio | `ROWNUM > n` no mesmo nível do `SELECT` | Limite inferior na camada externa, sobre `RN` |
| Paginação devolve linhas fora de ordem | `ROWNUM` filtrado no mesmo nível do `ORDER BY` | Ordenar na subconsulta mais interna |
| `ORA-01722: invalid number` | `TO_NUMBER` sobre código hierárquico — `CodigoCentroCusto` tem até dois separadores | Chave de agrupamento em `VARCHAR2`. Nunca converter |
| Duas linhas somadas numa só, sem erro | `TO_NUMBER` colapsa `9701.10` e `9701.1` na mesma chave | Idem |
| `Timeout expired` aos 30 s | `commandTimeout` no padrão do Dapper | `commandTimeout: 600` em consulta de apuração |
| Último dia do período sumindo | `DATE` do Oracle carrega hora; `BETWEEN` até `00:00` | `TimeOnly.MaxValue`, ou `>= :ini AND < :fimMaisUm` |
| `ORA-06502` em procedure | Parâmetro `OUT` de string sem `size` | `parametros.Add("p", dbType: DbType.String, direction: Output, size: 4000)` |
| Resultado diferente ao "modernizar" `(+)` para `LEFT JOIN` | A sintaxe `(+)` tem regras próprias com `IN`, `OR` e subconsulta | Replicando a 9815, **mantenha `(+)`** |

## Checklist final

- [ ] SQL em `const string` no arquivo `{Rotina}Queries.cs`, não embutido no repositório
- [ ] Ordem dos parâmetros bate com a ordem dos `:placeholders`
- [ ] Nenhum nome de bind repetido
- [ ] Aliases UPPERCASE, sem aspas duplas
- [ ] Nenhum valor concatenado no SQL — só nomes de bind
- [ ] Dinheiro em `decimal`; colunas anuláveis em tipos anuláveis
- [ ] `commandTimeout` compatível com o custo da consulta
- [ ] Paginação com `ROWNUM` em duas camadas, se houver
- [ ] Nenhum `INSERT`, `UPDATE`, `DELETE` ou DDL em tabela legada
- [ ] Número conferido com a planilha da 9815 (skill `conferir-dre`)
