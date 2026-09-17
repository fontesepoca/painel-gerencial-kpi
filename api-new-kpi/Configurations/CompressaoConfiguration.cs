using System.IO.Compression;
using Microsoft.AspNetCore.ResponseCompression;

namespace Epoca.Kpi.Api.Configurations;

/// <summary>
/// Configuração da compressão de resposta, lida da seção <c>Compressao</c> do appsettings.
///
/// <para><b>Duas chaves, e não uma, de propósito.</b> <see cref="HabilitarEmHttps"/> é a
/// proteção contra o BREACH, e escondê-la dentro de <see cref="Habilitada"/> faria ligar a
/// compressão ligar também o risco, em silêncio. Separadas, quem um dia puser a API atrás de
/// TLS encontra uma decisão explícita esperando por ele.</para>
/// </summary>
public sealed class OpcoesDeCompressao
{
    public const string Secao = "Compressao";

    /// <summary>
    /// A chave geral. <c>false</c> devolve o pipeline ao que era antes de 17/09/2026 — o
    /// middleware nem entra, e a API responde texto cru como sempre respondeu.
    /// </summary>
    public bool Habilitada { get; set; } = true;

    /// <summary>
    /// Se a compressão vale também sobre HTTPS. <b>Falso de propósito</b>, que é o padrão do
    /// próprio ASP.NET Core.
    ///
    /// <para>Comprimir sobre TLS abre o <b>BREACH</b>: o atacante varia um texto que a resposta
    /// reflete e observa o tamanho do corpo cifrado; quando o palpite dele coincide com um
    /// pedaço de um segredo que está no mesmo corpo, a resposta encolhe alguns bytes, e o
    /// segredo sai caractere a caractere sem ninguém decifrar nada.</para>
    ///
    /// <para>Hoje a API fala HTTP em rede interna e isto não muda nada. No dia em que houver
    /// TLS, ligar esta chave exige antes conferir que <see cref="RotasIsentas"/> cobre toda
    /// rota que devolva segredo no corpo.</para>
    /// </summary>
    public bool HabilitarEmHttps { get; set; }

    /// <summary>
    /// Prefixos de rota que nunca são comprimidos.
    ///
    /// <para>Nasce com a autenticação dentro porque a resposta do login carrega o JWT no
    /// corpo — é o segredo de que o BREACH precisa. As rotas do DRE devolvem o filtro que o
    /// cliente mandou, que é o reflexo de que ele também precisa; separando os dois, os
    /// ingredientes nunca se juntam na mesma resposta.</para>
    ///
    /// <para>É lista, e não constante, para acrescentar uma rota nova não exigir recompilar.</para>
    /// </summary>
    public string[] RotasIsentas { get; set; } = ["/api/auth"];
}

public static class CompressaoConfiguration
{
    /// <summary>
    /// Registra a compressão, se a configuração pedir.
    ///
    /// <para>Brotli antes de Gzip: quando o cliente aceita os dois, o ASP.NET escolhe o
    /// primeiro da lista, e o Brotli comprime melhor pelo mesmo custo neste nível.</para>
    ///
    /// <para><c>application/json</c> já está na lista padrão de tipos comprimíveis do
    /// framework, então as rotas do DRE entram sem configuração extra.</para>
    /// </summary>
    public static IServiceCollection AddCompressaoDeResposta(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var opcoes = configuration.GetSection(OpcoesDeCompressao.Secao).Get<OpcoesDeCompressao>()
                     ?? new OpcoesDeCompressao();

        services.AddSingleton(opcoes);

        if (!opcoes.Habilitada)
        {
            return services;
        }

        services.AddResponseCompression(o =>
        {
            o.EnableForHttps = opcoes.HabilitarEmHttps;
            o.Providers.Add<BrotliCompressionProvider>();
            o.Providers.Add<GzipCompressionProvider>();
        });

        // `Optimal`, e não `Fastest`, nos dois — o contrário do que parece razoável, e a
        // medição é que decidiu.
        //
        // O middleware comprime em BLOCOS, com flush a cada um, e isso custa taxa: o mesmo
        // corpo de apuração que comprime 9,2x em memória saiu com 6,6x no `Fastest` pela
        // rede. No Brotli foi pior — `Fastest` é quality 1, que comprimiu 4,8x, PIOR que o
        // gzip, e como o Brotli é o preferido seria ele que o navegador receberia.
        //
        // Medido em 17/09/2026, apuração de 50 KB (ver docs/COMPRESSAO.md):
        //
        //             Fastest     Optimal
        //   gzip      7.594 B     5.587 B
        //   brotli   10.435 B     5.393 B
        //
        // O custo de CPU não apareceu: com o cache do Oracle aquecido, as três codificações
        // responderam em 0,49 s, dentro do ruído umas das outras. Nesta escala de corpo,
        // `Optimal` é de graça.
        services.Configure<BrotliCompressionProviderOptions>(
            o => o.Level = CompressionLevel.Optimal);
        services.Configure<GzipCompressionProviderOptions>(
            o => o.Level = CompressionLevel.Optimal);

        return services;
    }

    /// <summary>
    /// Põe a compressão no pipeline, se ela estiver ligada.
    ///
    /// <para><b>Tem de vir antes de tudo que escreve no corpo.</b> O middleware embrulha o
    /// stream de resposta, e um que entre depois dos controllers não comprime nada — sem erro
    /// nenhum, o que é pior do que falhar.</para>
    ///
    /// <para>As rotas isentas saem por <c>UseWhen</c>, e não por configuração do próprio
    /// middleware, porque ele não tem filtro por caminho: ou embrulha a resposta, ou não
    /// existe naquela requisição.</para>
    /// </summary>
    public static IApplicationBuilder UseCompressaoDeResposta(this IApplicationBuilder app)
    {
        var opcoes = app.ApplicationServices.GetRequiredService<OpcoesDeCompressao>();

        if (!opcoes.Habilitada)
        {
            return app;
        }

        app.UseWhen(
            contexto => !RotaIsenta(contexto.Request.Path, opcoes.RotasIsentas),
            ramo => ramo.UseResponseCompression());

        return app;
    }

    private static bool RotaIsenta(PathString caminho, string[] isentas) =>
        isentas.Any(isenta => caminho.StartsWithSegments(
            isenta, StringComparison.OrdinalIgnoreCase));
}
