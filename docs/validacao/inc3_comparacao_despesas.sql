-- ============================================================================
-- INCREMENTO 3 - validacao da consulta de despesas (GetValorGrupo)
-- Cenario: 01/08/2026 a 27/08/2026 | COMPETENCIA | Grupo de Contas | filiais 7, 12, 25
--
-- COMO RODAR: execute como SCRIPT (F5), nao statement a statement (Ctrl+Enter).
-- O ALTER SESSION abaixo e obrigatorio para o bloco "original" funcionar.
--
-- POR QUE: a 9815 usa TO_CHAR(To_Date(<coluna DATE>,'dd/mm/yyyy'),'mm/yyyy').
-- Aplicar TO_DATE sobre uma coluna que ja e DATE forca o Oracle a converter
-- para texto antes, usando o NLS_DATE_FORMAT da sessao. No FireDAC o formato
-- era dd/mm/yyyy e funcionava; em outra sessao da ORA-01830.
--
-- O bloco "adaptada" nao tem esse round-trip: usa TO_CHAR(<data>,'mm/yyyy')
-- direto, que e equivalente e independe de NLS.
--
-- Diferencas testadas de uma vez:
--   1. tres blocos UNION ALL por filial  ->  um bloco com CODFILIAL IN (...)
--   2. TO_NUMBER na chave                ->  TO_CHAR
--   3. round-trip TO_DATE/TO_CHAR        ->  TO_CHAR direto
--
-- RESULTADO ESPERADO: NENHUMA LINHA. Qualquer linha e uma divergencia.
--
-- ATENCAO: a chave de uma linha do DRE e
--   (GRUPOCONTA, ANTESRO, ANTESLL, ANTESLF, MES_ANO)
-- e nao apenas GRUPOCONTA. O mesmo grupo aparece duas vezes no relatorio,
-- antes e depois do RESULTADO OPERACIONAL, com flags diferentes. Juntar so
-- por GRUPOCONTA cruza as combinacoes e produz falsas divergencias.
-- ============================================================================

ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY';

WITH original AS (
 SELECT  GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, sum(VLREALIZADO) as VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, sum(QdeReg) as QdeReg 
 FROM ( 
 SELECT  to_number(decode(AntesLF,'N',CODCONTA,  codgrupo)) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg 
                FROM ( 
  SELECT  FIN.RECNUM, FIN.CODFILIAL, CCPrinc.codccprinc, CCPrinc.DescCCPrinc,  
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL'))  then 'S' else 'N' end as AntesRO, 
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLL, 
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLF, 
          DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.CodigoCentroCusto,9998),9999) , NVL(CC.CodigoCentroCusto,9998)) as CODCENTROCUSTO, 
          DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.DESCRICAO,'NÃO INFORMADO'),'NÃO USA CENTRO DE CUSTO') ,NVL(CC.DESCRICAO,'NÃO INFORMADO')) as DESCCENTROCUSTO,  
          GR.codgrupo, GR.GRUPO, FIN.CODCONTA, CT.CONTA, 
          FIN.numtrans, FIN.NUMNOTA, FIN.Duplic, FIN.codprojeto, FIN.dtcompetencia, 
          TO_CHAR(To_Date(nvl(FIN.DTCOMPETENCIA,fin.DTVENC),'dd/mm/yyyy'),'mm/yyyy') as MES_ANO, 
          TO_CHAR(To_Date(nvl(FIN.DTCOMPETENCIA,fin.DTVENC),'dd/mm/yyyy'),'mm') as MES, 
          extract(YEAR FROM nvl(FIN.DTCOMPETENCIA,fin.DTVENC)) as ANO, 
          SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) HISTORICO, 
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO,  
          0 as VPAGO_EXCLUSIVO_FORNEC, 
          FIN.DTPAGTO, FIN.NUMBANCO,FIN.NumCheque,FIN.numbordero,FIN.numseqbordero, FIN.NUMCHEQUE2, 
          FIN.LOCALIZACAO, FIN.NOMEFUNC, 
          DECODE(FIN.TIPOPARCEIRO, 
            'F', (SELECT FORNECEDOR FROM PCFORNEC WHERE CODFORNEC = FIN.CODFORNEC), 
            'R', (SELECT NOME FROM PCUSUARI WHERE CODUSUR = FIN.CODFORNEC), 
            'C', (SELECT CLIENTE FROM PCCLIENT WHERE CODCLI = FIN.CODFORNEC), 
            'OUTROS') AS  FORNECEDOR, 
          FIN.DTRECLASSIFIC, FIN.CODFUNCRECLASSIFIC, 
          (SELECT NOME FROM PCEMPR WHERE MATRICULA = FIN.CODFUNCBAIXA) NOMEFUNCBAIXA 
    FROM  PCCONTA CT, PCGRUPO GR, PCCENTROCUSTO CC, 
