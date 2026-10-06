-- ============================================================================
-- INCREMENTO 9i - a minha estrutura de Conta Gerencial bate com a original?
--
-- Mesma logica da inc9g: reproduz a consulta do trace e a nossa lado a lado,
-- e compara pela tupla que identifica uma linha do DRE. Aqui as duas colunas
-- extras entram na comparacao, porque entram no GROUP BY da rotina:
-- (CODGRUCONTA, GRUPO, INFCONTAS, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL).
--
-- Unica adaptacao sob teste: os tres blocos de orfas, um por filial, viraram
-- um com CODFILIAL IN (...). O ID fica fora - e rownum, depende da ordem que o
-- banco escolher, e o que importa e o conjunto de linhas.
--
-- Nao ha divergencia deliberada nesta dimensao. Qualquer linha aqui e erro meu.
--
-- ZERO LINHAS = adaptacao equivalente.
--
-- Cenario: 01/07 a 31/07/2026, competencia, filiais 7, 12 e 25.
-- Rodar como SCRIPT (F5).
-- ============================================================================

WITH original AS (
  SELECT CODGRUCONTA, GRUPO, INFCONTAS, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL
    FROM (
                 select PAR.ID,
                        to_char(PAR.CODGRUCONTA) as CODGRUCONTA, CASE WHEN PAR.CODGRUCONTA > 0 THEN NVL(CO.CONTA,PAR.GRUPO) ELSE PAR.GRUPO END AS GRUPO, PAR.INFCONTAS, PAR.COR,
                        nvl(co.fixavariavel,'F') as TIPOCONTA,
                        (SELECT usu.nome from epcpardre_resp re, pcempr usu
                         where re.matricula = usu.matricula and re.codconta = PAR.CODGRUCONTA and re.codfil = 25) as RESPONSAVEL,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')  then 'S' else 'N' end as AntesRO,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLL,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLF
                     from EPCPARDRE PAR, PCCONTA CO, PCGRUPO GR
                    WHERE PAR.CODGRUCONTA = CO.codconta (+)
                      AND CO.GRUPOCONTA = gr.codgrupo (+)
                 union all
                 SELECT ROWNUM+(select max(ID) from EPCPARDRE) as ID, to_char(codgrupo) as CODGRUCONTA, GRUPO, 'N' as INFCONTAS,  NULL as COR, '' as TIPOCONTA, '' as RESPONSAVEL, 'N' as AntesRO, 'N' as AntesLL, 'N' as AntesLF
                   FROM (
                        SELECT CODGRUPO, GRUPO, SUM(VPAGO) AS VPAGO, count(*) as qdeReg
                        FROM (
 SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO
    FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC,
          ( select '99' as codccprinc, 'NAO USA/NAO INFORMADO' as DescCCPrinc FROM DUAL
            union
            select codccprinc, (select descricao from PCCENTROCUSTO where CodigoCentroCusto = CCP.CodPrinc) as DescCCPrinc
            FROM (select SUBSTR(CodigoCentroCusto,1,2) as CODCCPRINC, min(CodigoCentroCusto) as CodPrinc
            from PCCENTROCUSTO where CodigoCentroCusto not like '%.%' group by SUBSTR(CodigoCentroCusto,1,2)) CCP) CCPrinc
   WHERE  FIN.CODCONTA = CT.CODCONTA
     AND  CT.GRUPOCONTA >= 200
     AND  FIN.CODFILIAL IN ('7')
     AND  FIN.RECNUM = RC.RECNUM (+)
     AND  FIN.CODCONTA = RC.CODCONTA (+)
     AND  CT.grupoconta = GR.codgrupo (+)
     AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
     AND  SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
     AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) )
    AND FIN.dtcompetencia BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
         union all
 SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO
    FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC,
          ( select '99' as codccprinc, 'NAO USA/NAO INFORMADO' as DescCCPrinc FROM DUAL
            union
            select codccprinc, (select descricao from PCCENTROCUSTO where CodigoCentroCusto = CCP.CodPrinc) as DescCCPrinc
            FROM (select SUBSTR(CodigoCentroCusto,1,2) as CODCCPRINC, min(CodigoCentroCusto) as CodPrinc
            from PCCENTROCUSTO where CodigoCentroCusto not like '%.%' group by SUBSTR(CodigoCentroCusto,1,2)) CCP) CCPrinc
   WHERE  FIN.CODCONTA = CT.CODCONTA
     AND  CT.GRUPOCONTA >= 200
     AND  FIN.CODFILIAL IN ('12')
     AND  FIN.RECNUM = RC.RECNUM (+)
     AND  FIN.CODCONTA = RC.CODCONTA (+)
     AND  CT.grupoconta = GR.codgrupo (+)
     AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
     AND  SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
     AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) )
    AND FIN.dtcompetencia BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
         union all
 SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO
    FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC,
          ( select '99' as codccprinc, 'NAO USA/NAO INFORMADO' as DescCCPrinc FROM DUAL
            union
            select codccprinc, (select descricao from PCCENTROCUSTO where CodigoCentroCusto = CCP.CodPrinc) as DescCCPrinc
            FROM (select SUBSTR(CodigoCentroCusto,1,2) as CODCCPRINC, min(CodigoCentroCusto) as CodPrinc
            from PCCENTROCUSTO where CodigoCentroCusto not like '%.%' group by SUBSTR(CodigoCentroCusto,1,2)) CCP) CCPrinc
   WHERE  FIN.CODCONTA = CT.CODCONTA
     AND  CT.GRUPOCONTA >= 200
     AND  FIN.CODFILIAL IN ('25')
     AND  FIN.RECNUM = RC.RECNUM (+)
     AND  FIN.CODCONTA = RC.CODCONTA (+)
     AND  CT.grupoconta = GR.codgrupo (+)
     AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
     AND  SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
     AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) )
    AND FIN.dtcompetencia BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
                         ) GROUP BY CODGRUPO, GRUPO
                     ORDER BY 1
                     )
                      where VPAGO <> 0  or qdereg <> 0
               )
    group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL, INFCONTAS
),
adaptada AS (
  SELECT CODGRUCONTA, GRUPO, INFCONTAS, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL
    FROM (
                 select PAR.ID,
                        to_char(PAR.CODGRUCONTA) as CODGRUCONTA, CASE WHEN PAR.CODGRUCONTA > 0 THEN NVL(CO.CONTA,PAR.GRUPO) ELSE PAR.GRUPO END AS GRUPO, PAR.INFCONTAS, PAR.COR,
                        nvl(co.fixavariavel,'F') as TIPOCONTA,
                        (SELECT usu.nome from epcpardre_resp re, pcempr usu
                         where re.matricula = usu.matricula and re.codconta = PAR.CODGRUCONTA and re.codfil = 25) as RESPONSAVEL,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')  then 'S' else 'N' end as AntesRO,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLL,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLF
                     from EPCPARDRE PAR, PCCONTA CO, PCGRUPO GR
                    WHERE PAR.CODGRUCONTA = CO.codconta (+)
                      AND CO.GRUPOCONTA = gr.codgrupo (+)
                 union all
                 SELECT ROWNUM+(select max(ID) from EPCPARDRE) as ID, to_char(codgrupo) as CODGRUCONTA, GRUPO, 'N' as INFCONTAS,  NULL as COR, '' as TIPOCONTA, '' as RESPONSAVEL, 'N' as AntesRO, 'N' as AntesLL, 'N' as AntesLF
                   FROM (
                        SELECT CODGRUPO, GRUPO, SUM(VPAGO) AS VPAGO, count(*) as qdeReg
                        FROM (
 SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO
    FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC,
          ( select '99' as codccprinc, 'NAO USA/NAO INFORMADO' as DescCCPrinc FROM DUAL
            union
            select codccprinc, (select descricao from PCCENTROCUSTO where CodigoCentroCusto = CCP.CodPrinc) as DescCCPrinc
            FROM (select SUBSTR(CodigoCentroCusto,1,2) as CODCCPRINC, min(CodigoCentroCusto) as CodPrinc
            from PCCENTROCUSTO where CodigoCentroCusto not like '%.%' group by SUBSTR(CodigoCentroCusto,1,2)) CCP) CCPrinc
   WHERE  FIN.CODCONTA = CT.CODCONTA
     AND  CT.GRUPOCONTA >= 200
     AND  FIN.CODFILIAL IN ('7','12','25')
     AND  FIN.RECNUM = RC.RECNUM (+)
     AND  FIN.CODCONTA = RC.CODCONTA (+)
     AND  CT.grupoconta = GR.codgrupo (+)
     AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
     AND  SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+)
     AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) )
    AND FIN.dtcompetencia BETWEEN To_Date('01/07/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
                         ) GROUP BY CODGRUPO, GRUPO
                     ORDER BY 1
                     )
                      where VPAGO <> 0  or qdereg <> 0
               )
    group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL, INFCONTAS
)
SELECT 'so na ORIGINAL' AS ONDE, o.* FROM (SELECT * FROM original MINUS SELECT * FROM adaptada) o
 UNION ALL
SELECT 'so na ADAPTADA' AS ONDE, a.* FROM (SELECT * FROM adaptada MINUS SELECT * FROM original) a
 ORDER BY 1, 2, 3

-- ============================================================================
-- RESULTADO - 31/08/2026: ZERO LINHAS.
--
-- A unica adaptacao - os tres blocos de orfas unificados em CODFILIAL IN -
-- e equivalente a original. Rodou com as tres filiais, entao o teste e mais
-- forte que o da inc9g: nesta dimensao nao ha divergencia deliberada que
-- pudesse mascarar erro meu.
--
-- O QUE ISSO PROVA: a consulta de ESTRUTURA, filiais 7/12/25, competencia,
-- 01/07 a 31/07/2026. Inclui TIPOCONTA e RESPONSAVEL, que entram no GROUP BY.
--
-- O QUE NAO PROVA: a consulta de DESPESAS, o regime de caixa, e a montagem
-- da tela. Isso fecha comparando a apuracao inteira contra a exportacao.
-- ============================================================================
