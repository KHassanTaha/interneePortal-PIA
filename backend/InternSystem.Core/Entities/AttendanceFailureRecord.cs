namespace InternSystem.Core.Entities;

public class AttendanceFailureRecord
{
    public long Id { get; set; }
    public long InternId { get; set; }
    public long? PeriodId { get; set; }
    public string ReasonCode { get; set; } = string.Empty;
    public DateTime AttemptedAt { get; set; } = DateTime.Now;
    public string? ImagePath { get; set; }
    public double? AttemptedLatitude { get; set; }
    public double? AttemptedLongitude { get; set; }
    public string? DeviceIdHash { get; set; }
    public string? AdditionalContext { get; set; }
    public DateTime? ClearedAt { get; set; }
    public long? ClearedByUserId { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public DateTime? PurgeAfter { get; set; }

    public Intern? Intern { get; set; }
}
