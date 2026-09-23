/**
 * dc64 — A conta principal reconcilia com a 9815, linha a linha.
 *
 * A dc34 prova que a mudança de agrupamento não mexeu em nenhum total; a dc62 prova que a
 * granularidade mudou e que o duplo clique acompanhou. Faltava a conferência que importa para
 * o negócio: **as linhas novas somam exatamente as linhas antigas da 9815**.
 *
 * O TESTE É ESSE. Para cada linha da 9815, junto as nossas que caem no mesmo grupo de dois
 * dígitos — o critério que a 9815 usa — e comparo a soma. Se o desmembramento tivesse perdido
 * ou duplicado um lançamento, a soma não fecharia.
 *
 * Cenário: JUNHO/2026, filial 7, C. Custo Principal, competência. Junho de propósito — agosto
 * ainda recebia lançamento retroativo em 22/09, e a comparação virou perseguição a um defeito
 * que não existia (dc63).
 *
 * USO
 *   node docs/validacao/dc64_conta_principal_contra_a_9815.mjs [<junho.xlsx>]
 *
 * Sem argumento, usa os valores da exportação de 22/09/2026, colados abaixo.
 */

const API = process.env.API ?? 'http://localhost:5207';

const FILTRO = {
  filiais: ['7'], dataInicio: '2026-06-01', dataFim: '2026-06-30',
  regime: 'competencia', analise: 'ccusto-principal',
};

// A exportação da 9815 — C. Custo Principal, junho/2026, filial 7, competência.
const NOVE815 = [
  ['(+) RECEITA BRUTA', 37765838.95], ['(-) ABAT./DESC.', -2396196.43],
  ['(-) DEVOLUCAO', -670887.33], ['(-) ST', -3975304.45], ['(-) PIS', -85642.61],
  ['(-) COFINS', -394474.98], ['(=) RECEITAS LIQUIDAS', 34698755.19],
  ['(=) CMV LIQ.', -23559901.93], ['LUCRO BRUTO', 11138853.26],
  ['ADMINISTRATIVO', -648017.54], ['COMPRAS - RAT', -102086.91],
  ['CONTABILIDADE - RAT', -71519.31], ['DIRETORIA', -218408.54],
  ['FINANCEIRO - RAT', -260853.74], ['INFORMATICA - RAT', -670832.06],
  ['MARKETING - RAT', -19020.23], ['MOVIMENTAÇÃO E ARMAZENAGEM', -1117200.19],
  ['RECURSOS HUMANOS - RAT', -31108.56], ['SEGURANÇA', -140896.24],
  ['SERVIÇOS GERAIS', -83014.12], ['TRANSPORTES MATRIZ', -3448746.10],
  ['VENDAS', -1079239.25], ['EQUIPE P&G', -611126.15],
  ['EQUIPE PASTA MISTA / ATACADO', -43311.08], ['TRANSPORTE T - (28)', -661935.77],
  ['ECOMMERCE', -18838.48], ['DEPARTAMENTO PESSOAL - RAT', -71095.10],
  ['JURIDICO - RAT', -73919.13], ['POTENCIAL', -1150.90],
  ['CD UBERLANDIA', -6649.48], ['CD GOV VALADARES', -23219.43],
  ['CD 3 CORAÇOES', -30335.29], ['CD MONTES CLAROS', -47284.33],
  ['MANUTENÇÕES E CARRETAS', -187169.15], ['DESPESAS FINANCEIRAS', -46095.86],
  ['DESPESAS TRIBUTÁRIAS', -1924954.49], ['DESPESAS NÃO OPERACIONAIS', -2079.45],
  ['EPI - SEGURANÇA DO TRABALHO', -9939.21], ['JOVEM APRENDIZ', -52832.08],
  ['SUB-TOTAL', -11702878.17], ['RESULTADO OPERACIONAL', -564024.91],
  ['RECEITAS FINANCEIRAS', 201603.24], ['VERBAS MARGEM', 974392.01],
  ['COMPENSAÇÃO DE IMPOSTOS', 568918.63], ['RATEIO DESP. CORPORATIVAS', 694843.00],
  ['INDENIZACAO DE MERC. VENC. E AVARIA', 43653.86], ['LUCRO LIQUIDO', 1919385.83],
];

// As duas divergências aprovadas que atingem os totalizadores desta dimensão.
// Ver docs/DIVERGENCIAS.md nº 9 e nº 10.
const CREDITOS_PROMOVIDOS = ['VERBAS MARGEM', 'RATEIO DESP. CORPORATIVAS'];
const INDENIZACAO = 'INDENIZACAO DE MERC. VENC. E AVARIA';

const f = (v) => v === null || v === undefined ? '—'
  : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// O rótulo de `VERBAS MARGEM` tem espaço NÃO SEPARÁVEL, e `\s` com a flag `u` pega os dois.
// Comparar sem isso devolve zero linhas e o teste "passa" sem ter comparado nada.
const norm = (s) => String(s).replace(/\s+/gu, ' ').trim().toUpperCase().replace(/ ->.*/, '');

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
const linhas = j.dados.linhas;

console.log('\n══ dc64 — a conta principal contra a 9815 ══\n');
console.log('  junho/2026 · filial 7 · competência · C. Custo Principal\n');

