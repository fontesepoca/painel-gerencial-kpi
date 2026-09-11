/**
 * dc25 — as faixas de cor das colunas são distinguíveis entre si, e discretas contra o fundo.
 *
 *   node docs/validacao/dc25_faixas_distinguiveis.mjs
 *
 * Nasceu de uma reclamação justa do Gabriel: na primeira versão, Julho (verde) e Agosto
 * (azul) saíam quase iguais no tema claro.
 *
 * **A primeira medição disse que estava tudo bem — e ela é que estava errada.** Medidas em
 * CIE76, aquelas duas faixas davam ΔE 9, acima do limiar que eu tinha adotado, enquanto o
 * olho as via como a mesma cor. CIE76 erra exatamente onde este problema vive: cores claras
 * e pouco saturadas. A métrica passou a ser CIEDE2000 (`_deltaE.mjs`), e a primeira coisa
 * que este arquivo faz é **provar que a fórmula está certa**, contra os casos de referência
 * de Sharma, Wu e Dalal (2005) — porque uma métrica errada escolhe cores erradas sem nada
 * acusar, que foi o que aconteceu.
 *
 * Dois limiares, e eles puxam para lados opostos:
 *
 * | Medida | Regra | Por quê |
 * |---|---|---|
 * | ΔE2000 entre quaisquer duas faixas | **≥ 10** | abaixo disso viram a mesma cor numa olhada |
 * | ΔE2000 de cada faixa ao fundo | **≤ 16** | acima disso deixam de ser leves e competem com o dado |
 *
 * Foi essa tensão que decidiu a paleta ter QUATRO cores e não oito: separar oito custaria
 * três vezes a presença — ver o comentário em `globals.css`.
 *
 * Lê o `globals.css` de verdade, e não uma cópia dos valores: assim a medição não envelhece
 * em silêncio se alguém trocar uma cor lá.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deltaE2000, deltaE2000Rgb, compor } from "./_deltaE.mjs";

const raiz = path.resolve(fileURLToPath(import.meta.url), "../../..");
const css = fs.readFileSync(path.join(raiz, "client-new-kpi/app/globals.css"), "utf8");

/** A superfície sob o cabeçalho em cada tema — `--surface-1`, lido da aplicação. */
const FUNDO = { escuro: [12, 18, 32], claro: [255, 255, 255] };

const ENTRE_FAIXAS = 10;
const ATE_O_FUNDO = 16;

let n = 0;
let falhas = 0;
const ok = (condicao, oque) => {
  n++;
  if (!condicao) {
    falhas++;
    console.log(`  ✗ ${oque}`);
  }
};

// ── 1. a métrica está correta? ───────────────────────────────────────────────
//
// Sem isto, o resto do arquivo mede com uma régua torta — e foi assim que a primeira
// calibragem aprovou duas cores indistinguíveis.
console.log("A FÓRMULA, CONTRA OS CASOS DE SHARMA, WU E DALAL (2005)");
const REFERENCIA = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
  [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0],
  [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, -1, 2], [50, 0, 0], 2.3669],
  [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];
for (const [lab1, lab2, esperado] of REFERENCIA) {
  const achou = deltaE2000(lab1, lab2);
  ok(Math.abs(achou - esperado) < 0.0002, `ΔE2000 esperado ${esperado}, achou ${achou.toFixed(4)}`);
}
console.log(`  ${REFERENCIA.length} casos conferidos`);

// ── 2. as faixas do CSS ──────────────────────────────────────────────────────
function faixasDoCss(tema) {
  const faixas = [];
  for (let i = 1; ; i++) {
    const prefixo = tema === "claro" ? 'html\\[data-tema="claro"\\] ' : "";
    const re = new RegExp(
      `\n${prefixo}\\.tabela-rolagem thead th\\.faixa-mes-${i}\\s*\\{[^}]*rgb\\(([\\d\\s]+)\\s*/\\s*([\\d.]+)\\)`,
    );
    const m = css.match(re);
    if (!m) break;
    const [r, g, b] = m[1].trim().split(/\s+/).map(Number);
    faixas.push(compor([r, g, b], Number(m[2]), FUNDO[tema]));
  }
  if (faixas.length === 0) throw new Error(`nenhuma faixa do tema ${tema} encontrada no globals.css`);
  return faixas;
}

// As duas famílias precisam ter a MESMA quantidade: uma classe que existe num tema e não no
// outro deixa a coluna sem faixa nenhuma, e ninguém repara até abrir no tema errado.
const noEscuro = faixasDoCss("escuro");
const noClaro = faixasDoCss("claro");
ok(noEscuro.length === noClaro.length, `os temas têm ${noEscuro.length} e ${noClaro.length} faixas`);

