-- ============================================================================
-- INCREMENTO 9g - a minha estrutura de C. Custo Principal bate com a original?
--
-- A divergencia da filial unica foi aprovada (DIVERGENCIAS.md n. 2), mas ela
-- nao pode servir de desculpa para erro meu. Com UMA FILIAL SO nao ha
-- divergencia possivel - a lista completa e a ultima filial sao a mesma coisa.
-- Entao qualquer diferenca aqui e defeito da minha adaptacao.
--
-- Compara linha a linha, pela tupla que identifica uma linha do DRE:
-- (CODGRUCONTA, GRUPO, INFCONTAS, AntesRO, AntesLL, AntesLF).
--
-- ZERO LINHAS = adaptacao equivalente. Pode confiar nos numeros.
-- LINHAS      = eu errei em algum ponto; a divergencia aprovada nao explica.
--
-- Quatro adaptacoes sob teste:
--   1. os tres blocos de orfas viraram um com CODFILIAL IN (...)
--   2. NVL(codccprinc,99) virou NVL(codccprinc,'99')
--   3. saiu a coluna morta AntesRA
--   4. o ID nao entra na comparacao - ele e rownum, e depende da ordem que o
--      banco escolher. O que importa e o CONJUNTO de linhas, nao o numero
--      sintetico de cada uma.
--
-- Cenario: 01/06 a 31/07/2026, competencia, FILIAL 7 SOZINHA.
-- Rodar como SCRIPT (F5).
-- ============================================================================

