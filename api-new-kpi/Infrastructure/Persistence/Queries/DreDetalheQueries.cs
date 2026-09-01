namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// Consultas do **detalhamento** do DRE — o que a 9815 abre com duplo clique no valor.
/// **Somente leitura.**
///
/// <para>São três telas, não uma por linha clicável:</para>
/// <list type="number">
///   <item><b>Receita por cliente</b> — `(+) RECEITA BRUTA` e `(=) RECEITAS LIQUIDAS`
///         abrem a mesma, com a mesma query;</item>
///   <item><b>Devolução por motivo</b> — só `(-) DEVOLUCAO`;</item>
///   <item><b>Lançamentos</b> — toda linha de grupo, nos três blocos do DRE.</item>
/// </list>
///
/// <para><b>As duas primeiras saem de propósito do que a 9815 faz.</b> As telas dela não
/// somam o valor da linha clicada, e nem concordam entre si. Decisão do Gabriel em
/// 01/09/2026, medida e revertível — ver `docs/DIVERGENCIAS.md` §4.</para>
/// </summary>
public static class DreDetalheQueries
{
    /// <summary>
    /// Receita por cliente — a tela de `(+) RECEITA BRUTA` e `(=) RECEITAS LIQUIDAS`.
    ///
    /// <para><b>Corrigida em relação à 9815</b>, para fechar com a linha clicada. A original
    /// subtrai ST de `ptabela` <b>e</b> de `punit`; como o desconto é a diferença entre os
    /// dois, o ST se cancela ali — e é por isso que o `ABAT./DESC.` era a única das quatro
    /// linhas que já fechava ao centavo. As fórmulas aqui são as da apuração.</para>
    ///
    /// <para>A devolução também passou a usar o recorte da apuração: junção com `PCPEDC`
    /// exigindo `CONDVENDA IN (1,3,5,6,8)` e junção interna com `PCPRODUT`, sem o
    /// `mostra_dre` que a 9815 aplica só aqui. Medido em `dc2`: as cinco colunas passaram a
    /// bater com o DRE, e a lista perdeu um cliente que existia só por uma devolução fora
    /// do critério.</para>
    ///
    /// <para><b>Um bloco só por eixo, não um por filial.</b> A 9815 monta um par de
    /// `UNION ALL` para cada filial selecionada; com três filiais são seis blocos. É
    /// geração de código do Delphi, não critério — o conjunto de linhas é idêntico ao de
    /// um `IN`, e o `IN` não cresce com a seleção.</para>
    ///
    /// <para>Binds: {0} filiais das vendas, :dtIni1/:dtFim1; {1} filiais das devoluções,
    /// :dtIni2/:dtFim2. <b>Ordem posicional</b> — ODP.NET com `BindByName=false`.</para>
    /// </summary>
    public const string ReceitaPorCliente = """
        SELECT CODCLI, CLIENTE, CIDADE, QDE_NF,
               VLTABELA                    AS RECEITABRUTA,
               VLTABELA - VLVENDA          AS DESCONTO,
               VLDEVOLUCAO                 AS DEVOLUCAO,
               VLVENDA - VLDEVOLUCAO       AS RECEITALIQUIDA,
               VLCUSTOFIN - VLCMVDEVOL     AS CUSTOLIQ
          FROM (
                SELECT CODCLI, CLIENTE, CIDADE,
                       COUNT(DISTINCT NUMNOTA)   AS QDE_NF,
                       SUM(NVL(VLTABELA,0))      AS VLTABELA,
                       SUM(NVL(VLVENDA,0))       AS VLVENDA,
                       SUM(NVL(VLDEVOLUCAO,0))   AS VLDEVOLUCAO,
                       SUM(NVL(VLCUSTOFIN,0))    AS VLCUSTOFIN,
                       SUM(NVL(VLCMVDEVOL,0))    AS VLCMVDEVOL
                  FROM (
                        SELECT cli.codcli AS CODCLI, cli.cliente AS CLIENTE,
                               cli.municcob AS CIDADE, NF.numnota AS NUMNOTA,
                               (decode(MV.custofin, 0,
                                       MV.custofinest - nvl(MV.st,0) - nvl(MVC.vlfecp,0),
                                       MV.custofin    - nvl(MV.st,0) - nvl(MVC.vlfecp,0)) * MV.qt) AS VLCUSTOFIN,
                               (MV.punit   * MV.qt) AS VLVENDA,
                               (MV.ptabela * MV.qt) AS VLTABELA,
                               0 AS VLDEVOLUCAO,
                               0 AS VLCMVDEVOL
                          FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR, pcclient cli,
                               (SELECT clie.codcli, ce.codfil, ce.mostra_dre
                                  FROM cliente_especial ce, pcclient clie
                                 WHERE clie.codcliprinc = ce.codcli) esp
                         WHERE NF.numtransvenda = MV.numtransvenda
                           AND mv.numtransitem  = mvc.numtransitem (+)
                           AND MV.CODPROD       = PR.CODPROD
                           AND NF.codcli        = esp.codcli (+)
                           AND NF.CODFILIAL     = esp.codfil (+)
                           AND NF.codcli        = cli.codcli
                           AND MV.DTCANCEL      IS NULL
                           AND NF.DTCANCEL      IS NULL
                           AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,
                                                6108,6922,6102,6114,6115,6117,6119,6404,6910)
                           AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)
                              OR (NVL(NF.VLTOTAL,0) > 0)  OR (NVL(NF.VLCUSTOFIN,0) > 0) )
                           AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
                           AND NF.DTSAIDA BETWEEN :dtIni1 AND :dtFim1
                           AND NF.CODFILIAL IN ({0})
                           AND ( (nvl(esp.mostra_dre,'S') = 'S') OR (NF.CONDVENDA IN (5)) )
                           AND nvl(PR.codsec,0) <> 1601
                        UNION ALL
                        SELECT cli.codcli, cli.cliente, cli.municcob, NFE.numnota,
                               0, 0, 0,
                               round( NVL(nvl(MV.QT, mv.QTCONT),0)
                                    * NVL(nvl(MV.punit, mv.punitcont),0), 2),
                               ( NVL(MV.QT,0)
                               * ( NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)
                                   - nvl(MV.st,0) - nvl(MVC.vlfecp,0) ) )
                          FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED,
                               PCPRODUT PR, PCCLIENT CLI
                         WHERE NFE.numnota     = MV.numnota      (+)
                           AND NFE.numtransent = MV.numtransent  (+)
                           AND mv.numtransitem = mvc.numtransitem (+)
                           AND MV.numped       = PED.numped      (+)
                           AND MV.CODPROD      = PR.CODPROD
                           AND NFE.codfornec   = cli.codcli
                           AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8')
                           AND NFE.DTENT BETWEEN :dtIni2 AND :dtFim2
                           AND NFE.CODFILIAL IN ({1})
                           AND NFE.TIPODESCARGA IN ('6','7')
                           AND MV.DTCANCEL IS NULL
                           AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA')
                           AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
                           AND MV.CODSEC <> 1601
                       )
                 GROUP BY CODCLI, CLIENTE, CIDADE
               )
         ORDER BY VLVENDA - VLDEVOLUCAO DESC
        """;

