-- ============================================================================
-- FASE 5b - as colunas de data do FILTRO guardam hora?
--
-- A inc8 mediu DTSAIDA, DTENT e DTPAGTO: zero registros com hora. Mas nao
-- mediu DTCOMPETENCIA, que e a coluna do filtro em competencia, nem DTVENC,
-- que e o fallback do bucket, nem PCPREST.DTPAG, usado na linha injetada.
--
-- Por que importa: o filtro e BETWEEN To_Date(ini) AND To_Date(fim), com as
-- duas pontas a meia-noite. Oracle DATE carrega hora, entao um lancamento em
-- 15/07 as 14h fica FORA de um periodo que termina em 15/07 00:00.
--
-- Num mes inteiro isso custaria o ultimo dia. Num periodo de UM DIA custaria
-- tudo, menos o que estiver exatamente a meia-noite.
--
-- Isso NAO e divergencia: a 9815 usa o mesmo To_Date nas duas pontas, entao
-- perde os mesmos registros. E questao de saber o que esperar do teste de um
-- dia antes de interpretar o resultado.
--
-- COM_HORA = 0 nas tres linhas: o recorte por dia e exato.
-- COM_HORA > 0: o periodo de um dia vai vir quase vazio nas DUAS telas, e o
-- cenario de teste precisa ser outro.
--
-- Periodo largo de proposito: junho a agosto de 2026.
-- Rodar como SCRIPT (F5).
-- ============================================================================

SELECT 'PCLANC.DTCOMPETENCIA'                                         AS COLUNA,
       COUNT(*)                                                        AS LINHAS,
       SUM(CASE WHEN L.DTCOMPETENCIA <> TRUNC(L.DTCOMPETENCIA)
                THEN 1 ELSE 0 END)                                     AS COM_HORA
  FROM PCLANC L
 WHERE L.DTCOMPETENCIA >= TO_DATE('01/06/2026','dd/mm/yyyy')
   AND L.DTCOMPETENCIA <  TO_DATE('01/09/2026','dd/mm/yyyy')
UNION ALL
SELECT 'PCLANC.DTVENC',
       COUNT(*),
       SUM(CASE WHEN L.DTVENC <> TRUNC(L.DTVENC) THEN 1 ELSE 0 END)
  FROM PCLANC L
 WHERE L.DTVENC >= TO_DATE('01/06/2026','dd/mm/yyyy')
   AND L.DTVENC <  TO_DATE('01/09/2026','dd/mm/yyyy')
UNION ALL
SELECT 'PCPREST.DTPAG',
       COUNT(*),
       SUM(CASE WHEN P.DTPAG <> TRUNC(P.DTPAG) THEN 1 ELSE 0 END)
  FROM PCPREST P
 WHERE P.DTPAG >= TO_DATE('01/06/2026','dd/mm/yyyy')
   AND P.DTPAG <  TO_DATE('01/09/2026','dd/mm/yyyy')

-- ============================================================================
-- RESULTADO - 31/08/2026
--
--   PCLANC.DTCOMPETENCIA   56.023 linhas   0 com hora
--   PCLANC.DTVENC          54.070 linhas   0 com hora
--   PCPREST.DTPAG         214.800 linhas   5 com hora   <<<
--
-- O teste de UM DIA e valido: o filtro de competencia e o bucket usam colunas
-- sem hora, entao o recorte por dia e exato para as despesas.
--
-- As cinco linhas de DTPAG so somem quando o DIA delas e o ULTIMO do periodo -
-- nos demais dias, "data com hora <= fim" continua verdadeiro. E a 9815 perde
-- as mesmas cinco, porque usa o mesmo To_Date nas duas pontas. Nao e
-- divergencia; e a correcao de uma afirmacao generalizada demais na secao 12.
-- ============================================================================
