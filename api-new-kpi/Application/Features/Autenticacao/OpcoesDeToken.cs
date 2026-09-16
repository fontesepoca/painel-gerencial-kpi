namespace Epoca.Kpi.Api.Application.Features.Autenticacao;

/// <summary>
/// Configuração do JWT, lida da seção <c>Jwt</c> do appsettings.
///
/// <para><b>A chave nunca é comitada.</b> Ela mora no <c>appsettings.Development.json</c>, que
/// está no <c>.gitignore</c>, ou numa variável de ambiente. O <c>appsettings.example.json</c>
/// mostra o formato com valor de exemplo.</para>
/// </summary>
public sealed class OpcoesDeToken
{
    public const string Secao = "Jwt";

    /// <summary>
    /// A chave de assinatura. HMAC-SHA256 exige pelo menos 256 bits — 32 caracteres ASCII.
    /// <see cref="Validar"/> recusa menos que isso no boot.
    /// </summary>
    public string Chave { get; set; } = string.Empty;

    public string Emissor { get; set; } = "epoca-kpi-api";

    public string Audiencia { get; set; } = "epoca-kpi";

    /// <summary>
    /// Validade do token, em minutos.
    ///
    /// <para>Oito horas cobrem um turno inteiro sem renovação, que é o uso real desta tela: o
    /// contador abre o DRE de manhã e volta a ele durante o dia. O risco de uma janela longa é
    /// contido pelo desenho de BFF — o token vive no servidor Next, e o navegador só tem um
    /// identificador opaco de sessão.</para>
    /// </summary>
    public int MinutosDeValidade { get; set; } = 480;

    /// <summary>
    /// Falha no boot se a configuração não presta.
    ///
    /// <para><b>No boot, e não no primeiro login.</b> Uma chave ausente descoberta quando
    /// alguém tenta entrar aparece como erro 500 numa tela de login — e ninguém liga isso a
    /// uma variável de ambiente esquecida no deploy. Aqui a API não sobe, e a mensagem diz o
    /// que falta.</para>
    /// </summary>
    public void Validar()
    {
        if (string.IsNullOrWhiteSpace(Chave))
        {
            throw new InvalidOperationException(
                "Jwt:Chave não está configurada. Preencha no appsettings do ambiente " +
                "(veja appsettings.example.json) ou na variável de ambiente Jwt__Chave.");
        }

        if (Chave.Length < 32)
        {
            throw new InvalidOperationException(
                $"Jwt:Chave tem {Chave.Length} caracteres. HMAC-SHA256 exige pelo menos 32 " +
                "para a assinatura valer alguma coisa.");
        }

        if (MinutosDeValidade <= 0)
        {
            throw new InvalidOperationException(
                $"Jwt:MinutosDeValidade está {MinutosDeValidade}. Um token que já nasce " +
                "expirado deixa a tela num laço de login.");
        }
    }
}
