-- ============================================================================
-- OTIMIZACAO 2 - o NESTED LOOPS OUTER do PCMOVCOMPLE vale 67% da consulta
--
-- O plano (otim1) mostrou onde o custo mora, no bloco de vendas:
--
--   ate o HASH JOIN ................................. 26.494
--   TABLE ACCESS FULL PCNFSAID ......................  8.726
--   NESTED LOOPS OUTER com PCMOVCOMPLE .............. 94.736  <<<
--
-- O nested loop acrescenta ~68.000 sozinho: Oracle busca PCMOVCOMPLE linha a
-- linha, 34.179 vezes, para ler UMA coluna - mvc.vlfecp. Custo total da
-- consulta: 102K, sendo 92% no bloco de vendas.
--
-- O PCPRODUT, que eu suspeitava, custa 544 e e resolvido por juncao de
-- indices sem tocar a tabela. Nao e o gargalo.
--
-- ESTE SCRIPT NAO ALTERA NADA. Roda a consulta atual e uma variante com o
-- hint USE_HASH(MVC), e compara as duas em tempo e em numero.
--
-- Hint NAO muda resultado - so instrui o otimizador sobre COMO juntar. Mas a
-- regra do projeto e nao confiar nisso: as duas consultas devolvem as mesmas
-- 10 colunas, e voce compara linha a linha antes de qualquer mudanca no
-- codigo. Se um centavo divergir, a ideia morre aqui.
--
-- COMO RODAR: execute uma consulta de cada vez (Ctrl+Enter em cada uma) e
-- anote o tempo que o SQL Developer mostra. Rodar como script executaria as
-- duas de uma vez e o tempo ficaria confuso.
--
-- Cenario: filial 7, julho/2026 - o mesmo do plano e da apuracao de 78s.
-- ============================================================================

