-- ============================================================================
-- mb1 — o que o usuário ALCANÇA, numa base nova
--
-- Para a bifurcação de bases (Época × Minas Rural ×…): antes de qualquer código,
-- descobrir o que falta de sinônimo e de grant no usuário da base nova.
--
-- RODE CONECTADO COMO O USUÁRIO DA APLICAÇÃO, não como DBA. A pergunta não é "o
-- objeto existe no banco", é "este usuário o enxerga" — e as duas respostas são
-- diferentes justamente nos casos que interessam.
--
-- A lista de objetos foi extraída dos `FROM`/`JOIN` de
-- `api-new-kpi/Infrastructure/Persistence/Queries/` em 06/10/2026. Se uma consulta
-- nova entrar, acrescente a linha aqui.
-- ============================================================================


-- ── 1. O INVENTÁRIO ─────────────────────────────────────────────────────────
-- Uma linha por objeto, com o que falta. É esta que importa.
--
-- A resolução de um nome sem qualificação segue a ordem do Oracle: objeto do
-- próprio usuário, depois sinônimo privado, depois sinônimo público.

WITH necessarios AS (
  SELECT 'PCEMPR'                 obj, 'AUTENTICACAO' area, 'usuário, matrícula e senha' o_que FROM DUAL UNION ALL
  SELECT 'PCLIB',                      'AUTENTICACAO', 'permissão por rotina e por filial'     FROM DUAL UNION ALL
  SELECT 'PCCONTRO',                   'AUTENTICACAO', 'controle de acesso'                    FROM DUAL UNION ALL
  SELECT 'PCCONTROI',                  'AUTENTICACAO', 'controle de acesso (itens)'            FROM DUAL UNION ALL

  SELECT 'EPCPARDRE',                  'DRE estrutura', 'parametrização das linhas do DRE'     FROM DUAL UNION ALL
  SELECT 'EPCPARDRE_NAOEXIBIR',        'DRE estrutura', 'contas que não aparecem'              FROM DUAL UNION ALL
  SELECT 'EPCPARDRE_RESP',             'DRE estrutura', 'responsáveis'                         FROM DUAL UNION ALL

  SELECT 'PCLANC',                     'DRE despesa',   'o lançamento financeiro'              FROM DUAL UNION ALL
  SELECT 'PCLANCADIANTFORNEC',         'DRE despesa',   'adiantamento a fornecedor'            FROM DUAL UNION ALL
  SELECT 'PCCONTA',                    'DRE despesa',   'plano de contas'                      FROM DUAL UNION ALL
  SELECT 'PCCENTROCUSTO',              'DRE despesa',   'centro de custo'                      FROM DUAL UNION ALL
  SELECT 'PCCONTACENTROCUSTO',         'DRE despesa',   'conta × centro de custo'              FROM DUAL UNION ALL
  SELECT 'PCRATEIOCENTROCUSTO',        'DRE despesa',   'rateio — substitui o valor do lançamento' FROM DUAL UNION ALL
  SELECT 'PCPREST',                    'DRE despesa',   'prestação'                            FROM DUAL UNION ALL

  SELECT 'PCNFSAID',                   'DRE receita',   'nota de saída'                        FROM DUAL UNION ALL
  SELECT 'PCNFENT',                    'DRE receita',   'nota de entrada / devolução'          FROM DUAL UNION ALL
  SELECT 'PCMOV',                      'DRE receita',   'movimento de item'                    FROM DUAL UNION ALL
  SELECT 'PCMOVCOMPLE',                'DRE receita',   'complemento do movimento'             FROM DUAL UNION ALL
  SELECT 'PCMOVCR',                    'DRE receita',   'movimento de crédito'                 FROM DUAL UNION ALL
  SELECT 'PCMOVCIAP',                  'DRE receita',   'movimento de ativo (CIAP)'            FROM DUAL UNION ALL
  SELECT 'PCPRODCIAP',                 'DRE receita',   'produto de ativo (CIAP)'              FROM DUAL UNION ALL
  SELECT 'PCPEDC',                     'DRE receita',   'pedido'                               FROM DUAL UNION ALL
  SELECT 'PCTABDEV',                   'DRE receita',   'motivo de devolução'                  FROM DUAL UNION ALL
  SELECT 'PCPRODUT',                   'DRE detalhe',   'produto'                              FROM DUAL UNION ALL
  SELECT 'PCGRUPO',                    'DRE detalhe',   'grupo de produto'                     FROM DUAL UNION ALL
  SELECT 'PCCLIENT',                   'DRE detalhe',   'cliente'                              FROM DUAL UNION ALL
  SELECT 'PCFORNEC',                   'DRE detalhe',   'fornecedor — o filtro e a busca'      FROM DUAL UNION ALL
  SELECT 'PCUSUARI',                   'DRE detalhe',   'quem lançou'                          FROM DUAL UNION ALL
  SELECT 'CLIENTE_ESPECIAL',           'DRE detalhe',   'cliente especial — some do DRE'       FROM DUAL UNION ALL

  SELECT 'FILIAIS',                    'DRE filtro',    'as filiais que o filtro oferece'      FROM DUAL UNION ALL
  SELECT 'EMPRESA',                    'DRE filtro',    'empresa da filial'                    FROM DUAL UNION ALL
  SELECT 'PCFILIAL',                   'DRE filtro',    'UF da filial'                         FROM DUAL UNION ALL

  SELECT 'TAB_WEB_CENTROC_FORNEC',     'NOSSA TABELA',  'vínculo centro de custo × fornecedor — CRIAR, não conceder' FROM DUAL
),

