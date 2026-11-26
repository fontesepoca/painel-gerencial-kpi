namespace Epoca.Kpi.Api.Domain.Interfaces;

/// <summary>
/// As preferências de tela por usuário — a <c>TAB_WEB_PREFERENCIA_TELA</c>, uma linha por
/// (matrícula, tela), com o JSON em seções. Ver docs/plataforma/PREFERENCIAS.md.
/// </summary>
public interface IPreferenciasRepository
{
    /// <summary>O JSON guardado, ou <c>null</c> se a pessoa nunca salvou nada nesta tela.</summary>
    Task<string?> ObterAsync(int matricula, string tela, CancellationToken cancellationToken = default);

    /// <summary>
    /// Junta <paramref name="trecho"/> ao que está guardado (<c>JSON_MERGEPATCH</c>) e cria a
    /// linha se ainda não houver. Só as chaves do trecho mudam: duas abas gravando seções ou
    /// opções diferentes não apagam uma a outra.
    /// </summary>
    Task SalvarAsync(int matricula, string tela, string trecho, CancellationToken cancellationToken = default);
}
