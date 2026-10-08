# Bifurcação de bases — Plano de implementação

> **Para quem executa:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar este plano tarefa a tarefa. Os passos usam caixas `- [ ]` para acompanhamento.

**Objetivo:** o login escolhe a base (Época Distribuição ou Minas Rural), cada requisição consulta **só** a base do token, e as regras que mudam de uma base para outra vêm de configuração.

**Arquitetura:** o JWT carrega o claim `base` e fica na memória do BFF (Next); as chamadas do DRE passam a atravessar o BFF, que anexa o token, e a API passa a exigir `[Authorize]`. Um `RegistroDeBases` (singleton, vindo da configuração) é a lista fechada de bases; um `IBaseAtual` (por requisição) lê o claim; a fábrica de conexão abre a conexão da base certa. As diferenças entre bases são marcadores `@@…@@` no SQL, trocados por `RegrasDaBase.Aplicar` antes de a consulta ir ao Oracle.

**Stack:** .NET 10 / ODP.NET / Dapper · Next 16 (route handlers com `node:http`) · React Query. **Nenhuma biblioteca nova** — o projeto não tem projeto de teste .NET e xUnit exigiria aprovação, então os testes são scripts `.mjs` e um programa C# de arquivo único (`dotnet run arquivo.cs`).

**Spec:** [docs/plataforma/BIFURCACAO_DE_BASES.md](../../plataforma/BIFURCACAO_DE_BASES.md) — leia antes de começar, em especial a §4.1.

**Branch:** `feat/bifurcacao-de-bases`. **Nada disto sobe antes de testado de ponta a ponta.**

## Global Constraints

Valem para toda tarefa. Cópia fiel das regras do projeto e da spec:

- **Português** em código, comentário, documentação e conversa, com acentuação correta. Mensagem de commit em português **sem acentos**, no estilo dos commits anteriores (assunto curto, corpo explicando o porquê), terminando com a linha `Co-Authored-By` que a sessão indicar.
- **Nunca conectar no Oracle.** Quando precisar inspecionar o banco, escreva a query e entregue ao Gabriel. Passos marcados **[Gabriel]** exigem login, credencial ou banco: **entregue-os e espere o resultado colado de volta** — não os execute.
- **Binds posicionais** (`BindByName = false`): a ordem dos parâmetros tem de bater com a ordem dos `:placeholders`. Nenhum marcador `@@…@@` pode conter `:`.
- **Biblioteca nova só com consulta ao Gabriel.** Nenhuma é necessária aqui. Em especial: **não instale `undici`** (por isso o proxy usa `node:http`).
- **Nunca logar** senha, token, string de conexão ou dado sensível. Credenciais só em `ConnectionStrings` (ignorado pelo git) ou variável de ambiente.
- **Nunca alterar tabela legada do Winthor.** Este plano não toca no banco.
- **`<ControlesDeExibicao />` em toda tela** e todo efeito visual tem de existir nos **dois temas**. Meça, não olhe.
- **A Época não muda:** a cada commit, o SQL da Época é idêntico ao de hoje e os números são os mesmos. O `dc86` é a prova de texto; o `dc64` (45/45) e o `dc34` são a prova numérica.
- **Base nunca por omissão:** nenhuma consulta roda sem base, nenhum login aceita base ausente ou inventada, e nenhuma resposta é exibida se vier de outra base que a da sessão.
- **Falha de infraestrutura nunca vira "senha incorreta".**
- `docs/` só é atualizado junto com a mudança, não depois.
- **Linguagem do TypeScript:** `strict` com `noUncheckedIndexedAccess`. Comentário explica o **porquê**, não o quê.

## Review Focus

Cinco entradas que a spec implica, nenhuma tarefa exercitaria por acaso e que mais provavelmente atingem quem usa. Cada linha tem o teste que a fixa na tarefa dona do código.

1. **Token emitido antes da mudança (sem claim `base`), ou com base que saiu da configuração.** Esperado: 401 com *"Sua sessão é anterior a esta atualização. Entre de novo."* **e** o BFF encerra a sessão em memória — senão o navegador fica com cookie vivo e sessão morta. → Task 5 (`bf2`), Task 2 (`dc87`).
2. **A mesma matrícula em duas bases.** Esperado: cache do React Query, ordem salva e detalhe aberto não se misturam. → Task 11 (`bf3`).
3. **`base` ausente, vazia ou inventada no login.** Esperado: 400, **nunca** cai na Época; `epoca` em minúsculo resolve para `Epoca`. → Task 5 (`bf2`).
4. **Banco da base fora do ar.** Esperado: 503 *"A base X não respondeu"*, e o BFF repassa o 503 em vez de transformá-lo em "senha incorreta". → Task 5 (`bf2`).
5. **Apuração longa e navegador que desiste.** Esperado: o proxy entrega o fluxo sem teto de 300 s e, se o navegador cancela, destrói a requisição à API (o Oracle para de trabalhar). → Task 2 (`dc87`).

## Estrutura de arquivos

**Criar — back-end** (`api-new-kpi/`)

| Arquivo | Responsabilidade |
|---|---|
| `Domain/Entities/RegrasDaBase.cs` | o que muda entre bases; `Aplicar(sql)` troca os marcadores |
| `Domain/Entities/BaseConfigurada.cs` | uma base: id, rótulo, string de conexão (nunca impressa), regras |
| `Application/Common/Bases/OpcaoDeBase.cs` | forma da seção `Bases` no `appsettings` |
| `Application/Common/Bases/RegistroDeBases.cs` | a lista fechada de bases, validada no boot |
| `Application/Common/Bases/BaseDto.cs` | `{ id, rotulo }` que a tela vê |
| `Application/Common/Bases/IBaseAtual.cs` | a base da requisição, lida do claim do token |
| `Application/Common/Bases/BaseIndisponivelException.cs` | o banco da base não respondeu |

**Criar — front** (`client-new-kpi/`)

| Arquivo | Responsabilidade |
|---|---|
| `lib/servidor/urlDaApi.ts` | onde a API está, do ponto de vista do Next |
| `lib/servidor/repassarParaApi.ts` | o proxy: `node:http`, fluxo, abort |
| `app/api/[...caminho]/route.ts` | o BFF das rotas do DRE |
| `app/api/bases/route.ts` | as bases do seletor do login |
| `lib/baseInicial.ts` · `lib/baseDaResposta.ts` · `lib/chavesPorBase.ts` | funções puras e testáveis |

**Criar — validação**

| Arquivo | O que prova |
|---|---|
| `docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs` | o SQL da Época não mudou |
| `…/dc87_proxy_do_bff.mjs` | o proxy repassa, transmite em fluxo e cancela |
| `…/dc88_autenticar_para_scripts.mjs` + `_autenticar.mjs` | os 21 scripts antigos seguem rodando com token |
| `docs/plataforma/validacao/verificar_regras.cs` | `Aplicar` vale o que a Época tinha (C# real) |
| `…/bf1_registro_de_bases.mjs` · `bf2_login_por_base.mjs` · `bf3_front_por_base.mjs` | registro, login, front |

**Modificar:** `Controllers/AutenticacaoController.cs`, `HealthController.cs`, `DreGerencialController.cs`, `Middleware/GlobalExceptionMiddleware.cs`, `Configurations/{Persistence,Autenticacao}Configuration.cs`, `Application/Features/Autenticacao/*`, `Domain/Interfaces/IAutenticacaoRepository.cs`, `Infrastructure/Persistence/Context/*`, `Infrastructure/Persistence/Repositories/*`, `Infrastructure/Persistence/Queries/*`, `appsettings*.json`; no front `services/apiClient.ts`, `lib/servidor/sessoes.ts`, `app/api/sessao/route.ts`, `app/login/FormularioDeLogin.tsx`, `hooks/useSessao.ts`, `hooks/useDreGerencial.ts`, `hooks/useOrdemSalva.ts`, `components/layout/MenuDoUsuario.tsx`, `app/dre-gerencial/page.tsx`, `lib/exportarExcel.ts`.

## Como rodar este plano

- Todo comando é na **raiz do repositório**, salvo indicação.
- `api-new-kpi`: `dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/kpi-build/"` compila **sem** esbarrar na API que o Gabriel deixa rodando (o `apphost.exe` fica travado e o build normal falha com `MSB3027`).
- `client-new-kpi`: `npx tsc --noEmit` dentro da pasta.
- Scripts de validação do front: `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs <script>`.

---

### Task 1: A rede de segurança do SQL (`dc86`)

Antes de mexer em qualquer consulta, o script que garante que a Época não muda. Ele já passa hoje (não há marcador nenhum) e só ganha dentes nas Tasks 7 a 9.

**Files:**
- Create: `docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs`

**Interfaces:**
- Produces: `COMMIT_BASE = cb4ad694ee01ccf4a53436cb3fb489932e889d6f` (último commit que tocou em `Queries/` antes da bifurcação) e a tabela `EPOCA` de marcador → texto que o literal original tinha. As Tasks 7, 8 e 9 dependem de **estes cinco nomes de marcador, exatamente**:
  `@@SECAO_SEM_CUSTO@@`, `@@FILIAIS_FORA_DO_FILTRO@@`, `@@FILIAIS_FORA_DA_PERMISSAO@@`, `@@RATEIO_RC@@`, `@@CODCONTA_LANC@@`.

- [ ] **Step 1: Escrever o script**

```js
/**
 * dc86 — as consultas da Época continuam IDÊNTICAS, byte a byte, depois que os literais
 * que variam por base viram marcadores `@@…@@`.
 *
 *   node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs
 *
 * Não toca no banco. O que prova, em ordem:
 *
 *   1. Trocando cada marcador pelo que o literal valia na Época, o texto de cada arquivo de
 *      consultas volta a ser o que estava em `COMMIT_BASE` — o último commit antes da
 *      bifurcação. É a prova de TEXTO de que "a Época não mudou".
 *   2. Todo marcador que aparece num arquivo é conhecido desta tabela. Um marcador novo sem
 *      linha aqui é um literal que alguém trocou sem dizer o que a Época tinha.
 *   3. Não sobrou `1601` nem `1401` fora de comentário. Se sobrou, é um literal esquecido:
 *      a base errada leria a seção errada, em silêncio. <b>Só vale depois da Task 7</b>: até lá
 *      os oito `1601` ainda estão nas consultas, e é correto que estejam.
 *   4. (quando `RegrasDaBase.cs` existe) o C# REAL — o `Aplicar`, lido da configuração
 *      real — expande cada marcador para o mesmo texto desta tabela. É o que liga a prova
 *      de texto ao código que de fato roda.
 *   5. (quando o repositório já tem `Final(`) toda `CommandDefinition` passa por `Final`.
 *
 * O texto é comparado com fim de linha normalizado (LF): o git do Windows converte, e isso
 * não é diferença de SQL.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COMMIT_BASE = "cb4ad694ee01ccf4a53436cb3fb489932e889d6f";
const DIR = "api-new-kpi/Infrastructure/Persistence/Queries";
const ARQUIVOS = ["DreGerencialQueries.cs", "DreDetalheQueries.cs", "AutenticacaoQueries.cs"];
const REGRAS_CS = "api-new-kpi/Domain/Entities/RegrasDaBase.cs";
const REPOSITORIO = "api-new-kpi/Infrastructure/Persistence/Repositories/DreGerencialRepository.cs";
const HARNESS = "docs/plataforma/validacao/verificar_regras.cs";

/** A Task 7 troca esta constante para `true`: dali em diante, `1601`/`1401` literal é erro. */
const SECAO_JA_MIGRADA = false;

/** O que cada marcador vale PARA A ÉPOCA: o texto que o literal original tinha. */
const EPOCA = new Map([
  ["@@SECAO_SEM_CUSTO@@", "1601"],
  ["@@FILIAIS_FORA_DO_FILTRO@@", "AND F.CODFIL NOT IN ('20','31','35','91')"],
  ["@@FILIAIS_FORA_DA_PERMISSAO@@", "AND CODIGOA NOT IN (2, 99)"],
  ["@@RATEIO_RC@@", "PCRATEIOCENTROCUSTO"],
  ["@@CODCONTA_LANC@@", "codconta"],
]);

let n = 0;
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};
const eq = (achou, esperado, oque) => {
  n++;
  assert.equal(
    achou,
    esperado,
    `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`,
  );
};

const lf = (texto) => texto.replace(/\r\n/g, "\n");

// `DC86_REPO` aponta o `git` para o repositório real quando o script roda contra uma CÓPIA
// da árvore (útil para ensaiar uma mudança sem tocar no repositório). Sem ele, é o atual.
const baseline = (arquivo) =>
  lf(
    execFileSync(
      "git",
      ["-C", process.env.DC86_REPO ?? ".", "show", `${COMMIT_BASE}:${DIR}/${arquivo}`],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    ),
  );
const atual = (arquivo) => lf(fs.readFileSync(path.join(DIR, arquivo), "utf8"));

function expandir(texto) {
  let saida = texto;
  for (const [marcador, valor] of EPOCA) saida = saida.split(marcador).join(valor);
  return saida;
}

// Tira comentário de C# (barra dupla) e de SQL (traço duplo e bloco barra-asterisco): é onde o
// 1601 aparece em prosa. Fica em `//` porque o fecho de um bloco, dentro de um bloco, o encerra.
function semComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/\/\/[^\n]*/g, "");
}

for (const arquivo of ARQUIVOS) {
  const texto = atual(arquivo);

  // 1 — a Época volta a ser o que era.
  eq(expandir(texto), baseline(arquivo), `${arquivo}: expandido com a Época, igual ao commit-base`);

  // 2 — nenhum marcador desconhecido.
  const achados = new Set(texto.match(/@@[A-Z_]+@@/g) ?? []);
  for (const marcador of achados) {
    ok(EPOCA.has(marcador), `${arquivo}: marcador ${marcador} não está na tabela da Época`);
  }

  // 3 — nenhum literal esquecido (depois da Task 7).
  if (SECAO_JA_MIGRADA) {
    const sobras = semComentarios(texto).match(/\b(1601|1401)\b/g) ?? [];
    eq(sobras.length, 0, `${arquivo}: literais 1601/1401 fora de comentário`);
  }
}

// 4 — o C# real concorda com a tabela.
if (fs.existsSync(REGRAS_CS) && fs.existsSync(HARNESS)) {
  const saida = path.join(os.tmpdir(), "dc86-regras") + path.sep;
  const r = spawnSync("dotnet", ["run", HARNESS, `-p:BaseOutputPath=${saida}`], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  eq(r.status, 0, `o programa verificar_regras.cs rodou\n${r.stdout}\n${r.stderr}`);

  const tabela = JSON.parse(r.stdout.trim().split("\n").at(-1));
  const epoca = tabela.Epoca;
  ok(epoca !== undefined, "a configuração tem a base Epoca");

  for (const [marcador, valor] of Object.entries(epoca)) {
    ok(EPOCA.has(marcador), `C# conhece o marcador ${marcador}, que esta tabela não tem`);
    eq(valor, EPOCA.get(marcador), `Aplicar(${marcador}) na Época`);
  }

  // As expansões LIGADAS (o que o Minas Rural terá depois de medido) não podem carregar `:`
  // nem `@@`: um `:` seria um bind a mais, o bind é POSICIONAL, e errar a contagem não dá
  // erro de compilação — dá ORA-01008 em produção, ou, pior, número errado.
  for (const [marcador, valor] of Object.entries(tabela._ligado ?? {})) {
    ok(!valor.includes(":"), `expansão ligada de ${marcador} tem ':' (bind posicional)`);
    ok(!valor.includes("@@"), `expansão ligada de ${marcador} ainda tem marcador`);
  }

  // Todo marcador usado nas consultas precisa ser conhecido pelo C#.
  for (const arquivo of ARQUIVOS) {
    for (const marcador of new Set(atual(arquivo).match(/@@[A-Z_]+@@/g) ?? [])) {
      ok(marcador in epoca, `${arquivo} usa ${marcador}, que o Aplicar do C# não expande`);
    }
  }
}

// 5 — toda consulta do repositório passa por `Final(`.
if (fs.existsSync(REPOSITORIO) && lf(fs.readFileSync(REPOSITORIO, "utf8")).includes("private string Final(")) {
  const fonte = lf(fs.readFileSync(REPOSITORIO, "utf8"));
  const todas = [...fonte.matchAll(/new CommandDefinition\(\s*(Final\()?/g)];
  const semFinal = todas.filter((m) => m[1] === undefined).length;
  ok(todas.length > 0, "o repositório tem CommandDefinition");
  eq(semFinal, 0, `CommandDefinition sem Final(…): ${semFinal} de ${todas.length}`);
}

console.log(`dc86 — ${n} conferências, todas passaram.`);
```

- [ ] **Step 2: Rodar**

Run: `node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs`
Expected: `dc86 — 3 conferências, todas passaram.` (uma por arquivo: o texto é idêntico ao do commit-base. As conferências 3, 4 e 5 ainda não se aplicam.)

- [ ] **Step 3: Mostrar que ele morde**

Run (e depois desfaça): `sed -i 's/<> 1601/<> 1602/' api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs && node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs; git checkout api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs`
Expected: falha em `DreGerencialQueries.cs: expandido com a Época, igual ao commit-base`. Se não falhar, o script não está comparando nada.

- [ ] **Step 4: Commit**

```bash
git add docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs
git commit -m "test(dre): dc86 -- o SQL da Epoca tem de ficar identico depois dos marcadores"
```

---

### Task 2: O proxy do BFF (ainda sem ninguém usando)

O navegador não tem o token; o BFF tem. Este é o proxy que anexa o JWT da sessão às chamadas do DRE. **Nesta tarefa ele só passa a existir** — o front continua falando direto com a API, então nada quebra.

**Files:**
- Create: `client-new-kpi/lib/servidor/urlDaApi.ts`
- Create: `client-new-kpi/lib/servidor/repassarParaApi.ts`
- Create: `client-new-kpi/app/api/[...caminho]/route.ts`
- Create: `docs/rotinas/9815-dre-gerencial/validacao/dc87_proxy_do_bff.mjs`

**Interfaces:**
- Produces: `URL_DA_API: URL` e `enderecoDaApi(caminho: string): string` (em `urlDaApi.ts`); `repassarParaApi(requisicao: Request, api: URL, caminhoComConsulta: string, token: string | null): Promise<Response>` (em `repassarParaApi.ts`). A Task 6 usa `urlDaApi.ts` no login e nas bases.

- [ ] **Step 1: Escrever o teste que falha (`dc87`)**

```js
/**
 * dc87 — o proxy do BFF: repassa com o token, transmite em fluxo, cancela, não tem teto.
 *
 *   node --experimental-strip-types docs/rotinas/9815-dre-gerencial/validacao/dc87_proxy_do_bff.mjs
 *
 * Sobe uma "API" de mentira em porta livre e chama `repassarParaApi` de verdade. Não toca no
 * banco nem no navegador, e não precisa de credencial.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { repassarParaApi } from "../../../../client-new-kpi/lib/servidor/repassarParaApi.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(
    achou,
    esperado,
    `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`,
  );
};
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Uma API de mentira: guarda o que viu e responde como o teste mandar. */
function subirApi(responder) {
  return new Promise((resolve) => {
    const vistas = [];
    const fechadas = [];
    const servidor = http.createServer((req, res) => {
      const pedacos = [];
      req.on("data", (c) => pedacos.push(c));
      req.on("close", () => fechadas.push(req.url));
      req.on("end", () => {
        const vista = {
          metodo: req.method,
          url: req.url,
          cab: req.headers,
          corpo: Buffer.concat(pedacos).toString(),
        };
        vistas.push(vista);
        responder(req, res, vista);
      });
    });
    servidor.listen(0, "127.0.0.1", () => {
      resolve({
        vistas,
        fechadas,
        url: new URL(`http://127.0.0.1:${servidor.address().port}`),
        parar: () => {
          servidor.closeAllConnections?.();
          servidor.close();
        },
      });
    });
  });
}

const pedido = (url, init = {}) => new Request(`http://bff.local${url}`, init);

// ── 1. repassa método, caminho, consulta, corpo, token e a pedir SEM compressão ──────────
{
  const api = await subirApi((_req, res) => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ sucesso: true }));
  });
  const r = await repassarParaApi(
    pedido("/api/dre-gerencial/apuracao?x=1", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "content-type": "application/json" },
    }),
    api.url,
    "/api/dre-gerencial/apuracao?x=1",
    "TOKEN-DE-TESTE",
  );
  const v = api.vistas[0];
  eq(v.metodo, "POST", "o método segue");
  eq(v.url, "/api/dre-gerencial/apuracao?x=1", "caminho e consulta seguem");
  eq(v.cab.authorization, "Bearer TOKEN-DE-TESTE", "o JWT da sessão é anexado");
  eq(v.cab["accept-encoding"], "identity", "pede sem compressão: o Next recomprime pra fora");
  eq(v.corpo, '{"a":1}', "o corpo segue");
  eq(v.cab["content-type"], "application/json", "o content-type segue");
  eq(r.status, 200, "o status volta");
  eq(await r.json(), { sucesso: true }, "o corpo volta");
  api.parar();
}

// ── 2. sem token, sem Authorization (a rota de saúde é anônima) ─────────────────────────
{
  const api = await subirApi((_req, res) => res.end("{}"));
  await repassarParaApi(pedido("/api/health"), api.url, "/api/health", null);
  eq(api.vistas[0].cab.authorization, undefined, "sem sessão não inventa Authorization");
  eq(api.vistas[0].metodo, "GET", "GET segue como GET");
  eq(api.vistas[0].corpo, "", "GET não leva corpo");
  api.parar();
}

// ── 3. o status da API é o status do proxy — 401 não vira 200 nem 500 ───────────────────
{
  const api = await subirApi((_req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end('{"sucesso":false}');
  });
  const r = await repassarParaApi(pedido("/api/dre-gerencial/x"), api.url, "/api/dre-gerencial/x", "T");
  eq(r.status, 401, "401 da API continua 401");
  api.parar();
}

