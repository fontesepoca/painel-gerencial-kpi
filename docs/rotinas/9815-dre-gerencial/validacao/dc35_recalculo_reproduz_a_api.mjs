/**
 * dc35 — a aritmética do front reproduz a do servidor, ao centavo.
 *
 *   node --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc35_recalculo_reproduz_a_api.mjs
 *
 * Em 15/09/2026 arrastar uma linha passou a **mudar os totais**: uma conta soma na primeira
 * linha calculada abaixo dela, e os totalizadores se refazem na tela. Refazer a apuração no
 * servidor a cada arrasto é inviável — ela leva de segundos a minutos —, então a conta é
 * feita no front, em `client-new-kpi/lib/recalculoDoDre.ts`.
 *
 * Isso cria duas aritméticas para o mesmo DRE, uma em C# e outra em TypeScript, livres para
 * divergir. **Este arquivo é o que as amarra.**
 *
 * A INVARIANTE
 *
 *   Com a ordem do cadastro — todos os encaixes vazios —, `recalcular()` tem de devolver
 *   EXATAMENTE o que a API mandou. Valor de cada coluna, `%AV`, `%AH`, total, média.
 *
 * Qualquer diferença aqui é a cópia de uma fórmula que saiu errada, e ela apareceria na tela
 * como um total que muda sozinho quando o usuário arrasta e desfaz. Meio centavo é a
 * tolerância; o arredondamento half-to-even é parte do que está sendo conferido, então nem
 * isso deveria aparecer.
 *
 * Roda nas TRÊS dimensões: elas têm conjuntos de âncoras diferentes — só C. Custo Principal
 * tem `SUBTOTAL POSITIVO` —, e é justamente o ramo do `?? lucro-bruto` que erraria calado.
 *
 * PRECISA DA API NO AR, em http://localhost:5207, com o banco alcançável.
 */
import { postar } from "./_postar.mjs";
import { recalcular } from "@/lib/recalculoDoDre.ts";

// A porta sai do ambiente como nas dc41 e dc51, para dar para rodar contra uma instancia
// de teste sem derrubar a que o Gabriel usa.
const API = `${process.env.API ?? "http://localhost:5207"}/api/dre-gerencial/apuracao`;

const BASE = {
  filiais: ["7", "12", "25"],
  dataInicio: "2026-06-01",
  dataFim: "2026-07-31",
  regime: "competencia",
  modo: "meses",
};

// Agosto e setembro/2026 ainda têm título em aberto: é o cenário que exercita o PROVISIONADO
// (14/10/2026) — o P das contas e dos totalizadores e os %AV/%AH sobre R + P, que o
// `recalcular` também refaz. Em junho e julho quase tudo já foi pago, e conferir o
// provisionado lá seria conferir nulo contra nulo.
const CENARIOS = [
  { rotulo: "jun–jul/2026", filtro: BASE, exigeProvisionado: false },
  { rotulo: "ago–set/2026", filtro: { ...BASE, dataInicio: "2026-08-01", dataFim: "2026-09-30" }, exigeProvisionado: true },
];

let falhas = 0;
const ok = (condicao, oque) => {
  if (!condicao) {
    console.log(`FALHA  ${oque}`);
    falhas++;
  }
};

const fmt = (v) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** Meio centavo para valor; um milésimo para percentual, que é exibido com 3 casas. */
const bate = (a, b, tol) => {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return Math.abs(a - b) <= tol;
};

async function apurar(filtro, analise) {
  const r = await postar(API, { ...filtro, analise });
  if (!r?.sucesso) throw new Error(`${analise}: ${r?.mensagem ?? "resposta sem sucesso"}`);
  return r.dados;
}

