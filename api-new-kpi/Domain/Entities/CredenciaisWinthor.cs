namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// O que o banco respondeu sobre uma tentativa de login.
///
/// <para><b>Não é "autenticado ou não".</b> Cada condição vem separada para o serviço poder
/// dizer o que houve — e para essa decisão ficar em um lugar só, em vez de espalhada por
/// cinco consultas. Ver <c>AutenticacaoQueries.Credenciais</c>.</para>
///
/// <para>As colunas chegam como <c>'S'</c>/<c>'N'</c>, e não como booleano, porque é assim que
/// o Oracle 11g devolve: <c>NUMBER(1)</c> mapeado para <c>bool</c> depende de configuração do
/// provedor, e um mapeamento silenciosamente errado aqui vira "todo mundo entra".</para>
/// </summary>
public sealed class CredenciaisWinthor
{
    public int Matricula { get; init; }

    /// <summary>Nome completo, para o cabeçalho da tela.</summary>
    public string Nome { get; init; } = string.Empty;

    /// <summary>O que a pessoa digitou para entrar.</summary>
    public string NomeGuerra { get; init; } = string.Empty;

    public string TemSenha { get; init; } = "N";
    public string Ativo { get; init; } = "N";
    public string SenhaConfere { get; init; } = "N";
    public string TemRotina { get; init; } = "N";
    public string TemControle { get; init; } = "N";

    private static bool Sim(string? valor) => valor == "S";

    /// <summary>Tem senha cadastrada? 2.810 das 8.393 pessoas do <c>PCEMPR</c> não têm.</summary>
    public bool PossuiSenha => Sim(TemSenha);

    /// <summary><c>SITUACAO = 'A'</c>.</summary>
    public bool EstaAtivo => Sim(Ativo);

    /// <summary>A senha digitada bate com a do cadastro — conferido dentro do Oracle.</summary>
    public bool SenhaCorreta => Sim(SenhaConfere);

    /// <summary>Pode abrir a rotina 9815 (<c>PCCONTRO</c>).</summary>
    public bool PodeAbrirRotina => Sim(TemRotina);

    /// <summary>Tem a <c>GUIA 4-DRE</c> liberada (<c>PCCONTROI</c>, controle 3).</summary>
    public bool PodeVerDre => Sim(TemControle);
}
