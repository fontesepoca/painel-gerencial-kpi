/**
 * pr1 — as opções do menu Exibição guardadas por usuário (25/11/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/pr1_preferencias_da_exibicao.mjs
 *
 * Roda o módulo REAL do front (`lib/preferenciasDaExibicao.ts`): o padrão de cada opção, a
 * leitura defensiva do que vem do banco, a junção com o clique feito antes de ele chegar, e
 * a loja que decide o que vai ao banco. O `gravar` é falso e anota o que recebeu.
 * Spec: docs/superpowers/specs/2026-11-25-preferencias-por-usuario-design.md.
 *
 * Não toca no banco nem no navegador.
 */
import assert from "node:assert/strict";
import {
  IDS_DA_EXIBICAO,
  PADRAO_DA_EXIBICAO,
  aoCarregar,
  contarForaDoPadrao,
  criarLojaDaExibicao,
  diferencas,
  lerExibicao,
  trechoDaExibicao,
} from "../../../client-new-kpi/lib/preferenciasDaExibicao.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};
const ok = (condicao, oque) => eq(!!condicao, true, oque);

// ── 1. O padrão é o estado em que a tela abria até hoje, opção a opção ──────────────────────
eq({ ...PADRAO_DA_EXIBICAO }, {
  zeradas: false,
  informativos: true,
  "ocultar-baixas": true,
  av: true,
  ah: true,
  provisionado: true,
  confirmados: false,
  "sem-total": false,
  "so-total": false,
  "selecionar-linhas": false,
  "mover-linhas": true,
  codigos: false,
}, "o padrão de cada uma das 12 opções");
eq([...IDS_DA_EXIBICAO].sort(), Object.keys(PADRAO_DA_EXIBICAO).sort(), "a lista de ids é a do padrão");

// ── 2. O selo do botão abre em zero ─────────────────────────────────────────────────────────
const menu = (estado, extra = {}) =>
  IDS_DA_EXIBICAO.map((id) => ({ id, marcada: estado[id], ...(extra[id] ?? {}) }));
eq(contarForaDoPadrao(menu(PADRAO_DA_EXIBICAO)), 0,
  "no padrão o selo é 0 (antes contava Informativos, Mover linhas e Ocultar estornados)");
eq(contarForaDoPadrao(menu({ ...PADRAO_DA_EXIBICAO, confirmados: true, ah: false })), 2, "duas fora do padrão");
eq(contarForaDoPadrao(menu({ ...PADRAO_DA_EXIBICAO, confirmados: true }, { confirmados: { oculta: true } })), 0,
  "opção escondida não conta");
eq(contarForaDoPadrao(menu({ ...PADRAO_DA_EXIBICAO, ah: false }, { ah: { motivo: "um mês só" } })), 0,
  "opção desabilitada não conta");
eq(contarForaDoPadrao([{ id: "desconhecida", marcada: true }]), 0, "id fora da lista não conta");

// ── 3. Leitura defensiva ────────────────────────────────────────────────────────────────────
for (const lixo of [null, undefined, [], "texto", 42, {}, { exibicao: null }, { exibicao: [] }, { exibicao: "x" }]) {
  eq(lerExibicao(lixo), {}, `lixo vira nada: ${JSON.stringify(lixo)}`);
}
eq(lerExibicao({ exibicao: { av: false, foo: true, ah: "false", zeradas: 1 } }), { av: false },
  "chave desconhecida e valor não booleano são ignorados");
eq(lerExibicao({ exibicao: { "sem-total": true, "so-total": true, codigos: true } }), { codigos: true },
  "Sem Total e Só Total os dois marcados: os dois ignorados");
eq(lerExibicao({ exibicao: { "sem-total": true, "so-total": false } }), { "sem-total": true, "so-total": false },
  "o par coerente passa");
eq(lerExibicao({ ordem: { "grupo-contas": ["a"] }, exibicao: { confirmados: true } }), { confirmados: true },
  "as outras seções não atrapalham");

// ── 4. A junção do que chegou com o que a pessoa já mexeu ───────────────────────────────────
{
  const r = aoCarregar(PADRAO_DA_EXIBICAO, { ah: false }, new Set());
  eq(r.estado.ah, false, "sem clique: vale o banco");
  eq(r.gravado.ah, false, "e o gravado é o banco");
  eq(r.estado.av, true, "o que o banco não tem fica no padrão");
}
{
  const r = aoCarregar({ ...PADRAO_DA_EXIBICAO, av: false }, { av: true, ah: false }, new Set(["av"]));
  eq(r.estado.av, false, "clique antes da carga vence o banco");
  eq(r.gravado.av, true, "e o gravado continua sendo o do banco — a diferença vai ser gravada");
  eq(r.estado.ah, false, "o resto vem do banco");
}
{
  const r = aoCarregar({ ...PADRAO_DA_EXIBICAO, "sem-total": true }, { "so-total": true }, new Set(["sem-total"]));
  eq([r.estado["sem-total"], r.estado["so-total"]], [true, false], "Sem Total clicado + Só Total do banco: vale o clique");
}
{
  const r = aoCarregar({ ...PADRAO_DA_EXIBICAO, "so-total": true }, { "sem-total": true }, new Set(["so-total"]));
  eq([r.estado["sem-total"], r.estado["so-total"]], [false, true], "e o contrário");
}

