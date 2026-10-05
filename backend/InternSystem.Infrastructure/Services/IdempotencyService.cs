using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.Infrastructure.Services;

/// <summary>
/// Stores and replays responses for idempotent write requests. A retried
/// Idempotency-Key (replay of an offline-queued action) returns the original
/// stored response instead of re-executing the mutation. Expired records are
/// pruned opportunistically on save. Retention: 7 days.
/// </summary>
public class IdempotencyService
{
    private readonly AppDbContext _db;

    public IdempotencyService(AppDbContext db) => _db = db;

    public async Task<IdempotencyRecord?> FindReplayAsync(int userId, string key)
    {
        return await _db.IdempotencyRecords.AsNoTracking()
            .Where(r => r.UserId == userId && r.Key == key && r.ExpiresAt > DateTime.UtcNow)
            .FirstOrDefaultAsync();
    }

    public async Task SaveAsync(int userId, string method, string path, string key, int statusCode, string? responseBody)
    {
        if (key.Length > 64)
        {
            // Oversized keys (spec-abuse) are not cached; the request still executes.
            return;
        }

        await _db.IdempotencyRecords
            .Where(r => r.UserId == userId && r.ExpiresAt <= DateTime.UtcNow)
            .ExecuteDeleteAsync();

        _db.IdempotencyRecords.Add(new IdempotencyRecord
        {
            UserId = userId,
            Key = key,
            Method = method,
            Path = path,
            StatusCode = statusCode,
            ResponseBody = responseBody,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(7)
        });

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // A concurrent duplicate for the same key slipped through the read gate;
            // the unique index keeps the FIRST response, which is the correct replay.
        }
    }
}