-- dc29 — o que precisa vir do banco antes de escrever o login
--
-- Fase A do plano de autenticação. Sete blocos independentes; rode um de cada vez e me
-- devolva o resultado. Enquanto eles não voltarem, qualquer número que eu escrevesse no
-- código seria chute — e chute em CODCONTROLE colide com permissão de outra pessoa.
--
-- ⚠ NENHUM BLOCO DEVOLVE SENHA. O bloco 4 chama `EPCTI.DECRYPT`, mas só para dizer se a
--   função respondeu, quantos caracteres vieram e se o retorno já está em maiúsculas. O
--   texto da senha não sai do banco, e não quero que saia.
--
-- Os blocos 4 e 5 usam `&&usuario`, a variável de substituição do SQL Developer: na primeira
-- vez ele pergunta, e daí em diante reaproveita o valor na mesma sessão. Digite o login que
-- você usa no painel — NOME_GUERRA ou código de barras. Se preferir não usar variável, troque
-- `&&usuario` pelo texto entre aspas simples, nos três lugares em que ele aparece.
--
-- Onde cada coisa vai ser usada:
--   1 → confirma que a API alcança as tabelas de permissão com o usuário de conexão dela
--   2 → define a numeração dos CODCONTROLE novos (o ponto que trava o resto)
--   3 → mede o impacto de reaproveitar a rotina 9995
--   4 → confirma a verificação de senha
--   5 → confirma as filiais do usuário e a função que a 9815 usa para concatenar
--   6 → diz se dá para barrar funcionário desligado, que o painel antigo não barra
--   7 → a forma das tabelas de permissão, para eu lê-las do jeito certo e te dizer o que
--       pedir na rotina 530 quando for cadastrar os controles novos


-- ── 1. contexto da conexão ───────────────────────────────────────────────────
-- Rode COM O MESMO USUÁRIO que está na connection string da API, não com o seu do
-- SQL Developer. O painel antigo escreve `PCEMPR` sem schema e `EPCTI.DECRYPT` com; preciso
-- saber se a nossa conexão enxerga as duas coisas do mesmo jeito.
SELECT SYS_CONTEXT('USERENV', 'SESSION_USER')  AS USUARIO_DA_SESSAO,
       SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS SCHEMA_ATUAL
  FROM DUAL;

SELECT 'PCEMPR' AS OBJETO,
       (SELECT COUNT(*) FROM ALL_OBJECTS WHERE OBJECT_NAME = 'PCEMPR')   AS ENCONTRADOS,
       (SELECT LISTAGG(OWNER || '/' || OBJECT_TYPE, ', ') WITHIN GROUP (ORDER BY OWNER)
          FROM ALL_OBJECTS WHERE OBJECT_NAME = 'PCEMPR')                 AS ONDE
  FROM DUAL
UNION ALL
SELECT 'PCCONTRO',
       (SELECT COUNT(*) FROM ALL_OBJECTS WHERE OBJECT_NAME = 'PCCONTRO'),
       (SELECT LISTAGG(OWNER || '/' || OBJECT_TYPE, ', ') WITHIN GROUP (ORDER BY OWNER)
          FROM ALL_OBJECTS WHERE OBJECT_NAME = 'PCCONTRO') FROM DUAL
UNION ALL
SELECT 'PCCONTROI',
       (SELECT COUNT(*) FROM ALL_OBJECTS WHERE OBJECT_NAME = 'PCCONTROI'),
       (SELECT LISTAGG(OWNER || '/' || OBJECT_TYPE, ', ') WITHIN GROUP (ORDER BY OWNER)
          FROM ALL_OBJECTS WHERE OBJECT_NAME = 'PCCONTROI') FROM DUAL
UNION ALL
SELECT 'PCLIB',
       (SELECT COUNT(*) FROM ALL_OBJECTS WHERE OBJECT_NAME = 'PCLIB'),
       (SELECT LISTAGG(OWNER || '/' || OBJECT_TYPE, ', ') WITHIN GROUP (ORDER BY OWNER)
          FROM ALL_OBJECTS WHERE OBJECT_NAME = 'PCLIB') FROM DUAL
UNION ALL
SELECT 'DECRYPT',
       (SELECT COUNT(*) FROM ALL_OBJECTS
         WHERE OBJECT_NAME = 'DECRYPT' AND OBJECT_TYPE IN ('FUNCTION', 'PACKAGE')),
       (SELECT LISTAGG(OWNER || '/' || OBJECT_TYPE, ', ') WITHIN GROUP (ORDER BY OWNER)
          FROM ALL_OBJECTS
         WHERE OBJECT_NAME = 'DECRYPT' AND OBJECT_TYPE IN ('FUNCTION', 'PACKAGE')) FROM DUAL
