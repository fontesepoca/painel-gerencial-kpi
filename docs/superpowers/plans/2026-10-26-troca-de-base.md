# Troca de base sem novo login — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quem entra numa base e tem o mesmo usuário, a mesma senha e acesso à rotina na outra base troca de base pelo menu do usuário, sem novo login.

**Architecture:** no login, a API confere a mesma senha nas outras bases (em paralelo, com teto de tempo) e emite um token para cada base válida. O BFF guarda todos os tokens na mesma sessão e só troca qual está ativo; a troca nunca chama a API. A tela decide quais trocas oferecer pela rotina aberta, lida do endereço.

**Tech Stack:** .NET 10 (API, Dapper), Next.js 16 App Router (BFF + tela), validações em C# de arquivo único (`#:project`) e `.mjs` com `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-26-troca-de-base-design.md` (regras R1–R9).

## Global Constraints

- **Não commitar.** O Gabriel pediu "não commite direto": cada tarefa termina com `git diff --stat` e a mudança fica no working tree para ele revisar.
- **Nunca conectar no Oracle** nem digitar senha. O teste ponta a ponta depende do login do Gabriel.
- **Nunca logar** senha, token, login digitado ou string de conexão (AGENTS.md). Log de falha de outra base leva só o id da base e o tipo do erro.
- **Sem biblioteca nova** — nem de teste.
- `dotnet build` sem aviso; `npx tsc --noEmit` e `npx eslint` limpos nos arquivos tocados.
- Português com acentuação em código, comentário e documentação. Comentários no estilo do arquivo: o porquê, com data quando for decisão do Gabriel.
- Arquivos do front estão em CRLF: editar com a ferramenta Edit, nunca com `sed`/script que reescreva quebras de linha.

## Review Focus

1. **Senha errada na base escolhida não pode tentar as outras.** Quem erra a senha não deve gerar tentativas no Minas Rural (log, bloqueio). Coberto no tb1, cenário G.
2. **Uma base pendurada não pode segurar o login.** O teto de 5 s tem de valer mesmo se o driver ignorar o cancelamento (`WaitAsync`). Coberto no tb1, cenário F.
3. **O token não pode aparecer no `GET /api/sessao`**, nem o da base ativa nem o das outras. Coberto no tb2.
4. **Trocar para base que não está na sessão é recusado**, mesmo forjando o corpo da requisição. Coberto no tb2.
5. **A troca não estende a sessão**: `expiraEm` é o menor dos tokens e não muda ao trocar. Coberto no tb2.

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `api-new-kpi/Application/Features/Autenticacao/Dtos/AutenticacaoDtos.cs` | `SessaoDeBase`; `LoginResponse.OutrasBases` |
| `api-new-kpi/Application/Features/Autenticacao/AutenticacaoService.cs` | `ConferirOutrasBasesAsync` e auxiliares; log |
| `docs/plataforma/validacao/tb1_outras_bases_no_login.cs` | novo — prova R1–R3 sem banco |
| `client-new-kpi/lib/servidor/sessoes.ts` | um token por base, base ativa, `trocas`, `trocarBase` |
| `docs/plataforma/validacao/tb2_troca_no_bff.mjs` | novo — prova R5–R7 |
| `client-new-kpi/app/api/sessao/route.ts` | guarda `outrasBases`; `GET` devolve `trocas` |
| `client-new-kpi/app/api/sessao/base/route.ts` | novo — `POST` troca a base ativa |
| `client-new-kpi/lib/trocasDeBase.ts` | novo — quais trocas a tela oferece (R4) |
| `docs/plataforma/validacao/tb3_trocas_na_tela.mjs` | novo — prova R4 |
| `client-new-kpi/hooks/useSessao.ts` | `UsuarioLogado.trocas` |
| `client-new-kpi/components/layout/MenuDoUsuario.tsx` | itens "Trocar para X" |
| `docs/plataforma/AUTENTICACAO.md`, `docs/plataforma/BIFURCACAO_DE_BASES.md` | a regra nova |

---

### Task 1: API — conferir as outras bases no login

**Files:**
- Modify: `api-new-kpi/Application/Features/Autenticacao/Dtos/AutenticacaoDtos.cs`
- Modify: `api-new-kpi/Application/Features/Autenticacao/AutenticacaoService.cs`
- Test: `docs/plataforma/validacao/tb1_outras_bases_no_login.cs`

**Interfaces:**
- Consumes: `IAutenticacaoRepository.VerificarCredenciaisAsync(BaseConfigurada, string, string, CancellationToken)`, `ObterFiliaisDoUsuarioAsync(BaseConfigurada, int, CancellationToken)`, `RegistroDeBases.Disponiveis`, `GeradorDeToken.Emitir(UsuarioDto)`.
- Produces: `public sealed record SessaoDeBase(string Token, DateTimeOffset ExpiraEm, UsuarioDto Usuario);` e `LoginResponse(string Token, DateTimeOffset ExpiraEm, UsuarioDto Usuario, IReadOnlyList<SessaoDeBase> OutrasBases)`. Em JSON: `outrasBases: [{ token, expiraEm, usuario }]`.

- [ ] **Step 1: Escrever o teste que falha** — `docs/plataforma/validacao/tb1_outras_bases_no_login.cs`:

