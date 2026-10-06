-- ============================================================================
-- INCREMENTO 8 - a 9815 roda o faturamento UMA VEZ POR MES. Uma passada unica
-- pelo periodo inteiro da o mesmo resultado?
--
-- Cenario do trace de dois meses: 01/06 a 31/07/2026, filiais 7, 12, 25.
-- Rodar como SCRIPT (F5). Leva varios minutos: sao TRES execucoes da consulta
-- mais cara da rotina.
--
-- MENSAL:  BETWEEN 01/06 AND 30/06  +  BETWEEN 01/07 AND 31/07   (o que a 9815 faz)
-- UNICA:   BETWEEN 01/06 AND 31/07                                (o que queremos fazer)
--
-- POR QUE PODE DIFERIR: DATE no Oracle carrega hora. O mes 1 termina em
-- 30/06 as 00:00 e o mes 2 comeca em 01/07 as 00:00 — entao uma venda em
-- 30/06 as 14h nao cai em NENHUM dos dois. A passada unica a incluiria.
--
-- SE DIFERIR: a otimizacao esta descartada e a execucao mensal tem que ser
-- replicada, porque fidelidade vence performance.
-- SE NAO DIFERIR: uma passada substitui N, e 4 meses deixam de custar 4x.
-- ============================================================================

ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY';

WITH mes1 AS (
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
),
mes2 AS (
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
),
unica AS (
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
    AND NF.DTSAIDA Between To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND NF.CODFILIAL IN ('7','12','25')
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
    AND NFE.CODFILIAL IN ('7','12','25')
    AND NFE.TIPODESCARGA IN ('6','7')
    AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
    AND NFE.DTENT Between To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
 ) 
)
SELECT 'VLTABELA'    AS COLUNA, m.VLTABELA    AS MENSAL, u.VLTABELA    AS UNICA, m.VLTABELA    - u.VLTABELA    AS DIF FROM (SELECT a.VLTABELA+b.VLTABELA AS VLTABELA, a.VLVENDA+b.VLVENDA AS VLVENDA, a.VLDEVOLUCAO+b.VLDEVOLUCAO AS VLDEVOLUCAO, a.VLCUSTOFIN+b.VLCUSTOFIN AS VLCUSTOFIN, a.VLCUSTOFINDEVOL+b.VLCUSTOFINDEVOL AS VLCUSTOFINDEVOL, a.ST_Liq+b.ST_Liq AS ST_Liq, a.PIS_Liq+b.PIS_Liq AS PIS_Liq, a.COFINS_Liq+b.COFINS_Liq AS COFINS_Liq FROM mes1 a, mes2 b) m, unica u WHERE ABS(m.VLTABELA - u.VLTABELA) > 0.005
UNION ALL SELECT 'VLVENDA',     m.VLVENDA,     u.VLVENDA,     m.VLVENDA     - u.VLVENDA     FROM (SELECT a.VLVENDA+b.VLVENDA AS VLVENDA FROM mes1 a, mes2 b) m, unica u WHERE ABS(m.VLVENDA - u.VLVENDA) > 0.005
UNION ALL SELECT 'VLDEVOLUCAO', m.VLDEVOLUCAO, u.VLDEVOLUCAO, m.VLDEVOLUCAO - u.VLDEVOLUCAO FROM (SELECT a.VLDEVOLUCAO+b.VLDEVOLUCAO AS VLDEVOLUCAO FROM mes1 a, mes2 b) m, unica u WHERE ABS(m.VLDEVOLUCAO - u.VLDEVOLUCAO) > 0.005
UNION ALL SELECT 'VLCUSTOFIN',  m.VLCUSTOFIN,  u.VLCUSTOFIN,  m.VLCUSTOFIN  - u.VLCUSTOFIN  FROM (SELECT a.VLCUSTOFIN+b.VLCUSTOFIN AS VLCUSTOFIN FROM mes1 a, mes2 b) m, unica u WHERE ABS(m.VLCUSTOFIN - u.VLCUSTOFIN) > 0.005
UNION ALL SELECT 'VLCUSTOFINDEVOL', m.VLCUSTOFINDEVOL, u.VLCUSTOFINDEVOL, m.VLCUSTOFINDEVOL - u.VLCUSTOFINDEVOL FROM (SELECT a.VLCUSTOFINDEVOL+b.VLCUSTOFINDEVOL AS VLCUSTOFINDEVOL FROM mes1 a, mes2 b) m, unica u WHERE ABS(m.VLCUSTOFINDEVOL - u.VLCUSTOFINDEVOL) > 0.005
UNION ALL SELECT 'ST_LIQ',      m.ST_Liq,      u.ST_Liq,      m.ST_Liq      - u.ST_Liq      FROM (SELECT a.ST_Liq+b.ST_Liq AS ST_Liq FROM mes1 a, mes2 b) m, unica u WHERE ABS(m.ST_Liq - u.ST_Liq) > 0.005
UNION ALL SELECT 'PIS_LIQ',     m.PIS_Liq,     u.PIS_Liq,     m.PIS_Liq     - u.PIS_Liq     FROM (SELECT a.PIS_Liq+b.PIS_Liq AS PIS_Liq FROM mes1 a, mes2 b) m, unica u WHERE ABS(m.PIS_Liq - u.PIS_Liq) > 0.005
UNION ALL SELECT 'COFINS_LIQ',  m.COFINS_Liq,  u.COFINS_Liq,  m.COFINS_Liq  - u.COFINS_Liq  FROM (SELECT a.COFINS_Liq+b.COFINS_Liq AS COFINS_Liq FROM mes1 a, mes2 b) m, unica u WHERE ABS(m.COFINS_Liq - u.COFINS_Liq) > 0.005
