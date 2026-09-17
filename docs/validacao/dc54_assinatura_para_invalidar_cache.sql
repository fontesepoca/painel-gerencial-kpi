-- dc54 — Dá para detectar barato que um período mudou?
--
-- O CONTEXTO
--   Guardar o resultado da apuração resolveria a diferença entre 92 s (cache frio do Oracle) e
--   8 s (quente). Mas o Gabriel levantou o que derruba a versão ingênua da ideia: lançamento
--   RETROATIVO existe. Uma entrada hoje reescreve um mês que já foi apurado, e um DRE
--   desatualizado sem avisar é pior que um DRE lento — a regra do projeto é fidelidade
--   numérica absoluta.
--
-- O QUE ESTE SCRIPT INVESTIGA
--   Se existe uma consulta BARATA que diga "este período mudou desde a última apuração". Barata
--   significa 1 ou 2 segundos; se custar 20, não serve — seria quase apurar de novo.
--
--   Duas hipóteses, e o bloco 1 diz qual está disponível:
--     a) uma coluna de data de alteração nas tabelas, indexada — o ideal
--     b) contagem e somas do período, que é sempre possível mas pode ser cara
--
-- IMPORTANTE, E VALE DITO DE UMA VEZ
--   Assinatura é HEURÍSTICA. Uma correção que mantenha contagem e somas iguais passaria
--   despercebida. Ela é reforço para o cache cair sozinho no caso comum, nunca a garantia —
--   a garantia continua sendo a tela mostrar o horário da apuração e ter um botão de
--   recalcular.
--
-- O primeiro bloco precisa do usuário principal (ALL_TAB_COLUMNS já negou acesso antes neste
-- projeto, três vezes). Os outros rodam com o usuário da aplicação.

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — existe coluna de data de alteração nessas tabelas?
-- ═══════════════════════════════════════════════════════════════════════════
-- Se houver algo como DTALTER, DTULTALT ou similar, e ela for indexada, a detecção fica
-- trivial e barata: basta um MAX() dela no período.
SELECT table_name, column_name, data_type
  FROM all_tab_columns
 WHERE table_name IN ('PCNFSAID', 'PCMOV', 'PCNFENT', 'PCLANC')
   AND (column_name LIKE 'DT%ALT%'
     OR column_name LIKE '%ALTER%'
     OR column_name LIKE 'DTULT%'
     OR column_name LIKE '%ATUALIZ%')
 ORDER BY table_name, column_name;

-- E, se alguma aparecer acima, ela é indexada?
SELECT i.table_name, i.index_name, c.column_name, c.column_position
  FROM all_indexes i
  JOIN all_ind_columns c
    ON c.index_name = i.index_name
   AND c.index_owner = i.owner
 WHERE i.table_name IN ('PCNFSAID', 'PCMOV', 'PCNFENT')
   AND (c.column_name LIKE 'DT%ALT%' OR c.column_name LIKE '%ALTER%')
 ORDER BY i.table_name, i.index_name, c.column_position;

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — quanto custa a assinatura por contagem e soma
-- ═══════════════════════════════════════════════════════════════════════════
-- Esta é a alternativa que sempre existe. A pergunta é só o preço.
--
-- Note que ela NÃO toca PCMOV: só o cabeçalho das notas. Se um item mudar sem mexer no
-- cabeçalho, isto não percebe — mais uma razão para a assinatura não ser a garantia.
SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
  v_ini   NUMBER;
  v_qt    NUMBER;
  v_soma  NUMBER;
  v_soma2 NUMBER;
BEGIN
  v_ini := DBMS_UTILITY.GET_TIME;

  SELECT COUNT(*), NVL(SUM(NVL(VLTOTGER,0)),0), NVL(SUM(NVL(VLCUSTOFIN,0)),0)
    INTO v_qt, v_soma, v_soma2
    FROM PCNFSAID
   WHERE DTSAIDA BETWEEN TO_DATE('01/03/2026','dd/mm/yyyy') AND TO_DATE('31/05/2026','dd/mm/yyyy')
     AND CODFILIAL IN ('7','27','12','22','24','25','34','1','28');

  DBMS_OUTPUT.PUT_LINE('assinatura so do cabecalho (PCNFSAID)');
  DBMS_OUTPUT.PUT_LINE('  tempo    ' || TO_CHAR((DBMS_UTILITY.GET_TIME - v_ini)/100, '9990.00') || ' s');
  DBMS_OUTPUT.PUT_LINE('  notas    ' || v_qt);
  DBMS_OUTPUT.PUT_LINE('  soma     ' || TO_CHAR(v_soma, '999G999G999G990D00'));

  -- Agora incluindo os itens, que é onde a apuração realmente soma. Se esta for cara, a
  -- assinatura completa não vale a pena e fica só a do cabeçalho -- com o buraco declarado.
  v_ini := DBMS_UTILITY.GET_TIME;

  SELECT COUNT(*), NVL(SUM(NVL(MV.QT,0)),0)
    INTO v_qt, v_soma
    FROM PCNFSAID NF, PCMOV MV
   WHERE NF.numtransvenda = MV.numtransvenda
     AND NF.DTSAIDA BETWEEN TO_DATE('01/03/2026','dd/mm/yyyy') AND TO_DATE('31/05/2026','dd/mm/yyyy')
     AND NF.CODFILIAL IN ('7','27','12','22','24','25','34','1','28')
     AND NF.DTCANCEL IS NULL
     AND MV.DTCANCEL IS NULL;

  DBMS_OUTPUT.PUT_LINE('');
  DBMS_OUTPUT.PUT_LINE('assinatura com os itens (PCNFSAID + PCMOV)');
  DBMS_OUTPUT.PUT_LINE('  tempo    ' || TO_CHAR((DBMS_UTILITY.GET_TIME - v_ini)/100, '9990.00') || ' s');
  DBMS_OUTPUT.PUT_LINE('  itens    ' || v_qt);