```csharp
#:project ../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// tb1 — o login confere as OUTRAS bases (troca de base sem novo login, 26/10/2026).
// Regras R1–R3 de docs/superpowers/specs/2026-10-26-troca-de-base-design.md, sem banco: o
// repositório é falso e cada cenário diz o que a "outra base" responde.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/plataforma/validacao/tb1_outras_bases_no_login.cs -p:BaseOutputPath="$TEMP/tb1/"

using System.Diagnostics;
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.Autenticacao;
using Epoca.Kpi.Api.Application.Features.Autenticacao.Dtos;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

var configuracao = new ConfigurationBuilder()
    .AddJsonFile(Path.GetFullPath(Path.Combine("api-new-kpi", "appsettings.json")), optional: false)
    // Uma string qualquer: o registro só oferece base que tenha conexão, e aqui ninguém conecta.
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["ConnectionStrings:OracleEpoca"] = "teste",
        ["ConnectionStrings:OracleMinasRural"] = "teste",
    })
    .Build();

var bases = new RegistroDeBases(configuracao, NullLogger<RegistroDeBases>.Instance);
var tokens = new GeradorDeToken(Options.Create(new OpcoesDeToken { Chave = new string('x', 64) }));

var falhas = 0;
void Conferir(string afirmacao, bool condicao)
{
    Console.WriteLine($"  {(condicao ? "ok   " : "FALHA")} {afirmacao}");
    if (!condicao) falhas++;
}

static CredenciaisWinthor Pessoa(int matricula, string senha = "S", string ativo = "S", string controle = "S") => new()
{
    Matricula = matricula, Nome = "FULANO DE TAL", NomeGuerra = "FULANO",
    TemSenha = "S", Ativo = ativo, SenhaConfere = senha, TemRotina = "S", TemControle = controle,
};

async Task<(Result<LoginResponse> Resultado, RepositorioFalso Repo, TimeSpan Tempo)> Entrar(
    string escolhida, Func<CancellationToken, Task<CredenciaisWinthor?>> outra, CredenciaisWinthor? principal = null)
{
    var repo = new RepositorioFalso(escolhida, principal ?? Pessoa(144), outra);
    var servico = new AutenticacaoService(repo, bases, tokens, NullLogger<AutenticacaoService>.Instance);
    var relogio = Stopwatch.StartNew();
    var resultado = await servico.EntrarAsync(new LoginRequest("fulano", "senha", escolhida));
    return (resultado, repo, relogio.Elapsed);
}

Console.WriteLine("A — outra base com a mesma senha e a 9815: entra na lista, com a matrícula DELA");
var a = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77)));
Conferir("login ok", a.Resultado.Sucesso);
Conferir("uma outra base", a.Resultado.Valor!.OutrasBases.Count == 1);
Conferir("é o Minas Rural", a.Resultado.Valor!.OutrasBases[0].Usuario.Base.Id == "MinasRural");
Conferir("matrícula do Minas Rural (77), não a da Época", a.Resultado.Valor!.OutrasBases[0].Usuario.Matricula == 77);
Conferir("token próprio, diferente do principal", a.Resultado.Valor!.OutrasBases[0].Token != a.Resultado.Valor!.Token);

Console.WriteLine("B — senha diferente na outra base: fora");
var b = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77, senha: "N")));
Conferir("login ok e lista vazia", b.Resultado.Sucesso && b.Resultado.Valor!.OutrasBases.Count == 0);

Console.WriteLine("C — inativo na outra base: fora");
var c = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77, ativo: "N")));
Conferir("login ok e lista vazia", c.Resultado.Sucesso && c.Resultado.Valor!.OutrasBases.Count == 0);

Console.WriteLine("D — sem rotina na outra base (sem a guia 4-DRE): fora (R1)");
var d = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77, controle: "N")));
Conferir("login ok e lista vazia", d.Resultado.Sucesso && d.Resultado.Valor!.OutrasBases.Count == 0);

Console.WriteLine("E — outra base fora do ar: fora, e o login não cai (R3)");
var e = await Entrar("Epoca", _ => throw new BaseIndisponivelException(bases.Buscar("MinasRural")!, "ORA-12541", new Exception("sem listener")));
Conferir("login ok e lista vazia", e.Resultado.Sucesso && e.Resultado.Valor!.OutrasBases.Count == 0);

Console.WriteLine("F — outra base pendurada, ignorando o cancelamento: fora, dentro do teto (R3)");
var f = await Entrar("Epoca", _ => new TaskCompletionSource<CredenciaisWinthor?>().Task);
Conferir("login ok e lista vazia", f.Resultado.Sucesso && f.Resultado.Valor!.OutrasBases.Count == 0);
Conferir($"respondeu em menos de 7 s ({f.Tempo.TotalSeconds:0.0} s)", f.Tempo < TimeSpan.FromSeconds(7));

Console.WriteLine("G — senha errada na base escolhida: recusa e NÃO tenta a outra");
var g = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77)), principal: Pessoa(144, senha: "N"));
Conferir("login recusado", g.Resultado.Falha);
Conferir("a outra base não foi consultada", g.Repo.ConsultasDaOutra == 0);

Console.WriteLine("H — entrando pelo Minas Rural, a Época é a outra");
var h = await Entrar("MinasRural", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(144)), principal: Pessoa(77));
Conferir("a outra é a Época", h.Resultado.Sucesso && h.Resultado.Valor!.OutrasBases.Single().Usuario.Base.Id == "Epoca");

Console.WriteLine(falhas == 0 ? "\n✓ tb1 passou" : $"\n✗ tb1: {falhas} falha(s)");
return falhas == 0 ? 0 : 1;

/// <summary>A base escolhida responde `principal`; qualquer outra responde `outra`.</summary>
sealed class RepositorioFalso(
    string escolhida, CredenciaisWinthor principal, Func<CancellationToken, Task<CredenciaisWinthor?>> outra)
    : IAutenticacaoRepository
{
    public int ConsultasDaOutra { get; private set; }

    public Task<CredenciaisWinthor?> VerificarCredenciaisAsync(
        BaseConfigurada baseAlvo, string nomeGuerra, string senha, CancellationToken cancellationToken = default)
    {
        if (baseAlvo.Id == escolhida) return Task.FromResult<CredenciaisWinthor?>(principal);
        ConsultasDaOutra++;
        return outra(cancellationToken);
    }

    public Task<IReadOnlyList<string>> ObterFiliaisDoUsuarioAsync(
        BaseConfigurada baseAlvo, int matricula, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<string>>(["1", "7"]);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run (raiz): `dotnet run docs/plataforma/validacao/tb1_outras_bases_no_login.cs -p:BaseOutputPath="$TEMP/tb1/"`
Expected: erro de compilação — `LoginResponse` não tem `OutrasBases`.

- [ ] **Step 3: Contrato** — em `AutenticacaoDtos.cs`, acima de `LoginResponse`:

```csharp
/// <summary>
/// A sessão de uma OUTRA base, aberta no mesmo login — a troca de base sem novo login
/// (26/10/2026). Só existe quando, nessa base, a senha confere, o cadastro está ativo e há ao
/// menos uma rotina. <b>Nunca chega ao navegador</b>, como o <see cref="LoginResponse"/>.
/// </summary>
public sealed record SessaoDeBase(string Token, DateTimeOffset ExpiraEm, UsuarioDto Usuario);
```

e `LoginResponse` passa a ser:

```csharp
/// <param name="OutrasBases">As outras bases em que o mesmo login vale, cada uma com o seu
/// token — a matrícula, as filiais e as rotinas são DELA. Vazia quando não há.</param>
public sealed record LoginResponse(
    string Token,
    DateTimeOffset ExpiraEm,
    UsuarioDto Usuario,
    IReadOnlyList<SessaoDeBase> OutrasBases);