PCRATEIOCENTROCUSTO RC, 
          (select RECNUM, CODFILIAL, numtrans, NUMNOTA, Duplic, codprojeto, dtcompetencia, DTVENC, DTPAGTO, nvl(VPAGO,VALOR) as VPAGO, INDICE, 
 codconta, 
                  TIPOPARCEIRO, DTRECLASSIFIC, CODFUNCRECLASSIFIC, historico, HISTORICO2, 
                  NUMBANCO, NumCheque, numbordero, numseqbordero, NUMCHEQUE2, LOCALIZACAO, NOMEFUNC, CODFORNEC, CODFUNCBAIXA 
             from PCLANC
            WHERE DTPAGTO IS NOT NULL 
          ) FIN, 
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
     AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO' 
     AND not exists (select recnumadiantamento from pclancadiantfornec where recnumpagto is not null and dtestorno is null and recnumadiantamento = fin.recnum) 
    AND FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
 AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR) 
                 ) GROUP BY  to_number(decode(AntesLF,'N',CODCONTA,  codgrupo)), AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO  
 union all 
 select 400 as GRUPOCONTA,  
        'N' as AntesRO, 'S' as AntesLL,  'S' as AntesLF, TO_CHAR(To_Date(FIN.dtpag,'dd/mm/yyyy'),'mm/yyyy') as MES_ANO, 
        TO_CHAR(To_Date(FIN.dtpag,'dd/mm/yyyy'),'mm') as MES, 
        extract(YEAR FROM FIN.dtpag) as ANO, fin.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg  
   from pcnfsaid nf, pcprest fin 
  where nf.numnota = fin.duplic 
    and nf.numtransvenda  = fin.numtransvenda 
    and condvenda = 0 and nf.vltotal > 0 and nvl(nf.obs,'X') not like '%CANCELADA%' and nf.dthoracancelamentosefaz is null 
    and fin.codcob <> 'DESD' and fin.dtcancel is null 
    and fin.dtpag Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
    and nf.codfilial IN ('7') 
 UNION ALL 
 SELECT  to_number(decode(AntesLF,'N',CODCONTA,  codgrupo)) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg 
                FROM ( 
  SELECT  FIN.RECNUM, FIN.CODFILIAL, CCPrinc.codccprinc, CCPrinc.DescCCPrinc,  
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL'))  then 'S' else 'N' end as AntesRO, 
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLL, 
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLF, 
          DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.CodigoCentroCusto,9998),9999) , NVL(CC.CodigoCentroCusto,9998)) as CODCENTROCUSTO, 
          DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.DESCRICAO,'NÃO INFORMADO'),'NÃO USA CENTRO DE CUSTO') ,NVL(CC.DESCRICAO,'NÃO INFORMADO')) as DESCCENTROCUSTO,  
          GR.codgrupo, GR.GRUPO, FIN.CODCONTA, CT.CONTA, 
          FIN.numtrans, FIN.NUMNOTA, FIN.Duplic, FIN.codprojeto, FIN.dtcompetencia, 
          TO_CHAR(To_Date(nvl(FIN.DTCOMPETENCIA,fin.DTVENC),'dd/mm/yyyy'),'mm/yyyy') as MES_ANO, 
          TO_CHAR(To_Date(nvl(FIN.DTCOMPETENCIA,fin.DTVENC),'dd/mm/yyyy'),'mm') as MES, 
          extract(YEAR FROM nvl(FIN.DTCOMPETENCIA,fin.DTVENC)) as ANO, 
          SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) HISTORICO, 
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO,  
          0 as VPAGO_EXCLUSIVO_FORNEC, 
          FIN.DTPAGTO, FIN.NUMBANCO,FIN.NumCheque,FIN.numbordero,FIN.numseqbordero, FIN.NUMCHEQUE2, 
          FIN.LOCALIZACAO, FIN.NOMEFUNC, 
          DECODE(FIN.TIPOPARCEIRO, 
            'F', (SELECT FORNECEDOR FROM PCFORNEC WHERE CODFORNEC = FIN.CODFORNEC), 
            'R', (SELECT NOME FROM PCUSUARI WHERE CODUSUR = FIN.CODFORNEC), 
            'C', (SELECT CLIENTE FROM PCCLIENT WHERE CODCLI = FIN.CODFORNEC), 
            'OUTROS') AS  FORNECEDOR, 
          FIN.DTRECLASSIFIC, FIN.CODFUNCRECLASSIFIC, 
          (SELECT NOME FROM PCEMPR WHERE MATRICULA = FIN.CODFUNCBAIXA) NOMEFUNCBAIXA 
    FROM  PCCONTA CT, PCGRUPO GR, PCCENTROCUSTO CC, 
