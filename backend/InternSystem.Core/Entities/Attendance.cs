namespace InternSystem.Core.Entities;

public enum AttendanceStatus
{
    Present,
    Absent,
    PendingReview  // Face check failed 3 times
}

public enum AttendanceSlotStatus
{
    Pending,   // No check-in/check-out recorded
    OnTime,
    Early,
    Late,
    Absent,
    OnLeave
}

public class Attendance
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;

    public DateTime Timestamp { get; set; } = DateTime.Now;
    public DateTime? OutTime { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public bool IsInRange { get; set; }
    public double DistanceMeters { get; set; }

    public bool FaceVerified { get; set; }
    public double FaceConfidence { get; set; }
    public bool LivenessVerified { get; set; }
    public bool LocationVerified { get; set; }
    public double? GpsAccuracy { get; set; }
    public int? VerificationSessionId { get; set; }

    /// <summary>Relative path of the check-in selfie captured during attendance verification.</summary>
    public string? CheckInPhotoPath { get; set; }
    /// <summary>Relative path of the check-out selfie captured during checkout verification.</summary>
    public string? CheckOutPhotoPath { get; set; }

    public AttendanceStatus Status { get; set; }

    // Arrival / departure dimensions (scoring)
    public AttendanceSlotStatus ArrivalStatus { get; set; } = AttendanceSlotStatus.Pending;
    public AttendanceSlotStatus DepartureStatus { get; set; } = AttendanceSlotStatus.Pending;
    public bool IsOnLeave { get; set; }

    public string? Notes { get; set; }
}
