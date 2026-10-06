-- dc46 — O plano de execução do bloco 1, que é 93,6% da apuração.
--
-- Onde chegamos: o faturamento é 92,5% da apuração (dc43), e dentro dele o bloco de vendas
-- por item é 232,9 s de 248,8 s (dc45). Devoluções (7,0 s) e notas sem item (8,9 s) saíram
-- da conversa. A subconsulta `esp` tem 54 linhas e já estava descartada.
--
-- A pergunta agora é uma só: 1,57 milhão de linhas de PCMOV não deveriam custar 233 s. Que
-- plano o Oracle está escolhendo?
--
-- São DUAS tentativas, e a primeira é muito melhor. Rode a A; se ela falhar por falta de
-- privilégio, rode a B.
--
-- ATENÇÃO: a tentativa A executa a consulta de verdade. São uns 4 minutos.

-- ═══════════════════════════════════════════════════════════════════════════
-- TENTATIVA A — o plano REAL, com linhas estimadas contra linhas de verdade
-- ═══════════════════════════════════════════════════════════════════════════
-- É esta que responde a pergunta. `ALLSTATS LAST` traz, por operação:
--
--   E-Rows   quantas linhas o otimizador ACHOU que viriam
--   A-Rows   quantas vieram DE VERDADE
--   A-Time   quanto tempo aquela operação levou
--   Buffers  quantos blocos ela leu
--   OMem/1Mem/Used-Mem  memória de trabalho, e se estourou para disco
--
-- A diferença entre E-Rows e A-Rows é o diagnóstico: quando o otimizador erra a estimativa
-- por ordens de grandeza, ele escolhe nested loops onde caberia hash join, e o custo explode
-- exatamente como está explodindo aqui.
--
-- Precisa de SELECT em V$SESSION, V$SQL e V$SQL_PLAN_STATISTICS_ALL. Se der
-- ORA-00942 ou ORA-01031, pule para a tentativa B.

SELECT /*+ GATHER_PLAN_STATISTICS dc46_bloco1 */
       TO_CHAR(NF.DTSAIDA,'mm/yyyy') AS MESANO,
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

-- Rode ESTE logo em seguida, na MESMA sessão e sem nenhuma consulta no meio.
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(NULL, NULL, 'ALLSTATS LAST'));

-- ═══════════════════════════════════════════════════════════════════════════
-- TENTATIVA B — só se a A falhar por privilégio
-- ═══════════════════════════════════════════════════════════════════════════
-- Este é o plano ESTIMADO. Não executa a consulta, é instantâneo, e precisa apenas da
-- PLAN_TABLE.
--
-- Vale menos porque só mostra o que o otimizador PLANEJA fazer, sem as linhas reais — e é
-- justamente a distância entre o planejado e o real que costuma explicar um caso assim. Ainda
-- assim mostra a ordem das junções e o método de cada uma, que já é bastante.

EXPLAIN PLAN SET STATEMENT_ID = 'dc46' FOR
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

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, 'dc46', 'ALL'));

-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE ME DEVOLVER
-- ═══════════════════════════════════════════════════════════════════════════
-- O plano INTEIRO, como TEXTO, sem cortar nem reformatar. Ele é largo de propósito, e as
-- colunas da direita — A-Rows, A-Time, Buffers, Used-Mem — são exatamente o que interessa.
-- Se a ferramenta quebrar as linhas ou devolver JSON, prefiro o texto cru.
--
-- E, se der algum ORA-, me mande o número do erro: ele diz qual privilégio falta, e já
-- aconteceu três vezes neste projeto de um objeto parecer inexistente e ser só permissão.
