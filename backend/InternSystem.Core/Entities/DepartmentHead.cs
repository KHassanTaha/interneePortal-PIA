namespace InternSystem.Core.Entities;

public class DepartmentHead
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Designation { get; set; } = string.Empty;
    public string? SignatureImagePath { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}