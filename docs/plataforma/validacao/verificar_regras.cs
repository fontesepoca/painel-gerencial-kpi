#:project ../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// Imprime, em UMA linha de JSON, o que Aplicar(marcador) devolve para cada marcador e para
// cada base configurada de verdade. O dc86 lê esta linha e a compara com o texto que a Época
// tinha no SQL original — é o elo entre a prova de texto e o código que roda.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/plataforma/validacao/verificar_regras.cs -p:BaseOutputPath="$TEMP/vr/"
// (o BaseOutputPath evita esbarrar no apphost.exe da API que o Gabriel deixa rodando.)
//
// `PublishAot=false` (primeira linha): programa de arquivo único assume AOT no .NET 10 e
// desliga a serialização por reflexão — sem a diretiva, o JsonSerializer lança.

using System.Text.Json;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

var caminho = Path.GetFullPath(Path.Combine("api-new-kpi", "appsettings.json"));

var configuracao = new ConfigurationBuilder()
    .AddJsonFile(caminho, optional: false)
    // Uma string qualquer: o registro só oferece base que tenha conexão, e aqui ninguém conecta.
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["ConnectionStrings:OracleEpoca"] = "teste",
        ["ConnectionStrings:OracleMinasRural"] = "teste",
    })
    .Build();

var registro = new RegistroDeBases(configuracao, NullLogger<RegistroDeBases>.Instance);

var saida = new Dictionary<string, Dictionary<string, string>>();

foreach (var baseConfigurada in registro.Disponiveis)
{
    var tabela = new Dictionary<string, string>();

    foreach (var marcador in RegrasDaBase.Marcadores)
    {
        tabela[marcador] = baseConfigurada.Regras.Aplicar(marcador);
    }

    saida[baseConfigurada.Id] = tabela;
}

// Uma base SINTÉTICA com todas as regras do Minas Rural LIGADAS (o que o fonte do Delphi
// indica). Ninguém a usa; ela existe para o dc86 provar que as expansões ligadas são texto
// válido e não carregam bind — antes de qualquer base de verdade ligar uma regra.
var ligado = new RegrasDaBase { SecaoSemCusto = 1401, AgrupaIcms = true };
var tabelaLigada = new Dictionary<string, string>();
foreach (var marcador in RegrasDaBase.Marcadores)
{
    tabelaLigada[marcador] = ligado.Aplicar(marcador);
}
saida["_ligado"] = tabelaLigada;

Console.WriteLine(JsonSerializer.Serialize(saida));
