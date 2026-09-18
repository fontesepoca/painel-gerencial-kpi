using System.Security.Claims;
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.Autenticacao;
using Epoca.Kpi.Api.Application.Features.Autenticacao.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Epoca.Kpi.Api.Controllers;

/// <summary>
/// Login contra o cadastro do Winthor.
///
/// <para><b>Quem chama estas rotas é o servidor Next, não o navegador.</b> O token volta daqui
/// para o BFF, que o guarda e devolve ao navegador só um identificador opaco em cookie
/// <c>HttpOnly</c>. Ver <c>docs/AUTENTICACAO.md</c>.</para>
/// </summary>
[ApiController]
[Route("api/auth")]
public sealed class AutenticacaoController : ControllerBase
{
    private readonly AutenticacaoService _servico;

    public AutenticacaoController(AutenticacaoService servico) => _servico = servico;

    /// <summary>
    /// Confere usuário e senha do Winthor e devolve a sessão.
    /// </summary>
    /// <remarks>
    /// Recusa sempre com <b>401</b>, seja qual for o motivo — o que muda é a mensagem. A
    /// distinção entre "senha errada", "cadastro inativo" e "sem permissão" é deliberada e
    /// está justificada em <see cref="MotivoDaRecusa"/>: sem ela, 2.810 pessoas sem senha
    /// cadastrada e oito inativas com acesso tentariam de novo achando que erraram a
    /// digitação.
    /// </remarks>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<LoginResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Entrar(
        [FromBody] LoginRequest pedido,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.EntrarAsync(pedido, cancellationToken);

        if (resultado.Falha)
        {
            var resposta = ApiResponse<object>.Falha(resultado.Erro!);

            // Campo em branco é 400 — é a requisição que está malformada. Todo o resto é 401:
            // credencial errada, cadastro inativo, falta de permissão. Devolver 403 para os
            // dois últimos seria mais preciso em teoria, mas o BFF trata 401 como "volte para
            // o login", que é exatamente o que deve acontecer nos três casos.
            return resultado.TipoErro == ResultErrorType.Validacao
                ? BadRequest(resposta)
                : Unauthorized(resposta);
        }

        return Ok(ApiResponse<LoginResponse>.Ok(resultado.Valor!));
    }

    /// <summary>
    /// Quem é o dono do token — sem ir ao banco.
    /// </summary>
    /// <remarks>
    /// Serve ao BFF para reidratar a sessão depois de um reinício do Next, e à tela para
    /// saber quais filiais oferecer. Responde a partir das <i>claims</i>: se o token é válido,
    /// a resposta já está dentro dele, e consultar o Oracle aqui seria pagar de novo por uma
    /// informação assinada.
    ///
    /// <para>A contrapartida é que uma mudança de permissão no Winthor só aparece no próximo
    /// login — a mesma contrapartida de carregar as filiais no token, registrada em
    /// <see cref="GeradorDeToken"/>.</para>
    /// </remarks>
    [HttpGet("eu")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<UsuarioDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    public IActionResult Eu()
    {
        var matricula = User.FindFirstValue(GeradorDeToken.ClaimMatricula);

        // Token válido e assinado por nós, mas sem a matrícula dentro: só acontece se alguém
        // mudar o gerador sem mudar isto aqui. Melhor uma recusa clara do que um zero.
        if (!int.TryParse(matricula, out var codigo))
        {
            return Unauthorized(ApiResponse<object>.Falha(
                "Sessão inválida. Entre novamente."));
        }

        var filiais = User.FindAll(GeradorDeToken.ClaimFilial)
            .Select(c => c.Value)
            .ToList();

        // Lista vazia é resposta legítima desde 18/09/2026: quem não tem rotina nenhuma
        // continua tendo sessão válida, e é a tela inicial que decide o que fazer com isso.
        var rotinas = User.FindAll(GeradorDeToken.ClaimRotina)
            .Select(c => c.Value)
            .ToList();

        return Ok(ApiResponse<UsuarioDto>.Ok(new UsuarioDto(
            codigo,
            User.FindFirstValue(GeradorDeToken.ClaimNome) ?? string.Empty,
            User.FindFirstValue(ClaimTypes.Name) ?? string.Empty,
            filiais,
            rotinas)));
    }
}
