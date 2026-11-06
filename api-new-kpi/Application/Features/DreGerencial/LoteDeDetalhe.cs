using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// A EXPORTAÇÃO EM LOTE do detalhamento (06/11/2026, pedido do Gabriel): muitas linhas, muitas
/// colunas, poucas consultas. Ver docs/superpowers/specs/2026-11-06-exportacao-em-lote-design.md.
///
/// <para><b>A unidade é bloco × coluna.</b> As linhas de lançamentos sem sobra de um mesmo
/// bloco saem numa consulta só, com <c>IN</c>, no intervalo exato de uma coluna — o tamanho de
/// um detalhamento de um mês, que já roda hoje. Receita, devolução, impostos e contas com
/// sobra vão pelo detalhamento de uma célula, uma linha × coluna por vez, e linhas com o
/// mesmo destino (RECEITA BRUTA e RECEITAS LIQUIDAS) dividem a consulta.</para>
///
/// <para>O que mora aqui é o que não depende do banco — e por isso o dc105 testa tudo.</para>
/// </summary>
public static class LoteDeDetalhe
{
    public const int MaximoDeLinhas = 300;
    public const int MaximoDeColunas = 24;

    /// <summary>Quanto tempo sem dado até mandar um "aguarde": nenhuma camada vê a conexão parada.</summary>
    public static readonly TimeSpan IntervaloDoBatimento = TimeSpan.FromSeconds(15);

    private static readonly HashSet<string> Tipos =
        ["receita-por-cliente", "devolucao-por-motivo", "imposto-por-produto", "lancamentos"];

    private static readonly HashSet<string> Blocos = ["operacional", "pos-operacional", "orfa"];
    private static readonly HashSet<string> Impostos = ["st", "pis", "cofins"];

    /// <summary>
    /// A sobra de uma conta subida: 1 a 200 códigos, só dígitos e ponto. Entra como bind, mas
    /// uma lista sem limite ainda seria uma consulta sem limite. O detalhamento de uma célula
    /// usa a mesma regra.
    /// </summary>
    public static bool SobraValida(IReadOnlyList<string> sobra) =>
        sobra.Count is > 0 and <= 200
        && sobra.All(c => c.Length is > 0 and <= 20 && c.All(ch => char.IsAsciiDigit(ch) || ch == '.'));

    /// <summary>O motivo da recusa, ou nulo. Tudo antes de abrir o fluxo: erro aqui é um 400 comum.</summary>
    public static string? Validar(LoteFiltroDto lote)
    {
        if (lote.Filiais is not { Count: > 0 }) return "Selecione ao menos uma filial.";
        if (RegimeDre.Resolver(lote.Regime) is null) return $"Regime '{lote.Regime}' não existe.";
        if (AnaliseDre.Resolver(lote.Analise) is not { Implementada: true })
        {
            return $"Análise '{lote.Analise}' não existe ou não está implementada.";
        }

        if (lote.Colunas is not { Count: > 0 and <= MaximoDeColunas })
        {
            return $"O lote precisa de 1 a {MaximoDeColunas} colunas.";
        }

        foreach (var c in lote.Colunas)
        {
            if (c.DataFim < c.DataInicio) return "Uma coluna tem a data final antes da inicial.";
            if (c.DataInicio.AddMonths(12) < c.DataFim) return "Uma coluna passa de 12 meses.";
        }

        if (lote.Linhas is not { Count: > 0 and <= MaximoDeLinhas })
        {
            return $"O lote precisa de 1 a {MaximoDeLinhas} linhas.";
        }

        if (lote.Linhas.Select(l => l.Id).Distinct().Count() != lote.Linhas.Count)
        {
            return "Duas linhas do lote têm o mesmo id.";
        }

        foreach (var l in lote.Linhas)
        {
            if (!Tipos.Contains(l.Tipo))
            {
                return $"A linha {l.Id} tem um tipo de detalhamento que a exportação não usa.";
            }

            if (l.Tipo == "imposto-por-produto" && !Impostos.Contains(l.Bloco ?? ""))
            {
                return $"A linha {l.Id} pede um imposto que não existe.";
            }

            if (l.Tipo != "lancamentos") continue;

            if (!Blocos.Contains(l.Bloco ?? "")) return $"A linha {l.Id} tem um bloco que não existe.";
            if (string.IsNullOrWhiteSpace(l.Chave) || l.Chave.Length > 40)
            {
                return $"A linha {l.Id} não tem a chave do recorte.";
            }

            if (l.Sobra is not null && !SobraValida(l.Sobra))
            {
                return $"A sobra da linha {l.Id} tem de ser de 1 a 200 códigos, só com dígitos e ponto.";
            }
        }

        return null;
    }

