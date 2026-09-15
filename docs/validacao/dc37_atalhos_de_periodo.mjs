/**
 * dc37 — os atalhos de período e o recorte com que a tela abre.
 *
 *   node --import ./docs/validacao/_alias.mjs docs/validacao/dc37_atalhos_de_periodo.mjs
 *
 * Data é o tipo de defeito que passa despercebido até alguém apurar o mês errado — e as
 * armadilhas aqui não são hipotéticas, são as três que este projeto já encontrou:
 *
 *   • **`toISOString()` num fuso negativo.** UTC−3 às 21h de 31/08 devolve `2026-09-01`. O
 *     filtro nasce apontando para amanhã, a data existe, e ninguém repara.
 *   • **O dia 1º.** "Do dia 1 até ontem" cai no mês passado e inverte o intervalo, que a
 *     tela recusa. Aconteceria no primeiro dia de todo mês.
 *   • **O mês com 28, 30 e 31 dias**, e o ano bissexto.
 *
 * As funções recebem `hoje` como parâmetro justamente para poderem ser exercitadas em
 * qualquer data. Sem banco e sem navegador.
 */
import assert from "node:assert/strict";
import { atalhosPeriodo, periodoPadrao, paraIso, paraBr } from "@/lib/periodos.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

const atalho = (hoje, id) => atalhosPeriodo(hoje).find((a) => a.id === id);
/** Meio-dia, para nenhum teste depender do horário de verão nem da borda do dia. */
const dia = (ano, mes, d) => new Date(ano, mes - 1, d, 12, 0, 0);

// ── o caso do Gabriel, em 15/09/2026 ─────────────────────────────────────────
eq(
  periodoPadrao(dia(2026, 9, 15)),
  { dataInicio: "2026-09-01", dataFim: "2026-09-14" },
  "a tela abre no mês corrente até ONTEM, não até hoje",
);
eq(
  atalho(dia(2026, 9, 15), "mes-atual"),
  { id: "mes-atual", rotulo: "Mês atual", dataInicio: "2026-09-01", dataFim: "2026-09-14" },
  "e o atalho Mês atual dá o mesmo recorte",
);

// O padrão e o atalho saem da MESMA conta. Se divergissem, clicar em "Mês atual" mudaria as
// datas de uma tela que já estava no mês atual.
for (const d of [1, 2, 15, 28, 29, 30, 31]) {
  const hoje = dia(2026, 12, d);
  const a = atalho(hoje, "mes-atual");
  eq(
    periodoPadrao(hoje),
    { dataInicio: a.dataInicio, dataFim: a.dataFim },
    `dia ${d}: o padrão bate com o atalho`,
  );
}

// ── o dia 1º: não há dia fechado no mês ──────────────────────────────────────
//
// Sem a trava, "até ontem" devolveria 31/08 e o intervalo sairia invertido — a tela recusa
// com "a data final não pode ser anterior à inicial", no primeiro dia de todo mês.
{
  const p = periodoPadrao(dia(2026, 9, 1));
  eq(p, { dataInicio: "2026-09-01", dataFim: "2026-09-01" }, "no dia 1º o recorte é o próprio dia 1º");
  assert.ok(p.dataInicio <= p.dataFim, "e nunca sai invertido");
  n++;
}
// Vale para a virada de ano também, onde o mês anterior é de outro ano.
eq(
  periodoPadrao(dia(2027, 1, 1)),
  { dataInicio: "2027-01-01", dataFim: "2027-01-01" },
  "1º de janeiro não volta para dezembro do ano passado",
);
eq(
  periodoPadrao(dia(2027, 1, 2)),
  { dataInicio: "2027-01-01", dataFim: "2027-01-01" },
  "e no dia 2 de janeiro o recorte é o dia 1º",
);

// ── nenhum intervalo sai invertido, em dia nenhum do ano ─────────────────────
//
// 2028 é bissexto: cobre 29/02 de graça.
{
  let conferidos = 0;
  for (let mes = 1; mes <= 12; mes++) {
    for (let d = 1; d <= 31; d++) {
      const hoje = dia(2028, mes, d);
      if (hoje.getMonth() !== mes - 1) continue; // 31 de fevereiro não existe

      for (const a of [...atalhosPeriodo(hoje), { id: "padrao", ...periodoPadrao(hoje) }]) {
        assert.ok(
          a.dataInicio <= a.dataFim,
          `${a.id} em ${paraIso(hoje)}: ${a.dataInicio} a ${a.dataFim} está invertido`,
        );
        conferidos++;
      }
    }
  }
  n += conferidos;
  console.log(`  ${conferidos} intervalos conferidos ao longo de 2028, nenhum invertido`);
}

// ── o fuso: 21h de 31/08 não pode virar 01/09 ────────────────────────────────
//
// `toISOString()` converte para UTC antes de cortar, e em UTC−3 qualquer horário a partir
// das 21h vira o dia seguinte. `paraIso` lê a data LOCAL justamente por isso.
eq(paraIso(new Date(2026, 7, 31, 21, 30, 0)), "2026-08-31", "21h30 de 31/08 continua sendo 31/08");
eq(paraIso(new Date(2026, 7, 31, 23, 59, 59)), "2026-08-31", "e 23h59 também");
eq(
  atalho(new Date(2026, 8, 1, 22, 0, 0), "ontem").dataInicio,
  "2026-08-31",
  "às 22h do dia 1º, 'Ontem' é 31/08 — não 01/09",
);

// ── os atalhos que já existiam não se mexeram ────────────────────────────────
{
  const hoje = dia(2026, 9, 15);
  eq(atalho(hoje, "ontem").dataInicio, "2026-09-14", "Ontem");
  eq(atalho(hoje, "ontem").dataFim, "2026-09-14", "Ontem é um dia só");
  eq(
    { i: atalho(hoje, "mes-passado").dataInicio, f: atalho(hoje, "mes-passado").dataFim },
    { i: "2026-08-01", f: "2026-08-31" },
    "Mês passado é o mês inteiro",
  );
  // Três meses COMPLETOS, terminando no mês passado: incluir o mês corrente pela metade
  // faria a comparação entre colunas mentir.
  eq(
    { i: atalho(hoje, "tres-meses").dataInicio, f: atalho(hoje, "tres-meses").dataFim },
    { i: "2026-06-01", f: "2026-08-31" },
    "Últimos 3 meses não inclui o mês corrente",
  );
  eq(
    { i: atalho(hoje, "ano-passado").dataInicio, f: atalho(hoje, "ano-passado").dataFim },
    { i: "2025-01-01", f: "2025-12-31" },
    "Ano passado",
  );
  eq(
    atalhosPeriodo(hoje).map((a) => a.id),
    ["ontem", "mes-atual", "mes-passado", "tres-meses", "ano-passado"],
    "a ordem da lista cresce em alcance",
  );
}

// ── a data que a tela mostra dentro do atalho ────────────────────────────────
eq(paraBr("2026-09-14"), "14/09/2026", "o atalho exibe o intervalo que vai aplicar");

console.log(`✓ ${n} conferências`);
