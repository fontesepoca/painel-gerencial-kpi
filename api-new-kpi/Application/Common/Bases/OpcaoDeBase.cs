using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>A forma de uma entrada da seção <c>Bases</c> do <c>appsettings.json</c>.</summary>
public sealed class OpcaoDeBase
{
    public string Rotulo { get; set; } = string.Empty;

    public RegrasDaBase Regras { get; set; } = new();
}
