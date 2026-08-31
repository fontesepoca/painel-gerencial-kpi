namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// Consultas da rotina DRE Gerencial (9815 do Winthor).
/// **Somente leitura** — nenhuma tabela é escrita.
/// </summary>
public static class DreGerencialQueries
{
    /// <summary>
    /// Filiais disponíveis para o filtro.
    ///
    /// Adaptada do trace da 9815 (`docs/Resultado das consultas na rotina oficial/`).
    /// Duas diferenças deliberadas em relação ao original, ambas documentadas em
    /// `docs/ROTINA_9815.md`:
    ///
    /// 1. **Sem o `AND f.codfil IN (...)`.** No Winthor essa lista vem da tela de
    ///    pré-seleção exibida antes de abrir a rotina. Na web não existe essa tela:
    ///    o filtro Filial já nasce com as 18 do cadastro.
    ///
    /// 2. **`CODFIL` como desempate no `ORDER BY`.** `ORDEM_PROCESSA` tem valores
    ///    repetidos (quatro filiais com ordem 3, três com ordem 5), e ordenar só por ela
    ///    deixa a ordem dessas linhas a critério do banco — a lista mudaria de posição
    ///    entre execuções. Não altera quais filiais aparecem, só torna a ordem estável.
    ///
    ///    O `LPAD` existe porque `CODFIL` é texto: sem ele a ordenação é lexicográfica e
    ///    a filial `5` viria depois da `19`. `LPAD` alinha à direita e ordena como número,
    ///    sem `TO_NUMBER` — converter código de cadastro é o erro que derrubou o Centro
    ///    de Custo na 9815.
    ///
    /// O outer join `(+)` é o do original e fica como está: `PCFILIAL` só fornece a UF,
    /// e filial sem registro lá não pode sumir da lista.
    ///
    /// Sem parâmetros.
    /// </summary>
    public const string Filiais = """
        SELECT F.CODFIL                             AS CODFILIAL,
               F.LABEL                              AS LABEL,
               E.EMPRESA                            AS EMPRESACODIGO,
               E.DESCRICAO                          AS EMPRESA,
               E.DESCRICAO || ' - ' || F.DESCRICAO  AS UNIDADE,
               NVL(FW.UF, 'MG')                     AS UF,
               F.ORDEM_PROCESSA                     AS ORDEM
          FROM FILIAIS F, EMPRESA E, PCFILIAL FW
         WHERE F.EMPRESA = E.EMPRESA
           AND F.CODFIL  = FW.CODIGO (+)
         ORDER BY F.ORDEM_PROCESSA, LPAD(F.CODFIL, 10, '0')
        """;

