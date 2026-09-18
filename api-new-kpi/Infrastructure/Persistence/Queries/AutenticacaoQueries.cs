namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// As consultas do login. Levantadas contra o banco nas dc29 a dc31 — ver
/// <c>docs/AUTENTICACAO.md</c>, que explica cada decisão e o número que a sustenta.
/// </summary>
public static class AutenticacaoQueries
{
    /// <summary>A rotina do Winthor cuja permissão o KPI reaproveita: 9815, GERENCIAL.</summary>
    public const int Rotina = 9815;

    /// <summary>
    /// O controle interno que libera o DRE: <c>3 — GUIA 4-DRE</c>, entre os 43 da rotina.
    ///
    /// <para><b>É constante, e não configuração.</b> Não é um parâmetro de ambiente que muda
    /// entre máquinas — é um fato do cadastro do Winthor, e o mesmo em qualquer instalação
    /// desta base. Pôr em <c>appsettings</c> daria a impressão de que alguém pode mudá-lo sem
    /// consequência.</para>
    ///
    /// <para>O banco não guarda a descrição: em <c>PCCONTROI</c> este número é só um 3. O nome
    /// veio da tela da rotina 530 em 16/09/2026, e está registrado aqui e em
    /// <c>docs/AUTENTICACAO.md</c> porque não existe outro lugar onde ele viva.</para>
    /// </summary>
    public const int ControleGuiaDre = 3;

