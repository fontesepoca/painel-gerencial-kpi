namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// Consultas do simulador de preço. Somente leitura: tabela do Winthor nunca é escrita.
///
/// <para><b>O SQL é a VERSÃO 2</b> (entregue pelo gestor em 23/11/2026), guardada sem edição em
/// <c>docs/rotinas/simulador-preco/referencia/sql-v2.sql</c> — a v1 continua ao lado, em
/// <c>sql-v1.sql</c>. As diferenças entre aquele texto e o daqui estão listadas na spec
/// (<c>docs/superpowers/specs/2026-11-23-simulador-sql-v2-design.md</c>): A1, A2, A4, A6 e A8, mais o
/// SELECT de fora (A7). A <c>sp5</c> prova que não há outra.</para>
/// </summary>
public static class SimuladorPrecoQueries
{
    /// <summary>
    /// Os produtos da filial e da região, com impostos, custo, preço futuro e preço final.
    ///
    /// <para><b>Ordem dos 28 binds</b> — o ODP.NET liga por POSIÇÃO, e cada ocorrência é um
    /// parâmetro (A1): <c>:pCompra1</c> a <c>:pCompra22</c>, <c>:numRegiao</c>,
    /// <c>:fornecedoresNulo</c>, <c>:fornecedores</c>, <c>:matricula1</c>, <c>:matricula2</c> e
    /// <c>:codFilial</c>.</para>
    ///
    /// <para><b>O filtro de fornecedor aceita uma LISTA (A8, 24/11/2026)</b>: texto com os códigos
    /// separados por vírgula, nulo = todos. Ele só escolhe os produtos; nenhuma conta muda.</para>
    ///
    /// <para><b>O SELECT de fora existe por causa do Dapper (A7).</b> Ele ignora maiúsculas, mas
    /// não ignora sublinhado: <c>PERC_BASE_RED_ENT</c> não acha a propriedade
    /// <c>PercBaseRedEnt</c>, e a coluna chegaria zerada SEM ERRO. Renomear aqui deixa o miolo
    /// idêntico à referência. Os códigos passam por <c>TO_CHAR</c> (A6): o tipo deles no banco não
    /// foi conferido, e texto serve aos dois casos.</para>
    ///
    /// <para><b>A matrícula entra no lugar do <c>CODFUNC = 1</c> (A2, decisão D3)</b>: a
    /// liberação de fornecedor e departamento na <c>PCLIB</c> é a de quem está logado.</para>
    /// </summary>
    public const string Consulta = """
        SELECT TO_CHAR(CODFILIAL)              AS CODFILIAL,
               CODPROD                         AS CODPROD,
               DESCRICAO                       AS DESCRICAO,
               TO_CHAR(CLASSEVENDA)            AS CLASSEVENDA,
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
               PR_FUTURO                       AS PRFUTURO,
               PRECOFINAL                      AS PRFINAL
          FROM (
        
        SELECT B.CODFILIAL, B.CODPROD, B.DESCRICAO, B.CLASSEVENDA, B.NCM, B.CODIGO_TRIBUTACAO, B.DESCRICAO_TRIBUTACAO, B.TIPO_IMPOSTO,
               B.VLULTPCOMPRA, B.PERCIPI, B.VLIPI, B.PERCST, B.PERCICMS_ENT, B.PERC_BASE_RED_ENT,
               B.PERCICM_CUSTO, B.VLICMS AS VLICMS_ENT, B.PERPIS AS PERPIS_ENT, B.VLPIS AS VLPIS_ENT,
               B.PERCOFINS AS PERCOFINS_ENT, B.VLCOFINS AS VLCOFINS_ENT, B.PERCFRETEFOB AS PERCFRETEFOB_ENT,
               B.VLFRETEFOB AS VLFRETEFOB_ENT, B.CUSTO_ANTES_CBS, B.PERC_CBS, B.BASE_CBS, B.VLCBS,
               ROUND(NVL(B.CUSTO_ANTES_CBS,0) - NVL(B.VLCBS,0),3) AS CUSTO_CALC,
               B.MARGEM, B.PERCICMS_SAID, B.PERPIS AS PERPIS_SAID, B.PERCOFINS AS PERCOFINS_SAID, B.VLST,
               ROUND(1 - (NVL(B.MARGEM,0) + NVL(B.PERCICMS_SAID,0) + NVL(B.PERPIS,0) +
                     NVL(B.PERCOFINS,0) + NVL(B.PERC_CBS,0)) / 100,6) AS INDICE,
               ROUND((NVL(B.CUSTO_ANTES_CBS,0) - NVL(B.VLCBS,0)) /
                     NULLIF(1 - (NVL(B.MARGEM,0) + NVL(B.PERCICMS_SAID,0) + NVL(B.PERPIS,0) +
                            NVL(B.PERCOFINS,0) + NVL(B.PERC_CBS,0)) / 100,0),3) AS PR_FUTURO,
               ROUND((NVL(B.CUSTO_ANTES_CBS,0) - NVL(B.VLCBS,0)) /
                     NULLIF(1 - (NVL(B.MARGEM,0) + NVL(B.PERCICMS_SAID,0) + NVL(B.PERPIS,0) +
                            NVL(B.PERCOFINS,0) + NVL(B.PERC_CBS,0)) / 100,0) + NVL(B.VLST,0),3) AS PRECOFINAL
          FROM (SELECT E.CODFILIAL, P.CODPROD, P.DESCRICAO, P.CLASSEVENDA, P.NBM AS NCM, CBS.CODIGO_TRIBUTACAO,
                       CBS.DESCRICAO_TRIBUTACAO, PF.CHAVENATURAL AS TIPO_IMPOSTO,
                       NVL(:pCompra1,NVL(E.VLULTPCOMPRA,0)) AS VLULTPCOMPRA,
                       CASE WHEN NVL(F.TIPOFORNEC,'I') = 'I' OR NVL(F.EQUIPINDUSTRIA,'N') = 'S'
                            THEN NVL(TE.PERIPI,0) ELSE 0 END AS PERCIPI,
                       ROUND(NVL(:pCompra2,NVL(E.VLULTPCOMPRA,0)) *
                             CASE WHEN NVL(F.TIPOFORNEC,'I') = 'I' OR NVL(F.EQUIPINDUSTRIA,'N') = 'S'
                                  THEN NVL(TE.PERIPI,0) ELSE 0 END / 100,3) AS VLIPI,
                       NVL(TE.PERCST,0) AS PERCST,
                       NVL(PF.PERCICMS_ENT,0) AS PERCICMS_ENT,
                       NVL(PF.PERC_BASE_RED,0) AS PERC_BASE_RED_ENT,
                       DECODE(NVL(PF.PERC_BASE_RED,0),0,NVL(PF.PERCICMS_ENT,0),
                              NVL(PF.PERCICMS_ENT,0) * NVL(PF.PERC_BASE_RED,0) / 100) AS PERCICM_CUSTO,
                       ROUND(NVL(:pCompra3,NVL(E.VLULTPCOMPRA,0)) *
                             DECODE(NVL(PF.PERC_BASE_RED,0),0,NVL(PF.PERCICMS_ENT,0),
                                    NVL(PF.PERCICMS_ENT,0) * NVL(PF.PERC_BASE_RED,0) / 100) / 100,3) AS VLICMS,
                       NVL(EXP.PERPIS,NVL(TE.PERPIS,NVL(P.PERPIS,0))) AS PERPIS,
                       ROUND((NVL(:pCompra4,NVL(E.VLULTPCOMPRA,0)) -
                              NVL(:pCompra5,NVL(E.VLULTPCOMPRA,0)) *
                              DECODE(NVL(PF.PERC_BASE_RED,0),0,NVL(PF.PERCICMS_ENT,0),
                                     NVL(PF.PERCICMS_ENT,0) * NVL(PF.PERC_BASE_RED,0) / 100) / 100) *
                              ABS(NVL(EXP.PERPIS,NVL(TE.PERPIS,NVL(P.PERPIS,0)))) / 100,3) AS VLPIS,
                       NVL(EXP.PERCOFINS,NVL(TE.PERCOFINS,NVL(P.PERCOFINS,0))) AS PERCOFINS,
                       ROUND((NVL(:pCompra6,NVL(E.VLULTPCOMPRA,0)) -
                              NVL(:pCompra7,NVL(E.VLULTPCOMPRA,0)) *
                              DECODE(NVL(PF.PERC_BASE_RED,0),0,NVL(PF.PERCICMS_ENT,0),
                                     NVL(PF.PERCICMS_ENT,0) * NVL(PF.PERC_BASE_RED,0) / 100) / 100) *
                              ABS(NVL(EXP.PERCOFINS,NVL(TE.PERCOFINS,NVL(P.PERCOFINS,0)))) / 100,3) AS VLCOFINS,
                       DECODE(NVL(F.USAFRETEFOBPORFORNEC,'N'),'S',NVL(FF.PERCFRETEFOB,0),
                              NVL(TE.PERCFRETEFOB,0)) AS PERCFRETEFOB,
                       ROUND(NVL(:pCompra8,NVL(E.VLULTPCOMPRA,0)) *
                             DECODE(NVL(F.USAFRETEFOBPORFORNEC,'N'),'S',NVL(FF.PERCFRETEFOB,0),
                                    NVL(TE.PERCFRETEFOB,0)) / 100,3) AS VLFRETEFOB,
                       NVL(TP.MARGEM,0) AS MARGEM,
                       NVL(PF.PERCICMS_SAID,0) AS PERCICMS_SAID,
                       NVL(TP.VLST,0) AS VLST,
                       NVL(CBS.PERC_CBS,0) AS PERC_CBS,
                       ROUND(NVL(:pCompra9,NVL(E.VLULTPCOMPRA,0)) -
                             NVL(:pCompra10,NVL(E.VLULTPCOMPRA,0)) *
                             DECODE(NVL(PF.PERC_BASE_RED,0),0,NVL(PF.PERCICMS_ENT,0),
                                    NVL(PF.PERCICMS_ENT,0) * NVL(PF.PERC_BASE_RED,0) / 100) / 100 -
                             NVL(:pCompra11,NVL(E.VLULTPCOMPRA,0)) *
                             CASE WHEN NVL(F.TIPOFORNEC,'I') = 'I' OR NVL(F.EQUIPINDUSTRIA,'N') = 'S'
                                  THEN NVL(TE.PERIPI,0) ELSE 0 END / 100,3) AS BASE_CBS,
                       ROUND((NVL(:pCompra12,NVL(E.VLULTPCOMPRA,0)) -
                              NVL(:pCompra13,NVL(E.VLULTPCOMPRA,0)) *
                              DECODE(NVL(PF.PERC_BASE_RED,0),0,NVL(PF.PERCICMS_ENT,0),
                                     NVL(PF.PERCICMS_ENT,0) * NVL(PF.PERC_BASE_RED,0) / 100) / 100 -
                              NVL(:pCompra14,NVL(E.VLULTPCOMPRA,0)) *
                              CASE WHEN NVL(F.TIPOFORNEC,'I') = 'I' OR NVL(F.EQUIPINDUSTRIA,'N') = 'S'
                                   THEN NVL(TE.PERIPI,0) ELSE 0 END / 100) *
                              NVL(CBS.PERC_CBS,0) / 100,3) AS VLCBS,
                       ROUND(NVL(:pCompra15,NVL(E.VLULTPCOMPRA,0)) +
                             NVL(:pCompra16,NVL(E.VLULTPCOMPRA,0)) *
                             CASE WHEN NVL(F.TIPOFORNEC,'I') = 'I' OR NVL(F.EQUIPINDUSTRIA,'N') = 'S'
                                  THEN NVL(TE.PERIPI,0) ELSE 0 END / 100 -
                             NVL(:pCompra17,NVL(E.VLULTPCOMPRA,0)) *
                             DECODE(NVL(PF.PERC_BASE_RED,0),0,NVL(PF.PERCICMS_ENT,0),
                                    NVL(PF.PERCICMS_ENT,0) * NVL(PF.PERC_BASE_RED,0) / 100) / 100 -
                             (NVL(:pCompra18,NVL(E.VLULTPCOMPRA,0)) -
                              NVL(:pCompra19,NVL(E.VLULTPCOMPRA,0)) *
                              DECODE(NVL(PF.PERC_BASE_RED,0),0,NVL(PF.PERCICMS_ENT,0),
                                     NVL(PF.PERCICMS_ENT,0) * NVL(PF.PERC_BASE_RED,0) / 100) / 100) *
                              ABS(NVL(EXP.PERPIS,NVL(TE.PERPIS,NVL(P.PERPIS,0)))) / 100 -
                             (NVL(:pCompra20,NVL(E.VLULTPCOMPRA,0)) -
                              NVL(:pCompra21,NVL(E.VLULTPCOMPRA,0)) *
                              DECODE(NVL(PF.PERC_BASE_RED,0),0,NVL(PF.PERCICMS_ENT,0),
                                     NVL(PF.PERCICMS_ENT,0) * NVL(PF.PERC_BASE_RED,0) / 100) / 100) *
                              ABS(NVL(EXP.PERCOFINS,NVL(TE.PERCOFINS,NVL(P.PERCOFINS,0)))) / 100 +
                             NVL(:pCompra22,NVL(E.VLULTPCOMPRA,0)) *
                             DECODE(NVL(F.USAFRETEFOBPORFORNEC,'N'),'S',NVL(FF.PERCFRETEFOB,0),
                                    NVL(TE.PERCFRETEFOB,0)) / 100,3) AS CUSTO_ANTES_CBS
                  FROM PCPRODUT P, PCTABTRIBENT TE, PCFILIAL FIL, PCFORNEC F, PCFORNECFILIAL FF,
                       PCPRODFILIAL PF, PCCONSUM CON, PCEST E, PCPRINCIPATIVO PA, PCSECAO S,
                       PCDEPTO D, PCLINHAPROD LP, PCCATEGORIA CAT, PCEXPISCOFINSITEM EXP,
                       PCREGIAO REG, PCTABPR TP, PCTRIBUT TR,
                       (SELECT T.CODIGO_TRIBUTACAO, T.DESCRICAO_TRIBUTACAO, N.NCM,
                               REGEXP_REPLACE(TO_CHAR(N.NCM),'[^0-9]','') AS NCM_NORMALIZADO,
                               NVL(T.PERC_CBS,0) AS PERC_CBS
                          FROM PCTRIBUTACAO T, PCTRIBUTACAO_FILTRO_NCM N
                         WHERE T.CODIGO_TRIBUTACAO = N.CODIGO_TRIBUTACAO) CBS
                 WHERE P.CODPROD = TE.CODPROD
                   AND P.CODEPTO = S.CODEPTO
                   AND P.CODSEC = S.CODSEC
                   AND P.CODEPTO = D.CODEPTO
                   AND TE.UFDESTINO = FIL.UF
                   AND TE.UFORIGEM = F.ESTADO
                   AND F.CODFORNEC = P.CODFORNEC
                   AND F.CODFORNEC = FF.CODFORNEC
                   AND P.CODPROD = PF.CODPROD
                   AND PF.CODFILIAL = DECODE(NVL(P.CODFILIAL,'99'),'99',FIL.CODIGO,P.CODFILIAL)
                   AND PF.CODFILIAL = FIL.CODIGO
                   AND PF.CODFILIAL = E.CODFILIAL
                   AND PF.CODPROD = E.CODPROD
                   AND PF.CODFILIAL = FF.CODFILIAL
                   AND P.CODPRINCIPATIVO = PA.CODPRINCIPATIVO(+)
                   AND P.CODLINHAPROD = LP.CODLINHA(+)
                   AND P.CODCATEGORIA = CAT.CODCATEGORIA(+)
                   AND P.CODSEC = CAT.CODSEC(+)
                   AND TP.CODST = TR.CODST
                   AND TE.CODEXCECAOPISCOFINS = EXP.CODEXCECAO(+)
                   AND EXP.TIPOMOVIMENTACAO(+) = '1E'
                   AND TE.CODFISCALENT = EXP.CODFISCAL(+)
                   AND F.SUFRAMA = EXP.SUFRAMA(+)
                   AND F.TIPOPESSOA = EXP.TIPOPESSOA(+)
                   AND P.CODPROD = TP.CODPROD
                   AND TP.NUMREGIAO = :numRegiao
                   AND REG.NUMREGIAO = TP.NUMREGIAO
                   AND NVL(P.PRECIFICESTRANGEIRA,'N') = 'N'
                   AND P.DTEXCLUSAO IS NULL
                   AND NVL(PF.FORALINHA,'XX') = 'N'
                   AND (:fornecedoresNulo IS NULL OR INSTR(',' || :fornecedores || ',', ',' || TO_CHAR(F.CODFORNEC) || ',') > 0)
                   AND EXISTS (SELECT 1
                                 FROM PCLIB
                                WHERE CODTABELA = TO_CHAR(3)
                                  AND (CODIGON = NVL(P.CODFORNEC,CODIGON) OR CODIGON = 999999)
                                  AND CODFUNC = :matricula1
                                  AND CODIGOA IS NOT NULL)
                   AND EXISTS (SELECT 1
                                 FROM PCLIB
                                WHERE CODTABELA = TO_CHAR(2)
                                  AND (CODIGON = NVL(P.CODEPTO,CODIGON) OR CODIGON = 9999)
                                  AND CODFUNC = :matricula2
                                  AND CODIGOA IS NOT NULL)
                   AND E.CODFILIAL IN (:codFilial)
                   AND REGEXP_REPLACE(TO_CHAR(P.NBM),'[^0-9]','') = CBS.NCM_NORMALIZADO(+)) B
          )
        """;

