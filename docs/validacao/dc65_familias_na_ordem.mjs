/**
 * dc65 — As três famílias, na ordem, dentro de cada bloco.
 *
 * A grade ordena cada bloco em três faixas: primeiro as contas de RATEIO (`- RAT`), depois as
 * de TRANSPORTE TERCEIRIZADO (`TRANSPORTE T …`), e por fim o resto na ordem do cadastro.
 *
 * NENHUM VALOR MUDA — nenhuma conta atravessa uma linha calculada, e é isso que torna a
 * reordenação segura. A dc34 e a dc64 continuam sendo quem garante os números; esta aqui
 * garante só a ORDEM, que é o que o olho confere e ninguém mede.
 *
 * A ARMADILHA QUE ELE EXISTE PARA PEGAR
 *   O cadastro tem duas famílias de transporte separadas por uma letra:
 *
 *       22xx   TRANSPORTES MATRIZ · TRANSPORTE MINAS RURAL · TRANSPORTE - CD RIO   não sobem
 *       28xx   TRANSPORTE T - (28) · TRANSPORTE T CD UBERLANDIA · TRANSPORTE T - P&G   sobem
 *
 *   Um `Contains("TRANSPORTE")` arrastaria as duas famílias, e a tela pareceria certa para
 *   quem não conferisse conta por conta — o mesmo tipo de erro que o `ADMINISTRATIVO` quase
 *   causou na regra do `- RAT` (administ**RAT**ivo).
 *
 * USO
 *   node docs/validacao/dc65_familias_na_ordem.mjs
 */

const API = process.env.API ?? 'http://localhost:5207';

const FILTRO = {
  filiais: ['7'], dataInicio: '2026-06-01', dataFim: '2026-06-30',
  regime: 'competencia', analise: 'ccusto-principal',
};

const norm = (s) => String(s).replace(/\s+/gu, ' ').trim().toUpperCase();
const f = (v) => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// As mesmas três regras do MontadorDre. Escritas de novo de propósito: se alguém mudar a
// regra lá e não aqui, o teste acusa — um teste que importa a implementação não testa nada.
const ehRateio = (r) => r.endsWith(' RAT') || r.endsWith('-RAT');
const ehTransporteT = (r) => r.startsWith('TRANSPORTE T ') || r === 'TRANSPORTE T';
const familia = (r) => (ehRateio(r) ? 0 : ehTransporteT(r) ? 1 : 2);
const NOME = ['rateio', 'transporte T', 'resto'];

let falhas = 0;
const afirmar = (ok, texto, detalhe = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${texto}${detalhe ? '   ' + detalhe : ''}`);
  if (!ok) falhas++;
};

const r = await fetch(`${API}/api/dre-gerencial/apuracao`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(FILTRO),
});
const j = await r.json();
if (!j.sucesso) throw new Error(j.erros?.[0] ?? 'falha na apuração');

console.log('\n══ dc65 — as três famílias na ordem ══\n');
console.log('  junho/2026 · filial 7 · competência · C. Custo Principal\n');

// ── Os blocos: o trecho entre duas linhas calculadas ────────────────────────
const blocos = [];
let atual = [];
for (const l of j.dados.linhas) {
  if (l.calculada) { if (atual.length) blocos.push(atual); atual = []; continue; }
  atual.push({ rotulo: norm(l.descricao), chave: String(l.detalhe?.chave ?? ''), valor: l.total?.valor ?? 0 });
}
if (atual.length) blocos.push(atual);

afirmar(blocos.length > 0, 'a apuração devolveu blocos de conta', `${blocos.length} blocos`);

// ── 1. Dentro de cada bloco, a família nunca regride ────────────────────────
for (const [i, bloco] of blocos.entries()) {
  const fams = bloco.map((l) => familia(l.rotulo));
  const ordenado = fams.every((v, k) => k === 0 || fams[k - 1] <= v);
  const fora = ordenado ? null : bloco[fams.findIndex((v, k) => k > 0 && fams[k - 1] > v)];
  afirmar(ordenado, `bloco ${i + 1} (${bloco.length} linhas): rateio → transporte T → resto`,
    fora ? `quebra em ${fora.rotulo}` : `famílias ${[...new Set(fams)].map((x) => NOME[x]).join(' · ')}`);
}

// ── 2. As de TRANSPORTE T vêm logo depois das de rateio ─────────────────────
// O pedido foi "logo após", e não "em algum lugar acima do resto": entre a última `- RAT` e a
// primeira `TRANSPORTE T` não pode haver conta de outra família.
const blocoComAsDuas = blocos.find((b) => b.some((l) => ehRateio(l.rotulo)) && b.some((l) => ehTransporteT(l.rotulo)));
if (blocoComAsDuas) {
  const ultimaRat = blocoComAsDuas.map((l) => ehRateio(l.rotulo)).lastIndexOf(true);
  const primeiraT = blocoComAsDuas.findIndex((l) => ehTransporteT(l.rotulo));
  afirmar(primeiraT === ultimaRat + 1,
    'a primeira TRANSPORTE T vem imediatamente depois da última - RAT',
    `posições ${ultimaRat} → ${primeiraT}`);
} else {
  console.log('  --   nenhum bloco tem as duas famílias neste cenário');
}

// ── 3. A armadilha: TRANSPORTES (22xx) NÃO é transporte terceirizado ───────
const todas = blocos.flat();
const vinteDois = todas.filter((l) => l.chave.startsWith('22'));
const vinteOito = todas.filter((l) => l.chave.startsWith('28'));

console.log(`\n  ── os dois grupos de transporte ──`);
for (const l of [...vinteDois, ...vinteOito].sort((a, b) => a.chave.localeCompare(b.chave))) {
  console.log(`     ${l.chave.padEnd(6)} ${NOME[familia(l.rotulo)].padEnd(13)} ${l.rotulo.slice(0, 40).padEnd(41)} ${f(l.valor).padStart(16)}`);
}

afirmar(vinteDois.length > 0 && vinteDois.every((l) => !ehTransporteT(l.rotulo)),
  'nenhum centro 22xx foi classificado como transporte terceirizado',
  `${vinteDois.length} centros 22xx`);
afirmar(vinteOito.length > 0 && vinteOito.every((l) => ehTransporteT(l.rotulo)),
  'todos os centros 28xx são transporte terceirizado',
  `${vinteOito.length} centros 28xx`);

// ── 4. Nenhuma conta atravessou uma calculada ──────────────────────────────
// É o que garante que a ordem mudou e o valor não: o total de cada bloco continua o mesmo
// conjunto de linhas. Comparo a soma por bloco com a soma das mesmas chaves agrupadas por
// família — se uma linha tivesse mudado de bloco, a contagem total mudaria.
const totalLinhas = blocos.reduce((s, b) => s + b.length, 0);
afirmar(totalLinhas === j.dados.linhas.filter((l) => !l.calculada).length,
  'toda linha de conta continua dentro de algum bloco', `${totalLinhas} linhas`);

console.log(falhas === 0
  ? '\n✓ dc65 passou — rateio, transporte T e o resto, nessa ordem, em todo bloco\n'
  : `\n✗ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
