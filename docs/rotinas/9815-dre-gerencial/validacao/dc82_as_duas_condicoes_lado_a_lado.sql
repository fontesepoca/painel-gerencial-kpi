-- dc82 — a condição do centro dedicado: a dela e a nossa, no mesmo lançamento
--
-- ONDE A INVESTIGAÇÃO CHEGOU
--
--   nossa apuração SEM filtro ......... -152.019,72   (igual à consulta literal dela)
--   nossa apuração COM filtro ......... -149.459,80   (deduzido do valor exibido)
--   consulta literal dela COM filtro .. -152.019,72   (dc80, 346 registros)
--
-- A diferença é -2.559,92 e tem nome: o RECNUM 20734171, centro 4101.050. **A nossa
-- condição do filtro o remove; a dela não.** Os dois lançamentos de mesmo valor —
-- 20734126 e 20734171 — são o par perfeito para o teste: um fica dos dois lados.
--
-- POR QUE AS DUAS CONDIÇÕES NÃO SÃO EQUIVALENTES
--
-- A 9815 compara o centro PRINCIPAL, que tem dois dígitos:
--
--     (CCPrinc.codccprinc = 25 and 29 in (29)) or (CCPrinc.codccprinc <> 25)
--
-- Nós comparamos o centro COMPLETO com a tabela de vínculo, por prefixo:
--
--     NOT EXISTS (... cc.CodigoCentroCusto LIKE D.CODCENTRO || '%' ...)
--     OR EXISTS  (... AND D.CODFORNEC IN (29))
--
-- São colunas diferentes de tabelas diferentes, e uma delas pode ser NULL onde a outra
-- não é. Esta consulta mostra, para os dois lançamentos, o valor de cada peça e o
-- veredito de cada condição — a dela e a nossa, lado a lado.
--
-- Rode na mesma sessão do ALTER SESSION da dc80.

SELECT FIN.RECNUM,
       RC.CodigoCentroCusto                  AS CENTRO_DO_RATEIO,
       CC.CodigoCentroCusto                  AS CENTRO_CASADO,
       CCPrinc.codccprinc                    AS CCPRINC,
       CT.usarateiocentrocusto               AS USA_RATEIO,
       DECODE(RC.valor, NULL,
              NVL(FIN.VPAGO,0) * (-1),
              NVL(RC.valor, FIN.VPAGO) * (-1)) AS VPAGO,

       -- O veredito da 9815: compara o PRINCIPAL com 25.
       CASE WHEN (CCPrinc.codccprinc = 25 AND 29 IN (29))
                  OR (CCPrinc.codccprinc <> 25)
            THEN 'PASSA' ELSE 'SAI' END      AS CONDICAO_9815,

       -- O nosso: compara o centro COMPLETO com a tabela de vínculo.
       CASE WHEN NOT EXISTS (SELECT 1 FROM TAB_WEB_CENTROC_FORNEC D
                              WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%'
                                AND D.DTINATIVACAO IS NULL)
                  OR EXISTS (SELECT 1 FROM TAB_WEB_CENTROC_FORNEC D
                              WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%'
                                AND D.DTINATIVACAO IS NULL
                                AND D.CODFORNEC IN (29))
            THEN 'PASSA' ELSE 'SAI' END      AS CONDICAO_WEB,

       -- E a primeira condição, a do centro 90, que é igual nos dois.
       CASE WHEN (CCPrinc.codccprinc IN (90) AND FIN.CODFORNEC IN (29))
                  OR (CCPrinc.codccprinc NOT IN (90))
            THEN 'PASSA' ELSE 'SAI' END      AS CONDICAO_DO_90,

       SUBSTR(TRIM(FIN.HISTORICO), 1, 45)    AS HISTORICO
  FROM PCCONTA CT,
       PCCENTROCUSTO CC,
       PCRATEIOCENTROCUSTO RC,
       (SELECT RECNUM, CODFILIAL, dtcompetencia, DTPAGTO,
               NVL(VPAGO, VALOR) AS VPAGO, codconta, historico, CODFORNEC
          FROM PCLANC
         WHERE DTPAGTO IS NOT NULL) FIN,
       (SELECT '99' AS codccprinc FROM DUAL
        UNION
        SELECT SUBSTR(CodigoCentroCusto,1,2)
          FROM PCCENTROCUSTO
         WHERE CodigoCentroCusto NOT LIKE '%.%'
         GROUP BY SUBSTR(CodigoCentroCusto,1,2)) CCPrinc
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.RECNUM   = RC.RECNUM   (+)
   AND FIN.CODCONTA = RC.CODCONTA (+)
   AND RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
   AND SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
   AND FIN.RECNUM IN (20734126, 20734171)
 ORDER BY FIN.RECNUM;

-- ═══════════════════════════════════════════════════════════════════════════
-- E O TAMANHO DO ESTRAGO, na conta inteira
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Quantos lançamentos a NOSSA condição remove e a dela mantém — e quanto isso vale.
-- Se o número bater com os -2.559,92 e 1 registro, a conta fecha e o defeito está
-- isolado. Se for maior, ele existe em outras linhas que ainda não comparamos.

SELECT COUNT(*)                                                  AS QDE,
       SUM(VPAGO)                                                AS VALOR
  FROM (
        SELECT DECODE(RC.valor, NULL,
                      NVL(FIN.VPAGO,0) * (-1),
                      NVL(RC.valor, FIN.VPAGO) * (-1)) AS VPAGO
          FROM PCCONTA CT,
               PCCENTROCUSTO CC,
               PCRATEIOCENTROCUSTO RC,
               (SELECT RECNUM, CODFILIAL, dtcompetencia, DTPAGTO,
                       NVL(VPAGO, VALOR) AS VPAGO, codconta, historico, CODFORNEC
                  FROM PCLANC
                 WHERE DTPAGTO IS NOT NULL) FIN,
               (SELECT '99' AS codccprinc FROM DUAL
                UNION
                SELECT SUBSTR(CodigoCentroCusto,1,2)
                  FROM PCCENTROCUSTO
                 WHERE CodigoCentroCusto NOT LIKE '%.%'
                 GROUP BY SUBSTR(CodigoCentroCusto,1,2)) CCPrinc
         WHERE FIN.CODCONTA = CT.CODCONTA
           AND CT.GRUPOCONTA >= 200
           AND FIN.CODFILIAL IN ('7')
           AND FIN.RECNUM   = RC.RECNUM   (+)
           AND FIN.CODCONTA = RC.CODCONTA (+)
           AND RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
           AND SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
           AND FIN.dtcompetencia BETWEEN To_Date('01/08/2026','dd/mm/yyyy')
                                     AND To_Date('31/08/2026','dd/mm/yyyy')
           -- passa na dela
           AND ((CCPrinc.codccprinc = 25 AND 29 IN (29)) OR (CCPrinc.codccprinc <> 25))
           -- e NÃO passa na nossa
           AND NOT ( NOT EXISTS (SELECT 1 FROM TAB_WEB_CENTROC_FORNEC D
                                  WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%'
                                    AND D.DTINATIVACAO IS NULL)
                     OR EXISTS (SELECT 1 FROM TAB_WEB_CENTROC_FORNEC D
                                 WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%'
                                   AND D.DTINATIVACAO IS NULL
                                   AND D.CODFORNEC IN (29)) )
       );
