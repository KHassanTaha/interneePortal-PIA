namespace InternSystem.Core.Entities;

public class DepartmentHead
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Designation { get; set; } = string.Empty;
    public string? SignatureImagePath { get; set; }
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
    public int? MentorId { get; set; }
    public Mentor? Mentor { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}