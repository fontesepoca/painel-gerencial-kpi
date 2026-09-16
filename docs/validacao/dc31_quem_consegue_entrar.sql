-- dc31 — quem consegue entrar, e por qual texto digitado
--
-- Fecha a Fase A. A dc29 respondeu quase tudo; sobraram quatro pontas, e três delas são
-- decisão sua, não descoberta minha.
--
-- ── Por que os blocos 4 e 5 da dc29 voltaram vazios ──
--
-- **A explicação que eu dei estava errada.** Eu disse que era o `NVL(CODBARRA, MATRICULA)`
-- pulando a matrícula de quem tem código de barras. O bloco 1 daqui mostrou que a matrícula
-- 4893 **não tem CODBARRA** e casa pela regra do painel: `PELA_REGRA_DO_PAINEL = 1`. Não foi
-- isso. O mais provável é que a variável tenha ido vazia naquela execução.
--
-- O comportamento do `NVL` continua real — quem TEM código de barras nunca tem a matrícula
-- testada —, só não foi o que aconteceu ali. Fica registrado como característica do painel
-- antigo, não como diagnóstico daquele vazio.
--
-- O bloco 1 mede por critério separado, em vez de devolver "achou/não achou": é o que permitiu
-- saber qual das explicações era a certa.
--
--
-- ══ O QUE ESTA dc31 ENCONTROU ══
--
-- **1. Homônimo não é o problema — é o oposto do que eu procurava.** Nenhum `NOME_GUERRA`
-- repetido tem duas pessoas com senha. O risco de alguém entrar na conta de um homônimo não
-- existe hoje. Mas o `ROWNUM = 1` roda ANTES da verificação de senha: quando das duas linhas
-- só uma tem senha, o sorteio pode devolver a que não tem, e aí **a pessoa certa, digitando a
-- senha certa, não entra**. O defeito é de indisponibilidade, não de invasão.
--
-- **2. A colisão de verdade é NOME_GUERRA × MATRÍCULA: 44 casos.** Em muitos deles as duas
-- pessoas têm senha — `774` é o nome de guerra de uma e a matrícula de outra, e `1002915` é o
-- espelho exato do mesmo par. Digitar esse texto casa duas pessoas diferentes por ramos
-- distintos do mesmo `OR`, e o `ROWNUM = 1` sem `ORDER BY` escolhe uma. O Oracle não promete
-- ordem sem `ORDER BY`: a escolha pode mudar entre execuções, com o plano ou a estatística.
--
-- **3. Metade da base está inativa e tem senha.** `SITUACAO = 'I'` são 4.627 pessoas, 3.071
-- delas com senha cadastrada. `DTDEMISSAO` quase não é preenchida (22 linhas na base inteira),
-- então ela **não serve** como filtro — quem quiser barrar desligado precisa usar `SITUACAO`.
-- Hoje **3.072 pessoas inativas entrariam**.
--
-- **4. PCLIB tem 8,4 milhões de linhas** (PCCONTRO 184.739, PCCONTROI 377.190). Ler por
-- `CODFUNC` com os índices que já existem é barato; ler a tabela é impensável. Nenhum desenho
-- pode carregar PCLIB inteira em memória.


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


-- ── 4. os metadados de rotina — PCROTINA liberada em 16/09/2026 ──────────────
--
-- Isto decide o CODCONTROLE novo. A 9995 só tem o controle 1 gravado em PCCONTROI, mas a
-- rotina Delphi pode DEFINIR controles que ninguém cadastrou ainda: se eu pedir o número 2 e
-- o Winthor já chamar de 2 alguma coisa dele, as duas permissões viram a mesma linha.
--
-- Voltou vazio duas vezes, e as duas por falta de privilégio: o `EDI` não tinha grant nem
-- sinônimo de `PCROTINA`. O Gabriel criou os dois. É a terceira vez neste levantamento que
-- `ALL_OBJECTS` vazio significou "não enxergo" e não "não existe" — vale como regra: aqui,
-- zero em `ALL_OBJECTS` nunca é resposta, é pergunta.
--
-- 4.1 — o que mais apareceu junto, agora que há acesso.
SELECT OWNER, OBJECT_NAME, OBJECT_TYPE
  FROM ALL_OBJECTS
 WHERE OBJECT_NAME LIKE 'PCROTINA%'
    OR OBJECT_NAME LIKE 'PCCONTROLE%'
    OR OBJECT_NAME LIKE '%CONTROLEACESSO%'
    OR OBJECT_NAME LIKE 'PCOPCAO%'
 ORDER BY OBJECT_NAME, OWNER;

-- 4.2 — a forma da PCROTINA: preciso saber se ela guarda os CONTROLES de cada rotina ou só o
-- nome dela. É a diferença entre poder conferir o número novo contra o cadastro e ter de
-- olhar a rotina 530 na tela.
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, COLUMN_ID
  FROM ALL_TAB_COLUMNS
 WHERE TABLE_NAME = 'PCROTINA'
 ORDER BY COLUMN_ID;

-- 4.3 — o que ela diz das cinco rotinas do painel.
SELECT *
  FROM PCROTINA
 WHERE CODROTINA IN (9995, 9996, 9997, 9998, 9999)
 ORDER BY CODROTINA;

-- 4.4 — o CODCONTROLE que vamos ocupar não pode ser um que a rotina já define.
--
-- A 9995 só tem o controle 1 gravado em PCCONTROI, mas linha gravada é "alguém já usou", não
-- "a rotina só tem esse". Se a 4.2 mostrar uma coluna de controles, esta consulta compara o
-- que a rotina define com o que está em uso — e a diferença é exatamente o espaço livre.
--
-- Se a 4.2 mostrar que PCROTINA guarda só o nome, me diga: aí o número sai da tela da 530, e
-- eu peço que você confira lá quantos controles a 9995 lista.
SELECT R.CODROTINA,
       (SELECT COUNT(DISTINCT I.CODCONTROLE)
          FROM PCCONTROI I WHERE I.CODROTINA = R.CODROTINA) AS CONTROLES_EM_USO,
       (SELECT MAX(I.CODCONTROLE)
          FROM PCCONTROI I WHERE I.CODROTINA = R.CODROTINA) AS MAIOR_EM_USO
  FROM PCROTINA R
 WHERE R.CODROTINA IN (9995, 9996, 9997, 9998, 9999)
 ORDER BY R.CODROTINA;


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
