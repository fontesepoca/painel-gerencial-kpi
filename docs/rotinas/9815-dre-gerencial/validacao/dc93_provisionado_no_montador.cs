#:project ../../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// dc93 — a coluna PROVISIONADO no MontadorDre (14/10/2026).
//
// Em competência, cada linha de despesa ganha o que está em aberto (DTPAGTO IS NULL) naquela
// coluna. O Valor, os totalizadores, o %AV e o %AH não mudam. Ver
// docs/superpowers/specs/2026-10-14-provisionado-competencia-design.md.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc93_provisionado_no_montador.cs -p:BaseOutputPath="$TEMP/dc93/"
//
// Não toca no banco: estrutura, pagos e abertos montados à mão.

using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Domain.Entities;

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
    Linha(10, "1001", "ADMINISTRATIVO", "SSS"),
    Linha(11, "2801", "TRANSPORTES MATRIZ", "SSS"),
    Linha(20, "-20", "Sub-Total -> Despesas Operacionais", "SSS"),
    Linha(30, "-30", "RESULTADO OPERACIONAL", "NSS"),
    Linha(40, "-40", "LUCRO LIQUIDO", "NNS"),
    Linha(50, "3000067", "Manutencao De Veiculos", "NNN"),
};

DespesaDre Despesa(string mes, string chave, decimal valor, string? contaSubida = null, decimal exclusivo = 0m) => new()
{
    GrupoConta = chave, ContaSubida = contaSubida, AntesRo = "S", AntesLl = "S", AntesLf = "S",
    MesAno = mes, Mes = mes[..2], Ano = 2026, VlRealizado = valor, VpagoExclusivoFornec = exclusivo, QdeReg = 1,
};

ColunaApuracao Coluna(string mes, List<DespesaDre> pagos, List<DespesaDre>? abertos, FaturamentoDre? f = null) =>
    new(mes, mes, new DateOnly(2026, int.Parse(mes[..2]), 1), new DateOnly(2026, int.Parse(mes[..2]), 28),
        pagos, f, 0, abertos);

ApuracaoDto Montar(params ColunaApuracao[] colunas) =>
    MontadorDre.Montar(
        estrutura, colunas,
        new DespesasFiltroDto(["7"], new DateOnly(2026, 7, 1), new DateOnly(2026, 8, 28), "competencia", "ccusto-principal"),
        0, [3000067, 3000080]);

LinhaDreDto L(ApuracaoDto a, string nome) =>
    a.Linhas.Single(l => l.Descricao.Equals(nome, StringComparison.OrdinalIgnoreCase));
ValorMesDto V(ApuracaoDto a, string nome, string mes) => L(a, nome).Valores.Single(v => v.MesAno == mes);

Console.WriteLine("\n══ dc93 — o provisionado no montador ══\n");

// ── 1. Julho com aberto, agosto sem ─────────────────────────────────────────────────────────
var a = Montar(
    Coluna("07/2026",
        [Despesa("07/2026", "1001", -100m)],
        [Despesa("07/2026", "1001", -40m), Despesa("07/2026", "2801", -7m)]),
    Coluna("08/2026",
        [Despesa("08/2026", "1001", -50m)],
        []));

Afirmar(V(a, "ADMINISTRATIVO", "07/2026").Valor == -100m, "o Valor de julho não muda com o aberto");
Afirmar(V(a, "ADMINISTRATIVO", "07/2026").Provisionado == -40m, "o aberto de julho no ADMINISTRATIVO",
    $"{V(a, "ADMINISTRATIVO", "07/2026").Provisionado}");
Afirmar(V(a, "ADMINISTRATIVO", "08/2026").Provisionado is null, "agosto sem aberto: Provisionado nulo");
Afirmar(a.Periodos.Single(p => p.MesAno == "07/2026").TemProvisionado, "julho TEM provisionado");
Afirmar(!a.Periodos.Single(p => p.MesAno == "08/2026").TemProvisionado, "agosto NÃO tem");
Afirmar(L(a, "ADMINISTRATIVO").Total.Provisionado == -40m, "o total do período soma os provisionados");
// Os totalizadores que somam despesa têm Provisionado pelas MESMAS somas do valor (opção 1,
// 14/10/2026 — a evolução da §8 da spec): ADMINISTRATIVO −40 + TRANSPORTES −7.
Afirmar(V(a, "Sub-Total -> Despesas Operacionais", "07/2026").Provisionado == -47m,
    "o Sub-Total soma os provisionados das operacionais", $"{V(a, "Sub-Total -> Despesas Operacionais", "07/2026").Provisionado}");
