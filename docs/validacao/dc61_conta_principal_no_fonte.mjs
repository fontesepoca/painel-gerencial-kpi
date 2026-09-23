// dc61 — A regra da CONTA PRINCIPAL é a mesma nos onze lugares do fonte.
//
// POR QUE ESTE TESTE EXISTE
//   O agrupamento do centro de custo aparece em onze pontos: nove na apuração e dois no
//   detalhamento. Se a apuração e o detalhamento discordarem, o duplo clique passa a recortar
//   por uma chave diferente da que somou a linha — e o total deixa de fechar SEM NADA QUEBRAR.
//   Nenhum erro, nenhuma exceção: só um número diferente numa tela que ninguém confere todo
//   dia.
//
//   É o mesmo risco que o comentário de `ColunaDoRecorte` já apontava, agora medido em vez de
//   confiado à memória de quem editar o arquivo.
//
// O QUE ELE NÃO FAZ
//   Não toca no banco e não prova que a regra está CERTA — prova que ela é ÚNICA. Que o
//   resultado bate com a 9815 é assunto da dc34 e da dc62.
//
//   node docs/validacao/dc61_conta_principal_no_fonte.mjs

import fs from 'node:fs';

const APURACAO = 'api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs';
const DETALHE = 'api-new-kpi/Infrastructure/Persistence/Queries/DreDetalheQueries.cs';

