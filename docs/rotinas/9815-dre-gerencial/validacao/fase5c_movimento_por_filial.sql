-- ============================================================================
-- FASE 5c - qual filial nao teve movimento no periodo?
--
-- Para montar o cenario "filial sem movimento" precisamos saber quais das 18
-- estao paradas. O DRE tem duas fontes independentes, e uma filial so esta
-- realmente vazia se as DUAS vierem zeradas:
--
--   DESPESAS   PCLANC, com os mesmos filtros da consulta de valores
--   RECEITA    PCNFSAID, as notas de saida que alimentam o cabecalho
--
-- Uma filial pode ter receita sem despesa, ou o contrario - e ai o cenario
-- testa outra coisa. Por isso as duas colunas aparecem separadas.
--
-- Nao aplica o filtro de EPCPARDRE nem o de adiantamento: aqui a pergunta e
-- "tem lancamento?", nao "quanto vale". Contagem grosseira serve.
--
-- Cenario alvo: julho de 2026, competencia - o mesmo dos testes recentes.
-- Rodar como SCRIPT (F5).
-- ============================================================================

SELECT F.CODFIL                                   AS FILIAL,
       F.LABEL                                    AS LABEL,
       NVL(D.QDE, 0)                              AS LANC_DESPESA,
       NVL(R.QDE, 0)                              AS NOTAS_SAIDA,
       CASE WHEN NVL(D.QDE,0) = 0 AND NVL(R.QDE,0) = 0 THEN '<<< PARADA'
            WHEN NVL(D.QDE,0) = 0                       THEN 'sem despesa'
            WHEN NVL(R.QDE,0) = 0                       THEN 'sem receita'
            ELSE '' END                           AS SITUACAO
  FROM FILIAIS F,
       (SELECT L.CODFILIAL, COUNT(*) AS QDE
          FROM PCLANC L, PCCONTA CT
         WHERE L.CODCONTA = CT.CODCONTA
           AND CT.GRUPOCONTA >= 200
           AND L.DTPAGTO IS NOT NULL
           AND L.DTCOMPETENCIA BETWEEN To_Date('01/07/2026','dd/mm/yyyy')
                                   AND To_Date('31/07/2026','dd/mm/yyyy')
         GROUP BY L.CODFILIAL) D,
       (SELECT NF.CODFILIAL, COUNT(*) AS QDE
          FROM PCNFSAID NF
         WHERE NF.DTCANCEL IS NULL
           AND NF.DTSAIDA BETWEEN To_Date('01/07/2026','dd/mm/yyyy')
                              AND To_Date('31/07/2026','dd/mm/yyyy')
         GROUP BY NF.CODFILIAL) R
 WHERE F.CODFIL = D.CODFILIAL (+)
   AND F.CODFIL = R.CODFILIAL (+)
 ORDER BY NVL(D.QDE,0) + NVL(R.QDE,0), LPAD(F.CODFIL, 10, '0')
