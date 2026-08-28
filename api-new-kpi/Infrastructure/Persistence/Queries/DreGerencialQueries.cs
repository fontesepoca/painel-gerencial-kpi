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
    /// Estrutura de linhas do DRE para a análise **Grupo de Contas**.
    ///
    /// <para>
    /// A 9815 usa um SQL diferente para cada dimensão — não é uma consulta parametrizada.
    /// As outras três entram nos próximos incrementos (ver `docs/ROTINA_9815_LEVANTAMENTO.md`
    /// §4.4.1).
    /// </para>
    ///
    /// <para>
    /// <b>Falta aqui, de propósito, o `UNION ALL` das contas órfãs</b> — as que têm
    /// movimento no período e não estão parametrizadas em `EPCPARDRE`, e que a 9815 exibe
    /// depois do LUCRO LIQUIDO. Aquele trecho precisa de período e filiais, e varre `PCLANC`;
    /// entra no incremento 3, junto com a leitura de despesas, para não pagar duas vezes
    /// pela mesma varredura.
    /// </para>
    ///
    /// <para>
    /// `ORDER BY ID` com `MIN(ID)`: a linha de `ID` nulo do cadastro cai no fim
    /// (`NULLS LAST` é o padrão do Oracle em ordem crescente, e está explícito para não
    /// depender disso). É assim que "Pneus e Câmaras" aparece após o LUCRO LIQUIDO.
    /// </para>
    ///
    /// Sem parâmetros.
    /// </summary>
    public const string EstruturaGrupoDeContas = """
        SELECT MIN(ID)         AS ID,
               CODGRUCONTA     AS CODGRUCONTA,
               GRUPO           AS GRUPO,
               MAX(INFCONTAS)  AS INFCONTAS,
               MAX(COR)        AS COR,
               ANTESRO         AS ANTESRO,
               ANTESLL         AS ANTESLL,
               ANTESLF         AS ANTESLF
          FROM (
                SELECT PAR.ID                                     AS ID,
                       CASE WHEN PAR.CODGRUCONTA <= 0
                            THEN TO_CHAR(PAR.CODGRUCONTA)
                            ELSE TO_CHAR(GR.CODGRUPO) END         AS CODGRUCONTA,
                       CASE WHEN PAR.CODGRUCONTA <= 0
                            THEN PAR.GRUPO
                            ELSE GR.GRUPO END                     AS GRUPO,
                       PAR.INFCONTAS                              AS INFCONTAS,
                       PAR.COR                                    AS COR,
                       CASE WHEN PAR.ID < (SELECT ID FROM EPCPARDRE
                                            WHERE UPPER(GRUPO) LIKE 'RESULTADO OPERACIONAL')
                            THEN 'S' ELSE 'N' END                 AS ANTESRO,
                       CASE WHEN PAR.ID < (SELECT ID FROM EPCPARDRE
                                            WHERE UPPER(GRUPO) LIKE 'LUCRO LIQUIDO')
                            THEN 'S' ELSE 'N' END                 AS ANTESLL,
                       CASE WHEN PAR.ID < (SELECT ID FROM EPCPARDRE
                                            WHERE UPPER(GRUPO) LIKE 'LUCRO LIQUIDO')
                            THEN 'S' ELSE 'N' END                 AS ANTESLF
                  FROM EPCPARDRE PAR, PCCONTA CO, PCGRUPO GR
                 WHERE PAR.CODGRUCONTA = CO.CODCONTA (+)
                   AND CO.GRUPOCONTA   = GR.CODGRUPO (+)
               )
         GROUP BY CODGRUCONTA, GRUPO, ANTESRO, ANTESLL, ANTESLF
         ORDER BY ID NULLS LAST
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
}
