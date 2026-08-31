-- ============================================================================
-- INCREMENTO 9d - quanto dinheiro esta fora do bloco operacional da 9815?
--
-- A inc9c provou que a 9815, com mais de uma filial, perde 9 centros de custo
-- principais do bloco operacional de C. Custo Principal. Confirmado contra a
-- exportacao de 01/06 a 31/07/2026: nenhum dos nove aparece no xlsx.
--
-- Falta o numero. Esta consulta soma a despesa operacional por centro de custo
-- principal, no mesmo periodo e nas mesmas filiais, reproduzindo a expressao
-- de valor da rotina:
--
--   DECODE(RC.valor, NULL, NVL(FIN.VPAGO,0)*(-1), NVL(RC.valor,FIN.VPAGO)*(-1))
--
-- Os UNION ALL por filial da rotina viraram um IN unico - e so um laco do
-- Delphi sobre o mesmo filtro, sem dependencia entre os blocos.
--
-- Le assim: as linhas marcadas 'FORA da 9815' sao o que o bloco operacional
-- deixou de somar. Compare o total delas com o Sub-Total da exportacao.
--
-- Toca so PCLANC/PCRATEIOCENTROCUSTO - nao passa por PCNFSAID nem PCMOV, entao
-- nao tem o custo da apuracao inteira. Rodar como SCRIPT (F5).
-- ============================================================================

WITH perdidos AS (
  SELECT '27' AS cc FROM DUAL UNION ALL SELECT '28' FROM DUAL UNION ALL
  SELECT '30' FROM DUAL UNION ALL SELECT '31' FROM DUAL UNION ALL
  SELECT '34' FROM DUAL UNION ALL SELECT '37' FROM DUAL UNION ALL
  SELECT '39' FROM DUAL UNION ALL SELECT '40' FROM DUAL UNION ALL
  SELECT '41' FROM DUAL
),
movimento AS (
  SELECT NVL(CCPrinc.codccprinc,'99')                          AS CODCCPRINC,
         NVL(CCPrinc.DescCCPrinc,'NAO USA/NAO INFORMADO')      AS DESCCCPRINC,
         DECODE(RC.valor, NULL, NVL(FIN.VPAGO,0)*(-1),
                                NVL(RC.valor,FIN.VPAGO)*(-1))  AS VPAGO
    FROM PCCONTA CT, PCGRUPO GR, PCCENTROCUSTO CC, PCRATEIOCENTROCUSTO RC,
         (SELECT RECNUM, CODFILIAL, CODCONTA, DTCOMPETENCIA, DTVENC,
                 NVL(VPAGO,VALOR) AS VPAGO
            FROM PCLANC WHERE DTPAGTO IS NOT NULL) FIN,
         (SELECT '99' AS codccprinc, 'NAO USA/NAO INFORMADO' AS DescCCPrinc FROM DUAL
           UNION
          SELECT codccprinc, (SELECT descricao FROM PCCENTROCUSTO WHERE CodigoCentroCusto = CCP.CodPrinc) AS DescCCPrinc
            FROM (SELECT SUBSTR(CodigoCentroCusto,1,2) AS CODCCPRINC, min(CodigoCentroCusto) AS CodPrinc
                    FROM PCCENTROCUSTO WHERE CodigoCentroCusto NOT LIKE '%.%'
                   GROUP BY SUBSTR(CodigoCentroCusto,1,2)) CCP) CCPrinc
   WHERE FIN.CODCONTA = CT.CODCONTA
     AND CT.GRUPOCONTA >= 200
     AND FIN.CODFILIAL IN ('7','12','25')
     AND FIN.RECNUM = RC.RECNUM (+)
     AND FIN.CODCONTA = RC.CODCONTA (+)
     AND CT.grupoconta = GR.codgrupo (+)
     AND RC.CodigoCentroCusto = CC.CodigoCentroCusto (+)
     AND SUBSTR(CC.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
     -- so o bloco operacional: AntesRO = 'S'
     AND FIN.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                            AND id < (SELECT ID FROM EPCPARDRE
                                       WHERE upper(grupo) LIKE 'RESULTADO OPERACIONAL'))
     AND FIN.dtcompetencia BETWEEN To_Date('01/06/2026','dd/mm/yyyy')
                               AND To_Date('31/07/2026','dd/mm/yyyy')
)
SELECT m.CODCCPRINC,
       m.DESCCCPRINC,
       COUNT(*)                  AS QDE_LANCAMENTOS,
       ROUND(SUM(m.VPAGO), 2)    AS VLREALIZADO,
       CASE WHEN p.cc IS NULL THEN 'aparece na 9815'
            ELSE 'FORA da 9815' END AS SITUACAO
  FROM movimento m
  LEFT JOIN perdidos p ON p.cc = m.CODCCPRINC
 GROUP BY m.CODCCPRINC, m.DESCCCPRINC, CASE WHEN p.cc IS NULL THEN 'aparece na 9815' ELSE 'FORA da 9815' END
 ORDER BY 5, 4
