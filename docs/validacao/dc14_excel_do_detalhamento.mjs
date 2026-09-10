/**
 * dc14 — o `.xlsx` do detalhamento: uma matriz por tela, valores como número.
 *
 *   node --experimental-strip-types docs/validacao/dc14_excel_do_detalhamento.mjs
 *
 * As quatro telas têm colunas diferentes, e a de lançamentos tem 27. Um teste que só olha
 * "gerou o arquivo" passaria com a matriz errada; aqui cada tela é conferida pelos rótulos
 * e pelo tipo das células.
 *
 * Não toca no banco nem no navegador.
 */
import assert from "node:assert/strict";
import {
  nomeDoArquivoDetalhe,
  planilhaDoDetalhe,
} from "../../client-new-kpi/lib/exportarExcelDetalhe.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${esperado}, veio ${achou}`);
};
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};

const periodo = { dataInicio: "2026-09-01", dataFim: "2026-09-09" };
const vazio = {
  bloco: null,
  chave: null,
  clientes: null,
  motivos: null,
  lancamentos: null,
  impostos: null,
  duracaoMs: 300,
};

const monta = (tipo, colecao, descricao) =>
  planilhaDoDetalhe({
    titulo: `${descricao} · Setembro/2026`,
    periodo,
    linha: { descricao, valor: 1 },
    dados: { ...vazio, tipo, ...colecao },
  });

// ── Imposto por produto ─────────────────────────────────────────────────────────────────
const imposto = monta(
  "imposto-por-produto",
  {
    impostos: [
      {
        codProd: 100,
        produto: "ARROZ 5KG",
        qdeNf: 812,
        vendas: 91234.55,
        devolucoes: 4210.1,
        liquido: 87024.45,
        pPart: 25.34,
      },
    ],
  },
  "(-) ST",
);

eq(imposto.aba, "Detalhamento", "nome da aba");
eq(imposto.matriz[0].map((c) => c.v).slice(0, 3), ["Código", "Produto", "Notas"], "colunas");
// A coluna que fecha o total se anuncia, como na tela — §16.3.
eq(imposto.matriz[0][5].v, "(ST) Líquido", "a coluna do total leva o nome da linha");
eq(imposto.matriz[1][0].v, 100, "código como número");
eq(typeof imposto.matriz[1][3].v, "number", "vendas é número");
eq(imposto.matriz[1][5].v, 87024.45, "líquido cru");
ok(imposto.matriz[1][3].z.includes("("), "formato com parênteses no negativo");
eq(imposto.larguras.length, imposto.matriz[0].length, "uma largura por coluna");

// ── Devolução por motivo ────────────────────────────────────────────────────────────────
const devolucao = monta(
  "devolucao-por-motivo",
  {
    motivos: [
      {
        codMotivo: "120",
        motivo: "ERRO SISTEMA",
        culpaRca: "N",
        qdeNf: 6,
        vlDevolucao: 161944.63,
        pPart: 39.12,
      },
      {
        codMotivo: null,
        motivo: null,
        culpaRca: null,
        qdeNf: 1,
        vlDevolucao: 10,
        pPart: 0.01,
      },
    ],
  },
  "(-) DEVOLUCAO",
);

eq(devolucao.matriz[0][4].v, "Devolução", "não repete o nome quando a coluna já se chama assim");
eq(devolucao.matriz[1][2].v, "Não", "S/N vira palavra");
eq(devolucao.matriz[2][1].v, "Sem motivo cadastrado", "devolução sem motivo entra mesmo assim");
eq(devolucao.matriz[2][2].v, null, "culpa RCA nula fica vazia, não a string null");

// ── Receita por cliente ─────────────────────────────────────────────────────────────────
const receita = monta(
  "receita-por-cliente",
  {
    clientes: [
      {
        codCli: 1001,
        cliente: "MERCADO SAO JOSE",
        cidade: "Uberlandia",
        qdeNf: 42,
        receitaBruta: 210500.1,
        desconto: 3200.55,
        devolucao: 5100,
        custoLiq: 160300.2,
        receitaLiquida: 202199.55,
      },
    ],
  },
  "(=) CMV LIQ.",
);

eq(receita.matriz[0].length, 9, "nove colunas");
// Código e nome separados: quem cruza com outra planilha precisa do código sozinho.
eq(receita.matriz[1][0].v, 1001, "código do cliente em coluna própria");
eq(receita.matriz[1][1].v, "MERCADO SAO JOSE", "nome em outra");
eq(receita.matriz[0][7].v, "(CMV LIQ.) Custo líq.", "a coluna que fecha o CMV se anuncia");

// ── Lançamentos ─────────────────────────────────────────────────────────────────────────
const lancamentos = monta(
  "lancamentos",
  {
    lancamentos: [
      {
        recNum: 1,
        historico: "JUROS",
        vPago: -1250.4,
        dtLanc: "2026-09-05T00:00:00",
        dtPagto: null,
        dtCompetencia: "2026-09-01T00:00:00",
        dtCompensacao: null,
        codFilial: "1",
        numNota: 123,
        duplic: "01",
        codFornec: 900,
        fornecedor: "FORNECEDOR",
        nomeFunc: "ANA",
        nomeFuncBaixa: null,
        indice: null,
        numCar: null,
        numBordero: null,
        codProjeto: null,
        numTrans: 55,
        numBanco: 1,
        numCheque: null,
        numSeqBordero: null,
        localizacao: null,
        dtReclassific: null,
        codFuncReclassific: null,
        codCcPrinc: "10",
        descCcPrinc: "ADMINISTRATIVO",
        codConta: 4001,
        conta: "JUROS RECEBIDOS",
      },
    ],
  },
  "DESPESAS FINANCEIRAS",
);

eq(lancamentos.matriz[0].length, 27, "25 colunas da 9815 mais centro de custo e conta");
// Na tela os dois são linhas de grupo; em planilha viram coluna, para tabela dinâmica.
eq(lancamentos.matriz[1][0].v, "ADMINISTRATIVO", "centro de custo repetido na linha");
eq(lancamentos.matriz[1][1].v, "JUROS RECEBIDOS", "conta repetida na linha");
eq(lancamentos.matriz[1][5].v, "05/09/2026", "data em dd/mm/aaaa");
eq(lancamentos.matriz[1][6].v, null, "data nula fica vazia");
eq(lancamentos.matriz[1][4].v, -1250.4, "V. Pago negativo é número negativo");
eq(lancamentos.matriz[0][4].v, "(DESPESAS FINANCEIRAS) V. Pago", "a coluna do total se anuncia");
eq(lancamentos.larguras.length, 27, "uma largura por coluna");

// ── O nome do arquivo ───────────────────────────────────────────────────────────────────
eq(
  nomeDoArquivoDetalhe({
    titulo: "(-) DEVOLUCAO · Setembro/2026",
    periodo,
    linha: { descricao: "(-) DEVOLUCAO", valor: 1 },
    dados: { ...vazio, tipo: "devolucao-por-motivo" },
  }),
  "Detalhe (-) DEVOLUCAO · Setembro-2026 2026-09-01 a 2026-09-09",
  "a barra do mês vira hífen, não desaparece",
);

console.log(`dc14: ${n}/${n} asserções passaram.`);