for (const tema of ["escuro", "claro"]) {
  const fundo = FUNDO[tema];
  const faixas = tema === "escuro" ? noEscuro : noClaro;

  console.log(`\nTEMA ${tema.toUpperCase()}  ·  ${faixas.length} faixas  ·  fundo rgb(${fundo.join(" ")})`);
  console.log("  faixa  cor composta       presença");

  faixas.forEach((cor, i) => {
    const presenca = deltaE2000Rgb(cor, fundo);
    ok(presenca <= ATE_O_FUNDO, `${tema} faixa ${i + 1}: presença ${presenca.toFixed(1)} passa de ${ATE_O_FUNDO}`);
    console.log(`  ${i + 1}      rgb(${cor.join(" ").padEnd(11)})  ${presenca.toFixed(1).padStart(7)}`);
  });

  // TODOS os pares, não só os vizinhos: com quatro colunas na tela, qualquer par pode
  // acabar sendo comparado pelo olho.
  let pior = { d: Infinity, par: "" };
  for (let i = 0; i < faixas.length; i++) {
    for (let j = i + 1; j < faixas.length; j++) {
      const d = deltaE2000Rgb(faixas[i], faixas[j]);
      if (d < pior.d) pior = { d, par: `${i + 1} e ${j + 1}` };
    }
  }
  ok(pior.d >= ENTRE_FAIXAS, `${tema}: par ${pior.par} separado por ${pior.d.toFixed(1)}, mínimo ${ENTRE_FAIXAS}`);
  console.log(`  par mais parecido: ${pior.par}, ΔE2000 ${pior.d.toFixed(1)}`);
}

// ── 3. o realce da linha sob o ponteiro ──────────────────────────────────────
//
// Percorrer uma tabela de vinte colunas é seguir uma linha até o fim sem perder de vista
// de que conta ela é. O realce precisa aparecer sobre os TRÊS fundos que a tabela tem —
// linha comum, linha zebrada e totalizadora, esta última com a mesma cor do bloco de
// total — e em cada combinação de tema com modo de leitura.
//
// **Duas regressões já aconteceram aqui, e as duas passavam por tela funcionando:**
// o realce pintava `background-color` com a MESMA cor das totalizadoras (invisível nelas
// e nas células do bloco de total, que têm fundo próprio); e o token ficou definido só
// onde `--zebra` é redefinido, de modo que o tema claro sem leitura ampliada herdava o
// realce do tema escuro — branco sobre branco.
console.log("\nREALCE DA LINHA SOB O PONTEIRO");

const PERCEPTIVEL = 3;
const DISCRETO = 8;

/** Os quatro estados que a tela pode ter, com o seletor que define o realce em cada um. */
const ESTADOS = [
  { nome: "escuro · padrão", seletor: ":root", fundo: [12, 18, 32], zebra: null, surface2: [16, 24, 40] },
  { nome: "escuro · ampliada", seletor: 'html\\[data-leitura="ampliada"\\]', fundo: [12, 18, 32], zebra: [255, 255, 255, 0.022], surface2: [16, 24, 40] },
  { nome: "claro · padrão", seletor: 'html\\[data-tema="claro"\\]', fundo: [255, 255, 255], zebra: null, surface2: [241, 245, 249] },
  { nome: "claro · ampliada", seletor: 'html\\[data-tema="claro"\\]\\[data-leitura="ampliada"\\]', fundo: [255, 255, 255], zebra: [15, 23, 42, 0.03], surface2: [241, 245, 249] },
];

/** O valor de `--realce-linha` que vale num estado: o último definido até o bloco dele. */
function realceDe(seletor) {
  const bloco = new RegExp(`\\n${seletor} \\{([\\s\\S]*?)\\n\\}`);
  const m = css.match(bloco);
  if (!m) throw new Error(`bloco ${seletor} não encontrado no globals.css`);

  const token = m[1].match(/--realce-linha:\s*rgb\(([\d\s]+)\s*\/\s*([\d.]+)\)/);
  if (!token) return null; // herda de quem veio antes

  const [r, g, b] = token[1].trim().split(/\s+/).map(Number);
  return { rgb: [r, g, b], alpha: Number(token[2]) };
}

// A herança em cascata: um estado sem token próprio usa o do estado anterior. É
// exatamente assim que o navegador resolve, e foi assim que o claro herdou o branco.
let herdado = null;
for (const estado of ESTADOS) {
  const proprio = realceDe(estado.seletor);
  const realce = proprio ?? herdado;
  if (proprio) herdado = proprio;

  ok(realce !== null, `${estado.nome}: nenhum realce definido nem herdado`);
  if (!realce) continue;

  const fundos = {
    "linha comum": estado.fundo,
    "totalizadora / total": estado.surface2,
  };
  if (estado.zebra) {
    fundos["linha zebrada"] = compor(estado.zebra.slice(0, 3), estado.zebra[3], estado.fundo);
  }

  const medidas = Object.entries(fundos).map(([nome, fundo]) => {
    const realcado = compor(realce.rgb, realce.alpha, fundo);
    const d = deltaE2000Rgb(realcado, fundo);
    ok(d >= PERCEPTIVEL, `${estado.nome} / ${nome}: realce de ΔE ${d.toFixed(1)}, mínimo ${PERCEPTIVEL}`);
    ok(d <= DISCRETO, `${estado.nome} / ${nome}: realce de ΔE ${d.toFixed(1)}, máximo ${DISCRETO}`);
    return `${nome} ${d.toFixed(1)}`;
  });

  console.log(`  ${estado.nome.padEnd(18)} ${medidas.join("   ")}`);
}

console.log(
  falhas === 0
    ? `\n✓ dc25: ${n}/${n} conferências passaram.`
    : `\n✗ dc25: ${falhas} de ${n} falharam.`,
);
process.exitCode = falhas === 0 ? 0 : 1;
