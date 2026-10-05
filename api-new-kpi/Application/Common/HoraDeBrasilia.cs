namespace Epoca.Kpi.Api.Application.Common;

/// <summary>
/// O relógio da aplicação, sempre no horário de Brasília.
///
/// <para><b>Existe porque <c>DateTimeOffset.Now</c> devolve a hora da MÁQUINA.</b> Em
/// 05/10/2026 uma apuração feita às 12:40 saiu impressa como 15:40: o servidor roda em UTC,
/// e o carimbo saiu <c>15:40+00:00</c>. A máquina de desenvolvimento está em <c>-03:00</c> e
/// mostrava o horário certo, o que escondeu o defeito até alguém imprimir pelo ambiente
/// publicado.</para>
///
/// <para><b>Por que o front não corrige isso.</b> O <c>dataHoraBr</c> lê os dígitos da string
/// em vez de construir um <c>Date</c>, de propósito: passar por <c>new Date</c> reexibiria
/// tudo no fuso do NAVEGADOR, e a mesma apuração sairia com horas diferentes conforme a
/// máquina que imprimiu. A decisão é boa e continua — ela só depende de uma premissa que
/// ninguém tinha escrito: <b>a string já vem no fuso de Brasília</b>. É esta classe que
/// cumpre a premissa.</para>
///
/// <para><b>Conversão explícita, e não <c>TZ</c> no ambiente.</b> A variável de ambiente
/// resolve numa máquina e some na próxima, não acompanha o código e faz o mesmo endpoint
/// responder coisas diferentes em cada servidor. Aqui o fuso é parte do comportamento.</para>
/// </summary>
public static class HoraDeBrasilia
{
    /// <summary>
    /// <b>O nome IANA, que o .NET resolve nos dois sistemas</b> desde o .NET 6 — no Windows
    /// ele traduz para `E. South America Standard Time` sozinho. Escrever o id do Windows
    /// faria o contrário: quebraria no Linux, que é justamente onde a aplicação publica.
    /// </summary>
    private const string FusoIana = "America/Sao_Paulo";

    /// <summary>
    /// <b>O fallback existe para o container sem base de fusos.</b> Uma imagem enxuta pode não
    /// trazer o `tzdata`, e aí <c>FindSystemTimeZoneById</c> lança — numa linha que só queria
    /// carimbar a hora de um relatório. Três horas atrás de UTC é o horário de Brasília desde
    /// que o país deixou de ter horário de verão, em 2019.
    ///
    /// <para><b>É o pior caso, não o caminho normal.</b> Se o horário de verão voltar, o
    /// <see cref="TimeZoneInfo"/> acompanha sozinho e este fallback erraria uma hora durante
    /// quatro meses do ano — por isso ele só entra quando o sistema não sabe responder.</para>
    /// </summary>
    private static readonly TimeSpan SemHorarioDeVerao = TimeSpan.FromHours(-3);

    private static readonly TimeZoneInfo Brasilia = Resolver();

    private static TimeZoneInfo Resolver()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(FusoIana);
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return TimeZoneInfo.CreateCustomTimeZone(
                FusoIana, SemHorarioDeVerao, "Horário de Brasília", "Horário de Brasília");
        }
    }

    /// <summary>
    /// Agora, no horário de Brasília, <b>qualquer que seja o fuso da máquina</b>.
    ///
    /// <para>Parte de <c>UtcNow</c> de propósito: ele é o mesmo instante em toda máquina, e a
    /// conversão a partir dele não depende de o relógio local estar configurado certo.</para>
    /// </summary>
    public static DateTimeOffset Agora => TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Brasilia);
}
