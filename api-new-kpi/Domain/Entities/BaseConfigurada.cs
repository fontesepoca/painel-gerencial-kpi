namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Uma base que o sistema sabe consultar: quem ela é, como se conecta e que regras carrega.
/// </summary>
public sealed class BaseConfigurada
{
    public BaseConfigurada(string id, string rotulo, string connectionString, RegrasDaBase regras)
    {
        Id = id;
        Rotulo = rotulo;
        ConnectionString = connectionString;
        Regras = regras;
    }

    /// <summary>O identificador estável (<c>Epoca</c>, <c>MinasRural</c>) — vai no token.</summary>
    public string Id { get; }

    /// <summary>O nome que a pessoa lê (<c>Época Distribuição</c>).</summary>
    public string Rotulo { get; }

    /// <summary>Carrega credencial. Nunca imprima, nunca registre em log.</summary>
    public string ConnectionString { get; }

    public RegrasDaBase Regras { get; }

    /// <summary>
    /// Só o id. O <c>ToString</c> padrão de um objeto sem este método é o nome do tipo, mas o
    /// de um <c>record</c> imprimiria todos os membros — incluída a string de conexão, no dia
    /// em que alguém escrevesse a base num log.
    /// </summary>
    public override string ToString() => Id;
}