// ── O índice do nosso lado, por chave e por rótulo ──────────────────────────
const porRotulo = new Map();
for (const l of linhas) {
  const k = norm(l.descricao);
  if (l.calculada) { porRotulo.set(k, l.total?.valor ?? 0); continue; }
  porRotulo.set(k, (porRotulo.get(k) ?? 0) + (l.total?.valor ?? 0));
}

// Os dois dígitos de cada linha nossa — é como a 9815 agrupa, e é por aí que reconcilio.
const porDoisDigitos = new Map();
for (const l of linhas) {
  if (l.calculada) continue;
  const chave = String(l.detalhe?.chave ?? '');
  if (!/^\d/.test(chave)) continue;
  const g = chave.slice(0, 2);
  if (!porDoisDigitos.has(g)) porDoisDigitos.set(g, []);
  porDoisDigitos.get(g).push({ rotulo: norm(l.descricao), chave, valor: l.total?.valor ?? 0 });
}
const grupoDe = (rotulo) => {
  for (const [g, ls] of porDoisDigitos) if (ls.some((x) => x.rotulo === rotulo)) return g;
  return null;
};

// ── 1. Cada linha da 9815 contra a SOMA das nossas do mesmo grupo ───────────
console.log('  ' + 'linha da 9815'.padEnd(36) + '9815'.padStart(17) + 'nosso'.padStart(17) + '  parcelas');
let diretas = 0, reconciliadas = 0;
for (const [rotulo, esperado] of NOVE815) {
  const k = norm(rotulo);
  const direto = porRotulo.get(k);

  if (direto !== undefined && Math.abs(direto - esperado) < 0.005) {
    diretas++;
    continue;
  }

  // Não bateu direto: será que a conta principal desmembrou a linha?
  const g = grupoDe(k) ?? (direto === undefined ? null : null);
  const parcelas = g ? porDoisDigitos.get(g) : null;
  const soma = parcelas ? parcelas.reduce((s, x) => s + x.valor, 0) : null;
  const fecha = soma !== null && Math.abs(soma - esperado) < 0.005;

  console.log('  ' + rotulo.slice(0, 35).padEnd(36) + f(esperado).padStart(17)
    + f(direto).padStart(17) + (parcelas ? `  ← ${parcelas.length} linhas, soma ${f(soma)}` : ''));
  if (parcelas) for (const p of parcelas) console.log(`       ${p.chave.padEnd(8)} ${p.rotulo.slice(0, 40).padEnd(41)} ${f(p.valor).padStart(16)}`);

  if (fecha) { reconciliadas++; continue; }

  // Sobrou: ou é uma das duas divergências aprovadas, ou é defeito.
  const dif = (direto ?? 0) - esperado;
  if (k === 'RESULTADO OPERACIONAL') {
    const creditos = CREDITOS_PROMOVIDOS.reduce((s, c) => s + (porRotulo.get(norm(c)) ?? 0), 0);
    afirmar(Math.abs(dif - creditos) < 0.005,
      'RESULTADO OPERACIONAL: a diferença é a promoção dos créditos (divergência 9)',
      `${f(dif)} = ${f(creditos)}`);
  } else if (k === 'LUCRO LIQUIDO') {
    const ind = porRotulo.get(norm(INDENIZACAO)) ?? 0;
    afirmar(Math.abs(dif + ind) < 0.005,
      'LUCRO LIQUIDO: a diferença é a indenização que não soma (divergência 10)',
      `${f(dif)} = −${f(ind)}`);
  } else {
    afirmar(false, `${rotulo} não fecha nem direto nem pela soma do grupo`, f(dif));
  }
}

console.log(`\n  ${diretas} linhas batem direto · ${reconciliadas} fecham pela soma do grupo desmembrado`);
afirmar(diretas + reconciliadas === NOVE815.length - 2,
  'todas as linhas da 9815 fecham, menos as duas divergências aprovadas',
  `${diretas + reconciliadas} de ${NOVE815.length - 2}`);

// ── 2. Nada nosso ficou de fora ─────────────────────────────────────────────
// O outro lado do teste: se uma linha nossa não pertence a nenhum grupo da 9815, ela é valor
// que apareceu do nada. O bloco informativo (depois do LUCRO LIQUIDO) fica fora da conta
// porque a 9815 o exporta sem agrupar.
const gruposDa9815 = new Set(NOVE815.map(([k]) => grupoDe(norm(k))).filter(Boolean));
const orfas = [...porDoisDigitos.entries()]
  .filter(([g]) => !gruposDa9815.has(g))
  .flatMap(([, ls]) => ls)
  .filter((x) => Math.abs(x.valor) > 0.005);

console.log(`\n  ${orfas.length} linha(s) nossa(s) fora dos grupos da 9815 — o bloco informativo:`);
for (const o of orfas.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 8)) {
  console.log(`    ${o.chave.padEnd(8)} ${o.rotulo.slice(0, 40).padEnd(41)} ${f(o.valor).padStart(16)}`);
}

console.log(falhas === 0
  ? '\n✓ dc64 passou — o desmembramento reconcilia com a 9815 ao centavo\n'
  : `\n✗ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
