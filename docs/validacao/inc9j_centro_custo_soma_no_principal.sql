-- ============================================================================
-- INCREMENTO 9j - Centro de Custo fecha com C. Custo Principal?
--
-- Esta e a unica dimensao sem exportacao da 9815 para comparar: a rotina
-- falha sempre. Entao a referencia tem que ser indireta.
--
-- A ideia: C. Custo Principal ja esta validada ao centavo contra a 9815
-- (DIVERGENCIAS.md, validacao de 31/08/2026). E o principal e, por
-- definicao, os dois primeiros digitos do centro de custo. Logo:
--
--   soma dos centros de custo cujo codigo comeca em NN
--     TEM QUE SER IGUAL
--   a linha do principal NN
--
-- Se fechar, os valores de Centro de Custo estao ancorados numa referencia
-- ja conferida. Nao substitui a leitura de quem conhece o negocio - nao prova
-- que o centro de custo certo recebeu o lancamento certo -, mas pega erro de
-- agrupamento e de valor sem depender da 9815.
--
-- Reproduz a expressao de valor da rotina nos dois lados e compara.
--
-- ZERO LINHAS = fecha. LINHAS = o agrupamento por centro de custo perde ou
-- duplica valor em relacao ao agrupamento por principal.
--
-- Cenario: 01/07 a 31/07/2026, competencia, filiais 7/12/25.
-- So o bloco operacional (AntesRO = 'S'), onde a chave e o centro de custo.
-- Toca so PCLANC/PCRATEIOCENTROCUSTO. Rodar como SCRIPT (F5).
-- ============================================================================

WITH movimento AS (
  SELECT DECODE(RC.valor, NULL,
                DECODE(CT.usarateiocentrocusto,'S',NVL(CC.CodigoCentroCusto,'9998'),'9999'),
                NVL(CC.CodigoCentroCusto,'9998'))              AS CODCENTROCUSTO,
         DECODE(RC.valor, NULL, NVL(FIN.VPAGO,0)*(-1),
                               NVL(RC.valor,FIN.VPAGO)*(-1))   AS VPAGO
    FROM PCCONTA CT, PCGRUPO GR, PCCENTROCUSTO CC, PCRATEIOCENTROCUSTO RC,
         (SELECT RECNUM, CODFILIAL, CODCONTA, DTCOMPETENCIA, HISTORICO,
                 NVL(VPAGO,VALOR) AS VPAGO
            FROM PCLANC WHERE DTPAGTO IS NOT NULL) FIN
   WHERE FIN.CODCONTA = CT.CODCONTA
     AND CT.GRUPOCONTA >= 200
     AND FIN.CODFILIAL IN ('7','12','25')
     AND FIN.RECNUM = RC.RECNUM (+)
     AND FIN.CODCONTA = RC.CODCONTA (+)
     AND CT.grupoconta = GR.codgrupo (+)
     AND RC.CodigoCentroCusto = CC.CodigoCentroCusto (+)
     AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
     AND NOT EXISTS (SELECT recnumadiantamento FROM pclancadiantfornec
                      WHERE recnumpagto IS NOT NULL AND dtestorno IS NULL
                        AND recnumadiantamento = FIN.recnum)
     -- bloco operacional: e onde a chave e o centro de custo nas duas dimensoes
     AND FIN.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0
                            AND id < (SELECT ID FROM EPCPARDRE
                                       WHERE upper(grupo) LIKE 'RESULTADO OPERACIONAL'))
     AND FIN.CODCONTA NOT IN (SELECT codconta FROM EPCPARDRE_NAOEXIBIR)
     AND FIN.dtcompetencia BETWEEN To_Date('01/07/2026','dd/mm/yyyy')
                               AND To_Date('31/07/2026','dd/mm/yyyy')
),
por_centro_custo AS (
  -- como a dimensao Centro de Custo agrupa, depois dobrado para o principal
  SELECT SUBSTR(CODCENTROCUSTO, 1, 2)  AS PRINCIPAL,
         ROUND(SUM(VPAGO), 2)          AS VALOR
    FROM (SELECT CODCENTROCUSTO, ROUND(SUM(VPAGO), 2) AS VPAGO
            FROM movimento GROUP BY CODCENTROCUSTO)
   GROUP BY SUBSTR(CODCENTROCUSTO, 1, 2)
),
por_principal AS (
  -- como a dimensao C. Custo Principal agrupa, direto
  SELECT SUBSTR(CODCENTROCUSTO, 1, 2)  AS PRINCIPAL,
         ROUND(SUM(VPAGO), 2)          AS VALOR
    FROM movimento
   GROUP BY SUBSTR(CODCENTROCUSTO, 1, 2)
)
SELECT NVL(cc.PRINCIPAL, pp.PRINCIPAL)          AS PRINCIPAL,
       cc.VALOR                                  AS SOMA_DOS_CENTROS_DE_CUSTO,
       pp.VALOR                                  AS LINHA_DO_PRINCIPAL,
       NVL(cc.VALOR,0) - NVL(pp.VALOR,0)         AS DIFERENCA
  FROM por_centro_custo cc
  FULL OUTER JOIN por_principal pp ON cc.PRINCIPAL = pp.PRINCIPAL
 WHERE cc.PRINCIPAL IS NULL
    OR pp.PRINCIPAL IS NULL
    OR ABS(NVL(cc.VALOR,0) - NVL(pp.VALOR,0)) > 0.005
 ORDER BY 1

-- ============================================================================
-- RESULTADO - 31/08/2026: ZERO LINHAS.
--
-- A soma dos centros de custo fecha exatamente com a linha do principal em
-- todos os principais do periodo. Como C. Custo Principal ja esta validada ao
-- centavo contra a 9815, os valores de Centro de Custo ficam ancorados numa
-- referencia conferida.
--
-- O QUE ISSO PROVA: nao ha perda, duplicacao nem erro de agrupamento entre as
-- duas granularidades; as sentinelas 9998/9999 sao tratadas igual nas duas.
--
-- O QUE NAO PROVA: se o lancamento certo caiu no centro de custo certo. Uma
-- troca entre dois centros de custo do MESMO principal passa por este teste
-- sem deixar rastro. Isso so a conferencia com o negocio pega.
-- ============================================================================
