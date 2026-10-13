namespace InternSystem.Core.Entities;

public class InternStatusHistory
{
    public long Id { get; set; }
    public long InternId { get; set; }
    public InternshipStatus Status { get; set; }
    public DateTime FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public long? ChangedByUserId { get; set; }
    public string? Reason { get; set; }
}
