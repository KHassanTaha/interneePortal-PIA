namespace InternSystem.Core.Entities;

public enum CertificateStatus
{
    Applied,       // Intern submitted request
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

    // Mentor / Admin
    public CertificateStatus Status { get; set; } = CertificateStatus.Applied;
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

    public DateTime AppliedAt { get; set; } = DateTime.UtcNow;
}
