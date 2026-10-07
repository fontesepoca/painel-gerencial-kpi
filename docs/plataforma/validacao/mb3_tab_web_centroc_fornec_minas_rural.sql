-- ============================================================================
-- mb3 — a TAB_WEB_CENTROC_FORNEC no Minas Rural
--
-- O filtro por fornecedor do DRE lê esta tabela (o vínculo centro de custo → fornecedor que
-- substitui o literal `codccprinc = 25 and 29 in (...)` da 9815). Ela existe na Época e NÃO
-- existia no Minas Rural: escolher fornecedor lá dava erro. Estrutura, regras e o porquê de
-- cada coluna estão em docs/rotinas/9815-dre-gerencial/FILTRO_FORNECEDOR.md e na dc73 —
-- este arquivo repete a estrutura SEM MUDAR NADA, para as duas bases lerem a mesma tabela.
--
-- ── A CARGA É VAZIA, DE PROPÓSITO ──────────────────────────────────────────────
--
-- Na Época a carga fiel é uma linha: `25 → 29`, porque lá o 29 É a P&G. No Minas Rural,
-- consultado em 07/10/2026:
--
--   centro 2501  P&G                         ← existe no cadastro
--   fornecedor 29  NUTRIFAR COMERCIAL LTDA.  ← NÃO é a P&G
--   nenhum fornecedor PROCTER / P&G / GILLETTE cadastrado
--   nenhum lançamento rateado no centro 25 de julho a setembro/2026
--
-- Copiar o `25 → 29` daria à Nutrifar a despesa da P&G — o defeito que o literal da 9815 tem
-- nesta base, e que hoje está adormecido só porque o centro 25 não tem movimento. Tabela
-- VAZIA é neutra (FILTRO_FORNECEDOR.md): nenhum centro é dedicado, nada some, e o centro 90
-- (VERBAS MARGEM) segue pelo fornecedor do próprio lançamento, sem precisar de linha aqui.
--
-- QUEM RODA O QUÊ:
--   bloco 1 — como EPCTI (dono da tabela, como da EPCPARDRE);
--   bloco 2 — como EDI  (o usuário da aplicação);
--   bloco 3 — como EDI, para conferir.
-- ============================================================================


-- ── 1. A TABELA, O TRIGGER E A PERMISSÃO — como EPCTI ──────────────────────────

CREATE TABLE TAB_WEB_CENTROC_FORNEC (
  CODCENTRO            VARCHAR2(10) NOT NULL,
  CODFORNEC            NUMBER       NOT NULL,
  OBSERVACAO           VARCHAR2(400),

  DTCADASTRO           DATE   DEFAULT SYSDATE NOT NULL,
  MATRICULACADASTRO    NUMBER                 NOT NULL,
  DTALTERACAO          DATE,
  MATRICULAALTERACAO   NUMBER,
  DTINATIVACAO         DATE,
  MATRICULAINATIVACAO  NUMBER,

  CONSTRAINT PK_TAB_WEB_CENTROC_FORNEC PRIMARY KEY (CODCENTRO, CODFORNEC),
  CONSTRAINT CK_TAB_WEB_CENTROC_NIVEL  CHECK (LENGTH(CODCENTRO) >= 2),
  CONSTRAINT CK_TAB_WEB_CENTROC_INAT   CHECK (
    (DTINATIVACAO IS     NULL AND MATRICULAINATIVACAO IS     NULL) OR
    (DTINATIVACAO IS NOT NULL AND MATRICULAINATIVACAO IS NOT NULL))
);

CREATE OR REPLACE TRIGGER TRG_TAB_WEB_CENTROC_FORNEC
  BEFORE UPDATE ON TAB_WEB_CENTROC_FORNEC
  FOR EACH ROW
BEGIN
  -- Quem altera tem de dizer quem é, NESTA instrução.
  IF NOT UPDATING('MATRICULAALTERACAO') OR :NEW.MATRICULAALTERACAO IS NULL THEN
    RAISE_APPLICATION_ERROR(-20001,
      'TAB_WEB_CENTROC_FORNEC: informe MATRICULAALTERACAO com a matricula de quem altera.');
  END IF;

  :NEW.DTALTERACAO := SYSDATE;

  -- Inativando: a data é do banco, a matrícula tem de vir desta instrução também.
  IF :OLD.DTINATIVACAO IS NULL AND :NEW.DTINATIVACAO IS NOT NULL THEN
    IF NOT UPDATING('MATRICULAINATIVACAO') OR :NEW.MATRICULAINATIVACAO IS NULL THEN
      RAISE_APPLICATION_ERROR(-20002,
        'TAB_WEB_CENTROC_FORNEC: informe MATRICULAINATIVACAO ao inativar o vinculo.');
    END IF;
    :NEW.DTINATIVACAO := SYSDATE;

  -- Reativando: limpa o par, para o CHECK continuar satisfeito.
  ELSIF :NEW.DTINATIVACAO IS NULL THEN
    :NEW.MATRICULAINATIVACAO := NULL;
  END IF;
END;
/

-- Só leitura: a aplicação hoje só CONSULTA o vínculo. INSERT/UPDATE entram quando a tela de
-- manutenção existir — e nunca DELETE (desligar é UPDATE; ver FILTRO_FORNECEDOR.md).
grant SELECT on "EPCTI"."TAB_WEB_CENTROC_FORNEC" to "EDI";


-- ── 2. O SINÔNIMO — como EDI ───────────────────────────────────────────────────
-- A consulta escreve `FROM TAB_WEB_CENTROC_FORNEC` sem dono; sem o sinônimo, ORA-00942.

create synonym "TAB_WEB_CENTROC_FORNEC" for "EPCTI"."TAB_WEB_CENTROC_FORNEC";


-- ── 3. A CONFERÊNCIA — como EDI ────────────────────────────────────────────────
-- Esperado: 0 linhas e nenhum erro. ORA-00942 aqui = falta o grant ou o sinônimo.

SELECT COUNT(*) AS VINCULOS FROM TAB_WEB_CENTROC_FORNEC;
