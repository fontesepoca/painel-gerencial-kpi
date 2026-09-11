/**
 * dc23 — nenhuma linha com valor fica escondida, e a que não tem lançamento não promete
 * detalhamento.
 *
 *   node docs/validacao/dc23_linha_com_valor_nao_some.mjs
 *
 * Nasceu de `RECEITA VENDA ATIVO` na filial 28, agosto/2026: 225.000,00 que a tela escondia
 * por a linha vir com `0 as QdeReg` — fielmente, porque a injeção de `PCPREST` é assim na
 * 9815 também.
 *
 * **O defeito não era o valor, era a contradição.** Os 225.000,00 continuavam dentro do
 * LUCRO LIQUIDO enquanto a linha sumia da tabela, e nada na tela denunciava: quem somasse as
 * linhas visíveis à mão chegaria a um número diferente do total impresso logo abaixo.
 *
 * Por isso a conferência principal aqui não é o valor de uma linha — é a **invariante**:
 * linha com valor está visível. É ela que impede o defeito de voltar por outro caminho.
 */

const API = process.env.API ?? "http://localhost:5207";

const FILTRO = {
  filiais: ["28"],
  dataInicio: "2026-08-01",
  dataFim: "2026-08-31",
  regime: "competencia",
  analise: "ccusto-principal",
};

/** Os quatro números do print da 9815 de 11/09/2026, 09:56. */
const DA_9815 = {
  "RESULTADO OPERACIONAL": 2015344.94,
  "RECEITAS FINANCEIRAS": 65.71,
  "RECEITA VENDA ATIVO": 225000.0,
  "LUCRO LIQUIDO": 2240410.65,
};

const dinheiro = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let n = 0;
let falhas = 0;
const ok = (condicao, oque) => {
  n++;
  if (!condicao) {
    falhas++;
    console.log(`  ✗ ${oque}`);
  }
};

