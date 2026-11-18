namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// Consultas do simulador de preço. Somente leitura: tabela do Winthor nunca é escrita.
///
/// <para><b>O SQL é a VERSÃO 1</b>, guardado sem edição em
/// <c>docs/rotinas/simulador-preco/referencia/sql-v1.sql</c>. Toda diferença entre aquele texto e
/// o daqui está listada na spec (<c>docs/superpowers/specs/2026-11-18-simulador-de-preco-design.md</c>
/// §3.2, A1 a A7). Uma v2 vem com correções; ela troca o MIOLO desta consulta, e o SELECT de fora
/// só muda se as colunas mudarem.</para>
/// </summary>
public static class SimuladorPrecoQueries
{
    /// <summary>
    /// Os produtos da filial e da região, com impostos, custo e preço futuro.
    ///
    /// <para><b>Ordem dos 15 binds</b> — o ODP.NET liga por POSIÇÃO, e cada ocorrência é um
    /// parâmetro (A1): <c>:numRegiao</c>, <c>:codFornec1</c>, <c>:codFornec2</c>,
    /// <c>:matricula1</c>, <c>:matricula2</c>, <c>:codFilial1</c>, <c>:codFilial2</c>,
    /// <c>:pCompra1</c> a <c>:pCompra8</c>.</para>
    ///
    /// <para><b>O SELECT de fora existe por causa do Dapper (A7).</b> Ele ignora maiúsculas, mas
    /// não ignora sublinhado: <c>PERC_BASE_RED_ENT</c> não acha a propriedade
    /// <c>PercBaseRedEnt</c>, e a coluna chegaria zerada SEM ERRO — a armadilha 4 do
    /// <c>DIVERGENCIAS.md</c> da 9815. Renomear aqui deixa o miolo idêntico à referência. Os três
    /// códigos passam por <c>TO_CHAR</c> (A6): o tipo deles no banco não foi conferido, e texto
    /// serve aos dois casos.</para>
    ///
    /// <para><b>A matrícula entra no lugar do <c>CODFUNC = 1</c> (A2, decisão D3)</b>: a
    /// liberação de fornecedor e departamento na <c>PCLIB</c> é a de quem está logado.</para>
    /// </summary>
    public const string Consulta = """
        SELECT CODPROD                         AS CODPROD,
               DESCRICAO                       AS DESCRICAO,
               TO_CHAR(NCM)                    AS NCM,
               TO_CHAR(CODIGO_TRIBUTACAO)      AS CODIGOTRIBUTACAO,
               DESCRICAO_TRIBUTACAO            AS DESCRICAOTRIBUTACAO,
               TO_CHAR(TIPO_IMPOSTO)           AS TIPOIMPOSTO,
               VLULTPCOMPRA                    AS VLULTPCOMPRA,
               PERCIPI                         AS PERCIPI,
               VLIPI                           AS VLIPI,
               PERCST                          AS PERCST,
               VLST                            AS VLST,
               PERCICMS_ENT                    AS PERCICMSENT,
               PERC_BASE_RED_ENT               AS PERCBASEREDENT,
               PERCICM_CUSTO                   AS PERCICMCUSTO,
               VLICMS_ENT                      AS VLICMSENT,
               PERPIS_ENT                      AS PERPISENT,
               VLPIS_ENT                       AS VLPISENT,
               PERCOFINS_ENT                   AS PERCOFINSENT,
               VLCOFINS_ENT                    AS VLCOFINSENT,
               PERCFRETEFOB_ENT                AS PERCFRETEFOBENT,
               VLFRETEFOB_ENT                  AS VLFRETEFOBENT,
               CUSTO_ANTES_CBS                 AS CUSTOANTESCBS,
               PERC_CBS                        AS PERCCBS,
               BASE_CBS                        AS BASECBS,
               VLCBS                           AS VLCBS,
               CUSTO_CALC                      AS CUSTOCALC,
               MARGEM                          AS MARGEM,
               PERCICMS_SAID                   AS PERCICMSSAID,
               PERPIS_SAID                     AS PERPISSAID,
               PERCOFINS_SAID                  AS PERCOFINSSAID,
               INDICE                          AS INDICE,
               PR_FUTURO                       AS PRFUTURO
          FROM (
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
                   :numRegiao AS NUMREGIAO,
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
                       NVL(:codFornec1, 0),
                       0, P.CODFORNEC,
                       :codFornec2
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
                          AND CODFUNC = :matricula1
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
                          AND CODFUNC = :matricula2
                          AND CODIGOA IS NOT NULL
                   )
               AND E.CODFILIAL IN (:codFilial1)
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
               AND TG.CODFILIAL IN (:codFilial2)
        ),
        CALCULOS_ENTRADA AS
        (
            SELECT B.CODPROD,
                   B.DESCRICAO,
                   B.TIPO_IMPOSTO,
                   NVL(
                       :pCompra1,
                       NVL(B.VLULTPCOMPRA, B.CUSTOREP)
                   ) AS VLULTPCOMPRA,
                   NVL(B.PERCIPI, 0) AS PERCIPI,
                   ROUND(
                       NVL(
                           :pCompra2,
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
                           :pCompra3,
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
                               :pCompra4,
                               NVL(B.VLULTPCOMPRA, B.CUSTOREP)
                           )
                           - NVL(
                                 :pCompra5,
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
                               :pCompra6,
                               NVL(B.VLULTPCOMPRA, B.CUSTOREP)
                           )
                           - NVL(
                                 :pCompra7,
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
                           :pCompra8,
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
          FROM RESULTADO_FINAL R
          )
        """;
}
