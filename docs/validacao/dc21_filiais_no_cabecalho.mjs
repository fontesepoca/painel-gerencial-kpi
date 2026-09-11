/**
 * dc21 — o cabeçalho diz QUAIS filiais foram apuradas, e nunca esconde nenhuma.
 *
 *   node --experimental-strip-types --import ./docs/validacao/_alias.mjs docs/validacao/dc21_filiais_no_cabecalho.mjs
 *
 * O que este arquivo protege é a propriedade que faz a lista valer como documento: **a
 * forma longa cita exatamente as mesmas filiais que a curta conta**. Uma lista que perde um
 * código pelo caminho sai no papel parecendo completa — e alguém confere o DRE de três
 * filiais contra uma apuração que tinha quatro.
 *
 * Não toca no banco nem no navegador.
 */
import assert from "node:assert/strict";
import { descreverFiliais } from "../../client-new-kpi/lib/filiaisApuradas.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

const filial = (codFilial, label, empresa = "EPC") => ({
  codFilial,
  label,
  empresa,
  empresaCodigo: "1",
  unidade: label,
  uf: "MG",
  ordem: null,
});

const cadastro = [
  filial("7", "EPC-MAT"),
  filial("12", "EPC-ES"),
  filial("28", "EPC-TRANSP"),
  filial("27", "FUTURA", "FUT"),
];

// ── uma filial ───────────────────────────────────────────────────────────────
eq(
  descreverFiliais(["7"], cadastro),
  { resumo: "1 filial", detalhe: "Filiais: EPC-MAT (7)" },
  "o código vai junto: é por ele que se confere contra o Winthor",
);

// ── algumas ──────────────────────────────────────────────────────────────────
eq(
  descreverFiliais(["12", "7"], cadastro).detalhe,
  "Filiais: EPC-MAT (7), EPC-ES (12)",
  "a ordem é a do cadastro, não a dos cliques — dois relatórios do mesmo recorte têm que sair iguais",
);
eq(descreverFiliais(["12", "7"], cadastro).resumo, "2 filiais", "o resumo continua contando");

// ── todas ────────────────────────────────────────────────────────────────────
// "Todas" é o que a lista sozinha não diz: com os nomes em sequência, ninguém sabe se
// falta alguma sem ir contar o cadastro.
eq(
  descreverFiliais(["7", "12", "28", "27"], cadastro),
  {
    resumo: "Todas as 4 filiais",
    detalhe: "Filiais (todas as 4): EPC-MAT (7), EPC-ES (12), EPC-TRANSP (28), FUTURA (27)",
  },
  "quando são todas, o texto diz isso",
);

// ── o cadastro ainda não chegou ──────────────────────────────────────────────
// A tela é utilizável antes de a lista de filiais carregar, e um cabeçalho vazio seria
// pior do que um cabeçalho com códigos crus.
eq(
  descreverFiliais(["7", "12"], []),
  { resumo: "2 filiais", detalhe: "Filiais: 7, 12" },
  "sem cadastro, os códigos crus — e na ordem em que a apuração devolveu",
);

// ── código que o cadastro não conhece ────────────────────────────────────────
// É o caso que este arquivo existe para pegar: filtrar o cadastro pelos códigos descarta
// silenciosamente o que não está lá, e a lista sairia com menos filiais do que o resumo
// conta. Aqui ele volta para o fim, como código cru.
const comIntruso = descreverFiliais(["7", "99"], cadastro);
eq(comIntruso.resumo, "2 filiais", "o resumo conta as duas");
eq(comIntruso.detalhe, "Filiais: EPC-MAT (7), 99", "e a lista cita as duas, mesmo a desconhecida");

// A invariante, dita como invariante: a lista tem um item por código, sempre.
for (const codigos of [["7"], ["7", "12"], ["7", "99"], ["99", "98"], ["7", "12", "28", "27"]]) {
  const { detalhe } = descreverFiliais(codigos, cadastro);
  n++;
  assert.equal(
    detalhe.replace(/^Filiais[^:]*: /, "").split(", ").length,
    codigos.length,
    `a lista de ${JSON.stringify(codigos)} tem que ter ${codigos.length} item(ns): "${detalhe}"`,
  );
}

// ── nenhuma ──────────────────────────────────────────────────────────────────
// Não deveria acontecer — o filtro não deixa apurar sem filial —, mas um cabeçalho que
// escreve "0 filiais" e nada mais parece um defeito de renderização.
eq(
  descreverFiliais([], cadastro),
  { resumo: "0 filiais", detalhe: "Nenhuma filial" },
  "sem filial nenhuma, o texto diz isso em vez de ficar vazio",
);

console.log(`dc21: ${n}/${n} asserções passaram.`);
