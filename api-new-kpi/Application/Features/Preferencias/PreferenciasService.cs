using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.Autenticacao;
using Epoca.Kpi.Api.Application.Features.Preferencias.Dtos;
using Epoca.Kpi.Api.Domain.Interfaces;

namespace Epoca.Kpi.Api.Application.Features.Preferencias;

/// <summary>
/// Guarda e devolve as preferências de tela de quem está logado (25/11/2026).
///
/// <para><b>A API guarda, a tela interpreta.</b> O serviço confere só a forma — tela
/// conhecida, objeto JSON, até 32 KB —, não o conteúdo das seções: uma seção nova (a ordem
/// das linhas, os filtros) não exige mudar a API. Quem lê o documento é a tela, e ela lê
/// defensivamente (<c>lib/preferenciasDaExibicao.ts</c>).</para>
///
/// <para><b>A matrícula vem sempre do token</b>, nunca da URL nem do corpo: ninguém lê nem
/// grava a preferência de outra pessoa.</para>
///
/// Ver docs/plataforma/PREFERENCIAS.md.
/// </summary>
public sealed class PreferenciasService
{
    /// <summary>O teto do trecho, em bytes UTF-8. Cabe com folga a ordem das linhas de todas as análises.</summary>
    public const int TamanhoMaximoEmBytes = 32 * 1024;

    /// <summary>As telas que guardam preferências. A próxima entra acrescentando o nome da rota.</summary>
    public static readonly IReadOnlySet<string> Telas = new HashSet<string>(StringComparer.Ordinal)
    {
        "dre-gerencial",
    };

    private readonly IPreferenciasRepository _repositorio;
    private readonly IBaseAtual _baseAtual;

    public PreferenciasService(IPreferenciasRepository repositorio, IBaseAtual baseAtual)
    {
        _repositorio = repositorio;
        _baseAtual = baseAtual;
    }

    /// <summary>A matrícula do token, ou <c>null</c> se ele não trouxer uma numérica.</summary>
    public static int? MatriculaDo(ClaimsPrincipal usuario) =>
        int.TryParse(usuario.FindFirst(GeradorDeToken.ClaimMatricula)?.Value, out var matricula)
            ? matricula
            : null;

    public async Task<Result<JsonElement>> ObterAsync(
        int matricula,
        string tela,
        CancellationToken cancellationToken = default)
    {
        if (!Telas.Contains(tela)) return Result<JsonElement>.Invalido(TelaDesconhecida);

        // Base sem a tabela: a tela abre no padrão. Nem consulta — seria um ORA-00942.
        if (!_baseAtual.Base.PreferenciasNoBanco) return Result<JsonElement>.Ok(Vazio());

        var guardado = await _repositorio.ObterAsync(matricula, tela, cancellationToken);
        return Result<JsonElement>.Ok(ComoObjeto(guardado));
    }

    public async Task<Result<PreferenciasSalvasDto>> SalvarAsync(
        int matricula,
        string tela,
        JsonElement trecho,
        CancellationToken cancellationToken = default)
    {
        if (!Telas.Contains(tela)) return Result<PreferenciasSalvasDto>.Invalido(TelaDesconhecida);

        if (trecho.ValueKind != JsonValueKind.Object)
        {
            return Result<PreferenciasSalvasDto>.Invalido(
                "O corpo tem de ser um objeto JSON, como {\"exibicao\":{\"av\":false}}.");
        }

        // O texto como chegou: GetRawText devolve o trecho do corpo, sem reescrever.
        var texto = trecho.GetRawText();
        if (Encoding.UTF8.GetByteCount(texto) > TamanhoMaximoEmBytes)
        {
            return Result<PreferenciasSalvasDto>.Invalido(
                $"As preferências passam de {TamanhoMaximoEmBytes / 1024} KB.");
        }

        if (!_baseAtual.Base.PreferenciasNoBanco)
        {
            return Result<PreferenciasSalvasDto>.Ok(new PreferenciasSalvasDto(false));
        }

        await _repositorio.SalvarAsync(matricula, tela, texto, cancellationToken);
        return Result<PreferenciasSalvasDto>.Ok(new PreferenciasSalvasDto(true));
    }

    private const string TelaDesconhecida = "Esta tela não guarda preferências.";

    private static JsonElement Vazio()
    {
        using var documento = JsonDocument.Parse("{}");
        return documento.RootElement.Clone();
    }

    /// <summary>
    /// O guardado, se for um objeto JSON; <c>{}</c> em qualquer outro caso. O check
    /// <c>IS JSON</c> da tabela já barra texto que não é JSON — isto é a rede de baixo, para
    /// um documento estragado abrir a tela no padrão em vez de derrubá-la.
    /// </summary>
    private static JsonElement ComoObjeto(string? guardado)
    {
        if (string.IsNullOrWhiteSpace(guardado)) return Vazio();
        try
        {
            using var documento = JsonDocument.Parse(guardado);
            return documento.RootElement.ValueKind == JsonValueKind.Object
                ? documento.RootElement.Clone()
                : Vazio();
        }
        catch (JsonException)
        {
            return Vazio();
        }
    }
}
