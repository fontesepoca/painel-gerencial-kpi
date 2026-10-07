namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// Consultas da rotina DRE Gerencial (9815 do Winthor).
/// **Somente leitura** — nenhuma tabela é escrita.
/// </summary>
public static class DreGerencialQueries
{
    /// <summary>
    /// Filiais disponíveis para o filtro.
    ///
    /// Adaptada do trace da 9815 (`docs/rotinas/9815-dre-gerencial/referencia-oficial/`).
    /// Duas diferenças deliberadas em relação ao original, ambas documentadas em
    /// `docs/rotinas/9815-dre-gerencial/ESPECIFICACAO.md`:
    ///
    /// 1. **Sem o `AND f.codfil IN (...)`.** No Winthor essa lista vem da tela de
    ///    pré-seleção exibida antes de abrir a rotina. Na web não existe essa tela:
    ///    o filtro Filial já nasce com as 18 do cadastro.
    ///
    /// 2. **`CODFIL` como desempate no `ORDER BY`.** `ORDEM_PROCESSA` tem valores
    ///    repetidos (quatro filiais com ordem 3, três com ordem 5), e ordenar só por ela
    ///    deixa a ordem dessas linhas a critério do banco — a lista mudaria de posição
    ///    entre execuções. Não altera quais filiais aparecem, só torna a ordem estável.
    ///
    ///    O `LPAD` existe porque `CODFIL` é texto: sem ele a ordenação é lexicográfica e
    ///    a filial `5` viria depois da `19`. `LPAD` alinha à direita e ordena como número,
    ///    sem `TO_NUMBER` — converter código de cadastro é o erro que derrubou o Centro
    ///    de Custo na 9815.
    ///
    /// O outer join `(+)` é o do original e fica como está: `PCFILIAL` só fornece a UF,
    /// e filial sem registro lá não pode sumir da lista.
    ///
    /// <para><b>3. `AND F.DBLEPCTI IS NULL` — acrescentado em 31/08/2026.</b> Aquele `@` em
    /// valores como `@DBLEPCTISUP` é sintaxe de <b>database link</b>: essas filiais têm os
    /// dados em <b>outra base</b>. Nosso `PCLANC` local não tem o movimento delas, então
    /// apurar uma dessas aqui devolve tudo zerado — um relatório que parece legítimo, de uma
    /// operação sem movimento, quando na verdade é uma consulta no banco errado. Um zero
    /// falso é pior que um erro, porque não parece erro.</para>
    ///
    /// <para>São cinco: <c>13 MR::BH</c>, <c>16 SUP-NP</c>, <c>17 SUP-PL</c>,
    /// <c>18 SUP-SM</c> e <c>19 FUT-2013-</c>. A 9815 também não as oferece — ela consulta
    /// só a base local. Medido em `docs/rotinas/9815-dre-gerencial/validacao/fase5d_filiais_que_a_9815_oferece.sql`.</para>
    ///
    /// <para><b>Como reverter:</b> apagar a linha `AND F.DBLEPCTI IS NULL`. É só isso — o
    /// filtro volta às 18, e as cinco voltam a aparecer zeradas. Ver `docs/rotinas/9815-dre-gerencial/DIVERGENCIAS.md`,
    /// seção do filtro de filiais, para o histórico da decisão: a instrução original, de
    /// 27/08/2026, era mostrar as 18, e foi tomada antes de sabermos que cinco delas apontam
    /// para outro banco.</para>
    ///
    /// <para>Das outras quatro que a 9815 não oferece, <c>22 EPC-RJ</c> <b>continua na
    /// lista</b>: não tem link, os dados estão aqui, e o zero dela é verdadeiro — é filial
    /// inativa, não ausente.</para>
    ///
    /// <para><b>4. `AND F.CODFIL NOT IN ('20','31','35','91')` — a lista de exclusões por
    /// decisão de negócio.</b> Quatro filiais que existem, têm os dados nesta base e ainda
    /// assim não devem aparecer no filtro:</para>
    ///
    /// <list type="bullet">
    ///   <item><c>31 CeM-ES</c> e <c>91 CeM-MG</c> — em 02/09/2026, revertendo a decisão de
    ///   31/08 que as mantinha: não pertencem à operação que o DRE mede.</item>
    ///   <item><c>20 EPC-CEASA</c> e <c>35 VIVALOG-SUL</c> — em 09/09/2026.</item>
    /// </list>
    ///
    /// <para>Todas por decisão do Gabriel, e o motivo é o mesmo: oferecer no filtro uma
    /// filial que ninguém deve apurar só cria oportunidade de apurar por engano. Note que a
    /// 20 chegou a ser <b>defendida</b> na lista, em 31/08, com o argumento de que o zero
    /// dela é verdadeiro — o argumento continua correto, e a decisão de negócio passou por
    /// cima dele. Não é contradição: "o número está certo" e "esta linha deve estar no
    /// filtro" são perguntas diferentes.</para>
    ///
    /// <para>O critério é o <b>código</b>, e não o prefixo do `LABEL`, porque `LABEL` é campo
    /// de exibição: um `LIKE 'CeM%'` transformaria renomear uma filial em mudar silenciosamente
    /// o que o DRE apura. Em troca, uma filial nova do mesmo grupo entraria na lista sem
    /// avisar — se isso virar rotina, o certo é procurar o atributo de cadastro que as separa
    /// e trocar por ele.</para>
    ///
    /// <para><b>Como reverter:</b> tirar o código da lista. Cada um sai sozinho, sem afetar
    /// os outros.</para>
    ///
    /// Sem parâmetros.
    /// </summary>
    public const string Filiais = """
        SELECT F.CODFIL                             AS CODFILIAL,
               F.LABEL                              AS LABEL,
               E.EMPRESA                            AS EMPRESACODIGO,
               E.DESCRICAO                          AS EMPRESA,
               E.DESCRICAO || ' - ' || F.DESCRICAO  AS UNIDADE,
               NVL(FW.UF, 'MG')                     AS UF,
               F.ORDEM_PROCESSA                     AS ORDEM
          FROM FILIAIS F, EMPRESA E, PCFILIAL FW
         WHERE F.EMPRESA = E.EMPRESA
           AND F.CODFIL  = FW.CODIGO (+)
           AND F.DBLEPCTI IS NULL
           @@FILIAIS_FORA_DO_FILTRO@@
         ORDER BY F.ORDEM_PROCESSA, LPAD(F.CODFIL, 10, '0')
        """;

    /// <summary>
    /// Os fornecedores que o filtro do DRE oferece, para a busca da tela.
    ///
    /// <para><b>Busca, não listagem.</b> O cadastro tem mais de treze mil fornecedores, e
    /// mandar todos para o navegador a cada abertura de tela seria caro para resolver um
    /// problema que ninguém tem: quem filtra sabe de quem está falando. A tela manda o que a
    /// pessoa digitou e recebe no máximo <c>:limite</c> linhas.</para>
    ///
    /// <para><b>O código vem primeiro, e por isso o <c>ORDER BY</c> começa por ele.</b> Quem
    /// digita <c>29</c> quer o fornecedor 29, não os 180 cujo nome contém "29". A ordenação
    /// põe a igualdade exata no topo e o resto em ordem alfabética.</para>
    ///
    /// <para><b>Acento não atrapalha</b>: os dois lados passam por
    /// <c>CONVERT(..., 'US7ASCII')</c>, então <i>GUARANY</i> acha <i>GUARANÝ</i> e vice-versa.
    /// É o mesmo tratamento que o ESTOQUE REVENDA usa para comparar histórico.</para>
    ///
    /// <para><b>Só NOME e CÓDIGO, e nada mais.</b> O CNPJ é devolvido para a tela mostrar,
    /// mas <b>não</b> é procurado.</para>
    ///
    /// <para><b>Número digitado é NÚMERO, não pedaço de número.</b> Esta é a regra que
    /// resolveu o ruído de 06/10/2026: <b>fornecedor MEI é cadastrado com o CPF dentro do
    /// nome</b> (<c>ADENIR JOAO RUBIO BAGLI 18341297884</c>), e um <c>LIKE '%29%'</c>
    /// devolvia vinte pessoas físicas quaisquer no lugar da P&amp;G — o <c>29</c> que casava
    /// estava no meio de um CPF, onde ele não é o 29 de ninguém.</para>
    ///
    /// <para>Quando o que foi digitado é só dígito, o nome é procurado por
    /// <c>REGEXP_LIKE(..., '(^|[^0-9])29([^0-9]|$)')</c>: o número tem de estar <b>inteiro</b>
    /// ali, com não-dígito dos dois lados. <c>POSTO 29</c> aparece, <c>...97884</c> não.
    /// Jogar fora a busca por nome inteira seria mais simples e perderia o <c>POSTO 29</c>;
    /// a borda de dígito custa uma linha e não perde nada.</para>
    ///
    /// <para><b>Com UM caractere que seja letra, nada é procurado no nome</b> —
    /// <c>LIKE '%a%'</c> sobre treze mil cadastros devolve vinte linhas quaisquer. O piso vale
    /// para letra, e não para dígito: ele tornava o fornecedor <b>1</b> inalcançável, porque
    /// não há como digitar um código de um dígito a mais do que ele tem.</para>
    ///
    /// <para>Tudo isso é SQL, e não um <c>if</c> em C# montando texto: a consulta roda contra
    /// produção e nada vindo do cliente entra nela por concatenação. O <c>:busca</c> que vai
    /// para DENTRO do padrão do <c>REGEXP_LIKE</c> continua sendo um bind, e só chega lá
    /// quando o <c>REGEXP_LIKE(TRIM(:busca2), '^[0-9]+$')</c> já garantiu que são dígitos —
    /// não há metacaractere possível.</para>
    ///
    /// <para><b>Binds, nesta ordem</b> — o ODP.NET liga por posição, e <c>:busca</c> aparece
    /// SETE vezes: <c>:busca1</c> (o código exato), <c>:busca2</c> e <c>:busca3</c> (o número
    /// inteiro no nome), <c>:busca4</c> (o comprimento), <c>:busca5</c> (o teste de só
    /// dígitos), <c>:busca6</c> (o <c>LIKE</c> do nome), <c>:busca7</c> (o desempate do
    /// <c>ORDER BY</c>) e <c>:limite</c>.</para>
    /// </summary>
    public const string Fornecedores = """
        SELECT * FROM (
          SELECT F.CODFORNEC                                  AS CODFORNEC,
                 TRIM(F.FORNECEDOR)                           AS FORNECEDOR,
                 F.CGC                                        AS CGC,
                 F.CODFORNECPRINC                             AS CODFORNECPRINC
            FROM PCFORNEC F
           WHERE TO_CHAR(F.CODFORNEC) = TRIM(:busca1)
              OR ( REGEXP_LIKE(TRIM(:busca2), '^[0-9]+$')
                   AND REGEXP_LIKE(F.FORNECEDOR,
                                   '(^|[^0-9])' || TRIM(:busca3) || '([^0-9]|$)') )
              OR ( LENGTH(TRIM(:busca4)) >= 2
                   AND NOT REGEXP_LIKE(TRIM(:busca5), '^[0-9]+$')
                   AND UPPER(CONVERT(TRIM(F.FORNECEDOR), 'US7ASCII'))
                         LIKE '%' || UPPER(CONVERT(TRIM(:busca6), 'US7ASCII')) || '%' )
           ORDER BY CASE WHEN TO_CHAR(F.CODFORNEC) = TRIM(:busca7) THEN 0 ELSE 1 END,
                    TRIM(F.FORNECEDOR)
        )
        WHERE ROWNUM <= :limite
        """;

