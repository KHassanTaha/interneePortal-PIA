namespace InternSystem.Core.Entities;

public enum LeaveStatus
{
    Pending,
    Approved,
    Rejected
}

public class LeaveApplication
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;

    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string Reason { get; set; } = string.Empty;

    public LeaveStatus Status { get; set; } = LeaveStatus.Pending;
    public DateTime? DecidedAt { get; set; }
    public int? DecidedByUserId { get; set; }
    public User? DecidedByUser { get; set; }
    public string? RejectionReason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.Now;
}