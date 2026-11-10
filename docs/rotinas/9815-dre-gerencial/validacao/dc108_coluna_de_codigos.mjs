/**
 * dc108 — a coluna dos CÓDIGOS (10/11/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc108_coluna_de_codigos.mjs
 *
 * Pedido do Gabriel: um checkbox no menu Exibição que mostra, à esquerda da descrição, o número
 * da conta / grupo / centro de cada linha; o que não tem número — os totalizadores e as demais
 * linhas calculadas — mostra um traço, o MESMO "—" das células sem valor. Desligado por padrão.
 * O Excel da apuração sai como a tela: com a coluna "Código" só quando ela está ligada.
 */
import assert from "node:assert/strict";
import { codigoDaLinha } from "../../../../client-new-kpi/lib/codigoDaLinha.ts";
import { planilhaDaApuracao } from "../../../../client-new-kpi/lib/exportarExcel.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

const periodos = [
  { mesAno: "2026-07", rotulo: "Julho/2026" },
  { mesAno: "2026-08", rotulo: "Agosto/2026" },
];
const linha = (chave, descricao, valor, extra = {}) => ({
  id: 1,
  chaveOrdem: descricao,
  papel: null,
  chave,
  descricao,
  valores: periodos.map((p) => ({ mesAno: p.mesAno, valor, percentualAv: 10, percentualAh: null })),
  total: { valor: valor * 2, media: valor, percentualAv: 10 },
  totalizadora: false,
  calculada: false,
  naoSoma: false,
  semMovimento: false,
  zerada: false,
  cor: null,
  detalhe: null,
  composicao: [],
  ...extra,
});

const conta = linha("3000165", "INDENIZACAO DE MERC. VENC.", -100);
const centro = linha("1001", "ADMINISTRATIVO", -50);
const totalizador = linha("-12", "LUCRO BRUTO", 300, { calculada: true, totalizadora: true, papel: "lucro-bruto" });
const receita = linha("-1", "(+) RECEITA BRUTA", 1000, { calculada: true, papel: "receita-bruta" });

// ── O código de cada linha ──────────────────────────────────────────────────────────────
eq(codigoDaLinha(conta), "3000165", "a conta mostra o próprio número");
eq(codigoDaLinha(centro), "1001", "o centro de custo também");
eq(codigoDaLinha(totalizador), "—", "o totalizador não tem número: traço");
eq(codigoDaLinha(receita), "—", "nem a receita, que também é calculada (código negativo no cadastro)");
eq(codigoDaLinha(linha("  ", "SEM CHAVE", 0)), "—", "chave vazia: traço, e não uma célula em branco");

// ── O Excel: igual ao de sempre sem a coluna, deslocado uma coluna com ela ───────────────
const dados = {
  regime: "competencia",
  analise: "conta-gerencial",
  dataInicio: "2026-07-01",
  dataFim: "2026-08-31",
  filiais: ["7"],
  periodos,
  linhas: [receita, totalizador, conta, centro],
  avisos: [],
  apuradoEm: "2026-11-10T12:00:00Z",
  duracaoMs: 1,
};
const colunas = { av: true, ah: true };
const sem = planilhaDaApuracao(dados, dados.linhas, colunas);
const com = planilhaDaApuracao(dados, dados.linhas, { ...colunas, codigos: true });

eq(planilhaDaApuracao(dados, dados.linhas, { ...colunas, codigos: false }), sem,
  "desligada, a planilha é exatamente a de sempre");
eq(com.matriz[1].slice(0, 2).map((c) => c.v), ["Código", "Descrição"], "ligada, o cabeçalho abre com Código e Descrição");
eq(com.matriz.slice(2).map((r) => r[0].v), ["—", "—", "3000165", "1001"], "e cada linha abre com o código, ou o traço");
eq(com.matriz.slice(2).map((r) => r[1].v), sem.matriz.slice(2).map((r) => r[0].v), "a descrição vem logo depois");
eq(com.matriz.map((r) => r.slice(1)), sem.matriz, "o resto da planilha é o mesmo, uma coluna à direita");
eq(com.merges, sem.merges.map((m) => ({ s: { ...m.s, c: m.s.c + 1 }, e: { ...m.e, c: m.e.c + 1 } })),
  "as faixas dos meses se deslocam junto");
eq(com.congelar, { ...sem.congelar, colunas: sem.congelar.colunas + 1 }, "o congelamento passa a prender código e descrição");
eq(com.larguras.length, sem.larguras.length + 1, "uma largura a mais");
eq(com.matriz[2][0].s?.alinhar, "direita", "o código alinha à direita, como número");
eq(com.matriz[3][0].s?.fundo, com.matriz[3][1].s?.fundo, "e herda o fundo da linha (o cinza do totalizador)");

console.log(`✓ dc108 passou — ${n} conferências`);
