namespace Epoca.Kpi.Api.Application.Features.Preferencias.Dtos;

/// <summary>
/// A resposta do <c>POST</c>. <c>Salvo = false</c> não é erro: a base da sessão não guarda
/// preferências (<c>Bases:&lt;Id&gt;:PreferenciasNoBanco</c>), e a escolha vale só até fechar a aba.
/// </summary>
public sealed record PreferenciasSalvasDto(bool Salvo);
