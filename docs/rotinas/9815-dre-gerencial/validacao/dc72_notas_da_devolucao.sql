-- dc72 — As notas que compõem cada motivo de devolução.
--
-- PARA QUE SERVE
--   A tela de `(-) DEVOLUCAO` mostra uma coluna NOTAS com a quantidade de notas fiscais de
--   cada motivo. A tarefa de 28/09/2026 é deixar o usuário ver QUAIS notas são essas.
--
--   Estas consultas respondem as duas perguntas que travam a implementação, e as duas são
--   sobre FIDELIDADE: a tela nova precisa somar o mesmo valor e contar as mesmas notas que o
--   número clicado. Se divergir, a pessoa clica em "10 notas" e recebe 11 linhas.
--
-- DE ONDE VEM A CONSULTA
--   É a `DreDetalheQueries.DevolucaoPorMotivo`, com os mesmos joins e os mesmos oito filtros.
--   Copiar os filtros ao pé da letra é o que faz o total fechar -- a lição já registrada na
--   ImpostoPorProduto e em DIVERGENCIAS §4.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O nome do parceiro: de onde ele sai numa nota de ENTRADA
-- ═══════════════════════════════════════════════════════════════════════════
-- O docs/plataforma/SCHEMA_BANCO.md registra `CODFORNEC` na PCNFENT, mas numa devolução quem devolve é
-- o CLIENTE. Preciso saber se existe `CODCLI` preenchido, se o `CODFORNEC` aponta para o
-- cliente, ou se é outra coluna -- a tela mostra esse nome, e chutar daria uma coluna vazia.
--
-- Traz uma amostra pequena de devoluções reais do período da tela.
SELECT NFE.NUMNOTA,
       NFE.SERIE,
       NFE.DTENT,
       NFE.CODFORNEC,
       (SELECT FORNECEDOR FROM PCFORNEC WHERE CODFORNEC = NFE.CODFORNEC) AS NOME_EM_PCFORNEC,
       NFE.CODCLI,
       (SELECT CLIENTE FROM PCCLIENT WHERE CODCLI = NFE.CODCLI)          AS NOME_EM_PCCLIENT,
       NFE.CODDEVOL
  FROM PCNFENT NFE
 WHERE NFE.DTENT BETWEEN TO_DATE('01/09/2026','dd/mm/yyyy')
                     AND TO_DATE('27/09/2026','dd/mm/yyyy')
   AND NFE.CODFILIAL IN ('7')
   AND NFE.TIPODESCARGA IN ('6','7')
   AND NVL(NFE.OBS,'X') <> 'NF CANCELADA'
   AND ROWNUM <= 15;

