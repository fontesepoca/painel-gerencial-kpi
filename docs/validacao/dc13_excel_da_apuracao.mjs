/**
 * dc13 — o `.xlsx` da apuração: valores como número, formato brasileiro, ordem da tela.
 *
 *   node --experimental-strip-types --import ./docs/validacao/_alias.mjs docs/validacao/dc13_excel_da_apuracao.mjs
 *
 * Roda no Node porque o `xlsx` escreve arquivo aqui também: gera a planilha, **reabre** e
 * confere célula por célula. Não toca no banco nem no navegador.
 *
 * O que este teste protege, e que passaria despercebido na tela: uma planilha com os
 * valores em TEXTO abre bonita e não soma. É o defeito mais fácil de cometer numa
 * exportação e o mais chato de descobrir — quem descobre é o contador, na frente do
 * cliente.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Caminho explícito: a resolução de pacote parte do diretório DESTE arquivo, e o `xlsx`
// está instalado no front. Importar por nome procuraria um `node_modules` em `docs/`.
import * as XLSX from "../../client-new-kpi/node_modules/xlsx/xlsx.mjs";
import { matrizDaApuracao, nomeDoArquivo } from "../../client-new-kpi/lib/exportarExcel.ts";

// O build ESM do `xlsx` não enxerga o `fs` sozinho — no navegador ele nem existe, e é lá
// que a aplicação roda. Aqui a injeção é o que permite escrever e reabrir o arquivo.
XLSX.set_fs(fs);

let n = 0;
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${esperado}, veio ${achou}`);
};

const periodos = [
  { mesAno: "2026-07", rotulo: "Julho/2026" },
  { mesAno: "2026-08", rotulo: "Agosto/2026" },
];

const linha = (descricao, valor, av, ah) => ({
  id: 1,
  chaveOrdem: descricao,
  chave: "400",
  descricao,
  valores: periodos.map((p, i) => ({
    mesAno: p.mesAno,
    valor: valor + i,
    percentualAv: av,
    percentualAh: i === 0 ? null : ah,
  })),
  total: { valor: valor * 2 + 1, media: valor, percentualAv: av },
  totalizadora: false,
  calculada: false,
  naoSoma: false,
  semMovimento: false,
  zerada: false,
  cor: null,
  detalhe: null,
  composicao: [],
});

const dados = {
  regime: "competencia",
  analise: "ccusto-principal",
  dataInicio: "2026-07-01",
  dataFim: "2026-08-27",
  filiais: ["1"],
  periodos,
  linhas: [
    linha("(+) RECEITA BRUTA", 1234567.89, 100, 4.056),
    linha("(-) ABAT./DESC.", -617283.95, 19.474, -4.056),
  ],
  avisos: [],
  apuradoEm: "2026-09-09T12:00:00Z",
  duracaoMs: 42000,
};

// ── A matriz ────────────────────────────────────────────────────────────────────────────
const matriz = matrizDaApuracao(dados, dados.linhas);

eq(matriz.length, 4, "duas linhas de cabeçalho e duas de conta");
eq(matriz[0][1].v, "Julho/2026", "faixa dos meses");
eq(matriz[1][0].v, "Descrição", "rótulo da primeira coluna");
eq(matriz[1].length, 10, "1 descrição + 2 meses x 3 + total x 3");

// O que este arquivo existe para garantir: número é número.
eq(typeof matriz[2][1].v, "number", "valor de julho é número");
eq(matriz[2][1].v, 1234567.89, "valor de julho, cru");
eq(matriz[3][1].v, -617283.95, "negativo é negativo, não texto entre parênteses");
eq(matriz[2][1].z, "#,##0.00;(#,##0.00)", "formato exibe o parêntese");
eq(matriz[3][2].z, "#,##0.000;(#,##0.000)", "percentual com três casas");
eq(matriz[2][3].v, null, "AH do primeiro mês é vazio, não zero");

// ── O arquivo, gerado e reaberto ────────────────────────────────────────────────────────
const planilha = XLSX.utils.aoa_to_sheet(matriz.map((l) => l.map((c) => c.v)));
matriz.forEach((l, r) => {
  l.forEach((celula, c) => {
    if (celula.z === undefined) return;
    const alvo = planilha[XLSX.utils.encode_cell({ r, c })];
    if (alvo) alvo.z = celula.z;
  });
});
planilha["!cols"] = Array.from({ length: 10 }, (_, i) => ({ wch: i === 0 ? 52 : 16 }));
planilha["!merges"] = [
  { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },
  { s: { r: 0, c: 4 }, e: { r: 0, c: 6 } },
  { s: { r: 0, c: 7 }, e: { r: 0, c: 9 } },
];
planilha["!freeze"] = { xSplit: "1", ySplit: "2" };

const livro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(livro, planilha, "DRE");

const arquivo = path.join(os.tmpdir(), `${nomeDoArquivo(dados)}.xlsx`);
XLSX.writeFile(livro, arquivo, { compression: true });

ok(fs.existsSync(arquivo), "o arquivo foi escrito");
ok(fs.statSync(arquivo).size > 1000, "e não está vazio");

const lido = XLSX.readFile(arquivo, { cellNF: true });
const aba = lido.Sheets["DRE"];
ok(aba !== undefined, "a aba se chama DRE");

const celula = (ref) => aba[ref];
eq(celula("A2").v, "Descrição", "cabeçalho sobreviveu à ida e volta");
eq(celula("B3").t, "n", "a célula é do tipo NÚMERO no arquivo");
eq(celula("B3").v, 1234567.89, "com o valor cru");
eq(celula("B4").v, -617283.95, "negativo preservado");
ok(String(celula("B3").z).includes("("), "e o formato do arquivo pede parênteses");
eq(aba["!merges"]?.length, 3, "três faixas de mês juntadas");

eq(nomeDoArquivo(dados), "DRE_ccusto-principal_2026-07-01_a_2026-08-27", "nome do arquivo");

fs.unlinkSync(arquivo);

// ── O bloco final no modo de ano: variação, não total ───────────────────────────────────
//
// A planilha acompanha a tela (§21.5). Divergir aqui faria o arquivo somar 2025 com 2026
// num campo chamado Total — justamente o número que a tela deixou de mostrar por não
// significar nada.
//
// O primeiro caso é o que fez esta seção existir: com `modo` ausente, `usaAnos` estava
// escrito como `!== "meses"` e ligava a variação numa apuração mensal. A dc13 pegou pela
// contagem de colunas, antes de qualquer tela.
const porAno = {
  ...dados,
  modo: "anos",
  periodos: [
    { mesAno: "2025", rotulo: "2025", dataInicio: "2025-01-01", dataFim: "2025-12-31" },
    { mesAno: "2026", rotulo: "2026", dataInicio: "2026-01-01", dataFim: "2026-12-31" },
  ],
  linhas: [
    {
      ...linha("(+) RECEITA BRUTA", 0, null, null),
      valores: [
        { mesAno: "2025", valor: 1000000, percentualAv: null, percentualAh: 0 },
        { mesAno: "2026", valor: 750000, percentualAv: null, percentualAh: -25 },
      ],
    },
  ],
};

const mAno = matrizDaApuracao(porAno, porAno.linhas);

eq(mAno[1].length, 9, "1 descrição + 2 anos x 3 + variação x 2");
eq(mAno[0][7].v, "2025 → 2026", "a faixa do bloco final diz entre o que e o quê");
eq(mAno[1][7].v, "Δ Valor", "e as colunas são de variação");
eq(mAno[1][8].v, "Δ %", "");
eq(mAno[2][7].v, -250000, "a diferença em reais, como número");
eq(mAno[2][8].v, -25, "e em percentual");

eq(
  nomeDoArquivo(porAno),
  "DRE_ccusto-principal_2025_2026",
  "por ano inteiro o nome cita os anos — as datas do filtro não descrevem o que foi apurado",
);

// A matriz mensal continua com o bloco de total, inclusive quando `modo` não vem.
eq(matrizDaApuracao(dados, dados.linhas)[1].length, 10, "o modo mensal mantém as 10 colunas");
eq(matrizDaApuracao({ ...dados, modo: undefined }, dados.linhas)[1].length, 10, "e sem modo também");

console.log(`dc13: ${n}/${n} asserções passaram. Arquivo gerado, reaberto e conferido.`);
