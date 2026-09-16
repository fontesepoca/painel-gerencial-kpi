-- dc39 — a permissão que já existe na 9815
--
-- Mudança de rumo do Gabriel em 16/09/2026: em vez de criar controles novos na 9995, a versão
-- web reaproveita **a permissão da própria 9815, guia DRE**. Quem já usa a rotina no Winthor
-- entra na web sem cadastro nenhum — e, o que importa mais, **quem perde o acesso lá perde
-- aqui no mesmo instante**. Acesso que mora em dois lugares é acesso que alguém esquece de
-- revogar em um deles.
--
-- ── Por que isto NÃO é a dc31 de novo ──
--
-- A 9995 é rotina web: sem executável por trás, os controles eram nossos para inventar, e o
-- número livre era livre. **A 9815 é tela Delphi.** Os controles dela já existem, são
-- definidos pelo Winthor, e nós só vamos LER. Não se cadastra nada, não se escolhe número —
-- se descobre qual número já quer dizer "guia DRE".
--
-- ⚠ O banco não sabe responder isso sozinho. A `PCROTINA` não guarda descrição de controle
--   (28 colunas, nenhuma sobre controle), então o significado de cada `CODCONTROLE` está na
--   **rotina 530, na tela**. As consultas abaixo levantam o formato e o tamanho de cada
--   controle; o nome de cada um tem de vir de você, olhando lá.


-- ── 1. os controles que a 9815 tem hoje ──────────────────────────────────────
-- É a lista de candidatos. Um deles é a guia DRE.
--
-- `COM_ACESSO` costuma denunciar o papel do controle: o que abre a rotina tende a ter quase
-- todo mundo liberado; o que libera uma guia específica tem menos gente. Não é prova — é o que
-- me permite conferir se o número que você apontar na 530 faz sentido com o uso real.
SELECT CODCONTROLE,
       COUNT(*)                                       AS QDE_USUARIOS,
       SUM(CASE WHEN ACESSO = 'S' THEN 1 ELSE 0 END)  AS COM_ACESSO,
       SUM(CASE WHEN ACESSO = 'N' THEN 1 ELSE 0 END)  AS SEM_ACESSO
  FROM PCCONTROI
 WHERE CODROTINA = 9815
 GROUP BY CODCONTROLE
 ORDER BY CODCONTROLE;


-- ── 2. quem tem a rotina 9815 liberada ───────────────────────────────────────
-- `PCCONTRO` é o acesso à rotina inteira; `PCCONTROI`, ao controle interno. As duas condições
-- vão valer juntas no login, como valem no Winthor.
SELECT COUNT(*)                                       AS USUARIOS_NA_9815,
       SUM(CASE WHEN ACESSO = 'S' THEN 1 ELSE 0 END)  AS COM_ACESSO_LIBERADO
  FROM PCCONTRO
 WHERE CODROTINA = 9815;

-- A lista, com nome — é quem vai poder abrir o DRE na web no primeiro dia.
-- `SITUACAO` e `SENHA` vêm junto porque as duas decisões da dc38 se aplicam aqui também: sem
-- senha ou inativo, a pessoa não entra mesmo tendo permissão.
SELECT C.CODUSUARIO,
       E.NOME_GUERRA,
       C.ACESSO,
       E.SITUACAO,
       CASE WHEN E.SENHABD IS NULL THEN 'SEM SENHA' ELSE 'TEM SENHA' END AS SENHA
  FROM PCCONTRO C
  LEFT JOIN PCEMPR E ON E.MATRICULA = C.CODUSUARIO
 WHERE C.CODROTINA = 9815
 ORDER BY C.ACESSO DESC, E.NOME_GUERRA;


-- ── 3. o cruzamento que diz quem REALMENTE entra ─────────────────────────────
-- Rotina liberada + controle liberado + nome de guerra + senha + situação ativa. É a regra
-- inteira do login, escrita uma vez.
--
-- O `&&controle_dre` é **3** — `GUIA 4-DRE`, confirmado na tela da 530 em 16/09/2026. A
-- variável fica no lugar do número para o arquivo poder ser reaproveitado em outra rotina, e
-- para o 3 aparecer uma vez só, aqui neste comentário, em vez de espalhado pelas consultas.
SELECT E.MATRICULA,
       E.NOME_GUERRA,
       E.SITUACAO,
       CASE WHEN E.SENHABD IS NULL THEN 'N' ELSE 'S' END AS TEM_SENHA
  FROM PCEMPR E
  JOIN PCCONTRO  R ON R.CODUSUARIO = E.MATRICULA AND R.CODROTINA = 9815 AND R.ACESSO = 'S'
  JOIN PCCONTROI I ON I.CODUSUARIO = E.MATRICULA AND I.CODROTINA = 9815
                  AND I.CODCONTROLE = &&controle_dre AND I.ACESSO = 'S'
 WHERE E.NOME_GUERRA IS NOT NULL
   AND E.SENHABD IS NOT NULL
   AND E.SITUACAO = 'A'
 ORDER BY E.NOME_GUERRA;

