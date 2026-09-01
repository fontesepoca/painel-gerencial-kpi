-- dc2 — A tela "Receita por Cliente" corrigida fecha com a linha do DRE?
--
-- CONTEXTO. A tela de detalhamento da 9815 não soma o valor da linha clicada, porque
-- usa critérios diferentes dos da apuração (ver DIVERGENCIAS.md §4). Decisão do Gabriel
-- em 01/09/2026: corrigir, para o detalhamento fechar. Esta query é a versão corrigida,
-- só com os totais — a de verdade agrupa por cliente e devolve ~15 mil linhas.
--
-- O QUE MUDOU EM RELAÇÃO À 9815
--   1. venda:     ptabela * qt   e   punit * qt        (a 9815 subtrai ST dos dois)
--   2. devolução: passa a usar o recorte da apuração   (junção com PCPEDC exigindo
--                 CONDVENDA IN (1,3,5,6,8) e junção interna com PCPRODUT; sem o
--                 filtro mostra_dre que a 9815 aplica só aqui)
--   3. CMV:       passa a descontar ST e FECP como a apuração faz
--
-- Uma coisa que NÃO mudou: a 9815 monta um par de blocos UNION ALL por filial em vez
-- de um IN com todas. É geração de código do Delphi, não critério — o conjunto de
-- linhas é o mesmo, e aqui vai como IN.
--
-- CENÁRIO: o do print de 01/09/2026 — agosto/2026, filiais 7, 12 e 25.
--
-- PREVISÃO REGISTRADA ANTES DE RODAR. Cada valor tem que bater com a linha do DRE:
--
--   REC_BRUTA     55.753.802,35     (hoje o detalhamento dá 52.193.509,49)
--   DESCONTO       4.663.258,65     (hoje já bate — o ST se cancela na subtração)
--   DEVOLUCAO      1.256.167,12     (hoje o detalhamento dá 1.370.523,10)
--   REC_LIQUIDA   49.834.376,58     (hoje o detalhamento dá 46.159.727,74)
--   CUSTO_LIQ     37.039.545,89     (hoje o detalhamento dá 36.960.829,81)
--
-- Se algum não bater, a correção está incompleta e o caminho é comparar contagem de
-- notas antes de mexer em valor — a armadilha 2 de DIVERGENCIAS.md.

SELECT SUM(VLTABELA)                  AS REC_BRUTA,
       SUM(VLTABELA) - SUM(VLVENDA)   AS DESCONTO,
       SUM(VLDEVOLUCAO)               AS DEVOLUCAO,
       SUM(VLVENDA) - SUM(VLDEVOLUCAO) AS REC_LIQUIDA,
       SUM(VLCUSTOFIN) - SUM(VLCMVDEVOL) AS CUSTO_LIQ,
       COUNT(DISTINCT CODCLI)         AS CLIENTES
  FROM (
        -- ── VENDAS ────────────────────────────────────────────────────────────
        SELECT cli.codcli AS CODCLI,
               (decode(MV.custofin, 0,
                       MV.custofinest - nvl(MV.st,0) - nvl(MVC.vlfecp,0),
                       MV.custofin    - nvl(MV.st,0) - nvl(MVC.vlfecp,0)) * MV.qt) AS VLCUSTOFIN,
               (MV.punit   * MV.qt) AS VLVENDA,
               (MV.ptabela * MV.qt) AS VLTABELA,
               0 AS VLDEVOLUCAO,
               0 AS VLCMVDEVOL
          FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR, pcclient cli,
               (SELECT clie.codcli, ce.codfil, ce.mostra_dre
                  FROM cliente_especial ce, pcclient clie
                 WHERE clie.codcliprinc = ce.codcli) esp
         WHERE NF.numtransvenda = MV.numtransvenda
           AND mv.numtransitem  = mvc.numtransitem (+)
           AND MV.CODPROD       = PR.CODPROD
           AND NF.codcli        = esp.codcli (+)
           AND NF.CODFILIAL     = esp.codfil (+)
           AND NF.codcli        = cli.codcli
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
           AND nvl(PR.codsec,0) <> 1601

        UNION ALL

        -- ── DEVOLUÇÕES, com o recorte da apuração ─────────────────────────────
        SELECT cli.codcli AS CODCLI,
               0 AS VLCUSTOFIN,
               0 AS VLVENDA,
               0 AS VLTABELA,
               round( NVL(nvl(MV.QT, mv.QTCONT),0)
                    * NVL(nvl(MV.punit, mv.punitcont),0), 2) AS VLDEVOLUCAO,
               ( NVL(MV.QT,0)
               * ( NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)
                   - nvl(MV.st,0) - nvl(MVC.vlfecp,0) ) ) AS VLCMVDEVOL
          FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED, PCPRODUT PR,
               PCCLIENT CLI,
               (SELECT clie.codcli, ce.codfil, ce.mostra_dre
                  FROM cliente_especial ce, pcclient clie
                 WHERE clie.codcliprinc = ce.codcli) esp
         WHERE NFE.numnota     = MV.numnota      (+)
           AND NFE.numtransent = MV.numtransent  (+)
           AND mv.numtransitem = mvc.numtransitem (+)
           AND NFE.codfornec   = esp.codcli      (+)
           AND NFE.CODFILIAL   = esp.codfil      (+)
           AND MV.numped       = PED.numped      (+)
           AND MV.CODPROD      = PR.CODPROD
           AND NFE.codfornec   = cli.codcli
           AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8')
           AND NFE.CODFILIAL IN ('7','12','25')
           AND NFE.TIPODESCARGA IN ('6','7')
           AND MV.DTCANCEL IS NULL
           AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA')
           AND NFE.DTENT BETWEEN To_Date('01/08/2026','dd/mm/yyyy')
                             AND To_Date('31/08/2026','dd/mm/yyyy')
           AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
           AND MV.CODSEC <> 1601
       );
