// dc28 — a impressão da nossa tela contra a exportação da 9815, linha a linha
//
//   node docs/validacao/dc28_impressao_contra_planilha.mjs "<impressão.pdf>" "<9815.xlsx>"
//
// Nasceu da conferência de 2025 em 14/09/2026, que achou as divergências 7 e 8 do
// DIVERGENCIAS.md. Fica aqui porque ler esses dois arquivos deu mais trabalho que comparar
// os números, e o trabalho se repete a cada rodada de homologação.
//
// ── Três armadilhas que custaram tempo, todas já resolvidas aqui ──
//
// 1. **O PDF não guarda texto, guarda códigos de glifo de fonte subset** (`<36> Tj`). O
//    mesmo código é uma letra diferente em cada fonte, então ler os bytes produz lixo
//    convincente. É preciso seguir /Font → objeto da fonte → /ToUnicode e decodificar com a
//    CMap certa. O Chrome ainda posiciona CADA glifo com um `Td`: só o `Tm` começa um
//    trecho novo, e quebrar linha no `Td` devolve uma letra por linha.
//
// 2. **Célula vazia do xlsx é auto-fechada** (`<c r="B3" s="7" />`). Uma expressão que case
//    `<c ...>...</c>` engole a célula seguinte e desloca a linha inteira uma coluna — o
//    valor de janeiro vira o de fevereiro, e a planilha parece dizer outra coisa.
//
// 3. **Casar linha por NOME troca as linhas de lugar.** `MARKETING - RAT`,
//    `TRANSPORTES MATRIZ`, `VENDAS` e `RECEITAS FINANCEIRAS` aparecem duas vezes no DRE,
//    antes e depois do RESULTADO OPERACIONAL. O alinhamento aqui é por ORDEM, com
//    subsequência comum máxima, que é também quem denuncia linha a mais e linha a menos.
import fs from 'node:fs';
import zlib from 'node:zlib';

const [caminhoPdf, caminhoXlsx] = process.argv.slice(2);
if (!caminhoPdf || !caminhoXlsx) {
  console.error('uso: node dc28_impressao_contra_planilha.mjs <impressão.pdf> <9815.xlsx>');
  process.exit(2);
}

