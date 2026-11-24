/**
 * sp18: a simulação salva passa a ser guardada por filial + região, sem o fornecedor
 * (spec 2026-11-24-simulador-varios-fornecedores).
 *
 * As chaves antigas `filial|região|fornecedor` são juntadas na leitura. Se o mesmo produto tiver
 * edição em mais de uma, vence: a chave nova, depois a de fornecedor específico, depois a de
 * "todos" (0).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs \
 *     docs/rotinas/simulador-preco/validacao/sp18_chave_sem_fornecedor.mjs
 */
import { chaveDaConsulta, juntarChavesAntigas } from "@/lib/rascunhoSimulacao.ts";

let conferencias = 0;
let falhas = 0;
function eq(obtido, esperado, descricao) {
  conferencias++;
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    falhas++;
    console.log(`FALHA  ${descricao}\n       esperado ${b}, veio ${a}`);
  }
}

eq(chaveDaConsulta("7", 90), "7|90", "a chave é filial|região");

eq(
  juntarChavesAntigas({ "7|90|0": { a: { preco: "1" } }, "7|90|234": { a: { preco: "2" }, b: { preco: "3" } } }),
  { "7|90": { a: { preco: "2" }, b: { preco: "3" } } },
  "o fornecedor específico vence o 'todos'",
);
eq(
  juntarChavesAntigas({ "7|90|234": { a: { preco: "2" } }, "7|90|0": { a: { preco: "1" }, c: { preco: "4" } } }),
  { "7|90": { a: { preco: "2" }, c: { preco: "4" } } },
  "a ordem das chaves no objeto não muda quem vence; linhas só do 'todos' entram",
);
eq(juntarChavesAntigas({ "7|90": { x: { preco: "1" } } }), { "7|90": { x: { preco: "1" } } }, "já no formato novo: igual");
eq(
  juntarChavesAntigas({ "7|90|0": { a: { preco: "1" } }, "7|90": { a: { preco: "9" } } }),
  { "7|90": { a: { preco: "9" } } },
  "a chave nova vence as antigas",
);
eq(
  Object.keys(juntarChavesAntigas({ "7|90|0": { a: { preco: "1" } }, "8|90|0": { b: { preco: "2" } } })).sort(),
  ["7|90", "8|90"],
  "filiais diferentes continuam separadas",
);
eq(juntarChavesAntigas({}), {}, "vazio: vazio");

const uma = juntarChavesAntigas({ "7|90|0": { a: { preco: "1" } }, "7|90|234": { b: { preco: "2" } } });
eq(juntarChavesAntigas(uma), uma, "aplicar duas vezes dá o mesmo que uma");

console.log(falhas === 0
  ? `sp18: ${conferencias} conferências, todas passaram.`
  : `sp18: ${falhas} de ${conferencias} conferências FALHARAM.`);
process.exit(falhas === 0 ? 0 : 1);