PCRATEIOCENTROCUSTO RC, 
          (select RECNUM, CODFILIAL, numtrans, NUMNOTA, Duplic, codprojeto, dtcompetencia, DTVENC, DTPAGTO, nvl(VPAGO,VALOR) as VPAGO, INDICE, 
 codconta, 
                  TIPOPARCEIRO, DTRECLASSIFIC, CODFUNCRECLASSIFIC, historico, HISTORICO2, 
                  NUMBANCO, NumCheque, numbordero, numseqbordero, NUMCHEQUE2, LOCALIZACAO, NOMEFUNC, CODFORNEC, CODFUNCBAIXA 
             from PCLANC
            WHERE DTPAGTO IS NOT NULL 
          ) FIN, 
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
     AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO' 
     AND not exists (select recnumadiantamento from pclancadiantfornec where recnumpagto is not null and dtestorno is null and recnumadiantamento = fin.recnum) 
    AND FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
 AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR) 
                 ) GROUP BY  to_number(decode(AntesLF,'N',CODCONTA,  codgrupo)), AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO  
 union all 
 select 400 as GRUPOCONTA,  
        'N' as AntesRO, 'S' as AntesLL,  'S' as AntesLF, TO_CHAR(To_Date(FIN.dtpag,'dd/mm/yyyy'),'mm/yyyy') as MES_ANO, 
        TO_CHAR(To_Date(FIN.dtpag,'dd/mm/yyyy'),'mm') as MES, 
        extract(YEAR FROM FIN.dtpag) as ANO, fin.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg  
   from pcnfsaid nf, pcprest fin 
  where nf.numnota = fin.duplic 
    and nf.numtransvenda  = fin.numtransvenda 
    and condvenda = 0 and nf.vltotal > 0 and nvl(nf.obs,'X') not like '%CANCELADA%' and nf.dthoracancelamentosefaz is null 
    and fin.codcob <> 'DESD' and fin.dtcancel is null 
    and fin.dtpag Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
    and nf.codfilial IN ('12') 
 UNION ALL 
 SELECT  to_number(decode(AntesLF,'N',CODCONTA,  codgrupo)) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg 
                FROM ( 
  SELECT  FIN.RECNUM, FIN.CODFILIAL, CCPrinc.codccprinc, CCPrinc.DescCCPrinc,  
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL'))  then 'S' else 'N' end as AntesRO, 
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLL, 
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLF, 
          DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.CodigoCentroCusto,9998),9999) , NVL(CC.CodigoCentroCusto,9998)) as CODCENTROCUSTO, 
          DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.DESCRICAO,'NÃO INFORMADO'),'NÃO USA CENTRO DE CUSTO') ,NVL(CC.DESCRICAO,'NÃO INFORMADO')) as DESCCENTROCUSTO,  
          GR.codgrupo, GR.GRUPO, FIN.CODCONTA, CT.CONTA, 
          FIN.numtrans, FIN.NUMNOTA, FIN.Duplic, FIN.codprojeto, FIN.dtcompetencia, 
          TO_CHAR(To_Date(nvl(FIN.DTCOMPETENCIA,fin.DTVENC),'dd/mm/yyyy'),'mm/yyyy') as MES_ANO, 
          TO_CHAR(To_Date(nvl(FIN.DTCOMPETENCIA,fin.DTVENC),'dd/mm/yyyy'),'mm') as MES, 
          extract(YEAR FROM nvl(FIN.DTCOMPETENCIA,fin.DTVENC)) as ANO, 
          SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) HISTORICO, 
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO,  
          0 as VPAGO_EXCLUSIVO_FORNEC, 
          FIN.DTPAGTO, FIN.NUMBANCO,FIN.NumCheque,FIN.numbordero,FIN.numseqbordero, FIN.NUMCHEQUE2, 
          FIN.LOCALIZACAO, FIN.NOMEFUNC, 
          DECODE(FIN.TIPOPARCEIRO, 
            'F', (SELECT FORNECEDOR FROM PCFORNEC WHERE CODFORNEC = FIN.CODFORNEC), 
            'R', (SELECT NOME FROM PCUSUARI WHERE CODUSUR = FIN.CODFORNEC), 
            'C', (SELECT CLIENTE FROM PCCLIENT WHERE CODCLI = FIN.CODFORNEC), 
            'OUTROS') AS  FORNECEDOR, 
          FIN.DTRECLASSIFIC, FIN.CODFUNCRECLASSIFIC, 
          (SELECT NOME FROM PCEMPR WHERE MATRICULA = FIN.CODFUNCBAIXA) NOMEFUNCBAIXA 
    FROM  PCCONTA CT, PCGRUPO GR, PCCENTROCUSTO CC, 
