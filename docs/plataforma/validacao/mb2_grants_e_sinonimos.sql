-- ============================================================================
-- mb2 — os GRANTs e os SINÔNIMOS da base do Minas Rural
--
-- Resultado da mb1 em 07/10/2026: usuário da aplicação `EDI`, e quatorze objetos
-- voltaram como FALTA SINONIMO. As tabelas moram em DOIS schemas, e o dono de
-- cada uma foi informado pelo Gabriel:
--
--   MINR   8 — lançamento, rateio, movimento, pedido, grupo…
--   EPCTI  6 — a parametrização do DRE, o cadastro de filiais e empresas
--
-- SÃO DOIS COMANDOS POR OBJETO, e é o que mais se erra aqui:
--
--   GRANT          dá a PERMISSÃO de ler a tabela.
--   CREATE SYNONYM faz o nome `PCLANC`, sem dono na frente, RESOLVER para ela.
--
-- A aplicação escreve `FROM PCLANC` sem qualificar — como a 9815 faz, e como o
-- trace mostra. Com grant e sem sinônimo, a consulta continua dando ORA-00942;
-- com sinônimo e sem grant, dá ORA-00942 também, o que faz os dois erros
-- parecerem o mesmo problema.
--
-- O SINÔNIMO TEM DE APONTAR PARA O DONO CERTO. Um sinônimo para `MINR.EPCPARDRE`
-- quando a tabela é de `EPCTI` cria sem reclamar e só falha na primeira consulta —
-- sinônimo não valida o alvo na criação.
--
-- QUEM RODA O QUÊ:
--   bloco 1 — como o dono de cada tabela (MINR ou EPCTI);
--   bloco 2 — como `EDI`. Sinônimo PRIVADO: não exige DBA, só o privilégio
--             CREATE SYNONYM, e vale só para o próprio `EDI` — que é quem a
--             aplicação usa para se conectar.
--
-- Repetir GRANT ou CREATE SYNONYM em objeto que já tem não quebra nada: o grant
-- é idempotente e o `OR REPLACE` cuida do resto.
-- ============================================================================


-- ── 1. AS PERMISSÕES ────────────────────────────────────────────────────────

-- Do schema MINR.
grant SELECT on "MINR"."PCLANCADIANTFORNEC"   to "EDI";
grant SELECT on "MINR"."PCPREST"              to "EDI";
grant SELECT on "MINR"."PCRATEIOCENTROCUSTO"  to "EDI";
grant SELECT on "MINR"."PCMOVCR"              to "EDI";
grant SELECT on "MINR"."PCPEDC"               to "EDI";
grant SELECT on "MINR"."PCPRODCIAP"           to "EDI";
grant SELECT on "MINR"."PCTABDEV"             to "EDI";
grant SELECT on "MINR"."PCGRUPO"              to "EDI";

-- Do schema EPCTI.
grant SELECT on "EPCTI"."EPCPARDRE"           to "EDI";
grant SELECT on "EPCTI"."EPCPARDRE_NAOEXIBIR" to "EDI";
grant SELECT on "EPCTI"."EPCPARDRE_RESP"      to "EDI";
grant SELECT on "EPCTI"."CLIENTE_ESPECIAL"    to "EDI";
grant SELECT on "EPCTI"."FILIAIS"             to "EDI";
grant SELECT on "EPCTI"."EMPRESA"             to "EDI";

-- Confirmado pelo Gabriel em 07/10/2026: as oito abaixo são TODAS do MINR. O dono foi
-- descoberto por tentativa — sem DBA, o proprio GRANT acusa ORA-00942 no schema errado.
grant SELECT on "MINR"."PCEMPR"               to "EDI";
grant SELECT on "MINR"."PCLIB"                to "EDI";
grant SELECT on "MINR"."PCCONTRO"             to "EDI";
grant SELECT on "MINR"."PCCONTROI"            to "EDI";
grant SELECT on "MINR"."PCLANC"               to "EDI";
grant SELECT on "MINR"."PCCONTA"              to "EDI";
grant SELECT on "MINR"."PCCENTROCUSTO"        to "EDI";
grant SELECT on "MINR"."PCCONTACENTROCUSTO"   to "EDI";


-- ── 2. OS SINÔNIMOS ─────────────────────────────────────────────────────────
-- Como EDI. Cada um aponta para o dono do bloco 1.

