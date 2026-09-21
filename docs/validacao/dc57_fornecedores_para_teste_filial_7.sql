-- dc57 — Que fornecedores usar para testar o filtro na filial 7.
--
-- ONDE ESTAMOS
--   A comparação de agosto/2026 na filial 27 (dc56) explicou quase tudo:
--     · fornecedor 29 = PROCTER & GAMBLE
--     · centro 90 = VERBAS MARGEM, com dono por lançamento — soma 100.000,00 no mês, dos
--       quais 19.220,00 são da P&G, e é esse valor que a tela filtrada mostra
--     · as demais despesas são RATEADAS pela participação (1,5255%), e o %AV fica idêntico
--     · FECH-RESULTADO some porque tem centro de custo NULO, e `NULL NOT IN (90)` não é
--       verdadeiro — defeito de SQL, não regra
--
--   FICOU SEM RESPOSTA o centro 25 (EQUIPE P&G). A condição no SQL da 9815 é
--
--       AND ( (codccprinc = 25 and 29 in (29)) or (codccprinc <> 25) )
--
--   e aquele `29 in (29)` é o fornecedor selecionado dentro da própria lista de selecionados:
--   SEMPRE VERDADEIRO. Pelo texto, o centro da equipe dedicada à P&G entraria inteiro para
--   QUALQUER fornecedor filtrado. Em agosto/2026 na filial 27 o centro 25 não teve movimento,
--   então o mês não prova nem desmente.
--
-- O QUE ESTE SCRIPT FAZ
--   Escolhe o terreno do próximo teste: um mês e um fornecedor em que as regras REALMENTE
--   sejam exercitadas, para a comparação valer alguma coisa.
--
-- Tudo aqui é SELECT.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Quando os centros 25 e 90 têm movimento na filial 7
-- ═══════════════════════════════════════════════════════════════════════════
-- Escolha o mês por aqui. O mês ideal tem os DOIS com movimento: o 90 exercita a verba por
-- fornecedor, o 25 exercita a regra que ainda não entendemos.
SELECT TO_CHAR(FIN.dtcompetencia,'mm/yyyy')  AS MES,
       SUBSTR(RC.CodigoCentroCusto,1,2)      AS CCPRINC,
       CASE SUBSTR(RC.CodigoCentroCusto,1,2)
            WHEN '25' THEN 'EQUIPE P&G'
            WHEN '90' THEN 'VERBAS MARGEM'
       END                                   AS NOME,
       COUNT(*)                              AS LANCAMENTOS,
       COUNT(DISTINCT FIN.CODFORNEC)         AS FORNECEDORES,
       SUM(NVL(RC.valor, FIN.VPAGO))         AS TOTAL
  FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.RECNUM   = RC.RECNUM
   AND FIN.CODCONTA = RC.CODCONTA
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('7')
   AND FIN.DTPAGTO IS NOT NULL
   AND SUBSTR(RC.CodigoCentroCusto,1,2) IN ('25','90')
   AND FIN.dtcompetencia >= ADD_MONTHS(TRUNC(SYSDATE,'MM'), -12)
 GROUP BY TO_CHAR(FIN.dtcompetencia,'mm/yyyy'), SUBSTR(RC.CodigoCentroCusto,1,2)
 ORDER BY 1, 2;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Quem recebe verba no centro 90, na filial 7
-- ═══════════════════════════════════════════════════════════════════════════
-- Estes são os candidatos naturais: filtrar por um deles faz a linha VERBAS MARGEM aparecer
-- com o valor exclusivo, que é o comportamento mais fácil de conferir.
--
-- AJUSTE O PERÍODO conforme o resultado da consulta 1.
SELECT FIN.CODFORNEC,
       (SELECT FORNECEDOR FROM PCFORNEC WHERE CODFORNEC = FIN.CODFORNEC) AS FORNECEDOR,
       COUNT(*)                      AS LANCAMENTOS,
       SUM(NVL(RC.valor, FIN.VPAGO)) AS VERBA
  FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.RECNUM   = RC.RECNUM
   AND FIN.CODCONTA = RC.CODCONTA
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('7')
   AND FIN.DTPAGTO IS NOT NULL
   AND SUBSTR(RC.CodigoCentroCusto,1,2) = '90'
   AND FIN.dtcompetencia BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy')
                             AND TO_DATE('31/08/2026','dd/mm/yyyy')
 GROUP BY FIN.CODFORNEC
 ORDER BY ABS(SUM(NVL(RC.valor, FIN.VPAGO))) DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Os fornecedores que mais pesam na RECEITA da filial 7
