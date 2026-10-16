/**
 * dc98 — o `.zip` dos detalhamentos de uma linha (16/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc98_zip_dos_detalhamentos.mjs
 *
 * O botão direito na descrição de uma linha exporta um Excel por mês, empacotados num zip.
 * O empacotador é nosso (`lib/zip.ts`, sem biblioteca nova): o `.xlsx` já é comprimido por
 * dentro, então o zip só precisa GUARDAR os arquivos. Este teste reabre o zip com o JSZip —
 * um leitor independente, que veio junto do ExcelJS — e confere nomes com acento, conteúdo
 * byte a byte e o CRC; e confere que um `.xlsx` de verdade sai inteiro do outro lado.
 */
import assert from "node:assert/strict";
import JSZip from "../../../../client-new-kpi/node_modules/jszip/lib/index.js";
import ExcelJS from "../../../../client-new-kpi/node_modules/exceljs/excel.js";
import { criarZip } from "../../../../client-new-kpi/lib/zip.ts";
import { gerarDetalhe } from "../../../../client-new-kpi/lib/exportarExcelDetalhe.ts";
import { nomesDosArquivos } from "../../../../client-new-kpi/lib/exportarDetalhesDaLinha.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(achou)}`);
};

const texto = (s) => new TextEncoder().encode(s);

// ── O formato: dois arquivos, um com acento no nome, e um vazio ──
{
  const blob = criarZip([
    { nome: "Detalhe COMPRAS - RAT Março-2026.txt", dados: texto("primeiro ✓") },
    { nome: "vazio.txt", dados: new Uint8Array() },
  ]);
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()), { checkCRC32: true });
  eq(Object.keys(zip.files).sort(), ["Detalhe COMPRAS - RAT Março-2026.txt", "vazio.txt"], "os nomes, com acento");
  eq(await zip.file("Detalhe COMPRAS - RAT Março-2026.txt").async("string"), "primeiro ✓", "o conteúdo, byte a byte");
  eq((await zip.file("vazio.txt").async("uint8array")).length, 0, "arquivo vazio continua vazio");
  eq(blob.type, "application/zip", "o tipo do download");
}

// ── Um .xlsx de verdade entra e sai inteiro ──
{
  const xlsx = new Uint8Array(await (await gerarDetalhe({
    titulo: "COMPRAS - RAT · Julho/2026",
    periodo: { dataInicio: "2026-07-01", dataFim: "2026-07-31" },
    linha: { descricao: "COMPRAS - RAT", valor: -100 },
    dados: { tipo: "devolucao-por-motivo", motivos: [{ codMotivo: "1", motivo: "AVARIA", culpaRca: "S", qdeNf: 1, vlDevolucao: -100, pPart: 100 }] },
  })).arrayBuffer());
  const zip = await JSZip.loadAsync(Buffer.from(await criarZip([{ nome: "a.xlsx", dados: xlsx }]).arrayBuffer()), { checkCRC32: true });
  const devolta = await zip.file("a.xlsx").async("uint8array");
  eq(devolta.length, xlsx.length, "o xlsx sai do tamanho que entrou");
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(Buffer.from(devolta));
  eq(livro.getWorksheet("Detalhamento").getCell("E2").value, -100, "e abre no ExcelJS com o valor certo");
}

// ── Os nomes: um por mês, sem repetir ──
{
  const nomes = nomesDosArquivos("COMPRAS - RAT", [
    { rotulo: "Julho/2026", dataInicio: "2026-07-01", dataFim: "2026-07-31" },
    { rotulo: "Agosto/2026", dataInicio: "2026-08-01", dataFim: "2026-08-31" },
    { rotulo: "Agosto/2026", dataInicio: "2025-08-01", dataFim: "2025-08-31" },
  ]);
  eq(nomes[0], "Detalhe COMPRAS - RAT · Julho-2026 2026-07-01 a 2026-07-31.xlsx", "o nome diz a linha e o mês");
  eq(new Set(nomes).size, 3, "dois 'Agosto' de anos diferentes não se sobrescrevem");
}

console.log(`✓ dc98 passou — ${n} conferências`);
