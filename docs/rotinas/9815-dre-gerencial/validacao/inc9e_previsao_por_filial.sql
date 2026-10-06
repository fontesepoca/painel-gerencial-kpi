-- ============================================================================
-- INCREMENTO 9e - PREVISAO, registrada antes do experimento
--
-- Se o subselect CCC realmente usa uma filial so, entao a estrutura de
-- C. Custo Principal muda conforme QUAL filial sobra - e nao conforme quais
-- filiais foram selecionadas.
--
-- Esta consulta produz, para cada filial isolada, o conjunto de linhas que a
-- estrutura geraria. E a previsao contra a qual o experimento sera conferido:
--
--   Rodar a 9815 com as filiais 7 e 12 (SEM a 25), competencia,
--   01/06 a 31/07/2026, analise por C. Custo Principal.
--
-- Previsao:
--   1. o trace do DB Moon mostra CODFILIAL IN ('12') no subselect CCC;
--   2. a exportacao traz exatamente as linhas listadas aqui com
--      FILIAL_DO_CCC = '12' - nem mais, nem menos;
--   3. esse conjunto NAO e um subconjunto do que veio com 7/12/25.
--
-- Qualquer um dos tres falhando derruba a leitura e a gente recomeca.
--
-- Periodo igual ao da exportacao de dois meses. Rodar como SCRIPT (F5).
-- ============================================================================

  SELECT DISTINCT
         '7' AS FILIAL_DO_CCC,
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.codccprinc,99),99) AS CODGRUCONTA,
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.DescCCPrinc,'NAO USA/NAO INFORMADO'),'NAO USA/NAO INFORMADO') AS GRUPO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'RESULTADO OPERACIONAL')) THEN 'S' ELSE 'N' END AS ANTESRO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'LUCRO LIQUIDO')) THEN 'S' ELSE 'N' END AS ANTESLL
    FROM EPCPARDRE PAR, PCCONTA CT, PCCENTROCUSTO CC,
         (SELECT codconta, codigocentrocusto FROM PCCONTACENTROCUSTO
           UNION
          SELECT FIN.CODCONTA, RC.CodigoCentroCusto
            FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
           WHERE FIN.CODCONTA = CT.CODCONTA
             AND CT.GRUPOCONTA >= 200
             AND FIN.CODFILIAL IN ('7')
             AND FIN.RECNUM = RC.RECNUM
             AND FIN.CODCONTA = RC.CODCONTA
             AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
             AND FIN.dtcompetencia BETWEEN To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
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
 UNION ALL
  SELECT DISTINCT
         '12' AS FILIAL_DO_CCC,
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.codccprinc,99),99) AS CODGRUCONTA,
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.DescCCPrinc,'NAO USA/NAO INFORMADO'),'NAO USA/NAO INFORMADO') AS GRUPO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'RESULTADO OPERACIONAL')) THEN 'S' ELSE 'N' END AS ANTESRO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'LUCRO LIQUIDO')) THEN 'S' ELSE 'N' END AS ANTESLL
    FROM EPCPARDRE PAR, PCCONTA CT, PCCENTROCUSTO CC,
         (SELECT codconta, codigocentrocusto FROM PCCONTACENTROCUSTO
           UNION
          SELECT FIN.CODCONTA, RC.CodigoCentroCusto
            FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
           WHERE FIN.CODCONTA = CT.CODCONTA
             AND CT.GRUPOCONTA >= 200
             AND FIN.CODFILIAL IN ('12')
             AND FIN.RECNUM = RC.RECNUM
             AND FIN.CODCONTA = RC.CODCONTA
             AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
             AND FIN.dtcompetencia BETWEEN To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
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
 UNION ALL
  SELECT DISTINCT
         '25' AS FILIAL_DO_CCC,
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.codccprinc,99),99) AS CODGRUCONTA,
         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.DescCCPrinc,'NAO USA/NAO INFORMADO'),'NAO USA/NAO INFORMADO') AS GRUPO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'RESULTADO OPERACIONAL')) THEN 'S' ELSE 'N' END AS ANTESRO,
         CASE WHEN CT.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                AND id < (SELECT ID FROM EPCPARDRE WHERE upper(grupo) LIKE 'LUCRO LIQUIDO')) THEN 'S' ELSE 'N' END AS ANTESLL
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
             AND FIN.dtcompetencia BETWEEN To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
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
 ORDER BY 1, 2, 4, 5