-- ======================= 1. CONSULTA ATUAL =================================

        SELECT MESANO                                              AS MESANO,
               Sum(NVL(VLCUSTOFIN,0))                              AS VLCUSTOFIN,
               Sum(NVL(VLTABELA,0))                                AS RECEITABRUTA,
               Sum(NVL(VLTABELA,0)) - Sum(NVL(VLVENDA,0))          AS ABATDESC,
               Sum(NVL(VLDEVOLUCAO,0))                             AS DEVOLUCAO,
               Sum(NVL(VLVENDA,0)) - Sum(NVL(VLDEVOLUCAO,0))       AS RECEITALIQUIDA,
               Sum(NVL(VLCUSTOFIN,0)) - Sum(NVL(VLCMVDEVOL,0))     AS CMVLIQ,
               sum(nvl(VLST,0))     - sum(nvl(VLST_DEV,0))         AS STLIQ,
               sum(nvl(VLPIS,0))    - sum(nvl(VLPIS_DEV,0))        AS PISLIQ,
               sum(nvl(VLCOFINS,0)) - sum(nvl(VLCOFINS_DEV,0))     AS COFINSLIQ
          FROM (
          SELECT TO_CHAR(NF.DTSAIDA,'mm/yyyy') AS MESANO, SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN, 
                 SUM(  MV.punit * MV.qt) as VLVENDA,  
                 SUM(  MV.punit * MV.qt) VLVENDA_Total,   
                 SUM(  MV.ptabela * MV.qt) as VLTABELA, 0 as VLDEVOLUCAO,  0 as VLDEVOLUCAO_total, 0 as VLCMVDEVOL, 
                 SUM(  (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt) VLST, 0 as VLST_DEV, 
                 SUM(  ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt  ) as VLPIS, 0 AS VLPIS_dev, 
                 SUM(  ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt ) as vlcofins, 0 AS vlcofins_dev 
           FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR,  
                (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp 
          WHERE NF.numtransvenda = MV.numtransvenda 
            AND mv.numtransitem  = mvc.numtransitem (+) 
            AND MV.CODPROD       = PR.CODPROD 
            AND NF.codcli        = esp.codcli (+) 
            AND NF.CODFILIAL     = esp.codfil (+) 
            AND MV.DTCANCEL      IS NULL 
            AND NF.DTCANCEL      IS NULL 
            AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,6108,6922,6102,6114,6115,6117,6119,6404,6910) 
            AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)  OR (NVL(NF.VLTOTAL,0) > 0) OR (NVL(NF.VLCUSTOFIN,0) > 0) ) 
            AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') ) 
            AND NF.DTSAIDA BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
            AND NF.CODFILIAL IN ('7')
           AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
            AND nvl(PR.codsec,0) <> 1601 
          GROUP BY TO_CHAR(NF.DTSAIDA,'mm/yyyy') 
         UNION ALL 
         SELECT TO_CHAR(NFE.DTENT,'mm/yyyy') AS MESANO, 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
                SUM( round( NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0) ,2)) as VLDEVOLUCAO, 
                SUM( round( NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0) ,2)) as VLDEVOLUCAO_total, 
                SUM( NVL(MV.QT,0) * (NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)-nvl(MV.st,0)-nvl(MVC.vlfecp,0))  ) VLCMVDEVOL, 
                0 as VLST,     SUM( (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt) as VLST_DEV, 
                0 AS VLPIS,    SUM( ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt ) AS VLPIS_dev, 
                0 AS vlcofins, SUM( ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt ) AS vlcofins_dev 
           FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED, PCPRODUT PR, 
                (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp 
          WHERE NFE.numnota       = MV.numnota      (+) 
            AND NFE.numtransent   = MV.numtransent  (+) 
            AND mv.numtransitem   = mvc.numtransitem (+) 
            AND NFE.codfornec     = esp.codcli      (+) 
            AND NFE.CODFILIAL     = esp.codfil      (+) 
            AND MV.numped         = PED.numped      (+) 
            AND MV.CODPROD        = PR.CODPROD 
            AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8') 
            AND NFE.CODFILIAL IN ('7')
            AND NFE.TIPODESCARGA IN ('6','7')
            AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
            AND NFE.DTENT BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
            AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
          AND MV.CODSEC <> 1601 
          GROUP BY TO_CHAR(NFE.DTENT,'mm/yyyy') 
            )
         GROUP BY MESANO
         ORDER BY SUBSTR(MESANO,4,4), SUBSTR(MESANO,1,2)

;

-- ======================= 2. COM O HINT USE_HASH(MVC) ========================

        SELECT MESANO                                              AS MESANO,
               Sum(NVL(VLCUSTOFIN,0))                              AS VLCUSTOFIN,
               Sum(NVL(VLTABELA,0))                                AS RECEITABRUTA,
               Sum(NVL(VLTABELA,0)) - Sum(NVL(VLVENDA,0))          AS ABATDESC,
               Sum(NVL(VLDEVOLUCAO,0))                             AS DEVOLUCAO,
               Sum(NVL(VLVENDA,0)) - Sum(NVL(VLDEVOLUCAO,0))       AS RECEITALIQUIDA,
               Sum(NVL(VLCUSTOFIN,0)) - Sum(NVL(VLCMVDEVOL,0))     AS CMVLIQ,
               sum(nvl(VLST,0))     - sum(nvl(VLST_DEV,0))         AS STLIQ,
               sum(nvl(VLPIS,0))    - sum(nvl(VLPIS_DEV,0))        AS PISLIQ,
               sum(nvl(VLCOFINS,0)) - sum(nvl(VLCOFINS_DEV,0))     AS COFINSLIQ
          FROM (
          SELECT /*+ USE_HASH(MVC) */ TO_CHAR(NF.DTSAIDA,'mm/yyyy') AS MESANO, SUM(  decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt) as VLCUSTOFIN, 
                 SUM(  MV.punit * MV.qt) as VLVENDA,  
                 SUM(  MV.punit * MV.qt) VLVENDA_Total,   
                 SUM(  MV.ptabela * MV.qt) as VLTABELA, 0 as VLDEVOLUCAO,  0 as VLDEVOLUCAO_total, 0 as VLCMVDEVOL, 
                 SUM(  (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt) VLST, 0 as VLST_DEV, 
                 SUM(  ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt  ) as VLPIS, 0 AS VLPIS_dev, 
                 SUM(  ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt ) as vlcofins, 0 AS vlcofins_dev 
           FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR,  
                (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp 
          WHERE NF.numtransvenda = MV.numtransvenda 
            AND mv.numtransitem  = mvc.numtransitem (+) 
            AND MV.CODPROD       = PR.CODPROD 
            AND NF.codcli        = esp.codcli (+) 
            AND NF.CODFILIAL     = esp.codfil (+) 
            AND MV.DTCANCEL      IS NULL 
            AND NF.DTCANCEL      IS NULL 
            AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,6108,6922,6102,6114,6115,6117,6119,6404,6910) 
            AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)  OR (NVL(NF.VLTOTAL,0) > 0) OR (NVL(NF.VLCUSTOFIN,0) > 0) ) 
            AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') ) 
            AND NF.DTSAIDA BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
            AND NF.CODFILIAL IN ('7')
           AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
            AND nvl(PR.codsec,0) <> 1601 
          GROUP BY TO_CHAR(NF.DTSAIDA,'mm/yyyy') 
         UNION ALL 
         SELECT TO_CHAR(NFE.DTENT,'mm/yyyy') AS MESANO, 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
                SUM( round( NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0) ,2)) as VLDEVOLUCAO, 
                SUM( round( NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0) ,2)) as VLDEVOLUCAO_total, 
                SUM( NVL(MV.QT,0) * (NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)-nvl(MV.st,0)-nvl(MVC.vlfecp,0))  ) VLCMVDEVOL, 
                0 as VLST,     SUM( (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt) as VLST_DEV, 
                0 AS VLPIS,    SUM( ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt ) AS VLPIS_dev, 
                0 AS vlcofins, SUM( ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt ) AS vlcofins_dev 
           FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED, PCPRODUT PR, 
                (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp 
          WHERE NFE.numnota       = MV.numnota      (+) 
            AND NFE.numtransent   = MV.numtransent  (+) 
            AND mv.numtransitem   = mvc.numtransitem (+) 
            AND NFE.codfornec     = esp.codcli      (+) 
            AND NFE.CODFILIAL     = esp.codfil      (+) 
            AND MV.numped         = PED.numped      (+) 
            AND MV.CODPROD        = PR.CODPROD 
            AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8') 
            AND NFE.CODFILIAL IN ('7')
            AND NFE.TIPODESCARGA IN ('6','7')
            AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
            AND NFE.DTENT BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
            AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
          AND MV.CODSEC <> 1601 
          GROUP BY TO_CHAR(NFE.DTENT,'mm/yyyy') 
            )
         GROUP BY MESANO
         ORDER BY SUBSTR(MESANO,4,4), SUBSTR(MESANO,1,2)

;

-- ============================================================================
-- RESULTADO - 31/08/2026: HINT REJEITADO
--
--   consulta atual .................  94,0 s
--   com USE_HASH(MVC) .............. 135,4 s   (+44%)
--
-- As dez colunas vieram identicas ate a ultima casa. O hint nao muda numero -
-- muda tempo, e para pior.
--
-- A LICAO: custo estimado nao e tempo. O plano dizia que o NESTED LOOPS OUTER
-- do PCMOVCOMPLE valia 68.000 dos 102.000. Forcar HASH JOIN piorou 44%.
-- O PCMOVCOMPLE e acessado por INDEX UNIQUE SCAN: 34 mil buscas pontuais numa
-- tabela cacheada custam pouco de verdade, enquanto construir a hash table
-- inteira custa muito. O otimizador acertou a escolha e errou a estimativa.
--
-- RUIDO DE MEDICAO: a consulta de faturamento sozinha levou 94s, mas a
-- apuracao INTEIRA - que a inclui, mais estrutura e despesas - levou 78s na
-- medicao de C. Custo Principal em caixa, mesma filial e mesmo mes. A parte
-- maior que o todo so pode ser variacao de carga do banco. Medicao de uma
-- passada so tem ruido grande; nao tirar conclusao fina de numero isolado.
-- ============================================================================
