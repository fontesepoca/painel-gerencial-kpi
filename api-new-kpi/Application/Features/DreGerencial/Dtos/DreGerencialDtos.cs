namespace Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;

/// <summary>
/// Filial no filtro da tela. `CodFilial` é texto — ver <c>Domain/Entities/Filial.cs</c>.
/// </summary>
public record FilialDto(
    string CodFilial,
    string Label,
    string Empresa,
    string Unidade,
    string Uf,
    int? Ordem);