-- E quantos são, com e sem cada filtro — para eu ver o que cada regra está custando.
SELECT COUNT(*)                                                          AS COM_ROTINA_E_CONTROLE,
       SUM(CASE WHEN E.NOME_GUERRA IS NOT NULL THEN 1 ELSE 0 END)        AS TEM_NOME_GUERRA,
       SUM(CASE WHEN E.SENHABD IS NOT NULL THEN 1 ELSE 0 END)            AS TEM_SENHA,
       SUM(CASE WHEN E.SITUACAO = 'A' THEN 1 ELSE 0 END)                 AS ATIVOS,
       SUM(CASE WHEN E.NOME_GUERRA IS NOT NULL
                 AND E.SENHABD IS NOT NULL
                 AND E.SITUACAO = 'A' THEN 1 ELSE 0 END)                 AS ENTRAM_DE_FATO
  FROM PCEMPR E
  JOIN PCCONTRO  R ON R.CODUSUARIO = E.MATRICULA AND R.CODROTINA = 9815 AND R.ACESSO = 'S'
  JOIN PCCONTROI I ON I.CODUSUARIO = E.MATRICULA AND I.CODROTINA = 9815
                  AND I.CODCONTROLE = &&controle_dre AND I.ACESSO = 'S';


-- ── 4. a 9815 existe na PCROTINA? ────────────────────────────────────────────
-- Confirmando que ela é mesmo tela Delphi, e não outra rotina web como as 9995–9999.
-- `ROTINAWEB` e `ROTINA` são as colunas que separam as duas famílias.
SELECT CODIGO, NOMEROTINA, CODMODULO, CODSUBMODULO, ROTINAWEB, ROTINA,
       VERSAOCOMPLETA, DTULTUTILIZACAO, QTUTILIZACAO
  FROM PCROTINA
 WHERE CODIGO = 9815;


-- ── 5. e o duplo clique? ─────────────────────────────────────────────────────
-- A decisão anterior separava o detalhamento num controle próprio, porque ele mostra cliente,
-- nota e lançamento individual, e custa minutos de Oracle por clique. Reaproveitando a 9815,
-- essa separação só existe se o Winthor já tiver um controle para isso.
--
-- O bloco 1 vai listar os candidatos. Quando você olhar a 530, me diga se algum deles fala de
-- **detalhamento, consulta de lançamentos ou algo equivalente** — se houver, o duplo clique
-- passa a depender dele; se não houver, quem abre o DRE detalha, e isso vira consequência
-- registrada, não esquecimento.


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. O CONTROLE 46 — "Permite visualizar Lucratividade no DRE"
-- ══════════════════════════════════════════════════════════════════════════════
--
-- A 530 respondeu o que eu perguntei e mais uma coisa. Filtrando por "DRE" nos 43 controles da
-- 9815 aparecem dois:
--
--     3  — GUIA 4-DRE
--     46 — Permite visualizar Lucratividade no DRE
--
-- O 3 é o acesso que procurávamos. O **46 é um problema novo**: a 9815 esconde alguma coisa de
-- quem não o tem, e a nossa tela mostra tudo para todo mundo. Não há uma única menção a
-- "lucratividade" no projeto — nem no levantamento, nem no código —, então ou ela está numa
-- parte do DRE que migramos sem saber que era controlada, ou tem outro nome aqui.
--
-- Reaproveitar a permissão da 9815 e ao mesmo tempo mostrar mais do que ela mostra é o oposto
-- do que a decisão de 16/09/2026 queria garantir.
--
-- 6.1 — o tamanho do problema: quem tem a guia e NÃO tem a lucratividade.
-- Se der zero, o ponto é teórico hoje — mas continua sendo dívida, porque basta alguém tirar
-- o 46 de uma pessoa na 530 para a web passar a divergir do Winthor em silêncio.
SELECT SUM(CASE WHEN TEM_GUIA = 'S' AND TEM_LUCRO = 'S' THEN 1 ELSE 0 END) AS GUIA_E_LUCRO,
       SUM(CASE WHEN TEM_GUIA = 'S' AND TEM_LUCRO = 'N' THEN 1 ELSE 0 END) AS GUIA_SEM_LUCRO,
       SUM(CASE WHEN TEM_GUIA = 'N' AND TEM_LUCRO = 'S' THEN 1 ELSE 0 END) AS LUCRO_SEM_GUIA
  FROM (SELECT E.MATRICULA,
               NVL((SELECT I.ACESSO FROM PCCONTROI I
                     WHERE I.CODUSUARIO = E.MATRICULA
                       AND I.CODROTINA = 9815 AND I.CODCONTROLE = 3),  'N') AS TEM_GUIA,
               NVL((SELECT I.ACESSO FROM PCCONTROI I
                     WHERE I.CODUSUARIO = E.MATRICULA
                       AND I.CODROTINA = 9815 AND I.CODCONTROLE = 46), 'N') AS TEM_LUCRO
          FROM PCEMPR E
         WHERE E.SENHABD IS NOT NULL
           AND E.SITUACAO = 'A');

-- 6.2 — e quem são, se houver. São as pessoas para quem a web mostraria a mais.
SELECT E.MATRICULA, E.NOME_GUERRA
  FROM PCEMPR E
 WHERE E.SENHABD IS NOT NULL
   AND E.SITUACAO = 'A'
   AND EXISTS (SELECT 1 FROM PCCONTROI I
                WHERE I.CODUSUARIO = E.MATRICULA
                  AND I.CODROTINA = 9815 AND I.CODCONTROLE = 3 AND I.ACESSO = 'S')
   AND NOT EXISTS (SELECT 1 FROM PCCONTROI I
                    WHERE I.CODUSUARIO = E.MATRICULA
                      AND I.CODROTINA = 9815 AND I.CODCONTROLE = 46 AND I.ACESSO = 'S')
 ORDER BY E.NOME_GUERRA;
