-- ============================================================================
-- sp20: o GRANT e o SINÔNIMO que faltam ao EDI para ler a PCCIDADE
--         (base ÉPOCA)
--
-- Registro: docs/rotinas/simulador-preco/CALCULADORA_RTC.md (D11, o destino é o município da
-- filial)
--
-- *** NÃO É PARA RODAR SEM REVISÃO. *** Quem decide e executa é quem administra o Oracle.
-- Nenhum comando aqui altera tabela:
--   - o GRANT dá permissão de LEITURA;
--   - o CREATE SYNONYM cria um apelido no schema do EDI.
-- Nenhum INSERT, UPDATE, DELETE ou DDL em tabela.
--
-- Por que precisa: a calculadora da Receita exige o código IBGE do município de destino, que é
-- o da filial consultada. A PCFILIAL só guarda o NOME da cidade e a UF; o código IBGE está na
-- PCCIDADE (CODIBGE). Em 26/11/2026, o Gabriel conferiu:
--   - com o usuário EPCTI, a PCCIDADE aparece (CODCIDADE, CODIBGE, NOMECIDADE, UF);
--   - conectado como EDI (o usuário da API), a consulta com a PCCIDADE deu ORA-00942.
--
-- São dois comandos, como na sp19:
--   - GRANT: dá a PERMISSÃO de ler;
--   - CREATE SYNONYM: faz o nome `PCCIDADE`, sem dono na frente, apontar para a tabela do dono.
-- Faltando qualquer um dos dois, o erro é o mesmo ORA-00942.
--
-- QUEM RODA O QUÊ:
--   bloco 0: como EPCTI (que enxerga a tabela), para descobrir o DONO;
--   bloco 1: como EDI, antes do grant;
--   bloco 2: como o DONO da tabela, ou um DBA;
--   bloco 3: como EDI (sinônimo privado; só exige CREATE SYNONYM no EDI);
--   bloco 4: como EDI, depois dos blocos 2 e 3, para conferir.
--
-- RESULTADO NA ÉPOCA (Gabriel, 26/11/2026):
--   - blocos 2 e 3: grant dado e sinônimo criado;
--   - bloco 4, como EDI: PCCIDADE com 5566 linhas;
--   - ligação por nome + UF: todas as filiais com QTD_ENCONTRADAS = 1, exceto a 99, que não tem
--     cidade nem UF na PCFILIAL:
--       1, 7, 20, 24, 25, 27, 28, 35  CONTAGEM/MG        3118601
--       12                            SERRA/ES           3205002
--       22                            RIO DE JANEIRO/RJ  3304557
--       34                            UBERLANDIA/MG      3170206
--       99                            (vazio)            sem código
-- MINAS RURAL: falta rodar lá, com o usuário que a API usa naquela base.
--
-- ATENÇÃO: os blocos 1 a 3 supõem que o dono é EPOCA, como nas outras PC*. Se o bloco 0
-- mostrar outro dono, troque "EPOCA" pelo dono certo antes de rodar.
-- ============================================================================


-- ── 0. QUEM É O DONO DA PCCIDADE? (como EPCTI) ─────────────────────────────────

SELECT OWNER, OBJECT_NAME, OBJECT_TYPE
  FROM ALL_OBJECTS
 WHERE OBJECT_NAME = 'PCCIDADE';


-- ── 1. O EDI JÁ TEM A PERMISSÃO? (como EDI, ANTES do grant) ────────────────────
-- Lê pelo NOME COMPLETO, que não passa por sinônimo. Nada é lido de fato (WHERE 1 = 0).
--   - Leu: o grant já existe, e basta o bloco 3.
--   - ORA-01031 (privilégios insuficientes): a tabela EXISTE e falta o grant. Rodar o bloco 2.
--   - ORA-00942: ou falta o grant, ou o dono não é EPOCA (ver o bloco 0).

SELECT COUNT(*) FROM EPOCA.PCCIDADE WHERE 1 = 0;


-- ── 2. A PERMISSÃO (como o dono ou DBA) ────────────────────────────────────────
-- Só se o bloco 1 não leu.

grant SELECT on "EPOCA"."PCCIDADE" to "EDI";


-- ── 3. O SINÔNIMO (como EDI) ───────────────────────────────────────────────────
-- Só se o EDI ainda não enxergar `PCCIDADE` sem o dono na frente.

create or replace synonym "PCCIDADE" for "EPOCA"."PCCIDADE";


-- ── 4. A CONFERÊNCIA (como EDI) ────────────────────────────────────────────────
-- Primeiro, a leitura simples:

SELECT COUNT(*) FROM PCCIDADE;

-- Depois, a ligação de cada filial com a sua cidade, por NOME + UF (a PCFILIAL não tem o
-- código da cidade). Olhar a coluna QTD_ENCONTRADAS:
--   1        → a filial achou a sua cidade (ex.: Nova Lima deve sair 3144805);
--   0        → o nome está escrito diferente nas duas tabelas; o CODIBGE vem vazio;
--   2 ou mais → cidade repetida na PCCIDADE; a ligação é ambígua.

SELECT F.CODIGO                                      AS FILIAL,
       F.CIDADE                                      AS CIDADE_DA_FILIAL,
       F.UF,
       C.CODIBGE,
       C.NOMECIDADE                                  AS CIDADE_ENCONTRADA,
       COUNT(C.CODIBGE) OVER (PARTITION BY F.CODIGO) AS QTD_ENCONTRADAS
  FROM PCFILIAL F
  LEFT JOIN PCCIDADE C
         ON UPPER(TRIM(C.NOMECIDADE)) = UPPER(TRIM(F.CIDADE))
        AND C.UF = F.UF
 ORDER BY F.CODIGO;
