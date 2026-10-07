# Projeto Novo KPI — rotinas do Winthor na web

Monólito com duas aplicações: uma API .NET e um front Next.js. Migra rotinas do ERP
**Winthor** para web, aproveitando a transição para mudar funcionalidade — **não é port
literal** da tela antiga.

- **Empresa:** Época Distribuição.
- **Banco:** Oracle **19c Enterprise Edition High Performance** (19.32) **da Época**. O Winthor
  é o ERP cujas tabelas (`PC*`) vivem nessa base.
- **Referência arquitetural:** `api-minas-rural` (.NET 10) e `client-minas-rural` (Next.js 16).

**As regras imperativas estão em [AGENTS.md](AGENTS.md)** — leia antes de escrever código.
**A documentação começa em [docs/README.md](docs/README.md).**

## Rotinas

| Rotina | Situação | Onde |
|---|---|---|
| **9815 — GERENCIAL / DRE** | implementada; homologação em aberto | [docs/rotinas/9815-dre-gerencial/](docs/rotinas/9815-dre-gerencial/README.md) |

A 9815 foi a piloto e virou o molde: uma rotina nova copia a estrutura dela, não o conteúdo.
Para abrir a próxima, a skill é `new-rotina`, e o passo a passo está em
[docs/plataforma/ARQUITETURA.md](docs/plataforma/ARQUITETURA.md).

## Stack

**Back-end** (`api-new-kpi/`)

| Item | Tecnologia |
|---|---|
| Framework | .NET 10 — ASP.NET Core Web API |
| Queries e stored procedures | Dapper 2.1 |
| CRUD em tabelas novas | EF Core 10 (`Oracle.EntityFrameworkCore`) — **ainda não instalado** |
| Driver | `Oracle.ManagedDataAccess.Core` 23.26 (ODP.NET) |
| Banco | Oracle 19c EE High Performance (19.32) |
| Auth | JWT — ver [AUTENTICACAO.md](docs/plataforma/AUTENTICACAO.md) |
| Docs da API | OpenAPI nativo + Scalar (`/scalar/v1`) |

**Front-end** (`client-new-kpi/`)

| Item | Tecnologia |
|---|---|
| Framework | Next.js 16.3 (App Router) + React 19.2 |
| Estilo | Tailwind CSS 4 (tokens em `app/globals.css`) |
| Dados do servidor | React Query v5 |
| HTTP | `services/apiClient.ts` — fetch nativo, sem axios |
| Excel | SheetJS `xlsx` 0.20.3 — **da CDN oficial**, não do npm |
| Tipos | TypeScript strict, com `noUncheckedIndexedAccess` |

Toda biblioteca nova passa por aprovação do Gabriel antes de ser instalada.

## Estrutura

```
api-new-kpi/
├── Domain/{Entities,Interfaces}/
├── Application/
│   ├── Common/          Result<T> · ApiResponse<T> · PagedResult<T> · IModuleInstaller
│   └── Features/        um diretório por rotina
├── Infrastructure/
│   ├── Persistence/{Context,Repositories,Queries}/
│   └── Services/
├── Configurations/      extension methods de IServiceCollection
├── Controllers/
├── Middleware/          GlobalException · NoStore
└── Program.cs

client-new-kpi/
├── app/                 App Router — uma pasta por rotina
├── components/{layout,ui}/
├── context/  hooks/  lib/  services/  types/

docs/
├── plataforma/          vale para qualquer rotina
└── rotinas/<rotina>/    tudo o que é só de uma
```

## Padrões

- **Repository Pattern** — interfaces em `Domain/Interfaces/`, implementação em
  `Infrastructure/`.
- **`Result<T>`** para fluxo de negócio, sem exceptions. **`ApiResponse<T>`** como envelope
  HTTP.
- **Records** para DTOs; **class com `init`** para entidades mapeadas por Dapper.
- **Dapper** para tabelas legadas e stored procedures. **EF Core** só para tabelas novas com
  prefixo próprio — migration **nunca** roda em tabela legada.
- Pipeline: GlobalException → NoStore → CORS → Authentication → Authorization → Controllers.
- Um módulo por rotina, descoberto por reflexão.
- **Toda tela leva `<ControlesDeExibicao />`**, e todo efeito visual tem de existir nos dois
  temas — com as outras regras de tela em
  [PADROES_DE_TELA.md](docs/plataforma/PADROES_DE_TELA.md).

## O que vale para toda rotina migrada

**A versão web produz os mesmos números da rotina Delphi, inclusive nos pontos que parecem
defeito.** Decisão do Gabriel em 27/08/2026. Quando um número tiver de divergir, ele é
medido, explicado e aprovado no `DIVERGENCIAS.md` da rotina — o que não estiver lá é defeito,
não escolha.

**As mudanças aprovadas se acumulam, e nenhuma branch as desfaz.** Antes de abrir trabalho e
antes de entregar, traga a `main`: `git log --oneline HEAD..main` tem de vir vazio. Branch
atrasada e regra revertida produzem a MESMA tela, e só o histórico distingue uma da outra.

## Bases

O login escolhe a **base** (Época Distribuição ou Minas Rural), e a escolha vai no JWT: cada
requisição consulta só a base da sessão. As diferenças de regra entre bases (a seção sem custo,
o ICMS, as filiais) são **configuração** — `appsettings.json` → `Bases` —, nunca `if` no código.
Ver [BIFURCACAO_DE_BASES.md](docs/plataforma/BIFURCACAO_DE_BASES.md). **Uma regra do Minas Rural
só se liga depois de medida contra a 9815 de lá**, e cada uma entra no `DIVERGENCIAS.md`.


## Rodar

```bash
cd api-new-kpi && dotnet watch run --urls http://localhost:5207
```

```bash
cd client-new-kpi && npm run dev
```

No VS Code: `F5` → `▶ API + Front`. Front em `:3000`, API em `:5207`, Scalar em `/scalar/v1`.

Para conectar no banco, copie `api-new-kpi/appsettings.example.json` para
`appsettings.Development.json` e preencha `ConnectionStrings:OracleEpoca`. O arquivo está no
`.gitignore`.
