// dc78 — com fornecedor filtrado, o DETALHE fecha com a célula clicada.
//
// É a promessa que o detalhamento existe para cumprir, e a única que não se verifica
// lendo o código: a célula de despesa filtrada é `(total − exclusivo) × participação +
// exclusivo`, e os lançamentos chegam crus, um a um. Se a conta da tela divergir da do
// servidor, ninguém percebe olhando — os dois números são plausíveis.
//
// O que o script faz, para cada linha de despesa da apuração:
//
//   1. apura com o fornecedor e guarda o valor da célula;
//   2. abre o detalhamento daquela linha, com o mesmo filtro;
//   3. aplica a fórmula sobre os lançamentos que voltaram;
//   4. cobra igualdade ao centavo.
//
// Confere também o que NÃO pode mudar: sem filtro, participação 1 e a soma crua dos
// lançamentos continua fechando, como sempre fechou (é a dc34 vista de outro ângulo).
//
// Uso, com a API no ar:
//   node docs/validacao/dc78_detalhe_fecha_com_a_celula_filtrada.mjs
//   API=http://localhost:5207 FORNEC=29 LIMITE=12 node docs/validacao/dc78...

const API = process.env.API ?? "http://localhost:5207";
const FORNEC = Number(process.env.FORNEC ?? 29);
const LIMITE = Number(process.env.LIMITE ?? 12);

const FILTRO = {
  filiais: ["7"],
  dataInicio: "2026-08-01",
  dataFim: "2026-08-31",
  regime: "competencia",
  analise: "ccusto-principal",
};

async function postar(rota, corpo) {
  const r = await fetch(`${API}${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = await r.json();
  if (!r.ok || !j.sucesso) {
    throw new Error(`${rota} devolveu ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  }
  return j.dados;
}

/**
 * A mesma fórmula do `MontadorDre.Ratear`, aplicada aos lançamentos.
 *
 * Em precisão cheia, arredondando só no fim: `Σ(vᵢ × p) = (Σvᵢ) × p` é exato enquanto
 * ninguém arredonda no meio, e é isso que faz a soma das linhas bater com um agregado que
 * o servidor calculou de uma vez. Arredondar linha a linha erraria centavos.
 */
function somaNoDre(lancamentos, participacao) {
  let total = 0;
  for (const l of lancamentos) {
    total += l.exclusivo ? l.vPago : l.vPago * participacao;
  }
  return total;
}

const dinheiro = (v) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let erros = 0;
const conferir = (ok, mensagem) => {
  if (!ok) {
    erros++;
    console.log(`  FALHA  ${mensagem}`);
  }
};

// ── 1. COM FILTRO ─────────────────────────────────────────────────────────────
console.log(`\nCOM FILTRO — fornecedor ${FORNEC}`);

const comFiltro = await postar("/api/dre-gerencial/apuracao", {
  ...FILTRO,
  fornecedores: [FORNEC],
});

const receitaLiquida = comFiltro.linhas.find((l) => l.papel === "receitas-liquidas");
const participacaoDoDre = (receitaLiquida?.valores[0]?.percentualAv ?? 0) / 100;
console.log(`  participação no DRE: ${(participacaoDoDre * 100).toFixed(4)}%`);

const despesas = comFiltro.linhas
  .filter((l) => l.detalhe?.tipo === "lancamentos" && l.valores[0]?.valor !== 0)
  .slice(0, LIMITE);

conferir(despesas.length > 0, "a apuração não trouxe linha de despesa nenhuma");

