namespace InternSystem.Core.Entities;

public enum InternShiftChangeStatus
{
    Pending,
    Accepted,
    Rejected
}

public class InternShiftChangeRequest
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;

    public int FromShiftId { get; set; }
    public Shift FromShift { get; set; } = null!;

    public int ToShiftId { get; set; }
    public Shift ToShift { get; set; } = null!;

    public int RequestedByUserId { get; set; }
    public User RequestedByUser { get; set; } = null!;

    public InternShiftChangeStatus Status { get; set; } = InternShiftChangeStatus.Pending;
    public DateTime? InternAcceptedAt { get; set; }
    public string? Notes { get; set; }
    public string? RejectionReason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}