-- ============================================================================
-- sp1 — o usuário da aplicação ALCANÇA as tabelas do simulador de preço?
--
-- RODE CONECTADO COMO O USUÁRIO DA APLICAÇÃO (o EDI), não como DBA, uma vez em
-- cada base (Época e Minas Rural). A pergunta não é "o objeto existe", é "este
-- usuário o enxerga". Mesmo método da docs/plataforma/validacao/mb1.
--
-- Lista extraída dos FROM/JOIN de docs/rotinas/simulador-preco/referencia/
-- sql-v1.sql em 18/11/2026: TODAS as tabelas, inclusive as que o DRE já
-- usa — o que vale é o conjunto deste SQL. Somente leitura do dicionário.
-- ============================================================================

WITH necessarios AS (
  SELECT 'PCTRIBUTACAO'            obj, 'CBS'       area FROM DUAL UNION ALL
  SELECT 'PCTRIBUTACAO_FILTRO_NCM',     'CBS'            FROM DUAL UNION ALL
  SELECT 'PCPRODUT',                    'produto'        FROM DUAL UNION ALL
  SELECT 'PCTABTRIBENT',                'tributação'     FROM DUAL UNION ALL
  SELECT 'PCFILIAL',                    'filial'         FROM DUAL UNION ALL
  SELECT 'PCFORNEC',                    'fornecedor'     FROM DUAL UNION ALL
  SELECT 'PCFORNECFILIAL',              'fornecedor'     FROM DUAL UNION ALL
  SELECT 'PCPRODFILIAL',                'produto'        FROM DUAL UNION ALL
  SELECT 'PCCONSUM',                    'parâmetros'     FROM DUAL UNION ALL
  SELECT 'PCEST',                       'estoque'        FROM DUAL UNION ALL
  SELECT 'PCPRINCIPATIVO',              'produto'        FROM DUAL UNION ALL
  SELECT 'PCSECAO',                     'produto'        FROM DUAL UNION ALL
  SELECT 'PCDEPTO',                     'produto'        FROM DUAL UNION ALL
  SELECT 'PCLINHAPROD',                 'produto'        FROM DUAL UNION ALL
  SELECT 'PCCATEGORIA',                 'produto'        FROM DUAL UNION ALL
  SELECT 'PCLIB',                       'permissão'      FROM DUAL UNION ALL
  SELECT 'PCEXPISCOFINSITEM',           'tributação'     FROM DUAL UNION ALL
  SELECT 'PCREGIAO',                    'preço'          FROM DUAL UNION ALL
  SELECT 'PCTABPR',                     'preço'          FROM DUAL UNION ALL
  SELECT 'PCTRIBUT',                    'tributação'     FROM DUAL
),
-- UMA linha por nome. ALL_OBJECTS lista cada PARTIÇÃO de uma tabela particionada com o
-- mesmo object_name da tabela (TABLE PARTITION, TABLE SUBPARTITION): sem este filtro, a
-- PCTABPR saiu repetida uma vez por partição na primeira execução, em 18/11/2026.
--
-- SEM 'SYNONYM' aqui: o sinônimo PRIVADO do usuário também aparece em ALL_OBJECTS com
-- owner = USER, e era contado como objeto "próprio" — o que fazia um sinônimo do EDI
-- apontando para EPOCA.PCTABPR sair como "proprio". Sinônimo é a CTE de baixo.
proprios AS (
  SELECT object_name, MAX(object_type) object_type
    FROM all_objects
   WHERE owner = USER
     AND object_type IN ('TABLE', 'VIEW', 'MATERIALIZED VIEW')
   GROUP BY object_name
),
sinonimos AS (
  SELECT synonym_name, owner, table_owner, table_name,
         ROW_NUMBER() OVER (
           PARTITION BY synonym_name
           ORDER BY CASE WHEN owner = USER THEN 0 ELSE 1 END
         ) preferencia
    FROM all_synonyms
   WHERE owner IN (USER, 'PUBLIC')
),
-- Linha ausente aqui é falta de privilégio, NÃO prova de que o objeto não existe.
-- Mesmo filtro, pelo mesmo motivo: a partição repetiria a linha também por este lado.
alcancaveis AS (
  SELECT owner, object_name, MAX(object_type) object_type
    FROM all_objects
   WHERE object_type IN ('TABLE', 'VIEW', 'MATERIALIZED VIEW', 'SYNONYM')
   GROUP BY owner, object_name
)
-- A primeira coluna diz COM QUEM a consulta rodou. Tem de ser o usuário da aplicação (o
-- da string de conexão da API). Com outro usuário, a resposta é sobre o que ELE enxerga.
SELECT USER AS conectado_como,
       n.area,
       n.obj                                AS objeto,
       CASE
         WHEN p.object_name IS NOT NULL THEN 'proprio'
         WHEN s.synonym_name IS NULL    THEN '—'
         WHEN s.owner = USER            THEN 'sinonimo privado'
         ELSE                                'sinonimo publico'
       END                                  AS como_resolve,
       s.table_owner || '.' || s.table_name AS aponta_para,
       CASE
         WHEN p.object_name IS NOT NULL THEN 'OK'
         WHEN s.synonym_name IS NULL    THEN 'FALTA SINONIMO'
         WHEN a.object_name IS NULL     THEN 'FALTA GRANT'
         ELSE                                'OK'
       END                                  AS situacao
  FROM necessarios n
  LEFT JOIN proprios p    ON p.object_name = n.obj
  LEFT JOIN sinonimos s   ON s.synonym_name = n.obj AND s.preferencia = 1
  LEFT JOIN alcancaveis a ON a.owner = s.table_owner AND a.object_name = s.table_name
 ORDER BY situacao DESC, n.area, n.obj;


