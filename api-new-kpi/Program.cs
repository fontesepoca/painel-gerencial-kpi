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

builder.Services.AddPersistencia(builder.Configuration);

// Valida a configuração do JWT AQUI, no boot. Chave ausente descoberta no primeiro login
// vira erro 500 numa tela de login, e ninguém liga isso a uma variável esquecida no deploy.
builder.Services.AddAutenticacaoJwt(builder.Configuration);

// Descobre por reflexão todo IModuleInstaller da assembly. É por isso que acrescentar
// uma rotina nova não exige editar este arquivo.
builder.Services.AddModulosDeRotina(builder.Configuration);

var app = builder.Build();

// ---------------------------------------------------------------------------
// Pipeline — a ordem importa e é a mesma do projeto Minas Rural, com a compressão
// acrescentada logo no começo:
// GlobalException -> Compressão -> NoStore -> CORS -> Authentication -> Authorization
//   -> Controllers
// ---------------------------------------------------------------------------
app.UseMiddleware<GlobalExceptionMiddleware>();

// Antes de TUDO que escreve no corpo. O middleware embrulha o stream de resposta, e um
// que entre depois dos controllers não comprime nada — sem erro nenhum, o que é pior do
// que falhar. Depois do GlobalException para que a resposta de erro também comprima.
app.UseCompressaoDeResposta();

app.UseMiddleware<NoStoreMiddleware>();

app.UseCors(CorsConfiguration.PoliticaPadrao);

// Depois do CORS e antes dos controllers, nesta ordem: um 401 precisa sair com os cabeçalhos
// de CORS, senão o navegador esconde a resposta do front e a tela mostra "erro de rede" no
// lugar de "sessão expirada".
//
// As rotas do DRE ainda NÃO exigem token — elas ganham [Authorize] quando a tela de login
// existir. Ligar agora derrubaria o front, que ainda não manda credencial nenhuma.
app.UseAuthentication();
app.UseAuthorization();

app.UseDocumentacaoApi();
app.MapControllers();

app.Run();
