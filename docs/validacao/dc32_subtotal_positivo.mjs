/**
 * dc32 — os créditos subiram, o SUBTOTAL POSITIVO fecha, e o resto do DRE não se mexeu.
 *
 *   node docs/validacao/dc32_subtotal_positivo.mjs
 *
 * Em 14/09/2026 `RATEIO DESP. CORPORATIVAS` e `VERBAS MARGEM` saíram do bloco
 * pós-operacional e passaram a aparecer logo abaixo do `LUCRO BRUTO`, com uma linha nova
 * somando os três. O `RESULTADO OPERACIONAL` passou a sair desse subtotal em vez do lucro
 * bruto — decisão do Gabriel, que afasta essa linha da 9815 de propósito.
 *
 * O QUE ESTE SCRIPT PROTEGE
 *
 * 1. **A promoção pegou a linha certa.** `RATEIO DESP. CORPORATIVAS` existe DUAS VEZES em
 *    C. Custo Principal, com o mesmo nome: uma no bloco operacional e outra no de créditos.
 *    Subir a errada tiraria uma despesa de dentro do `Sub-Total` sem mudar o número dele —
 *    a tela mentiria e nenhum total denunciaria. Aqui a operacional é conferida no lugar.
 *
 * 2. **Só o RESULTADO OPERACIONAL mudou de valor.** `LUCRO BRUTO`, `Sub-Total`,
 *    `Total das Despesas` e `LUCRO LIQUIDO` continuam como a 9815 os calcula.
 *
 * 3. **Não há contagem dupla.** É o risco real da mudança: os créditos aparecem no
 *    subtotal de cima E continuam dentro do `Total das Despesas`. Se alguém um dia fizer
 *    o `LUCRO LIQUIDO` sair do `SUBTOTAL POSITIVO`, eles entram duas vezes e o lucro
 *    incha. A identidade do item 5 é o que denuncia.
 *
 * 4. **As outras três dimensões não têm a linha nova** e o `RESULTADO OPERACIONAL` delas
 *    continua sendo `LUCRO BRUTO + Sub-Total`, ao centavo.
 *
 * PRECISA DA API NO AR, em http://localhost:5207, com o banco alcançável.
 */
import { postar } from "./_postar.mjs";

const API = "http://localhost:5207/api/dre-gerencial/apuracao";

/**
 * O cenário exportado da 9815 em `periodo_de_dois_meses_com_AH` — **filiais 7, 12 e 25**,
 * não só a 7. O trace confirma (`CODFILIAL IN ('7')`, `('12')`, `('25')` nos três blocos).
 *
 * Rodar só a filial 7 aqui dá um DRE perfeitamente coerente e uns 5,5 milhões menor de
 * lucro bruto, que não conversa com nenhuma tabela da documentação — e um número que não
 * conversa com nada é pior que um número errado, porque parece regressão.
 */
const BASE = {
  filiais: ["7", "12", "25"],
  dataInicio: "2026-06-01",
  dataFim: "2026-07-31",
  regime: "competencia",
  modo: "meses",
};

const LUCRO_BRUTO = "LUCRO BRUTO";
const SUBTOTAL_POSITIVO = "SUBTOTAL POSITIVO";
const SUB_TOTAL = "SUB-TOTAL -> DESPESAS OPERACIONAIS";
const RESULTADO = "RESULTADO OPERACIONAL";
const TOTAL_DESPESAS = "TOTAL DAS DESPESAS";
const LUCRO_LIQUIDO = "LUCRO LIQUIDO";
const CREDITOS = ["RATEIO DESP. CORPORATIVAS", "VERBAS MARGEM"];

let falhas = 0;
const ok = (condicao, oque) => {
  console.log(`${condicao ? "  ok  " : "FALHA "} ${oque}`);
  if (!condicao) falhas++;
};

