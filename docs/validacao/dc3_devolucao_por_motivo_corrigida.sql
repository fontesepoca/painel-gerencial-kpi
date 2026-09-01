-- dc3 — A tela "Devolução por motivo" corrigida fecha com a linha do DRE?
--
-- Terceira e última tela do detalhamento. Mesma decisão de DIVERGENCIAS.md §4: o total
-- passa a usar o recorte e o arredondamento da apuração, para fechar com a linha clicada.
--
-- O QUE MUDOU EM RELAÇÃO À 9815
--   1. arredondamento do item: round(..., 2) — a 9815 usa 4 AQUI e 2 na tela de receita,
--      e por isso as duas telas dela dão totais diferentes para a mesma devolução;
--   2. recorte: junção com PCPEDC exigindo CONDVENDA IN (1,3,5,6,8) e junção interna com
--      PCPRODUT, como a apuração faz;
--   3. sai o filtro mostra_dre, que a apuração não aplica na devolução.
--
-- A junção com PCTABDEV é externa, como na 9815 — devolução sem motivo cadastrado tem
-- que continuar aparecendo, com o motivo vazio, e não sumir do total.
--
-- CENÁRIO: o mesmo do print — agosto/2026, filiais 7, 12 e 25.
--
-- PREVISÃO REGISTRADA ANTES DE RODAR:
--
--   TOTAL_DEVOLUCAO   1.256.167,12    (idêntico à linha (-) DEVOLUCAO do DRE e ao
--                                      DEVOLUCAO de dc2, que já mediu 1.256.167,12)
--   hoje a 9815 dá     1.370.523,2318
--
--   SOMA_PPART        100,00 ± 0,03   (arredondamento de 2 casas em ~27 motivos; a
--                                      exportação da 9815 fechou em 100,02)
--
-- Se TOTAL_DEVOLUCAO bater com dc2 mas a lista por motivo somar diferente, o problema
-- está na junção com PCTABDEV duplicando linha — conferir contagem antes de valor.

SELECT codmotivo,
       motivo,
       culparca,
       qde_nf,
       vldevolucao,
       round((vldevolucao / SUM(vldevolucao) OVER (PARTITION BY NULL)) * 100, 2) AS ppart
  FROM (
        SELECT MOTIVO.CODDEVOL              AS CODMOTIVO,
               motivo.motivo,
               motivo.crldevculparca         AS culparca,
               COUNT(DISTINCT NFE.numnota)   AS qde_nf,
               SUM( round( NVL(nvl(MV.QT, mv.QTCONT), 0)
                         * NVL(nvl(MV.punit, mv.punitcont), 0), 2) ) AS VLDEVOLUCAO
          FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED, PCPRODUT PR,
               PCTABDEV MOTIVO
         WHERE NFE.numnota     = MV.numnota      (+)
           AND NFE.numtransent = MV.numtransent  (+)
           AND mv.numtransitem = mvc.numtransitem (+)
           AND MV.numped       = PED.numped      (+)
           AND MV.CODPROD      = PR.CODPROD
           AND NFE.CODDEVOL    = MOTIVO.CODDEVOL (+)
           AND nvl(PED.CONDVENDA, 1) IN ('1','3','5','6','8')
           AND NFE.CODFILIAL IN ('7','12','25')
           AND NFE.TIPODESCARGA IN ('6','7')
           AND MV.DTCANCEL IS NULL
           AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA')
           AND NFE.DTENT BETWEEN To_Date('01/08/2026','dd/mm/yyyy')
                             AND To_Date('31/08/2026','dd/mm/yyyy')
           AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949)
           AND MV.CODSEC <> 1601
         GROUP BY MOTIVO.CODDEVOL, motivo.motivo, motivo.crldevculparca
       )
 ORDER BY vldevolucao DESC;
