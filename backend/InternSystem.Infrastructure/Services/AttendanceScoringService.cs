using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.Infrastructure.Services;

public class AttendanceScoreResult
{
    public double Percentage { get; set; }
    public double TotalScore { get; set; }
    public double MaxScore { get; set; }
    public int TotalDays { get; set; }
    public int LeaveUsed { get; set; }
    public int AllowedLeaveDays { get; set; }
}

/// <summary>
/// Computes arrival/departure slot status from shift times and grades attendance.
/// Weekends and public holidays score full marks.
/// </summary>
public class AttendanceScoringService
{
    private readonly AppDbContext _db;

    public AttendanceScoringService(AppDbContext db)
    {
        _db = db;
    }

    public static AttendanceSlotStatus ArrivalStatus(DateTime checkIn, TimeSpan shiftStart, int graceMinutes)
    {
        var grace = TimeSpan.FromMinutes(graceMinutes);
        if (checkIn.TimeOfDay < shiftStart - grace) return AttendanceSlotStatus.Early;
        if (checkIn.TimeOfDay > shiftStart + grace) return AttendanceSlotStatus.Late;
        return AttendanceSlotStatus.OnTime;
    }

    public static AttendanceSlotStatus DepartureStatus(DateTime? checkOut, TimeSpan shiftEnd, int graceMinutes)
    {
        if (checkOut == null) return AttendanceSlotStatus.Pending;
        var grace = TimeSpan.FromMinutes(graceMinutes);
        if (checkOut.Value.TimeOfDay < shiftEnd - grace) return AttendanceSlotStatus.Early;
        if (checkOut.Value.TimeOfDay > shiftEnd + grace) return AttendanceSlotStatus.Late;
        return AttendanceSlotStatus.OnTime;
    }

    public static double ArrivalScore(AttendanceSlotStatus s) => s switch
    {
        AttendanceSlotStatus.OnTime => 1.0,
        AttendanceSlotStatus.Early => 1.0,
        AttendanceSlotStatus.Late => 0.5,
        _ => 0.0
    };

    public static double DepartureScore(AttendanceSlotStatus s) => s switch
    {
        AttendanceSlotStatus.OnTime => 1.0,
        AttendanceSlotStatus.Late => 1.0,
        AttendanceSlotStatus.Early => 0.5,
        _ => 0.0
    };

    /// <summary>
    /// Weighted attendance percentage for an intern over [from, to] (defaults to StartDate..EndDate).
    /// Every calendar day in range counts toward the denominator; weekend &amp; public-holiday days
    /// score full marks (2.0). Absent/leave days score 0.
    /// </summary>
    public async Task<AttendanceScoreResult> ComputeAsync(int internId, DateTime? from = null, DateTime? to = null)
    {
        var intern = await _db.Interns
            .Include(i => i.Department)
            .FirstOrDefaultAsync(i => i.Id == internId);

        var start = (from ?? intern?.StartDate ?? DateTime.Today).Date;
        var end = (to ?? intern?.EndDate ?? DateTime.Today).Date;
        if (end < start) { var t = start; start = end; end = t; }

        var (shiftStart, shiftEnd, grace) = await GetShiftTimesAsync(internId);
        var allowedLeaveDays = await _db.AttendanceSettings
            .Where(s => s.Id == 1)
            .Select(s => (int?)s.AllowedLeaveDays)
            .FirstOrDefaultAsync() ?? 0;

        var holidays = await _db.PublicHolidays
            .Where(h => h.Date >= DateOnly.FromDateTime(start) && h.Date <= DateOnly.FromDateTime(end))
            .Select(h => h.Date)
            .ToListAsync();

        var rows = await _db.Attendances
            .Where(a => a.InternId == internId && a.Timestamp.Date >= start && a.Timestamp.Date <= end)
            .ToListAsync();

        var rowsByDate = rows.ToDictionary(r => r.Timestamp.Date);

        double totalScore = 0;
        int totalDays = 0;
        int leaveUsed = 0;

        for (var day = start; day <= end; day = day.AddDays(1))
        {
            totalDays++;
            if (day.DayOfWeek == DayOfWeek.Saturday || day.DayOfWeek == DayOfWeek.Sunday ||
                holidays.Contains(DateOnly.FromDateTime(day)))
            {
                totalScore += 2.0;
                continue;
            }

            if (rowsByDate.TryGetValue(day, out var leaveRow) && leaveRow.IsOnLeave)
            {
                // Configurable leave provision: up to AllowedLeaveDays score full (2.0).
                if (leaveUsed < allowedLeaveDays)
                {
                    totalScore += 2.0;
                    leaveUsed++;
                }
                continue;
            }

            if (!rowsByDate.TryGetValue(day, out var row))
                continue;

            double score = 0;

            AttendanceSlotStatus arr;
            if (row.ArrivalStatus == AttendanceSlotStatus.Pending)
                arr = AttendanceScoringService.ArrivalStatus(row.Timestamp, shiftStart, grace);
            else
                arr = row.ArrivalStatus;

            AttendanceSlotStatus dep;
            if (row.DepartureStatus == AttendanceSlotStatus.Pending)
                dep = AttendanceScoringService.DepartureStatus(row.OutTime, shiftEnd, grace);
            else
                dep = row.DepartureStatus;

            score += AttendanceScoringService.ArrivalScore(arr);
            score += AttendanceScoringService.DepartureScore(dep);
            totalScore += score;
        }

        var maxScore = 2.0 * totalDays;
        var percentage = maxScore <= 0 ? 0 : Math.Round(totalScore / maxScore * 100.0, 1);

        return new AttendanceScoreResult
        {
            Percentage = percentage,
            TotalScore = totalScore,
            MaxScore = maxScore,
            TotalDays = totalDays,
            LeaveUsed = leaveUsed,
            AllowedLeaveDays = allowedLeaveDays
        };
    }

