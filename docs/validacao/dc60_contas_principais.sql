-- dc60 — Trocar o agrupamento de dois dígitos por CONTA PRINCIPAL.
--
-- O QUE MUDA
--   Hoje o DRE agrupa o centro de custo pelos DOIS PRIMEIROS DÍGITOS:
--
--       SUBSTR(CodigoCentroCusto,1,2)          -- 2801, 2802, … 2831  →  "28"
--       min(CodigoCentroCusto) do grupo        -- o rótulo vem do 2801
--
--   Passa a agrupar pela CONTA PRINCIPAL:
--
--       o prefixo antes do ponto; sem ponto, o próprio código
--
--       2201.133 · 2201.106  →  2201   TRANSPORTES MATRIZ
--       2802                 →  2802   TRANSPORTE T CD UBERLANDIA   (linha nova)
--       9001                 →  9001   VERBAS MARGEM                (linha, como hoje)
--
--   As subcontas somem da grade e aparecem no detalhamento, ao clicar no valor.
--
-- A REGRA DE UMA LINHA SÓ, e por que ela basta
--   A primeira versão deste script partia de `recebe_lancto = 'N' AND ativo = 'S'` como
--   definição de conta principal, e esbarrava numa pergunta sem resposta: um centro LANÇÁVEL
--   sem ponto, como o 2802, não tem prefixo — a qual principal ele pertenceria?
--
--   O Gabriel respondeu em 22/09/2026 que é exatamente isso que as reuniões pediram: o
--   TRANSPORTE T CD UBERLANDIA deve aparecer como LINHA PRÓPRIA. Com isso o `recebe_lancto`
--   deixa de ser critério de agrupamento — ele descreve o cadastro, não o DRE — e sobra uma
--   regra só, que cobre todo centro por construção. Não existe lançamento sem linha.
--
--   Efeito colateral bem-vindo: o `9001` (VERBAS MARGEM) tem `recebe_lancto = 'S'` e cairia
--   fora pela regra antiga. Pela regra do prefixo ele é linha, como sempre foi.
--
-- O QUE AINDA PRECISA SER MEDIDO
--   1. quantas linhas o DRE passa a ter — o efeito mais visível;
--   2. se todo prefixo referenciado EXISTE no cadastro, senão a linha fica sem rótulo;
--   3. o tamanho do detalhamento de cada principal.
--
-- Tudo aqui é SELECT.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Quantas linhas o DRE passa a ter
-- ═══════════════════════════════════════════════════════════════════════════
-- Hoje x depois, contando só o que teve movimento no período.
SELECT COUNT(DISTINCT SUBSTR(RC.CodigoCentroCusto,1,2)) AS LINHAS_HOJE,
       COUNT(DISTINCT CASE WHEN INSTR(RC.CodigoCentroCusto,'.') > 0
                           THEN SUBSTR(RC.CodigoCentroCusto, 1, INSTR(RC.CodigoCentroCusto,'.') - 1)
                           ELSE RC.CodigoCentroCusto END) AS LINHAS_DEPOIS,
       COUNT(DISTINCT RC.CodigoCentroCusto)              AS CENTROS_DISTINTOS
  FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.RECNUM   = RC.RECNUM
   AND FIN.CODCONTA = RC.CODCONTA
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('7')
   AND FIN.DTPAGTO IS NOT NULL
   AND FIN.dtcompetencia BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy')
                             AND TO_DATE('31/08/2026','dd/mm/yyyy');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. As linhas novas, com valor — o "antes e depois" que vai para a tela
-- ═══════════════════════════════════════════════════════════════════════════
-- Cada linha daqui é uma linha do DRE novo. `LINHA_DE_HOJE` diz de onde o valor sai, para
-- conferir contra a grade atual: a soma das novas dentro de um mesmo grupo de dois dígitos
-- tem de dar exatamente a linha de hoje.
--
-- `SEM CADASTRO` na coluna NOME é o caso que quebra o rótulo — ver a consulta 3.
SELECT PAI,
       NVL((SELECT MIN(DESCRICAO) FROM PCCENTROCUSTO WHERE CODIGOCENTROCUSTO = PAI),
           'SEM CADASTRO  <-- linha sem rótulo') AS NOME,
       SUBSTR(PAI,1,2) AS DOIS_DIGITOS,
       (SELECT MIN(DESCRICAO) FROM PCCENTROCUSTO
         WHERE CODIGOCENTROCUSTO = (SELECT MIN(Y.CODIGOCENTROCUSTO) FROM PCCENTROCUSTO Y
                                     WHERE Y.CODIGOCENTROCUSTO NOT LIKE '%.%'
                                       AND SUBSTR(Y.CODIGOCENTROCUSTO,1,2) = SUBSTR(PAI,1,2))
       ) AS LINHA_DE_HOJE,
       SUM(LANCAMENTOS) AS LANCAMENTOS,
       SUM(TOTAL)       AS TOTAL
  FROM (
        SELECT CASE WHEN INSTR(RC.CodigoCentroCusto,'.') > 0
                    THEN SUBSTR(RC.CodigoCentroCusto, 1, INSTR(RC.CodigoCentroCusto,'.') - 1)
                    ELSE RC.CodigoCentroCusto
               END AS PAI,
               COUNT(*) AS LANCAMENTOS,
               SUM(NVL(RC.valor, FIN.VPAGO)) AS TOTAL
          FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
         WHERE FIN.CODCONTA = CT.CODCONTA
           AND FIN.RECNUM   = RC.RECNUM
           AND FIN.CODCONTA = RC.CODCONTA
           AND CT.GRUPOCONTA >= 200
           AND FIN.CODFILIAL IN ('7')
           AND FIN.DTPAGTO IS NOT NULL
           AND FIN.dtcompetencia BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy')
                                     AND TO_DATE('31/08/2026','dd/mm/yyyy')
         GROUP BY RC.CodigoCentroCusto
       )
 GROUP BY PAI
 ORDER BY SUBSTR(PAI,1,2), PAI;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Todo prefixo referenciado existe no cadastro?
