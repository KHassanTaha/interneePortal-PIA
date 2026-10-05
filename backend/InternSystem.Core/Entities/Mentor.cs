namespace InternSystem.Core.Entities;

public class Mentor
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public string FullName { get; set; } = string.Empty;
    public string Designation { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public int DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public int? CreatedByAdminId { get; set; }

    public ICollection<Intern> Interns { get; set; } = new List<Intern>();
}
