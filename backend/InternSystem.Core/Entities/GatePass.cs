namespace InternSystem.Core.Entities;

public enum DocumentRequestStatus
{
    Pending,
    Approved,
    Rejected
}

public enum DocumentType
{
    GatePass,
    IdCard,
    InternshipLetter
}

public class GatePass
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;

    // Uploaded by intern
    public string? StudentIdImagePath { get; set; }
    public string? CnicImagePath { get; set; }

    // Mentor approval
    public DocumentRequestStatus Status { get; set; } = DocumentRequestStatus.Pending;
    public int? ApprovedByMentorId { get; set; }
    public Mentor? ApprovedByMentor { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? RejectionReason { get; set; }

    // Generated PDF
    public string? PdfPath { get; set; }

    public DateTime RequestedAt { get; set; } = DateTime.Now;
}

public class IdCardRequest
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;

    public string? StudentIdImagePath { get; set; }
    public string? CnicImagePath { get; set; }
    public string? PhotoImagePath { get; set; }

    public DocumentRequestStatus Status { get; set; } = DocumentRequestStatus.Pending;
    public int? ApprovedByMentorId { get; set; }
    public Mentor? ApprovedByMentor { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? RejectionReason { get; set; }
    public string? PdfPath { get; set; }

    public DateTime RequestedAt { get; set; } = DateTime.Now;
}
