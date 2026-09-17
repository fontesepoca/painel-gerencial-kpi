-- dc53 — Os limites reais do paralelismo, com o usuário principal.
--
-- A dc52 tentou descobrir isto pelo caminho de baixo privilégio, porque a `v$parameter` recusou
-- acesso ao usuário da aplicação (ORA-00942, quarta vez neste projeto). Com o usuário principal
-- as views V$ abrem, e dá para responder a pergunta direito.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ TUDO AQUI É SELECT. Nenhuma linha deste arquivo altera, cria ou apaga   │
-- │ coisa alguma -- nem parâmetro, nem sessão, nem estatística. São sete    │
-- │ consultas de leitura sobre views do dicionário.                        │
-- │                                                                         │
-- │ Nada precisa ser alterado no banco para o paralelismo funcionar: o hint │
-- │ vive no texto da NOSSA consulta. Isto é só para saber o teto.           │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- COMO RODAR
--   Conecte com o usuário principal, rode as sete, e volte para o usuário da aplicação.
--
-- O QUE ME DEVOLVER
--   As sete saídas. A 2 e a 3 são as que respondem a sua pergunta; o resto é contexto para eu
--   não tirar conclusão errada delas.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O tamanho do servidor
-- ═══════════════════════════════════════════════════════════════════════════
-- Os núcleos são o recurso de verdade: eles atendem quem apura E quem emite nota. O teto do
-- paralelismo costuma ser generoso; o que aperta é isto.
SELECT name, value
  FROM v$parameter
 WHERE name IN ('cpu_count', 'sga_target', 'pga_aggregate_target', 'memory_target')
 ORDER BY name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Os tetos do paralelismo  ← a resposta direta
-- ═══════════════════════════════════════════════════════════════════════════
--   parallel_max_servers      teto absoluto de processos paralelos na instância
--   parallel_servers_target   a partir daqui, consultas novas entram em FILA
--   parallel_degree_policy    MANUAL respeita o nosso hint; AUTO decide sozinho e pode
--                             ignorá-lo, o que mudaria a leitura de tudo que medimos
--   parallel_min_percent      se 0, degrada em silêncio; se 50, falha com ORA-12827 quando
--                             não consegue metade do grau pedido
SELECT name, value, isdefault
  FROM v$parameter
 WHERE name LIKE 'parallel%'
 ORDER BY name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. O banco JÁ degradou consultas paralelas?  ← a mais valiosa
-- ═══════════════════════════════════════════════════════════════════════════
-- Isto não é teoria: é o que aconteceu de verdade desde que a instância subiu, com a carga que
-- a empresa tem hoje e SEM a nossa mudança.
--
-- `Parallel operations downgraded to serial` maior que zero significa que o teto já vinha sendo
-- encostado por outra coisa — e aí quatro processos por apuração entram numa fila que já
-- existe. Se estiver tudo zerado, há folga.
SELECT name, value
  FROM v$sysstat
 WHERE name LIKE 'Parallel operations%'
    OR name LIKE 'queries parallelized%'
 ORDER BY name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Quantos processos paralelos existem AGORA
-- ═══════════════════════════════════════════════════════════════════════════
-- Fotografia do momento. Se `IN USE` já estiver alto sem ninguém apurando, o paralelismo está
-- sendo usado por outra coisa — um job noturno, um relatório do Winthor — e dividimos o bolo.
SELECT status, COUNT(*) AS quantos
  FROM v$px_process
 GROUP BY status
 ORDER BY status;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. O pico histórico
-- ═══════════════════════════════════════════════════════════════════════════
-- `servers_highwater` é o máximo de processos paralelos que a instância já usou de uma vez.
-- Comparado com parallel_max_servers, diz quanta folga sobrou no pior momento até hoje.
SELECT statistic, value
  FROM v$pq_sysstat
 WHERE statistic IN ('Servers Busy', 'Servers Idle', 'Servers Highwater',
                     'Server Sessions', 'Servers Started', 'Servers Shutdown',
                     'Queries Initiated', 'DFO Trees', 'Sessions Active')
 ORDER BY statistic;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Há algum limite por usuário já configurado?
-- ═══════════════════════════════════════════════════════════════════════════
-- Se existir um Resource Manager ativo, ele pode limitar o grau por grupo de usuários — e aí o
-- nosso PARALLEL(4) pode estar sendo rebaixado sem ninguém saber, o que explicaria qualquer
-- medição futura que não bater com as de hoje.
SELECT name, value
  FROM v$parameter
 WHERE name IN ('resource_manager_plan', 'resource_manager_cpu_allocation');

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Quantos processos a NOSSA consulta pede de verdade
-- ═══════════════════════════════════════════════════════════════════════════
-- Eu venho dizendo "quatro por apuração" e isso pode estar pela metade. Quando o plano tem
-- etapas que conversam entre si -- e o nosso tem um HASH GROUP BY --, o Oracle aloca DOIS
-- conjuntos de processos, produtores e consumidores: com PARALLEL(4), oito.
--
-- No resultado, procure as linhas `PX SEND` e `PX RECEIVE` e a coluna TQ. Dois valores
-- distintos de TQ (`:TQ10000` e `:TQ10001`) significam dois conjuntos, ou seja, oito processos.
EXPLAIN PLAN SET STATEMENT_ID = 'dc53' FOR
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

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, 'dc53', 'BASIC +PARALLEL'));