    /// <summary>
    /// UMA PÁGINA da <see cref="Consulta"/>, com busca, classes e "só simulados" (spec
    /// <c>docs/superpowers/specs/2026-11-24-simulador-paginacao-no-backend-design.md</c>). A
    /// orientação do Dev: o dado fica no back-end, e o navegador recebe só as 100 linhas da
    /// página. Medido na <c>sp14</c>: ~3 s por página, 1,5 s por busca.
    ///
    /// <para><b>O SQL v2 continua intacto</b>: entra inteiro por interpolação, e a <c>sp5</c>
    /// segue conferindo-o. As camadas daqui, de dentro para fora:</para>
    /// <list type="number">
    /// <item><b>A numeração das repetições</b> (<c>OCORRENCIA</c>). Uma mesma chave
    /// (produto + tributação) pode vir mais de uma vez; a tela a chamava de <c>#1</c>, <c>#2</c>
    /// contando na lista inteira, e agora a repetição pode cair noutra página. Por isso numera o
    /// Oracle, ANTES dos filtros: a mesma linha tem a mesma chave com qualquer busca. Dentro da
    /// partição, a numeração ordena por TODAS as colunas (revisão final, 24/11/2026): duas
    /// repetições só trocam de <c>#n</c> se forem idênticas em tudo — e aí a troca não muda
    /// nada na tela nem na simulação guardada.</item>
    /// <item><b>Os filtros</b>: busca (código exato ou trecho da descrição, com <c>ESCAPE</c>
    /// para que <c>%</c> e <c>_</c> digitados sejam texto), classes e códigos. Cada um com um
    /// bind "nulo" na frente: nulo = sem esse filtro. O total (<c>TOTALITENS</c>) é contado
    /// DEPOIS deles, junto com a página, numa ida só.</item>
    /// <item><b>A ordem</b> (Gabriel, 24/11/2026: classe A → B → C) com desempate, e o
    /// <c>OFFSET/FETCH</c>. O Oracle é 19c (CONVENCOES_ORACLE §3).</item>
    /// </list>
    ///
    /// <para><b>Binds</b>, depois dos 28 da <see cref="Consulta"/>, nesta ordem:
    /// <c>:buscaNula</c>, <c>:buscaCodigo</c>, <c>:buscaLike</c>, <c>:classesNula</c>,
    /// <c>:classes</c>, <c>:codigosNulo</c>, <c>:codigos</c>, <c>:inicio</c>, <c>:tamanho</c>. A
    /// <c>sp15</c> confere que o repositório os adiciona nessa ordem.</para>
    ///
    /// <para><b>O fornecedor do produto</b> (spec 2026-11-24-simulador-coluna-codigo-e-fornecedor)
    /// vem por <c>LEFT JOIN</c> FORA da <see cref="Consulta"/>, para o SQL v2 ficar intacto (a sp5
    /// continua IDENTICO). É o mesmo que o SQL v2 usa (<c>F.CODFORNEC = P.CODFORNEC</c>). A ligação
    /// é pela chave, uma linha para uma: não repete produto. Nenhum bind novo.</para>
    /// </summary>
    public const string ConsultaPaginada = $$"""
        SELECT F.*
          FROM (SELECT N.*, COUNT(*) OVER () AS TOTALITENS
                  FROM (SELECT C.*,
                               PP.CODFORNEC AS CODFORNEC,
                               FO.FORNECEDOR AS FORNECEDOR,
                               ROW_NUMBER() OVER (PARTITION BY C.CODPROD, C.CODIGOTRIBUTACAO
                                                  ORDER BY C.DESCRICAO, C.CODFILIAL, C.CLASSEVENDA, C.NCM,
                                                           C.DESCRICAOTRIBUTACAO, C.TIPOIMPOSTO, C.VLULTPCOMPRA,
                                                           C.PERCIPI, C.VLIPI, C.PERCST, C.VLST, C.PERCICMSENT,
                                                           C.PERCBASEREDENT, C.PERCICMCUSTO, C.VLICMSENT,
                                                           C.PERPISENT, C.VLPISENT, C.PERCOFINSENT, C.VLCOFINSENT,
                                                           C.PERCFRETEFOBENT, C.VLFRETEFOBENT, C.CUSTOANTESCBS,
                                                           C.PERCCBS, C.BASECBS, C.VLCBS, C.CUSTOCALC, C.MARGEM,
                                                           C.PERCICMSSAID, C.PERPISSAID, C.PERCOFINSSAID,
                                                           C.INDICE, C.PRFUTURO, C.PRFINAL) AS OCORRENCIA
                          FROM ({{Consulta}}) C
                          LEFT JOIN PCPRODUT PP ON PP.CODPROD = C.CODPROD
                          LEFT JOIN PCFORNEC FO ON FO.CODFORNEC = PP.CODFORNEC) N
                 WHERE (:buscaNula IS NULL
                        OR TO_CHAR(N.CODPROD) = :buscaCodigo
                        OR UPPER(N.DESCRICAO) LIKE :buscaLike ESCAPE '\')
                   AND (:classesNula IS NULL
                        OR INSTR(',' || :classes || ',', ',' || N.CLASSEVENDA || ',') > 0)
                   AND (:codigosNulo IS NULL
                        OR INSTR(',' || :codigos || ',', ',' || TO_CHAR(N.CODPROD) || ',') > 0)) F
         ORDER BY CLASSEVENDA NULLS LAST, DESCRICAO, CODPROD, CODIGOTRIBUTACAO NULLS LAST, OCORRENCIA
        OFFSET :inicio ROWS FETCH NEXT :tamanho ROWS ONLY
        """;
}
