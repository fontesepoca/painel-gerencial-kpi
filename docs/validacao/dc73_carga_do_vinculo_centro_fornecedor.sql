-- dc73 — A carga da tabela de vínculo centro de custo → fornecedor.
--
-- A dc59 provou que o vínculo "o centro 25 atende o fornecedor 29" NÃO existe no cadastro do
-- Winthor. Esta consulta levanta o que precisa estar na tabela que vai substituí-lo, e traz o
-- resultado real de 01/10/2026 para que a carga não dependa de rodar nada de novo.
--
-- Pré-requisito de leitura: docs/FILTRO_FORNECEDOR.md, seção "A tabela de vínculo".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE FICOU PROVADO — 01/10/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. O `LIKE` POR PREFIXO É EXATAMENTE O `SUBSTR(cod,1,2)` DA 9815.
--
--    Os códigos são `2501` na raiz e `2501.001` nas folhas — quatro dígitos, com ponto só no
--    nível de baixo. Nenhum centro fora do principal 25 começa com "25", então
--
--        SUBSTR(codigocentrocusto,1,2) = '25'   ⟺   codigocentrocusto LIKE '25%'
--
--    É o que permite a tabela ter UMA coluna de centro servindo aos dois níveis.
--
-- 2. A GRANULARIDADE MISTA É NECESSÁRIA, e o cadastro mostra por quê:
--
--      2501  EQUIPE P&G           → o principal `25` serve: ele só tem este centro
--      2401  VENDAS UNILEVER      → o principal `24` serve: idem
--      2601  UNILEVER             → o principal `26` serve: idem
--      2806  TRANSPORTE T - P&G   → o principal `28` NÃO serve: tem 20 centros de transporte
--
--    Ou seja, o `25` da 9815 não é uma escolha de nível — ali o principal É a equipe P&G. O
--    2806 é o único caso que exige descer, e com o `LIKE` isso sai de graça.
--
-- 3. A GILLETTE É P&G, e tem mais verba que o segundo cadastro da própria P&G. Foi por ela
--    que a dc58 descobriu o hardcode: filtrando por 815 a EQUIPE P&G desaparece. Pela regra
--    da 9815 isso está certo; pelo organograma do fornecedor, é discutível. Decisão do
--    financeiro, não nossa.
--
-- 4. A UNILEVER TEM QUATRO CADASTROS e dois centros — oito linhas em pares diretos, e um
--    quinto cadastro amanhã exige lembrar de inserir duas. É o caso que mais pesa contra o
--    modelo escolhido, e está registrado para quando alguém reabrir a discussão.


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Os centros de custo, com nível e principal
-- ───────────────────────────────────────────────────────────────────────────
-- Serve para dois fins: conferir o FORMATO dos códigos (é o que valida o `LIKE`) e achar os
-- centros cuja descrição é nome de marca.
SELECT cc.codigocentrocusto                        AS CODIGO,
       SUBSTR(cc.codigocentrocusto, 1, 2)          AS PRINCIPAL,
       TRIM(cc.descricao)                          AS DESCRICAO,
       CASE WHEN cc.codigocentrocusto LIKE '%.%'
            THEN 'FOLHA' ELSE 'RAIZ' END           AS NIVEL
  FROM PCCENTROCUSTO cc
 ORDER BY SUBSTR(cc.codigocentrocusto, 1, 2), cc.codigocentrocusto;

