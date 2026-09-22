// dc58 — O que o filtro por fornecedor faz, na filial 7, agosto/2026.
//
// A dc56 explicou quase tudo na filial 27, e deixou UMA pergunta em aberto: o centro de custo
// 25 (EQUIPE P&G) nunca teve movimento naquele mês, então não dava para saber o que acontece
// com ele quando se filtra por um fornecedor que não é a P&G.
//
// Este script responde comparando TRÊS exportações da 9815 do mesmo mês e da mesma filial:
//   · sem filtro
//   · fornecedor 815 — GILLETTE       (verba no centro 90, 23,9% da receita)
//   · fornecedor   1 — COLGATE        (verba no centro 90, concorrente da P&G)
//
// Uso:
//   node docs/validacao/dc58_filtro_por_fornecedor_na_filial_7.mjs <sem.xlsx> <815.xlsx> <1.xlsx> [<815 em grupo de contas.xlsx>]
//
// Não toca no banco. Só lê planilha.
//
// ═══════════════════════════════════════════════════════════════════════════
// RESULTADO — 22/09/2026, filial 7, agosto/2026, 14 asserções ao centavo
// ═══════════════════════════════════════════════════════════════════════════
//
// A EQUIPE P&G DESAPARECE, nos dois filtros. E o motivo estava no log o tempo todo:
//
//     AND ( (CCPrinc.codccprinc = 25 and 29 in (815)) or (CCPrinc.codccprinc <> 25) )
//                                     ^^^^^^^^^^^^^
//
// O `29` é um LITERAL FIXO — o código da PROCTER & GAMBLE, escrito no Delphi. O `in (...)` é
// a lista de fornecedores selecionados. A condição lê "a P&G está entre os selecionados?".
//
// ISTO CORRIGE A LEITURA DO COMMIT c1381a5. Lá está escrito que `29 in (29)` seria "o
// fornecedor selecionado dentro da lista dos selecionados: SEMPRE VERDADEIRO", e que a equipe
// entraria inteira para qualquer fornecedor. Errado: com a P&G selecionada os dois lados
// coincidem por acaso, e um mês só não distingue as duas leituras. Filtrando por 815 vira
// `29 in (815)`, que é FALSO, e o centro 25 sai por completo. Não é defeito — é regra: a
// equipe dedicada só aparece quando se olha o fornecedor dela.
//
// A MECÂNICA COMPLETA, então, é:
//
//   participação = RECEITAS LIQUIDAS filtrado ÷ RECEITAS LIQUIDAS total
//                  23,8522% (Gillette)   ·   2,7105% (Colgate)
//
//   1. FATURAMENTO — filtra de verdade, por `pr.codfornec` (o fornecedor do PRODUTO).
//   2. CENTRO 90 (VERBAS MARGEM) — valor EXCLUSIVO do fornecedor, no SQL. Não é rateado:
//      Gillette 236.600,00 onde o rateio daria 174.225,21.
//   3. CENTRO 25 (EQUIPE P&G) — entra INTEIRO se a P&G estiver selecionada, some se não.
//   4. CONTAS SEM CENTRO DE CUSTO — somem, por `NULL NOT IN (90)`. Em agosto: FECH-RESULTADO,
//      FECH. VB APLICAR e DESPESAS SOCIOS.
//   5. TODO O RESTO — vem cheio do SQL e é RATEADO pela participação dentro do Delphi.
//
// O QUE ISSO MUDA NA IMPLEMENTAÇÃO, e é o achado que mais importa: o totalizador SENTE as
// remoções. Não basta ratear o Sub-Total pronto —
//
//     Sub-Total = (Sub-Total sem filtro − EQUIPE P&G) × participação
//     -2.873.577,62  =  (-12.669.998,14 + 622.565,47) × 0,238522        ✓ ao centavo
//     ratear o Sub-Total inteiro daria -3.022.073,18                    ✗ erra 148 mil
//
// Ou seja: remover primeiro, ratear depois. A ordem das duas operações não comuta.

import fs from 'node:fs';
import zlib from 'node:zlib';

const [semArq, gilArq, colArq, outraArq] = process.argv.slice(2);
if (!semArq || !gilArq || !colArq) {
  console.error('uso: node dc58...mjs <sem_filtro.xlsx> <fornecedor_815.xlsx> <fornecedor_1.xlsx>');
  process.exit(2);
}

// ── ler a planilha sem biblioteca ────────────────────────────────────────────
// Mesmo leitor da dc28. Dividir o sharedStrings por `</si>` e não por `</t>`: uma entrada com
// formatação tem vários `<t>`, e dividir pelo menor desloca todos os rótulos seguintes.
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