Afirmar(V(a, "RESULTADO OPERACIONAL", "07/2026").Provisionado == -47m, "o RESULTADO OPERACIONAL também");
Afirmar(V(a, "LUCRO LIQUIDO", "07/2026").Provisionado == -47m, "e o LUCRO LIQUIDO");
Afirmar(V(a, "Sub-Total -> Despesas Operacionais", "08/2026").Provisionado is null, "agosto sem aberto: nem o totalizador");
Afirmar(L(a, "Sub-Total -> Despesas Operacionais").Total.Provisionado == -47m, "o total do período do Sub-Total");
Afirmar(V(a, "Sub-Total -> Despesas Operacionais", "07/2026").Valor == -100m,
    "o Valor do Sub-Total continua só o pago", $"{V(a, "Sub-Total -> Despesas Operacionais", "07/2026").Valor}");

// TRANSPORTES MATRIZ só tem aberto: tem de aparecer.
Afirmar(V(a, "TRANSPORTES MATRIZ", "07/2026").Valor == 0m && V(a, "TRANSPORTES MATRIZ", "07/2026").Provisionado == -7m,
    "linha só com aberto: Valor 0,00 e o Provisionado");
// A visibilidade de SEMPRE não muda (D9): pelo critério do pago ela continua sem movimento —
// com o checkbox desligado a tela é a de antes. Quem a traz de volta é o `ComAberto`, que o
// front só usa com o Provisionado ligado.
Afirmar(L(a, "TRANSPORTES MATRIZ").SemMovimento, "pelo critério do pago, segue sem movimento (a tela de antes)");
Afirmar(L(a, "TRANSPORTES MATRIZ").ComAberto, "mas tem aberto — a tela a mostra com o Provisionado ligado");
Afirmar(L(a, "ADMINISTRATIVO").ComAberto && !L(a, "ADMINISTRATIVO").SemMovimento, "linha com pago e aberto: as duas marcas");
Afirmar(!L(a, "Sub-Total -> Despesas Operacionais").ComAberto, "totalizador nunca tem aberto");

// ── 2. Conta subida em aberto num centro sem linha: vai para a conta e entra na sobra ──────
var s = Montar(Coluna("07/2026",
    [Despesa("07/2026", "1001", -10m)],
    [Despesa("07/2026", "99", -3m, "3000067")]));
Afirmar(V(s, "Manutencao De Veiculos", "07/2026").Provisionado == -3m, "aberto de conta subida sem centro vai para a conta");
Afirmar(L(s, "Manutencao De Veiculos").Detalhe?.Sobra is ["99"], "e o 99 entra na sobra do duplo clique",
    string.Join(",", L(s, "Manutencao De Veiculos").Detalhe?.Sobra ?? []));

// ── 3. Fornecedor: rateado como o Valor, o exclusivo inteiro ───────────────────────────────
var meio = new FaturamentoDre { MesAno = "07/2026", ReceitaLiquida = 50m, ReceitaLiquidaTotal = 100m };
var f = Montar(Coluna("07/2026",
    [Despesa("07/2026", "1001", -100m)],
    [Despesa("07/2026", "1001", -40m, exclusivo: -10m)],
    meio));
// (−40 − (−10)) × 0,5 + (−10) = −25
Afirmar(V(f, "ADMINISTRATIVO", "07/2026").Provisionado == -25m, "com fornecedor: (aberto − exclusivo) × participação + exclusivo",
    $"{V(f, "ADMINISTRATIVO", "07/2026").Provisionado}");

// ── 4. Caixa: nada de aberto chega, nada muda ─────────────────────────────────────────────
var c = Montar(Coluna("07/2026", [Despesa("07/2026", "1001", -100m)], null));
Afirmar(V(c, "ADMINISTRATIVO", "07/2026").Provisionado is null && L(c, "ADMINISTRATIVO").Total.Provisionado is null,
    "sem abertos (caixa): Provisionado nulo");
