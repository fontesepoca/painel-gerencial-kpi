/**
 * dc106 — o fluxo do lote no navegador (06/11/2026): ler o NDJSON, vigiar o silêncio e
 * escrever o LEIA do zip parcial.
 *
 *   node --experimental-transform-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc106_fluxo_do_lote.mjs
 *
 * `transform-types`, e não `strip-types`: o `ApiError` do apiClient tem propriedades no
 * construtor, que só a transformação entende.
 *
 * Não toca na API nem no banco: os fluxos são montados à mão.
 */
import assert from "node:assert/strict";
import {
  lerNdjson,
  pedirLote,
  textoDoLeia,
  NOME_DO_LEIA,
  SilencioDoServidor,
} from "../../../../client-new-kpi/lib/loteDeDetalhe.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, oque);
};

const cod = new TextEncoder();
/** Um fluxo que entrega os pedaços dados, com `pausaMs` entre eles, e fecha (ou não). */
function fluxo(pedacos, { pausaMs = 0, fechar = true } = {}) {
  return new ReadableStream({
    async start(c) {
      for (const p of pedacos) {
        if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
        c.enqueue(typeof p === "string" ? cod.encode(p) : p);
      }
      if (fechar) c.close();
    },
  });
}
async function ler(corpo, silencio) {
  const lidos = [];
  for await (const p of lerNdjson(corpo, silencio)) lidos.push(p);
  return lidos;
}

// ── Pacotes inteiros, partidos e juntos ─────────────────────────────────────────────────
eq(await ler(fluxo(['{"t":"inicio","partes":2}\n{"t":"fim"}\n'])), [{ t: "inicio", partes: 2 }, { t: "fim" }],
  "dois pacotes num pedaço");
eq(await ler(fluxo(['{"t":"par', 'te","linha":1,"col', 'una":0}\n'])), [{ t: "parte", linha: 1, coluna: 0 }],
  "um pacote partido em três pedaços");
eq(await ler(fluxo(['{"t":"fim"}'])), [{ t: "fim" }], "último pacote sem quebra de linha");
eq(await ler(fluxo(["\n\n", '{"t":"aguarde"}\r\n'])), [{ t: "aguarde" }], "linhas vazias e CRLF são ignorados");

// Acento partido no meio dos bytes: o decodificador tem de esperar o resto.
const acento = cod.encode('{"t":"erro","mensagem":"não"}\n');
const corte = acento.indexOf(0xc3) + 1;
eq(await ler(fluxo([acento.slice(0, corte), acento.slice(corte)])), [{ t: "erro", mensagem: "não" }],
  "um caractere de dois bytes partido entre pedaços");

// Um pacote grande (~8 MB) em pedaços de 64 KB, sem custo quadrático.
const grande = JSON.stringify({ t: "parte", linha: 0, coluna: 0, dados: { lancamentos: "x".repeat(8_000_000) } }) + "\n";
const bytes = cod.encode(grande);
const pedacos = [];
for (let i = 0; i < bytes.length; i += 65536) pedacos.push(bytes.slice(i, i + 65536));
const inicio = performance.now();
const [unico] = await ler(fluxo(pedacos));
const ms = performance.now() - inicio;
eq(unico.dados.lancamentos.length, 8_000_000, "pacote de 8 MB inteiro");
n++;
assert.ok(ms < 3000, `8 MB em 64 KB lidos em ${ms.toFixed(0)} ms (limite 3 s)`);

// ── O vigia ─────────────────────────────────────────────────────────────────────────────
let erro = null;
try {
  await ler(fluxo(['{"t":"inicio","partes":1}\n'], { fechar: false }), 200);
} catch (e) {
  erro = e;
}
n++;
assert.ok(erro instanceof SilencioDoServidor, "fluxo parado além do limite: SilencioDoServidor");

eq(await ler(fluxo(['{"t":"aguarde"}\n', '{"t":"fim"}\n'], { pausaMs: 120 }), 200).then((l) => l.length), 2,
  "batimento dentro do limite mantém o fluxo vivo");

// ── O LEIA ──────────────────────────────────────────────────────────────────────────────
eq(NOME_DO_LEIA, "LEIA - arquivos que faltaram.txt", "o nome do aviso");
const leia = textoDoLeia([
  { caminho: "03 COMBUSTIVEL/Detalhe COMBUSTIVEL · Março-2025.xlsx", motivo: "O banco não respondeu a tempo, nem na segunda tentativa." },
  { caminho: "05 VENDAS/Detalhe VENDAS · Março-2025.xlsx", motivo: "A conexão com o servidor caiu antes do fim." },
]);
n++;
assert.ok(leia.includes("03 COMBUSTIVEL/Detalhe COMBUSTIVEL · Março-2025.xlsx") && leia.includes("nem na segunda tentativa"),
  "o LEIA lista o caminho e o motivo de cada arquivo");
n++;
assert.ok(!/[^\r]\n/.test(leia), "o LEIA usa CRLF — o Bloco de Notas antigo mostraria tudo numa linha");

// ── Revisão final (06/11/2026): pedaços pequenos e texto acentuado ──────────────────────
// Concatenar e procurar no acumulado copiava o buffer inteiro a cada pedaço: 8 MB acentuados
// em pedaços de 4 KB levavam ~8 s, com a aba travada. O leitor só pode olhar o trecho novo.
const acentuado = JSON.stringify({ t: "parte", linha: 0, coluna: 0, dados: { lancamentos: "ção ".repeat(2_000_000) } }) + "\n";
const bytesAc = cod.encode(acentuado);
const pedacosAc = [];
for (let i = 0; i < bytesAc.length; i += 4096) pedacosAc.push(bytesAc.slice(i, i + 4096));
const inicioAc = performance.now();
const [unicoAc] = await ler(fluxo(pedacosAc));
const msAc = performance.now() - inicioAc;
eq(unicoAc.dados.lancamentos.length, 8_000_000, "pacote acentuado de 8 MB inteiro, em pedaços de 4 KB");
n++;
assert.ok(msAc < 1500, `8 MB acentuados em 4 KB lidos em ${msAc.toFixed(0)} ms (limite 1,5 s)`);

// ── Revisão final: o vigia também cobre a espera pelos cabeçalhos ───────────────────────
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (_url, init) =>
  new Promise((_, rejeitar) => init.signal.addEventListener("abort", () => rejeitar(init.signal.reason), { once: true }));
let erroDoPedido = null;
const inicioPedido = performance.now();
try {
  await pedirLote({ filiais: ["7"], regime: "competencia", analise: "grupo-contas", colunas: [], linhas: [] },
    new AbortController().signal, 200);
} catch (e) {
  erroDoPedido = e;
}
globalThis.fetch = fetchOriginal;
n++;
assert.ok(erroDoPedido instanceof SilencioDoServidor && performance.now() - inicioPedido < 1500,
  "servidor que não manda nem o cabeçalho: SilencioDoServidor no limite");

console.log(`✓ dc106 passou — ${n} conferências`);
