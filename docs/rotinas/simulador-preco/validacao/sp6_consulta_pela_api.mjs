// ============================================================================
// sp6: a consulta do simulador, pela API, com a sessão de quem roda
//
// O primeiro contato do SQL v1 com o banco. Mede o tempo, conta linhas e produtos
// (mais linhas que produtos é a duplicação por NCM da sp2) e procura COLUNA QUE
// VEIO SEMPRE NULA OU ZERO. Esse é o sinal de alias que o Dapper não casou, a
// armadilha 4 do DIVERGENCIAS.md da 9815, que falha sem erro nenhum.
//
// Grava a resposta inteira em JSON: é a entrada da prova do recálculo da tela.
// A credencial vem do ambiente e nunca é impressa:
//
//   node --env-file=.env.validacao \
//     --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs \
//     docs/rotinas/simulador-preco/validacao/sp6_consulta_pela_api.mjs <filial> <regiao> [fornecedor]
// ============================================================================
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postar } from "../../9815-dre-gerencial/validacao/_postar.mjs";

const API = process.env.API ?? "http://localhost:5207";
const [codFilial, regiao, fornecedor] = process.argv.slice(2);

if (!codFilial || !regiao) {
  console.error("Uso: sp6_consulta_pela_api.mjs <filial> <regiao> [fornecedor]");
  process.exit(2);
}

const filtro = {
  codFilial,
  numRegiao: Number(regiao),
  codFornec: fornecedor ? Number(fornecedor) : null,
};

const inicio = Date.now();
// O `postar` devolve o envelope já lido: { sucesso, dados, mensagem, erros }.
const corpo = await postar(`${API}/api/simulador-preco/consulta`, filtro);
const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

if (!corpo?.sucesso) {
  console.error(`Falhou em ${segundos} s:`, corpo?.mensagem, corpo?.erros ?? "");
  process.exit(1);
}

const produtos = corpo.dados.produtos;
const distintos = new Set(produtos.map((p) => p.codProd)).size;

console.log(`Base: ${corpo.dados.base?.rotulo} · filial ${codFilial} · região ${regiao}` +
  (fornecedor ? ` · fornecedor ${fornecedor}` : ""));
console.log(`Tempo: ${segundos} s · linhas: ${produtos.length} · produtos distintos: ${distintos}`);
if (produtos.length > distintos) {
  console.log(`  ATENÇÃO: ${produtos.length - distintos} linha(s) repetida(s). É a duplicação por NCM (sp2)`);
}

// Coluna sempre nula ou sempre zero: ou o dado é assim mesmo, ou o alias não casou.
if (produtos.length > 0) {
  const suspeitas = Object.keys(produtos[0]).filter((c) =>
    produtos.every((p) => p[c] === null || p[c] === 0 || p[c] === ""),
  );
  console.log(suspeitas.length === 0
    ? "Nenhuma coluna sempre nula ou zero."
    : `Sempre nulas ou zero (confira se é o dado ou o mapeamento): ${suspeitas.join(", ")}`);
  console.log("\nPrimeira linha:", produtos[0]);
}

const arquivo = join(tmpdir(), `sp6_${codFilial}_${regiao}${fornecedor ? "_" + fornecedor : ""}.json`);
writeFileSync(arquivo, JSON.stringify(corpo.dados, null, 2));
console.log(`\nResposta gravada em ${arquivo}`);
