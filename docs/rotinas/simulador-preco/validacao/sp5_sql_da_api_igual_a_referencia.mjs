// ============================================================================
// sp5: o SQL da API é o SQL de referência, mudando só o que a spec lista?
//
// Serve a QUALQUER versão (sql-v1.sql, sql-v2.sql…): aplica à referência as adaptações
// documentadas e confere, ignorando espaços, que o texto resultante está DENTRO da
// constante de SimuladorPrecoQueries. O SELECT de fora (A6/A7) só renomeia colunas
// e não entra na comparação.
//
// Adaptações aplicadas à referência:
//   A1 — cada :NOME vira um bind com nome próprio, na ordem do texto: um nome que
//        aparece uma vez vira camelCase (:NUMREGIAO → :numRegiao); um que aparece N
//        vezes ganha 1..N (:PCOMPRA → :pCompra1 … :pCompraN);
//   A2 — CODFUNC = 1 vira :matricula1, :matricula2… (a matrícula da sessão, D3);
//   A4 — sai o ";" final;
//   A5 — saem as linhas de comentário "--" (cabeçalho e binds comentados);
//   A8 — o filtro de UM fornecedor vira uma LISTA (24/11/2026, spec
//        2026-11-24-simulador-varios-fornecedores). Só escolhe os produtos; nenhuma conta muda;
//   A9 — só na v3: o SELECT de fora (CCLASSTRIB/CST, LEFT JOIN TR2) sai da referência, porque a
//        API o faz na ConsultaPaginada (26/11/2026).
//
// Desde 26/11/2026 a referência é a sql-v3.sql.
//
// Sem banco e sem rede:
//   node docs/rotinas/simulador-preco/validacao/sp5_sql_da_api_igual_a_referencia.mjs \
//     api-new-kpi/Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs \
//     docs/rotinas/simulador-preco/referencia/sql-v3.sql
// ============================================================================
import { readFileSync } from "node:fs";

const [arquivoCs, arquivoRef] = process.argv.slice(2);
const cs = readFileSync(arquivoCs, "utf8");
const ref = readFileSync(arquivoRef, "utf8");
const norm = (s) => s.replace(/\s+/g, " ").trim();

const camel = (nome) =>
  nome.toLowerCase().replace(/^(p|num|cod)(.)/, (_, prefixo, letra) => prefixo + letra.toUpperCase());

// A5 e A4.
let r = ref.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").replace(/;\s*$/, "");

// A9 (26/11/2026, v3): o SELECT de fora da v3 (CCLASSTRIB e CST da PCTRIBUTACAO, LEFT JOIN TR2)
// NÃO entra na Consulta: o mesmo join é feito na ConsultaPaginada, com TO_CHAR (spec
// 2026-11-26-simulador-sql-v3-classe-de-giro-e-de-comissao). Aqui ele é tirado da referência,
// e o que sobra — o miolo — é o que tem de estar dentro da Consulta. Na v1 e na v2 ele não
// existe, e nada muda.
const involucroA9 =
  /^\s*SELECT V2\.\*\s*,\s*TR2\.CCLASSTRIB\s*,\s*TR2\.CST\s+FROM \(([\s\S]*)\)\s*V2\s+LEFT JOIN PCTRIBUTACAO TR2 ON TR2\.CODIGO_TRIBUTACAO = V2\.CODIGO_TRIBUTACAO\s*$/;
const comA9 = r.match(involucroA9);
if (comA9) r = comA9[1];

// A8, ANTES do A1: os binds novos já entram com o nome final, em minúsculas, e o A1 só mexe nos
// :NOMES em maiúsculas.
const filtroDeUm = "F.CODFORNEC = DECODE(NVL(:CODFORNEC,0),0,P.CODFORNEC,:CODFORNEC)";
if (!r.includes(filtroDeUm)) {
  console.log("A8: a linha do fornecedor não está na referência; a adaptação precisa ser revista.");
  process.exit(1);
}
r = r.replace(
  filtroDeUm,
  "(:fornecedoresNulo IS NULL OR INSTR(',' || :fornecedores || ',', ',' || TO_CHAR(F.CODFORNEC) || ',') > 0)",
);

// A1: conta as ocorrências de cada nome e numera quando repete.
const ocorrencias = new Map();
for (const [, nome] of r.matchAll(/:([A-Z][A-Z0-9_]*)(?![A-Za-z0-9_])/g)) {
  ocorrencias.set(nome, (ocorrencias.get(nome) ?? 0) + 1);
}
const vistos = new Map();
r = r.replace(/:([A-Z][A-Z0-9_]*)(?![A-Za-z0-9_])/g, (_, nome) => {
  const n = (vistos.get(nome) ?? 0) + 1;
  vistos.set(nome, n);
  return ":" + camel(nome) + (ocorrencias.get(nome) > 1 ? n : "");
});

// A2.
let m = 0;
r = r.replace(/CODFUNC = 1(?![0-9])/g, () => "CODFUNC = :matricula" + ++m);

const esperado = norm(r);
const constante = norm(cs);

if (constante.includes(esperado)) {
  console.log(`IDENTICO: o miolo é a referência com só as adaptações A1, A2, A4, A5, A8${comA9 ? " e A9" : ""} (${m} matrícula(s)).`);
} else {
  // Onde começa a divergir: o maior prefixo da referência que a constante contém.
  let lo = 0, hi = esperado.length;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    if (constante.includes(esperado.slice(0, meio))) lo = meio; else hi = meio - 1;
  }
  console.log(`DIFERE a partir do caractere ${lo} da referência adaptada:\n  …${esperado.slice(Math.max(0, lo - 80), lo + 80)}…`);
  process.exit(1);
}

const binds = [...esperado.matchAll(/:[a-zA-Z]+\d*/g)].map((x) => x[0]);
console.log(`binds na ordem (${binds.length}): ${binds.join(" ")}`);
