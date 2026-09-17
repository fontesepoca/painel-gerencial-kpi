-- dc50 — O hint no SELECT de fora ou só no bloco 1?
--
-- A dc49 mediu o bloco 1 isolado e achou o grau: PARALLEL(4), 3,8x. Falta decidir ONDE o hint
-- entra na consulta de verdade, que é um UNION ALL de três blocos:
--
--   FORA        um hint no SELECT externo, valendo para a consulta inteira. Mais simples de
--               ler, e o Oracle decide sozinho o que paralelizar lá dentro.
--   SÓ NO B1    hint dentro do bloco de vendas, que é onde estão 93,6% do custo. Mais
--               cirúrgico, e em tese toma menos processo do servidor para os blocos 2 e 3,
--               que juntos custam 16 s e não precisam de ajuda.
--
-- <b>Esta é a consulta INTEIRA</b>, os três blocos, igual à de `DreGerencialQueries`. As
-- medições anteriores usaram só o bloco 1 — boas para achar o gargalo, insuficientes para
-- escolher onde escrever o hint, porque o efeito de um `PARALLEL` no SELECT externo sobre um
-- UNION ALL não se deduz do bloco isolado.
--
-- A única diferença para o código é o ORDER BY final, removido: ele ordena três linhas e não
-- pode ficar dentro da subconsulta que soma tudo para a medição.
--
-- POR QUE OS MARCADORES
--   A consulta é montada UMA vez, com `#HINT_FORA#` e `#HINT_B1#` no lugar dos hints, e cada
--   variante só troca o que vai nesses dois pontos. Três cópias de uma consulta de cem linhas
--   divergiriam por um caractere em algum lugar, e a medição não avisaria.
--
-- Cada variante roda DUAS vezes; compare a segunda coluna, todas quentes. Umas 10 minutos.
--
-- O QUE ME DEVOLVER: a saída inteira.

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
  v_base VARCHAR2(32767);

  FUNCTION medir(p_fora VARCHAR2, p_b1 VARCHAR2) RETURN NUMBER IS
    v_sql  VARCHAR2(32767);
    v_ini  NUMBER;
    v_soma NUMBER;
  BEGIN
    v_sql := REPLACE(REPLACE(v_base, '#HINT_FORA#', p_fora), '#HINT_B1#', p_b1);
    v_ini := DBMS_UTILITY.GET_TIME;
    EXECUTE IMMEDIATE v_sql INTO v_soma;
    RETURN (DBMS_UTILITY.GET_TIME - v_ini) / 100;
  END;

  PROCEDURE rodada(p_rotulo VARCHAR2, p_fora VARCHAR2, p_b1 VARCHAR2) IS
    v_um   NUMBER;
    v_dois NUMBER;
  BEGIN
    v_um   := medir(p_fora, p_b1);
    v_dois := medir(p_fora, p_b1);
    DBMS_OUTPUT.PUT_LINE(
      RPAD(p_rotulo, 30) ||
      LPAD(TO_CHAR(v_um, '99990.00'), 10) || ' s   ' ||
      LPAD(TO_CHAR(v_dois, '99990.00'), 10) || ' s');
  END;