```

- [ ] **Step 4: Serviço** — em `AutenticacaoService.cs`, trocar o fim de `EntrarAsync`:

```csharp
        var (token, expiraEm) = _tokens.Emitir(usuario);

        // AS OUTRAS BASES, só depois de a escolhida aprovar a senha: quem errou a senha não
        // gera tentativa nenhuma na outra base. Ver `ConferirOutrasBasesAsync`.
        var outras = await ConferirOutrasBasesAsync(baseAlvo, login, pedido.Senha, cancellationToken);

        _logger.LogInformation(
            "Login concluído para a matrícula {Matricula} na base {Base}, com {Filiais} " +
            "filiais e {Rotinas} rotinas. Também vale em: {Outras}.",
            credenciais.Matricula,
            baseAlvo.Id,
            filiais.Count,
            rotinas.Count,
            outras.Count == 0 ? "nenhuma" : string.Join(", ", outras.Select(o => o.Usuario.Base.Id)));

        return Result<LoginResponse>.Ok(new LoginResponse(token, expiraEm, usuario, outras));
    }
```

(o comentário de "Matrícula, não nome de guerra" que já existe sobre o log fica.) E acrescentar à classe:

```csharp
    /// <summary>
    /// O teto de cada outra base. Uma base lenta não pode segurar o login da que respondeu.
    /// </summary>
    private static readonly TimeSpan TetoPorBase = TimeSpan.FromSeconds(5);

    /// <summary>
    /// AS OUTRAS BASES EM QUE O MESMO LOGIN VALE — a troca de base sem novo login, pedida pelo
    /// Gabriel em 26/10/2026.
    ///
    /// <para>Confere a MESMA senha, com a mesma consulta do login, em cada base que não é a
    /// escolhida, todas em paralelo. Entra na lista a base em que a senha confere, o cadastro
    /// está ativo e há ao menos uma rotina (R1). Para cada uma sai um token próprio: a
    /// matrícula 144 da Época e a 144 do Minas Rural podem ser pessoas diferentes, e cada token
    /// leva a identidade da sua base.</para>
    ///
    /// <para><b>Nada aqui derruba o login</b> (R3). Base fora do ar, lenta ou com erro fica
    /// fora da lista, e a pessoa entra na que escolheu como sempre entrou.</para>
    /// </summary>
    private async Task<IReadOnlyList<SessaoDeBase>> ConferirOutrasBasesAsync(
        BaseConfigurada escolhida,
        string login,
        string senha,
        CancellationToken cancellationToken)
    {
        var conferencias = _bases.Disponiveis
            .Where(b => b.Id != escolhida.Id)
            .Select(b => ConferirOutraBaseAsync(b, login, senha, cancellationToken));

        var resultados = await Task.WhenAll(conferencias);
        return resultados.OfType<SessaoDeBase>().ToList();
    }

    private async Task<SessaoDeBase?> ConferirOutraBaseAsync(
        BaseConfigurada baseAlvo,
        string login,
        string senha,
        CancellationToken cancellationToken)
    {
        using var teto = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        teto.CancelAfter(TetoPorBase);

        try
        {
            // `WaitAsync`, além do token: o driver pode não atender o cancelamento no meio de
            // uma conexão que não responde, e o teto tem de valer mesmo assim.
            return await AbrirSessaoDeBaseAsync(baseAlvo, login, senha, teto.Token)
                .WaitAsync(teto.Token);
        }
        catch (Exception erro) when (!cancellationToken.IsCancellationRequested)
        {
            // Só a base e o TIPO do erro: a mensagem de uma falha de conexão pode trazer host
            // e usuário do banco, e nada disso vai ao log (AGENTS.md).
            _logger.LogWarning(
                "A base {Base} ficou fora da troca sem novo login: {Erro}.",
                baseAlvo.Id,
                erro.GetType().Name);
            return null;
        }
    }

    private async Task<SessaoDeBase?> AbrirSessaoDeBaseAsync(
        BaseConfigurada baseAlvo,
        string login,
        string senha,
        CancellationToken cancellationToken)
    {
        var credenciais = await _repositorio.VerificarCredenciaisAsync(
            baseAlvo, login, senha, cancellationToken);

        if (credenciais is null
            || !credenciais.SenhaCorreta
            || !credenciais.PossuiSenha
            || !credenciais.EstaAtivo)
        {
            return null;
        }

        var filiais = await _repositorio.ObterFiliaisDoUsuarioAsync(
            baseAlvo, credenciais.Matricula, cancellationToken);
        var rotinas = RotinasDe(credenciais, filiais);

        // R1: sem rotina, não há para onde trocar — a pessoa cairia numa tela vazia.
        if (rotinas.Count == 0) return null;

        var usuario = new UsuarioDto(
            credenciais.Matricula,
            credenciais.Nome.Trim(),
            credenciais.NomeGuerra.Trim(),
            filiais,
            rotinas,
            BaseDto.De(baseAlvo));

        var (token, expiraEm) = _tokens.Emitir(usuario);
        return new SessaoDeBase(token, expiraEm, usuario);
    }
