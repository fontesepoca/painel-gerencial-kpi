-- dc31 — quem consegue entrar, e por qual texto digitado
--
-- Fecha a Fase A. A dc29 respondeu quase tudo; sobraram quatro pontas, e três delas são
-- decisão sua, não descoberta minha.
--
-- ── Por que os blocos 4 e 5 da dc29 voltaram vazios ──
--
-- Não foi a variável de substituição. Olhe a condição que o painel antigo usa e que eu copiei:
--
--     WHERE NOME_GUERRA = UPPER(:login) OR NVL(CODBARRA, MATRICULA) = UPPER(:login)
--
-- O `NVL` só chega na MATRÍCULA quando o `CODBARRA` é **nulo**. Quem tem código de barras
-- cadastrado nunca tem a matrícula testada — digitar o próprio número de matrícula não
-- autentica essa pessoa. Se você digitou `4893`, é exatamente isso que aconteceu, e o vazio
-- não é defeito da consulta: é o comportamento do painel antigo aparecendo.
--
-- O bloco 1 desta dc31 mede isso por critério separado, em vez de devolver "achou/não achou".


-- ── 1. por qual critério o texto digitado casa ───────────────────────────────
-- Digite o mesmo texto que você digitaria na tela de login.
SELECT COUNT(*)                                                                AS TOTAL_QUE_CASA,
       SUM(CASE WHEN NOME_GUERRA = UPPER('&&login')          THEN 1 ELSE 0 END) AS POR_NOME_GUERRA,
       SUM(CASE WHEN CODBARRA    = UPPER('&&login')          THEN 1 ELSE 0 END) AS POR_CODBARRA,
       SUM(CASE WHEN TO_CHAR(MATRICULA) = UPPER('&&login')   THEN 1 ELSE 0 END) AS POR_MATRICULA,
       SUM(CASE WHEN NVL(CODBARRA, TO_CHAR(MATRICULA)) = UPPER('&&login')
                THEN 1 ELSE 0 END)                                             AS PELA_REGRA_DO_PAINEL
  FROM PCEMPR
 WHERE NOME_GUERRA = UPPER('&&login')
    OR CODBARRA = UPPER('&&login')
    OR TO_CHAR(MATRICULA) = UPPER('&&login');

-- O seu cadastro, sem senha nenhuma na tela — só o que existe preenchido.
-- A matrícula 4893 veio do bloco 3 da dc29 (GABRIELFREITAS).
SELECT MATRICULA,
       NOME_GUERRA,
       CASE WHEN CODBARRA IS NULL THEN 'SEM CODBARRA' ELSE 'TEM CODBARRA' END AS SITUACAO_CODBARRA,
       CASE WHEN SENHABD  IS NULL THEN 'SEM SENHA'    ELSE 'TEM SENHA'    END AS SITUACAO_SENHA,
       SITUACAO,
       DTDEMISSAO
  FROM PCEMPR
 WHERE MATRICULA = 4893;


-- ── 2. os homônimos que de fato conseguem entrar ─────────────────────────────
-- A dc29 achou 12 `NOME_GUERRA` repetidos. Mas repetido só é perigoso se as duas pessoas
-- puderem autenticar: sem senha cadastrada, a linha nunca passa da verificação.
--
-- O painel antigo resolve o empate com `ROWNUM = 1` e **sem ORDER BY** — o Oracle devolve a
-- que vier primeiro, e isso pode mudar de uma execução para outra. Duas pessoas digitando o
-- mesmo login entram na mesma conta; a mesma pessoa pode entrar como a outra amanhã.
SELECT NOME_GUERRA,
       COUNT(*)                                                    AS PESSOAS,
       SUM(CASE WHEN SENHABD IS NOT NULL THEN 1 ELSE 0 END)        AS COM_SENHA,
       LISTAGG(MATRICULA, ', ') WITHIN GROUP (ORDER BY MATRICULA)  AS MATRICULAS
  FROM PCEMPR
 WHERE NOME_GUERRA IS NOT NULL
 GROUP BY NOME_GUERRA
HAVING COUNT(*) > 1
   AND SUM(CASE WHEN SENHABD IS NOT NULL THEN 1 ELSE 0 END) > 1
 ORDER BY NOME_GUERRA;

-- A colisão que ninguém procura: o NOME_GUERRA de uma pessoa é a MATRÍCULA de outra.
-- A dc29 mostrou `NOME_GUERRA` valendo `5476`, `593`, `1313` — números, não nomes. Digitar
-- esse número casa as duas pessoas por caminhos diferentes na mesma condição `OR`.
SELECT E.NOME_GUERRA         AS TEXTO_DIGITADO,
       E.MATRICULA           AS QUEM_CASA_PELO_NOME,
       O.MATRICULA           AS QUEM_CASA_PELO_NUMERO,
       CASE WHEN E.SENHABD IS NOT NULL THEN 'S' ELSE 'N' END AS NOME_TEM_SENHA,
       CASE WHEN O.SENHABD IS NOT NULL THEN 'S' ELSE 'N' END AS NUMERO_TEM_SENHA
  FROM PCEMPR E
  JOIN PCEMPR O ON TO_CHAR(O.MATRICULA) = E.NOME_GUERRA
                OR O.CODBARRA = E.NOME_GUERRA
 WHERE E.NOME_GUERRA IS NOT NULL
   AND E.MATRICULA <> O.MATRICULA
 ORDER BY E.NOME_GUERRA;


