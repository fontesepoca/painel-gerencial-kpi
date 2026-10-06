// dc76 — Sem fornecedor selecionado, as QUATRO consultas de despesa são as mesmas de antes.
//
// A irmã da dc75, do outro lado da apuração. Lá era o faturamento, aqui são as despesas — e
// aqui o risco é maior, porque são quatro consultas quase idênticas e a tentação de mexer em
// uma e esquecer as outras três é permanente.
//
// Uso:
//   node docs/rotinas/9815-dre-gerencial/validacao/dc76_despesas_sem_filtro_nao_mudam.mjs [<commit de referência>]
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE AS QUATRO, E NÃO UMA
// ═══════════════════════════════════════════════════════════════════════════
//
// Na 9815 é `GetValorGrupo` quem monta a consulta de valores, e ela é UMA SÓ para as quatro
// dimensões: o `cbDRETipoAnalise` escolhe apenas o `GRUPOCONTA` do SELECT, e todo o resto —
// inclusive o CASE do exclusivo e as duas condições do WHERE — é compartilhado (UBase.pas,
// 27050 em diante). Nós temos quatro constantes separadas, então o que lá é estrutural aqui
// precisa ser verificado.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE MUDA, E POR QUÊ NÃO MUDA NADA SEM FILTRO
// ═══════════════════════════════════════════════════════════════════════════
//
//   {4}  a coluna VPAGO_EXCLUSIVO_FORNEC — o valor que pertence ao fornecedor e por isso
//        NÃO pode ser rateado. Sem filtro é o `0 as VPAGO_EXCLUSIVO_FORNEC,` de sempre.
//
//   {5}  as duas condições do WHERE — quem SAI do DRE. Sem filtro é VAZIO.
//
// Diferente da dc75, aqui não há `case when 1=1` para desfazer: os fragmentos são o texto
// antigo, literalmente. A comparação é direta.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const QUERIES = 'api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs';
const REPO = 'api-new-kpi/Infrastructure/Persistence/Repositories/DreGerencialRepository.cs';
const REFERENCIA = process.argv[2] ?? 'c6eebee';   // a fase 1, com as despesas ainda intactas

const DIMENSOES = [
  'DespesasGrupoDeContas',
  'DespesasContaGerencial',
  'DespesasCCustoPrincipal',
  'DespesasCentroCusto',
];

/** O corpo de uma constante, entre as aspas triplas. */
function sqlDe(texto, nome) {
  const s = texto.replace(/\r\n/g, '\n');
  const i = s.indexOf(`public const string ${nome}`);
  if (i < 0) throw new Error(`${nome} não encontrada`);
  const ini = s.indexOf('"""', i) + 3;
  const fim = s.indexOf('"""', ini);
  return s.slice(ini, fim);
}

const normalizar = (t) => t.replace(/\s+/g, ' ').trim();

const antesTexto = execFileSync('git', ['show', `${REFERENCIA}:${QUERIES}`],
  { encoding: 'utf8', maxBuffer: 1 << 24 });
const agoraTexto = fs.readFileSync(QUERIES, 'utf8');

console.log(`\n══ dc76 — despesas sem filtro, contra ${REFERENCIA} ══\n`);

let falhas = 0;
const afirmar = (ok, texto, detalhe = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${texto}${detalhe ? '   ' + detalhe : ''}`);
  if (!ok) falhas++;
};

for (const nome of DIMENSOES) {
  const antes = sqlDe(antesTexto, nome);
  // Como o repositório monta quando não há fornecedor: o texto antigo, literalmente.
  const agora = sqlDe(agoraTexto, nome)
    .replaceAll('{4}', '0 as VPAGO_EXCLUSIVO_FORNEC,')
    .replaceAll('{5}', '');

  const igual = normalizar(agora) === normalizar(antes);
  afirmar(igual, `${nome} sem filtro é a consulta de antes`);

  if (!igual) {
    const pa = normalizar(antes).split(' ');
    const pb = normalizar(agora).split(' ');
    let i = 0;
    while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
    console.log(`       ANTES: ...${pa.slice(Math.max(0, i - 6), i + 10).join(' ')}...`);
    console.log(`       AGORA: ...${pb.slice(Math.max(0, i - 6), i + 10).join(' ')}...`);
  }
}

console.log('');

// Os placeholders têm de estar nas quatro, e UMA vez em cada. Duas ocorrências de {4} numa
// consulta dobrariam a coluna; duas de {5} dobrariam as condições, e com elas os binds.
for (const nome of DIMENSOES) {
  const q = sqlDe(agoraTexto, nome);
  const vezes = (alvo) => q.split(alvo).length - 1;
  afirmar(vezes('{4}') === 1 && vezes('{5}') === 1,
    `${nome} tem {4} e {5} uma vez cada`,
    `{4}×${vezes('{4}')} {5}×${vezes('{5}')}`);
}

console.log('');

// O bloco de JUROS continua com zero fixo, nas quatro. Ele vem de PCPREST e não tem centro de
// custo nem fornecedor — na 9815 também sai `0 as VPAGO_EXCLUSIVO_FORNEC` ali, e filtrá-lo
// seria atribuir a um fornecedor um valor que não é de nenhum.
const zerosDeJuros = (agoraTexto.match(
  /fin\.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg/g) ?? []).length;
afirmar(zerosDeJuros === 4,
  'o bloco de juros mantém o zero fixo nas quatro dimensões',
  `achei ${zerosDeJuros}`);

// E o repositório tem de ligar as QUATRO listas, na ordem dos blocos: 0 e 1 em {4}, que está
// entre as colunas; 2 e 3 em {5}, que está no WHERE depois das filiais.
const repo = fs.readFileSync(REPO, 'utf8');
afirmar(repo.includes('LigarFornecedores(0, 1);') && repo.includes('LigarFornecedores(2, 3);'),
  'o repositório liga as quatro listas, na ordem dos blocos');
afirmar(repo.includes('D.DTINATIVACAO IS NULL'),
  'o predicado respeita o desligamento do vínculo (DTINATIVACAO IS NULL)');
afirmar((repo.match(/DedicadoAberto/g) ?? []).length >= 3,
  'o centro dedicado entra no CASE e nos DOIS ramos do WHERE',
  'esquecer o NOT EXISTS faria o centro sumir do DRE de todo mundo');

console.log(falhas === 0
  ? '\n  TUDO CONFERE — quem não usa o filtro recebe as despesas de sempre.\n'
  : `\n  ${falhas} asserção(ões) falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