    /// <summary>
    /// Devolução por motivo — a tela de `(-) DEVOLUCAO`.
    ///
    /// <para><b>Corrigida</b> pelos mesmos motivos: recorte da apuração e arredondamento em
    /// duas casas. A 9815 arredonda o item em <b>quatro</b> casas aqui e em duas na tela de
    /// receita, e por isso as duas telas dela devolvem totais diferentes para a mesma
    /// devolução — 1.370.523,2318 contra 1.370.523,10.</para>
    ///
    /// <para>A junção com `PCTABDEV` é externa, como no original: devolução sem motivo
    /// cadastrado continua na conta, com o motivo vazio, em vez de sumir do total.</para>
    ///
    /// <para>O percentual de participação é calculado sobre o total da própria consulta.
    /// Ele fecha em 100 com folga de centésimos — são ~27 motivos arredondados a duas
    /// casas, e a exportação da 9815 fecha em 100,02 pelo mesmo motivo.</para>
    ///
    /// <para>Binds: :dtIni, :dtFim, {0} filiais.</para>
    /// </summary>
    public const string DevolucaoPorMotivo = """
        SELECT CODMOTIVO, MOTIVO, CULPARCA, QDE_NF, VLDEVOLUCAO,
               round((VLDEVOLUCAO / SUM(VLDEVOLUCAO) OVER (PARTITION BY NULL)) * 100, 2) AS PPART
          FROM (
                SELECT MOTIVO.CODDEVOL            AS CODMOTIVO,
                       motivo.motivo              AS MOTIVO,
                       motivo.crldevculparca      AS CULPARCA,
                       COUNT(DISTINCT NFE.numnota) AS QDE_NF,
                       SUM( round( NVL(nvl(MV.QT, mv.QTCONT),0)
                                 * NVL(nvl(MV.punit, mv.punitcont),0), 2) ) AS VLDEVOLUCAO
                  FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED,
                       PCPRODUT PR, PCTABDEV MOTIVO
                 WHERE NFE.numnota     = MV.numnota      (+)
                   AND NFE.numtransent = MV.numtransent  (+)
                   AND mv.numtransitem = mvc.numtransitem (+)
                   AND MV.numped       = PED.numped      (+)
                   AND MV.CODPROD      = PR.CODPROD
                   AND NFE.CODDEVOL    = MOTIVO.CODDEVOL (+)
                   AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8')
                   AND NFE.DTENT BETWEEN :dtIni AND :dtFim
                   AND NFE.CODFILIAL IN ({0})
                   AND NFE.TIPODESCARGA IN ('6','7')
                   AND MV.DTCANCEL IS NULL
                   AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA')
                   AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
                   AND MV.CODSEC <> 1601
                 GROUP BY MOTIVO.CODDEVOL, motivo.motivo, motivo.crldevculparca
               )
         ORDER BY VLDEVOLUCAO DESC
        """;

