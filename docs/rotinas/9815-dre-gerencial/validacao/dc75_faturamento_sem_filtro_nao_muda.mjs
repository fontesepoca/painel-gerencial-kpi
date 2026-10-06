// dc75 — Sem fornecedor selecionado, a consulta de faturamento é a MESMA de antes.
//
// O filtro por fornecedor entra na consulta mais cara da rotina — 92,5% de uma apuração — e
// entra por dentro, envolvendo onze expressões em `case when`. A pergunta que este script
// responde é a única que importa antes de qualquer medição contra a 9815:
//
//   QUEM NÃO USA O FILTRO CONTINUA RECEBENDO EXATAMENTE O QUE RECEBIA?
//
// Sem banco, sem API no ar, em menos de um segundo. Roda em qualquer máquina, e falha alto se
// alguém mexer na consulta de um jeito que mude o DRE de quem não pediu nada.
//
// Uso:
//   node docs/rotinas/9815-dre-gerencial/validacao/dc75_faturamento_sem_filtro_nao_muda.mjs [<commit de referência>]
//
// O padrão compara com a versão ANTERIOR ao filtro (o commit onde `{4}` ainda não existia).
//
// ═══════════════════════════════════════════════════════════════════════════
// COMO ELE PROVA
// ═══════════════════════════════════════════════════════════════════════════
//
// Sem filtro o repositório monta `{4}` e `{5}` como `1=1`, e cada coluna vira
//
//     SUM( case when 1=1 then <expressão> else 0 end )
//
// que é aritmeticamente `SUM( <expressão> )` — o otimizador do Oracle descarta o predicado
// constante. O script desfaz esses `case when` no texto e compara o resultado com o SQL
// antigo, ignorando comentários e espaços.
//
// O QUE ELE **NÃO** PROVA: que o PLANO DE EXECUÇÃO não mudou. Texto equivalente não é plano
// equivalente, e esta é justamente a consulta onde isso custa caro. Quem responde isso é a
// dc41, com a apuração de três meses e nove filiais cronometrada.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const QUERIES = 'api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs';
const REFERENCIA = process.argv[2] ?? '29b07a7';   // o último commit antes do filtro

/** O corpo da constante `FaturamentoPorMes`, entre as aspas triplas. */
function sqlDe(texto) {
  const s = texto.replace(/\r\n/g, '\n');
  const i = s.indexOf('public const string FaturamentoPorMes');
  if (i < 0) throw new Error('FaturamentoPorMes não encontrada');
  const ini = s.indexOf('"""', i) + 3;
  const fim = s.indexOf('"""', ini);
  return s.slice(ini, fim);
}

/**
 * Deixa só o que o Oracle vê: sem comentários, sem espaço repetido — e com os `case when 1=1`
 * desfeitos, que é o que o otimizador faz antes de montar o plano.
 *
 * O `[\s\S]` em vez de `.` com flag `s` é de propósito: o texto tem quebras de linha dentro
 * dos comentários, e um `.` sem a flag pararia na primeira.
 */
const normalizar = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/case when 1=1 then ([\s\S]*?) else 0 end/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

const antes = sqlDe(
  execFileSync('git', ['show', `${REFERENCIA}:${QUERIES}`], { encoding: 'utf8', maxBuffer: 1 << 24 }));
const agora = sqlDe(fs.readFileSync(QUERIES, 'utf8'))
  .replaceAll('{4}', '1=1')      // é assim que o repositório monta quando não há fornecedor
  .replaceAll('{5}', '1=1');

const a = normalizar(antes);
const b = normalizar(agora);

console.log(`\n══ dc75 — faturamento sem filtro, contra ${REFERENCIA} ══\n`);

// A coluna do denominador é a ÚNICA adição esperada no SELECT externo. Ela é aditiva: nenhuma
// coluna existente muda de expressão por causa dela.
const COLUNA_NOVA = 'Sum(NVL(VLVENDA_Total,0)) - Sum(NVL(VLDEVOLUCAO_total,0)) AS RECEITALIQUIDATOTAL';
const bSemColuna = b.replace(', ' + COLUNA_NOVA, '');

let falhas = 0;
const afirmar = (ok, texto, detalhe = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${texto}${detalhe ? '   ' + detalhe : ''}`);
  if (!ok) falhas++;
};

afirmar(b.includes(COLUNA_NOVA),
  'o denominador da participação está no SELECT externo');

afirmar(bSemColuna === a,
  'fora essa coluna, a consulta sem filtro é CARACTERE POR CARACTERE a de antes');

if (bSemColuna !== a) {
  // Mostra só a vizinhança da primeira divergência — o SQL inteiro tem 7 mil caracteres.
  const pa = a.split(' '), pb = bSemColuna.split(' ');
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  console.log('\n  primeira divergência, palavra ' + i + ':');
  console.log('    ANTES: ...' + pa.slice(Math.max(0, i - 8), i + 12).join(' ') + '...');
  console.log('    AGORA: ...' + pb.slice(Math.max(0, i - 8), i + 12).join(' ') + '...');
}

// O filtro tem de estar presente onde deve, e só onde deve. Onze é a conta: seis no bloco das
// vendas por item (custo, venda, tabela, ST, PIS, COFINS) e cinco no das devoluções
// (devolução, CMV, ST, PIS, COFINS). As colunas `_Total` NUNCA levam o filtro — são elas o
// denominador. Se este número mudar sem que o repositório mude junto, os binds saem fora de
// ordem, e binds fora de ordem no ODP.NET não dão erro: dão número errado.
const cru = sqlDe(fs.readFileSync(QUERIES, 'utf8'));
const vezes = (t, alvo) => t.split(alvo).length - 1;
afirmar(vezes(cru, '{4}') === 11,
  'o predicado do fornecedor aparece 11 vezes (6 vendas + 5 devoluções)',
  `achei ${vezes(cru, '{4}')}`);
afirmar(vezes(cru, '{5}') === 3,
  'o predicado das notas sem item aparece 3 vezes',
  `achei ${vezes(cru, '{5}')}`);

// E o repositório tem de ligar exatamente essas quantidades, na ordem dos blocos.
const repo = fs.readFileSync(
  'api-new-kpi/Infrastructure/Persistence/Repositories/DreGerencialRepository.cs', 'utf8');
afirmar(repo.includes('LigarFornecedores(6);') && repo.includes('LigarFornecedores(5);'),
  'o repositório liga 6 + 5 ocorrências, na ordem dos blocos');

console.log(falhas === 0
  ? '\n  TUDO CONFERE — quem não usa o filtro recebe o DRE de sempre.\n'
  : `\n  ${falhas} asserção(ões) falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
