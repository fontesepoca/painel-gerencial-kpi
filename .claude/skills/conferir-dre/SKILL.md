---
description: Conferir os números de uma consulta da DRE contra as planilhas exportadas da rotina 9815 — extrair os valores esperados, entregar a query ao Gabriel e comparar linha a linha.
---

# conferir-dre — validar número contra a 9815

O critério de aceite da rotina 9815 na web é **bater ao centavo** com a rotina Delphi. Esta
skill é o ciclo de verificação, repetido a cada incremento da Fase 4.
Referência: `docs/Resultado das consultas na rotina oficial/` e
[docs/ROTINA_9815.md](../../../docs/ROTINA_9815.md) §7.

**Nunca conecte no Oracle.** Você escreve a query, o Gabriel executa, você trabalha com o
resultado que ele colar de volta. Ver [AGENTS.md](../../../AGENTS.md).

## 1. Escolher o cenário — `docs/Resultado das consultas na rotina oficial/`

Seis cenários exportados, em duas pastas:

| Pasta | Período | Cenários |
|---|---|---|
| `periodo_de_um_mes_sem_AH/` | 01/08 a 27/08/2026 | grupo de contas, conta gerencial e c.custo principal × caixa e competência |
| `periodo_de_dois_meses_com_AH/` | 01/06 a 31/07/2026 | os mesmos, com %AH |

Cada pasta tem `queries/` — o SQL que a rotina realmente enviou ao Oracle — e `resultados/`,
com o que a rotina exibiu.

Comece sempre pelo mais simples: **1 mês, competência, grupo de contas**.

> **Atalho:** quando os dois lados já existem como arquivo — a **impressão** da nossa tela em
> PDF e a exportação da 9815 em `.xlsx` —, os passos 2 e 4 estão prontos num comando:
>
> ```
> node docs/validacao/dc28_impressao_contra_planilha.mjs "<impressão.pdf>" "<9815.xlsx>"
> ```
>
> Ele alinha por ordem, compara com meia tolerância de centavo, separa as linhas zeradas que
> só aparecem na nossa tela e sai com código ≠ 0 se algo divergir. O resto desta seção é o
> caminho manual, que continua valendo quando o recorte não é uma tela inteira.

## 2. Extrair os valores esperados do `.xlsx`

Não há Python nesta máquina, e `Expand-Archive` recusa a extensão `.xlsx`. O caminho que
funciona é copiar para `.zip` e descompactar:

```powershell
$src = "docs\Resultado das consultas na rotina oficial\periodo_de_um_mes_sem_AH\resultados"
$dst = "$env:TEMP\dre"
New-Item -ItemType Directory -Force $dst | Out-Null
Get-ChildItem $src -Filter *.xlsx | ForEach-Object {
  $out = Join-Path $dst $_.BaseName
  $tmp = Join-Path $dst ($_.BaseName + ".zip")
  Copy-Item $_.FullName $tmp -Force
  Expand-Archive -Path $tmp -DestinationPath $out -Force
  Remove-Item $tmp
}
```

O texto das células fica em `xl/sharedStrings.xml`, na ordem em que aparece na planilha:

> **Cuidado: `sharedStrings` deduplica.** Um rótulo que se repete na planilha aparece uma vez
> só no XML. Ler o arquivo linearmente perde as repetições — e no DRE elas existem
> (`Despesas Adm e Vendas` sai três vezes). Para casar linha a linha, leia `xl/worksheets/
> sheet1.xml` e resolva cada célula pelo índice; use o `sharedStrings` só para conferir
> valores, nunca para reconstruir a ordem das linhas.

```bash
sed -e 's/<\/t>/\n/g' "$TEMP/dre/grupo-contas-competencia/xl/sharedStrings.xml" \
  | sed -e 's/.*<t[^>]*>//'
```

A saída sai como trincas `Descrição`, `Valor`, `% AV` — a mesma ordem das colunas da grade.

## 3. Escrever a query e entregar

Monte o SQL a partir do trace correspondente em `queries/`, adaptado às convenções do projeto
(ver skill `new-query`). Entregue ao Gabriel em bloco `bash`, uma consulta por bloco, para ele
poder rodar com um clique.

Peça o resultado **na mesma granularidade da planilha** — se a planilha tem uma linha por
grupo, agrupe por grupo. Comparar agregado com detalhado esconde erro de duplicação.

## 4. Comparar

Compare com script, não a olho: uma diferença de centavos em uma linha de 40 milhões passa
despercebida na leitura.

```bash
cat <<'EOF' > /tmp/conf.awk
BEGIN{ FS="\t"; erros=0 }
NR==FNR { esperado[$1]=$2; next }
{
  if (!($1 in esperado)) { printf "FALTA NA PLANILHA: %s\n", $1; erros++; next }
  d = esperado[$1] - $2
  if (d < 0) d = -d
  if (d > 0.005) { printf "DIVERGE  %-45s planilha=%.2f  query=%.2f  dif=%.2f\n", $1, esperado[$1], $2, d; erros++ }
  delete esperado[$1]
}
END{
  for (k in esperado) { printf "FALTA NA QUERY: %-45s planilha=%.2f\n", k, esperado[k]; erros++ }
  printf "\n%s\n", (erros == 0 ? "BATE — todas as linhas conferem" : erros " divergencia(s)")
}
EOF
awk -f /tmp/conf.awk esperado.tsv obtido.tsv
```

Tolerância de meio centavo cobre arredondamento de exibição. **Diferença maior é erro**, não
"aproximação aceitável".

## 5. Conferir também a aritmética do cabeçalho

Independente da query, estas identidades têm que valer. Foram verificadas em 4 cenários:

```
RECEITAS LIQUIDAS = RECEITA BRUTA − ABAT./DESC. − DEVOLUCAO
LUCRO BRUTO       = RECEITAS LIQUIDAS − CMV LIQ.
```

**ST, PIS e COFINS não entram.** Se você somou os três e "quase bateu", o erro é esse — a
diferença fica na casa dos milhões, não em centavos.

Os totalizadores também têm identidade fixa, verificada em 28/08/2026 contra a exportação de
parâmetros conhecidos:

```
Sub-Total Desp.Op. = soma das linhas com AntesRO = 'S'
RESULTADO OPER.    = LUCRO BRUTO + Sub-Total
Total das Despesas = Sub-Total + soma das linhas com AntesRO = 'N' e AntesLL = 'S'
LUCRO LIQUIDO      = LUCRO BRUTO + Total das Despesas
```

Linhas com `AntesLL = 'N'` não entram em totalizador nenhum — são o bloco `NÃO SOMA`.

## 6. Registrar

Incremento conferido vira uma linha na tabela do §7 de `docs/ROTINA_9815.md`, com o cenário
usado e a data. Divergência não resolvida vira pendência documentada — **nunca** um número
"quase certo" seguindo adiante.

## Regras / Armadilhas

| Problema | Causa | Solução |
|---|---|---|
| `Expand-Archive` recusa o arquivo | Ele só aceita a extensão `.zip` | Copiar para `.zip` antes de descompactar |
| `python` não encontrado | Não há Python nesta máquina; o alias abre a Microsoft Store | Usar PowerShell + `sed` sobre o XML |
| Valor da planilha fica ENTRE dois períodos testados | A planilha foi exportada com parâmetros desconhecidos. Despesa só cresce em módulo com o período, então nenhuma data final produz um valor intermediário | Peça uma exportação nova com parâmetros registrados, em vez de bissetar datas |
| Rótulo some ao extrair do xlsx | `sharedStrings.xml` deduplica texto repetido | Leia `sheet1.xml` e resolva os índices |
| Rótulos saem trocados ao resolver os índices | Dividir o `sharedStrings` por `</t>` desloca tudo: uma entrada `<si>` pode ter vários `<t>` quando o texto tem formatação | Dividir por `</si>` e concatenar os `<t>` de dentro. Confira contra o `uniqueCount` declarado no XML |
| Uma linha a mais na planilha, que nenhuma consulta produz | A grade da 9815 não é limpa entre apurações — sobra linha da execução anterior | Feche e reabra a rotina antes de exportar a referência. **Não replicar**: é estado de tela, não regra |
| Comparador awk reporta divergência de centavos em valores grandes, ou aprova valores diferentes | `CONVFMT` do awk é `%.6g`: usar `%s` num campo numérico trunca para 6 dígitos significativos. `41.401.481,82` vira `41401500` | Formate sempre com `sprintf("%.2f", v)`. O risco maior é o falso NEGATIVO: dois valores distintos que arredondem igual passam como iguais |
| Divergência que aparece e some sem mudança de código | A base é produção viva; os valores mudam durante o dia | Exportação e chamada da API **em sequência, minutos de diferença**. Registre a hora das duas |
| Diferença de ~3 milhões na Receita Líquida | Deduziu ST, PIS e COFINS | Eles não entram no cálculo |
| %AV errado em ABAT./DESC., DEVOLUCAO, ST, PIS e COFINS | Usou RECEITAS LIQUIDAS como base | Essas cinco são percentuais da RECEITA BRUTA; o resto é da RECEITAS LIQUIDAS |
| Cenário de Centro de Custo sem planilha para comparar | A análise por Centro de Custo **nunca funcionou** na 9815 — os arquivos `*_com_erro_sempre` são o trace do erro | Única dimensão que precisa de validação manual com o negócio |
| Números batem em 1 mês e erram em 2 | Com 2 meses a rotina executa o faturamento **uma vez por mês**; a despesa sai numa passada só, agrupada por `MES_ANO` | O `MES_ANO` acompanha o regime: caixa por `nvl(DTPAGTO,DTVENC)`, competência por `nvl(DTCOMPETENCIA,DTVENC)` |
| Duas linhas do DRE com o mesmo valor | Casou estrutura com valores só por `GRUPOCONTA` | A identidade é a tupla `(GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO)` |
| Linha aparece na query e não na planilha | Conta em `EPCPARDRE_NAOEXIBIR`, ou linha zerada escondida por `Mostrar Contas Zeradas` desmarcado | Exporte também COM contas zeradas para casar uma a uma |
| Ordem das linhas diferente | `EPCPARDRE.ID` tem uma linha com valor **nulo** | `ORDER BY ID NULLS LAST` |
| Total confere mas o detalhe não | Rateio: quando existe `PCRATEIOCENTROCUSTO`, o valor rateado **substitui** o do lançamento | Não somar os dois |

## Checklist final

- [ ] 9815 fechada e reaberta antes da exportação — a grade não se limpa sozinha
- [ ] Exportação e chamada da API feitas em sequência, com minutos de diferença
- [ ] Planilha de referência tem os PARAMETROS REGISTRADOS. Exportação sem período conhecido não valida nada — foi o que gerou uma falsa divergência no incremento 3
- [ ] Cenário identificado, com período e regime conferidos
- [ ] Valores esperados extraídos do `.xlsx`, não digitados à mão
- [ ] Query entregue ao Gabriel em bloco `bash` — **nenhuma conexão ao banco**
- [ ] Comparação feita por script, com tolerância de meio centavo
- [ ] Linhas a mais e a menos verificadas, não só as divergentes
- [ ] Identidades do cabeçalho conferidas
- [ ] Resultado registrado em `docs/ROTINA_9815.md` §7
- [ ] Nenhuma divergência pendente sem explicação documentada