// ── 4. TRANSMITE EM FLUXO: o primeiro pedaço chega ANTES de a API terminar ───────────────
{
  const api = await subirApi((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.write("a");
    setTimeout(() => res.end("b"), 800);
  });
  const t0 = Date.now();
  const r = await repassarParaApi(pedido("/api/dre-gerencial/x"), api.url, "/api/dre-gerencial/x", "T");
  const leitor = r.body.getReader();
  const primeiro = await leitor.read();
  const ate = Date.now() - t0;
  eq(new TextDecoder().decode(primeiro.value), "a", "o primeiro pedaço é o 'a'");
  ok(ate < 500, `o primeiro pedaço chegou em ${ate} ms — antes de a API terminar (800 ms)`);
  const segundo = await leitor.read();
  eq(new TextDecoder().decode(segundo.value), "b", "e o resto vem depois");
  api.parar();
}

// ── 5. O NAVEGADOR DESISTE → a requisição à API é destruída (o Oracle para de trabalhar) ─
{
  const api = await subirApi(() => {
    /* nunca responde: uma apuração de minutos */
  });
  const cancelar = new AbortController();
  const chamada = repassarParaApi(
    pedido("/api/dre-gerencial/apuracao", { method: "POST", body: "{}", signal: cancelar.signal }),
    api.url,
    "/api/dre-gerencial/apuracao",
    "T",
  );
  await dormir(200);
  eq(api.vistas.length, 1, "a API recebeu a requisição");
  cancelar.abort();
  await dormir(500);
  eq(api.fechadas.length, 1, "o cancelamento fechou a conexão com a API");
  await chamada; // não pode ficar pendurada
  api.parar();
}

// ── 6. API fora do ar → 502 com a mensagem certa, e não um erro não tratado ─────────────
{
  const morta = new URL("http://127.0.0.1:1"); // porta 1: ninguém escuta
  const r = await repassarParaApi(pedido("/api/dre-gerencial/x"), morta, "/api/dre-gerencial/x", "T");
  eq(r.status, 502, "API fora do ar vira 502");
  const corpo = await r.json();
  eq(corpo.sucesso, false, "o envelope diz que falhou");
  ok(/Não foi possível falar com o servidor/.test(corpo.mensagem), "a mensagem é a do BFF");
}

// ── 7. NÃO HÁ TETO DE TEMPO: uma apuração leva até 407 s e o fetch do Node corta em 300 s ─
{
  const fonte = fs.readFileSync("client-new-kpi/lib/servidor/repassarParaApi.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  ok(!/\btimeout\b/i.test(codigo), "repassarParaApi não define timeout");
  ok(!/\bfetch\s*\(/.test(codigo), "repassarParaApi não usa fetch — o headersTimeout dele é de 300 s");
  ok(/node:http/.test(codigo), "usa node:http");
}

console.log(`dc87 — ${n} conferências, todas passaram.`);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-strip-types docs/rotinas/9815-dre-gerencial/validacao/dc87_proxy_do_bff.mjs`
Expected: FAIL — `Cannot find module …/lib/servidor/repassarParaApi.ts`.

- [ ] **Step 3: `urlDaApi.ts`**

```ts
/**
 * Onde a API .NET está, do ponto de vista DESTE processo (o servidor Next).
 *
 * <b>Não é o endereço que o navegador usa.</b> O navegador não fala mais com a API: tudo
 * passa pelo BFF. Em container, os dois vivem na mesma rede, e `http://api:8080` é direto e
 * não depende de IP ou de o host deixar o container sair e voltar.
 *
 * A ordem dos fallbacks cobre os três ambientes sem ninguém configurar nada a mais:
 * `API_URL_INTERNA` em container, `NEXT_PUBLIC_API_URL` quando só ela existe (como era até a
 * bifurcação de bases), e o localhost do desenvolvimento.
 */
export const URL_DA_API = new URL(
  process.env.API_URL_INTERNA ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5207",
);

/** O endereço completo de um caminho da API, para o `fetch` dos route handlers. */
export function enderecoDaApi(caminho: string): string {
  return new URL(caminho, URL_DA_API).toString();
}
```

- [ ] **Step 4: `repassarParaApi.ts`**

```ts
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

/**
 * Repassa uma requisição do navegador para a API .NET, anexando o JWT da sessão.
 *
 * <b>Por que `node:http`, e não `fetch`.</b> Uma apuração leva até 407 s (dc19), e o `fetch`
 * do Node corta a resposta em 300 s (`headersTimeout`) — teto que só se altera instalando o
 * pacote `undici`, biblioteca nova que exige aprovação. `node:http` vem com o Node, não tem
 * esse teto e entrega a resposta em fluxo, sem guardá-la inteira na memória: o primeiro
 * pedaço chega ao navegador antes de a API terminar. <b>Não ponha `timeout` aqui</b>: o
 * `dc87` falha se puser.
 *
 * <b>`accept-encoding: identity` na ida.</b> A API comprime a resposta; o Node descomprime ao
 * ler e o cabeçalho `content-encoding` continuaria dizendo que há compressão — o navegador
 * receberia lixo. Entre o Next e a API, na mesma rede, comprimir só gasta CPU, e o Next
 * recomprime para fora.
 *
 * <b>Cancelamento.</b> Se o navegador desiste (fecha a aba, recarrega), o `signal` da
 * requisição dispara e a conexão com a API é destruída. A API vê a desistência
 * (`RequestAborted`) e cancela o comando Oracle: sem isto, a consulta de minutos continuaria
 * rodando no banco para ninguém.
 */
const CABECALHOS_DA_RESPOSTA = ["content-type", "cache-control", "content-disposition"] as const;

export function repassarParaApi(
  requisicao: Request,
  api: URL,
  caminhoComConsulta: string,
  token: string | null,
): Promise<Response> {
  return new Promise<Response>((resolve) => {
    const cliente = api.protocol === "https:" ? https : http;

    const cabecalhos: http.OutgoingHttpHeaders = {
      accept: "application/json",
      "accept-encoding": "identity",
    };
    const tipo = requisicao.headers.get("content-type");
    if (tipo) cabecalhos["content-type"] = tipo;
    // O token é do servidor: nunca vem do navegador e nunca volta para ele.
    if (token) cabecalhos.authorization = `Bearer ${token}`;

    const saida = cliente.request(
      {
        hostname: api.hostname,
        port: api.port || undefined,
        method: requisicao.method,
        path: caminhoComConsulta,
        headers: cabecalhos,
      },
      (entrada) => {
        const resposta = new Headers();
        for (const nome of CABECALHOS_DA_RESPOSTA) {
          const valor = entrada.headers[nome];
          if (typeof valor === "string") resposta.set(nome, valor);
        }

        const status = entrada.statusCode ?? 502;
        // 204 e 304 não admitem corpo: dar um a `Response` lança.
        const semCorpo = status === 204 || status === 304;

        resolve(
          new Response(
            semCorpo ? null : (Readable.toWeb(entrada) as unknown as ReadableStream<Uint8Array>),
            { status, headers: resposta },
          ),
        );
      },
    );

    saida.on("error", () => {
      // Depois do `resolve` de cima isto é no-op — o corpo já está a caminho e quem lê vê o
      // fluxo terminar com erro. Antes dele, é "a API não respondeu".
      resolve(
        Response.json(
          { sucesso: false, mensagem: "Não foi possível falar com o servidor. Tente de novo." },
          { status: 502 },
        ),
      );
    });

    requisicao.signal.addEventListener("abort", () => saida.destroy(), { once: true });

    if (requisicao.method === "GET" || requisicao.method === "HEAD") {
      saida.end();
      return;
    }

    requisicao.arrayBuffer().then(
      (corpo) => saida.end(Buffer.from(corpo)),
      () => saida.destroy(),
    );
  });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --experimental-strip-types docs/rotinas/9815-dre-gerencial/validacao/dc87_proxy_do_bff.mjs`
Expected: `dc87 — 23 conferências, todas passaram.`

- [ ] **Step 6: O route handler**

```ts
// client-new-kpi/app/api/[...caminho]/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { repassarParaApi } from "@/lib/servidor/repassarParaApi";
import { NOME_DO_COOKIE, encerrarSessao, lerSessao } from "@/lib/servidor/sessoes";
import { URL_DA_API } from "@/lib/servidor/urlDaApi";

/**
 * O BFF das rotas do DRE: o navegador chama `/api/dre-gerencial/...` aqui, e este arquivo
 * repassa à API .NET com o JWT da sessão.
 *
 * <b>Só repassa `dre-gerencial` e `health`.</b> `/api/auth/*` NÃO passa: o navegador não pode
 * chamar o login da API pulando o freio de tentativas de `app/api/sessao/route.ts`, e
 * `/api/bases` e `/api/sessao` têm arquivo próprio (rota estática vence a coringa).
 *
 * <b>401 da API encerra a sessão em memória.</b> Token sem o claim `base`, expirado, ou de
 * uma base que saiu da configuração: se a sessão ficasse, o navegador teria cookie vivo e
 * sessão morta, e cada tela daria 401 sem nunca mandar a pessoa entrar de novo.
 */
export const dynamic = "force-dynamic";

const REPASSADOS = new Set(["dre-gerencial", "health"]);

type Contexto = { params: Promise<{ caminho: string[] }> };

async function repassar(requisicao: Request, { params }: Contexto) {
  const { caminho } = await params;
  const primeiro = caminho[0] ?? "";

  if (!REPASSADOS.has(primeiro)) {
    return NextResponse.json({ sucesso: false, mensagem: "Rota inexistente." }, { status: 404 });
  }

  const cookieStore = await cookies();
  const id = cookieStore.get(NOME_DO_COOKIE)?.value;
  const sessao = lerSessao(id);

  // `health` é anônimo na API e serve para diagnosticar; o resto exige sessão.
  if (!sessao && primeiro !== "health") {
    return NextResponse.json(
      { sucesso: false, mensagem: "Sessão expirada ou ausente. Entre novamente." },
      { status: 401 },
    );
  }

  const consulta = new URL(requisicao.url).search;
  const resposta = await repassarParaApi(
    requisicao,
    URL_DA_API,
    `/api/${caminho.map(encodeURIComponent).join("/")}${consulta}`,
    sessao?.token ?? null,
  );

  if (resposta.status === 401 && sessao) {
    encerrarSessao(id);
    cookieStore.delete(NOME_DO_COOKIE);
  }

  return resposta;
}

export { repassar as GET, repassar as POST };
```

- [ ] **Step 7: Tipos e compilação**

Run: `cd client-new-kpi && npx tsc --noEmit`
Expected: sem saída (limpo).

- [ ] **Step 8: Verificar o roteamento com o front no ar (sem credencial)**

Com o front em `:3000` e a API em `:5207`:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/dre-gerencial/filiais`
Expected: `401` (sem cookie de sessão).

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/login`
Expected: `404` — o login da API **não** é alcançável pelo proxy.

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/qualquercoisa`
Expected: `404`.

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health`
Expected: `200` com a API no ar (ou `502` com ela fora — nunca `404`).

- [ ] **Step 9: Commit**

```bash
git add client-new-kpi/lib/servidor/urlDaApi.ts client-new-kpi/lib/servidor/repassarParaApi.ts "client-new-kpi/app/api/[...caminho]/route.ts" docs/rotinas/9815-dre-gerencial/validacao/dc87_proxy_do_bff.mjs
git commit -m "feat(bff): proxy das rotas do DRE, que anexa o JWT da sessao"
```

---

### Task 3: Fechar as rotas do DRE

Liga o `[Authorize]` na API e passa o front a falar com a própria origem. **A partir daqui sem token não há apuração.** Os 21 scripts de validação que chamam a API direto passam a carregar token por um módulo `--import`.

**Files:**
- Modify: `api-new-kpi/Controllers/DreGerencialController.cs` (a classe)
- Modify: `client-new-kpi/services/apiClient.ts` (a função `request`)
- Create: `docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs`
- Create: `docs/rotinas/9815-dre-gerencial/validacao/dc88_autenticar_para_scripts.mjs`

**Interfaces:**
- Consumes: `app/api/[...caminho]/route.ts` (Task 2).
- Produces: `_autenticar.mjs` — módulo para `node --import` que anexa `Authorization: Bearer …` a todo `fetch` para `process.env.API ?? "http://localhost:5207"`, logando uma vez com `KPI_LOGIN`, `KPI_SENHA` e `KPI_BASE` (padrão `Epoca`).

- [ ] **Step 1: O teste do módulo de autenticação dos scripts (`dc88`)**

```js
/**
 * dc88 — `_autenticar.mjs`: os scripts de validação que chamam a API direto seguem rodando
 * depois do [Authorize], sem editar nenhum deles.
 *
 *   node docs/rotinas/9815-dre-gerencial/validacao/dc88_autenticar_para_scripts.mjs
 *
 * Usa uma API de mentira, sem credencial real. Roda `node --import _autenticar.mjs` num
 * script-filho que faz `fetch` como os dc34/dc64 fazem.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

const vistas = [];
const servidor = http.createServer((req, res) => {
  const pedacos = [];
  req.on("data", (c) => pedacos.push(c));
  req.on("end", () => {
    vistas.push({ url: req.url, auth: req.headers.authorization, corpo: Buffer.concat(pedacos).toString() });
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url === "/api/auth/login") {
      res.end(JSON.stringify({ sucesso: true, dados: { token: "TOKEN-SIMULADO" } }));
    } else {
      res.end(JSON.stringify({ sucesso: true }));
    }
  });
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const API = `http://127.0.0.1:${servidor.address().port}`;

const filho = path.join(os.tmpdir(), "dc88-filho.mjs");
fs.writeFileSync(
  filho,
  `await fetch(process.env.API + "/api/dre-gerencial/apuracao", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
   await fetch(process.env.API + "/api/dre-gerencial/filiais");`,
);

// No Windows o `--import` com caminho ABSOLUTO exige URL `file://`; com `./relativo`, não.
const autenticar = pathToFileURL(
  path.resolve("docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs"),
).href;
// ASSÍNCRONO DE PROPÓSITO. A API de mentira roda NESTE processo: com `spawnSync` o pai
// ficaria bloqueado esperando o filho, e o filho esperando o pai responder — um impasse.
const rodar = (env) =>
  new Promise((resolve) => {
    const proc = spawn("node", ["--import", autenticar, filho], {
      env: { ...process.env, API, ...env },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (status) => resolve({ status, stdout, stderr }));
  });

// 1. com credencial: faz UM login e anexa o token nas duas chamadas
const com = await rodar({ KPI_LOGIN: "fulano", KPI_SENHA: "segredo", KPI_BASE: "MinasRural" });
eq(com.status, 0, `o script-filho rodou\n${com.stderr}`);
const login = vistas.filter((v) => v.url === "/api/auth/login");
eq(login.length, 1, "um login só, mesmo com duas chamadas");
eq(JSON.parse(login[0].corpo), { login: "fulano", senha: "segredo", base: "MinasRural" }, "o login leva a base escolhida");
const chamadas = vistas.filter((v) => v.url.startsWith("/api/dre-gerencial"));
eq(chamadas.map((v) => v.auth), ["Bearer TOKEN-SIMULADO", "Bearer TOKEN-SIMULADO"], "as duas chamadas levam o token");

// 2. base padrão é a Época
vistas.length = 0;
await rodar({ KPI_LOGIN: "fulano", KPI_SENHA: "segredo" });
eq(JSON.parse(vistas.find((v) => v.url === "/api/auth/login").corpo).base, "Epoca", "KPI_BASE ausente = Epoca");

// 3. sem credencial: falha ALTO, dizendo o que definir — nunca segue sem token
vistas.length = 0;
const sem = await rodar({ KPI_LOGIN: "", KPI_SENHA: "" });
eq(sem.status !== 0, true, "sem credencial o script-filho falha");
eq(/KPI_LOGIN/.test(sem.stderr) && /KPI_SENHA/.test(sem.stderr), true, "a mensagem diz quais variáveis definir");
eq(vistas.length, 0, "e não chega a bater na API");

// 4. nunca imprime a senha
eq(com.stdout.includes("segredo") || com.stderr.includes("segredo"), false, "a senha não aparece na saída");

servidor.close();
console.log(`dc88 — ${n} conferências, todas passaram.`);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node docs/rotinas/9815-dre-gerencial/validacao/dc88_autenticar_para_scripts.mjs`
Expected: FAIL — o filho não encontra `_autenticar.mjs`.

- [ ] **Step 3: `_autenticar.mjs`**

```js
/**
 * Anexa o token a todo `fetch` para a API — para os scripts de validação que chamam a API
 * direto continuarem rodando depois que as rotas do DRE passaram a exigir `[Authorize]`.
 *
 *   KPI_LOGIN=… KPI_SENHA=… [KPI_BASE=Epoca|MinasRural] \
 *     node --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs <script>
 *
 * Funciona por `--import`, e não por edição, porque são 21 scripts que montam o `fetch` cada
 * um do seu jeito — e editar 21 arquivos para acrescentar um cabeçalho é o tipo de mudança
 * em que um deles fica para trás sem ninguém notar.
 *
 * <b>A credencial vem de variável de ambiente, nunca de argumento nem de arquivo</b>, e
 * nunca é impressa. A base é a que a sessão de teste usará: `KPI_BASE`, padrão `Epoca`.
 *
 * Falha ALTO sem credencial: seguir sem token daria 401 em cada chamada e um relatório de
 * "divergência" que é só falta de login.
 */
const API = process.env.API ?? "http://localhost:5207";
const original = globalThis.fetch;
let token = null;

async function obterToken() {
  if (token) return token;

  const login = process.env.KPI_LOGIN;
  const senha = process.env.KPI_SENHA;
  if (!login || !senha) {
    throw new Error(
      "Defina KPI_LOGIN e KPI_SENHA (e, se for o Minas Rural, KPI_BASE=MinasRural) para o " +
        "script falar com a API: as rotas do DRE agora exigem sessão.",
    );
  }

  const r = await original(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, senha, base: process.env.KPI_BASE ?? "Epoca" }),
  });
  const corpo = await r.json().catch(() => null);

  if (!r.ok || !corpo?.dados?.token) {
    throw new Error(`Login recusado pela API (${r.status}): ${corpo?.mensagem ?? "sem mensagem"}`);
  }

  token = corpo.dados.token;
  return token;
}

