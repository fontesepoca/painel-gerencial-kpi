#:project ../../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// dc109 — toda linha zerada some com "Mostrar zeradas" desmarcado (11/11/2026, divergência 22).
//
// Pedido do Gabriel: "suma todos os zerados mesmo". A 9815 esconde só a conta SEM lançamento;
// aqui o critério é o valor — zero em todas as colunas —, tenha a conta lançamento ou não.
//
// Rode da RAIZ do repositório (o BaseOutputPath evita o apphost.exe da API em execução):
//   dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc109_linha_zerada_some.cs -p:BaseOutputPath="$TEMP/dc109/"
//
// Não toca no banco: estrutura e despesas montadas à mão.

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
    Linha(11, "1002", "DESCONTO FUNCIONARIOS", "SSS"),
    Linha(12, "1003", "NAO USA/NAO INFORMADO", "SSS"),
    Linha(13, "1004", "RECEITA VENDA ATIVO", "SSS"),
    Linha(14, "1005", "ALFALOG", "SSS"),
    Linha(15, "1006", "OSCILA", "SSS"),
    Linha(20, "-20", "Sub-Total -> Despesas Operacionais", "SSS"),
    Linha(30, "-30", "RESULTADO OPERACIONAL", "NSS"),
    Linha(40, "-40", "LUCRO LIQUIDO", "NNS"),
    Linha(50, "9001", "CONTRATO DE MUTUO", "NNN"),
};

DespesaDre Despesa(string chave, string mes, decimal valor, int qde = 1, string flags = "SSS") => new()
{
    GrupoConta = chave,
    AntesRo = flags[..1], AntesLl = flags[1..2], AntesLf = flags[2..],
    MesAno = $"{mes}/2026", Mes = mes, Ano = 2026, VlRealizado = valor, QdeReg = qde,
};

ColunaApuracao Coluna(string mes, List<DespesaDre> despesas)
{
    var m = int.Parse(mes);
    var inicio = new DateOnly(2026, m, 1);
    return new ColunaApuracao($"{mes}/2026", $"{mes}/2026", inicio, inicio.AddMonths(1).AddDays(-1), despesas, null);
}

var apuracao = MontadorDre.Montar(
    estrutura,
    [
        Coluna("07",
        [
            Despesa("1001", "07", -100m),
            Despesa("1002", "07", 0m, qde: 16),        // lançamentos que se anulam
            Despesa("1003", "07", 0m, qde: 1),         // o título com a baixa estornada, já sem valor
            Despesa("1004", "07", 225_000m, qde: 0),   // a venda de ativo: PCPREST, "0 as QdeReg"
            Despesa("1006", "07", 100m),
            Despesa("9001", "07", 0m, qde: 18, flags: "NNN"),
        ]),
        Coluna("08",
        [
            Despesa("1001", "08", -50m),
            Despesa("1006", "08", -100m),              // +100 e (100): soma zero, mas mexeu
        ]),
    ],
    new DespesasFiltroDto(["7"], new DateOnly(2026, 7, 1), new DateOnly(2026, 8, 31), "competencia", "conta-gerencial"),
    0,
    []);

LinhaDreDto L(string descricao) =>
    apuracao.Linhas.Single(l => l.Descricao.Equals(descricao, StringComparison.OrdinalIgnoreCase));

Console.WriteLine("\n══ dc109 — toda linha zerada some ══\n");

Afirmar(!L("ADMINISTRATIVO").SemMovimento, "linha com valor aparece");
Afirmar(L("DESCONTO FUNCIONARIOS").SemMovimento, "zerada com 16 lançamentos que se anulam SOME (a 9815 mostrava)");
Afirmar(L("NAO USA/NAO INFORMADO").SemMovimento, "zerada com lançamento sem valor SOME");
Afirmar(L("CONTRATO DE MUTUO").SemMovimento, "informativa zerada com 18 lançamentos SOME");
Afirmar(L("ALFALOG").SemMovimento, "sem lançamento nenhum some, como sempre");
Afirmar(!L("RECEITA VENDA ATIVO").SemMovimento, "valor sem lançamento continua aparecendo (divergência 6)");
Afirmar(!L("OSCILA").SemMovimento, "+100 num mês e (100) no outro: soma zero e aparece — o critério é por coluna",
    $"total {L("OSCILA").Total.Valor}");
Afirmar(apuracao.Linhas.Where(l => l.Calculada).All(l => !l.SemMovimento), "linha calculada nunca some");

// Nenhum número muda: o Sub-Total é o mesmo com ou sem as zeradas na tela.
var visiveis = apuracao.Linhas.Where(l => !l.Calculada && !l.NaoSoma && !l.SemMovimento).Sum(l => l.Total.Valor);
var subTotal = L("Sub-Total -> Despesas Operacionais").Total.Valor;
Afirmar(visiveis == subTotal, "as linhas visíveis fecham com o Sub-Total", $"{visiveis} = {subTotal}");

Console.WriteLine(falhas == 0
    ? $"\n✓ dc109 passou — {n} conferências\n"
    : $"\n✗ {falhas} falha(s) de {n}\n");
return falhas == 0 ? 0 : 1;