// ── 5. Diferenças e trecho ──────────────────────────────────────────────────────────────────
eq(diferencas(PADRAO_DA_EXIBICAO, PADRAO_DA_EXIBICAO), {}, "iguais: nada");
eq(diferencas({ ...PADRAO_DA_EXIBICAO, av: false, codigos: true }, PADRAO_DA_EXIBICAO), { av: false, codigos: true },
  "só o que difere");
eq(trechoDaExibicao({ av: false }), { exibicao: { av: false } }, "o trecho vai dentro da seção exibicao");

// ── 6. A loja ───────────────────────────────────────────────────────────────────────────────
{
  const gravados = [];
  const loja = criarLojaDaExibicao((t) => gravados.push(t));
  let avisos = 0;
  loja.inscrever(() => avisos++);

  eq(loja.ler(), PADRAO_DA_EXIBICAO, "abre no padrão");
  loja.mudar({ av: false });
  eq(loja.ler().av, false, "o clique muda a tela na hora");
  eq(avisos, 1, "e avisa quem lê");
  eq(gravados, [], "antes de carregar, nada vai ao banco");

  ok(!loja.jaCarregou("Epoca:144"), "ainda não carregou");
  loja.carregar("Epoca:144", { exibicao: { av: true, ah: false } });
  ok(loja.jaCarregou("Epoca:144"), "carregou");
  eq([loja.ler().av, loja.ler().ah], [false, false], "o clique anterior vence; o resto vem do banco");
  eq(gravados, [{ exibicao: { av: false } }], "e o clique anterior é gravado ao carregar");

  loja.carregar("Epoca:144", { exibicao: { av: true } });
  eq(loja.ler().av, false, "carregar de novo a mesma chave não faz nada");
  eq(gravados.length, 1, "nem grava");

  const antes = loja.ler();
  const avisosAntes = avisos;
  loja.mudar({ av: false });
  ok(loja.ler() === antes, "clique igual ao estado: o objeto não muda (useSyncExternalStore compara por identidade)");
  eq([gravados.length, avisos], [1, avisosAntes], "nem grava, nem avisa");

  loja.mudar({ "so-total": true });
  eq(gravados.at(-1), { exibicao: { "so-total": true } }, "só a opção mexida vai ao banco");
  loja.mudar({ "sem-total": true, "so-total": false });
  eq(gravados.at(-1), { exibicao: { "sem-total": true, "so-total": false } }, "o par Sem Total/Só Total num trecho só");
  loja.mudar({ "sem-total": false });
  eq(gravados.at(-1), { exibicao: { "sem-total": false } }, "desmarcar também grava");
}
{
  // GET que falhou: o hook carrega como `{}`. Nada é gravado de saída, e o próximo clique
  // grava só a si mesmo — o JSON_MERGEPATCH não apaga o que o banco tinha das outras opções.
  const gravados = [];
  const loja = criarLojaDaExibicao((t) => gravados.push(t));
  loja.carregar("Epoca:144", {});
  eq(gravados, [], "carga vazia não grava nada");
  loja.mudar({ codigos: true });
  eq(gravados, [{ exibicao: { codigos: true } }], "o clique seguinte grava só a si");
}

{
  // REVISÃO FINAL, 25/11/2026: "diferente do padrão" não é "a pessoa clicou".
  // (a) Clicou e voltou ao padrão antes da carga: vale o último clique, não o banco.
  const gravados = [];
  const loja = criarLojaDaExibicao((t) => gravados.push(t));
  loja.mudar({ ah: false });
  loja.mudar({ ah: true });
  loja.carregar("Epoca:144", { exibicao: { ah: false } });
  eq(loja.ler().ah, true, "clicou e desfez antes da carga: vale o último clique");
  eq(gravados, [{ exibicao: { ah: true } }], "e ele é gravado");
}
{
  // (b) A página dedicada do detalhe recebe o valor de quem a abriu (aplicarSemGravar). Se a
  //     pessoa navegar dali para o DRE na mesma aba, a carga NÃO pode tratar esse valor como
  //     clique — senão grava por cima da escolha que ela fez na outra aba.
  const gravados = [];
  const loja = criarLojaDaExibicao((t) => gravados.push(t));
  loja.aplicarSemGravar({ "ocultar-baixas": false });
  eq(loja.ler()["ocultar-baixas"], false, "o valor de quem abriu vale na tela");
  loja.carregar("Epoca:144", { exibicao: { "ocultar-baixas": true } });
  eq(loja.ler()["ocultar-baixas"], true, "na carga, vale o banco");
  eq(gravados, [], "e nada é gravado");
}
{
  // (c) aplicarSemGravar depois de carregado: muda a tela e não grava, nem depois.
  const gravados = [];
  const loja = criarLojaDaExibicao((t) => gravados.push(t));
  loja.carregar("Epoca:144", {});
  loja.aplicarSemGravar({ "ocultar-baixas": false });
  loja.mudar({ codigos: true });
  eq(gravados, [{ exibicao: { codigos: true } }], "o clique seguinte grava só a si, não o valor recebido");
}

console.log(`✓ pr1 passou — ${n} conferências`);
