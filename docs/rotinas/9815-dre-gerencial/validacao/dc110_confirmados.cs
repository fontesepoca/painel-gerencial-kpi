#:project ../../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// dc110 — o checkbox "Confirmados" (24/11/2026, divergência 23).
//
// Desde 22/10/2026 (divergência 20), em competência, o Vl. Realizado é o PAGO mais o título NÃO
// pago com TIPOLANC = 'C' (confirmado). O checkbox separa os dois: a API passa a mandar, ao lado
// do Valor de sempre, quanto DELE é confirmado — e a tela mostra Vl. Realizado (Valor −
// Confirmado, o número da 9815) e Vl. Confirmado. O Valor não muda.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc110_confirmados.cs -p:BaseOutputPath="$TEMP/dc110/"
//
// Não toca no banco.

using System.Text.RegularExpressions;
using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

var falhas = 0;
var n = 0;
void Afirmar(bool ok, string oque, string detalhe = "")
{
    n++;
    Console.WriteLine($"  {(ok ? "ok   " : "FALHA")} {oque}{(detalhe.Length > 0 ? "   " + detalhe : "")}");
    if (!ok) falhas++;
}

static string Binds(string sql) =>
    string.Join(" ", Regex.Matches(sql, @":[A-Za-z]\w*|\{\d+\}").Select(m => m.Value));

static int Vezes(string sql, string trecho) => Regex.Matches(sql, Regex.Escape(trecho)).Count;

Console.WriteLine("\n══ dc110 — os confirmados ══\n");

// ── 1. A consulta: a mesma, trocando só o pagamento ─────────────────────────────────────────
foreach (var (nome, sql) in new (string, string)[]
{
    ("DespesasGrupoDeContas", DreGerencialQueries.DespesasGrupoDeContas),
    ("DespesasContaGerencial", DreGerencialQueries.DespesasContaGerencial),
    ("DespesasCCustoPrincipal", DreGerencialQueries.DespesasCCustoPrincipal),
    ("DespesasCentroCusto", DreGerencialQueries.DespesasCentroCusto),
})
{
    var conf = ConsultasEmAberto.ConfirmadosNaoPagos(sql);
    Afirmar(Vezes(conf, "WHERE DTPAGTO IS NULL AND TIPOLANC = 'C'") == 1 && Vezes(conf, "DTPAGTO IS NOT NULL") == 0,
        $"{nome}: só o não pago confirmado");
    Afirmar(Vezes(conf, "nf.codfilial IN ({3}) AND 1 = 0") == 1,
        $"{nome}: sem o ramo de venda de ativo — ele é receita recebida, nunca confirmado");
    Afirmar(Binds(conf) == Binds(sql), $"{nome}: os MESMOS binds, na mesma ordem");
    Afirmar(conf.Length == sql.Length - "NOT ".Length + " AND TIPOLANC = 'C'".Length + " AND 1 = 0".Length,
        $"{nome}: nenhuma outra mudança no texto");
}

// O detalhamento da célula Vl. Confirmado: a mesma consulta de lançamentos, trocando só isso.
var lanc = DreDetalheQueries.Lancamentos;
var lancConf = ConsultasEmAberto.LancamentosConfirmados(lanc);
Afirmar(Vezes(lancConf, "WHERE DTPAGTO IS NULL AND TIPOLANC = 'C') FIN") == 1 && Vezes(lancConf, "DTPAGTO IS NOT NULL") == 0,
    "Lancamentos: só o não pago confirmado");
Afirmar(Vezes(lancConf, "nf.codfilial IN ({2}) AND 1 = 0") == 1, "Lancamentos: sem o ramo de venda de ativo");
Afirmar(Binds(lancConf) == Binds(lanc), "Lancamentos: os MESMOS binds, na mesma ordem");
// E a célula Vl. Realizado, com o checkbox marcado, é a consulta ORIGINAL — o filtro da 9815.
Afirmar(Vezes(lanc, "WHERE DTPAGTO IS NOT NULL) FIN") == 1, "Lancamentos: a original é só o pago, como na 9815");

