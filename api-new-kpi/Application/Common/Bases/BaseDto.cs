using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>A base como a tela a vê: o id que volta no login e o rótulo que se mostra.</summary>
public sealed record BaseDto(string Id, string Rotulo)
{
    public static BaseDto De(BaseConfigurada baseConfigurada) =>
        new(baseConfigurada.Id, baseConfigurada.Rotulo);
}