```

- [ ] **Step 5: Rodar e ver passar**

Run (raiz): `dotnet run docs/plataforma/validacao/tb1_outras_bases_no_login.cs -p:BaseOutputPath="$TEMP/tb1/"`
Expected: todos `ok`, `✓ tb1 passou`, F em ~5 s.

- [ ] **Step 6: Build sem aviso**

Run: `dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/tb-build/" --nologo`
Expected: `0 Aviso(s)`, `0 Erro(s)`.

- [ ] **Step 7: Sem commit** — `git diff --stat`.

---

### Task 2: BFF — um token por base na sessão

**Files:**
- Modify: `client-new-kpi/lib/servidor/sessoes.ts`
- Test: `docs/plataforma/validacao/tb2_troca_no_bff.mjs`

**Interfaces:**
- Consumes: nada de tarefa anterior (o contrato JSON da Task 1 entra na Task 3).
- Produces:
  - `export interface SessaoDeBase { readonly token: string; readonly usuario: UsuarioDaSessao }`
  - `export interface TrocaDeBase { readonly base: { readonly id: string; readonly rotulo: string }; readonly rotinas: readonly string[] }`
  - `Sessao` ganha `readonly trocas: readonly TrocaDeBase[]` (token, usuario, expiraEm e criadaEm continuam sendo os da base ATIVA — quem repassa à API não muda)
  - `criarSessao(principal: SessaoDeBase, expiraEm: Date, outras?: readonly SessaoDeBase[]): string`
  - `trocarBase(id: string | undefined, base: string): "trocou" | "sem-sessao" | "base-desconhecida"`

- [ ] **Step 1: Escrever o teste que falha** — `docs/plataforma/validacao/tb2_troca_no_bff.mjs`:

```js
/**
 * tb2 — a troca de base no BFF (26/10/2026). Regras R5–R7 da especificação
 * docs/superpowers/specs/2026-10-26-troca-de-base-design.md, sobre o `sessoes.ts` REAL.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/tb2_troca_no_bff.mjs
 */
import assert from "node:assert/strict";
import {
  criarSessao,
  encerrarSessao,
  lerSessao,
  lerSessaoPublica,
  trocarBase,
} from "../../../client-new-kpi/lib/servidor/sessoes.ts";

const usuario = (base, matricula) => ({
  matricula,
  nome: "FULANO DE TAL",
  nomeGuerra: "FULANO",
  filiais: ["1"],
  rotinas: ["9815"],
  base: { id: base, rotulo: base === "Epoca" ? "Época Distribuição" : "Minas Rural" },
});
const daqui8h = new Date(Date.now() + 8 * 3600e3);

// Sem outra base: nada a trocar.
const sozinha = criarSessao({ token: "TOKEN-EPOCA-1", usuario: usuario("Epoca", 144) }, daqui8h);
assert.deepEqual(lerSessao(sozinha).trocas, []);

// Com o Minas Rural guardado.
const id = criarSessao(
  { token: "TOKEN-EPOCA", usuario: usuario("Epoca", 144) },
  daqui8h,
  [{ token: "TOKEN-MINAS", usuario: usuario("MinasRural", 77) }],
);
let s = lerSessao(id);
assert.equal(s.token, "TOKEN-EPOCA");
assert.deepEqual(s.trocas, [{ base: { id: "MinasRural", rotulo: "Minas Rural" }, rotinas: ["9815"] }]);
const expiraAntes = s.expiraEm;

// A face pública não leva token nenhum (Review Focus 3).
const publica = JSON.stringify(lerSessaoPublica(id));
assert.ok(!publica.includes("TOKEN-"), "token vazou na sessão pública");

// Base que não está na sessão: recusada, nada muda (R5, Review Focus 4).
assert.equal(trocarBase(id, "Outra"), "base-desconhecida");
assert.equal(lerSessao(id).token, "TOKEN-EPOCA");

// A troca: o token, a matrícula e as trocas passam a ser os da outra base.
assert.equal(trocarBase(id, "MinasRural"), "trocou");
s = lerSessao(id);
assert.equal(s.token, "TOKEN-MINAS");
assert.equal(s.usuario.matricula, 77);
assert.equal(s.trocas[0].base.id, "Epoca");
assert.equal(s.expiraEm, expiraAntes, "a troca estendeu a sessão"); // R6, Review Focus 5

// E de volta.
assert.equal(trocarBase(id, "Epoca"), "trocou");
assert.equal(lerSessao(id).token, "TOKEN-EPOCA");

// Sem sessão.
assert.equal(trocarBase(undefined, "MinasRural"), "sem-sessao");
assert.equal(trocarBase("nao-existe", "MinasRural"), "sem-sessao");

// Sair apaga todas as bases (R7).
encerrarSessao(id);
assert.equal(lerSessao(id), null);
assert.equal(trocarBase(id, "MinasRural"), "sem-sessao");

console.log("✓ tb2 passou");
```