/**
 * Maiúsculas, sem espaço nas pontas, e QUALQUER espaço vira o espaço comum.
 *
 * `VERBAS MARGEM` está cadastrada com espaço NÃO SEPARÁVEL (U+00A0) no meio. Um
 * `trim().toUpperCase()` devolve algo que parece `"VERBAS MARGEM"` em qualquer log e não é
 * igual a ela — foi o que deixou a promoção pela metade sem nenhum sinal na tela. O `\s` do
 * JavaScript casa U+00A0, então `split(/\s+/)` resolve.
 */
const rotulo = (l) => l.descricao.toUpperCase().split(/\s+/).filter(Boolean).join(" ");
const acharTodas = (linhas, nome) => linhas.filter((l) => rotulo(l) === nome);
const achar = (linhas, nome) => acharTodas(linhas, nome)[0] ?? null;
const total = (l) => l.total.valor;
/** Meio centavo cobre arredondamento de exibição; mais que isso é erro. */
const bate = (a, b) => Math.abs(a - b) <= 0.005;
const fmt = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function apurar(analise) {
  const r = await postar(API, { ...BASE, analise });
  if (!r?.sucesso) throw new Error(`${analise}: ${r?.mensagem ?? "resposta sem sucesso"}`);
  return r.dados;
}

// ── C. Custo Principal: a dimensão que muda ──────────────────────────────────
console.log("\nC. CUSTO PRINCIPAL\n");
const d = await apurar("ccusto-principal");
const L = d.linhas;

// 1. a ordem
const iLucro = L.findIndex((l) => rotulo(l) === LUCRO_BRUTO);
ok(iLucro >= 0, "LUCRO BRUTO existe");

const seguintes = L.slice(iLucro + 1, iLucro + 4).map(rotulo);
// A ordem ENTRE os créditos é a do cadastro (`EPCPARDRE.ID`), não a da lista de nomes
// daqui: quem lê a tela ao lado da 9815 encontra a mesma sequência relativa. Hoje o
// cadastro traz VERBAS MARGEM antes do RATEIO; conferir a ordem da minha constante seria
// escrever um teste sobre uma escolha minha em vez de sobre o comportamento.
ok(
  seguintes.length === 3
    && CREDITOS.includes(seguintes[0])
    && CREDITOS.includes(seguintes[1])
    && seguintes[0] !== seguintes[1]
    && seguintes[2] === SUBTOTAL_POSITIVO,
  `depois do LUCRO BRUTO vêm os dois créditos e o subtotal — veio: ${seguintes.join(" | ")}`,
);

// 2. a OUTRA ocorrência do rateio continua entre as despesas operacionais
const rateios = acharTodas(L, CREDITOS[0]);
console.log(`\n  ${CREDITOS[0]}: ${rateios.length} ocorrência(s)`);
const iSubTotal = L.findIndex((l) => rotulo(l) === SUB_TOTAL);
const operacional = rateios.find((r) => L.indexOf(r) > iLucro + 3 && L.indexOf(r) < iSubTotal);
ok(
  rateios.length < 2 || operacional !== undefined,
  "a ocorrência operacional do rateio continua ANTES do Sub-Total, onde sempre esteve",
);

// 3. o subtotal fecha — em cada coluna e no total
const lucro = achar(L, LUCRO_BRUTO);
const subtotal = achar(L, SUBTOTAL_POSITIVO);
ok(subtotal !== null, "a linha SUBTOTAL POSITIVO existe");

if (subtotal) {
  const promovidas = L.slice(iLucro + 1, iLucro + 3);
  const soma = (i) => lucro.valores[i].valor + promovidas.reduce((s, p) => s + p.valores[i].valor, 0);

  let colunasOk = 0;
  for (let i = 0; i < subtotal.valores.length; i++) {
    if (bate(subtotal.valores[i].valor, soma(i))) colunasOk++;
    else ok(false, `coluna ${subtotal.valores[i].mesAno}: ${fmt(subtotal.valores[i].valor)} ≠ ${fmt(soma(i))}`);
  }
  ok(colunasOk === subtotal.valores.length, `o subtotal fecha nas ${colunasOk} colunas`);

  const esperado = total(lucro) + promovidas.reduce((s, p) => s + total(p), 0);
  ok(bate(total(subtotal), esperado), `no total: ${fmt(total(subtotal))} = ${fmt(esperado)}`);

  // a composição que a tela mostra lista as MESMAS três linhas
  ok(
    subtotal.composicao?.length === 3,
    `a composição lista três parcelas — veio ${subtotal.composicao?.length ?? 0}`,
  );
}