for (const cenario of CENARIOS)
for (const analise of ["grupo-contas", "conta-gerencial", "ccusto-principal"]) {
  const d = await apurar(cenario.filtro, analise);
  const daApi = d.linhas;
  const refeito = recalcular(daApi, daApi);

  console.log(`\n${analise.toUpperCase()} · ${cenario.rotulo} — ${daApi.length} linhas, ${daApi[0].valores.length} colunas`);
  let comProvisionado = 0;

  ok(refeito.length === daApi.length, `${analise}: a contagem de linhas mudou`);

  let conferidas = 0;
  let ancoras = 0;

  for (const [i, esperada] of daApi.entries()) {
    const achou = refeito[i];
    if (!achou) { ok(false, `${analise}: linha ${i} sumiu`); continue; }

    const nome = esperada.descricao.trim();
    ok(achou.chaveOrdem === esperada.chaveOrdem, `${analise} / ${nome}: a ordem mudou`);
    if (esperada.papel) ancoras++;

    for (const [c, v] of esperada.valores.entries()) {
      const n = achou.valores[c];
      const coluna = d.periodos[c]?.rotulo ?? c;
      ok(bate(v.valor, n?.valor, 0.005), `${analise} / ${nome} / ${coluna}: valor ${fmt(n?.valor)} ≠ ${fmt(v.valor)}`);
      ok(bate(v.percentualAv, n?.percentualAv, 0.001), `${analise} / ${nome} / ${coluna}: %AV ${fmt(n?.percentualAv)} ≠ ${fmt(v.percentualAv)}`);
      ok(bate(v.percentualAh, n?.percentualAh, 0.001), `${analise} / ${nome} / ${coluna}: %AH ${fmt(n?.percentualAh)} ≠ ${fmt(v.percentualAh)}`);
      // O PROVISIONADO e os percentuais sobre R + P: o `recalcular` os refaz (deltas do P e
      // calcularAv/Ah sobre R + P), e na ordem do cadastro tem de devolver os da API.
      ok(bate(v.provisionado, n?.provisionado, 0.005), `${analise} / ${nome} / ${coluna}: provisionado ${fmt(n?.provisionado)} ≠ ${fmt(v.provisionado)}`);
      ok(bate(v.percentualAvComProvisionado, n?.percentualAvComProvisionado, 0.001), `${analise} / ${nome} / ${coluna}: %AV R+P ${fmt(n?.percentualAvComProvisionado)} ≠ ${fmt(v.percentualAvComProvisionado)}`);
      ok(bate(v.percentualAhComProvisionado, n?.percentualAhComProvisionado, 0.001), `${analise} / ${nome} / ${coluna}: %AH R+P ${fmt(n?.percentualAhComProvisionado)} ≠ ${fmt(v.percentualAhComProvisionado)}`);
      if (v.provisionado !== null && v.provisionado !== undefined) comProvisionado++;
      conferidas += 6;
    }

    ok(bate(esperada.total.valor, achou.total.valor, 0.005), `${analise} / ${nome}: total ${fmt(achou.total.valor)} ≠ ${fmt(esperada.total.valor)}`);
    ok(bate(esperada.total.media, achou.total.media, 0.005), `${analise} / ${nome}: média ${fmt(achou.total.media)} ≠ ${fmt(esperada.total.media)}`);
    ok(bate(esperada.total.percentualAv, achou.total.percentualAv, 0.001), `${analise} / ${nome}: %AV do total ${fmt(achou.total.percentualAv)} ≠ ${fmt(esperada.total.percentualAv)}`);
    ok(bate(esperada.total.provisionado, achou.total.provisionado, 0.005), `${analise} / ${nome}: provisionado do total ${fmt(achou.total.provisionado)} ≠ ${fmt(esperada.total.provisionado)}`);
    ok(bate(esperada.total.percentualAvComProvisionado, achou.total.percentualAvComProvisionado, 0.001), `${analise} / ${nome}: %AV R+P do total ${fmt(achou.total.percentualAvComProvisionado)} ≠ ${fmt(esperada.total.percentualAvComProvisionado)}`);
    conferidas += 5;
  }

  // Sem âncora reconhecida, `recalcular` devolveria as linhas intactas e este arquivo
  // passaria sem conferir nada — o pior tipo de teste verde.
  ok(ancoras >= 8, `${analise}: só ${ancoras} linhas com papel; a API não está mandando o campo?`);
  // Sem nenhuma célula de provisionado, o cenário de agosto–setembro passaria conferindo nulo
  // contra nulo — o mesmo teste verde vazio que a linha acima evita para as âncoras.
  if (cenario.exigeProvisionado) {
    ok(comProvisionado > 0, `${analise} · ${cenario.rotulo}: nenhuma célula com provisionado — a API não manda o campo, ou tudo já foi pago?`);
  }
  console.log(`  ${conferidas} comparações · ${ancoras} âncoras reconhecidas · ${comProvisionado} células com provisionado`);
}

console.log(falhas === 0 ? "\n✓ dc35 passou — as duas aritméticas dão o mesmo DRE" : `\n✗ ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
