-- ============================================================================
-- INCREMENTO 8 - faturamento agrupado por mes, numa passada so
--
-- Ja esta provado que uma passada unica da o mesmo TOTAL que as execucoes
-- mensais (inc8_mensal_vs_periodo.sql voltou vazio, e as colunas de data nao
-- carregam hora). Falta provar que agrupar POR MES dentro dessa passada
-- reproduz cada mes separadamente.
--
-- Cenario: 01/06 a 31/07/2026, filiais 7, 12, 25. Rodar como SCRIPT (F5).
--
-- MENSAL: as duas execucoes da 9815, uma por mes
-- AGRUPADA: uma execucao com GROUP BY do mes, dentro de cada bloco
--
-- RESULTADO ESPERADO: NENHUMA LINHA.
-- ============================================================================

ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY';

WITH mensal AS (
  SELECT '06/2026' AS MESANO, m.* FROM (
SELECT Sum(NVL(VLCUSTOFIN,0)) as VLCUSTOFIN,
       Sum(NVL(VLVENDA,0)) VLVENDA,
       Sum(NVL(VLTABELA,0)) VLTABELA,
       Sum(NVL(VLDEVOLUCAO,0)) VLDEVOLUCAO,
       Sum(NVL(VLCMVDEVOL,0)) VLCUSTOFINDEVOL,
       Sum(NVL(VLVENDA,0) - NVL(VLDEVOLUCAO,0)) VlVendaLiq, 
       Sum(NVL(VLVENDA_Total,0) - NVL(VLDEVOLUCAO_total,0)) VlVendaLiq_Total, 
       sum(nvl(VLST,0))-sum(nvl(VLST_DEV,0)) as ST_Liq, 
       sum(nvl(VLPIS,0))-sum(nvl(VLPIS_DEV,0)) as PIS_Liq, 
       sum(nvl(VLCOFINS,0))-sum(nvl(VLCOFINS_DEV,0)) as COFINS_Liq  
 FROM ( 
  SELECT SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN, 
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
    AND NF.DTSAIDA Between To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('30/06/2026','dd/mm/yyyy')
    AND NF.CODFILIAL IN ('7' )
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
    AND nvl(PR.codsec,0) <> 1601 
 UNION ALL 
 SELECT 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
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
    AND NFE.DTENT Between To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('30/06/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) ) 
 UNION ALL 
  SELECT SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN, 
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
    AND NF.DTSAIDA Between To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('30/06/2026','dd/mm/yyyy')
    AND NF.CODFILIAL IN ('12' )
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
    AND nvl(PR.codsec,0) <> 1601 
 UNION ALL 
 SELECT 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
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
    AND NFE.CODFILIAL IN ('12')
    AND NFE.TIPODESCARGA IN ('6','7')
    AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
    AND NFE.DTENT Between To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('30/06/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) ) 
 UNION ALL 
  SELECT SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN, 
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
    AND NF.DTSAIDA Between To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('30/06/2026','dd/mm/yyyy')
    AND NF.CODFILIAL IN ('25' )
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
    AND nvl(PR.codsec,0) <> 1601 
 UNION ALL 
 SELECT 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
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
    AND NFE.CODFILIAL IN ('25')
    AND NFE.TIPODESCARGA IN ('6','7')
    AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
    AND NFE.DTENT Between To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('30/06/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) ) 
 ) 
  ) m
  UNION ALL
  SELECT '07/2026' AS MESANO, m.* FROM (
SELECT Sum(NVL(VLCUSTOFIN,0)) as VLCUSTOFIN,
       Sum(NVL(VLVENDA,0)) VLVENDA,
       Sum(NVL(VLTABELA,0)) VLTABELA,
       Sum(NVL(VLDEVOLUCAO,0)) VLDEVOLUCAO,
       Sum(NVL(VLCMVDEVOL,0)) VLCUSTOFINDEVOL,
       Sum(NVL(VLVENDA,0) - NVL(VLDEVOLUCAO,0)) VlVendaLiq, 
       Sum(NVL(VLVENDA_Total,0) - NVL(VLDEVOLUCAO_total,0)) VlVendaLiq_Total, 
       sum(nvl(VLST,0))-sum(nvl(VLST_DEV,0)) as ST_Liq, 
       sum(nvl(VLPIS,0))-sum(nvl(VLPIS_DEV,0)) as PIS_Liq, 
       sum(nvl(VLCOFINS,0))-sum(nvl(VLCOFINS_DEV,0)) as COFINS_Liq  
 FROM ( 
  SELECT SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN, 
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
    AND NF.DTSAIDA Between To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND NF.CODFILIAL IN ('7' )
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
    AND nvl(PR.codsec,0) <> 1601 
 UNION ALL 
 SELECT 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
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
    AND NFE.DTENT Between To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) ) 
 UNION ALL 
  SELECT SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN, 
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
    AND NF.DTSAIDA Between To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND NF.CODFILIAL IN ('12' )
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
    AND nvl(PR.codsec,0) <> 1601 
 UNION ALL 
 SELECT 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
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
    AND NFE.CODFILIAL IN ('12')
    AND NFE.TIPODESCARGA IN ('6','7')
    AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
    AND NFE.DTENT Between To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) ) 
 UNION ALL 
  SELECT SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN, 
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
    AND NF.DTSAIDA Between To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND NF.CODFILIAL IN ('25' )
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
    AND nvl(PR.codsec,0) <> 1601 
 UNION ALL 
 SELECT 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
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
    AND NFE.CODFILIAL IN ('25')
    AND NFE.TIPODESCARGA IN ('6','7')
    AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
    AND NFE.DTENT Between To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) ) 
 ) 
  ) m
),
agrupada AS (
  SELECT MESANO,
         Sum(NVL(VLCUSTOFIN,0))                              as VLCUSTOFIN,
         Sum(NVL(VLVENDA,0))                                 VLVENDA,
         Sum(NVL(VLTABELA,0))                                VLTABELA,
         Sum(NVL(VLDEVOLUCAO,0))                             VLDEVOLUCAO,
         Sum(NVL(VLCMVDEVOL,0))                              VLCUSTOFINDEVOL,
         Sum(NVL(VLVENDA,0) - NVL(VLDEVOLUCAO,0))            VlVendaLiq,
         Sum(NVL(VLVENDA_Total,0) - NVL(VLDEVOLUCAO_total,0)) VlVendaLiq_Total,
         sum(nvl(VLST,0))-sum(nvl(VLST_DEV,0))               as ST_Liq,
         sum(nvl(VLPIS,0))-sum(nvl(VLPIS_DEV,0))             as PIS_Liq,
         sum(nvl(VLCOFINS,0))-sum(nvl(VLCOFINS_DEV,0))       as COFINS_Liq
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
    AND NF.DTSAIDA BETWEEN To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND NF.CODFILIAL IN ('7','12','25')
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
    AND NFE.CODFILIAL IN ('7','12','25')
    AND NFE.TIPODESCARGA IN ('6','7')
    AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
    AND NFE.DTENT BETWEEN To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
  GROUP BY TO_CHAR(NFE.DTENT,'mm/yyyy') 
    )
   GROUP BY MESANO
)
SELECT NVL(m.MESANO, a.MESANO) AS MESANO, 'VLTABELA' AS COLUNA, m.VLTABELA AS MENSAL, a.VLTABELA AS AGRUPADA
  FROM mensal m FULL OUTER JOIN agrupada a ON m.MESANO = a.MESANO
 WHERE m.MESANO IS NULL OR a.MESANO IS NULL OR ABS(NVL(m.VLTABELA,0) - NVL(a.VLTABELA,0)) > 0.005
