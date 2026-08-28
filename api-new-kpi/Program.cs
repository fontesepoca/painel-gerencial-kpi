using Epoca.Kpi.Api.Configurations;
using Epoca.Kpi.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------
builder.Services.AddControllers();
builder.Services.AddDocumentacaoApi();
builder.Services.AddCorsPadrao(builder.Configuration);
builder.Services.AddPersistencia();

// Descobre por reflexão todo IModuleInstaller da assembly. É por isso que acrescentar
// uma rotina nova não exige editar este arquivo.
builder.Services.AddModulosDeRotina(builder.Configuration);

var app = builder.Build();

// ---------------------------------------------------------------------------
// Pipeline — a ordem importa e é a mesma do projeto Minas Rural:
// GlobalException -> NoStore -> CORS -> Authentication -> Authorization -> Controllers
// ---------------------------------------------------------------------------
app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseMiddleware<NoStoreMiddleware>();

app.UseCors(CorsConfiguration.PoliticaPadrao);

// Autenticação e autorização entram quando houver login (fora do escopo do piloto).

app.UseDocumentacaoApi();
app.MapControllers();

app.Run();
