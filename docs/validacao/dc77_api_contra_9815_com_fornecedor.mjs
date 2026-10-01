// dc77 — A NOSSA apuração contra as três exportações da 9815, com e sem filtro.
//
// A dc74 comparou planilha com planilha e descreveu a mecânica. Esta compara a nossa API com
// aquelas mesmas planilhas, nos mesmos parâmetros, e responde duas perguntas de uma vez:
//
//   1. SEM FILTRO, continuamos batendo? (regressão — o que mais importa)
//   2. COM FILTRO, o que já bate e o que ainda falta?
//
// Uso, com a API no ar:
//   node docs/validacao/dc77_api_contra_9815_com_fornecedor.mjs <A_sem.xlsx> <B_29.xlsx> <C_2453.xlsx>
//   API=http://localhost:5207 node docs/validacao/dc77...
//
// Parâmetros fixos, iguais aos das exportações de 01/10/2026:
//   filial 7 · 01/08/2026 a 31/08/2026 · competência · C.Custo Principal
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESPERAR EM CADA FASE
// ═══════════════════════════════════════════════════════════════════════════
//
// Depois da fase 2 (o exclusivo nas despesas), COM filtro ligado:
//
//   · o faturamento BATE — receita bruta, abat./desc., devolução, CMV e impostos saem do
//     `pr.codfornec`, e isso já está implementado;
//   · o centro 90 e o centro dedicado BATEM — vêm das condições do WHERE;
//   · as contas sem centro de custo BATEM — somem, pelo `NULL NOT IN (90)`;
//   · as DESPESAS COMUNS **não** batem, e não deveriam: falta o rateio, que é a fase 3.
//
// E a divergência das despesas comuns não é qualquer uma — é exatamente o fator da
// participação. O script verifica isso: se `nosso × participação ≈ 9815`, o que falta é só
// multiplicar, e a fase 3 é o que ela diz ser. Se a razão NÃO for a participação, há algo
// errado no que já foi feito, e aí o problema não é o que falta.

import fs from 'node:fs';
import zlib from 'node:zlib';

const API = process.env.API ?? 'http://localhost:5207';
const [semArq, pgArq, pg2Arq] = process.argv.slice(2);
if (!semArq || !pgArq || !pg2Arq) {
  console.error('uso: node dc77...mjs <A_sem.xlsx> <B_29.xlsx> <C_2453.xlsx>');
  process.exit(2);
}

const FILTRO_BASE = {
  filiais: ['7'],
  dataInicio: '2026-08-01',
  dataFim: '2026-08-31',
  regime: 'competencia',
  analise: 'ccusto-principal',
};

