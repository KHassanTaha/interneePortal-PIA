namespace InternSystem.Core.Entities;

public class FaceEnrollmentRecord
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;
    public string Status { get; set; } = FaceEnrollmentStatus.NotEnrolled.ToString();
    public DateTime EnrolledAt { get; set; } = DateTime.Now;

    /// <summary>Relative path of the selfie captured during this enrollment attempt.</summary>
    public string? PhotoPath { get; set; }

    /// <summary>Relative path of the 256px thumbnail generated from PhotoPath (avatars/list rows).</summary>
    public string? PhotoThumbPath { get; set; }
}
