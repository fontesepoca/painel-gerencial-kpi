-- ============================================================================
-- sp14 — quanto demora UMA PÁGINA do simulador consultada no Oracle (24/11/2026)
--
-- Por quê: a busca e a paginação vão para o back-end (orientação do Dev). Cada página
-- pede ao Oracle só as suas 100 linhas, com OFFSET/FETCH. A dúvida é se o Oracle
-- entrega a página rápido, ou se precisa calcular as ~9.800 linhas de novo a cada
-- página (perto dos 8,7 s da consulta inteira). Este script mede isso antes de
-- construir. Somente leitura: só SELECT, nenhum dado é alterado.
--
-- A ORDEM (Gabriel, 24/11/2026): classe de venda (A → B → C, sem classe por último).
-- Desempate: descrição, código e tributação. Sem ele, produtos da mesma classe podem
-- trocar de lugar entre uma execução e outra, e a página 2 repetiria ou pularia
-- produto da página 1. O SQL v2 não tem ORDER BY.
--
-- COMO RODAR (SQL Developer, conectado como na sp4):
--   1. Em cada um dos 4 blocos (0 a 3), cole o SQL de referência INTEIRO
--      (docs/rotinas/simulador-preco/referencia/sql-v2.sql), SEM o ";" final,
--      no lugar da marca. São quatro cópias iguais.
--   2. Rode UM bloco por vez com "Run Script" (F5), que busca todas as linhas, e
--      anote o tempo que aparece no rodapé ("Task completed in X seconds").
--   3. Valores para os binds quando o SQL Developer pedir:
--        :PCOMPRA   vazio (NULL)        :NUMREGIAO 90
--        :CODFORNEC 0 (todos)           :CODFILIAL 7
--        :BUSCA     vazio nos blocos 1 e 2; no bloco 3, um pedaço de descrição
--                   que exista (ex.: ARROZ)
--      "Vazio" = deixar o campo Value em branco e marcar a caixa "Null" ao lado.
--      O SQL Developer pede :BUSCA também nos blocos 1 e 2: é esperado, deixe Null.
--   4. Anote também o TOTAL (última coluna) de cada bloco.
--
-- Se o bloco der erro de sintaxe, provavelmente faltou colar o SQL v2 ou sobrou o ";"
-- do final dele.
--
-- O ":CODFUNC = 1" do SQL de referência fica como está: aqui mede-se tempo, e a
-- API troca pela matrícula logada.
-- ============================================================================

-- BLOCO 0 — quais classes de venda existem, e quantas linhas cada uma tem.
-- Decide os quadradinhos do filtro por classe (Gabriel, 24/11/2026): se houver
-- outras além de A, B e C, ou linhas sem classe, o filtro precisa delas.
-- (Não precisa de :BUSCA.)
SELECT NVL(X.CLASSEVENDA, '(sem classe)') AS CLASSE, COUNT(*) AS LINHAS
  FROM (
    /* <<< APAGUE esta linha e cole aqui o SQL v2 inteiro, sem o ";" final >>> */
  ) X
 GROUP BY X.CLASSEVENDA
 ORDER BY X.CLASSEVENDA NULLS LAST;

-- BLOCO 1 — página 1 (linhas 1 a 100), sem busca
SELECT X.*, COUNT(*) OVER () AS TOTAL
  FROM (
    /* <<< APAGUE esta linha e cole aqui o SQL v2 inteiro, sem o ";" final >>> */
  ) X
 WHERE (:BUSCA IS NULL
        OR TO_CHAR(X.CODPROD) = TRIM(:BUSCA)
        OR UPPER(X.DESCRICAO) LIKE '%' || UPPER(TRIM(:BUSCA)) || '%')
 ORDER BY X.CLASSEVENDA NULLS LAST, X.DESCRICAO, X.CODPROD, X.CODIGO_TRIBUTACAO NULLS LAST
OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY;

