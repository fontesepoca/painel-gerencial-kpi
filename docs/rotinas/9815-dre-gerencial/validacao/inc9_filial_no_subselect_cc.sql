-- ============================================================================
-- INCREMENTO 9 - o subselect que descobre centros de custo usa UMA filial
--
-- Na consulta de estrutura de C.Custo Principal, o bloco que levanta quais
-- centros de custo existem filtra por FIN.CODFILIAL IN ('25') — apenas a
-- ultima filial selecionada —, enquanto o bloco de contas orfas logo abaixo
-- usa as tres. Tem cara de defeito do Delphi: a lista de filiais foi
-- sobrescrita em vez de acumulada.
--
-- Esta consulta responde se isso muda o resultado: compara os pares
-- (conta, centro de custo) descobertos com uma filial contra os descobertos
-- com as tres.
--
-- ZERO LINHAS  = nao muda nada; podemos usar a lista completa sem divergir.
-- LINHAS       = a 9815 esta perdendo centros de custo das filiais 7 e 12,
--                e a decisao de replicar ou corrigir e sua.
--
-- Cenario: 01/08 a 27/08/2026, competencia. Rodar como SCRIPT (F5).
-- ============================================================================

ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY';

WITH so_ultima AS (
  select codconta, codigocentrocusto from PCCONTACENTROCUSTO
   union
  SELECT  FIN.CODCONTA, RC.CodigoCentroCusto
    FROM  PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
   WHERE  FIN.CODCONTA = CT.CODCONTA
     AND  CT.GRUPOCONTA >= 200
     AND  FIN.CODFILIAL IN ('25')
     AND  FIN.RECNUM = RC.RECNUM
     AND  FIN.CODCONTA = RC.CODCONTA
     AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO'
     AND  FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
),
todas_filiais AS (
  select codconta, codigocentrocusto from PCCONTACENTROCUSTO
   union
  SELECT  FIN.CODCONTA, RC.CodigoCentroCusto
    FROM  PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
   WHERE  FIN.CODCONTA = CT.CODCONTA
     AND  CT.GRUPOCONTA >= 200
     AND  FIN.CODFILIAL IN ('7','12','25')
     AND  FIN.RECNUM = RC.RECNUM
     AND  FIN.CODCONTA = RC.CODCONTA
     AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO'
     AND  FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
)
SELECT NVL(u.CODCONTA, t.CODCONTA)                   AS CODCONTA,
       NVL(u.CODIGOCENTROCUSTO, t.CODIGOCENTROCUSTO) AS CENTRO_CUSTO,
       SUBSTR(NVL(u.CODIGOCENTROCUSTO, t.CODIGOCENTROCUSTO), 1, 2) AS CC_PRINCIPAL,
       CASE WHEN u.CODCONTA IS NULL THEN 'so com as 3 filiais'
            ELSE 'so com a filial 25' END            AS ONDE_APARECE
  FROM so_ultima u
  FULL OUTER JOIN todas_filiais t
    ON u.CODCONTA = t.CODCONTA
   AND u.CODIGOCENTROCUSTO = t.CODIGOCENTROCUSTO
 WHERE u.CODCONTA IS NULL OR t.CODCONTA IS NULL
 ORDER BY 3, 1, 2