    /// <summary>
    /// Estrutura de linhas do DRE para a análise **Grupo de Contas**, já com o bloco de
    /// **contas órfãs** — as que têm movimento no período e não estão parametrizadas em
    /// `EPCPARDRE`. São elas que dão rótulo ao bloco final do relatório
    /// (`Acerto De Estoque`, `CONTRATO DE MUTUO`, …).
    ///
    /// <para><b>Validada contra o original</b> em 28/08/2026 por
    /// `docs/rotinas/9815-dre-gerencial/validacao/inc5a_comparacao_estrutura.sql`. Única mudança: os três blocos de
    /// órfãs (um por filial) viraram um, com `CODFILIAL IN (...)`.</para>
    ///
    /// <para><b>Duas particularidades do bloco de órfãs, replicadas como estão:</b></para>
    /// <list type="number">
    ///   <item>Ele lê `PCLANC` <b>direto, sem o `DTPAGTO IS NOT NULL`</b> que o
    ///         `GetValorGrupo` aplica. Em competência isso significa que a estrutura pode
    ///         listar uma conta cuja linha de despesa não existe — rótulo sem valor. Em
    ///         caixa não há diferença prática, porque o filtro `FIN.DTPAGTO BETWEEN` já
    ///         exclui nulo.</item>
    ///   <item>O filtro de "não parametrizada" é um `NOT IN` sobre o <b>par</b>
    ///         `(conta, centro de custo)`, com `PCCONTACENTROCUSTO` em outer join. Uma
    ///         conta parametrizada só para certos centros de custo continua órfã nos
    ///         demais. É a construção mais sutil do SQL da rotina.</item>
    /// </list>
    ///
    /// <para>O `ORDER BY ID` é o do original — sem `NULLS LAST` explícito, porque no Oracle
    /// esse já é o padrão em ordem crescente. A linha de `ID` nulo do cadastro cai no fim, e
    /// as órfãs recebem `ID` sintético (`ROWNUM + max(ID)`), o que as coloca depois de todas
    /// as parametrizadas.</para>
    ///
    /// <para>Binds, nesta ordem: {0} placeholders das filiais, depois `:dtIni` e `:dtFim`.
    /// {1} é a expressão de data do regime — <b>não</b> é a mesma do `GetValorGrupo`:
    /// aqui caixa usa `FIN.DTPAGTO` puro, ver
    /// <see cref="Application.Features.DreGerencial.RegimeDre.ExpressaoFiltroEstrutura"/>.</para>
    /// </summary>
    public const string EstruturaGrupoDeContas = """
          SELECT min(ID) as ID, CODGRUCONTA, GRUPO, max(INFCONTAS) as INFCONTAS, max(cor) as COR, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL 
           FROM ( 
                 select PAR.ID,
                        /* A CONTA 3000165 NÃO SE COLAPSA NO GRUPO — ver o comentário grande
                           acima da constante. Ela é `INDENIZACAO DE MERC. VENC. E AVARIA`, e
                           sem esta linha ela desaparece dentro do grupo 300
                           (`Despesas Adm e Vendas`), onde não há como marcá-la. O rótulo vem
                           de `CO.CONTA` para bater com o das outras duas dimensões — no
                           cadastro do DRE ela se chama `Verba Indenização`. */
                        case when PAR.CODGRUCONTA <= 0 then  to_char(PAR.CODGRUCONTA)
                             when PAR.CODGRUCONTA = 3000165 then to_char(PAR.CODGRUCONTA)
                             else to_Char(gr.codgrupo) end as CODGRUCONTA,
                        case when PAR.CODGRUCONTA <= 0 then PAR.GRUPO
                             when PAR.CODGRUCONTA = 3000165 then NVL(CO.CONTA, PAR.GRUPO)
                             else gr.grupo end as GRUPO, PAR.INFCONTAS, PAR.COR, '' as TIPOCONTA, '' as RESPONSAVEL,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')  then 'S' else 'N' end as AntesRO, 
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLL, 
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLF 
                     from EPCPARDRE PAR, PCCONTA CO, PCGRUPO GR 
                    WHERE PAR.CODGRUCONTA = CO.codconta (+) 
                      AND CO.GRUPOCONTA = gr.codgrupo (+) 
                 union all 
                 SELECT ROWNUM+(select max(ID) from EPCPARDRE) as ID, to_char(codgrupo) as CODGRUCONTA, GRUPO, 'N' as INFCONTAS,  NULL as COR, '' as TIPOCONTA, '' as RESPONSAVEL, 'N' as AntesRO, 'N' as AntesLL, 'N' as AntesLF 
                   FROM ( 
                        SELECT CODGRUPO, GRUPO, SUM(VPAGO) AS VPAGO, count(*) as qdeReg 
                        FROM ( 
         SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,  
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO  
            FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC, 
                  ( select '99' as codccprinc, 'NÃO USA/NÃO INFORMADO' as DescCCPrinc FROM DUAL 
                    union 
                    select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc  
           WHERE  FIN.CODCONTA = CT.CODCONTA 
             AND  CT.GRUPOCONTA >= 200 
             AND  FIN.CODFILIAL IN ({0}) 
             AND  FIN.RECNUM = RC.RECNUM (+) 
             AND  FIN.CODCONTA = RC.CODCONTA (+) 
             AND  CT.grupoconta = GR.codgrupo (+) 
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+) 
             AND  SUBSTR(cc.CodigoCentroCusto, 1, INSTR(cc.CodigoCentroCusto || '.', '.') - 1) = CCPrinc.codccprinc (+) 
             AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) ) 
            AND {1} BETWEEN :dtIni AND :dtFim
                         ) GROUP BY CODGRUPO, GRUPO 
                     ORDER BY 1 
                     ) 
                      where VPAGO <> 0  or qdereg <> 0 
               )   
            group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL 
            order By ID 
        """;

