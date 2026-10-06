-- dc52 — Quantas apurações simultâneas o banco aguenta antes de degradar.
--
-- A pergunta é do Gabriel, 17/09/2026, e ela não tem resposta em número fixo: o Oracle não
-- recusa uma consulta paralela quando os processos acabam. Ele faz DOWNGRADE — roda com menos
-- processos, ou serial — sem erro, sem aviso, sem log que alguém veja. A apuração só demora
-- mais, e ninguém liga isso a um teto que foi atingido.
--
-- Estas consultas descobrem qual é esse teto.
--
-- POR QUE NÃO É `SELECT * FROM v$parameter`
--   Já tentamos na dc49: ORA-00942, falta de privilégio nas views V$. Este script usa
--   `DBMS_UTILITY.GET_PARAMETER_VALUE`, que lê o mesmo valor por outro caminho e costuma estar
--   liberada para qualquer usuário. Se ela também falhar, o bloco 3 é o plano C e não depende
--   de parâmetro nenhum.

SET SERVEROUTPUT ON SIZE UNLIMITED

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — os tetos, por um caminho que costuma passar sem privilégio de V$
-- ═══════════════════════════════════════════════════════════════════════════
DECLARE
  v_int    BINARY_INTEGER;
  v_texto  VARCHAR2(512);
  v_achou  BINARY_INTEGER;

  PROCEDURE mostrar(p_nome VARCHAR2, p_explica VARCHAR2) IS
    v_i BINARY_INTEGER;
    v_s VARCHAR2(512);
    v_r BINARY_INTEGER;
  BEGIN
    v_r := DBMS_UTILITY.GET_PARAMETER_VALUE(p_nome, v_i, v_s);
    DBMS_OUTPUT.PUT_LINE(
      RPAD(p_nome, 30) || LPAD(NVL(TO_CHAR(v_i), NVL(v_s, '?')), 12) || '   ' || p_explica);
  EXCEPTION
    WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE(RPAD(p_nome, 30) || LPAD('sem acesso', 12));
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('');
  mostrar('cpu_count',                  'nucleos que os processos dividem');
  mostrar('parallel_max_servers',       'TETO ABSOLUTO de processos paralelos na instancia');
  mostrar('parallel_servers_target',    'a partir daqui, consultas entram em fila');
  mostrar('parallel_degree_policy',     'MANUAL respeita o hint; AUTO decide sozinho');
  mostrar('parallel_degree_limit',      'teto por consulta quando a politica e AUTO');
  mostrar('parallel_min_percent',       'se 0, degrada em silencio em vez de falhar');
  DBMS_OUTPUT.PUT_LINE('');
END;
/

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — o histórico: o banco JÁ degradou consultas paralelas?
-- ═══════════════════════════════════════════════════════════════════════════
-- Esta é a informação mais valiosa do script, porque não é teoria: diz se o teto já foi
-- encostado na prática, com a carga que a empresa tem hoje. Se aparecerem downgrades aqui
-- ANTES da nossa mudança, o banco já está apertado e quatro processos por apuração vão doer.
--
-- Depende de V$SYSSTAT. Se der ORA-00942, pule.
SELECT name, value
  FROM v$sysstat
 WHERE name LIKE 'Parallel operations%'
    OR name LIKE 'queries parallelized%'
    OR name LIKE 'DML statements parallelized%'
 ORDER BY name;

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — plano C: quantos processos a NOSSA consulta realmente pede
-- ═══════════════════════════════════════════════════════════════════════════
-- Se os dois blocos acima falharem por privilégio, este responde a parte que mais importa, e
-- não depende de nada além de rodar a consulta.
--
-- Eu venho dizendo "quatro processos por apuração", e isso pode estar pela metade: quando o
-- plano tem etapas que conversam entre si -- e o nosso tem um HASH GROUP BY --, o Oracle aloca
-- DOIS conjuntos de processos, produtores e consumidores. Com PARALLEL(4) seriam OITO.
--
-- O plano abaixo mostra isso na coluna TQ e nas linhas `PX SEND` / `PX RECEIVE`: se aparecerem
-- dois pares (`:TQ10000` e `:TQ10001`, por exemplo), são dois conjuntos.
EXPLAIN PLAN SET STATEMENT_ID = 'dc52' FOR
SELECT /*+ PARALLEL(4) */
       TO_CHAR(NF.DTSAIDA,'mm/yyyy') AS MESANO,
       SUM(MV.punit * MV.qt) as VLVENDA
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

-- A coluna que interessa é a última, TQ, e as linhas PX.
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, 'dc52', 'BASIC +PARALLEL'));

-- ═══════════════════════════════════════════════════════════════════════════
-- COMO LER O RESULTADO
-- ═══════════════════════════════════════════════════════════════════════════
--   processos por apuração = 4, ou 8 se o bloco 3 mostrar dois conjuntos
--   apurações simultâneas ate degradar = parallel_max_servers / processos por apuração
--
-- Exemplo, com os valores mais comuns: parallel_max_servers costuma ser cpu_count * 20. Num
-- servidor de 8 nucleos seriam 160 processos -- 20 apurações simultâneas com 8 processos cada,
-- o que e mais gente do que as 28 pessoas que tem acesso jamais vao apurar ao mesmo tempo.
--
-- Mas ESSE numero e o teto do PARALELISMO, nao o ponto em que a operação sente. O servidor tem
-- os nucleos do `cpu_count`, e eles atendem tambem quem esta emitindo nota. Quatro apurações
-- simultâneas ocupando 32 processos num servidor de 8 nucleos nao vao falhar -- vao disputar
-- CPU com o faturamento, e e isso que aparece na tela da operação.
--
-- O QUE ME DEVOLVER: a saida dos três blocos, e o numero de ORA- que aparecer.