-- ═══════════════════════════════════════════════════════════════════════════
-- O rótulo da linha passa a vir do REGISTRO do pai, e não mais do `min()` do grupo. Se uma
-- subconta `1234.001` existir sem que o `1234` exista, a linha fica sem nome.
--
-- Hoje isso não acontece porque o `min()` sempre encontra alguém no grupo de dois dígitos.
-- É uma fragilidade NOVA, criada pela mudança, e por isso vale conferir antes.
SELECT DISTINCT
       SUBSTR(CODIGOCENTROCUSTO, 1, INSTR(CODIGOCENTROCUSTO,'.') - 1) AS PAI_REFERENCIADO
  FROM PCCENTROCUSTO
 WHERE CODIGOCENTROCUSTO LIKE '%.%'
   AND NOT EXISTS (SELECT 1 FROM PCCENTROCUSTO P
                    WHERE P.CODIGOCENTROCUSTO =
                          SUBSTR(PCCENTROCUSTO.CODIGOCENTROCUSTO, 1,
                                 INSTR(PCCENTROCUSTO.CODIGOCENTROCUSTO,'.') - 1))
 ORDER BY 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. O tamanho do detalhamento
-- ═══════════════════════════════════════════════════════════════════════════
-- Quantas subcontas cada principal tem. Importa para a tela do duplo clique: o 2501 tem 27, e
-- a lista de hoje é bem menor.
SELECT SUBSTR(CODIGOCENTROCUSTO, 1, INSTR(CODIGOCENTROCUSTO,'.') - 1) AS PAI,
       (SELECT MIN(DESCRICAO) FROM PCCENTROCUSTO P
         WHERE P.CODIGOCENTROCUSTO = SUBSTR(PCCENTROCUSTO.CODIGOCENTROCUSTO, 1,
                                            INSTR(PCCENTROCUSTO.CODIGOCENTROCUSTO,'.') - 1)) AS NOME,
       COUNT(*) AS SUBCONTAS,
       SUM(CASE WHEN ATIVO = 'S' THEN 1 ELSE 0 END) AS ATIVAS
  FROM PCCENTROCUSTO
 WHERE CODIGOCENTROCUSTO LIKE '%.%'
 GROUP BY SUBSTR(CODIGOCENTROCUSTO, 1, INSTR(CODIGOCENTROCUSTO,'.') - 1)
 ORDER BY 3 DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. O cadastro inteiro dos centros sem ponto, para conferência
-- ═══════════════════════════════════════════════════════════════════════════
-- Todos viram linha quando tiverem movimento. `RECEBE_LANCTO` fica aqui só como informação do
-- cadastro — deixou de ser critério.
SELECT CODIGOCENTROCUSTO, DESCRICAO, RECEBE_LANCTO, ATIVO
  FROM PCCENTROCUSTO
 WHERE CODIGOCENTROCUSTO NOT LIKE '%.%'
 ORDER BY CODIGOCENTROCUSTO;

-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE FICA DECIDIDO, E O QUE FICA PENDENTE
-- ═══════════════════════════════════════════════════════════════════════════
--   DECIDIDO   a linha é o prefixo antes do ponto, ou o próprio código. Todo centro lançável
--              sem ponto vira linha própria -- pedido das reuniões.
--
--   PENDENTE   o VERBAS MARGEM (9001) fica COMO ESTÁ por enquanto, por decisão do Gabriel em
--              22/09/2026. Pela regra do prefixo ele já é linha própria, então não precisa de
--              código especial NENHUM hoje.
--
--              SE UM DIA QUISEREM TIRÁ-LO da grade, o caminho é o mesmo das informativas:
--              uma exclusão explícita por código no montador, e não uma mudança na regra de
--              agrupamento -- mexer na regra para tirar UMA linha derrubaria outras junto.
--              O tratamento especial dele no filtro por fornecedor (valor exclusivo, não
--              rateado) é assunto separado e vive em docs/FILTRO_FORNECEDOR.md.