let falhas = 0;
const afirmar = (ok, texto, detalhe = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${texto}${detalhe ? '   ' + detalhe : ''}`);
  if (!ok) falhas++;
};

const ler = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const apuracao = ler(APURACAO);
const detalhe = ler(DETALHE);
const tudo = apuracao + '\n' + detalhe;

console.log('\n══ dc61 — a conta principal no fonte ══\n');

// ── 1. A expressão do pai, contada ──────────────────────────────────────────
// `SUBSTR(x, 1, INSTR(x || '.', '.') - 1)` — o `'.'` concatenado é o que faz a expressão
// servir para centro COM e SEM ponto. Sem ele, um código sem ponto daria INSTR = 0 e
// SUBSTR(x,1,-1), que é string vazia: a linha sumiria do DRE em silêncio.
// O `cc\.` ancora a busca nas JUNÇÕES e deixa de fora a mesma expressão citada no comentário
// de `EstruturaCCustoPrincipal` — documentação não é código, e contá-la mascararia um bloco
// que tivesse ficado para trás.
const PAI = /SUBSTR\((NVL\(cc\.\w+,'99'\)|cc\.\w+), 1, INSTR\(\1 \|\| '\.', '\.'\) - 1\)/g;
const juncoes = [...tudo.matchAll(PAI)];

// A invariante, em vez de um número decorado: TODO bloco que declara a subconsulta `CCPrinc`
// precisa de exatamente uma junção pelo pai. Um bloco a mais de um lado é um bloco esquecido
// do outro — e são onze porque há uma combinação por dimensão e por regime.
const SUBCONSULTA_CONTA = /select\s+CodigoCentroCusto\s+as\s+codccprinc/gi;
const blocos = (tudo.match(SUBCONSULTA_CONTA) ?? []).length;

afirmar(juncoes.length === blocos,
  'cada bloco que declara CCPrinc tem uma junção pela conta principal',
  `${blocos} blocos · ${juncoes.length} junções`);
afirmar(blocos === 11, 'e são os onze blocos esperados', `achei ${blocos}`);

// ── 2. Nenhum resquício do agrupamento antigo ───────────────────────────────
// O `SUBSTR(...,1,2)` contra `CCPrinc.codccprinc` é a regra dos dois dígitos. Uma sobra dela
// significa um bloco que ficou para trás — e blocos são por dimensão e por regime, então a
// sobra apareceria só numa combinação de filtros.
const DOIS_DIGITOS = /SUBSTR\([^)]*\),?1,2\)\s*=\s*CCPrinc\.codccprinc/gi;
afirmar((tudo.match(DOIS_DIGITOS) ?? []).length === 0,
  'nenhum bloco ainda agrupa pelos dois primeiros dígitos');

// O `min(codigocentrocusto)` era o rótulo do grupo antigo.
afirmar(!/min\(\s*codigocentrocusto\s*\)\s*as\s+CodPrinc/i.test(tudo),
  'o rótulo não vem mais do min() do grupo');

// ── 3. A subconsulta CCPrinc é a mesma nos onze blocos ──────────────────────
// Normalizo espaços e caixa antes de comparar: o arquivo tem indentações diferentes por
// bloco, e duas grafias de `CodigoCentroCusto`. O que precisa ser idêntico é a REGRA.
const SUB = /select\s+CodigoCentroCusto\s+as\s+codccprinc,\s*DESCRICAO\s+as\s+DescCCPrinc\s*from\s+PCCENTROCUSTO\s+where\s+CodigoCentroCusto\s+not\s+like\s+'%\.%'/gi;
const subs = [...tudo.matchAll(SUB)].map((m) => m[0].replace(/\s+/g, ' ').toLowerCase());

afirmar(subs.length === 11, 'a subconsulta CCPrinc aparece onze vezes', `achei ${subs.length}`);
afirmar(new Set(subs).size === 1, 'e as onze são a mesma regra',
  `variantes distintas: ${new Set(subs).size}`);

// ── 4. As duas pontas recortam pela mesma chave ─────────────────────────────
// `ColunaDoRecorte` é o que o detalhamento usa para achar os lançamentos da linha clicada.
// Em C. Custo Principal ela tem de ser o `codccprinc` — que agora é a conta principal.
afirmar(/"ccusto-principal"\s*=>\s*"NVL\(CODCCPRINC,'99'\)"/.test(detalhe),
  'o detalhamento recorta C. Custo Principal por CODCCPRINC');

// O `'99'` é o "NÃO USA/NÃO INFORMADO", e vem de um DUAL unido ao cadastro. Ele não tem ponto
// nem vira conta principal de ninguém: é chave sintética, e as duas pontas precisam do mesmo
// texto — `99` numérico convertido pelo Oracle já causou problema neste projeto.
//
// SÃO NOVE, E NÃO ONZE, de propósito: as duas consultas de ESTRUTURA de centro de custo
// montam o CCPrinc sem o `DUAL`, porque ali a lista serve para rotular centros que existem,
// e não para acolher lançamento sem centro. Já era assim antes desta mudança.
const noventaENove = (tudo.match(/'99' as codccprinc/gi) ?? []).length;
afirmar(noventaENove === 9, "o '99' sintético está nos nove blocos que o usam",
  `achei ${noventaENove}`);

// ── 5. O montador também fala a chave nova ──────────────────────────────────
// ESTA SEÇÃO EXISTE POR CAUSA DE UMA FALHA REAL. A primeira versão deste teste olhava só as
// consultas, e o montador ficou com as chaves antigas de dois dígitos — `97|NSS` para a
// indenização e `96|NSS`/`90|NSS` para os créditos promovidos.
//
// O sintoma: nada quebrou. As identidades simplesmente deixaram de casar, a indenização
// voltou a somar, e o LUCRO LIQUIDO de C. Custo Principal subiu 177.168,06 em relação às
// outras duas dimensões. Quem percebeu foi a dc34, que compara as três.
//
// A lição é a que a seção 1 já dizia por outro caminho: a chave da dimensão vive em mais
// lugares do que o arquivo onde ela é montada.
const montador = ler('api-new-kpi/Application/Features/DreGerencial/MontadorDre.cs');

// Uma identidade é `<chave>|<AntesRo><AntesLl><AntesLf>` — ver `Identidade`. Em C. Custo
// Principal a chave é a conta principal, e nenhuma delas tem dois dígitos.
const IDENTIDADES = /"(\d+)\|[NS]{3}"/g;
const curtas = [...montador.matchAll(IDENTIDADES)]
  .map((m) => m[1])
  .filter((k) => k.length <= 2);

afirmar(curtas.length === 0,
  'o montador não tem identidade de centro com dois dígitos',
  curtas.length ? `sobrou: ${curtas.join(', ')}` : '');

// As três que a mudança tocou, conferidas pelo nome do centro no cadastro.
for (const [chave, nome] of [['9601', 'RATEIO DESP. CORPORATIVAS'],
                             ['9001', 'VERBAS MARGEM'],
                             ['9701', 'INDENIZACAO DE MERC. VENC. E AVARIA']]) {
  afirmar(montador.includes(`"${chave}|NSS"`), `${chave} (${nome}) está no montador`);
}

console.log(falhas === 0
  ? '\n  a regra é única nos onze lugares, e o montador fala a mesma chave\n'
  : `\n  ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
