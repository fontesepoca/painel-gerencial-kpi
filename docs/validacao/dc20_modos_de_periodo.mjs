/**
 * dc20 — as regras dos três modos de período, sem banco e sem navegador.
 *
 *   node --experimental-strip-types --import ./docs/validacao/_alias.mjs docs/validacao/dc20_modos_de_periodo.mjs
 *
 * O que este arquivo protege são as decisões que a tela toma **antes** de qualquer consulta:
 * quando o filtro pode rodar, que datas o campo mostra no comparativo, o que o bloco final
 * significa, e quando o duplo clique pergunta antes de gastar minutos.
 *
 * Erros aqui não aparecem como erro. Uma ancoragem de data errada mostra um recorte que não
 * é o de nenhuma coluna; um `recorteLongo` frouxo deixa alguém iniciar uma consulta de sete
 * minutos com um clique a mais. Os dois passam por tela funcionando.
 */
import assert from "node:assert/strict";
import {
  MAXIMO_DE_ANOS,
  ancorarNoPrimeiroAno,
  anosOferecidos,
  estimativaDeTempo,
  impedimento,
  mostraVariacao,
  recorteLongo,
  rotuloDaVariacao,
  usaAnos,
  usaDatas,
  variacao,
} from "../../client-new-kpi/lib/modosDePeriodo.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

const base = {
  filiais: ["7"],
  dataInicio: "2026-09-01",
  dataFim: "2026-09-10",
  regime: "caixa",
  analise: "ccusto-principal",
  modo: "meses",
  anos: [],
};

// ── que controles cada modo usa ──────────────────────────────────────────────
eq(usaDatas("meses"), true, "modo mensal usa as datas");
eq(usaDatas("comparar-anos"), true, "o comparativo usa as datas como molde");
eq(usaDatas("anos"), false, "por ano inteiro as datas não entram — e por isso somem da tela");
eq(usaAnos("meses"), false, "o modo mensal ignora os anos");

// O caso que a dc13 pegou: escrito como `!== "meses"`, um modo ausente caía no ramo dos
// anos e ligava o bloco de variação numa apuração mensal.
eq(usaAnos(undefined), false, "modo ausente é mensal, não ano");
eq(usaAnos("qualquer-coisa"), false, "modo desconhecido também");
eq(mostraVariacao(undefined, 2), false, "e por isso não liga a variação");

// ── o que impede apurar ──────────────────────────────────────────────────────
eq(impedimento({ ...base, filiais: [] }), "Escolha ao menos uma filial.", "sem filial");
eq(impedimento(base), null, "mensal com filial pode rodar");
eq(impedimento({ ...base, modo: "anos" }), "Escolha ao menos um ano.", "modo de ano sem ano");
eq(impedimento({ ...base, modo: "anos", anos: [2025, 2026] }), null, "dois anos passam");
eq(
  impedimento({ ...base, modo: "anos", anos: [2022, 2023, 2024, 2025] }),
  `Escolha no máximo ${MAXIMO_DE_ANOS} anos — foram 4.`,
  "o teto de anos é o mesmo da API",
);

// ── ancoragem das datas no comparativo ───────────────────────────────────────
// O campo de data precisa mostrar um recorte que EXISTE. Deixá-lo em 2026 enquanto as
// colunas são 2024 e 2025 faz o filtro dizer uma coisa e a tabela mostrar outra.
eq(
  ancorarNoPrimeiroAno({ ...base, modo: "comparar-anos", anos: [2024, 2025] }),
  { ...base, modo: "comparar-anos", anos: [2024, 2025], dataInicio: "2024-09-01", dataFim: "2024-09-10" },
  "as datas seguem o primeiro ano escolhido",
);
eq(
  ancorarNoPrimeiroAno({ ...base, modo: "meses", anos: [2024] }).dataInicio,
  "2026-09-01",
  "no modo mensal a ancoragem não mexe em nada",
);
eq(
  ancorarNoPrimeiroAno({ ...base, modo: "comparar-anos", anos: [] }).dataInicio,
  "2026-09-01",
  "sem ano escolhido não há em que ancorar",
);

