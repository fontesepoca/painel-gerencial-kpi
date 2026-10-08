using System.Text.RegularExpressions;
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>
/// A lista fechada de bases. É o que impede o login de aceitar uma base inventada.
///
/// <para><b>Só entram as bases que TÊM string de conexão.</b> Quem não configurou o Minas
/// Rural simplesmente não o vê no login, e a API sobe do mesmo jeito — um ambiente de
/// desenvolvimento só com a Época continua funcionando.</para>
///
/// <para>A chave da conexão sai do id: <c>Bases:MinasRural</c> usa
/// <c>ConnectionStrings:OracleMinasRural</c>. A <c>OracleEpoca</c> que já existe nos ambientes
/// continua valendo sem alteração.</para>
/// </summary>
public sealed partial class RegistroDeBases
{
    public const string Secao = "Bases";

    public RegistroDeBases(IConfiguration configuracao, ILogger<RegistroDeBases> logger)
    {
        var opcoes = configuracao.GetSection(Secao).Get<Dictionary<string, OpcaoDeBase>>()
                     ?? new Dictionary<string, OpcaoDeBase>();

        var lista = new List<BaseConfigurada>();

        foreach (var (id, opcao) in opcoes)
        {
            if (!IdValido().IsMatch(id))
            {
                throw new InvalidOperationException(
                    $"Bases:{id} não é um id válido. Use letras e dígitos, começando por letra " +
                    "(ex.: Epoca, MinasRural) — o id vira parte do nome da string de conexão.");
            }

            if (string.IsNullOrWhiteSpace(opcao.Rotulo))
            {
                throw new InvalidOperationException(
                    $"Bases:{id}:Rotulo está vazio. É o nome que a pessoa lê no login.");
            }

            opcao.Regras.Validar(id);

            var conexao = configuracao.GetConnectionString($"Oracle{id}");
            if (string.IsNullOrWhiteSpace(conexao))
            {
                // Aviso, não erro: ambiente sem a base não deve impedir a API de subir.
                logger.LogWarning(
                    "Base {Base} sem string de conexão ({Chave}): não será oferecida no login.",
                    id,
                    $"ConnectionStrings:Oracle{id}");
                continue;
            }

            lista.Add(new BaseConfigurada(id, opcao.Rotulo.Trim(), conexao, opcao.Regras));
        }

        Disponiveis = lista;

        // Só os ids. A string de conexão carrega credencial e não vai a log nenhum.
        logger.LogInformation(
            "Bases disponíveis: {Bases}",
            lista.Count == 0 ? "nenhuma" : string.Join(", ", lista.Select(b => b.Id)));
    }

    /// <summary>As bases configuradas E com string de conexão, na ordem do arquivo.</summary>
    public IReadOnlyList<BaseConfigurada> Disponiveis { get; }

    /// <summary>
    /// Procura uma base pelo id, sem diferenciar maiúscula de minúscula. Devolve <c>null</c>
    /// para vazio, desconhecido ou não configurado — <b>nunca</b> a primeira da lista: quem
    /// pede base inexistente tem de ouvir isso, e não receber a Época.
    /// </summary>
    public BaseConfigurada? Buscar(string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return null;
        }

        var procurado = id.Trim();
        return Disponiveis.FirstOrDefault(
            b => string.Equals(b.Id, procurado, StringComparison.OrdinalIgnoreCase));
    }

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9]*$")]
    private static partial Regex IdValido();
}
