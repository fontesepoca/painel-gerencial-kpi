-- ============================================================================
-- OTIMIZACAO 1 - plano de execucao da consulta de faturamento
--
-- 88% do tempo da apuracao esta nesta consulta. No trace da 9815 de 31/08,
-- estrutura levou 6,5s, valores 4,0s e faturamento 171,8s. Otimizar qualquer
-- outra coisa e desperdicio.
--
-- EXPLAIN PLAN nao executa a consulta - so pede o plano ao otimizador. Custo
-- zero para o banco. Precisa da PLAN_TABLE, que costuma existir por padrao;
-- se der ORA-02404 ou ORA-00942, me avise que uso outro caminho.
--
-- Cenario do plano: filial 7, julho/2026 - o mesmo que levou 78s pela API.
--
-- O QUE PROCURAR no resultado:
--   TABLE ACCESS FULL em PCNFSAID, PCMOV ou PCPRODUT  -> falta indice ou o
--                                                        filtro nao e usavel
--   as linhas ROWS estimadas em cada passo             -> onde o volume explode
--   MERGE JOIN CARTESIAN                               -> junta errada
--
-- Rodar como SCRIPT (F5). Sao dois comandos: o EXPLAIN e o DISPLAY.
-- ============================================================================

EXPLAIN PLAN SET STATEMENT_ID = 'dre_faturamento' FOR
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
            AND NF.DTSAIDA BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
            AND NF.CODFILIAL IN ('7')
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
            AND NFE.CODFILIAL IN ('7')
            AND NFE.TIPODESCARGA IN ('6','7')
            AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
            AND NFE.DTENT BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
            AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
          AND MV.CODSEC <> 1601 
          GROUP BY TO_CHAR(NFE.DTENT,'mm/yyyy') 
            )
         GROUP BY MESANO
         ORDER BY SUBSTR(MESANO,4,4), SUBSTR(MESANO,1,2)

;

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, 'dre_faturamento', 'ALL'));

-- ============================================================================
-- RESULTADO - 31/08/2026
--
-- Custo total 102K, em dois blocos:
--   vendas    (PCNFSAID)  94.738   92%
--   devolucao (PCNFENT)    8.073    8%
--
-- Dentro do bloco de vendas:
--   ate o HASH JOIN (id 7) ......................... 26.494
--   TABLE ACCESS FULL PCNFSAID (id 26) .............  8.726
--   NESTED LOOPS OUTER com PCMOVCOMPLE (id 6) ...... 94.736
--
-- O nested loop do PCMOVCOMPLE acrescenta ~68.000 sozinho - 67% da consulta
-- inteira. Oracle busca a tabela linha a linha, 34.179 vezes, para ler UMA
-- coluna: mvc.vlfecp.
--
-- O PCNFSAID e lido por TABLE ACCESS FULL, mas com pruning: PARTITION RANGE
-- SINGLE 201/201, PARTITION HASH ALL 1-32. Le uma particao de data so.
--
-- HIPOTESE DERRUBADA: o PCPRODUT, que eu suspeitava por ser juntado apenas
-- para filtrar codsec, custa 544 e e resolvido por juncao de dois indices
-- (index$_join$_005) sem tocar a tabela. Tira-lo economizaria menos de 1% e
-- teria risco de mudar resultado. Bom ter olhado o plano antes de propor.
--
-- Nota do Oracle: "'PLAN_TABLE' is old version" - o plano saiu legivel, mas
-- pode faltar informacao acessoria.
-- ============================================================================
