#:project ../../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// dc91 — Manutencao De Veiculos e PNEUS E CAMARAS se distribuem pela análise (08/10/2026).
//
// Pedido do cliente: fora da Conta Gerencial, cada lançamento das contas subidas cai na linha
// da análise — o centro principal, o centro, o grupo —, como qualquer conta operacional. Só o
// que não acha linha fica na linha da conta. O total do Sub-Total não muda.
//
// Rode da RAIZ do repositório (o BaseOutputPath evita o apphost.exe da API em execução):
//   dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc91_contas_subidas_se_distribuem.cs -p:BaseOutputPath="$TEMP/dc91/"
//
// Não toca no banco. Monta a estrutura e as despesas à mão, no formato que as consultas
// entregam DEPOIS da mudança: as despesas das contas subidas já vêm com a chave da análise,
// flags S/S/S e a coluna ContaSubida preenchida.

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

// A estrutura do C. Custo Principal, reduzida ao que importa: duas linhas operacionais, os
// totalizadores e a conta 3000067 como órfã (N/N/N), que é como o cadastro a traz.
var estrutura = new List<LinhaEstruturaDre>
{
    Linha(10, "1001", "ADMINISTRATIVO", "SSS"),
    Linha(11, "2801", "TRANSPORTES MATRIZ", "SSS"),
    Linha(20, "-20", "Sub-Total -> Despesas Operacionais", "SSS"),
    Linha(30, "-30", "RESULTADO OPERACIONAL", "NSS"),
    Linha(40, "-40", "LUCRO LIQUIDO", "NNS"),
    Linha(50, "3000067", "Manutencao De Veiculos", "NNN"),
};

DespesaDre Despesa(string chave, string flags, decimal valor, string? contaSubida = null) => new()
{
    GrupoConta = chave, ContaSubida = contaSubida,
    AntesRo = flags[..1], AntesLl = flags[1..2], AntesLf = flags[2..],
    MesAno = "07/2026", Mes = "07", Ano = 2026, VlRealizado = valor, QdeReg = 1,
};

ApuracaoDto Montar(string analise, List<DespesaDre> despesas, long[] subidas) =>
    MontadorDre.Montar(
        estrutura,
        [new ColunaApuracao("07/2026", "Jul/2026", new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 31), despesas, null)],
        new DespesasFiltroDto(["7"], new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 31), "competencia", analise),
        0,
        subidas);

decimal Valor(ApuracaoDto a, string descricao) =>
    a.Linhas.Single(l => l.Descricao.Equals(descricao, StringComparison.OrdinalIgnoreCase)).Total.Valor;
LinhaDreDto LinhaDe(ApuracaoDto a, string descricao) =>
    a.Linhas.Single(l => l.Descricao.Equals(descricao, StringComparison.OrdinalIgnoreCase));

long[] epoca = [3000067, 3000080];

// ── 1. C. Custo Principal: cada centro na sua linha, o 99 sobra na da conta ─────────────────
Console.WriteLine("\n══ dc91 — as contas subidas se distribuem pela análise ══\n");
var cc = Montar("ccusto-principal",
[
    Despesa("1001", "SSS", -100m),                    // despesa comum do ADMINISTRATIVO
    Despesa("1001", "SSS", -10m, "3000067"),          // manutenção do centro 1001
    Despesa("2801", "SSS", -20m, "3000067"),          // manutenção do 2801
    Despesa("99", "SSS", 5m, "3000067"),              // sem centro: não há linha 99
], epoca);

Afirmar(Valor(cc, "ADMINISTRATIVO") == -110m, "1001 da manutenção soma no ADMINISTRATIVO", $"{Valor(cc, "ADMINISTRATIVO")}");
Afirmar(Valor(cc, "TRANSPORTES MATRIZ") == -20m, "2801 da manutenção soma no TRANSPORTES MATRIZ", $"{Valor(cc, "TRANSPORTES MATRIZ")}");
Afirmar(Valor(cc, "Manutencao De Veiculos") == 5m, "na linha da conta fica SÓ a sobra (o 99)", $"{Valor(cc, "Manutencao De Veiculos")}");
Afirmar(Valor(cc, "Sub-Total -> Despesas Operacionais") == -125m, "o Sub-Total soma tudo, uma vez só", $"{Valor(cc, "Sub-Total -> Despesas Operacionais")}");

var detalheSobra = LinhaDe(cc, "Manutencao De Veiculos").Detalhe;
Afirmar(detalheSobra?.Sobra is ["99"], "o duplo clique na sobra recorta só o 99",
    string.Join(",", detalheSobra?.Sobra ?? []));
Afirmar(detalheSobra?.Bloco == "orfa" && detalheSobra.Chave == "3000067",
    "e continua buscando pela conta, no bloco de antes da subida");
Afirmar(LinhaDe(cc, "ADMINISTRATIVO").Detalhe?.Sobra is null, "linha comum não leva sobra");

// ── 2. Sem sobra, a linha da conta não abre nada ───────────────────────────────────────────
var semSobra = Montar("ccusto-principal",
[
    Despesa("1001", "SSS", -10m, "3000067"),
], epoca);
Afirmar(Valor(semSobra, "Manutencao De Veiculos") == 0m, "sem sobra a linha da conta zera");
Afirmar(LinhaDe(semSobra, "Manutencao De Veiculos").Detalhe is null, "e o duplo clique não abre uma tela vazia");
Afirmar(LinhaDe(semSobra, "Manutencao De Veiculos").SemMovimento, "e ela some com 'Mostrar zeradas' desmarcado");

// ── 3. Conta Gerencial: nada muda, a linha é a conta ───────────────────────────────────────
var cg = Montar("conta-gerencial",
[
    Despesa("3000067", "NNN", -30m),                  // a consulta da Conta Gerencial não marca ContaSubida
], epoca);
Afirmar(Valor(cg, "Manutencao De Veiculos") == -30m, "Conta Gerencial: a conta inteira na própria linha");
Afirmar(Valor(cg, "Sub-Total -> Despesas Operacionais") == -30m, "e ela soma no Sub-Total, como desde 25/09");
Afirmar(LinhaDe(cg, "Manutencao De Veiculos").Detalhe is { Sobra: null, Bloco: "orfa" },
    "e o duplo clique abre a conta inteira");

// ── 4. Base sem contas subidas (Minas Rural): a conta fica informativa ─────────────────────
var mr = Montar("ccusto-principal",
[
    Despesa("3000067", "NNN", -30m),                  // sem o marcador, a consulta a entrega pela conta
], []);
Afirmar(Valor(mr, "Manutencao De Veiculos") == -30m, "Minas Rural: a linha existe com o valor");
Afirmar(Valor(mr, "Sub-Total -> Despesas Operacionais") == 0m, "mas NÃO entra no Sub-Total — a regra é só da Época");

Console.WriteLine(falhas == 0
    ? $"\n✓ dc91 passou — {n} conferências\n"
    : $"\n✗ {falhas} falha(s) de {n}\n");
return falhas == 0 ? 0 : 1;
