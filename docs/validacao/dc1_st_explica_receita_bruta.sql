-- dc1 — A diferença de RECEITA BRUTA entre o DRE e o detalhamento é o ST?
--
-- OBSERVADO (print de 01/09/2026, C.Custo Principal, Caixa, ago/2026, filiais 7/12/25):
--   DRE          (+) RECEITA BRUTA  55.753.802,35
--   Detalhamento    REC.BRUTA       52.193.509,49   (soma das 15.444 linhas do xlsx)
--   Diferença                        3.560.292,86
--   DRE          (-) ST              3.556.322,88
--   Sobra                                3.969,98
--
-- HIPÓTESE: as duas telas somam a MESMA base de notas, e a única diferença é a
-- fórmula da coluna:
--   DRE            SUM(  MV.ptabela               * MV.qt )
--   Detalhamento   SUM( (MV.ptabela - nvl(st,0))  * MV.qt )
--
-- Se for isso, DIF_ESPERADA tem que dar exatamente 3.560.292,86 — e a sobra de
-- 3.969,98 tem que ser o FECP, que entra na linha (-) ST do DRE (que soma
-- st + vlfecp) mas NÃO é subtraído no detalhamento.
--
-- PREVISÃO REGISTRADA ANTES DE RODAR:
--   DIF_ESPERADA   = 3.560.292,86
--   ST_DO_DRE      = 3.556.322,88
--   FECP           = -3.969,98   (negativo; é o que fecha a conta)
--
-- Se DIF_ESPERADA não bater, a hipótese está errada e a diferença vem da base de
-- notas, não da fórmula — e aí o caminho é comparar contagem de notas, não valor.

SELECT SUM(nvl(MV.st, 0) * MV.qt)                          AS DIF_ESPERADA,
       SUM((nvl(MV.st, 0) + nvl(MVC.vlfecp, 0)) * MV.qt)   AS ST_DO_DRE,
       SUM(nvl(MVC.vlfecp, 0) * MV.qt)                     AS FECP,
       COUNT(*)                                            AS ITENS,
       COUNT(DISTINCT NF.numnota)                          AS NOTAS
  FROM PCNFSAID NF,
       PCMOV MV,
       PCMOVCOMPLE MVC,
       PCPRODUT PR,
       (SELECT clie.codcli, ce.codfil, ce.mostra_dre
          FROM cliente_especial ce, pcclient clie
         WHERE clie.codcliprinc = ce.codcli) esp
 WHERE NF.numtransvenda = MV.numtransvenda
   AND mv.numtransitem  = mvc.numtransitem (+)
   AND MV.CODPROD       = PR.CODPROD
   AND NF.codcli        = esp.codcli (+)
   AND NF.CODFILIAL     = esp.codfil (+)
   AND MV.DTCANCEL      IS NULL
   AND NF.DTCANCEL      IS NULL
   AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,
                        6108,6922,6102,6114,6115,6117,6119,6404,6910)
   AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)
      OR (NVL(NF.VLTOTAL,0) > 0)  OR (NVL(NF.VLCUSTOFIN,0) > 0) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.DTSAIDA BETWEEN To_Date('01/08/2026','dd/mm/yyyy')
                      AND To_Date('31/08/2026','dd/mm/yyyy')
   AND NF.CODFILIAL IN ('7','12','25')
   AND ( (nvl(esp.mostra_dre,'S') = 'S') OR (NF.CONDVENDA IN (5)) )
   AND nvl(PR.codsec,0) <> 1601;

-- ══ CORREÇÃO — 02/09/2026 ══════════════════════════════════════════════════════
--
-- A PREVISÃO DA LINHA 22 ESTÁ ERRADA. `FECP = -3.969,98` nunca poderia sair desta
-- consulta: a coluna FECP aqui é `Σ vlfecp·qt` das VENDAS, e a dc10 mediu esse valor
-- em **96.380,76**.
--
-- Os 3.969,98 são outra coisa — `Sd + Fd − F`, o ST e o FECP das DEVOLUÇÕES menos o
-- FECP das vendas. Três termos que quase se cancelam:
--
--     ST das devoluções     97.274,036368
--   + FECP das devoluções    3.076,703319
--   − FECP das vendas      -96.380,758831
--   ─────────────────────────────────────
--                            3.969,980856
--
-- DIF_ESPERADA e ST_DO_DRE continuam certas. O que falhou foi ler o resultado: o
-- número previsto bateu, o nome não, e ninguém conferiu qual dos dois esta coluna
-- media. Registrado em DIVERGENCIAS.md.
