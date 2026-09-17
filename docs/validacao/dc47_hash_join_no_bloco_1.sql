-- dc47 — Forçar hash join no bloco 1 resolve, ou só troca de problema?
--
-- O DIAGNÓSTICO, em uma frase: o otimizador acha que saem 306 mil itens e que a consulta leva
-- 31 s; leva 233 s. Com essa estimativa ele escolhe NESTED LOOPS, que é excelente para poucas
-- linhas e catastrófico para muitas — e faz milhões de leituras aleatórias de bloco único em
-- PCMOV e PCMOVCOMPLE, uma por item.
--
-- A hipótese a testar: substituir esses nested loops por hash join, que lê em varredura e
-- junta em memória, derruba o tempo.
--
-- <b>Nenhuma tabela legada é tocada.</b> Hint vive no texto da NOSSA consulta, e desfazer é
-- apagar um comentário. Não é DBMS_STATS, não é índice novo, não é nada que sobreviva a quem
-- não pediu.
--
-- Rode as quatro na ordem. A variante 0 é a linha de base de hoje, para o número da sessão
-- ser comparável com os das outras — cache e carga do banco mudam de hora em hora, e comparar
-- com os 232,9 s de ontem seria comparar com outra tarde.
--
-- O QUE ME DEVOLVER: as quatro linhas de tempo que o script imprime.
--
-- CUIDADO: cada variante executa de verdade. No pior caso são uns 4 minutos cada.

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
  v_inicio NUMBER;
  v_total  NUMBER;

  PROCEDURE anotar(p_rotulo VARCHAR2, p_inicio NUMBER) IS
  BEGIN
    DBMS_OUTPUT.PUT_LINE(
      RPAD(p_rotulo, 44) ||
      LPAD(TO_CHAR((DBMS_UTILITY.GET_TIME - p_inicio) / 100, '99990.00'), 10) || ' s');
  END;

  -- O mesmo SQL para todas, com o hint entrando por concatenação. Assim não há chance de uma
  -- variante divergir da outra por um filtro digitado diferente — e foi um risco real: o
  -- bloco tem quatorze condições no WHERE.
  PROCEDURE medir(p_rotulo VARCHAR2, p_hint VARCHAR2) IS
    v_sql   VARCHAR2(32767);
    v_ini   NUMBER;
    v_soma  NUMBER;
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
    anotar(p_rotulo, v_ini);
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('Marco a maio de 2026, nove filiais. Bloco 1 do faturamento.');
  DBMS_OUTPUT.PUT_LINE('');

  -- Linha de base DESTA sessão. Sem ela, comparar com os 232,9 s de ontem seria comparar
  -- com outra carga do banco.
  medir('0 - como esta hoje, sem hint', '');

  -- Hash join só entre a nota e o item. É a junção do id 9/10 do plano, a que faz uma busca
  -- por índice para cada nota.
  medir('1 - hash join NF x MV', '/*+ LEADING(NF MV) USE_HASH(MV) */');

  -- Hash join também em PCMOVCOMPLE, que no plano atual é o NESTED LOOPS OUTER do id 2 --
  -- mais um acesso aleatorio por item.
  medir('2 - hash join em MV e MVC', '/*+ LEADING(NF MV MVC) USE_HASH(MV) USE_HASH(MVC) */');

  -- O plano atual alcanca PCMOV por indice GLOBAL (Pstart/Pstop = ROWID), entao o periodo
  -- nao ajuda a reduzir o que ela le. Com FULL, o Oracle varre -- e, se PCMOV for
  -- particionada por data, poda as particoes do periodo.
  medir('3 - hash join com varredura de MV', '/*+ LEADING(NF MV MVC) USE_HASH(MV) USE_HASH(MVC) FULL(MV) */');
END;
/

-- ═══════════════════════════════════════════════════════════════════════════
-- E, de passagem: qual versão é este banco?
-- ═══════════════════════════════════════════════════════════════════════════
-- O plano da dc46 termina com "this is an adaptive plan", e planos adaptativos só existem a
-- partir do 12c. A documentação do projeto diz 11g. Um dos dois está errado, e a diferença
-- muda o que dá para usar daqui em diante.
SELECT * FROM product_component_version;