-- ── 3. dá para barrar quem saiu? ─────────────────────────────────────────────
-- O bloco 6 da dc29 achou as colunas: `SITUACAO`, `DTDEMISSAO`, `SITUACAO_CCW`, `OBSINATIVO`.
-- Falta saber que valores `SITUACAO` assume e quantas pessoas cada filtro barraria — barrar
-- pelo campo errado tranca gente que trabalha aqui, e isso aparece na segunda-feira de manhã.
SELECT NVL(SITUACAO, '(nulo)')                                AS SITUACAO,
       COUNT(*)                                               AS PESSOAS,
       SUM(CASE WHEN SENHABD IS NOT NULL THEN 1 ELSE 0 END)   AS COM_SENHA,
       SUM(CASE WHEN DTDEMISSAO IS NOT NULL THEN 1 ELSE 0 END) AS COM_DATA_DE_DEMISSAO
  FROM PCEMPR
 GROUP BY SITUACAO
 ORDER BY PESSOAS DESC;

-- E o cruzamento que interessa: quem tem senha, está demitido, e hoje entraria.
SELECT COUNT(*) AS ENTRARIAM_HOJE_MESMO_DEMITIDOS
  FROM PCEMPR
 WHERE SENHABD IS NOT NULL
   AND (DTDEMISSAO IS NOT NULL OR SITUACAO <> 'A');


-- ── 4. os metadados de controle — RODE COM O SEU USUÁRIO ─────────────────────
-- O bloco 7 da dc29 voltou vazio nesta busca, mas ele rodou como `EDI`, e `ALL_OBJECTS` só
-- mostra o que o usuário tem privilégio de ver. Vazio ali significa "o EDI não enxerga", e
-- **não** "não existe" — a mesma armadilha que nos custou a dc30.
--
-- Isto importa para escolher o CODCONTROLE novo. A 9995 hoje só tem o controle 1 gravado em
-- PCCONTROI, mas a rotina Delphi pode DEFINIR controles que ninguém cadastrou ainda. Se eu
-- pedir o número 2 e o Winthor já chamar de 2 alguma coisa dele, as duas permissões viram a
-- mesma linha.
SELECT OWNER, OBJECT_NAME, OBJECT_TYPE
  FROM ALL_OBJECTS
 WHERE OBJECT_NAME LIKE 'PCROTINA%'
    OR OBJECT_NAME LIKE 'PCCONTROLE%'
    OR OBJECT_NAME LIKE '%CONTROLEACESSO%'
    OR OBJECT_NAME LIKE 'PCOPCAO%'
 ORDER BY OBJECT_NAME, OWNER;

-- Se a consulta acima encontrar uma tabela de rotinas, esta mostra o que ela diz da 9995.
-- Ajuste o nome se ele vier diferente.
-- SELECT * FROM EPOCA.PCROTINA WHERE CODROTINA IN (9995, 9996, 9997, 9998, 9999);


-- ── 5. o tamanho das tabelas de permissão ────────────────────────────────────
-- Se `PCCONTROI` tiver centenas de milhares de linhas, ler tudo a cada login é desenho errado
-- e o cache muda antes de eu escrever a primeira linha. Agora roda como EDI, pelos sinônimos.
SELECT 'PCCONTRO'  AS TABELA, COUNT(*) AS LINHAS FROM PCCONTRO
UNION ALL
SELECT 'PCCONTROI', COUNT(*) FROM PCCONTROI
UNION ALL
SELECT 'PCLIB',     COUNT(*) FROM PCLIB;

-- E as filiais de quem já tem a 9995 — as nove pessoas do bloco 3 da dc29. É o que a tela
-- vai oferecer a cada uma delas no dia em que o login subir.
SELECT L.CODFUNC                                                  AS MATRICULA,
       E.NOME_GUERRA,
       COUNT(*)                                                   AS QDE_FILIAIS,
       LISTAGG(L.CODIGOA, ', ') WITHIN GROUP (ORDER BY TO_NUMBER(L.CODIGOA)) AS FILIAIS
  FROM PCLIB L
  JOIN PCEMPR E ON E.MATRICULA = L.CODFUNC
 WHERE L.CODTABELA = 1
   AND L.CODIGOA NOT IN (2, 99)
   AND L.CODFUNC IN (9311, 2807, 4893, 9316, 1002010, 5367, 5531, 5587, 5476)
 GROUP BY L.CODFUNC, E.NOME_GUERRA
 ORDER BY E.NOME_GUERRA;
