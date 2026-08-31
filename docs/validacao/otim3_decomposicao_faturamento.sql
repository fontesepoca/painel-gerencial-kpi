-- ============================================================================
-- OTIMIZACAO 3 - onde o TEMPO se acumula no bloco de vendas
--
-- A otim2 ensinou que custo estimado nao e tempo: o plano apontou o
-- PCMOVCOMPLE, e forcar outro join piorou 44%. Entao aqui nao se estima nada -
-- mede-se, acrescentando uma tabela por vez.
--
-- Cinco passos, todos COUNT(*), sobre o bloco de VENDAS - que vale 92% da
-- consulta. Cada passo acrescenta UMA tabela e os filtros que vem com ela.
-- O salto de tempo entre dois passos e o custo real daquela tabela.
--
-- A contagem tambem informa: outer join nao deveria reduzir linha nenhuma, e
-- inner join pode. Se a contagem cair onde nao devia, ha algo a entender.
--
-- COMO RODAR - importa:
--   1. Uma consulta de cada vez, com Ctrl+Enter. Rodar tudo como script
--      misturaria os tempos.
--   2. Rode cada uma DUAS VEZES e anote o SEGUNDO tempo. A primeira paga o
--      cache; a segunda mede o trabalho. A otim2 mostrou que uma passada so
--      tem ruido grande - a consulta sozinha deu 94s enquanto a apuracao
--      inteira, que a contem, tinha dado 78s numa medicao anterior.
--   3. Me mande os cinco tempos e as cinco contagens.
--
-- Nao altera nada. So le, e le as mesmas tabelas que a apuracao ja le.
-- Cenario: filial 7, julho/2026.
-- ============================================================================


-- ============ PASSO 1 - so PCNFSAID ==========================================
-- As notas de saida do periodo, com os filtros que sao so delas.

SELECT COUNT(*) AS PASSO_1_SO_PCNFSAID
  FROM PCNFSAID NF
 WHERE NF.DTCANCEL IS NULL
   AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)
      OR (NVL(NF.VLTOTAL,0) > 0)  OR (NVL(NF.VLCUSTOFIN,0) > 0) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.DTSAIDA BETWEEN To_Date('01/07/2026','dd/mm/yyyy')
                      AND To_Date('31/07/2026','dd/mm/yyyy')
   AND NF.CODFILIAL IN ('7')
;

-- ============ PASSO 2 - + PCMOV ==============================================
-- Desce ao item. E aqui que o volume multiplica: cada nota vira N itens.

SELECT COUNT(*) AS PASSO_2_MAIS_PCMOV
  FROM PCNFSAID NF, PCMOV MV
 WHERE NF.numtransvenda = MV.numtransvenda
   AND MV.DTCANCEL IS NULL
   AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,
                        5922,6108,6922,6102,6114,6115,6117,6119,6404,6910)
   AND NF.DTCANCEL IS NULL
   AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)
      OR (NVL(NF.VLTOTAL,0) > 0)  OR (NVL(NF.VLCUSTOFIN,0) > 0) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.DTSAIDA BETWEEN To_Date('01/07/2026','dd/mm/yyyy')
                      AND To_Date('31/07/2026','dd/mm/yyyy')
   AND NF.CODFILIAL IN ('7')
;

-- ============ PASSO 3 - + PCMOVCOMPLE ========================================
-- O outer join que o plano acusou de valer 67% do custo. A contagem NAO pode
-- mudar em relacao ao passo 2 - se mudar, ha mais de uma linha por item.

SELECT COUNT(*) AS PASSO_3_MAIS_PCMOVCOMPLE
  FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC
 WHERE NF.numtransvenda = MV.numtransvenda
   AND mv.numtransitem  = mvc.numtransitem (+)
   AND MV.DTCANCEL IS NULL
   AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,
                        5922,6108,6922,6102,6114,6115,6117,6119,6404,6910)
   AND NF.DTCANCEL IS NULL
   AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)
      OR (NVL(NF.VLTOTAL,0) > 0)  OR (NVL(NF.VLCUSTOFIN,0) > 0) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.DTSAIDA BETWEEN To_Date('01/07/2026','dd/mm/yyyy')
                      AND To_Date('31/07/2026','dd/mm/yyyy')
   AND NF.CODFILIAL IN ('7')
;

-- ============ PASSO 4 - + PCPRODUT ===========================================
-- Junta interna, so para filtrar codsec. O plano disse que custa 544 - pouco.
-- A contagem PODE cair: item cujo produto nao existe em PCPRODUT sai aqui.

SELECT COUNT(*) AS PASSO_4_MAIS_PCPRODUT
  FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR
 WHERE NF.numtransvenda = MV.numtransvenda
   AND mv.numtransitem  = mvc.numtransitem (+)
   AND MV.CODPROD       = PR.CODPROD
   AND nvl(PR.codsec,0) <> 1601
   AND MV.DTCANCEL IS NULL
   AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,
                        5922,6108,6922,6102,6114,6115,6117,6119,6404,6910)
   AND NF.DTCANCEL IS NULL
   AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)
      OR (NVL(NF.VLTOTAL,0) > 0)  OR (NVL(NF.VLCUSTOFIN,0) > 0) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.DTSAIDA BETWEEN To_Date('01/07/2026','dd/mm/yyyy')
                      AND To_Date('31/07/2026','dd/mm/yyyy')
   AND NF.CODFILIAL IN ('7')
;

-- ============ PASSO 5 - + cliente especial ===================================
-- Fecha o conjunto de juntas do bloco de vendas. A contagem pode cair pelo
-- filtro mostra_dre.

SELECT COUNT(*) AS PASSO_5_COMPLETO
  FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR,
       (select clie.codcli, ce.codfil, ce.mostra_dre
          from cliente_especial ce, pcclient clie
         where clie.codcliprinc = ce.codcli) esp
 WHERE NF.numtransvenda = MV.numtransvenda
   AND mv.numtransitem  = mvc.numtransitem (+)
   AND MV.CODPROD       = PR.CODPROD
   AND NF.codcli        = esp.codcli (+)
   AND NF.CODFILIAL     = esp.codfil (+)
   AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) )
   AND nvl(PR.codsec,0) <> 1601
   AND MV.DTCANCEL IS NULL
   AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,
                        5922,6108,6922,6102,6114,6115,6117,6119,6404,6910)
   AND NF.DTCANCEL IS NULL
   AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)
      OR (NVL(NF.VLTOTAL,0) > 0)  OR (NVL(NF.VLCUSTOFIN,0) > 0) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.DTSAIDA BETWEEN To_Date('01/07/2026','dd/mm/yyyy')
                      AND To_Date('31/07/2026','dd/mm/yyyy')
   AND NF.CODFILIAL IN ('7')
;