async function apurar(filtro) {
  const r = await fetch(`${API}/api/dre-gerencial/apuracao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filtro),
  });
  const j = await r.json();
  if (!j.sucesso) throw new Error(j.erros?.[0] ?? j.mensagem ?? "falha");
  return j.dados;
}

const achar = (dados, nome) => dados.linhas.find((l) => l.descricao.trim() === nome);

console.log(`API: ${API}`);
console.log(`Filial ${FILTRO.filiais.join(", ")}, ${FILTRO.dataInicio} a ${FILTRO.dataFim}\n`);

const dados = await apurar(FILTRO);

// ── 1. os números continuam batendo com a 9815 ───────────────────────────────
console.log("VALORES CONTRA A 9815");
for (const [nome, esperado] of Object.entries(DA_9815)) {
  const linha = achar(dados, nome);
  const achou = linha ? Math.round(linha.total.valor * 100) / 100 : null;
  const bate = achou === esperado;
  ok(bate, `${nome}: esperado ${dinheiro(esperado)}, achou ${achou === null ? "linha ausente" : dinheiro(achou)}`);
  console.log(`  ${bate ? "ok" : "DIVERGE"}  ${nome.padEnd(24)} ${dinheiro(esperado).padStart(16)}`);
}

// ── 2. a linha que sumia ─────────────────────────────────────────────────────
const ativo = achar(dados, "RECEITA VENDA ATIVO");
console.log("\nRECEITA VENDA ATIVO");
ok(ativo !== undefined, "a linha existe na resposta");
ok(ativo?.semMovimento === false, "a linha NÃO está marcada como sem movimento — é o que a escondia");
console.log(`  semMovimento: ${ativo?.semMovimento}  ·  zerada: ${ativo?.zerada}`);

// Sem lançamento em PCLANC não há detalhamento a abrir: a tela abriria vazia sobre uma
// linha de 225 mil, e quem vê isso uma vez desconfia do resto da tabela.
ok(ativo?.detalhe === null, "a linha não promete detalhamento que não existe");
console.log(`  detalhe: ${JSON.stringify(ativo?.detalhe)}`);

// ── 3. A INVARIANTE — o que este arquivo existe para proteger ────────────────
//
// Linha escondida com valor é o defeito voltando, por esta ou por outra origem.
console.log("\nINVARIANTE: nenhuma linha escondida tem valor");
const escondidasComValor = dados.linhas.filter(
  (l) => l.semMovimento && l.valores.some((v) => v.valor !== 0),
);
ok(escondidasComValor.length === 0, `${escondidasComValor.length} linha(s) escondidas com valor`);
for (const l of escondidasComValor) {
  console.log(`  ✗ ${l.descricao.trim()} — ${dinheiro(l.total.valor)}`);
}
if (escondidasComValor.length === 0) console.log("  ok  nenhuma");

// ── 4. o total fecha com o que está NA TELA ──────────────────────────────────
//
// A conferência que o usuário faria à mão, e que falhava antes: o LUCRO LIQUIDO é o
// RESULTADO OPERACIONAL mais as linhas do bloco seguinte — e todas elas precisam estar
// visíveis, senão a soma da tela não chega ao total impresso.
console.log("\nO TOTAL FECHA COM AS LINHAS VISÍVEIS");
const lucro = achar(dados, "LUCRO LIQUIDO");
const parcelasOcultas = (lucro?.composicao ?? []).flatMap((p) => {
  const alvo = dados.linhas.find((l) => l.chaveOrdem === p.chaveOrdem);
  return alvo && alvo.semMovimento && alvo.total.valor !== 0 ? [alvo.descricao.trim()] : [];
});
ok(parcelasOcultas.length === 0, `LUCRO LIQUIDO cita ${parcelasOcultas.length} parcela(s) escondida(s)`);
console.log(
  parcelasOcultas.length === 0
    ? "  ok  todas as parcelas do LUCRO LIQUIDO estão visíveis"
    : `  ✗ ${parcelasOcultas.join(", ")}`,
);

// ── 5. regressão: quem aparece a mais, e a menos ─────────────────────────────
//
// A mudança mexe em QUEM aparece na tabela inteira, então a pergunta que importa não é só
// "a linha voltou" — é "voltou ela, e mais ninguém".
const visiveis = dados.linhas.filter((l) => !l.semMovimento);
console.log(`\nVISÍVEIS: ${visiveis.length} de ${dados.linhas.length}`);
console.log("  antes da correção eram 37 — medido em 11/09/2026, com a mesma apuração");
ok(visiveis.length === 38, `esperava 38 visíveis (37 + RECEITA VENDA ATIVO), achou ${visiveis.length}`);

const semValorVisivel = visiveis.filter((l) => !l.calculada && l.valores.every((v) => v.valor === 0));
console.log(`  das visíveis, ${semValorVisivel.length} têm valor zero em todas as colunas`);
console.log("  (zero com lançamento CONTINUA aparecendo — é a regra da 9815, ver §13)");


// ── 6. as quatro dimensões, e a filial que não tem venda de ativo ────────────
//
// A injeção de PCPREST entra nas quatro dimensões com uma CHAVE DIFERENTE em cada uma —
// '400' em Grupo de Contas, '85' em C. Custo Principal, '8501' em Conta Gerencial — e por
// isso o nome da linha muda também. Conferir só uma delas deixaria três sem cobertura.
//
// A filial 7 entra como contraprova: lá não há venda de ativo no período, e a correção não
// pode ter feito aparecer linha nenhuma que não tenha valor.
console.log("\nAS QUATRO DIMENSÕES, E UMA FILIAL SEM VENDA DE ATIVO");

const cenarios = [
  { rotulo: "28 · grupo-contas", filtro: { ...FILTRO, analise: "grupo-contas" }, esperaAtivo: true },
  { rotulo: "28 · ccusto-principal", filtro: FILTRO, esperaAtivo: true },
  { rotulo: "28 · conta-gerencial", filtro: { ...FILTRO, analise: "conta-gerencial" }, esperaAtivo: true },
  { rotulo: "28 · centro-custo", filtro: { ...FILTRO, analise: "centro-custo" }, esperaAtivo: true },
  { rotulo: "7 · ccusto-principal", filtro: { ...FILTRO, filiais: ["7"] }, esperaAtivo: false },
];

for (const c of cenarios) {
  const d = await apurar(c.filtro);

  // A invariante vale em toda dimensão, não só naquela em que o defeito apareceu.
  const ocultasComValor = d.linhas.filter((l) => l.semMovimento && l.valores.some((v) => v.valor !== 0));
  ok(ocultasComValor.length === 0, `${c.rotulo}: ${ocultasComValor.length} linha(s) oculta(s) com valor`);

  // A linha da venda de ativo é reconhecida pelo que ela É — valor sem lançamento —, e não
  // pelo nome, que muda a cada dimensão.
  const injetadas = d.linhas.filter(
    (l) => !l.calculada && l.detalhe === null && l.valores.some((v) => v.valor !== 0),
  );
  const total = injetadas.reduce((s, l) => s + l.total.valor, 0);

  if (c.esperaAtivo) {
    ok(injetadas.length === 1, `${c.rotulo}: esperava 1 linha injetada, achou ${injetadas.length}`);
    ok(Math.round(total * 100) / 100 === 225000, `${c.rotulo}: esperava 225.000,00, achou ${dinheiro(total)}`);
  } else {
    ok(injetadas.length === 0, `${c.rotulo}: não devia ter linha injetada, achou ${injetadas.length}`);
  }

  const nomes = injetadas.map((l) => `${l.descricao.trim()} = ${dinheiro(l.total.valor)}`);
  console.log(
    `  ${c.rotulo.padEnd(24)} ${String(d.linhas.filter((l) => !l.semMovimento).length).padStart(3)} visíveis  ${nomes.join(", ") || "— sem venda de ativo"}`,
  );
}

console.log(
  falhas === 0
    ? `\n✓ dc23: ${n}/${n} conferências passaram.`
    : `\n✗ dc23: ${falhas} de ${n} falharam.`,
);
// `exitCode`, e nao `process.exit`: o segundo aborta o processo com o socket do fetch
// ainda aberto, e o Node no Windows derruba isso com uma asserção do libuv — o teste passa
// e a saída diz 127.
process.exitCode = falhas === 0 ? 0 : 1;
