namespace InternSystem.Core.Entities;

public enum ActivityLogType
{
    InternCreated,
    MentorCreated,
    AttendanceMarked,
    GatePassRequested,
    GatePassApproved,
    GatePassRejected,
    IdCardRequested,
    IdCardApproved,
    IdCardRejected,
    CertificateApplied,
    CertificateApproved,
    CertificateRejected,
    TaskAssigned,
    TaskCompleted,
    PasswordReset,
    Login,
    Logout,
    DocumentUploaded,
    DocumentApproved,
    DocumentRejected,
    DocumentWithdrawn,
    DocumentDeleted
}

public class ActivityLog
{
    public int Id { get; set; }
    public ActivityLogType LogType { get; set; }
    public string Description { get; set; } = string.Empty;

    // Who performed the action
    public int? PerformedByUserId { get; set; }
    public User? PerformedByUser { get; set; }

    // Who it was done TO
    public int? TargetInternId { get; set; }
    public Intern? TargetIntern { get; set; }

    // Department context (for filtering)
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? Metadata { get; set; } // JSON for extra data
}
