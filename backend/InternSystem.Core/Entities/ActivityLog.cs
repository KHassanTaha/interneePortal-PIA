namespace InternSystem.Core.Entities;

public enum ActivityLogType
{
    InternCreated,
    MentorCreated,
    MentorUpdated,
    MentorDeleted,
    AttendanceMarked,
    GatePassRequested,
    GatePassApproved,
    GatePassRejected,
    GatePassDeleted,
    IdCardRequested,
    IdCardApproved,
    IdCardRejected,
    IdCardDeleted,
    CertificateApplied,
    CertificateApproved,
    CertificateRejected,
    CertificateDeleted,
    TaskAssigned,
    TaskCompleted,
    PasswordReset,
    Login,
    Logout,
    DocumentUploaded,
    DocumentApproved,
    DocumentRejected,
    DocumentWithdrawn,
    DocumentDeleted,
    DepartmentHeadCreated,
    DepartmentHeadUpdated,
    DepartmentHeadDeleted,
    InternUpdated,
    DepartmentCreated,
    DepartmentUpdated,
    DepartmentDeleted,
    FaceEnrollmentSubmitted,
    FaceEnrollmentApproved,
    FaceEnrollmentRejected,
    MentorTransferInitiated,
    MentorTransferAccepted,
    MentorTransferRejected,
    MentorTransferFinalised,
    InternTransferInitiated,
    InternTransferAccepted,
    InternTransferRejected,
    InternTransferFinalised,
    InternTransferObjection,
    InternShiftChanged,
    AttendanceEdited,
    SettingsUpdated,
    HolidayAdded,
    HolidayUpdated,
    HolidayDeleted,
    ShiftCreated,
    ShiftUpdated,
    ShiftDeleted,
    LeaveApplied,
    LeaveApproved,
    LeaveRejected,
    DeviceBindingReset
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

    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string? Metadata { get; set; } // JSON for extra data
}
