using Epoca.Kpi.Api.Configurations;
using Epoca.Kpi.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------
builder.Services.AddControllers();
builder.Services.AddDocumentacaoApi();
builder.Services.AddCorsPadrao(builder.Configuration);

// Ligada por padrão, desligável por `Compressao:Habilitada` no appsettings.
// Ver docs/COMPRESSAO.md, que também diz como reverter isto.
builder.Services.AddCompressaoDeResposta(builder.Configuration);

builder.Services.AddPersistencia();

// Descobre por reflexão todo IModuleInstaller da assembly. É por isso que acrescentar
// uma rotina nova não exige editar este arquivo.
builder.Services.AddModulosDeRotina(builder.Configuration);

var app = builder.Build();

// ---------------------------------------------------------------------------
// Pipeline — a ordem importa e é a mesma do projeto Minas Rural, com a compressão
// acrescentada logo no começo:
// GlobalException -> Compressão -> NoStore -> CORS -> Controllers
// ---------------------------------------------------------------------------
app.UseMiddleware<GlobalExceptionMiddleware>();

// Antes de TUDO que escreve no corpo. O middleware embrulha o stream de resposta, e um
// que entre depois dos controllers não comprime nada — sem erro nenhum, o que é pior do
// que falhar. Depois do GlobalException para que a resposta de erro também comprima.
app.UseCompressaoDeResposta();

app.UseMiddleware<NoStoreMiddleware>();

app.UseCors(CorsConfiguration.PoliticaPadrao);

// Autenticação e autorização entram quando houver login (fora do escopo do piloto).

app.UseDocumentacaoApi();
app.MapControllers();

app.Run();
