-- ============================================================================
-- INCREMENTO 4 - validacao da consulta de faturamento / CMV
-- Cenario: 01/08/2026 a 27/08/2026 | filiais 7, 12, 25
--
-- COMO RODAR: execute como SCRIPT (F5).
--
-- Compara o SQL ORIGINAL da 9815 (SEIS blocos: 3 filiais x vendas+devolucoes)
-- com a versao ADAPTADA (DOIS blocos, CODFILIAL IN (...)).
--
-- Esta consulta e a mais cara da rotina: 16,9 s por mes no cenario de 1 mes e
-- 115 s por mes no de 2 meses. Colapsar os blocos por filial e o que evita
-- 36 blocos quando o usuario marcar as 18 filiais.
--
-- RESULTADO ESPERADO: NENHUMA LINHA.
--
-- Valores esperados, da planilha de parametros conhecidos:
--   VLTABELA (Receita Bruta)  41.401.481,82
--   VLTABELA - VLVENDA        (3.205.304,83)  = ABAT./DESC.
--   VLDEVOLUCAO               (1.178.713,60)
--   VlVendaLiq                37.017.463,39   = RECEITAS LIQUIDAS
--   VLCUSTOFIN - VLCUSTOFINDEVOL (27.169.880,12) = CMV LIQ.
--   ST_Liq / PIS_Liq / COFINS_Liq  (2.424.988,75) (80.123,34) (369.052,71)
-- ============================================================================

ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY';

WITH original AS (
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
    AND NF.DTSAIDA Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
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
    AND NFE.DTENT Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
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
    AND NF.DTSAIDA Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
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
    AND NFE.DTENT Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
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
    AND NF.DTSAIDA Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
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
    AND NFE.DTENT Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) ) 
 ) 
),
adaptada AS (
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
    AND NF.DTSAIDA Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
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
    AND NFE.DTENT Between To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('27/08/2026','dd/mm/yyyy')
    AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
  AND MV.CODSEC <> 1601 
 ) 
)
SELECT 'VLCUSTOFIN'      AS COLUNA, o.VLCUSTOFIN      AS VL_ORIGINAL, a.VLCUSTOFIN      AS VL_ADAPTADA FROM original o, adaptada a WHERE ABS(NVL(o.VLCUSTOFIN,0)      - NVL(a.VLCUSTOFIN,0))      > 0.005
UNION ALL SELECT 'VLVENDA',        o.VLVENDA,        a.VLVENDA        FROM original o, adaptada a WHERE ABS(NVL(o.VLVENDA,0)        - NVL(a.VLVENDA,0))        > 0.005
UNION ALL SELECT 'VLTABELA',       o.VLTABELA,       a.VLTABELA       FROM original o, adaptada a WHERE ABS(NVL(o.VLTABELA,0)       - NVL(a.VLTABELA,0))       > 0.005
UNION ALL SELECT 'VLDEVOLUCAO',    o.VLDEVOLUCAO,    a.VLDEVOLUCAO    FROM original o, adaptada a WHERE ABS(NVL(o.VLDEVOLUCAO,0)    - NVL(a.VLDEVOLUCAO,0))    > 0.005
UNION ALL SELECT 'VLCUSTOFINDEVOL',o.VLCUSTOFINDEVOL,a.VLCUSTOFINDEVOL FROM original o, adaptada a WHERE ABS(NVL(o.VLCUSTOFINDEVOL,0)- NVL(a.VLCUSTOFINDEVOL,0))> 0.005
UNION ALL SELECT 'VLVENDALIQ',     o.VlVendaLiq,     a.VlVendaLiq     FROM original o, adaptada a WHERE ABS(NVL(o.VlVendaLiq,0)     - NVL(a.VlVendaLiq,0))     > 0.005
UNION ALL SELECT 'ST_LIQ',         o.ST_Liq,         a.ST_Liq         FROM original o, adaptada a WHERE ABS(NVL(o.ST_Liq,0)         - NVL(a.ST_Liq,0))         > 0.005
UNION ALL SELECT 'PIS_LIQ',        o.PIS_Liq,        a.PIS_Liq        FROM original o, adaptada a WHERE ABS(NVL(o.PIS_Liq,0)        - NVL(a.PIS_Liq,0))        > 0.005
UNION ALL SELECT 'COFINS_LIQ',     o.COFINS_Liq,     a.COFINS_Liq     FROM original o, adaptada a WHERE ABS(NVL(o.COFINS_Liq,0)     - NVL(a.COFINS_Liq,0))     > 0.005
