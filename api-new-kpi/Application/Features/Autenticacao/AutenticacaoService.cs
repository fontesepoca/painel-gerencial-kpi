using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.Autenticacao.Dtos;
using Epoca.Kpi.Api.Domain.Interfaces;

namespace Epoca.Kpi.Api.Application.Features.Autenticacao;

/// <summary>
/// O login: confere as credenciais no cadastro do Winthor e emite a sessão.
///
/// <para>A regra inteira, medida contra o banco nas dc29 a dc31 — ver
/// <c>docs/AUTENTICACAO.md</c>:</para>
///
/// <code>
/// PCCONTRO  (9815, ACESSO = 'S')             pode abrir a rotina
/// PCCONTROI (9815, controle 3, ACESSO = 'S') GUIA 4-DRE
/// PCEMPR    NOME_GUERRA, SENHABD, SITUACAO = 'A'
/// PCLIB     (CODTABELA = 1)                  as filiais que ele apura
/// </code>
///
/// <para>Vinte e oito pessoas passam por tudo isso hoje.</para>
/// </summary>
public sealed class AutenticacaoService
{
    private readonly IAutenticacaoRepository _repositorio;
    private readonly GeradorDeToken _tokens;
    private readonly ILogger<AutenticacaoService> _logger;

    public AutenticacaoService(
        IAutenticacaoRepository repositorio,
        GeradorDeToken tokens,
        ILogger<AutenticacaoService> logger)
    {
        _repositorio = repositorio;
        _tokens = tokens;
        _logger = logger;
    }

    public async Task<Result<LoginResponse>> EntrarAsync(
        LoginRequest pedido,
        CancellationToken cancellationToken = default)
    {
        var login = pedido.Login?.Trim() ?? string.Empty;

        // Campo vazio não vai ao banco. Não é otimização: `NOME_GUERRA = UPPER('')` é nulo no
        // Oracle e não casa com nada, então a consulta devolveria "credenciais inválidas" —
        // uma mensagem que não ajuda quem simplesmente não preencheu o campo.
        if (login.Length == 0 || string.IsNullOrEmpty(pedido.Senha))
        {
            return Result<LoginResponse>.Invalido("Preencha o usuário e a senha.");
        }

        var credenciais = await _repositorio.VerificarCredenciaisAsync(
            login, pedido.Senha, cancellationToken);

        // A ORDEM DESTES TESTES É A DA MENSAGEM QUE A PESSOA PRECISA LER.
        //
        // Senha antes de tudo, de propósito: sem ela, qualquer um descobriria pela mensagem
        // quem está inativo ou quem não tem senha cadastrada, bastando digitar nomes de
        // guerra. Depois de provar que é quem diz ser, aí sim a tela explica o resto.
        if (credenciais is null || !credenciais.SenhaCorreta)
        {
            // `credenciais is null` também cobre o homônimo com duas senhas — ver o
            // repositório. É raro, mas cai aqui como credencial inválida, e não como erro.
            return Recusar(login, MotivoDaRecusa.Credenciais);
        }

        if (!credenciais.PossuiSenha)
        {
            // Inalcançável na prática: sem senha cadastrada, `SenhaCorreta` já é falso e o
            // teste acima pegou. Fica porque a alternativa é este caso depender de uma
            // dedução sobre outra coluna — e porque, se a consulta mudar, quem lê aqui vê a
            // regra inteira.
            return Recusar(login, MotivoDaRecusa.SemSenhaCadastrada);
        }

        if (!credenciais.EstaAtivo)
        {
            return Recusar(login, MotivoDaRecusa.CadastroInativo);
        }

        if (!credenciais.PodeAbrirRotina || !credenciais.PodeVerDre)
        {
            return Recusar(login, MotivoDaRecusa.SemPermissao);
        }

        var filiais = await _repositorio.ObterFiliaisDoUsuarioAsync(
            credenciais.Matricula, cancellationToken);

        // Sem filial não há o que apurar, e a tela abriria com o filtro vazio e um erro
        // incompreensível na primeira consulta. Barrar aqui transforma isso numa frase.
        if (filiais.Count == 0)
        {
            _logger.LogWarning(
                "Login recusado para a matrícula {Matricula}: nenhuma filial em PCLIB.",
                credenciais.Matricula);

            return Result<LoginResponse>.Proibido(
                "Você tem acesso ao DRE, mas nenhuma filial liberada no Winthor. " +
                "Procure o setor de TI.");
        }

        var usuario = new UsuarioDto(
            credenciais.Matricula,
            credenciais.Nome.Trim(),
            credenciais.NomeGuerra.Trim(),
            filiais);

        var (token, expiraEm) = _tokens.Emitir(usuario);

        // Matrícula, não nome de guerra, e nunca a senha: o log serve para investigar acesso,
        // e a matrícula é o identificador estável. Ver a regra de nunca logar dado sensível.
        _logger.LogInformation(
            "Login concluído para a matrícula {Matricula}, com {Filiais} filiais.",
            credenciais.Matricula,
            filiais.Count);

        return Result<LoginResponse>.Ok(new LoginResponse(token, expiraEm, usuario));
    }

    /// <summary>
    /// Recusa registrando o motivo real no log e devolvendo a mensagem própria.
    ///
    /// <para>O log tem o que a tela não diz: é ali que se descobre que as tentativas de
    /// ontem eram todas de cadastro inativo, e não gente errando a senha.</para>
    /// </summary>
    private Result<LoginResponse> Recusar(string login, MotivoDaRecusa motivo)
    {
        _logger.LogInformation("Login recusado para {Login}: {Motivo}.", login, motivo);
        return Result<LoginResponse>.Proibido(motivo.Mensagem());
    }
}
