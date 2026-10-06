-- dc56 — O que são os centros de custo principais 90 e 25?
--
-- Esses dois números estão CRAVADOS no SQL da 9815, e só aparecem quando há filtro de
-- fornecedor. Eles decidem duas coisas que a comparação das planilhas de agosto/2026 expôs:
--
--   FECH-RESULTADO    13.579.698,32 sem filtro  →  SOME com filtro
--   VERBAS MARGEM        100.000,00 sem filtro  →  19.220,00 com filtro (19,22%, não 1,5255%)
--
-- A regra que a rotina aplica, e que só existe na execução COM filtro:
--
--   AND ( (codccprinc IN (90) AND FIN.CODFORNEC IN (29)) OR (codccprinc NOT IN (90)) )
--   AND ( (codccprinc = 25  and 29 in (29))              OR (codccprinc <> 25) )
--
-- Traduzindo: o centro 90 só traz lançamentos DAQUELE fornecedor; o 25 tem regra própria; os
-- demais passam inteiros e depois são rateados pela participação.
--
-- O banco não guarda o porquê — ele guarda só os números. Estas consultas dizem o QUE são.
--
-- COMO A 9815 DEFINE "CENTRO DE CUSTO PRINCIPAL"
--   São os DOIS PRIMEIROS caracteres do `CODIGOCENTROCUSTO`, e a descrição vem do menor
--   código sem ponto dentro do grupo. É esta a subconsulta que aparece no trace:
--
--     select SUBSTR(CodigoCentroCusto,1,2) as CODCCPRINC, min(CodigoCentroCusto) as CodPrinc
--       from PCCENTROCUSTO where CodigoCentroCusto not like '%.%'
--      group by SUBSTR(CodigoCentroCusto,1,2)
--
-- Tudo aqui é SELECT. Nada altera nada.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Todos os centros principais, com o 90 e o 25 marcados
-- ═══════════════════════════════════════════════════════════════════════════
-- Serve para ver os dois no contexto dos outros: se 90 e 25 forem os únicos com cara de
-- "fornecedor", a regra da 9815 fica explicada sozinha.
SELECT CCP.CODCCPRINC,
       (SELECT descricao FROM PCCENTROCUSTO WHERE CodigoCentroCusto = CCP.CodPrinc) AS DESCRICAO,
       CCP.CodPrinc                                                                 AS MENOR_CODIGO,
       CASE WHEN CCP.CODCCPRINC IN ('90','25') THEN '<<< TRATAMENTO ESPECIAL' END   AS OBS
  FROM (SELECT SUBSTR(CodigoCentroCusto,1,2) AS CODCCPRINC,
               MIN(CodigoCentroCusto)        AS CodPrinc
          FROM PCCENTROCUSTO
         WHERE CodigoCentroCusto NOT LIKE '%.%'
         GROUP BY SUBSTR(CodigoCentroCusto,1,2)) CCP
 ORDER BY CCP.CODCCPRINC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Os centros de custo DENTRO do 90 e do 25
-- ═══════════════════════════════════════════════════════════════════════════
-- O principal é só o prefixo; abaixo dele há os centros de verdade, com nome próprio.
SELECT SUBSTR(CodigoCentroCusto,1,2) AS PRINCIPAL,
       CodigoCentroCusto,
       DESCRICAO
  FROM PCCENTROCUSTO
 WHERE SUBSTR(CodigoCentroCusto,1,2) IN ('90','25')
 ORDER BY SUBSTR(CodigoCentroCusto,1,2), CodigoCentroCusto;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Onde caem as duas linhas que se comportaram diferente
-- ═══════════════════════════════════════════════════════════════════════════
-- FECH-RESULTADO e VERBAS MARGEM são o teste da hipótese. Se as duas estiverem em 90 ou 25,
-- a explicação está completa; se não estiverem, falta uma peça.
SELECT CT.CODCONTA,
       CT.CONTA,
       NVL(SUBSTR(RC.CodigoCentroCusto,1,2),'(sem rateio)') AS CCPRINC,
       COUNT(*)                                             AS LANCAMENTOS,
       SUM(NVL(RC.valor, FIN.VPAGO))                        AS TOTAL
  FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.RECNUM   = RC.RECNUM   (+)
   AND FIN.CODCONTA = RC.CODCONTA (+)
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('27')
   AND FIN.DTPAGTO IS NOT NULL
   AND FIN.dtcompetencia BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy')
                             AND TO_DATE('31/08/2026','dd/mm/yyyy')
   AND (UPPER(CT.CONTA) LIKE '%VERBA%' OR UPPER(CT.CONTA) LIKE '%FECH%')
 GROUP BY CT.CODCONTA, CT.CONTA, NVL(SUBSTR(RC.CodigoCentroCusto,1,2),'(sem rateio)')
 ORDER BY CT.CONTA, CCPRINC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Quanto do centro 90 pertence a cada fornecedor
