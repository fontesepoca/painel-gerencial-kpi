/**
 * dc51 — O paralelismo pela API, do jeito que o usuário sente. Inclusive na apuração pequena.
 *
 * ── A ARMADILHA QUE ESTE SCRIPT EXISTE PARA EVITAR ──
 *
 * A primeira versão comparava ligado contra desligado rodando um depois do outro, e o segundo
 * herdava todo o cache que o primeiro aqueceu. O resultado saiu invertido: três meses com nove
 * filiais em 18,3 s, quando de manhã a mesma apuração levara 173 s. Não foi a otimização — foi
 * a consulta ter rodado vinte vezes ao longo do dia.
 *
 * É a MESMA armadilha da dc19 e da dc48. Ela volta porque é invisível: os números saem
 * plausíveis, só que respondendo outra pergunta.
 *
 * A correção: cada caso é AQUECIDO antes de medir, e o aquecimento é descartado. Assim os dois
 * estados partem de cache quente, que é a única condição que dá para igualar entre duas
 * execuções separadas por um reinício da API.
 *
 * ── O QUE ISTO MEDE, E O QUE NÃO MEDE ──
 *
 * MEDE: se o paralelismo ajuda ou atrapalha quando os dados já estão em memória. É a condição
 * de quem abre o DRE pela segunda vez, ou depois de um colega ter aberto.
 *
 * NÃO MEDE: o caso frio — a primeira apuração do dia, num período que ninguém consultou. Esse
 * é o caso que doía (173 s) e onde o ganho foi medido no banco: 70,3 s para 6,0 s (dc50).
 * Igualar cache frio entre duas execuções exigiria esvaziar o buffer do Oracle, o que é
 * privilégio de DBA e atingiria a operação inteira.
 *
 * Por isso os DOIS números importam, e nenhum sozinho decide: se aqui o paralelismo atrapalhar
 * e lá ajudar muito, a resposta não é desligar — é `MesesParaParalelizar`, que separa os dois
 * casos pelo tamanho do recorte.
 *
 * USO
 *   node docs/validacao/dc51_paralelismo_pela_api.mjs ligado
 *   node docs/validacao/dc51_paralelismo_pela_api.mjs desligado
 *
 * Entre os dois, troque `Oracle:GrauDeParalelismo` no appsettings.Development.json (4 e 0) e
 * REINICIE a API — a configuração é lida uma vez, no boot.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const API = process.env.API ?? "http://localhost:5207";
const ESTADO = (process.argv[2] ?? "").toLowerCase();

if (!["ligado", "desligado"].includes(ESTADO)) {
  console.error("Diga qual estado está sendo medido:\n" +
    "  node docs/validacao/dc51_paralelismo_pela_api.mjs ligado\n" +
    "  node docs/validacao/dc51_paralelismo_pela_api.mjs desligado");
  process.exit(1);
}

const ARQUIVO = path.join(process.env.TEMP ?? ".", "dc51_resultados.json");

/** Quantas medições valem por caso, além do aquecimento descartado. */
const MEDICOES = 3;

function postar(caminho, corpo) {
  const { hostname, port } = new URL(API);
  const dados = JSON.stringify(corpo);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname, port, path: caminho, method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(dados),
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const p = [];
        res.on("data", (c) => p.push(c));
        res.on("end", () => {
          const t = Buffer.concat(p).toString("utf8");
          try { resolve(JSON.parse(t)); }
          catch { reject(new Error(`HTTP ${res.statusCode}: ${t.slice(0, 200)}`)); }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(0);
    req.end(dados);
  });
}

async function apurar(filtro) {
  const antes = process.hrtime.bigint();
  const r = await postar("/api/dre-gerencial/apuracao", filtro);
  const s = Number(process.hrtime.bigint() - antes) / 1e9;
  if (!r.sucesso) throw new Error(r.erros?.[0] ?? r.mensagem ?? "falhou");
  return { s, dados: r.dados };
}

