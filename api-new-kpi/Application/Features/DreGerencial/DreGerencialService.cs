using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Domain.Interfaces;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Casos de uso da rotina DRE Gerencial (9815 do Winthor).
/// </summary>
public sealed class DreGerencialService
{
    private readonly IDreGerencialRepository _repositorio;

    public DreGerencialService(IDreGerencialRepository repositorio) => _repositorio = repositorio;

    /// <summary>
    /// Filiais do filtro. Lista vazia é resultado válido, não erro — cadastro sem filial
    /// é problema de configuração do banco, e o front trata mostrando o filtro vazio.
    /// </summary>
    public async Task<Result<IReadOnlyList<FilialDto>>> ObterFiliaisAsync(
        CancellationToken cancellationToken = default)
    {
        var filiais = await _repositorio.ObterFiliaisAsync(cancellationToken);

        var dtos = filiais
            .Select(f => new FilialDto(
                f.CodFilial, f.Label, f.Empresa, f.EmpresaCodigo, f.Unidade, f.Uf, f.Ordem))
            .ToList();

        return Result<IReadOnlyList<FilialDto>>.Ok(dtos);
    }
}
