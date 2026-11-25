/**
 * sp15: o SQL paginado do simulador e a ordem dos binds (spec 2026-11-24-simulador-paginacao-
 * no-backend). Sem banco e sem rede: lê os dois .cs.
 *
 * Confere em `SimuladorPrecoQueries.ConsultaPaginada`:
 *   - que ela envolve a `Consulta` (o SQL v2, conferido pelo sp5) sem copiá-la;
 *   - que a numeração das repetições (ROW_NUMBER) vem ANTES dos filtros, e o total
 *     (COUNT(*) OVER ()) DEPOIS deles;
 *   - a ordem da spec e o OFFSET/FETCH;
 *   - o ESCAPE da busca (% e _ digitados são texto, não curinga);
 *   - os LEFT JOIN de fora do SQL v2: fornecedor (24/11) e classe de tributação + CST (25/11).
 *
 * E, o mais importante: que a sequência de `:binds` do texto final é IGUAL à sequência de
 * `parametros.Add(...)` em `ConsultarPaginaAsync`. O ODP.NET liga por POSIÇÃO; um Add fora de
 * ordem não dá erro de compilação, dá um valor no lugar do outro.
 *
 *   node docs/rotinas/simulador-preco/validacao/sp15_consulta_paginada.mjs
 */
import { readFileSync } from "node:fs";

const queries = readFileSync("api-new-kpi/Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs", "utf8");
const repositorio = readFileSync("api-new-kpi/Infrastructure/Persistence/Repositories/SimuladorPrecoRepository.cs", "utf8");

let conferencias = 0;
let falhas = 0;
function ok(condicao, descricao, detalhe = "") {
  conferencias++;
  if (!condicao) {
    falhas++;
    console.log(`FALHA  ${descricao}${detalhe ? `\n       ${detalhe}` : ""}`);
  }
}

// As constantes de texto cru (""" … """), com ou sem $$ de interpolação.
const constantes = Object.fromEntries(
  [...queries.matchAll(/const string (\w+) = \$*"""([\s\S]*?)"""/g)].map((m) => [m[1], m[2]]),
);
const consulta = constantes.Consulta ?? "";
const paginada = constantes.ConsultaPaginada;

ok(consulta.length > 0, "a constante Consulta existe");
ok(paginada !== undefined, "a constante ConsultaPaginada existe");

