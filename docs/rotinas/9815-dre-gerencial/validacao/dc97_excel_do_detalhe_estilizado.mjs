/**
 * dc97 — o `.xlsx` do detalhamento sai estilizado como a tela do detalhamento (16/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc97_excel_do_detalhe_estilizado.mjs
 *
 * As regras são as da tela do duplo clique, não as do DRE: cabeçalho em negrito sobre cinza,
 * a coluna que fecha o total da linha do DRE em azul, linhas zebradas, negativo em vermelho
 * (positivo na cor do texto — o verde é do DRE), Culpa RCA "Sim" verde e "Não" vermelho, o
 * código apagado ao lado do nome. E o dado continua dado.
 */
import assert from "node:assert/strict";
import ExcelJS from "../../../../client-new-kpi/node_modules/exceljs/excel.js";
import { gerarDetalhe } from "../../../../client-new-kpi/lib/exportarExcelDetalhe.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(achou)}`);
};
const ok = (cond, oque) => {
  n++;
  assert.ok(cond, oque);
};

const blob = await gerarDetalhe({
  titulo: "(-) DEVOLUCAO — Agosto/2026",
  periodo: { dataInicio: "2026-08-01", dataFim: "2026-08-31" },
  linha: { descricao: "(-) DEVOLUCAO", valor: -150 },
  dados: {
    tipo: "devolucao-por-motivo",
    motivos: [
      { codMotivo: "1", motivo: "AVARIA", culpaRca: "S", qdeNf: 3, vlDevolucao: -100, pPart: 66.67 },
      { codMotivo: "2", motivo: "PRECO", culpaRca: "N", qdeNf: 1, vlDevolucao: -50, pPart: 33.33 },
      { codMotivo: "3", motivo: "ACERTO", culpaRca: null, qdeNf: 1, vlDevolucao: 20, pPart: 0 },
    ],
  },
});

const livro = new ExcelJS.Workbook();
await livro.xlsx.load(Buffer.from(await blob.arrayBuffer()));
const aba = livro.getWorksheet("Detalhamento");
ok(aba !== undefined, "a aba se chama Detalhamento");
const c = (ref) => aba.getCell(ref);
const fundo = (ref) => c(ref).fill?.fgColor?.argb ?? null;
const corTexto = (ref) => c(ref).font?.color?.argb ?? null;

// Colunas: A Código · B Motivo · C Culpa RCA · D Notas · E Devolução · F % part.
// ── O dado ──
eq(c("E2").value, -100, "valor cru");
ok(String(c("E2").numFmt).includes("("), "formato com parênteses");
eq([aba.views[0]?.xSplit, aba.views[0]?.ySplit], [2, 1], "código, nome e cabeçalho fixos");

// ── Cabeçalho ──
eq(c("A1").font?.bold, true, "cabeçalho em negrito");
eq(fundo("A1"), "FFF1F5F9", "cabeçalho sobre cinza");
eq(corTexto("E1"), "FF2563EB", "a coluna que fecha o total da linha em azul");
ok(corTexto("D1") !== "FF2563EB", "as outras colunas não");
eq(c("E1").alignment?.horizontal, "right", "título de coluna numérica à direita, como na tela");

// ── Corpo ──
eq(corTexto("E2"), "FFBE123C", "negativo em vermelho");
eq(corTexto("E4"), "FF0F172A", "positivo na cor do texto, não verde");
eq(corTexto("A2"), "FF64748B", "o código apagado, como na tela");
eq(corTexto("C2"), "FF047857", "Culpa RCA Sim em verde");
eq(corTexto("C3"), "FFBE123C", "Culpa RCA Não em vermelho");
ok(fundo("A2") !== fundo("A3"), "linhas zebradas");

// ── O TOTAL (R + P): pagos e em aberto juntos (16/10/2026) ──
{
  const base = { descCcPrinc: "TRANSPORTES", conta: "FRETE", recNum: 1, historico: "H", dtLanc: "2026-08-03",
    dtPagto: null, dtCompetencia: "2026-08-01", dtCompensacao: null, codFilial: "7", numNota: "1", duplic: "1",
    codFornec: "1", fornecedor: "F", nomeFunc: "", nomeFuncBaixa: "", indice: "", numCar: "", numBordero: "",
    codProjeto: "", numTrans: "", numBanco: "", numCheque: "", numSeqBordero: "", localizacao: "",
    dtReclassific: null, codFuncReclassific: "", dtEstornoBaixa: null, codRotinaBaixa: "" };
  const blobRp = await gerarDetalhe({
    titulo: "FRETE — Agosto/2026 · Realizado + Provisionado",
    periodo: { dataInicio: "2026-08-01", dataFim: "2026-08-31" },
    linha: { descricao: "FRETE", valor: -150 },
    ocultarBaixas: true,
    dados: { tipo: "lancamentos", realizadoEProvisionado: true, lancamentos: [
      { ...base, recNum: 1, vPago: -100, dtPagto: "2026-08-10", emAberto: false },
      // Baixa estornada num título EM ABERTO: é título reaberto, e fica na lista.
      { ...base, recNum: 2, vPago: -50, dtVenc: "2026-08-20", dtEstornoBaixa: "2026-08-15", emAberto: true },
    ] },
  });
  const l2 = new ExcelJS.Workbook();
  await l2.xlsx.load(Buffer.from(await blobRp.arrayBuffer()));
  const a2 = l2.getWorksheet("Detalhamento");
  const cab = a2.getRow(1).values.slice(1);
  ok(cab.includes("Situação"), "a coluna Situação existe no Total (R + P)");
  ok(cab.includes("Dt. Vencto."), "e o vencimento");
  ok(cab.some((v) => String(v).includes("Valor (R + P)")), "o dinheiro se chama Valor (R + P), não V. Pago");
  const iSit = cab.indexOf("Situação") + 1;
  eq([a2.getCell(2, iSit).value, a2.getCell(3, iSit).value], ["Realizado", "Provisionado"], "cada linha diz de que lado veio");
  eq(a2.rowCount, 3, "o em aberto com baixa estornada continua na lista");
}

console.log(`✓ dc97 passou — ${n} conferências`);