    /// <summary>As consultas do lote, na ordem em que rodam: coluna por coluna, na ordem das linhas.</summary>
    public static IReadOnlyList<UnidadeDoLote> Planejar(LoteFiltroDto lote)
    {
        var unidades = new List<UnidadeDoLote>();

        for (var coluna = 0; coluna < lote.Colunas.Count; coluna++)
        {
            var porBloco = new Dictionary<string, (List<int> Ids, List<string> Chaves)>();
            var porDestino = new Dictionary<string, (LoteLinhaDto Modelo, List<int> Ids)>();
            var ordem = new List<(bool Agrupada, string Chave)>();

            foreach (var linha in lote.Linhas)
            {
                if (linha.Tipo == "lancamentos" && linha.Sobra is not { Count: > 0 })
                {
                    if (!porBloco.TryGetValue(linha.Bloco!, out var grupo))
                    {
                        grupo = ([], []);
                        porBloco[linha.Bloco!] = grupo;
                        ordem.Add((true, linha.Bloco!));
                    }

                    grupo.Ids.Add(linha.Id);
                    if (!grupo.Chaves.Contains(linha.Chave!)) grupo.Chaves.Add(linha.Chave!);
                    continue;
                }

                var destino = $"{linha.Tipo}|{linha.Bloco}|{linha.Chave}|{string.Join(",", linha.Sobra ?? [])}";
                if (!porDestino.TryGetValue(destino, out var mesmo))
                {
                    mesmo = (linha, []);
                    porDestino[destino] = mesmo;
                    ordem.Add((false, destino));
                }

                mesmo.Ids.Add(linha.Id);
            }

            foreach (var (agrupada, chave) in ordem)
            {
                if (agrupada)
                {
                    var (ids, chaves) = porBloco[chave];
                    unidades.Add(new UnidadeDoLote(coluna, ids, "lancamentos", chave, chaves, null, Agrupada: true));
                }
                else
                {
                    var (modelo, ids) = porDestino[chave];
                    unidades.Add(new UnidadeDoLote(coluna, ids, modelo.Tipo, modelo.Bloco,
                        modelo.Chave is { } c ? [c] : [], modelo.Sobra, Agrupada: false));
                }
            }
        }

        return unidades;
    }

    /// <summary>
    /// Um sinal a cada <paramref name="intervalo"/> enquanto <paramref name="tarefa"/> não
    /// termina. Não observa o resultado: uma tarefa que falhou só encerra a espera, e quem
    /// lê o erro é o serviço.
    /// </summary>
    public static async IAsyncEnumerable<bool> Esperar(
        Task tarefa, TimeSpan intervalo, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        while (!tarefa.IsCompleted)
        {
            var relogio = Task.Delay(intervalo, cancellationToken);
            var primeira = await Task.WhenAny(tarefa, relogio);
            cancellationToken.ThrowIfCancellationRequested();
            if (primeira == relogio) yield return true;
        }
    }
}

/// <summary>Uma consulta do lote: uma coluna, as linhas que ela atende e o destino.</summary>
public sealed record UnidadeDoLote(
    int Coluna,
    IReadOnlyList<int> Linhas,
    string Tipo,
    string? Bloco,
    IReadOnlyList<string> Chaves,
    IReadOnlyList<string>? Sobra,
    bool Agrupada);

/// <summary>Uma falha de unidade que não é do banco (o detalhamento recusou o pedido): não se tenta de novo.</summary>
public sealed class FalhaDoLote(string mensagem) : Exception(mensagem);

/// <summary>
/// Um pacote do fluxo NDJSON. Campo nulo não é escrito — o batimento sai como
/// <c>{"t":"aguarde"}</c>. O <c>Dados</c> é o <see cref="DetalhamentoDto"/> de sempre, com os
/// nulos dele: a regra só vale para os campos do pacote.
/// </summary>
public sealed record PacoteDoLote(
    string T,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Partes = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] BaseDto? Base = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Linha = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Coluna = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DetalhamentoDto? Dados = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<int>? Linhas = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Mensagem = null)
{
    public static PacoteDoLote Inicio(int partes, BaseDto? baseDaSessao) =>
        new("inicio", Partes: partes, Base: baseDaSessao);

    public static readonly PacoteDoLote Aguarde = new("aguarde");

    public static PacoteDoLote Parte(int linha, int coluna, DetalhamentoDto dados) =>
        new("parte", Linha: linha, Coluna: coluna, Dados: dados);

    public static PacoteDoLote Falha(IReadOnlyList<int> linhas, int coluna, string mensagem) =>
        new("falha", Coluna: coluna, Linhas: linhas, Mensagem: mensagem);

    public static readonly PacoteDoLote Fim = new("fim");

    public static PacoteDoLote Erro(string mensagem) => new("erro", Mensagem: mensagem);
}