UNION ALL
SELECT 'FNC_CONCATENA_LISTA',
       (SELECT COUNT(*) FROM ALL_OBJECTS WHERE OBJECT_NAME = 'FNC_CONCATENA_LISTA'),
       (SELECT LISTAGG(OWNER || '/' || OBJECT_TYPE, ', ') WITHIN GROUP (ORDER BY OWNER)
          FROM ALL_OBJECTS WHERE OBJECT_NAME = 'FNC_CONCATENA_LISTA') FROM DUAL;


-- ── 2. os CODCONTROLE já ocupados — O BLOCO QUE TRAVA O RESTO ────────────────
-- Você escolheu pendurar as permissões novas na rotina 9995 (Painel Gerencial). O
-- `old-verify-client.sql` só lê o CODCONTROLE 1 dela, mas o TXT_SQL não é o cadastro — é
-- só quem o lê. Pode haver linha gravada em PCCONTROI que ninguém consulta, e reaproveitar
-- um número desses daria permissão nova a quem já tem a antiga, sem ninguém perceber.
--
-- Trago as cinco rotinas do painel para eu ver o padrão de numeração da casa.
SELECT CODROTINA,
       CODCONTROLE,
       COUNT(*)                                          AS QDE_USUARIOS,
       SUM(CASE WHEN ACESSO = 'S' THEN 1 ELSE 0 END)      AS COM_ACESSO,
       MIN(CODUSUARIO)                                    AS MENOR_MATRICULA,
       MAX(CODUSUARIO)                                    AS MAIOR_MATRICULA
  FROM PCCONTROI
 WHERE CODROTINA IN (9995, 9996, 9997, 9998, 9999)
 GROUP BY CODROTINA, CODCONTROLE
 ORDER BY CODROTINA, CODCONTROLE;


-- ── 3. quem já tem o Painel Gerencial ────────────────────────────────────────
-- Reaproveitar a 9995 significa que essas pessoas herdam o acesso ao painel-pai do KPI novo
-- no dia em que ele subir. Quero saber quantas são antes de ligar.
SELECT COUNT(*)                                       AS USUARIOS_NA_9995,
       SUM(CASE WHEN ACESSO = 'S' THEN 1 ELSE 0 END)  AS COM_ACESSO_LIBERADO
  FROM PCCONTRO
 WHERE CODROTINA = 9995;

-- E a lista, para conferir se faz sentido — nome, não só matrícula.
SELECT C.CODUSUARIO, E.NOME_GUERRA, C.ACESSO
  FROM PCCONTRO C
  LEFT JOIN PCEMPR E ON E.MATRICULA = C.CODUSUARIO
 WHERE C.CODROTINA = 9995
 ORDER BY C.ACESSO DESC, E.NOME_GUERRA;


-- ── 4. a verificação de senha ────────────────────────────────────────────────
-- Digite no prompt o login que você usa no painel (NOME_GUERRA ou código de barras).
-- Repare que a senha NÃO é selecionada: só o formato dela.
SELECT E.MATRICULA,
       E.NOME_GUERRA,
       CASE WHEN E.SENHABD IS NULL THEN 'SEM SENHA CADASTRADA' ELSE 'TEM SENHA' END AS SITUACAO_SENHA,
       CASE WHEN EPCTI.DECRYPT(E.SENHABD, E.USUARIOBD) IS NULL
            THEN 'DECRYPT DEVOLVEU NULO' ELSE 'DECRYPT RESPONDEU' END               AS RESULTADO,
       LENGTH(EPCTI.DECRYPT(E.SENHABD, E.USUARIOBD))                                AS TAMANHO,
       CASE WHEN EPCTI.DECRYPT(E.SENHABD, E.USUARIOBD)
               = UPPER(EPCTI.DECRYPT(E.SENHABD, E.USUARIOBD))
            THEN 'JA VEM MAIUSCULA' ELSE 'TEM MINUSCULA' END                        AS CAIXA
  FROM PCEMPR E
 WHERE (E.NOME_GUERRA = UPPER('&&usuario')
        OR NVL(E.CODBARRA, E.MATRICULA) = UPPER('&&usuario'))
   AND ROWNUM = 1;

