// dc74 — O centro 25 com a P&G selecionada, e o recorte de cada cadastro dela.
//
// A dc58 mediu o filtro com GILLETTE e COLGATE, e nos dois a EQUIPE P&G some. Ficou de fora a
// pergunta que mais importava: o que acontece ao filtrar pela PRÓPRIA P&G. Este script
// responde, e de quebra mede os dois cadastros dela lado a lado.
//
// Uso:
//   node docs/rotinas/9815-dre-gerencial/validacao/dc74_filtro_por_fornecedor_29_e_2453.mjs <A_sem.xlsx> <B_29.xlsx> <C_2453.xlsx>
//
// Não toca no banco. Só lê planilha.
//
// ═══════════════════════════════════════════════════════════════════════════
// RESULTADO — 01/10/2026, filial 7, agosto/2026, C.Custo Principal, competência
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. O CENTRO 25 ENTRA INTEIRO, e isso deixou de ser leitura do código:
//
//      EQUIPE P&G   sem filtro -531.264,84   ·   com 29  -531.264,84   ·   100,0000%
//                                                com 2453      0,00    ·   some
//
// 2. A FÓRMULA DO RATEIO — este é o caso que distingue as duas leituras, e que a dc58 nunca
//    pôde produzir, porque com Gillette e Colgate a equipe sempre sumia:
//
//      Sub-Total real com 29                                  -1.252.539,51
//      (sem filtro − equipe) × part + equipe   ← o fonte       -1.252.539,52   dif  -0,01
//      (sem filtro − equipe) × part            ← leitura velha   -721.274,68   dif  531.264,83
//
//    A diferença da fórmula velha é, ao centavo, o valor da própria EQUIPE P&G. O que o
//    UBase.pas faz (5797-5812) é TIRAR o exclusivo, ratear o resto e SOMAR DE VOLTA.
//
// 3. CADA CADASTRO É UM RECORTE, e um não puxa o outro:
//
//      29     receita bruta 3.226.242,02   participação 8,2206%
//      2453   receita bruta 1.849.653,08   participação 4,3943%
//
//    São CNPJs diferentes (01358874000188 e 01358874001664), empresas distintas na nota, e o
//    produto pertence a um codfornec só. Que o 29 não enxergue a receita do 2453 NÃO É PERDA
//    — é o recorte pedido. Ver ../FILTRO_FORNECEDOR.md, "A regra é por CÓDIGO DE FORNECEDOR".
//
// 4. VERBAS MARGEM não é rateada em nenhum dos dois: 199.500,00 pelo 29 e 150.100,00 pelo
//    2453, onde o rateio daria 72.453,50 e 38.729,98.
//
// 5. AS CONTAS SEM CENTRO DE CUSTO somem nos dois filtros — FECH-RESULTADO, DESPESAS SOCIOS e
//    FECH. VB APLICAR saem zeradas. É o `NULL NOT IN (90)`.
//
// O SQL montado foi conferido nos três traces, e é exatamente o do UBase.pas:27217:
//   sem filtro   0 as VPAGO_EXCLUSIVO_FORNEC          (as condições nem aparecem)
//   com 29       (codccprinc = 25 and 29 in (29))     verdadeiro
//   com 2453     (codccprinc = 25 and 29 in (2453))   falso

import fs from 'node:fs';
import zlib from 'node:zlib';

const [semArq, pgArq, pg2Arq] = process.argv.slice(2);
if (!semArq || !pgArq || !pg2Arq) {
  console.error('uso: node dc74...mjs <A_sem.xlsx> <B_29.xlsx> <C_2453.xlsx>');
  process.exit(2);
}

// ── ler a planilha sem biblioteca ────────────────────────────────────────────
// Mesmo leitor da dc28 e da dc58, copiado de propósito: cada dc roda sozinha, com os
// argumentos que o próprio nome anuncia, sem depender de outra.
//
// Dividir o sharedStrings por `</si>` e não por `</t>`: uma entrada com formatação tem vários
// `<t>`, e dividir pelo menor desloca todos os rótulos seguintes.
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

  // A célula VAZIA vem antes na alternância, senão a forma com corpo engole a seguinte.
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
    const ordenadas = Object.keys(celulas)
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .map((c) => celulas[c]);
    fora.push(ordenadas);
  }
  return fora;
}

