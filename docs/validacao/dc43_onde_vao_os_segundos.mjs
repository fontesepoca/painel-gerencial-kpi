/**
 * dc43 — Onde vão os segundos de uma apuração.
 *
 * A dc41 mediu o total: três meses com todas as filiais custam 173 s. Este script abre esse
 * número. A pergunta veio do Gabriel em 17/09/2026, depois de ligar a compressão e não sentir
 * diferença nenhuma — o que era esperado, porque 122 KB não custam nada perto de 173 s.
 *
 * <b>Nenhum código foi instrumentado para isto.</b> O controller já expõe cada etapa como rota
 * própria — `/estrutura`, `/despesas`, `/faturamento` —, que existem desde a fase 4 para
 * conferência contra a 9815. Medir por fora custa uma chamada HTTP a mais por etapa e não
 * deixa cronômetro nenhum no caminho de produção.
 *
 * O que a apuração faz, em ordem (ver `DreGerencialService.ApurarAsync`):
 *
 *   1. estrutura     uma consulta, sobre o período inteiro
 *   2. despesas      uma consulta por recorte
 *   3. faturamento   uma consulta por recorte, DEPOIS das despesas
 *
 * No modo mensal existe **um recorte só**, então o `Task.WhenAll` do serviço não paraleliza
 * coisa alguma: as etapas 2 e 3 acontecem em sequência. O paralelismo que a dc18 e a dc19
 * mediram é entre recortes, e só o modo `anos` tem mais de um.
 *
 * <b>Duas passadas.</b> A primeira paga o cache frio do Oracle; a segunda mostra o que sobra
 * quando os blocos já estão no buffer. A diferença entre as duas é informação: uma etapa que
 * não melhora na segunda passada está limitada por CPU ou por plano de execução, não por I/O.
 *
 * Não mede valor apurado. Os totais aparecem só para provar que cada etapa devolveu algo.
 *
 * USO
 *   node docs/validacao/dc43_onde_vao_os_segundos.mjs
 *   INICIO=2026-03-01 FIM=2026-05-31 node docs/validacao/dc43_onde_vao_os_segundos.mjs
 */
import http from "node:http";

const API = process.env.API ?? "http://localhost:5207";
const INICIO = process.env.INICIO ?? "2026-06-01";
const FIM = process.env.FIM ?? "2026-08-31";

const seg = (s) => `${s.toFixed(1)} s`;
const pct = (parte, todo) => `${((parte / todo) * 100).toFixed(1)}%`;

function postar(caminho, corpo) {
  const { hostname, port } = new URL(API);
  const dados = JSON.stringify(corpo);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port,
        path: caminho,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(dados),
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const pedacos = [];
        res.on("data", (p) => pedacos.push(p));
        res.on("end", () => {
          const texto = Buffer.concat(pedacos).toString("utf8");
          try {
            resolve({ status: res.statusCode, json: JSON.parse(texto), bytes: texto.length });
          } catch {
            reject(new Error(`HTTP ${res.statusCode}, resposta não é JSON: ${texto.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(0);
    req.end(dados);
  });
}

async function cronometrar(caminho, corpo) {
  const antes = process.hrtime.bigint();
  const r = await postar(caminho, corpo);
  const s = Number(process.hrtime.bigint() - antes) / 1e9;

  if (r.status !== 200 || r.json.sucesso === false) {
    throw new Error(`${caminho}: ${r.json?.erros?.[0] ?? r.json?.mensagem ?? `HTTP ${r.status}`}`);
  }
  return { s, linhas: Array.isArray(r.json.dados) ? r.json.dados.length : null, dados: r.json.dados };
}

const filiaisResposta = await fetch(`${API}/api/dre-gerencial/filiais`).then((r) => r.json());
const filiais = filiaisResposta.dados.map((f) => f.codFilial);

const filtro = {
  filiais,
  dataInicio: INICIO,
  dataFim: FIM,
  regime: "caixa",
  analise: "ccusto-principal",
};

console.log(`API: ${API}`);
console.log(`Filiais (${filiais.length}): ${filiais.join(", ")}`);
console.log(`Período: ${INICIO} a ${FIM}\n`);

const ETAPAS = [
  ["estrutura", "/api/dre-gerencial/estrutura"],
  ["despesas", "/api/dre-gerencial/despesas"],
  ["faturamento", "/api/dre-gerencial/faturamento"],
];

async function passada(rotulo) {
  console.log(`── ${rotulo} ${"─".repeat(Math.max(0, 46 - rotulo.length))}`);

  const tempos = {};
  for (const [nome, caminho] of ETAPAS) {
    const r = await cronometrar(caminho, filtro);
    tempos[nome] = r.s;
    console.log(`  ${nome.padEnd(14)} ${seg(r.s).padStart(9)}   ${r.linhas} linhas`);
  }

  const soma = Object.values(tempos).reduce((a, b) => a + b, 0);
  console.log(`  ${"soma".padEnd(14)} ${seg(soma).padStart(9)}`);

  for (const [nome, s] of Object.entries(tempos)) {
    console.log(`     ${nome.padEnd(13)} ${pct(s, soma).padStart(6)} do tempo`);
  }

  console.log();
  return { tempos, soma };
}

const frio = await passada("PRIMEIRA PASSADA — cache frio");

const apuracao = await cronometrar("/api/dre-gerencial/apuracao", filtro);
console.log(`── APURAÇÃO COMPLETA ──────────────────────────`);
console.log(`  ponta a ponta  ${seg(apuracao.s).padStart(9)}`);
console.log(`  a API mediu    ${seg(apuracao.dados.duracaoMs / 1000).padStart(9)}`);
console.log(`  soma das etapas medidas em separado, no frio: ${seg(frio.soma)}`);
console.log();

const quente = await passada("SEGUNDA PASSADA — o que o cache não resolve");

console.log("── O QUE MELHOROU COM O CACHE ─────────────────");
for (const [nome] of ETAPAS) {
  const f = frio.tempos[nome];
  const q = quente.tempos[nome];
  const ganho = f > 0 ? (1 - q / f) * 100 : 0;
  console.log(
    `  ${nome.padEnd(14)} ${seg(f).padStart(9)} → ${seg(q).padStart(9)}   ${
      ganho >= 5 ? `${ganho.toFixed(0)}% mais rápido` : "praticamente igual"
    }`,
  );
}