    /// <summary>
    /// Despesas do período por dimensão — o `GetValorGrupo` da 9815, para a análise
    /// **Grupo de Contas**.
    ///
    /// <para><b>Este SQL foi validado contra o original</b> em 28/08/2026:
    /// `docs/rotinas/9815-dre-gerencial/validacao/inc3_comparacao_despesas.sql` comparou as duas versões no mesmo
    /// período e devolveu zero divergências. Três mudanças em relação ao trace, todas
    /// provadas equivalentes:</para>
    /// <list type="number">
    ///   <item>três blocos `UNION ALL`, um por filial, viraram um bloco com
    ///         `CODFILIAL IN (...)` — com 18 filiais seriam 18 blocos;</item>
    ///   <item>`TO_NUMBER` na chave virou `TO_CHAR`, o que elimina o defeito do Centro
    ///         de Custo por construção;</item>
    ///   <item>o round-trip `TO_CHAR(To_Date(&lt;data&gt;,'dd/mm/yyyy'),'mm/yyyy')` virou
    ///         `TO_CHAR(&lt;data&gt;,'mm/yyyy')`, que não depende do `NLS_DATE_FORMAT` da
    ///         sessão. Ver `docs/plataforma/CONVENCOES_ORACLE.md` §11.</item>
    /// </list>
    ///
    /// <para><b>Ordem dos binds — o ODP.NET é posicional.</b> Nesta ordem exata:</para>
    /// <list type="number">
    ///   <item>{0} — placeholders das filiais, primeiro `IN` (`PCLANC`)</item>
    ///   <item>:dtIni1, :dtFim1 — período das despesas</item>
    ///   <item>:dtIni2, :dtFim2 — período da linha injetada (`PCPREST.DTPAG`)</item>
    ///   <item>{3} — placeholders das filiais, segundo `IN` (`PCNFSAID`)</item>
    /// </list>
    /// <para>As datas repetem valor mas precisam de nomes distintos: com bind posicional,
    /// reusar `:dtIni` daria dois parâmetros para um nome só.</para>
    ///
    /// <para>{1} e {2} são as expressões de data do regime, de
    /// <see cref="Application.Features.DreGerencial.RegimeDre"/> — não são valores,
    /// são trechos de SQL.</para>
    /// </summary>
    /// <summary>
    /// <para><b>{4} e {5} são o FILTRO POR FORNECEDOR</b>, e as quatro consultas de despesa os
    /// recebem iguais — é assim na 9815 também, onde <c>GetValorGrupo</c> monta uma consulta
    /// só para as quatro dimensões e o tipo de análise escolhe apenas o <c>GRUPOCONTA</c> do
    /// <c>SELECT</c>. Tudo o mais, inclusive estas duas peças, é compartilhado.</para>
    ///
    /// <para><b>{4}</b> é a coluna <c>VPAGO_EXCLUSIVO_FORNEC</c>: o valor que pertence ao
    /// fornecedor e por isso <b>não</b> pode ser rateado. Sem filtro é o <c>0</c> de sempre,
    /// e a consulta sai caractere por caractere igual à de antes.</para>
    ///
    /// <para><b>{5}</b> são as duas condições do <c>WHERE</c>, e sem filtro é <b>vazio</b>.
    /// A primeira é a do centro 90 (<c>VERBAS MARGEM</c>), que casa com o
    /// <c>FIN.CODFORNEC</c> do próprio lançamento — não precisa de cadastro nenhum. A segunda
    /// é a do centro dedicado, que na 9815 é o literal <c>29</c> escrito à mão e aqui lê
    /// <c>TAB_WEB_CENTROC_FORNEC</c>.</para>
    ///
    /// <para>Ver <c>docs/rotinas/9815-dre-gerencial/FILTRO_FORNECEDOR.md</c> para a mecânica inteira, e
    /// <c>docs/rotinas/9815-dre-gerencial/validacao/dc73...</c> para a tabela.</para>
    /// </summary>
    public const string DespesasGrupoDeContas = """
         SELECT  GRUPOCONTA AS GRUPOCONTA, AntesRO AS ANTESRO, AntesLL AS ANTESLL, AntesLF AS ANTESLF, MES_ANO AS MESANO, MES AS MES, ANO AS ANO, sum(VLREALIZADO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) AS VPAGOEXCLUSIVOFORNEC, sum(QdeReg) AS QDEREG 
         FROM ( 
         /* `decode(AntesLF,'N',CODCONTA,codgrupo)`: as linhas DEPOIS do LUCRO LIQUIDO já saem
            por conta, e as de antes por grupo. A conta 3000165 entra na primeira regra sem
            estar depois do LUCRO LIQUIDO — é a exceção que mantém `INDENIZACAO DE MERC.
            VENC. E AVARIA` como linha própria em vez de somida no grupo 300. A estrutura tem
            a exceção gêmea; as duas precisam concordar ou a linha aparece zerada. */
         SELECT  to_char(case when AntesLF = 'N' or CODCONTA = 3000165 then CODCONTA else codgrupo end) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg
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
                  TO_CHAR({1},'mm/yyyy') as MES_ANO, 
                  TO_CHAR({1},'mm') as MES, 
                  extract(YEAR FROM {1}) as ANO, 
                  SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) HISTORICO, 
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO,  
                  {4} 
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
                    select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc  
           WHERE  FIN.CODCONTA = CT.CODCONTA 
             AND  CT.GRUPOCONTA >= 200 
             AND  FIN.CODFILIAL IN ({0}) 
             AND  FIN.RECNUM = RC.RECNUM (+) 
             AND  FIN.CODCONTA = RC.CODCONTA (+) 
             AND  CT.grupoconta = GR.codgrupo (+) 
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+) 
             AND  SUBSTR(cc.CodigoCentroCusto, 1, INSTR(cc.CodigoCentroCusto || '.', '.') - 1) = CCPrinc.codccprinc (+) 
             AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO' 
             AND not exists (select recnumadiantamento from pclancadiantfornec where recnumpagto is not null and dtestorno is null and recnumadiantamento = fin.recnum) 
        {5}
            AND {2} BETWEEN :dtIni1 AND :dtFim1
         AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR) 
                         ) GROUP BY  to_char(case when AntesLF = 'N' or CODCONTA = 3000165 then CODCONTA else codgrupo end), AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
         union all 
         select '400' as GRUPOCONTA,  
                'N' as AntesRO, 'S' as AntesLL,  'S' as AntesLF, TO_CHAR(FIN.dtpag,'mm/yyyy') as MES_ANO, 
                TO_CHAR(FIN.dtpag,'mm') as MES, 
                extract(YEAR FROM FIN.dtpag) as ANO, fin.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg  
           from pcnfsaid nf, pcprest fin 
          where nf.numnota = fin.duplic 
            and nf.numtransvenda  = fin.numtransvenda 
            and condvenda = 0 and nf.vltotal > 0 and nvl(nf.obs,'X') not like '%CANCELADA%' and nf.dthoracancelamentosefaz is null 
            and fin.codcob <> 'DESD' and fin.dtcancel is null 
            and fin.dtpag BETWEEN :dtIni2 AND :dtFim2
            and nf.codfilial IN ({3}) 
        ) GROUP BY GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
        """;

    /// <summary>
    /// Estrutura de linhas do DRE para a análise **Conta Gerencial**.
    ///
    /// <para>É a irmã mais próxima de <see cref="EstruturaGrupoDeContas"/> — mesmo bloco de
    /// órfãs, mesma forma de binds. Três diferenças, todas no primeiro bloco:</para>
    /// <list type="number">
    ///   <item>a chave é sempre `PAR.CODGRUCONTA`, e não o grupo da conta. É isso que faz a
    ///         dimensão descer ao nível da conta;</item>
    ///   <item>o rótulo é `NVL(CO.CONTA, PAR.GRUPO)` quando a chave é positiva — o nome da
    ///         conta, com o do parâmetro como reserva;</item>
    ///   <item>aparecem `TIPOCONTA` (`PCCONTA.FIXAVARIAVEL`, com `'F'` como padrão) e
    ///         `RESPONSAVEL`.</item>
    /// </list>
    ///
    /// <para><b>As duas colunas novas entram no `GROUP BY` externo</b>, então não são
    /// decoração: duas linhas com mesma chave e rótulo mas `TIPOCONTA` diferente seriam
    /// linhas distintas. Por isso ficam no SQL mesmo sem aparecer na tela — a exportação da
    /// 9815 tem só Descrição, Valor e `%AV`.</para>
    ///
    /// <para><b>O `codfil = 25` do `RESPONSAVEL` é do original e fica.</b> É constante no
    /// Delphi, não vem da seleção de filiais — diferente do defeito de C. Custo Principal,
    /// aqui não há lista sendo sobrescrita, é um valor fixo. Como só influi no agrupamento
    /// de uma coluna que não exibimos, replicar é gratuito.</para>
    ///
    /// <para>Binds: {0} placeholders das filiais, depois `:dtIni` e `:dtFim`. {1} é a
    /// expressão de data do regime.</para>
    /// </summary>
    public const string EstruturaContaGerencial = """
          SELECT min(ID) as ID, CODGRUCONTA, GRUPO, max(INFCONTAS) as INFCONTAS, max(cor) as COR, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL
           FROM (
                 select PAR.ID,
                        to_char(PAR.CODGRUCONTA) as CODGRUCONTA, CASE WHEN PAR.CODGRUCONTA > 0 THEN NVL(CO.CONTA,PAR.GRUPO) ELSE PAR.GRUPO END AS GRUPO, PAR.INFCONTAS, PAR.COR,
                        nvl(co.fixavariavel,'F') as TIPOCONTA,
                        (SELECT usu.nome from epcpardre_resp re, pcempr usu
                         where re.matricula = usu.matricula and re.codconta = PAR.CODGRUCONTA and re.codfil = 25) as RESPONSAVEL,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')  then 'S' else 'N' end as AntesRO,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLL,
                          case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLF
                     from EPCPARDRE PAR, PCCONTA CO, PCGRUPO GR
                    WHERE PAR.CODGRUCONTA = CO.codconta (+)
                      AND CO.GRUPOCONTA = gr.codgrupo (+)
                 union all
                 SELECT ROWNUM+(select max(ID) from EPCPARDRE) as ID, to_char(codgrupo) as CODGRUCONTA, GRUPO, 'N' as INFCONTAS,  NULL as COR, '' as TIPOCONTA, '' as RESPONSAVEL, 'N' as AntesRO, 'N' as AntesLL, 'N' as AntesLF
                   FROM (
                        SELECT CODGRUPO, GRUPO, SUM(VPAGO) AS VPAGO, count(*) as qdeReg
                        FROM (
         SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO
            FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC,
                  ( select '99' as codccprinc, 'NÃO USA/NÃO INFORMADO' as DescCCPrinc FROM DUAL
                    union
                    select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc
           WHERE  FIN.CODCONTA = CT.CODCONTA
             AND  CT.GRUPOCONTA >= 200
             AND  FIN.CODFILIAL IN ({0})
             AND  FIN.RECNUM = RC.RECNUM (+)
             AND  FIN.CODCONTA = RC.CODCONTA (+)
             AND  CT.grupoconta = GR.codgrupo (+)
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
             AND  SUBSTR(cc.CodigoCentroCusto, 1, INSTR(cc.CodigoCentroCusto || '.', '.') - 1) = CCPrinc.codccprinc (+)
             AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) )
            AND {1} BETWEEN :dtIni AND :dtFim
                         ) GROUP BY CODGRUPO, GRUPO
                     ORDER BY 1
                     )
                      where VPAGO <> 0  or qdereg <> 0
               )
            group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL
            order By ID
        """;