// ── 2. O montador ───────────────────────────────────────────────────────────────────────────
LinhaEstruturaDre Linha(int id, string chave, string nome, string flags) => new()
{
    Id = id, CodGruConta = chave, Grupo = nome, InfContas = "N",
    AntesRo = flags[..1], AntesLl = flags[1..2], AntesLf = flags[2..],
};

var estrutura = new List<LinhaEstruturaDre>
{
    Linha(5, "-5", "LUCRO BRUTO", "SSS"),
    Linha(10, "1101", "COMPRAS - RAT", "SSS"),
    Linha(11, "1501", "FINANCEIRO - RAT", "SSS"),
    Linha(20, "-20", "Sub-Total -> Despesas Operacionais", "SSS"),
    Linha(30, "-30", "RESULTADO OPERACIONAL", "NSS"),
    Linha(40, "-40", "LUCRO LIQUIDO", "NNS"),
};

DespesaDre Despesa(string mes, string chave, decimal valor, decimal exclusivo = 0m, decimal ocultavel = 0m) => new()
{
    GrupoConta = chave, AntesRo = "S", AntesLl = "S", AntesLf = "S",
    MesAno = mes, Mes = mes[..2], Ano = 2026, VlRealizado = valor, VpagoExclusivoFornec = exclusivo,
    VpagoOcultavel = ocultavel, QdeReg = 1,
};

// O VALOR que a consulta de sempre traz em competência JÁ inclui o confirmado: aqui, os
// −35.207,33 da COMPRAS - RAT de novembro/2026 na filial 7, dos quais −14.600,15 confirmados.
ColunaApuracao Coluna(string mes, List<DespesaDre> realizados, List<DespesaDre>? confirmados, FaturamentoDre? f = null) =>
    new(mes, mes, new DateOnly(2026, int.Parse(mes[..2]), 1), new DateOnly(2026, int.Parse(mes[..2]), 23),
        realizados, f, 0, Abertos: [], Confirmados: confirmados);

ApuracaoDto Montar(params ColunaApuracao[] colunas) =>
    MontadorDre.Montar(
        estrutura, colunas,
        new DespesasFiltroDto(["7"], new DateOnly(2026, 10, 1), new DateOnly(2026, 11, 23), "competencia", "ccusto-principal"),
        0, [3000067, 3000080]);

LinhaDreDto L(ApuracaoDto a, string nome) =>
    a.Linhas.Single(l => l.Descricao.Equals(nome, StringComparison.OrdinalIgnoreCase));
ValorMesDto V(ApuracaoDto a, string nome, string mes) => L(a, nome).Valores.Single(v => v.MesAno == mes);

var a = Montar(
    Coluna("10/2026", [Despesa("10/2026", "1101", -1000m)], []),
    Coluna("11/2026",
        [Despesa("11/2026", "1101", -35207.33m), Despesa("11/2026", "1501", -73341.28m)],
        [Despesa("11/2026", "1101", -14600.15m), Despesa("11/2026", "1501", -14821.52m)]));

Afirmar(V(a, "COMPRAS - RAT", "11/2026").Valor == -35207.33m, "o Valor não muda: segue pago + confirmado");
Afirmar(V(a, "COMPRAS - RAT", "11/2026").Confirmado == -14600.15m, "o confirmado da COMPRAS - RAT",
    $"{V(a, "COMPRAS - RAT", "11/2026").Confirmado}");
Afirmar(V(a, "COMPRAS - RAT", "11/2026").Valor - V(a, "COMPRAS - RAT", "11/2026").Confirmado == -20607.18m,
    "Valor − Confirmado = o número da 9815 (20.607,18)");
Afirmar(V(a, "COMPRAS - RAT", "10/2026").Confirmado is null, "outubro sem confirmado: nulo");
Afirmar(a.Periodos.Single(p => p.MesAno == "11/2026").TemConfirmado, "novembro TEM confirmado");
Afirmar(!a.Periodos.Single(p => p.MesAno == "10/2026").TemConfirmado, "outubro NÃO tem");

