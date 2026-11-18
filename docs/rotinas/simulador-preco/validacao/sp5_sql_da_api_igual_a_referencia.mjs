// ============================================================================
// sp5: o SQL da API é o SQL de referência, mudando só o que a spec lista?
//
// Aplica à referência as adaptações A1, A2, A4 e A5 da spec §3.2 (binds com nome
// próprio, matrícula no lugar de CODFUNC = 1, sem ";", sem as linhas comentadas)
// e compara, ignorando espaços, com o miolo de SimuladorPrecoQueries.Consulta.
// O SELECT de fora (A6/A7) fica de fora da comparação: ele só renomeia colunas.
//
// Quando a v2 chegar, rode apontando para sql-v2.sql. Sem banco e sem rede:
//
//   node docs/rotinas/simulador-preco/validacao/sp5_sql_da_api_igual_a_referencia.mjs \
//     api-new-kpi/Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs \
//     docs/rotinas/simulador-preco/referencia/sql-v1.sql
// ============================================================================
import { readFileSync } from "node:fs";
const [cs, ref] = process.argv.slice(2).map((f) => readFileSync(f, "utf8"));
const norm = (s) => s.replace(/\s+/g, " ").trim();
let r = ref.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").replace(/;\s*$/, "");
const ordem = {
  NUMREGIAO: ["numRegiao"],
  CODFORNEC: ["codFornec1", "codFornec2"],
  CODFILIAL: ["codFilial1", "codFilial2"],
  PCOMPRA: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => "pCompra" + i),
};
for (const [k, nomes] of Object.entries(ordem)) {
  let i = 0;
  r = r.replace(new RegExp(":" + k + "(?![A-Za-z0-9_])", "g"), () => ":" + nomes[i++]);
  if (i !== nomes.length) throw new Error(k + " contou " + i);
}
let m = 0;
r = r.replace(/CODFUNC = 1(?![0-9])/g, () => "CODFUNC = :matricula" + ++m);
if (m !== 2) throw new Error("CODFUNC " + m);
const marca = "FROM RESULTADO_FINAL R";
const miolo = cs.slice(cs.indexOf("WITH TRIBUTACAO_CBS"), cs.indexOf(marca) + marca.length);
const a = norm(r), b = norm(miolo);
if (a === b) console.log("IDENTICO: o miolo e a v1 com so as adaptacoes A1, A2, A4 e A5");
else {
  let i = 0;
  while (a[i] === b[i]) i++;
  console.log("DIFERE na posicao", i, "\nref:", a.slice(i - 60, i + 60), "\nAPI:", b.slice(i - 60, i + 60));
  process.exit(1);
}
console.log("binds na ordem:", cs.match(/:[a-zA-Z]+\d*/g).join(" "));