-- RESULTADO — 01/10/2026, os centros com nome de marca (o resto é área da empresa):
--
--   2401  (24)  VENDAS UNILEVER                    RAIZ   + 1 folha
--   2501  (25)  EQUIPE P&G                         RAIZ   + 27 folhas
--   2601  (26)  UNILEVER                           RAIZ   + 1 folha
--   2806  (28)  TRANSPORTE T - P&G                 RAIZ   + 20 folhas
--   9001  (90)  VERBAS MARGEM                      RAIZ          ← outro mecanismo, ver abaixo
--
-- NÃO ENTRAM na tabela, embora pareçam: 2701 EQUIPE PASTA MISTA/ATACADO, 2807 TRANSPORTE T -
-- PASTA MISTA, 2825 TRANSPORTE T - VENDAS VIVALOG, 2834 TRANSPORTE T - POTENCIAL F34, 2319
-- DISTRIBUIÇÃO VIVALOG. Pasta mista é um sortimento, não um fornecedor; VIVALOG, ALFALOG e
-- POTENCIAL são empresas do grupo. Nenhum deles tem fornecedor a quem pertencer.
--
-- O CENTRO 90 TAMBÉM NÃO ENTRA, e esse é o erro mais fácil de cometer aqui: ele não tem
-- vínculo fixo com fornecedor nenhum. A 9815 o resolve pelo `FIN.CODFORNEC` do PRÓPRIO
-- lançamento (`codccprinc IN (90) AND FIN.CODFORNEC IN (<seleção>)`), que é outro mecanismo.
-- Cadastrá-lo quebraria a regra em vez de configurá-la.


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Os fornecedores com verba no centro 90
-- ───────────────────────────────────────────────────────────────────────────
-- São os que têm relação estruturada com a empresa, e portanto os candidatos naturais a ter
-- centro de custo dedicado. É também onde os cadastros DUPLICADOS aparecem lado a lado.
SELECT FIN.CODFORNEC,
       MAX(TRIM(F.FORNECEDOR))       AS FORNECEDOR,
       COUNT(*)                      AS QDE_LANC,
       SUM(NVL(FIN.VPAGO, 0))        AS TOTAL
  FROM PCLANC FIN, PCFORNEC F, PCRATEIOCENTROCUSTO RC
 WHERE FIN.RECNUM     = RC.RECNUM    (+)
   AND FIN.CODFORNEC  = F.CODFORNEC  (+)
   AND FIN.CODFORNEC IS NOT NULL
   AND SUBSTR(NVL(RC.CODIGOCENTROCUSTO, '0'), 1, 2) = '90'
   AND FIN.DTPAGTO BETWEEN TO_DATE('01/01/2026','dd/mm/yyyy')
                       AND TO_DATE('30/09/2026','dd/mm/yyyy')
 GROUP BY FIN.CODFORNEC
 ORDER BY 4 DESC;

-- RESULTADO — 01/10/2026, os sete que interessam (de 178 fornecedores no período):
--
--      29   PROCTER & GAMBLE INDUSTRIAL E COMERCIAL LTDA    2.466.610,41   ← o do hardcode
--     815   GILLETTE DO BRASIL LTDA                         2.265.040,81   ← subsidiária da P&G
--    2453   PROCTER & GAMBLE INDUSTRIAL E COML LTDA         1.868.982,34   ← 2º cadastro da P&G
--    1044   UNILEVER BRASIL LTDA HC                            10.136,68
--      51   UNILEVER BRASIL LTDA FR                             4.517,31
--      89   UNILEVER FOODS SOLUTIONS                            3.211,70
--      11   UNILEVER BRASIL LTDA                                2.787,70
--
-- A COLGATE (1, R$ 838 mil) tem verba e NÃO tem centro dedicado — é o controle que mostra que
-- verba no 90 não implica centro próprio. Foi um dos dois fornecedores da dc58.


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A TABELA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `CODCENTRO` é VARCHAR2 e guarda o código como ele é cadastrado: `25` quando o principal
-- inteiro pertence à marca, `2806` quando só um centro pertence. Quem compara é o `LIKE`
-- (ver a seção 1), e a granularidade passa a ser escolha de quem cadastra, linha a linha.
--
-- O CHECK existe porque `CODCENTRO` com UM caractere casaria dez principais de uma vez — um
-- `2` traria todo o 20, 21, 22, 23... A regra é barata e o estrago seria silencioso.
--
-- `OBSERVACAO` não é enfeite: é onde fica escrito se a linha é fiel à 9815 ou divergência
-- aprovada, e por quem. Sem ela a tabela vira um conjunto de números sem procedência, que é
-- exatamente o problema que ela nasceu para resolver.

CREATE TABLE EPCKPI_CENTRO_FORNEC (
  CODCENTRO   VARCHAR2(10) NOT NULL,
  CODFORNEC   NUMBER       NOT NULL,
  DTCADASTRO  DATE         DEFAULT SYSDATE NOT NULL,
  USUARIO     VARCHAR2(60),
  OBSERVACAO  VARCHAR2(400),
  CONSTRAINT PK_EPCKPI_CENTRO_FORNEC PRIMARY KEY (CODCENTRO, CODFORNEC),
  CONSTRAINT CK_EPCKPI_CENTRO_NIVEL  CHECK (LENGTH(CODCENTRO) >= 2)
);

-- O prefixo `EPCKPI_` é PROPOSTA, não decisão: `EPCPARDRE` é da Época e legado, e o CLAUDE.md
-- pede prefixo próprio para as tabelas novas nossas. Cravar antes da primeira migration.


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. A CARGA FIEL — reproduz a 9815 ao centavo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- UMA LINHA. É todo o vínculo que existe no código da 9815 (UBase.pas:27217), e com ela a
-- tabela não muda número nenhum: o DRE sai idêntico ao de hoje, inclusive no defeito dos dois
-- cadastros da P&G. É o que permite subir a estrutura NO MEIO da homologação sem ruído.

INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
VALUES ('25', 29, USER,
        'Fiel a 9815 - UBase.pas:27217, literal escrito a mao. Centro 2501 EQUIPE P&G');

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. AS LINHAS QUE SÃO DIVERGÊNCIA — nenhuma delas entra sem o financeiro
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cada uma corrige uma inconsistência REAL da 9815, e cada uma faz a web mostrar número
-- diferente da rotina Delphi para a mesma apuração. As duas rodam em paralelo: isso tem de
-- ser combinado ANTES da linha existir, não descoberto pelo setor depois.
--
-- Registrar em DIVERGENCIAS.md, uma seção por grupo, com data e quem aprovou.

-- -- O 2º cadastro da P&G. Hoje, filtrar só por ele faz `29 in (2453)` ser falso e a EQUIPE
-- -- P&G desaparecer do DRE DA PRÓPRIA P&G.
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('25', 2453, USER, 'DIVERGENCIA - 2o cadastro da P&G, aprovado por <quem> em <data>');

-- -- O transporte dedicado da P&G, que a 9815 rateia junto com o transporte geral.
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('2806',   29, USER, 'DIVERGENCIA - TRANSPORTE T - P&G');
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('2806', 2453, USER, 'DIVERGENCIA - TRANSPORTE T - P&G');

-- -- A GILLETTE. Subsidiária da P&G, R$ 2,27 mi de verba no centro 90. CONFIRMAR: é a linha
-- -- de maior impacto, e a única cuja resposta não está no cadastro nem no código.
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('25',   815, USER, 'DIVERGENCIA - Gillette e subsidiaria da P&G');
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('2806', 815, USER, 'DIVERGENCIA - Gillette e subsidiaria da P&G');

-- -- A UNILEVER: dois centros x quatro cadastros. A 9815 não trata nenhum dos dois centros,
-- -- então filtrar por Unilever hoje não traz os centros dela.
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('24',   11, USER, 'DIVERGENCIA - VENDAS UNILEVER');
-- INSERT ... ('24',   51, ...);   -- UNILEVER BRASIL LTDA FR
-- INSERT ... ('24',   89, ...);   -- UNILEVER FOODS SOLUTIONS
-- INSERT ... ('24', 1044, ...);   -- UNILEVER BRASIL LTDA HC
-- INSERT ... ('26',   11, ...);   -- os mesmos quatro no centro 2601 UNILEVER
-- INSERT ... ('26',   51, ...);
-- INSERT ... ('26',   89, ...);
-- INSERT ... ('26', 1044, ...);


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. COMO A TABELA ENTRA NA CONSULTA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Substitui o par de condições do centro 25 nos DOIS lugares em que ele aparece — o `CASE`
-- do `VPAGO_EXCLUSIVO_FORNEC` e o `WHERE`. O par do centro 90 NÃO muda.
--
--     AND ( NOT EXISTS (SELECT 1 FROM EPCKPI_CENTRO_FORNEC D
--                        WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%')
--           OR EXISTS (SELECT 1 FROM EPCKPI_CENTRO_FORNEC D
--                       WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%'
--                         AND D.CODFORNEC IN (<seleção>)) )
--
-- O primeiro ramo diz "este centro não é dedicado a ninguém, passa". O segundo, "é dedicado,
-- e a seleção contém alguém da marca dele".
--
-- TABELA VAZIA é neutra: nenhum centro é dedicado, nada some. Com a linha do `25`, é a 9815.
--
-- ⚠ LANÇAMENTO SEM CENTRO DE CUSTO — o ponto a CONFERIR, não a assumir.
--   Na 9815, `codccprinc` nulo faz as duas condições virarem nulas e a linha é excluída (é o
--   que o FILTRO_FORNECEDOR.md registra como "contas sem centro de custo somem"). Aqui,
--   `NULL LIKE '25%'` é nulo, nenhuma linha casa, o `NOT EXISTS` é verdadeiro e o lançamento
--   PASSA. O resultado final não deve mudar, porque o par do centro 90 continua como está e
--   já elimina esses lançamentos antes — mas isso precisa ser medido, não deduzido. Em
--   agosto/2026 os afetados eram FECH-RESULTADO, FECH. VB APLICAR e DESPESAS SOCIOS.
--
-- ⚠ QUALQUER LINHA ALÉM DA PRIMEIRA QUEBRA A dc58. As 21 asserções foram escritas contra o
--   comportamento atual: com 2453 ou 815 cadastrados, a EQUIPE P&G passa a aparecer onde hoje
--   ela some, e o script acusa. Isso é o teste funcionando — mas ele precisa aprender a
--   diferença entre "fiel" e "divergência aprovada" no mesmo movimento.
