namespace InternSystem.Core.Entities;

/// <summary>
/// Ledger of already-executed write requests, keyed per user + Idempotency-Key.
/// Lets offline clients retry a write safely: a duplicate key replays the stored
/// response instead of re-running the mutation. Rows expire after ~7 days.
/// </summary>
public class IdempotencyRecord
{
    public long Id { get; set; }
    public int UserId { get; set; }
    public string Key { get; set; } = "";
    public string Method { get; set; } = "";
    public string Path { get; set; } = "";
    public int StatusCode { get; set; }
    public string? ResponseBody { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
}