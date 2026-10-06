-- dc48 — Três consultas de um mês custam menos que uma de três meses?
--
-- O QUE A dc47 DERRUBOU
--   Forçar hash join foi 3,5x PIOR: 769 s contra 211 s. Os nested loops do plano não são o
--   defeito — são a saída certa. PCMOV é grande demais para ser varrida, e 1,5 milhão de
--   buscas indexadas sai mais barato que a varredura. Hint está fora.
--
-- O QUE SOBRA, e vem dos nossos próprios números
--   1 mês   16,9 s     (trace antigo, uma filial)
--   2 meses  115 s
--   3 meses  247 s
--
--   Não é reta, é curva. Se três meses fossem três vezes um mês, seriam uns 51 s. A consulta
--   pune período longo de forma desproporcional — e se isso se confirmar, quebrar o trimestre
--   em três consultas de um mês ganha tempo mesmo SOMANDO, antes de qualquer paralelismo.
--
--   Isso importa porque é mudança NOSSA. O `Task.WhenAll` de `ApurarAsync` já paraleliza
--   entre recortes; faltaria o modo mensal gerar um recorte por mês em vez de um só. Nenhum
--   hint, nada tocado no banco.
--
-- A SEGUNDA PORTA
--   O banco é 19c Enterprise Edition High Performance, não 11g como a documentação do projeto
--   dizia. Paralelismo de consulta está disponível, e o teste 4 mede o que ele faz aqui.
--
-- COMO RODAR
--   Uma vez só, e me devolva as cinco linhas. São uns 15 minutos no total.
--
--   Rode em horário de baixa movimentação, por causa do teste 4: PARALLEL(4) pede quatro
--   processos do servidor ao mesmo tempo, e este é o Oracle da operação.

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
  PROCEDURE medir(p_rotulo VARCHAR2, p_de VARCHAR2, p_ate VARCHAR2, p_hint VARCHAR2 DEFAULT '') IS
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
      'AND NF.DTSAIDA BETWEEN TO_DATE(''' || p_de || ''',''dd/mm/yyyy'') AND TO_DATE(''' || p_ate || ''',''dd/mm/yyyy'') ' ||
      'AND NF.CODFILIAL IN (''7'',''27'',''12'',''22'',''24'',''25'',''34'',''1'',''28'') ' ||
      'AND ((nvl(esp.mostra_dre,''S'') = ''S'') or (NF.CONDVENDA in (5))) ' ||
      'AND nvl(PR.codsec,0) <> 1601 ' ||
      'GROUP BY TO_CHAR(NF.DTSAIDA,''mm/yyyy''))';

    v_ini := DBMS_UTILITY.GET_TIME;
    EXECUTE IMMEDIATE v_sql INTO v_soma;

    DBMS_OUTPUT.PUT_LINE(
      RPAD(p_rotulo, 44) ||
      LPAD(TO_CHAR((DBMS_UTILITY.GET_TIME - v_ini) / 100, '99990.00'), 10) || ' s');
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('Bloco 1 do faturamento, nove filiais.');
  DBMS_OUTPUT.PUT_LINE('');

  -- Um mês de cada vez. Se a soma destes três ficar bem abaixo dos ~211 s do trimestre, a
  -- curva está confirmada e a correção é dividir o período na aplicação.
  medir('marco sozinho',  '01/03/2026', '31/03/2026');
  medir('abril sozinho',  '01/04/2026', '30/04/2026');
  medir('maio sozinho',   '01/05/2026', '31/05/2026');

  DBMS_OUTPUT.PUT_LINE('');

  -- O trimestre de novo, NESTA sessão, para a comparação não depender da carga de ontem.
  medir('o trimestre inteiro', '01/03/2026', '31/05/2026');

  DBMS_OUTPUT.PUT_LINE('');

  -- A outra porta: deixar o próprio Oracle dividir o trabalho. Edição High Performance tem
  -- paralelismo de consulta.
  medir('o trimestre com PARALLEL(4)', '01/03/2026', '31/05/2026', '/*+ PARALLEL(4) */');
END;
/
