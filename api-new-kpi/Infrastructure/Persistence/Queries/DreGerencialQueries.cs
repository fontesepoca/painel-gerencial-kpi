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
}
