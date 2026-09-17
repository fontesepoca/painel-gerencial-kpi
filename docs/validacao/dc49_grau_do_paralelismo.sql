-- dc49 — Qual grau de paralelismo, e quanto ele custa ao resto do banco.
--
-- ONDE CHEGAMOS
--   A dc48 derrubou duas hipóteses minhas e achou a saída por acidente do roteiro:
--
--     o trimestre, sem hint          80,3 s   (quente)
--     o trimestre com PARALLEL(4)    10,2 s   (quente)
--
--   Oito vezes. A curva que eu supunha não existe (um mês custa 74 s, três custam ~211 s --
--   isso é reta), e dividir o período na aplicação PIORARIA: 217 s somados. O ganho está no
--   paralelismo do proprio Oracle, que a edicao 19c High Performance tem.
--
-- O QUE ESTE SCRIPT RESPONDE, e por que nenhuma das duas pode ser pulada
--
--   1. QUAL GRAU. Paralelismo não escala em linha reta, e passar do ponto piora: mais
--      processos disputam o mesmo disco e o mesmo tempo de CPU. Se 2 já entrega quase tudo
--      que 4 entrega, pedir 4 é tomar recurso da operação sem ganho.
--
--   2. QUANTO CUSTA AO RESTO. Este é o Oracle que a empresa usa para faturar. Uma apuração
--      que toma quatro processos por 10 s é diferente de uma que toma um por 80 s, e a
--      diferença não aparece em nenhum dos números acima -- ela aparece na tela de quem
--      estava emitindo nota naquele instante.
--
-- A ORDEM É PROPOSITAL. Cada variante roda DUAS vezes, e a comparação usa a SEGUNDA de cada
-- uma: assim todas são medidas quentes, e nenhuma leva vantagem por ter rodado depois das
-- outras. Foi exatamente esse viés que estragou a dc48 -- lá o trimestre rodou por último e
-- pareceu mais rápido do que é.
--
-- RODE EM HORÁRIO DE BAIXA MOVIMENTAÇÃO. O teste de grau 8 pede oito processos do servidor.
--
-- O QUE ME DEVOLVER: a saída inteira, e o resultado da consulta de limites no fim.

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
  TYPE t_hints IS TABLE OF VARCHAR2(64) INDEX BY VARCHAR2(32);
  v_hints t_hints;
  v_rotulo VARCHAR2(32);

  FUNCTION medir(p_hint VARCHAR2) RETURN NUMBER IS
    v_sql  VARCHAR2(32767);
    v_ini  NUMBER;
    v_soma NUMBER;
  BEGIN
    v_sql :=
      'SELECT SUM(VLCUSTOFIN + VLVENDA + VLTABELA + VLST + VLPIS + VLCOFINS) FROM (' ||
      'SELECT ' || p_hint || ' TO_CHAR(NF.DTSAIDA,''mm/yyyy'') AS MESANO, ' ||
      'SUM(decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0),(MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)))*MV.qt) as VLCUSTOFIN, ' ||
      'SUM(MV.punit*MV.qt) as VLVENDA, ' ||
      'SUM(MV.ptabela*MV.qt) as VLTABELA, ' ||
      'SUM((nvl(MV.st,0)+nvl(MVC.vlfecp,0))*MV.qt) VLST, ' ||
      'SUM((mv.VLPIS-(mv.custocont*mv.PERPIS/100))*MV.qt) as VLPIS, ' ||
      'SUM((mv.vlcofins-(mv.custocont*mv.PERCOFINS/100))*MV.qt) as VLCOFINS ' ||
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
      'GROUP BY TO_CHAR(NF.DTSAIDA,''mm/yyyy''))';

    v_ini := DBMS_UTILITY.GET_TIME;
    EXECUTE IMMEDIATE v_sql INTO v_soma;
    RETURN (DBMS_UTILITY.GET_TIME - v_ini) / 100;
  END;

  PROCEDURE rodada(p_rotulo VARCHAR2, p_hint VARCHAR2) IS
    v_primeira NUMBER;
    v_segunda  NUMBER;
  BEGIN
    v_primeira := medir(p_hint);
    v_segunda  := medir(p_hint);
    DBMS_OUTPUT.PUT_LINE(
      RPAD(p_rotulo, 24) ||
      LPAD(TO_CHAR(v_primeira, '99990.00'), 10) || ' s   ' ||
      LPAD(TO_CHAR(v_segunda, '99990.00'), 10) || ' s');
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('Bloco 1, marco a maio de 2026, nove filiais.');
  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE(RPAD('grau', 24) || LPAD('1a vez', 12) || LPAD('2a vez', 15));
  DBMS_OUTPUT.PUT_LINE(RPAD('-', 62, '-'));

  rodada('sem paralelismo', '');
  rodada('PARALLEL(2)', '/*+ PARALLEL(2) */');
  rodada('PARALLEL(4)', '/*+ PARALLEL(4) */');
  rodada('PARALLEL(8)', '/*+ PARALLEL(8) */');

  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('Compare a coluna da 2a vez: todas quentes, comparacao justa.');
END;
/

-- ═══════════════════════════════════════════════════════════════════════════
-- Quanto o banco permite, e quanto ele tem
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedir PARALLEL(8) num banco configurado para menos não dá erro: ele simplesmente entrega
-- menos, em silêncio. Estes são os tetos que valem de verdade, e o número de CPUs que os
-- processos vão dividir.
SELECT name, value
  FROM v$parameter
 WHERE name IN ('cpu_count',
                'parallel_max_servers',
                'parallel_servers_target',
                'parallel_degree_policy',
                'parallel_degree_limit',
                'parallel_min_time_threshold')
 ORDER BY name;
