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


-- ───────────────────────────────────────────────────────────────────────────
-- 2b. Os cadastros que são a MESMA empresa — e por que isso não resolve o filtro
-- ───────────────────────────────────────────────────────────────────────────
SELECT F.CODFORNECPRINC,
       F.CODFORNEC,
       TRIM(F.FORNECEDOR)   AS FORNECEDOR,
       F.CGC,
       F.DTCADASTRO
  FROM PCFORNEC F
 WHERE F.CODFORNEC IN (29, 2453, 815)
 ORDER BY F.CODFORNEC;

-- RESULTADO — 01/10/2026:
--
--   CODFORNECPRINC  CODFORNEC  FORNECEDOR                        CGC
--         29            29     PROCTER & GAMBLE ... COMERCIAL    01358874000188
--         29           815     GILLETTE DO BRASIL                04490850000680
--         29          2453     PROCTER & GAMBLE ... COML         01358874001664
--
-- Três CNPJs distintos — o 2453 é outra filial do mesmo raiz do 29 (01358874), e a Gillette é
-- empresa separada —, e o Winthor JÁ SABE que as três são a mesma coisa. "A Gillette é P&G"
-- deixa de ser inferência sobre o mundo e passa a ser dado da empresa.
--
-- ⚠ E MESMO ASSIM O FILTRO NÃO VAI USAR O CODFORNECPRINC. Decisão do Gabriel em 01/10/2026.
--
--   Seria tentador: a seleção traduzida para o principal antes de comparar faria a carga cair
--   para quatro linhas e corrigiria os três defeitos conhecidos de uma vez, sem cadastrar nada.
--
--       -- O QUE **NÃO** VAMOS FAZER:
--       OR EXISTS (SELECT 1 FROM EPCKPI_CENTRO_FORNEC D, PCFORNEC FP
--                   WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%'
--                     AND FP.CODFORNEC IN (<seleção>)
--                     AND NVL(FP.CODFORNECPRINC, FP.CODFORNEC) = D.CODFORNEC)
--
--   Mas resolver pelo principal NÃO É FIEL À 9815: lá `29 in (815)` é falso e a equipe some;
--   pelo principal ela apareceria. A regra governante do projeto é a fidelidade numérica, e uma
--   correção automática — por mais correta que pareça — muda número sem que ninguém tenha
--   aprovado.
--
--   A tabela é PARÂMETRO À PARTE: cada vínculo entra porque alguém decidiu que ele entra. O
--   CODFORNECPRINC serve para DESCOBRIR quais linhas propor ao financeiro, nunca para
--   dispensá-las. Esta consulta é a ferramenta de descoberta, não a regra.


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
-- 5. AS LINHAS QUE FALTAM — nenhuma entra sem o financeiro
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ A REGRA É POR CÓDIGO DE FORNECEDOR, e um cadastro NÃO puxa o outro.
--
--   Filtrar 29 mostra o DRE do 29; filtrar 2453 mostra o do 2453. Que a EQUIPE P&G suma no
--   segundo NÃO É DEFEITO — é o recorte funcionando, porque aquele centro é do 29. São CNPJs
--   diferentes (01358874000188 e 01358874001664), empresas distintas na nota fiscal, e quem
--   apura uma não está pedindo a outra.
--
--   A primeira versão deste arquivo classificava isso como defeito a corrigir. Estava errado,
--   e é a razão de as linhas abaixo terem mudado de natureza: elas não CORRIGEM o filtro,
--   elas COMPLETAM a lista de centros dedicados que a 9815 nunca conheceu.
--
-- O QUE DE FATO FALTA: a 9815 trata UM centro. Os outros ficaram de fora não porque alguém
-- decidiu que não deviam entrar, mas porque cada um exigiria mais uma linha de Delphi.

-- -- TRANSPORTE T - P&G. Centro dedicado à P&G que hoje vai rateado junto com o transporte
-- -- geral. Confirmar com o negócio a quem ele pertence -- 29, 2453, os dois?
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('2806', 29, USER, 'TRANSPORTE T - P&G, aprovado por <quem> em <data>');

-- -- UNILEVER: dois centros dedicados, nenhum tratado pela 9815. Quatro cadastros de
-- -- fornecedor (11, 51, 89, 1044) -- e cada combinação que o negócio confirmar é uma linha.
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('24', 11, USER, 'VENDAS UNILEVER');
-- INSERT ... ('26', 11, ...);   -- centro 2601 UNILEVER
-- -- ... e as demais, se o negócio disser que os outros cadastros também usam esses centros.

-- -- CASO À PARTE, que só o negócio resolve: UM CENTRO ATENDER MAIS DE UM CADASTRO.
-- -- A equipe do centro 25 trabalha só para o 29, ou também para o 2453 e para a Gillette?
-- -- Se a resposta for "também", são estas linhas -- e aí sim é DIVERGÊNCIA, porque muda o
-- -- número que a 9815 mostra hoje. Escolha de negócio, não correção de defeito.
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('25', 2453, USER, 'DIVERGENCIA - a equipe 25 tambem atende o cadastro 2453');
-- INSERT INTO EPCKPI_CENTRO_FORNEC (CODCENTRO, CODFORNEC, USUARIO, OBSERVACAO)
-- VALUES ('25',  815, USER, 'DIVERGENCIA - a equipe 25 tambem atende a Gillette');
--
-- Só as linhas marcadas DIVERGENCIA mudam número conferido. Registrar em DIVERGENCIAS.md com
-- data e quem aprovou.


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