if (paginada !== undefined) {
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const p = norm(paginada);

  ok(p.includes("{{Consulta}}"), "envolve a Consulta por interpolação ({{Consulta}}), sem copiá-la");

  const posRowNumber = p.indexOf("ROW_NUMBER() OVER (PARTITION BY");
  const posFiltro = p.indexOf(":buscaNula");
  const posTotal = p.indexOf("COUNT(*) OVER ()");
  ok(posRowNumber >= 0, "numera as repetições com ROW_NUMBER() OVER (PARTITION BY …)");
  ok(posRowNumber >= 0 && posFiltro > posRowNumber, "a numeração vem ANTES dos filtros",
    "senão a mesma linha muda de chave conforme a busca");
  // O total é contado NO MESMO SELECT cujo WHERE tem os filtros — um SELECT por FORA do que
  // numera. No texto, isso é: COUNT antes do ROW_NUMBER (SELECT de fora), e o filtro depois do
  // fim da subconsulta que numera (") N WHERE"). Até 25/11/2026 procurava "C) N WHERE", e só
  // achava por acaso: o texto terminava em "PP.CODFORNEC) N", e CODFORNEC acaba em C. Com o join
  // da PCTRIBUTACAO por último, passou a terminar em "C.CODIGOTRIBUTACAO) N".
  const posFimDaNumeracao = p.indexOf(") N WHERE");
  ok(posTotal >= 0 && posTotal < posRowNumber, "o total é de um SELECT por fora do que numera");
  ok(posFimDaNumeracao > posRowNumber && posFiltro > posFimDaNumeracao,
    "os filtros estão no WHERE do SELECT do total (o total conta só o que passou nos filtros)",
    "senão o TOTALITENS seria o da filial inteira, e não o da busca");
  ok(/PARTITION BY \w*\.?CODPROD, \w*\.?CODIGOTRIBUTACAO/.test(p), "a partição é por CODPROD e CODIGOTRIBUTACAO");
  ok(/AS OCORRENCIA\b/.test(p), "a coluna da numeração chama OCORRENCIA");
  // A spec: dentro da partição, o desempate e depois TODAS as colunas de valor — senão duas
  // repetições que empatam nas primeiras podem trocar de #n, e a simulação muda de linha.
  const ordemDaNumeracao = p.match(/PARTITION BY C\.CODPROD, C\.CODIGOTRIBUTACAO ORDER BY ([^)]*)\)/)?.[1] ?? "";
  // Só o SELECT de fora da Consulta (o que renomeia, A7): até o primeiro "FROM (".
  const selectDeFora = consulta.slice(0, consulta.indexOf("FROM ("));
  const colunasDeValor = (selectDeFora.match(/AS (\w+),?\s*$/gm) ?? [])
    .map((s) => s.replace(/^AS /, "").replace(/,?\s*$/, ""))
    .filter((c) => !["CODPROD", "CODIGOTRIBUTACAO"].includes(c));
  const faltando = colunasDeValor.filter((c) => !ordemDaNumeracao.includes(`C.${c}`));
  ok(colunasDeValor.length > 20 && faltando.length === 0,
    "a numeração ordena por todas as colunas da Consulta (menos a própria chave)",
    `faltando: ${faltando.join(", ")}`);
  ok(/AS TOTALITENS\b/.test(p), "a coluna do total chama TOTALITENS");

  const ordem = "ORDER BY CLASSEVENDA NULLS LAST, DESCRICAO, CODPROD, CODIGOTRIBUTACAO NULLS LAST, OCORRENCIA";
  ok(p.includes(ordem), "a ordem é a da spec", `esperado: ${ordem}`);
  ok(p.includes("ESCAPE '\\'"), "a busca usa LIKE … ESCAPE '\\'");
  ok(p.endsWith("OFFSET :inicio ROWS FETCH NEXT :tamanho ROWS ONLY"), "termina em OFFSET :inicio … FETCH NEXT :tamanho");

  // O fornecedor do produto, ligado POR FORA do SQL v2 (spec 2026-11-24-simulador-coluna-codigo-
  // e-fornecedor): LEFT JOIN pela chave, no nível que numera, para o SQL v2 ficar intacto.
  ok(/FROM \(\{\{Consulta\}\}\) C LEFT JOIN PCPRODUT PP ON PP\.CODPROD = C\.CODPROD LEFT JOIN PCFORNEC FO ON FO\.CODFORNEC = PP\.CODFORNEC\b/.test(p),
    "liga PCPRODUT e PCFORNEC por LEFT JOIN, logo depois da Consulta");
  ok(/PP\.CODFORNEC AS CODFORNEC\b/.test(p) && /FO\.FORNECEDOR AS FORNECEDOR\b/.test(p),
    "traz CODFORNEC e FORNECEDOR com aliases que o Dapper casa");

  // A classe de tributação e o CST (spec 2026-11-25-simulador-classe-de-tributacao-e-cst): LEFT
  // (não INNER) porque o SQL v2 liga a tributação com (+) — produto sem tributação fica na lista.
  ok(/LEFT JOIN PCTRIBUTACAO TR2 ON TO_CHAR\(TR2\.CODIGO_TRIBUTACAO\) = C\.CODIGOTRIBUTACAO\) N\b/.test(p),
    "liga PCTRIBUTACAO por LEFT JOIN pelo código de tributação, no nível que numera");
  ok(/TO_CHAR\(TR2\.CCLASSTRIB\) AS CCLASSTRIB\b/.test(p) && /TO_CHAR\(TR2\.CST\) AS CST\b/.test(p),
    "traz CCLASSTRIB e CST com aliases que o Dapper casa");
}

// ── A ordem dos binds ─────────────────────────────────────────────────────────
const textoFinal = (paginada ?? "").replace("{{Consulta}}", consulta);
const binds = [...textoFinal.matchAll(/:([a-zA-Z]\w*)/g)].map((m) => m[1]);

const corpo = repositorio.match(/ConsultarPaginaAsync\([\s\S]*?\n {4}\}/)?.[0] ?? "";
ok(corpo.length > 0, "o repositório tem ConsultarPaginaAsync");
const ocorrenciasDoPreco = Number(repositorio.match(/OcorrenciasDoPreco = (\d+)/)?.[1] ?? NaN);
const adds = [];
for (const m of corpo.matchAll(/parametros\.Add\(\s*\$?"([^"]+)"/g)) {
  const nome = m[1];
  if (nome.includes("{i}")) {
    for (let i = 1; i <= ocorrenciasDoPreco; i++) adds.push(nome.replace("{i}", String(i)));
  } else {
    adds.push(nome);
  }
}

ok(binds.length === 37, "o texto final tem 37 binds (28 da Consulta + 9 da paginação)", `veio ${binds.length}`);
ok(
  JSON.stringify(adds) === JSON.stringify(binds),
  "a ordem dos parametros.Add é a ordem dos :binds no texto",
  `texto: ${binds.join(", ")}\n       Add:   ${adds.join(", ")}`,
);

console.log(falhas === 0
  ? `sp15: ${conferencias} conferências, todas passaram.`
  : `sp15: ${falhas} de ${conferencias} conferências FALHARAM.`);
process.exit(falhas === 0 ? 0 : 1);
