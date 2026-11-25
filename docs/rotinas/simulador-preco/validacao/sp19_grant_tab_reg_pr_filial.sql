-- ============================================================================
-- sp19: o GRANT e o SINÔNIMO que faltam ao EDI para ler a TAB_REG_PR_FILIAL
--         (base ÉPOCA)
--
-- Spec: docs/superpowers/specs/2026-11-25-simulador-regiao-pelo-vinculo-do-comprador-design.md
--
-- *** NÃO É PARA RODAR SEM REVISÃO. *** Quem decide e executa é quem administra o Oracle.
-- Nenhum comando aqui altera tabela:
--   - o GRANT dá permissão de LEITURA;
--   - o CREATE SYNONYM cria um apelido no schema do EDI.
-- Nenhum INSERT, UPDATE, DELETE ou DDL em tabela.
--
-- Por que precisa: a região do comprador sai da TAB_REG_PR_FILIAL (matrícula + filial), como
-- na rotina em operação. Em 25/11/2026, o Gabriel conferiu:
--   - a tabela é do schema EPCTI, e não do EPOCA como as PC*;
--   - com o usuário dele, `SELECT COUNT(*) FROM TAB_REG_PR_FILIAL` deu 2871;
--   - conectado como EDI (o usuário da API), deu ORA-00942.
--
-- São dois comandos, como na sp7:
--   - GRANT: dá a PERMISSÃO de ler;
--   - CREATE SYNONYM: faz o nome `TAB_REG_PR_FILIAL`, sem dono na frente, apontar para a
--     tabela do EPCTI. A API escreve `FROM TAB_REG_PR_FILIAL` sem qualificar.
-- Faltando qualquer um dos dois, o erro é o mesmo ORA-00942.
--
-- QUEM RODA O QUÊ:
--   bloco 0: como EDI, antes de tudo;
--   bloco 1: como o DONO da tabela (EPCTI), ou um DBA;
--   bloco 2: como EDI (sinônimo privado; só exige CREATE SYNONYM no EDI);
--   bloco 3: como EDI, depois dos blocos 1 e 2, para conferir.
--
-- RESULTADO NA ÉPOCA (Gabriel, 25/11/2026):
--   - bloco 0: ORA-01031 (a tabela existe e faltava o grant);
--   - bloco 1: grant bem-sucedido;
--   - bloco 2: sinônimo criado;
--   - bloco 3: 2871 linhas e as seis filiais da matrícula 5476, todas na região 1.
-- MINAS RURAL: a tabela existe no EPCTI de lá, com as mesmas colunas. Falta rodar este
-- script lá, com o usuário que a API usa naquela base.
-- ============================================================================


-- ── 0. O EDI JÁ TEM A PERMISSÃO? (como EDI, ANTES de tudo) ─────────────────────
-- Lê pelo NOME COMPLETO, que não passa por sinônimo. Nada é lido de fato (WHERE 1 = 0).
--   - Leu: o grant já existe, e basta o bloco 2.
--   - ORA-01031 (privilégios insuficientes): a tabela EXISTE e falta o grant. Rodar o bloco 1.
--   - ORA-00942: ou falta o grant, ou o dono não é EPCTI.

SELECT COUNT(*) FROM EPCTI.TAB_REG_PR_FILIAL WHERE 1 = 0;


-- ── 1. A PERMISSÃO (como EPCTI ou DBA) ─────────────────────────────────────────
-- Só se o bloco 0 não leu.

grant SELECT on "EPCTI"."TAB_REG_PR_FILIAL" to "EDI";


-- ── 2. O SINÔNIMO (como EDI) ───────────────────────────────────────────────────

create or replace synonym "TAB_REG_PR_FILIAL" for "EPCTI"."TAB_REG_PR_FILIAL";


-- ── 3. A CONFERÊNCIA (como EDI) ────────────────────────────────────────────────
-- Tem de dar o mesmo total que deu com o usuário do Gabriel (2871 em 25/11/2026),
-- e as seis filiais da matrícula 5476 (7, 12, 24, 25, 27 e 34, todas na região 1).

SELECT COUNT(*) FROM TAB_REG_PR_FILIAL;

SELECT * FROM TAB_REG_PR_FILIAL WHERE MATRICULA = 5476 ORDER BY TO_NUMBER(CODFILIAL);
