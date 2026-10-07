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
