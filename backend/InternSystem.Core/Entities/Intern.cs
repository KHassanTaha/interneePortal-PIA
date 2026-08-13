namespace InternSystem.Core.Entities;

public enum InternGender
{
    Male,
    Female
}

public class Intern
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public int MentorId { get; set; }
    public Mentor Mentor { get; set; } = null!;
    public int DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    // Personal Info
    public string FullName { get; set; } = string.Empty;
    public string? CNIC { get; set; }
    public string? University { get; set; }
    public string? Degree { get; set; }
    public InternGender? Gender { get; set; }

    // Internship Period
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    // Face Recognition
    public string? FaceEmbeddingJson { get; set; } // Stored as JSON array
    public bool FaceEnrolled { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Attendance> Attendances { get; set; } = new List<Attendance>();
    public ICollection<InternTask> Tasks { get; set; } = new List<InternTask>();
    public ICollection<GatePass> GatePasses { get; set; } = new List<GatePass>();
    public ICollection<Certificate> Certificates { get; set; } = new List<Certificate>();
    public ICollection<ActivityLog> ActivityLogs { get; set; } = new List<ActivityLog>();
}