    /// <summary>
    /// Estrutura de linhas do DRE para a análise **Grupo de Contas**, já com o bloco de
    /// **contas órfãs** — as que têm movimento no período e não estão parametrizadas em
    /// `EPCPARDRE`. São elas que dão rótulo ao bloco final do relatório
    /// (`Acerto De Estoque`, `CONTRATO DE MUTUO`, …).
    ///
    /// <para><b>Validada contra o original</b> em 28/08/2026 por
    /// `docs/validacao/inc5a_comparacao_estrutura.sql`. Única mudança: os três blocos de
    /// órfãs (um por filial) viraram um, com `CODFILIAL IN (...)`.</para>
    ///
    /// <para><b>Duas particularidades do bloco de órfãs, replicadas como estão:</b></para>
    /// <list type="number">
    ///   <item>Ele lê `PCLANC` <b>direto, sem o `DTPAGTO IS NOT NULL`</b> que o
    ///         `GetValorGrupo` aplica. Em competência isso significa que a estrutura pode
    ///         listar uma conta cuja linha de despesa não existe — rótulo sem valor. Em
    ///         caixa não há diferença prática, porque o filtro `FIN.DTPAGTO BETWEEN` já
    ///         exclui nulo.</item>
    ///   <item>O filtro de "não parametrizada" é um `NOT IN` sobre o <b>par</b>
    ///         `(conta, centro de custo)`, com `PCCONTACENTROCUSTO` em outer join. Uma
    ///         conta parametrizada só para certos centros de custo continua órfã nos
    ///         demais. É a construção mais sutil do SQL da rotina.</item>
    /// </list>
    ///
    /// <para>O `ORDER BY ID` é o do original — sem `NULLS LAST` explícito, porque no Oracle
    /// esse já é o padrão em ordem crescente. A linha de `ID` nulo do cadastro cai no fim, e
    /// as órfãs recebem `ID` sintético (`ROWNUM + max(ID)`), o que as coloca depois de todas
    /// as parametrizadas.</para>
    ///
    /// <para>Binds, nesta ordem: {0} placeholders das filiais, depois `:dtIni` e `:dtFim`.
    /// {1} é a expressão de data do regime — <b>não</b> é a mesma do `GetValorGrupo`:
    /// aqui caixa usa `FIN.DTPAGTO` puro, ver
    /// <see cref="Application.Features.DreGerencial.RegimeDre.ExpressaoFiltroEstrutura"/>.</para>
    /// </summary>
    public const string EstruturaGrupoDeContas = """
          SELECT min(ID) as ID, CODGRUCONTA, GRUPO, max(INFCONTAS) as INFCONTAS, max(cor) as COR, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL 
           FROM ( 
                 select PAR.ID, 
                        case when PAR.CODGRUCONTA <= 0 then  to_char(PAR.CODGRUCONTA) else to_Char(gr.codgrupo) end as CODGRUCONTA, 
                        case when PAR.CODGRUCONTA <= 0 then PAR.GRUPO else gr.grupo end as GRUPO, PAR.INFCONTAS, PAR.COR, '' as TIPOCONTA, '' as RESPONSAVEL,  
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')  then 'S' else 'N' end as AntesRO, 
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLL, 
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLF 
                     from EPCPARDRE PAR, PCCONTA CO, PCGRUPO GR 
                    WHERE PAR.CODGRUCONTA = CO.codconta (+) 
                      AND CO.GRUPOCONTA = gr.codgrupo (+) 
                 union all 
                 SELECT ROWNUM+(select max(ID) from EPCPARDRE) as ID, to_char(codgrupo) as CODGRUCONTA, GRUPO, 'N' as INFCONTAS,  NULL as COR, '' as TIPOCONTA, '' as RESPONSAVEL, 'N' as AntesRO, 'N' as AntesLL, 'N' as AntesLF 
                   FROM ( 
                        SELECT CODGRUPO, GRUPO, SUM(VPAGO) AS VPAGO, count(*) as qdeReg 
                        FROM ( 
         SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,  
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO  
            FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC, 
                  ( select '99' as codccprinc, 'NÃO USA/NÃO INFORMADO' as DescCCPrinc FROM DUAL 
                    union 
                    select codccprinc, (select descricao from PCCENTROCUSTO where CodigoCentroCusto = CCP.CodPrinc) as DescCCPrinc 
                    FROM (select SUBSTR(CodigoCentroCusto,1,2) as CODCCPRINC, min(CodigoCentroCusto) as CodPrinc 
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%' group by SUBSTR(CodigoCentroCusto,1,2)) CCP) CCPrinc  
           WHERE  FIN.CODCONTA = CT.CODCONTA 
             AND  CT.GRUPOCONTA >= 200 
             AND  FIN.CODFILIAL IN ({0}) 
             AND  FIN.RECNUM = RC.RECNUM (+) 
             AND  FIN.CODCONTA = RC.CODCONTA (+) 
             AND  CT.grupoconta = GR.codgrupo (+) 
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+) 
             AND  SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+) 
             AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) ) 
            AND {1} BETWEEN :dtIni AND :dtFim
                         ) GROUP BY CODGRUPO, GRUPO 
                     ORDER BY 1 
                     ) 
                      where VPAGO <> 0  or qdereg <> 0 
               )   
            group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL 
            order By ID 
        """;