for (const linha of despesas) {
  const celula = linha.valores[0].valor;

  const detalhe = await postar("/api/dre-gerencial/detalhe", {
    ...FILTRO,
    fornecedores: [FORNEC],
    tipo: "lancamentos",
    bloco: linha.detalhe.bloco,
    chave: linha.detalhe.chave,
  });

  const lancamentos = detalhe.lancamentos ?? [];
  const calculado = somaNoDre(lancamentos, detalhe.participacao);
  const difere = Math.abs(calculado - celula) > 0.005;

  const exclusivos = lancamentos.filter((l) => l.exclusivo).length;
  const marca = difere ? "FALHA " : "  ok  ";
  console.log(
    `${marca} ${linha.descricao.trim().padEnd(34)} ` +
      `célula ${dinheiro(celula).padStart(14)} · detalhe ${dinheiro(calculado).padStart(14)} ` +
      `· ${String(lancamentos.length).padStart(4)} lanç. (${exclusivos} excl.)`,
  );
  if (difere) erros++;

  // A participação do detalhe é a MESMA que o DRE mostra na célula do %AV. Divergir aqui
  // significaria duas verdades sobre o mesmo recorte — e a tela mostra as duas.
  conferir(
    Math.abs(detalhe.participacao - participacaoDoDre) < 1e-9,
    `${linha.descricao.trim()}: participação do detalhe (${detalhe.participacao}) ` +
      `≠ a do DRE (${participacaoDoDre})`,
  );

  conferir(
    JSON.stringify(detalhe.fornecedores) === JSON.stringify([FORNEC]),
    `${linha.descricao.trim()}: o detalhe não ecoou o fornecedor filtrado`,
  );
}

// ── 2. SEM FILTRO, nada pode ter mudado ───────────────────────────────────────
console.log("\nSEM FILTRO — a regressão que importa");

const semFiltro = await postar("/api/dre-gerencial/apuracao", FILTRO);
const umaDespesa = semFiltro.linhas.find(
  (l) => l.detalhe?.tipo === "lancamentos" && l.valores[0]?.valor !== 0,
);

const detalheSem = await postar("/api/dre-gerencial/detalhe", {
  ...FILTRO,
  tipo: "lancamentos",
  bloco: umaDespesa.detalhe.bloco,
  chave: umaDespesa.detalhe.chave,
});

conferir(detalheSem.participacao === 1, "sem filtro a participação tem de ser exatamente 1");
conferir(
  (detalheSem.fornecedores ?? []).length === 0,
  "sem filtro o eco de fornecedores tem de vir vazio",
);
conferir(
  (detalheSem.lancamentos ?? []).every((l) => l.exclusivo === false),
  "sem filtro nenhum lançamento pode vir marcado como exclusivo",
);

const cru = (detalheSem.lancamentos ?? []).reduce((s, l) => s + l.vPago, 0);
conferir(
  Math.abs(cru - umaDespesa.valores[0].valor) <= 0.005,
  `sem filtro a soma crua (${dinheiro(cru)}) tem de fechar com a célula ` +
    `(${dinheiro(umaDespesa.valores[0].valor)})`,
);
console.log(
  `  ok   ${umaDespesa.descricao.trim()} — soma crua ${dinheiro(cru)} = célula, participação 1`,
);