// 29 de fevereiro: o caso que cria uma data inexistente se ninguém olhar.
eq(
  ancorarNoPrimeiroAno({
    ...base,
    modo: "comparar-anos",
    anos: [2025, 2026],
    dataInicio: "2024-02-01",
    dataFim: "2024-02-29",
  }).dataFim,
  "2025-02-28",
  "29/02 num ano comum é preso ao último dia do mês",
);
eq(
  ancorarNoPrimeiroAno({
    ...base,
    modo: "comparar-anos",
    anos: [2024, 2025],
    dataInicio: "2023-02-01",
    dataFim: "2023-02-28",
  }).dataFim,
  "2024-02-28",
  "28/02 num ano bissexto continua 28 — a regra encurta, nunca estica",
);

// ── o bloco final ────────────────────────────────────────────────────────────
eq(mostraVariacao("meses", 3), false, "o modo mensal mantém o bloco de total");
eq(mostraVariacao("anos", 1), false, "com um ano só não há de que variar");
eq(mostraVariacao("anos", 2), true, "dois anos mostram variação");
eq(mostraVariacao("comparar-anos", 3), true, "três recortes também");

eq(
  rotuloDaVariacao([{ rotulo: "2024" }, { rotulo: "2025" }, { rotulo: "2026" }]),
  "2024 → 2026",
  "com três anos a comparação é da primeira à última coluna, e o rótulo diz isso",
);
eq(rotuloDaVariacao([{ rotulo: "2026" }]), "Variação", "coluna única não tem par para citar");

eq(
  variacao([{ valor: 100 }, { valor: 75 }]),
  { absoluta: -25, percentual: -25 },
  "queda de um quarto",
);
eq(
  variacao([{ valor: -200 }, { valor: -100 }]),
  { absoluta: 100, percentual: 50 },
  "despesa que encolhe: o percentual usa o módulo da base, senão o sinal se inverte sozinho",
);
eq(
  variacao([{ valor: 0 }, { valor: 500 }]),
  { absoluta: 500, percentual: null },
  "sair de zero não tem percentual que descreva — o valor absoluto continua valendo",
);
eq(variacao([{ valor: 10 }]), null, "uma coluna só não varia");

// ── quando o duplo clique pergunta antes ─────────────────────────────────────
eq(recorteLongo({ dataInicio: "2026-09-01", dataFim: "2026-09-10" }), false, "dez dias não perguntam");
eq(recorteLongo({ dataInicio: "2026-08-01", dataFim: "2026-08-31" }), false, "um mês não pergunta");
eq(recorteLongo({ dataInicio: "2026-01-01", dataFim: "2026-12-31" }), true, "um ano pergunta");
eq(
  recorteLongo({ dataInicio: "2026-07-01", dataFim: "2026-09-10" }),
  true,
  "72 dias perguntam — a regra é o tamanho do recorte, não o modo que o gerou",
);

// ── o aviso de tempo ─────────────────────────────────────────────────────────
eq(estimativaDeTempo(base), null, "mensal curto não avisa nada — aviso demais ensina a ignorar aviso");
eq(estimativaDeTempo({ ...base, modo: "anos" }), null, "sem ano escolhido não há o que estimar");
assert.match(
  estimativaDeTempo({ ...base, modo: "anos", anos: [2026] }) ?? "",
  /4 a 7 minutos/,
  "o número do aviso é o medido na dc19, não um chute",
);
assert.match(
  estimativaDeTempo({ ...base, modo: "anos", anos: [2025, 2026] }) ?? "",
  /ao mesmo tempo/,
  "com vários anos o aviso diz que eles são consultados em paralelo",
);
n += 2;

// ── os anos oferecidos ───────────────────────────────────────────────────────
eq(anosOferecidos(new Date(2026, 8, 10))[0], 2026, "o primeiro é o ano corrente");
eq(anosOferecidos(new Date(2026, 8, 10)).length, 6, "seis anos cabem numa linha do filtro");

console.log(`✓ ${n} conferências`);
