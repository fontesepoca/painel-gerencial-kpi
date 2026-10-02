-- dc63 — Os 150.930,28 a mais no VERBAS MARGEM. Quem está certo?
--
-- DE ONDE VEM A PERGUNTA
--   Comparando a exportação da 9815 (C. Custo Principal, filial 7, agosto/2026, competência)
--   com a nossa apuração, TODO o cabeçalho bate ao centavo -- receita bruta, as cinco
--   deduções, receitas líquidas, CMV e lucro bruto --, e o `Sub-Total` também:
--
--       Sub-Total -> Despesas Operacionais     -9.281.625,91     igual nos dois
--
--   As duas únicas diferenças são as já aprovadas... menos uma:
--
--       RESULTADO OPERACIONAL   1.068.296,79 -> 1.949.663,76    +881.366,97   divergência 9
--       LUCRO LIQUIDO           2.254.048,92 -> 2.224.229,05     -29.819,87   ver abaixo
--
--   A do LUCRO LIQUIDO decompõe em duas parcelas, e só a primeira tem explicação:
--
--       -180.750,15   a indenização não soma             divergência 10, aprovada
--       +150.930,28   VERBAS MARGEM a mais               SEM EXPLICAÇÃO
--
--       VERBAS MARGEM:   9815  730.436,69   ·   nosso  881.366,97
--
-- O QUE JÁ ESTÁ DESCARTADO
--   NÃO É a mudança para conta principal (22/09/2026). Antes a chave era `SUBSTR(...,1,2)`
--   = '90'; agora é o código inteiro '9001'. O detalhamento mostra que os 93 lançamentos têm
--   centro EXATAMENTE '9001' -- nenhum com ponto, nenhum outro 90xx --, então os dois
--   critérios capturam o mesmo conjunto. A diferença é anterior.
--
--   NÃO É o regime: nosso valor é 881.366,97 tanto em caixa quanto em competência, e o da
--   9815 é 730.436,69 nos dois.
--
--   NÃO É a divergência 2 (filial única no subselect `CCC`): aqui há uma filial só.
--
-- O QUE O NOSSO LADO CONTÉM
--   93 lançamentos, em duas contas:
--
--       3002022  Verba Composicao Margem     35 lanç.    791.642,75
--       3002023  Verba Aplicacao Fator       58 lanç.     89.724,22
--                                                        ----------
--                                                        881.366,97
--
--   Os maiores são aplicações automáticas de verba por fornecedor -- `APLIC.AUTOM. [PVB]` --,
--   com P&G (199.500,00), Gillette (155.755,29), o segundo cadastro da P&G (150.100,00),
--   Colgate e outros.
--
--   Chama a atenção que 150.100,00 seja tão perto dos 150.930,28 que faltam, mas NÃO É IGUAL:
--   a diferença entre os dois é 830,28. Coincidência de ordem de grandeza não é prova, e é
--   exatamente o tipo de quase-encaixe que faz alguém parar de procurar cedo demais.
--
-- Tudo aqui é SELECT.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O total do centro 90, por conta — o número de referência
-- ═══════════════════════════════════════════════════════════════════════════
-- Se isto der 881.366,97, o nosso número é o que está no banco e a 9815 exclui alguma coisa.
-- Se der 730.436,69, somos nós que estamos somando a mais, e a consulta 2 diz o quê.
SELECT CT.CODCONTA,
       CT.CONTA,
       COUNT(*)                      AS LANCAMENTOS,
       SUM(NVL(RC.valor, FIN.VPAGO)) AS TOTAL
  FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.RECNUM   = RC.RECNUM
   AND FIN.CODCONTA = RC.CODCONTA
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('7')
   AND FIN.DTPAGTO IS NOT NULL
   AND SUBSTR(RC.CodigoCentroCusto,1,2) = '90'
   AND FIN.historico NOT LIKE 'REF.CANCEL.BORDERO JA BAIXADO'
   AND NOT EXISTS (SELECT 1 FROM pclancadiantfornec
                    WHERE recnumpagto IS NOT NULL AND dtestorno IS NULL
                      AND recnumadiantamento = FIN.recnum)
   AND FIN.CODCONTA NOT IN (SELECT codconta FROM EPCPARDRE_NAOEXIBIR)
   AND NVL(FIN.DTPAGTO, FIN.DTVENC) BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy')
                                        AND TO_DATE('31/08/2026','dd/mm/yyyy')
 GROUP BY CT.CODCONTA, CT.CONTA
 ORDER BY 4 DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Existe um subconjunto que soma exatamente os 150.930,28?
