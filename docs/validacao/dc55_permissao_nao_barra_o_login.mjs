/**
 * dc55 — Falta de permissão não barra o login, mas fecha a porta do DRE.
 *
 * A MUDANÇA, pedida pelo Gabriel em 18/09/2026:
 *
 *   ANTES  quem não tinha a 9815 lia "Você não tem acesso ao DRE Gerencial" na tela de login.
 *          Autenticava com sucesso e mesmo assim era tratado como quem errou a senha, numa
 *          tela onde a única ação possível era fechar a aba.
 *
 *   AGORA  entra normalmente. A tela inicial mostra o que ela pode abrir — que pode ser nada,
 *          e aí explica por quê e a quem pedir.
 *
 * <b>O que este script cobre e o que ele não cobre.</b> A regra de quem pode o quê vive no
 * banco, e conferi-la exige credenciais reais de duas pessoas diferentes — uma com a 9815 e
 * outra sem. Isso é o roteiro manual no fim do arquivo, e só o Gabriel pode rodá-lo.
 *
 * Aqui fica a parte que não depende de ninguém: a lógica de decisão, e a garantia de que os
 * dois lados falam o mesmo código de rotina. Um `"9815 "` com espaço de um lado passaria
 * despercebido em qualquer teste de tela.
 *
 * USO
 *   node docs/validacao/dc55_permissao_nao_barra_o_login.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let passou = 0;
let falhou = 0;

function conferir(afirmacao, condicao, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  ok    ${afirmacao}${detalhe ? `  (${detalhe})` : ""}`);
  } else {
    falhou++;
    console.log(`  FALHA ${afirmacao}${detalhe ? `  (${detalhe})` : ""}`);
  }
}

// ── 1. Os dois lados usam o mesmo código ──────────────────────────────────
console.log("O código da rotina, nos dois lados");

const rotinasCs = fs.readFileSync(
  path.join(raiz, "api-new-kpi/Application/Features/Autenticacao/RotinasDoWinthor.cs"),
  "utf8",
);
const rotinasTs = fs.readFileSync(path.join(raiz, "client-new-kpi/lib/rotinas.ts"), "utf8");

const codigoNaApi = rotinasCs.match(/DreGerencial\s*=\s*"([^"]+)"/)?.[1];
const codigoNoFront = rotinasTs.match(/ROTINA_DRE\s*=\s*"([^"]+)"/)?.[1];

conferir("a API declara o código", codigoNaApi !== undefined, codigoNaApi);
conferir("o front declara o código", codigoNoFront !== undefined, codigoNoFront);
conferir("os dois são idênticos, byte a byte", codigoNaApi === codigoNoFront);

// ── 2. A decisão de quem abre o quê ───────────────────────────────────────
// Reimplementa `podeAbrir` em vez de importar: o arquivo do front é TypeScript com alias de
// caminho, e puxá-lo daqui exigiria um compilador no meio. A função é de três linhas, e o que
// interessa é a TABELA DE CASOS abaixo — ela é que documenta a regra.
const podeAbrir = (rotinas, codigo) => rotinas?.includes(codigo) ?? false;

console.log("\nQuem abre o DRE");

const DRE = codigoNoFront ?? "9815";

conferir("com a rotina na lista, abre", podeAbrir([DRE], DRE));
conferir("com outras rotinas mas sem a 9815, não abre", !podeAbrir(["9999"], DRE));
conferir("com a lista vazia, não abre", !podeAbrir([], DRE));
conferir(
  "com a lista AUSENTE, não abre — é o caso da sessão antiga",
  !podeAbrir(undefined, DRE),
);

// ── 3. O portão da rota existe e é de servidor ────────────────────────────
console.log("\nO bloqueio da rota");

const layout = path.join(raiz, "client-new-kpi/app/dre-gerencial/layout.tsx");
const existe = fs.existsSync(layout);
conferir("existe um layout no caminho do DRE", existe);

if (existe) {
  const conteudo = fs.readFileSync(layout, "utf8");

  // `use client` é DIRETIVA: só conta na primeira instrução do arquivo. Procurar a string
  // no texto inteiro acusa qualquer comentário que a mencione — e o layout menciona, para
  // explicar por que ele existe. A pergunta certa é se o arquivo COMEÇA com ela.
  const primeiraInstrucao = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(
      (l) =>
        l.length > 0 &&
        !l.startsWith("//") &&
        !l.startsWith("*") &&
        !l.startsWith("/*"),
    );

  conferir(
    "NÃO é componente de cliente — permissão não se decide no navegador",
    primeiraInstrucao !== undefined && !primeiraInstrucao.includes("use client"),
    primeiraInstrucao,
  );
  conferir("lê a sessão de verdade, não só o cookie", conteudo.includes("lerSessaoPublica"));
  conferir("redireciona quem não pode", conteudo.includes("redirect"));
  conferir("usa a constante, não a string solta", conteudo.includes("ROTINA_DRE"));
}

// ── 4. O login não recusa mais por permissão ──────────────────────────────
console.log("\nO login");

const servico = fs.readFileSync(
  path.join(raiz, "api-new-kpi/Application/Features/Autenticacao/AutenticacaoService.cs"),
  "utf8",
);

conferir(
  "o serviço não recusa mais por falta de permissão",
  !servico.includes("MotivoDaRecusa.SemPermissao"),
);
conferir(
  "e também não recusa por filial vazia",
  !servico.includes("nenhuma filial liberada no Winthor"),
);
conferir("mas continua recusando cadastro inativo", servico.includes("MotivoDaRecusa.CadastroInativo"));
conferir("e credenciais erradas", servico.includes("MotivoDaRecusa.Credenciais"));

const motivos = fs.readFileSync(
  path.join(raiz, "api-new-kpi/Application/Features/Autenticacao/MotivoDaRecusa.cs"),
  "utf8",
);
// A frase continua no arquivo, dentro do comentário que explica por que ela saiu — e deve
// continuar: é o registro de um comportamento que alguém pode tentar trazer de volta. O que
// precisa ter sumido é o MEMBRO do enum, que é o que fazia a recusa acontecer.
conferir(
  "o motivo SemPermissao não existe mais",
  !/^\s*SemPermissao\b/m.test(motivos),
);
conferir(
  "a frase só sobrevive como comentário",
  motivos
    .split(/\r?\n/)
    .filter((l) => l.includes("Você não tem acesso ao DRE Gerencial"))
    .every((l) => l.trim().startsWith("//")),
);

console.log(`\n${passou} asserções passaram, ${falhou} falharam.`);

console.log(`
── O QUE SÓ O GABRIEL PODE CONFERIR ───────────────────────────────────
Precisa de duas credenciais reais, e nenhuma senha aparece aqui.

COM a 9815 e guia 4-DRE:
  1. entra                      →  tela inicial com o cartão do DRE
  2. abre o DRE                 →  apura normalmente
  3. digita /dre-gerencial      →  entra

SEM a 9815, ou sem a guia 4-DRE, ou sem filial no PCLIB:
  4. entra                      →  ENTRA. Nada de "você não tem acesso" no login
  5. tela inicial               →  "Você ainda não tem nada por aqui", sem cartão
  6. digita /dre-gerencial      →  volta para a inicial, em silêncio
  7. o log da API               →  diz QUAL das três coisas faltou

O item 6 é o que mais importa: é a porta que alguém tentaria pela URL.

E o item 7 é o que a TI vai usar — a tela mostra as duas causas possíveis porque
quem lê não sabe qual é a sua, mas o log sabe.
`);

process.exit(falhou === 0 ? 0 : 1);
