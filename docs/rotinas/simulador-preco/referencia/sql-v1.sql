-- ============================================================================
-- SQL do simulador de preço — VERSÃO 1, como foi entregue em 17/11/2026.
--
-- É uma primeira versão: o Gabriel avisou em 18/11/2026 que vem uma v2 com
-- correções (o ST fixo em zero e o CUSTOREP que nunca é alcançado, entre outras).
-- A v2 entra como sql-v2.sql AO LADO desta, e não por cima: o histórico do que
-- mudou entre as versões é o que explica uma mudança de número na tela.
--
-- NÃO EDITAR. É a referência contra a qual a versão da API e o recálculo da tela
-- são conferidos. Toda diferença entre este texto e
-- api-new-kpi/Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs tem de
-- estar listada na spec (docs/superpowers/specs/2026-11-18-simulador-de-preco-design.md §4).
-- ============================================================================

WITH TRIBUTACAO_CBS AS
(
    SELECT T.CODIGO_TRIBUTACAO,
           T.DESCRICAO_TRIBUTACAO,
           N.NCM,
           REGEXP_REPLACE(TO_CHAR(N.NCM), '[^0-9]', '') AS NCM_NORMALIZADO,
           NVL(T.PERC_CBS, 0) AS PERC_CBS
      FROM PCTRIBUTACAO T
      JOIN PCTRIBUTACAO_FILTRO_NCM N
        ON N.CODIGO_TRIBUTACAO = T.CODIGO_TRIBUTACAO
),
TRIBUTACAOGERAL AS
(
    SELECT P.CODPROD,
           P.DESCRICAO,
           PF.CHAVENATURAL AS TIPO_IMPOSTO,
           NVL(E.VLULTPCOMPRA, 0) AS VLULTPCOMPRA,
           NVL(PF.CUSTOREP, 0) AS CUSTOREP,
           NVL(TE.PERIPI, 0) AS PERCIPI,
           NVL(TE.PERCST, 0) AS PERCST,
           NVL(PF.PERC_BASE_RED, 0) AS PERC_BASE_RED_ENT,
           NVL(PF.PERCICMS_ENT, 0) AS PERCICMS_ENT,
           NVL(PF.PERCICMS_SAID, 0) AS PERCICMS_SAID,
           NVL(TE.PERPIS, NVL(P.PERPIS, 0)) AS PERPIS,
           NVL(TE.PERCOFINS, NVL(P.PERCOFINS, 0)) AS PERCOFINS,
           DECODE(
               NVL(F.USAFRETEFOBPORFORNEC, 'N'),
               'S', NVL(FF.PERCFRETEFOB, 0),
               NVL(TE.PERCFRETEFOB, 0)
           ) AS PERCFRETEFOB,
           TE.CODEXCECAOPISCOFINS AS CODEXCECAO,
           '1E' AS TIPOMOVIMENTACAO,
           TE.CODFISCALENT AS CODFISCAL,
           F.SUFRAMA,
           F.TIPOPESSOA,
           NVL(F.TIPOFORNEC, 'I') AS TIPOFORNEC,
           NVL(F.EQUIPINDUSTRIA, 'N') AS EQUIPINDUSTRIA,
           DECODE(
               NVL(P.CODFILIAL, '99'),
               '99', FIL.CODIGO,
               P.CODFILIAL
           ) AS CODFILIAL,
           :NUMREGIAO AS NUMREGIAO,
           P.CODEPTO,
           NVL(P.PRECIFICESTRANGEIRA, 'N') AS PRECIFICESTRANGEIRA
      FROM PCPRODUT P,
           PCTABTRIBENT TE,
           PCFILIAL FIL,
           PCFORNEC F,
           PCFORNECFILIAL FF,
           PCPRODFILIAL PF,
           PCCONSUM CON,
           PCEST E,
           PCPRINCIPATIVO PA,
           PCSECAO S,
           PCDEPTO D,
           PCLINHAPROD LP,
           PCCATEGORIA CAT
     WHERE P.CODPROD = TE.CODPROD
       AND P.CODEPTO = S.CODEPTO
       AND P.CODSEC = S.CODSEC
       AND P.CODEPTO = D.CODEPTO
       AND TE.UFDESTINO = FIL.UF
       AND TE.UFORIGEM = F.ESTADO
       AND F.CODFORNEC = P.CODFORNEC
       AND F.CODFORNEC = FF.CODFORNEC
       AND P.CODPROD = PF.CODPROD
       AND PF.CODFILIAL = DECODE(
               NVL(P.CODFILIAL, '99'),
               '99', FIL.CODIGO,
               P.CODFILIAL
           )
       AND PF.CODFILIAL = FIL.CODIGO
       AND PF.CODFILIAL = E.CODFILIAL
       AND PF.CODPROD = E.CODPROD
       AND PF.CODFILIAL = FF.CODFILIAL
       AND P.CODPRINCIPATIVO = PA.CODPRINCIPATIVO(+)
       AND P.CODLINHAPROD = LP.CODLINHA(+)
       AND P.CODCATEGORIA = CAT.CODCATEGORIA(+)
       AND P.CODSEC = CAT.CODSEC(+)
       AND P.DTEXCLUSAO IS NULL
       AND NVL(PF.FORALINHA, 'XX') = 'N'
       AND F.CODFORNEC = DECODE(
               NVL(:CODFORNEC, 0),
               0, P.CODFORNEC,
               :CODFORNEC
           )
       AND EXISTS
           (
               SELECT 1
                 FROM PCLIB
                WHERE CODTABELA = TO_CHAR(3)
                  AND (
                         CODIGON = NVL(P.CODFORNEC, CODIGON)
                      OR CODIGON = 999999
                  )
                  AND CODFUNC = 1
                  AND CODIGOA IS NOT NULL
           )
       AND EXISTS
           (
               SELECT 1
                 FROM PCLIB
                WHERE CODTABELA = TO_CHAR(2)
                  AND (
                         CODIGON = NVL(P.CODEPTO, CODIGON)
                      OR CODIGON = 9999
                  )
                  AND CODFUNC = 1
                  AND CODIGOA IS NOT NULL
           )
       AND E.CODFILIAL IN (:CODFILIAL)
       -- AND P.CODPROD IN (:CODPROD)
),
BASE_TRIBUTACAO AS
(
    SELECT TG.CODPROD,
           TG.DESCRICAO,
           TG.TIPO_IMPOSTO,
           TG.VLULTPCOMPRA,
           TG.CUSTOREP,
           CASE
               WHEN TG.TIPOFORNEC = 'I'
                 OR TG.EQUIPINDUSTRIA = 'S'
               THEN TG.PERCIPI
               ELSE 0
           END AS PERCIPI,
           TG.PERCST,
           TG.PERC_BASE_RED_ENT,
           TG.PERCICMS_ENT,
           TG.PERCICMS_SAID,
           NVL(EXP.PERPIS, TG.PERPIS) AS PERPIS,
           NVL(EXP.PERCOFINS, TG.PERCOFINS) AS PERCOFINS,
           TG.PERCFRETEFOB,
           NVL(TP.MARGEM, 0) AS MARGEM
      FROM TRIBUTACAOGERAL TG,
           PCEXPISCOFINSITEM EXP,
           PCREGIAO REG,
           PCTABPR TP,
           PCDEPTO D,
           PCTRIBUT TR
     WHERE TP.CODST = TR.CODST
       AND TG.CODEXCECAO = EXP.CODEXCECAO(+)
       AND TG.TIPOMOVIMENTACAO = EXP.TIPOMOVIMENTACAO(+)
       AND TG.CODFISCAL = EXP.CODFISCAL(+)
       AND TG.SUFRAMA = EXP.SUFRAMA(+)
       AND TG.TIPOPESSOA = EXP.TIPOPESSOA(+)
       AND TG.CODEPTO = D.CODEPTO
       AND TG.CODPROD = TP.CODPROD
       AND TG.NUMREGIAO = TP.NUMREGIAO
       AND TG.NUMREGIAO = REG.NUMREGIAO
       AND TG.PRECIFICESTRANGEIRA = 'N'
       AND TG.CODFILIAL IN (:CODFILIAL)
       -- AND TG.CODPROD IN (:CODPROD)
),
CALCULOS_ENTRADA AS
(
    SELECT B.CODPROD,
           B.DESCRICAO,
           B.TIPO_IMPOSTO,
           NVL(
               :PCOMPRA,
               NVL(B.VLULTPCOMPRA, B.CUSTOREP)
           ) AS VLULTPCOMPRA,
           NVL(B.PERCIPI, 0) AS PERCIPI,
           ROUND(
               NVL(
                   :PCOMPRA,
                   NVL(B.VLULTPCOMPRA, B.CUSTOREP)
               )
               * NVL(B.PERCIPI, 0) / 100,
               3
           ) AS VLIPI,
           NVL(B.PERCST, 0) AS PERCST,
           0 AS VLST,
           NVL(B.PERCICMS_ENT, 0) AS PERCICMS_ENT,
           NVL(B.PERC_BASE_RED_ENT, 0) AS PERC_BASE_RED_ENT,
           DECODE(
               NVL(B.PERC_BASE_RED_ENT, 0),
               0,
               NVL(B.PERCICMS_ENT, 0),
               NVL(B.PERCICMS_ENT, 0)
               * NVL(B.PERC_BASE_RED_ENT, 0) / 100
           ) AS PERCICM_CUSTO,
           ROUND(
               NVL(
                   :PCOMPRA,
                   NVL(B.VLULTPCOMPRA, B.CUSTOREP)
               )
               * DECODE(
                     NVL(B.PERC_BASE_RED_ENT, 0),
                     0,
                     NVL(B.PERCICMS_ENT, 0),
                     NVL(B.PERCICMS_ENT, 0)
                     * NVL(B.PERC_BASE_RED_ENT, 0) / 100
                 ) / 100,
               3
           ) AS VLICMS,
           NVL(B.PERPIS, 0) AS PERPIS,
           ROUND(
               (
                   NVL(
                       :PCOMPRA,
                       NVL(B.VLULTPCOMPRA, B.CUSTOREP)
                   )
                   - NVL(
                         :PCOMPRA,
                         NVL(B.VLULTPCOMPRA, B.CUSTOREP)
                     )
                     * DECODE(
                           NVL(B.PERC_BASE_RED_ENT, 0),
                           0,
                           NVL(B.PERCICMS_ENT, 0),
                           NVL(B.PERCICMS_ENT, 0)
                           * NVL(B.PERC_BASE_RED_ENT, 0) / 100
                       ) / 100
               )
               * ABS(NVL(B.PERPIS, 0)) / 100,
               3
           ) AS VLPIS,
           NVL(B.PERCOFINS, 0) AS PERCOFINS,
           ROUND(
               (
                   NVL(
                       :PCOMPRA,
                       NVL(B.VLULTPCOMPRA, B.CUSTOREP)
                   )
                   - NVL(
                         :PCOMPRA,
                         NVL(B.VLULTPCOMPRA, B.CUSTOREP)
                     )
                     * DECODE(
                           NVL(B.PERC_BASE_RED_ENT, 0),
                           0,
                           NVL(B.PERCICMS_ENT, 0),
                           NVL(B.PERCICMS_ENT, 0)
                           * NVL(B.PERC_BASE_RED_ENT, 0) / 100
                       ) / 100
               )
               * ABS(NVL(B.PERCOFINS, 0)) / 100,
               3
           ) AS VLCOFINS,
           NVL(B.PERCFRETEFOB, 0) AS PERCFRETEFOB,
           ROUND(
               NVL(
                   :PCOMPRA,
                   NVL(B.VLULTPCOMPRA, B.CUSTOREP)
               )
               * NVL(B.PERCFRETEFOB, 0) / 100,
               3
           ) AS VLFRETEFOB,
           NVL(B.MARGEM, 0) AS MARGEM,
           NVL(B.PERCICMS_SAID, 0) AS PERCICMS_SAID
      FROM BASE_TRIBUTACAO B
),
CALCULOS_CUSTO AS
(
    SELECT C.*,
           ROUND(
                 NVL(C.VLULTPCOMPRA, 0)
               + NVL(C.VLIPI, 0)
               + NVL(C.VLST, 0)
               - NVL(C.VLICMS, 0)
               - NVL(C.VLPIS, 0)
               - NVL(C.VLCOFINS, 0)
               + NVL(C.VLFRETEFOB, 0),
               3
           ) AS CUSTO_ANTES_CBS
      FROM CALCULOS_ENTRADA C
),
RESULTADO_CBS AS
(
    SELECT C.*,
           PROD.NBM AS NCM,
           CBS.CODIGO_TRIBUTACAO,
           CBS.DESCRICAO_TRIBUTACAO,
           NVL(CBS.PERC_CBS, 0) AS PERC_CBS,
           ROUND(
                 NVL(C.VLULTPCOMPRA, 0)
               - CASE
                     WHEN NVL(C.VLST, 0) > 0
                     THEN NVL(C.VLST, 0)
                     ELSE NVL(C.VLICMS, 0)
                 END
               - NVL(C.VLIPI, 0),
               3
           ) AS BASE_CBS,
           ROUND(
               (
                     NVL(C.VLULTPCOMPRA, 0)
                   - CASE
                         WHEN NVL(C.VLST, 0) > 0
                         THEN NVL(C.VLST, 0)
                         ELSE NVL(C.VLICMS, 0)
                     END
                   - NVL(C.VLIPI, 0)
               )
               * NVL(CBS.PERC_CBS, 0) / 100,
               3
           ) AS VLCBS
      FROM CALCULOS_CUSTO C
      LEFT JOIN PCPRODUT PROD
        ON PROD.CODPROD = C.CODPROD
      LEFT JOIN TRIBUTACAO_CBS CBS
        ON CBS.NCM_NORMALIZADO =
           REGEXP_REPLACE(TO_CHAR(PROD.NBM), '[^0-9]', '')
),
RESULTADO_FINAL AS
(
    SELECT R.*,
           ROUND(
               NVL(R.CUSTO_ANTES_CBS, 0)
               - NVL(R.VLCBS, 0),
               3
           ) AS CUSTO_CALC
      FROM RESULTADO_CBS R
)
SELECT R.CODPROD,
       R.DESCRICAO,
       R.NCM,
       R.CODIGO_TRIBUTACAO,
       R.DESCRICAO_TRIBUTACAO,
       R.TIPO_IMPOSTO,
       R.VLULTPCOMPRA,
       R.PERCIPI,
       R.VLIPI,
       R.PERCST,
       R.VLST,
       R.PERCICMS_ENT,
       R.PERC_BASE_RED_ENT,
       R.PERCICM_CUSTO,
       R.VLICMS AS VLICMS_ENT,
       R.PERPIS AS PERPIS_ENT,
       R.VLPIS AS VLPIS_ENT,
       R.PERCOFINS AS PERCOFINS_ENT,
       R.VLCOFINS AS VLCOFINS_ENT,
       R.PERCFRETEFOB AS PERCFRETEFOB_ENT,
       R.VLFRETEFOB AS VLFRETEFOB_ENT,
       R.CUSTO_ANTES_CBS,
       R.PERC_CBS,
       R.BASE_CBS,
       R.VLCBS,
       R.CUSTO_CALC,
       R.MARGEM,
       R.PERCICMS_SAID,
       R.PERPIS AS PERPIS_SAID,
       R.PERCOFINS AS PERCOFINS_SAID,
       ROUND(
           1
           - (
                 NVL(R.MARGEM, 0)
               + NVL(R.PERCICMS_SAID, 0)
               + NVL(R.PERPIS, 0)
               + NVL(R.PERCOFINS, 0)
               + NVL(R.PERC_CBS, 0)
             ) / 100,
           6
       ) AS INDICE,
       ROUND(
           NVL(R.CUSTO_CALC, 0)
           / NULLIF(
               1
               - (
                     NVL(R.MARGEM, 0)
                   + NVL(R.PERCICMS_SAID, 0)
                   + NVL(R.PERPIS, 0)
                   + NVL(R.PERCOFINS, 0)
                   + NVL(R.PERC_CBS, 0)
                 ) / 100,
               0
           ),
           3
       ) AS PR_FUTURO
  FROM RESULTADO_FINAL R;