/** Mediana, e não média: uma execução que esbarrou em outra carga do banco não contamina. */
const mediana = (v) => {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

const filiaisResposta = await fetch(`${API}/api/dre-gerencial/filiais`).then((r) => r.json());
const todas = filiaisResposta.dados.map((f) => f.codFilial);

const base = { regime: "caixa", analise: "ccusto-principal" };

/**
 * Do menor ao maior. O PEQUENO vem primeiro de propósito: é o que corre risco de piorar com
 * paralelismo, e deixá-lo por último faria ele herdar o cache dos outros.
 */
const CASOS = [
  { nome: "1 mes, 1 filial", filtro: { ...base, filiais: ["7"], dataInicio: "2026-04-01", dataFim: "2026-04-30" } },
  { nome: "1 mes, 9 filiais", filtro: { ...base, filiais: todas, dataInicio: "2026-04-01", dataFim: "2026-04-30" } },
  { nome: "3 meses, 9 filiais", filtro: { ...base, filiais: todas, dataInicio: "2026-06-01", dataFim: "2026-08-31" } },
];

console.log(`API: ${API}`);
console.log(`Estado medido: PARALELISMO ${ESTADO.toUpperCase()}`);
console.log(`Cada caso: 1 aquecimento descartado + ${MEDICOES} medicoes, mediana.\n`);

const medidos = {};
const lucros = {};

for (const caso of CASOS) {
  // Aquecimento, descartado. É o que iguala a condição entre as duas execuções.
  await apurar(caso.filtro);

  const tempos = [];
  let lucro = null;

  for (let i = 0; i < MEDICOES; i++) {
    const r = await apurar(caso.filtro);
    tempos.push(r.s);
    lucro ??= r.dados.linhas.find((l) => l.papel === "lucro-liquido")?.total.valor ?? null;
  }

  medidos[caso.nome] = mediana(tempos);
  lucros[caso.nome] = lucro;

  console.log(
    `  ${caso.nome.padEnd(20)} ${mediana(tempos).toFixed(1).padStart(7)} s  ` +
    `[${tempos.map((t) => t.toFixed(1)).join("  ")}]` +
    (lucro !== null ? `   LL ${lucro.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""),
  );
}

let anteriores = {};
try { anteriores = JSON.parse(fs.readFileSync(ARQUIVO, "utf8")); } catch { /* primeira vez */ }

anteriores[ESTADO] = { tempos: medidos, lucros };
fs.writeFileSync(ARQUIVO, JSON.stringify(anteriores, null, 2));

if (anteriores.ligado?.tempos && anteriores.desligado?.tempos) {
  console.log("\n── COMPARACAO, com cache quente dos dois lados ────────────────");
  console.log(`  ${"caso".padEnd(20)} ${"desligado".padStart(11)} ${"ligado".padStart(11)}   efeito`);

  for (const caso of CASOS) {
    const d = anteriores.desligado.tempos[caso.nome];
    const l = anteriores.ligado.tempos[caso.nome];
    if (d === undefined || l === undefined) continue;

    const razao = d / l;
    const efeito =
      razao >= 1.2 ? `${razao.toFixed(1)}x mais rapido`
      : razao <= 0.85 ? `PIOROU ${(1 / razao).toFixed(1)}x`
      : "sem diferenca";

    console.log(
      `  ${caso.nome.padEnd(20)} ${d.toFixed(1).padStart(9)} s ${l.toFixed(1).padStart(9)} s   ${efeito}`,
    );
  }

  // Paralelismo divide trabalho, não muda aritmética. Se um centavo mudar, isto é defeito.
  console.log("\n── OS VALORES BATEM? ──────────────────────────────────────────");
  let divergiu = false;
  for (const caso of CASOS) {
    const d = anteriores.desligado.lucros?.[caso.nome];
    const l = anteriores.ligado.lucros?.[caso.nome];
    if (d == null || l == null) continue;

    const igual = Math.abs(d - l) < 0.005;
    if (!igual) divergiu = true;
    console.log(
      `  ${igual ? "ok   " : "DIVERGIU"} ${caso.nome.padEnd(20)} ` +
      `${d.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` +
      (igual ? "" : `  vs  ${l.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`),
    );
  }
  if (divergiu) {
    console.log("\n  DESLIGUE O PARALELISMO. Ele nao pode mudar um centavo; se mudou, e defeito.");
  }

  console.log(`\n  (resultados em ${ARQUIVO})`);
} else {
  console.log(`\n  Agora rode o outro estado. Falta: ${anteriores.ligado ? "desligado" : "ligado"}.`);
  console.log(`  Troque Oracle:GrauDeParalelismo no appsettings.Development.json e reinicie a API.`);
}