END;
/

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — com que frequência um mês FECHADO ainda muda?
-- ═══════════════════════════════════════════════════════════════════════════
-- Esta é a pergunta de negócio por trás de tudo, e a resposta muda o desenho inteiro.
--
-- Se lançamento retroativo é raro -- alguns por mês --, validade curta mais botão de
-- recalcular resolve, e a assinatura vira supérfluo. Se for rotina diária, o cache de período
-- fechado perde sentido e a conversa passa a ser sobre a tabela de apoio atualizada de
-- madrugada.
--
-- Aqui a aproximação é por PCLANC, onde estão as despesas: quantos lançamentos foram PAGOS num
-- mês mas têm competência de mês anterior. Ajuste os meses se quiser outro recorte.
SELECT TO_CHAR(NVL(DTPAGTO, DTVENC), 'mm/yyyy')  AS MES_DO_PAGAMENTO,
       TO_CHAR(DTCOMPETENCIA, 'mm/yyyy')         AS MES_DA_COMPETENCIA,
       COUNT(*)                                  AS QUANTOS,
       SUM(NVL(VALOR,0))                         AS TOTAL
  FROM PCLANC
 WHERE NVL(DTPAGTO, DTVENC) BETWEEN TO_DATE('01/03/2026','dd/mm/yyyy')
                                AND TO_DATE('31/05/2026','dd/mm/yyyy')
   AND DTPAGTO IS NOT NULL
   AND DTCOMPETENCIA IS NOT NULL
   AND TRUNC(DTCOMPETENCIA, 'MM') < TRUNC(NVL(DTPAGTO, DTVENC), 'MM')
 GROUP BY TO_CHAR(NVL(DTPAGTO, DTVENC), 'mm/yyyy'), TO_CHAR(DTCOMPETENCIA, 'mm/yyyy')
 ORDER BY 1, 2;

-- O QUE ME DEVOLVER
--   Bloco 1: se alguma coluna apareceu, e se é indexada.
--   Bloco 2: os dois tempos. É o que decide se a camada de invalidação automática existe.
--   Bloco 3: a tabela inteira. Ela diz se retroativo é exceção ou rotina — e isso vale
--            independente de cache, porque também descreve como a empresa lança.

-- ═══════════════════════════════════════════════════════════════════════════
-- RESULTADO — 17/09/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BLOCO 1 — colunas de alteração
--   Existem: PCNFSAID.DTDC_ALTER, PCNFSAID.ALTERADC, PCLANC.DTULTALTER,
--            PCLANC.DTDC_ALTER, PCNFENT.DTDC_ALTER.
--   NENHUMA É INDEXADA -- a segunda consulta voltou vazia. E `DTDC_ALTER` tem cara de
--   controle de replicação do Winthor, não de alteração de negócio. Nenhuma foi usada.
--
-- BLOCO 2 — custo da assinatura
--   só o cabeçalho (PCNFSAID)          0,14 s   132.342 notas
--   com os itens (PCNFSAID + PCMOV)   24,46 s   1.570.379 itens
--
--   A do cabeçalho serve. A com itens custa quase uma apuração inteira.
--
--   (As 132.342 notas contra as 131.684 da dc44 são as canceladas: esta consulta não filtra
--   `DTCANCEL IS NULL`, e a diferença de 658 é exatamente isso.)
--
-- BLOCO 3 — retroativo é ROTINA, não exceção
--   pago 03/2026, competência 02/2026   2.288   R$ 21.491.377,02
--   pago 04/2026, competência 03/2026   3.262   R$ 29.372.316,74
--   pago 05/2026, competência 04/2026   2.773   R$ 31.462.575,59
--   pago 05/2026, competência 03/2026   2.799   R$  6.728.637,24
--
--   Mais uma cauda longa com competências de 2022, 2024 e 2025 -- e algumas absurdas,
--   `01/1900` e `02/1930`, que a rotina soma como qualquer outra.
--
-- A CONCLUSÃO, e ela é sobre a rotina e não sobre cache:
--
--   Cruzando com a regra de negócio 4 -- despesa não paga nunca entra, nem em competência --,
--   em regime de COMPETÊNCIA o DRE de um mês fechado muda toda vez que alguém paga algo
--   daquele mês. R$ 21 milhões entraram em fevereiro depois que fevereiro terminou.
--
--   Em regime de CAIXA o mês é o do pagamento, então o passado fica estável.
--
--   Dois DREs de fevereiro em competência, apurados com um mês de diferença, podem
--   legitimamente não bater -- e nenhum dos dois está errado.
--
-- Registrado em `docs/ROTINA_9815.md` §22.