- [ ] **Step 2: Rodar e ver falhar**

Run (raiz): `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/tb2_troca_no_bff.mjs`
Expected: `SyntaxError`/erro de import — `trocarBase` não existe.

- [ ] **Step 3: Implementar em `sessoes.ts`.** Trocar a interface `Sessao` por:

```ts
/** O token e o usuário de UMA base. O `token` nunca sai deste módulo. */
export interface SessaoDeBase {
  readonly token: string;
  readonly usuario: UsuarioDaSessao;
}

/** Uma base para a qual dá para trocar sem novo login — o que a tela precisa, sem token. */
export interface TrocaDeBase {
  readonly base: { readonly id: string; readonly rotulo: string };
  readonly rotinas: readonly string[];
}

/**
 * A sessão como os outros módulos a veem: o token e o usuário são os da base ATIVA, e quem
 * repassa à API (`app/api/[...caminho]`) não precisa saber que existem outras.
 */
export interface Sessao {
  readonly token: string;
  readonly expiraEm: number;
  readonly usuario: UsuarioDaSessao;
  readonly criadaEm: number;
  /** As OUTRAS bases guardadas — a troca sem novo login (26/10/2026). Vazia quando não há. */
  readonly trocas: readonly TrocaDeBase[];
}

/**
 * O que o Map guarda: um token por base e qual está ativa.
 *
 * TROCA DE BASE SEM NOVO LOGIN (26/10/2026, pedido do Gabriel). O login já conferiu a senha
 * em cada base guardada aqui — ver `ConferirOutrasBasesAsync` na API —, e trocar é só passar
 * a usar outro token. Nenhuma chamada à API, nenhuma senha guardada.
 */
interface Guardada {
  readonly porBase: ReadonlyMap<string, SessaoDeBase>;
  baseAtiva: string;
  readonly expiraEm: number;
  readonly criadaEm: number;
}
```

O Map passa a ser de `Guardada`, **com chave global nova** — a sessão no formato antigo, que o Fast Refresh manteria em memória, não tem `porBase`, e reconhecê-la custaria um caso a mais em cada leitura; trocar a chave derruba as sessões de desenvolvimento uma vez:

```ts
const global = globalThis as typeof globalThis & {
  __sessoesPorBaseEpocaAnalytics?: Map<string, Guardada>;
};

const sessoes = (global.__sessoesPorBaseEpocaAnalytics ??= new Map<string, Guardada>());
```

(mantendo o comentário existente sobre `globalThis`, acrescido de uma linha sobre a chave nova). `criarSessao`:

```ts
export function criarSessao(
  principal: SessaoDeBase,
  expiraEm: Date,
  outras: readonly SessaoDeBase[] = [],
): string {
  limparExpiradas();

  const id = randomBytes(32).toString("base64url");

  const porBase = new Map<string, SessaoDeBase>();
  for (const sessao of [principal, ...outras]) porBase.set(sessao.usuario.base.id, sessao);

  sessoes.set(id, {
    porBase,
    baseAtiva: principal.usuario.base.id,
    expiraEm: expiraEm.getTime(),
    criadaEm: Date.now(),
  });

  return id;
}
```

`lerSessao` lê a `Guardada`, mantém as duas verificações que já existem (rotinas e base) **sobre o usuário ativo**, e devolve a visão:

```ts
  const ativa = guardada.porBase.get(guardada.baseAtiva);
  if (!ativa) {
    sessoes.delete(id);
    return null;
  }
  // (as verificações de `rotinas` e `base` de hoje, sobre `ativa.usuario`)

  return {
    token: ativa.token,
    usuario: ativa.usuario,
    expiraEm: guardada.expiraEm,
    criadaEm: guardada.criadaEm,
    trocas: [...guardada.porBase.values()]
      .filter((s) => s.usuario.base.id !== guardada.baseAtiva)
      .map((s) => ({ base: s.usuario.base, rotinas: s.usuario.rotinas })),
  };
```