    /// <summary>
    /// Despesas do período por dimensão — o `GetValorGrupo` da 9815, para a análise
    /// **Grupo de Contas**.
    ///
    /// <para><b>Este SQL foi validado contra o original</b> em 28/08/2026:
    /// `docs/validacao/inc3_comparacao_despesas.sql` comparou as duas versões no mesmo
    /// período e devolveu zero divergências. Três mudanças em relação ao trace, todas
    /// provadas equivalentes:</para>
    /// <list type="number">
    ///   <item>três blocos `UNION ALL`, um por filial, viraram um bloco com
    ///         `CODFILIAL IN (...)` — com 18 filiais seriam 18 blocos;</item>
    ///   <item>`TO_NUMBER` na chave virou `TO_CHAR`, o que elimina o defeito do Centro
    ///         de Custo por construção;</item>
    ///   <item>o round-trip `TO_CHAR(To_Date(&lt;data&gt;,'dd/mm/yyyy'),'mm/yyyy')` virou
    ///         `TO_CHAR(&lt;data&gt;,'mm/yyyy')`, que não depende do `NLS_DATE_FORMAT` da
    ///         sessão. Ver `docs/CONVENCOES_ORACLE.md` §11.</item>
    /// </list>
    ///
    /// <para><b>Ordem dos binds — o ODP.NET é posicional.</b> Nesta ordem exata:</para>
    /// <list type="number">
    ///   <item>{0} — placeholders das filiais, primeiro `IN` (`PCLANC`)</item>
    ///   <item>:dtIni1, :dtFim1 — período das despesas</item>
    ///   <item>:dtIni2, :dtFim2 — período da linha injetada (`PCPREST.DTPAG`)</item>
    ///   <item>{3} — placeholders das filiais, segundo `IN` (`PCNFSAID`)</item>
    /// </list>
    /// <para>As datas repetem valor mas precisam de nomes distintos: com bind posicional,
    /// reusar `:dtIni` daria dois parâmetros para um nome só.</para>
    ///
    /// <para>{1} e {2} são as expressões de data do regime, de
    /// <see cref="Application.Features.DreGerencial.RegimeDre"/> — não são valores,
    /// são trechos de SQL.</para>
    /// </summary>
    public const string DespesasGrupoDeContas = """
         SELECT  GRUPOCONTA AS GRUPOCONTA, AntesRO AS ANTESRO, AntesLL AS ANTESLL, AntesLF AS ANTESLF, MES_ANO AS MESANO, MES AS MES, ANO AS ANO, sum(VLREALIZADO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) AS VPAGOEXCLUSIVOFORNEC, sum(QdeReg) AS QDEREG 
         FROM ( 
         SELECT  to_char(decode(AntesLF,'N',CODCONTA,  codgrupo)) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg 
                        FROM ( 
          SELECT  FIN.RECNUM, FIN.CODFILIAL, CCPrinc.codccprinc, CCPrinc.DescCCPrinc,  
                  case  
                        when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                        and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL'))  then 'S' else 'N' end as AntesRO, 
                  case  
                        when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                        and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLL, 
                  case  
                        when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                        and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLF, 
                  DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.CodigoCentroCusto,9998),9999) , NVL(CC.CodigoCentroCusto,9998)) as CODCENTROCUSTO, 
                  DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.DESCRICAO,'NÃO INFORMADO'),'NÃO USA CENTRO DE CUSTO') ,NVL(CC.DESCRICAO,'NÃO INFORMADO')) as DESCCENTROCUSTO,  
                  GR.codgrupo, GR.GRUPO, FIN.CODCONTA, CT.CONTA, 
                  FIN.numtrans, FIN.NUMNOTA, FIN.Duplic, FIN.codprojeto, FIN.dtcompetencia, 
                  TO_CHAR({1},'mm/yyyy') as MES_ANO, 
                  TO_CHAR({1},'mm') as MES, 
                  extract(YEAR FROM {1}) as ANO, 
                  SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) HISTORICO, 
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO,  
                  0 as VPAGO_EXCLUSIVO_FORNEC, 
                  FIN.DTPAGTO, FIN.NUMBANCO,FIN.NumCheque,FIN.numbordero,FIN.numseqbordero, FIN.NUMCHEQUE2, 
                  FIN.LOCALIZACAO, FIN.NOMEFUNC, 
                  DECODE(FIN.TIPOPARCEIRO, 
                    'F', (SELECT FORNECEDOR FROM PCFORNEC WHERE CODFORNEC = FIN.CODFORNEC), 
                    'R', (SELECT NOME FROM PCUSUARI WHERE CODUSUR = FIN.CODFORNEC), 
                    'C', (SELECT CLIENTE FROM PCCLIENT WHERE CODCLI = FIN.CODFORNEC), 
                    'OUTROS') AS  FORNECEDOR, 
                  FIN.DTRECLASSIFIC, FIN.CODFUNCRECLASSIFIC, 
                  (SELECT NOME FROM PCEMPR WHERE MATRICULA = FIN.CODFUNCBAIXA) NOMEFUNCBAIXA 
            FROM  PCCONTA CT, PCGRUPO GR, PCCENTROCUSTO CC, 
        PCRATEIOCENTROCUSTO RC, 
                  (select RECNUM, CODFILIAL, numtrans, NUMNOTA, Duplic, codprojeto, dtcompetencia, DTVENC, DTPAGTO, nvl(VPAGO,VALOR) as VPAGO, INDICE, 
         codconta, 
                          TIPOPARCEIRO, DTRECLASSIFIC, CODFUNCRECLASSIFIC, historico, HISTORICO2, 
                          NUMBANCO, NumCheque, numbordero, numseqbordero, NUMCHEQUE2, LOCALIZACAO, NOMEFUNC, CODFORNEC, CODFUNCBAIXA 
                     from PCLANC
                    WHERE DTPAGTO IS NOT NULL 
                  ) FIN, 
                  ( select '99' as codccprinc, 'NÃO USA/NÃO INFORMADO' as DescCCPrinc FROM DUAL 
                    union 
                    select codccprinc, (select descricao from PCCENTROCUSTO where CodigoCentroCusto = CCP.CodPrinc) as DescCCPrinc 
                    FROM (select SUBSTR(CodigoCentroCusto,1,2) as CODCCPRINC, min(CodigoCentroCusto) as CodPrinc 
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%' group by SUBSTR(CodigoCentroCusto,1,2)) CCP) CCPrinc  
           WHERE  FIN.CODCONTA = CT.CODCONTA 
             AND  CT.GRUPOCONTA >= 200 
             AND  FIN.CODFILIAL IN ({0}) 
             AND  FIN.RECNUM = RC.RECNUM (+) 
             AND  FIN.CODCONTA = RC.CODCONTA (+) 
             AND  CT.grupoconta = GR.codgrupo (+) 
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+) 
             AND  SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+) 
             AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO' 
             AND not exists (select recnumadiantamento from pclancadiantfornec where recnumpagto is not null and dtestorno is null and recnumadiantamento = fin.recnum) 
            AND {2} BETWEEN :dtIni1 AND :dtFim1
         AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR) 
                         ) GROUP BY  to_char(decode(AntesLF,'N',CODCONTA,  codgrupo)), AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO  
         union all 
         select '400' as GRUPOCONTA,  
                'N' as AntesRO, 'S' as AntesLL,  'S' as AntesLF, TO_CHAR(FIN.dtpag,'mm/yyyy') as MES_ANO, 
                TO_CHAR(FIN.dtpag,'mm') as MES, 
                extract(YEAR FROM FIN.dtpag) as ANO, fin.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg  
           from pcnfsaid nf, pcprest fin 
          where nf.numnota = fin.duplic 
            and nf.numtransvenda  = fin.numtransvenda 
            and condvenda = 0 and nf.vltotal > 0 and nvl(nf.obs,'X') not like '%CANCELADA%' and nf.dthoracancelamentosefaz is null 
            and fin.codcob <> 'DESD' and fin.dtcancel is null 
            and fin.dtpag BETWEEN :dtIni2 AND :dtFim2
            and nf.codfilial IN ({3}) 
        ) GROUP BY GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
        """;

