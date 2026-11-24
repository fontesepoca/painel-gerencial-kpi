/**
 * sp17: a chave da linha e os filtros da paginação no back-end (spec 2026-11-24-simulador-
 * paginacao-no-backend).
 *
 * A chave é o que liga uma simulação guardada à linha da tabela. Ela NÃO pode mudar com a
 * paginação no back-end: uma simulação salva antes (`49555|1`, `48020|1#1`) tem de achar a mesma
 * linha. A diferença é que agora quem numera as repetições é o Oracle (OCORRENCIA, de 1 em
 * diante), e não a tela contando na lista inteira.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs \
 *     docs/rotinas/simulador-preco/validacao/sp17_filtro_e_chave.mjs
 */
import { chaveDaLinha } from "@/lib/filtroSimulador.ts";
import { classesParaApi, codigosSimulados, paginaAoEsvaziar } from "@/lib/filtroSimulador.ts";

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

// ── chaveDaLinha: a mesma de antes da paginação no back-end ────────────────────
const linha = (ocorrencia, codigoTributacao = "1") => ({ codProd: 49555, codigoTributacao, ocorrencia });
eq(chaveDaLinha(linha(1)), "49555|1", "1ª ocorrência: sem sufixo (como a chave de antes)");
eq(chaveDaLinha(linha(2)), "49555|1#1", "2ª ocorrência: #1 (como o contador de antes)");
eq(chaveDaLinha(linha(3)), "49555|1#2", "3ª ocorrência: #2");
eq(chaveDaLinha(linha(1, null)), "49555|-", "sem tributação: '-'");

// ── codigosSimulados: os códigos das linhas com ajuste ────────────────────────
eq(
  codigosSimulados({ "49555|1": { preco: "1" }, "49555|1#1": { preco: "2" }, "100|-": { st: 1 } }),
  ["100", "49555"],
  "códigos únicos, em ordem numérica",
);
eq(codigosSimulados({}), [], "sem ajuste: nenhum código");

// ── classesParaApi: as três marcadas = sem filtro ─────────────────────────────
eq(classesParaApi(["A", "B", "C"]), null, "A, B e C: sem filtro de classe (null)");
eq(classesParaApi(["C", "B", "A"]), null, "as três em outra ordem: também null");
eq(classesParaApi(["C", "A"]), ["A", "C"], "duas: em ordem");
eq(classesParaApi(["B"]), ["B"], "uma");

// ── paginaAoEsvaziar: a página ficou além do fim (revisão final, 24/11/2026) ──────
// Um OFFSET além do fim não devolve linha nenhuma, e com ela some o COUNT(*) OVER (): a API
// responde total 0. A tela não sabe quantas páginas há — volta à 1, que existe se houver algo.
eq(paginaAoEsvaziar(7, 0), 1, "página 7 voltou vazia: volta à 1");
eq(paginaAoEsvaziar(1, 0), null, "página 1 vazia: é 'nenhum produto' de verdade, fica");
eq(paginaAoEsvaziar(3, 100), null, "página com linhas: fica");

console.log(falhas === 0
  ? `sp17: ${conferencias} conferências, todas passaram.`
  : `sp17: ${falhas} de ${conferencias} conferências FALHARAM.`);
process.exit(falhas === 0 ? 0 : 1);
