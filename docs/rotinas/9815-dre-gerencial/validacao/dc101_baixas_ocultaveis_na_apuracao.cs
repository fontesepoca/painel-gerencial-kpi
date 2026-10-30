#:project ../../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// dc101 — "Ocultar baixas estornadas e da rotina 737" também na APURAÇÃO (30/10/2026).
//
// Pedido do Gabriel: o checkbox do detalhamento passa a existir na tela principal, marcado por
// padrão, e a conta deixa de somar as baixas estornadas e as da rotina 737 — com efeito em
// todo cálculo de que ela participa. A consulta traz, ao lado do valor, a parte dele que o
// filtro esconde; a API monta dois DREs (o de sempre e o sem essa parte), e a tela troca.
// Ver a divergência 21 em DIVERGENCIAS.md.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc101_baixas_ocultaveis_na_apuracao.cs -p:BaseOutputPath="$TEMP/dc101/"
//
// Não toca no banco: estrutura e despesas montadas à mão.

using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Infrastructure.Persistence.Queries;
using Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

var falhas = 0;
var n = 0;
void Afirmar(bool ok, string oque, string detalhe = "")
{
    n++;
    Console.WriteLine($"  {(ok ? "ok   " : "FALHA")} {oque}{(detalhe.Length > 0 ? "   " + detalhe : "")}");
    if (!ok) falhas++;
}

LinhaEstruturaDre Linha(int id, string chave, string nome, string flags) => new()
{
    Id = id, CodGruConta = chave, Grupo = nome, InfContas = "N",
    AntesRo = flags[..1], AntesLl = flags[1..2], AntesLf = flags[2..],
};

var estrutura = new List<LinhaEstruturaDre>
{
    Linha(10, "4401", "FINANCEIRO", "SSS"),
    Linha(11, "1001", "ADMINISTRATIVO", "SSS"),
    Linha(20, "-20", "Sub-Total -> Despesas Operacionais", "SSS"),
    Linha(30, "-30", "RESULTADO OPERACIONAL", "NSS"),
    Linha(40, "-40", "LUCRO LIQUIDO", "NNS"),
};

DespesaDre Despesa(string mes, string chave, decimal valor, decimal ocultavel = 0m, decimal exclusivo = 0m, decimal exclusivoOcultavel = 0m) => new()
{
    GrupoConta = chave, AntesRo = "S", AntesLl = "S", AntesLf = "S",
    MesAno = mes, Mes = mes[..2], Ano = 2026, VlRealizado = valor, VpagoExclusivoFornec = exclusivo,
    VpagoOcultavel = ocultavel, VpagoExclusivoOcultavel = exclusivoOcultavel, QdeReg = 2,
};

ColunaApuracao Coluna(string mes, List<DespesaDre> pagos, List<DespesaDre>? abertos = null) =>
    new(mes, mes, new DateOnly(2026, int.Parse(mes[..2]), 1), new DateOnly(2026, int.Parse(mes[..2]), 28),
        pagos, null, 0, abertos);

ApuracaoDto Montar(IReadOnlyList<ColunaApuracao> colunas) =>
    MontadorDre.Montar(
        estrutura, colunas,
        new DespesasFiltroDto(["7"], new DateOnly(2026, 9, 1), new DateOnly(2026, 10, 28), "competencia", "ccusto-principal"),
        0, []);

decimal V(IReadOnlyList<LinhaDreDto> linhas, string nome, string mes) =>
    linhas.Single(l => l.Descricao.Equals(nome, StringComparison.OrdinalIgnoreCase)).Valores.Single(v => v.MesAno == mes).Valor;

Console.WriteLine("\n══ dc101 — baixas estornadas e da 737 na apuração ══\n");

// ── 1. A despesa sem a parte oculta: o exemplo do Gabriel, FINANCEIRO de setembro ──────────
var d = Despesa("09/2026", "4401", -64_840m, ocultavel: -32_420m);
var semOculta = d.SemBaixasOcultaveis();
Afirmar(semOculta.VlRealizado == -32_420m, "64.840,00 com uma baixa estornada de 32.420,00 vira 32.420,00", $"{semOculta.VlRealizado}");
Afirmar(semOculta.VpagoOcultavel == 0m, "e não sobra parte oculta");
Afirmar(semOculta.Chave == d.Chave && semOculta.QdeReg == d.QdeReg && semOculta.ContaSubida == d.ContaSubida,
    "a chave, a conta subida e a contagem não mudam");
Afirmar(d.VlRealizado == -64_840m, "a despesa original fica intacta");

// ── 2. Com fornecedor: o exclusivo perde a SUA parte oculta ───────────────────────────────
var f = Despesa("09/2026", "4401", -100m, ocultavel: -30m, exclusivo: -10m, exclusivoOcultavel: -4m).SemBaixasOcultaveis();
Afirmar(f.VlRealizado == -70m && f.VpagoExclusivoFornec == -6m, "com fornecedor: valor −70 e exclusivo −6",
    $"{f.VlRealizado} / {f.VpagoExclusivoFornec}");