-- ═══════════════════════════════════════════════════════════════════════════
-- Se o 90 for "verba de fornecedor", cada lançamento tem dono e a soma por CODFORNEC vai
-- mostrar isso claramente. E o total do fornecedor 29 aqui deve explicar o que apareceu, ou
-- deixou de aparecer, na planilha filtrada.
SELECT SUBSTR(RC.CodigoCentroCusto,1,2) AS CCPRINC,
       FIN.CODFORNEC,
       (SELECT FORNECEDOR FROM PCFORNEC WHERE CODFORNEC = FIN.CODFORNEC) AS FORNECEDOR,
       COUNT(*)                      AS LANCAMENTOS,
       SUM(NVL(RC.valor, FIN.VPAGO)) AS TOTAL
  FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.RECNUM   = RC.RECNUM
   AND FIN.CODCONTA = RC.CODCONTA
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('27')
   AND FIN.DTPAGTO IS NOT NULL
   AND SUBSTR(RC.CodigoCentroCusto,1,2) IN ('90','25')
   AND FIN.dtcompetencia BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy')
                             AND TO_DATE('31/08/2026','dd/mm/yyyy')
 GROUP BY SUBSTR(RC.CodigoCentroCusto,1,2), FIN.CODFORNEC
 ORDER BY 1, 5 DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Quem é o fornecedor 29
-- ═══════════════════════════════════════════════════════════════════════════
-- Só para a documentação registrar um nome, e não um número solto.
SELECT CODFORNEC, FORNECEDOR, CGC, DTCADASTRO
  FROM PCFORNEC
 WHERE CODFORNEC = 29;

-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE ME DEVOLVER
-- ═══════════════════════════════════════════════════════════════════════════
--   1 e 2 dizem o QUE são os centros 90 e 25 — é a pergunta principal.
--   3 confirma ou derruba a explicação de FECH-RESULTADO e VERBAS MARGEM.
--   4 mostra se o 90 é mesmo "por fornecedor" ou se é outra coisa.
--   5 é só o nome.
--
-- Se alguma falhar por privilégio, mande o número do ORA- — já aconteceu quatro vezes neste
-- projeto de um objeto parecer inexistente e ser só permissão.

-- ═══════════════════════════════════════════════════════════════════════════
-- RESULTADO — 21/09/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O FORNECEDOR 29 É A PROCTER & GAMBLE (CNPJ 01358874000188, cadastrado em 05/11/2003).
-- Esse nome é a chave de tudo o que vem abaixo.
--
-- OS DOIS CENTROS
--   90  VERBAS MARGEM   verba que cada fornecedor paga -- tem dono por lançamento.
--                       Um único centro, o 9001.
--   25  EQUIPE P&G      uma equipe DEDICADA a um fornecedor, com 27 subcentros: veículos por
--                       placa (PUH4017, QPX6597...), distribuição por região (NORTE, SUL,
--                       TRIANGULO, VALE DO ACO) e um P&G - ADMINISTRATIVO.
--
--   Nenhum outro dos 47 centros principais tem cara de "pertencer a um fornecedor". Os dois
--   estão cravados no SQL da 9815 por isso.
--
-- O CENTRO 90 EM AGOSTO/2026, FILIAL 27 -- a aritmética fecha sozinha
--
--   SUZANO                    3.200,00
--   SANTHER                   4.500,00
--   JNTL                     13.330,00
--   P&G (cód. 2453)          14.500,00
--   COLGATE                  15.860,00
--   P&G (cód. 29)            19.220,00   <<<
--   GILLETTE                 29.390,00
--                           ──────────
--   soma                    100.000,00
--
--   100.000,00 é exatamente a linha VERBAS MARGEM da planilha SEM filtro.
--   19.220,00 é exatamente a da planilha COM filtro do fornecedor 29.
--
--   Ou seja: a verba do fornecedor entra INTEIRA, não rateada -- porque ela É dele.
--   (Note que a P&G tem DOIS códigos de fornecedor, 29 e 2453. Filtrar por um não traz o
--   outro, e isso vale saber antes de alguém estranhar o número.)
--
-- FECH-RESULTADO SOME POR UM DEFEITO, NÃO POR UMA REGRA
--   7 lançamentos, R$ 13.579.698,32, e centro de custo NULO -- a consulta 3 devolveu
--   "(sem rateio)". O filtro da 9815 faz
--
--       AND ( (codccprinc IN (90) AND CODFORNEC IN (29)) OR (codccprinc NOT IN (90)) )
--
--   e com `codccprinc` nulo, `NULL NOT IN (90)` não é verdadeiro -- é nulo. A linha é
--   descartada em silêncio. Atinge QUALQUER lançamento sem rateio de centro de custo.
--
--   O estrago aqui é limitado porque FECH-RESULTADO fica DEPOIS do LUCRO LIQUIDO, no bloco
--   informativo, e não entra em totalizador. Mas o mecanismo não sabe disso -- ver a
--   consulta 4 da dc57, que procura o mesmo caso na filial 7 DENTRO do bloco operacional.
--
-- O QUE CONTINUA SEM RESPOSTA: O CENTRO 25
--   A condição no SQL é
--
--       AND ( (codccprinc = 25 and 29 in (29)) or (codccprinc <> 25) )
--
--   e `29 in (29)` é o fornecedor selecionado dentro da lista dos selecionados: SEMPRE
--   VERDADEIRO. Pelo texto, a EQUIPE P&G entraria inteira para QUALQUER fornecedor filtrado.
--
--   Em agosto/2026 na filial 27 o centro 25 não teve movimento -- ele não aparece em nenhuma
--   das duas planilhas. O mês não prova nem desmente, e a dc57 escolhe um terreno melhor.
