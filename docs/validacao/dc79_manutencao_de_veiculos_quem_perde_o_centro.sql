-- dc79 — MANUTENCAO DE VEICULOS: qual lançamento fica sem CENTRO PRINCIPAL
--
-- O QUE JÁ ESTÁ PROVADO
--
--   · a conta 3000067 vale -149.459,80 no período, com -965,18 de exclusivo (centro 25);
--   · a 9815 escreve -13.153,40 com o fornecedor 29 e -6.515,20 com o 2453;
--   · nós escrevemos -13.172,30 e -6.525,31.
--
-- Invertendo a fórmula do rateio nos DOIS fornecedores, a base que a 9815 usou é
-- -148.264,68 e -148.264,51 — a mesma, dentro do arredondamento de centavos das
-- planilhas. A nossa é -148.494,62. A diferença é R$ 230,02, e ela não depende da
-- participação: é um LANÇAMENTO que sai da consulta dela e fica na nossa.
--
-- A HIPÓTESE QUE ESTA QUERY TESTA
--
-- As duas condições do filtro comparam `CCPrinc.codccprinc`, que vem de uma junção
-- EXTERNA. Quando ela não casa, o valor é NULL — e aí:
--
--     (NULL IN (90)) OR (NULL NOT IN (90))   →   NULL   →   a linha SAI
--
-- Um lançamento sem centro principal é descartado por qualquer fornecedor, o que explica
-- a base ser a mesma nos dois. Falta saber se ele existe e quanto vale.
--
-- Rode as três consultas e me devolva o resultado das três.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. OS LANÇAMENTOS DA CONTA, COM O CENTRO PRINCIPAL QUE CADA JUNÇÃO PRODUZ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `CCPRINC_9815` é o da rotina: a lista de principais é montada só com centros SEM
-- ponto. `CENTRO_DO_RATEIO` é o que o lançamento aponta, e `CENTRO_CASADO` é o que a
-- junção com PCCENTROCUSTO achou — quando ele vem nulo, o centro apontado não existe
-- no cadastro.
--
-- Esperado: ou nenhuma linha, e a hipótese cai, ou uma linha de -230,00.

SELECT FIN.RECNUM,
       RC.CodigoCentroCusto                       AS CENTRO_DO_RATEIO,
       CC.CodigoCentroCusto                       AS CENTRO_CASADO,
       CCPrinc.codccprinc                         AS CCPRINC_9815,
       FIN.CODFORNEC,
       DECODE(RC.valor, NULL,
              NVL(FIN.VPAGO,0) * (-1),
              NVL(RC.valor, FIN.VPAGO) * (-1))    AS VPAGO,
       SUBSTR(TRIM(FIN.HISTORICO), 1, 60)         AS HISTORICO
  FROM PCCONTA CT,
       PCGRUPO GR,
       PCCENTROCUSTO CC,
       PCRATEIOCENTROCUSTO RC,
       (SELECT RECNUM, CODFILIAL, dtcompetencia, DTVENC, DTPAGTO,
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
   AND CT.grupoconta = GR.codgrupo (+)
   AND RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
   AND SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
   AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
   AND NOT EXISTS (SELECT recnumadiantamento FROM pclancadiantfornec
                    WHERE recnumpagto IS NOT NULL AND dtestorno IS NULL
                      AND recnumadiantamento = fin.recnum)
   AND FIN.dtcompetencia BETWEEN To_Date('01/08/2026','dd/mm/yyyy')
                             AND To_Date('31/08/2026','dd/mm/yyyy')
   AND FIN.CODCONTA = 3000067
   AND CCPrinc.codccprinc IS NULL          -- <<< só os que perdem o centro principal
 ORDER BY VPAGO;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. O MESMO TOTAL, COM E SEM AS DUAS CONDIÇÕES DO FILTRO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Se a hipótese estiver certa, TOTAL_COM_FILTRO fica R$ 230,02 acima (menos negativo)
-- de TOTAL_SEM_FILTRO, e a diferença é exatamente o que falta para fechar com a 9815.

SELECT SUM(VPAGO)                                            AS TOTAL_SEM_FILTRO,
       SUM(CASE WHEN CCPRINC IS NULL THEN 0 ELSE VPAGO END)  AS TOTAL_COM_FILTRO,
       SUM(CASE WHEN CCPRINC IS NULL THEN VPAGO ELSE 0 END)  AS O_QUE_SAI,
       COUNT(*)                                              AS QDE,
       SUM(CASE WHEN CCPRINC IS NULL THEN 1 ELSE 0 END)      AS QDE_SEM_PRINCIPAL
  FROM (
        SELECT CCPrinc.codccprinc AS CCPRINC,
               DECODE(RC.valor, NULL,
                      NVL(FIN.VPAGO,0) * (-1),
                      NVL(RC.valor, FIN.VPAGO) * (-1)) AS VPAGO
          FROM PCCONTA CT,
               PCGRUPO GR,
               PCCENTROCUSTO CC,
               PCRATEIOCENTROCUSTO RC,
               (SELECT RECNUM, CODFILIAL, dtcompetencia, DTVENC, DTPAGTO,
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
           AND CT.grupoconta = GR.codgrupo (+)
           AND RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
           AND SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
           AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
           AND NOT EXISTS (SELECT recnumadiantamento FROM pclancadiantfornec
                            WHERE recnumpagto IS NOT NULL AND dtestorno IS NULL
                              AND recnumadiantamento = fin.recnum)
           AND FIN.dtcompetencia BETWEEN To_Date('01/08/2026','dd/mm/yyyy')
                                     AND To_Date('31/08/2026','dd/mm/yyyy')
           AND FIN.CODCONTA = 3000067
       );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SE A HIPÓTESE CAIR: TODOS OS LANÇAMENTOS DE -230,00 DA CONTA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A diferença é de R$ 230,02 ± 0,11, e a conta tem vários lançamentos de exatamente
-- -230,00. Esta lista mostra o que cada um tem de particular — centro, fornecedor,
-- se é rateado — para procurar o que faria UM deles sair.

SELECT FIN.RECNUM,
       RC.CodigoCentroCusto                    AS CENTRO,
       CCPrinc.codccprinc                      AS CCPRINC,
       FIN.CODFORNEC,
       (SELECT COUNT(*) FROM PCRATEIOCENTROCUSTO R2
         WHERE R2.RECNUM = FIN.RECNUM AND R2.CODCONTA = FIN.CODCONTA) AS PARTES_DO_RATEIO,
       DECODE(RC.valor, NULL,
              NVL(FIN.VPAGO,0) * (-1),
              NVL(RC.valor, FIN.VPAGO) * (-1)) AS VPAGO,
       SUBSTR(TRIM(FIN.HISTORICO), 1, 50)      AS HISTORICO
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
   AND FIN.CODFILIAL IN ('7')
   AND FIN.RECNUM   = RC.RECNUM   (+)
   AND FIN.CODCONTA = RC.CODCONTA (+)
   AND RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
   AND SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
   AND FIN.dtcompetencia BETWEEN To_Date('01/08/2026','dd/mm/yyyy')
                             AND To_Date('31/08/2026','dd/mm/yyyy')
   AND FIN.CODCONTA = 3000067
   AND ABS(DECODE(RC.valor, NULL,
                  NVL(FIN.VPAGO,0) * (-1),
                  NVL(RC.valor, FIN.VPAGO) * (-1))) BETWEEN 229.5 AND 230.5
 ORDER BY FIN.RECNUM;