-- ═══════════════════════════════════════════════════════════════════════════
-- A participação sai daqui, e é ela que ratear as despesas. Um fornecedor com participação
-- ALTA é melhor para testar: com 1,5% os valores rateados ficam pequenos e o arredondamento
-- atrapalha a conferência; com 15% ou 30% a diferença salta.
--
-- O filtro é por `pr.codfornec` -- o fornecedor do PRODUTO, em PCPRODUT --, exatamente como a
-- 9815 faz. Não é o fornecedor da nota nem o cliente.
--
-- O hint de paralelismo é o mesmo que usamos na apuração (docs/PARALELISMO.md). Sem ele esta
-- consulta passa de um minuto.
SELECT /*+ PARALLEL(4) */
       PR.CODFORNEC,
       (SELECT FORNECEDOR FROM PCFORNEC WHERE CODFORNEC = PR.CODFORNEC) AS FORNECEDOR,
       COUNT(DISTINCT NF.NUMTRANSVENDA)                                 AS NOTAS,
       SUM(MV.punit * MV.qt)                                            AS RECEITA,
       ROUND(RATIO_TO_REPORT(SUM(MV.punit * MV.qt)) OVER () * 100, 3)   AS PARTICIPACAO_PCT
  FROM PCNFSAID NF, PCMOV MV, PCPRODUT PR
 WHERE NF.numtransvenda = MV.numtransvenda
   AND MV.CODPROD       = PR.CODPROD
   AND MV.DTCANCEL      IS NULL
   AND NF.DTCANCEL      IS NULL
   AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,
                        6108,6922,6102,6114,6115,6117,6119,6404,6910)
   AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)
      OR (NVL(NF.VLTOTAL,0) > 0) OR (NVL(NF.VLCUSTOFIN,0) > 0) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NVL(PR.codsec,0) <> 1601
   AND NF.CODFILIAL IN ('7')
   AND NF.DTSAIDA BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy')
                      AND TO_DATE('31/08/2026','dd/mm/yyyy')
 GROUP BY PR.CODFORNEC
 HAVING SUM(MV.punit * MV.qt) > 0
 ORDER BY 4 DESC
 FETCH FIRST 25 ROWS ONLY;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Contas SEM centro de custo na filial 7 — as candidatas a sumir
-- ═══════════════════════════════════════════════════════════════════════════
-- O caso FECH-RESULTADO. Toda conta que apareça aqui vai DESAPARECER quando houver filtro de
-- fornecedor, por causa do `NULL NOT IN (90)`.
--
-- Interessa saber se alguma delas fica ANTES do LUCRO LIQUIDO: na filial 27 o efeito era
-- inofensivo porque FECH-RESULTADO vem depois e não entra em totalizador. Se na filial 7
-- houver uma conta sem centro de custo dentro do bloco operacional, o defeito passa a mexer
-- em total, e aí é outra conversa.
SELECT CT.CODCONTA,
       CT.CONTA,
       COUNT(*)              AS LANCAMENTOS,
       SUM(NVL(FIN.VPAGO,0)) AS TOTAL,
       CASE WHEN CT.CODCONTA IN (
              SELECT codgruconta FROM EPCPARDRE
               WHERE codgruconta > 0
                 AND id < (SELECT ID FROM EPCPARDRE WHERE UPPER(grupo) LIKE 'LUCRO LIQUIDO'))
            THEN 'SIM -- ENTRA EM TOTALIZADOR'
            ELSE 'nao, fica no bloco informativo'
       END AS ANTES_DO_LUCRO_LIQUIDO
  FROM PCLANC FIN, PCCONTA CT
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('7')
   AND FIN.DTPAGTO IS NOT NULL
   AND FIN.dtcompetencia BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy')
                             AND TO_DATE('31/08/2026','dd/mm/yyyy')
   AND NOT EXISTS (SELECT 1 FROM PCRATEIOCENTROCUSTO RC
                    WHERE RC.RECNUM   = FIN.RECNUM
                      AND RC.CODCONTA = FIN.CODCONTA)
 GROUP BY CT.CODCONTA, CT.CONTA
 ORDER BY ABS(SUM(NVL(FIN.VPAGO,0))) DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE FAZER COM O RESULTADO
-- ═══════════════════════════════════════════════════════════════════════════
--   1. Pela consulta 1, escolha um MÊS em que o centro 25 tenha movimento na filial 7.
--   2. Pela 2 e pela 3, escolha DOIS fornecedores:
--        · um com verba no centro 90 E participação alta na receita  → o caso completo
--        · um SEM nenhuma relação com P&G, de preferência com participação alta
--          → é este que responde a pergunta do centro 25
--   3. Exporte da 9815, nesse mês e filial 7: uma vez SEM filtro e uma vez por fornecedor.
--
-- A pergunta que o teste responde: quando você filtra por um fornecedor que NÃO é a P&G, a
-- linha EQUIPE P&G aparece inteira, rateada, ou não aparece?
--
--   inteira   → o SQL manda, e a 9815 tem um defeito que atinge todo fornecedor
--   rateada   → o Delphi trata isso fora do SQL, e eu preciso ver como
--   ausente   → existe uma condição que o trace não mostra
--
-- Os três levam a implementações diferentes, e por isso não dá para adivinhar.