    /// <summary>
    /// Despesas do período para a análise **Conta Gerencial**.
    ///
    /// <para>É a mais simples das quatro: a chave é a conta, sempre, sem o
    /// `decode(AntesLF, ...)` que as outras usam para mudar de chave depois do LUCRO
    /// LIQUIDO. Aqui o relatório já é por conta do começo ao fim.</para>
    ///
    /// <para>A chave da linha injetada de `PCPREST` é `'4000004'` — `'400'` em Grupo de
    /// Contas, `'85'` em C. Custo Principal. Cada dimensão joga essa receita na sua
    /// própria linha.</para>
    ///
    /// <para>`TO_NUMBER(CODCONTA)` do original virou `TO_CHAR`, como nas demais.</para>
    ///
    /// <para>Ordem dos binds, igual à de Grupo de Contas: {0} filiais de `PCLANC`,
    /// :dtIni1/:dtFim1, :dtIni2/:dtFim2, {3} filiais de `PCNFSAID`.</para>
    /// </summary>
    public const string DespesasContaGerencial = """
         SELECT  GRUPOCONTA AS GRUPOCONTA, AntesRO AS ANTESRO, AntesLL AS ANTESLL, AntesLF AS ANTESLF, MES_ANO AS MESANO, MES AS MES, ANO AS ANO, sum(VLREALIZADO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) AS VPAGOEXCLUSIVOFORNEC, sum(QdeReg) AS QDEREG
         FROM (
         SELECT  to_char(CODCONTA) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg
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
                  TO_CHAR({1},'mm/yyyy') as MES_ANO,
                  TO_CHAR({1},'mm') as MES,
                  extract(YEAR FROM {1}) as ANO,
                  SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) HISTORICO,
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO,
                  {4}
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
                    select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc
           WHERE  FIN.CODCONTA = CT.CODCONTA
             AND  CT.GRUPOCONTA >= 200
             AND  FIN.CODFILIAL IN ({0})
             AND  FIN.RECNUM = RC.RECNUM (+)
             AND  FIN.CODCONTA = RC.CODCONTA (+)
             AND  CT.grupoconta = GR.codgrupo (+)
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
             AND  SUBSTR(cc.CodigoCentroCusto, 1, INSTR(cc.CodigoCentroCusto || '.', '.') - 1) = CCPrinc.codccprinc (+)
             AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO'
             AND not exists (select recnumadiantamento from pclancadiantfornec where recnumpagto is not null and dtestorno is null and recnumadiantamento = fin.recnum)
        {5}
            AND {2} BETWEEN :dtIni1 AND :dtFim1
         AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR)
                         ) GROUP BY codconta, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
         union all
         select '4000004' as GRUPOCONTA,
                'N' as AntesRO, 'S' as AntesLL,  'S' as AntesLF, TO_CHAR(FIN.dtpag,'mm/yyyy') as MES_ANO,
                TO_CHAR(FIN.dtpag,'mm') as MES,
                extract(YEAR FROM FIN.dtpag) as ANO, fin.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg
           from pcnfsaid nf, pcprest fin
          where nf.numnota = fin.duplic
            and nf.numtransvenda  = fin.numtransvenda
            and condvenda = 0 and nf.vltotal > 0 and nvl(nf.obs,'X') not like '%CANCELADA%' and nf.dthoracancelamentosefaz is null
            and fin.codcob <> 'DESD' and fin.dtcancel is null
            and fin.dtpag BETWEEN :dtIni2 AND :dtFim2
            and nf.codfilial IN ({3})
        ) GROUP BY GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
        """;

    /// <summary>
    /// Estrutura de linhas do DRE para a análise **C. Custo Principal**. Três blocos:
    /// as linhas calculadas do cadastro, os centros de custo principais, e as contas órfãs.
    ///
    /// <para><b>A CONTA PRINCIPAL É O PREFIXO ANTES DO PONTO</b>, e não os dois primeiros
    /// dígitos como na 9815. A expressão está em onze lugares — nove nesta classe e duas no
    /// detalhamento — e é sempre a mesma:</para>
    ///
    /// <code>SUBSTR(x, 1, INSTR(x || '.', '.') - 1)</code>
    ///
    /// <para>O <c>'.'</c> concatenado é o que faz a expressão servir para os dois casos: com
    /// ponto ela devolve o prefixo, sem ponto o <c>INSTR</c> acha o ponto que acabou de ser
    /// colado no fim e a expressão devolve o código inteiro. Sem ele, um centro sem ponto
    /// daria <c>INSTR = 0</c> e <c>SUBSTR(x,1,-1)</c> — string vazia, e a linha sumiria.</para>
    ///
    /// <para><b>As onze ocorrências têm de andar juntas.</b> Se a apuração e o detalhamento
    /// discordarem, o duplo clique recorta por uma chave diferente da que somou a linha e o
    /// total deixa de fechar sem nada quebrar. A <c>dc61</c> confere isso lendo o fonte.</para>
    ///
    /// <para><b>Divergência deliberada</b> — o subselect `CCC`, que descobre quais centros
    /// de custo existem, usa <b>a lista completa de filiais</b>. Na 9815 ele usa uma só, e
    /// isso apaga linhas inteiras do relatório: no cenário de 01/06 a 31/07/2026 com filiais
    /// 7/12/25, nove centros de custo principais somem do bloco operacional, carregando
    /// R$ 2.564.063,37. Medido, provado com duas execuções da própria rotina, e aprovado em
    /// 31/08/2026. Ver `docs/rotinas/9815-dre-gerencial/DIVERGENCIAS.md` nº 2 — é a única divergência desta consulta.</para>
    ///
    /// <para><b>Com uma filial só não há divergência possível</b>, e a web tem que bater ao
    /// centavo com a 9815. É assim que esta consulta se confere.</para>
    ///
    /// <para>Quatro adaptações além dessa, todas conferidas por
    /// `docs/rotinas/9815-dre-gerencial/validacao/inc9g_comparacao_estrutura_ccusto.sql`:</para>
    /// <list type="number">
    ///   <item>os três blocos de órfãs, um por filial, viraram um com `CODFILIAL IN (...)`;</item>
    ///   <item>o `NVL(codccprinc,99)` virou `NVL(codccprinc,'99')`. O `99` numérico era
    ///         convertido implicitamente para texto pelo Oracle — mesmo resultado, sem
    ///         conversão escondida no caminho da chave;</item>
    ///   <item>saiu a coluna `AntesRA`. Ela compara contra o rótulo `'RESULTADO ANTES DO LL'`,
    ///         que <b>não existe</b> no `EPCPARDRE`: a subconsulta devolve nulo, `id &lt; NULL`
    ///         nunca é verdadeiro, e a coluna é constante `'N'`. Não é lida por ninguém —
    ///         nem aparece na projeção externa. Por ser constante, não afeta o `DISTINCT`;</item>
    ///   <item>o `AntesLF` do primeiro bloco compara contra `'LUCRO FINAL'`, rótulo que
    ///         também não existe. <b>Fica como está</b>: aqui a constante `'N'` resultante
    ///         é lida, e mudar o rótulo mudaria o relatório.</item>
    /// </list>
    ///
    /// <para>Binds, nesta ordem — o ODP.NET é posicional:</para>
    /// <list type="number">
    ///   <item>{0} — filiais do subselect `CCC`</item>
    ///   <item>:dtIniA, :dtFimA — período do `CCC`</item>
    ///   <item>{2} — filiais do bloco de órfãs</item>
    ///   <item>:dtIniB, :dtFimB — período das órfãs</item>
    /// </list>
    /// <para>{1} é a expressão de data do regime
    /// (<see cref="Application.Features.DreGerencial.RegimeDre.ExpressaoFiltroEstrutura"/>),
    /// usada nos dois blocos — não é valor, é trecho de SQL.</para>
    /// </summary>
    public const string EstruturaCCustoPrincipal = """
          SELECT min(ID) as ID, CODGRUCONTA, GRUPO, max(INFCONTAS) as INFCONTAS, max(cor) as COR, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL
           FROM (
                    select par.id, to_Char(par.codgruconta) as codgruconta, par.grupo, par.infcontas, par.cor, '' as TIPOCONTA, '' as RESPONSAVEL,
                           case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')  then 'S' else 'N' end as AntesRO,
                           case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLL,
                           case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO FINAL')  then 'S' else 'N' end as AntesLF
                      from EPCPARDRE par where par.codgruconta <= 0
                       and par.grupo not in ('DESPESA OPERACIONAL','LUCRO OPERACIONAL','DESPESA FINANCEIRA','LUCRO FINANCEIRO','DESPESA TRIBUTARIA','LUCRO TRIBUTARIO')
                    union all
                    select rownum + 9 +
                           case when AntesRO = 'N' and AntesLL = 'S' then  (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')
                                when AntesRO = 'N' and AntesLL = 'N' then  (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')
                           else 0 end as id,
                    to_char(codgruconta) as codgruconta, grupo, INFCONTAS, COR, '' as TIPOCONTA, '' as RESPONSAVEL, AntesRO, AntesLL, AntesLF
                    from (
                  select distinct    DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.codccprinc,'99'),'99') as CODGRUCONTA,
                         DECODE(CT.usarateiocentrocusto,'S',NVL(CCPrinc.DescCCPrinc,'NÃO USA/NÃO INFORMADO'),'NÃO USA/NÃO INFORMADO') as GRUPO,
                         'N' as INFCONTAS, NULL as COR,
                         case
                              when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                         and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL'))  then 'S' else 'N' end as AntesRO,
                         case
                              when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                         and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLL,
                         case
                              when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                         and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLF
                    from EPCPARDRE PAR, PCCONTA CT, PCCENTROCUSTO CC,
                         (select codconta, codigocentrocusto from PCCONTACENTROCUSTO
                           union
                           SELECT  FIN.CODCONTA, rC.CodigoCentroCusto
                             FROM  PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
                            WHERE  FIN.CODCONTA = CT.CODCONTA
                              AND  CT.GRUPOCONTA >= 200
                              AND  FIN.CODFILIAL IN ({0})
                              AND  FIN.RECNUM = RC.RECNUM
                              AND  FIN.CODCONTA = RC.CODCONTA
                              AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO'
                              AND  {1} BETWEEN :dtIniA AND :dtFimA
                          ) CCC,
                         (  select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                            from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc
                   where par.codgruconta = CT.codconta (+)
                     and ct.codconta = ccc.codconta (+)
                     and ccc.codigocentrocusto = cc.codigocentrocusto (+)
                     AND SUBSTR(cc.codigocentrocusto, 1, INSTR(cc.codigocentrocusto || '.', '.') - 1) = CCPrinc.codccprinc (+)
                     and par.codgruconta > 0
                   order by 1
                   )
                 union all
                 SELECT ROWNUM+(select max(ID) from EPCPARDRE) as ID, to_char(codgrupo) as CODGRUCONTA, GRUPO, 'N' as INFCONTAS,  NULL as COR, '' as TIPOCONTA, '' as RESPONSAVEL, 'N' as AntesRO, 'N' as AntesLL, 'N' as AntesLF
                   FROM (
                        SELECT CODGRUPO, GRUPO, SUM(VPAGO) AS VPAGO, count(*) as qdeReg
                        FROM (
         SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO
            FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC,
                  ( select '99' as codccprinc, 'NÃO USA/NÃO INFORMADO' as DescCCPrinc FROM DUAL
                    union
                    select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc
           WHERE  FIN.CODCONTA = CT.CODCONTA
             AND  CT.GRUPOCONTA >= 200
             AND  FIN.CODFILIAL IN ({2})
             AND  FIN.RECNUM = RC.RECNUM (+)
             AND  FIN.CODCONTA = RC.CODCONTA (+)
             AND  CT.grupoconta = GR.codgrupo (+)
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
             AND  SUBSTR(cc.CodigoCentroCusto, 1, INSTR(cc.CodigoCentroCusto || '.', '.') - 1) = CCPrinc.codccprinc (+)
             AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) )
            AND {1} BETWEEN :dtIniB AND :dtFimB
                         ) GROUP BY CODGRUPO, GRUPO
                     ORDER BY 1
                     )
                      where VPAGO <> 0  or qdereg <> 0
               )
            group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL
            order By ID
        """;

