namespace InternSystem.Core.Entities;

public enum CertificateStatus
{
    Pending,       // Intern submitted request
    UnderReview,   // Mentor reviewing
    Approved,      // Mentor approved, PDF generated
    Rejected
}

public class Certificate
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;

    // Filled by intern when applying
    public string? ProjectName { get; set; }
    public string? ProjectOutcomes { get; set; }
    public string? LanguagesUsed { get; set; }
    public string? AdditionalNotes { get; set; }

    // Mentee-selected highlight task (must be a completed, mentor-assigned task)
    public int? HighlightTaskId { get; set; }
    public InternTask? HighlightTask { get; set; }

    // Internship report upload (required), stored on disk when report document approved
    public string? ReportPath { get; set; }

    // Mentor / Admin
    public CertificateStatus Status { get; set; } = CertificateStatus.Pending;
    public int? ApprovedByMentorId { get; set; }
    public Mentor? ApprovedByMentor { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? RejectionReason { get; set; }

    // Generated PDF (on PIA letterhead)
    public string? PdfPath { get; set; }

    // Mentor can override any intern-filled fields
    public string? MentorProjectNotes { get; set; }

    // Filled by mentor at approval (appears on the certificate)
    public string? TechStack { get; set; }
    public string? InternWork { get; set; }
    public string? DepartmentHeadName { get; set; }
    public int? DepartmentHeadId { get; set; }
    public DepartmentHead? DepartmentHead { get; set; }

    public DateTime AppliedAt { get; set; } = DateTime.Now;
}
