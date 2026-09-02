-- dc10 — O que sobra quando se tira só o ST do LUCRO BRUTO
--
-- PERGUNTA (Gabriel, 02/09/2026): fazendo `LUCRO BRUTO − ST` com o ST que aparece na
-- tela, não fecha com o que a 9815 mostrava. Sobram alguns reais. De onde vêm?
--
-- HIPÓTESE, tirada da leitura do SQL original do duplo clique da 9815
-- (docs/dois_cliques/valor_receitas_liquidas/query.txt, linha 64) contra a consulta de
-- faturamento da apuração (DreGerencialQueries.cs, linha 890):
--
--   O ST não é o único item. São TRÊS, e só um deles é o ST.
--
--   1. RECEITA — a 9815 subtrai `st` de `punit`.                          [é o ST]
--   2. CMV, ramo `custofin = 0` — a 9815 usa `custofinest` puro:
--        detalhe   decode(custofin, 0, custofinest,             custofin - st)
--        apuração  decode(custofin, 0, custofinest - st - fecp, custofin - st - fecp)
--      No ramo zero ela esquece o ST **e** o FECP; no outro ramo esquece só o FECP.
--   3. DEVOLUÇÃO — as duas telas pegam conjuntos de notas diferentes (§4).
--
-- A ÁLGEBRA. Com
--   S  = Σ st·qt   e  F = Σ fecp·qt          (vendas)
--   S0 = Σ st·qt   apenas onde custofin = 0  (vendas)
--   Sd, Fd, DEV, Cd    = os mesmos sobre a devolução, critério da APURAÇÃO
--   DEV', Cd'          = devolução e CMV dela, critério da 9815
--   linha (-) ST do DRE = (S + F) − (Sd + Fd)          [DreGerencialQueries.cs:886]
--
--   LUCRO BRUTO nosso − LUCRO BRUTO da 9815
--        = linha (-) ST  +  S0  −  (DEV − Cd)  +  (DEV' − Cd')
--
-- Ou seja: TIRAR O ST DEIXA DOIS RESTOS, e o maior deles é o `S0` — o ST das linhas
-- em que `custofin` é zero, que a 9815 desconta na receita e esquece no custo.
--
-- PREVISÃO REGISTRADA ANTES DE RODAR (commitar este arquivo antes de executar):
--   a. S0 > 0 e S0 < S. Se S0 vier zero, a hipótese 2 morre e a sobra é só devolução.
--   b. A conta do bloco D fecha em ZERO, ou em centavos de arredondamento.
--   c. Se o bloco D não fechar, falta um quarto item — e aí o caminho é comparar
--      contagem de notas entre as duas telas, não valor (armadilha 1).
--
-- Cenário: o mesmo da dc1 — 01/08 a 31/08/2026, filiais 7/12/25.
-- TROCAR AS DATAS E AS FILIAIS NOS TRÊS BLOCOS se for conferir outro recorte.

-- ── A · vendas: o ST, o FECP, e o ST que mora no ramo custofin = 0 ──────────────
SELECT SUM(nvl(MV.st,0) * MV.qt)                                   AS S_ST_VENDAS,
       SUM(nvl(MVC.vlfecp,0) * MV.qt)                              AS F_FECP_VENDAS,
       SUM(CASE WHEN nvl(MV.custofin,0) = 0
                THEN nvl(MV.st,0) * MV.qt ELSE 0 END)              AS S0_ST_CUSTOFIN_ZERO,
       SUM(CASE WHEN nvl(MV.custofin,0) = 0
                THEN nvl(MVC.vlfecp,0) * MV.qt ELSE 0 END)         AS F0_FECP_CUSTOFIN_ZERO,
       COUNT(CASE WHEN nvl(MV.custofin,0) = 0 THEN 1 END)          AS ITENS_CUSTOFIN_ZERO,
       COUNT(*)                                                    AS ITENS
  FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR,
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

-- ── B · devolução pelo critério da APURAÇÃO (o nosso) ───────────────────────────
SELECT SUM(round(NVL(nvl(MV.QT,mv.QTCONT),0)
                * NVL(nvl(MV.punit,mv.punitcont),0), 2))           AS DEV_APURACAO,
       SUM(NVL(MV.QT,0) * (NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)
                           - nvl(MV.st,0) - nvl(MVC.vlfecp,0)))    AS CD_APURACAO,
       SUM(nvl(MV.st,0) * NVL(MV.QT,0))                            AS SD_ST_DEV,
       SUM(nvl(MVC.vlfecp,0) * NVL(MV.QT,0))                       AS FD_FECP_DEV,
       COUNT(DISTINCT NFE.numnota)                                 AS NOTAS
  FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED, PCPRODUT PR
 WHERE NFE.numnota     = MV.numnota      (+)
   AND NFE.numtransent = MV.numtransent  (+)
   AND mv.numtransitem = mvc.numtransitem (+)
   AND MV.numped       = PED.numped      (+)
   AND MV.CODPROD      = PR.CODPROD
   AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8')
   AND NFE.DTENT BETWEEN To_Date('01/08/2026','dd/mm/yyyy')
                     AND To_Date('31/08/2026','dd/mm/yyyy')
   AND NFE.CODFILIAL IN ('7','12','25')
   AND NFE.TIPODESCARGA IN ('6','7')
   AND MV.DTCANCEL IS NULL
   AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA')
   AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
   AND MV.CODSEC <> 1601;

