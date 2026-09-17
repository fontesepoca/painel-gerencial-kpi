/**
 * dc41 — Três meses, todas as filiais: o cenário que nunca foi apurado.
 *
 * Está na tabela de riscos do CLAUDE.md desde a fase 5 como "nunca apurado; risco de custo,
 * não de valor". A pergunta voltou por outro caminho: se as chamadas do DRE passarem a
 * atravessar o BFF, o Next vira o cano por onde esta resposta inteira precisa caber.
 *
 * Por isso a medição tem DUAS pontas, e nenhuma delas é o valor apurado:
 *
 *   TEMPO   — quanto o usuário espera, e se isso passa dos 300 s que o `fetch` do Node
 *             concede por padrão (`headersTimeout` do undici). Se passar, um proxy ingênuo
 *             no Next mata a requisição antes de a API responder.
 *
 *   TAMANHO — quantos bytes a resposta tem. É o que decide se o proxy pode desserializar o
 *             corpo (simples, e dobra a memória) ou precisa repassar o stream cru.
 *
 * O tamanho é medido nos bytes que chegam pelo socket, ANTES de virar objeto: é o número que
 * o Node teria de segurar, não o que o `JSON.stringify` devolveria depois.
 *
 * <b>Isto mede custo, não correção.</b> Nenhum valor daqui foi conferido contra a 9815 — o
 * script imprime o LUCRO LIQUIDO só para provar que a apuração de fato aconteceu.
 *
 * USO
 *   node docs/validacao/dc41_tres_meses_todas_as_filiais.mjs
 *   API=http://localhost:5207 node docs/validacao/dc41_tres_meses_todas_as_filiais.mjs
 */
import http from "node:http";
import { gzipSync } from "node:zlib";

const API = process.env.API ?? "http://localhost:5207";

const INICIO = process.env.INICIO ?? "2026-06-01";
const FIM = process.env.FIM ?? "2026-08-31";

/** O teto que o undici impõe ao `fetch` do lado servidor, em segundos. */
const TETO_DO_UNDICI = 300;

const dinheiro = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tempo = (s) => `${(s / 60).toFixed(1)} min (${s.toFixed(1)} s)`;
const tamanho = (b) =>
  b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

/**
 * POST que devolve os bytes crus, sem relógio.
 *
 * Não é o `_postar.mjs` porque aquele já entrega o objeto parseado, e aqui o que interessa é
 * justamente o peso do que trafega. `setTimeout(0)` desliga o teto do socket — este cenário
 * pode passar de cinco minutos, e é essa a informação que se quer.
 */
function postarCru(url, corpo) {
  const { hostname, port, pathname } = new URL(url);
  const dados = JSON.stringify(corpo);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(dados),
          // Sem compressão: queremos o tamanho que a API produz, não o que a rede entrega.
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const pedacos = [];
        res.on("data", (p) => pedacos.push(p));
        res.on("end", () =>
          resolve({ status: res.statusCode, bytes: Buffer.concat(pedacos) }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(0);
    req.end(dados);
  });
}

const filiaisResposta = await fetch(`${API}/api/dre-gerencial/filiais`).then((r) => r.json());
if (!filiaisResposta.sucesso) {
  console.error("Não consegui listar as filiais. A API está no ar?");
  process.exit(1);
}
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
console.log(`Período: ${INICIO} a ${FIM}`);
console.log(`\nApurando. Isto demora — cache frio, nada aquecido de propósito.\n`);

const antes = process.hrtime.bigint();
const { status, bytes } = await postarCru(`${API}/api/dre-gerencial/apuracao`, filtro);
const parede = Number(process.hrtime.bigint() - antes) / 1e9;

if (status !== 200) {
  console.error(`HTTP ${status}: ${bytes.toString("utf8").slice(0, 400)}`);
  process.exit(1);
}

const antesDoParse = process.hrtime.bigint();
const json = JSON.parse(bytes.toString("utf8"));
const parse = Number(process.hrtime.bigint() - antesDoParse) / 1e9;

if (!json.sucesso) {
  console.error(`A apuração falhou: ${json.erros?.[0] ?? json.mensagem}`);
  process.exit(1);
}

const d = json.dados;
const comprimido = gzipSync(bytes).length;

console.log("── TEMPO ──────────────────────────────────────────────");
console.log(`  a API diz que levou:        ${tempo(d.duracaoMs / 1000)}`);
console.log(`  de parede, com a rede:      ${tempo(parede)}`);
console.log(`  só para virar objeto:       ${parse.toFixed(2)} s`);
console.log(
  `\n  teto do fetch do Node:      ${TETO_DO_UNDICI} s  →  ${
    parede > TETO_DO_UNDICI
      ? "ESTOURA. Um proxy no Next mataria esta requisição."
      : "cabe, com folga de " + (TETO_DO_UNDICI - parede).toFixed(0) + " s"
  }`,
);

console.log("\n── TAMANHO ────────────────────────────────────────────");
console.log(`  resposta crua:              ${tamanho(bytes.length)}`);
console.log(`  se comprimida (gzip):       ${tamanho(comprimido)}`);
console.log(`  linhas × colunas:           ${d.linhas.length} × ${d.periodos.length}`);

console.log("\n── PROVA DE QUE APUROU ────────────────────────────────");

// Pelo `papel`, e não pelo rótulo: o texto em português é justamente o que a API passou a
// codificar para o front não precisar reconhecer linha por string.
for (const papel of ["receitas-liquidas", "lucro-bruto", "lucro-liquido"]) {
  const l = d.linhas.find((x) => x.papel === papel);
  if (l) console.log(`  ${l.descricao.trim().padEnd(24)} ${dinheiro(l.total.valor).padStart(20)}`);
  else console.log(`  ${papel.padEnd(24)} (não veio)`);
}

d.periodos.forEach((p) => console.log(`  coluna: ${p.rotulo}  ${p.dataInicio} a ${p.dataFim}`));