    /// <summary>
    /// Despesas do período para a análise **C. Custo Principal**.
    ///
    /// <para>Idêntica a <see cref="DespesasGrupoDeContas"/> salvo em dois pontos, que são
    /// exatamente o que a 9815 troca entre uma dimensão e outra:</para>
    /// <list type="number">
    ///   <item>a chave de agrupamento. Antes do LUCRO LIQUIDO é o <b>centro de custo
    ///         principal</b>; depois dele volta a ser a conta. Essa assimetria é da rotina:
    ///         o bloco final do relatório é por conta em todas as dimensões;</item>
    ///   <item>a chave da linha injetada de `PCPREST` — `'85'` aqui, `'400'` em Grupo de
    ///         Contas. Cai no centro de custo principal 85, `RECEITA VENDA ATIVO`.</item>
    /// </list>
    ///
    /// <para><b>`decode` com os dois ramos em texto.</b> No original é
    /// `to_number(decode(AntesLF,'N',CODCONTA, NVL(codccprinc,99)))`, e ali o `DECODE` unifica
    /// pelo primeiro ramo: `CODCONTA` é numérico, então o código do centro de custo sofria
    /// conversão implícita para número. É a mesma armadilha que derruba o Centro de Custo na
    /// 9815, só que escondida. Aqui os dois ramos já são texto e não há conversão nenhuma no
    /// caminho da chave.</para>
    ///
    /// <para>Ordem dos binds, igual à de Grupo de Contas: {0} filiais de `PCLANC`,
    /// :dtIni1/:dtFim1, :dtIni2/:dtFim2, {3} filiais de `PCNFSAID`. {1} e {2} são as
    /// expressões de data do regime.</para>
    /// </summary>
    public const string DespesasCCustoPrincipal = """
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
                  TO_CHAR({1},'mm/yyyy') as MES_ANO,
                  TO_CHAR({1},'mm') as MES,
                  extract(YEAR FROM {1}) as ANO,
                  SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) HISTORICO,
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO,
                  {4}
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
                    select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc
           WHERE  FIN.CODCONTA = CT.CODCONTA
             AND  CT.GRUPOCONTA >= 200
             AND  FIN.CODFILIAL IN ({0})
             AND  FIN.RECNUM = RC.RECNUM (+)
             AND  FIN.CODCONTA = RC.CODCONTA (+)
             AND  CT.grupoconta = GR.codgrupo (+)
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
             AND  SUBSTR(cc.CodigoCentroCusto, 1, INSTR(cc.CodigoCentroCusto || '.', '.') - 1) = CCPrinc.codccprinc (+)
             AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO'
             AND not exists (select recnumadiantamento from pclancadiantfornec where recnumpagto is not null and dtestorno is null and recnumadiantamento = fin.recnum)
        {5}
            AND {2} BETWEEN :dtIni1 AND :dtFim1
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
            and fin.dtpag BETWEEN :dtIni2 AND :dtFim2
            and nf.codfilial IN ({3})
        ) GROUP BY GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
        """;