    /// <summary>
    /// Resolves the intern's shift times (explicit shift, else the default Morning company
    /// shift) together with the configured grace window.
    /// </summary>
    public async Task<(TimeSpan Start, TimeSpan End, int GraceMinutes)> GetShiftTimesAsync(int internId)
    {
        var grace = await _db.AttendanceSettings
            .Where(s => s.Id == 1)
            .Select(s => (int?)s.GraceMinutes)
            .FirstOrDefaultAsync() ?? 15;

        var shiftId = await _db.Interns
            .Where(i => i.Id == internId)
            .Select(i => (int?)i.ShiftId)
            .FirstOrDefaultAsync();

        TimeSpan? start = null, end = null;
        if (shiftId.HasValue)
        {
            var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.Id == shiftId.Value);
            if (shift != null) { start = shift.StartTime; end = shift.EndTime; }
        }

        if (start == null || end == null)
        {
            var morning = await _db.Shifts
                .Where(s => s.IsCompanyWide && s.Name == "Morning")
                .Select(s => new { s.StartTime, s.EndTime })
                .FirstOrDefaultAsync();
            start = morning?.StartTime ?? new TimeSpan(9, 0, 0);
            end = morning?.EndTime ?? new TimeSpan(17, 0, 0);
        }

        return (start.Value, end.Value, grace);
    }

    public async Task<AttendanceSettings> GetSettingsRowAsync()
    {
        return await _db.AttendanceSettings.FirstOrDefaultAsync(x => x.Id == 1)
            ?? new AttendanceSettings { Id = 1, GraceMinutes = 15, ThresholdPct = 80, AllowedLeaveDays = 0, TaskThresholdPct = 80, SignatureRequired = false };
    }

    public async Task<(double GraceMinutes, double ThresholdPct)> GetSettingsAsync()
    {
        var s = await GetSettingsRowAsync();
        return (s.GraceMinutes, s.ThresholdPct);
    }

    /// <summary>
    /// Task completion percentage = completed tasks / total assigned tasks.
    /// </summary>
    public async Task<(double Percentage, int Completed, int Total)> ComputeTaskCompletionAsync(int internId)
    {
        var total = await _db.Tasks.CountAsync(t => t.InternId == internId);
        if (total == 0) return (0, 0, 0);
        var completed = await _db.Tasks.CountAsync(t => t.InternId == internId && t.Status == Core.Entities.TaskStatus.Completed);
        return (Math.Round(completed * 100.0 / total, 1), completed, total);
    }

    public async Task<(double GraceMinutes, double ThresholdPct, double TaskThresholdPct, bool SignatureRequired)> GetFullSettingsAsync()
    {
        var s = await GetSettingsRowAsync();
        return (s.GraceMinutes, s.ThresholdPct, s.TaskThresholdPct, s.SignatureRequired);
    }
}