const num = (s) => {
  if (!s || s === '—') return null;
  const negativo = s.startsWith('(');
  const v = Number(s.replace(/[()]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? null : (negativo ? -v : v);
};
const fmt = (v) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── o PDF ────────────────────────────────────────────────────────────────────
function textoDoPdf(caminho) {
  const buf = fs.readFileSync(caminho);
  const bruto = buf.toString('latin1');
  const objetos = new Map();
  const streams = new Map();

  for (const m of bruto.matchAll(/(\d+)\s+\d+\s+obj\b/g)) {
    const ini = m.index + m[0].length;
    const fim = bruto.indexOf('endobj', ini);
    const corpo = bruto.slice(ini, fim < 0 ? ini + 4000 : fim);
    objetos.set(Number(m[1]), corpo);

    const s = corpo.indexOf('stream');
    if (s < 0) continue;
    let a = ini + s + 6;
    if (buf[a] === 13) a++;
    if (buf[a] === 10) a++;
    const e = buf.indexOf('endstream', a);
    if (e < 0) continue;
    try {
      streams.set(Number(m[1]), /FlateDecode/.test(corpo.slice(0, s))
        ? zlib.inflateSync(buf.subarray(a, e))
        : buf.subarray(a, e));
    } catch { /* imagem, ou filtro que não interessa */ }
  }

  // Objetos guardados dentro de ObjStm: o cabeçalho é uma lista (numero, deslocamento).
  for (const [n, corpo] of [...objetos]) {
    if (!/\/Type\s*\/ObjStm/.test(corpo) || !streams.has(n)) continue;
    const d = streams.get(n).toString('latin1');
    const qtd = Number(corpo.match(/\/N\s+(\d+)/)[1]);
    const first = Number(corpo.match(/\/First\s+(\d+)/)[1]);
    const cab = d.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < qtd; k++) {
      objetos.set(cab[2 * k], d.slice(first + cab[2 * k + 1],
        k + 1 < qtd ? first + cab[2 * k + 3] : d.length));
    }
  }

  const cmapDe = (n) => {
    const d = streams.get(n);
    if (!d) return null;
    const s = d.toString('latin1');
    const mapa = new Map();
    for (const b of s.split('beginbfchar').slice(1)) {
      for (const m of b.split('endbfchar')[0].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        mapa.set(parseInt(m[1], 16),
          String.fromCharCode(...(m[2].match(/.{4}/g) ?? []).map((h) => parseInt(h, 16))));
      }
    }
    for (const b of s.split('beginbfrange').slice(1)) {
      for (const m of b.split('endbfrange')[0]
        .matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const de = parseInt(m[1], 16), ate = parseInt(m[2], 16), alvo = parseInt(m[3], 16);
        for (let c = de; c <= ate; c++) mapa.set(c, String.fromCharCode(alvo + c - de));
      }
    }
    return mapa;
  };

  const paginas = [];
  for (const [n, corpo] of objetos) {
    if (!/\/Type\s*\/Page\b/.test(corpo)) continue;
    const fontes = new Map();
    const bloco = corpo.match(/\/Font\s*<<([\s\S]*?)>>/);
    for (const m of bloco?.[1].matchAll(/\/(F\d+)\s+(\d+)\s+\d+\s+R/g) ?? []) {
      const tu = (objetos.get(Number(m[2])) ?? '').match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
      if (tu) fontes.set(m[1], cmapDe(Number(tu[1])));
    }
    const conteudo = [...corpo.matchAll(/\/Contents\s+(?:(\d+)\s+\d+\s+R|\[([^\]]*)\])/g)]
      .flatMap((m) => m[1] ? [Number(m[1])]
        : [...m[2].matchAll(/(\d+)\s+\d+\s+R/g)].map((x) => Number(x[1])));
    paginas.push({ n, fontes, conteudo });
  }
  paginas.sort((a, b) => a.n - b.n);

  const linhas = [];
  const TOKEN =
    /\/(F\d+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj|\[([^\]]*)\]\s*TJ|(?:-?[\d.]+\s+){2}Td|(?:-?[\d.]+\s+){6}Tm/g;

  for (const pag of paginas) {
    const d = pag.conteudo.map((c) => (streams.get(c) ?? Buffer.alloc(0)).toString('latin1')).join('\n');
    let cmap = null;
    for (const bt of d.split(/\bBT\b/).slice(1)) {
      let linha = [];
      for (const m of bt.split(/\bET\b/)[0].matchAll(TOKEN)) {
        if (m[1]) { cmap = pag.fontes.get(m[1]) ?? null; continue; }
        if (/Td$/.test(m[0])) continue;
        if (/Tm$/.test(m[0])) { if (linha.length) { linhas.push(linha.join('')); linha = []; } continue; }
        const hexes = m[2] !== undefined ? [m[2]]
          : [...m[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => x[1]);
        for (const h of hexes) {
          for (const par of h.match(/.{1,4}/g) ?? []) linha.push(cmap?.get(parseInt(par, 16)) ?? '?');
        }
      }
      if (linha.length) linhas.push(linha.join(''));
    }
  }
  return linhas.map((l) => l.trim());
}

// ── a planilha ───────────────────────────────────────────────────────────────
function linhasDoXlsx(caminho) {
  const zip = fs.readFileSync(caminho);
  // Descompacta o zip sem biblioteca: cada entrada tem um cabeçalho local de 30 bytes.
  const arquivos = new Map();
  for (let i = 0; (i = zip.indexOf('PK\x03\x04', i)) >= 0; i += 4) {
    const metodo = zip.readUInt16LE(i + 8);
    const compr = zip.readUInt32LE(i + 18);
    const nomeLen = zip.readUInt16LE(i + 26);
    const extraLen = zip.readUInt16LE(i + 28);
    const nome = zip.subarray(i + 30, i + 30 + nomeLen).toString('latin1');
    const ini = i + 30 + nomeLen + extraLen;
    if (compr === 0) continue; // tamanho só no descritor: entrada que não interessa aqui
    const dados = zip.subarray(ini, ini + compr);
    try {
      arquivos.set(nome, (metodo === 8 ? zlib.inflateRawSync(dados) : dados).toString('utf8'));
    } catch { /* entrada que não precisamos */ }
  }

  const ss = arquivos.get('xl/sharedStrings.xml') ?? '';
  // Dividir por `</si>`, não por `</t>`: uma entrada com formatação tem vários `<t>`, e
  // dividir pelo menor desloca todos os rótulos seguintes.
  const textos = ss.split('</si>').slice(0, -1).map((si) =>
    [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'"));

  // A célula VAZIA vem antes na alternância, senão a forma com corpo engole a seguinte.
  const CELULA = /<c r="([A-Z]+)(\d+)"([^>]*)\/>|<c r="([A-Z]+)(\d+)"([^>]*?)>([\s\S]*?)<\/c>/g;
  const fora = [];
  for (const row of (arquivos.get('xl/worksheets/sheet1.xml') ?? '').split('</row>').slice(0, -1)) {
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
    fora.push({ n, celulas: ordenadas });
  }
  return fora;
}

// ── ler os dois lados ────────────────────────────────────────────────────────
const RUIDO =
  // O padrão do endereço precisa dos QUATRO octetos e dos dois pontos da porta. `\d+\.\d+\.\d+`
  // sozinho casa também com `492.996.321,06`, e a conferência inteira se desloca em silêncio,
  // comparando o AH % de uma linha com o total de outra.
  /^\d{2}\/\d{2}\/\d{4},|^Época KPI$|^\d+$|^\/$|^\d+\.\d+\.\d+\.\d+:|^DESCRIÇÃO$|^VALOR$|^AV %$|^AH %$|^Δ|^\d{4}$|^\d{4} $|^VISÃO|^Anos |^·$|^ ·$|^Competência|^Caixa|colunas por|apurado em|^Filiais:|^\d+ min|^\d+ s$/;
const eNumero = (s) => /^\(?-?[\d.]+,\d+\)?$/.test(s) || s === '—';

const nosso = [];
let atual = null;
for (const l of textoDoPdf(caminhoPdf)) {
  if (l === '⠿') { if (atual) nosso.push(atual); atual = { desc: [], vals: [] }; continue; }
  if (!atual || l === '' || l === '+' || l === 'INFO' || RUIDO.test(l)) continue;
  if (eNumero(l)) atual.vals.push(l);
  else if (atual.vals.length === 0) atual.desc.push(l);
}
if (atual) nosso.push(atual);

// A coluna a comparar é a ÚLTIMA de valor, e a ordem por linha é
// V(a), AV, AH, V(b), AV, AH, ΔVALOR, Δ% — com um ano só, os quatro primeiros bastam.
const COLUNA_DO_ANO = 3;
const paginaNossa = nosso.map((r) => ({
  desc: r.desc.join(' ').replace(/\s+/g, ' ').trim(),
  valor: num(r.vals[COLUNA_DO_ANO]),
}));

// Na planilha: A a descrição, B vazia, C/D..Y/Z os doze meses em pares (Valor, % AV),
// AA o TOTAL, AB a MÉDIA, AC o % AV do total. Índice 26 é o AA — errar por um pega a MÉDIA.
const COLUNA_TOTAL = 26;
const planilha = linhasDoXlsx(caminhoXlsx)
  .filter((r) => r.n >= 3 && r.celulas.length > COLUNA_TOTAL)
  .map((r) => ({ desc: r.celulas[0].replace(/\s+/g, ' ').trim(), valor: num(r.celulas[COLUNA_TOTAL]) }));

// ── alinhar pela ordem e comparar ────────────────────────────────────────────
const chave = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const L = Array.from({ length: planilha.length + 1 }, () => new Array(paginaNossa.length + 1).fill(0));
for (let i = planilha.length - 1; i >= 0; i--) {
  for (let j = paginaNossa.length - 1; j >= 0; j--) {
    L[i][j] = chave(planilha[i].desc) === chave(paginaNossa[j].desc)
      ? L[i + 1][j + 1] + 1
      : Math.max(L[i + 1][j], L[i][j + 1]);
  }
}

console.log(`planilha 9815: ${planilha.length} linhas · nossa impressão: ${paginaNossa.length} linhas\n`);
console.log('DESCRIÇÃO'.padEnd(41) + '9815'.padStart(18) + 'NOSSO'.padStart(18) + 'DIFERENÇA'.padStart(16));

const mostrar = (d, p, n, dif) =>
  console.log(d.slice(0, 40).padEnd(41) + fmt(p).padStart(18) + fmt(n).padStart(18)
    + (dif === null ? '' : fmt(dif)).padStart(16));

let i = 0, j = 0, batem = 0, divergem = 0, soNossas = [];
while (i < planilha.length && j < paginaNossa.length) {
  if (chave(planilha[i].desc) === chave(paginaNossa[j].desc)) {
    const d = (paginaNossa[j].valor ?? 0) - (planilha[i].valor ?? 0);
    // Meio centavo cobre arredondamento de exibição. Mais que isso é erro.
    if (Math.abs(d) <= 0.005) batem++;
    else { divergem++; mostrar(planilha[i].desc, planilha[i].valor, paginaNossa[j].valor, d); }
    i++; j++;
  } else if (L[i + 1][j] >= L[i][j + 1]) {
    divergem++; mostrar('SÓ NA 9815: ' + planilha[i].desc, planilha[i].valor, null, null);
    i++;
  } else {
    // Linha zerada dos dois lados não é divergência: é a exportação sem "Mostrar contas
    // zeradas". Qualquer linha só nossa COM valor é defeito, e essa entra na conta.
    if (paginaNossa[j].valor) { divergem++; mostrar('SÓ NO NOSSO: ' + paginaNossa[j].desc, null, paginaNossa[j].valor, null); }
    else soNossas.push(paginaNossa[j].desc);
    j++;
  }
}
for (; i < planilha.length; i++) { divergem++; mostrar('SÓ NA 9815: ' + planilha[i].desc, planilha[i].valor, null, null); }
for (; j < paginaNossa.length; j++) {
  if (paginaNossa[j].valor) { divergem++; mostrar('SÓ NO NOSSO: ' + paginaNossa[j].desc, null, paginaNossa[j].valor, null); }
  else soNossas.push(paginaNossa[j].desc);
}

if (soNossas.length) {
  console.log(`\n${soNossas.length} linha(s) zerada(s) só na nossa tela — exportação sem "Mostrar contas zeradas":`);
  console.log('  ' + soNossas.join(' · '));
}

console.log(`\n${batem}/${batem + divergem} ao centavo` + (divergem === 0 ? ' — BATE' : ` — ${divergem} divergência(s)`));
process.exit(divergem === 0 ? 0 : 1);