Afirmar(!c.Periodos[0].TemProvisionado, "e a coluna não tem provisionado");

// ── 4b. %AV e %AH sobre R + P (14/10/2026, opção 1: a tela usa só com o Provisionado ligado) ──
// Julho: R −100, P −40; agosto: R −50, sem aberto. Receita líquida 1.000 nos dois meses.
var rl = (string mes) => new FaturamentoDre { MesAno = mes, ReceitaLiquida = 1000m, ReceitaLiquidaTotal = 1000m };
var p = Montar(
    Coluna("07/2026", [Despesa("07/2026", "1001", -100m)], [Despesa("07/2026", "1001", -40m)], rl("07/2026")),
    Coluna("08/2026", [Despesa("08/2026", "1001", -50m)], [], rl("08/2026")));
var jul = V(p, "ADMINISTRATIVO", "07/2026");
var ago = V(p, "ADMINISTRATIVO", "08/2026");
Afirmar(jul.PercentualAv == -10m, "o %AV de sempre segue sobre o Realizado (−100 / 1.000)", $"{jul.PercentualAv}");
Afirmar(jul.PercentualAvComProvisionado == -14m, "o %AV sobre R + P: −140 / 1.000", $"{jul.PercentualAvComProvisionado}");
Afirmar(ago.PercentualAh == -50m, "o %AH de sempre: −50 contra −100", $"{ago.PercentualAh}");
// Agosto não tem aberto, mas o mês ANTERIOR tem: compara −50 com −140.
Afirmar(ago.PercentualAhComProvisionado is { } ah && Math.Round(ah, 6) == Math.Round((-50m / -140m - 1m) * 100m, 6),
    "o %AH sobre R + P compara com o R + P do mês anterior", $"{ago.PercentualAhComProvisionado}");
Afirmar(jul.PercentualAhComProvisionado == 0m, "primeiro mês: 0, como o %AH de sempre");
Afirmar(L(p, "ADMINISTRATIVO").Total.PercentualAvComProvisionado == -9.5m,
    "o %AV do período sobre R + P: −190 / 2.000", $"{L(p, "ADMINISTRATIVO").Total.PercentualAvComProvisionado}");
// O PEDIDO: o %AV R + P das contas bate com o do Sub-Total. Aqui só há uma conta
// operacional, então os dois têm de ser iguais: −140 / 1.000.
Afirmar(V(p, "Sub-Total -> Despesas Operacionais", "07/2026").PercentualAvComProvisionado == -14m,
    "o %AV R + P do Sub-Total bate com o das contas", $"{V(p, "Sub-Total -> Despesas Operacionais", "07/2026").PercentualAvComProvisionado}");
Afirmar(V(p, "Sub-Total -> Despesas Operacionais", "07/2026").PercentualAv == -10m, "e o de sempre segue sobre o pago");

// Sem nenhum aberto na apuração, não há versão R + P — a tela usa a de sempre.
var semP = Montar(Coluna("07/2026", [Despesa("07/2026", "1001", -100m)], [], rl("07/2026")));
Afirmar(V(semP, "ADMINISTRATIVO", "07/2026").PercentualAvComProvisionado is null, "sem aberto: nada de R + P");

// ── 5. Arredondamento por coluna, como o Valor ────────────────────────────────────────────
var r = Montar(
    Coluna("07/2026", [], [Despesa("07/2026", "1001", -0.125m)]),
    Coluna("08/2026", [], [Despesa("08/2026", "1001", -0.125m)]));
Afirmar(V(r, "ADMINISTRATIVO", "07/2026").Provisionado == -0.12m, "half-to-even por coluna");
Afirmar(L(r, "ADMINISTRATIVO").Total.Provisionado == -0.24m, "o total soma as colunas já arredondadas",
    $"{L(r, "ADMINISTRATIVO").Total.Provisionado}");

Console.WriteLine(falhas == 0 ? $"\n✓ dc93 passou — {n} conferências\n" : $"\n✗ {falhas} falha(s) de {n}\n");
return falhas == 0 ? 0 : 1;
