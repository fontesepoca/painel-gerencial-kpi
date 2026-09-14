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
  intervalosSugeridos,
  mostraVariacao,
  recorteLongo,
  rotuloDaVariacao,
  usaAnos,
  usaDatas,
  usaSegundoIntervalo,
  variacao,
} from "../../client-new-kpi/lib/modosDePeriodo.ts";
import { lerVariacao } from "../../client-new-kpi/lib/leituraDaVariacao.ts";

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
//
// Dois campos vazios obrigariam a digitar duas datas antes de ver qualquer coisa.
//
// A ORDEM É CRONOLÓGICA: o período que estava na tela desce para o SEGUNDO intervalo e o
// ano anterior ocupa o PRIMEIRO, para a tela ler `2025 → 2026` da esquerda para a direita.
// O desenho original punha o ano atual à esquerda, e a seta apontava para trás enquanto o
// `AH %` e a variação contavam a história para a frente. Trocado em 14/09/2026.
eq(
  intervalosSugeridos(base),
  {
    dataInicio: "2025-09-01",
    dataFim: "2025-09-10",
    comparacaoInicio: "2026-09-01",
    comparacaoFim: "2026-09-10",
  },
  "o ano anterior no primeiro intervalo, o período escolhido no segundo",
);
eq(
  intervalosSugeridos({ ...base, dataInicio: "2024-02-01", dataFim: "2024-02-29" }).dataFim,
  "2023-02-28",
  "29/02 vira 28/02 no ano comum — a data inexistente sairia como campo vazio sem explicação",
);

// O segundo intervalo é o período intocado, inclusive num 29/02 que o primeiro teve que
// encurtar: só o lado que anda um ano para trás corre risco de cair em data inexistente.
eq(
  intervalosSugeridos({ ...base, dataInicio: "2024-02-01", dataFim: "2024-02-29" }).comparacaoFim,
  "2024-02-29",
  "o segundo intervalo repete o período escolhido, sem mexer em nada",
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
// Duas coisas são conferidas aqui, e as duas já falharam.
//
// 1. No comparativo ela compara a SOMA de cada lado. Comparar a primeira contra a última
//    coluna dá outro número — na dc26, com dado real, os dois saem com SINAIS OPOSTOS.
//
// 2. O SINAL segue a convenção do AH %: positivo quando a linha CRESCE, seja ela receita
//    ou despesa. A subtração crua diria "negativo" para uma devolução que aumentou, e a
//    tela mostrava (127.178,73) em verde ao lado de um AH % vermelho — a mesma linha, a
//    mesma direção, contradizendo-se em duas colunas vizinhas. Reportado pelo Gabriel em
//    11/09/2026, comparando 2024 com 2025.
const arredondar = (v) =>
  v === null
    ? null
    : {
        absoluta: Math.round(v.absoluta * 100) / 100,
        percentual: v.percentual === null ? null : Math.round(v.percentual * 1000) / 1000,
      };

const valores = [
  { valor: 100 }, { valor: 100 }, { valor: 100 }, // bloco 0 = 300
  { valor: 50 }, { valor: 50 }, { valor: 50 }, { valor: 50 }, // bloco 1 = 200
];
eq(
  arredondar(variacao(valores, COMPARATIVO, "comparar-anos")),
  { absoluta: -100, percentual: -33.333 },
  "soma de um lado contra a soma do outro, com tamanhos diferentes",
);

// ── O CASO DO GABRIEL: devolução que aumenta ─────────────────────────────────
//
// Dedução chega negativa. Ela ficou 127.178,73 MAIOR, e é isso que a tela precisa dizer —
// com o mesmo sinal que o AH % dá, e com a cor de má notícia.
{
  const doisAnos = [coluna("2024", 0), coluna("2025", 0)];
  const v = arredondar(variacao([{ valor: -1000000 }, { valor: -1127178.73 }], doisAnos, "anos"));

  eq(v.absoluta, 127178.73, "a devolução CRESCEU: o número sai positivo, não entre parênteses");
  eq(v.percentual, 12.718, "e o percentual é positivo, como o AH % da mesma linha");
  eq(
    lerVariacao(v.absoluta, -2127178.73),
    "desfavoravel",
    "crescer numa linha negativa é má notícia — vermelho, e não verde",
  );
}

// A mesma linha encolhendo: número negativo e boa notícia.
{
  const doisAnos = [coluna("2024", 0), coluna("2025", 0)];
  const v = arredondar(variacao([{ valor: -1127178.73 }, { valor: -1000000 }], doisAnos, "anos"));
  eq(v.absoluta, -127178.73, "a devolução encolheu: número negativo");
  eq(lerVariacao(v.absoluta, -2127178.73), "favoravel", "e é boa notícia");
}

// Receita, o lado positivo do DRE: crescer é bom, cair é ruim.
eq(
  arredondar(variacao([{ valor: 100 }, { valor: 75 }], [coluna("2025", 0), coluna("2026", 0)], "anos")),
  { absoluta: -25, percentual: -25 },
  "receita que cai: número negativo",
);
eq(lerVariacao(-25, 175), "desfavoravel", "e é má notícia");
eq(
  arredondar(variacao([{ valor: 100 }, { valor: 125 }], [coluna("2025", 0), coluna("2026", 0)], "anos")),
  { absoluta: 25, percentual: 25 },
  "receita que sobe: número positivo",
);
eq(lerVariacao(25, 225), "favoravel", "e é boa notícia");

// Despesa que encolhe — o caso simétrico ao do Gabriel.
eq(
  arredondar(variacao([{ valor: -200 }, { valor: -100 }], [coluna("2025", 0), coluna("2026", 0)], "anos")),
  { absoluta: -100, percentual: -50 },
  "despesa que encolhe: número negativo, e o percentual acompanha o AH %",
);
eq(lerVariacao(-100, -300), "favoravel", "gastar menos é boa notícia");

eq(
  arredondar(variacao([{ valor: 0 }, { valor: 500 }], [coluna("2025", 0), coluna("2026", 0)], "anos")),
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
