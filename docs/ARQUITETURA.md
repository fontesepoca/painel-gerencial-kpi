# Arquitetura — monólito modular

## O problema

O projeto vai hospedar **N rotinas** do Winthor ao longo do tempo, não um único domínio.
A restrição que guiou a decisão: acrescentar a rotina seguinte **não pode exigir refatorar
o que já existe**.

## As opções avaliadas

| | Prós | Contras |
|---|---|---|
| **A · Monólito modular** | um deploy, uma configuração, um pool de conexão; código compartilhado sem cerimônia | uma rotina pesada afeta as outras; sem versionamento independente |
| **B · Projeto por rotina** | isolamento real de falha e deploy | multiplica pipeline, configuração e pool; fragmenta o front em N aplicações |
| **C · Núcleo + bibliotecas plugáveis** | versionamento independente por rotina | uma assembly por rotina, referências entre projetos, build mais lento |

## A decisão: A, com registro por convenção

Aprovada pelo Gabriel em 28/08/2026.

O ponto fraco clássico de A é o `Program.cs` virar um varal de registros de DI que cresce a
cada rotina. Isso é resolvido com **descoberta por reflexão**: cada módulo declara o que
precisa, dentro da própria pasta, e o host acha sozinho no boot.

Resultado: rotina nova = pasta nova. Nenhum arquivo existente é tocado.

B foi descartada porque, com deploy único e um time pequeno, o isolamento não paga o custo.
C foi descartada porque o benefício só aparece quando alguma rotina precisa de ciclo de vida
próprio, o que hoje não acontece — e **promover um módulo de A para C depois é mecânico**,
já que as fronteiras estarão desenhadas. Começar em C seria pagar adiantado por um problema
que pode não chegar.

### Como funciona

`Application/Common/IModuleInstaller.cs` declara o contrato:

```csharp
public interface IModuleInstaller
{
    string Nome { get; }
    void Instalar(IServiceCollection services, IConfiguration configuration);
}
```

`Configurations/ModuleInstallerExtensions.cs` varre a assembly e instala todas as
implementações. `Program.cs` chama isso uma vez e nunca mais muda:

```csharp
builder.Services.AddModulosDeRotina(builder.Configuration);
```

Os módulos registrados aparecem em `GET /api/health`, o que dá uma verificação barata de que
o módulo novo subiu.

### Nomenclatura

Módulo leva o **nome do domínio**, não o número da rotina: `DreGerencial`, não `Rotina9815`.
Decisão do Gabriel. O número aparece na documentação e nos comentários, para rastreabilidade
com o Winthor.

---

## Passo a passo: adicionar uma rotina

Exemplo: rotina 1203 do Winthor, *Extrato de Cliente*. Domínio → `ExtratoCliente`.

### Back-end

**1. `Application/Features/ExtratoCliente/ExtratoClienteModule.cs`**

```csharp
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

namespace Epoca.Kpi.Api.Application.Features.ExtratoCliente;

/// <summary>Módulo do Extrato de Cliente (rotina 1203 do Winthor).</summary>
public sealed class ExtratoClienteModule : IModuleInstaller
{
    public string Nome => "ExtratoCliente";

    public void Instalar(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IExtratoClienteRepository, ExtratoClienteRepository>();
        services.AddScoped<ExtratoClienteService>();
    }
}
```

**2. DTOs** — `Application/Features/ExtratoCliente/Dtos/` — records, um arquivo por grupo.

**3. Serviço de aplicação** — mesma pasta. Devolve `Result<T>`, nunca lança exception para
fluxo previsível.

**4. Interface do repositório** — `Domain/Interfaces/IExtratoClienteRepository.cs`.

**5. Entidades** — `Domain/Entities/` — class com `init`, para o Dapper materializar.

**6. Implementação** — `Infrastructure/Persistence/Repositories/ExtratoClienteRepository.cs`.
SQL grande vai em `Infrastructure/Persistence/Queries/`. Leia
[CONVENCOES_ORACLE.md](CONVENCOES_ORACLE.md) **antes** de escrever a primeira query.

**7. Controller** — `Controllers/ExtratoClienteController.cs`, rota
`[Route("api/extrato-cliente")]`. Traduz `Result<T>` em `ApiResponse<T>` e status HTTP.

**Não edite `Program.cs`.** Se você precisou editar, o módulo está registrando errado.

### Front-end

**8. Tipos** — `types/extrato-cliente.ts`, espelhando os DTOs.

**9. Hook** — `hooks/useExtratoCliente.ts`, com React Query sobre o `apiClient`.

**10. Página** — `app/extrato-cliente/page.tsx`, dentro do `AppShell`.

**11. Componentes próprios da rotina** — `components/extrato-cliente/`. O que for reutilizável
sobe para `components/ui/`.

### Verificação

```bash
cd api-new-kpi && dotnet build
cd client-new-kpi && npx tsc --noEmit
curl http://localhost:5207/api/health
```

O `health` tem que listar `ExtratoCliente` junto de `DreGerencial`. Se não listar, a classe
não implementa `IModuleInstaller` ou está fora da assembly.

---

## Quando promover um módulo para projeto separado

Sinais de que A deixou de servir para uma rotina específica:

- ela precisa de janela de deploy própria;
- o consumo de CPU ou de conexões derruba as demais;
- passa a ter dependência que conflita com o resto da solução.

Nesse caso, mover a pasta `Features/X/` para uma class library, referenciá-la no host e manter
o mesmo `IModuleInstaller` — o contrato não muda. É por isso que ele existe desde o começo.