// ── transformar em linhas do DRE ─────────────────────────────────────────────
// A grade sai como Descrição · Valor · AV%. O valor pode vir como número cru (o Excel guarda
// assim) ou como texto formatado — aceitamos os dois, e `(1.234,56)` é negativo.
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
    // A EXPORTAÇÃO TEM UMA COLUNA ESPAÇADORA. O `B` da planilha é uma coluna de 0,28 de
    // largura, sempre vazia, e o valor mora no `C`. Ler `cel[1]` devolve vazio em TODA linha,
    // e a conferência inteira sai com zero linhas — foi o que aconteceu na primeira execução.
    // Por isso os números são lidos por varredura, e não por posição fixa.
    const nums = cel.slice(1).map(numero).filter((v) => v !== null);
    const [valor, av] = nums;
    // Cabeçalho e rodapé não têm número nenhum.
    if (valor === undefined) continue;
    linhas.push({ desc, valor, av: av ?? null });
  }
  return linhas;
}

const sem = dreDe(semArq);
const gil = dreDe(gilArq);
const col = dreDe(colArq);

const fmt = (v) => v === null || v === undefined
  ? '—'
  : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log('\n══ dc58 — o filtro por fornecedor, filial 7, agosto/2026 ══\n');
console.log(`  linhas:  sem filtro ${sem.length}   ·   Gillette ${gil.length}   ·   Colgate ${col.length}\n`);

// ── 1. A participação, lida da linha RECEITAS LIQUIDAS ───────────────────────
// Na 9815 o %AV dessa linha deixa de ser 100,000 e passa a mostrar a participação do
// fornecedor no total da filial. É esse número que rateia as despesas.
const achar = (ls, alvo) => ls.find((l) => l.desc.toUpperCase().replace(/\s+/g, ' ').includes(alvo));

for (const [nome, ls] of [['sem filtro', sem], ['Gillette', gil], ['Colgate', col]]) {
  const rl = achar(ls, 'RECEITAS LIQUIDAS');
  const rb = achar(ls, 'RECEITA BRUTA');
  console.log(`  ${nome.padEnd(12)} RECEITA BRUTA ${fmt(rb?.valor).padStart(18)}   ·   RECEITAS LIQ. ${fmt(rl?.valor).padStart(18)}   AV ${String(rl?.av ?? '—').padStart(10)}`);
}

// ── 2. As linhas que só existem em um dos lados ──────────────────────────────
const chaves = (ls) => new Set(ls.map((l) => l.desc.toUpperCase().replace(/\s+/g, ' ')));
const cSem = chaves(sem), cGil = chaves(gil), cCol = chaves(col);

function sumiram(base, filtrado, nome) {
  const fora = [...base].filter((k) => !filtrado.has(k));
  console.log(`\n  ── some com o filtro de ${nome} (${fora.length}) ──`);
  for (const k of fora) {
    const l = sem.find((x) => x.desc.toUpperCase().replace(/\s+/g, ' ') === k);
    console.log(`     ${k.padEnd(45)} ${fmt(l?.valor).padStart(18)}`);
  }
}
sumiram(cSem, cGil, 'Gillette');
sumiram(cSem, cCol, 'Colgate');

for (const [nome, c] of [['Gillette', cGil], ['Colgate', cCol]]) {
  const novas = [...c].filter((k) => !cSem.has(k));
  if (novas.length) console.log(`\n  ── aparece SÓ com ${nome}: ${novas.join(' · ')}`);
}

// ── 3. A razão linha a linha ────────────────────────────────────────────────
// Se a despesa é RATEADA pela participação, a razão filtrado/sem-filtro é a MESMA em todas as
// linhas de despesa — e igual à participação. Linha que foge disso é o que interessa.
function razoes(filtrado, nome) {
  console.log(`\n  ── razão ${nome} ÷ sem filtro ──`);
  console.log('     ' + 'linha'.padEnd(45) + 'sem filtro'.padStart(18) + nome.padStart(18) + 'razão %'.padStart(12) + '   AV igual?');
  const vistos = new Set();
  for (const l of filtrado) {
    const k = l.desc.toUpperCase().replace(/\s+/g, ' ');
    if (vistos.has(k)) continue;
    vistos.add(k);
    const base = sem.find((x) => x.desc.toUpperCase().replace(/\s+/g, ' ') === k);
    if (!base || base.valor === 0) continue;
    const r = (l.valor / base.valor) * 100;
    const avIgual = base.av === null || l.av === null
      ? '?'
      : (Math.abs(base.av - l.av) < 0.0005 ? 'sim' : `NÃO  ${base.av} → ${l.av}`);
    console.log(
      '     ' + k.slice(0, 44).padEnd(45)
      + fmt(base.valor).padStart(18)
      + fmt(l.valor).padStart(18)
      + r.toFixed(4).padStart(12)
      + '   ' + avIgual,
    );
  }
}
razoes(gil, 'Gillette');
razoes(col, 'Colgate');

// ── 4. As asserções ─────────────────────────────────────────────────────────
// Até aqui é leitura. Daqui para baixo é o que precisa VALER, e o script sai com código ≠ 0
// se algo não valer — senão a conclusão vira impressão de quem leu a tabela.
console.log('\n══ asserções ══\n');

