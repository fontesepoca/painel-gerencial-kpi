/**
 * dc22 — a cor do `%AH` julga o efeito no resultado, e bate com a 9815 linha a linha.
 *
 *   node --experimental-strip-types --import ./docs/validacao/_alias.mjs docs/validacao/dc22_cor_do_ah.mjs
 *
 * Os casos NÃO são inventados: são as 19 linhas da exportação que o Gabriel mandou em
 * 11/09/2026 — C. Custo Principal, junho a agosto de 2026, todas as filiais —, com a cor
 * que a rotina antiga deu a cada célula. Junho é a primeira coluna e sai de fora: lá o
 * `%AH` é `0,00` por não haver mês anterior (§13).
 *
 * O que este arquivo protege é a regra que a cor exprime, e que é o oposto de colorir por
 * sinal: **devolução caindo é `(9,778)`, um número negativo, e a melhor notícia da coluna.**
 * Colorir pelo sinal — que era o que a tela fazia até 11/09/2026 — pinta isso de vermelho.
 *
 * Não toca no banco nem no navegador.
 */
import assert from "node:assert/strict";
import { lerVariacao } from "../../client-new-kpi/lib/leituraDaVariacao.ts";

let n = 0;
const caso = (linha, total, ah, esperado, mes) => {
  n++;
  const achou = lerVariacao(ah, total);
  assert.equal(
    achou,
    esperado,
    `${linha} · ${mes}: %AH ${ah} sobre total ${total}\n  a 9815 pinta: ${esperado}\n  a regra diz: ${achou}`,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RECEITA E RESULTADO — total positivo, então subir é a boa notícia
// ─────────────────────────────────────────────────────────────────────────────
caso("(+) RECEITA BRUTA", 114416625.39, 4.424, "favoravel", "Jul");
caso("(+) RECEITA BRUTA", 114416625.39, -5.636, "desfavoravel", "Ago");

caso("(=) RECEITAS LIQUIDAS", 103672257.86, 3.66, "favoravel", "Jul");
caso("(=) RECEITAS LIQUIDAS", 103672257.86, -8.236, "desfavoravel", "Ago");

caso("LUCRO BRUTO", 30950470.55, 3.994, "favoravel", "Jul");
caso("LUCRO BRUTO", 30950470.55, -28.967, "desfavoravel", "Ago");

// ─────────────────────────────────────────────────────────────────────────────
// DEDUÇÕES — total negativo, então subir é a má notícia
//
// A devolução é o caso que define a regra: em julho ela CAIU, o número é negativo e está
// entre parênteses, e mesmo assim é notícia boa.
// ─────────────────────────────────────────────────────────────────────────────
caso("(-) ABAT./DESC.", -8602417.08, 19.474, "desfavoravel", "Jul");
caso("(-) ABAT./DESC.", -8602417.08, 16.785, "desfavoravel", "Ago");

caso("(-) DEVOLUCAO", -2141950.45, -9.778, "favoravel", "Jul");
caso("(-) DEVOLUCAO", -2141950.45, 42.766, "desfavoravel", "Ago");

// As três informativas seguem a mesma regra: imposto que sobe é ruim, ainda que a linha
// não entre em totalizador nenhum.
caso("(-) ST", -9480833.22, 2.331, "desfavoravel", "Jul");
caso("(-) ST", -9480833.22, -64.661, "favoravel", "Ago");
caso("(-) PIS", -283135.5, 19.194, "desfavoravel", "Jul");
caso("(-) PIS", -283135.5, -6.533, "favoravel", "Ago");
caso("(-) COFINS", -1304139.07, 19.194, "desfavoravel", "Jul");
caso("(-) COFINS", -1304139.07, -6.533, "favoravel", "Ago");

caso("(=) CMV LIQ.", -72721787.33, 3.502, "desfavoravel", "Jul");
caso("(=) CMV LIQ.", -72721787.33, 1.612, "desfavoravel", "Ago");

// ─────────────────────────────────────────────────────────────────────────────
// DESPESAS — o corpo do DRE, todas com total negativo
// ─────────────────────────────────────────────────────────────────────────────
caso("ADMINISTRATIVO", -2121687.59, 21.174, "desfavoravel", "Jul");
caso("ADMINISTRATIVO", -2121687.59, -12.327, "favoravel", "Ago");
caso("COMPRAS - RAT", -575417.43, 201.343, "desfavoravel", "Jul");
caso("COMPRAS - RAT", -575417.43, -46.137, "favoravel", "Ago");
caso("CONTABILIDADE - RAT", -220713.66, 6.14, "desfavoravel", "Jul");
caso("CONTABILIDADE - RAT", -220713.66, -3.46, "favoravel", "Ago");
caso("DIRETORIA", -662482.04, -0.056, "favoravel", "Jul");
caso("DIRETORIA", -662482.04, 3.436, "desfavoravel", "Ago");
caso("FINANCEIRO - RAT", -636028.99, -19.226, "favoravel", "Jul");
caso("FINANCEIRO - RAT", -636028.99, -21.94, "favoravel", "Ago");
caso("INFORMATICA - RAT", -1284170.11, -58.474, "favoravel", "Jul");
caso("INFORMATICA - RAT", -1284170.11, 20.176, "desfavoravel", "Ago");
caso("MARKETING - RAT", -52866.6, 11.166, "desfavoravel", "Jul");
caso("MARKETING - RAT", -52866.6, -39.925, "favoravel", "Ago");
caso("MOVIMENTAÇÃO E ARMAZENAGEM", -3291090.26, 3.03, "desfavoravel", "Jul");
caso("MOVIMENTAÇÃO E ARMAZENAGEM", -3291090.26, -11.138, "favoravel", "Ago");
caso("RECURSOS HUMANOS - RAT", -99430.46, 2.0, "desfavoravel", "Jul");
caso("RECURSOS HUMANOS - RAT", -99430.46, 15.319, "desfavoravel", "Ago");
caso("SEGURANÇA", -444845.69, 17.056, "desfavoravel", "Jul");
caso("SEGURANÇA", -444845.69, -15.707, "favoravel", "Ago");
caso("SERVIÇOS GERAIS", -202155.44, -31.93, "favoravel", "Jul");
caso("SERVIÇOS GERAIS", -202155.44, 10.841, "desfavoravel", "Ago");
caso("TRANSPORTES MATRIZ", -10416926.0, 3.825, "desfavoravel", "Jul");
caso("TRANSPORTES MATRIZ", -10416926.0, -5.393, "favoravel", "Ago");
caso("VENDAS", -2928400.74, -14.762, "favoravel", "Jul");
caso("VENDAS", -2928400.74, 1.013, "desfavoravel", "Ago");
caso("EQUIPE P&G", -1781651.19, 4.707, "desfavoravel", "Jul");
caso("EQUIPE P&G", -1781651.19, -17.074, "favoravel", "Ago");
caso("EQUIPE PASTA MISTA / ATACADO", -129779.09, 10.322, "desfavoravel", "Jul");
caso("EQUIPE PASTA MISTA / ATACADO", -129779.09, -19.034, "favoravel", "Ago");
caso("TRANSPORTE T - (28)", -2316214.69, 32.555, "desfavoravel", "Jul");
caso("TRANSPORTE T - (28)", -2316214.69, -11.463, "favoravel", "Ago");

// ─────────────────────────────────────────────────────────────────────────────
// AUSÊNCIA DE JUÍZO — os casos em que qualquer cor mentiria
// ─────────────────────────────────────────────────────────────────────────────
caso("(+) RECEITA BRUTA", 114416625.39, 0, "neutro", "Jun (primeira coluna)");
caso("ADMINISTRATIVO", -2121687.59, 0, "neutro", "Jun (primeira coluna)");
caso("qualquer linha", 1000, null, "neutro", "base zero — não há percentual");
caso("linha que soma zero", 0, 12.5, "neutro", "sem sentido a declarar");

// ─────────────────────────────────────────────────────────────────────────────
// PREJUÍZO — o caso que não está no print e precisa ler certo
//
// Resultado negativo que fica mais negativo tem `%AH` positivo, mesmo sinal do valor. A
// regra o pinta como desfavorável, que é o que ele é.
// ─────────────────────────────────────────────────────────────────────────────
caso("LUCRO LIQUIDO (prejuízo)", -500000, 20, "desfavoravel", "prejuízo aumentando");
caso("LUCRO LIQUIDO (prejuízo)", -500000, -20, "favoravel", "prejuízo encolhendo");

// ─────────────────────────────────────────────────────────────────────────────
// E o que a regra ANTIGA fazia, para o registro: colorir por sinal erra em toda linha de
// despesa e dedução — metade da tabela.
// ─────────────────────────────────────────────────────────────────────────────
{
  const porSinal = (ah) => (ah < 0 ? "desfavoravel" : "favoravel");
  const amostra = [
    ["(-) DEVOLUCAO", -2141950.45, -9.778],
    ["(-) ST", -9480833.22, -64.661],
    ["ADMINISTRATIVO", -2121687.59, 21.174],
    ["INFORMATICA - RAT", -1284170.11, -58.474],
  ];
  for (const [linha, total, ah] of amostra) {
    n++;
    assert.notEqual(
      porSinal(ah),
      lerVariacao(ah, total),
      `${linha}: a regra nova tinha que discordar da antiga em %AH ${ah}`,
    );
  }
}

console.log(`dc22: ${n}/${n} asserções passaram — a cor bate com a 9815 em todas as linhas do print.`);