// ── ler a planilha sem biblioteca (mesmo leitor da dc28, dc58 e dc74) ───────────────────
function linhasDoXlsx(caminho) {
  const zip = fs.readFileSync(caminho);
  const arquivos = new Map();
  for (let i = 0; (i = zip.indexOf('PK\x03\x04', i)) >= 0; i += 4) {
    const metodo = zip.readUInt16LE(i + 8);
    const compr = zip.readUInt32LE(i + 18);
    const nomeLen = zip.readUInt16LE(i + 26);
    const extraLen = zip.readUInt16LE(i + 28);
    const nome = zip.subarray(i + 30, i + 30 + nomeLen).toString('latin1');
    const ini = i + 30 + nomeLen + extraLen;
    if (compr === 0) continue;
    const dados = zip.subarray(ini, ini + compr);
    try {
      arquivos.set(nome, (metodo === 8 ? zlib.inflateRawSync(dados) : dados).toString('utf8'));
    } catch { /* entrada que não precisamos */ }
  }

  const ss = arquivos.get('xl/sharedStrings.xml') ?? '';
  const textos = ss.split('</si>').slice(0, -1).map((si) =>
    [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'"));

  const CELULA = /<c r="([A-Z]+)(\d+)"([^>]*)\/>|<c r="([A-Z]+)(\d+)"([^>]*?)>([\s\S]*?)<\/c>/g;
  const fora = [];
  const folha = arquivos.get('xl/worksheets/sheet1.xml') ?? '';
  for (const row of folha.split('</row>').slice(0, -1)) {
    const celulas = {};
    let n = null;
    for (const m of row.matchAll(CELULA)) {
      const col = m[1] ?? m[4];
      n = Number(m[2] ?? m[5]);
      const attrs = m[3] ?? m[6] ?? '';
      const v = (m[7] ?? '').match(/<v>([\s\S]*?)<\/v>/);
      celulas[col] = /t="s"/.test(attrs) && v ? (textos[Number(v[1])] ?? '') : (v ? v[1] : '');
    }
    if (n === null) continue;
    fora.push(Object.keys(celulas)
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .map((c) => celulas[c]));
  }
  return fora;
}

function numero(s) {
  if (s === undefined || s === '') return null;
  const t = String(s).trim();
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t);
  const neg = /^\(.*\)$/.test(t);
  const limpo = t.replace(/[()\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  const v = Number(limpo);
  return neg ? -v : v;
}

const chave = (s) => (s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * Põe a linha no mapa SEM deixar que uma homônima engula a outra.
 *
 * <b>O DRE tem linhas com o mesmo nome.</b> Em C.Custo Principal, `RATEIO DESP. CORPORATIVAS`
 * aparece DUAS vezes — mesma chave (96), blocos diferentes —, e a primeira versão deste script
 * guardava só a primeira: comparava a de cima da 9815 com a de cima nossa e acusava uma
 * divergência de R$ 991 mil que não existia. A segunda vira `… #2`, e cada uma encontra a
 * sua. Mesma armadilha que a dc28 registra para o `sharedStrings`.
 */
function guardar(m, desc, valor) {
  let k = chave(desc);
  if (m.has(k)) {
    let n = 2;
    while (m.has(`${k} #${n}`)) n++;
    k = `${k} #${n}`;
  }
  m.set(k, valor);
}

/** A planilha da 9815 como um mapa descrição → valor. */
function planilha(caminho) {
  const m = new Map();
  for (const cel of linhasDoXlsx(caminho)) {
    const desc = (cel[0] ?? '').trim();
    if (!desc) continue;
    const nums = cel.slice(1).map(numero).filter((v) => v !== null);
    if (nums[0] === undefined) continue;
    guardar(m, desc, nums[0]);
  }
  return m;
}

/** A nossa apuração como o mesmo mapa. */
async function apurar(fornecedores) {
  const corpo = fornecedores ? { ...FILTRO_BASE, fornecedores } : FILTRO_BASE;
  const r = await fetch(`${API}/api/dre-gerencial/apuracao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`API respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const a = j.dados ?? j;
  const m = new Map();
  for (const l of a.linhas ?? []) {
    guardar(m, l.descricao, l.total?.valor ?? 0);
  }
  return m;
}

const fmt = (v) => v === null || v === undefined
  ? '—'
  : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let falhas = 0;
const afirmar = (ok, texto, detalhe = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${texto}${detalhe ? '   ' + detalhe : ''}`);
  if (!ok) falhas++;
};
const perto = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('\n══ dc77 — a nossa API contra a 9815, filial 7, agosto/2026 ══\n');

// ── 1. SEM FILTRO: tudo tem de bater, linha a linha ──────────────────────────────────
const nove = planilha(semArq);
const nosso = await apurar(null);

// AS DIVERGÊNCIAS JÁ APROVADAS NÃO SÃO FALHA — mas também não são invisíveis: o script as
// imprime sempre, com o número da seção, para que ninguém as confunda com acerto.
//
// Todas descendem da §10: `INDENIZACAO DE MERC. VENC. E AVARIA` virou informativa a pedido
// em 14/09/2026, e os três totalizadores que a somavam passaram a divergir na mesma medida.
const APROVADAS = new Map([
  ['INDENIZACAO DE MERC. VENC. E AVARIA', '§10 — virou informativa a pedido'],
  ['TOTAL DAS DESPESAS', '§10 — não soma mais a indenização'],
  ['LUCRO LIQUIDO', '§10 — idem'],
  ['RESULTADO OPERACIONAL', '§10 + promoção de créditos — sobe VERBAS MARGEM e RATEIO'],
  ['SUBTOTAL POSITIVO', 'promoção de créditos'],
  // As DUAS ocorrências de RATEIO DESP. CORPORATIVAS trocam de lugar entre as duas telas:
  // promovemos a segunda para junto dos créditos, e a 9815 a deixa onde o cadastro a põe. O
  // conjunto de valores é o mesmo — a verificação logo abaixo confere isso, em vez de aceitar
  // a troca no escuro.
  ['RATEIO DESP. CORPORATIVAS', 'promoção de créditos — a segunda ocorrência sobe'],
]);

console.log('  ── sem filtro: a regressão ──');
let divergentes = 0;
let comparadas = 0;
const conhecidas = [];
for (const [k, v9815] of nove) {
  if (!nosso.has(k)) continue;        // linha que só a 9815 mostra, ou rótulo de cabeçalho
  comparadas++;
  if (perto(nosso.get(k), v9815, 0.005)) continue;

  const motivo = APROVADAS.get(k.replace(/ #\d+$/, ''));
  if (motivo) {
    conhecidas.push(`${k.slice(0, 36).padEnd(37)}${fmt(v9815).padStart(16)} → ` +
      `${fmt(nosso.get(k)).padStart(16)}   ${motivo}`);
    continue;
  }

  divergentes++;
  if (divergentes <= 8) {
    console.log(`       DIVERGE  ${k.slice(0, 40).padEnd(41)}` +
      `9815 ${fmt(v9815).padStart(16)}   nosso ${fmt(nosso.get(k)).padStart(16)}`);
  }
}

afirmar(divergentes === 0,
  `as ${comparadas} linhas comparáveis batem, fora as divergências aprovadas`,
  divergentes ? `${divergentes} divergente(s) NÃO explicada(s)` : '');

if (conhecidas.length) {
  console.log('\n       divergências já aprovadas, conferidas e esperadas:');
  for (const linha of conhecidas) console.log('       · ' + linha);
}

// AS HOMÔNIMAS PODEM TROCAR DE LUGAR, MAS NÃO PODEM SUMIR. Aceitar a troca pelo nome sozinho
// deixaria passar uma linha que simplesmente deixou de ser somada — então aqui o conjunto de
// valores das duas ocorrências é comparado como conjunto, ordenado.
const soma = (m, nome) => [...m]
  .filter(([k]) => k.replace(/ #\d+$/, '') === nome)
  .map(([, v]) => v)
  .sort((a, b) => a - b);

const rateio9815 = soma(nove, 'RATEIO DESP. CORPORATIVAS');
const rateioNosso = soma(nosso, 'RATEIO DESP. CORPORATIVAS');
afirmar(
  rateio9815.length === rateioNosso.length &&
    rateio9815.every((v, i) => perto(v, rateioNosso[i], 0.005)),
  'as duas ocorrências de RATEIO DESP. CORPORATIVAS têm os mesmos valores, trocadas de lugar',
  `9815 [${rateio9815.map(fmt).join(' · ')}]   nosso [${rateioNosso.map(fmt).join(' · ')}]`);

// ── 2. COM FILTRO: o que já está implementado ────────────────────────────────────────
for (const [nome, arquivo, codigos] of [['29', pgArq, [29]], ['2453', pg2Arq, [2453]]]) {
  console.log(`\n  ── fornecedor ${nome} ──`);
  const n9815 = planilha(arquivo);
  const nAPI = await apurar(codigos);

  const rlSem = nove.get('(=) RECEITAS LIQUIDAS');
  const participacao = n9815.get('(=) RECEITAS LIQUIDAS') / rlSem;

  // O faturamento sai do pr.codfornec, e isso é a fase 1 — tem de bater agora.
  for (const k of ['(+) RECEITA BRUTA', '(-) ABAT./DESC.', '(-) DEVOLUCAO',
                   '(=) RECEITAS LIQUIDAS', '(=) CMV LIQ.', 'LUCRO BRUTO',
                   '(-) ST', '(-) PIS', '(-) COFINS']) {
    if (!n9815.has(k) || !nAPI.has(k)) continue;
    afirmar(perto(nAPI.get(k), n9815.get(k), 0.005), `${k} bate`,
      `${fmt(n9815.get(k))} · ${fmt(nAPI.get(k))}`);
  }

  // O centro 90 e o centro dedicado vêm do WHERE — fase 2, tem de bater agora.
  for (const k of ['VERBAS MARGEM', 'EQUIPE P&G']) {
    if (!n9815.has(k)) { afirmar(!nAPI.has(k) || nAPI.get(k) === 0, `${k} some, como na 9815`); continue; }
    afirmar(perto(nAPI.get(k) ?? 0, n9815.get(k), 0.005), `${k} bate`,
      `${fmt(n9815.get(k))} · ${fmt(nAPI.get(k))}`);
  }

  // As contas SEM centro de custo somem — `NULL NOT IN (90)`.
  for (const k of ['FECH-RESULTADO', 'DESPESAS SOCIOS', 'FECH. VB APLICAR']) {
    if (!n9815.has(k)) continue;
    afirmar(perto(n9815.get(k), 0, 0.005) === perto(nAPI.get(k) ?? 0, 0, 0.005),
      `${k} acompanha a 9815`, `${fmt(n9815.get(k))} · ${fmt(nAPI.get(k))}`);
  }

  // ── E O QUE FALTA: a despesa comum, que ainda não é rateada ────────────────────────
  // A conta é a prova de que o que falta é SÓ o rateio: o nosso valor vezes a participação
  // tem de dar o da 9815. Se der, a fase 3 é exatamente o que ela diz ser.
  console.log('       ·');
  for (const k of ['ADMINISTRATIVO', 'TRANSPORTES MATRIZ', 'VENDAS']) {
    if (!n9815.has(k) || !nAPI.has(k)) continue;
    const jaBate = perto(nAPI.get(k), n9815.get(k), 0.51);
    const rateado = nAPI.get(k) * participacao;
    afirmar(jaBate || perto(rateado, n9815.get(k), 0.51),
      jaBate ? `${k} já bate` : `${k} falta só ratear`,
      `nosso ${fmt(nAPI.get(k))} × ${(participacao * 100).toFixed(4)}% = ` +
      `${fmt(rateado)}   9815 ${fmt(n9815.get(k))}`);
  }
}

console.log(falhas === 0
  ? '\n  TUDO CONFERE para o que já foi implementado.\n'
  : `\n  ${falhas} asserção(ões) falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
