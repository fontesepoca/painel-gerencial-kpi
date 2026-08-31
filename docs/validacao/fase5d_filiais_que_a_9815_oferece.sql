-- ============================================================================
-- FASE 5d - por que a 9815 oferece 9 filiais e nos oferecemos 18?
--
-- A tela de pre-selecao da rotina, capturada em 31/08/2026, lista nove:
--
--   01-ATACADO / DITRIB     7, 12, 24, 25, 27, 34, 35
--   05-TRANSPORTA / ARMAZEM  1, 28
--
-- Nossa consulta de filiais devolve 18 - a diferenca sao 13, 16, 17, 18, 19,
-- 20, 22, 31 e 91. Foi uma decisao consciente (ROTINA_9815.md, Filiais): a web
-- nao tem a tela de pre-selecao, entao o filtro nasce com o cadastro inteiro.
--
-- O criterio da 9815 NAO e movimento: a filial 35 esta parada em julho e
-- aparece na lista dela. Entao tem outra coisa separando as nove.
--
-- Esta consulta mostra as colunas que podem explicar. Nao muda nada - so
-- descreve, para a decisao de mostrar 18 ser reafirmada ou revista com dado
-- na mao, em vez de por omissao.
--
-- Repare em EMPRESA: a tela agrupa por ela, e as nove oferecidas podem estar
-- em duas empresas so, enquanto as outras nove estao em empresas que a rotina
-- nao percorre.
--
-- Consulta de cadastro, leve. Rodar como SCRIPT (F5).
-- ============================================================================

SELECT F.CODFIL                                          AS FILIAL,
       F.LABEL                                           AS LABEL,
       E.EMPRESA                                         AS COD_EMPRESA,
       E.DESCRICAO                                       AS EMPRESA,
       F.ORDEM_PROCESSA                                  AS ORDEM,
       F.DBLEPCTI                                        AS DBLEPCTI,
       NVL(FW.UF, '--')                                  AS UF,
       CASE WHEN F.CODFIL IN ('7','12','24','25','27','34','35','1','28')
            THEN 'oferecida pela 9815' ELSE '<<< SO NA WEB' END AS NA_9815
  FROM FILIAIS F, EMPRESA E, PCFILIAL FW
 WHERE F.EMPRESA = E.EMPRESA
   AND F.CODFIL  = FW.CODIGO (+)
 ORDER BY 8 DESC, E.EMPRESA, LPAD(F.CODFIL, 10, '0')