// ── 3. A coluna: só os pagos mudam; o provisionado, não ────────────────────────────────────
var abertos = new List<DespesaDre> { Despesa("09/2026", "4401", -5m, ocultavel: -5m) };
var col = Coluna("09/2026", [d], abertos);
var colSem = col.SemBaixasOcultaveis();
Afirmar(colSem.Despesas.Single().VlRealizado == -32_420m, "a coluna leva as despesas sem a parte oculta");
Afirmar(ReferenceEquals(colSem.Abertos, abertos), "o provisionado não passa pelo filtro (título em aberto nunca sai)");
Afirmar(colSem.Chave == col.Chave && colSem.DataInicio == col.DataInicio, "a coluna é a mesma");

// ── 4. O DRE inteiro: a conta, o Sub-Total, o RO e o LUCRO LIQUIDO ─────────────────────────
var colunas = new List<ColunaApuracao>
{
    Coluna("09/2026", [d, Despesa("09/2026", "1001", -1_000m)]),
    Coluna("10/2026", [Despesa("10/2026", "4401", -500m, ocultavel: -200m), Despesa("10/2026", "1001", -1_000m)]),
};
var comTudo = Montar(colunas);
var semEstornos = Montar(colunas.Select(c => c.SemBaixasOcultaveis()).ToList());

Afirmar(V(comTudo.Linhas, "FINANCEIRO", "09/2026") == -64_840m, "o DRE de sempre continua somando tudo (o da 9815)");
Afirmar(V(semEstornos.Linhas, "FINANCEIRO", "09/2026") == -32_420m, "sem estornos: FINANCEIRO de setembro −32.420");
Afirmar(V(semEstornos.Linhas, "FINANCEIRO", "10/2026") == -300m, "e de outubro −300");
Afirmar(V(semEstornos.Linhas, "ADMINISTRATIVO", "09/2026") == -1_000m, "a conta sem baixa oculta não muda");
Afirmar(V(semEstornos.Linhas, "Sub-Total -> Despesas Operacionais", "09/2026") == -33_420m,
    "o Sub-Total acompanha", $"{V(semEstornos.Linhas, "Sub-Total -> Despesas Operacionais", "09/2026")}");
Afirmar(V(semEstornos.Linhas, "LUCRO LIQUIDO", "09/2026") - V(comTudo.Linhas, "LUCRO LIQUIDO", "09/2026") == 32_420m,
    "o LUCRO LIQUIDO sobe exatamente o que saiu");
var totalSem = semEstornos.Linhas.Single(l => l.Descricao == "FINANCEIRO").Total.Valor;
Afirmar(totalSem == -32_720m, "o Total do período soma as colunas sem estornos", $"{totalSem}");

// ── 5. A resposta leva as duas versões ─────────────────────────────────────────────────────
var resposta = comTudo with { LinhasSemEstornos = semEstornos.Linhas };
Afirmar(resposta.LinhasSemEstornos is { Count: > 0 } && ReferenceEquals(resposta.Linhas, comTudo.Linhas),
    "a apuração leva as linhas de sempre e as sem estornos");

// ── 6. O sinal na consulta: a mesma regra do detalhamento (`ocultavel` em baixasEstornadas.ts) ──
var sinal = DreGerencialRepository.SinalDeOcultavel(emAberto: false);
Afirmar(sinal.Contains("FIN.DTESTORNOBAIXA is not null") && sinal.Contains("FIN.CODROTINABAIXA like '%737%'"),
    "pago: estornada OU rotina 737", sinal);
Afirmar(sinal.TrimEnd().EndsWith("as OCULTAVEL,"), "e vira a coluna OCULTAVEL, com a vírgula do {6}");
Afirmar(!sinal.Contains(':'), "sem bind nenhum — a ordem posicional dos parâmetros não muda");
Afirmar(DreGerencialRepository.SinalDeOcultavel(emAberto: true).Trim() == "0 as OCULTAVEL,",
    "em aberto: nunca sai (título reaberto é o que o Provisionado cobra)");

// As quatro consultas levam o {6} entre as colunas, e somam o sinal nas duas camadas de fora.
foreach (var (nome, sql) in new[]
{
    ("DespesasGrupoDeContas", DreGerencialQueries.DespesasGrupoDeContas),
    ("DespesasContaGerencial", DreGerencialQueries.DespesasContaGerencial),
    ("DespesasCCustoPrincipal", DreGerencialQueries.DespesasCCustoPrincipal),
    ("DespesasCentroCusto", DreGerencialQueries.DespesasCentroCusto),
})
{
    Afirmar(sql.Contains("{6}") && sql.Contains("sum(VPAGO*OCULTAVEL) as VPAGO_OCULTAVEL")
            && sql.Contains("sum(VPAGO_OCULTAVEL) AS VPAGOOCULTAVEL")
            && sql.Contains("DTESTORNOBAIXA, CODROTINABAIXA")
            && sql.Contains("0 as VPAGO_OCULTAVEL, 0 as VPAGO_EXCLUSIVO_OCULTAVEL, 0 as QdeReg"),
        $"{nome}: sinal, somas e o ramo do PCPREST");
}

Console.WriteLine(falhas == 0 ? $"\n✓ dc101 passou — {n} conferências" : $"\n✗ dc101: {falhas} de {n} falharam");
return falhas == 0 ? 0 : 1;
