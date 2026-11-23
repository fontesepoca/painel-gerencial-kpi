/**
 * sp10: a paginação do simulador recorta a lista certa (spec de 23/11/2026, paginação).
 *
 * A tela desenha 100 produtos por vez porque ~9.800 linhas na página custavam ~0,3 s a cada
 * mudança de estado (medido em 23/11/2026). Este teste amarra o recorte: a fatia, a última
 * página parcial, a página fora do intervalo presa ao limite e a lista vazia.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs \
 *     docs/rotinas/simulador-preco/validacao/sp10_paginacao.mjs
 */
import { TAMANHO_DA_PAGINA, paginar } from "@/lib/paginacao.ts";

let conferencias = 0;
let falhas = 0;
function eq(obtido, esperado, descricao) {
  conferencias++;
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++;
    console.log(`FALHA  ${descricao}\n       esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
  }
}

const duzentosECinquenta = Array.from({ length: 250 }, (_, i) => i + 1);

eq(TAMANHO_DA_PAGINA, 100, "100 por página (decisão da spec)");

const p1 = paginar(duzentosECinquenta, 1, 100);
eq(p1.itens.length, 100, "página 1 tem 100");
eq(p1.itens[0], 1, "página 1 começa no primeiro");
eq(p1.totalPaginas, 3, "250 itens dão 3 páginas");

const p3 = paginar(duzentosECinquenta, 3, 100);
eq(p3.itens.length, 50, "a última página é parcial");
eq(p3.itens[0], 201, "a última página começa no 201");
eq(p3.pagina, 3, "página 3 é a 3");

eq(paginar(duzentosECinquenta, 9, 100).pagina, 3, "página além do fim fica presa na última");
eq(paginar(duzentosECinquenta, 9, 100).itens.length, 50, "e mostra os itens da última, não uma tabela vazia");
eq(paginar(duzentosECinquenta, 0, 100).pagina, 1, "página zero fica presa na primeira");
eq(paginar([], 1, 100), { itens: [], pagina: 1, totalPaginas: 1 }, "lista vazia: 1 página, 0 itens");
eq(paginar(Array.from({ length: 100 }, (_, i) => i), 1, 100).totalPaginas, 1, "exatamente 100 itens: 1 página");

console.log(falhas === 0
  ? `sp10: ${conferencias} conferências, todas passaram.`
  : `sp10: ${falhas} de ${conferencias} conferências FALHARAM.`);
process.exit(falhas === 0 ? 0 : 1);
