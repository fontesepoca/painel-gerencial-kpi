using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Domain.Interfaces;

/// <summary>
/// Leitura do cadastro de acesso do Winthor. <b>Só leitura</b> — o usuário da API tem apenas
/// <c>SELECT</c>, e isso é garantia do banco, não disciplina de quem escreve a query.
/// </summary>
public interface IAutenticacaoRepository
{
    /// <summary>
    /// Confere uma tentativa de login e devolve o diagnóstico completo.
    ///
    /// <para><c>null</c> quando o nome de guerra não existe — ou quando existe em mais de uma
    /// pessoa, caso em que ninguém entra: ver a implementação.</para>
    ///
    /// <para><b>A senha entra e não volta.</b> Ela é comparada dentro do Oracle; o que
    /// atravessa é só o resultado da comparação.</para>
    /// </summary>
    Task<CredenciaisWinthor?> VerificarCredenciaisAsync(
        string nomeGuerra,
        string senha,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// As filiais que a pessoa pode apurar, na ordem numérica. Lista vazia é resposta
    /// legítima: significa que ela não tem filial liberada em <c>PCLIB</c>.
    /// </summary>
    Task<IReadOnlyList<string>> ObterFiliaisDoUsuarioAsync(
        int matricula,
        CancellationToken cancellationToken = default);
}
