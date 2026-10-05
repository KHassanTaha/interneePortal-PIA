namespace InternSystem.Core.Entities;

public class AttendanceSettings
{
    // Single-row configuration (always Id = 1)
    public int Id { get; set; }
    public int GraceMinutes { get; set; } = 15;
    public double ThresholdPct { get; set; } = 80;
    public int AllowedLeaveDays { get; set; } = 0;
    public double TaskThresholdPct { get; set; } = 80;
    public bool SignatureRequired { get; set; } = false;
}