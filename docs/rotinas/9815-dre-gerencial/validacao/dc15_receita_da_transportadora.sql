-- ============================================================================
-- dc15 - por que a RECEITA BRUTA da filial 28 (EPC-TRANSP) vem zero na web
--
-- Cenario do reporte: 01/09/2026 a 10/09/2026, filial 28, C.Custo Principal.
--   9815 (planilha epoca_transportes.xlsx):  RECEITA BRUTA  1.137.050,01
--   web:                                     RECEITA BRUTA          0,00
--
-- COMO RODAR: execute como SCRIPT (F5). Sao 5 blocos, cada um com um rotulo.
--
-- HIPOTESE: a 9815 soma o CABECALHO da nota (PCNFSAID) e a web soma os ITENS
-- (PCMOV). EPC-TRANSP e transportadora: emite CT-e, que tem ESPECIE = 'CO' e
-- nao tem produto. Sem item em PCMOV - ou com item cujo CODFISCAL nao esta na
-- lista de inclusao da web - a nota inteira desaparece da nossa soma.
--
-- Tres filtros da web podem derrubar a nota, e o diagnostico e saber QUAL:
--   1. NF.numtransvenda = MV.numtransvenda   (juncao interna com itens)
--   2. MV.CODPROD = PR.CODPROD               (juncao interna com produto)
--   3. MV.CODFISCAL IN (5102,5502,...)       (lista de inclusao, por item)
-- ============================================================================

ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY';

-- ---------------------------------------------------------------------------
-- BLOCO 1 - O que a 9815 ve: soma no cabecalho, sem tocar em PCMOV.
-- Esperado: VLTABELA_9815 = 1.137.050,01 (a RECEITA BRUTA da planilha).
-- ---------------------------------------------------------------------------
SELECT '1. cabecalho (visao 9815)' AS bloco,
       COUNT(*)                                        AS qde_notas,
       SUM(NVL(NF.VLTABELA, NF.VLTOTGER))              AS vltabela_9815,
       SUM(DECODE(NF.CONDVENDA, 8, NF.VLTOTAL, NF.VLTOTGER)) AS vlvenda_9815,
       SUM(NVL(NF.VLTABELA, 0))                        AS soma_vltabela_crua,
       SUM(NVL(NF.VLTOTGER, 0))                        AS soma_vltotger
  FROM PCNFSAID NF,
       (SELECT clie.codcli, ce.codfil, ce.mostra_dre
          FROM cliente_especial ce, pcclient clie
         WHERE clie.codcliprinc = ce.codcli) esp
 WHERE NF.DTCANCEL IS NULL
   AND NF.codcli    = esp.codcli (+)
   AND NF.CODFILIAL = esp.codfil (+)
   AND ( (NF.CONDVENDA IN (1,5,8) OR (NF.ESPECIE = 'CO'))
         OR ((NF.CONDVENDA = 10)
             AND (SUBSTR(REPLACE(REPLACE(REPLACE(nf.cgc,'.',''),'/',''),'-',''),0,8)
               <> SUBSTR(REPLACE(REPLACE(REPLACE(nf.cgcfilial,'.',''),'/',''),'-',''),0,8))) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.CODFISCAL NOT IN (522,622,722,532,632,732,5206)
   AND NF.numtranscteanul IS NULL
   AND ( (NVL(esp.mostra_dre,'S') = 'S') OR (NF.CONDVENDA IN (5)) )
   AND NF.DTSAIDA BETWEEN TO_DATE('01/09/2026') AND TO_DATE('10/09/2026')
   AND NF.CODFILIAL IN ('28');

-- ---------------------------------------------------------------------------
-- BLOCO 2 - As notas por ESPECIE e CONDVENDA.
-- Confirma que a receita da 28 e CT-e ('CO') e mostra por qual condicao ela
-- entra na 9815.
-- ---------------------------------------------------------------------------
SELECT '2. por especie/condvenda' AS bloco,
       NF.ESPECIE,
       NF.CONDVENDA,
       NF.CODFISCAL                        AS codfiscal_da_nota,
       COUNT(*)                            AS qde_notas,
       SUM(NVL(NF.VLTABELA, NF.VLTOTGER))  AS vltabela_9815,
       SUM(CASE WHEN NF.VLTABELA IS NULL THEN 1 ELSE 0 END) AS notas_sem_vltabela
  FROM PCNFSAID NF
 WHERE NF.DTCANCEL IS NULL
   AND NF.DTSAIDA BETWEEN TO_DATE('01/09/2026') AND TO_DATE('10/09/2026')
   AND NF.CODFILIAL IN ('28')
 GROUP BY NF.ESPECIE, NF.CONDVENDA, NF.CODFISCAL
 ORDER BY 6 DESC;

-- ---------------------------------------------------------------------------
-- BLOCO 3 - FILTRO 1: essas notas TEM item em PCMOV?
-- Se qde_notas_sem_item > 0 com valor relevante, a juncao interna e a causa
-- principal, e nenhuma lista de CODFISCAL resolve.
-- ---------------------------------------------------------------------------
SELECT '3. notas com e sem item' AS bloco,
       CASE WHEN MV.numtransvenda IS NULL THEN 'SEM item em PCMOV'
            ELSE 'com item' END              AS situacao,
       COUNT(DISTINCT NF.numtransvenda)      AS qde_notas,
       SUM(NVL(NF.VLTABELA, NF.VLTOTGER))    AS vltabela_9815
  FROM PCNFSAID NF,
       (SELECT DISTINCT numtransvenda FROM PCMOV WHERE DTCANCEL IS NULL) MV
 WHERE NF.numtransvenda = MV.numtransvenda (+)
   AND NF.DTCANCEL IS NULL
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.DTSAIDA BETWEEN TO_DATE('01/09/2026') AND TO_DATE('10/09/2026')
   AND NF.CODFILIAL IN ('28')
 GROUP BY CASE WHEN MV.numtransvenda IS NULL THEN 'SEM item em PCMOV'
               ELSE 'com item' END;

-- ---------------------------------------------------------------------------
-- BLOCO 4 - FILTRO 3: quais CODFISCAL de ITEM aparecem, e quais a web aceita.
-- Se houver linha com aceita_pela_web = 'NAO' e valor relevante, e a lista de
-- inclusao que precisa crescer - e este bloco diz com quais codigos.
-- ---------------------------------------------------------------------------
SELECT '4. codfiscal do item' AS bloco,
       MV.CODFISCAL,
       CASE WHEN MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,
                                  5910,5922,6108,6922,6102,6114,6115,6117,6119,
                                  6404,6910)
            THEN 'sim' ELSE 'NAO' END        AS aceita_pela_web,
       COUNT(*)                              AS qde_itens,
       SUM(MV.ptabela * MV.qt)               AS soma_ptabela_qt,
       SUM(MV.punit   * MV.qt)               AS soma_punit_qt
  FROM PCNFSAID NF, PCMOV MV
 WHERE NF.numtransvenda = MV.numtransvenda
   AND NF.DTCANCEL IS NULL
   AND MV.DTCANCEL IS NULL
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.DTSAIDA BETWEEN TO_DATE('01/09/2026') AND TO_DATE('10/09/2026')
   AND NF.CODFILIAL IN ('28')
 GROUP BY MV.CODFISCAL
 ORDER BY 5 DESC;

