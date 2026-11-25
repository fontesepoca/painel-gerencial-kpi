using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>A forma de uma entrada da seção <c>Bases</c> do <c>appsettings.json</c>.</summary>
public sealed class OpcaoDeBase
{
    public string Rotulo { get; set; } = string.Empty;

    public RegrasDaBase Regras { get; set; } = new();

    /// <summary>
    /// Liga a gravação das preferências de tela — só onde a <c>TAB_WEB_PREFERENCIA_TELA</c>
    /// existe. Ausente vale <c>false</c>. Ver docs/plataforma/PREFERENCIAS.md.
    /// </summary>
    public bool PreferenciasNoBanco { get; set; }
}
