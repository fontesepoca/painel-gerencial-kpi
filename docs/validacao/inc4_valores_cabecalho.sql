-- ============================================================================
-- INCREMENTO 4 - valores do cabecalho do DRE
-- Cenario: 01/08/2026 a 27/08/2026 | filiais 7, 12, 25
-- Rodar como SCRIPT (F5).
--
-- Usa o bloco ADAPTADO ja validado por inc4_comparacao_faturamento.sql
-- (zero divergencias em 28/08/2026) e aplica a aritmetica do cabecalho.
--
-- Esperado, da planilha de parametros conhecidos:
--   RECEITA_BRUTA    41.401.481,82
--   ABAT_DESC         3.205.304,83
--   DEVOLUCAO         1.178.713,60
--   RECEITA_LIQUIDA  37.017.463,39
--   CMV_LIQ          27.169.880,12
--   ST_LIQ            2.424.988,75
--   PIS_LIQ              80.123,34
--   COFINS_LIQ          369.052,71
-- ============================================================================

ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY';

SELECT Sum(NVL(VLTABELA,0))                            AS RECEITA_BRUTA,
       Sum(NVL(VLTABELA,0)) - Sum(NVL(VLVENDA,0))      AS ABAT_DESC,
       Sum(NVL(VLDEVOLUCAO,0))                         AS DEVOLUCAO,
       Sum(NVL(VLVENDA,0)) - Sum(NVL(VLDEVOLUCAO,0))   AS RECEITA_LIQUIDA,
       Sum(NVL(VLCUSTOFIN,0)) - Sum(NVL(VLCMVDEVOL,0)) AS CMV_LIQ,
       Sum(NVL(VLST,0))     - Sum(NVL(VLST_DEV,0))     AS ST_LIQ,
       Sum(NVL(VLPIS,0))    - Sum(NVL(VLPIS_DEV,0))    AS PIS_LIQ,
       Sum(NVL(VLCOFINS,0)) - Sum(NVL(VLCOFINS_DEV,0)) AS COFINS_LIQ
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