globalThis.fetch = async (entrada, init = {}) => {
  const url = typeof entrada === "string" ? entrada : (entrada.url ?? String(entrada));

  // Só a API, e nunca o próprio login (que é o que obtém o token).
  if (!url.startsWith(API) || url.startsWith(`${API}/api/auth/login`)) {
    return original(entrada, init);
  }

  const cabecalhos = new Headers(init.headers ?? {});
  cabecalhos.set("Authorization", `Bearer ${await obterToken()}`);
  return original(entrada, { ...init, headers: cabecalhos });
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node docs/rotinas/9815-dre-gerencial/validacao/dc88_autenticar_para_scripts.mjs`
Expected: `dc88 — 9 conferências, todas passaram.`

- [ ] **Step 5: `[Authorize]` no controller**

Em `api-new-kpi/Controllers/DreGerencialController.cs`, acrescente o `using` e o atributo na classe:

```csharp
using Microsoft.AspNetCore.Authorization;
```

```csharp
[ApiController]
[Authorize]
[Route("api/dre-gerencial")]
public sealed class DreGerencialController : ControllerBase
```

(`HealthController` e `AutenticacaoController.Entrar` continuam anônimos: o primeiro não tem atributo e não há `FallbackPolicy`; o segundo tem `[AllowAnonymous]`.)

- [ ] **Step 6: Compilar e provar o 401**

Run: `dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/kpi-build/"`
Expected: `Compilação com êxito. 0 Aviso(s) 0 Erro(s)`.

Com a API no ar (o Gabriel a reinicia; o `dotnet watch` não aplica mudança de atributo de classe de forma confiável — reinicie):

Run: `curl -s -i -X POST http://localhost:5207/api/dre-gerencial/apuracao -H "Content-Type: application/json" -d "{}"`
Expected: `HTTP/1.1 401` e corpo `{"sucesso":false,"mensagem":"Sessão expirada ou ausente. Entre novamente."…}`.

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5207/api/health`
Expected: `200`.

- [ ] **Step 7: `apiClient` na própria origem, e o 401 manda para o login**

Em `client-new-kpi/services/apiClient.ts`, apague a constante `BASE_URL` e troque o início de `request`:

```ts
async function request<T>(caminho: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers, ...resto } = options;

  // MESMA ORIGEM. As chamadas do DRE passam pelo BFF (`app/api/[...caminho]`), que anexa o
  // JWT da sessão — o navegador nunca o tem. `NEXT_PUBLIC_API_URL` deixou de valer aqui: se
  // ainda valesse, uma build com ela definida iria direto à API, sem token, e receberia 401.
  const url = new URL(caminho, "http://origem.local");
  if (params) {
    for (const [chave, valor] of Object.entries(params)) {
      if (valor !== undefined && valor !== null) {
        url.searchParams.set(chave, String(valor));
      }
    }
  }
  const destino = `${url.pathname}${url.search}`;

  let resposta: Response;
  try {
    resposta = await fetch(destino, {
      ...resto,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Dado financeiro nunca sai de cache.
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Não foi possível conectar à API.", 0);
  }

  // SESSÃO MORTA: o BFF já a encerrou. Ficar na tela mostrando "erro 401" não ajuda ninguém;
  // a saída é entrar de novo, e voltar para onde estava (`destinoSeguro` valida o caminho).
  if (
    resposta.status === 401 &&
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/login")
  ) {
    const volta = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?destino=${encodeURIComponent(volta)}`);
  }
```

O restante da função (leitura do envelope e `throw new ApiError`) fica como está.

- [ ] **Step 8: Tipos**

Run: `cd client-new-kpi && npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 9: [Gabriel] Conferir que a Época segue igual, agora por dentro do proxy**

Peça ao Gabriel, com API e front no ar:
1. Entrar com o usuário dele, abrir o DRE e apurar um mês da Época já conhecido.
2. Conferir que o `LUCRO LIQUIDO` é o mesmo de antes (anote o valor da `main` antes).
3. Rodar com o módulo de autenticação (credencial em variável de ambiente, **não** no comando):

```bash
KPI_LOGIN=… KPI_SENHA=… node --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs docs/rotinas/9815-dre-gerencial/validacao/dc64_conta_principal_contra_a_9815.mjs
```
Expected: o `dc64` fecha **45/45**, como em 22/09/2026.

- [ ] **Step 10: Commit**

```bash
git add api-new-kpi/Controllers/DreGerencialController.cs client-new-kpi/services/apiClient.ts docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs docs/rotinas/9815-dre-gerencial/validacao/dc88_autenticar_para_scripts.mjs
git commit -m "feat(dre): as rotas do DRE passam a exigir sessao -- o furo que a documentacao listava"
```

---
### Task 4: O registro de bases

Sem comportamento novo: a lista fechada de bases, lida da configuração e **validada no boot**. Nada a consome ainda.

**Files:**
- Create: `api-new-kpi/Domain/Entities/RegrasDaBase.cs`
- Create: `api-new-kpi/Domain/Entities/BaseConfigurada.cs`
- Create: `api-new-kpi/Application/Common/Bases/OpcaoDeBase.cs`
- Create: `api-new-kpi/Application/Common/Bases/BaseDto.cs`
- Create: `api-new-kpi/Application/Common/Bases/RegistroDeBases.cs`
- Modify: `api-new-kpi/Configurations/PersistenceConfiguration.cs`
- Modify: `api-new-kpi/Program.cs`
- Modify: `api-new-kpi/appsettings.json`, `api-new-kpi/appsettings.example.json`
- Create: `docs/plataforma/validacao/verificar_regras.cs`
- Create: `docs/plataforma/validacao/bf1_registro_de_bases.mjs`

**Interfaces:**
- Produces:
  - `RegrasDaBase` — `int SecaoSemCusto`, `bool AgrupaIcms`, `List<string> FiliaisForaDoFiltro`, `List<int> FiliaisForaDaPermissao`, `void Validar(string baseId)`, `string Aplicar(string sql)`, `static IReadOnlyList<string> Marcadores`.
  - `BaseConfigurada(string id, string rotulo, string connectionString, RegrasDaBase regras)` — `Id`, `Rotulo`, `ConnectionString`, `Regras`; `ToString()` devolve **só o `Id`**.
  - `RegistroDeBases(IConfiguration, ILogger<RegistroDeBases>)` — `IReadOnlyList<BaseConfigurada> Disponiveis`, `BaseConfigurada? Buscar(string? id)` (sem diferenciar maiúscula de minúscula).
  - `BaseDto(string Id, string Rotulo)` e `static BaseDto De(BaseConfigurada)`.

- [ ] **Step 1: `RegrasDaBase.cs`**

```csharp
namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// O que muda de uma base para outra — e nada além disso.
///
/// <para><b>Cada campo corresponde a um literal que estava fixo no código</b>, e a lista só
/// cresce quando um literal novo for achado e medido. Não há campo "por precaução". O
/// Delphi resolve isto com <c>if bBaseMRURAL</c> espalhado pelo fonte; aqui a diferença é
/// um objeto de configuração, e uma terceira base entra sem mexer em consulta.</para>
///
/// <para>As consultas trazem MARCADORES (<c>@@SECAO_SEM_CUSTO@@</c>…), e
/// <see cref="Aplicar"/> os troca antes de a consulta ir ao Oracle. <b>Marcador que sobrar
/// dá erro</b>, em vez de seguir com o valor errado calado.</para>
/// </summary>
public sealed class RegrasDaBase
{
    /// <summary>
    /// Todo marcador que <see cref="Aplicar"/> sabe expandir. O programa
    /// <c>docs/plataforma/validacao/verificar_regras.cs</c> imprime a expansão de cada um, e
    /// o <c>dc86</c> a compara com o que a Época tinha no SQL original.
    /// </summary>
    public static readonly IReadOnlyList<string> Marcadores = [];

    /// <summary>Código da seção cujo custo o DRE zera. Época: 1601. Minas Rural (fonte): 1401.</summary>
    public int SecaoSemCusto { get; set; } = 1601;

    /// <summary>Se as contas de ICMS (grupo 303) viram uma conta só. Ver BASE_MINAS_RURAL.md.</summary>
    public bool AgrupaIcms { get; set; }

    /// <summary>Filiais que o filtro da tela NÃO oferece. Vazia = todas.</summary>
    public List<string> FiliaisForaDoFiltro { get; set; } = [];

    /// <summary>Filiais que a permissão (<c>PCLIB</c>) NÃO conta. Vazia = todas.</summary>
    public List<int> FiliaisForaDaPermissao { get; set; } = [];

    /// <summary>
    /// Derruba o boot com a mensagem certa quando a configuração está errada.
    ///
    /// <para><b>Código de filial é só dígito.</b> Esse valor entra no SQL por texto — não
    /// por bind —, e é esta validação que impede a configuração de virar porta de injeção.</para>
    /// </summary>
    public void Validar(string baseId)
    {
        if (SecaoSemCusto <= 0)
        {
            throw new InvalidOperationException(
                $"Bases:{baseId}:Regras:SecaoSemCusto está {SecaoSemCusto}. " +
                "Use o código da seção, que é positivo.");
        }

        foreach (var filial in FiliaisForaDoFiltro)
        {
            if (filial.Length == 0 || !filial.All(char.IsAsciiDigit))
            {
                throw new InvalidOperationException(
                    $"Bases:{baseId}:Regras:FiliaisForaDoFiltro tem \"{filial}\". Código de " +
                    "filial é só dígito: o valor entra no SQL por texto.");
            }
        }

        foreach (var filial in FiliaisForaDaPermissao)
        {
            if (filial <= 0)
            {
                throw new InvalidOperationException(
                    $"Bases:{baseId}:Regras:FiliaisForaDaPermissao tem {filial}. Use o código " +
                    "da filial, que é positivo.");
            }
        }
    }

    /// <summary>
    /// Troca os marcadores do SQL pelo que esta base manda. <b>Chame-a no SQL já montado</b>
    /// (depois do <c>string.Format</c>): os marcadores não têm chave, então o <c>Format</c>
    /// os deixa passar, e nenhuma expansão contém <c>:</c> — a ordem dos binds não muda.
    /// </summary>
    public string Aplicar(string sql)
    {
        var pronto = sql;

        if (pronto.Contains("@@", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "A consulta ainda tem um marcador @@…@@ que Aplicar não expande. Um marcador " +
                "esquecido chegaria ao Oracle como texto — ou, pior, a consulta rodaria com o " +
                "valor de outra base.");
        }

        return pronto;
    }
}
```

- [ ] **Step 2: `BaseConfigurada.cs`**

```csharp
namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Uma base que o sistema sabe consultar: quem ela é, como se conecta e que regras carrega.
/// </summary>
public sealed class BaseConfigurada
{
    public BaseConfigurada(string id, string rotulo, string connectionString, RegrasDaBase regras)
    {
        Id = id;
        Rotulo = rotulo;
        ConnectionString = connectionString;
        Regras = regras;
    }

    /// <summary>O identificador estável (<c>Epoca</c>, <c>MinasRural</c>) — vai no token.</summary>
    public string Id { get; }

    /// <summary>O nome que a pessoa lê (<c>Época Distribuição</c>).</summary>
    public string Rotulo { get; }

    /// <summary>Carrega credencial. Nunca imprima, nunca registre em log.</summary>
    public string ConnectionString { get; }

    public RegrasDaBase Regras { get; }

    /// <summary>
    /// Só o id. O <c>ToString</c> padrão de um objeto sem este método é o nome do tipo, mas o
    /// de um <c>record</c> imprimiria todos os membros — incluída a string de conexão, no dia
    /// em que alguém escrevesse a base num log.
    /// </summary>
    public override string ToString() => Id;
}
```

- [ ] **Step 3: `OpcaoDeBase.cs` e `BaseDto.cs`**

```csharp
// api-new-kpi/Application/Common/Bases/OpcaoDeBase.cs
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>A forma de uma entrada da seção <c>Bases</c> do <c>appsettings.json</c>.</summary>
public sealed class OpcaoDeBase
{
    public string Rotulo { get; set; } = string.Empty;

    public RegrasDaBase Regras { get; set; } = new();
}
```

```csharp
// api-new-kpi/Application/Common/Bases/BaseDto.cs
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>A base como a tela a vê: o id que volta no login e o rótulo que se mostra.</summary>
public sealed record BaseDto(string Id, string Rotulo)
{
    public static BaseDto De(BaseConfigurada baseConfigurada) =>
        new(baseConfigurada.Id, baseConfigurada.Rotulo);
}
```

- [ ] **Step 4: `RegistroDeBases.cs`**

```csharp
using System.Text.RegularExpressions;
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>
/// A lista fechada de bases. É o que impede o login de aceitar uma base inventada.
///
/// <para><b>Só entram as bases que TÊM string de conexão.</b> Quem não configurou o Minas
/// Rural simplesmente não o vê no login, e a API sobe do mesmo jeito — um ambiente de
/// desenvolvimento só com a Época continua funcionando.</para>
///
/// <para>A chave da conexão sai do id: <c>Bases:MinasRural</c> usa
/// <c>ConnectionStrings:OracleMinasRural</c>. A <c>OracleEpoca</c> que já existe nos ambientes
/// continua valendo sem alteração.</para>
/// </summary>
public sealed partial class RegistroDeBases
{
    public const string Secao = "Bases";

    public RegistroDeBases(IConfiguration configuracao, ILogger<RegistroDeBases> logger)
    {
        var opcoes = configuracao.GetSection(Secao).Get<Dictionary<string, OpcaoDeBase>>()
                     ?? new Dictionary<string, OpcaoDeBase>();

        var lista = new List<BaseConfigurada>();

        foreach (var (id, opcao) in opcoes)
        {
            if (!IdValido().IsMatch(id))
            {
                throw new InvalidOperationException(
                    $"Bases:{id} não é um id válido. Use letras e dígitos, começando por letra " +
                    "(ex.: Epoca, MinasRural) — o id vira parte do nome da string de conexão.");
            }

            if (string.IsNullOrWhiteSpace(opcao.Rotulo))
            {
                throw new InvalidOperationException(
                    $"Bases:{id}:Rotulo está vazio. É o nome que a pessoa lê no login.");
            }

            opcao.Regras.Validar(id);

            var conexao = configuracao.GetConnectionString($"Oracle{id}");
            if (string.IsNullOrWhiteSpace(conexao))
            {
                // Aviso, não erro: ambiente sem a base não deve impedir a API de subir.
                logger.LogWarning(
                    "Base {Base} sem string de conexão ({Chave}): não será oferecida no login.",
                    id,
                    $"ConnectionStrings:Oracle{id}");
                continue;
            }

            lista.Add(new BaseConfigurada(id, opcao.Rotulo.Trim(), conexao, opcao.Regras));
        }

        Disponiveis = lista;

        // Só os ids. A string de conexão carrega credencial e não vai a log nenhum.
        logger.LogInformation(
            "Bases disponíveis: {Bases}",
            lista.Count == 0 ? "nenhuma" : string.Join(", ", lista.Select(b => b.Id)));
    }

    /// <summary>As bases configuradas E com string de conexão, na ordem do arquivo.</summary>
    public IReadOnlyList<BaseConfigurada> Disponiveis { get; }

    /// <summary>
    /// Procura uma base pelo id, sem diferenciar maiúscula de minúscula. Devolve <c>null</c>
    /// para vazio, desconhecido ou não configurado — <b>nunca</b> a primeira da lista: quem
    /// pede base inexistente tem de ouvir isso, e não receber a Época.
    /// </summary>
    public BaseConfigurada? Buscar(string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return null;
        }

        var procurado = id.Trim();
        return Disponiveis.FirstOrDefault(
            b => string.Equals(b.Id, procurado, StringComparison.OrdinalIgnoreCase));
    }

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9]*$")]
    private static partial Regex IdValido();
}
```

- [ ] **Step 5: Registrar no DI e validar no boot**

Em `Configurations/PersistenceConfiguration.cs`, acrescente o `using` e a linha, **antes** do `AddSingleton<IOracleConnectionFactory…>` (que só muda na Task 5):

```csharp
using Epoca.Kpi.Api.Application.Common.Bases;
```

```csharp
        // A lista fechada de bases. Singleton: é configuração lida uma vez no boot.
        services.AddSingleton<RegistroDeBases>();
```

Em `Program.cs`, logo depois de `var app = builder.Build();`:

```csharp
// Constrói o registro de bases AGORA. A validação da configuração (código de filial com
// letra, seção negativa) tem de derrubar o boot — e não a primeira pessoa que tentar entrar,
// numa tela de login, com uma mensagem que ninguém liga a um appsettings.
_ = app.Services.GetRequiredService<Epoca.Kpi.Api.Application.Common.Bases.RegistroDeBases>();
```

- [ ] **Step 6: Configuração**

Em `api-new-kpi/appsettings.json`, troque o bloco `ConnectionStrings` e acrescente `Bases` logo depois:

```json
  "ConnectionStrings": {
    "OracleEpoca": "",
    "OracleMinasRural": ""
  },
  "//_bases": "Uma entrada por base. A string de conexão fica em ConnectionStrings:Oracle<Id> (ignorado pelo git). O Minas Rural SOBE COM OS VALORES DA EPOCA de propósito: as regras se ligam uma de cada vez, depois de medidas contra a 9815 de la. Ver docs/plataforma/BIFURCACAO_DE_BASES.md.",
  "Bases": {
    "Epoca": {
      "Rotulo": "Época Distribuição",
      "Regras": {
        "SecaoSemCusto": 1601,
        "AgrupaIcms": false,
        "FiliaisForaDoFiltro": [ "20", "31", "35", "91" ],
        "FiliaisForaDaPermissao": [ 2, 99 ]
      }
    },
    "MinasRural": {
      "Rotulo": "Minas Rural",
      "Regras": {
        "SecaoSemCusto": 1601,
        "AgrupaIcms": false,
        "FiliaisForaDoFiltro": [],
        "FiliaisForaDaPermissao": []
      }
    }
  },
```

Em `appsettings.example.json`, dentro de `ConnectionStrings`, acrescente a segunda chave:

```json
    "OracleMinasRural": "User Id=USUARIO;Password=SENHA;Data Source=//HOST:1521/SERVICO;Pooling=true;Min Pool Size=1;Max Pool Size=20;Connection Timeout=30"
```

(sem a chave `OracleMinasRural` preenchida, o Minas Rural **não aparece** no login — por desenho.)

- [ ] **Step 7: O programa que prova o que `Aplicar` expande (`verificar_regras.cs`)**

```csharp
#:project ../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// Imprime, em UMA linha de JSON, o que Aplicar(marcador) devolve para cada marcador e para
// cada base configurada de verdade. O dc86 lê esta linha e a compara com o texto que a Época
// tinha no SQL original — é o elo entre a prova de texto e o código que roda.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/plataforma/validacao/verificar_regras.cs -p:BaseOutputPath="$TEMP/vr/"
// (o BaseOutputPath evita esbarrar no apphost.exe da API que o Gabriel deixa rodando.)
//
// `PublishAot=false` (primeira linha): programa de arquivo único assume AOT no .NET 10 e
// desliga a serialização por reflexão — sem a diretiva, o JsonSerializer lança.

using System.Text.Json;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

var caminho = Path.GetFullPath(Path.Combine("api-new-kpi", "appsettings.json"));

var configuracao = new ConfigurationBuilder()
    .AddJsonFile(caminho, optional: false)
    // Uma string qualquer: o registro só oferece base que tenha conexão, e aqui ninguém conecta.
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["ConnectionStrings:OracleEpoca"] = "teste",
        ["ConnectionStrings:OracleMinasRural"] = "teste",
    })
    .Build();

var registro = new RegistroDeBases(configuracao, NullLogger<RegistroDeBases>.Instance);

var saida = new Dictionary<string, Dictionary<string, string>>();

foreach (var baseConfigurada in registro.Disponiveis)
{
    var tabela = new Dictionary<string, string>();

    foreach (var marcador in RegrasDaBase.Marcadores)
    {
        tabela[marcador] = baseConfigurada.Regras.Aplicar(marcador);
    }

    saida[baseConfigurada.Id] = tabela;
}

// Uma base SINTÉTICA com todas as regras do Minas Rural LIGADAS (o que o fonte do Delphi
// indica). Ninguém a usa; ela existe para o dc86 provar que as expansões ligadas são texto
// válido e não carregam bind — antes de qualquer base de verdade ligar uma regra.
var ligado = new RegrasDaBase { SecaoSemCusto = 1401, AgrupaIcms = true };
var tabelaLigada = new Dictionary<string, string>();
foreach (var marcador in RegrasDaBase.Marcadores)
{
    tabelaLigada[marcador] = ligado.Aplicar(marcador);
}
saida["_ligado"] = tabelaLigada;

