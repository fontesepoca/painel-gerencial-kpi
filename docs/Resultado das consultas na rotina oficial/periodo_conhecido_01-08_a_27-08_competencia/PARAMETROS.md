# Exportação de referência — parâmetros conhecidos

Diferente das exportações da Fase 0, **esta tem os parâmetros registrados**. É a referência
para conferir os incrementos da Fase 4.

| Parâmetro | Valor |
|---|---|
| Período | **01/08/2026 a 27/08/2026** |
| Regime | **Competência** |
| Análise | **Grupo de Contas** |
| Filiais | 7 (EPC-MAT), 12 (EPC-ES), 25 (VIVALOG-GBH) |
| Checkboxes | como nas capturas da Fase 0 |
| Exportado em | 28/08/2026 |

Dois arquivos, com e sem `Mostrar Contas Zeradas`. O "com zeradas" serve para casar linha a
linha com o endpoint de estrutura, que devolve todas.

## Por que existe

As planilhas da Fase 0 não registram o período. Ao conferir o incremento 3 apareceu uma
divergência em `Despesas Adm e Vendas` cujo valor ficava **entre** o de 26/08 e o de 27/08 —
e como despesa só cresce em módulo com o período, nenhuma data final explicava aquilo. A
conclusão foi que os parâmetros da exportação antiga eram desconhecidos, não que o SQL
estivesse errado. Com esta exportação, tudo bateu ao centavo.

**Lição:** planilha de referência sem parâmetro registrado não serve para validar.

## Atualização de 28/08/2026 — use a exportação LIMPA

`grupo-contas-competencia-com-zeradas-LIMPA.xlsx` foi gerada **depois de fechar e reabrir a
9815**, e é a referência correta.

A primeira exportação com zeradas trazia **uma linha a mais** — `Verba Ind Merc Vencida e
Avaria`, resíduo de uma execução anterior que ficou na grade. Sem ela, são 123 linhas de
dado, exatamente as 123 que a nossa consulta de estrutura devolve.

E os **valores mudaram** entre as duas exportações, com os mesmos parâmetros: uma devolução
foi ajustada (−29,45) e quase 24 mil em despesas foram lançados no intervalo de cerca de uma
hora. A base é produção viva.

**Protocolo daqui em diante:** feche e reabra a 9815 antes de exportar, e faça a chamada da
API logo em seguida. Ver `docs/ROTINA_9815.md` §11.

## Referência do incremento 5b — 28/08/2026

`REFERENCIA-inc5b-com-zeradas.xlsx` — exportada com a 9815 recém-reaberta, **com** contas
zeradas, e comparada contra `POST /api/dre-gerencial/apuracao` chamado minutos depois.

**Resultado: 123 linhas, zero divergência de valor e zero de `%AV`.**

Cobre os quatro totalizadores, as duas bases do `%AV`, o bloco informativo e as contas órfãs.
