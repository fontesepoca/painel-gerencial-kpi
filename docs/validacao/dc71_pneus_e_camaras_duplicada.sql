-- dc71 — Por que PNEUS E CAMARAS aparece DUAS vezes, e o que isso quebra ao subi-la.
--
-- O ACHADO, em 25/09/2026
--   Na dimensão Conta Gerencial a conta 3000080 aparece duas vezes na tela, com o MESMO
--   valor (1.226.270,82 em julho/2026 na filial 7). A estrutura confirma: são duas linhas,
--   uma com ID 1389 e outra com ID NULO.
--
--   HOJE ISSO NÃO FAZ MAL: a conta é informativa, fica depois do LUCRO LIQUIDO com
--   AntesLL = 'N', e linha com AntesLL = 'N' não entra em totalizador nenhum. As duas linhas
--   somam zero vezes, então duas cópias de zero continuam zero.
--
--   AO SUBI-LA PARA O SUB-TOTAL o defeito acorda: as duas linhas passam a somar, e o
--   Sub-Total recebe 2.452.541,64 no lugar de 1.226.270,82. É por isso que esta consulta
--   precisa ser respondida ANTES da mudança, e não depois.
--
-- POR QUE O GROUP BY NÃO AS FUNDIU
--   A estrutura agrupa por (CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA,
--   RESPONSAVEL) com min(ID). Duas linhas da mesma conta deveriam virar uma, com ID 1389 --
--   o min ignora nulo. Como vieram duas, elas DIFEREM em algum desses campos, e é isso que
--   as consultas abaixo mostram.
--
--   A linha de ID nulo já é conhecida do projeto: é ela que obriga o ORDER BY ID NULLS LAST
--   (skill conferir-dre). O que ninguém tinha notado é que ela DUPLICA a conta na tela.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. As linhas cruas do EPCPARDRE para esta conta
-- ═══════════════════════════════════════════════════════════════════════════
-- Se vierem duas, o cadastro tem a conta repetida -- e aí a pergunta é se a de ID nulo é
-- lixo antigo que pode ser ignorada, ou se alguém a pôs ali de propósito.
SELECT ID,
       CODGRUCONTA,
       '[' || GRUPO || ']'  AS GRUPO_CRU,
       INFCONTAS,
       COR
  FROM EPCPARDRE
 WHERE CODGRUCONTA IN (3000067, 3000080)
 ORDER BY ID NULLS LAST;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Quantas linhas com ID nulo existem no cadastro inteiro
-- ═══════════════════════════════════════════════════════════════════════════
-- Se for só esta, a correção é pontual. Se forem várias, a duplicação vale para todas elas
-- e o problema é maior do que o pedido de hoje.
SELECT COUNT(*)                                   AS LINHAS_COM_ID_NULO,
       COUNT(DISTINCT CODGRUCONTA)                AS CONTAS_DISTINTAS,
       LISTAGG(CODGRUCONTA, ', ')
         WITHIN GROUP (ORDER BY CODGRUCONTA)      AS QUAIS
  FROM EPCPARDRE
 WHERE ID IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Toda conta que o EPCPARDRE repete -- com ID nulo ou não
-- ═══════════════════════════════════════════════════════════════════════════
-- A pergunta mais ampla: a 3000080 é a única duplicada? Toda conta listada aqui aparece
-- repetida na tela da Conta Gerencial, e toda uma delas que um dia suba para os totais
-- passa a contar em dobro.
SELECT CODGRUCONTA,
       COUNT(*)                                        AS VEZES,
       COUNT(ID)                                       AS COM_ID,
       SUM(CASE WHEN ID IS NULL THEN 1 ELSE 0 END)     AS SEM_ID,
       LISTAGG(NVL(TO_CHAR(ID),'nulo'), ', ')
         WITHIN GROUP (ORDER BY ID NULLS LAST)         AS IDS
  FROM EPCPARDRE
 WHERE CODGRUCONTA > 0
 GROUP BY CODGRUCONTA
HAVING COUNT(*) > 1
 ORDER BY VEZES DESC, CODGRUCONTA;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. O que a conta vale hoje, para conferir depois da mudança
-- ═══════════════════════════════════════════════════════════════════════════
-- O valor UMA vez. Depois de subir as duas contas, o Sub-Total tem de crescer exatamente
-- este total -- nem o dobro de PNEUS, nem nada a menos.
SELECT FIN.CODCONTA,
       CT.CONTA,
       SUM(NVL(FIN.VPAGO,0)) * -1   AS VALOR,
       COUNT(*)                     AS LANCAMENTOS
  FROM PCLANC FIN, PCCONTA CT
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.CODCONTA IN (3000067, 3000080)
   AND FIN.CODFILIAL = '7'
   AND FIN.DTPAGTO IS NOT NULL
   AND NVL(FIN.DTCOMPETENCIA, FIN.DTVENC)
       BETWEEN TO_DATE('01/07/2026','dd/mm/yyyy') AND TO_DATE('31/07/2026','dd/mm/yyyy')
 GROUP BY FIN.CODCONTA, CT.CONTA
 ORDER BY 1;
