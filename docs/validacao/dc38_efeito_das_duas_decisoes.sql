-- dc38 — quem as duas decisões deixam de fora
--
-- Decisões do Gabriel em 15/09/2026, depois da dc31:
--
--   1. O login identifica a pessoa **só por NOME_GUERRA**. Matrícula e código de barras
--      deixam de ser aceitos, o que elimina na origem as 44 colisões em que o nome de guerra
--      de uma pessoa é a matrícula de outra.
--   2. Só entra quem tem **SITUACAO = 'A'**, com mensagem própria para quem for barrado.
--
-- As duas restringem, e restringir acesso é o tipo de mudança que ninguém percebe até a
-- pessoa errada não conseguir entrar. Esta dc mede exatamente quem fica de fora — e o
-- primeiro bloco é o que pode derrubar a decisão 2 inteira.


-- ── 1. AS NOVE PESSOAS DA 9995 PASSARIAM? ────────────────────────────────────
-- Rode este primeiro. Se alguma delas estiver como 'I', o campo `SITUACAO` não significa o
-- que supomos, e barrar por ele trancaria justamente quem usa o painel — você incluído.
--
-- `PODE_ENTRAR` aplica as duas decisões juntas: nome de guerra preenchido, senha cadastrada
-- e situação ativa.
SELECT E.MATRICULA,
       E.NOME_GUERRA,
       E.SITUACAO,
       CASE WHEN E.SENHABD IS NULL THEN 'SEM SENHA' ELSE 'TEM SENHA' END AS SENHA,
       CASE WHEN E.NOME_GUERRA IS NOT NULL
             AND E.SENHABD IS NOT NULL
             AND E.SITUACAO = 'A'
            THEN 'SIM' ELSE 'NAO — SERIA BARRADO' END                    AS PODE_ENTRAR
  FROM PCEMPR E
 WHERE E.MATRICULA IN (9311, 2807, 4893, 9316, 1002010, 5367, 5531, 5587, 5476)
 ORDER BY E.NOME_GUERRA;


-- ── 2. quem perde o acesso por NÃO TER NOME_GUERRA ───────────────────────────
-- A decisão 1 tem um custo: quem entra hoje digitando a matrícula, e não tem nome de guerra
-- preenchido, deixa de ter por onde entrar. Quero saber se é um punhado ou uma multidão —
-- e se alguma dessas pessoas está ativa, que é o caso que dói.
SELECT CASE WHEN NOME_GUERRA IS NULL THEN 'SEM NOME_GUERRA' ELSE 'TEM NOME_GUERRA' END AS SITUACAO_NOME,
       SITUACAO,
       COUNT(*)                                              AS PESSOAS,
       SUM(CASE WHEN SENHABD IS NOT NULL THEN 1 ELSE 0 END)  AS COM_SENHA
  FROM PCEMPR
 GROUP BY CASE WHEN NOME_GUERRA IS NULL THEN 'SEM NOME_GUERRA' ELSE 'TEM NOME_GUERRA' END,
          SITUACAO
 ORDER BY SITUACAO_NOME, SITUACAO;


-- ── 3. sobra empate depois dos dois filtros? ─────────────────────────────────
-- A dc31 mostrou que nenhum NOME_GUERRA repetido tem duas pessoas com senha. Confirmando
-- agora com o filtro de situação junto: se aqui vier vazio, a busca por nome de guerra entre
-- ativos devolve **no máximo uma linha**, e o `ROWNUM = 1` do painel antigo some do código
-- sem substituto — não há empate para desempatar.
--
-- Se vier alguma linha, eu preciso de uma regra de desempate, e ela vira decisão sua.
SELECT NOME_GUERRA,
       COUNT(*)                                                   AS PESSOAS,
       LISTAGG(MATRICULA, ', ') WITHIN GROUP (ORDER BY MATRICULA) AS MATRICULAS
  FROM PCEMPR
 WHERE NOME_GUERRA IS NOT NULL
   AND SENHABD IS NOT NULL
   AND SITUACAO = 'A'
 GROUP BY NOME_GUERRA
HAVING COUNT(*) > 1
 ORDER BY NOME_GUERRA;


-- ── 4. o universo que passa a poder entrar ───────────────────────────────────
-- O número final, para dimensionar o que estamos abrindo.
SELECT COUNT(*) AS PODEM_ENTRAR
  FROM PCEMPR
 WHERE NOME_GUERRA IS NOT NULL
   AND SENHABD IS NOT NULL
   AND SITUACAO = 'A';


-- ── 5. NOME_GUERRA tem espaço, acento ou caixa mista? ────────────────────────
-- Vai ser o campo de login, então a comparação precisa ser exatamente a que o cadastro
-- suporta. Este projeto já perdeu meio dia com um espaço **não separável** (U+00A0) num nome
-- de conta do DRE: a string parecia certa em todo log e não casava com nada.
--
-- `ASCIISTR` escapa qualquer byte fora do ASCII como `\xxxx`, então acento e espaço estranho
-- aparecem à vista em vez de se esconderem.
SELECT COUNT(*)                                                             AS ATIVOS_COM_SENHA,
       SUM(CASE WHEN NOME_GUERRA <> UPPER(NOME_GUERRA)  THEN 1 ELSE 0 END)  AS COM_MINUSCULA,
       SUM(CASE WHEN NOME_GUERRA <> TRIM(NOME_GUERRA)   THEN 1 ELSE 0 END)  AS COM_ESPACO_NAS_PONTAS,
       SUM(CASE WHEN INSTR(NOME_GUERRA, ' ') > 0        THEN 1 ELSE 0 END)  AS COM_ESPACO_NO_MEIO,
       SUM(CASE WHEN ASCIISTR(NOME_GUERRA) <> NOME_GUERRA THEN 1 ELSE 0 END) AS COM_CARACTERE_FORA_DO_ASCII
  FROM PCEMPR
 WHERE NOME_GUERRA IS NOT NULL
   AND SENHABD IS NOT NULL
   AND SITUACAO = 'A';

-- E os casos, se houver — para eu ver com o que estou lidando.
SELECT MATRICULA, NOME_GUERRA, ASCIISTR(NOME_GUERRA) AS COMO_O_BANCO_GUARDA
  FROM PCEMPR
 WHERE NOME_GUERRA IS NOT NULL
   AND SENHABD IS NOT NULL
   AND SITUACAO = 'A'
   AND ( ASCIISTR(NOME_GUERRA) <> NOME_GUERRA
      OR NOME_GUERRA <> TRIM(NOME_GUERRA)
      OR NOME_GUERRA <> UPPER(NOME_GUERRA) )
 ORDER BY NOME_GUERRA;
