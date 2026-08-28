---
description: Criar o esqueleto completo de uma rotina nova do Winthor — módulo, DTOs, serviço, repositório e controller no back; tipos, hook e página no front.
---

# new-rotina — scaffold de uma rotina do Winthor

Cria a estrutura ponta a ponta de uma rotina migrada do Winthor, seguindo o monólito modular.
Referência: `api-new-kpi/Application/Features/DreGerencial/DreGerencialModule.cs` e
`client-new-kpi/app/dre-gerencial/page.tsx`.

Leia [docs/ARQUITETURA.md](../../../docs/ARQUITETURA.md) antes, e
[docs/CONVENCOES_ORACLE.md](../../../docs/CONVENCOES_ORACLE.md) antes da primeira query.

**Placeholders desta skill**, usados de forma consistente:

| Placeholder | Exemplo | Onde aparece |
|---|---|---|
| `{Rotina}` | `ExtratoCliente` | classes, namespaces, tipos |
| `{rotina}` | `extrato-cliente` | rota HTTP, pasta do App Router, arquivo `.ts` |
| `{NNNN}` | `1203` | número da rotina no Winthor, só em comentário e documentação |

O módulo leva o **nome do domínio**, nunca o número: `ExtratoCliente`, não `Rotina1203`.

## 1. Módulo — `api-new-kpi/Application/Features/{Rotina}/{Rotina}Module.cs`

Este é o único arquivo que o host precisa encontrar. Ele é descoberto por reflexão no boot,
por isso **nenhum arquivo existente é editado** para acrescentar uma rotina.

```csharp
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

namespace Epoca.Kpi.Api.Application.Features.{Rotina};

/// <summary>Módulo da rotina {Rotina} (rotina {NNNN} do Winthor).</summary>
public sealed class {Rotina}Module : IModuleInstaller
{
    public string Nome => "{Rotina}";

    public void Instalar(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<I{Rotina}Repository, {Rotina}Repository>();
        services.AddScoped<{Rotina}Service>();
    }
}
```

## 2. DTOs — `api-new-kpi/Application/Features/{Rotina}/Dtos/{Rotina}Dtos.cs`

`record` para DTO. Nomes em português, porque o vocabulário do negócio é português e traduzir
`codfilial` para `branchCode` só cria uma camada de tradução mental na hora de conferir número
com a planilha.

```csharp
namespace Epoca.Kpi.Api.Application.Features.{Rotina}.Dtos;

public record {Rotina}FiltroDto(
    IReadOnlyList<int> Filiais,
    DateOnly DataInicio,
    DateOnly DataFim);

public record {Rotina}LinhaDto(
    string Chave,
    string Descricao,
    decimal Valor);
```

## 3. Entidade — `api-new-kpi/Domain/Entities/{Rotina}Linha.cs`

**`class` com `init`, não `record`.** O Dapper materializa por construtor sem parâmetros mais
setters; `record` com construtor posicional funciona em alguns casos e falha em outros, de um
jeito difícil de diagnosticar.

```csharp
namespace Epoca.Kpi.Api.Domain.Entities;

public class {Rotina}Linha
{
    public string Chave { get; init; } = string.Empty;
    public string Descricao { get; init; } = string.Empty;
    public decimal Valor { get; init; }
    public DateTime? DtReferencia { get; init; }
}
```

`decimal` para dinheiro, nunca `double`. Coluna anulável vira tipo anulável, senão o Dapper
lança na primeira linha com `NULL`.

## 4. Interface do repositório — `api-new-kpi/Domain/Interfaces/I{Rotina}Repository.cs`

```csharp
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Domain.Interfaces;

public interface I{Rotina}Repository
{
    Task<IReadOnlyList<{Rotina}Linha>> ObterLinhasAsync(
        IReadOnlyList<int> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default);
}
```

## 5. Repositório — `api-new-kpi/Infrastructure/Persistence/Repositories/{Rotina}Repository.cs`

Só a casca aqui; o corpo do método, o SQL e os binds são a skill **`new-query`**.

```csharp
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Context;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

public sealed class {Rotina}Repository : I{Rotina}Repository
{
    private readonly IOracleConnectionFactory _conexoes;

    public {Rotina}Repository(IOracleConnectionFactory conexoes) => _conexoes = conexoes;

    // Implementação em new-query: SQL em {Rotina}Queries, binds posicionais,
    // commandTimeout compatível com o custo da consulta.
}
```

## 6. Serviço — `api-new-kpi/Application/Features/{Rotina}/{Rotina}Service.cs`

Devolve `Result<T>`. Validação de entrada é fluxo previsível, não exception.

