using System.Security.Claims;
using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using InternSystem.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.API.Controllers;

/// <summary>
/// Read-only report endpoints powering the mobile Reports screens (PDF/Excel export
/// happens client-side from these JSON feeds). Scoped by role:
///   Admin  - whole organization (optional department / mentor / date filters)
///   Mentor - own department interns only
///   Intern - own records only
/// </summary>
[ApiController]
public class ReportController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AttendanceScoringService _scoring;
    private readonly ExcelService _excel;
    private readonly PdfService _pdf;

    public ReportController(AppDbContext db, AttendanceScoringService scoring, ExcelService excel, PdfService pdf)
    {
        _db = db; _scoring = scoring; _excel = excel; _pdf = pdf;
    }

    private record SummaryRow(
        int? InternId,
        string? Intern,
        string? Department,
        string? Mentor,
        double AttendancePct,
        int PresentDays,
        double TaskPct,
        int TasksCompleted,
        int TasksTotal,
        DateTime? StartDate = null,
        DateTime? EndDate = null);

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static bool DateWithin(DateTime? ts, DateOnly? from, DateOnly? to)
    {
        if (ts == null) return false;
        var d = DateOnly.FromDateTime(ts.Value);
        return (from == null || d >= from) && (to == null || d <= to);
    }

    // ─── Admin scope ──────────────────────────────────────────────────────────
    [HttpGet("api/admin/reports/attendance")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AdminAttendance([FromQuery] string? from, [FromQuery] string? to, [FromQuery] int? departmentId)
    {
        DateOnly? f = DateOnly.TryParse(from, out var fa) ? fa : null;
        DateOnly? t = DateOnly.TryParse(to, out var tb) ? tb : null;

        var rows = await _db.Attendances
            .Where(a => departmentId == null || a.Intern.DepartmentId == departmentId)
            .Include(a => a.Intern).ThenInclude(i => i.Department)
            .Include(a => a.Intern).ThenInclude(i => i.Shift)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync();

        return Ok(rows
            .Where(a => DateWithin(a.Timestamp, f, t))
            .Select(a => new
            {
                a.Id,
                date = a.Timestamp,
                intern = a.Intern.FullName,
                department = a.Intern.Department?.Name,
                shift = a.Intern.Shift?.Name,
                inTime = a.Timestamp,
                outTime = a.OutTime,
                status = a.Status.ToString(),
                arrival = a.ArrivalStatus.ToString(),
                departure = a.DepartureStatus.ToString(),
                a.IsInRange,
                a.DistanceMeters,
                a.FaceVerified,
                faceConfidence = Math.Round(a.FaceConfidence * 100),
                a.IsOnLeave,
                a.Notes
            }));
    }

    [HttpGet("api/admin/reports/attendance-summary")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AdminAttendanceSummary([FromQuery] string? from, [FromQuery] string? to, [FromQuery] int? departmentId)
    {
        DateOnly? f = DateOnly.TryParse(from, out var fa) ? fa : null;
        DateOnly? t = DateOnly.TryParse(to, out var tb) ? tb : null;

        var interns = await _db.Interns
            .Where(i => departmentId == null || i.DepartmentId == departmentId)
            .Include(i => i.Department)
            .Include(i => i.Mentor)
            .ToListAsync();

        var list = new List<SummaryRow>();
        foreach (var intern in interns)
        {
            var score = await _scoring.ComputeAsync(intern.Id);
            var tasks = await _scoring.ComputeTaskCompletionAsync(intern.Id);
            list.Add(new SummaryRow(
                intern.Id,
                intern.FullName,
                intern.Department?.Name,
                intern.Mentor?.FullName,
                score.Percentage,
                score.TotalDays,
                tasks.Percentage,
                tasks.Completed,
                tasks.Total,
                intern.StartDate,
                intern.EndDate));
        }

        return Ok(list.OrderByDescending(x => x.AttendancePct).Select(x => new
        {
            internId = x.InternId,
            intern = x.Intern,
            department = x.Department,
            mentor = x.Mentor,
            attendancePct = x.AttendancePct,
            presentDays = x.PresentDays,
            taskPct = x.TaskPct,
            tasksCompleted = x.TasksCompleted,
            tasksTotal = x.TasksTotal,
            startDate = x.StartDate,
            endDate = x.EndDate
        }));
    }

    [HttpGet("api/admin/reports/tasks")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AdminTasks([FromQuery] string? status)
    {
        var rows = await _db.Tasks
            .Include(t => t.Intern).ThenInclude(i => i.Department)
            .Include(t => t.AssignedByMentor)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        return Ok(rows
            .Where(t => string.IsNullOrWhiteSpace(status) || t.Status.ToString() == status)
            .Select(t => new
            {
                t.Id,
                t.Title,
                t.Description,
                intern = t.Intern.FullName,
                department = t.Intern.Department?.Name,
                mentor = t.AssignedByMentor.FullName,
                status = t.Status.ToString(),
                t.Deadline,
                t.CreatedAt,
                t.CompletedAt
            }));
    }

    [HttpGet("api/admin/reports/interns")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AdminInterns()
    {
        var rows = await _db.Interns
            .Include(i => i.Department)
            .Include(i => i.Mentor)
            .Include(i => i.User)
            .OrderBy(i => i.FullName)
            .ToListAsync();

        return Ok(rows.Select(i => new
        {
            id = i.Id,
            i.FullName,
            department = i.Department?.Name,
            mentor = i.Mentor?.FullName,
            active = i.User.IsActive,
            gender = i.Gender?.ToString(),
            i.StartDate,
            i.EndDate,
            hasFace = i.FaceEnrollmentStatus.ToString()
        }));
    }

    [HttpGet("api/admin/reports/transfers")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AdminTransfers([FromQuery] string? status)
    {
        var rows = await _db.InternTransferRequests
            .Include(t => t.Intern)
            .Include(t => t.FromMentor)
            .Include(t => t.ToMentor)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        return Ok(rows
            .Where(t => string.IsNullOrWhiteSpace(status) || t.Status.ToString() == status)
            .Select(t => new
            {
                t.Id,
                intern = t.Intern.FullName,
                fromMentor = t.FromMentor.FullName,
                toMentor = t.ToMentor.FullName,
                initiatedBy = t.InitiatedBy.ToString(),
                status = t.Status.ToString(),
                t.CreatedAt,
                t.EndorsedAt,
                t.InternAcceptedAt,
                t.FinalisedAt,
                t.Notes,
                t.RejectionReason
            }));
    }

    [HttpGet("api/admin/reports/shifts")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AdminShifts()
    {
        var rows = await _db.Shifts
            .Include(s => s.Department)
            .OrderBy(s => s.Name)
            .ToListAsync();

        return Ok(rows.Select(s => new
        {
            s.Id,
            s.Name,
            s.StartTime,
            s.EndTime,
            scope = s.IsCompanyWide ? "Company" : s.Department?.Name ?? "Department",
            s.IsActive,
            internCount = _db.Interns.Count(i => i.ShiftId == s.Id)
        }));
    }

    // ─── Mentor scope ─────────────────────────────────────────────────────────
    [HttpGet("api/mentor/reports/attendance")]
    [Authorize(Roles = "Mentor,Admin")]
    public async Task<IActionResult> MentorAttendance([FromQuery] string? from, [FromQuery] string? to)
    {
        var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.UserId == CurrentUserId);
        DateOnly? f = DateOnly.TryParse(from, out var fa) ? fa : null;
        DateOnly? t = DateOnly.TryParse(to, out var tb) ? tb : null;

        if (mentor == null) return Ok(Array.Empty<object>());

        var internIds = await _db.Interns.Where(i => i.MentorId == mentor.Id).Select(i => i.Id).ToListAsync();
        var rows = await _db.Attendances
            .Where(a => internIds.Contains(a.InternId))
            .Include(a => a.Intern)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync();

        return Ok(rows
            .Where(a => DateWithin(a.Timestamp, f, t))
            .Select(a => new
            {
                a.Id,
                date = a.Timestamp,
                intern = a.Intern.FullName,
                inTime = a.Timestamp,
                outTime = a.OutTime,
                status = a.Status.ToString(),
                arrival = a.ArrivalStatus.ToString(),
                departure = a.DepartureStatus.ToString(),
                a.IsInRange,
                a.DistanceMeters,
                a.FaceVerified,
                faceConfidence = Math.Round(a.FaceConfidence * 100),
                a.IsOnLeave,
                a.Notes
            }));
    }

    [HttpGet("api/mentor/reports/tasks")]
    [Authorize(Roles = "Mentor,Admin")]
    public async Task<IActionResult> MentorTasks([FromQuery] string? status)
    {
        var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.UserId == CurrentUserId);
        if (mentor == null) return Ok(Array.Empty<object>());
        var rows = await _db.Tasks
            .Where(t => t.Intern.MentorId == mentor.Id)
            .Include(t => t.Intern)
            .Include(t => t.AssignedByMentor)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        return Ok(rows
            .Where(t => string.IsNullOrWhiteSpace(status) || t.Status.ToString() == status)
            .Select(t => new
            {
                t.Id,
                t.Title,
                intern = t.Intern.FullName,
                mentor = t.AssignedByMentor.FullName,
                status = t.Status.ToString(),
                t.Deadline,
                t.CreatedAt,
                t.CompletedAt
            }));
    }

    [HttpGet("api/mentor/reports/summary")]
    [Authorize(Roles = "Mentor,Admin")]
    public async Task<IActionResult> MentorSummary()
    {
        var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.UserId == CurrentUserId);
        if (mentor == null) return Ok(Array.Empty<object>());
        var interns = await _db.Interns
            .Where(i => i.MentorId == mentor.Id)
            .Include(i => i.Department)
            .ToListAsync();

        var list = new List<object>();
        foreach (var intern in interns)
        {
            var score = await _scoring.ComputeAsync(intern.Id);
            var tasks = await _scoring.ComputeTaskCompletionAsync(intern.Id);
            list.Add(new
            {
                intern = intern.FullName,
                department = intern.Department?.Name,
                attendancePct = score.Percentage,
                presentDays = score.TotalDays,
                taskPct = tasks.Percentage,
                tasksCompleted = tasks.Completed,
                tasksTotal = tasks.Total
            });
        }

        return Ok(list);
    }

    // ─── Intern scope ─────────────────────────────────────────────────────────
    [HttpGet("api/intern/reports/attendance")]
    [Authorize(Roles = "Intern")]
    public async Task<IActionResult> InternAttendance([FromQuery] string? from, [FromQuery] string? to)
    {
        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.UserId == CurrentUserId);
        if (intern == null) return NotFound();
        DateOnly? f = DateOnly.TryParse(from, out var fa) ? fa : null;
        DateOnly? t = DateOnly.TryParse(to, out var tb) ? tb : null;

        var rows = await _db.Attendances
            .Where(a => a.InternId == intern.Id)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync();

        return Ok(rows
            .Where(a => DateWithin(a.Timestamp, f, t))
            .Select(a => new
            {
                date = a.Timestamp,
                inTime = a.Timestamp,
                outTime = a.OutTime,
                status = a.Status.ToString(),
                arrival = a.ArrivalStatus.ToString(),
                departure = a.DepartureStatus.ToString(),
                a.IsInRange,
                a.DistanceMeters,
                a.FaceVerified,
                faceConfidence = Math.Round(a.FaceConfidence * 100),
                a.Notes
            }));
    }

    [HttpGet("api/intern/reports/tasks")]
    [Authorize(Roles = "Intern")]
    public async Task<IActionResult> InternTasks()
    {
        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.UserId == CurrentUserId);
        if (intern == null) return NotFound();
        var rows = await _db.Tasks
            .Where(t => t.InternId == intern.Id)
            .Include(t => t.AssignedByMentor)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        return Ok(rows.Select(t => new
        {
            t.Id,
            t.Title,
            t.Description,
            mentor = t.AssignedByMentor.FullName,
            status = t.Status.ToString(),
            t.Deadline,
            t.CreatedAt,
            t.CompletedAt
        }));
    }

    // ─── Excel export ────────────────────────────────────────────────────────
    // Generic .xlsx export mirroring the JSON endpoints above. Dispatches on the
    // same (role, reportKey) split the Reports screen uses; returns the generated
    // file's /files/... URL so the app can download + share it (server-side xlsx,
    // reusing the existing download→share flow).

    [HttpGet("api/{role}/reports/{reportKey}/excel")]
    [Authorize(Roles = "Admin,Mentor,Intern")]
    public async Task<IActionResult> ExportExcel(string role, string reportKey, [FromQuery] string? from, [FromQuery] string? to, [FromQuery] int? departmentId)
    {
        // The URL "role" mirrors the caller's route, but data scope must come from the
        // authenticated claims — never from the client. An intern passing role=admin
        // must be rejected, not escalated.
        var callerRole = User.FindFirstValue(ClaimTypes.Role);
        if (!string.Equals(role, callerRole, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var rows = await GetReportRows(role, reportKey, from, to, departmentId);
        var fileName = $"Report-{reportKey}-{DateTime.Now:yyyyMMdd-HHmmss}";
        var path = _excel.WriteRows(fileName, reportKey, rows);
        return Ok(new { path, url = $"/files/{path}" });
    }

    // ─── PDF export ───────────────────────────────────────────────────────────
    // Server-rendered PDF of the same rows (mobile HTML→PDF renderers are broken
    // under the New Architecture), returned via the /files auth flow like excel.

    [HttpGet("api/{role}/reports/{reportKey}/pdf")]
    [Authorize(Roles = "Admin,Mentor,Intern")]
    public async Task<IActionResult> ExportPdf(string role, string reportKey, [FromQuery] string? from, [FromQuery] string? to, [FromQuery] int? departmentId)
    {
        var callerRole = User.FindFirstValue(ClaimTypes.Role);
        if (!string.Equals(role, callerRole, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var rows = await GetReportRows(role, reportKey, from, to, departmentId);
        var fileName = $"Report-{reportKey}-{DateTime.Now:yyyyMMdd-HHmmss}";
        var generatedBy = User.Identity?.Name ?? "";
        var path = _pdf.WriteReport(fileName, reportKey, rows, generatedBy);
        return Ok(new { path, url = $"/files/{path}" });
    }

    private async Task<IReadOnlyList<IDictionary<string, object?>>> GetReportRows(string role, string reportKey, string? from, string? to, int? departmentId)
    {
        DateOnly? f = DateOnly.TryParse(from, out var fa) ? fa : null;
        DateOnly? t = DateOnly.TryParse(to, out var tb) ? tb : null;

        switch (role)
        {
            case "admin":
                switch (reportKey)
                {
                    case "attendance":
                    {
                        var rows = await _db.Attendances
                            .Where(a => departmentId == null || a.Intern.DepartmentId == departmentId)
                            .Include(a => a.Intern).ThenInclude(i => i.Department)
                            .Include(a => a.Intern).ThenInclude(i => i.Shift)
                            .OrderByDescending(a => a.Timestamp)
                            .ToListAsync();
                        return rows.Where(a => DateWithin(a.Timestamp, f, t)).Select(a => Row(
                            ("date", (object?)a.Timestamp),
                            ("intern", a.Intern.FullName),
                            ("department", a.Intern.Department?.Name),
                            ("shift", a.Intern.Shift?.Name),
                            ("inTime", a.Timestamp),
                            ("outTime", a.OutTime),
                            ("status", a.Status.ToString()),
                            ("arrival", a.ArrivalStatus.ToString()),
                            ("departure", a.DepartureStatus.ToString()),
                            ("isInRange", a.IsInRange),
                            ("distanceMeters", a.DistanceMeters),
                            ("faceVerified", a.FaceVerified),
                            ("faceConfidence", Math.Round(a.FaceConfidence * 100)),
                            ("isOnLeave", a.IsOnLeave),
                            ("notes", a.Notes))).ToList();
                    }
                    case "attendance-summary":
                    {
                        var interns = await _db.Interns
                            .Where(i => departmentId == null || i.DepartmentId == departmentId)
                            .Include(i => i.Department)
                            .Include(i => i.Mentor)
                            .ToListAsync();
                        var list = new List<IDictionary<string, object?>>();
                        foreach (var intern in interns)
                        {
                            var score = await _scoring.ComputeAsync(intern.Id);
                            var tasks = await _scoring.ComputeTaskCompletionAsync(intern.Id);
                            list.Add(Row(
                                ("internId", (object?)intern.Id),
                                ("intern", intern.FullName),
                                ("department", intern.Department?.Name),
                                ("mentor", intern.Mentor?.FullName),
                                ("attendancePct", score.Percentage),
                                ("presentDays", score.TotalDays),
                                ("taskPct", tasks.Percentage),
                                ("tasksCompleted", tasks.Completed),
                                ("tasksTotal", tasks.Total),
                                ("startDate", intern.StartDate),
                                ("endDate", intern.EndDate)));
                        }
                        return list.OrderByDescending(r => r["attendancePct"]).ToList();
                    }
                    case "tasks":
                    {
                        var rows = await _db.Tasks
                            .Include(t => t.Intern).ThenInclude(i => i.Department)
                            .Include(t => t.AssignedByMentor)
                            .OrderByDescending(t => t.CreatedAt)
                            .ToListAsync();
                        return rows.Select(x => Row(
                            ("id", (object?)x.Id),
                            ("title", x.Title),
                            ("description", x.Description),
                            ("intern", x.Intern.FullName),
                            ("department", x.Intern.Department?.Name),
                            ("mentor", x.AssignedByMentor.FullName),
                            ("status", x.Status.ToString()),
                            ("deadline", x.Deadline),
                            ("createdAt", x.CreatedAt),
                            ("completedAt", x.CompletedAt))).ToList();
                    }
                    case "interns":
                    {
                        var rows = await _db.Interns
                            .Include(i => i.Department)
                            .Include(i => i.Mentor)
                            .Include(i => i.User)
                            .OrderBy(i => i.FullName)
                            .ToListAsync();
                        return rows.Select(i => Row(
                            ("id", (object?)i.Id),
                            ("fullName", i.FullName),
                            ("department", i.Department?.Name),
                            ("mentor", i.Mentor?.FullName),
                            ("active", i.User.IsActive),
                            ("gender", i.Gender?.ToString()),
                            ("startDate", i.StartDate),
                            ("endDate", i.EndDate),
                            ("hasFace", i.FaceEnrollmentStatus.ToString()))).ToList();
                    }
                    case "transfers":
                    {
                        var rows = await _db.InternTransferRequests
                            .Include(x => x.Intern)
                            .Include(x => x.FromMentor)
                            .Include(x => x.ToMentor)
                            .OrderByDescending(x => x.CreatedAt)
                            .ToListAsync();
                        return rows.Select(x => Row(
                            ("id", (object?)x.Id),
                            ("intern", x.Intern.FullName),
                            ("fromMentor", x.FromMentor.FullName),
                            ("toMentor", x.ToMentor.FullName),
                            ("initiatedBy", x.InitiatedBy.ToString()),
                            ("status", x.Status.ToString()),
                            ("createdAt", x.CreatedAt),
                            ("endorsedAt", x.EndorsedAt),
                            ("internAcceptedAt", x.InternAcceptedAt),
                            ("finalisedAt", x.FinalisedAt),
                            ("notes", x.Notes),
                            ("rejectionReason", x.RejectionReason))).ToList();
                    }
                    case "shifts":
                    {
                        var rows = await _db.Shifts
                            .Include(s => s.Department)
                            .OrderBy(s => s.Name)
                            .ToListAsync();
                        return rows.Select(s => Row(
                            ("id", (object?)s.Id),
                            ("name", s.Name),
                            ("startTime", s.StartTime),
                            ("endTime", s.EndTime),
                            ("scope", s.IsCompanyWide ? "Company" : s.Department?.Name ?? "Department"),
                            ("isActive", s.IsActive),
                            ("internCount", _db.Interns.Count(i => i.ShiftId == s.Id)))).ToList();
                    }
                }
                break;

            case "mentor":
            {
                var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.UserId == CurrentUserId);
                if (mentor == null) return new List<IDictionary<string, object?>>();
                switch (reportKey)
                {
                    case "attendance":
                    {
                        var internIds = await _db.Interns.Where(i => i.MentorId == mentor.Id).Select(i => i.Id).ToListAsync();
                        var rows = await _db.Attendances
                            .Where(a => internIds.Contains(a.InternId))
                            .Include(a => a.Intern)
                            .OrderByDescending(a => a.Timestamp)
                            .ToListAsync();
                        return rows.Where(a => DateWithin(a.Timestamp, f, t)).Select(a => Row(
                            ("date", (object?)a.Timestamp),
                            ("intern", a.Intern.FullName),
                            ("inTime", a.Timestamp),
                            ("outTime", a.OutTime),
                            ("status", a.Status.ToString()),
                            ("arrival", a.ArrivalStatus.ToString()),
                            ("departure", a.DepartureStatus.ToString()),
                            ("isInRange", a.IsInRange),
                            ("distanceMeters", a.DistanceMeters),
                            ("faceVerified", a.FaceVerified),
                            ("faceConfidence", Math.Round(a.FaceConfidence * 100)),
                            ("isOnLeave", a.IsOnLeave),
                            ("notes", a.Notes))).ToList();
                    }
                    case "tasks":
                    {
                        var rows = await _db.Tasks
                            .Where(t => t.Intern.MentorId == mentor.Id)
                            .Include(t => t.Intern)
                            .Include(t => t.AssignedByMentor)
                            .OrderByDescending(t => t.CreatedAt)
                            .ToListAsync();
                        return rows.Select(x => Row(
                            ("id", (object?)x.Id),
                            ("title", x.Title),
                            ("intern", x.Intern.FullName),
                            ("mentor", x.AssignedByMentor.FullName),
                            ("status", x.Status.ToString()),
                            ("deadline", x.Deadline),
                            ("createdAt", x.CreatedAt),
                            ("completedAt", x.CompletedAt))).ToList();
                    }
                    case "summary":
                    {
                        var interns = await _db.Interns
                            .Where(i => i.MentorId == mentor.Id)
                            .Include(i => i.Department)
                            .ToListAsync();
                        var list = new List<IDictionary<string, object?>>();
                        foreach (var intern in interns)
                        {
                            var score = await _scoring.ComputeAsync(intern.Id);
                            var tasks = await _scoring.ComputeTaskCompletionAsync(intern.Id);
                            list.Add(Row(
                                ("intern", (object?)intern.FullName),
                                ("department", intern.Department?.Name),
                                ("attendancePct", score.Percentage),
                                ("presentDays", score.TotalDays),
                                ("taskPct", tasks.Percentage),
                                ("tasksCompleted", tasks.Completed),
                                ("tasksTotal", tasks.Total)));
                        }
                        return list;
                    }
                    case "transfers":
                    {
                        var rows = await _db.InternTransferRequests
                            .Where(x => x.FromMentorId == mentor.Id || x.ToMentorId == mentor.Id)
                            .Include(x => x.Intern)
                            .Include(x => x.FromMentor)
                            .Include(x => x.ToMentor)
                            .OrderByDescending(x => x.CreatedAt)
                            .ToListAsync();
                        return rows.Select(x => Row(
                            ("id", (object?)x.Id),
                            ("intern", x.Intern.FullName),
                            ("fromMentor", x.FromMentor.FullName),
                            ("toMentor", x.ToMentor.FullName),
                            ("initiatedBy", x.InitiatedBy.ToString()),
                            ("status", x.Status.ToString()),
                            ("createdAt", x.CreatedAt),
                            ("endorsedAt", x.EndorsedAt),
                            ("internAcceptedAt", x.InternAcceptedAt),
                            ("finalisedAt", x.FinalisedAt),
                            ("notes", x.Notes),
                            ("rejectionReason", x.RejectionReason))).ToList();
                    }
                }
                break;
            }

            case "intern":
            {
                var intern = await _db.Interns.FirstOrDefaultAsync(i => i.UserId == CurrentUserId);
                if (intern == null) return new List<IDictionary<string, object?>>();
                switch (reportKey)
                {
                    case "attendance":
                    {
                        var rows = await _db.Attendances
                            .Where(a => a.InternId == intern.Id)
                            .OrderByDescending(a => a.Timestamp)
                            .ToListAsync();
                        return rows.Where(a => DateWithin(a.Timestamp, f, t)).Select(a => Row(
                            ("date", (object?)a.Timestamp),
                            ("inTime", a.Timestamp),
                            ("outTime", a.OutTime),
                            ("status", a.Status.ToString()),
                            ("arrival", a.ArrivalStatus.ToString()),
                            ("departure", a.DepartureStatus.ToString()),
                            ("isInRange", a.IsInRange),
                            ("distanceMeters", a.DistanceMeters),
                            ("faceVerified", a.FaceVerified),
                            ("faceConfidence", Math.Round(a.FaceConfidence * 100)),
                            ("notes", a.Notes))).ToList();
                    }
                    case "tasks":
                    {
                        var rows = await _db.Tasks
                            .Where(t => t.InternId == intern.Id)
                            .Include(t => t.AssignedByMentor)
                            .OrderByDescending(t => t.CreatedAt)
                            .ToListAsync();
                        return rows.Select(x => Row(
                            ("id", (object?)x.Id),
                            ("title", x.Title),
                            ("description", x.Description),
                            ("mentor", x.AssignedByMentor.FullName),
                            ("status", x.Status.ToString()),
                            ("deadline", x.Deadline),
                            ("createdAt", x.CreatedAt),
                            ("completedAt", x.CompletedAt))).ToList();
                    }
                    case "transfers":
                    {
                        var rows = await _db.InternTransferRequests
                            .Where(x => x.InternId == intern.Id)
                            .Include(x => x.FromMentor)
                            .Include(x => x.ToMentor)
                            .OrderByDescending(x => x.CreatedAt)
                            .ToListAsync();
                        return rows.Select(x => Row(
                            ("id", (object?)x.Id),
                            ("fromMentor", x.FromMentor.FullName),
                            ("toMentor", x.ToMentor.FullName),
                            ("initiatedBy", x.InitiatedBy.ToString()),
                            ("status", x.Status.ToString()),
                            ("createdAt", x.CreatedAt),
                            ("endorsedAt", x.EndorsedAt),
                            ("internAcceptedAt", x.InternAcceptedAt),
                            ("finalisedAt", x.FinalisedAt),
                            ("notes", x.Notes),
                            ("rejectionReason", x.RejectionReason))).ToList();
                    }
                }
                break;
            }
        }

        return new List<IDictionary<string, object?>>();
    }

    private static IDictionary<string, object?> Row(params (string Key, object? Value)[] cells)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var c in cells) dict[c.Key] = c.Value;
        return dict;
    }
}