function numero(s) {
  if (s === undefined || s === '') return null;
  const t = String(s).trim();
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t);   // número cru do Excel
  const neg = /^\(.*\)$/.test(t);
  const limpo = t.replace(/[()\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  const v = Number(limpo);
  return neg ? -v : v;
}

function dreDe(caminho) {
  const linhas = [];
  for (const cel of linhasDoXlsx(caminho)) {
    const desc = (cel[0] ?? '').trim();
    if (!desc) continue;
    // A exportação tem uma coluna espaçadora: o `B` é uma coluna de 0,28 de largura, sempre
    // vazia, e o valor mora no `C`. Por isso os números são lidos por varredura.
    const nums = cel.slice(1).map(numero).filter((v) => v !== null);
    const [valor, av] = nums;
    if (valor === undefined) continue;   // cabeçalho e rodapé não têm número nenhum
    linhas.push({ desc, valor, av: av ?? null });
  }
  return linhas;
}

const sem = dreDe(semArq);
const pg = dreDe(pgArq);
const pg2 = dreDe(pg2Arq);

const fmt = (v) => v === null || v === undefined
  ? '—'
  : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const chave = (s) => s.toUpperCase().replace(/\s+/g, ' ');
const linhaDe = (ls, k) => ls.find((l) => chave(l.desc) === k);
const perto = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('\n══ dc74 — a P&G filtrando a si mesma, filial 7, agosto/2026 ══\n');

for (const [nome, ls] of [['sem filtro', sem], ['29', pg], ['2453', pg2]]) {
  const rl = linhaDe(ls, '(=) RECEITAS LIQUIDAS');
  const rb = linhaDe(ls, '(+) RECEITA BRUTA');
  const eq = linhaDe(ls, 'EQUIPE P&G');
  console.log(`  ${nome.padEnd(11)} bruta ${fmt(rb?.valor).padStart(16)}  ·  líquida ${fmt(rl?.valor).padStart(16)}`
    + `  ·  AV ${String(rl?.av ?? '—').padStart(9)}  ·  EQUIPE P&G ${fmt(eq?.valor).padStart(14)}`);
}

console.log('\n══ asserções ══\n');

let falhas = 0;
const afirmar = (ok, texto, detalhe = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${texto}${detalhe ? '   ' + detalhe : ''}`);
  if (!ok) falhas++;
};

const rlSem = linhaDe(sem, '(=) RECEITAS LIQUIDAS').valor;
const stSem = linhaDe(sem, 'SUB-TOTAL -> DESPESAS OPERACIONAIS').valor;
const equipeSem = linhaDe(sem, 'EQUIPE P&G').valor;
const vmSem = linhaDe(sem, 'VERBAS MARGEM').valor;

// `entra` diz se o centro 25 pertence ao fornecedor filtrado. Na 9815 isso é o literal 29;
// com a tabela de parâmetro passa a ser o que estiver cadastrado para aquele centro.
for (const [nome, ls, entra] of [['29', pg, true], ['2453', pg2, false]]) {
  console.log(`  ── fornecedor ${nome} ──`);

  const participacao = linhaDe(ls, '(=) RECEITAS LIQUIDAS').valor / rlSem;
  const equipe = linhaDe(ls, 'EQUIPE P&G');

  // (a) O centro 25 só aparece para quem ele pertence — e, quando aparece, vem INTEIRO.
  if (entra) {
    afirmar(!!equipe && perto(equipe.valor, equipeSem, 0.005),
      'EQUIPE P&G entra INTEIRA, sem rateio',
      `${fmt(equipeSem)} ≈ ${fmt(equipe?.valor)}`);
  } else {
    afirmar(!equipe || equipe.valor === 0,
      'EQUIPE P&G não aparece — o centro 25 é do 29, não deste cadastro',
      equipe ? `a 9815 mostra ${fmt(equipe.valor)}` : 'linha ausente');
  }

  // (b) A despesa comum é rateada pela participação, em qualquer dos dois recortes.
  for (const k of ['ADMINISTRATIVO', 'TRANSPORTES MATRIZ', 'DESPESAS TRIBUTÁRIAS']) {
    const a = linhaDe(sem, k).valor, b = linhaDe(ls, k).valor;
    afirmar(perto(b, a * participacao, 0.51), `${k} é rateada pela participação`,
      `${fmt(a * participacao)} ≈ ${fmt(b)}`);
  }

  // (c) VERBAS MARGEM é o valor exclusivo do fornecedor, nunca uma fatia do total.
  const vm = linhaDe(ls, 'VERBAS MARGEM').valor;
  afirmar(!perto(vm, vmSem * participacao, 1),
    'VERBAS MARGEM (centro 90) não é rateada — é o valor exclusivo',
    `rateio daria ${fmt(vmSem * participacao)}, a 9815 mostra ${fmt(vm)}`);

  // (d) A FÓRMULA DO RATEIO, na forma geral: tira o exclusivo, rateia o resto, soma de volta.
  //     Com o 2453 o exclusivo é zero e ela degenera na forma antiga; com o 29 as duas se
  //     separam por 531 mil, e é por isso que esta apuração precisou existir.
  const st = linhaDe(ls, 'SUB-TOTAL -> DESPESAS OPERACIONAIS').valor;
  const exclusivo = entra ? equipeSem : 0;
  afirmar(perto(st, (stSem - equipeSem) * participacao + exclusivo, 2),
    'Sub-Total = (sem filtro − equipe) × participação + exclusivo',
    `${fmt((stSem - equipeSem) * participacao + exclusivo)} ≈ ${fmt(st)}`);
  afirmar(!perto(st, stSem * participacao, 2),
    '…e ratear o Sub-Total INTEIRO daria outro número',
    `daria ${fmt(stSem * participacao)}`);

  // (e) As contas sem centro de custo somem — `NULL NOT IN (90)`.
  for (const k of ['FECH-RESULTADO', 'DESPESAS SOCIOS', 'FECH. VB APLICAR']) {
    const l = linhaDe(ls, k);
    afirmar(!l || l.valor === 0, `${k} sai zerada — conta sem centro de custo`,
      l ? `a 9815 mostra ${fmt(l.valor)}` : 'linha ausente');
  }

  console.log('');
}

// A fórmula VELHA erra, e erra exatamente o valor da equipe. É a asserção que prova a leitura
// do fonte, e a única que não poderia existir antes desta apuração.
const partPg = linhaDe(pg, '(=) RECEITAS LIQUIDAS').valor / rlSem;
const stPg = linhaDe(pg, 'SUB-TOTAL -> DESPESAS OPERACIONAIS').valor;
const erroVelha = (stSem - equipeSem) * partPg - stPg;
afirmar(perto(Math.abs(erroVelha), Math.abs(equipeSem), 0.02),
  'a fórmula SEM o "soma de volta" erra exatamente o valor da EQUIPE P&G',
  `erro ${fmt(Math.abs(erroVelha))} · equipe ${fmt(Math.abs(equipeSem))}`);

console.log(falhas === 0
  ? '\n  TUDO CONFERE.\n'
  : `\n  ${falhas} asserção(ões) falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
