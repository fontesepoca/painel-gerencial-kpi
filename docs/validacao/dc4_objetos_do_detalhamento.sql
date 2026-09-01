-- dc4 — Quais objetos do detalhamento o usuário da API enxerga?
--
-- ORA-00942 no endpoint /detalhe. O trace da 9815 roda com um usuário do Winthor; a API
-- usa outro, e três objetos aparecem no detalhamento sem aparecer em nenhuma consulta que
-- já funciona:
--
--   PCMOVCR      -> número do carregamento e data de compensação
--   PCMOVCIAP    -> histórico do bloco de venda de ativo
--   PCPRODCIAP   -> idem
--
-- **RODAR COM O USUÁRIO DA API**, não com o seu. É exatamente essa diferença que se quer
-- medir: rodando com um usuário que enxerga tudo, o resultado não diz nada.

SELECT nome,
       CASE WHEN EXISTS (SELECT 1 FROM all_objects o
                          WHERE o.object_name = t.nome
                            AND o.object_type IN ('TABLE','VIEW','SYNONYM'))
            THEN 'S' ELSE 'N' END AS ENXERGA
  FROM (SELECT 'PCMOVCR'    AS nome FROM DUAL UNION ALL
        SELECT 'PCMOVCIAP'         FROM DUAL UNION ALL
        SELECT 'PCPRODCIAP'        FROM DUAL UNION ALL
        -- Controles: os três abaixo a API já lê hoje, nas consultas da apuração.
        -- Se algum vier 'N', o problema não é permissão — é a consulta.
        SELECT 'PCLANC'            FROM DUAL UNION ALL
        SELECT 'PCCONTA'           FROM DUAL UNION ALL
        SELECT 'EPCPARDRE'         FROM DUAL) t
 ORDER BY nome;
