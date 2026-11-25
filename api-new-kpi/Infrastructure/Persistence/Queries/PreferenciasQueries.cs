namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// A <c>TAB_WEB_PREFERENCIA_TELA</c> — a primeira tabela em que a aplicação grava (exceção à
/// regra "o piloto é 100% leitura", SCHEMA_BANCO.md). Ver docs/plataforma/PREFERENCIAS.md.
/// </summary>
public static class PreferenciasQueries
{
    /// <summary>Binds, nesta ordem: <c>:matricula</c>, <c>:tela</c>.</summary>
    public const string Obter = """
        SELECT PREFERENCIAS
          FROM TAB_WEB_PREFERENCIA_TELA
         WHERE MATRICULA = :matricula
           AND TELA      = :tela
        """;

    /// <summary>
    /// Junta o trecho ao guardado, ou cria a linha.
    ///
    /// <para>Binds, nesta ordem: <c>:matricula</c>, <c>:tela</c>, <c>:trecho1</c>,
    /// <c>:trecho2</c>. O trecho aparece DUAS vezes (no UPDATE e no INSERT), e bind posicional
    /// exige dois parâmetros — CONVENCOES_ORACLE.md §1.</para>
    ///
    /// <para><b><c>RETURNING CLOB</c> é obrigatório</b>: o retorno padrão do
    /// <c>JSON_MERGEPATCH</c> é <c>VARCHAR2(4000)</c>. O INSERT também passa pelo merge para um
    /// <c>null</c> do primeiro trecho (que no merge quer dizer "apague") não ser gravado.</para>
    /// </summary>
    public const string Salvar = """
        MERGE INTO TAB_WEB_PREFERENCIA_TELA P
        USING (SELECT :matricula AS MATRICULA, :tela AS TELA FROM DUAL) N
           ON (P.MATRICULA = N.MATRICULA AND P.TELA = N.TELA)
         WHEN MATCHED THEN UPDATE SET
              P.PREFERENCIAS = JSON_MERGEPATCH(P.PREFERENCIAS, :trecho1 RETURNING CLOB),
              P.DTALTERACAO  = SYSDATE
         WHEN NOT MATCHED THEN INSERT (MATRICULA, TELA, PREFERENCIAS)
              VALUES (N.MATRICULA, N.TELA, JSON_MERGEPATCH('{}', :trecho2 RETURNING CLOB))
        """;
}