// ── 3. A VERBA DO CENTRO 90 ENTRA INTEIRA ─────────────────────────────────────
//
// É a asserção que FALTAVA, e a falta custou caro: em 02/10/2026 o merge da main trouxe a
// mudança de 22/09 — `codccprinc` deixou de ser os dois dígitos e passou a ser a conta
// principal (`9001`) —, a condição `IN (90)` do filtro parou de casar, e a verba do
// fornecedor virou despesa rateada. `VERBAS MARGEM` caiu de 199.500,00 para 72.453,50.
//
// E ESTE SCRIPT PASSOU. Ele compara o detalhe com a célula, e os dois usam a MESMA
// condição: erraram juntos, consistentes e errados. Comparação interna não enxerga defeito
// que atinge os dois lados — por isso esta seção confere contra uma terceira fonte: os
// lançamentos do centro 90 que têm o CODFORNEC do fornecedor, lidos sem filtro nenhum.
{
  console.log("\nA VERBA DO CENTRO 90 — o que é do fornecedor não se rateia");

  const linha90 = comFiltro.linhas.find(
    // s E NAO UM ESPACO LITERAL: o rotulo vem do cadastro com um ESPACO NAO SEPARAVEL
    // (U+00A0, codigo 160) entre as duas palavras. Procurar por "VERBAS MARGEM" digitado
    // aqui nao casa com nada, e o teste passa a dizer que o cenario mudou quando a linha
    // esta ali. Ja mordeu este projeto antes -- ver DIVERGENCIAS, armadilha do rotulo.
    (l) => l.detalhe?.tipo === "lancamentos" && /VERBAS\s+MARGEM/i.test(l.descricao),
  );

  if (!linha90) {
    conferir(false, "a linha VERBAS MARGEM não veio na apuração — o cenário mudou?");
  } else {
    // Sem filtro: a verba da filial inteira, de todos os fornecedores.
    const cru = await postar("/api/dre-gerencial/detalhe", {
      ...FILTRO,
      tipo: "lancamentos",
      bloco: linha90.detalhe.bloco,
      chave: linha90.detalhe.chave,
    });

    // O que naquela lista pertence ao fornecedor — a terceira fonte.
    const doFornecedor = (cru.lancamentos ?? [])
      .filter((l) => l.codFornec === FORNEC)
      .reduce((s, l) => s + l.vPago, 0);

    const comFiltro90 = await postar("/api/dre-gerencial/detalhe", {
      ...FILTRO,
      fornecedores: [FORNEC],
      tipo: "lancamentos",
      bloco: linha90.detalhe.bloco,
      chave: linha90.detalhe.chave,
    });

    const marcados = (comFiltro90.lancamentos ?? []).filter((l) => l.exclusivo);
    const somaMarcados = marcados.reduce((s, l) => s + l.vPago, 0);

    console.log(
      `  verba do ${FORNEC} no centro 90: ${dinheiro(doFornecedor)} · ` +
        `marcada como exclusiva: ${dinheiro(somaMarcados)} (${marcados.length} lanç.)`,
    );

    conferir(
      Math.abs(somaMarcados - doFornecedor) <= 0.005,
      `a verba do centro 90 do fornecedor tem de vir MARCADA como exclusiva: ` +
        `${dinheiro(doFornecedor)} no cadastro, ${dinheiro(somaMarcados)} marcados`,
    );

    // E a consequência na célula: ela não pode ser o total da filial vezes a participação.
    // Se for, o exclusivo não está sendo somado de volta — foi o sintoma de 02/10.
    const totalDaFilial = (cru.lancamentos ?? []).reduce((s, l) => s + l.vPago, 0);
    const seFosseTudoRateado = totalDaFilial * comFiltro90.participacao;

    conferir(
      doFornecedor === 0 ||
        Math.abs(linha90.valores[0].valor - seFosseTudoRateado) > 0.005,
      `a célula do VERBAS MARGEM (${dinheiro(linha90.valores[0].valor)}) é o total da ` +
        `filial vezes a participação (${dinheiro(seFosseTudoRateado)}) — o exclusivo sumiu`,
    );
  }
}

// ── 3. A RECEITA, que filtra na própria consulta ──────────────────────────────
//
// Aqui não há rateio: o filtro está no `pr.codfornec`, item a item. A tela de receita é
// cara — ~2 min com um mês —, então fica atrás de uma variável de ambiente.
if (process.env.RECEITA === "1") {
  console.log("\nRECEITA POR CLIENTE — filtra na consulta, sem rateio");

  const linhaRl = comFiltro.linhas.find((l) => l.papel === "receitas-liquidas");
  const detalheReceita = await postar("/api/dre-gerencial/detalhe", {
    ...FILTRO,
    fornecedores: [FORNEC],
    tipo: "receita-por-cliente",
    bloco: null,
    chave: null,
  });

  const somaRl = (detalheReceita.clientes ?? []).reduce((s, c) => s + c.receitaLiquida, 0);
  conferir(
    Math.abs(somaRl - linhaRl.valores[0].valor) <= 0.5,
    `receita líquida: detalhe ${dinheiro(somaRl)} ≠ célula ${dinheiro(linhaRl.valores[0].valor)}`,
  );
  console.log(
    `  ok   receita líquida — detalhe ${dinheiro(somaRl)} · célula ` +
      `${dinheiro(linhaRl.valores[0].valor)}`,
  );
}

console.log(
  erros === 0
    ? "\n✓ dc78 passou — o detalhe explica a célula, com filtro e sem\n"
    : `\n✗ dc78: ${erros} divergência(s)\n`,
);
process.exit(erros === 0 ? 0 : 1);