    /// <summary>
    /// Estrutura de linhas do DRE para a análise **Centro de Custo** — a dimensão que
    /// **nunca funcionou na 9815**.
    ///
    /// <para>Mesma forma da de C. Custo Principal, com a chave e o rótulo descendo da
    /// conta principal para o centro de custo inteiro:</para>
    /// <list type="bullet">
    ///   <item>chave: o próprio `PCCENTROCUSTO.CODIGOCENTROCUSTO`. `9998` é "usa rateio mas
    ///         não informou", `9999` é "não usa rateio";</item>
    ///   <item>rótulo: `PCCENTROCUSTO.DESCRICAO`, com os mesmos dois textos de exceção.</item>
    /// </list>
    ///
    /// <para><b>Sem referência para comparar.</b> É a única dimensão sem exportação da 9815 —
    /// a rotina falha sempre, e por isso ninguém nunca viu estes números.
    /// Ver `docs/rotinas/9815-dre-gerencial/DIVERGENCIAS.md` nº 3.</para>
    ///
    /// <para>A divergência da filial única (`docs/rotinas/9815-dre-gerencial/DIVERGENCIAS.md` nº 2) atinge esta dimensão
    /// <b>com muito mais força</b>: aqui a granularidade é o centro de custo inteiro, e a
    /// `inc9` achou centenas de pares perdidos, contra os 9 principais de C. Custo Principal.
    /// Sem referência, o tamanho não é mensurável. Usamos a lista completa de filiais, pela
    /// mesma decisão de 31/08/2026.</para>
    ///
    /// <para>Binds na mesma ordem da estrutura de C. Custo Principal: {0} filiais do `CCC`,
    /// :dtIniA/:dtFimA, {2} filiais das órfãs, :dtIniB/:dtFimB. {1} é a expressão de data.</para>
    /// </summary>
    public const string EstruturaCentroCusto = """
          SELECT min(ID) as ID, CODGRUCONTA, GRUPO, max(INFCONTAS) as INFCONTAS, max(cor) as COR, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL
           FROM (
                    select par.id, to_Char(par.codgruconta) as codgruconta, par.grupo, par.infcontas, par.cor, '' as TIPOCONTA, '' as RESPONSAVEL,
                           case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')  then 'S' else 'N' end as AntesRO,
                           case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')  then 'S' else 'N' end as AntesLL,
                           case when PAR.ID < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO FINAL')  then 'S' else 'N' end as AntesLF
                      from EPCPARDRE par where par.codgruconta <= 0
                       and par.grupo not in ('DESPESA OPERACIONAL','LUCRO OPERACIONAL','DESPESA FINANCEIRA','LUCRO FINANCEIRO','DESPESA TRIBUTARIA','LUCRO TRIBUTARIO')
                    union all
                    select rownum + 9 +
                           case when AntesRO = 'N' and AntesLL = 'S' then  (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL')
                                when AntesRO = 'N' and AntesLL = 'N' then  (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO')
                           else 0 end as id,
                    to_char(codgruconta) as codgruconta, grupo, INFCONTAS, COR, '' as TIPOCONTA, '' as RESPONSAVEL, AntesRO, AntesLL, AntesLF
                    from (
                  select distinct    DECODE(CT.usarateiocentrocusto,'S',NVL(CC.codigocentrocusto,'9998'),'9999') as CODGRUCONTA,
                         DECODE(CT.usarateiocentrocusto,'S',NVL(CC.DESCRICAO,'NÃO INFORMADO'),'NÃO USA CENTRO DE CUSTO') as GRUPO,
                         'N' as INFCONTAS, NULL as COR,
                         case
                              when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                         and id < (select ID from EPCPARDRE where upper(grupo) like 'RESULTADO OPERACIONAL'))  then 'S' else 'N' end as AntesRO,
                         case
                              when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                         and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLL,
                         case
                              when CT.CODCONTA in (select codgruconta from EPCPARDRE where codgruconta > 0
                         and id < (select ID from EPCPARDRE where upper(grupo) like 'LUCRO LIQUIDO'))  then 'S' else 'N' end as AntesLF
                    from EPCPARDRE PAR, PCCONTA CT, PCCENTROCUSTO CC,
                         (select codconta, codigocentrocusto from PCCONTACENTROCUSTO
                           union
                           SELECT  FIN.CODCONTA, rC.CodigoCentroCusto
                             FROM  PCLANC FIN, PCCONTA CT, PCRATEIOCENTROCUSTO RC
                            WHERE  FIN.CODCONTA = CT.CODCONTA
                              AND  CT.GRUPOCONTA >= 200
                              AND  FIN.CODFILIAL IN ({0})
                              AND  FIN.RECNUM = RC.RECNUM
                              AND  FIN.CODCONTA = RC.CODCONTA
                              AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO'
                              AND  {1} BETWEEN :dtIniA AND :dtFimA
                          ) CCC,
                         (  select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                            from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc
                   where par.codgruconta = CT.codconta (+)
                     and ct.codconta = ccc.codconta (+)
                     and ccc.codigocentrocusto = cc.codigocentrocusto (+)
                     AND SUBSTR(cc.codigocentrocusto, 1, INSTR(cc.codigocentrocusto || '.', '.') - 1) = CCPrinc.codccprinc (+)
                     and par.codgruconta > 0
                   order by 1
                   )
                 union all
                 SELECT ROWNUM+(select max(ID) from EPCPARDRE) as ID, to_char(codgrupo) as CODGRUCONTA, GRUPO, 'N' as INFCONTAS,  NULL as COR, '' as TIPOCONTA, '' as RESPONSAVEL, 'N' as AntesRO, 'N' as AntesLL, 'N' as AntesLF
                   FROM (
                        SELECT CODGRUPO, GRUPO, SUM(VPAGO) AS VPAGO, count(*) as qdeReg
                        FROM (
         SELECT CT.CodConta as codgrupo, CT.conta as GRUPO,
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO
            FROM  PCLANC FIN, PCCONTA CT, PCGRUPO GR, PCRATEIOCENTROCUSTO RC, PCCENTROCUSTO CC,
                  ( select '99' as codccprinc, 'NÃO USA/NÃO INFORMADO' as DescCCPrinc FROM DUAL
                    union
                    select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc
           WHERE  FIN.CODCONTA = CT.CODCONTA
             AND  CT.GRUPOCONTA >= 200
             AND  FIN.CODFILIAL IN ({2})
             AND  FIN.RECNUM = RC.RECNUM (+)
             AND  FIN.CODCONTA = RC.CODCONTA (+)
             AND  CT.grupoconta = GR.codgrupo (+)
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
             AND  SUBSTR(cc.CodigoCentroCusto, 1, INSTR(cc.CodigoCentroCusto || '.', '.') - 1) = CCPrinc.codccprinc (+)
             AND  (CT.CodConta,nvl(RC.CodigoCentroCusto,99)) not in (select p.CODGRUCONTA, nvl(ccc.codigocentrocusto,99) from EPCPARDRE p, PCCONTACENTROCUSTO ccc where p.CODGRUCONTA = ccc.codconta (+) )
            AND {1} BETWEEN :dtIniB AND :dtFimB
                         ) GROUP BY CODGRUPO, GRUPO
                     ORDER BY 1
                     )
                      where VPAGO <> 0  or qdereg <> 0
               )
            group by CODGRUCONTA, GRUPO, AntesRO, AntesLL, AntesLF, TIPOCONTA, RESPONSAVEL
            order By ID
        """;

    /// <summary>
    /// Despesas do período para a análise **Centro de Custo**.
    ///
    /// <para><b>É aqui que a 9815 quebra.</b> O original é:</para>
    /// <code>
    /// SELECT to_number(decode(AntesLF,'N',CODCONTA,  CODCENTROCUSTO))) as GRUPOCONTA
    /// </code>
    /// <para>Dois parênteses abertos, três fechados — `ORA-00923`, nas três cópias por
    /// filial, no `SELECT` e no `GROUP BY`. Consertar o parêntese só trocaria de erro: atrás
    /// dele está `TO_NUMBER` sobre um código como `9701.001`, que dá `ORA-01722`. 1.666 dos
    /// 1.757 centros de custo têm ponto.</para>
    ///
    /// <para><b>Os dois defeitos somem por construção.</b> A chave é texto nos dois ramos do
    /// `decode`, então não há conversão numérica no caminho — a mesma decisão de projeto que
    /// vale para as outras três dimensões.</para>
    ///
    /// <para>A chave da linha injetada de `PCPREST` é `'8501'` nesta dimensão.</para>
    ///
    /// <para>Ordem dos binds, igual às demais: {0} filiais de `PCLANC`, :dtIni1/:dtFim1,
    /// :dtIni2/:dtFim2, {3} filiais de `PCNFSAID`.</para>
    /// </summary>
    public const string DespesasCentroCusto = """
         SELECT  GRUPOCONTA AS GRUPOCONTA, AntesRO AS ANTESRO, AntesLL AS ANTESLL, AntesLF AS ANTESLF, MES_ANO AS MESANO, MES AS MES, ANO AS ANO, sum(VLREALIZADO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) AS VPAGOEXCLUSIVOFORNEC, sum(QdeReg) AS QDEREG
         FROM (
         SELECT  decode(AntesLF,'N',to_char(CODCONTA),  CODCENTROCUSTO) as GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO, SUM(VPAGO) AS VLREALIZADO, sum(VPAGO_EXCLUSIVO_FORNEC) as VPAGO_EXCLUSIVO_FORNEC, count(*) as QdeReg
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
                  DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.CodigoCentroCusto,'9998'),'9999') , NVL(CC.CodigoCentroCusto,'9998')) as CODCENTROCUSTO,
                  DECODE(RC.valor,NULL, DECODE(CT.usarateiocentrocusto,'S',NVL(CC.DESCRICAO,'NÃO INFORMADO'),'NÃO USA CENTRO DE CUSTO') ,NVL(CC.DESCRICAO,'NÃO INFORMADO')) as DESCCENTROCUSTO,
                  GR.codgrupo, GR.GRUPO, FIN.CODCONTA, CT.CONTA,
                  FIN.numtrans, FIN.NUMNOTA, FIN.Duplic, FIN.codprojeto, FIN.dtcompetencia,
                  TO_CHAR({1},'mm/yyyy') as MES_ANO,
                  TO_CHAR({1},'mm') as MES,
                  extract(YEAR FROM {1}) as ANO,
                  SUBSTR(CONCAT(CONCAT(TRIM(FIN.HISTORICO), '. '), TRIM(FIN.HISTORICO2)),0,200) HISTORICO,
                  DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) as VPAGO,
                  {4}
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
                    select CodigoCentroCusto as codccprinc, DESCRICAO as DescCCPrinc
                    from PCCENTROCUSTO where CodigoCentroCusto not like '%.%') CCPrinc
           WHERE  FIN.CODCONTA = CT.CODCONTA
             AND  CT.GRUPOCONTA >= 200
             AND  FIN.CODFILIAL IN ({0})
             AND  FIN.RECNUM = RC.RECNUM (+)
             AND  FIN.CODCONTA = RC.CODCONTA (+)
             AND  CT.grupoconta = GR.codgrupo (+)
             AND  RC.CodigoCentroCusto = cc.CodigoCentroCusto (+)
             AND  SUBSTR(cc.CodigoCentroCusto, 1, INSTR(cc.CodigoCentroCusto || '.', '.') - 1) = CCPrinc.codccprinc (+)
             AND  FIN.historico not like 'REF.CANCEL.BORDERO JA BAIXADO'
             AND not exists (select recnumadiantamento from pclancadiantfornec where recnumpagto is not null and dtestorno is null and recnumadiantamento = fin.recnum)
        {5}
            AND {2} BETWEEN :dtIni1 AND :dtFim1
         AND FIN.CODCONTA NOT IN ( SELECT codconta FROM EPCPARDRE_NAOEXIBIR)
                         ) GROUP BY  decode(AntesLF,'N',to_char(CODCONTA),  CODCENTROCUSTO), AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
         union all
         select '8501' as GRUPOCONTA,
                'N' as AntesRO, 'S' as AntesLL,  'S' as AntesLF, TO_CHAR(FIN.dtpag,'mm/yyyy') as MES_ANO,
                TO_CHAR(FIN.dtpag,'mm') as MES,
                extract(YEAR FROM FIN.dtpag) as ANO, fin.valor as VLREALIZADO, 0 as VPAGO_EXCLUSIVO_FORNEC, 0 as QdeReg
           from pcnfsaid nf, pcprest fin
          where nf.numnota = fin.duplic
            and nf.numtransvenda  = fin.numtransvenda
            and condvenda = 0 and nf.vltotal > 0 and nvl(nf.obs,'X') not like '%CANCELADA%' and nf.dthoracancelamentosefaz is null
            and fin.codcob <> 'DESD' and fin.dtcancel is null
            and fin.dtpag BETWEEN :dtIni2 AND :dtFim2
            and nf.codfilial IN ({3})
        ) GROUP BY GRUPOCONTA, AntesRO, AntesLL, AntesLF, MES_ANO, MES, ANO
        """;

