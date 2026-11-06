using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Epoca.Kpi.Api.Controllers;

/// <summary>
/// DRE Gerencial — rotina 9815 do Winthor.
/// </summary>
[ApiController]
[Authorize]
[Route("api/dre-gerencial")]
public sealed class DreGerencialController : ControllerBase
{
    private readonly DreGerencialService _servico;
    private readonly IBaseAtual _baseAtual;
    private readonly ILogger<DreGerencialController> _log;
    private readonly JsonSerializerOptions _json;

    public DreGerencialController(
        DreGerencialService servico,
        IBaseAtual baseAtual,
        ILogger<DreGerencialController> log,
        IOptions<JsonOptions> json)
    {
        _servico = servico;
        _baseAtual = baseAtual;
        _log = log;
        // As MESMAS opções das respostas de sempre: o pacote do lote tem os nomes e formatos
        // que o front já lê no detalhamento de uma célula.
        _json = json.Value.JsonSerializerOptions;
    }

    /// <summary>Filiais disponíveis para o filtro, na ordem de exibição do cadastro.</summary>
    [HttpGet("filiais")]
    public async Task<IActionResult> ObterFiliais(CancellationToken cancellationToken)
    {
        var resultado = await _servico.ObterFiliaisAsync(cancellationToken);

        if (resultado.Falha)
        {
            var resposta = ApiResponse<object>.Falha(resultado.Erro!);
            return resultado.TipoErro switch
            {
                ResultErrorType.NaoEncontrado => NotFound(resposta),
                ResultErrorType.Proibido => StatusCode(StatusCodes.Status403Forbidden, resposta),
                ResultErrorType.Conflito => Conflict(resposta),
                _ => BadRequest(resposta)
            };
        }

        return Ok(ApiResponse<IReadOnlyList<FilialDto>>.Ok(resultado.Valor!));
    }

    /// <summary>
    /// Busca fornecedores para o filtro, por nome ou por código exato.
    ///
    /// <para><c>GET</c> porque é consulta pura, idempotente e cacheável pelo navegador — e
    /// porque a tela chama isto a cada tecla digitada.</para>
    /// </summary>
    [HttpGet("fornecedores")]
    public async Task<IActionResult> BuscarFornecedores(
        [FromQuery] string? busca,
        [FromQuery] int limite = 20,
        CancellationToken cancellationToken = default)
    {
        var resultado = await _servico.BuscarFornecedoresAsync(busca, limite, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<IReadOnlyList<FornecedorDto>>.Ok(resultado.Valor!));
    }

    /// <summary>
    /// Estrutura de linhas do DRE — o que a tabela exibe, em que ordem e com que cor,
    /// já incluindo as contas órfãs do período. Ainda sem os valores.
    /// Virou POST porque agora depende de filiais, período e regime.
    /// </summary>
    [HttpPost("estrutura")]
    public async Task<IActionResult> ObterEstrutura(
        [FromBody] DespesasFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.ObterEstruturaAsync(filtro, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<IReadOnlyList<LinhaEstruturaDto>>.Ok(resultado.Valor!));
    }

    /// <summary>
    /// Despesas do período, agregadas por grupo e mês. Etapa intermediária: ainda não é o
    /// DRE montado, é a saída bruta do `GetValorGrupo` para conferência contra a 9815.
    /// </summary>
    [HttpPost("despesas")]
    public async Task<IActionResult> ObterDespesas(
        [FromBody] DespesasFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.ObterDespesasAsync(filtro, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<IReadOnlyList<DespesaDto>>.Ok(resultado.Valor!));
    }

    /// <summary>
    /// Cabeçalho do DRE: faturamento, CMV e impostos. Etapa intermediária, para conferência
    /// contra a 9815 antes da montagem completa.
    /// </summary>
    [HttpPost("faturamento")]
    public async Task<IActionResult> ObterFaturamento(
        [FromBody] DespesasFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.ObterFaturamentoAsync(filtro, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<IReadOnlyList<FaturamentoDto>>.Ok(resultado.Valor!));
    }

    /// <summary>
    /// Apura o DRE completo. É a rotina 9815 ponta a ponta.
    /// Pode levar minutos — a consulta de faturamento sozinha leva de 17 s a 2 min por mês.
    /// </summary>
    [HttpPost("apuracao")]
    public async Task<IActionResult> Apurar(
        [FromBody] DespesasFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.ApurarAsync(filtro, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<ApuracaoDto>.Ok(
            resultado.Valor! with { Base = BaseDto.De(_baseAtual.Base) }));
    }

    /// <summary>
    /// Detalhamento de uma célula — o duplo clique da 9815.
    ///
    /// <para>São três telas: receita por cliente, devolução por motivo e a lista de
    /// lançamentos. O destino vem pronto no campo `detalhe` de cada linha da apuração;
    /// linha sem `detalhe` não abre nada.</para>
    ///
    /// <para><b>Período do mês clicado</b>, recortado pelo da apuração — não o mês
    /// calendário inteiro.</para>
    ///
    /// <para>Pode demorar: a receita por cliente varre as mesmas notas da apuração e foi
    /// medida em 116,9 s para um mês e três filiais.</para>
    /// </summary>
    [HttpPost("detalhe")]
    public async Task<IActionResult> ObterDetalhe(
        [FromBody] DetalheFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.ObterDetalheAsync(filtro, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<DetalhamentoDto>.Ok(
            resultado.Valor! with { Base = BaseDto.De(_baseAtual.Base) }));
    }

    private static readonly byte[] QuebraDeLinha = "\n"u8.ToArray();

    /// <summary>
    /// Exportação do detalhamento EM LOTE (06/11/2026) — muitas linhas × muitas colunas, em
    /// fluxo NDJSON: <c>inicio</c>, <c>aguarde</c> a cada 15 s, uma <c>parte</c> por linha ×
    /// coluna, <c>falha</c> do que não deu, <c>fim</c>. Ver <c>LoteDeDetalhe</c>.
    ///
    /// <para><b>Cada pacote sai na hora</b> (<c>FlushAsync</c>), e o <c>no-transform</c> impede o
    /// Next de comprimir — compressão em blocos seguraria o batimento, e a conexão pareceria
    /// parada justamente quando está trabalhando.</para>
    /// </summary>
    [HttpPost("detalhe/lote")]
    public async Task ObterDetalheEmLote(
        [FromBody] LoteFiltroDto lote,
        CancellationToken cancellationToken)
    {
        var erro = _servico.ValidarLote(lote);
        if (erro is not null)
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsJsonAsync(ApiResponse<object>.Falha(erro), _json, cancellationToken);
            return;
        }

        Response.ContentType = "application/x-ndjson; charset=utf-8";
        Response.Headers.CacheControl = "no-store, no-transform";
        HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

        async Task Escrever(PacoteDoLote pacote)
        {
            await JsonSerializer.SerializeAsync(Response.Body, pacote, _json, cancellationToken);
            await Response.Body.WriteAsync(QuebraDeLinha, cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }

        try
        {
            await foreach (var pacote in _servico.ExecutarLoteAsync(lote, cancellationToken))
            {
                await Escrever(pacote);
            }
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            // Depois do primeiro byte não há mais status a mudar: o erro vai como pacote, e o
            // front monta o zip parcial com o que já chegou.
            _log.LogError(e, "Lote do detalhamento interrompido");
            await Escrever(PacoteDoLote.Erro("A exportação parou por um erro no servidor."));
        }
    }
}