-- Para as tabelas de MINR.
create synonym "PCLANCADIANTFORNEC"  for "MINR"."PCLANCADIANTFORNEC";
create synonym "PCPREST"             for "MINR"."PCPREST";
create synonym "PCRATEIOCENTROCUSTO" for "MINR"."PCRATEIOCENTROCUSTO";
create synonym "PCMOVCR"             for "MINR"."PCMOVCR";
create synonym "PCPEDC"              for "MINR"."PCPEDC";
create synonym "PCPRODCIAP"          for "MINR"."PCPRODCIAP";
create synonym "PCTABDEV"            for "MINR"."PCTABDEV";
create synonym "PCGRUPO"             for "MINR"."PCGRUPO";

-- Para as tabelas de EPCTI.
create synonym "EPCPARDRE"           for "EPCTI"."EPCPARDRE";
create synonym "EPCPARDRE_NAOEXIBIR" for "EPCTI"."EPCPARDRE_NAOEXIBIR";
create synonym "EPCPARDRE_RESP"      for "EPCTI"."EPCPARDRE_RESP";
create synonym "CLIENTE_ESPECIAL"    for "EPCTI"."CLIENTE_ESPECIAL";
create synonym "FILIAIS"             for "EPCTI"."FILIAIS";
create synonym "EMPRESA"             for "EPCTI"."EMPRESA";

-- Autenticação e plano de contas, todas do MINR.
create synonym "PCEMPR"               for "MINR"."PCEMPR";
create synonym "PCLIB"                for "MINR"."PCLIB";
create synonym "PCCONTRO"             for "MINR"."PCCONTRO";
create synonym "PCCONTROI"            for "MINR"."PCCONTROI";
create synonym "PCLANC"               for "MINR"."PCLANC";
create synonym "PCCONTA"              for "MINR"."PCCONTA";
create synonym "PCCENTROCUSTO"        for "MINR"."PCCENTROCUSTO";
create synonym "PCCONTACENTROCUSTO"   for "MINR"."PCCONTACENTROCUSTO";

-- São PRIVADOS, e é `create synonym` sem `or replace`: se o nome já existir, o Oracle
-- recusa com ORA-00955 em vez de sobrescrever em silêncio — o que aqui é o
-- comportamento desejado, porque avisa que alguém já tinha criado aquele nome.
-- O privado vence o público na resolução, então um privado errado esconde um
-- público certo — foi por isso que a mb1 mostra qual dos dois está valendo.


-- ── 3. O QUE NÃO É GRANT DE TABELA ──────────────────────────────────────────

-- TAB_WEB_CENTROC_FORNEC é NOSSA, e não existe nesta base. Não há o que conceder:
-- é criar. O DDL está em docs/rotinas/9815-dre-gerencial/FILTRO_FORNECEDOR.md,
-- junto da carga inicial. Enquanto ela não existir, o filtro por fornecedor não
-- funciona nesta base — o resto do DRE funciona.

-- O LOGIN usa `EPCTI.DECRYPT(senha, usuario)`. Com DUAS partes na chamada, `DECRYPT` é uma
-- FUNÇÃO AVULSA dentro do schema EPCTI — se fosse pacote, a chamada teria três.
-- A chamada já vem qualificada com o dono: NÃO precisa de sinônimo. Precisa de EXECUTE,
-- que é outro grant e não é SELECT. Rode como EPCTI (o dono):

grant EXECUTE on "EPCTI"."DECRYPT" to "EDI";

-- A função roda com os direitos do DONO, então o que ela usa por dentro (DBMS_CRYPTO,
-- tabelas) o EDI não precisa enxergar. Para provar, como EDI:
--
--   select EPCTI.DECRYPT('x', 'x') from dual;
--
-- ORA-00904 ou PLS-00201 = sem acesso, falta o grant. Qualquer outro erro, ou um valor,
-- significa que a função foi alcançada e só reclamou da entrada fictícia.


-- ── 4. CONFERIR ─────────────────────────────────────────────────────────────
-- Reconectado como EDI, rode a mb1 de novo. A coluna `situacao` tem de vir toda
-- OK, menos a TAB_WEB_CENTROC_FORNEC. O bloco 2 da mb1 — o que tenta ler cada
-- objeto — é o que prova de verdade, porque pega sinônimo apontando para dono
-- errado, que o dicionário mostra como se estivesse bom.