    /// <summary>
    /// Tudo o que o login precisa saber, numa ida só ao banco.
    ///
    /// <para><b>A senha é conferida DENTRO do Oracle.</b> O <c>DECRYPT</c> devolve a senha em
    /// texto, e trazê-la para a aplicação a colocaria na memória do processo, num objeto que
    /// pode acabar num dump ou num log de exceção. Aqui só atravessa a fronteira um
    /// <c>'S'</c> ou <c>'N'</c>. A senha digitada trafega como bind — isso é inevitável —, mas
    /// a senha cadastrada nunca sai do banco.</para>
    ///
    /// <para><b>Em maiúsculas dos dois lados</b>, como o painel antigo faz. É uma comparação
    /// insensível a caixa, o que enfraquece a senha; reproduzimos porque é a senha que a
    /// pessoa usa no Winthor todo dia, e divergir aqui significaria "sua senha funciona lá e
    /// não funciona aqui".</para>
    ///
    /// <para><b>Devolve diagnóstico, não um sim/não.</b> Cada motivo de recusa vira uma coluna
    /// própria para a tela poder dizer o que houve — ver <c>MotivoDaRecusa</c>. Sem isso,
    /// 2.810 pessoas sem senha cadastrada e oito inativas com acesso receberiam "usuário ou
    /// senha inválidos" e tentariam de novo achando que erraram a digitação.</para>
    ///
    /// <para><b>Sem <c>ROWNUM</c>.</b> O painel antigo resolve empate com <c>ROWNUM = 1</c> e
    /// sem <c>ORDER BY</c> — o Oracle não promete ordem nenhuma aí, e o sorteio roda ANTES da
    /// verificação de senha: com duas linhas e só uma com senha, a pessoa certa não entra.
    /// Aqui a busca é só por <c>NOME_GUERRA</c>, e o repositório trata "veio mais de uma" como
    /// recusa explícita em vez de escolher uma.</para>
    ///
    /// <para><b>Ordem dos binds:</b> <c>:senha</c> aparece no SELECT, <c>:login</c> no WHERE —
    /// nesta ordem. Com <c>BindByName = false</c> quem casa é a posição, não o nome. Inverter
    /// os dois compila, roda e recusa todo mundo.</para>
    ///
    /// <para><b><c>UPPER(TRIM(NOME_GUERRA))</c>, e não a coluna crua.</b> O cadastro tem um
    /// nome de guerra gravado como <c>"CAR 108-109  "</c>, com dois espaços no fim: comparado
    /// direto, quem digitasse esse nome não casaria com nada e leria <i>"usuário ou senha
    /// incorretos"</i> — o pior diagnóstico possível, porque manda a pessoa mexer na senha.
    /// Medido em 16/09/2026 (dc38 §5): entre 2.510 ativos com senha, um com espaço nas pontas,
    /// nenhum com minúscula e nenhum fora do ASCII. O <c>UPPER</c> cobre a minúscula que hoje
    /// não existe e amanhã alguém cadastra.</para>
    ///
    /// <para>Isto impede o índice de <c>NOME_GUERRA</c>, e não importa: são 8.393 linhas e uma
    /// execução por tentativa de login.</para>
    ///
    /// <para><c>static readonly</c> e não <c>const</c>, ao contrário das outras queries do
    /// projeto: o C# só interpola constantes em constantes, e <see cref="Rotina"/> é
    /// <c>int</c>. A alternativa seria repetir <c>9815</c> e <c>3</c> como texto ao lado dos
    /// números — dois pares que podem divergir sem ninguém notar.</para>
    /// </summary>
    public static readonly string Credenciais = $"""
        SELECT E.MATRICULA                                              AS Matricula,
               E.NOME                                                   AS Nome,
               E.NOME_GUERRA                                            AS NomeGuerra,
               CASE WHEN E.SENHABD IS NULL THEN 'N' ELSE 'S' END        AS TemSenha,
               CASE WHEN E.SITUACAO = 'A'  THEN 'S' ELSE 'N' END        AS Ativo,
               CASE WHEN E.SENHABD IS NOT NULL
                     AND UPPER(EPCTI.DECRYPT(E.SENHABD, E.USUARIOBD)) = UPPER(:senha)
                    THEN 'S' ELSE 'N' END                               AS SenhaConfere,
               CASE WHEN EXISTS (SELECT 1 FROM PCCONTRO C
                                  WHERE C.CODUSUARIO = E.MATRICULA
                                    AND C.CODROTINA = {Rotina}
                                    AND C.ACESSO = 'S')
                    THEN 'S' ELSE 'N' END                               AS TemRotina,
               CASE WHEN EXISTS (SELECT 1 FROM PCCONTROI I
                                  WHERE I.CODUSUARIO = E.MATRICULA
                                    AND I.CODROTINA = {Rotina}
                                    AND I.CODCONTROLE = {ControleGuiaDre}
                                    AND I.ACESSO = 'S')
                    THEN 'S' ELSE 'N' END                               AS TemControle
          FROM PCEMPR E
         WHERE UPPER(TRIM(E.NOME_GUERRA)) = UPPER(:login)
        """;

    /// <summary>
    /// As filiais que a pessoa pode apurar. É o mesmo recorte que a 9815 usa.
    ///
    /// <para><b>Nunca lê a tabela inteira:</b> <c>PCLIB</c> tem 8,4 milhões de linhas, e o
    /// acesso é sempre por <c>CODFUNC</c>, que tem índice. <c>CODTABELA = 1</c> é o que separa
    /// filial de todo o resto que essa tabela guarda.</para>
    ///
    /// <para><b>2 e 99 ficam de fora</b> por herança da 9815 — são filiais que a rotina nunca
    /// ofereceu. A comparação é numérica, como lá, embora <c>CODIGOA</c> seja
    /// <c>VARCHAR2(40)</c>: mudá-la para texto trataria <c>'02'</c> de outro jeito, e nenhuma
    /// das duas formas foi verificada contra o cadastro.</para>
    /// </summary>
    public const string FiliaisDoUsuario = """
        SELECT CODIGOA
          FROM PCLIB
         WHERE CODFUNC = :matricula
           AND CODTABELA = 1
           AND CODIGOA NOT IN (2, 99)
         ORDER BY TO_NUMBER(CODIGOA)
        """;
}
