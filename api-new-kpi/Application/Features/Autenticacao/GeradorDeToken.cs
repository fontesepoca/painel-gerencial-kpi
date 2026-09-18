using System.Security.Claims;
using System.Text;
using Epoca.Kpi.Api.Application.Features.Autenticacao.Dtos;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Epoca.Kpi.Api.Application.Features.Autenticacao;

/// <summary>
/// Emite o JWT da sessão.
///
/// <para><b>O token carrega as filiais.</b> Elas vêm do <c>PCLIB</c> no login e viajam
/// assinadas, para a API não precisar reler 8,4 milhões de linhas a cada apuração. O preço é
/// que uma mudança de filial no Winthor só vale na próxima entrada — aceitável para um recorte
/// que muda de mês em mês, e explícito aqui para não virar surpresa.</para>
/// </summary>
public sealed class GeradorDeToken
{
    /// <summary>A matrícula. É a chave de tudo no Winthor.</summary>
    public const string ClaimMatricula = "matricula";

    /// <summary>O nome completo, para o cabeçalho da tela.</summary>
    public const string ClaimNome = "nome";

    /// <summary>Uma claim por filial liberada.</summary>
    public const string ClaimFilial = "filial";

    /// <summary>
    /// Uma claim por rotina que a pessoa pode abrir — o código do Winthor, como <c>9815</c>.
    ///
    /// <para><b>Vai no token, e não só na resposta do login</b>, porque é com isto que a API
    /// vai recusar uma chamada ao DRE de quem não pode abri-lo. A resposta do login some
    /// depois do primeiro uso; o token acompanha cada requisição.</para>
    /// </summary>
    public const string ClaimRotina = "rotina";

    private readonly OpcoesDeToken _opcoes;
    private readonly SigningCredentials _assinatura;

    public GeradorDeToken(IOptions<OpcoesDeToken> opcoes)
    {
        _opcoes = opcoes.Value;
        _opcoes.Validar();

        var chave = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opcoes.Chave));
        _assinatura = new SigningCredentials(chave, SecurityAlgorithms.HmacSha256);
    }

    public (string Token, DateTimeOffset ExpiraEm) Emitir(UsuarioDto usuario)
    {
        var agora = DateTimeOffset.UtcNow;
        var expiraEm = agora.AddMinutes(_opcoes.MinutosDeValidade);

        var identidade = new ClaimsIdentity(
        [
            new Claim(JwtRegisteredClaimNames.Sub, usuario.Matricula.ToString()),
            new Claim(ClaimMatricula, usuario.Matricula.ToString()),
            new Claim(ClaimNome, usuario.Nome),
            // `ClaimTypes.Name` é o que alimenta `User.Identity.Name`, e nele vai o nome de
            // guerra: é o identificador com que a pessoa entrou, e o que faz sentido aparecer
            // num log de acesso. O nome completo tem claim própria, acima.
            new Claim(ClaimTypes.Name, usuario.NomeGuerra),
            // Identificador único deste token. Serve para o dia em que existir revogação:
            // sem ele, invalidar uma sessão específica exigiria trocar a chave de todas.
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        ]);

        // Uma claim por filial, e não uma string com vírgulas: a lista chega ao outro lado
        // como lista, sem ninguém ter de lembrar de separá-la — e o dia em que um código de
        // filial tiver vírgula, nada quebra.
        foreach (var filial in usuario.Filiais)
        {
            identidade.AddClaim(new Claim(ClaimFilial, filial));
        }

        // Pelo mesmo motivo, uma claim por rotina. Lista vazia é estado válido: desde
        // 18/09/2026 quem não tem permissão nenhuma entra assim mesmo, e o token diz isso
        // em vez de não existir.
        foreach (var rotina in usuario.Rotinas)
        {
            identidade.AddClaim(new Claim(ClaimRotina, rotina));
        }

        var descritor = new SecurityTokenDescriptor
        {
            Subject = identidade,
            Issuer = _opcoes.Emissor,
            Audience = _opcoes.Audiencia,
            IssuedAt = agora.UtcDateTime,
            NotBefore = agora.UtcDateTime,
            Expires = expiraEm.UtcDateTime,
            SigningCredentials = _assinatura
        };

        return (new JsonWebTokenHandler().CreateToken(descritor), expiraEm);
    }
}