E a troca:

```ts
/**
 * Passa a usar o token de outra base JÁ GUARDADA nesta sessão (R5).
 *
 * Só troca para base que está no Map: quem forjar o corpo da requisição com outra base recebe
 * `base-desconhecida`, porque aqui não há senha para conferir — a conferência foi no login.
 * A validade não muda (R6): trocar não é entrar de novo.
 */
export function trocarBase(
  id: string | undefined,
  base: string,
): "trocou" | "sem-sessao" | "base-desconhecida" {
  if (!lerSessao(id)) return "sem-sessao";

  const guardada = sessoes.get(id!)!;
  if (!guardada.porBase.has(base)) return "base-desconhecida";

  guardada.baseAtiva = base;
  return "trocou";
}
```

`lerSessaoPublica`, `encerrarSessao`, `limparExpiradas` e `totalDeSessoes` continuam com a mesma assinatura (a pública já tira só o `token` e passa a levar `trocas`).

- [ ] **Step 4: Rodar e ver passar** — o mesmo comando do Step 2. Expected: `✓ tb2 passou`.

- [ ] **Step 5: `tsc`** — `cd client-new-kpi && npx tsc --noEmit -p .`
Expected: um erro só, em `app/api/sessao/route.ts` (a chamada antiga de `criarSessao`) — corrigida na Task 3.

- [ ] **Step 6: Sem commit** — `git diff --stat`.

---

### Task 3: BFF — rotas do login, da sessão e da troca

**Files:**
- Modify: `client-new-kpi/app/api/sessao/route.ts`
- Create: `client-new-kpi/app/api/sessao/base/route.ts`

**Interfaces:**
- Consumes: `criarSessao`, `trocarBase`, `lerSessaoPublica`, `SessaoDeBase` (Task 2); JSON `outrasBases` (Task 1).
- Produces: `GET /api/sessao` → `{ sucesso, dados: { ...usuario, trocas: TrocaDeBase[] } }`; `POST /api/sessao/base` com `{ base }` → 200 `{ sucesso: true }` · 400 base desconhecida · 401 sem sessão.

- [ ] **Step 1: `POST /api/sessao`.** Em `RespostaDaApi.dados`, acrescentar `outrasBases?: { token: string; expiraEm: string; usuario: UsuarioDaApi }[]`, extraindo o tipo do usuário que já está inline para `type UsuarioDaApi`. Uma função converte para a sessão:

```ts
/** O usuário da API no formato da sessão. `?? []` pelo motivo de sempre: API mais antiga. */
function paraSessao(token: string, usuario: UsuarioDaApi): SessaoDeBase {
  return {
    token,
    usuario: {
      matricula: usuario.matricula,
      nome: usuario.nome,
      nomeGuerra: usuario.nomeGuerra,
      filiais: usuario.filiais,
      rotinas: usuario.rotinas ?? [],
      base: usuario.base,
    },
  };
}
```

e a criação da sessão vira (o comentário sobre `rotinas ?? []` vai para `paraSessao`):

```ts
  // AS OUTRAS BASES (26/10/2026): a API já as filtrou — senha, cadastro ativo e ao menos uma
  // rotina. Base sem id é de uma API com defeito; fica fora em vez de criar uma troca que o
  // proxy recusaria.
  const outras = (conteudo.dados.outrasBases ?? [])
    .filter((o) => o.usuario.base?.id)
    .map((o) => paraSessao(o.token, o.usuario));

  // A sessão vale até o PRIMEIRO token vencer (R6): trocar para uma base de token vencido
  // daria 401 no meio do trabalho.
  const expira = Math.min(
    new Date(expiraEm).getTime(),
    ...(conteudo.dados.outrasBases ?? []).map((o) => new Date(o.expiraEm).getTime()),
  );

  const id = criarSessao(paraSessao(token, usuario), new Date(expira), outras);
```

A resposta do `POST` continua `{ sucesso: true, dados: usuario }`.

- [ ] **Step 2: `GET /api/sessao`** devolve as trocas junto do usuário:

```ts
  // As trocas vão JUNTO do usuário, sem token: é o que o menu precisa para oferecer
  // "Trocar para X" (26/10/2026).
  return NextResponse.json({ sucesso: true, dados: { ...sessao.usuario, trocas: sessao.trocas } });
```

- [ ] **Step 3: Criar `app/api/sessao/base/route.ts`:**

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOME_DO_COOKIE, trocarBase } from "@/lib/servidor/sessoes";

/**
 * A TROCA DE BASE SEM NOVO LOGIN (26/10/2026, pedido do Gabriel).
 *
 * Não fala com a API nem pede senha: a conferência foi feita no login, e aqui o BFF só passa a
 * usar outro token que já guardou — ver `trocarBase`. O cookie não muda: é a mesma sessão,
 * apontando para outra base.
 */
