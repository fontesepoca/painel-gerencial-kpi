/**
 * dc20 — as regras dos três modos de período, sem banco e sem navegador.
 *
 *   node --experimental-strip-types --import ./docs/validacao/_alias.mjs docs/validacao/dc20_modos_de_periodo.mjs
 *
 * O que este arquivo protege são as decisões que a tela toma **antes** de qualquer consulta:
 * quando o filtro pode rodar, o que o bloco final significa, contra o que a variação compara
 * e quando o duplo clique pergunta antes de gastar minutos.
 *
 * Erros aqui não aparecem como erro. Uma variação que compara os lados errados mostra um
 * número plausível e falso; um `recorteLongo` frouxo deixa alguém iniciar uma consulta de
 * sete minutos com um clique a mais. Os dois passam por tela funcionando.
 */
import assert from "node:assert/strict";
import {
  MAXIMO_DE_ANOS,
  anosOferecidos,
  blocos,
  estimativaDeTempo,
  impedimento,
  intervaloSugerido,
  mostraVariacao,
  recorteLongo,
  rotuloDaVariacao,
  usaAnos,
  usaDatas,
  usaSegundoIntervalo,
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

/** Colunas como a API as devolve, com o bloco de cada uma. */
const coluna = (rotulo, bloco) => ({ mesAno: rotulo, rotulo, dataInicio: "", dataFim: "", bloco });

// Jan–Mar/2025 contra Jun–Set/2026: tamanhos DIFERENTES, que é o caso que o modo novo
// existe para permitir.
const COMPARATIVO = [
  coluna("Janeiro/2025", 0),
  coluna("Fevereiro/2025", 0),
  coluna("Março/2025", 0),
  coluna("Junho/2026", 1),
  coluna("Julho/2026", 1),
  coluna("Agosto/2026", 1),
  coluna("Setembro/2026", 1),
];

// ── que controles cada modo usa ──────────────────────────────────────────────
eq(usaDatas("meses"), true, "modo mensal usa as datas");
eq(usaDatas("comparar-anos"), true, "o comparativo usa as datas — as do primeiro intervalo");
eq(usaDatas("anos"), false, "por ano inteiro as datas não entram — e por isso somem da tela");
eq(usaAnos("meses"), false, "o modo mensal ignora os anos");
eq(usaAnos("comparar-anos"), false, "o comparativo deixou de usar anos em 11/09/2026");
eq(usaAnos("anos"), true, "só o modo por ano inteiro usa a lista");
eq(usaSegundoIntervalo("comparar-anos"), true, "só o comparativo tem segundo intervalo");
eq(usaSegundoIntervalo("meses"), false, "");

// Modo ausente ou desconhecido é o mensal — a mesma tolerância que o servidor aplica.
eq(usaAnos(undefined), false, "modo ausente é mensal, não ano");
eq(usaSegundoIntervalo("qualquer-coisa"), false, "modo desconhecido também");

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

// O segundo intervalo passa pelas MESMAS regras do primeiro. Sem isto, um intervalo B
// invertido entraria por uma porta que o A tem fechada.
eq(
  impedimento({ ...base, modo: "comparar-anos" }),
  "Preencha o segundo intervalo da comparação.",
  "comparativo sem o segundo lado",
);
eq(
  impedimento({ ...base, modo: "comparar-anos", comparacaoInicio: "2025-09-10", comparacaoFim: "2025-09-01" }),
  "No segundo intervalo, a data final não pode ser anterior à inicial.",
  "segundo intervalo invertido",
);
eq(
  impedimento({ ...base, modo: "comparar-anos", comparacaoInicio: "2024-01-01", comparacaoFim: "2025-06-01" }),
  "O segundo intervalo não pode passar de 12 meses.",
  "segundo intervalo longo demais",
);
eq(
  impedimento({ ...base, modo: "comparar-anos", comparacaoInicio: "2025-09-01", comparacaoFim: "2025-09-10" }),
  null,
  "comparativo completo pode rodar",
);

// ── a sugestão ao entrar no comparativo ──────────────────────────────────────
// Dois campos vazios obrigariam a digitar duas datas antes de ver qualquer coisa.
eq(
  intervaloSugerido(base),
  { comparacaoInicio: "2025-09-01", comparacaoFim: "2025-09-10" },
  "sugere o mesmo recorte um ano antes",
);
eq(
  intervaloSugerido({ ...base, dataInicio: "2024-02-01", dataFim: "2024-02-29" }).comparacaoFim,
  "2023-02-28",
  "29/02 vira 28/02 no ano comum — a data inexistente sairia como campo vazio sem explicação",
);

// ── o bloco final ────────────────────────────────────────────────────────────
eq(mostraVariacao("meses", [coluna("a", 0), coluna("b", 0)]), false, "o modo mensal mantém o total");
eq(mostraVariacao("anos", [coluna("2026", 0)]), false, "com um ano só não há de que variar");
eq(mostraVariacao("anos", [coluna("2025", 0), coluna("2026", 0)]), true, "dois anos mostram variação");
eq(mostraVariacao("comparar-anos", COMPARATIVO), true, "o comparativo mostra variação");
eq(blocos(COMPARATIVO), [0, 1], "dois blocos");
eq(blocos([coluna("a", 0), coluna("b", 0)]), [0], "um bloco fora do comparativo");

eq(
  rotuloDaVariacao("comparar-anos", COMPARATIVO),
  "Jan–Mar/2025 → Jun–Set/2026",
  "o rótulo cita os dois INTERVALOS, não as duas últimas colunas",
);
eq(
  rotuloDaVariacao("anos", [coluna("2024", 0), coluna("2025", 0), coluna("2026", 0)]),
  "2024 → 2026",
  "no modo por ano, da primeira à última coluna",
);

// ── a variação ───────────────────────────────────────────────────────────────
//
// A conferência que importa: no comparativo ela compara a SOMA de cada lado. Comparar a
// primeira contra a última coluna daria -50 aqui (10 contra ... ), um número plausível e
// completamente errado.
const valores = [
  { valor: 100 }, { valor: 100 }, { valor: 100 }, // bloco 0 = 300
  { valor: 50 }, { valor: 50 }, { valor: 50 }, { valor: 50 }, // bloco 1 = 200
];
{
  // Arredondado: `(-100/300)*100` e `-100/3` diferem na última casa do ponto flutuante, e
  // essa diferença não é o que este teste existe para vigiar.
  const v = variacao(valores, COMPARATIVO, "comparar-anos");
  eq(
    { absoluta: v.absoluta, percentual: Math.round(v.percentual * 1000) / 1000 },
    { absoluta: -100, percentual: -33.333 },
    "soma de um lado contra a soma do outro, com tamanhos diferentes",
  );
}
eq(
  variacao([{ valor: 100 }, { valor: 75 }], [coluna("2025", 0), coluna("2026", 0)], "anos"),
  { absoluta: -25, percentual: -25 },
  "no modo por ano, primeira contra última",
);
eq(
  variacao(
    [{ valor: -200 }, { valor: -100 }],
    [coluna("2025", 0), coluna("2026", 0)],
    "anos",
  ),
  { absoluta: 100, percentual: 50 },
  "despesa que encolhe: o percentual usa o módulo da base, senão o sinal se inverte sozinho",
);
eq(
  variacao([{ valor: 0 }, { valor: 500 }], [coluna("2025", 0), coluna("2026", 0)], "anos"),
  { absoluta: 500, percentual: null },
  "sair de zero não tem percentual que descreva — o valor absoluto continua valendo",
);
eq(variacao([{ valor: 10 }], [coluna("2026", 0)], "anos"), null, "uma coluna só não varia");

// ── quando o duplo clique pergunta antes ─────────────────────────────────────
eq(recorteLongo({ dataInicio: "2026-09-01", dataFim: "2026-09-10" }), false, "dez dias não perguntam");
eq(recorteLongo({ dataInicio: "2026-08-01", dataFim: "2026-08-31" }), false, "um mês não pergunta");
eq(recorteLongo({ dataInicio: "2026-01-01", dataFim: "2026-12-31" }), true, "um ano pergunta");

// ── o aviso de tempo ─────────────────────────────────────────────────────────
eq(estimativaDeTempo(base), null, "mensal curto não avisa nada — aviso demais ensina a ignorar aviso");
eq(estimativaDeTempo({ ...base, modo: "anos" }), null, "sem ano escolhido não há o que estimar");
assert.match(
  estimativaDeTempo({ ...base, modo: "anos", anos: [2026] }) ?? "",
  /4 a 7 minutos/,
  "o número do aviso é o medido na dc19, não um chute",
);
n++;
eq(
  estimativaDeTempo({ ...base, modo: "comparar-anos", comparacaoInicio: "2025-09-01", comparacaoFim: "2025-09-10" }),
  null,
  "comparativo de dez dias por lado não avisa: custa duas apurações curtas, em paralelo",
);

// ── os anos oferecidos ───────────────────────────────────────────────────────
eq(anosOferecidos(new Date(2026, 8, 10))[0], 2026, "o primeiro é o ano corrente");
eq(anosOferecidos(new Date(2026, 8, 10)).length, 6, "seis anos cabem numa linha do filtro");

console.log(`✓ ${n} conferências`);