PCRATEIOCENTROCUSTO RC, 
          (select RECNUM, CODFILIAL, numtrans, NUMNOTA, Duplic, codprojeto, dtcompetencia, DTVENC, DTPAGTO, nvl(VPAGO,VALOR) as VPAGO, INDICE, 
 codconta, 
                  TIPOPARCEIRO, DTRECLASSIFIC, CODFUNCRECLASSIFIC, historico, HISTORICO2, 
                  NUMBANCO, NumCheque, numbordero, numseqbordero, NUMCHEQUE2, LOCALIZACAO, NOMEFUNC, CODFORNEC, CODFUNCBAIXA 
             from PCLANC
            WHERE DTPAGTO IS NOT NULL 
          ) FIN, 
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
     AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO' 
     AND not exists (select recnumadiantamento from pclancadiantfornec where recnumpagto is not null and dtestorno is null and recnumadiantamento = fin.recnum) 
    AND FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
 AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR) 
                 ) GROUP BY  to_number(decode(AntesLF,'N',CODCONTA,  codgrupo)), AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO  
 union all 
 select 400 as GRUPOCONTA,  
        'N' as AntesRO, 'S' as AntesLL,  'S' as AntesLF, TO_CHAR(To_Date(FIN.dtpag,'dd/mm/yyyy'),'mm/yyyy') as MES_ANO, 
        TO_CHAR(To_Date(FIN.dtpag,'dd/mm/yyyy'),'mm') as MES, 
        extract(YEAR FROM FIN.dtpag) as ANO, fin.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg  
   from pcnfsaid nf, pcprest fin 
  where nf.numnota = fin.duplic 
    and nf.numtransvenda  = fin.numtransvenda 
    and condvenda = 0 and nf.vltotal > 0 and nvl(nf.obs,'X') not like '%CANCELADA%' and nf.dthoracancelamentosefaz is null 
    and fin.codcob <> 'DESD' and fin.dtcancel is null 
    and fin.dtpag Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
    and nf.codfilial IN ('25') 
 ) GROUP BY GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO ORDER BY GRUPOCONTA 
),
adaptada AS (
 SELECT  GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, sum(VLREALIZADO) as VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, sum(QdeReg) as QdeReg 
 FROM ( 
 SELECT  to_char(decode(AntesLF,'N',CODCONTA,  codgrupo)) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg 
                FROM ( 
  SELECT  FIN.RECNUM, FIN.CODFILIAL, CCPrinc.codccprinc, CCPrinc.DescCCPrinc,  
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL'))  then 'S' else 'N' end as AntesRO, 
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLL, 
          case  
                when FIN.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0 
                and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLF, 
          DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.CodigoCentroCusto,9998),9999) , NVL(CC.CodigoCentroCusto,9998)) as CODCENTROCUSTO, 
          DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.DESCRICAO,'NÃO INFORMADO'),'NÃO USA CENTRO DE CUSTO') ,NVL(CC.DESCRICAO,'NÃO INFORMADO')) as DESCCENTROCUSTO,  
          GR.codgrupo, GR.GRUPO, FIN.CODCONTA, CT.CONTA, 
          FIN.numtrans, FIN.NUMNOTA, FIN.Duplic, FIN.codprojeto, FIN.dtcompetencia, 
          TO_CHAR(nvl(FIN.DTCOMPETENCIA,fin.DTVENC),'mm/yyyy') as MES_ANO, 
          TO_CHAR(nvl(FIN.DTCOMPETENCIA,fin.DTVENC),'mm') as MES, 
          extract(YEAR FROM nvl(FIN.DTCOMPETENCIA,fin.DTVENC)) as ANO, 
          SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) HISTORICO, 
          DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO,  
          0 as VPAGO_EXCLUSIVO_FORNEC, 
          FIN.DTPAGTO, FIN.NUMBANCO,FIN.NumCheque,FIN.numbordero,FIN.numseqbordero, FIN.NUMCHEQUE2, 
          FIN.LOCALIZACAO, FIN.NOMEFUNC, 
          DECODE(FIN.TIPOPARCEIRO, 
            'F', (SELECT FORNECEDOR FROM PCFORNEC WHERE CODFORNEC = FIN.CODFORNEC), 
            'R', (SELECT NOME FROM PCUSUARI WHERE CODUSUR = FIN.CODFORNEC), 
            'C', (SELECT CLIENTE FROM PCCLIENT WHERE CODCLI = FIN.CODFORNEC), 
            'OUTROS') AS  FORNECEDOR, 
          FIN.DTRECLASSIFIC, FIN.CODFUNCRECLASSIFIC, 
          (SELECT NOME FROM PCEMPR WHERE MATRICULA = FIN.CODFUNCBAIXA) NOMEFUNCBAIXA 
    FROM  PCCONTA CT, PCGRUPO GR, PCCENTROCUSTO CC, 
