namespace InternSystem.Core.Entities;

public enum NotificationType
{
    General,
    Attendance,
    Transfer,
    ShiftChange,
    Document,
    Certificate,
    FaceEnrollment,
    PasswordReset,
    MentorAssignment,
    Task,
    Leave
}

public class Notification
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public NotificationType Type { get; set; } = NotificationType.General;
    public string? EntityType { get; set; }
    public int? EntityId { get; set; }
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}