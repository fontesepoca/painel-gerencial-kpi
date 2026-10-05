-- dc59 — O vínculo "centro de custo 25 pertence ao fornecedor 29" já existe cadastrado?
--
-- POR QUE A PERGUNTA
--   A 9815 tem o código da P&G escrito dentro do SQL (dc58): `(codccprinc = 25 and 29 in (…))`.
--   São dois números soltos que só fazem sentido juntos, e a regra que os une — "a equipe do
--   centro 25 atende o fornecedor 29" — não está em lugar nenhum. Se a P&G trocar de código,
--   ou se a equipe passar a atender outra marca, a rotina segue calculando e entregando o
--   número errado sem nada acusar.
--
--   Antes de escolher entre repetir o hardcode e criar uma tabela nossa, vale saber se o
--   Winthor já guarda esse vínculo em algum lugar. Se guardar, lemos de lá e ninguém precisa
--   manter nada.
--
-- Tudo aqui é SELECT, e nenhuma consulta depende da anterior — pode rodar todas de uma vez.
--
-- ATENÇÃO AO LER O RESULTADO: consulta que volta VAZIA aqui pode significar duas coisas bem
-- diferentes — o objeto não existe, ou o usuário não enxerga o objeto. Já aconteceu três vezes
-- neste projeto. A consulta 0 separa os dois casos, e é por ela que se começa.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. O usuário enxerga as tabelas? (o controle das outras consultas)
-- ═══════════════════════════════════════════════════════════════════════════
-- Se isto voltar com as cinco linhas, um vazio nas consultas seguintes é resposta de verdade.
-- Se voltar incompleto, o vazio é falta de privilégio e não conclui nada.
SELECT 'PCCENTROCUSTO'        AS TABELA, COUNT(*) AS COLUNAS FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'PCCENTROCUSTO'
UNION ALL SELECT 'PCCONTACENTROCUSTO', COUNT(*) FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'PCCONTACENTROCUSTO'
UNION ALL SELECT 'PCRATEIOCENTROCUSTO', COUNT(*) FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'PCRATEIOCENTROCUSTO'
UNION ALL SELECT 'PCFORNEC',            COUNT(*) FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'PCFORNEC'
UNION ALL SELECT 'EPCPARDRE',           COUNT(*) FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'EPCPARDRE';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O que PCCENTROCUSTO tem, coluna a coluna
-- ═══════════════════════════════════════════════════════════════════════════
-- O lugar mais natural para o vínculo morar. Procuro qualquer coluna que possa apontar para um
-- fornecedor — e não só pelo nome `CODFORNEC`: pode se chamar RESPONSAVEL, CODPARCEIRO, OBS.
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
  FROM ALL_TAB_COLUMNS
 WHERE TABLE_NAME = 'PCCENTROCUSTO'
 ORDER BY COLUMN_ID;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Qualquer coluna de fornecedor em QUALQUER tabela de centro de custo
-- ═══════════════════════════════════════════════════════════════════════════
-- Mais amplo que a 1: varre todas as tabelas cujo nome cite centro de custo e todas as colunas
-- que citem fornecedor ou parceiro. Se o vínculo existe em alguma tabela que eu não pensei em
-- olhar, ele aparece aqui.
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
  FROM ALL_TAB_COLUMNS
 WHERE (UPPER(TABLE_NAME) LIKE '%CENTROCUSTO%' OR UPPER(TABLE_NAME) LIKE '%CENTRO_CUSTO%')
   AND (UPPER(COLUMN_NAME) LIKE '%FORNEC%'
     OR UPPER(COLUMN_NAME) LIKE '%PARCEIRO%'
     OR UPPER(COLUMN_NAME) LIKE '%RESPONS%'
     OR UPPER(COLUMN_NAME) LIKE '%MARCA%')
 ORDER BY TABLE_NAME, COLUMN_ID;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. O cadastro do centro 25 e do 90, por inteiro
-- ═══════════════════════════════════════════════════════════════════════════
-- `SELECT *` de propósito: quero ver TODAS as colunas com valor preenchido, inclusive as que a
-- consulta 1 não deixou óbvias. O 90 entra junto porque é o outro centro com regra especial —
-- se os dois tiverem a mesma marca em alguma coluna, o padrão fica visível.
SELECT *
  FROM PCCENTROCUSTO
 WHERE SUBSTR(CODIGOCENTROCUSTO,1,2) IN ('25','90')
 ORDER BY CODIGOCENTROCUSTO;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Existe uma tabela da Época (EPC*) que fale de fornecedor?
-- ═══════════════════════════════════════════════════════════════════════════
-- As customizações da casa usam o prefixo EPC — a EPCPARDRE é uma delas. Se alguém já criou
-- uma tabela para esse vínculo, é aqui que ela está.
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
  FROM ALL_TAB_COLUMNS
 WHERE UPPER(TABLE_NAME) LIKE 'EPC%'
   AND (UPPER(COLUMN_NAME) LIKE '%FORNEC%' OR UPPER(COLUMN_NAME) LIKE '%CENTRO%')
 ORDER BY TABLE_NAME, COLUMN_ID;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. O 29 e o 25 estão escritos em algum código do banco?