-- ═══════════════════════════════════════════════════════════════════════════
-- Lista os 93 lançamentos com as marcas que a 9815 poderia usar para descartar alguns:
-- estorno de baixa, adiantamento, data de reclassificação e a presença em
-- `PCCONTACENTROCUSTO` -- esta última é a que a apuração usa para excluir pares
-- (conta, centro) já contemplados no cadastro do DRE.
--
-- Some à mão a coluna VALOR das linhas que tiverem alguma marca. Se der 150.930,28, achamos
-- o critério que nos falta.
SELECT FIN.RECNUM,
       FIN.CODCONTA,
       RC.CodigoCentroCusto              AS CENTRO,
       NVL(RC.valor, FIN.VPAGO)          AS VALOR,
       FIN.DTPAGTO,
       FIN.dtcompetencia,
       FIN.DTESTORNOBAIXA,
       FIN.DTRECLASSIFIC,
       CASE WHEN EXISTS (SELECT 1 FROM PCCONTACENTROCUSTO CCC
                          WHERE CCC.codconta = FIN.CODCONTA
                            AND CCC.codigocentrocusto = RC.CodigoCentroCusto)
            THEN 'SIM' ELSE 'nao' END    AS EM_CONTACENTROCUSTO,
       CASE WHEN FIN.CODCONTA IN (SELECT codgruconta FROM EPCPARDRE WHERE codgruconta > 0)
            THEN 'SIM' ELSE 'nao' END    AS CONTA_NO_EPCPARDRE,
       SUBSTR(FIN.HISTORICO,1,60)        AS HISTORICO
  FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.RECNUM   = RC.RECNUM
   AND FIN.CODCONTA = RC.CODCONTA
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('7')
   AND FIN.DTPAGTO IS NOT NULL
   AND SUBSTR(RC.CodigoCentroCusto,1,2) = '90'
   AND NVL(FIN.DTPAGTO, FIN.DTVENC) BETWEEN TO_DATE('01/08/2026','dd/mm/yyyy')
                                        AND TO_DATE('31/08/2026','dd/mm/yyyy')
 ORDER BY ABS(NVL(RC.valor, FIN.VPAGO)) DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A conta 3002022 está no cadastro do DRE como linha própria?
-- ═══════════════════════════════════════════════════════════════════════════
-- A hipótese mais provável. Se `EPCPARDRE` tem a conta 3002022 ou 3002023 como
-- `codgruconta`, a 9815 pode estar mostrando parte desse valor em OUTRA linha -- e a
-- exportação não traria essa linha por estar zerada ou por ficar fora do recorte.
--
-- `PCCONTACENTROCUSTO` diz quais pares (conta, centro) o cadastro já contempla, e é por ela
-- que a apuração exclui lançamentos do bloco de órfãs.
SELECT P.ID, P.CODGRUCONTA, P.GRUPO, P.INFCONTAS,
       (SELECT COUNT(*) FROM PCCONTACENTROCUSTO CCC WHERE CCC.codconta = P.CODGRUCONTA)
         AS PARES_NO_CONTACENTROCUSTO
  FROM EPCPARDRE P
 WHERE P.CODGRUCONTA IN (3002022, 3002023)
 ORDER BY P.ID;

SELECT * FROM PCCONTACENTROCUSTO WHERE codconta IN (3002022, 3002023);

