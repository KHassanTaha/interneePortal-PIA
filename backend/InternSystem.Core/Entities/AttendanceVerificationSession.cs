using System;

namespace InternSystem.Core.Entities;

public enum VerificationSessionStatus
{
    Created,
    FaceVerified,
    LocationVerified,
    Completed,
    Expired,
    Failed
}

public class AttendanceVerificationSession
{
    public int Id { get; set; }
    public Guid SessionGuid { get; set; } = Guid.NewGuid();
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;
    public int DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime ExpiresAt { get; set; } = DateTime.Now.AddMinutes(5);

    public VerificationSessionStatus Status { get; set; } = VerificationSessionStatus.Created;
    public bool LocationVerified { get; set; }
    public bool LivenessVerified { get; set; }
    public bool FaceVerified { get; set; }
    public double? FaceConfidence { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? GpsAccuracy { get; set; }
    public double? DistanceFromDepartment { get; set; }
    public string? FailureReason { get; set; }
    public DateTime? CompletedAt { get; set; }

    /// <summary>JSON array of issued liveness challenges: [{id,label}] in the order the intern must perform them.</summary>
    public string? IssuedChallenges { get; set; }

    /// <summary>Relative path of the live selfie that passed face verification for this session.</summary>
    public string? VerificationPhotoPath { get; set; }
}
