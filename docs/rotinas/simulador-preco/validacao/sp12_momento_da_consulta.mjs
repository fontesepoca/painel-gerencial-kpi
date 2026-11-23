/**
 * sp12: "Consultado às…" diz a DATA quando a consulta não é de hoje (revisão final, 23/11/2026).
 *
 * A consulta guardada no sessionStorage vive enquanto a aba vive, e uma aba deixada aberta de um
 * dia para o outro restaura, num F5, a consulta de ontem. "Consultado às 14:32" sozinho faria
 * parecer que é de hoje, que é o engano que a spec quer evitar.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs \
 *     docs/rotinas/simulador-preco/validacao/sp12_momento_da_consulta.mjs
 */
import { formatarMomentoDaConsulta } from "@/lib/formato.ts";

let conferencias = 0;
let falhas = 0;
function eq(obtido, esperado, descricao) {
  conferencias++;
  if (obtido !== esperado) {
    falhas++;
    console.log(`FALHA  ${descricao}\n       esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
  }
}

// Datas em hora LOCAL, como a tela as mostra.
const agora = new Date(2026, 10, 23, 18, 5);

eq(
  formatarMomentoDaConsulta(new Date(2026, 10, 23, 14, 32).toISOString(), agora),
  "Consultado às 14:32",
  "consulta de hoje: só a hora",
);
eq(
  formatarMomentoDaConsulta(new Date(2026, 10, 22, 14, 32).toISOString(), agora),
  "Consultado em 22/11 às 14:32",
  "consulta de ontem: a data junto",
);
eq(
  formatarMomentoDaConsulta(new Date(2025, 10, 23, 14, 32).toISOString(), agora),
  "Consultado em 23/11/2025 às 14:32",
  "mesmo dia e mês de outro ano: com o ano",
);
eq(
  formatarMomentoDaConsulta(new Date(2026, 10, 23, 0, 1).toISOString(), agora),
  "Consultado às 00:01",
  "logo depois da meia-noite de hoje ainda é hoje",
);

console.log(falhas === 0
  ? `sp12: ${conferencias} conferências, todas passaram.`
  : `sp12: ${falhas} de ${conferencias} conferências FALHARAM.`);
process.exit(falhas === 0 ? 0 : 1);
