-- ============================================================================
-- INCREMENTO 5a - validacao da estrutura COM as contas orfas
-- Cenario: 01/08/2026 a 27/08/2026 | COMPETENCIA | Grupo de Contas | filiais 7,12,25
-- Rodar como SCRIPT (F5).
--
-- ORIGINAL: parametrizadas + TRES blocos de orfas (um por filial)
-- ADAPTADA: parametrizadas + UM bloco de orfas, com CODFILIAL IN (...)
--
-- RESULTADO ESPERADO: NENHUMA LINHA.
--
-- As orfas sao as contas com movimento no periodo que NAO estao parametrizadas
-- em EPCPARDRE. Sao elas que dao rotulo ao bloco final do DRE. Esperados:
--   Acerto De Estoque · Manutencao De Veiculos · PNEUS E CAMARAS
--   CREDITO FORNECEDORES · Estoque Em Poder De Tercerios · CONTRATO DE MUTUO
--
-- ATENCAO: este bloco le PCLANC direto, SEM o "DTPAGTO IS NOT NULL" que o
-- GetValorGrupo aplica. A estrutura pode entao listar uma conta cuja linha de
-- despesa nao existe — rotulo sem valor.
-- ============================================================================

ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY';

WITH original AS (
  SELECT min(ID) as ID, CODGRUCONTA, GRUPO, max(INFCONTAS) as INFCONTAS, max(cor) as COR, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL 
   FROM ( 
         select PAR.ID, 
                case when PAR.CODGRUCONTA <= 0 then  to_char(PAR.CODGRUCONTA) else to_Char(gr.codgrupo) end as CODGRUCONTA, 
                case when PAR.CODGRUCONTA <= 0 then PAR.GRUPO else gr.grupo end as GRUPO, PAR.INFCONTAS, PAR.COR, '' as TIPOCONTA, '' as RESPONSAVEL,  
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
    AND FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
         union all 
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
     AND  FIN.CODFILIAL IN ('12') 
     AND  FIN.RECNUM = RC.RECNUM (+) 
     AND  FIN.CODCONTA = RC.CODCONTA (+) 
     AND  CT.grupoconta = GR.codgrupo (+) 
     AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+) 
     AND  SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+) 
     AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) ) 
    AND FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
         union all 
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
     AND  FIN.CODFILIAL IN ('25') 
     AND  FIN.RECNUM = RC.RECNUM (+) 
     AND  FIN.CODCONTA = RC.CODCONTA (+) 
     AND  CT.grupoconta = GR.codgrupo (+) 
     AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+) 
     AND  SUBSTR(cc.CodigoCentroCusto,1,2) = CCPrinc.codccprinc (+) 
     AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) ) 
    AND FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
                 ) GROUP BY CODGRUPO, GRUPO 
             ORDER BY 1 
             ) 
              where VPAGO <> 0  or qdereg <> 0 
       )   
    group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL 
    order By ID 
),
adaptada AS (
  SELECT min(ID) as ID, CODGRUCONTA, GRUPO, max(INFCONTAS) as INFCONTAS, max(cor) as COR, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL 
   FROM ( 
         select PAR.ID, 
                case when PAR.CODGRUCONTA <= 0 then  to_char(PAR.CODGRUCONTA) else to_Char(gr.codgrupo) end as CODGRUCONTA, 
                case when PAR.CODGRUCONTA <= 0 then PAR.GRUPO else gr.grupo end as GRUPO, PAR.INFCONTAS, PAR.COR, '' as TIPOCONTA, '' as RESPONSAVEL,  
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
          ( select '99' as codccprinc, 'NÃO USA/NÃO INFORMADO' as DescCCPrinc FROM DUAL 
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
    AND FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
                 ) GROUP BY CODGRUPO, GRUPO 
             ORDER BY 1 
             ) 
              where VPAGO <> 0  or qdereg <> 0 
       )   
    group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL 
    order By ID 
)
SELECT NVL(o.CODGRUCONTA, a.CODGRUCONTA) AS CODGRUCONTA,
       NVL(o.GRUPO, a.GRUPO)             AS GRUPO,
       o.ID                              AS ID_ORIGINAL,
       a.ID                              AS ID_ADAPTADA,
       o.INFCONTAS                       AS INF_ORIGINAL,
       a.INFCONTAS                       AS INF_ADAPTADA,
       o.COR                             AS COR_ORIGINAL,
       a.COR                             AS COR_ADAPTADA
  FROM original o
  FULL OUTER JOIN adaptada a
    ON o.CODGRUCONTA = a.CODGRUCONTA
   AND o.GRUPO       = a.GRUPO
   AND o.ANTESRO     = a.ANTESRO
   AND o.ANTESLL     = a.ANTESLL
   AND o.ANTESLF     = a.ANTESLF
 WHERE o.CODGRUCONTA IS NULL
    OR a.CODGRUCONTA IS NULL
    OR NVL(o.ID,-1)        <> NVL(a.ID,-1)
    OR NVL(o.INFCONTAS,'#') <> NVL(a.INFCONTAS,'#')
    OR NVL(o.COR,-1)       <> NVL(a.COR,-1)
 ORDER BY 1, 2