export async function POST(requisicao: Request) {
  let corpo: { base?: unknown };
  try {
    corpo = await requisicao.json();
  } catch {
    return NextResponse.json({ sucesso: false, mensagem: "Requisição inválida." }, { status: 400 });
  }

  const base = typeof corpo.base === "string" ? corpo.base.trim() : "";
  const cookieStore = await cookies();

  switch (trocarBase(cookieStore.get(NOME_DO_COOKIE)?.value, base)) {
    case "trocou":
      return NextResponse.json({ sucesso: true });
    case "sem-sessao":
      return NextResponse.json(
        { sucesso: false, mensagem: "Sessão expirada ou ausente. Entre novamente." },
        { status: 401 },
      );
    case "base-desconhecida":
      return NextResponse.json(
        { sucesso: false, mensagem: "Esta base não está disponível nesta sessão. Entre nela pelo login." },
        { status: 400 },
      );
  }
}
```

(`/api/*` já fica fora do `proxy.ts` e a rota específica tem precedência sobre `app/api/[...caminho]`.)

- [ ] **Step 4: Verificar**

Run: `cd client-new-kpi && npx tsc --noEmit -p . && npx eslint app/api/sessao lib/servidor/sessoes.ts` e, da raiz, o tb2.
Expected: limpos; `✓ tb2 passou`.

- [ ] **Step 5: Sem commit** — `git diff --stat`.

---

### Task 4: Tela — "Trocar para X" no menu do usuário

**Files:**
- Create: `client-new-kpi/lib/trocasDeBase.ts`
- Modify: `client-new-kpi/hooks/useSessao.ts`
- Modify: `client-new-kpi/components/layout/MenuDoUsuario.tsx`
- Test: `docs/plataforma/validacao/tb3_trocas_na_tela.mjs`

**Interfaces:**
- Consumes: `GET /api/sessao` com `trocas` e `POST /api/sessao/base` (Task 3); `CAMINHO_DA_ROTINA` (`lib/rotinas.ts`).
- Produces: `rotinaDoCaminho(caminho: string): string | null`; `trocasPermitidas(trocas: readonly TrocaDeBase[] | undefined, caminho: string): TrocaDeBase[]`; `UsuarioLogado.trocas?: TrocaDeBase[]`.

- [ ] **Step 1: Escrever o teste que falha** — `docs/plataforma/validacao/tb3_trocas_na_tela.mjs`:

```js
/**
 * tb3 — quais trocas de base o menu oferece (R4, 26/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/tb3_trocas_na_tela.mjs
 */
import assert from "node:assert/strict";
import { rotinaDoCaminho, trocasPermitidas } from "../../../client-new-kpi/lib/trocasDeBase.ts";

const minas = (rotinas) => ({ base: { id: "MinasRural", rotulo: "Minas Rural" }, rotinas });

assert.equal(rotinaDoCaminho("/dre-gerencial"), "9815");
assert.equal(rotinaDoCaminho("/dre-gerencial/detalhe"), "9815");
assert.equal(rotinaDoCaminho("/"), null);
assert.equal(rotinaDoCaminho("/dre-gerencial-antigo"), null);

// Na rotina: só a base que tem AQUELA rotina.
assert.equal(trocasPermitidas([minas(["9815"])], "/dre-gerencial").length, 1);
assert.equal(trocasPermitidas([minas(["9999"])], "/dre-gerencial").length, 0);

// Fora de rotina: toda base com alguma rotina.
assert.equal(trocasPermitidas([minas(["9999"])], "/").length, 1);
assert.equal(trocasPermitidas([minas([])], "/").length, 0);

// Servidor antigo, sem o campo.
assert.deepEqual(trocasPermitidas(undefined, "/"), []);

console.log("✓ tb3 passou");
```

- [ ] **Step 2: Rodar e ver falhar** — `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/tb3_trocas_na_tela.mjs`
Expected: erro de import — `lib/trocasDeBase.ts` não existe.

- [ ] **Step 3: Criar `lib/trocasDeBase.ts`:**

```ts
import { CAMINHO_DA_ROTINA } from "@/lib/rotinas";

/** Uma base para a qual a sessão pode trocar sem novo login — espelha `TrocaDeBase` do BFF. */
export interface TrocaDeBase {
  base: { id: string; rotulo: string };
  rotinas: string[];
}

/** A rotina aberta, lida do endereço — ou `null` fora de rotina (tela inicial). */
export function rotinaDoCaminho(caminho: string): string | null {
  for (const [codigo, raiz] of Object.entries(CAMINHO_DA_ROTINA)) {
    if (caminho === raiz || caminho.startsWith(`${raiz}/`)) return codigo;
  }
  return null;
}

/**
 * As trocas que o menu oferece AQUI (R4, pedido do Gabriel em 26/10/2026): com uma rotina
 * aberta, só a base que também a tem — a pessoa não pode trocar e cair numa tela que não
 * abre; fora de rotina, toda base com alguma rotina.
 */
