namespace InternSystem.Core.Entities;

public class MentorTransferRequest
{
    public int Id { get; set; }
    public int MentorId { get; set; }
    public Mentor Mentor { get; set; } = null!;

    public int FromDepartmentId { get; set; }
    public Department FromDepartment { get; set; } = null!;

    public int ToDepartmentId { get; set; }
    public Department ToDepartment { get; set; } = null!;

    public MentorTransferStatus Status { get; set; } = MentorTransferStatus.Pending;

    public int InitiatedByAdminId { get; set; }
    public User? InitiatedByAdmin { get; set; }

    public int? RespondedByMentorId { get; set; }
    public User? RespondedByMentor { get; set; }

    public int? FinalisedByAdminId { get; set; }
    public User? FinalisedByAdmin { get; set; }

    public string? MentorNote { get; set; }
    public string? AdminNote { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime? RespondedAt { get; set; }
    public DateTime? FinalisedAt { get; set; }
}