Console.WriteLine(JsonSerializer.Serialize(saida));
```

- [ ] **Step 8: O teste do registro (`bf1`)**

```js
/**
 * bf1 — o registro de bases: sobe a API de verdade com configurações diferentes.
 *
 *   node docs/plataforma/validacao/bf1_registro_de_bases.mjs
 *
 * Não precisa de banco nem de credencial: o registro lê a configuração, e ninguém conecta.
 * Compila a API numa pasta temporária (para não esbarrar no `apphost.exe` da API que o
 * Gabriel deixa rodando) e sobe `dotnet api-new-kpi.dll` com variáveis de ambiente.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const SAIDA = path.join(os.tmpdir(), "bf-api");
execFileSync(
  "dotnet",
  ["build", "api-new-kpi/api-new-kpi.csproj", "-c", "Debug", "-o", SAIDA, "--nologo", "-v", "q"],
  { stdio: "inherit" },
);

let n = 0;
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};

let porta = 5290;

function subir(env) {
  const proc = spawn("dotnet", [path.join(SAIDA, "api-new-kpi.dll")], {
    cwd: SAIDA,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: "Production",
      ASPNETCORE_URLS: `http://127.0.0.1:${porta++}`,
      Jwt__Chave: "x".repeat(40),
      ...env,
    },
  });

  let saida = "";
  proc.stdout.on("data", (d) => (saida += d));
  proc.stderr.on("data", (d) => (saida += d));

  const fim = new Promise((resolve) => proc.on("close", (codigo) => resolve(codigo)));
  const pronto = new Promise((resolve) => {
    const t = setInterval(() => {
      if (/Now listening on/.test(saida)) {
        clearInterval(t);
        resolve(true);
      }
    }, 100);
    fim.then(() => {
      clearInterval(t);
      resolve(false);
    });
  });

  return { texto: () => saida, pronto, fim, parar: () => proc.kill() };
}

const CONEXAO = "User Id=u;Password=p;Data Source=//127.0.0.1:1/x";

// 1. As duas bases com conexão: as duas disponíveis.
{
  const a = subir({
    ConnectionStrings__OracleEpoca: CONEXAO,
    ConnectionStrings__OracleMinasRural: CONEXAO,
  });
  ok(await a.pronto, `a API sobe com as duas bases\n${a.texto()}`);
  // `.{1,3}` no lugar do acento: o console do Windows entrega a saída numa página de código
  // que não é UTF-8, e `disponíveis` chega como `dispon?veis`.
  ok(/Bases dispon.{1,3}veis: Epoca, MinasRural/.test(a.texto()), `lista as duas\n${a.texto()}`);
  ok(!a.texto().includes("Password=p"), "a string de conexão não vai ao log");
  a.parar();
}

// 2. Só a Época: o Minas Rural não é oferecido, e a API sobe do mesmo jeito.
{
  const a = subir({ ConnectionStrings__OracleEpoca: CONEXAO });
  ok(await a.pronto, `a API sobe só com a Época\n${a.texto()}`);
  ok(/Bases dispon.{1,3}veis: Epoca/.test(a.texto()), "só a Época");
  ok(!/Bases dispon.{1,3}veis: .*MinasRural/.test(a.texto()), "o Minas Rural não é oferecido");
  ok(/MinasRural sem string de conex.{1,3}o/.test(a.texto()), "e o aviso diz por quê");
  a.parar();
}

// 3. Código de filial com letra DERRUBA O BOOT: o valor entra no SQL por texto.
{
  const a = subir({
    ConnectionStrings__OracleEpoca: CONEXAO,
    Bases__Epoca__Regras__FiliaisForaDoFiltro__0: "2A",
  });
  ok(!(await a.pronto), "a API NÃO sobe com filial '2A'");
  ok((await a.fim) !== 0, "e sai com código de erro");
  ok(/FiliaisForaDoFiltro/.test(a.texto()), `a mensagem diz o campo\n${a.texto()}`);
}

// 4. Seção zero também derruba.
{
  const a = subir({
    ConnectionStrings__OracleEpoca: CONEXAO,
    Bases__Epoca__Regras__SecaoSemCusto: "0",
  });
  ok(!(await a.pronto), "a API NÃO sobe com SecaoSemCusto = 0");
  ok(/SecaoSemCusto/.test(a.texto()), "a mensagem diz o campo");
}

console.log(`bf1 — ${n} conferências, todas passaram.`);
```

- [ ] **Step 9: Compilar e rodar**

Run: `dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/kpi-build/"`
Expected: `Compilação com êxito.` e `0 Erro(s)`.

Run: `node docs/plataforma/validacao/bf1_registro_de_bases.mjs`
Expected: `bf1 — 12 conferências, todas passaram.`

Run: `node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs`
Expected: `dc86 — 5 conferências, todas passaram.` — as três do texto **mais** a seção 4 (o C# real) agora ativa: `verificar_regras.cs` roda e devolve `{"Epoca":{},"MinasRural":{}}`.

- [ ] **Step 10: Commit**

```bash
git add api-new-kpi/Domain/Entities/RegrasDaBase.cs api-new-kpi/Domain/Entities/BaseConfigurada.cs api-new-kpi/Application/Common/Bases api-new-kpi/Configurations/PersistenceConfiguration.cs api-new-kpi/Program.cs api-new-kpi/appsettings.json api-new-kpi/appsettings.example.json docs/plataforma/validacao/verificar_regras.cs docs/plataforma/validacao/bf1_registro_de_bases.mjs
git commit -m "feat(bases): o registro de bases, validado no boot"
```

---

### Task 5: A base no token e na conexão (back-end)

**Esta tarefa e a Task 6 são um par: não pare entre elas.** Depois desta, o login da API exige `base`, e a tela de login ainda não a envia — o login pelo navegador só volta a funcionar ao fim da Task 6. A Época por fora (curl com `base`) funciona desde já.

**Files:**
- Create: `api-new-kpi/Application/Common/Bases/IBaseAtual.cs`
- Create: `api-new-kpi/Application/Common/Bases/BaseIndisponivelException.cs`
- Modify: `api-new-kpi/Infrastructure/Persistence/Context/IOracleConnectionFactory.cs` e `OracleConnectionFactory.cs` (reescrever)
- Modify: `api-new-kpi/Configurations/PersistenceConfiguration.cs`, `AutenticacaoConfiguration.cs`
- Modify: `api-new-kpi/Middleware/GlobalExceptionMiddleware.cs`
- Modify: `api-new-kpi/Domain/Interfaces/IAutenticacaoRepository.cs`, `Infrastructure/Persistence/Repositories/AutenticacaoRepository.cs`
- Modify: `api-new-kpi/Application/Features/Autenticacao/{Dtos/AutenticacaoDtos.cs,MotivoDaRecusa.cs,AutenticacaoService.cs,GeradorDeToken.cs}`
- Modify: `api-new-kpi/Controllers/{AutenticacaoController.cs,HealthController.cs}`
- Create: `docs/plataforma/validacao/bf2_login_por_base.mjs`

**Interfaces:**
- Consumes: `RegistroDeBases`, `BaseConfigurada`, `BaseDto` (Task 4).
- Produces:
  - `IBaseAtual.Base : BaseConfigurada` — lê o claim `base` do token; **lança** se não houver. `BaseAtual.ClaimBase = "base"`.
  - `IOracleConnectionFactory.CriarConexaoAsync(CancellationToken)` (usa a base do token — **os 10 pontos de uso do repositório do DRE não mudam**) e `CriarConexaoAsync(BaseConfigurada, CancellationToken)` (explícita: login e saúde). Some `EstaConfigurada`.
  - `BaseIndisponivelException(BaseConfigurada, string? codigoOra, Exception)` — vira 503.
  - `LoginRequest(string Login, string Senha, string? Base = null)`; `UsuarioDto(…, BaseDto Base)`.
  - `GET /api/auth/bases` (anônimo) → `[{ id, rotulo }]`.

- [ ] **Step 1: O teste que falha (`bf2`)**

```js
/**
 * bf2 — login por base, token com base, e o que acontece quando o banco não responde.
 *
 *   node docs/plataforma/validacao/bf2_login_por_base.mjs
 *
 * Sem credencial e sem banco: a Época aponta para uma porta onde ninguém escuta, então o
 * login chega à conexão e falha como falharia com o banco fora do ar — que é justamente o
 * que se quer provar (503, e nunca "senha incorreta"). Os tokens são forjados com a chave de
 * teste, para exercitar o que a API faz com um token sem `base`.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

const SAIDA = path.join(os.tmpdir(), "bf-api");
execFileSync(
  "dotnet",
  ["build", "api-new-kpi/api-new-kpi.csproj", "-c", "Debug", "-o", SAIDA, "--nologo", "-v", "q"],
  { stdio: "inherit" },
);

const CHAVE = "chave-de-teste-".padEnd(48, "x");
const PORTA = 5295;
const API = `http://127.0.0.1:${PORTA}`;

const proc = spawn("dotnet", [path.join(SAIDA, "api-new-kpi.dll")], {
  cwd: SAIDA,
  env: {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: "Production",
    ASPNETCORE_URLS: API,
    Jwt__Chave: CHAVE,
    // Porta onde ninguém escuta: ORA-12541, rápido.
    ConnectionStrings__OracleEpoca: "User Id=u;Password=p;Data Source=//127.0.0.1:1/x;Connection Timeout=5",
  },
});
let log = "";
proc.stdout.on("data", (d) => (log += d));
proc.stderr.on("data", (d) => (log += d));

await new Promise((resolve, reject) => {
  const t = setInterval(() => {
    if (/Now listening on/.test(log)) { clearInterval(t); resolve(); }
  }, 100);
  proc.on("close", () => { clearInterval(t); reject(new Error(`a API não subiu\n${log}`)); });
});

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims) {
  const cab = b64({ alg: "HS256", typ: "JWT" });
  const corpo = b64({
    iss: "epoca-analytics-api",
    aud: "epoca-analytics",
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: "123",
    matricula: "123",
    nome: "Fulano de Tal",
    ...claims,
  });
  const assinatura = crypto.createHmac("sha256", CHAVE).update(`${cab}.${corpo}`).digest("base64url");
  return `${cab}.${corpo}.${assinatura}`;
}

const chamar = async (metodo, rota, { corpo, bearer } = {}) => {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      ...(corpo ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* corpo sem JSON */ }
  return { status: r.status, json, texto };
};

try {
  // ── as bases oferecidas ──────────────────────────────────────────────────────────
  const bases = await chamar("GET", "/api/auth/bases");
  eq(bases.status, 200, "GET /bases é público");
  eq(bases.json.dados, [{ id: "Epoca", rotulo: "Época Distribuição" }], "só a base configurada, com id e rótulo");
  ok(!bases.texto.includes("127.0.0.1") && !/password/i.test(bases.texto), "não vaza host nem credencial");

  // ── REVIEW FOCUS 3: base ausente, vazia, inventada, ou de uma base sem conexão ────
  const MSG_BASE = "Escolha uma base de dados da lista.";
  for (const [corpo, oque] of [
    [{ login: "a", senha: "b" }, "sem base"],
    [{ login: "a", senha: "b", base: "" }, "base vazia"],
    [{ login: "a", senha: "b", base: "Inventada" }, "base inventada"],
    [{ login: "a", senha: "b", base: "MinasRural" }, "base existente mas sem string de conexão"],
  ]) {
    const r = await chamar("POST", "/api/auth/login", { corpo });
    eq(r.status, 400, `${oque}: 400, e nunca cai na Época`);
    eq(r.json.mensagem, MSG_BASE, `${oque}: mensagem`);
  }

  // ── REVIEW FOCUS 4: o banco não responde → 503, e NUNCA "senha incorreta" ─────────
  for (const base of ["Epoca", "epoca"]) {
    const r = await chamar("POST", "/api/auth/login", { corpo: { login: "a", senha: "b", base } });
    eq(r.status, 503, `banco fora do ar com base "${base}": 503`);
    ok(/não respondeu/.test(r.json.mensagem), `a mensagem diz que a base não respondeu: ${r.json.mensagem}`);
    ok(/Época Distribuição/.test(r.json.mensagem), "e diz QUAL base");
    ok(!/incorretos/.test(r.texto), "infraestrutura nunca vira 'senha incorreta'");
  }

  // ── REVIEW FOCUS 1: token sem base, ou de base que não existe ─────────────────────
  const MSG_ANTIGA = "Sua sessão é anterior a esta atualização. Entre de novo.";
  for (const [claims, oque] of [
    [{}, "token anterior à mudança (sem claim base)"],
    [{ base: "Inventada" }, "base que não existe"],
    [{ base: "MinasRural" }, "base existente mas não configurada neste ambiente"],
  ]) {
    const r = await chamar("GET", "/api/auth/eu", { bearer: token(claims) });
    eq(r.status, 401, `${oque}: 401`);
    eq(r.json.mensagem, MSG_ANTIGA, `${oque}: mensagem`);
  }

  const semToken = await chamar("GET", "/api/auth/eu");
  eq(semToken.status, 401, "sem token: 401");
  eq(semToken.json.mensagem, "Sessão expirada ou ausente. Entre novamente.", "e a mensagem de sempre");

  // ── token bom: a base volta no /eu ───────────────────────────────────────────────
  const bom = await chamar("GET", "/api/auth/eu", { bearer: token({ base: "Epoca" }) });
  eq(bom.status, 200, "token com base válida passa");
  eq(bom.json.dados.base, { id: "Epoca", rotulo: "Época Distribuição" }, "e /eu devolve a base da sessão");

  // ── a rota do DRE exige sessão E resolve a base pelo token ───────────────────────
  eq((await chamar("GET", "/api/dre-gerencial/filiais")).status, 401, "DRE sem token: 401");
  const dre = await chamar("GET", "/api/dre-gerencial/filiais", { bearer: token({ base: "Epoca" }) });
  eq(dre.status, 503, "DRE com token: a conexão é tentada NA BASE DO TOKEN, e falha como 503, não 500");
  ok(/Época Distribuição/.test(dre.json.mensagem), "e o 503 diz de que base");

  // ── saúde ────────────────────────────────────────────────────────────────────────
  const saude = await chamar("GET", "/api/health");
  eq(saude.status, 200, "health é anônimo");
  eq(saude.json.dados.bases, [{ id: "Epoca", rotulo: "Época Distribuição" }], "health lista as bases");
  eq((await chamar("GET", "/api/health/oracle")).status, 503, "health/oracle com uma base só dispensa ?base= e testa a conexão");
  eq((await chamar("GET", "/api/health/oracle?base=Inventada")).status, 400, "?base= desconhecida: 400");
} finally {
  proc.kill();
}

console.log(`bf2 — ${n} conferências, todas passaram.`);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node docs/plataforma/validacao/bf2_login_por_base.mjs`
Expected: FAIL — `GET /bases é público` (404), porque a rota ainda não existe.

- [ ] **Step 3: `IBaseAtual.cs` e `BaseIndisponivelException.cs`**

```csharp
// api-new-kpi/Application/Common/Bases/IBaseAtual.cs
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>
/// A base da requisição em curso — a do token, e só a do token.
/// </summary>
public interface IBaseAtual
{
    /// <summary>
    /// A base da sessão. <b>Lança se não houver:</b> uma consulta sem base não roda em
    /// nenhuma. Não existe "a Época por padrão" — foi exatamente isso que a bifurcação veio
    /// impedir.
    /// </summary>
    BaseConfigurada Base { get; }
}

/// <inheritdoc cref="IBaseAtual"/>
public sealed class BaseAtual : IBaseAtual
{
    /// <summary>O claim do JWT que diz de que base é a sessão.</summary>
    public const string ClaimBase = "base";

    private readonly IHttpContextAccessor _http;
    private readonly RegistroDeBases _registro;
    private BaseConfigurada? _resolvida;

    public BaseAtual(IHttpContextAccessor http, RegistroDeBases registro)
    {
        _http = http;
        _registro = registro;
    }

    public BaseConfigurada Base => _resolvida ??= Resolver();

    private BaseConfigurada Resolver()
    {
        var id = _http.HttpContext?.User.FindFirst(ClaimBase)?.Value;

        return _registro.Buscar(id) ?? throw new InvalidOperationException(
            "Esta requisição não carrega uma base válida. Uma consulta nunca roda sem base. " +
            "Isto indica uma rota anônima que pediu conexão, ou um token sem o claim 'base' " +
            "que passou pela validação — a segunda coisa é defeito na validação do JWT.");
    }
}
```

```csharp
// api-new-kpi/Application/Common/Bases/BaseIndisponivelException.cs
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>
/// O banco da base não respondeu. Vira 503 com a mensagem certa — e <b>nunca</b> 401: quem
/// vê "senha incorreta" para um banco fora do ar vai trocar a senha para resolver um problema
/// que não é dela.
/// </summary>
public sealed class BaseIndisponivelException : Exception
{
    public BaseIndisponivelException(BaseConfigurada baseAlvo, string? codigoOra, Exception interna)
        : base($"A base {baseAlvo.Rotulo} não respondeu ({codigoOra ?? "sem código ORA"}).", interna)
    {
        BaseId = baseAlvo.Id;
        Rotulo = baseAlvo.Rotulo;
        CodigoOra = codigoOra;
    }

    public string BaseId { get; }

    public string Rotulo { get; }

    /// <summary>Ex.: <c>ORA-12541</c>. Útil à TI; não é para a tela de produção.</summary>
    public string? CodigoOra { get; }
}
```

- [ ] **Step 4: A fábrica de conexão por base**

Substitua `IOracleConnectionFactory.cs` inteiro:

```csharp
using System.Data;
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Context;

/// <summary>
/// Fábrica de conexões com o Oracle. Os repositórios pedem uma conexão, usam e descartam — o
/// pool do ODP.NET cuida do resto, e há um pool por string de conexão, ou seja, por base.
/// </summary>
public interface IOracleConnectionFactory
{
    /// <summary>
    /// Abre uma conexão NA BASE DA SESSÃO (a do token). É o que os repositórios do DRE usam.
    /// O chamador é dono dela e deve descartá-la.
    /// </summary>
    Task<IDbConnection> CriarConexaoAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Abre uma conexão numa base ESCOLHIDA pelo chamador. Só o login (que ainda não tem
    /// token) e a saúde usam esta: todo o resto passa pela da sessão.
    /// </summary>
    Task<IDbConnection> CriarConexaoAsync(
        BaseConfigurada baseAlvo,
        CancellationToken cancellationToken = default);
}
```

Substitua `OracleConnectionFactory.cs` inteiro:

```csharp
using System.Data;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Domain.Entities;
using Oracle.ManagedDataAccess.Client;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Context;

/// <inheritdoc cref="IOracleConnectionFactory"/>
public sealed class OracleConnectionFactory : IOracleConnectionFactory
{
    private readonly IBaseAtual _baseAtual;
    private readonly ILogger<OracleConnectionFactory> _logger;

    public OracleConnectionFactory(IBaseAtual baseAtual, ILogger<OracleConnectionFactory> logger)
    {
        _baseAtual = baseAtual;
        _logger = logger;
    }

    public Task<IDbConnection> CriarConexaoAsync(CancellationToken cancellationToken = default) =>
        CriarConexaoAsync(_baseAtual.Base, cancellationToken);

    public async Task<IDbConnection> CriarConexaoAsync(
        BaseConfigurada baseAlvo,
        CancellationToken cancellationToken = default)
    {
        var conexao = new OracleConnection(baseAlvo.ConnectionString);

        // BindByName = false é o padrão do ODP.NET: os parâmetros são posicionais.
        // A ordem dos parâmetros precisa bater com a ordem dos :placeholders no SQL.
        // Ver docs/plataforma/CONVENCOES_ORACLE.md antes de escrever query.
        conexao.BindByName = false;

        try
        {
            await conexao.OpenAsync(cancellationToken);
            return conexao;
        }
        catch (OracleException excecao)
        {
            await conexao.DisposeAsync();

            // O número, e nada mais: a mensagem do ODP.NET pode citar o serviço, e a string
            // de conexão carrega credencial e não pode vazar para o log.
            _logger.LogError(
                "Falha ao abrir conexão com o Oracle da base {Base}: ORA-{Codigo:D5}.",
                baseAlvo.Id,
                excecao.Number);

            throw new BaseIndisponivelException(baseAlvo, $"ORA-{excecao.Number:D5}", excecao);
        }
        catch
        {
            await conexao.DisposeAsync();
            throw;
        }
    }
}
```

- [ ] **Step 5: Injeção de dependência**

Em `PersistenceConfiguration.cs`, troque a linha da fábrica (singleton → escopo, porque ela agora depende da requisição) e acrescente o acessor e o `IBaseAtual`:

```csharp
        services.AddHttpContextAccessor();
        services.AddScoped<IBaseAtual, BaseAtual>();

