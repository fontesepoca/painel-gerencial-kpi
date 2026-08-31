-- ============================================================================
-- INCREMENTO 9b - o defeito da filial unica chega a MUDAR uma linha do DRE?
--
-- A inc9 provou que o subselect CCC, filtrado por FIN.CODFILIAL IN ('25'),
-- descobre menos pares (conta, centro de custo) que a lista completa.
--
-- Mas a linha do DRE em C. Custo Principal NAO e o centro de custo: e o
-- CENTRO DE CUSTO PRINCIPAL, os dois primeiros digitos. O CCC so serve para
-- descobrir quais principais cada conta alcanca. Perder o par
-- (3000016, '2801.243') nao muda nada se a mesma conta ja alcanca o
-- principal '28' por outro centro de custo presente na filial 25.
--
-- Esta consulta compara o que realmente vira linha: o conjunto distinto de
-- (CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF), com uma filial contra tres.
--
-- ZERO LINHAS = o defeito nao alcanca o relatorio. Uso a lista completa,
--               fico correto por dentro e identico por fora.
-- LINHAS      = a 9815 perde linhas inteiras do DRE, e a decisao e sua.
--
-- Cenario: 01/08 a 27/08/2026, competencia, filiais 7/12/25 (o mesmo do
-- levantamento). Rodar como SCRIPT (F5).
-- ============================================================================

WITH so_ultima AS (
  SELECT DISTINCT
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.codccprinc,99),99) AS CODGRUCONTA,
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.DescCCPrinc,'NAO USA/NAO INFORMADO'),'NAO USA/NAO INFORMADO') AS GRUPO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'RESULTADO OPERACIONAL')) THEN 'S' ELSE 'N' END AS AntesRO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'LUCRO LIQUIDO')) THEN 'S' ELSE 'N' END AS AntesLL
    FROM EPCPARDRE PAR, PCCONTA CT, PCCENTROCUSTO CC,
         (SELECT codconta, codigocentrocusto FROM PCCONTACENTROCUSTO
           UNION
          SELECT FIN.CODCONTA, RC.CodigoCentroCusto
            FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
           WHERE FIN.CODCONTA = CT.CODCONTA
             AND CT.GRUPOCONTA >= 200
             AND FIN.CODFILIAL IN ('25')
             AND FIN.RECNUM = RC.RECNUM
             AND FIN.CODCONTA = RC.CODCONTA
             AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
             AND FIN.dtcompetencia BETWEEN To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
         ) CCC,
         (SELECT codccprinc, (SELECT descricao FROM PCCENTROCUSTO WHERE codigocentrocusto = CCP.CodPrinc) AS DescCCPrinc
            FROM (SELECT SUBSTR(codigocentrocusto,1,2) AS CODCCPRINC, min(codigocentrocusto) AS CodPrinc
                    FROM PCCENTROCUSTO WHERE codigocentrocusto NOT LIKE '%.%'
                   GROUP BY SUBSTR(codigocentrocusto,1,2)) CCP) CCPrinc
   WHERE par.codgruconta = CT.codconta (+)
     AND ct.codconta = ccc.codconta (+)
     AND ccc.codigocentrocusto = cc.codigocentrocusto (+)
     AND SUBSTR(cc.codigocentrocusto,1,2) = CCPrinc.codccprinc (+)
     AND par.codgruconta > 0
),
todas_filiais AS (
  SELECT DISTINCT
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.codccprinc,99),99) AS CODGRUCONTA,
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.DescCCPrinc,'NAO USA/NAO INFORMADO'),'NAO USA/NAO INFORMADO') AS GRUPO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'RESULTADO OPERACIONAL')) THEN 'S' ELSE 'N' END AS AntesRO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'LUCRO LIQUIDO')) THEN 'S' ELSE 'N' END AS AntesLL
    FROM EPCPARDRE PAR, PCCONTA CT, PCCENTROCUSTO CC,
         (SELECT codconta, codigocentrocusto FROM PCCONTACENTROCUSTO
           UNION
          SELECT FIN.CODCONTA, RC.CodigoCentroCusto
            FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
           WHERE FIN.CODCONTA = CT.CODCONTA
             AND CT.GRUPOCONTA >= 200
             AND FIN.CODFILIAL IN ('7','12','25')
             AND FIN.RECNUM = RC.RECNUM
             AND FIN.CODCONTA = RC.CODCONTA
             AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
             AND FIN.dtcompetencia BETWEEN To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
         ) CCC,
         (SELECT codccprinc, (SELECT descricao FROM PCCENTROCUSTO WHERE codigocentrocusto = CCP.CodPrinc) AS DescCCPrinc
            FROM (SELECT SUBSTR(codigocentrocusto,1,2) AS CODCCPRINC, min(codigocentrocusto) AS CodPrinc
                    FROM PCCENTROCUSTO WHERE codigocentrocusto NOT LIKE '%.%'
                   GROUP BY SUBSTR(codigocentrocusto,1,2)) CCP) CCPrinc
   WHERE par.codgruconta = CT.codconta (+)
     AND ct.codconta = ccc.codconta (+)
     AND ccc.codigocentrocusto = cc.codigocentrocusto (+)
     AND SUBSTR(cc.codigocentrocusto,1,2) = CCPrinc.codccprinc (+)
     AND par.codgruconta > 0
)
SELECT NVL(u.CODGRUCONTA, t.CODGRUCONTA) AS CODGRUCONTA,
       NVL(u.GRUPO,       t.GRUPO)       AS GRUPO,
       NVL(u.AntesRO,     t.AntesRO)     AS ANTESRO,
       NVL(u.AntesLL,     t.AntesLL)     AS ANTESLL,
       CASE WHEN u.CODGRUCONTA IS NULL THEN 'linha que a 9815 PERDE'
            ELSE 'linha a mais na 9815' END AS DIVERGENCIA
  FROM so_ultima u
  FULL OUTER JOIN todas_filiais t
    ON  NVL(u.CODGRUCONTA,'~') = NVL(t.CODGRUCONTA,'~')
    AND NVL(u.GRUPO,'~')       = NVL(t.GRUPO,'~')
    AND u.AntesRO = t.AntesRO
    AND u.AntesLL = t.AntesLL
 WHERE u.CODGRUCONTA IS NULL OR t.CODGRUCONTA IS NULL
    OR (u.GRUPO IS NULL) <> (t.GRUPO IS NULL)
 ORDER BY 1, 2