    /// <summary>
    /// Faturamento, CMV e impostos, **agrupados por mês** — a consulta mais cara da 9815.
    ///
    /// <para><b>Duas diferenças em relação ao original, ambas provadas equivalentes</b>
    /// em 28/08/2026:</para>
    /// <list type="number">
    ///   <item>Os <b>seis</b> blocos (3 filiais × vendas e devoluções) viraram <b>dois</b>,
    ///         com `CODFILIAL IN (...)` — `inc4_comparacao_faturamento.sql`.</item>
    ///   <item>As <b>N execuções mensais</b> viraram <b>uma</b>, com `GROUP BY` do mês —
    ///         `inc8_mensal_vs_periodo.sql` e `inc8_faturamento_por_mes.sql`.</item>
    /// </list>
    ///
    /// <para>A segunda só é válida porque as colunas de data <b>não carregam hora</b>: os
    /// meses da 9815 vão de `00:00` a `00:00`, e uma venda em 30/06 às 14h não cairia em
    /// nenhum dos dois. Verificado — 70.435 linhas de `DTSAIDA`, 13.245 de `DTENT` e 30.922
    /// de `DTPAGTO`, nenhuma com hora. Ver `docs/rotinas/9815-dre-gerencial/ESPECIFICACAO.md` §12: se isso mudar, a
    /// equivalência cai.</para>
    ///
    /// <para>Cada bloco agrupa pela <b>sua própria</b> data — vendas por `DTSAIDA`,
    /// devoluções por `DTENT` —, que é o que a execução mensal do original fazia ao
    /// restringir os dois ao mesmo mês.</para>
    ///
    /// <para><b>Não depende do regime.</b> Receita e CMV são idênticos em caixa e
    /// competência.</para>
    ///
    /// <para><b>3. Um terceiro bloco, para as notas SEM item — 10/09/2026.</b> Os dois
    /// primeiros somam <b>item</b> (`PCMOV`); a 9815 soma <b>cabeçalho</b> (`PCNFSAID`), e a
    /// junção interna com os itens engolia a nota inteira quando ela não tem nenhum.</para>
    ///
    /// <para>Foi o defeito da filial <c>28 EPC-TRANSP</c>: `RECEITA BRUTA` zero na web e
    /// 1.152.705,09 na rotina. Ela é transportadora — emite CT-e, que tem `ESPECIE = 'CO'`,
    /// `CONDVENDA` <b>nula</b> e <b>nenhum item em `PCMOV`</b>. Medido em
    /// `docs/rotinas/9815-dre-gerencial/validacao/dc15_receita_da_transportadora.sql`: <b>607 de 607 notas sem
    /// item</b>, todas com `VLTABELA` nulo, o valor inteiro em `VLTOTGER`.</para>
    ///
    /// <para>O bloco novo é <b>aditivo</b>: o `NOT EXISTS` garante que nota com item soma no
    /// primeiro bloco e nota sem item soma neste, nunca nos dois. Os filtros dele são os da
    /// 9815, porque para este caso é ela a referência — inclusive
    /// `NF.CODFISCAL NOT IN (522,...)` e `numtranscteanul IS NULL`, que a soma por item não
    /// precisava.</para>
    ///
    /// <para><b>Resíduo conhecido:</b> nota que <b>tem</b> item, mas cujos itens ficam fora
    /// da lista `MV.CODFISCAL IN (5102,...)`, continua não somando em lugar nenhum — não
    /// entra no primeiro bloco (o filtro a exclui) nem neste (o `NOT EXISTS` a exclui).
    /// Não é o caso da 28, e o bloco 4 da dc15 é quem mede se existe.</para>
    ///
    /// <para><b>4. O hint de paralelismo, em {3} — 17/09/2026.</b> Esta é a consulta mais
    /// cara da rotina: 92,5% de uma apuração (dc43), e dentro dela o bloco de vendas por
    /// item é 93,6% (dc45). Com <c>PARALLEL(4)</c> ela caiu de 70,3 s para 6,0 s.</para>
    ///
    /// <para><b>O hint vai DENTRO do primeiro bloco, e não no SELECT de fora.</b> Os dois
    /// entregam a mesma média, mas o de fora oscila — 11,79 s e depois 6,25 s na mesma
    /// sessão —, enquanto este deu 5,97 s nas duas passadas (dc50). Um DRE que às vezes leva
    /// 6 s e às vezes 12 é pior de conviver que um que leva 6 sempre. E paralelizar o SELECT
    /// externo alcançaria também os blocos 2 e 3, que juntos custam 16 s e não precisam.</para>
    ///
    /// <para>O conteúdo de {3} sai de <c>OpcoesDeParalelismo.HintPara</c>, e é <b>string
    /// vazia</b> quando o paralelismo está desligado — a consulta volta a ser, caractere por
    /// caractere, a de antes. Ver <c>docs/plataforma/PARALELISMO.md</c>.</para>
    ///
    /// <para><b>Binds, na ordem em que aparecem</b> — o ODP.NET liga por posição:
    /// :dtIni1, :dtFim1 (vendas), {0} filiais de `PCNFSAID`, {1} filiais de `PCNFENT`,
    /// :dtIni2, :dtFim2 (devoluções), {2} filiais do bloco sem item, :dtIni3, :dtFim3.</para>
    ///
    /// <para><b>{3} não é bind, é texto.</b> Hint não aceita parâmetro — ele é lido pelo
    /// otimizador antes de qualquer valor ser ligado. Por isso o grau passa por
    /// <c>Math.Clamp</c> antes de virar string.</para>
    /// </summary>
    public const string FaturamentoPorMes = """
        SELECT MESANO                                              AS MESANO,
               Sum(NVL(VLCUSTOFIN,0))                              AS VLCUSTOFIN,
               Sum(NVL(VLTABELA,0))                                AS RECEITABRUTA,
               Sum(NVL(VLTABELA,0)) - Sum(NVL(VLVENDA,0))          AS ABATDESC,
               Sum(NVL(VLDEVOLUCAO,0))                             AS DEVOLUCAO,
               Sum(NVL(VLVENDA,0)) - Sum(NVL(VLDEVOLUCAO,0))       AS RECEITALIQUIDA,
               Sum(NVL(VLCUSTOFIN,0)) - Sum(NVL(VLCMVDEVOL,0))     AS CMVLIQ,
               sum(nvl(VLST,0))     - sum(nvl(VLST_DEV,0))         AS STLIQ,
               sum(nvl(VLPIS,0))    - sum(nvl(VLPIS_DEV,0))        AS PISLIQ,
               sum(nvl(VLCOFINS,0)) - sum(nvl(VLCOFINS_DEV,0))     AS COFINSLIQ,
               /* O DENOMINADOR DA PARTICIPAÇÃO: a receita líquida da filial INTEIRA, sem o
                  filtro de fornecedor. É o que a 9815 chama de VlVendaLiq_Total, e dividir
                  RECEITALIQUIDA por ele dá o `P.23,852%` que ela mostra no lugar do %AV.

                  Sem fornecedor selecionado as colunas filtradas e as _Total são a MESMA
                  expressão, e esta sai igual a RECEITALIQUIDA — a participação é 1, e o
                  rateio não muda número nenhum. */
               Sum(NVL(VLVENDA_Total,0)) - Sum(NVL(VLDEVOLUCAO_total,0)) AS RECEITALIQUIDATOTAL
          FROM (
          SELECT {3} TO_CHAR(NF.DTSAIDA,'mm/yyyy') AS MESANO, SUM(  case when {4} then decode(MV.custofin,0,MV.custofinest-nvl(MV.st,0)-nvl(MVC.vlfecp,0), (MV.custofin-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) ) * MV.qt else 0 end) as VLCUSTOFIN, 
                 SUM(  case when {4} then MV.punit * MV.qt else 0 end) as VLVENDA,  
                 SUM(  MV.punit * MV.qt) VLVENDA_Total,   
                 SUM(  case when {4} then MV.ptabela * MV.qt else 0 end) as VLTABELA, 0 as VLDEVOLUCAO,  0 as VLDEVOLUCAO_total, 0 as VLCMVDEVOL, 
                 SUM(  case when {4} then (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt else 0 end) VLST, 0 as VLST_DEV, 
                 SUM(  case when {4} then ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt else 0 end  ) as VLPIS, 0 AS VLPIS_dev, 
                 SUM(  case when {4} then ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt else 0 end ) as vlcofins, 0 AS vlcofins_dev 
           FROM PCNFSAID NF, PCMOV MV, PCMOVCOMPLE MVC, PCPRODUT PR,  
                (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp 
          WHERE NF.numtransvenda = MV.numtransvenda 
            AND mv.numtransitem  = mvc.numtransitem (+) 
            AND MV.CODPROD       = PR.CODPROD 
            AND NF.codcli        = esp.codcli (+) 
            AND NF.CODFILIAL     = esp.codfil (+) 
            AND MV.DTCANCEL      IS NULL 
            AND NF.DTCANCEL      IS NULL 
            AND MV.CODFISCAL IN (5102,5502,5114,5115,5403,6403,5405,5117,5119,5910,5922,6108,6922,6102,6114,6115,6117,6119,6404,6910) 
            AND ( (NVL(NF.VLTABELA,0) > 0) OR (NVL(NF.VLTOTGER,0) > 0)  OR (NVL(NF.VLTOTAL,0) > 0) OR (NVL(NF.VLCUSTOFIN,0) > 0) ) 
            AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') ) 
            AND NF.DTSAIDA BETWEEN :dtIni1 AND :dtFim1
            AND NF.CODFILIAL IN ({0})
           AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) ) 
            AND nvl(PR.codsec,0) <> @@SECAO_SEM_CUSTO@@ 
          GROUP BY TO_CHAR(NF.DTSAIDA,'mm/yyyy') 
         UNION ALL 
         SELECT TO_CHAR(NFE.DTENT,'mm/yyyy') AS MESANO, 0 as VLCUSTOCONT, 0 as VLVENDA, 0 as VLVENDA_Total, 0 as VLTABELA, 
                SUM( case when {4} then round( NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0) ,2) else 0 end) as VLDEVOLUCAO, 
                SUM( round( NVL(nvl(MV.QT,mv.QTCONT),0)*NVL(nvl(MV.punit,mv.punitcont),0) ,2)) as VLDEVOLUCAO_total, 
                SUM( case when {4} then NVL(MV.QT,0) * (NVL(decode(MV.custofin,0,MV.custofinest,MV.custofin),0)-nvl(MV.st,0)-nvl(MVC.vlfecp,0)) else 0 end  ) VLCMVDEVOL, 
                0 as VLST,     SUM( case when {4} then (nvl(MV.st,0)+nvl(MVC.vlfecp,0)) * MV.qt else 0 end) as VLST_DEV, 
                0 AS VLPIS,    SUM( case when {4} then ( mv.VLPIS - (mv.custocont * mv.PERPIS/100) ) * MV.qt else 0 end ) AS VLPIS_dev, 
                0 AS vlcofins, SUM( case when {4} then ( mv.vlcofins - (mv.custocont * mv.PERCOFINS/100) ) * MV.qt else 0 end ) AS vlcofins_dev 
           FROM PCNFENT NFE, PCMOV MV, PCMOVCOMPLE MVC, PCPEDC PED, PCPRODUT PR, 
                (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp 
          WHERE NFE.numnota       = MV.numnota      (+) 
            AND NFE.numtransent   = MV.numtransent  (+) 
            AND mv.numtransitem   = mvc.numtransitem (+) 
            AND NFE.codfornec     = esp.codcli      (+) 
            AND NFE.CODFILIAL     = esp.codfil      (+) 
            AND MV.numped         = PED.numped      (+) 
            AND MV.CODPROD        = PR.CODPROD 
            AND nvl(PED.CONDVENDA,1) IN ('1','3','5','6','8') 
            AND NFE.CODFILIAL IN ({1})
            AND NFE.TIPODESCARGA IN ('6','7')
            AND MV.DTCANCEL IS NULL AND (NVL(NFE.OBS,'X') <> 'NF CANCELADA') 
            AND NFE.DTENT BETWEEN :dtIni2 AND :dtFim2
            AND MV.CODFISCAL IN (1202,1411,1949,2202,2411,2949) 
          AND MV.CODSEC <> @@SECAO_SEM_CUSTO@@
            /* Cliente especial com `mostra_dre = 'N'` fica de fora do DRE — e ficava só
               metade: o filtro estava nos TRÊS blocos de venda e faltava neste, o de
               devolução. Resultado em 2025/filial 7: somávamos 958,95 de devolução que a
               9815 não soma, e com ela 633,39 de CMV de devolução, que deixava o
               `CMV LIQ.` menos negativo na mesma medida. Medido em
               `docs/rotinas/9815-dre-gerencial/validacao/dc27_devolucao_mostra_dre.sql`.

               Aqui a exceção é `PED.CONDVENDA`, não `NF.CONDVENDA`: a devolução não tem
               nota de saída, e é o pedido que carrega a condição de venda. É a forma da
               própria 9815 (trace de C.Custo Principal / competência, linha 531). */
            AND ( (nvl(esp.mostra_dre,'S') = 'S') or (nvl(PED.CONDVENDA,1) in (5)) )
          GROUP BY TO_CHAR(NFE.DTENT,'mm/yyyy')
         UNION ALL
         /* ── TERCEIRO BLOCO: as notas SEM item em PCMOV ──────────────────────────────
            Acrescentado em 10/09/2026. O bloco de vendas acima soma ITEM (PCMOV); este
            soma o CABEÇALHO, e só das notas que não têm item nenhum — é o que a 9815 faz
            para todas as notas, e o que faltava para o CT-e da transportadora.

            `NOT EXISTS` é o que garante que os dois blocos não se sobreponham: nota com
            item soma lá, nota sem item soma aqui, e nenhuma soma duas vezes. Os filtros
            são os DA 9815, porque para este caso é ela a referência. */
         /* ESTE BLOCO NÃO TEM COMO SER FILTRADO POR FORNECEDOR, e isso é do dado, não do
            código: são as notas SEM item em PCMOV, e sem item não há PCPRODUT de onde ler o
            `codfornec`. O CT-e da transportadora é o caso típico.

            Com filtro ligado o predicado abaixo é falso e elas entram só no DENOMINADOR:
            contam para a receita da filial, não para a do fornecedor. É o tratamento honesto —
            atribuí-las a quem quer que esteja selecionado seria inventar origem para uma nota
            que não declara nenhuma. Sem filtro ele é verdadeiro e tudo volta a ser como era. */
         SELECT TO_CHAR(NF.DTSAIDA,'mm/yyyy') AS MESANO,
                SUM(case when {5} then NVL(NF.VLCUSTOFIN,0) else 0 end) as VLCUSTOFIN,
                SUM(case when {5} then DECODE(NF.CONDVENDA, 8, NF.VLTOTAL, NF.VLTOTGER) else 0 end) as VLVENDA,
                SUM(DECODE(NF.CONDVENDA, 8, NF.VLTOTAL, NF.VLTOTGER)) VLVENDA_Total,
                SUM(case when {5} then NVL(NF.VLTABELA, NF.VLTOTGER) else 0 end) as VLTABELA,
                0 as VLDEVOLUCAO, 0 as VLDEVOLUCAO_total, 0 as VLCMVDEVOL,
                0 as VLST, 0 as VLST_DEV,
                0 as VLPIS, 0 AS VLPIS_dev,
                0 as vlcofins, 0 AS vlcofins_dev
           FROM PCNFSAID NF,
                (select clie.codcli, ce.codfil, ce.mostra_dre from cliente_especial ce, pcclient clie where clie.codcliprinc = ce.codcli) esp
          WHERE NF.codcli        = esp.codcli (+)
            AND NF.CODFILIAL     = esp.codfil (+)
            AND NF.DTCANCEL      IS NULL
            AND ( (NF.CONDVENDA in (1,5,8) OR (NF.ESPECIE = 'CO')) OR ((NF.CONDVENDA = 10) and (substr(replace(replace(replace(nf.cgc,'.',''),'/',''),'-',''),0,8) <> substr(replace(replace(replace(nf.cgcfilial,'.',''),'/',''),'-',''),0,8))) )
            AND ( (NF.CONDVENDA IN (1,3,5,6,8)) OR (NF.ESPECIE = 'CO') )
            AND NF.CODFISCAL NOT IN (522,622,722,532,632,732,5206)
            AND NF.numtranscteanul IS NULL
            AND ( (nvl(esp.mostra_dre,'S') = 'S') or (NF.CONDVENDA in (5)) )
            AND NF.CODFILIAL IN ({2})
            AND NF.DTSAIDA BETWEEN :dtIni3 AND :dtFim3
            AND NOT EXISTS (SELECT 1 FROM PCMOV MV
                             WHERE MV.numtransvenda = NF.numtransvenda
                               AND MV.DTCANCEL IS NULL)
          GROUP BY TO_CHAR(NF.DTSAIDA,'mm/yyyy')
            )
         GROUP BY MESANO
         ORDER BY SUBSTR(MESANO,4,4), SUBSTR(MESANO,1,2)
        """;
}