-- ═══════════════════════════════════════════════════════════════════════════
-- Se a mesma regra estiver repetida numa view, procedure ou trigger, precisamos saber: mudar
-- só a nossa tela deixaria os dois lados discordando. Também revela se alguém já documentou o
-- vínculo num comentário.
--
-- O LIKE é deliberadamente frouxo — `%29%` casaria com qualquer coisa. Por isso procuro o
-- PADRÃO da condição, com o 25 por perto.
SELECT NAME, TYPE, LINE, TRIM(TEXT) AS TRECHO
  FROM ALL_SOURCE
 WHERE UPPER(TEXT) LIKE '%CODCCPRINC%'
   AND UPPER(TEXT) LIKE '%29%'
 ORDER BY NAME, LINE
 FETCH FIRST 50 ROWS ONLY;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. A descrição dos centros diz o nome do fornecedor?
-- ═══════════════════════════════════════════════════════════════════════════
-- O caminho mais frágil de todos, e por isso vem por último: casar pelo NOME. Se o único
-- vínculo que existir for "o centro se chama EQUIPE P&G e o fornecedor se chama PROCTER &
-- GAMBLE", então NÃO HÁ vínculo cadastrado — há uma coincidência de texto que ninguém garante.
--
-- Vale rodar mesmo assim, porque mostra quantos centros têm cara de dedicados a fornecedor.
-- Se forem vários, a regra do centro 25 pode ser só a primeira de uma série que virá depois.
SELECT CODIGOCENTROCUSTO, DESCRICAO
  FROM PCCENTROCUSTO
 WHERE CODIGOCENTROCUSTO NOT LIKE '%.%'
 ORDER BY CODIGOCENTROCUSTO;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMO LER O CONJUNTO
-- ═══════════════════════════════════════════════════════════════════════════
--   · Achou coluna de fornecedor preenchida no centro 25 (consultas 2, 3 ou 4)
--       → o vínculo EXISTE. Lemos do cadastro, e ninguém mantém nada a mais.
--
--   · Não achou, e a consulta 0 veio completa
--       → o vínculo NÃO existe no Winthor. A escolha vira: repetir o hardcode da 9815 ou
--         criar uma tabela nossa (tabela NOVA, com prefixo próprio — migration nunca roda em
--         tabela legada).
--
--   · A consulta 5 achou o padrão em outro objeto do banco
--       → a regra está repetida, e mudar só a nossa tela faria os dois lados discordarem.
--         Isso muda a conversa: vira assunto para quem mantém o Winthor.

-- ═══════════════════════════════════════════════════════════════════════════
-- RESULTADO — 22/09/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O VINCULO NAO EXISTE. Nao ha onde ler, e a escolha nao tem terceira via.
--
--   consulta 0   as cinco tabelas visiveis (8, 4, 22, 362 e 5 colunas) -- os vazios
--                abaixo sao resposta, e nao falta de privilegio
--   consulta 1   PCCENTROCUSTO tem OITO colunas: DESCRICAO, CODCENTROCUSTO,
--                RECEBE_LANCTO, ATIVO, CODIGOCENTROCUSTO, CODIGOCENTROCUSTOINTFOLHA,
--                DTINCLUSAO, DTALTERACAO. Nenhuma aponta para fornecedor.
--   consulta 2   vazia -- nenhuma tabela de centro de custo tem coluna de fornecedor
--   consulta 4   vazia -- ninguem criou tabela EPC* para isso
--   consulta 5   vazia -- a regra nao esta repetida em view, procedure ou trigger
--
-- RESSALVA HONESTA sobre a consulta 5: a consulta 0 nao cobriu ALL_SOURCE. Um vazio ali
-- tambem seria compativel com falta de privilegio de leitura do codigo. Para fechar:
--
--     SELECT COUNT(*) FROM ALL_SOURCE;
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O ACHADO QUE NAO ESTAVAMOS PROCURANDO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A consulta 6 mostrou que o centro 25 NAO E O UNICO dedicado a fornecedor:
--
--     2401   VENDAS UNILEVER
--     2601   UNILEVER
--     2501   EQUIPE P&G            <- o unico tratado no SQL
--     2806   TRANSPORTE T - P&G    <- P&G, e NAO tratado (cai no codccprinc 28)
--
-- Ou seja, a regra da 9815 e INCONSISTENTE nos dois sentidos:
--
--   · filtrar por UNILEVER nao traz os centros 24 e 26 dela, embora sejam equivalentes
--     ao 25 -- as despesas dela sao rateadas como as de qualquer um
--   · filtrar por P&G traz o centro 25 inteiro, mas NAO traz o 2806, que tambem e dela --
--     esse e rateado junto com o resto do transporte
--
-- Nao e defeito de implementacao: e uma regra escrita para UM caso, que nunca foi
-- generalizada. Quem escreveu resolveu o problema que tinha na frente.
--
-- ISSO MUDA O PESO DA DECISAO. Se o vinculo virar configuracao na nossa versao, o certo e
-- perguntar ao negocio quais centros pertencem a quais fornecedores -- porque a resposta
-- provavelmente nao e so "25 -> 29". Se ficar hardcoded, herdamos a inconsistencia junto.
--
-- O centro 2501 tem 27 subcentros, e a maioria e PLACA DE VEICULO (PUH4017, QPX6597,
-- RUJ2A11 P&G BH). E uma frota dedicada, nao so uma equipe de vendas.
