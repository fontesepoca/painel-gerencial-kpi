-- dc30 — por que o login não roda com o usuário que a API usa hoje
--
-- O bloco 1 da dc29 devolveu, com o usuário da API:
--
--   PCEMPR               2 encontrados  →  EDI/SYNONYM, EPOCA/TABLE
--   PCCONTRO             0 encontrados
--   PCCONTROI            0 encontrados
--   PCLIB                0 encontrados
--   DECRYPT              2 encontrados  →  EPCTI/FUNCTION, EPOCA/FUNCTION
--   FNC_CONCATENA_LISTA  3 encontrados  →  EPCTI, EPOCA, FV
--
-- `ALL_OBJECTS` mostra **o que o usuário tem privilégio de ver**. As três tabelas de
-- permissão não aparecem para o `EDI` — e o login inteiro depende de ler as três. Não é uma
-- pedra no caminho do plano: é o plano parado.
--
-- Nunca esbarramos nisso porque o DRE não lê nenhuma delas. Ele usa `PCEMPR` (o nome de quem
-- baixou o título) e `PCFILIAL` (a UF), que o `EDI` enxerga; as filiais da tela vêm do corpo
-- da requisição, sem passar por `PCLIB`. É exatamente a permissão que estamos indo buscar que
-- mora do outro lado do muro.
--
-- Zero em `ALL_OBJECTS` NÃO diz se a tabela não existe ou se só falta grant. É o que a
-- Parte B resolve, e a diferença entre as duas conclusões é grande: uma é pedir acesso, a
-- outra é descobrir que o modelo de permissão da casa não é o que lemos no painel antigo.
--
-- ── RESOLVIDO em 15/09/2026 ──
--
-- Era falta de grant. O Gabriel concedeu acesso e criou os sinônimos no `EDI`; a A.1 passou a
-- devolver as três como `EDI/SYNONYM` sobre `EPOCA/TABLE`, o mesmo caminho pelo qual o
-- `PCEMPR` já chegava. O `EDI` também executa o `DECRYPT` nos dois schemas, e lê as 8.393
-- linhas do `PCEMPR`. As roles dele são só `CONNECT` e `RESOURCE`, então o privilégio novo
-- veio direto, não por grupo.
--
-- O arquivo fica: ele é o registro de por que essas permissões existem. Quem for montar o
-- ambiente de produção precisa repetir esses grants, e sem isto aqui a falha lá aparece como
-- um ORA-00942 no meio do login, longe da causa.


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE A — rode COM O USUÁRIO DA API (EDI)
-- ═══════════════════════════════════════════════════════════════════════════

-- A.1 — o EDI enxerga alguma coisa parecida?
-- Busca por prefixo, e não pelo nome exato: se a casa renomeou, ou se existe uma view de
-- permissão com outro nome, ela aparece aqui.
SELECT OWNER, OBJECT_NAME, OBJECT_TYPE
  FROM ALL_OBJECTS
 WHERE OBJECT_NAME LIKE 'PCCONTRO%'
    OR OBJECT_NAME LIKE 'PCLIB%'
 ORDER BY OBJECT_NAME, OWNER;

-- A.2 — o que o EDI tem de grant, e por qual caminho.
--
-- **Quais privilégios**, e não só "tem acesso": se o grant tiver vindo com INSERT, UPDATE ou
-- DELETE, a API passa a poder escrever em tabela legada por acidente — e a regra deste
-- projeto é que ela nunca escreva. `SELECT` e mais nada é o que queremos ver aqui.
--
-- A primeira versão desta consulta pedia `OWNER` e morreu com ORA-00904. No Oracle 11g a
-- coluna de `ALL_TAB_PRIVS` chama-se `TABLE_SCHEMA`; `OWNER` existe em `DBA_TAB_PRIVS` e só
-- chegou à visão `ALL_` no 12c.
SELECT GRANTEE, TABLE_SCHEMA, TABLE_NAME, PRIVILEGE, GRANTOR, GRANTABLE
  FROM ALL_TAB_PRIVS
 WHERE GRANTEE IN (SELECT USER FROM DUAL
                   UNION ALL
                   SELECT GRANTED_ROLE FROM USER_ROLE_PRIVS)
   AND TABLE_SCHEMA IN ('EPOCA', 'EPCTI')
 ORDER BY TABLE_NAME, PRIVILEGE;

-- A.3 — as roles do EDI, para eu saber em que grupo o acesso novo caberia.
SELECT GRANTED_ROLE, ADMIN_OPTION, DEFAULT_ROLE FROM USER_ROLE_PRIVS ORDER BY GRANTED_ROLE;