    /// <summary>
    /// Faturamento, CMV e impostos, **agrupados por mês** — a consulta mais cara da 9815.
    ///
    /// <para><b>Duas diferenças em relação ao original, ambas provadas equivalentes</b>
    /// em 28/08/2026:</para>
    /// <list type="number">
    ///   <item>Os <b>seis</b> blocos (3 filiais × vendas e devoluções) viraram <b>dois</b>,
    ///         com `CODFILIAL IN (...)` — `inc4_comparacao_faturamento.sql`.</item>
    ///   <item>As <b>N execuções mensais</b> viraram <b>uma</b>, com `GROUP BY` do mês —
    ///         `inc8_mensal_vs_periodo.sql` e `inc8_faturamento_por_mes.sql`.</item>
    /// </list>
    ///
    /// <para>A segunda só é válida porque as colunas de data <b>não carregam hora</b>: os
    /// meses da 9815 vão de `00:00` a `00:00`, e uma venda em 30/06 às 14h não cairia em
    /// nenhum dos dois. Verificado — 70.435 linhas de `DTSAIDA`, 13.245 de `DTENT` e 30.922
    /// de `DTPAGTO`, nenhuma com hora. Ver `docs/ROTINA_9815.md` §12: se isso mudar, a
    /// equivalência cai.</para>
    ///
    /// <para>Cada bloco agrupa pela <b>sua própria</b> data — vendas por `DTSAIDA`,
    /// devoluções por `DTENT` —, que é o que a execução mensal do original fazia ao
    /// restringir os dois ao mesmo mês.</para>
    ///
    /// <para><b>Não depende do regime.</b> Receita e CMV são idênticos em caixa e
    /// competência.</para>
    ///
    /// <para>Binds: :dtIni1, :dtFim1 (vendas), {0} filiais de `PCNFSAID`, {1} filiais de
    /// `PCNFENT`, :dtIni2, :dtFim2 (devoluções).</para>
    /// </summary>
    public const string FaturamentoPorMes = """
        SELECT MESANO                                              AS MESANO,
               Sum(NVL(VLCUSTOFIN,0))                              AS VLCUSTOFIN,
               Sum(NVL(VLTABELA,0))                                AS RECEITABRUTA,
               Sum(NVL(VLTABELA,0)) - Sum(NVL(VLVENDA,0))          AS ABATDESC,
               Sum(NVL(VLDEVOLUCAO,0))                             AS DEVOLUCAO,
               Sum(NVL(VLVENDA,0)) - Sum(NVL(VLDEVOLUCAO,0))       AS RECEITALIQUIDA,
               Sum(NVL(VLCUSTOFIN,0)) - Sum(NVL(VLCMVDEVOL,0))     AS CMVLIQ,
               sum(nvl(VLST,0))     - sum(nvl(VLST_DEV,0))         AS STLIQ,
               sum(nvl(VLPIS,0))    - sum(nvl(VLPIS_DEV,0))        AS PISLIQ,
               sum(nvl(VLCOFINS,0)) - sum(nvl(VLCOFINS_DEV,0))     AS COFINSLIQ
          FROM (
          SELECT TO_CHAR(NF.DTSAIDA,'mm/yyyy') AS MESANO, SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN, 
                 SUM(  MV.punit * MV.qt) as VLVENDA,  
                 SUM(  MV.punit * MV.qt) VLVENDA_Total,   
                 SUM(  MV.ptabela * MV.qt) as VLTABELA, 0 as VLDEVOLUCAO,  0 as VLDEVOLUCAO_total, 0 as VLCMVDEVOL, 
                 SUM(  (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt) VLST, 0 as VLST_DEV, 
                 SUM(  ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt  ) as VLPIS, 0 AS VLPIS_dev, 
                 SUM(  ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt ) as vlcofins, 0 AS vlcofins_dev 
           FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR,  
                (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp 
          WHERE NF.numtransvenda = MV.numtransvenda 
            AND mv.numtransitem  = mvc.numtransitem (+) 
            AND MV.CODPROD       = PR.CODPROD 
            AND NF.codcli        = esp.codcli (+) 
            AND NF.CODFILIAL     = esp.codfil (+) 
            AND MV.DTCANCEL      IS NULL 
            AND NF.DTCANCEL      IS NULL 
            AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,6108,6922,6102,6114,6115,6117,6119,6404,6910) 
            AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)  OR (NVL(NF.VLTOTAL,0) > 0) OR (NVL(NF.VLCUSTOFIN,0) > 0) ) 
            AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') ) 
            AND NF.DTSAIDA BETWEEN :dtIni1 AND :dtFim1
            AND NF.CODFILIAL IN ({0})
           AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
            AND nvl(PR.codsec,0) <> 1601 
          GROUP BY TO_CHAR(NF.DTSAIDA,'mm/yyyy') 
         UNION ALL 
         SELECT TO_CHAR(NFE.DTENT,'mm/yyyy') AS MESANO, 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
                SUM( round( NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0) ,2)) as VLDEVOLUCAO, 
                SUM( round( NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0) ,2)) as VLDEVOLUCAO_total, 
                SUM( NVL(MV.QT,0) * (NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)-nvl(MV.st,0)-nvl(MVC.vlfecp,0))  ) VLCMVDEVOL, 
                0 as VLST,     SUM( (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt) as VLST_DEV, 
                0 AS VLPIS,    SUM( ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt ) AS VLPIS_dev, 
                0 AS vlcofins, SUM( ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt ) AS vlcofins_dev 
           FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED, PCPRODUT PR, 
                (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp 
          WHERE NFE.numnota       = MV.numnota      (+) 
            AND NFE.numtransent   = MV.numtransent  (+) 
            AND mv.numtransitem   = mvc.numtransitem (+) 
            AND NFE.codfornec     = esp.codcli      (+) 
            AND NFE.CODFILIAL     = esp.codfil      (+) 
            AND MV.numped         = PED.numped      (+) 
            AND MV.CODPROD        = PR.CODPROD 
            AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8') 
            AND NFE.CODFILIAL IN ({1})
            AND NFE.TIPODESCARGA IN ('6','7')
            AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
            AND NFE.DTENT BETWEEN :dtIni2 AND :dtFim2
            AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
          AND MV.CODSEC <> 1601 
          GROUP BY TO_CHAR(NFE.DTENT,'mm/yyyy') 
            )
         GROUP BY MESANO
         ORDER BY SUBSTR(MESANO,4,4), SUBSTR(MESANO,1,2)
        """;
}
