-- dc33 — a indenização nos três eixos, antes de decidir o desenho de Grupo de Contas
--
-- As três dimensões agrupam por objetos DIFERENTES, e hoje a nossa regra marca a linha
-- **pelo rótulo**:
--
--   Conta Gerencial     → a linha é uma CONTA            (`PCCONTA.CODCONTA`)
--   C. Custo Principal  → a linha é um CENTRO DE CUSTO   (`SUBSTR(CodigoCentroCusto,1,2)`)
--   Grupo de Contas     → a linha é um GRUPO             (`PCGRUPO.CODGRUPO`)
--
-- Nas duas primeiras existe um objeto chamado `INDENIZACAO DE MERC. VENC. E AVARIA`, e as
-- duas devolveram **exatamente** 177.168,06. Isso só acontece se os lançamentos da conta
-- forem os mesmos do centro de custo — o que é convenção de cadastro, não construção.
--
-- ── AS RESPOSTAS, medidas em 14/09/2026 ──
--
-- Os três objetos:
--
--   conta                 3000165  `INDENIZACAO DE MERC. VENC. E AVARIA`
--                                  (no cadastro do DRE, `EPCPARDRE` ID 1249, ela se chama
--                                   `Verba Indenização` — o rótulo da tela vem de `PCCONTA`)
--   grupo                     300  `Despesas Adm e Vendas`  ← onde ela some em Grupo de Contas
--   centros de custo   9701 e 9701.001, os dois com o mesmo nome, os dois sob o principal 97
--
-- **O grupo 300 no bloco pós-operacional é feito de três contas, e só três** (01/06 a
-- 31/07/2026, filiais 7/12/25):
--
--   Rateio Corporativo      1.530.298,70
--   Rateio Epoca ES            68.013,30   } = 1.598.312,00, o `RATEIO DESP. CORPORATIVAS`
--   INDENIZACAO ...           177.168,06     de C. Custo Principal, ao centavo
--   ───────────────────────────────────
--   grupo 300 (pós-op)      1.775.480,06
--
-- Extrair a indenização não deixa sobra: deixa o grupo valendo exatamente o rateio.
--
-- **Conta e centro de custo NÃO se cobrem** (bloco 3):
--
--   a CONTA inteira ..................... 75 lanç.   177.168,06
--   o CENTRO DE CUSTO inteiro ........... 76 lanç.   174.939,20
--   da conta, FORA do centro de custo ...  0         0,00        ✓
--   do centro de custo, em OUTRA conta ..  1        −2.228,86    ✗
--
-- Ressalva: esta sonda atribui centro de custo por um caminho MAIS SIMPLES que o do DRE, e
-- o DRE atribui esse lançamento de outro jeito — as duas dimensões devolvem 177.168,06
-- idênticos na dc32. Hoje elas coincidem; o que o bloco 3 mostra é que a coincidência é
-- **frágil**, não que já esteja quebrada.
--
-- Consequência de desenho: **C. Custo Principal tem o mesmo problema estrutural de Grupo de
-- Contas**, só que menor. Lá a linha também é um agregado — o principal 97, que junta 9701
-- e 9701.001 —, e marcar a linha inteira só é exato porque hoje nada mais cai nele.
--
-- (Os blocos 2 e 3 voltaram vazios na primeira rodada porque eu os escrevi com `0000` para
-- substituir à mão, e os valores só saem do bloco 1. Agora se viram sozinhos.)

-- ── 2. quantas contas dividem o grupo 300, e quanto cada uma pesa ────────────
-- Diz se extrair a conta deixa o grupo com cara de grupo ou com cara de sobra.
-- O recorte é o do cenário de referência: 01/06 a 31/07/2026, filiais 7/12/25, competência.
SELECT CT.CODCONTA,
       CT.CONTA,
       COUNT(FIN.RECNUM)                                  AS QDE_LANCAMENTOS,
       ROUND(SUM(NVL(RC.VALOR, FIN.VPAGO) * -1), 2)       AS VALOR
  FROM PCCONTA CT
  LEFT JOIN PCLANC FIN
         ON FIN.CODCONTA = CT.CODCONTA
        AND FIN.CODFILIAL IN ('7','12','25')
        AND NVL(FIN.DTCOMPETENCIA, FIN.DTVENC)
            BETWEEN To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
        AND FIN.DTPAGTO IS NOT NULL
  LEFT JOIN PCRATEIOCENTROCUSTO RC
         ON RC.RECNUM = FIN.RECNUM AND RC.CODCONTA = FIN.CODCONTA
 WHERE CT.GRUPOCONTA = (SELECT CT2.GRUPOCONTA FROM PCCONTA CT2
                         WHERE CT2.CONTA = 'INDENIZACAO DE MERC. VENC. E AVARIA'
                           AND ROWNUM = 1)
 GROUP BY CT.CODCONTA, CT.CONTA
 ORDER BY 4;


