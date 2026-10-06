-- dc80 — a consulta LITERAL da 9815, recortada para a conta 3000067
--
-- Copiada caractere por caractere do trace B_29.txt (01/10/2026 13:02:45), com UMA
-- linha a mais: o recorte na conta. Nada foi simplificado.
--
-- A medição de 01/10 que deu -149.459,80 foi feita com uma versão REESCRITA por mim,
-- e eu havia colapsado dois níveis do SELECT para contornar um ORA-00918. Se aquela
-- reescrita perdeu alguma condição no caminho, o número que estamos tratando como
-- "o que o banco entrega à 9815" pode nunca ter sido dela.
--
-- ESPERADO, se a nossa implementação estiver certa:  VLREALIZADO -149.459,80
-- ESPERADO, se a 9815 receber menos:                 VLREALIZADO -149.229,80
--
-- São R$ 230,00 de diferença, e é exatamente o que falta para a nossa linha fechar
-- com a dela nos DOIS fornecedores.
-- ATENCAO AO ALTER SESSION: ele NAO e enfeite.
--
-- A 9815 escreve To_Date(fin.dtpag, ''dd/mm/yyyy'') sobre uma coluna que ja e DATE. Isso
-- so funciona quando o NLS_DATE_FORMAT da sessao e exatamente dd/mm/yyyy: o Oracle
-- converte a data para texto com o formato da sessao antes de converter de volta. Com
-- qualquer outro formato -- o do SQL Developer traz hora -- sai ORA-01830.
--
-- A rotina depende do formato da sessao dela para nao quebrar. Nos nao copiamos isso, e
-- e por isso que a nossa consulta nao tem o To_Date.

ALTER SESSION SET NLS_DATE_FORMAT = 'dd/mm/yyyy';

SELECT  GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, sum(VLREALIZADO) as VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, sum(QdeReg) as QdeReg 
 FROM ( 
                SELECT to_number(decode(AntesLF,'N',CODCONTA,  NVL(codccprinc,99))) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg 
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
                 ) GROUP BY decode(AntesLF,'N',CODCONTA,  NVL(codccprinc,99)), AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO  

 ) GROUP BY GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO ORDER BY GRUPOCONTA;
