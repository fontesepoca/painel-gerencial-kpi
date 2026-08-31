-- ============================================================================
-- INCREMENTO 9h - de qual filial vem a despesa de TRANSPORTE T - (28)?
--
-- A inc9e mostrou que o principal 28 entra na estrutura com '7' e com '12',
-- mas nao com '25'. Falta saber como os R$ 1.575.853,48 se dividem: a
-- exportacao traz o total de 7 e 12 juntas, e a inc9d o total das tres.
--
-- Quebra o mesmo valor por filial e por mes, com a expressao da rotina:
--
--   DECODE(RC.valor, NULL, NVL(FIN.VPAGO,0)*(-1), NVL(RC.valor,FIN.VPAGO)*(-1))
--
-- A soma da coluna VLREALIZADO das filiais 7 e 12 tem que dar exatamente
-- (1.575.853,48) - o total que a exportacao de 7 e 12 mostra na linha
-- TRANSPORTE T - (28). Se a filial 25 aparecer com valor, minha leitura de
-- que ela nao contribui esta errada.
--
-- Cenario: 01/06 a 31/07/2026, competencia, filiais 7/12/25.
-- Toca so PCLANC/PCRATEIOCENTROCUSTO. Rodar como SCRIPT (F5).
-- ============================================================================

SELECT FIN.CODFILIAL                                  AS CODFILIAL,
       TO_CHAR(FIN.DTCOMPETENCIA, 'mm/yyyy')          AS MES_ANO,
       COUNT(*)                                       AS QDE_LANCAMENTOS,
       ROUND(SUM(DECODE(RC.valor, NULL, NVL(FIN.VPAGO,0)*(-1),
                                        NVL(RC.valor,FIN.VPAGO)*(-1))), 2) AS VLREALIZADO
  FROM PCCONTA CT,
       PCRATEIOCENTROCUSTO RC,
       (SELECT RECNUM, CODFILIAL, CODCONTA, DTCOMPETENCIA,
               NVL(VPAGO,VALOR) AS VPAGO
          FROM PCLANC WHERE DTPAGTO IS NOT NULL) FIN
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('7','12','25')
   AND FIN.RECNUM = RC.RECNUM
   AND FIN.CODCONTA = RC.CODCONTA
   -- o centro de custo principal e o par de digitos da frente
   AND SUBSTR(RC.CodigoCentroCusto, 1, 2) = '28'
   -- bloco operacional, onde a linha existe
   AND FIN.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                          AND id < (SELECT ID FROM EPCPARDRE
                                     WHERE upper(grupo) LIKE 'RESULTADO OPERACIONAL'))
   AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
   AND NOT EXISTS (SELECT recnumadiantamento FROM pclancadiantfornec
                    WHERE recnumpagto IS NOT NULL AND dtestorno IS NULL
                      AND recnumadiantamento = FIN.recnum)
   AND FIN.CODCONTA NOT IN (SELECT codconta FROM EPCPARDRE_NAOEXIBIR)
   AND FIN.DTCOMPETENCIA BETWEEN To_Date('01/06/2026','dd/mm/yyyy')
                             AND To_Date('31/07/2026','dd/mm/yyyy')
 GROUP BY ROLLUP(FIN.CODFILIAL, TO_CHAR(FIN.DTCOMPETENCIA, 'mm/yyyy'))
 ORDER BY 1, 2
