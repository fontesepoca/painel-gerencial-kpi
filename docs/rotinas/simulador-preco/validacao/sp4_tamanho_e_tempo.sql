-- ============================================================================
-- sp4 — quanto a consulta do simulador devolve, e quanto demora
--
-- Rode o SQL de referência (docs/rotinas/simulador-preco/referencia/
-- sql-v1.sql) com uma filial e uma região reais, :CODFORNEC = 0 (todos) e
-- :PCOMPRA vazio (NULL), e anote:
--
--   1. o tempo total até a última linha (no SQL Developer: rolar até o fim, ou
--      usar "Run Script" (F5), que busca tudo);
--   2. a quantidade de linhas — com o bloco abaixo, que envolve o mesmo SQL.
--
-- Serve para a spec §7, Q5: o commandTimeout da API e se a tela precisa de
-- paginação. Somente leitura.
--
-- Para contar, cole o SQL de referência INTEIRO, SEM o ";" do final, no lugar
-- da marca abaixo:
-- ============================================================================

SELECT COUNT(*)                AS LINHAS,
       COUNT(DISTINCT CODPROD) AS PRODUTOS_DISTINTOS
  FROM (
    /* <<< cole aqui o SQL de referência, sem o ";" final >>> */
    SELECT 1 AS CODPROD FROM DUAL
  );

-- LINHAS > PRODUTOS_DISTINTOS confirma a duplicação por NCM da sp2.
