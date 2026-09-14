/**
 * dc19 — Dois anos INTEIROS em paralelo: quanto tempo o usuário espera de verdade?
 *
 * A dc18 mede o paralelismo num recorte de dez dias, onde a consulta cabe no cache. Este
 * é o caso oposto e o que decide se o modo `anos` é usável: 01/01 a 31/12, duas vezes,
 * numa filial só. É o pior cenário que o teto de três anos ainda permite dobrar.
 *
 * Aqui NÃO se aquece nada de propósito: quem pedir dois anos vai pagar o cache frio, e é
 * esse número que precisa caber na paciência dele.
 *
 * O POST vai por `_postar.mjs` e não por `fetch` — um ano inteiro passa dos 300 s que o
 * undici concede, e a medição morreria antes do resultado.
 *
 * <b>O ganho que este script imprime está inflado, e não dá para corrigir sem falsear a
 * outra metade.</b> Os isolados rodam primeiro, no frio; o paralelo roda por último, já
 * com o cache que eles aqueceram — em 10/09/2026 os dois juntos (230 s) saíram mais
 * rápido que 2025 sozinho (407 s), o que é impossível de verdade. Aquecer antes
 * consertaria a comparação e destruiria o número que interessa aqui, que é o custo frio.
 * Então leia deste script SÓ o tempo de cada ano isolado; o ganho limpo do paralelismo
 * está na dc18.
 *
 * USO
 *   node docs/validacao/dc19_dois_anos_inteiros.mjs
 */
import { postar } from "./_postar.mjs";

const API = process.env.API ?? "http://localhost:5207";

const BASE = {
  filiais: ["7"],
  dataInicio: "2026-01-01",
  dataFim: "2026-12-31",
  regime: "caixa",
  analise: "ccusto-principal",
  modo: "anos",
};

const dinheiro = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const min = (s) => `${(s / 60).toFixed(1)} min (${s.toFixed(0)} s)`;

async function apurar(anos) {
  const j = await postar(`${API}/api/dre-gerencial/apuracao`, { ...BASE, anos });
  if (!j.sucesso) throw new Error(j.erros?.[0] ?? j.mensagem ?? "falha");
  return j.dados;
}

console.log(`API: ${API}\nFilial ${BASE.filiais.join(", ")}, anos inteiros. Isto demora.\n`);

const isolados = {};
for (const ano of [2025, 2026]) {
  const d = await apurar([ano]);
  isolados[ano] = d.duracaoMs / 1000;
  console.log(`  ${ano} sozinho: ${min(isolados[ano])}`);
}

const d = await apurar([2025, 2026]);
const juntos = d.duracaoMs / 1000;
const soma = isolados[2025] + isolados[2026];

console.log(`\n  os dois em paralelo: ${min(juntos)}`);
console.log(`  seriam, em sequência: ${min(soma)}`);
console.log(`  ganho: ${((1 - juntos / soma) * 100).toFixed(1)}%\n`);

const liq = d.linhas.find((x) => x.descricao.trim() === "(=) RECEITAS LIQUIDAS");
d.periodos.forEach((p, i) =>
  console.log(
    `  ${p.rotulo}  ${p.dataInicio} a ${p.dataFim}  ${dinheiro(liq.valores[i].valor).padStart(20)}`,
  ),
);