-- Se a coluna CODCLI não existir, o Oracle recusa a consulta inteira com ORA-00904. Nesse
-- caso rode só esta, que lista as colunas da tabela e responde de uma vez:
--
--   SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
--    WHERE TABLE_NAME = 'PCNFENT'
--      AND (COLUMN_NAME LIKE '%CLI%' OR COLUMN_NAME LIKE '%FORNEC%' OR COLUMN_NAME LIKE '%RCA%'
--           OR COLUMN_NAME LIKE '%USUR%')
--    ORDER BY COLUMN_NAME;
--
-- ATENÇÃO: ALL_TAB_COLUMNS já voltou VAZIO três vezes neste projeto por falta de privilégio,
-- e isso NÃO significa que a tabela não existe. Se vier vazia, a consulta 1 sem a parte do
-- CODCLI ainda responde metade da pergunta.

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Agrupar por nota reproduz a coluna NOTAS?
-- ═══════════════════════════════════════════════════════════════════════════
-- A tela conta `COUNT(DISTINCT NFE.numnota)`. A tela nova vai listar uma linha por nota --
-- mas por qual chave? Se a MESMA numeração aparecer em séries diferentes, ou em duas
-- entradas distintas (`NUMTRANSENT`), agrupar por NUMNOTA dá menos linhas do que agrupar
-- pela chave real, e a contagem deixa de bater com o número que a pessoa clicou.
--
-- A consulta compara as três contagens por motivo. O que eu espero é que as três sejam
-- iguais; onde não forem, a coluna DIVERGE aponta o motivo a investigar.
SELECT MOTIVO.CODDEVOL                          AS CODMOTIVO,
       motivo.motivo                            AS MOTIVO,
       COUNT(DISTINCT NFE.NUMNOTA)              AS POR_NUMNOTA,
       COUNT(DISTINCT NFE.NUMTRANSENT)          AS POR_NUMTRANSENT,
       COUNT(DISTINCT NFE.NUMNOTA || '/' || NFE.SERIE) AS POR_NOTA_E_SERIE,
       CASE WHEN COUNT(DISTINCT NFE.NUMNOTA) = COUNT(DISTINCT NFE.NUMTRANSENT)
             AND COUNT(DISTINCT NFE.NUMNOTA) = COUNT(DISTINCT NFE.NUMNOTA || '/' || NFE.SERIE)
            THEN 'iguais' ELSE '*** DIVERGE ***' END AS CONFERE,
       SUM( round( NVL(nvl(MV.QT, mv.QTCONT),0)
                 * NVL(nvl(MV.punit, mv.punitcont),0), 2) ) AS VLDEVOLUCAO
  FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED,
       PCPRODUT PR, PCTABDEV MOTIVO
 WHERE NFE.numnota     = MV.numnota      (+)
   AND NFE.numtransent = MV.numtransent  (+)
   AND mv.numtransitem = mvc.numtransitem (+)
   AND MV.numped       = PED.numped      (+)
   AND MV.CODPROD      = PR.CODPROD
   AND NFE.CODDEVOL    = MOTIVO.CODDEVOL (+)
   AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8')
   AND NFE.DTENT BETWEEN TO_DATE('01/09/2026','dd/mm/yyyy')
                     AND TO_DATE('27/09/2026','dd/mm/yyyy')
   AND NFE.CODFILIAL IN ('7')
   AND NFE.TIPODESCARGA IN ('6','7')
   AND MV.DTCANCEL IS NULL
   AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA')
   AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
   AND MV.CODSEC <> 1601
 GROUP BY MOTIVO.CODDEVOL, motivo.motivo
 ORDER BY VLDEVOLUCAO DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A tela nova, para um motivo — o gabarito
-- ═══════════════════════════════════════════════════════════════════════════
-- É exatamente o que a tela vai mostrar ao clicar em `120 ERRO SISTEMA`, que no print de
-- 28/09/2026 tem 10 notas e R$ 166.285,71.
--
-- CONFERIR: a soma da coluna VLDEVOLUCAO tem de dar 166.285,71 e a contagem de linhas tem de
-- dar 10. Se der, a implementação pode copiar esta consulta sem medo.
SELECT NFE.NUMNOTA,
       NFE.SERIE,
       NFE.DTENT,
       NFE.NUMTRANSENT,
       SUM( round( NVL(nvl(MV.QT, mv.QTCONT),0)
                 * NVL(nvl(MV.punit, mv.punitcont),0), 2) ) AS VLDEVOLUCAO,
       COUNT(*) AS ITENS
  FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED,
       PCPRODUT PR, PCTABDEV MOTIVO
 WHERE NFE.numnota     = MV.numnota      (+)
   AND NFE.numtransent = MV.numtransent  (+)
   AND mv.numtransitem = mvc.numtransitem (+)
   AND MV.numped       = PED.numped      (+)
   AND MV.CODPROD      = PR.CODPROD
   AND NFE.CODDEVOL    = MOTIVO.CODDEVOL (+)
   AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8')
   AND NFE.DTENT BETWEEN TO_DATE('01/09/2026','dd/mm/yyyy')
                     AND TO_DATE('27/09/2026','dd/mm/yyyy')
   AND NFE.CODFILIAL IN ('7')
   AND NFE.TIPODESCARGA IN ('6','7')
   AND MV.DTCANCEL IS NULL
   AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA')
   AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
   AND MV.CODSEC <> 1601
   AND MOTIVO.CODDEVOL = 120
 GROUP BY NFE.NUMNOTA, NFE.SERIE, NFE.DTENT, NFE.NUMTRANSENT
 ORDER BY VLDEVOLUCAO DESC;
