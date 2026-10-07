# 9815 — GERENCIAL / DRE

A primeira rotina migrada, e o **molde** das próximas. Demonstrativo de resultado por filial e
período, em quatro dimensões de análise: Grupo de Contas, Conta Gerencial, C. Custo Principal e
Centro de Custo.

**Critério de aceite:** bater **ao centavo** com a rotina Delphi, inclusive nos pontos que
parecem defeito. Divergir é exceção, e toda exceção está numerada no `DIVERGENCIAS.md`.

| Documento | O que é |
|---|---|
| [LEVANTAMENTO.md](LEVANTAMENTO.md) | o que a 9815 **é hoje** no Winthor — lido do `UBase.pas` e do trace |
| [ESPECIFICACAO.md](ESPECIFICACAO.md) | o que a **versão web** faz: tela, API, regras, modos de período |
| [DIVERGENCIAS.md](DIVERGENCIAS.md) | **toda** diferença numérica entre as duas, medida e decidida |
| [FILTRO_FORNECEDOR.md](FILTRO_FORNECEDOR.md) | o filtro por fornecedor — a mecânica lida no fonte e a tabela de vínculo |
| [HOMOLOGACAO.md](HOMOLOGACAO.md) | a matriz de cenários a conferir |
| [BASE_MINAS_RURAL.md](BASE_MINAS_RURAL.md) | o que o Delphi faz diferente na base do Minas Rural — lido do fonte, a confirmar por medição |
| [validacao/](validacao/) | os scripts que provam cada número (`dcNN`) |
| [referencia-oficial/](referencia-oficial/) | o que a 9815 exportou, e o SQL que ela mandou ao Oracle |

## Estado

| | Situação |
|---|---|
| As quatro dimensões | ✅ implementadas e conferidas |
| Detalhamento por duplo clique | ✅ **162/162 fecham ao centavo** pela API |
| Recursos de tela — reordenar, tema, tela cheia, impressão, exportar | ✅ |
| Filtro por fornecedor | ✅ apuração, rateio, tela e detalhamento |
| Homologação | ⬜ a matriz está desatualizada — ver os riscos em `DIVERGENCIAS.md` |

**Em aberto, em ordem de risco:**

| | |
|---|---|
| **Agosto/2026 não fecha** | `VERBAS MARGEM` diverge R$ 150.930,28 — 83 lançamentos retroativos entrados em 22/09. Junho fecha 45/45 no mesmo dia |
| **O lucro subiu R$ 1,71 mi** | consequência esperada da divergência 14, mas falta o financeiro confirmar que é o efeito desejado |
| O duplo clique **pela tela** | a API fecha 162/162, mas as telas novas nunca foram percorridas pela interface com dado real |
| Linhas marcadas na carga da tabela de vínculo | aguardando decisão do financeiro — ver `FILTRO_FORNECEDOR.md` |
| Tempo das consultas de imposto | nunca medido isoladamente |
| Período de 3 meses com todas as filiais | custo medido (173 s, 122,7 KB), valores nunca conferidos contra a 9815 |

## As quatro regras que mais confundem quem lê o SQL pela primeira vez

1. **`RECEITAS LIQUIDAS = RECEITA BRUTA − ABAT./DESC. − DEVOLUCAO`.** ST, PIS e COFINS **não
   são deduzidos** — são informativos. Quem somou os três e "quase bateu" errou aqui, e a
   diferença fica na casa dos milhões.
2. **Regime altera apenas a data das despesas.** Caixa usa `nvl(DTPAGTO, DTVENC)`, competência
   usa `dtcompetencia`. Receita, deduções e CMV são idênticos nos dois.
3. **O mês da coluna acompanha o regime** — a rotina é coerente neste ponto.
4. **Despesa não paga nunca entra no DRE**, nem em competência (`DTPAGTO IS NOT NULL`).

E uma quinta, que não é da rotina antiga: **as mudanças aprovadas se acumulam.** O Gabriel
pediu alterações que mudam o comportamento da 9815 de propósito, todas numeradas no
`DIVERGENCIAS.md`. Uma branch nova herda todas — `git log --oneline HEAD..main` tem de vir
vazio antes de abrir trabalho e antes de entregar.

## Para conferir um número

A skill [`conferir-dre`](../../../.claude/skills/conferir-dre/SKILL.md) é o ciclo completo:
escolher o cenário em `referencia-oficial/`, extrair os valores esperados do `.xlsx`, escrever
a query, **entregar ao Gabriel para executar** — nunca conectar no Oracle — e comparar por
script, com tolerância de meio centavo.

## Os scripts de validação agora precisam de sessão

As rotas do DRE exigem `[Authorize]` desde 07/10/2026. Os `dcNN` que chamam a API direto
rodam com o módulo `_autenticar.mjs`, que loga com a credencial de variáveis de ambiente
(nunca de argumento, nunca impressa):

```bash
KPI_LOGIN=… KPI_SENHA=… [KPI_BASE=MinasRural] \
  node --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs <script>
```

`KPI_BASE` é `Epoca` por padrão. Sem `KPI_LOGIN` e `KPI_SENHA` o script falha dizendo o que
definir — seguir sem token daria 401 em cada chamada e um relatório de "divergência" que é só
falta de login.
