-- dc27 — a devolução que só a nossa apuração soma
--
-- Contexto: 2025 inteiro, competência, C.Custo Principal, filial 7 (EPC-MAT). Das 61 linhas
-- comparáveis do DRE, 61 batem; sobram duas divergências reais, e as duas caminham juntas:
--
--   (-) DEVOLUCAO   9815 -10.892.993,70   nosso -10.893.952,65   nosso soma 958,95 A MAIS
--   (=) CMV LIQ.    9815 -312.135.833,53  nosso -312.135.200,14  nosso tira  633,39 A MAIS
--
-- CMVLIQ = VLCUSTOFIN − VLCMVDEVOL, então uma devolução a mais deixa o CMV menos negativo.
-- É o desenho de uma devolução que nós contamos e a 9815 não.
--
-- A causa aparece comparando o bloco de devolução das duas consultas. O trace da 9815
-- (`periodo_de_dois_meses_com_AH/queries/centro_de_custo_principal_competencia_ah.txt`,
-- linha 531) termina assim:
--
--     AND MV.CODSEC <> 1601
--     AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) )
--
-- e o nosso `FaturamentoPorMes` termina no `MV.CODSEC <> 1601`. O filtro `mostra_dre` está
-- nos NOSSOS três blocos de VENDA e faltava só no de DEVOLUÇÃO — `cliente_especial` marcado
-- com `mostra_dre = 'N'` tinha a venda excluída e a devolução somada.
--
-- Esta consulta mede exatamente o que esse filtro tira. A resposta esperada é uma única
-- linha com MOSTRA_DRE = 'N': VLDEVOLUCAO = 958,95 e VLCMVDEVOL = 633,39.

SELECT TO_CHAR(NFE.DTENT, 'mm/yyyy')                                        AS MESANO,
       NVL(esp.mostra_dre, 'S')                                             AS MOSTRA_DRE,
       NVL(PED.CONDVENDA, 1)                                                AS CONDVENDA,
       NFE.CODFORNEC                                                        AS CODCLI,
       COUNT(*)                                                             AS QDE_ITENS,
       COUNT(DISTINCT NFE.NUMNOTA)                                          AS QDE_NOTAS,
       SUM( round( NVL(nvl(MV.QT, mv.QTCONT), 0)
                 * NVL(nvl(MV.punit, mv.punitcont), 0), 2) )                AS VLDEVOLUCAO,
       SUM( NVL(MV.QT, 0)
          * ( NVL(decode(MV.custofin, 0, MV.custofinest, MV.custofin), 0)
              - nvl(MV.st, 0) - nvl(MVC.vlfecp, 0) ) )                      AS VLCMVDEVOL,
       SUM( (nvl(MV.st, 0) + nvl(MVC.vlfecp, 0)) * MV.qt )                  AS VLST_DEV,
       SUM( ( mv.VLPIS    - (mv.custocont * mv.PERPIS    / 100) ) * MV.qt )  AS VLPIS_DEV,
       SUM( ( mv.vlcofins - (mv.custocont * mv.PERCOFINS / 100) ) * MV.qt )  AS VLCOFINS_DEV
  FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED, PCPRODUT PR,
       (select clie.codcli, ce.codfil, ce.mostra_dre
          from cliente_especial ce, pcclient clie
         where clie.codcliprinc = ce.codcli) esp
 WHERE NFE.numnota       = MV.numnota      (+)
   AND NFE.numtransent   = MV.numtransent  (+)
   AND mv.numtransitem   = mvc.numtransitem (+)
   AND NFE.codfornec     = esp.codcli      (+)
   AND NFE.CODFILIAL     = esp.codfil      (+)
   AND MV.numped         = PED.numped      (+)
   AND MV.CODPROD        = PR.CODPROD
   AND nvl(PED.CONDVENDA, 1) IN ('1','3','5','6','8')
   AND NFE.CODFILIAL IN ('7')
   AND NFE.TIPODESCARGA IN ('6','7')
   AND MV.DTCANCEL IS NULL
   AND (NVL(NFE.OBS, 'X') <> 'NF CANCELADA')
   AND NFE.DTENT BETWEEN To_Date('01/01/2025', 'dd/mm/yyyy')
                     AND To_Date('31/12/2025', 'dd/mm/yyyy')
   AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
   AND MV.CODSEC <> 1601
   -- o filtro que a 9815 tem e nós não: aqui ele fica de fora de propósito, para que a
   -- consulta MOSTRE as duas populações lado a lado em vez de esconder uma delas.
   AND NOT ( NVL(esp.mostra_dre, 'S') = 'S' OR NVL(PED.CONDVENDA, 1) IN (5) )
 GROUP BY TO_CHAR(NFE.DTENT, 'mm/yyyy'), NVL(esp.mostra_dre, 'S'),
          NVL(PED.CONDVENDA, 1), NFE.CODFORNEC
 ORDER BY SUBSTR(TO_CHAR(NFE.DTENT, 'mm/yyyy'), 4, 4),
          SUBSTR(TO_CHAR(NFE.DTENT, 'mm/yyyy'), 1, 2);
