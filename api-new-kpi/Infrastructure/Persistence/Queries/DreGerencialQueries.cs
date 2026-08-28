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
    /// Adaptada do trace da 9815 (`docs/Resultado das consultas na rotina oficial/`).
    /// Duas diferenças deliberadas em relação ao original, ambas documentadas em
    /// `docs/ROTINA_9815.md`:
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
         ORDER BY F.ORDEM_PROCESSA, LPAD(F.CODFIL, 10, '0')
        """;

    /// <summary>
    /// Estrutura de linhas do DRE para a análise **Grupo de Contas**.
    ///
    /// <para>
    /// A 9815 usa um SQL diferente para cada dimensão — não é uma consulta parametrizada.
    /// As outras três entram nos próximos incrementos (ver `docs/ROTINA_9815_LEVANTAMENTO.md`
    /// §4.4.1).
    /// </para>
    ///
    /// <para>
    /// <b>Falta aqui, de propósito, o `UNION ALL` das contas órfãs</b> — as que têm
    /// movimento no período e não estão parametrizadas em `EPCPARDRE`, e que a 9815 exibe
    /// depois do LUCRO LIQUIDO. Aquele trecho precisa de período e filiais, e varre `PCLANC`;
    /// entra no incremento 3, junto com a leitura de despesas, para não pagar duas vezes
    /// pela mesma varredura.
    /// </para>
    ///
    /// <para>
    /// `ORDER BY ID` com `MIN(ID)`: a linha de `ID` nulo do cadastro cai no fim
    /// (`NULLS LAST` é o padrão do Oracle em ordem crescente, e está explícito para não
    /// depender disso). É assim que "Pneus e Câmaras" aparece após o LUCRO LIQUIDO.
    /// </para>
    ///
    /// Sem parâmetros.
    /// </summary>
    public const string EstruturaGrupoDeContas = """
        SELECT MIN(ID)         AS ID,
               CODGRUCONTA     AS CODGRUCONTA,
               GRUPO           AS GRUPO,
               MAX(INFCONTAS)  AS INFCONTAS,
               MAX(COR)        AS COR,
               ANTESRO         AS ANTESRO,
               ANTESLL         AS ANTESLL,
               ANTESLF         AS ANTESLF
          FROM (
                SELECT PAR.ID                                     AS ID,
                       CASE WHEN PAR.CODGRUCONTA <= 0
                            THEN TO_CHAR(PAR.CODGRUCONTA)
                            ELSE TO_CHAR(GR.CODGRUPO) END         AS CODGRUCONTA,
                       CASE WHEN PAR.CODGRUCONTA <= 0
                            THEN PAR.GRUPO
                            ELSE GR.GRUPO END                     AS GRUPO,
                       PAR.INFCONTAS                              AS INFCONTAS,
                       PAR.COR                                    AS COR,
                       CASE WHEN PAR.ID < (SELECT ID FROM EPCPARDRE
                                            WHERE UPPER(GRUPO) LIKE 'RESULTADO OPERACIONAL')
                            THEN 'S' ELSE 'N' END                 AS ANTESRO,
                       CASE WHEN PAR.ID < (SELECT ID FROM EPCPARDRE
                                            WHERE UPPER(GRUPO) LIKE 'LUCRO LIQUIDO')
                            THEN 'S' ELSE 'N' END                 AS ANTESLL,
                       CASE WHEN PAR.ID < (SELECT ID FROM EPCPARDRE
                                            WHERE UPPER(GRUPO) LIKE 'LUCRO LIQUIDO')
                            THEN 'S' ELSE 'N' END                 AS ANTESLF
                  FROM EPCPARDRE PAR, PCCONTA CO, PCGRUPO GR
                 WHERE PAR.CODGRUCONTA = CO.CODCONTA (+)
                   AND CO.GRUPOCONTA   = GR.CODGRUPO (+)
               )
         GROUP BY CODGRUCONTA, GRUPO, ANTESRO, ANTESLL, ANTESLF
         ORDER BY ID NULLS LAST
        """;
}