```csharp
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.{Rotina}.Dtos;
using Epoca.Kpi.Api.Domain.Interfaces;

namespace Epoca.Kpi.Api.Application.Features.{Rotina};

public sealed class {Rotina}Service
{
    private readonly I{Rotina}Repository _repositorio;

    public {Rotina}Service(I{Rotina}Repository repositorio) => _repositorio = repositorio;

    public async Task<Result<IReadOnlyList<{Rotina}LinhaDto>>> ConsultarAsync(
        {Rotina}FiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        if (filtro.Filiais.Count == 0)
        {
            return Result<IReadOnlyList<{Rotina}LinhaDto>>.Invalido(
                "Selecione ao menos uma filial.");
        }
        // Demais validações no mesmo formato: DataFim >= DataInicio, período máximo etc.

        var linhas = await _repositorio.ObterLinhasAsync(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, cancellationToken);

        var dtos = linhas
            .Select(l => new {Rotina}LinhaDto(l.Chave, l.Descricao, l.Valor))
            .ToList();

        return Result<IReadOnlyList<{Rotina}LinhaDto>>.Ok(dtos);
    }
}
```

## 7. Controller — `api-new-kpi/Controllers/{Rotina}Controller.cs`

Traduz `Result<T>` em `ApiResponse<T>` e status HTTP. É a única camada que conhece HTTP.

```csharp
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.{Rotina};
using Epoca.Kpi.Api.Application.Features.{Rotina}.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace Epoca.Kpi.Api.Controllers;

[ApiController]
[Route("api/{rotina}")]
public sealed class {Rotina}Controller : ControllerBase
{
    private readonly {Rotina}Service _servico;

    public {Rotina}Controller({Rotina}Service servico) => _servico = servico;

    [HttpPost("consulta")]
    public async Task<IActionResult> Consultar(
        [FromBody] {Rotina}FiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.ConsultarAsync(filtro, cancellationToken);

        if (resultado.Falha)
        {
            var resposta = ApiResponse<object>.Falha(resultado.Erro!);
            return resultado.TipoErro switch
            {
                ResultErrorType.NaoEncontrado => NotFound(resposta),
                ResultErrorType.Proibido => StatusCode(StatusCodes.Status403Forbidden, resposta),
                ResultErrorType.Conflito => Conflict(resposta),
                _ => BadRequest(resposta)
            };
        }

        return Ok(ApiResponse<IReadOnlyList<{Rotina}LinhaDto>>.Ok(resultado.Valor!));
    }
}
```

Use `POST` quando o filtro tiver lista multivalorada — querystring com 18 filiais fica ilegível
e esbarra em limite de tamanho em proxy.

## 8. Front — delegado à skill `new-page`

Tipos em `types/{rotina}.ts`, hook em `hooks/use{Rotina}.ts` e página em
`app/{rotina}/page.tsx`. O procedimento completo, com os quatro estados de tela e as
armadilhas de camelCase e de `useMutation` vs `useQuery`, está na skill **`new-page`** — não
repita aqui.

O único ponto que pertence a esta skill: os tipos do front **espelham os DTOs do passo 2**,
em camelCase.

```typescript
// client-new-kpi/types/{rotina}.ts
export interface {Rotina}Linha {
  chave: string;
  descricao: string;
  valor: number;
}
```

## 9. Verificação — nenhum wiring manual

```bash
cd api-new-kpi && dotnet build && curl http://localhost:5207/api/health
```

O `health` tem que listar `{Rotina}` junto de `DreGerencial`.

## Regras / Armadilhas

| Problema | Causa | Solução |
|---|---|---|
| Módulo não aparece em `/api/health` | Classe não implementa `IModuleInstaller`, é `abstract`, ou está fora da assembly da API | Classe `public sealed`, implementando a interface, dentro de `api-new-kpi` |
| Você editou `Program.cs` para registrar a rotina | Registro no lugar errado | Todo `AddScoped` da rotina vai no `Instalar` do módulo |
| `Unable to resolve service for type` no primeiro request | Serviço usado no controller mas não registrado no módulo | Registre no `Instalar`, não no `Program.cs` |
| Dapper devolve tudo com valor padrão | Entidade é `record` com construtor posicional, ou alias do SQL entre aspas duplas | `class` com `init`; alias UPPERCASE sem aspas |
| `NullReferenceException` na materialização | Coluna anulável mapeada para tipo não anulável | `DateTime?`, `decimal?` |
| Front chama e recebe `null` sem erro | `apiClient` devolve `dados`, e o back respondeu `sucesso: true` com `dados` nulo | Serviço tem que devolver lista vazia, nunca `null` |
| Rota 404 com o controller existindo | `[Route]` em PascalCase | Rota em kebab-case: `api/extrato-cliente` |

## Checklist final

- [ ] Pasta em `Application/Features/{Rotina}/` com nome de domínio, sem o número da rotina
- [ ] `{Rotina}Module` implementa `IModuleInstaller` e registra tudo que a rotina usa
- [ ] `Program.cs` **não** foi tocado
- [ ] Entidade é `class` com `init`; DTO é `record`
- [ ] Dinheiro em `decimal`; colunas anuláveis em tipos anuláveis
- [ ] Serviço devolve `Result<T>`; controller devolve `ApiResponse<T>`
- [ ] Rota em kebab-case
- [ ] `dotnet build` sem avisos e `npx tsc --noEmit` limpo
- [ ] `GET /api/health` lista o módulo novo
- [ ] `docs/` atualizado com a rotina nova