export function trocasPermitidas(
  trocas: readonly TrocaDeBase[] | undefined,
  caminho: string,
): TrocaDeBase[] {
  const rotina = rotinaDoCaminho(caminho);
  return (trocas ?? []).filter((t) =>
    rotina === null ? t.rotinas.length > 0 : t.rotinas.includes(rotina),
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — o comando do Step 2. Expected: `✓ tb3 passou`.

- [ ] **Step 5: `useSessao.ts`** — em `UsuarioLogado`:

```ts
  /**
   * As outras bases para as quais dá para trocar sem novo login (26/10/2026). Opcional: um
   * servidor anterior a isso não manda o campo, e aí não há troca.
   */
  trocas?: TrocaDeBase[];
```

com `import type { TrocaDeBase } from "@/lib/trocasDeBase";`.

- [ ] **Step 6: `MenuDoUsuario.tsx`.** Importar `usePathname` de `next/navigation` e `trocasPermitidas`. Estado novo, ao lado de `saindo`:

```tsx
  const caminho = usePathname();
  const [trocando, setTrocando] = useState<string | null>(null);
  const [erroDaTroca, setErroDaTroca] = useState<string | null>(null);
```

A função, ao lado de `sair`:

```tsx
  /**
   * TROCA DE BASE SEM NOVO LOGIN (26/10/2026, pedido do Gabriel).
   *
   * Navegação dura no MESMO endereço, pelo motivo do "Sair": o cache do React Query, os
   * filtros e a tabela de uma base não podem aparecer na outra. Só é oferecida para base que
   * tem a rotina aberta (`trocasPermitidas`), então a página recarrega numa tela que abre.
   */
  async function trocar(base: string) {
    if (trocando) return;
    setTrocando(base);
    setErroDaTroca(null);

    try {
      const resposta = await fetch("/api/sessao/base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base }),
      });

      if (!resposta.ok) {
        const conteudo = await resposta.json().catch(() => null);
        setErroDaTroca(conteudo?.mensagem ?? "Não foi possível trocar de base.");
        setTrocando(null);
        return;
      }

      window.location.replace(window.location.href);
    } catch {
      setErroDaTroca("Não foi possível falar com o servidor. Tente de novo.");
      setTrocando(null);
    }
  }
```

Depois do `if (isPending || !usuario)`: `const trocas = trocasPermitidas(usuario.trocas, caminho);`. No painel, entre o bloco da identidade (que termina em `Base: {usuario.base.rotulo}`) e o de filiais:

```tsx
          {trocas.length > 0 && (
            <div className="flex flex-col border-b border-[var(--border)] py-1">
              {trocas.map((t) => (
                <button
                  key={t.base.id}
                  type="button"
                  onClick={() => trocar(t.base.id)}
                  disabled={trocando !== null}
                  className="w-full px-4 py-2.5 text-left text-[length:var(--fs-base)] font-medium text-[var(--primary)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-60"
                >
                  {trocando === t.base.id ? "Trocando…" : `Trocar para ${t.base.rotulo}`}
                </button>
              ))}
              {erroDaTroca && (
                <p role="alert" className="px-4 pb-2 text-[length:var(--fs-apoio)] text-[var(--negative)]">
                  {erroDaTroca}
                </p>
              )}
            </div>
          )}
```

- [ ] **Step 7: Verificar no navegador sem login real.** Uma página temporária `app/login/previa-troca/page.tsx` não serve (o menu lê a sessão). Em vez disso: `tsc`, `eslint` e conferência visual na Task 6, com o login do Gabriel.

Run: `cd client-new-kpi && npx tsc --noEmit -p . && npx eslint lib/trocasDeBase.ts hooks/useSessao.ts components/layout/MenuDoUsuario.tsx`
Expected: limpos.

- [ ] **Step 8: Sem commit** — `git diff --stat`.

---

### Task 5: Documentação

**Files:**
- Modify: `docs/plataforma/AUTENTICACAO.md`
- Modify: `docs/plataforma/BIFURCACAO_DE_BASES.md`

- [ ] **Step 1: `AUTENTICACAO.md`** — seção nova **"Troca de base sem novo login (26/10/2026)"**, com: o pedido; a conferência das outras bases no login (depois da escolhida aprovar, em paralelo, teto de 5 s, falha não derruba); as regras R1–R9 da especificação, em tabela; o desenho da sessão no BFF (um token por base, base ativa, `trocas` sem token); a rota `POST /api/sessao/base` e o que ela recusa; e as provas `tb1`, `tb2`, `tb3` com o comando de cada uma.

- [ ] **Step 2: `BIFURCACAO_DE_BASES.md`** — um parágrafo na seção sobre a base na identidade: a troca existe *porque* a base é identidade — cada base tem o seu token, com a sua matrícula, filiais e rotinas, e a troca nunca reaproveita a identidade de uma base na outra. Link para a seção do `AUTENTICACAO.md`.

- [ ] **Step 3: Sem commit** — `git diff --stat`.

---

### Task 6: Ponta a ponta com as duas bases

Depende do Gabriel: ele entra com um usuário que exista nas duas bases com a mesma senha. **Eu não digito senha.**

- [ ] **Step 1:** API e front rodando com o código novo (`dotnet watch run` e `npm run dev`). Pedir ao Gabriel que entre na Época pelo navegador.
- [ ] **Step 2:** No log da API, conferir a linha `Também vale em: MinasRural` (ou `nenhuma`, e então parar: o usuário não serve para o teste).
- [ ] **Step 3:** Na tela inicial, abrir o menu: "Trocar para Minas Rural" aparece. Clicar; a página recarrega; o menu mostra `Base: Minas Rural` e a matrícula do Minas Rural; o filtro de filiais mostra as filiais de lá.
- [ ] **Step 4:** No DRE, apurar um mês no Minas Rural; trocar de volta para a Época no menu; a página recarrega no DRE, sem a apuração anterior na tela.
- [ ] **Step 5:** "Sair" e entrar de novo: as duas bases voltam a valer só depois do login.
- [ ] **Step 6:** Screenshots do menu nos dois temas; rodar `tb1`, `tb2`, `tb3`, `dotnet build`, `tsc`; `git diff --stat` e entregar ao Gabriel **sem commit**.
