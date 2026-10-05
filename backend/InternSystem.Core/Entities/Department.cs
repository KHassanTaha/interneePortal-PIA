namespace InternSystem.Core.Entities;

public class Department
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty; // e.g., "ERP", "CYBER"
    public string? Address { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? RadiusMeters { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public bool IsActive { get; set; } = true;

    public ICollection<Intern> Interns { get; set; } = new List<Intern>();
    public ICollection<Mentor> Mentors { get; set; } = new List<Mentor>();
}
