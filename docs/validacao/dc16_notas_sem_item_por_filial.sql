-- ============================================================================
-- dc16 - o bloco novo mexe em algum numero que ja estava conferido?
--
-- A correcao de 10/09/2026 acrescentou um TERCEIRO bloco a FaturamentoPorMes:
-- soma o CABECALHO das notas que nao tem item em PCMOV. Isso conserta a filial
-- 28 (EPC-TRANSP), mas so pode entrar se NAO alterar os quatro cenarios que
-- fecham ao centavo com a 9815 - todos em filiais de distribuicao.
--
-- COMO RODAR: execute como SCRIPT (F5). Dois blocos.
--
-- LEITURA DO RESULTADO:
--   Bloco 1, cenario de referencia (7, 12, 25 em 01/08 a 27/08/2026):
--     ZERO linhas, ou soma 0,00  ->  a correcao e segura, nada validado muda.
--     Qualquer valor              ->  PARE. A receita bruta daqueles cenarios
--                                     vai mudar, e a conferencia precisa ser
--                                     refeita antes de isto ir para producao.
--   Bloco 2: onde mais existe nota sem item, entre as 9 filiais apuraveis.
-- ============================================================================

ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY';

-- ---------------------------------------------------------------------------
-- BLOCO 1 - O CENARIO DE REFERENCIA. E este que decide se a correcao entra.
-- ---------------------------------------------------------------------------
SELECT '1. cenario de referencia (7,12,25)' AS bloco,
       NF.CODFILIAL,
       COUNT(*)                                        AS notas_sem_item,
       SUM(NVL(NF.VLTABELA, NF.VLTOTGER))              AS receita_que_entraria,
       SUM(DECODE(NF.CONDVENDA, 8, NF.VLTOTAL, NF.VLTOTGER)) AS vlvenda_que_entraria,
       SUM(NVL(NF.VLCUSTOFIN,0))                       AS cmv_que_entraria
  FROM PCNFSAID NF,
       (SELECT clie.codcli, ce.codfil, ce.mostra_dre
          FROM cliente_especial ce, pcclient clie
         WHERE clie.codcliprinc = ce.codcli) esp
 WHERE NF.codcli    = esp.codcli (+)
   AND NF.CODFILIAL = esp.codfil (+)
   AND NF.DTCANCEL IS NULL
   AND ( (NF.CONDVENDA IN (1,5,8) OR (NF.ESPECIE = 'CO'))
         OR ((NF.CONDVENDA = 10)
             AND (SUBSTR(REPLACE(REPLACE(REPLACE(nf.cgc,'.',''),'/',''),'-',''),0,8)
               <> SUBSTR(REPLACE(REPLACE(REPLACE(nf.cgcfilial,'.',''),'/',''),'-',''),0,8))) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.CODFISCAL NOT IN (522,622,722,532,632,732,5206)
   AND NF.numtranscteanul IS NULL
   AND ( (NVL(esp.mostra_dre,'S') = 'S') OR (NF.CONDVENDA IN (5)) )
   AND NF.CODFILIAL IN ('7','12','25')
   AND NF.DTSAIDA BETWEEN TO_DATE('01/08/2026') AND TO_DATE('27/08/2026')
   AND NOT EXISTS (SELECT 1 FROM PCMOV MV
                    WHERE MV.numtransvenda = NF.numtransvenda
                      AND MV.DTCANCEL IS NULL)
 GROUP BY NF.CODFILIAL
 ORDER BY 4 DESC;

-- ---------------------------------------------------------------------------
-- BLOCO 2 - Onde mais isso acontece, nas 9 filiais que o filtro oferece.
-- Periodo largo de proposito: um mes inteiro recente, para nao depender de a
-- transportadora ter faturado nos ultimos dias.
-- ---------------------------------------------------------------------------
SELECT '2. todas as apuraveis, agosto/2026' AS bloco,
       NF.CODFILIAL,
       NF.ESPECIE,
       COUNT(*)                              AS notas_sem_item,
       SUM(NVL(NF.VLTABELA, NF.VLTOTGER))    AS receita_que_entraria
  FROM PCNFSAID NF,
       (SELECT clie.codcli, ce.codfil, ce.mostra_dre
          FROM cliente_especial ce, pcclient clie
         WHERE clie.codcliprinc = ce.codcli) esp
 WHERE NF.codcli    = esp.codcli (+)
   AND NF.CODFILIAL = esp.codfil (+)
   AND NF.DTCANCEL IS NULL
   AND ( (NF.CONDVENDA IN (1,5,8) OR (NF.ESPECIE = 'CO'))
         OR ((NF.CONDVENDA = 10)
             AND (SUBSTR(REPLACE(REPLACE(REPLACE(nf.cgc,'.',''),'/',''),'-',''),0,8)
               <> SUBSTR(REPLACE(REPLACE(REPLACE(nf.cgcfilial,'.',''),'/',''),'-',''),0,8))) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.CODFISCAL NOT IN (522,622,722,532,632,732,5206)
   AND NF.numtranscteanul IS NULL
   AND ( (NVL(esp.mostra_dre,'S') = 'S') OR (NF.CONDVENDA IN (5)) )
   AND NF.CODFILIAL IN ('1','7','12','22','24','25','27','28','34')
   AND NF.DTSAIDA BETWEEN TO_DATE('01/08/2026') AND TO_DATE('31/08/2026')
   AND NOT EXISTS (SELECT 1 FROM PCMOV MV
                    WHERE MV.numtransvenda = NF.numtransvenda
                      AND MV.DTCANCEL IS NULL)
 GROUP BY NF.CODFILIAL, NF.ESPECIE
 ORDER BY 5 DESC;
