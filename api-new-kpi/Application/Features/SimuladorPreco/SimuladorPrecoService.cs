using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.SimuladorPreco.Dtos;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;

namespace Epoca.Kpi.Api.Application.Features.SimuladorPreco;

/// <summary>
/// O simulador de preço. A API só CONSULTA: o recálculo com o preço digitado é feito na tela
/// (decisão D1), e esta camada não faz conta nenhuma sobre o que o SQL devolve.
/// </summary>
public sealed class SimuladorPrecoService
{
    private readonly ISimuladorPrecoRepository _repositorio;

    public SimuladorPrecoService(ISimuladorPrecoRepository repositorio) => _repositorio = repositorio;

    public async Task<Result<ConsultaSimuladorDto>> ConsultarAsync(
        SimuladorPrecoFiltroDto filtro,
        int matricula,
        CancellationToken cancellationToken = default)
    {
        var codFilial = filtro.CodFilial?.Trim() ?? string.Empty;

        // Só dígitos: o código vai como bind, então não é questão de injeção — é de não mandar ao
        // Oracle uma consulta de minutos para uma filial que não pode existir.
        if (codFilial.Length == 0 || !codFilial.All(char.IsAsciiDigit))
        {
            return Result<ConsultaSimuladorDto>.Invalido("Escolha uma filial.");
        }

        if (filtro.NumRegiao <= 0)
        {
            return Result<ConsultaSimuladorDto>.Invalido("Escolha uma região.");
        }

        // Vários fornecedores (spec 2026-11-24-simulador-varios-fornecedores). Vazio = todos.
        IReadOnlyList<int>? fornecedores = null;
        if (filtro.Fornecedores is { Count: > 0 })
        {
            if (filtro.Fornecedores.Count > LimiteDeFornecedores)
            {
                return Result<ConsultaSimuladorDto>.Invalido(
                    $"Mais de {LimiteDeFornecedores} fornecedores: consulte sem filtro de fornecedor.");
            }

            // Zero ou negativo é recusado, e não lido como "todos": "todos" é a lista vazia.
            if (filtro.Fornecedores.Any(f => f <= 0))
            {
                return Result<ConsultaSimuladorDto>.Invalido("Código de fornecedor inválido.");
            }

            fornecedores = filtro.Fornecedores.Distinct().Order().ToList();
        }

        // ── A paginação no back-end (spec 2026-11-24-simulador-paginacao-no-backend). ──
        if (filtro.Pagina < 1)
        {
            return Result<ConsultaSimuladorDto>.Invalido("Página inválida.");
        }

        var busca = filtro.Busca?.Trim();
        if (busca is { Length: > TamanhoMaximoDaBusca })
        {
            return Result<ConsultaSimuladorDto>.Invalido(
                $"Busca muito longa (máximo {TamanhoMaximoDaBusca} caracteres).");
        }

        IReadOnlyList<string>? classes = null;
        if (filtro.Classes is not null)
        {
            if (filtro.Classes.Count == 0)
            {
                return Result<ConsultaSimuladorDto>.Invalido("Marque ao menos uma classe.");
            }

            var normalizadas = filtro.Classes.Select(c => c?.Trim().ToUpperInvariant() ?? "").Distinct().ToList();
            if (normalizadas.Any(c => !ClassesDeVenda.Contains(c)))
            {
                return Result<ConsultaSimuladorDto>.Invalido("Classe inválida.");
            }

            // As três marcadas = sem filtro de classe: assim uma linha sem classe (ou de outra
            // letra, numa base ainda não medida) não some do total (spec, casos de borda).
            classes = ClassesDeVenda.All(normalizadas.Contains) ? null : normalizadas;
        }

        IReadOnlyList<string>? codigos = null;
        if (filtro.Codigos is not null)
        {
            if (filtro.Codigos.Count > LimiteDeCodigos)
            {
                return Result<ConsultaSimuladorDto>.Invalido(
                    $"Mais de {LimiteDeCodigos} produtos simulados: use a busca.");
            }

            // Só dígitos: os códigos entram num INSTR por vírgula, e uma vírgula dentro de um
            // "código" quebraria a lista. Como bind, não é questão de injeção.
            var limpos = filtro.Codigos.Select(c => c?.Trim() ?? "").ToList();
            if (limpos.Any(c => c.Length == 0 || !c.All(char.IsAsciiDigit)))
            {
                return Result<ConsultaSimuladorDto>.Invalido("Código de produto inválido.");
            }

            codigos = limpos.Distinct().ToList();
        }

        var (linhas, total) = await _repositorio.ConsultarPaginaAsync(
            codFilial, filtro.NumRegiao, fornecedores, matricula,
            filtro.Pagina, TamanhoDaPagina, busca, classes, codigos, cancellationToken);

        // Página vazia é resposta, nunca nulo: o front distingue "nenhum produto" de erro.
        return Result<ConsultaSimuladorDto>.Ok(new ConsultaSimuladorDto(new PagedResult<ProdutoSimuladoDto>
        {
            Itens = linhas.Select(ParaDto).ToList(),
            Pagina = filtro.Pagina,
            TamanhoPagina = TamanhoDaPagina,
            TotalItens = total,
        }));
    }

    /// <summary>Linhas por página. Fixo no servidor: a tela não escolhe (spec).</summary>
    public const int TamanhoDaPagina = 100;

    private const int TamanhoMaximoDaBusca = 60;

    /// <summary>Acima disso, a lista de códigos não cabe com folga num VARCHAR2 de bind.</summary>
    private const int LimiteDeCodigos = 500;

    /// <summary>Fornecedores por consulta (decisão de 24/11/2026). Acima disso, consulte todos.</summary>
    private const int LimiteDeFornecedores = 50;

    /// <summary>As classes de venda medidas na sp14 (24/11/2026): só A, B e C.</summary>
    private static readonly string[] ClassesDeVenda = ["A", "B", "C"];

    private static ProdutoSimuladoDto ParaDto(ProdutoSimulado p) => new(
        p.CodFilial, p.CodProd, p.Descricao, p.ClasseVenda,
        p.Ncm, p.CodigoTributacao, p.DescricaoTributacao, p.TipoImposto,
        p.VlUltPCompra, p.PercIpi, p.VlIpi, p.PercSt, p.VlSt,
        p.PercIcmsEnt, p.PercBaseRedEnt, p.PercIcmCusto, p.VlIcmsEnt,
        p.PerPisEnt, p.VlPisEnt, p.PerCofinsEnt, p.VlCofinsEnt,
        p.PercFreteFobEnt, p.VlFreteFobEnt,
        p.CustoAntesCbs, p.PercCbs, p.BaseCbs, p.VlCbs, p.CustoCalc,
        p.Margem, p.PercIcmsSaid, p.PerPisSaid, p.PerCofinsSaid, p.Indice, p.PrFuturo, p.PrFinal,
        (int)p.Ocorrencia, p.CodFornec, p.Fornecedor, p.CClassTrib, p.Cst);
}