-- Quantas pessoas responderiam ao mesmo login digitado? O painel antigo usa `ROWNUM = 1`
-- sem ORDER BY, então com duas linhas ele autentica uma delas ao acaso. Se der > 1 para
-- algum usuário real, isso vira decisão sua e não vou reproduzir o sorteio.
SELECT NOME_GUERRA, COUNT(*) AS QDE
  FROM PCEMPR
 WHERE NOME_GUERRA IS NOT NULL
 GROUP BY NOME_GUERRA
HAVING COUNT(*) > 1
 ORDER BY QDE DESC;


-- ── 5. as filiais do usuário ─────────────────────────────────────────────────
-- É o que vai limitar a apuração: hoje a tela aceita qualquer filial que o corpo da
-- requisição pedir.
--
-- A matrícula sai de subconsulta sobre o mesmo `&&usuario` do bloco 4, e não de um número
-- colado à mão. Na primeira versão deste arquivo eu tinha deixado `0000` como placeholder, e
-- rodar assim devolve zero linha — que se parece com "o usuário não tem filial nenhuma".
SELECT CODIGOA AS CODFILIAL
  FROM PCLIB
 WHERE CODFUNC = (SELECT MIN(MATRICULA) FROM PCEMPR
                   WHERE NOME_GUERRA = UPPER('&&usuario')
                      OR NVL(CODBARRA, MATRICULA) = UPPER('&&usuario'))
   AND CODTABELA = 1
   AND CODIGOA NOT IN (2, 99)
 ORDER BY TO_NUMBER(CODIGOA);

-- A mesma coisa pelo caminho que a 9815 usa, para eu saber se posso dispensar a função.
SELECT (SELECT FNC_CONCATENA_LISTA(CURSOR(
          SELECT CODIGOA FROM PCLIB
           WHERE CODFUNC = (SELECT MIN(MATRICULA) FROM PCEMPR
                             WHERE NOME_GUERRA = UPPER('&&usuario')
                                OR NVL(CODBARRA, MATRICULA) = UPPER('&&usuario'))
             AND CODTABELA = 1 AND CODIGOA NOT IN (2, 99)
           ORDER BY TO_NUMBER(CODIGOA))) FROM DUAL) AS FILIAIS
  FROM DUAL;


-- ── 6. dá para barrar quem saiu da empresa? ──────────────────────────────────
-- O painel antigo não filtra nada disso: a única condição é a senha bater. Quem foi
-- desligado e continua em PCEMPR entra. Antes de propor barrar, preciso saber com qual
-- coluna — e quantas linhas ela afetaria.
SELECT COLUMN_NAME, DATA_TYPE, NULLABLE
  FROM ALL_TAB_COLUMNS
 WHERE TABLE_NAME = 'PCEMPR'
   AND ( COLUMN_NAME LIKE '%DEMISS%'
      OR COLUMN_NAME LIKE '%SITUAC%'
      OR COLUMN_NAME LIKE '%BLOQ%'
      OR COLUMN_NAME LIKE '%ATIVO%'
      OR COLUMN_NAME LIKE '%AFAST%'
      OR COLUMN_NAME LIKE '%DTSAIDA%' )
 ORDER BY COLUMN_NAME;


-- ── 7. a forma das tabelas de permissão ──────────────────────────────────────
-- Para LER a permissão eu preciso saber que colunas existem e quais não aceitam nulo — e,
-- quando chegar a hora de cadastrar os controles novos, saber se existe uma tabela que guarda
-- a DESCRIÇÃO de cada CODCONTROLE ou se isso vive dentro do Delphi.
--
-- Não vou escrever nada em tabela legada: o cadastro é seu, pela rotina 530. Isto aqui é só
-- para eu ler do jeito certo e te dizer exatamente o que pedir lá.
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, COLUMN_ID
  FROM ALL_TAB_COLUMNS
 WHERE TABLE_NAME IN ('PCCONTRO', 'PCCONTROI', 'PCLIB')
 ORDER BY TABLE_NAME, COLUMN_ID;

-- Existe algum objeto que descreva os controles de uma rotina?
SELECT OWNER, OBJECT_NAME, OBJECT_TYPE
  FROM ALL_OBJECTS
 WHERE OBJECT_NAME LIKE 'PC%ROTINA%'
    OR OBJECT_NAME LIKE 'PC%CONTROLE%'
 ORDER BY OBJECT_NAME;
