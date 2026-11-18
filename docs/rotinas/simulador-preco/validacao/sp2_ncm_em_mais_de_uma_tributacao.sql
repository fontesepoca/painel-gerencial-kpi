-- ============================================================================
-- sp2 — quantos NCMs caem em MAIS DE UMA tributação de CBS?
--
-- O SQL do simulador liga produto e CBS por NCM normalizado (só dígitos), num
-- LEFT JOIN. Um NCM em duas tributações devolve o MESMO produto duas vezes, uma
-- linha por tributação, e o preço futuro sai duplicado. Spec §7, Q1.
--
-- Somente leitura. Usa a mesma normalização do SQL de referência.
-- ============================================================================

-- ── 1. O resumo: quantos NCMs se repetem ─────────────────────────────────────
WITH tributacao_cbs AS (
  SELECT T.CODIGO_TRIBUTACAO,
         REGEXP_REPLACE(TO_CHAR(N.NCM), '[^0-9]', '') AS NCM_NORMALIZADO,
         NVL(T.PERC_CBS, 0)                           AS PERC_CBS
    FROM PCTRIBUTACAO T
    JOIN PCTRIBUTACAO_FILTRO_NCM N
      ON N.CODIGO_TRIBUTACAO = T.CODIGO_TRIBUTACAO
)
SELECT COUNT(DISTINCT NCM_NORMALIZADO)                          AS NCMS_NO_TOTAL,
       COUNT(DISTINCT CASE WHEN qtd > 1 THEN NCM_NORMALIZADO END) AS NCMS_REPETIDOS,
       COUNT(DISTINCT CASE WHEN qtd > 1 AND percs > 1
                           THEN NCM_NORMALIZADO END)             AS REPETIDOS_COM_PERC_DIFERENTE
  FROM (
    SELECT NCM_NORMALIZADO,
           COUNT(*)                 OVER (PARTITION BY NCM_NORMALIZADO) AS qtd,
           COUNT(DISTINCT PERC_CBS) OVER (PARTITION BY NCM_NORMALIZADO) AS percs
      FROM tributacao_cbs
  );

-- ── 2. O detalhe: quais são, e com que percentuais ───────────────────────────
-- Só se o bloco 1 trouxer NCMS_REPETIDOS > 0.
WITH tributacao_cbs AS (
  SELECT T.CODIGO_TRIBUTACAO,
         T.DESCRICAO_TRIBUTACAO,
         REGEXP_REPLACE(TO_CHAR(N.NCM), '[^0-9]', '') AS NCM_NORMALIZADO,
         NVL(T.PERC_CBS, 0)                           AS PERC_CBS
    FROM PCTRIBUTACAO T
    JOIN PCTRIBUTACAO_FILTRO_NCM N
      ON N.CODIGO_TRIBUTACAO = T.CODIGO_TRIBUTACAO
)
SELECT NCM_NORMALIZADO, CODIGO_TRIBUTACAO, DESCRICAO_TRIBUTACAO, PERC_CBS
  FROM tributacao_cbs
 WHERE NCM_NORMALIZADO IN (
         SELECT NCM_NORMALIZADO FROM tributacao_cbs
          GROUP BY NCM_NORMALIZADO HAVING COUNT(*) > 1)
 ORDER BY NCM_NORMALIZADO, CODIGO_TRIBUTACAO
 FETCH FIRST 200 ROWS ONLY;
