namespace InternSystem.Core.Entities;

public enum TaskStatus
{
    Pending,
    InProgress,
    Completed,
    Overdue
}

public class InternTask
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;
    public int AssignedByMentorId { get; set; }
    public Mentor AssignedByMentor { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime? Deadline { get; set; }
    public TaskStatus Status { get; set; } = TaskStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime? CompletedAt { get; set; }
}