-- Objeto do próprio usuário.
proprios AS (
  SELECT object_name, object_type
    FROM all_objects
   WHERE owner = USER
),

-- Sinônimos que este usuário enxerga. O privado vence o público, e é por isso
-- que a ordenação existe: um sinônimo privado errado esconde um público certo.
sinonimos AS (
  SELECT synonym_name, owner, table_owner, table_name,
         ROW_NUMBER() OVER (
           PARTITION BY synonym_name
           ORDER BY CASE WHEN owner = USER THEN 0 ELSE 1 END
         ) preferencia
    FROM all_synonyms
   WHERE owner IN (USER, 'PUBLIC')
),

-- O que o usuário ALCANÇA de fato. `ALL_OBJECTS` só lista o que ele pode usar —
-- linha ausente aqui é falta de privilégio, NÃO prova de que o objeto não existe.
alcancaveis AS (
  SELECT owner, object_name, object_type
    FROM all_objects
)

SELECT n.area,
       n.obj                                        AS objeto,
       n.o_que                                      AS para_que_serve,
       CASE
         WHEN p.object_name IS NOT NULL THEN 'proprio'
         WHEN s.synonym_name IS NULL    THEN '—'
         WHEN s.owner = USER            THEN 'sinonimo privado'
         ELSE                                'sinonimo publico'
       END                                          AS como_resolve,
       s.table_owner || '.' || s.table_name         AS aponta_para,
       NVL(p.object_type, a.object_type)            AS tipo,
       CASE
         WHEN p.object_name IS NOT NULL
           THEN 'OK'
         WHEN s.synonym_name IS NULL
           THEN 'FALTA SINONIMO'
         WHEN a.object_name IS NULL
           THEN 'FALTA GRANT — o sinonimo existe e aponta para algo que este usuario nao alcanca'
         ELSE 'OK'
       END                                          AS situacao
  FROM necessarios n
  LEFT JOIN proprios p
         ON p.object_name = n.obj
  LEFT JOIN sinonimos s
         ON s.synonym_name = n.obj
        AND s.preferencia = 1
  LEFT JOIN alcancaveis a
         ON a.owner = s.table_owner
        AND a.object_name = s.table_name
 ORDER BY CASE
            WHEN p.object_name IS NOT NULL THEN 3
            WHEN s.synonym_name IS NULL    THEN 1
            WHEN a.object_name IS NULL     THEN 2
            ELSE 3
          END,
          n.area,
          n.obj;


