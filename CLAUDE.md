# Projeto Novo KPI — rotinas do Winthor na web

Monólito com duas aplicações: uma API .NET e um front Next.js. Migra rotinas do ERP
**Winthor** para web, aproveitando a transição para mudar funcionalidade — **não é port
literal** da tela antiga.

- **Empresa:** Época Distribuição.
- **Banco:** Oracle 11g **da Época**. O Winthor é o ERP cujas tabelas (`PC*`) vivem nessa base.
- **Rotina piloto:** 9815 — *GERENCIAL / DRE*. Vira o molde para as próximas.
- **Referência arquitetural:** `api-minas-rural` (.NET 10) e `client-minas-rural` (Next.js 16).

## Estado atual

| Fase | O quê | Situação |
|---|---|---|
| 0 | Levantamento da 9815 | ✅ [docs/ROTINA_9815_LEVANTAMENTO.md](docs/ROTINA_9815_LEVANTAMENTO.md) |
| 1 | Arquitetura e scaffold | ✅ API e front sobem, health check ok |
| 2 | Documentação | ✅ este arquivo e `docs/` |
| 3 | Skills do projeto | ✅ 4 skills em `.claude/skills/` |
| 4 | Implementação da 9815 | ✅ as 4 dimensões implementadas e conferidas — [docs/DIVERGENCIAS.md](docs/DIVERGENCIAS.md) |
| 4.1 | Detalhamento por duplo clique | ✅ **162/162 fecham ao centavo** — [ROTINA_9815 §16](docs/ROTINA_9815.md) |
| 4.2 | Recursos da tela web | ✅ reordenar, tema, tela cheia, impressão — §15, §17, §18 |
| 5 | Homologação — matriz de cenários | ⬜ [docs/HOMOLOGACAO.md](docs/HOMOLOGACAO.md) · **a matriz está desatualizada**, ver os riscos em DIVERGENCIAS |

**Em aberto, em ordem de risco** (detalhe na tabela de riscos de `DIVERGENCIAS.md`):

| | |
|---|---|
| O duplo clique **pela tela** | a API fecha 162/162, mas as telas novas nunca foram percorridas pela interface com dado real |
| Tempo das consultas de imposto | nunca medido isoladamente — a dc6 só dá o total da execução |
| Período de 3 meses e todas as filiais juntas | nunca apurados; risco de custo, não de valor |
| `% AH` em Conta Gerencial | a exportação usada saiu sem análise horizontal |

## Stack

**Back-end** (`api-new-kpi/`)

| Item | Tecnologia |
|---|---|
| Framework | .NET 10 — ASP.NET Core Web API |
| Queries e stored procedures | Dapper 2.1 |
| CRUD em tabelas novas | EF Core 10 (`Oracle.EntityFrameworkCore`) — **ainda não instalado** |
| Driver | `Oracle.ManagedDataAccess.Core` 23.26 (ODP.NET) |
| Banco | Oracle 11g |
| Auth | JWT — **fora do escopo do piloto** |
| Docs da API | OpenAPI nativo + Scalar (`/scalar/v1`) |

**Front-end** (`client-new-kpi/`)

| Item | Tecnologia |
|---|---|
| Framework | Next.js 16.3 (App Router) + React 19.2 |
| Estilo | Tailwind CSS 4 (tokens em `app/globals.css`) |
| Dados do servidor | React Query v5 |
| HTTP | `services/apiClient.ts` — fetch nativo, sem axios |
| Excel | SheetJS `xlsx` 0.20.3 — **da CDN oficial**, não do npm (ver [ROTINA_9815 §20.2](docs/ROTINA_9815.md)) |
| Tipos | TypeScript strict, com `noUncheckedIndexedAccess` |

Toda biblioteca nova passa por aprovação do Gabriel antes de ser instalada.

## Estrutura

```
api-new-kpi/
├── Domain/{Entities,Interfaces}/
├── Application/
│   ├── Common/          Result<T> · ApiResponse<T> · PagedResult<T> · IModuleInstaller
│   └── Features/        um diretório por rotina — hoje só DreGerencial/
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

docs/                    documentação do monólito (raiz, não por projeto)
```

## Padrões

- **Repository Pattern** — interfaces em `Domain/Interfaces/`, implementação em `Infrastructure/`.
- **`Result<T>`** para fluxo de negócio, sem exceptions. **`ApiResponse<T>`** como envelope HTTP.
- **Records** para DTOs; **class com `init`** para entidades mapeadas por Dapper.
- **Dapper** para tabelas legadas e stored procedures. **EF Core** só para tabelas novas com
  prefixo próprio — migration **nunca** roda em tabela legada.
- Pipeline: GlobalException → NoStore → CORS → Authentication → Authorization → Controllers.
- Um módulo por rotina, descoberto por reflexão. Ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Regras de negócio críticas

A versão web da 9815 tem que produzir **exatamente os mesmos números** da rotina Delphi,
inclusive nos pontos que parecem defeito. Decisão do Gabriel em 27/08/2026. Os quatro casos
que mais confundem quem lê o SQL pela primeira vez:

1. **`RECEITAS LIQUIDAS = RECEITA BRUTA − ABAT./DESC. − DEVOLUCAO`.** ST, PIS e COFINS
   **não são deduzidos** — são linhas informativas, com selo `INFORMATIVO` na tela web
   (a 9815 escreve `NÃO SOMA`).
   Verificado ao centavo contra 4 cenários exportados.
2. **Regime altera apenas a data das despesas.** Caixa usa `nvl(DTPAGTO, DTVENC)`,
   competência usa `dtcompetencia`. Receita, deduções e CMV são idênticos nos dois.
3. **O mês da coluna acompanha o regime** — caixa por `nvl(DTPAGTO, DTVENC)`, competência por
   `nvl(DTCOMPETENCIA, DTVENC)`. A rotina é coerente neste ponto.
4. **Despesa não paga nunca entra no DRE**, nem em competência (`DTPAGTO IS NOT NULL`).
   Confirmado como correto — manter.

O detalhamento está em [docs/ROTINA_9815.md](docs/ROTINA_9815.md) e no levantamento.

## Rodar

```bash
cd api-new-kpi && dotnet watch run --urls http://localhost:5207
```

```bash
cd client-new-kpi && npm run dev
```

No VS Code: `F5` → `▶ API + Front`. Front em `:3000`, API em `:5207`, Scalar em `/scalar/v1`.

Para conectar no banco, copie `api-new-kpi/appsettings.example.json` para
`appsettings.Development.json` e preencha `ConnectionStrings:OracleEpoca`. O arquivo está
no `.gitignore`.

## Documentação

| Arquivo | Assunto |
|---|---|
| [AGENTS.md](AGENTS.md) | regras imperativas para agentes |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | modularização e como adicionar uma rotina |
| [docs/ROTINA_9815.md](docs/ROTINA_9815.md) | especificação da 9815 **na web** |
| [docs/ROTINA_9815_LEVANTAMENTO.md](docs/ROTINA_9815_LEVANTAMENTO.md) | o que a 9815 **é hoje** no Winthor |
| [docs/SCHEMA_BANCO.md](docs/SCHEMA_BANCO.md) | tabelas, colunas, leitura vs. escrita |
| [docs/CONVENCOES_ORACLE.md](docs/CONVENCOES_ORACLE.md) | ODP.NET, Dapper, armadilhas reais |
| [docs/HOMOLOGACAO.md](docs/HOMOLOGACAO.md) | matriz de cenários a conferir contra a 9815 |
| [docs/DIVERGENCIAS.md](docs/DIVERGENCIAS.md) | **toda** diferença numérica entre a web e a 9815 |
