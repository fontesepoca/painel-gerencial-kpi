-- ============================================================================
-- pr0 — a TAB_WEB_PREFERENCIA_TELA (preferências de tela por usuário)
--
-- Uma linha por (matrícula, tela), as preferências num JSON por seções. Regras e o porquê
-- de cada coluna: docs/plataforma/PREFERENCIAS.md.
--
-- É A PRIMEIRA TABELA EM QUE A APLICAÇÃO GRAVA — exceção à regra "o piloto é 100% leitura"
-- (SCHEMA_BANCO.md). O grant é SELECT, INSERT, UPDATE; sem DELETE ("restaurar padrão" grava
-- `null` na chave, e o JSON_MERGEPATCH a apaga).
--
-- ── SITUAÇÃO ─────────────────────────────────────────────────────────────────────
--
--   Época        criada pelo Gabriel em 25/11/2026. Conferida: colunas, PK, check IS JSON;
--                INSERT e UPDATE com JSON_MERGEPATCH(... RETURNING CLOB) pelo usuário da
--                aplicação, seguidos de ROLLBACK.
--                DONO: a confirmar —
--                  SELECT OWNER FROM ALL_TABLES WHERE TABLE_NAME = 'TAB_WEB_PREFERENCIA_TELA';
--   Minas Rural  NÃO criada. Quando for: blocos 1 a 3 abaixo, e
--                Bases:MinasRural:PreferenciasNoBanco = true no appsettings.json.
--
-- QUEM RODA O QUÊ (Minas Rural, como a mb3):
--   bloco 1 — como EPCTI (o dono);
--   bloco 2 — como EDI  (o usuário da aplicação);
--   bloco 3 — como EDI, para conferir.
-- ============================================================================


-- ── 1. A TABELA E A PERMISSÃO — como o dono ────────────────────────────────────

CREATE TABLE TAB_WEB_PREFERENCIA_TELA (
  MATRICULA     NUMBER        NOT NULL,
  TELA          VARCHAR2(60)  NOT NULL,
  PREFERENCIAS  CLOB          NOT NULL,
  DTCADASTRO    DATE DEFAULT SYSDATE NOT NULL,
  DTALTERACAO   DATE,

  CONSTRAINT PK_TAB_WEB_PREFERENCIA_TELA PRIMARY KEY (MATRICULA, TELA),
  CONSTRAINT CK_TAB_WEB_PREFERENCIA_JSON CHECK (PREFERENCIAS IS JSON)
);

COMMENT ON TABLE  TAB_WEB_PREFERENCIA_TELA              IS 'Preferencias de exibicao por usuario e tela do painel web';
COMMENT ON COLUMN TAB_WEB_PREFERENCIA_TELA.MATRICULA    IS 'PCEMPR.MATRICULA, vinda do token. Sem FK de proposito';
COMMENT ON COLUMN TAB_WEB_PREFERENCIA_TELA.TELA         IS 'Rota da tela, ex.: dre-gerencial';
COMMENT ON COLUMN TAB_WEB_PREFERENCIA_TELA.PREFERENCIAS IS 'JSON das opcoes. Opcao ausente assume o padrao da tela';

grant SELECT, INSERT, UPDATE on "EPCTI"."TAB_WEB_PREFERENCIA_TELA" to "EDI";


-- ── 2. O SINÔNIMO — como EDI ───────────────────────────────────────────────────
-- A consulta escreve `FROM TAB_WEB_PREFERENCIA_TELA` sem dono; sem o sinônimo, ORA-00942.

create synonym "TAB_WEB_PREFERENCIA_TELA" for "EPCTI"."TAB_WEB_PREFERENCIA_TELA";


-- ── 3. A CONFERÊNCIA — como EDI ────────────────────────────────────────────────
-- Termina em ROLLBACK: nada fica gravado.
--   ORA-00942 = falta o grant ou o sinônimo.   ORA-01031 = o grant saiu sem INSERT/UPDATE.
-- O SELECT tem de trazer as duas seções juntas:
--   {"exibicao":{"confirmados":true},"ordem":{"grupo-contas":["a","b"]}}

INSERT INTO TAB_WEB_PREFERENCIA_TELA (MATRICULA, TELA, PREFERENCIAS)
VALUES (0, 'teste', '{"exibicao":{"confirmados":true}}');

UPDATE TAB_WEB_PREFERENCIA_TELA
   SET PREFERENCIAS = JSON_MERGEPATCH(PREFERENCIAS, '{"ordem":{"grupo-contas":["a","b"]}}' RETURNING CLOB),
       DTALTERACAO  = SYSDATE
 WHERE MATRICULA = 0 AND TELA = 'teste';

SELECT PREFERENCIAS FROM TAB_WEB_PREFERENCIA_TELA WHERE MATRICULA = 0 AND TELA = 'teste';

ROLLBACK;