// 4. o RESULTADO OPERACIONAL passou a sair do subtotal
const resultado = achar(L, RESULTADO);
const subTotalDesp = achar(L, SUB_TOTAL);
ok(
  bate(total(resultado), total(subtotal) + total(subTotalDesp)),
  `RESULTADO OPERACIONAL = SUBTOTAL POSITIVO + Sub-Total: ${fmt(total(resultado))}`,
);
ok(
  !bate(total(resultado), total(lucro) + total(subTotalDesp)) || bate(total(subtotal), total(lucro)),
  "e ele DEIXOU de ser LUCRO BRUTO + Sub-Total (a menos que os créditos somem zero no período)",
);

// 5. o que NÃO pode ter mudado
const totalDespesas = achar(L, TOTAL_DESPESAS);
const lucroLiquido = achar(L, LUCRO_LIQUIDO);
ok(
  bate(total(lucroLiquido), total(lucro) + total(totalDespesas)),
  `LUCRO LIQUIDO = LUCRO BRUTO + Total das Despesas: ${fmt(total(lucroLiquido))}`,
);

// A identidade que prova que ninguém foi contado duas vezes: o lucro líquido também é o
// resultado operacional mais o que SOBROU do bloco pós-operacional.
//
// `!naoSoma` é parte da identidade, não um detalhe: uma linha informativa aparece no bloco
// com valor e não entra em soma nenhuma. Somá-la aqui faria este teste acusar contagem
// dupla exatamente onde ela não existe.
const iResultado = L.findIndex((x) => rotulo(x) === RESULTADO);
const iTotalDespesas = L.findIndex((x) => rotulo(x) === TOTAL_DESPESAS);
const posRestante = L.filter(
  (l, i) => !l.calculada && !l.naoSoma && !CREDITOS.includes(rotulo(l))
    && i > iResultado && i < iTotalDespesas,
).reduce((s, l) => s + total(l), 0);
ok(
  bate(total(lucroLiquido), total(resultado) + posRestante),
  `LUCRO LIQUIDO = RESULTADO OPERACIONAL + pós-operacional restante — sem contagem dupla`,
);

// ── a informativa por pedido ─────────────────────────────────────────────────
//
// O selo da tela afirma "esta linha não entra nos totalizadores". Se ela voltar a somar, a
// tela passa a mentir — e o único jeito de perceber é conferindo o total à mão.
const INFORMATIVA = "INDENIZACAO DE MERC. VENC. E AVARIA";
const informativa = achar(L, INFORMATIVA);
ok(informativa !== null, `a linha ${INFORMATIVA} existe`);

if (informativa) {
  ok(informativa.naoSoma === true, "ela está marcada como informativa");
  ok(
    !(totalDespesas.composicao ?? []).some((p) => p.chaveOrdem === informativa.chaveOrdem),
    "e não aparece entre as parcelas do Total das Despesas",
  );
  // A prova de que ela saiu mesmo da conta é a identidade lá em cima: `posRestante` já a
  // ignora por causa do `!naoSoma`, então, se ela voltasse a somar no `Total das Despesas`,
  // `LUCRO LIQUIDO = RESULTADO OPERACIONAL + pós restante` falharia exatamente pelo valor
  // dela. Só vale a pena se ela tiver valor no período — senão o teste passa sem testar.
  ok(
    Math.abs(total(informativa)) > 0.005,
    `e tem valor no período (${fmt(total(informativa))}) — sem isso a conferência acima não prova nada`,
  );
}