-- ── 2. O TESTE DE VERDADE ───────────────────────────────────────────────────
-- O inventário lê o dicionário; este bloco TENTA LER cada objeto, que é o que a
-- aplicação vai fazer. Ele pega o que o dicionário não mostra — sinônimo
-- quebrado, privilégio revogado em cascata, objeto inválido.
--
-- `WHERE 1 = 0` não traz dado nenhum: o que se quer é saber se a consulta
-- COMPILA. No SQL Developer, ative a aba Dbms Output antes (ou `SET SERVEROUTPUT ON`).

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
  TYPE lista IS TABLE OF VARCHAR2(30);
  objetos lista := lista(
    'PCEMPR', 'PCLIB', 'PCCONTRO', 'PCCONTROI',
    'EPCPARDRE', 'EPCPARDRE_NAOEXIBIR', 'EPCPARDRE_RESP',
    'PCLANC', 'PCLANCADIANTFORNEC', 'PCCONTA', 'PCCENTROCUSTO',
    'PCCONTACENTROCUSTO', 'PCRATEIOCENTROCUSTO', 'PCPREST',
    'PCNFSAID', 'PCNFENT', 'PCMOV', 'PCMOVCOMPLE', 'PCMOVCR',
    'PCMOVCIAP', 'PCPRODCIAP', 'PCPEDC', 'PCTABDEV',
    'PCPRODUT', 'PCGRUPO', 'PCCLIENT', 'PCFORNEC', 'PCUSUARI',
    'CLIENTE_ESPECIAL', 'FILIAIS', 'EMPRESA', 'PCFILIAL',
    'TAB_WEB_CENTROC_FORNEC'
  );
  n     NUMBER;
  senha VARCHAR2(4000);
  ok    PLS_INTEGER := 0;
  mal   PLS_INTEGER := 0;
BEGIN
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

  -- A senha do login passa por aqui. `EPCTI` é um SCHEMA — dono das tabelas da
  -- parametrização do DRE —, e `DECRYPT` mora dentro dele. A chamada já é
  -- qualificada, então não é caso de sinônimo (por isso fica FORA do inventário
  -- acima), e o grant é EXECUTE, não SELECT: é o que passa despercebido numa
  -- migração de base.
  BEGIN
    EXECUTE IMMEDIATE 'BEGIN :r := EPCTI.DECRYPT(NULL, NULL); END;' USING OUT senha;
    ok := ok + 1;
  EXCEPTION
    WHEN OTHERS THEN
      -- Os dois argumentos são NULL de propósito: o objetivo é só CHEGAR na função.
      -- Ela pode reclamar da entrada (ORA-06502, ORA-28817, ORA-01403…) e isso é bom
      -- sinal — significa que foi alcançada. Falta de acesso tem assinatura própria:
      -- ORA-06550 com PLS-00201 ("identifier must be declared"), ou ORA-00904/00942.
      IF SQLCODE IN (-6550, -904, -942) OR SQLERRM LIKE '%PLS-00201%' THEN
        mal := mal + 1;
        DBMS_OUTPUT.PUT_LINE(RPAD('EPCTI.DECRYPT', 26) || 'SEM ACESSO: ' || SQLERRM);
      ELSE
        ok := ok + 1;
        DBMS_OUTPUT.PUT_LINE(RPAD('EPCTI.DECRYPT', 26) ||
                             'alcancada (reclamou da entrada ficticia: ' || SQLCODE || ')');
      END IF;
  END;

  DBMS_OUTPUT.PUT_LINE('--------------------------------------------------');
  DBMS_OUTPUT.PUT_LINE('alcancados: ' || ok || '   com problema: ' || mal);
END;
/


-- ── 3. ONDE MORAM AS TABELAS NESTA BASE ─────────────────────────────────────
-- Para escrever os GRANTs e os CREATE SYNONYM é preciso saber o dono. Rode como
-- DBA se o usuário da aplicação não enxergar nada — e aí a resposta já é a
-- primeira informação útil.

SELECT owner,
       object_type,
       COUNT(*)                                   AS quantos,
       LISTAGG(object_name, ', ') WITHIN GROUP (ORDER BY object_name) AS objetos
  FROM all_objects
 WHERE object_name IN ('PCLANC', 'PCEMPR', 'PCLIB', 'EPCPARDRE', 'FILIAIS', 'EMPRESA',
                       'CLIENTE_ESPECIAL', 'DECRYPT', 'EPCTI')
   AND object_type IN ('TABLE', 'VIEW', 'PACKAGE', 'FUNCTION', 'SYNONYM')
 GROUP BY owner, object_type
 ORDER BY owner, object_type;
