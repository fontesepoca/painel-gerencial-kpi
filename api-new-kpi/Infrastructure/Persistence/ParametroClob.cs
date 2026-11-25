using System.Data;
using Dapper;
using Oracle.ManagedDataAccess.Client;

namespace Epoca.Kpi.Api.Infrastructure.Persistence;

/// <summary>
/// Um texto que vai ao Oracle como <c>CLOB</c>, e não como <c>VARCHAR2</c>.
///
/// <para>O Dapper manda <c>string</c> como <c>VARCHAR2</c>, e em SQL esse bind para nos 4.000
/// bytes. As preferências de tela cabem nisso hoje; a seção da ordem das linhas, quando
/// entrar, não. Usado dentro de um <c>DynamicParameters</c>, na posição do placeholder — os
/// binds continuam posicionais.</para>
/// </summary>
public sealed class ParametroClob : SqlMapper.ICustomQueryParameter
{
    private readonly string _valor;

    public ParametroClob(string valor) => _valor = valor;

    public void AddParameter(IDbCommand command, string name) =>
        command.Parameters.Add(new OracleParameter(name, OracleDbType.Clob) { Value = _valor });
}