BEGIN
  v_base :=
    'SELECT SUM(VLCUSTOFIN + RECEITABRUTA + ABATDESC + DEVOLUCAO + RECEITALIQUIDA + ' ||
    'CMVLIQ + STLIQ + PISLIQ + COFINSLIQ) FROM (' ||
    'SELECT #HINT_FORA# MESANO AS MESANO, ' ||
    'Sum(NVL(VLCUSTOFIN,0)) AS VLCUSTOFIN, ' ||
    'Sum(NVL(VLTABELA,0)) AS RECEITABRUTA, ' ||
    'Sum(NVL(VLTABELA,0)) - Sum(NVL(VLVENDA,0)) AS ABATDESC, ' ||
    'Sum(NVL(VLDEVOLUCAO,0)) AS DEVOLUCAO, ' ||
    'Sum(NVL(VLVENDA,0)) - Sum(NVL(VLDEVOLUCAO,0)) AS RECEITALIQUIDA, ' ||
    'Sum(NVL(VLCUSTOFIN,0)) - Sum(NVL(VLCMVDEVOL,0)) AS CMVLIQ, ' ||
    'sum(nvl(VLST,0)) - sum(nvl(VLST_DEV,0)) AS STLIQ, ' ||
    'sum(nvl(VLPIS,0)) - sum(nvl(VLPIS_DEV,0)) AS PISLIQ, ' ||
    'sum(nvl(VLCOFINS,0)) - sum(nvl(VLCOFINS_DEV,0)) AS COFINSLIQ ' ||
    'FROM ( ' ||

    -- ── bloco 1: vendas por item ──────────────────────────────────────────
    'SELECT #HINT_B1# TO_CHAR(NF.DTSAIDA,''mm/yyyy'') AS MESANO, ' ||
    'SUM(decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0),(MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)))*MV.qt) as VLCUSTOFIN, ' ||
    'SUM(MV.punit*MV.qt) as VLVENDA, ' ||
    'SUM(MV.punit*MV.qt) VLVENDA_Total, ' ||
    'SUM(MV.ptabela*MV.qt) as VLTABELA, 0 as VLDEVOLUCAO, 0 as VLDEVOLUCAO_total, 0 as VLCMVDEVOL, ' ||
    'SUM((nvl(MV.st,0)+nvl(MVC.vlfecp,0))*MV.qt) VLST, 0 as VLST_DEV, ' ||
    'SUM((mv.VLPIS-(mv.custocont*mv.PERPIS/100))*MV.qt) as VLPIS, 0 AS VLPIS_dev, ' ||
    'SUM((mv.vlcofins-(mv.custocont*mv.PERCOFINS/100))*MV.qt) as vlcofins, 0 AS vlcofins_dev ' ||
    'FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR, ' ||
    '(select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp ' ||
    'WHERE NF.numtransvenda = MV.numtransvenda ' ||
    'AND mv.numtransitem = mvc.numtransitem (+) ' ||
    'AND MV.CODPROD = PR.CODPROD ' ||
    'AND NF.codcli = esp.codcli (+) ' ||
    'AND NF.CODFILIAL = esp.codfil (+) ' ||
    'AND MV.DTCANCEL IS NULL ' ||
    'AND NF.DTCANCEL IS NULL ' ||
    'AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,6108,6922,6102,6114,6115,6117,6119,6404,6910) ' ||
    'AND ((NVL(NF.VLTABELA,0)>0) OR (NVL(NF.VLTOTGER,0)>0) OR (NVL(NF.VLTOTAL,0)>0) OR (NVL(NF.VLCUSTOFIN,0)>0)) ' ||
    'AND ((NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = ''CO'')) ' ||
    'AND NF.DTSAIDA BETWEEN TO_DATE(''01/03/2026'',''dd/mm/yyyy'') AND TO_DATE(''31/05/2026'',''dd/mm/yyyy'') ' ||
    'AND NF.CODFILIAL IN (''7'',''27'',''12'',''22'',''24'',''25'',''34'',''1'',''28'') ' ||
    'AND ((nvl(esp.mostra_dre,''S'') = ''S'') or (NF.CONDVENDA in (5))) ' ||
    'AND nvl(PR.codsec,0) <> 1601 ' ||
    'GROUP BY TO_CHAR(NF.DTSAIDA,''mm/yyyy'') ' ||

    'UNION ALL ' ||

    -- ── bloco 2: devoluções ───────────────────────────────────────────────
    'SELECT TO_CHAR(NFE.DTENT,''mm/yyyy'') AS MESANO, 0 as VLCUSTOCONT, 0 as VLVENDA, ' ||
    '0 as VLVENDA_Total, 0 as VLTABELA, ' ||
    'SUM(round(NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0),2)) as VLDEVOLUCAO, ' ||
    'SUM(round(NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0),2)) as VLDEVOLUCAO_total, ' ||
    'SUM(NVL(MV.QT,0)*(NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)-nvl(MV.st,0)-nvl(MVC.vlfecp,0))) VLCMVDEVOL, ' ||
    '0 as VLST, SUM((nvl(MV.st,0)+nvl(MVC.vlfecp,0))*MV.qt) as VLST_DEV, ' ||
    '0 AS VLPIS, SUM((mv.VLPIS-(mv.custocont*mv.PERPIS/100))*MV.qt) AS VLPIS_dev, ' ||
    '0 AS vlcofins, SUM((mv.vlcofins-(mv.custocont*mv.PERCOFINS/100))*MV.qt) AS vlcofins_dev ' ||
    'FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED, PCPRODUT PR, ' ||
    '(select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp ' ||
    'WHERE NFE.numnota = MV.numnota (+) ' ||
    'AND NFE.numtransent = MV.numtransent (+) ' ||
    'AND mv.numtransitem = mvc.numtransitem (+) ' ||
    'AND NFE.codfornec = esp.codcli (+) ' ||
    'AND NFE.CODFILIAL = esp.codfil (+) ' ||
    'AND MV.numped = PED.numped (+) ' ||
    'AND MV.CODPROD = PR.CODPROD ' ||
    'AND nvl(PED.CONDVENDA,1) IN (''1'',''3'',''5'',''6'',''8'') ' ||
    'AND NFE.CODFILIAL IN (''7'',''27'',''12'',''22'',''24'',''25'',''34'',''1'',''28'') ' ||
    'AND NFE.TIPODESCARGA IN (''6'',''7'') ' ||
    'AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,''X'') <> ''NF CANCELADA'') ' ||
    'AND NFE.DTENT BETWEEN TO_DATE(''01/03/2026'',''dd/mm/yyyy'') AND TO_DATE(''31/05/2026'',''dd/mm/yyyy'') ' ||
    'AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) ' ||
    'AND MV.CODSEC <> 1601 ' ||
    'AND ((nvl(esp.mostra_dre,''S'') = ''S'') or (nvl(PED.CONDVENDA,1) in (5))) ' ||
    'GROUP BY TO_CHAR(NFE.DTENT,''mm/yyyy'') ' ||

    'UNION ALL ' ||

    -- ── bloco 3: notas sem item ───────────────────────────────────────────
    'SELECT TO_CHAR(NF.DTSAIDA,''mm/yyyy'') AS MESANO, ' ||
    'SUM(NVL(NF.VLCUSTOFIN,0)) as VLCUSTOFIN, ' ||
    'SUM(DECODE(NF.CONDVENDA, 8, NF.VLTOTAL, NF.VLTOTGER)) as VLVENDA, ' ||
    'SUM(DECODE(NF.CONDVENDA, 8, NF.VLTOTAL, NF.VLTOTGER)) VLVENDA_Total, ' ||
    'SUM(NVL(NF.VLTABELA, NF.VLTOTGER)) as VLTABELA, ' ||
    '0 as VLDEVOLUCAO, 0 as VLDEVOLUCAO_total, 0 as VLCMVDEVOL, ' ||
    '0 as VLST, 0 as VLST_DEV, 0 as VLPIS, 0 AS VLPIS_dev, 0 as vlcofins, 0 AS vlcofins_dev ' ||
    'FROM PCNFSAID NF, ' ||
    '(select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp ' ||
    'WHERE NF.codcli = esp.codcli (+) ' ||
    'AND NF.CODFILIAL = esp.codfil (+) ' ||
    'AND NF.DTCANCEL IS NULL ' ||
    'AND ((NF.CONDVENDA in (1,5,8) OR (NF.ESPECIE = ''CO'')) OR ((NF.CONDVENDA = 10) and (substr(replace(replace(replace(nf.cgc,''.'',''''),''/'',''''),''-'',''''),0,8) <> substr(replace(replace(replace(nf.cgcfilial,''.'',''''),''/'',''''),''-'',''''),0,8)))) ' ||
    'AND ((NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = ''CO'')) ' ||
    'AND NF.CODFISCAL NOT IN (522,622,722,532,632,732,5206) ' ||
    'AND NF.numtranscteanul IS NULL ' ||
    'AND ((nvl(esp.mostra_dre,''S'') = ''S'') or (NF.CONDVENDA in (5))) ' ||
    'AND NF.CODFILIAL IN (''7'',''27'',''12'',''22'',''24'',''25'',''34'',''1'',''28'') ' ||
    'AND NF.DTSAIDA BETWEEN TO_DATE(''01/03/2026'',''dd/mm/yyyy'') AND TO_DATE(''31/05/2026'',''dd/mm/yyyy'') ' ||
    'AND NOT EXISTS (SELECT 1 FROM PCMOV MV WHERE MV.numtransvenda = NF.numtransvenda AND MV.DTCANCEL IS NULL) ' ||
    'GROUP BY TO_CHAR(NF.DTSAIDA,''mm/yyyy'') ' ||

    ') GROUP BY MESANO)';

  DBMS_OUTPUT.PUT_LINE('Consulta INTEIRA do faturamento (tres blocos).');
  DBMS_OUTPUT.PUT_LINE('Marco a maio de 2026, nove filiais.');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE(RPAD('onde', 30) || LPAD('1a vez', 12) || LPAD('2a vez', 15));
  DBMS_OUTPUT.PUT_LINE(RPAD('-', 68, '-'));

  rodada('sem hint nenhum',        '',                   '');
  rodada('PARALLEL(4) no de fora', '/*+ PARALLEL(4) */', '');
  rodada('PARALLEL(4) so no bloco 1', '',                '/*+ PARALLEL(4) */');

  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Compare a 2a coluna.');
END;
/
