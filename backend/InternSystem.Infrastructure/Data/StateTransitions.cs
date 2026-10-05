using System.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.Infrastructure.Data;

/// <summary> WHERE enrichment used by <see cref="StateTransitions"/>. </summary>
public enum WhereOp
{
    Equal,
    IsNull,
    IsNotNull
}

/// <summary>
/// Atomic compare-and-swap state transitions. Each call runs a single UPDATE
/// statement guarded by optimistic predicates (expected status, nullability of
/// withdrawal, ownership scope). Concurrency-safe: exactly one concurrent actor
/// wins the transition; losers get rows-affected = 0 and the controller returns
/// HTTP 409 STALE_STATE. Table and column names are compile-time literals from
/// call sites (never user input) and are validated defensively.
/// </summary>
public static class StateTransitions
{
    public static async Task<int> TryUpdateAsync(
        AppDbContext db,
        string entityName,
        string table,
        int id,
        (string Column, object? Value)[] sets,
        params (string Column, WhereOp Op, object? Value)[] conditions)
    {
        GuardIdentifier(entityName, table);
        foreach (var (column, _, _) in conditions) GuardIdentifier(entityName, column);
        foreach (var (column, _) in sets) GuardIdentifier(entityName, column);

        var sql = new System.Text.StringBuilder($"UPDATE {table} SET ");
        var parameters = new List<(string Name, object? Value)> { ("@rowId", id) };

        for (int i = 0; i < sets.Length; i++)
        {
            if (i > 0) sql.Append(", ");
            var p = $"@s{i}";
            sql.Append($"{sets[i].Column} = {p}");
            parameters.Add((p, sets[i].Value ?? DBNull.Value));
        }

        sql.Append(" WHERE Id = @rowId");
        for (int i = 0; i < conditions.Length; i++)
        {
            var (column, op, value) = conditions[i];
            switch (op)
            {
                case WhereOp.IsNull:
                    sql.Append($" AND {column} IS NULL");
                    break;
                case WhereOp.IsNotNull:
                    sql.Append($" AND {column} IS NOT NULL");
                    break;
                default:
                    var p = $"@c{i}";
                    sql.Append($" AND {column} = {p}");
                    parameters.Add((p, value ?? DBNull.Value));
                    break;
            }
        }

        var connection = db.Database.GetDbConnection();
        var wasClosed = connection.State != ConnectionState.Open;
        if (wasClosed) await connection.OpenAsync();

        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = sql.ToString();
            foreach (var (name, value) in parameters)
            {
                var p = command.CreateParameter();
                p.ParameterName = name;
                p.Value = value ?? DBNull.Value;
                // Use datetime2 (not legacy datetime) so DateTime values keep full
                // precision; call sites re-query rows by exact timestamp equality.
                if (p.Value is DateTime) p.DbType = DbType.DateTime2;
                command.Parameters.Add(p);
            }
            return await command.ExecuteNonQueryAsync();
        }
        finally
        {
            if (wasClosed) await connection.CloseAsync();
        }
    }

    public static async Task<int> TryUpdateBatchAsync(
        AppDbContext db,
        string entityName,
        string table,
        IEnumerable<int> ids,
        (string Column, object? Value)[] sets,
        params (string Column, WhereOp Op, object? Value)[] conditions)
    {
        var idList = ids.Distinct().ToArray();
        if (idList.Length == 0) return 0;

        GuardIdentifier(entityName, table);
        foreach (var (column, _, _) in conditions) GuardIdentifier(entityName, column);
        foreach (var (column, _) in sets) GuardIdentifier(entityName, column);

        var sql = new System.Text.StringBuilder($"UPDATE {table} SET ");
        var parameters = new List<(string Name, object? Value)>();

        for (int i = 0; i < sets.Length; i++)
        {
            if (i > 0) sql.Append(", ");
            var p = $"@s{i}";
            sql.Append($"{sets[i].Column} = {p}");
            parameters.Add((p, sets[i].Value ?? DBNull.Value));
        }

        sql.Append(" WHERE ").Append(string.Join(" OR ", idList.Select((_, i) => $"Id = @id{i}")));
        for (int i = 0; i < idList.Length; i++) parameters.Add(($"@id{i}", idList[i]));

        for (int i = 0; i < conditions.Length; i++)
        {
            var (column, op, value) = conditions[i];
            switch (op)
            {
                case WhereOp.IsNull:
                    sql.Append($" AND {column} IS NULL");
                    break;
                case WhereOp.IsNotNull:
                    sql.Append($" AND {column} IS NOT NULL");
                    break;
                default:
                    var p = $"@c{i}";
                    sql.Append($" AND {column} = {p}");
                    parameters.Add((p, value ?? DBNull.Value));
                    break;
            }
        }

        var connection = db.Database.GetDbConnection();
        var wasClosed = connection.State != ConnectionState.Open;
        if (wasClosed) await connection.OpenAsync();

        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = sql.ToString();
            foreach (var (name, value) in parameters)
            {
                var p = command.CreateParameter();
                p.ParameterName = name;
                p.Value = value ?? DBNull.Value;
                if (p.Value is DateTime) p.DbType = DbType.DateTime2;
                command.Parameters.Add(p);
            }
            return await command.ExecuteNonQueryAsync();
        }
        finally
        {
            if (wasClosed) await connection.CloseAsync();
        }
    }

    private static void GuardIdentifier(string entityName, string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier) ||
            identifier.Any(ch => !char.IsLetterOrDigit(ch) && ch != '_'))
        {
            throw new InvalidOperationException($"Unsafe {entityName} identifier '{identifier}'");
        }
    }
}