-- ── 3. a conta e o centro de custo são a MESMA coisa? ───────────────────────
-- O bloco que decide se a regra pode virar "por conta" sem mudar número nenhum em
-- C. Custo Principal.
--
-- As duas primeiras linhas têm que dar IGUAL, e as duas últimas têm que dar ZERO. Se der,
-- conta e centro de custo se cobrem e o eixo pode mudar sem efeito colateral. Se não der,
-- trocar o eixo MUDA o valor excluído — e isso vira decisão sua, não detalhe de
-- implementação.
WITH ALVO AS (
  SELECT (SELECT CT.CODCONTA FROM PCCONTA CT
           WHERE CT.CONTA = 'INDENIZACAO DE MERC. VENC. E AVARIA' AND ROWNUM = 1) AS CODCONTA,
         (SELECT SUBSTR(CC.CODIGOCENTROCUSTO, 1, 2) FROM PCCENTROCUSTO CC
           WHERE CC.DESCRICAO = 'INDENIZACAO DE MERC. VENC. E AVARIA' AND ROWNUM = 1) AS CCPRINC
    FROM DUAL
), MOV AS (
  SELECT FIN.RECNUM,
         FIN.CODCONTA,
         NVL(SUBSTR(RC.CODIGOCENTROCUSTO, 1, 2), '99')      AS CCPRINC,
         NVL(RC.VALOR, FIN.VPAGO) * -1                       AS VALOR
    FROM PCLANC FIN
    LEFT JOIN PCRATEIOCENTROCUSTO RC
           ON RC.RECNUM = FIN.RECNUM AND RC.CODCONTA = FIN.CODCONTA
   WHERE FIN.CODFILIAL IN ('7','12','25')
     AND NVL(FIN.DTCOMPETENCIA, FIN.DTVENC)
         BETWEEN To_Date('01/06/2026','dd/mm/yyyy') AND To_Date('31/07/2026','dd/mm/yyyy')
     AND FIN.DTPAGTO IS NOT NULL
)
SELECT 'a CONTA inteira'                              AS RECORTE,
       COUNT(*) AS QDE, ROUND(SUM(VALOR), 2) AS VALOR FROM MOV, ALVO
 WHERE MOV.CODCONTA = ALVO.CODCONTA
UNION ALL
SELECT 'o CENTRO DE CUSTO inteiro',
       COUNT(*), ROUND(SUM(VALOR), 2) FROM MOV, ALVO
 WHERE MOV.CCPRINC = ALVO.CCPRINC
UNION ALL
SELECT '>>> da conta, FORA do centro de custo (tem que ser 0)',
       COUNT(*), ROUND(NVL(SUM(VALOR), 0), 2) FROM MOV, ALVO
 WHERE MOV.CODCONTA = ALVO.CODCONTA AND MOV.CCPRINC <> ALVO.CCPRINC
UNION ALL
SELECT '>>> do centro de custo, em OUTRA conta (tem que ser 0)',
       COUNT(*), ROUND(NVL(SUM(VALOR), 0), 2) FROM MOV, ALVO
 WHERE MOV.CCPRINC = ALVO.CCPRINC AND MOV.CODCONTA <> ALVO.CODCONTA;


-- ── 4. os dois objetos, para o registro ─────────────────────────────────────
-- Já rodado: conta 3000165 / grupo 300 `Despesas Adm e Vendas` / centro de custo 9701,
-- principal 97. Fica aqui para a próxima pessoa não ter de descobrir de novo.
SELECT 'CONTA'  AS OBJETO, TO_CHAR(CT.CODCONTA) AS CODIGO, CT.CONTA AS DESCRICAO,
       TO_CHAR(CT.GRUPOCONTA) AS PAI
  FROM PCCONTA CT WHERE CT.CONTA = 'INDENIZACAO DE MERC. VENC. E AVARIA'
UNION ALL
SELECT 'CENTRO DE CUSTO', CC.CODIGOCENTROCUSTO, CC.DESCRICAO,
       SUBSTR(CC.CODIGOCENTROCUSTO, 1, 2)
  FROM PCCENTROCUSTO CC WHERE CC.DESCRICAO = 'INDENIZACAO DE MERC. VENC. E AVARIA'
UNION ALL
SELECT 'GRUPO', TO_CHAR(GR.CODGRUPO), GR.GRUPO, NULL
  FROM PCGRUPO GR
 WHERE GR.CODGRUPO = (SELECT CT.GRUPOCONTA FROM PCCONTA CT
                       WHERE CT.CONTA = 'INDENIZACAO DE MERC. VENC. E AVARIA' AND ROWNUM = 1);
