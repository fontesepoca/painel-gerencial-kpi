-- ============================================================================
-- sp3 — que coluna liga REGIÃO a FILIAL no Winthor?
--
-- O filtro de região mostra só as regiões da filial escolhida (spec D14). Não
-- vamos presumir a coluna: este script pergunta ao dicionário. Somente leitura.
-- ============================================================================

-- ── 1. As colunas da PCREGIAO e da PCFILIAL que falam de filial ou de região ──
SELECT owner, table_name, column_name, data_type, data_length, nullable
  FROM all_tab_columns
 WHERE table_name IN ('PCREGIAO', 'PCFILIAL')
   AND (column_name LIKE '%FIL%' OR column_name LIKE '%REGIAO%')
 ORDER BY table_name, column_id;

-- ── 2. Todas as colunas da PCREGIAO, para ver o nome e o que mais há ─────────
SELECT owner, column_name, data_type, data_length, nullable
  FROM all_tab_columns
 WHERE table_name = 'PCREGIAO'
 ORDER BY column_id;

-- ── 3. Uma amostra da PCREGIAO ───────────────────────────────────────────────
SELECT * FROM PCREGIAO WHERE ROWNUM <= 30;
