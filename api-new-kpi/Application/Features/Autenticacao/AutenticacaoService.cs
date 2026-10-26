using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.Autenticacao.Dtos;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;

namespace Epoca.Kpi.Api.Application.Features.Autenticacao;

/// <summary>
/// O login: confere as credenciais no cadastro do Winthor e emite a sessão.
///
/// <para>A regra inteira, medida contra o banco nas dc29 a dc31 — ver
/// <c>docs/plataforma/AUTENTICACAO.md</c>:</para>
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
    private readonly RegistroDeBases _bases;
    private readonly GeradorDeToken _tokens;
    private readonly ILogger<AutenticacaoService> _logger;

    public AutenticacaoService(
        IAutenticacaoRepository repositorio,
        RegistroDeBases bases,
        GeradorDeToken tokens,
        ILogger<AutenticacaoService> logger)
    {
        _repositorio = repositorio;
        _bases = bases;
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

        // A BASE VEM ANTES DE QUALQUER CONSULTA, e ausente é erro: nunca cai na Época por
        // omissão. Um front antigo, ou um erro de digitação, não pode entrar na base errada
        // sem ninguém perceber.
        var baseAlvo = _bases.Buscar(pedido.Base);
        if (baseAlvo is null)
        {
            return Result<LoginResponse>.Invalido("Escolha uma base de dados da lista.");
        }

        var credenciais = await _repositorio.VerificarCredenciaisAsync(
            baseAlvo, login, pedido.Senha, cancellationToken);

        // A ORDEM DESTES TESTES É A DA MENSAGEM QUE A PESSOA PRECISA LER.
        //
        // Senha antes de tudo, de propósito: sem ela, qualquer um descobriria pela mensagem
        // quem está inativo ou quem não tem senha cadastrada, bastando digitar nomes de
        // guerra. Depois de provar que é quem diz ser, aí sim a tela explica o resto.
        if (credenciais is null || !credenciais.SenhaCorreta)
        {
            // `credenciais is null` também cobre o homônimo com duas senhas — ver o
            // repositório. É raro, mas cai aqui como credencial inválida, e não como erro.
            return Recusar(login, MotivoDaRecusa.Credenciais, baseAlvo);
        }

        if (!credenciais.PossuiSenha)
        {
            // Inalcançável na prática: sem senha cadastrada, `SenhaCorreta` já é falso e o
            // teste acima pegou. Fica porque a alternativa é este caso depender de uma
            // dedução sobre outra coluna — e porque, se a consulta mudar, quem lê aqui vê a
            // regra inteira.
            return Recusar(login, MotivoDaRecusa.SemSenhaCadastrada, baseAlvo);
        }

        if (!credenciais.EstaAtivo)
        {
            return Recusar(login, MotivoDaRecusa.CadastroInativo, baseAlvo);
        }

        // A PARTIR DAQUI NINGUÉM MAIS É RECUSADO. Permissão deixou de ser condição para
        // entrar e virou conteúdo da sessão — decisão do Gabriel em 18/09/2026.
        //
        // Antes, quem não tinha a 9815 lia "Você não tem acesso ao DRE Gerencial" na tela de
        // login, onde não há nada a fazer além de fechar a aba. A pessoa autenticou com
        // sucesso e mesmo assim foi tratada como quem errou a senha. Agora ela entra, e a tela
        // inicial mostra o que ela pode abrir — que pode ser nada.

                var filiais = await _repositorio.ObterFiliaisDoUsuarioAsync(
            baseAlvo, credenciais.Matricula, cancellationToken);

        var rotinas = RotinasDe(credenciais, filiais);

        if (rotinas.Count == 0)
        {
            // Aviso, e não recusa. Fica no log porque é a única pista de por que alguém está
            // vendo a tela inicial vazia — e as duas causas pedem providências diferentes:
            // liberar a guia 4-DRE na 9815, ou cadastrar filial no PCLIB.
            _logger.LogWarning(
                "Matrícula {Matricula} entrou na base {Base} sem rotina nenhuma. " +
                "Rotina 9815: {Rotina}. Guia 4-DRE: {Guia}. Filiais em PCLIB: {Filiais}.",
                credenciais.Matricula,
                baseAlvo.Id,
                credenciais.PodeAbrirRotina,
                credenciais.PodeVerDre,
                filiais.Count);
        }

        var usuario = new UsuarioDto(
            credenciais.Matricula,
            credenciais.Nome.Trim(),
            credenciais.NomeGuerra.Trim(),
            filiais,
            rotinas,
            BaseDto.De(baseAlvo));

        var (token, expiraEm) = _tokens.Emitir(usuario);

        // AS OUTRAS BASES, só depois de a escolhida aprovar a senha: quem errou a senha não
        // gera tentativa nenhuma na outra base. Ver `ConferirOutrasBasesAsync`.
        var outras = await ConferirOutrasBasesAsync(baseAlvo, login, pedido.Senha, cancellationToken);

        // Matrícula, não nome de guerra, e nunca a senha: o log serve para investigar acesso,
        // e a matrícula é o identificador estável. Ver a regra de nunca logar dado sensível.
        _logger.LogInformation(
            "Login concluído para a matrícula {Matricula} na base {Base}, com {Filiais} " +
            "filiais e {Rotinas} rotinas. Também vale em: {Outras}.",
            credenciais.Matricula,
            baseAlvo.Id,
            filiais.Count,
            rotinas.Count,
            outras.Count == 0 ? "nenhuma" : string.Join(", ", outras.Select(o => o.Usuario.Base.Id)));

        return Result<LoginResponse>.Ok(new LoginResponse(token, expiraEm, usuario, outras));
    }

    /// <summary>
    /// O teto de cada outra base. Uma base lenta não pode segurar o login da que respondeu.
    /// </summary>
    private static readonly TimeSpan TetoPorBase = TimeSpan.FromSeconds(5);

    /// <summary>
    /// AS OUTRAS BASES EM QUE O MESMO LOGIN VALE — a troca de base sem novo login, pedida pelo
    /// Gabriel em 26/10/2026.
    ///
    /// <para>Confere a MESMA senha, com a mesma consulta do login, em cada base que não é a
    /// escolhida, todas em paralelo. Entra na lista a base em que a senha confere, o cadastro
    /// está ativo e há ao menos uma rotina (R1). Para cada uma sai um token próprio: a
    /// matrícula 144 da Época e a 144 do Minas Rural podem ser pessoas diferentes, e cada token
    /// leva a identidade da sua base.</para>
    ///
    /// <para><b>Nada aqui derruba o login</b> (R3). Base fora do ar, lenta ou com erro fica
    /// fora da lista, e a pessoa entra na que escolheu como sempre entrou.</para>
    /// </summary>
    private async Task<IReadOnlyList<SessaoDeBase>> ConferirOutrasBasesAsync(
        BaseConfigurada escolhida,
        string login,
        string senha,
        CancellationToken cancellationToken)
    {
        var conferencias = _bases.Disponiveis
            .Where(b => b.Id != escolhida.Id)
            .Select(b => ConferirOutraBaseAsync(b, login, senha, cancellationToken));

        var resultados = await Task.WhenAll(conferencias);
        return resultados.OfType<SessaoDeBase>().ToList();
    }

    private async Task<SessaoDeBase?> ConferirOutraBaseAsync(
        BaseConfigurada baseAlvo,
        string login,
        string senha,
        CancellationToken cancellationToken)
    {
        using var teto = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        teto.CancelAfter(TetoPorBase);

        try
        {
            // `WaitAsync`, além do token: o driver pode não atender o cancelamento no meio de
            // uma conexão que não responde, e o teto tem de valer mesmo assim.
            //
            // `Task.Run` (revisão final, 26/10/2026): sem ele, a parte SÍNCRONA da abertura de
            // conexão — DNS, TCP para um host que descarta pacotes — rodava na thread do login
            // antes de existir a Task a esperar, e o teto só começava a valer depois dela. O
            // tb1, cenário F2, prova: eram 10 s presos num teto de 5.
            return await Task.Run(
                    () => AbrirSessaoDeBaseAsync(baseAlvo, login, senha, teto.Token),
                    teto.Token)
                .WaitAsync(teto.Token);
        }
        catch (Exception erro) when (!cancellationToken.IsCancellationRequested)
        {
            // Só a base e o TIPO do erro: a mensagem de uma falha de conexão pode trazer host
            // e usuário do banco, e nada disso vai ao log (AGENTS.md).
            _logger.LogWarning(
                "A base {Base} ficou fora da troca sem novo login: {Erro}.",
                baseAlvo.Id,
                erro.GetType().Name);
            return null;
        }
    }

    private async Task<SessaoDeBase?> AbrirSessaoDeBaseAsync(
        BaseConfigurada baseAlvo,
        string login,
        string senha,
        CancellationToken cancellationToken)
    {
        var credenciais = await _repositorio.VerificarCredenciaisAsync(
            baseAlvo, login, senha, cancellationToken);

        if (credenciais is null
            || !credenciais.SenhaCorreta
            || !credenciais.PossuiSenha
            || !credenciais.EstaAtivo)
        {
            return null;
        }

        var filiais = await _repositorio.ObterFiliaisDoUsuarioAsync(
            baseAlvo, credenciais.Matricula, cancellationToken);
        var rotinas = RotinasDe(credenciais, filiais);

        // R1: sem rotina, não há para onde trocar — a pessoa cairia numa tela vazia.
        if (rotinas.Count == 0) return null;

        var usuario = new UsuarioDto(
            credenciais.Matricula,
            credenciais.Nome.Trim(),
            credenciais.NomeGuerra.Trim(),
            filiais,
            rotinas,
            BaseDto.De(baseAlvo));

        var (token, expiraEm) = _tokens.Emitir(usuario);
        return new SessaoDeBase(token, expiraEm, usuario);
    }

    /// <summary>
    /// As rotinas que esta pessoa pode abrir.
    ///
    /// <para>A 9815 exige as <b>três</b> coisas: poder abrir a rotina (<c>PCCONTRO</c>), ter a
    /// guia 4-DRE (<c>PCCONTROI</c>, controle 3) e ao menos uma filial no <c>PCLIB</c>. As
    /// duas primeiras são permissão; a terceira é o que torna a tela utilizável — sem filial
    /// o filtro abre vazio e a primeira apuração falha com uma mensagem que não explica nada.
    /// Do ponto de vista de quem usa, os três casos são o mesmo: não dá para abrir.</para>
    ///
    /// <para>Qual dos três faltou fica no log, que é onde a TI vai procurar.</para>
    /// </summary>
    private static IReadOnlyList<string> RotinasDe(
        CredenciaisWinthor credenciais,
        IReadOnlyList<string> filiais)
    {
        var rotinas = new List<string>();

        if (credenciais.PodeAbrirRotina && credenciais.PodeVerDre && filiais.Count > 0)
        {
            rotinas.Add(RotinasDoWinthor.DreGerencial);
        }

        return rotinas;
    }

    /// <summary>
    /// Recusa registrando o motivo real no log e devolvendo a mensagem própria.
    ///
    /// <para>O log tem o que a tela não diz: é ali que se descobre que as tentativas de
    /// ontem eram todas de cadastro inativo, e não gente errando a senha.</para>
    /// </summary>
    private Result<LoginResponse> Recusar(string login, MotivoDaRecusa motivo, BaseConfigurada baseAlvo)
    {
        _logger.LogInformation(
            "Login recusado para {Login} na base {Base}: {Motivo}.", login, baseAlvo.Id, motivo);
        return Result<LoginResponse>.Proibido(motivo.Mensagem(baseAlvo.Rotulo));
    }
}
