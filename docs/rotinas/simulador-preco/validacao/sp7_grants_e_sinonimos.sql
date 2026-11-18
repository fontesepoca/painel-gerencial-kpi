-- ============================================================================
-- sp7 — os GRANTs e os SINÔNIMOS que faltam ao EDI para o simulador de preço
--         (base ÉPOCA)
--
-- *** NÃO É PARA RODAR SEM REVISÃO. *** Quem decide e executa é quem administra
-- o Oracle. Nada aqui altera tabela: GRANT dá permissão de LEITURA e CREATE
-- SYNONYM cria um apelido no schema do EDI. Nenhum INSERT, UPDATE, DELETE ou
-- DDL em tabela do Winthor — a regra do AGENTS.md continua inteira.
--
-- Resultado da sp1 em 18/11/2026, conectado como EDI: dez tabelas voltaram como
-- FALTA SINONIMO. São as que o DRE nunca precisou.
--
-- SÃO DOIS COMANDOS POR TABELA (o mesmo aviso da mb2):
--   GRANT          dá a PERMISSÃO de ler a tabela;
--   CREATE SYNONYM faz o nome `PCEST`, sem dono na frente, RESOLVER para ela.
-- A aplicação escreve `FROM PCEST` sem qualificar. Com grant e sem sinônimo dá
-- ORA-00942; com sinônimo e sem grant, ORA-00942 também.
--
-- O DONO É EPOCA, NAS DEZ — CONFIRMADO em 18/11/2026 pelo bloco 0, como EDI: as dez
-- deram ORA-01031 ("privilégios insuficientes"), e não ORA-00942. O 01031 é o Oracle
-- dizendo que EPOCA.<tabela> EXISTE e que falta a permissão; com o dono errado, o erro
-- seria o 00942. Ou seja: falta o GRANT (bloco 1) nas dez, e só o sinônimo não basta.
--
-- Situação: aguardando a aprovação do gestor para o bloco 1 (18/11/2026).
--
-- QUEM RODA O QUÊ:
--   bloco 1 — como o DONO das tabelas (EPOCA), ou um DBA;
--   bloco 2 — como EDI (sinônimo privado: só exige CREATE SYNONYM no EDI).
--
-- Depois: rodar a sp1 de novo como EDI. O bloco 2 dela tem de dizer "20 leem".
-- ============================================================================


-- ── 0. O EDI JÁ TEM A PERMISSÃO? — como EDI, ANTES de tudo ───────────────────
-- Lê cada tabela pelo NOME COMPLETO (EPOCA.PCEST), que não passa por sinônimo nenhum.
-- Se ler, o grant já existe e basta o bloco 2. Se der ORA-00942 aqui, ou falta o grant
-- (bloco 1) ou o dono não é EPOCA — e aí o sinônimo do bloco 2 apontaria para o lugar
-- errado. Nada é lido de fato: `WHERE 1 = 0`.
-- No SQL Developer, rode como script (F5) com a aba Dbms Output aberta.

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
  TYPE lista IS TABLE OF VARCHAR2(30);
  objetos lista := lista(
    'PCTRIBUTACAO', 'PCTRIBUTACAO_FILTRO_NCM', 'PCEST', 'PCFORNECFILIAL', 'PCCONSUM',
    'PCREGIAO', 'PCLINHAPROD', 'PCPRINCIPATIVO', 'PCEXPISCOFINSITEM', 'PCTABTRIBENT'
  );
  n   NUMBER;
  ok  PLS_INTEGER := 0;
  mal PLS_INTEGER := 0;
BEGIN
  DBMS_OUTPUT.PUT_LINE('Conectado como: ' || USER);
  FOR i IN 1 .. objetos.COUNT LOOP
    BEGIN
      EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM EPOCA.' || objetos(i) || ' WHERE 1 = 0' INTO n;
      ok := ok + 1;
      DBMS_OUTPUT.PUT_LINE(RPAD('EPOCA.' || objetos(i), 32) || 'lê — só falta o sinônimo');
    EXCEPTION
      WHEN OTHERS THEN
        mal := mal + 1;
        DBMS_OUTPUT.PUT_LINE(RPAD('EPOCA.' || objetos(i), 32) || SQLERRM);
    END;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE(ok || ' já têm permissão, ' || mal || ' não (de ' || objetos.COUNT || ').');
END;
/


-- ── 1. AS PERMISSÕES — como EPOCA (ou DBA) ──────────────────────────────────
-- SÓ para as tabelas que o bloco 0 acusou. As que já leem não precisam de nada aqui.

grant SELECT on "EPOCA"."PCTRIBUTACAO"            to "EDI";
grant SELECT on "EPOCA"."PCTRIBUTACAO_FILTRO_NCM" to "EDI";
grant SELECT on "EPOCA"."PCEST"                   to "EDI";
grant SELECT on "EPOCA"."PCFORNECFILIAL"          to "EDI";
grant SELECT on "EPOCA"."PCCONSUM"                to "EDI";
grant SELECT on "EPOCA"."PCREGIAO"                to "EDI";
grant SELECT on "EPOCA"."PCLINHAPROD"             to "EDI";
grant SELECT on "EPOCA"."PCPRINCIPATIVO"          to "EDI";
grant SELECT on "EPOCA"."PCEXPISCOFINSITEM"       to "EDI";
grant SELECT on "EPOCA"."PCTABTRIBENT"            to "EDI";


-- ── 2. OS SINÔNIMOS — como EDI ──────────────────────────────────────────────

create or replace synonym "PCTRIBUTACAO"            for "EPOCA"."PCTRIBUTACAO";
create or replace synonym "PCTRIBUTACAO_FILTRO_NCM" for "EPOCA"."PCTRIBUTACAO_FILTRO_NCM";
create or replace synonym "PCEST"                   for "EPOCA"."PCEST";
create or replace synonym "PCFORNECFILIAL"          for "EPOCA"."PCFORNECFILIAL";
create or replace synonym "PCCONSUM"                for "EPOCA"."PCCONSUM";
create or replace synonym "PCREGIAO"                for "EPOCA"."PCREGIAO";
create or replace synonym "PCLINHAPROD"             for "EPOCA"."PCLINHAPROD";
create or replace synonym "PCPRINCIPATIVO"          for "EPOCA"."PCPRINCIPATIVO";
create or replace synonym "PCEXPISCOFINSITEM"       for "EPOCA"."PCEXPISCOFINSITEM";
create or replace synonym "PCTABTRIBENT"            for "EPOCA"."PCTABTRIBENT";
