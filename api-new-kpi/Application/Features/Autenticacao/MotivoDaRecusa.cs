namespace Epoca.Kpi.Api.Application.Features.Autenticacao;

/// <summary>
/// Por que um login foi recusado — e o que a pessoa lê quando isso acontece.
///
/// <para><b>Por que as mensagens são diferentes entre si.</b> O conselho corrente é responder
/// sempre "usuário ou senha inválidos", para não revelar se a conta existe. Aqui esse conselho
/// não se aplica, e a decisão está registrada em <c>docs/AUTENTICACAO.md</c>: o sistema é
/// interno, quem digita já é funcionário, e o painel antigo nunca escondeu isso. Do outro lado
/// da balança há 2.810 pessoas sem senha cadastrada e oito com acesso ao DRE que estão como
/// inativas — todas elas, com a mensagem genérica, tentariam de novo achando que erraram a
/// digitação, e depois ligariam para o Gabriel.</para>
///
/// <para><b>Falta de permissão não está aqui.</b> Desde 18/09/2026 ela não recusa login: quem
/// não tem a 9815 entra e vê a tela inicial sem rotina nenhuma. Ver <see cref="AutenticacaoService"/>.</para>
///
/// <para><b>A exceção é <see cref="Credenciais"/>.</b> Usuário inexistente e senha errada
/// compartilham a mesma mensagem de propósito: distinguir os dois transformaria a tela num
/// verificador de quem trabalha na empresa, e nenhuma pessoa legítima precisa dessa
/// distinção — quem digita o próprio nome de guerra sabe que ele existe.</para>
/// </summary>
public enum MotivoDaRecusa
{
    /// <summary>Nome de guerra inexistente, senha errada, ou dois homônimos com senha.</summary>
    Credenciais,

    /// <summary>A pessoa existe, mas não tem senha no <c>PCEMPR</c>.</summary>
    SemSenhaCadastrada,

    /// <summary><c>SITUACAO</c> diferente de <c>'A'</c>.</summary>
    CadastroInativo

    // NÃO existe mais um motivo "sem permissão". Até 18/09/2026 quem não tinha a 9815 era
    // barrado no login, e lia "Você não tem acesso ao DRE Gerencial" numa tela onde não
    // havia nada a fazer além de fechar. Agora a pessoa entra: permissão deixou de ser
    // condição para autenticar e passou a ser o conteúdo do `UsuarioDto.Rotinas`, que a tela
    // inicial usa para decidir o que mostrar. Decisão do Gabriel em 18/09/2026.
}

public static class MotivoDaRecusaExtensoes
{
    /// <summary>
    /// A frase que a tela mostra. Cada uma diz o que aconteceu <b>e</b> o que fazer — uma
    /// mensagem que só informa o problema deixa a pessoa parada na mesma tela.
    /// </summary>
    public static string Mensagem(this MotivoDaRecusa motivo) => motivo switch
    {
        MotivoDaRecusa.Credenciais =>
            "Usuário ou senha incorretos. Use o mesmo nome de guerra e a mesma senha do Winthor.",

        MotivoDaRecusa.SemSenhaCadastrada =>
            "Seu cadastro não tem senha definida no Winthor. Procure o setor de TI para cadastrá-la.",

        MotivoDaRecusa.CadastroInativo =>
            "Seu cadastro está inativo no Winthor. Procure o setor de TI — não é a senha.",

        _ => "Não foi possível entrar."
    };
}
