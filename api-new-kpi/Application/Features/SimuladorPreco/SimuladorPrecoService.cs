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

        // ── A região: do vínculo do comprador, nunca digitada (spec 2026-11-25-simulador-regiao-
        // pelo-vinculo-do-comprador). Por ÚLTIMO entre as validações: só vai ao banco um pedido
        // que já passou nas outras. E ANTES da consulta pesada: sem vínculo, ela nem roda.
        var vinculos = (await _repositorio.ObterVinculosDeRegiaoAsync(matricula, cancellationToken))
            .Where(v => MesmaFilial(v.CodFilial, codFilial))
            .Select(v => (int)v.NumRegiao)
            .Distinct()
            .ToList();

        if (vinculos.Count == 0)
        {
            return Result<ConsultaSimuladorDto>.Invalido(
                $"Você não tem região vinculada na filial {codFilial}. O vínculo é feito na TAB_REG_PR_FILIAL.");
        }

        // Hoje não acontece (conferido em 25/11/2026), mas a tabela não impede. No join da rotina
        // em operação, cada produto viria uma vez por região; aqui, recusar é melhor que duplicar
        // sem ninguém perceber.
        if (vinculos.Count > 1)
        {
            return Result<ConsultaSimuladorDto>.Invalido(
                $"Mais de uma região vinculada na filial {codFilial} ({string.Join(", ", vinculos.Order())}). " +
                "Corrija o vínculo na TAB_REG_PR_FILIAL.");
        }

        var numRegiao = vinculos[0];

        var (linhas, total) = await _repositorio.ConsultarPaginaAsync(
            codFilial, numRegiao, fornecedores, matricula,
            filtro.Pagina, TamanhoDaPagina, busca, classes, codigos, cancellationToken);

        // Página vazia é resposta, nunca nulo: o front distingue "nenhum produto" de erro.
        return Result<ConsultaSimuladorDto>.Ok(new ConsultaSimuladorDto(
            new PagedResult<ProdutoSimuladoDto>
            {
                Itens = linhas.Select(ParaDto).ToList(),
                Pagina = filtro.Pagina,
                TamanhoPagina = TamanhoDaPagina,
                TotalItens = total,
            },
            numRegiao));
    }

    /// <summary>
    /// As filiais em que o comprador tem região vinculada, e qual. A tela oferece só estas no
    /// filtro (Gabriel, 25/11/2026). Ordem: código como número, como a lista do DRE.
    /// </summary>
    public async Task<Result<IReadOnlyList<VinculoDeRegiaoDto>>> ObterVinculosAsync(
        int matricula,
        CancellationToken cancellationToken = default)
    {
        var vinculos = await _repositorio.ObterVinculosDeRegiaoAsync(matricula, cancellationToken);

        IReadOnlyList<VinculoDeRegiaoDto> dtos = vinculos
            .Select(v => new VinculoDeRegiaoDto(v.CodFilial.Trim(), (int)v.NumRegiao))
            .OrderBy(v => int.TryParse(v.CodFilial, out var numero) ? numero : int.MaxValue)
            .ThenBy(v => v.CodFilial, StringComparer.Ordinal)
            .ToList();

        return Result<IReadOnlyList<VinculoDeRegiaoDto>>.Ok(dtos);
    }

    /// <summary>
    /// A filial do pedido vem da lista do DRE (<c>FILIAIS.CODFIL</c>), e a do vínculo vem da
    /// <c>TAB_REG_PR_FILIAL</c>. Nenhuma das duas promete a mesma grafia: <c>"07"</c> contra
    /// <c>"7"</c> passaria por "sem vínculo". Compara como número quando as duas são números — o
    /// mesmo cuidado do <c>normalizarCodigo</c> da tela.
    /// </summary>
    internal static bool MesmaFilial(string a, string b)
    {
        a = a.Trim();
        b = b.Trim();
        return int.TryParse(a, out var na) && int.TryParse(b, out var nb)
            ? na == nb
            : string.Equals(a, b, StringComparison.Ordinal);
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