let falhas = 0;
function afirmar(ok, texto, detalhe = '') {
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${texto}${detalhe ? '   ' + detalhe : ''}`);
  if (!ok) falhas++;
}

const linhaDe = (ls, k) => ls.find((l) => l.desc.toUpperCase().replace(/\s+/g, ' ') === k);
const perto = (a, b, tol) => Math.abs(a - b) <= tol;

for (const [nome, ls] of [['Gillette', gil], ['Colgate', col]]) {
  console.log(`  ── ${nome} ──`);

  const rlSem = linhaDe(sem, '(=) RECEITAS LIQUIDAS').valor;
  const rl = linhaDe(ls, '(=) RECEITAS LIQUIDAS').valor;
  const participacao = rl / rlSem;

  // (a) O centro 25 não aparece. Esta é A pergunta que a dc57 foi montada para responder.
  afirmar(!linhaDe(ls, 'EQUIPE P&G'), 'a linha EQUIPE P&G (centro 25) NÃO aparece');

  // (b) A despesa comum é rateada pela participação. Tomo três linhas de blocos diferentes,
  //     escolhidas por não terem nada de especial: nenhuma é centro 90, 25 ou sem centro.
  for (const k of ['ADMINISTRATIVO', 'TRANSPORTES MATRIZ', 'DESPESAS TRIBUTÁRIAS']) {
    const a = linhaDe(sem, k).valor, b = linhaDe(ls, k).valor;
    afirmar(perto(b, a * participacao, 0.51), `${k} é rateada pela participação`,
      `${fmt(a * participacao)} ≈ ${fmt(b)}`);
  }

  // (c) VERBAS MARGEM (centro 90) NÃO segue a participação — é a verba exclusiva do
  //     fornecedor, e o valor é dele, não uma fatia do total.
  const vmSem = linhaDe(sem, 'VERBAS MARGEM').valor, vm = linhaDe(ls, 'VERBAS MARGEM').valor;
  afirmar(!perto(vm, vmSem * participacao, 1),
    'VERBAS MARGEM (centro 90) NÃO é rateada — é o valor exclusivo do fornecedor',
    `rateio daria ${fmt(vmSem * participacao)}, a 9815 mostra ${fmt(vm)}`);

  // (d) O totalizador SENTE a remoção do centro 25. É o ponto que decide a implementação:
  //     não basta ratear o Sub-Total, é preciso TIRAR a equipe antes de ratear.
  const stSem = linhaDe(sem, 'SUB-TOTAL -> DESPESAS OPERACIONAIS').valor;
  const st = linhaDe(ls, 'SUB-TOTAL -> DESPESAS OPERACIONAIS').valor;
  const equipe = linhaDe(sem, 'EQUIPE P&G').valor;
  afirmar(perto(st, (stSem - equipe) * participacao, 2),
    'Sub-Total = (Sub-Total sem filtro − EQUIPE P&G) × participação',
    `${fmt((stSem - equipe) * participacao)} ≈ ${fmt(st)}`);
  afirmar(!perto(st, stSem * participacao, 2),
    '…e ratear o Sub-Total INTEIRO daria outro número',
    `daria ${fmt(stSem * participacao)}`);

  console.log('');
}

// ── 5. A mesma apuração em outra dimensão (argumento opcional) ──────────────
// As três dimensões da 9815 são recortes da MESMA apuração, então as linhas calculadas têm
// de fechar iguais nas três — com ou sem filtro. Importa aqui porque o centro 25 não é uma
// linha visível em Grupo de Contas: ele está diluído dentro das contas. Se a remoção
// acontecesse só numa das dimensões, os lucros líquidos se separariam.
if (outraArq) {
  console.log('══ a mesma apuração, em Grupo de Contas ══\n');
  const outra = dreDe(outraArq);
  console.log(`  linhas: c.custo principal ${gil.length}   ·   grupo de contas ${outra.length}\n`);
  for (const k of ['(+) RECEITA BRUTA', '(=) RECEITAS LIQUIDAS', 'LUCRO BRUTO',
                   'SUB-TOTAL -> DESPESAS OPERACIONAIS', 'RESULTADO OPERACIONAL',
                   'TOTAL DAS DESPESAS', 'LUCRO LIQUIDO']) {
    const a = linhaDe(gil, k);
    // Em Grupo de Contas o Sub-Total tem outro rótulo; caso por prefixo quando não achar.
    const b = linhaDe(outra, k)
      ?? outra.find((l) => l.desc.toUpperCase().startsWith(k.split(' ->')[0]));
    afirmar(!!a && !!b && perto(a.valor, b.valor, 0.005), `${k.split(' ->')[0]} fecha igual`,
      a && b ? `${fmt(a.valor)} · ${fmt(b.valor)}` : 'linha não encontrada');
  }
  console.log('');
}

console.log(falhas === 0
  ? '  TUDO CONFERE — a mecânica do filtro está descrita corretamente acima.\n'
  : `  ${falhas} asserção(ões) falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