        // POR REQUISIÇÃO, e não singleton: a fábrica abre a conexão da base do token, e o
        // token é da requisição. (Era singleton quando só existia uma string de conexão.)
        services.AddScoped<IOracleConnectionFactory, OracleConnectionFactory>();
```

(e apague a linha antiga `services.AddSingleton<IOracleConnectionFactory, OracleConnectionFactory>();`.)

- [ ] **Step 6: 503 no tratamento global de exceções**

Em `Middleware/GlobalExceptionMiddleware.cs`, acrescente `using Epoca.Kpi.Api.Application.Common.Bases;` e, **imediatamente antes** de `catch (Exception excecao)`, este bloco:

```csharp
        catch (BaseIndisponivelException excecao)
        {
            // A BASE NÃO RESPONDEU — rede, listener, credencial do EDI. Não é erro de código e
            // não é "senha incorreta": 503, com o nome da base na mensagem, é o que diz à
            // pessoa (e à TI) onde olhar. O código ORA vai ao log, nunca a string de conexão.
            _logger.LogError(
                "Base {Base} indisponível em {Metodo} {Caminho}: {Codigo}",
                excecao.BaseId,
                context.Request.Method,
                context.Request.Path,
                excecao.CodigoOra ?? "sem código ORA");

            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = (int)HttpStatusCode.ServiceUnavailable;
            context.Response.ContentType = "application/json; charset=utf-8";

            var resposta = ApiResponse.Falha(
                $"A base {excecao.Rotulo} não respondeu. Tente de novo ou avise a TI.",
                _ambiente.IsDevelopment() ? [excecao.CodigoOra ?? "Erro sem código ORA."] : null);

            await context.Response.WriteAsync(JsonSerializer.Serialize(resposta, JsonOptions));
        }
```

- [ ] **Step 6b: O repositório de autenticação recebe a base**

`Domain/Interfaces/IAutenticacaoRepository.cs` — acrescente `BaseConfigurada baseAlvo` como **primeiro** parâmetro das duas assinaturas:

```csharp
    Task<CredenciaisWinthor?> VerificarCredenciaisAsync(
        BaseConfigurada baseAlvo,
        string nomeGuerra,
```

```csharp
    Task<IReadOnlyList<string>> ObterFiliaisDoUsuarioAsync(
        BaseConfigurada baseAlvo,
        int matricula,
```

`Infrastructure/Persistence/Repositories/AutenticacaoRepository.cs` — cinco edições:

1. As assinaturas dos dois métodos recebem o mesmo parâmetro (`BaseConfigurada baseAlvo,` antes de `string nomeGuerra,` e antes de `int matricula,`).
2. Na primeira: `using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);` → `using var conexao = await _conexoes.CriarConexaoAsync(baseAlvo, cancellationToken);` (a que vem logo antes do comentário `// A ORDEM É A DO SQL`).
3. Na segunda: idem (a que vem logo antes de `var filiais = await conexao.QueryAsync<string>(`).
4. `AutenticacaoQueries.Credenciais,` → `baseAlvo.Regras.Aplicar(AutenticacaoQueries.Credenciais),`
5. `AutenticacaoQueries.FiliaisDoUsuario,` → `baseAlvo.Regras.Aplicar(AutenticacaoQueries.FiliaisDoUsuario),`

- [ ] **Step 7: DTOs e mensagens**

`Application/Features/Autenticacao/Dtos/AutenticacaoDtos.cs` — acrescente `using Epoca.Kpi.Api.Application.Common.Bases;` no topo e:

```csharp
/// <param name="Base">O id da base, da lista de <c>GET /api/auth/bases</c>. <b>Obrigatória:</b>
/// ausente ou desconhecida é erro — nunca cai na Época por omissão.</param>
public sealed record LoginRequest(string Login, string Senha, string? Base = null);
```

(substitui a linha `public sealed record LoginRequest(string Login, string Senha);`; o `<param>` fica junto dos outros dois.) E em `UsuarioDto`:

```csharp
public sealed record UsuarioDto(
    int Matricula,
    string Nome,
    string NomeGuerra,
    IReadOnlyList<string> Filiais,
    IReadOnlyList<string> Rotinas,
    BaseDto Base);
```

`MotivoDaRecusa.cs` — a extensão passa a aceitar o rótulo, e a mensagem de credencial diz a base:

```csharp
    public static string Mensagem(this MotivoDaRecusa motivo, string? rotuloDaBase = null) => motivo switch
    {
        MotivoDaRecusa.Credenciais when rotuloDaBase is not null =>
            $"Usuário ou senha incorretos na base {rotuloDaBase}. " +
            "Use o mesmo nome de guerra e a mesma senha do Winthor.",

        MotivoDaRecusa.Credenciais =>
            "Usuário ou senha incorretos. Use o mesmo nome de guerra e a mesma senha do Winthor.",
```

(as demais linhas do `switch` — `SemSenhaCadastrada`, `CadastroInativo`, `_` — ficam como estão.)

- [ ] **Step 8: `AutenticacaoService`**

Sete edições em `Application/Features/Autenticacao/AutenticacaoService.cs`:

1. `using Epoca.Kpi.Api.Application.Common.Bases;` no topo.
2. Construtor e campo:

```csharp
    private readonly IAutenticacaoRepository _repositorio;
    private readonly RegistroDeBases _bases;
    private readonly GeradorDeToken _tokens;
    private readonly ILogger<AutenticacaoService> _logger;

    public AutenticacaoService(
        IAutenticacaoRepository repositorio,
        RegistroDeBases bases,
        GeradorDeToken tokens,
        ILogger<AutenticacaoService> logger)
    {
        _repositorio = repositorio;
        _bases = bases;
        _tokens = tokens;
        _logger = logger;
    }
```

3. A resolução da base — **troca** o trecho `var credenciais = await _repositorio.VerificarCredenciaisAsync(\n            login, pedido.Senha, cancellationToken);` por:

```csharp
        // A BASE VEM ANTES DE QUALQUER CONSULTA, e ausente é erro: nunca cai na Época por
        // omissão. Um front antigo, ou um erro de digitação, não pode entrar na base errada
        // sem ninguém perceber.
        var baseAlvo = _bases.Buscar(pedido.Base);
        if (baseAlvo is null)
        {
            return Result<LoginResponse>.Invalido("Escolha uma base de dados da lista.");
        }

        var credenciais = await _repositorio.VerificarCredenciaisAsync(
            baseAlvo, login, pedido.Senha, cancellationToken);
```

4. As três chamadas a `Recusar` ganham o terceiro argumento: `Recusar(login, MotivoDaRecusa.Credenciais)` → `Recusar(login, MotivoDaRecusa.Credenciais, baseAlvo)`; idem para `SemSenhaCadastrada` e `CadastroInativo`.
5. `var filiais = await _repositorio.ObterFiliaisDoUsuarioAsync(\n            credenciais.Matricula, cancellationToken);` →

```csharp
        var filiais = await _repositorio.ObterFiliaisDoUsuarioAsync(
            baseAlvo, credenciais.Matricula, cancellationToken);
```

6. O `UsuarioDto` e os dois logs:

```csharp
        var usuario = new UsuarioDto(
            credenciais.Matricula,
            credenciais.Nome.Trim(),
            credenciais.NomeGuerra.Trim(),
            filiais,
            rotinas,
            BaseDto.De(baseAlvo));
```

```csharp
        _logger.LogInformation(
            "Login concluído para a matrícula {Matricula} na base {Base}, com {Filiais} " +
            "filiais e {Rotinas} rotinas.",
            credenciais.Matricula,
            baseAlvo.Id,
            filiais.Count,
            rotinas.Count);
```

e, no aviso de "sem rotina nenhuma", acrescente a base à mensagem e aos argumentos:

```csharp
            _logger.LogWarning(
                "Matrícula {Matricula} entrou na base {Base} sem rotina nenhuma. " +
                "Rotina 9815: {Rotina}. Guia 4-DRE: {Guia}. Filiais em PCLIB: {Filiais}.",
                credenciais.Matricula,
                baseAlvo.Id,
```

7. `Recusar`:

```csharp
    private Result<LoginResponse> Recusar(string login, MotivoDaRecusa motivo, BaseConfigurada baseAlvo)
    {
        _logger.LogInformation(
            "Login recusado para {Login} na base {Base}: {Motivo}.", login, baseAlvo.Id, motivo);
        return Result<LoginResponse>.Proibido(motivo.Mensagem(baseAlvo.Rotulo));
    }
```

- [ ] **Step 9: O claim no token e a validação**

`GeradorDeToken.cs` — `using Epoca.Kpi.Api.Application.Common.Bases;` e, **antes** do comentário `// Identificador único deste token…`, um novo elemento da lista de claims:

```csharp
            // A BASE da sessão. Assinada junto, o cliente não a altera: é o que a API usa, a
            // cada requisição, para saber em que Oracle consultar.
            new Claim(BaseAtual.ClaimBase, usuario.Base.Id),
```

`AutenticacaoConfiguration.cs` — `using Epoca.Kpi.Api.Application.Common.Bases;`, uma constante na classe e o novo evento; **substitua** o bloco `options.Events = new JwtBearerEvents { … };` por:

```csharp
                options.Events = new JwtBearerEvents
                {
                    // A BASE É PARTE DA IDENTIDADE. Um token sem o claim `base` (emitido antes
                    // da bifurcação) ou com uma base que saiu da configuração não vale: a API
                    // não tem como saber em que Oracle consultar, e adivinhar é o erro que
                    // esta mudança existe para impedir.
                    OnTokenValidated = contexto =>
                    {
                        var registro = contexto.HttpContext.RequestServices
                            .GetRequiredService<RegistroDeBases>();
                        var id = contexto.Principal?.FindFirst(BaseAtual.ClaimBase)?.Value;

                        if (registro.Buscar(id) is null)
                        {
                            contexto.Fail(SessaoSemBase);
                        }

                        return Task.CompletedTask;
                    },

                    // Sem esta linha a resposta 401 sai com corpo vazio, e o front precisa
                    // tratar um caso a mais só porque esta rota respondeu diferente das outras.
                    OnChallenge = async contexto =>
                    {
                        contexto.HandleResponse();
                        contexto.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        contexto.Response.ContentType = "application/json; charset=utf-8";

                        // Os dois 401 pedem a mesma ação (entrar de novo), mas dizem coisas
                        // diferentes: um é sessão que venceu, o outro é sessão que a
                        // atualização invalidou. Quem lê o segundo não deve achar que errou.
                        var anterior = contexto.AuthenticateFailure?.Message == SessaoSemBase;
                        var mensagem = anterior
                            ? "Sua sessão é anterior a esta atualização. Entre de novo."
                            : "Sessão expirada ou ausente. Entre novamente.";

                        await contexto.Response.WriteAsJsonAsync(ApiResponse<object>.Falha(mensagem));
                    }
                };
```

e, dentro da classe `AutenticacaoConfiguration`, antes do método:

```csharp
    /// <summary>A razão que <c>OnTokenValidated</c> dá e o <c>OnChallenge</c> reconhece.</summary>
    private const string SessaoSemBase = "sessao-sem-base";
```

- [ ] **Step 10: Os controllers**

`AutenticacaoController.cs` — `using Epoca.Kpi.Api.Application.Common.Bases;`, o registro injetado, a rota nova e a base no `/eu`:

```csharp
    private readonly AutenticacaoService _servico;
    private readonly RegistroDeBases _bases;

    public AutenticacaoController(AutenticacaoService servico, RegistroDeBases bases)
    {
        _servico = servico;
        _bases = bases;
    }

    /// <summary>
    /// As bases que o login oferece. Público: a tela de login precisa dela antes de haver
    /// sessão. Devolve só o id e o rótulo — nunca host, usuário nem string de conexão.
    /// </summary>
    [HttpGet("bases")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<BaseDto>>), StatusCodes.Status200OK)]
    public IActionResult Bases() =>
        Ok(ApiResponse<IReadOnlyList<BaseDto>>.Ok(
            _bases.Disponiveis.Select(BaseDto.De).ToList()));
```

(no lugar da linha `public AutenticacaoController(AutenticacaoService servico) => _servico = servico;` e do campo `_servico`.) No `Eu()`, depois de `var rotinas = User.FindAll(GeradorDeToken.ClaimRotina).Select(c => c.Value).ToList();`:

```csharp
        // O OnTokenValidated já recusou token sem base válida; isto é a rede de baixo.
        var baseDaSessao = _bases.Buscar(User.FindFirstValue(BaseAtual.ClaimBase));
        if (baseDaSessao is null)
        {
            return Unauthorized(ApiResponse<object>.Falha("Sessão inválida. Entre novamente."));
        }
```

e o `UsuarioDto` do retorno ganha `BaseDto.De(baseDaSessao)` como último argumento (depois de `rotinas`).

`HealthController.cs` — **cinco edições**:

1. `using Epoca.Kpi.Api.Application.Common.Bases;` e `using Epoca.Kpi.Api.Domain.Entities;`.
2. O campo e o construtor: `IOracleConnectionFactory conexoes,` fica, e entra `RegistroDeBases registro,` logo depois; no corpo, `_registro = registro;` (campo `private readonly RegistroDeBases _registro;`).
3. Em `Get()`: `OracleConfigurado: _conexoes.EstaConfigurada,` → `OracleConfigurado: _registro.Disponiveis.Count > 0,\n            Bases: _registro.Disponiveis.Select(BaseDto.De).ToArray(),`.
4. `GetOracle` — assinatura e o começo, **substituindo** o bloco `if (!_conexoes.EstaConfigurada) { … }`:

```csharp
    public async Task<IActionResult> GetOracle(
        [FromQuery(Name = "base")] string? baseId,
        CancellationToken cancellationToken)
    {
        if (_registro.Disponiveis.Count == 0)
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                ApiResponse<object>.Falha(
                    "Nenhuma base tem string de conexão configurada.",
                    ["Copie appsettings.example.json para appsettings.Development.json e preencha."]));
        }

        // Com uma base só, exigir `?base=` seria cerimônia. Com mais de uma, escolher por
        // conta própria qual testar é o engano que esta bifurcação existe para impedir.
        var alvo = string.IsNullOrWhiteSpace(baseId)
            ? (_registro.Disponiveis.Count == 1 ? _registro.Disponiveis[0] : null)
            : _registro.Buscar(baseId);

        if (alvo is null)
        {
            var ids = string.Join(", ", _registro.Disponiveis.Select(b => b.Id));
            return BadRequest(ApiResponse<object>.Falha(
                $"Informe ?base=<id>. Bases disponíveis: {ids}."));
        }
```

5. Dentro do `try`: `using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);` → `using var conexao = await _conexoes.CriarConexaoAsync(alvo, cancellationToken);`; a resposta de sucesso ganha `Base: BaseDto.De(alvo)` como último argumento nomeado; e o log do `catch`: `_logger.LogError("Falha ao conectar no Oracle. {Codigo}", codigo ?? "sem código ORA");` → `_logger.LogError("Falha ao conectar no Oracle da base {Base}. {Codigo}", alvo.Id, codigo ?? "sem código ORA");`.

Os dois records do fim do arquivo:

```csharp
public record HealthResponse(
    string Status,
    string Ambiente,
    bool OracleConfigurado,
    IReadOnlyList<BaseDto> Bases,
    IReadOnlyList<string> Modulos,
    DateTimeOffset VerificadoEm);

public record OracleHealthResponse(
    string Status,
    string Usuario,
    long TempoMs,
    DateTimeOffset VerificadoEm,
    BaseDto Base);
```

- [ ] **Step 11: Compilar**

Run: `dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/kpi-build/"`
Expected: `Compilação com êxito.` — `0 Aviso(s)` e `0 Erro(s)`. Se acusar `EstaConfigurada`, sobrou um uso: `grep -rn EstaConfigurada api-new-kpi --include=*.cs` e ajuste.

- [ ] **Step 12: Rodar o `bf2` e o `bf1`**

Run: `node docs/plataforma/validacao/bf2_login_por_base.mjs`
Expected: `bf2 — 36 conferências, todas passaram.`

Run: `node docs/plataforma/validacao/bf1_registro_de_bases.mjs`
Expected: `bf1 — 12 conferências, todas passaram.`

- [ ] **Step 13: Commit**

```bash
git add api-new-kpi
git commit -m "feat(bases): a base no token e na conexao -- login por base, 401 para sessao antiga, 503 para base fora do ar"
```

---
### Task 6: O login pelo navegador (BFF e formulário)

Fecha o par da Task 5: o BFF passa a repassar a base, a sessão a guarda, e o formulário ganha o seletor **Base de dados**. **Ao fim desta tarefa o login pelo navegador volta a funcionar.**

**Files:**
- Create: `client-new-kpi/app/api/bases/route.ts`
- Create: `client-new-kpi/lib/baseInicial.ts`
- Create: `docs/plataforma/validacao/bf3_front_por_base.mjs`
- Modify: `client-new-kpi/lib/servidor/sessoes.ts`
- Modify: `client-new-kpi/app/api/sessao/route.ts`
- Modify: `client-new-kpi/hooks/useSessao.ts`
- Modify: `client-new-kpi/app/login/FormularioDeLogin.tsx`

**Interfaces:**
- Consumes: `enderecoDaApi` (Task 2); `GET /api/auth/bases` e `POST /api/auth/login` com `base` (Task 5).
- Produces: `UsuarioDaSessao.base` e `UsuarioLogado.base`, ambos `{ id: string; rotulo: string }`; `BaseOferecida`, `escolherBaseInicial(lista, ultima)`, `lerUltimaBase()`, `guardarUltimaBase(id)`. As Tasks 10 a 12 leem `usuario.base`.

- [ ] **Step 1: O teste que falha (`bf3`, parte da base inicial)**

```js
/**
 * bf3 — as funções puras do front que decidem "de que base é isto": qual base vem marcada
 * no login, se uma resposta é da base da sessão, e as chaves de armazenamento por base.
 *
 *   node --experimental-strip-types docs/plataforma/validacao/bf3_front_por_base.mjs
 *
 * Roda os módulos REAIS do front no Node, sem navegador e sem banco. As Tasks 10 e 11
 * acrescentam suas seções antes do `console.log` final.
 */
import assert from "node:assert/strict";
import { escolherBaseInicial } from "../../../client-new-kpi/lib/baseInicial.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

// ── A base que vem marcada ao abrir o login ──────────────────────────────────────────
const lista = [
  { id: "Epoca", rotulo: "Época Distribuição" },
  { id: "MinasRural", rotulo: "Minas Rural" },
];

eq(escolherBaseInicial(lista, "MinasRural"), "MinasRural", "volta para a última que a pessoa usou");
eq(escolherBaseInicial(lista, null), "Epoca", "sem última, a primeira da lista");
// A lembrada pode ter saído da configuração. Devolvê-la mandaria um login para uma base que
// o servidor vai recusar — e a pessoa leria "escolha uma base" sem ter escolhido nada.
eq(escolherBaseInicial(lista, "Inventada"), "Epoca", "a última lembrada que saiu da lista é ignorada");
eq(escolherBaseInicial(lista, "minasrural"), "Epoca", "o id lembrado é comparado como está, não adivinhado");
eq(escolherBaseInicial([], "Epoca"), "", "lista vazia não inventa base: o botão de entrar fica desligado");
eq(escolherBaseInicial([], null), "", "e sem lembrança também");

console.log(`bf3 — ${n} conferências, todas passaram.`);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-strip-types docs/plataforma/validacao/bf3_front_por_base.mjs`
Expected: FAIL — `Cannot find module …/lib/baseInicial.ts`.

- [ ] **Step 3: `lib/baseInicial.ts`**

```ts
/** Uma base como o seletor do login a recebe de `GET /api/bases`. */
export interface BaseOferecida {
  id: string;
  rotulo: string;
}

/** Onde este navegador lembra a última base usada — conveniência por pessoa, nada além. */
export const CHAVE_ULTIMA_BASE = "epoca:login:ultimaBase";

/**
 * Qual base vem selecionada ao abrir o login: a última que a pessoa usou NESTE navegador, se
 * ela ainda estiver na lista; senão a primeira.
 *
 * <b>Nunca devolve uma base que não está na lista.</b> A lembrada pode ter saído da
 * configuração, e devolvê-la mandaria um login para uma base que o servidor vai recusar.
 * Lista vazia devolve `""`, que é o que mantém o botão de entrar desligado: sem base, não há
 * login.
 */
export function escolherBaseInicial(
  lista: readonly BaseOferecida[],
  ultima: string | null,
): string {
  if (ultima !== null) {
    const achada = lista.find((b) => b.id === ultima);
    if (achada) return achada.id;
  }

  return lista[0]?.id ?? "";
}

/** `try/catch` porque o armazenamento falha em janela anônima e com dados de site bloqueados. */
export function lerUltimaBase(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_BASE);
  } catch {
    return null;
  }
}

export function guardarUltimaBase(id: string): void {
  try {
    localStorage.setItem(CHAVE_ULTIMA_BASE, id);
  } catch {
    // Sem armazenamento a pessoa perde a conveniência de voltar à última base. Nada além.
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --experimental-strip-types docs/plataforma/validacao/bf3_front_por_base.mjs`
Expected: `bf3 — 6 conferências, todas passaram.`

- [ ] **Step 5: A sessão guarda a base (`sessoes.ts`)**

Em `client-new-kpi/lib/servidor/sessoes.ts`, no fim de `UsuarioDaSessao`, depois de `readonly rotinas: readonly string[];`:

```ts
  /**
   * A base em que esta pessoa entrou. <b>Faz parte da identidade:</b> a matrícula 144 da
   * Época e a 144 do Minas Rural são pessoas diferentes. Vem da API, que a leu do token que
   * ela mesma emitiu.
   */
  readonly base: { readonly id: string; readonly rotulo: string };
```

E em `lerSessao`, **entre** o bloco do `Array.isArray(sessao.usuario.rotinas)` e `return sessao;`:

```ts
  // Mesma razão, para a base: sessão sem ela é de antes da bifurcação (Fast Refresh em
  // desenvolvimento, que recarrega o módulo sem reiniciar o processo). Sem base nenhuma
  // consulta saberia onde rodar, e o proxy a recusaria de qualquer jeito — só que com um 401
  // sem explicação. Melhor encerrar aqui e mandar a pessoa entrar.
  if (!sessao.usuario.base?.id) {
    sessoes.delete(id);
    return null;
  }

```

- [ ] **Step 6: O BFF do login (`app/api/sessao/route.ts`)**

Oito edições:

1. **Importar o endereço da API** — logo depois de `import { esquecerTentativas, registrarTentativa } from "@/lib/servidor/limiteDeTentativas";`:

```ts
import { enderecoDaApi } from "@/lib/servidor/urlDaApi";
```

2. **Apagar a constante `API` e o seu comentário** (de `/**\n * Onde a API .NET está, do ponto de vista DESTE processo.` até `  "http://localhost:5207";`). A lógica agora mora em `lib/servidor/urlDaApi.ts`, a mesma que o proxy usa — duas cópias do mesmo `??` em cascata era o que ia divergir.
3. **`RespostaDaApi`**: dentro de `usuario: {…}`, depois de `rotinas: string[];`, acrescente `base: { id: string; rotulo: string };`.
4. **O corpo recebido**: `let corpo: { login?: unknown; senha?: unknown };` → `let corpo: { login?: unknown; senha?: unknown; base?: unknown };`.
5. **Ler a base**, depois de `const senha = typeof corpo.senha === "string" ? corpo.senha : "";`:

```ts
  // A base NÃO é validada aqui: quem sabe quais bases existem é a API, e repetir a lista no
  // BFF seria mantê-la em dois lugares. Vazia ou desconhecida, a API responde 400 com a
  // mensagem certa, e o 400 passa como está (item 7).
  const base = typeof corpo.base === "string" ? corpo.base.trim() : "";
```

6. **A chamada à API**:

```ts
    resposta = await fetch(enderecoDaApi("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, senha, base }),
```

(troca `fetch(\`${API}/api/auth/login\`, {` e o `body: JSON.stringify({ login, senha }),`.)

7. **Repassar 400 e 503**: **substitua** o `return NextResponse.json(…, { status: resposta.status === 400 ? 400 : 401 });` por:

```ts
    // 400 (campo ou base inválida) e 503 (a base não respondeu) passam como são. O 503 em
    // especial: virar 401 faria a pessoa ler "usuário ou senha incorretos" para um banco fora
    // do ar, e ela trocaria a senha para resolver um problema que não é dela.
    const repassa = resposta.status === 400 || resposta.status === 503;
    return NextResponse.json(
      { sucesso: false, mensagem: conteudo?.mensagem ?? "Não foi possível entrar." },
      { status: repassa ? resposta.status : 401 },
    );
```

8. **Guardar a base na sessão** — logo depois de `const { token, expiraEm, usuario } = conteudo.dados;`:

```ts
  // Uma API que não diz a base é uma API anterior à bifurcação (ou um defeito dela). Seguir
  // criaria uma sessão que o proxy recusaria na primeira chamada, com um 401 que ninguém
  // saberia explicar.
  if (!usuario.base?.id) {
    return NextResponse.json(
      { sucesso: false, mensagem: "A API não informou a base da sessão. Atualize a API e tente de novo." },
      { status: 502 },
    );
  }
```

e, em `criarSessao(…)`, depois da linha `rotinas: usuario.rotinas ?? [],`:

```ts
    base: usuario.base,
```

- [ ] **Step 7: `GET /api/bases`**

```ts
// client-new-kpi/app/api/bases/route.ts
import { NextResponse } from "next/server";
import { enderecoDaApi } from "@/lib/servidor/urlDaApi";

/**
 * As bases do seletor do login. Público, como o próprio login: antes de haver sessão a tela
 * precisa saber o que oferecer.
 *
 * Só repassa `GET /api/auth/bases` da API, que devolve id e rótulo — nunca host, usuário nem
 * string de conexão. `/api/bases` tem arquivo próprio porque o proxy de `app/api/[...caminho]`
 * não repassa `auth/*`, de propósito.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const resposta = await fetch(enderecoDaApi("/api/auth/bases"), { cache: "no-store" });
    const conteudo = await resposta.json();
    return NextResponse.json(conteudo, { status: resposta.status });
  } catch {
    return NextResponse.json(
      { sucesso: false, mensagem: "Não foi possível falar com o servidor. Tente de novo." },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 8: `useSessao`**

Em `client-new-kpi/hooks/useSessao.ts`, no `UsuarioLogado`, depois de `rotinas: string[];`:

```ts
  /** A base da sessão. Vai em toda chave de cache e de armazenamento que depende da pessoa. */
  base: { id: string; rotulo: string };
```

- [ ] **Step 9: O formulário**

Em `client-new-kpi/app/login/FormularioDeLogin.tsx`, cinco edições:

1. Imports: `import { useState, type FormEvent } from "react";` →

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { destinoSeguro } from "@/lib/destinoSeguro";
import {
  escolherBaseInicial,
  guardarUltimaBase,
  lerUltimaBase,
  type BaseOferecida,
} from "@/lib/baseInicial";
```

(e apague o `import { destinoSeguro }` original, que passou a vir na linha acima.)

2. Estado e carga, depois de `const [entrando, setEntrando] = useState(false);`:

```tsx
  // As bases que o login oferece. `null` = ainda carregando; lista vazia = nenhuma disponível.
  const [bases, setBases] = useState<BaseOferecida[] | null>(null);
  const [base, setBase] = useState("");

  useEffect(() => {
    let cancelado = false;

    fetch("/api/bases", { cache: "no-store" })
      .then((r) => r.json())
      .then((conteudo) => {
        if (cancelado) return;
        const lista = (conteudo?.dados ?? []) as BaseOferecida[];
        setBases(lista);
        setBase(escolherBaseInicial(lista, lerUltimaBase()));
      })
      .catch(() => {
        if (!cancelado) setBases([]);
      });

    return () => {
      cancelado = true;
    };
  }, []);
```

3. O envio: `body: JSON.stringify({ login, senha }),` → `body: JSON.stringify({ login, senha, base }),`; e, **antes** do comentário `// De volta para onde a pessoa ia antes de ser desviada`, acrescente `guardarUltimaBase(base);`.
4. O campo, **entre** `<form onSubmit={entrar} className="flex flex-col gap-4">` e `<Campo id="login"`:

```tsx
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="base"
          className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase"
        >
          Base de dados
        </label>
        <div className="relative">
          <select
            id="base"
            name="base"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            disabled={bases === null || bases.length === 0}
            required
            className="campo-login appearance-none pr-10"
          >
            {bases === null && <option value="">Carregando…</option>}
            {bases?.length === 0 && <option value="">Nenhuma base disponível</option>}
            {bases?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.rotulo}
              </option>
            ))}
          </select>
          {/* A seta é nossa porque `appearance-none` leva a do navegador, que não acompanha
              os nossos temas. `text-muted` é token: existe nos dois. */}
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[var(--text-muted)]"
          >
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        </div>
        {bases !== null && bases.length === 0 && (
          <p role="alert" className="text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
            Nenhuma base de dados está disponível agora. Avise a TI.
          </p>
        )}
      </div>

```

5. O botão: no `<button type="submit"`, `disabled={entrando}` → `disabled={entrando || !base}`.

- [ ] **Step 10: Tipos**

Run: `cd client-new-kpi && npx tsc --noEmit`
Expected: limpo. (Se acusar `base` faltando em algum `UsuarioLogado` construído à mão — por exemplo num mock —, é aí que ele precisa do campo.)

- [ ] **Step 11: Conferir o seletor nos DOIS temas**

Com API e front no ar (a API **da Task 5**): abra `http://localhost:3000/login` pelo painel do navegador (`preview_start` com a configuração do front, ou `npm run dev`) e:

1. Confirme com `read_page` que o `<select>` **Base de dados** existe e tem `Época Distribuição` marcada.
2. No tema escuro e no claro (botão de tema da própria tela): `computer` → `screenshot` de cada. O texto da base e a seta têm de ser legíveis nos dois, e o `<option>` aberto não pode sair branco sobre branco. Meça: `javascript_tool` → `getComputedStyle(document.getElementById("base")).color` e `.backgroundColor` nos dois temas, e compare o contraste com o do campo **Usuário**, que é o padrão.
3. Pare a API e recarregue: o seletor deve mostrar *"Nenhuma base disponível"*, o botão **Entrar** desligado e o aviso *"Nenhuma base de dados está disponível agora. Avise a TI."*

- [ ] **Step 12: [Gabriel] Entrar de verdade**

Peça ao Gabriel: entrar na **Época** com o usuário dele; abrir o DRE; conferir no menu do usuário que a sessão existe. Em seguida, `curl -s http://localhost:3000/api/sessao` **com o cookie** (ou pela tela, no console: `await (await fetch("/api/sessao")).json()`) deve trazer `dados.base` = `{ id: "Epoca", rotulo: "Época Distribuição" }`.

- [ ] **Step 13: Commit**

```bash
git add client-new-kpi/app/api/bases/route.ts client-new-kpi/lib/baseInicial.ts client-new-kpi/lib/servidor/sessoes.ts client-new-kpi/app/api/sessao/route.ts client-new-kpi/hooks/useSessao.ts client-new-kpi/app/login/FormularioDeLogin.tsx docs/plataforma/validacao/bf3_front_por_base.mjs
git commit -m "feat(login): o seletor de base no login, e a base guardada na sessao do BFF"
```

---

### Task 7: A seção sem custo vira marcador

O primeiro dos três literais que variam por base. A Época segue **idêntica** (o `dc86` prova); o Minas Rural ainda tem o valor da Época.

**Files:**
- Modify: `api-new-kpi/Domain/Entities/RegrasDaBase.cs`
- Modify: `api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs` (2 literais) e `DreDetalheQueries.cs` (6 literais)
- Modify: `api-new-kpi/Infrastructure/Persistence/Repositories/DreGerencialRepository.cs`
- Modify: `docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs` (liga a conferência dos literais)

**Interfaces:**
- Consumes: `IBaseAtual` (Task 5); os cinco nomes de marcador da Task 1.
- Produces: `RegrasDaBase.MarcadorSecaoSemCusto` e o método privado `DreGerencialRepository.Final(string sql)` — **a única porta do SQL ao Oracle** que as Tasks 8 e 9 reaproveitam.

- [ ] **Step 1: Ligar a conferência dos literais e ver o `dc86` falhar**

No `dc86`, troque `const SECAO_JA_MIGRADA = false;` por `const SECAO_JA_MIGRADA = true;`.

Run: `node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs`
Expected: FAIL — `DreGerencialQueries.cs: literais 1601/1401 fora de comentário` (esperado 0, achou 2).

- [ ] **Step 2: Trocar os oito literais por marcador**

Os oito estão todos em SQL, nenhum em comentário (conferido em 07/10/2026):

```bash
sed -i 's/<> 1601/<> @@SECAO_SEM_CUSTO@@/' api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs api-new-kpi/Infrastructure/Persistence/Queries/DreDetalheQueries.cs
grep -c "@@SECAO_SEM_CUSTO@@" api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs api-new-kpi/Infrastructure/Persistence/Queries/DreDetalheQueries.cs
```
Expected: `DreGerencialQueries.cs:2` e `DreDetalheQueries.cs:6`. E `grep -rn 1601 api-new-kpi/Infrastructure/Persistence/Queries` não pode devolver nenhuma linha de SQL (só comentários, se houver).

- [ ] **Step 3: `RegrasDaBase.Aplicar` expande o marcador**

Em `RegrasDaBase.cs`, acrescente `using System.Globalization;` no topo (antes do `namespace`), e troque a lista de marcadores e o começo de `Aplicar`:

```csharp
    public const string MarcadorSecaoSemCusto = "@@SECAO_SEM_CUSTO@@";

    /// <summary>
    /// Todo marcador que <see cref="Aplicar"/> sabe expandir. O programa
    /// <c>docs/plataforma/validacao/verificar_regras.cs</c> imprime a expansão de cada um, e
    /// o <c>dc86</c> a compara com o que a Época tinha no SQL original.
    /// </summary>
    public static readonly IReadOnlyList<string> Marcadores = [MarcadorSecaoSemCusto];
```

(substitui a declaração `public static readonly IReadOnlyList<string> Marcadores = [];` e o seu comentário.) E em `Aplicar`, a linha `var pronto = sql;` vira:

```csharp
        var pronto = sql.Replace(
            MarcadorSecaoSemCusto,
            SecaoSemCusto.ToString(CultureInfo.InvariantCulture),
            StringComparison.Ordinal);
```

- [ ] **Step 4: Toda consulta do repositório passa por `Final`**

Em `DreGerencialRepository.cs`: `using Epoca.Kpi.Api.Application.Common.Bases;`, o campo, o construtor e o método:

```csharp
    private readonly IOracleConnectionFactory _conexoes;
    private readonly OpcoesDeParalelismo _paralelismo;
    private readonly IBaseAtual _baseAtual;

    public DreGerencialRepository(
        IOracleConnectionFactory conexoes,
        OpcoesDeParalelismo paralelismo,
        IBaseAtual baseAtual)
    {
        _conexoes = conexoes;
        _paralelismo = paralelismo;
        _baseAtual = baseAtual;
    }

    /// <summary>
    /// A ÚNICA porta do SQL ao Oracle: troca os marcadores pelo que a base da sessão manda.
    /// Toda consulta passa por aqui — o `dc86` falha se uma `CommandDefinition` escapar —, e
    /// <b>um marcador que sobrar lança</b>, em vez de seguir com o valor de outra base.
    /// </summary>
    private string Final(string sql) => _baseAtual.Base.Regras.Aplicar(sql);
```

Depois, **uma transformação mecânica** nos dez pontos (o primeiro argumento de toda `new CommandDefinition(` é `sql,` ou `DreGerencialQueries.X,`, conferido):

```bash
cat > "$TEMP/final.mjs" <<'EOF'
import fs from "node:fs";
const p = "api-new-kpi/Infrastructure/Persistence/Repositories/DreGerencialRepository.cs";
const t = fs.readFileSync(p, "utf8");
const crlf = t.includes("\r\n");
let n = 0;
const novo = t
  .replace(/\r\n/g, "\n")
  .replace(/new CommandDefinition\(\n(\s*)([A-Za-z_.]+),/g, (_, indent, arg) => {
    n++;
    return `new CommandDefinition(\n${indent}Final(${arg}),`;
  });
fs.writeFileSync(p, crlf ? novo.replace(/\n/g, "\r\n") : novo);
console.log(`${n} consultas passam por Final()`);
EOF
node "$TEMP/final.mjs"
```
Expected: `10 consultas passam por Final()`.

- [ ] **Step 5: Rodar o `dc86`**

Run: `node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs`
Expected: `dc86 — 18 conferências, todas passaram.` — as seções 1 a 5 ativas: o texto expandido com a Época **é o do commit-base**, não sobrou literal, o C# real expande `@@SECAO_SEM_CUSTO@@` para `1601` na Época, e as dez `CommandDefinition` passam por `Final(`.

- [ ] **Step 6: O C# diz `1401` quando a regra é ligada**

Run: `dotnet run docs/plataforma/validacao/verificar_regras.cs -p:BaseOutputPath="$TEMP/vr/"`
Expected: uma linha de JSON com `"Epoca":{"@@SECAO_SEM_CUSTO@@":"1601"}`, `"MinasRural":{"@@SECAO_SEM_CUSTO@@":"1601"}` (valor de partida) e `"_ligado":{"@@SECAO_SEM_CUSTO@@":"1401"}`.

- [ ] **Step 7: Compilar**

Run: `dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/kpi-build/"`
Expected: `0 Aviso(s)` e `0 Erro(s)`.

- [ ] **Step 8: [Gabriel] A prova numérica**

Reinicie a API. Com as credenciais em variável de ambiente (não no comando):

```bash
KPI_LOGIN=… KPI_SENHA=… node --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs docs/rotinas/9815-dre-gerencial/validacao/dc64_conta_principal_contra_a_9815.mjs
```
Expected: **45/45**, como antes. E o `dc34` (três dimensões concordam no mesmo `LUCRO LIQUIDO`) igual ao de antes. Qualquer diferença aqui é um marcador mal expandido, e o `dc86` deixou passar o que só o Oracle vê.

- [ ] **Step 9: Commit**

```bash
git add api-new-kpi docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs
git commit -m "refactor(bases): a secao sem custo vira marcador -- a Epoca segue identica"
```

---

### Task 8: As filiais fora do filtro e da permissão viram marcador

**Files:**
- Modify: `api-new-kpi/Domain/Entities/RegrasDaBase.cs`
- Modify: `api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs` (a consulta `Filiais`, linha do `NOT IN ('20','31','35','91')`)
- Modify: `api-new-kpi/Infrastructure/Persistence/Queries/AutenticacaoQueries.cs` (a consulta `FiliaisDoUsuario`, linha do `NOT IN (2, 99)`)

**Interfaces:**
- Consumes: `Final(sql)` (Task 7) e `baseAlvo.Regras.Aplicar(...)` no `AutenticacaoRepository` (Task 5) — **os dois pontos de uso já existem**.
- Produces: `RegrasDaBase.MarcadorFiliaisForaDoFiltro`, `MarcadorFiliaisForaDaPermissao`.

- [ ] **Step 1: Trocar os dois literais por marcador**

Só as linhas **de SQL** — a de `DreGerencialQueries.cs` que fala do mesmo texto num comentário (`/// <para><b>4. …`) não pode ser tocada, por isso a âncora de início de linha:

```bash
cat > "$TEMP/filiais.mjs" <<'EOF'
import fs from "node:fs";
function trocar(p, de, para) {
  const t = fs.readFileSync(p, "utf8");
  const crlf = t.includes("\r\n");
  const lf = t.replace(/\r\n/g, "\n");
  // `matchAll` com `g`: um `match` sem `g` devolve os grupos, e não a contagem.
  const achados = [...lf.matchAll(new RegExp(de.source, "gm"))];
  if (achados.length !== 1) throw new Error(`${p}: esperava 1 linha, achei ${achados.length}`);
  const novo = lf.replace(de, para);
  fs.writeFileSync(p, crlf ? novo.replace(/\n/g, "\r\n") : novo);
  console.log(`ok  ${p}`);
}
const Q = "api-new-kpi/Infrastructure/Persistence/Queries/";
trocar(Q + "DreGerencialQueries.cs", /^(\s*)AND F\.CODFIL NOT IN \('20','31','35','91'\)\s*$/m, "$1@@FILIAIS_FORA_DO_FILTRO@@");
trocar(Q + "AutenticacaoQueries.cs", /^(\s*)AND CODIGOA NOT IN \(2, 99\)\s*$/m, "$1@@FILIAIS_FORA_DA_PERMISSAO@@");
EOF
node "$TEMP/filiais.mjs"
```
Expected: duas linhas `ok`.

- [ ] **Step 2: `Aplicar` expande os dois**

Em `RegrasDaBase.cs`:

```csharp
    public const string MarcadorFiliaisForaDoFiltro = "@@FILIAIS_FORA_DO_FILTRO@@";
    public const string MarcadorFiliaisForaDaPermissao = "@@FILIAIS_FORA_DA_PERMISSAO@@";

    public static readonly IReadOnlyList<string> Marcadores =
    [
        MarcadorSecaoSemCusto,
        MarcadorFiliaisForaDoFiltro,
        MarcadorFiliaisForaDaPermissao,
    ];
```

e, em `Aplicar`, **depois** do `Replace` da seção e **antes** da verificação de `@@`:

```csharp
        // Lista vazia vira NADA — e não `NOT IN ()`, que o Oracle recusa. Os códigos do filtro
        // entram entre aspas porque `F.CODFIL` é texto; os da permissão entram como número,
        // como a 9815 faz (`CODIGOA NOT IN (2, 99)`). Os dois já foram validados (só dígito).
        pronto = pronto
            .Replace(
                MarcadorFiliaisForaDoFiltro,
                FiliaisForaDoFiltro.Count == 0
                    ? string.Empty
                    : $"AND F.CODFIL NOT IN ({string.Join(",", FiliaisForaDoFiltro.Select(f => $"'{f}'"))})",
                StringComparison.Ordinal)
            .Replace(
                MarcadorFiliaisForaDaPermissao,
                FiliaisForaDaPermissao.Count == 0
                    ? string.Empty
                    : $"AND CODIGOA NOT IN ({string.Join(", ", FiliaisForaDaPermissao)})",
                StringComparison.Ordinal);
```

- [ ] **Step 3: Rodar**

Run: `node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs`
Expected: `dc86 — 30 conferências, todas passaram.` Na Época, `Aplicar(@@FILIAIS_FORA_DO_FILTRO@@)` devolve exatamente `AND F.CODFIL NOT IN ('20','31','35','91')` e o outro `AND CODIGOA NOT IN (2, 99)`; os arquivos expandidos voltam ao commit-base.

Run: `dotnet run docs/plataforma/validacao/verificar_regras.cs -p:BaseOutputPath="$TEMP/vr/"`
Expected: no `MinasRural`, as duas expansões de filial são `""` (todas as filiais, a decisão de 07/10/2026).

- [ ] **Step 4: Compilar e `bf2`**

Run: `dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/kpi-build/"` → `0 Aviso(s)`, `0 Erro(s)`.
Run: `node docs/plataforma/validacao/bf2_login_por_base.mjs` → `bf2 — 36 conferências, todas passaram.` (o login agora aplica `Aplicar` à consulta de filiais; ele não pode quebrar.)

- [ ] **Step 5: [Gabriel] As filiais de quem entra**

Entrar na Época: o menu do usuário e o filtro do DRE têm de mostrar as **mesmas filiais de antes** para o usuário dele. Se faltar ou sobrar uma, o `NOT IN` não voltou ao que era.

- [ ] **Step 6: Commit**

```bash
git add api-new-kpi
git commit -m "refactor(bases): as filiais fora do filtro e da permissao viram marcador"
```

---

### Task 9: O ICMS vira marcador (desligado)

O último literal — e o único que **não existe** hoje no nosso SQL. Com `AgrupaIcms = false` o texto volta a ser o de hoje, byte a byte; a regra só vale quando for ligada, na Task 13, depois de medida.

**Files:**
- Modify: `api-new-kpi/Domain/Entities/RegrasDaBase.cs`
- Modify: `api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs` (as quatro `Despesas*`) e `DreDetalheQueries.cs` (`Lancamentos`)

**Interfaces:**
- Consumes: `Final(sql)` (Task 7).
- Produces: `RegrasDaBase.MarcadorRateioRc`, `MarcadorCodcontaLanc`. **As consultas `Estrutura*` NÃO são tocadas** — o Delphi só remapeia na despesa e no detalhamento.

- [ ] **Step 1: Marcar os cinco trechos**

```bash
cat > "$TEMP/icms.mjs" <<'EOF'
import fs from "node:fs";
const Q = "api-new-kpi/Infrastructure/Persistence/Queries/";

function editar(arquivo, regra) {
  const p = Q + arquivo;
  const t = fs.readFileSync(p, "utf8");
  const crlf = t.includes("\r\n");
  const { de, para, vezes } = regra;
  const lf = t.replace(/\r\n/g, "\n");
  const achados = [...lf.matchAll(de)].length;
  if (achados !== vezes) throw new Error(`${arquivo}: ${de} casou ${achados}, esperava ${vezes}`);
  const novo = lf.replace(de, para);
  fs.writeFileSync(p, crlf ? novo.replace(/\n/g, "\r\n") : novo);
  console.log(`ok  ${arquivo}  ${vezes}x  ${de}`);
}

// As quatro consultas de DESPESA: a tabela de rateio é uma linha SÓ da lista de FROM, e a
// coluna `codconta` da view de PCLANC também. As `Estrutura*` têm `FROM PCLANC FIN, PCCONTA
// CT, … PCRATEIOCENTROCUSTO RC, …` numa linha só: NÃO casam com a âncora de linha inteira.
editar("DreGerencialQueries.cs", { de: /^(\s*)PCRATEIOCENTROCUSTO RC,(\s*)$/gm, para: "$1@@RATEIO_RC@@ RC,$2", vezes: 4 });
editar("DreGerencialQueries.cs", { de: /^(\s*)codconta,(\s*)$/gm, para: "$1@@CODCONTA_LANC@@,$2", vezes: 4 });

// O DETALHAMENTO de lançamentos: as duas coisas estão no meio de linhas maiores.
editar("DreDetalheQueries.cs", { de: /PCCENTROCUSTO CC, PCRATEIOCENTROCUSTO RC,/g, para: "PCCENTROCUSTO CC, @@RATEIO_RC@@ RC,", vezes: 1 });
editar("DreDetalheQueries.cs", { de: /INDICE, codconta, TIPOPARCEIRO/g, para: "INDICE, @@CODCONTA_LANC@@, TIPOPARCEIRO", vezes: 1 });
EOF
node "$TEMP/icms.mjs"
```
Expected: quatro linhas `ok`, com `4x`, `4x`, `1x`, `1x`. **Se algum número divergir, pare**: o SQL mudou desde o levantamento e a âncora precisa ser reavaliada.

- [ ] **Step 2: Uma verificação que o `dc86` não faz — as colunas de `RC`**

A expansão ligada do rateio é uma subconsulta que só expõe quatro colunas. Se as consultas lessem outra coluna de `RC`, a regra ligada quebraria no Oracle sem o `dc86` perceber.

Run: `grep -ohiE "\bRC\.[a-z_]+" api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs api-new-kpi/Infrastructure/Persistence/Queries/DreDetalheQueries.cs | tr a-z A-Z | sort -u`
Expected: exatamente `RC.CODCONTA`, `RC.CODIGOCENTROCUSTO`, `RC.RECNUM`, `RC.VALOR`. Qualquer outra aparição exige acrescentar a coluna à subconsulta antes de seguir.

- [ ] **Step 3: `Aplicar` expande os dois**

Em `RegrasDaBase.cs`:

```csharp
    public const string MarcadorRateioRc = "@@RATEIO_RC@@";
    public const string MarcadorCodcontaLanc = "@@CODCONTA_LANC@@";

    // O grupo e a conta agrupadora do ICMS, como o Delphi os fixa (UBase.pas GetValorGrupo e
    // ULanc.pas): conta cujo nome tem ICMS e cujo grupo é 303 passa a ser a 3003007.
    private const int GrupoDeContasDoIcms = 303;
    private const int ContaAgrupadoraDoIcms = 3003007;

    // O rateio vira uma subconsulta que expõe as MESMAS quatro colunas que as consultas leem
    // de `RC` (recnum, codconta, valor, codigocentrocusto) — o Step 2 desta tarefa confere.
    private const string RateioComIcms =
        "(select rt.recnum, " +
        "case when upper(cta.conta) like '%ICMS%' and cta.grupoconta = 303 then 3003007 " +
        "else rt.codconta end as codconta, " +
        "rt.valor, rt.codigocentrocusto " +
        "from PCRATEIOCENTROCUSTO rt, PCCONTA cta where rt.codconta = cta.codconta)";

    private const string CodcontaComIcms =
        "(SELECT case when upper(conta) like '%ICMS%' and grupoconta = 303 then 3003007 " +
        "else codconta end FROM PCCONTA WHERE CODCONTA = PCLANC.CODCONTA) as codconta";
```

(`GrupoDeContasDoIcms` e `ContaAgrupadoraDoIcms` ficam como documentação dos números que estão dentro das duas strings; se um dia virarem configuração, é por eles que se começa.) E a lista de marcadores e o `Aplicar`:

```csharp
    public static readonly IReadOnlyList<string> Marcadores =
    [
        MarcadorSecaoSemCusto,
        MarcadorFiliaisForaDoFiltro,
        MarcadorFiliaisForaDaPermissao,
        MarcadorRateioRc,
        MarcadorCodcontaLanc,
    ];
```

```csharp
        // O ICMS DESLIGADO devolve o texto que as consultas tinham: `PCRATEIOCENTROCUSTO` e
        // `codconta`. É por isso que a Época não muda — o dc86 prova que a expansão é essa.
        pronto = pronto
            .Replace(MarcadorRateioRc, AgrupaIcms ? RateioComIcms : "PCRATEIOCENTROCUSTO", StringComparison.Ordinal)
            .Replace(MarcadorCodcontaLanc, AgrupaIcms ? CodcontaComIcms : "codconta", StringComparison.Ordinal);
```

(no mesmo ponto das filiais, antes da verificação de `@@`.)

- [ ] **Step 4: Rodar**

Run: `node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs`
Expected: `dc86 — 46 conferências, todas passaram.` — o texto das **três** consultas volta ao do commit-base com as cinco expansões da Época; a base sintética `_ligado` não tem `:` nem `@@` em nenhuma expansão.

Run: `dotnet run docs/plataforma/validacao/verificar_regras.cs -p:BaseOutputPath="$TEMP/vr/"`
Expected: `"Epoca"` com `"@@RATEIO_RC@@":"PCRATEIOCENTROCUSTO"` e `"@@CODCONTA_LANC@@":"codconta"`; `"_ligado"` com as duas subconsultas (contendo `3003007`).

- [ ] **Step 5: Compilar, `bf1` e `bf2`**

Run: `dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/kpi-build/"` → `0 Aviso(s)`, `0 Erro(s)`; `node docs/plataforma/validacao/bf1_registro_de_bases.mjs` e `bf2_login_por_base.mjs` passam.

- [ ] **Step 6: [Gabriel] A prova numérica da Época**

Reinicie a API e rode o `dc64` (45/45) e o `dc78` (o detalhamento fecha com a célula) como na Task 7. A regra de ICMS está **desligada**, então os números são os mesmos — se mudarem, a expansão desligada não é o texto original.

- [ ] **Step 7: Commit**

```bash
git add api-new-kpi
git commit -m "refactor(bases): o ICMS vira marcador, desligado -- a Epoca segue identica"
```

---
### Task 10: A resposta diz de que base veio, e o front recusa a que não é da sessão

A defesa em dobro da spec (§6): mesmo que um token, um cache ou um proxy errem, **a tela não mostra número de outra base**. A API carimba `base` na apuração e no detalhamento; o front compara com a sessão e, se diferir, lança em vez de renderizar.

**Files:**
- Modify: `api-new-kpi/Application/Features/DreGerencial/Dtos/DreGerencialDtos.cs`
- Modify: `api-new-kpi/Controllers/DreGerencialController.cs`
- Modify: `client-new-kpi/types/dre-gerencial.ts`
- Create: `client-new-kpi/lib/baseDaResposta.ts`
- Modify: `client-new-kpi/hooks/useDreGerencial.ts`
- Modify: `docs/plataforma/validacao/bf3_front_por_base.mjs`

**Interfaces:**
- Consumes: `BaseDto`, `IBaseAtual` (Tasks 4, 5); `UsuarioLogado.base` (Task 6).
- Produces: `ApuracaoDto.Base` e `DetalhamentoDto.Base` (`BaseDto?`, último parâmetro posicional, padrão `null`); `exigirMesmaBase<T>(resposta: T, baseDaSessao: string | undefined): T`, que lança `ApiError` (status 409, ou 0 sem sessão).

- [ ] **Step 1: O teste que falha (`bf3`, seção 2)**

No `bf3_front_por_base.mjs`: troque o comentário de cabeçalho do comando por `node --experimental-transform-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/bf3_front_por_base.mjs` (o `_alias` resolve o `@/` que `baseDaResposta.ts` usa; **`transform-types` e não `strip-types`** porque o `apiClient.ts`, que ela importa, usa propriedade de parâmetro no construtor — sintaxe que o modo de só apagar tipos recusa), acrescente o import e, **antes** do `console.log` final, a seção:

```js
import { exigirMesmaBase } from "../../../client-new-kpi/lib/baseDaResposta.ts";
```

```js
// ── A resposta é da base da sessão? ──────────────────────────────────────────────────
// REVIEW FOCUS 2 e a defesa em dobro: se um token, um cache ou um proxy errarem, a tela
// NÃO pode mostrar número de outra base.
const epoca = { id: "Epoca", rotulo: "Época Distribuição" };
const minas = { id: "MinasRural", rotulo: "Minas Rural" };

const mesma = { base: epoca, linhas: [] };
eq(exigirMesmaBase(mesma, "Epoca"), mesma, "a resposta da própria base passa, e é a MESMA (não uma cópia)");

for (const [resposta, sessao, oque] of [
  [{ base: minas }, "Epoca", "resposta do Minas Rural numa sessão da Época"],
  [{ base: epoca }, "MinasRural", "e o contrário"],
  [{}, "Epoca", "resposta SEM base (API antiga): recusa, não presume"],
  [{ base: null }, "Epoca", "base nula: recusa"],
]) {
  assert.throws(
    () => exigirMesmaBase(resposta, sessao),
    (e) => e.name === "ApiError" && e.status === 409 && /outra base/.test(e.message),
    oque,
  );
  n++;
}

// Sessão ainda não carregada: não dá para conferir, e conferir é a razão de existir. Recusa.
assert.throws(
  () => exigirMesmaBase({ base: epoca }, undefined),
  (e) => e.name === "ApiError" && e.status === 0,
  "sem a base da sessão, não exibe nada",
);
n++;

// O id é comparado como está: "epoca" e "Epoca" são ids diferentes para quem confere.
assert.throws(() => exigirMesmaBase({ base: epoca }, "epoca"), /outra base/, "a caixa conta");
n++;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-transform-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/bf3_front_por_base.mjs`
Expected: FAIL — `Cannot find module …/lib/baseDaResposta.ts`.

- [ ] **Step 3: `lib/baseDaResposta.ts`**

```ts
import { ApiError } from "@/services/apiClient";

/**
 * Confere que uma resposta do DRE é da base da sessão — e lança se não for.
 *
 * <b>É a segunda barreira, e existe de propósito.</b> A primeira é o token: a API consulta na
 * base que o JWT diz. Esta pega o que a primeira não pega: uma aba velha, um cache mal
 * chaveado, um proxy configurado para a API errada. Numa tela financeira, "os números estão
 * plausíveis, só são de outra empresa" é o pior defeito possível — porque ninguém o percebe.
 *
 * <b>Falha fechada em tudo o que não for igualdade exata:</b> resposta sem `base` (uma API
 * anterior à bifurcação), `base` nula, e sessão ainda sem base. Presumir que "deve estar
 * certo" é exatamente o que esta função existe para não fazer.
 */
export function exigirMesmaBase<T extends { base?: { id: string } | null }>(
  resposta: T,
  baseDaSessao: string | undefined,
): T {
  if (baseDaSessao === undefined) {
    throw new ApiError(
      "Não foi possível confirmar a base da sessão. Recarregue a página e entre de novo.",
      0,
    );
  }

  if (resposta.base?.id !== baseDaSessao) {
    throw new ApiError(
      `Esta resposta veio de outra base (${resposta.base?.id ?? "nenhuma"}) que a da sessão ` +
        `(${baseDaSessao}). Os números não foram exibidos. Entre de novo.`,
      409,
    );
  }

  return resposta;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --experimental-transform-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/bf3_front_por_base.mjs`
Expected: `bf3 — 13 conferências, todas passaram.` (6 da Task 6 + 7 desta.)

- [ ] **Step 5: O carimbo no back-end**

`DreGerencialDtos.cs` — o `ApuracaoDto` ganha o último parâmetro (hoje termina em `IReadOnlyList<decimal> Fornecedores);`) e o `DetalhamentoDto` o seu (hoje termina em `decimal Participacao = 1m)`):

```csharp
    IReadOnlyList<decimal> Fornecedores,
    /// <summary>
    /// A base de onde estes números vieram — a do token da requisição. O front a compara com a
    /// da sessão e <b>recusa renderizar se diferir</b>: a segunda barreira contra uma apuração
    /// na base errada, depois do token.
    /// </summary>
    BaseDto? Base = null);
```

```csharp
    decimal Participacao = 1m,
    BaseDto? Base = null)
```

(com `using Epoca.Kpi.Api.Application.Common.Bases;` no topo do arquivo.)

`Controllers/DreGerencialController.cs` — `using Epoca.Kpi.Api.Application.Common.Bases;`, o `IBaseAtual` no construtor e o carimbo nas duas respostas. **Aqui, e não no serviço**: o `DetalhamentoDto` é construído em cinco lugares do serviço, e carimbar na saída do controller é uma linha por rota, em vez de cinco chamadas para esquecer uma.

```csharp
    private readonly DreGerencialService _servico;
    private readonly IBaseAtual _baseAtual;

    public DreGerencialController(DreGerencialService servico, IBaseAtual baseAtual)
    {
        _servico = servico;
        _baseAtual = baseAtual;
    }
```

(no lugar de `private readonly DreGerencialService _servico;` e da linha do construtor.) E os dois retornos:

```csharp
        return Ok(ApiResponse<ApuracaoDto>.Ok(
            resultado.Valor! with { Base = BaseDto.De(_baseAtual.Base) }));
```

```csharp
        return Ok(ApiResponse<DetalhamentoDto>.Ok(
            resultado.Valor! with { Base = BaseDto.De(_baseAtual.Base) }));
```

(substituem `return Ok(ApiResponse<ApuracaoDto>.Ok(resultado.Valor!));` e `return Ok(ApiResponse<DetalhamentoDto>.Ok(resultado.Valor!));`.)

- [ ] **Step 6: O front exige**

`types/dre-gerencial.ts` — logo depois da abertura de cada uma das duas interfaces (`export interface Detalhamento {` e `export interface Apuracao {`):

```ts
  /**
   * A base de onde a API tirou estes números. <b>Opcional no tipo</b> porque uma API anterior
   * à bifurcação não a manda — mas `exigirMesmaBase` recusa a resposta que não a traz.
   */
  base?: { id: string; rotulo: string } | null;
```

`hooks/useDreGerencial.ts` — `import { exigirMesmaBase } from "@/lib/baseDaResposta";` e as duas mutações (a base da sessão vem do `useSessao`, já importado):

```ts
export function useApuracao() {
  const { data: usuario } = useSessao();

  return useMutation({
    mutationFn: async (filtro: FiltroApuracao) =>
      exigirMesmaBase(
        await apiClient.post<Apuracao>("/api/dre-gerencial/apuracao", paraApi(filtro)),
        usuario?.base.id,
      ),
  });
}
```

(substitui o corpo de `useApuracao`.) E no `useDetalhe`, o mesmo embrulho — mantendo o comentário que já está lá —:

```ts
export function useDetalhe() {
  const { data: usuario } = useSessao();

  return useMutation({
    // Pelo `paraApi` como a apuração, e não pelo filtro cru: a tela guarda os fornecedores
    // como OBJETOS, e o servidor só quer os códigos. Mandar o objeto inteiro faria a
    // desserialização falhar no primeiro campo que ele não conhece — e o detalhe voltaria
    // sem filtro nenhum, mostrando a filial toda com cara de certo.
    mutationFn: async ({ tipo, bloco, chave, ...filtro }: FiltroDetalhe) =>
      exigirMesmaBase(
        await apiClient.post<Detalhamento>("/api/dre-gerencial/detalhe", {
          ...paraApi(filtro),
          tipo,
          bloco,
          chave,
        }),
        usuario?.base.id,
      ),
  });
}
```

- [ ] **Step 7: Compilar tudo**

Run: `dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/kpi-build/"` → `0 Aviso(s)`, `0 Erro(s)`.
Run: `cd client-new-kpi && npx tsc --noEmit` → limpo.
Run: `node docs/plataforma/validacao/bf2_login_por_base.mjs` → `bf2 — 36 conferências, todas passaram.`

- [ ] **Step 8: [Gabriel] A resposta traz a base**

Com a API reiniciada, entrar, apurar um mês e abrir o detalhamento de uma linha. No painel de rede do navegador (ou `curl` com o cookie), a resposta de `/api/dre-gerencial/apuracao` e a de `/detalhe` têm `"base":{"id":"Epoca","rotulo":"Época Distribuição"}`, e **a tela mostra os números normalmente**.

Prova do avesso, **sem tocar em código**: no console da aba, `await fetch("/api/sessao")` mostra a base da sessão; num teste manual, peça a um segundo navegador que entre no Minas Rural e confirme que a aba da Época, depois de a sessão dela ser substituída, **não** continua mostrando números do Minas Rural nem o contrário.

- [ ] **Step 9: Commit**

```bash
git add api-new-kpi client-new-kpi docs/plataforma/validacao/bf3_front_por_base.mjs
git commit -m "feat(bases): a resposta diz de que base veio, e o front recusa a que nao e da sessao"
```

---

### Task 11: As chaves do navegador levam a base

A mesma matrícula em duas bases não pode dividir cache, ordem salva nem nada que o navegador guarde por pessoa (Review Focus 2).

**Sobre `queryClient.clear()`:** a spec previa limpar o cache ao entrar e ao sair. **Não é preciso** — e acrescentar a chamada esconderia a razão. O login (`window.location.replace`) e o "Sair" (`window.location.replace("/login")`) são **navegações duras**, que descartam o `QueryClient` da memória inteiro; os comentários de `FormularioDeLogin.tsx` e `MenuDoUsuario.tsx` já dizem que é de propósito. Quem trocar uma delas por `router.push` quebra a garantia — por isso as chaves levam a base: é a segunda barreira, para o dia em que isso acontecer.

**Files:**
- Create: `client-new-kpi/lib/chavesPorBase.ts`
- Modify: `client-new-kpi/hooks/useOrdemSalva.ts`
- Modify: `client-new-kpi/components/dre-gerencial/TabelaDre.tsx`
- Modify: `client-new-kpi/hooks/useDreGerencial.ts`
- Modify: `docs/plataforma/validacao/bf3_front_por_base.mjs`

**Interfaces:**
- Consumes: `UsuarioLogado.base` (Task 6).
- Produces: `chaveDaOrdem(baseId, analise)`, `chavesAntigasDaOrdem(baseId, analise): string[]`, `chaveDeFiliais(baseId, matricula)`, `chaveDeFornecedores(baseId, termo)`; `useOrdemSalva(baseId: string, analise: Analise)`.

- [ ] **Step 1: O teste que falha (`bf3`, seção 3)**

Import no topo do `bf3` e a seção antes do `console.log`:

```js
import {
  chaveDaOrdem,
  chaveDeFiliais,
  chaveDeFornecedores,
  chavesAntigasDaOrdem,
} from "../../../client-new-kpi/lib/chavesPorBase.ts";
```

```js
// ── A mesma matrícula em duas bases NÃO divide nada ──────────────────────────────────
// REVIEW FOCUS 2. A matrícula 144 da Época e a 144 do Minas Rural são pessoas diferentes.
eq(chaveDaOrdem("Epoca", "grupo") === chaveDaOrdem("MinasRural", "grupo"), false, "a ordem salva é por base");
eq(chaveDaOrdem("Epoca", "grupo") === chaveDaOrdem("Epoca", "ccusto"), false, "e continua por análise");

eq(
  JSON.stringify(chaveDeFiliais("Epoca", 144)) === JSON.stringify(chaveDeFiliais("MinasRural", 144)),
  false,
  "as filiais em cache: mesma matrícula, bases diferentes, entradas diferentes",
);
eq(
  JSON.stringify(chaveDeFornecedores("Epoca", "29")) === JSON.stringify(chaveDeFornecedores("MinasRural", "29")),
  false,
  "o cadastro de fornecedores em cache também",
);

// A ordem que a pessoa já tinha (a v1, de antes das bases) é da ÉPOCA — era a única que
// existia — e de mais ninguém. Entregá-la ao Minas Rural aplicaria ali uma ordem de outro
// cadastro de linhas.
eq(chavesAntigasDaOrdem("Epoca", "grupo"), ["epoca:dre:ordem:v1:grupo"], "a Época herda a ordem v1");
eq(chavesAntigasDaOrdem("MinasRural", "grupo"), [], "o Minas Rural não herda nada");
eq(chaveDaOrdem("Epoca", "grupo").includes(":v2:"), true, "a chave nova é v2, para nunca colidir com a v1");

// Antes de a sessão chegar não há base: as chaves de cache aceitam `null`, e é isso que
// permite os hooks ficarem desligados (`enabled: false`) em vez de usarem uma base inventada.
eq(chaveDeFiliais(null, null)[2], null, "sem base, a chave diz null — nunca uma base presumida");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-transform-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/bf3_front_por_base.mjs`
Expected: FAIL — `Cannot find module …/lib/chavesPorBase.ts`.

- [ ] **Step 3: `lib/chavesPorBase.ts`**

```ts
/**
 * As chaves que o NAVEGADOR usa para guardar algo por pessoa — cache e armazenamento local.
 *
 * <b>A base é parte da chave.</b> A matrícula 144 da Época e a 144 do Minas Rural são pessoas
 * diferentes, e as linhas do DRE de uma não são as da outra. Uma chave sem base é um dado de
 * uma empresa sendo aplicado à outra.
 *
 * Tudo o que depende da base mora aqui, e não espalhado pelos hooks: foi o `useOrdemSalva`
 * guardando por análise e por mais nada que mostrou o que acontece quando cada arquivo
 * decide sozinho o que entra na chave.
 */

/** A base cujas chaves ANTIGAS (de antes das bases) continuam valendo: era a única que existia. */
const BASE_DAS_CHAVES_ANTIGAS = "Epoca";

/** A ordem salva das linhas, por base e por análise. `v2` para nunca colidir com a `v1`. */
export const chaveDaOrdem = (baseId: string, analise: string) =>
  `epoca:dre:ordem:v2:${baseId}:${analise}`;

/**
 * As chaves de ANTES das bases (`v1`), que a pessoa pode ainda ter no navegador. Só a Época
 * as herda: ninguém perde a ordem que já tinha, e o Minas Rural nasce limpo.
 */
export const chavesAntigasDaOrdem = (baseId: string, analise: string): string[] =>
  baseId === BASE_DAS_CHAVES_ANTIGAS ? [`epoca:dre:ordem:v1:${analise}`] : [];

/** As filiais em cache. `null` antes de a sessão chegar: o hook fica desligado, não presume. */
export const chaveDeFiliais = (baseId: string | null, matricula: number | null) =>
  ["dre-gerencial", "filiais", baseId, matricula] as const;

/**
 * O cadastro de fornecedores em cache. <b>A busca por termo e a resolução por código usam a
 * MESMA chave</b> — é o que faz `29,253,` aproveitar o `29` que já apareceu na lista —, e por
 * isso as duas a pedem daqui.
 */
export const chaveDeFornecedores = (baseId: string | null, termo: string) =>
  ["dre-gerencial", "fornecedores", baseId, termo] as const;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --experimental-transform-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/bf3_front_por_base.mjs`
Expected: `bf3 — 21 conferências, todas passaram.`

- [ ] **Step 5: `useOrdemSalva` por base**

Em `client-new-kpi/hooks/useOrdemSalva.ts`, cinco edições:

1. **O comentário e a constante da chave** (de `/**\n * A ordem é **por dimensão de análise**.` até `const chaveArmazenamento = …;`) são substituídos por:

```ts
import { chaveDaOrdem, chavesAntigasDaOrdem } from "@/lib/chavesPorBase";

/**
 * A ordem é **por base e por dimensão de análise**. Grupo de Contas e Centro de Custo não
 * compartilham uma linha sequer — uma ordem salva numa não diz nada sobre a outra — e as
 * linhas do Minas Rural não são as da Época. Não entra filial nem período na chave: a
 * estrutura do DRE é a mesma nos dois recortes. As chaves moram em `lib/chavesPorBase.ts`.
 */
```

2. **`ler`**: o cabeçalho e o primeiro `try` — de `function ler(analise: Analise): string[] | null {` até o `} catch {` do `localStorage.getItem` — viram:

```ts
function ler(baseId: string, analise: Analise): string[] | null {
  // Sem base conhecida (a sessão ainda não chegou), não há ordem a ler: aplicar a de outra
  // base seria exatamente o engano que a chave por base existe para impedir.
  if (!baseId) return null;

  const chave = chaveDaOrdem(baseId, analise);

  let bruto: string | null;
  try {
    // A chave desta base; e, só para a Época, a de ANTES das bases (v1), para ninguém perder
    // a ordem que já tinha. Na primeira vez que a pessoa reordenar, a v2 passa a valer.
    bruto = localStorage.getItem(chave);
    for (const antiga of chavesAntigasDaOrdem(baseId, analise)) {
      if (bruto !== null) break;
      bruto = localStorage.getItem(antiga);
    }
  } catch {
```

3. **A assinatura do hook**: `export function useOrdemSalva(analise: Analise) {` → `export function useOrdemSalva(baseId: string, analise: Analise) {` e `() => ler(analise),` → `() => ler(baseId, analise),`.
4. **`salvar`**: o `try { localStorage.setItem(chaveArmazenamento(analise), … ` vira

```ts
      if (!baseId) return;
      try {
        localStorage.setItem(chaveDaOrdem(baseId, analise), JSON.stringify(chaves));
```

e a lista de dependências logo abaixo, `[analise],` → `[baseId, analise],`.
5. **`limpar`** inteiro:

```ts
  const limpar = useCallback(() => {
    if (!baseId) return;
    try {
      localStorage.removeItem(chaveDaOrdem(baseId, analise));
      // E as antigas: sem isto, "Restaurar ordem do cadastro" devolveria a v1 pela porta dos
      // fundos, e a pessoa veria a ordem voltar sozinha.
      for (const antiga of chavesAntigasDaOrdem(baseId, analise)) {
        localStorage.removeItem(antiga);
      }
    } catch {
      /* idem */
    }
    avisar();
  }, [baseId, analise]);
```

- [ ] **Step 6: Quem chama**

`components/dre-gerencial/TabelaDre.tsx` — depois de `import { useOrdemSalva } from "@/hooks/useOrdemSalva";`:

```tsx
import { useSessao } from "@/hooks/useSessao";
```

e a linha `const { ordem, salvar, limpar } = useOrdemSalva(filtro.analise);` vira:

```tsx
  // A base da sessão entra na chave da ordem salva. Sem sessão ainda, `""` — e o hook, sem
  // base, não lê nem grava: melhor a ordem do cadastro por um instante que a de outra base.
  const { data: usuario } = useSessao();
  const { ordem, salvar, limpar } = useOrdemSalva(usuario?.base.id ?? "", filtro.analise);
```

- [ ] **Step 7: Os hooks de cache**

Em `hooks/useDreGerencial.ts`: `import { chaveDeFiliais, chaveDeFornecedores } from "@/lib/chavesPorBase";`, e:

1. `useFiliais`: `queryKey: ["dre-gerencial", "filiais", usuario?.matricula ?? null],` → `queryKey: chaveDeFiliais(usuario?.base.id ?? null, usuario?.matricula ?? null),`.
2. `useBuscarFornecedores`: depois de `const termo = busca.trim();` acrescente

```ts
  const { data: usuario } = useSessao();
  const baseId = usuario?.base.id ?? null;
```

`queryKey: ["dre-gerencial", "fornecedores", termo],` → `queryKey: chaveDeFornecedores(baseId, termo),` e `enabled: termo.length >= 2 || /^\d+$/.test(termo),` → `enabled: baseId !== null && (termo.length >= 2 || /^\d+$/.test(termo)),`.
3. `useFornecedoresPorCodigo`: antes do `return useQueries({`, as mesmas duas linhas de `useSessao`/`baseId`; e dentro de cada consulta, `queryKey: ["dre-gerencial", "fornecedores", String(codigo)],` → `queryKey: chaveDeFornecedores(baseId, String(codigo)),` com `enabled: baseId !== null,` logo abaixo.

- [ ] **Step 8: Tipos**

Run: `cd client-new-kpi && npx tsc --noEmit` → limpo.

- [ ] **Step 9: [Gabriel] Nada se perde na Época**

Com um navegador que **já tenha** uma ordem salva do DRE (a v1): entrar na **Época**, abrir o DRE e confirmar que a ordem arrastada **continua lá**. Reordenar uma linha; recarregar: a nova vale. Clicar em *Restaurar ordem do cadastro*: volta ao cadastro **e continua assim após recarregar** (se a v1 não fosse apagada, a ordem velha voltaria sozinha).

No Minas Rural (quando houver sessão lá): a tabela nasce **na ordem do cadastro**, sem herdar a ordem da Época.

- [ ] **Step 10: Commit**

```bash
git add client-new-kpi docs/plataforma/validacao/bf3_front_por_base.mjs
git commit -m "feat(bases): as chaves de cache e de ordem salva levam a base"
```

---

### Task 12: A base à vista

A pergunta de quem recebe um DRE impresso é "de que empresa?". A base passa a aparecer no menu, no cabeçalho da apuração, no papel, na tela cheia, no detalhamento aberto e no nome do Excel. Texto, **não cor**: tem de existir nos dois temas sem depender de nenhum deles.

**Files:**
- Modify: `client-new-kpi/components/layout/MenuDoUsuario.tsx`
- Modify: `client-new-kpi/app/dre-gerencial/page.tsx`
- Modify: `client-new-kpi/lib/exportarExcel.ts`
- Modify: `docs/rotinas/9815-dre-gerencial/validacao/dc13_excel_da_apuracao.mjs`

**Interfaces:**
- Consumes: `UsuarioLogado.base` (Task 6).
- Produces: `nomeDoArquivo(dados: Apuracao, baseId?: string): string` e `exportarApuracao(dados, linhas, analise?, baseId?)`.

- [ ] **Step 1: O teste que falha (`dc13`)**

Em `docs/rotinas/9815-dre-gerencial/validacao/dc13_excel_da_apuracao.mjs`, **antes** do `console.log` final:

```js
// O NOME DO ARQUIVO diz de que base ele é. Dois DREs de bases diferentes para o mesmo período
// não podem ter o mesmo nome: quem arquiva não teria como distinguir.
eq(nomeDoArquivo(dados), "DRE_ccusto-principal_2026-07-01_a_2026-08-27", "sem base, o nome é o de sempre");
eq(
  nomeDoArquivo(dados, "MinasRural"),
  "DRE_MinasRural_ccusto-principal_2026-07-01_a_2026-08-27",
  "com base, o id dela entra logo depois do DRE",
);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc13_excel_da_apuracao.mjs`
Expected: FAIL — o segundo `eq` recebe o nome sem a base.

- [ ] **Step 3: O nome do arquivo**

Em `client-new-kpi/lib/exportarExcel.ts`: a linha `export function nomeDoArquivo(dados: Apuracao): string {` vira o par abaixo (o comentário que já está acima dela passa a documentar a função pública, e o corpo antigo vira `nomeSemBase`):

```ts
export function nomeDoArquivo(dados: Apuracao, baseId?: string): string {
  const nome = nomeSemBase(dados);

  // O ID da base, e não o rótulo: é ASCII, estável, e não precisa passar pela limpeza de nome
  // de arquivo. Entra logo depois de `DRE_` para os arquivos de uma base ficarem juntos na
  // pasta de quem arquiva.
  return baseId ? nome.replace(/^DRE_/, `DRE_${baseId}_`) : nome;
}

function nomeSemBase(dados: Apuracao): string {
```

E em `exportarApuracao`:

```ts
export async function exportarApuracao(
  dados: Apuracao,
  linhas: readonly LinhaDre[],
  analise: ColunasDeAnalise = TUDO,
  baseId?: string,
): Promise<void> {
  const blob = await gerarPlanilha([planilhaDaApuracao(dados, linhas, analise)]);
  baixar(blob, `${nomeDoArquivo(dados, baseId)}.xlsx`);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc13_excel_da_apuracao.mjs`
Expected: `dc13: 45/45 asserções passaram. Arquivo gerado, reaberto e conferido.` (eram 43.)

- [ ] **Step 5: O menu do usuário**

`components/layout/MenuDoUsuario.tsx` — o `title` do botão:

```tsx
        title={`${usuario.nome} — ${usuario.base.rotulo} — ${usuario.filiais.length} filiais`}
```

e, no painel, **logo depois** do `<span>` de `{usuario.nomeGuerra} · matrícula {usuario.matricula}`:

```tsx
            <span className="text-[length:var(--fs-apoio)] font-medium text-[var(--text-secondary)]">
              Base: {usuario.base.rotulo}
            </span>
```

- [ ] **Step 6: A tela do DRE**

Em `client-new-kpi/app/dre-gerencial/page.tsx`, seis edições:

1. Import, depois de `import { useApuracao, useFiliais } from "@/hooks/useDreGerencial";`:

```tsx
import { useSessao } from "@/hooks/useSessao";
```

2. Depois de `const apuracao = useApuracao();`:

```tsx
  const { data: usuario } = useSessao();
```

3. Depois do bloco `const filiaisApuradas = descreverFiliais(…);`:

```tsx
  // A BASE entra onde o papel já diz o que foi apurado. Um DRE impresso circula semanas
  // depois, e "qual empresa?" é a primeira pergunta de quem o recebe. A mesma frase vai ao
  // detalhamento aberto em outra aba (via `TabelaDre`), que não tem a sessão em memória.
  const baseApurada = usuario?.base.rotulo ?? null;
  const detalheDasFiliais =
    baseApurada === null
      ? filiaisApuradas.detalhe
      : `Base: ${baseApurada} · ${filiaisApuradas.detalhe}`;
```

4. O cabeçalho da apuração: **antes** de `{descreverPeriodo(dados)} ·{" "}`:

```tsx
                    {baseApurada !== null && (
                      <>
                        <span className="font-medium text-[var(--text-secondary)]">
                          {baseApurada}
                        </span>{" "}
                        ·{" "}
                      </>
                    )}
```

5. O parágrafo do papel e da tela cheia: `{filiaisApuradas.detalhe}` (dentro de `<p className="filiais-descritas …">`) → `{detalheDasFiliais}`; e a propriedade da tabela `filiaisApuradas={filiaisApuradas.detalhe}` → `filiaisApuradas={detalheDasFiliais}` (é por ela que o detalhamento aberto herda a base).
6. O Excel: a chamada passa a base, e o `useCallback` a declara como dependência:

```tsx
      await exportarApuracao(
        apuracao,
        naTela.length > 0 ? naTela : apuracao.linhas,
        { av: mostrarAv, ah: mostrarAh },
        usuario?.base.id,
      );
```

```tsx
  }, [mostrarAv, mostrarAh, usuario?.base.id]);
```

- [ ] **Step 7: Tipos**

Run: `cd client-new-kpi && npx tsc --noEmit` → limpo.

- [ ] **Step 8: Conferir na tela, nos dois temas, e no papel**

Com API e front no ar e uma sessão (o Gabriel entra; a leitura sem sessão cai no login):

1. **[Gabriel] entra e apura.** O cabeçalho da apuração mostra `Época Distribuição · <período> · …`.
2. `computer` → `screenshot` do cabeçalho e do painel do menu do usuário nos **dois temas** (botão de tema). O texto da base tem de ser legível nos dois; meça o contraste com `javascript_tool` (`getComputedStyle` da cor e do fundo do `<span>`), como se faz com qualquer texto novo.
3. **Papel:** `Ctrl+P` (ou **Exportar → Imprimir**): a linha das filiais traz `Base: Época Distribuição · Filiais: …`. A mesma frase aparece na tela cheia e, ao abrir um detalhamento em outra aba, no cabeçalho dele.
4. **Excel:** exportar e conferir que o arquivo se chama `DRE_Epoca_<análise>_<período>.xlsx`.

- [ ] **Step 9: Commit**

```bash
git add client-new-kpi docs/rotinas/9815-dre-gerencial/validacao/dc13_excel_da_apuracao.mjs
git commit -m "feat(bases): a base fica a vista -- menu, cabecalho, papel, detalhe e nome do Excel"
```

---

### Task 13: Documentação, e o roteiro para medir antes de ligar qualquer regra

Sem código novo: deixa a documentação coerente com o que foi feito, e escreve o roteiro de medição e de ligação das regras — que é o que o Gabriel executa, **uma regra por vez**.

**Files:**
- Modify: `docs/plataforma/AUTENTICACAO.md`, `docs/plataforma/DEPLOY_DOCKER.md`, `docs/plataforma/BIFURCACAO_DE_BASES.md`, `docs/README.md`
- Modify: `docs/rotinas/9815-dre-gerencial/README.md`, `docs/rotinas/9815-dre-gerencial/BASE_MINAS_RURAL.md`
- Modify: `.claude/skills/conferir-dre/SKILL.md`, `CLAUDE.md`

- [ ] **Step 1: `AUTENTICACAO.md` — o que deixou de estar pendente**

Em `docs/plataforma/AUTENTICACAO.md`, o parágrafo `**As rotas do DRE não exigem token.** …` (em "O que ainda não está ligado") vira:

```markdown
**As rotas do DRE exigem sessão desde 07/10/2026** — `[Authorize]` no `DreGerencialController`.
O navegador não manda token (ele não o tem): as chamadas passam pelo BFF, em
`app/api/[...caminho]/route.ts`, que anexa o JWT da sessão. O proxy usa `node:http` e não
`fetch` porque uma apuração leva até 407 s e o `fetch` do Node corta em 300 s; e repassa só
`dre-gerencial/*` e `health/*` — **`/api/auth/*` não passa**, para o navegador não chamar o
login da API pulando o freio de tentativas. Ver [BIFURCACAO_DE_BASES.md §4.1](BIFURCACAO_DE_BASES.md).
```

E acrescente, no fim da seção "O BFF, a tela de login e a tela inicial", antes de "O que ainda não está ligado":

```markdown
### A base de dados da sessão

O login pede **base** (`Epoca`, `MinasRural`…), a lista vem de `GET /api/auth/bases`, e o JWT
carrega o claim `base`. A identidade passa a ser o par **(base, matrícula)**: a 144 da Época
e a 144 do Minas Rural são pessoas diferentes. Token sem o claim, ou de uma base que saiu da
configuração, é recusado com *"Sua sessão é anterior a esta atualização. Entre de novo."* — e o
BFF encerra a sessão em memória, para o navegador não ficar com cookie vivo e sessão morta.
Banco da base fora do ar é **503**, nunca "senha incorreta". Trocar de base exige novo login.
```

- [ ] **Step 2: `DEPLOY_DOCKER.md`**

Acrescente ao fim do arquivo:

```markdown
## As bases (a partir de 07/10/2026)

Cada base tem a sua string de conexão, por variável de ambiente:

| Variável | Base |
|---|---|
| `ConnectionStrings__OracleEpoca` | Época Distribuição |
| `ConnectionStrings__OracleMinasRural` | Minas Rural — **sem ela a base não aparece no login** |

**`NEXT_PUBLIC_API_URL` deixou de ser usada pelo navegador.** Ele fala só com o Next; quem
fala com a API é o servidor Next, por `API_URL_INTERNA` (`http://api:8080` em container). Uma
build antiga com `NEXT_PUBLIC_API_URL` definida **não** volta a chamar a API direto: o
`apiClient` usa a própria origem. As regras de cada base (seção sem custo, ICMS, filiais) são
configuração em `appsettings.json` → `Bases`, e não variável de ambiente.
```

- [ ] **Step 3: Estado da spec, índice e README da rotina**

`docs/plataforma/BIFURCACAO_DE_BASES.md` — a linha `**Situação:**` passa a dizer: `**implementada na branch `feat/bifurcacao-de-bases`; em teste. Não sobe antes de testada de ponta a ponta.**` e acrescente, depois do parágrafo de abertura:

```markdown
**Como foi entregue:** [o plano](../superpowers/plans/2026-10-07-bifurcacao-de-bases.md), em 13
tarefas, cada uma deixando a Época funcionando igual. As provas: `dc86` (o SQL da Época não
mudou), `dc87` (o proxy), `dc88` (os scripts com token), `bf1` (registro), `bf2` (login e
token), `bf3` (front).
```

`docs/README.md` — na linha da bifurcação, troque ``**Em desenho, na branch `feat/bifurcacao-de-bases`**`` por ``**Na branch `feat/bifurcacao-de-bases`, em teste**``.

`docs/plataforma/BIFURCACAO_DE_BASES.md` §11 — o primeiro item de **Em aberto** (o filtro por fornecedor) passa a registrar a decisão deste plano:

```markdown
- **O filtro por fornecedor no Minas Rural — decidido no plano de 07/10/2026: fica
  como está, e a limitação é documentada.** Ele depende da `TAB_WEB_CENTROC_FORNEC`, que
  **não existe** nessa base. Escolher fornecedor ali falha com erro interno genérico (500).
  Esconder o controle seria um quinto campo em `RegrasDaBase` (`FiltroPorFornecedor`), e a
  spec pedia que essa decisão não fosse tomada por omissão: **não está neste plano**, e é a
  primeira tarefa seguinte se o Minas Rural for usado antes de a tabela existir. Antes de
  oferecer o filtro lá é preciso criar a tabela (DDL em
  [FILTRO_FORNECEDOR.md](../rotinas/9815-dre-gerencial/FILTRO_FORNECEDOR.md)) e carregar o
  vínculo de lá — conversa com o financeiro, não com o DBA.
```

`docs/rotinas/9815-dre-gerencial/README.md` — no fim, acrescente:

````markdown
## Os scripts de validação agora precisam de sessão

As rotas do DRE exigem `[Authorize]` desde 07/10/2026. Os `dcNN` que chamam a API direto
rodam com o módulo `_autenticar.mjs`, que loga com a credencial de variáveis de ambiente
(nunca de argumento, nunca impressa):

```bash
KPI_LOGIN=… KPI_SENHA=… [KPI_BASE=MinasRural] \
  node --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs <script>
```

`KPI_BASE` é `Epoca` por padrão. Sem `KPI_LOGIN` e `KPI_SENHA` o script falha dizendo o que
definir — seguir sem token daria 401 em cada chamada e um relatório de "divergência" que é só
falta de login.
````

- [ ] **Step 4: A skill e o `CLAUDE.md`**

`.claude/skills/conferir-dre/SKILL.md` — antes da seção `## Checklist final`:

```markdown
## Os scripts precisam de sessão

As rotas do DRE exigem login. Todo script que chama a API roda com
`node --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs <script>` e as
variáveis `KPI_LOGIN` e `KPI_SENHA` (e `KPI_BASE=MinasRural` para a outra base). **A senha é do
Gabriel e vem do ambiente dele**: entregue o comando, não o execute.
```

`CLAUDE.md` — logo antes de `## Rodar`:

```markdown
## Bases

O login escolhe a **base** (Época Distribuição ou Minas Rural), e a escolha vai no JWT: cada
requisição consulta só a base da sessão. As diferenças de regra entre bases (a seção sem custo,
o ICMS, as filiais) são **configuração** — `appsettings.json` → `Bases` —, nunca `if` no código.
Ver [BIFURCACAO_DE_BASES.md](docs/plataforma/BIFURCACAO_DE_BASES.md). **Uma regra do Minas Rural
só se liga depois de medida contra a 9815 de lá**, e cada uma entra no `DIVERGENCIAS.md`.

```

- [ ] **Step 5: O roteiro de medição, no `BASE_MINAS_RURAL.md`**

Substitua a seção `## Como confirmar` (do título até o fim do arquivo) por:

```markdown
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
```

- [ ] **Step 6: Os links e o estado**

Run: `node <conferidor de links>` — o mesmo script usado na reorganização de 06/10/2026 (varre os `.md` e confere que todo link de arquivo resolve). Expected: `N links conferidos, 0 quebrados.` Se o conferidor não estiver à mão, `grep -rn "](.*\.md" docs CLAUDE.md AGENTS.md` e abra cada alvo novo (`BIFURCACAO_DE_BASES.md`, o plano, `BASE_MINAS_RURAL.md`).

- [ ] **Step 7: Toda a rede de segurança, de uma vez**

Run, na raiz:

```bash
dotnet build api-new-kpi/api-new-kpi.csproj -p:BaseOutputPath="$TEMP/kpi-build/"
node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs
node --experimental-strip-types docs/rotinas/9815-dre-gerencial/validacao/dc87_proxy_do_bff.mjs
node docs/rotinas/9815-dre-gerencial/validacao/dc88_autenticar_para_scripts.mjs
node docs/plataforma/validacao/bf1_registro_de_bases.mjs
node docs/plataforma/validacao/bf2_login_por_base.mjs
node --experimental-transform-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/bf3_front_por_base.mjs
node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc13_excel_da_apuracao.mjs
(cd client-new-kpi && npx tsc --noEmit)
```
Expected: **tudo verde** — `0 Aviso(s)`, `dc86` 46, `dc87` 23, `dc88` 9, `bf1` 12, `bf2` 36, `bf3` 21, `dc13` 45, e `tsc` sem saída.

- [ ] **Step 8: [Gabriel] O fechamento antes de qualquer merge**

Os testes acima não tocam no Oracle. O que só o Gabriel prova, **na Época**, com a API reiniciada:

1. `dc64` (**45/45**) e `dc34` (as três dimensões concordam), pelo `_autenticar.mjs`.
2. `dc78` (o detalhamento fecha com a célula filtrada) — o filtro por fornecedor segue igual.
3. Entrar, apurar um mês, abrir um detalhamento, imprimir, exportar o Excel: tudo igual a antes, com a base à vista.
4. Entrar com **uma base inventada** pelo `curl` ao BFF (`POST /api/sessao` com `"base":"X"`): 400, nunca Época.
5. Reiniciar o Next com uma sessão aberta: a próxima ação cai no login, sem tela quebrada.

**Só depois disso** a branch pode ser considerada testada. O merge segue sendo decisão do Gabriel.

- [ ] **Step 9: Commit**

```bash
git add docs CLAUDE.md .claude/skills/conferir-dre/SKILL.md
git commit -m "docs(bases): o roteiro de medicao, e a documentacao coerente com a bifurcacao"
```

---

## Fora deste plano

Coisas que a spec ou a conversa tocaram e que **não** estão nas treze tarefas — para ninguém achar que foram esquecidas:

- **Esconder o filtro por fornecedor onde a base não o suporta** (`FiltroPorFornecedor` em `RegrasDaBase`). A spec deixou a decisão para o plano; a decisão foi **não fazer agora** e documentar a limitação (Task 13). É a primeira tarefa seguinte se o Minas Rural for usado antes de a `TAB_WEB_CENTROC_FORNEC` existir lá.
- **`TAB_GER_RESTRICAO_DATA_DRE`:** o Delphi limita por matrícula o período que cada pessoa pode apurar, nas duas bases. Lacuna anterior a esta tarefa.
- **Cobrar as filiais do token na apuração.** Continua sendo o "passo seguinte" de `AUTENTICACAO.md`. Esta entrega fecha as rotas (sessão obrigatória) e prende a base; **não** impede quem tem sessão de pedir uma filial que não é sua.
- **Verificar os objetos de cada base no `/health`.** As consultas `mb1`/`mb2` de `docs/plataforma/validacao/` cumprem esse papel, rodadas à mão, ao abrir uma base nova.
- **Ligar as regras do Minas Rural.** Está no roteiro da Task 13 e **só acontece depois de medido**, uma regra por commit. Este plano entrega o mecanismo, não a mudança de número.
- **O merge.** Decisão do Gabriel, depois da Task 13 Step 8. A `main` local tem hoje um commit à frente do remoto (`5a5bebb`, a preparação das consultas do Minas Rural) que também está nesta branch.