-- ── 2. O TESTE DE VERDADE ───────────────────────────────────────────────────
-- O bloco 1 lê o DICIONÁRIO, e o dicionário engana: na primeira execução (18/11/2026)
-- a PCFILIAL saiu "FALTA GRANT" — o sinônimo do EDI aponta para EPCTI.PCFILIAL, que não
-- aparece no ALL_OBJECTS dele — e no entanto a consulta de filiais do DRE lê a PCFILIAL
-- todo dia. Este bloco TENTA LER cada tabela, que é o que a aplicação faz. O que ele
-- disser vale mais do que o bloco 1.
--
-- `WHERE 1 = 0` não traz dado nenhum: só prova que a consulta compila e tem permissão.
-- No SQL Developer, ative a aba Dbms Output antes (ou rode como script, F5).

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
  TYPE lista IS TABLE OF VARCHAR2(30);
  objetos lista := lista(
    'PCTRIBUTACAO', 'PCTRIBUTACAO_FILTRO_NCM', 'PCPRODUT', 'PCTABTRIBENT', 'PCFILIAL',
    'PCFORNEC', 'PCFORNECFILIAL', 'PCPRODFILIAL', 'PCCONSUM', 'PCEST', 'PCPRINCIPATIVO',
    'PCSECAO', 'PCDEPTO', 'PCLINHAPROD', 'PCCATEGORIA', 'PCLIB', 'PCEXPISCOFINSITEM',
    'PCREGIAO', 'PCTABPR', 'PCTRIBUT'
  );
  n   NUMBER;
  ok  PLS_INTEGER := 0;
  mal PLS_INTEGER := 0;
BEGIN
  DBMS_OUTPUT.PUT_LINE('Conectado como: ' || USER);
  FOR i IN 1 .. objetos.COUNT LOOP
    BEGIN
      EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM ' || objetos(i) || ' WHERE 1 = 0' INTO n;
      ok := ok + 1;
    EXCEPTION
      WHEN OTHERS THEN
        mal := mal + 1;
        DBMS_OUTPUT.PUT_LINE(RPAD(objetos(i), 26) || SQLERRM);
    END;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE(ok || ' leem, ' || mal || ' falham (de ' || objetos.COUNT || ').');
END;
/