-- ---------------------------------------------------------------------------
-- BLOCO 5 - O que a WEB ve hoje, com os tres filtros ativos.
-- Esperado: zero (ou perto), reproduzindo o defeito. Se este bloco der
-- 1.137.050,01, o problema nao esta na consulta e sim no caminho da API.
-- ---------------------------------------------------------------------------
SELECT '5. itens (visao web)' AS bloco,
       COUNT(*)                       AS qde_itens,
       SUM(MV.ptabela * MV.qt)        AS receita_bruta_web,
       SUM(MV.punit   * MV.qt)        AS vlvenda_web
  FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR,
       (SELECT clie.codcli, ce.codfil, ce.mostra_dre
          FROM cliente_especial ce, pcclient clie
         WHERE clie.codcliprinc = ce.codcli) esp
 WHERE NF.numtransvenda = MV.numtransvenda
   AND MV.numtransitem  = MVC.numtransitem (+)
   AND MV.CODPROD       = PR.CODPROD
   AND NF.codcli        = esp.codcli (+)
   AND NF.CODFILIAL     = esp.codfil (+)
   AND MV.DTCANCEL      IS NULL
   AND NF.DTCANCEL      IS NULL
   AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,
                        6108,6922,6102,6114,6115,6117,6119,6404,6910)
   AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)
         OR (NVL(NF.VLTOTAL,0) > 0) OR (NVL(NF.VLCUSTOFIN,0) > 0) )
   AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
   AND NF.DTSAIDA BETWEEN TO_DATE('01/09/2026') AND TO_DATE('10/09/2026')
   AND NF.CODFILIAL IN ('28')
   AND ( (NVL(esp.mostra_dre,'S') = 'S') OR (NF.CONDVENDA IN (5)) )
   AND NVL(PR.codsec,0) <> 1601;
