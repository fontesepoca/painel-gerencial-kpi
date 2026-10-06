-- ============================================================================
-- INCREMENTO 8 - as colunas de data carregam hora?
--
-- Decide se a execucao mensal da 9815 perde movimento. O mes 1 vai ate
-- 30/06 as 00:00 e o mes 2 comeca em 01/07 as 00:00: se DTSAIDA guardar hora,
-- tudo que aconteceu em 30/06 depois da meia-noite fica de fora dos dois.
--
-- Se COM_HORA vier 0 em todas as linhas, o recorte mensal e exato e a
-- otimizacao de uma passada so e segura. Qualquer valor > 0 e movimento que a
-- rotina antiga perde na virada de mes.
--
-- Barato: le so o periodo do cenario.
-- ============================================================================

SELECT 'PCNFSAID.DTSAIDA' AS COLUNA,
       COUNT(*)                                                          AS LINHAS,
       SUM(CASE WHEN NF.DTSAIDA <> TRUNC(NF.DTSAIDA) THEN 1 ELSE 0 END)  AS COM_HORA,
       SUM(CASE WHEN NF.DTSAIDA = TO_DATE('30/06/2026','dd/mm/yyyy')
                     AND NF.DTSAIDA <> TRUNC(NF.DTSAIDA) THEN 1 ELSE 0 END) AS NA_VIRADA
  FROM PCNFSAID NF
 WHERE NF.CODFILIAL IN ('7','12','25')
   AND NF.DTSAIDA >= TO_DATE('01/06/2026','dd/mm/yyyy')
   AND NF.DTSAIDA <  TO_DATE('01/08/2026','dd/mm/yyyy')
UNION ALL
SELECT 'PCNFENT.DTENT',
       COUNT(*),
       SUM(CASE WHEN NFE.DTENT <> TRUNC(NFE.DTENT) THEN 1 ELSE 0 END),
       SUM(CASE WHEN NFE.DTENT = TO_DATE('30/06/2026','dd/mm/yyyy')
                     AND NFE.DTENT <> TRUNC(NFE.DTENT) THEN 1 ELSE 0 END)
  FROM PCNFENT NFE
 WHERE NFE.CODFILIAL IN ('7','12','25')
   AND NFE.DTENT >= TO_DATE('01/06/2026','dd/mm/yyyy')
   AND NFE.DTENT <  TO_DATE('01/08/2026','dd/mm/yyyy')
UNION ALL
SELECT 'PCLANC.DTPAGTO',
       COUNT(*),
       SUM(CASE WHEN L.DTPAGTO <> TRUNC(L.DTPAGTO) THEN 1 ELSE 0 END),
       SUM(CASE WHEN L.DTPAGTO = TO_DATE('30/06/2026','dd/mm/yyyy')
                     AND L.DTPAGTO <> TRUNC(L.DTPAGTO) THEN 1 ELSE 0 END)
  FROM PCLANC L
 WHERE L.CODFILIAL IN ('7','12','25')
   AND L.DTPAGTO >= TO_DATE('01/06/2026','dd/mm/yyyy')
   AND L.DTPAGTO <  TO_DATE('01/08/2026','dd/mm/yyyy')
