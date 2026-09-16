namespace Epoca.Kpi.Api.Application.Features.Autenticacao.Dtos;

/// <summary>
/// O que a tela de login envia.
///
/// <para><b>Só nome de guerra.</b> Matrícula e código de barras não são aceitos, ao contrário
/// do painel antigo: 44 textos casam duas pessoas diferentes quando os três são aceitos no
/// mesmo <c>OR</c> — <c>774</c> é o nome de guerra de uma e a matrícula de outra. Ver
/// <c>docs/AUTENTICACAO.md</c>.</para>
/// </summary>
/// <param name="Login">O nome de guerra, como no Winthor. A caixa não importa.</param>
/// <param name="Senha">A mesma senha do Winthor.</param>
public sealed record LoginRequest(string Login, string Senha);

/// <summary>
/// A sessão recém-criada.
///
/// <para><b>Este objeto nunca chega ao navegador.</b> Quem o consome é o servidor Next, que
/// guarda o token e devolve ao navegador apenas um identificador opaco em cookie
/// <c>HttpOnly</c> — o desenho de BFF decidido em 14/09/2026.</para>
/// </summary>
/// <param name="Token">JWT assinado por esta API.</param>
/// <param name="ExpiraEm">Instante da expiração, em UTC. Vai junto para o BFF não precisar
/// abrir o token só para saber quando renovar.</param>
/// <param name="Usuario">Quem entrou, e o que ele pode apurar.</param>
public sealed record LoginResponse(string Token, DateTimeOffset ExpiraEm, UsuarioDto Usuario);

/// <summary>
/// A identidade que a tela mostra e usa para montar os filtros.
/// </summary>
/// <param name="Matricula">A matrícula do <c>PCEMPR</c>.</param>
/// <param name="Nome">Nome completo, para o cabeçalho.</param>
/// <param name="NomeGuerra">O que a pessoa digita para entrar.</param>
/// <param name="Filiais">As filiais que ela pode apurar, vindas do <c>PCLIB</c>. É o recorte
/// que a tela oferece — e que a API vai passar a exigir.</param>
public sealed record UsuarioDto(
    int Matricula,
    string Nome,
    string NomeGuerra,
    IReadOnlyList<string> Filiais);
