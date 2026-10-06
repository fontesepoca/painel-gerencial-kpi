#!/usr/bin/env bash
#
# APOSENTADA em 02/09/2026 — NÃO USE PARA VALIDAR.
#
# Comparava nosso detalhamento com a exportação do detalhamento da 9815. Essa
# referência deixou de valer no momento em que decidimos divergir dela: a web passou
# a incluir os estornos de baixa que a 9815 esconde, porque é o que faz o total
# fechar com a linha do DRE (DIVERGENCIAS.md §4).
#
# DIRETORIA agora sai com 135 lançamentos onde a 9815 exporta 129 — com a soma
# idêntica, porque os seis a mais se cancelam. As contagens abaixo são do contrato
# antigo e vão falhar por construção.
#
# A conferência que vale é a dc6, contra a linha do DRE:
#
#   node docs/validacao/dc6_ponta_a_ponta.mjs
#
# dc5 — O detalhamento de lançamentos bate com os cinco exemplos da 9815?
#
# Cobre os três blocos, que é o que importa: `pos-operacional` e `orfa` trocam o `in` por
# `not in` nas duas subconsultas contra EPCPARDRE e mudam a coluna do recorte. Se algum
# desses dois estiver errado, a linha volta com contagem e soma de outro bloco.
#
# Cenário do print de 01/09/2026 — C. Custo Principal, caixa, agosto/2026, filiais 7/12/25.
#
# ESPERADO, extraído dos resultado.xlsx de docs/dois_cliques:
#
#   DIRETORIA               operacional      14            129 lanc.   -256840.02
#   COMPRAS - RAT           operacional      11             92 lanc.   -278024.83
#   RECEITAS FINANCEIRAS    pos-operacional  80           6276 lanc.    445891.19
#   ACERTO DE ESTOQUE       orfa             3000003        62 lanc.    -83723.73
#   DISTRIBUICAO DE LUCROS  orfa             2342010001      2 lanc.    -50000.00

API=${API:-http://localhost:5207}

conferir() {
  local nome=$1 bloco=$2 chave=$3 lanc=$4 soma=$5

  local corpo
  corpo=$(cat <<JSON
{"filiais":["7","12","25"],"dataInicio":"2026-08-01","dataFim":"2026-08-31",
 "regime":"caixa","analise":"ccusto-principal",
 "tipo":"lancamentos","bloco":"$bloco","chave":"$chave"}
JSON
)

  curl -s -X POST "$API/api/dre-gerencial/detalhe" \
       -H "Content-Type: application/json" -d "$corpo" \
  | node -e '
      const esperado = { nome: process.argv[1], lanc: +process.argv[2], soma: +process.argv[3] };
      let bruto = "";
      process.stdin.on("data", (d) => (bruto += d));
      process.stdin.on("end", () => {
        const r = JSON.parse(bruto);
        if (!r.sucesso) {
          console.log(`${esperado.nome.padEnd(24)} ERRO  ${r.erros?.[0] ?? r.mensagem}`);
          process.exitCode = 1;
          return;
        }
        const linhas = r.dados.lancamentos ?? [];
        // Arredonda a soma antes de comparar: sao centenas de decimais somados em float.
        const soma = Math.round(linhas.reduce((s, l) => s + l.vPago, 0) * 100) / 100;
        const okQtd = linhas.length === esperado.lanc;
        const okSoma = soma === esperado.soma;
        console.log(
          `${esperado.nome.padEnd(24)} ${okQtd && okSoma ? "ok   " : "FALHOU"}` +
          ` lanc ${String(linhas.length).padStart(5)}/${esperado.lanc}` +
          `  soma ${soma.toFixed(2).padStart(13)}/${esperado.soma.toFixed(2)}` +
          `  ${Math.round(r.dados.duracaoMs / 100) / 10}s`);
        if (!okQtd || !okSoma) process.exitCode = 1;
      });
    ' "$nome" "$lanc" "$soma"
}

conferir "DIRETORIA"              operacional     14         129  -256840.02
conferir "COMPRAS - RAT"          operacional     11          92  -278024.83
conferir "RECEITAS FINANCEIRAS"   pos-operacional 80        6276   445891.19
conferir "ACERTO DE ESTOQUE"      orfa            3000003     62   -83723.73
conferir "DISTRIBUICAO DE LUCROS" orfa            2342010001   2   -50000.00