PCRATEIOCENTROCUSTO RC, 
          (select RECNUM, CODFILIAL, numtrans, NUMNOTA, Duplic, codprojeto, dtcompetencia, DTVENC, DTPAGTO, nvl(VPAGO,VALOR) as VPAGO, INDICE, 
 codconta, 
                  TIPOPARCEIRO, DTRECLASSIFIC, CODFUNCRECLASSIFIC, historico, HISTORICO2, 
                  NUMBANCO, NumCheque, numbordero, numseqbordero, NUMCHEQUE2, LOCALIZACAO, NOMEFUNC, CODFORNEC, CODFUNCBAIXA 
             from PCLANC
            WHERE DTPAGTO IS NOT NULL 
          ) FIN, 
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
     AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO' 
     AND not exists (select recnumadiantamento from pclancadiantfornec where recnumpagto is not null and dtestorno is null and recnumadiantamento = fin.recnum) 
    AND FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
 AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR) 
                 ) GROUP BY  to_char(decode(AntesLF,'N',CODCONTA,  codgrupo)), AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO  
 union all 
 select '400' as GRUPOCONTA,  
        'N' as AntesRO, 'S' as AntesLL,  'S' as AntesLF, TO_CHAR(FIN.dtpag,'mm/yyyy') as MES_ANO, 
        TO_CHAR(FIN.dtpag,'mm') as MES, 
        extract(YEAR FROM FIN.dtpag) as ANO, fin.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg  
   from pcnfsaid nf, pcprest fin 
  where nf.numnota = fin.duplic 
    and nf.numtransvenda  = fin.numtransvenda 
    and condvenda = 0 and nf.vltotal > 0 and nvl(nf.obs,'X') not like '%CANCELADA%' and nf.dthoracancelamentosefaz is null 
    and fin.codcob <> 'DESD' and fin.dtcancel is null 
    and fin.dtpag Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('27/08/2026','dd/mm/yyyy')
    and nf.codfilial IN ('7','12','25') 
) GROUP BY GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
)
SELECT NVL(TO_CHAR(o.GRUPOCONTA), a.GRUPOCONTA) AS GRUPOCONTA,
       NVL(o.MES_ANO, a.MES_ANO)                AS MES_ANO,
       NVL(o.ANTESRO, a.ANTESRO)                AS ANTESRO,
       NVL(o.ANTESLL, a.ANTESLL)                AS ANTESLL,
       NVL(o.ANTESLF, a.ANTESLF)                AS ANTESLF,
       o.VLREALIZADO                            AS VL_ORIGINAL,
       a.VLREALIZADO                            AS VL_ADAPTADA,
       NVL(o.VLREALIZADO,0) - NVL(a.VLREALIZADO,0) AS DIFERENCA,
       o.QDEREG                                 AS QDE_ORIGINAL,
       a.QDEREG                                 AS QDE_ADAPTADA
  FROM original o
  FULL OUTER JOIN adaptada a
    ON TO_CHAR(o.GRUPOCONTA) = a.GRUPOCONTA
   AND o.MES_ANO = a.MES_ANO
   AND o.ANTESRO = a.ANTESRO
   AND o.ANTESLL = a.ANTESLL
   AND o.ANTESLF = a.ANTESLF
 WHERE o.GRUPOCONTA IS NULL
    OR a.GRUPOCONTA IS NULL
    OR ABS(NVL(o.VLREALIZADO,0) - NVL(a.VLREALIZADO,0)) > 0.005
    OR NVL(o.QDEREG,-1) <> NVL(a.QDEREG,-1)
 ORDER BY 1, 2