-- A.4 — o EDI consegue CHAMAR o DECRYPT?
-- Enxergar a função e poder executá-la são coisas diferentes. Esta chamada não passa senha
-- nenhuma: cifra o texto fixo 'TESTE' pela chave 'TESTE' e devolve só o tamanho do retorno.
-- Se der ORA-00904 ou ORA-01031, é falta de EXECUTE — e é isso que eu quero saber.
SELECT LENGTH(EPCTI.DECRYPT('TESTE', 'TESTE')) AS TAMANHO_EPCTI FROM DUAL;
SELECT LENGTH(EPOCA.DECRYPT('TESTE', 'TESTE')) AS TAMANHO_EPOCA FROM DUAL;

-- A.5 — e o PCEMPR, o EDI lê mesmo? (a dc29 assumiu que sim; confirmando de graça)
SELECT COUNT(*) AS LINHAS_EM_PCEMPR FROM PCEMPR;

-- A.6 — `EPCTI.DECRYPT` e `EPOCA.DECRYPT` são a mesma função?
--
-- As duas responderam ao teste com o mesmo tamanho, mas isso não prova nada: um texto que
-- não é cifra devolve lixo, e dois lixos podem ter o mesmo tamanho por acaso. O painel antigo
-- chama a do `EPCTI`. Se as duas divergirem sobre a MESMA senha e eu escolher a errada, o
-- login rejeita senha correta — e o erro aparece só quando alguém tentar entrar.
--
-- Compara as duas linha a linha sobre a base inteira e devolve **contagem**, nunca texto:
-- nenhuma senha sai do banco, nem em amostra.
SELECT COUNT(*)                                                             AS COM_SENHA,
       SUM(CASE WHEN EPCTI.DECRYPT(SENHABD, USUARIOBD)
                   = EPOCA.DECRYPT(SENHABD, USUARIOBD)
                THEN 1 ELSE 0 END)                                          AS CONCORDAM,
       SUM(CASE WHEN EPCTI.DECRYPT(SENHABD, USUARIOBD) IS NULL
                THEN 1 ELSE 0 END)                                          AS EPCTI_NULO,
       SUM(CASE WHEN EPOCA.DECRYPT(SENHABD, USUARIOBD) IS NULL
                THEN 1 ELSE 0 END)                                          AS EPOCA_NULO
  FROM PCEMPR
 WHERE SENHABD IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE B — rode COM O SEU USUÁRIO, o que enxerga o schema EPOCA
-- ═══════════════════════════════════════════════════════════════════════════

-- B.1 — as três tabelas existem? Onde?
-- Se aqui aparecerem em EPOCA, o que falta é grant. Se não aparecerem em lugar nenhum, o
-- modelo de permissão da casa não é o do painel antigo, e a conversa é outra.
SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, CREATED, LAST_DDL_TIME
  FROM ALL_OBJECTS
 WHERE OBJECT_NAME IN ('PCCONTRO', 'PCCONTROI', 'PCLIB', 'PCEMPR')
 ORDER BY OBJECT_NAME, OWNER;

-- B.2 — quem já tem acesso a elas. É o molde do pedido que eu vou te passar: dar ao EDI o
-- mesmo tipo de privilégio que o painel antigo usa, e nada além de SELECT.
SELECT OWNER, TABLE_NAME, GRANTEE, PRIVILEGE, GRANTOR
  FROM ALL_TAB_PRIVS
 WHERE TABLE_NAME IN ('PCCONTRO', 'PCCONTROI', 'PCLIB')
 ORDER BY TABLE_NAME, GRANTEE, PRIVILEGE;

-- B.3 — como o PCEMPR chega ao EDI hoje, para o acesso novo seguir o mesmo padrão.
SELECT OWNER, SYNONYM_NAME, TABLE_OWNER, TABLE_NAME
  FROM ALL_SYNONYMS
 WHERE SYNONYM_NAME IN ('PCEMPR', 'PCCONTRO', 'PCCONTROI', 'PCLIB')
 ORDER BY SYNONYM_NAME, OWNER;

-- B.4 — tamanho das três, para eu dimensionar a leitura da permissão.
-- Se PCCONTROI tiver centenas de milhares de linhas, ler tudo a cada login é decisão errada,
-- e o desenho do cache muda.
SELECT 'PCCONTRO'  AS TABELA, COUNT(*) AS LINHAS FROM EPOCA.PCCONTRO
UNION ALL
SELECT 'PCCONTROI', COUNT(*) FROM EPOCA.PCCONTROI
UNION ALL
SELECT 'PCLIB',     COUNT(*) FROM EPOCA.PCLIB;