WITH original AS (
  SELECT CODGRUCONTA, GRUPO, INFCONTAS, AntesRO, AntesLL, AntesLF
    FROM (
            select par.id, to_Char(par.codgruconta) as codgruconta, par.grupo, par.infcontas, par.cor, '' as TIPOCONTA, '' as RESPONSAVEL,
                   case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')  then 'S' else 'N' end as AntesRO,
                   case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLL,
                   case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO FINAL')  then 'S' else 'N' end as AntesLF
              from EPCPARDRE par where par.codgruconta <= 0
               and par.grupo not in ('DESPESA OPERACIONAL','LUCRO OPERACIONAL','DESPESA FINANCEIRA','LUCRO FINANCEIRO','DESPESA TRIBUTARIA','LUCRO TRIBUTARIO')
            union all
            select rownum + 9 +
                   case when AntesRO = 'N' and AntesLL = 'S' then  (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')
                        when AntesRO = 'N' and AntesLL = 'N' then  (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')
                   else 0 end as id,
            to_char(codgruconta) as codgruconta, grupo, INFCONTAS, COR, '' as TIPOCONTA, '' as RESPONSAVEL, AntesRO, AntesLL, AntesLF
            from (
          select distinct    DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.codccprinc,99),99) as CODGRUCONTA,
                 DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.DescCCPrinc,'NÃO USA/NÃO INFORMADO'),'NÃO USA/NÃO INFORMADO') as GRUPO,
                 'N' as INFCONTAS, NULL as COR,
                 case
                      when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                 and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL'))  then 'S' else 'N' end as AntesRO,
                 case
                      when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                 and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO ANTES DO LL'))  then 'S' else 'N' end as AntesRA,
                 case
                      when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                 and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLL,
                 case
                      when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                 and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLF
            from EPCPARDRE PAR, PCCONTA CT, PCCENTROCUSTO CC,
                 (select codconta, codigocentrocusto from PCCONTACENTROCUSTO
                   union
                   SELECT  FIN.CODCONTA, rC.CodigoCentroCusto
                     FROM  PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
                    WHERE  FIN.CODCONTA = CT.CODCONTA
                      AND  CT.GRUPOCONTA >= 200
                      AND  FIN.CODFILIAL IN ('7')
                      AND  FIN.RECNUM = RC.RECNUM
                      AND  FIN.CODCONTA = RC.CODCONTA
                      AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO'
                     AND FIN.dtcompetencia Between To_Date('01/06/2026','dd/mm/yyyy')  AND  To_Date('31/07/2026','dd/mm/yyyy')
                  ) CCC,
                 (  select codccprinc, (select descricao from PCCENTROCUSTO where codigocentrocusto = CCP.CodPrinc) as DescCCPrinc
                    FROM (select SUBSTR(codigocentrocusto,1,2) as CODCCPRINC, min(codigocentrocusto) as CodPrinc
                          from PCCENTROCUSTO where codigocentrocusto not like '%.%' group by SUBSTR(codigocentrocusto,1,2)) CCP) CCPrinc
           where par.codgruconta = CT.codconta (+)
             and ct.codconta = ccc.codconta (+)
             and ccc.codigocentrocusto = cc.codigocentrocusto (+)
             AND SUBSTR(cc.codigocentrocusto,1,2) = CCPrinc.codccprinc (+)
             and par.codgruconta > 0
           order by 1
           )
         union all
         SELECT ROWNUM+(select max(ID) from EPCPARDRE) as ID, to_char(codgrupo) as CODGRUCONTA, GRUPO, 'N' as INFCONTAS,  NULL as COR, '' as TIPOCONTA, '' as RESPONSAVEL, 'N' as AntesRO, 'N' as AntesLL, 'N' as AntesLF
           FROM (
                SELECT CODGRUPO, GRUPO, SUM(VPAGO) AS VPAGO, count(*) as qdeReg
                FROM (
 SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO
    FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC,
          ( select '99' as codccprinc, 'NÃO USA/NÃO INFORMADO' as DescCCPrinc FROM DUAL
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
    AND FIN.dtcompetencia Between To_Date('01/06/2026','dd/mm/yyyy')  AND  To_Date('31/07/2026','dd/mm/yyyy')
                 ) GROUP BY CODGRUPO, GRUPO
             ORDER BY 1
             )
              where VPAGO <> 0  or qdereg <> 0
       )
    group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL, INFCONTAS
),
adaptada AS (
  SELECT CODGRUCONTA, GRUPO, INFCONTAS, AntesRO, AntesLL, AntesLF
    FROM (
            select par.id, to_Char(par.codgruconta) as codgruconta, par.grupo, par.infcontas, par.cor, '' as TIPOCONTA, '' as RESPONSAVEL,
                   case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')  then 'S' else 'N' end as AntesRO,
                   case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLL,
                   case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO FINAL')  then 'S' else 'N' end as AntesLF
              from EPCPARDRE par where par.codgruconta <= 0
               and par.grupo not in ('DESPESA OPERACIONAL','LUCRO OPERACIONAL','DESPESA FINANCEIRA','LUCRO FINANCEIRO','DESPESA TRIBUTARIA','LUCRO TRIBUTARIO')
            union all
            select rownum + 9 +
                   case when AntesRO = 'N' and AntesLL = 'S' then  (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')
                        when AntesRO = 'N' and AntesLL = 'N' then  (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')
                   else 0 end as id,
            to_char(codgruconta) as codgruconta, grupo, INFCONTAS, COR, '' as TIPOCONTA, '' as RESPONSAVEL, AntesRO, AntesLL, AntesLF
            from (
          select distinct    DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.codccprinc,'99'),'99') as CODGRUCONTA,
                 DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.DescCCPrinc,'NÃO USA/NÃO INFORMADO'),'NÃO USA/NÃO INFORMADO') as GRUPO,
                 'N' as INFCONTAS, NULL as COR,
                 case
                      when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                 and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL'))  then 'S' else 'N' end as AntesRO,
                 case
                      when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                 and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLL,
                 case
                      when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                 and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLF
            from EPCPARDRE PAR, PCCONTA CT, PCCENTROCUSTO CC,
                 (select codconta, codigocentrocusto from PCCONTACENTROCUSTO
                   union
                   SELECT  FIN.CODCONTA, rC.CodigoCentroCusto
                     FROM  PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
                    WHERE  FIN.CODCONTA = CT.CODCONTA
                      AND  CT.GRUPOCONTA >= 200
                      AND  FIN.CODFILIAL IN ('7')
                      AND  FIN.RECNUM = RC.RECNUM
                      AND  FIN.CODCONTA = RC.CODCONTA
                      AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO'
                      AND  FIN.dtcompetencia BETWEEN To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
                  ) CCC,
                 (  select codccprinc, (select descricao from PCCENTROCUSTO where codigocentrocusto = CCP.CodPrinc) as DescCCPrinc
                    FROM (select SUBSTR(codigocentrocusto,1,2) as CODCCPRINC, min(codigocentrocusto) as CodPrinc
                          from PCCENTROCUSTO where codigocentrocusto not like '%.%' group by SUBSTR(codigocentrocusto,1,2)) CCP) CCPrinc
           where par.codgruconta = CT.codconta (+)
             and ct.codconta = ccc.codconta (+)
             and ccc.codigocentrocusto = cc.codigocentrocusto (+)
             AND SUBSTR(cc.codigocentrocusto,1,2) = CCPrinc.codccprinc (+)
             and par.codgruconta > 0
           order by 1
           )
         union all
         SELECT ROWNUM+(select max(ID) from EPCPARDRE) as ID, to_char(codgrupo) as CODGRUCONTA, GRUPO, 'N' as INFCONTAS,  NULL as COR, '' as TIPOCONTA, '' as RESPONSAVEL, 'N' as AntesRO, 'N' as AntesLL, 'N' as AntesLF
           FROM (
                SELECT CODGRUPO, GRUPO, SUM(VPAGO) AS VPAGO, count(*) as qdeReg
                FROM (
 SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO
    FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC,
          ( select '99' as codccprinc, 'NÃO USA/NÃO INFORMADO' as DescCCPrinc FROM DUAL
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
    AND FIN.dtcompetencia BETWEEN To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
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