UNION ALL SELECT m.MESANO, 'VLVENDA',     m.VLVENDA,     a.VLVENDA     FROM mensal m JOIN agrupada a ON m.MESANO=a.MESANO WHERE ABS(m.VLVENDA - a.VLVENDA) > 0.005
UNION ALL SELECT m.MESANO, 'VLDEVOLUCAO', m.VLDEVOLUCAO, a.VLDEVOLUCAO FROM mensal m JOIN agrupada a ON m.MESANO=a.MESANO WHERE ABS(m.VLDEVOLUCAO - a.VLDEVOLUCAO) > 0.005
UNION ALL SELECT m.MESANO, 'VLCUSTOFIN',  m.VLCUSTOFIN,  a.VLCUSTOFIN  FROM mensal m JOIN agrupada a ON m.MESANO=a.MESANO WHERE ABS(m.VLCUSTOFIN - a.VLCUSTOFIN) > 0.005
UNION ALL SELECT m.MESANO, 'VLCUSTOFINDEVOL', m.VLCUSTOFINDEVOL, a.VLCUSTOFINDEVOL FROM mensal m JOIN agrupada a ON m.MESANO=a.MESANO WHERE ABS(m.VLCUSTOFINDEVOL - a.VLCUSTOFINDEVOL) > 0.005
UNION ALL SELECT m.MESANO, 'ST_LIQ',      m.ST_Liq,      a.ST_Liq      FROM mensal m JOIN agrupada a ON m.MESANO=a.MESANO WHERE ABS(m.ST_Liq - a.ST_Liq) > 0.005
UNION ALL SELECT m.MESANO, 'PIS_LIQ',     m.PIS_Liq,     a.PIS_Liq     FROM mensal m JOIN agrupada a ON m.MESANO=a.MESANO WHERE ABS(m.PIS_Liq - a.PIS_Liq) > 0.005
UNION ALL SELECT m.MESANO, 'COFINS_LIQ',  m.COFINS_Liq,  a.COFINS_Liq  FROM mensal m JOIN agrupada a ON m.MESANO=a.MESANO WHERE ABS(m.COFINS_Liq - a.COFINS_Liq) > 0.005
ORDER BY 1, 2
