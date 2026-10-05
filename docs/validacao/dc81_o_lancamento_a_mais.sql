-- dc81 — o lancamento a mais: a 9815 traz 346 onde nos trazemos 345
--
-- A dc80 mostrou que a consulta LITERAL da rotina devolve, para a conta 3000067:
--
--     VLREALIZADO -152.019,72   ·   EXCLUSIVO -965,18   ·   346 registros
--
-- A nossa devolve -149.459,80 com 345. A diferenca de valor e -2.559,92, que e, ao
-- centavo, UM lancamento que nos ja temos: o RECNUM 20734126, centro 4101.050,
-- "PARC. 01/03 PCS P/ MANUT. DE VEICULO".
--
-- Ou a consulta dela conta esse lancamento DUAS vezes, ou existe um segundo lancamento
-- de mesmo valor que a nossa perde. As duas respostas levam a lugares diferentes, e
-- esta consulta separa uma da outra: ela e o bloco INTERNO da dc80, sem agregacao.
--
-- Rode na mesma sessao do ALTER SESSION da dc80.

SELECT RECNUM, CODCENTROCUSTO, codccprinc, VPAGO, COUNT(*) AS VEZES
  FROM (  SELECT  FIN.RECNUM, FIN.CODFILIAL, CCPrinc.codccprinc, CCPrinc.DescCCPrinc,  
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
          case when (CCPrinc.codccprinc IN (90) AND FIN.CODFORNEC IN (29)) 
                  or (CCPrinc.codccprinc = 25  and 29 in (29)) 
                THEN  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) else 0 end as VPAGO_EXCLUSIVO_FORNEC, 
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
     AND (  (CCPrinc.codccprinc IN (90) AND FIN.CODFORNEC IN (29)) OR (CCPrinc.codccprinc NOT IN (90)) ) 
     AND ( (CCPrinc.codccprinc = 25  and 29 in (29)) or (CCPrinc.codccprinc <> 25) ) 
    AND FIN.dtcompetencia Between To_Date('01/08/2026','dd/mm/yyyy')  AND  To_Date('31/08/2026','dd/mm/yyyy')
 AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR)
 AND FIN.CODCONTA = 3000067   -- <<< o recorte, a unica linha acrescentada 
       )
 WHERE ABS(VPAGO) BETWEEN 2559 AND 2561
 GROUP BY RECNUM, CODCENTROCUSTO, codccprinc, VPAGO
 ORDER BY RECNUM;