// O quadro completo, por coluna e no total — é o que vai para o DIVERGENCIAS.md, e é o
// que deixa a diferença entre "mudou porque a regra mudou" e "mudou porque o dado mudou"
// visível sem precisar de outra rodada.
const colunas = d.periodos.map((p) => p.rotulo);
const larg = 18;
const cabecalho = "  " + "linha".padEnd(28) + colunas.map((c) => c.padStart(larg)).join("") + "TOTAL".padStart(larg);
const linhaDoQuadro = (nome, l, recuo = "") =>
  "  " + (recuo + nome).padEnd(28)
  + l.valores.map((v) => fmt(v.valor).padStart(larg)).join("")
  + fmt(total(l)).padStart(larg);

console.log("\n" + cabecalho);
console.log(linhaDoQuadro("LUCRO BRUTO", lucro));
for (const p of L.slice(iLucro + 1, iLucro + 3)) console.log(linhaDoQuadro(rotulo(p), p, "  "));
console.log(linhaDoQuadro("SUBTOTAL POSITIVO", subtotal));
console.log(linhaDoQuadro("Sub-Total Desp.Op.", subTotalDesp));
console.log(linhaDoQuadro("RESULTADO OPER.", resultado));
console.log(linhaDoQuadro("Total das Despesas", totalDespesas));
console.log(linhaDoQuadro("LUCRO LIQUIDO", lucroLiquido));

// Quanto a linha se moveu por causa DESTA mudança — o número que o DIVERGENCIAS registra.
const movimento = total(subtotal) - total(lucro);
console.log(`\n  o RESULTADO OPERACIONAL sobe ${fmt(movimento)} (= a soma dos créditos promovidos)`);

// ── as outras dimensões ──────────────────────────────────────────────────────
//
// Nenhuma delas tem a promoção dos créditos. A informativa vale também em Conta Gerencial,
// onde a conta tem exatamente o mesmo nome — o cadastro foi renomeado e o
// `Verba Ind Merc Vencida e Avaria` das exportações de referência não existe mais.
for (const { analise, temInformativa } of [
  { analise: "grupo-contas", temInformativa: false },
  { analise: "conta-gerencial", temInformativa: true },
]) {
  console.log(`\n${analise.toUpperCase()}\n`);
  const o = await apurar(analise);
  const linhas = o.linhas;

  ok(achar(linhas, SUBTOTAL_POSITIVO) === null, "não tem SUBTOTAL POSITIVO");

  const lb = achar(linhas, LUCRO_BRUTO);
  const st = achar(linhas, SUB_TOTAL);
  const ro = achar(linhas, RESULTADO);
  const td = achar(linhas, TOTAL_DESPESAS);
  const ll = achar(linhas, LUCRO_LIQUIDO);
  ok(
    bate(total(ro), total(lb) + total(st)),
    `RESULTADO OPERACIONAL continua LUCRO BRUTO + Sub-Total: ${fmt(total(ro))}`,
  );
  ok(
    bate(total(ll), total(lb) + total(td)),
    `LUCRO LIQUIDO = LUCRO BRUTO + Total das Despesas: ${fmt(total(ll))}`,
  );

  const info = achar(linhas, INFORMATIVA);
  ok(
    (info !== null && info.naoSoma === true) === temInformativa,
    temInformativa
      ? `${INFORMATIVA} está marcada como informativa aqui também`
      : `${INFORMATIVA} não é marcada nesta dimensão`,
  );

  // A mesma prova de que ela saiu da conta: o bloco pós-operacional visível, sem as
  // informativas, mais o resultado operacional dá o lucro líquido.
  if (info) {
    const iRo = linhas.findIndex((x) => rotulo(x) === RESULTADO);
    const iTd = linhas.findIndex((x) => rotulo(x) === TOTAL_DESPESAS);
    const resto = linhas
      .filter((l, i) => !l.calculada && !l.naoSoma && i > iRo && i < iTd)
      .reduce((s, l) => s + total(l), 0);
    ok(
      bate(total(ll), total(ro) + resto),
      "LUCRO LIQUIDO = RESULTADO OPERACIONAL + pós-operacional restante",
    );
    console.log(`\n  ${INFORMATIVA}: ${fmt(total(info))}`);
  }
}

console.log(falhas === 0 ? "\n✓ dc32 passou" : `\n✗ ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