    /// <summary>
    /// Lançamentos — a tela de toda linha de grupo. **Fiel à 9815**: esta já somava o valor
    /// da linha clicada (`DIRETORIA` fecha em −256.840,02 e `COMPRAS - RAT` em −278.024,83),
    /// e nada aqui foi corrigido.
    ///
    /// <para>É a mesma consulta das despesas da apuração, <b>sem agregação</b>: em vez de
    /// somar por grupo e mês, devolve lançamento a lançamento.</para>
    ///
    /// <para><b>Uma query, três blocos.</b> As duas subconsultas contra `EPCPARDRE` alternam
    /// entre `in` e `not in`, e a combinação é exatamente a divisão que o `MontadorDre` já
    /// faz por `AntesRO`/`AntesLL`:</para>
    ///
    /// <list type="table">
    ///   <item><term>operacional</term><description>`in` LUCRO LIQUIDO, `in` RESULTADO
    ///         OPERACIONAL — as despesas entre LUCRO BRUTO e o SUB-TOTAL</description></item>
    ///   <item><term>pós-operacional</term><description>`in` LUCRO LIQUIDO, `not in`
    ///         RESULTADO OPERACIONAL — RECEITAS FINANCEIRAS, COMPENSAÇÃO DE IMPOSTOS,
    ///         RATEIO DESP. CORPORATIVAS, INDENIZACAO DE MERC. VENC.</description></item>
    ///   <item><term>órfã</term><description>`not in` nas duas — o bloco depois do
    ///         LUCRO LIQUIDO</description></item>
    /// </list>
    ///
    /// <para><b>O recorte final é parametrizado e ainda não foi medido fora de C. Custo
    /// Principal.</b> Nos exemplos da 9815 ele é `CODCCPRINC` nos dois primeiros blocos e
    /// `CODCONTA` nas órfãs. Que em Grupo de Contas seja `CODGRUPO` e em Conta Gerencial
    /// `CODCONTA` é analogia — a subconsulta projeta as quatro colunas, mas ninguém
    /// capturou o trace das outras dimensões.</para>
    ///
    /// <para>Binds: {0} predicado dos dois blocos, {1} filiais do financeiro,
    /// :dtIni1/:dtFim1, {2} filiais da venda de ativo, :dtIni2/:dtFim2, {3} coluna do
    /// recorte, {4} valores do recorte.</para>
    /// </summary>
    public const string Lancamentos = """
        SELECT RECNUM, CODFILIAL, CODCCPRINC, DESCCCPRINC,
               CODCENTROCUSTO, DESCCENTROCUSTO, CODGRUPO, GRUPO, CODCONTA, CONTA,
               NUMTRANS, NUMNOTA, DUPLIC, INDICE, CODPROJETO, CODFORNEC, FORNECEDOR,
               DTLANC, DTCOMPETENCIA, DTCOMPENSACAO, DTPAGTO, HISTORICO, VPAGO,
               NUMBANCO, NUMCHEQUE, NUMBORDERO, NUMSEQBORDERO, NUMCHEQUE2,
               LOCALIZACAO, NOMEFUNC, NOMEFUNCBAIXA, NUMCAR,
               DTRECLASSIFIC, CODFUNCRECLASSIFIC
          FROM (
                SELECT FIN.RECNUM, FIN.INDICE, FIN.CODFILIAL,
                       CCPrinc.codccprinc AS CODCCPRINC,
                       CCPrinc.codccprinc || ' - ' || CCPrinc.DescCCPrinc AS DESCCCPRINC,
                       DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.codigocentrocusto,9998),9999) ,NVL(CC.codigocentrocusto,9998)) AS CODCENTROCUSTO,
                       DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.DESCRICAO,'NÃO INFORMADO'),'NÃO USA CENTRO DE CUSTO') ,NVL(CC.DESCRICAO,'NÃO INFORMADO')) AS DESCCENTROCUSTO,
                       GR.codgrupo AS CODGRUPO,
                       GR.codgrupo || ' - ' || GR.GRUPO AS GRUPO,
                       TO_NUMBER(FIN.CODCONTA) AS CODCONTA,
                       CT.CONTA || '  [' || FIN.CODCONTA || ']' AS CONTA,
                       (SELECT max(numcarreg) FROM PCMOVCR WHERE numlanc = FIN.RECNUM) AS NUMCAR,
                       FIN.numtrans AS NUMTRANS, FIN.NUMNOTA, FIN.Duplic AS DUPLIC,
                       FIN.codprojeto AS CODPROJETO, FIN.dtcompetencia AS DTCOMPETENCIA,
                       (SELECT PCMOVCR.DTCOMPENSACAO FROM PCMOVCR
                         WHERE PCMOVCR.NUMTRANS = FIN.NUMTRANS AND ROWNUM = 1) AS DTCOMPENSACAO,
                       SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) AS HISTORICO,
                       DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) AS VPAGO,
                       FIN.CODFORNEC, fin.dtlanc AS DTLANC, FIN.DTPAGTO,
                       FIN.NUMBANCO, FIN.NumCheque AS NUMCHEQUE, FIN.numbordero AS NUMBORDERO,
                       FIN.numseqbordero AS NUMSEQBORDERO, FIN.NUMCHEQUE2,
                       FIN.LOCALIZACAO, FIN.NOMEFUNC,
                       DECODE(FIN.TIPOPARCEIRO,
                         'F', (SELECT decode(cgc,'22078221000115',FANTASIA,FORNECEDOR) FROM PCFORNEC WHERE CODFORNEC = FIN.CODFORNEC),
                         'R', (SELECT NOME FROM PCUSUARI WHERE CODUSUR = FIN.CODFORNEC),
                         'C', (SELECT CLIENTE FROM PCCLIENT WHERE CODCLI = FIN.CODFORNEC),
                         'M', (SELECT nome FROM pcempr WHERE matricula = FIN.CODFORNEC),
                         'OUTROS') AS FORNECEDOR,
                       FIN.DTRECLASSIFIC, FIN.CODFUNCRECLASSIFIC,
                       (SELECT NOME FROM PCEMPR WHERE MATRICULA = FIN.CODFUNCBAIXA) AS NOMEFUNCBAIXA
                  FROM PCCONTA CT, PCGRUPO GR, PCCENTROCUSTO CC, PCRATEIOCENTROCUSTO RC,
                       (SELECT RECNUM, CODFILIAL, numtrans, NUMNOTA, Duplic, codprojeto,
                               dtcompetencia, dtlanc, DTVENC, DTPAGTO, nvl(VPAGO,VALOR) AS VPAGO,
                               INDICE, codconta, TIPOPARCEIRO, DTRECLASSIFIC, CODFUNCRECLASSIFIC,
                               historico, HISTORICO2, NUMBANCO, NumCheque, numbordero,
                               numseqbordero, NUMCHEQUE2, LOCALIZACAO, NOMEFUNC, CODFORNEC,
                               CODFUNCBAIXA, DTESTORNOBAIXA
                          FROM PCLANC
                         WHERE DTPAGTO IS NOT NULL) FIN,
                       (SELECT '99' AS codccprinc, 'NÃO USA/NÃO INFORMADO' AS DescCCPrinc FROM DUAL
                        UNION
                        SELECT codccprinc,
                               (SELECT descricao FROM PCCENTROCUSTO
                                 WHERE codigocentrocusto = CCP.CodPrinc) AS DescCCPrinc
                          FROM (SELECT SUBSTR(codigocentrocusto,1,2) AS CODCCPRINC,
                                       min(codigocentrocusto) AS CodPrinc
                                  FROM PCCENTROCUSTO
                                 GROUP BY SUBSTR(codigocentrocusto,1,2)) CCP) CCPrinc
                 WHERE FIN.CODCONTA = CT.CODCONTA
                   AND CT.GRUPOCONTA >= 200
                   AND FIN.codfilial IN ({1})
                   AND FIN.RECNUM   = RC.RECNUM   (+)
                   AND FIN.CODCONTA = RC.CODCONTA (+)
                   AND CT.grupoconta = GR.codgrupo (+)
                   AND RC.codigocentrocusto = cc.codigocentrocusto (+)
                   AND SUBSTR(NVL(cc.codigocentrocusto,99),1,2) = CCPrinc.codccprinc (+)
                   AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
                   AND NOT EXISTS (SELECT recnumadiantamento FROM pclancadiantfornec
                                    WHERE recnumpagto IS NOT NULL AND dtestorno IS NULL
                                      AND recnumadiantamento = fin.recnum)
                   AND FIN.DTESTORNOBAIXA IS NULL
                   {0}
                   AND nvl(FIN.DTPAGTO,fin.DTVENC) BETWEEN :dtIni1 AND :dtFim1
                UNION ALL
                SELECT 0, 'A', fin.codfilial, '85', '85 - RECEITA VENDA ATIVO',
                       '8501', 'RECEITA VENDA ATIVO',
                       GR.codgrupo, GR.codgrupo || ' - ' || GR.GRUPO,
                       CT.CODCONTA, CT.CONTA, NULL,
                       fin.numtrans, nf.numnota, fin.prest, NULL, nf.dtsaida, fin.dtpag,
                       (SELECT max(PCPRODCIAP.DESCRICAO) FROM PCMOVCIAP, PCPRODCIAP
                         WHERE PCMOVCIAP.CODPROD = PCPRODCIAP.CODPROD
                           AND PCMOVCIAP.NUMTRANSVENDA = nf.numtransvenda),
                       fin.valor, nf.codcli, fin.dtemissao, fin.dtpag,
                       fin.codbanco, NULL, NULL, NULL, NULL,
                       NULL, UPPER(fin.funclanc), nf.cliente, NULL, NULL, NULL
                  FROM pcnfsaid nf, pcprest fin, PCCONTA CT, PCGRUPO GR
                 WHERE nf.numnota = fin.duplic
                   AND nf.numtransvenda = fin.numtransvenda
                   AND ct.codconta = 4000004
                   AND CT.grupoconta = GR.codgrupo (+)
                   AND condvenda = 0 AND nf.vltotal > 0
                   AND nvl(nf.obs,'X') NOT LIKE '%CANCELADA%'
                   AND nf.dthoracancelamentosefaz IS NULL
                   AND fin.codcob <> 'DESD' AND fin.dtcancel IS NULL
                   AND fin.dtpag BETWEEN :dtIni2 AND :dtFim2
                   AND nf.codfilial IN ({2})
               )
         WHERE {3} IN ({4})
         ORDER BY CODCCPRINC, CODCONTA, VPAGO
        """;

    /// <summary>
    /// Predicado dos dois blocos, para o `{0}` de <see cref="Lancamentos"/>.
    ///
    /// <para>Não recebe nada do usuário: os dois operadores saem de um `switch` fechado, e
    /// o texto é constante. É o que mantém a montagem por concatenação longe de injeção.</para>
    /// </summary>
    public static string PredicadoDoBloco(bool antesRo, bool antesLl)
    {
        var ll = antesLl ? "in" : "not in";
        var ro = antesRo ? "in" : "not in";

        return $"""
                       AND FIN.CODCONTA {ll} (SELECT codgruconta FROM EPCPARDRE
                                               WHERE codgruconta > 0
                                                 AND id < (SELECT ID FROM EPCPARDRE
                                                            WHERE upper(grupo) LIKE 'LUCRO LIQUIDO'))
                       AND FIN.CODCONTA {ro} (SELECT codgruconta FROM EPCPARDRE
                                               WHERE id < (SELECT ID FROM EPCPARDRE
                                                            WHERE upper(grupo) LIKE 'RESULTADO OPERACIONAL'))
               """;
    }
}