-- ── C · devolução pelo critério da 9815 (mostra_dre, sem PCPEDC e sem PCPRODUT) ──
SELECT SUM(round(NVL(nvl(MV.QT,mv.QTCONT),0)
                * NVL(nvl(MV.punit,mv.punitcont),0), 2))           AS DEV_9815,
       SUM(NVL(MV.QT,0)
           * NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)) AS CD_9815,
       COUNT(DISTINCT NFE.numnota)                                 AS NOTAS
  FROM PCNFENT NFE, PCMOV MV,
       (SELECT clie.codcli, ce.codfil, ce.mostra_dre
          FROM cliente_especial ce, pcclient clie
         WHERE clie.codcliprinc = ce.codcli) esp
 WHERE NFE.numnota     = MV.numnota      (+)
   AND NFE.numtransent = MV.numtransent  (+)
   AND NFE.codfornec   = esp.codcli (+)
   AND NFE.CODFILIAL   = esp.codfil (+)
   AND NFE.CODFILIAL IN ('7','12','25')
   AND NFE.TIPODESCARGA IN ('6','7')
   AND MV.DTCANCEL IS NULL
   AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA')
   AND NFE.DTENT BETWEEN To_Date('01/08/2026','dd/mm/yyyy')
                     AND To_Date('31/08/2026','dd/mm/yyyy')
   AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
   AND MV.CODSEC <> 1601
   AND nvl(esp.mostra_dre,'S') = 'S';

-- ── D · a conferência, feita à mão com os três resultados acima ─────────────────
--
--   linha (-) ST do DRE   = (S + F) − (SD + FD)
--   sobra prevista        = S0 − (DEV_APURACAO − CD_APURACAO)
--                              + (DEV_9815     − CD_9815)
--
--   LUCRO BRUTO nosso − LUCRO BRUTO da 9815 − linha (-) ST − sobra prevista = 0
--
-- O `LUCRO BRUTO nosso` é o da nossa tela do DRE, e é também o da 9815 na tela do DRE:
-- a apuração das duas foi conferida em 2.952 células. Quem diverge é o DETALHAMENTO
-- da 9815 contra a linha da própria 9815 — a divergência nº 4.

-- ══ RESULTADO — rodado em 02/09/2026 ═══════════════════════════════════════════
--
-- A · vendas      S  = 3.560.292,861134   F  =  96.380,758831
--                 S0 =         0,00       itens com custofin = 0: ZERO, de 387.480
-- B · devolução   DEV  = 1.256.167,12     Cd  =   925.211,500076
--                 Sd   =    97.274,036368 Fd  =     3.076,703319   1.682 notas
-- C · devolução   DEV' = 1.370.523,10     Cd' = 1.100.308,336475   1.684 notas
--
-- PREVISÃO (a) REFUTADA. `S0` veio ZERO — não existe um único item com
-- `custofin = 0` no período. O ramo que a 9815 escreve errado nunca é executado, e a
-- hipótese do segundo desconto no custo morre aqui. Ela continua sendo um defeito
-- latente do SQL dela, mas não explica um centavo desta diferença.
--
-- PREVISÃO (b) CONFIRMADA, e por dois caminhos que não dependem um do outro:
--
--   linha (-) ST montada dos componentes   (S + F) − (Sd + Fd) = 3.556.322,880278
--   linha (-) ST exportada da 9815                               3.556.322,88
--
--   REC.LÍQUIDA nossa − a da 9815          S + (DEV' − DEV)    = 3.674.648,841134
--   diferença medida em 01/09/2026                               3.674.648,84
--
-- A SOBRA DO LUCRO BRUTO, além da linha (-) ST — e ela é INTEIRA da devolução:
--
--     + 114.355,98   devolução a mais na 9815 (2 notas fora do critério da apuração)
--     −  74.746,10   o CMV dessas mesmas notas
--     − 100.350,74   o ST + FECP das devoluções, que a 9815 não tira do CMV delas
--     ─────────────
--     −  60.740,86
--
--   LUCRO BRUTO nosso − LUCRO BRUTO do detalhamento da 9815 = 3.495.582,02
--
-- ACHADO NÃO PREVISTO: a explicação de 01/09 para a sobra de 3.969,98 na
-- RECEITA LÍQUIDA — "é o FECP" — está ERRADA. O FECP das vendas é 96.380,76.
-- Os 3.969,98 são `−F + Sd + Fd`, o ST e o FECP das devoluções menos o FECP das
-- vendas. O número estava certo, a atribuição não. Corrigido em DIVERGENCIAS.md.
