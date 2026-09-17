-- dc44 — Qual dos três blocos do faturamento custa os 247 s.
--
-- A dc43 mostrou que o faturamento é 92,5% da apuração. Esta consulta é um UNION ALL de três
-- blocos que tocam tabelas diferentes, e não há como saber qual pesa sem separá-los.
--
--   BLOCO 1  vendas por ITEM    PCNFSAID + PCMOV + PCMOVCOMPLE + PCPRODUT
--   BLOCO 2  devoluções         PCNFENT  + PCMOV + PCMOVCOMPLE + PCPEDC + PCPRODUT
--   BLOCO 3  notas SEM item     PCNFSAID, com NOT EXISTS contra PCMOV
--
-- Cada bloco abaixo é IDÊNTICO ao que está em `DreGerencialQueries.FaturamentoPorMes`, com os
-- binds trocados por literais. Não simplifiquei nada de propósito: mudar o SELECT muda o
-- plano, e aí a medição não valeria para a consulta real.
--
-- PERÍODO E FILIAIS são os mesmos da dc43 — março a maio de 2026, as nove filiais —, para os
-- números serem comparáveis com os 247,5 s de lá.
--
-- COMO RODAR
--   Ligue o cronômetro da ferramenta (no SQL*Plus, `SET TIMING ON`) e rode um bloco de cada
--   vez, anotando o tempo. Depois repita a rodada inteira: a segunda passada mostra o que o
--   cache não resolve.
--
--   Se algum bloco passar de uns cinco minutos, pode interromper e anotar "> 5 min" — já
--   responde à pergunta.
--
-- O QUE ME DEVOLVER
--   O tempo de cada bloco nas duas passadas e a contagem de linhas. Os valores não importam:
--   isto mede custo, não confere número com a 9815.

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — vendas por item
-- ═══════════════════════════════════════════════════════════════════════════
SELECT TO_CHAR(NF.DTSAIDA,'mm/yyyy') AS MESANO,
       SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN,
       SUM(  MV.punit * MV.qt) as VLVENDA,
       SUM(  MV.ptabela * MV.qt) as VLTABELA,
       SUM(  (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt) VLST,
       SUM(  ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt  ) as VLPIS,
       SUM(  ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt ) as vlcofins
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
   AND NF.DTSAIDA BETWEEN TO_DATE('01/03/2026','dd/mm/yyyy') AND TO_DATE('31/05/2026','dd/mm/yyyy')
   AND NF.CODFILIAL IN ('7','27','12','22','24','25','34','1','28')
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) )
   AND nvl(PR.codsec,0) <> 1601
 GROUP BY TO_CHAR(NF.DTSAIDA,'mm/yyyy');

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — devoluções
-- ═══════════════════════════════════════════════════════════════════════════
SELECT TO_CHAR(NFE.DTENT,'mm/yyyy') AS MESANO,
       SUM( round( NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0) ,2)) as VLDEVOLUCAO,
       SUM( NVL(MV.QT,0) * (NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)-nvl(MV.st,0)-nvl(MVC.vlfecp,0))  ) VLCMVDEVOL,
       SUM( (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt) as VLST_DEV,
       SUM( ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt ) AS VLPIS_dev,
       SUM( ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt ) AS vlcofins_dev
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
   AND NFE.CODFILIAL IN ('7','27','12','22','24','25','34','1','28')
   AND NFE.TIPODESCARGA IN ('6','7')
   AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA')
   AND NFE.DTENT BETWEEN TO_DATE('01/03/2026','dd/mm/yyyy') AND TO_DATE('31/05/2026','dd/mm/yyyy')
   AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
   AND MV.CODSEC <> 1601
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) )
 GROUP BY TO_CHAR(NFE.DTENT,'mm/yyyy');

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — notas sem item (o NOT EXISTS contra PCMOV)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT TO_CHAR(NF.DTSAIDA,'mm/yyyy') AS MESANO,
       SUM(NVL(NF.VLCUSTOFIN,0)) as VLCUSTOFIN,
       SUM(DECODE(NF.CONDVENDA, 8, NF.VLTOTAL, NF.VLTOTGER)) as VLVENDA,
       SUM(NVL(NF.VLTABELA, NF.VLTOTGER)) as VLTABELA
  FROM PCNFSAID NF,
       (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp
 WHERE NF.codcli        = esp.codcli (+)
   AND NF.CODFILIAL     = esp.codfil (+)
   AND NF.DTCANCEL      IS NULL
   AND ( (NF.CONDVENDA in (1,5,8) OR (NF.ESPECIE = 'CO')) OR ((NF.CONDVENDA = 10) and (substr(replace(replace(replace(nf.cgc,'.',''),'/',''),'-',''),0,8) <> substr(replace(replace(replace(nf.cgcfilial,'.',''),'/',''),'-',''),0,8))) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.CODFISCAL NOT IN (522,622,722,532,632,732,5206)
   AND NF.numtranscteanul IS NULL
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) )
   AND NF.CODFILIAL IN ('7','27','12','22','24','25','34','1','28')
   AND NF.DTSAIDA BETWEEN TO_DATE('01/03/2026','dd/mm/yyyy') AND TO_DATE('31/05/2026','dd/mm/yyyy')
   AND NOT EXISTS (SELECT 1 FROM PCMOV MV
                    WHERE MV.numtransvenda = NF.numtransvenda
                      AND MV.DTCANCEL IS NULL)
 GROUP BY TO_CHAR(NF.DTSAIDA,'mm/yyyy');

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — o tamanho do problema, para calibrar o resto
-- ═══════════════════════════════════════════════════════════════════════════
-- Se o bloco 1 estiver lendo milhões de linhas de PCMOV, o custo é de volume e a saída é uma;
-- se estiver lendo poucas e mesmo assim demorando, o problema é o plano de execução, e a
-- saída é outra. Sem esta contagem, as duas hipóteses explicam os mesmos 247 s.
SELECT 'notas de saida no periodo' AS O_QUE, COUNT(*) AS QUANTAS
  FROM PCNFSAID NF
 WHERE NF.DTSAIDA BETWEEN TO_DATE('01/03/2026','dd/mm/yyyy') AND TO_DATE('31/05/2026','dd/mm/yyyy')
   AND NF.CODFILIAL IN ('7','27','12','22','24','25','34','1','28')
   AND NF.DTCANCEL IS NULL
UNION ALL
SELECT 'itens de PCMOV dessas notas', COUNT(*)
  FROM PCNFSAID NF, PCMOV MV
 WHERE NF.numtransvenda = MV.numtransvenda
   AND NF.DTSAIDA BETWEEN TO_DATE('01/03/2026','dd/mm/yyyy') AND TO_DATE('31/05/2026','dd/mm/yyyy')
   AND NF.CODFILIAL IN ('7','27','12','22','24','25','34','1','28')
   AND NF.DTCANCEL IS NULL
   AND MV.DTCANCEL IS NULL
UNION ALL
SELECT 'linhas da subconsulta esp', COUNT(*)
  FROM cliente_especial ce, pcclient clie
 WHERE clie.codcliprinc = ce.codcli;