-- ═══════════════════════════════════════════════════════════════════════════
-- COMO LER
-- ═══════════════════════════════════════════════════════════════════════════
--   · Consulta 1 devolve 881.366,97 → o nosso número é o do banco. A 9815 descarta
--     150.930,28 por um critério que ainda não conhecemos, e a consulta 2 aponta qual.
--
--   · Consulta 1 devolve 730.436,69 → somos nós que somamos a mais, e é defeito nosso.
--
--   · Consulta 3 devolve linha → a conta tem tratamento próprio no cadastro do DRE, e a
--     hipótese passa a ser que a 9815 mostra o resto em outra linha.
--
-- EM QUALQUER DOS CASOS, isto é ANTERIOR à mudança para conta principal -- o conjunto de
-- lançamentos é idêntico nos dois critérios de agrupamento. A mudança de 22/09 não criou
-- esta diferença, só a deixou visível numa comparação nova.

-- ═══════════════════════════════════════════════════════════════════════════
-- RESULTADO PARCIAL — 22/09/2026: E UM CORTE POR DATA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A consulta 1 devolveu 881.366,97 (negativo no banco; a apuracao inverte o sinal). O NOSSO
-- NUMERO E O DO BANCO -- a 9815 e que descarta.
--
-- A consulta 2 nao achou marca nenhuma que separasse um subconjunto: os 93 lancamentos tem
-- `EM_CONTACENTROCUSTO = SIM`, `CONTA_NO_EPCPARDRE = SIM`, centro 9001, nenhum estorno de
-- baixa, nenhuma reclassificacao. Pelas marcas, sao todos iguais.
--
-- O QUE OS SEPARA E A DATA:
--
--     DTPAGTO 30/08/2026   10 lancamentos    730.436,69   <- o que a 9815 mostra
--     DTPAGTO 31/08/2026   83 lancamentos    150.930,28   <- o que falta
--                          --              ------------
--                          93                881.366,97
--
--     199.500,00 + 155.755,29 + 150.100,00 + 80.844,71 + 53.369,02
--     + 50.370,00 + 24.500,00 + 13.597,67 + 2.020,40 + 379,60 = 730.436,69
--
-- Bate ao centavo. Nao e coincidencia.
--
-- A HIPOTESE, e ela explica por que o corte atinge SO esta linha:
--
--     select dtIni, dtFim from tab_ger_restricao_data_dre where matricula = 4893
--
-- A 9815 consulta essa tabela LOGO NO INICIO de toda execucao -- esta nos tres traces que
-- temos. Se houver uma restricao de data para a matricula, a rotina limita o periodo das
-- DESPESAS sem dizer nada na tela.
--
-- E por que so o VERBAS MARGEM erra, se o corte seria geral? Porque estas duas contas
-- concentram lancamento no ULTIMO DIA do mes -- sao aplicacoes automaticas de verba, que
-- rodam no fechamento. As demais despesas se espalham pelo mes e nao tem volume em 31/08,
-- entao o `Sub-Total` bate por nao haver o que cortar.
--
-- ISTO E VERIFICAVEL, e as duas consultas abaixo decidem.

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. A restricao de data do usuario
-- ═══════════════════════════════════════════════════════════════════════════
-- Se devolver linha com DTFIM = 30/08/2026 (ou qualquer data anterior a 31/08), a hipotese
-- esta provada e a 9815 nunca mostrou o mes inteiro para este usuario.
SELECT MATRICULA, DTINI, DTFIM FROM TAB_GER_RESTRICAO_DATA_DRE WHERE MATRICULA = 4893;