-- BLOCO 2 — página 50 (linhas 4.901 a 5.000), sem busca
SELECT X.*, COUNT(*) OVER () AS TOTAL
  FROM (
    /* <<< APAGUE esta linha e cole aqui o SQL v2 inteiro, sem o ";" final >>> */
  ) X
 WHERE (:BUSCA IS NULL
        OR TO_CHAR(X.CODPROD) = TRIM(:BUSCA)
        OR UPPER(X.DESCRICAO) LIKE '%' || UPPER(TRIM(:BUSCA)) || '%')
 ORDER BY X.CLASSEVENDA NULLS LAST, X.DESCRICAO, X.CODPROD, X.CODIGO_TRIBUTACAO NULLS LAST
OFFSET 4900 ROWS FETCH NEXT 100 ROWS ONLY;

-- BLOCO 3 — página 1 de uma BUSCA (informe :BUSCA)
SELECT X.*, COUNT(*) OVER () AS TOTAL
  FROM (
    /* <<< APAGUE esta linha e cole aqui o SQL v2 inteiro, sem o ";" final >>> */
  ) X
 WHERE (:BUSCA IS NULL
        OR TO_CHAR(X.CODPROD) = TRIM(:BUSCA)
        OR UPPER(X.DESCRICAO) LIKE '%' || UPPER(TRIM(:BUSCA)) || '%')
 ORDER BY X.CLASSEVENDA NULLS LAST, X.DESCRICAO, X.CODPROD, X.CODIGO_TRIBUTACAO NULLS LAST
OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY;

-- O que os números decidem:
--   * bloco 1 e 2 bem abaixo de 8,7 s  → cada página consulta o Oracle (forma A).
--   * perto de 8,7 s                   → conversar com o Dev sobre o cache curto no
--                                        servidor (forma B) antes de construir.
--   * TOTAL do bloco 1 deve bater com as ~9.811 linhas da consulta inteira.
-- Também vale olhar os valores de CLASSEVENDA que aparecem: se houver outros além de
-- A, B e C (ou vazios), eles entram depois do C, em ordem alfabética, e os vazios por último.

-- ============================================================================
-- BLOCO 4 — VÁRIOS FORNECEDORES (24/11/2026, spec 2026-11-24-simulador-varios-fornecedores)
--
-- O filtro de UM fornecedor vira uma LISTA. Mede se a lista custa mais que o código só.
--
-- COMO RODAR: cole o SQL v2 no lugar da marca, como nos outros blocos, e DEPOIS troque
-- dentro dele a linha
--     AND F.CODFORNEC = DECODE(NVL(:CODFORNEC,0),0,P.CODFORNEC,:CODFORNEC)
-- por esta (é exatamente a que a API passa a usar):
--     AND (:FORNECEDORESNULO IS NULL OR INSTR(',' || :FORNECEDORES || ',', ',' || TO_CHAR(F.CODFORNEC) || ',') > 0)
--
-- Rode o bloco TRÊS vezes, anotando o tempo e o TOTAL de cada uma:
--   4a. um fornecedor:   :FORNECEDORESNULO 234        :FORNECEDORES 234
--   4b. três:            :FORNECEDORESNULO 234,X,Y    :FORNECEDORES 234,X,Y  (X e Y à sua escolha)
--   4c. todos:           :FORNECEDORESNULO Null       :FORNECEDORES Null
-- Os outros binds como nos blocos acima (:BUSCA Null).
--
-- O que os números decidem:
--   * 4a perto do tempo de hoje com :CODFORNEC 234 → a lista não pesa, segue o plano.
--   * 4c perto do bloco 1                          → "todos" continua igual.
--   * TOTAL de 4b = soma dos TOTAIS de cada fornecedor consultado sozinho.
-- ============================================================================
SELECT X.*, COUNT(*) OVER () AS TOTAL
  FROM (
    /* <<< APAGUE esta linha e cole aqui o SQL v2 inteiro, sem o ";" final, e troque a linha do fornecedor >>> */
  ) X
 WHERE (:BUSCA IS NULL
        OR TO_CHAR(X.CODPROD) = TRIM(:BUSCA)
        OR UPPER(X.DESCRICAO) LIKE '%' || UPPER(TRIM(:BUSCA)) || '%')
 ORDER BY X.CLASSEVENDA NULLS LAST, X.DESCRICAO, X.CODPROD, X.CODIGO_TRIBUTACAO NULLS LAST
OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY;
