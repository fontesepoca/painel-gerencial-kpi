/**
 * dc103 — exportar o detalhamento de VÁRIAS linhas num zip só (06/11/2026).
 *
 *   node --experimental-transform-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc103_exportar_linhas_selecionadas.mjs
 *
 * (`transform-types` desde 06/11/2026: o módulo importa o `ApiError`, que tem propriedades no
 * construtor.)
 *
 * Pedido do Gabriel: um checkbox em cada linha do DRE, "selecionar todas", e uma ação que
 * exporta o detalhamento de todas as linhas marcadas — a mesma lógica do botão direito na
 * descrição, mas num `.zip` só, com o nome da empresa, da filial e do período.
 */
import assert from "node:assert/strict";
import {
  caminhosNoZip,
  nomeDoZipDaSelecao,
  nomesDosArquivos,
} from "../../../../client-new-kpi/lib/exportarDetalhesDaLinha.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, oque);
};

// ── O nome do zip: empresa, filial e período ────────────────────────────────────────────
eq(
  nomeDoZipDaSelecao({ empresa: "Época Distribuição", filiais: ["25"], dataInicio: "2026-09-01", dataFim: "2026-09-30" }),
  "Época Distribuição - Filial 25 - 01-09-2026 a 30-09-2026.zip",
  "uma filial",
);
eq(
  nomeDoZipDaSelecao({ empresa: "Época Distribuição", filiais: ["7", "12", "25"], dataInicio: "2026-07-01", dataFim: "2026-09-30" }),
  "Época Distribuição - Filiais 7, 12, 25 - 01-07-2026 a 30-09-2026.zip",
  "várias filiais",
);
eq(
  nomeDoZipDaSelecao({ empresa: "Minas/Rural: teste", filiais: ["10"], dataInicio: "2026-09-01", dataFim: "2026-09-30" }),
  "MinasRural teste - Filial 10 - 01-09-2026 a 30-09-2026.zip",
  "o que o Windows recusa sai do nome",
);

// ── Os caminhos: uma pasta por linha, na ordem da tela ──────────────────────────────────
const colunas = [
  { rotulo: "Agosto/2026", dataInicio: "2026-08-01", dataFim: "2026-08-31" },
  { rotulo: "Setembro/2026", dataInicio: "2026-09-01", dataFim: "2026-09-30" },
];
const caminhos = caminhosNoZip([
  { descricao: "FINANCEIRO", colunas },
  { descricao: "Despesas Adm e Vendas", colunas },
  { descricao: "Despesas Adm e Vendas", colunas },
]);
eq(caminhos.length, 3, "uma lista de caminhos por linha");
eq(caminhos[0], nomesDosArquivos("FINANCEIRO", colunas).map((a) => `01 FINANCEIRO/${a}`),
  "dentro da pasta, os MESMOS arquivos do botão direito");
eq(caminhos[1][0].startsWith("02 Despesas Adm e Vendas/"), true, "a pasta leva a posição na tela");
eq(caminhos[2][0].startsWith("03 Despesas Adm e Vendas/"), true, "duas linhas de mesmo nome não se sobrescrevem");
eq(new Set(caminhos.flat()).size, 6, "nenhum caminho repetido");
eq(
  caminhosNoZip([{ descricao: "TRANSPORTES - CD TRIANGULO/UBERLÂNDIA", colunas: [colunas[0]] }])[0][0].split("/")[0],
  "01 TRANSPORTES - CD TRIANGULO-UBERLÂNDIA",
  "a barra do nome da conta não cria uma pasta a mais",
);

console.log(`✓ dc103 passou — ${n} conferências`);