SELECT MATRICULA, DTINI, DTFIM FROM TAB_GER_RESTRICAO_DATA_DRE ORDER BY MATRICULA;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Quanta despesa existe em 31/08, fora dessas duas contas?
-- ═══════════════════════════════════════════════════════════════════════════
-- O teste da explicacao. Se o corte fosse geral, TODA despesa de 31/08 sairia -- e o
-- `Sub-Total` tambem erraria. Ele bate, entao a previsao e que quase nao haja despesa
-- operacional nesse dia.
--
-- Uma linha grande aqui DERRUBA a hipotese, e a procura recomeca.
SELECT TO_CHAR(NVL(FIN.DTPAGTO, FIN.DTVENC),'dd/mm') AS DIA,
       COUNT(*)                      AS LANCAMENTOS,
       SUM(NVL(RC.valor, FIN.VPAGO)) AS TOTAL
  FROM PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
 WHERE FIN.CODCONTA = CT.CODCONTA
   AND FIN.RECNUM   = RC.RECNUM
   AND FIN.CODCONTA = RC.CODCONTA
   AND CT.GRUPOCONTA >= 200
   AND FIN.CODFILIAL IN ('7')
   AND FIN.DTPAGTO IS NOT NULL
   AND FIN.CODCONTA NOT IN (3002022, 3002023)
   AND NVL(FIN.DTPAGTO, FIN.DTVENC) BETWEEN TO_DATE('25/08/2026','dd/mm/yyyy')
                                        AND TO_DATE('31/08/2026','dd/mm/yyyy')
 GROUP BY TO_CHAR(NVL(FIN.DTPAGTO, FIN.DTVENC),'dd/mm')
 ORDER BY 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- DESFECHO — 22/09/2026: NAO ERA DIVERGENCIA, ERA O RELOGIO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A hipotese da restricao de data CAIU: nao ha linha para a matricula 4893 em
-- TAB_GER_RESTRICAO_DATA_DRE, e existem 1.226 lancamentos em 31/08 fora destas contas,
-- somando 1.510.195,21 -- se o corte fosse geral, o Sub-Total erraria, e ele bate.
--
-- Tambem NAO era periodo encurtado: apurando 01/08 a 30/08 o cabecalho inteiro muda
-- (receita bruta cai para 31.987.489,22), e na exportacao ele bate ao centavo.
--
-- O LOG DA 9815 fechou a questao por eliminacao: em competencia ela filtra
--
--     AND FIN.dtcompetencia Between To_Date('01/08/2026') AND To_Date('31/08/2026')
--
-- com as MESMAS exclusoes que usamos -- REF.CANCEL.BORDERO, adiantamento e
-- EPCPARDRE_NAOEXIBIR. A consulta 1 deste arquivo ja rodava com todas elas e devolvia
-- 881.366,97. Nao sobrou criterio que explicasse o corte.
--
-- O QUE EXPLICA E O DTLANC:
--
--     DTLANC 15/09/2026   DTPAGTO 30/08   10 lanc.   730.436,69   <- a 9815 viu
--     DTLANC 22/09/2026   DTPAGTO 31/08   83 lanc.   150.930,28   <- lancados HOJE
--
-- Sao aplicacoes automaticas de verba, lancadas HOJE com data de pagamento RETROATIVA em
-- 31/08. A 9815 rodou as 16:37; a nossa apuracao veio depois e viu as duas levas.
--
-- RESSALVA: DTLANC guarda so a data, sem hora, entao ele nao PROVA que a inclusao foi
-- depois das 16:39 -- prova que foi hoje. O que fecha e reexportar a 9815 e ver o
-- VERBAS MARGEM virar 881.366,97.
--
-- Uma segunda evidencia apontava para o mesmo: a DEVOLUCAO mudou entre as duas exportacoes
-- do MESMO dia -- 864.116,06 as 08:53 e 856.047,03 as 16:37, mesmo periodo e mesma filial.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A LICAO, E ELA JA ESTAVA ESCRITA
-- ═══════════════════════════════════════════════════════════════════════════
-- A skill `conferir-dre` ja manda fazer exportacao e chamada da API "EM SEQUENCIA, MINUTOS
-- DE DIFERENCA", e registrar a hora das duas. Hoje isso nao foi feito, e o custo foi uma
-- investigacao inteira atras de um defeito que nao existia.
--
-- ACRESCENTO que o levantamento nao tinha: MES RECEM-FECHADO AINDA RECEBE LANCAMENTO
-- RETROATIVO. Agosto fechou ha tres semanas e ganhou 83 lancamentos hoje. Para conferir
-- contra a 9815, prefira periodo com alguns meses de folga -- ou aceite que a janela de
-- comparacao e de minutos, nao de horas.
