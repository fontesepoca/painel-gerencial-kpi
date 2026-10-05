-- dc84 — a nossa consulta COMPLETA, filtrada so na saida
--
-- A dc83 (com AND FIN.CODCONTA = 3000067 dentro do WHERE) devolveu 346 / -152.019,72,
-- igual a consulta literal da 9815. Mas NEM NOS NEM ELA exibimos esse valor:
--
--   formula sobre -152.019,72 .... -13.382,74
--   nos exibimos ................. -13.172,30   (base implicita -149.459,77)
--   a 9815 exibe ................. -13.153,40   (base implicita -149.229,86)
--
-- Ou seja: o recorte que eu acrescentei MUDOU o resultado. Na consulta completa essa
-- linha recebe menos do que recebe quando a conta e filtrada dentro do WHERE -- o que
-- so pode acontecer se parte dos lancamentos da conta for para OUTRO GRUPOCONTA.
--
-- Esta e a mesma consulta SEM o recorte interno, com o filtro aplicado so na saida.
-- E exatamente o que a API executa.
--
-- 346 / -152.019,72  ->  a consulta devolve tudo; o defeito e depois dela
-- 345 / -149.459,80  ->  a consulta completa ja perde, e a causa e o agrupamento

SELECT * FROM (
SELECT  GRUPOCONTA AS GRUPOCONTA, AntesRO AS ANTESRO, AntesLL AS ANTESLL, AntesLF AS ANTESLF, MES_ANO AS MESANO, MES AS MES, ANO AS ANO, sum(VLREALIZADO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) AS VPAGOEXCLUSIVOFORNEC, sum(QdeReg) AS QDEREG
         FROM (
         SELECT  decode(AntesLF,'N',to_char(CODCONTA),  NVL(codccprinc,'99')) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg
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
                  case when ((CCPrinc.codccprinc IN (90) AND FIN.CODFORNEC IN (29)) or EXISTS (SELECT 1 FROM TAB_WEB_CENTROC_FORNEC D WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%' AND D.DTINATIVACAO IS NULL AND D.CODFORNEC IN (29))) then DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) else 0 end as VPAGO_EXCLUSIVO_FORNEC,
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
             AND ( NOT EXISTS (SELECT 1 FROM TAB_WEB_CENTROC_FORNEC D WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%' AND D.DTINATIVACAO IS NULL)
                   OR EXISTS (SELECT 1 FROM TAB_WEB_CENTROC_FORNEC D WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%' AND D.DTINATIVACAO IS NULL AND D.CODFORNEC IN (29)) )
            AND FIN.dtcompetencia BETWEEN To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('31/08/2026','dd/mm/yyyy')
         AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR)
                         ) GROUP BY  decode(AntesLF,'N',to_char(CODCONTA),  NVL(codccprinc,'99')), AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
         union all
         select '85' as GRUPOCONTA,
                'N' as AntesRO, 'S' as AntesLL,  'S' as AntesLF, TO_CHAR(FIN.dtpag,'mm/yyyy') as MES_ANO,
                TO_CHAR(FIN.dtpag,'mm') as MES,
                extract(YEAR FROM FIN.dtpag) as ANO, fin.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg
           from pcnfsaid nf, pcprest fin
          where nf.numnota = fin.duplic
            and nf.numtransvenda  = fin.numtransvenda
            and condvenda = 0 and nf.vltotal > 0 and nvl(nf.obs,'X') not like '%CANCELADA%' and nf.dthoracancelamentosefaz is null
            and fin.codcob <> 'DESD' and fin.dtcancel is null
            and fin.dtpag BETWEEN To_Date('01/08/2026','dd/mm/yyyy') AND To_Date('31/08/2026','dd/mm/yyyy')
            and nf.codfilial IN ('7')
        ) GROUP BY GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
        
) WHERE GRUPOCONTA = '3000067';