// Cada coluna fecha sozinha: os totalizadores que somam despesa têm o próprio confirmado.
Afirmar(V(a, "Sub-Total -> Despesas Operacionais", "11/2026").Confirmado == -29421.67m,
    "o Sub-Total soma os confirmados das operacionais", $"{V(a, "Sub-Total -> Despesas Operacionais", "11/2026").Confirmado}");
Afirmar(V(a, "RESULTADO OPERACIONAL", "11/2026").Confirmado == -29421.67m, "o RESULTADO OPERACIONAL também");
Afirmar(V(a, "LUCRO LIQUIDO", "11/2026").Confirmado == -29421.67m, "e o LUCRO LIQUIDO");
Afirmar(V(a, "LUCRO BRUTO", "11/2026").Confirmado is null, "o LUCRO BRUTO não tem confirmado — receita não é título");
Afirmar(L(a, "COMPRAS - RAT").Total.Confirmado == -14600.15m, "o total do período soma os confirmados");
Afirmar(V(a, "COMPRAS - RAT", "11/2026").Provisionado is null, "o confirmado não vaza para o Provisionado");

// %AV e %AH não mudam com o confirmado (pedido de 24/11/2026).
var rl = new FaturamentoDre { MesAno = "11/2026", ReceitaLiquida = 100000m, ReceitaLiquidaTotal = 100000m };
var semC = Montar(Coluna("11/2026", [Despesa("11/2026", "1101", -35207.33m)], [], rl));
var comC = Montar(Coluna("11/2026", [Despesa("11/2026", "1101", -35207.33m)], [Despesa("11/2026", "1101", -14600.15m)], rl));
Afirmar(V(semC, "COMPRAS - RAT", "11/2026").PercentualAv == V(comC, "COMPRAS - RAT", "11/2026").PercentualAv,
    "o %AV é o mesmo com ou sem confirmado");

// Fornecedor: rateado como o Valor.
var meio = new FaturamentoDre { MesAno = "11/2026", ReceitaLiquida = 50m, ReceitaLiquidaTotal = 100m };
var f = Montar(Coluna("11/2026", [Despesa("11/2026", "1101", -100m)], [Despesa("11/2026", "1101", -40m, exclusivo: -10m)], meio));
Afirmar(V(f, "COMPRAS - RAT", "11/2026").Confirmado == -25m, "com fornecedor: (confirmado − exclusivo) × participação + exclusivo",
    $"{V(f, "COMPRAS - RAT", "11/2026").Confirmado}");

// Caixa: nenhuma lista chega.
var caixa = Montar(Coluna("11/2026", [Despesa("11/2026", "1101", -100m)], null));
Afirmar(V(caixa, "COMPRAS - RAT", "11/2026").Confirmado is null && !caixa.Periodos[0].TemConfirmado,
    "caixa: sem confirmado");

// ── 3. "Ocultar baixas estornadas": o confirmado sai do mesmo jeito que sai do Valor ────────
// Um confirmado com baixa estornada é oculto no Valor (divergência 21). Se não saísse também do
// Confirmado, o Vl. Realizado (Valor − Confirmado) ficaria com o sinal trocado.
var col = Coluna("11/2026",
    [Despesa("11/2026", "1101", -300m, ocultavel: -100m)],
    [Despesa("11/2026", "1101", -100m, ocultavel: -100m)]);
var sem = col.SemBaixasOcultaveis();
Afirmar(sem.Despesas[0].VlRealizado == -200m && sem.Confirmados![0].VlRealizado == 0m,
    "sem estornos, o confirmado oculto sai do Valor e do Confirmado");

Console.WriteLine(falhas == 0 ? $"\n✓ dc110 passou — {n} conferências\n" : $"\n✗ {falhas} falha(s) de {n}\n");
return falhas == 0 ? 0 : 1;
