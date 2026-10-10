using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using InternSystem.API.Filters;
using InternSystem.API.Security;
using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using InternSystem.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.API.Controllers;

[ApiController]
[Route("api/mentor")]
[Authorize(Roles = "Mentor,Admin")]
public class MentorController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly FileService _files;
    private readonly PdfService _pdf;
    private readonly GeoFenceService _geo;
    private readonly AttendanceScoringService _scoring;
    private readonly NotificationService _notifications;
    private readonly TransferStateMachine _transfers;
    private readonly EmailService _email;
    private readonly InternSerialService _serials;

    public MentorController(AppDbContext db, FileService files, PdfService pdf, GeoFenceService geo, AttendanceScoringService scoring, NotificationService notifications, TransferStateMachine transfers, EmailService email, InternSerialService serials)
    {
        _db = db; _files = files; _pdf = pdf; _geo = geo; _scoring = scoring; _notifications = notifications; _transfers = transfers;
        _email = email; _serials = serials;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private async Task<Mentor?> GetCurrentMentor() =>
        await _db.Mentors.Include(m => m.Department).FirstOrDefaultAsync(m => m.UserId == CurrentUserId);

    // ─── Dashboard ───────────────────────────────────────────────────────────
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null)
        {
            var globalTodayEnd = DateTime.Today.AddDays(1);
            var globalAttendance = _db.Attendances
                .Where(a => a.Timestamp >= DateTime.Today && a.Timestamp < globalTodayEnd)
                .Select(a => new { a.InternId, a.Status, a.IsOnLeave })
                .ToList();
            return Ok(new
            {
                mentorName = "Admin System",
                department = "Administration",
                totalInterns = await _db.Interns.CountAsync(),
                activeInterns = await _db.Interns.CountAsync(i => i.User.IsActive && i.EndDate > DateTime.Now),
                pendingGatePasses = await _db.GatePasses.CountAsync(g => g.Status == DocumentRequestStatus.Pending),
                pendingCertificates = await _db.Certificates.CountAsync(c => c.Status == CertificateStatus.Pending),
                pendingIdCards = await _db.IdCardRequests.CountAsync(i => i.Status == DocumentRequestStatus.Pending),
                presentToday = globalAttendance.Where(a => a.Status == AttendanceStatus.Present && !a.IsOnLeave).Select(a => a.InternId).Distinct().Count(),
                onLeaveToday = globalAttendance.Where(a => a.IsOnLeave).Select(a => a.InternId).Distinct().Count(),
                overdueTasks = await _db.Tasks.CountAsync(t => t.Status != InternSystem.Core.Entities.TaskStatus.Completed && t.Deadline != null && t.Deadline < globalTodayEnd)
            });
        }

        var interns = await _db.Interns
            .Where(i => i.MentorId == mentor.Id)
            .Include(i => i.User)
            .ToListAsync();

        var activeCount = interns.Count(i => i.User.IsActive && i.EndDate > DateTime.Now);
        var pendingGatePasses = await _db.GatePasses
            .Where(g => g.Intern.MentorId == mentor.Id && g.Status == DocumentRequestStatus.Pending)
            .CountAsync();
        var pendingCertificates = await _db.Certificates
            .Where(c => c.Intern.MentorId == mentor.Id && c.Status == CertificateStatus.Pending)
            .CountAsync();
        var pendingIdCards = await _db.IdCardRequests
            .Where(i => i.Intern.MentorId == mentor.Id && i.Status == DocumentRequestStatus.Pending)
            .CountAsync();

        var internIds = interns.Select(i => i.Id).ToList();
        var today = DateTime.Today;
        var todayStart = today;
        var todayEnd = today.AddDays(1);
        var todaysAttendance = _db.Attendances
            .Where(a => internIds.Contains(a.InternId) && a.Timestamp >= todayStart && a.Timestamp < todayEnd)
            .Select(a => new { a.InternId, a.Status, a.IsOnLeave })
            .ToList();

        var presentToday = todaysAttendance
            .Where(a => a.Status == AttendanceStatus.Present && !a.IsOnLeave)
            .Select(a => a.InternId)
            .Distinct().Count();
        var onLeaveToday = todaysAttendance
            .Where(a => a.IsOnLeave)
            .Select(a => a.InternId)
            .Distinct().Count();
        var overdueTasks = await _db.Tasks
            .CountAsync(t => internIds.Contains(t.InternId) && t.Status != InternSystem.Core.Entities.TaskStatus.Completed && t.Deadline != null && t.Deadline < todayEnd);

        return Ok(new
        {
            mentorName = mentor.FullName,
            department = mentor.Department?.Name,
            totalInterns = interns.Count,
            activeInterns = activeCount,
            pendingGatePasses,
            pendingCertificates,
            pendingIdCards,
            presentToday,
            onLeaveToday,
            overdueTasks
        });
    }

    // ─── Intern Management ───────────────────────────────────────────────────
    [HttpGet("interns")]
    public async Task<IActionResult> GetMyInterns()
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var interns = await _db.Interns
            .Where(i => i.MentorId == mentor.Id)
            .Include(i => i.User)
            .Include(i => i.Department)
            .Include(i => i.Shift)
            .Include(i => i.FaceEnrollmentRecords)
            .Select(i => new
            {
                i.Id, i.FullName, i.CNIC, i.University, i.Degree,
                username = i.User.Username,
                isActive = i.User.IsActive,
                department = i.Department.Name,
                departmentId = i.DepartmentId,
                shift = i.Shift != null ? i.Shift.Name : null,
                shiftId = i.ShiftId,
                i.StartDate, i.EndDate, i.FaceEnrolled,
                photoThumbPath = i.FaceEnrollmentRecords.Where(r => r.PhotoThumbPath != null).OrderByDescending(r => r.EnrolledAt).Select(r => r.PhotoThumbPath).FirstOrDefault(),
                faceEnrollmentStatus = i.FaceEnrollmentStatus.ToString(),
                faceRejectedReason = i.FaceRejectedReason,
                isExpired = DateTime.Now > i.EndDate,
                i.CreatedAt,
                todayAttendance = i.Attendances
                    .Where(a => a.Timestamp.Date == DateTime.Now.Date)
                    .OrderByDescending(a => a.Timestamp)
                    .Select(a => new
                    {
                        a.Id,
                        inTime = a.Timestamp,
                        outTime = a.OutTime,
                        status = a.Status.ToString(),
                        checkInPhotoPath = a.CheckInPhotoPath,
                        checkOutPhotoPath = a.CheckOutPhotoPath
                    })
                    .FirstOrDefault()
            }).ToListAsync();

        return Ok(interns);
    }

    // Peer mentors (for initiating intern transfers) — accessible to mentors.
    [HttpGet("mentors")]
    public async Task<IActionResult> GetPeerMentors([FromQuery] int? departmentId)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var query = _db.Mentors
            .Include(m => m.User)
            .Include(m => m.Department)
            .Where(m => m.Id != mentor.Id);

        if (departmentId.HasValue && departmentId.Value > 0)
            query = query.Where(m => m.DepartmentId == departmentId.Value);

        var mentors = await query
            .Select(m => new
            {
                m.Id,
                m.FullName,
                isActive = m.User.IsActive,
                department = m.Department.Name
            })
            .ToListAsync();

        return Ok(mentors);
    }

    // ─── Intern Detail (docs + attendance + face + eligibility) ─────────────
    [HttpGet("interns/{id}")]
    public async Task<IActionResult> GetInternDetail(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns
            .Include(i => i.User)
            .Include(i => i.Department)
            .Include(i => i.Mentor)
            .Include(i => i.Shift)
            .Include(i => i.FaceEnrollmentRecords)
            .FirstOrDefaultAsync(i => i.Id == id && i.MentorId == mentor.Id);
        if (intern == null) return NotFound();

        var score = await _scoring.ComputeAsync(intern.Id);
        var (_, thresholdPct) = await _scoring.GetSettingsAsync();

        return Ok(new
        {
            intern.Id,
            intern.FullName,
            intern.CNIC,
            intern.University,
            intern.Degree,
            gender = intern.Gender.HasValue ? intern.Gender.Value.ToString() : null,
            username = intern.User.Username,
            isActive = intern.User.IsActive,
            department = intern.Department.Name,
            mentorId = intern.MentorId,
            shift = intern.Shift != null ? new { intern.Shift.Id, intern.Shift.Name, intern.Shift.StartTime, intern.Shift.EndTime } : null,
            intern.StartDate,
            intern.EndDate,
            faceEnrolled = intern.FaceEnrolled,
            faceEnrollmentStatus = intern.FaceEnrollmentStatus.ToString(),
            faceRejectedReason = intern.FaceRejectedReason,
            photoThumbPath = intern.FaceEnrollmentRecords.Where(r => r.PhotoThumbPath != null).OrderByDescending(r => r.EnrolledAt).Select(r => r.PhotoThumbPath).FirstOrDefault(),
            isExpired = DateTime.Now > intern.EndDate,
            attendance = new
            {
                percentage = score.Percentage,
                totalScore = score.TotalScore,
                maxScore = score.MaxScore,
                totalDays = score.TotalDays,
                thresholdPct
            },
            todayAttendance = _db.Attendances
                .Where(a => a.InternId == intern.Id && a.Timestamp.Date == DateTime.Now.Date)
                .OrderByDescending(a => a.Timestamp)
                .Select(a => new
                {
                    a.Id,
                    inTime = a.Timestamp,
                    outTime = a.OutTime,
                    status = a.Status.ToString(),
                    checkInPhotoPath = a.CheckInPhotoPath,
                    checkOutPhotoPath = a.CheckOutPhotoPath
                })
                .FirstOrDefault()
        });
    }

    [HttpGet("interns/{id}/documents")]
    public async Task<IActionResult> GetInternDocuments(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == id && i.MentorId == mentor.Id);
        if (intern == null) return NotFound();

        var uploaded = await _db.DocumentUploads
            .Where(d => d.InternId == id && d.WithdrawnAt == null)
            .OrderByDescending(d => d.UploadedAt)
            .Select(d => new
            {
                d.Id,
                documentType = d.DocumentType.ToString(),
                d.FilePath,
                d.OriginalFileName,
                status = d.Status.ToString(),
                d.RejectionReason,
                d.UploadedAt,
                d.ApprovedAt
            }).ToListAsync();

        var gatePasses = await _db.GatePasses
            .Where(g => g.InternId == id && g.PdfPath != null)
            .Select(g => new { type = "GatePass", id = g.Id, name = "Gate Pass", filePath = g.PdfPath, issuedAt = g.ApprovedAt })
            .ToListAsync();
        var idCards = await _db.IdCardRequests
            .Where(c => c.InternId == id && c.PdfPath != null)
            .Select(c => new { type = "IDCard", id = c.Id, name = "ID Card", filePath = c.PdfPath, issuedAt = c.ApprovedAt })
            .ToListAsync();
        var certificates = await _db.Certificates
            .Where(c => c.InternId == id && c.PdfPath != null)
            .Select(c => new { type = "Certificate", id = c.Id, name = c.ProjectName ?? "Certificate", filePath = c.PdfPath, issuedAt = c.ApprovedAt })
            .ToListAsync();

        return Ok(new { uploaded, issued = gatePasses.Concat(idCards).Concat(certificates).ToList() });
    }

    [HttpPut("interns/{id}")]
    public async Task<IActionResult> UpdateIntern(int id, [FromBody] MentorUpdateInternRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns
            .Include(i => i.User)
            .FirstOrDefaultAsync(i => i.Id == id && i.MentorId == mentor.Id);
        if (intern == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(req.FullName)) intern.FullName = req.FullName.Trim();
        if (req.CNIC != null) intern.CNIC = req.CNIC;
        if (req.University != null) intern.University = req.University;
        if (req.Degree != null) intern.Degree = req.Degree;
        if (req.Gender.HasValue) intern.Gender = req.Gender;
        if (req.StartDate.HasValue)
        {
            if (req.StartDate.Value.Date != intern.StartDate.Date && req.StartDate.Value.Date < DateTime.Today)
                return BadRequest(new { message = "Start date cannot be in the past" });
            intern.StartDate = req.StartDate.Value;
        }
        if (req.EndDate.HasValue) intern.EndDate = req.EndDate.Value;
        if (req.IsActive.HasValue) intern.User.IsActive = req.IsActive.Value;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternUpdated,
            Description = $"Mentor updated intern '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Intern updated" });
    }

    // ─── Face Enrollment Approvals (scoped to mentor's interns) ─────────────
    [HttpGet("face-approvals")]
    public async Task<IActionResult> GetFaceApprovals()
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var interns = await _db.Interns
            .Where(i => i.MentorId == mentor.Id)
            .Include(i => i.User)
            .Include(i => i.Department)
            .Include(i => i.FaceEnrollmentRecords)
            .Where(i => i.FaceEnrollmentStatus != FaceEnrollmentStatus.NotEnrolled)
            .Select(i => new
            {
                i.Id,
                i.FullName,
                username = i.User.Username,
                department = i.Department.Name,
                faceEnrollmentStatus = i.FaceEnrollmentStatus.ToString(),
                faceRejectedReason = i.FaceRejectedReason,
                faceEnrolledAt = i.FaceEnrolledAt,
                photoPath = i.FaceEnrollmentRecords.Where(r => r.PhotoPath != null).OrderByDescending(r => r.EnrolledAt).Select(r => r.PhotoPath).FirstOrDefault() ?? "",
                photoThumbPath = i.FaceEnrollmentRecords.Where(r => r.PhotoThumbPath != null).OrderByDescending(r => r.EnrolledAt).Select(r => r.PhotoThumbPath).FirstOrDefault() ?? "",
                i.StartDate,
                i.EndDate
            })
            .OrderByDescending(i => i.faceEnrolledAt)
            .ToListAsync();

        return Ok(interns);
    }

    [Idempotent]
    [HttpPost("interns/{id}/face/approve")]
    public async Task<IActionResult> ApproveFaceEnrollment(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns
            .AsNoTracking()
            .Include(i => i.Department)
            .FirstOrDefaultAsync(i => i.Id == id && i.MentorId == mentor.Id);
        if (intern == null) return NotFound();

        if (intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Pending || string.IsNullOrEmpty(intern.FaceEmbeddingJson))
            return BadRequest(new { message = "Only pending face enrollments can be approved" });

        var affected = await StateTransitions.TryUpdateAsync(_db, "face enrollment", "Interns", id,
            new (string, object?)[]
            {
                ("FaceEnrollmentStatus", FaceEnrollmentStatus.Approved.ToString()),
                ("FaceEnrolled", true),
                ("FaceApprovedByUserId", CurrentUserId),
                ("FaceEnrolledAt", DateTime.Now),
                ("FaceRejectedReason", (object?)null)
            },
            ("FaceEnrollmentStatus", WhereOp.Equal, FaceEnrollmentStatus.Pending.ToString()),
            ("MentorId", WhereOp.Equal, mentor.Id));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This face enrollment was already decided. Refresh and try again." });

        _db.FaceEnrollmentRecords.Add(new FaceEnrollmentRecord
        {
            InternId = intern.Id,
            Status = FaceEnrollmentStatus.Approved.ToString()
        });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.FaceEnrollmentApproved,
            Description = $"Face enrollment approved for '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(intern.UserId, "Face enrollment approved",
            "Your face enrollment has been approved", NotificationType.FaceEnrollment);
        return Ok(new { message = "Face enrollment approved" });
    }

    [Idempotent]
    [HttpPost("interns/{id}/face/reject")]
    public async Task<IActionResult> RejectFaceEnrollment(int id, [FromBody] RejectRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns
            .AsNoTracking()
            .Include(i => i.Department)
            .FirstOrDefaultAsync(i => i.Id == id && i.MentorId == mentor.Id);
        if (intern == null) return NotFound();

        if (intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Pending)
            return BadRequest(new { message = "Only pending face enrollments can be rejected" });

        var affected = await StateTransitions.TryUpdateAsync(_db, "face enrollment", "Interns", id,
            new (string, object?)[]
            {
                ("FaceEnrollmentStatus", FaceEnrollmentStatus.Rejected.ToString()),
                ("FaceEnrolled", false),
                ("FaceApprovedByUserId", (object?)null),
                ("FaceRejectedReason", req.Reason)
            },
            ("FaceEnrollmentStatus", WhereOp.Equal, FaceEnrollmentStatus.Pending.ToString()),
            ("MentorId", WhereOp.Equal, mentor.Id));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This face enrollment was already decided. Refresh and try again." });

        _db.FaceEnrollmentRecords.Add(new FaceEnrollmentRecord
        {
            InternId = intern.Id,
            Status = FaceEnrollmentStatus.Rejected.ToString()
        });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.FaceEnrollmentRejected,
            Description = $"Face enrollment rejected for '{intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(intern.UserId, "Face enrollment rejected",
            $"Your face enrollment was rejected: {req.Reason}", NotificationType.FaceEnrollment);
        return Ok(new { message = "Face enrollment rejected" });
    }

    [HttpPost("interns/{id}/face/reset")]
    public async Task<IActionResult> ResetFaceEnrollment(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == id && i.MentorId == mentor.Id);
        if (intern == null) return NotFound();

        if (intern.FaceEnrolled || intern.FaceEnrollmentStatus != FaceEnrollmentStatus.NotEnrolled)
        {
            _db.FaceEnrollmentRecords.Add(new FaceEnrollmentRecord
            {
                InternId = intern.Id,
                Status = intern.FaceEnrollmentStatus.ToString(),
                EnrolledAt = intern.FaceEnrolledAt ?? DateTime.Now
            });
        }

        intern.FaceEnrolled = false;
        intern.FaceEnrollmentStatus = FaceEnrollmentStatus.NotEnrolled;
        intern.FaceEnrolledAt = null;
        intern.FaceEmbeddingJson = null;
        intern.FaceApprovedByUserId = null;
        intern.FaceRejectedReason = null;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternUpdated,
            Description = $"Face enrollment reset for '{intern.FullName}' (previous record kept in history)",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Face enrollment reset. Intern must re-enroll." });
    }

    [Idempotent]
    [HttpPost("interns")]
    public async Task<IActionResult> CreateIntern([FromBody] CreateInternRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null)
        {
            mentor = await _db.Mentors.FirstOrDefaultAsync();
            if (mentor == null)
            {
                var defaultDept = await _db.Departments.FirstOrDefaultAsync();
                mentor = new Mentor
                {
                    UserId = CurrentUserId,
                    DepartmentId = defaultDept?.Id ?? 1,
                    FullName = "System Admin",
                    Designation = "Admin",
                    CreatedAt = DateTime.Now
                };
                _db.Mentors.Add(mentor);
                await _db.SaveChangesAsync();
            }
        }

        // CNIC is required on create (D-S30a).
        if (string.IsNullOrWhiteSpace(req.CNIC))
            return BadRequest(new { message = "CNIC is required." });

        if (req.StartDate.Date < DateTime.Today)
            return BadRequest(new { message = "Start date cannot be in the past" });
        if (req.ShiftId.HasValue && !await _db.Shifts.AnyAsync(s => s.Id == req.ShiftId && (s.IsCompanyWide || s.DepartmentId == mentor.DepartmentId)))
            return BadRequest(new { message = "Invalid shift for this department" });

        var createPolicyError = PasswordPolicy.Validate(req.Password);
        if (createPolicyError != null)
            return BadRequest(new { message = createPolicyError });

        string username;
        var internDeptId = (req.DepartmentId.HasValue && req.DepartmentId.Value > 0) ? req.DepartmentId.Value : mentor.DepartmentId;
        string regNo;
        try
        {
            username = await _serials.GenerateUsernameAsync(_db, req.FullName, req.Username, internDeptId);
            regNo = await _serials.GenerateRegNoAsync(_db, internDeptId);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        var user = new User
        {
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = UserRole.Intern,
            IsActive = true,
            MustChangePassword = true,
            CreatedAt = DateTime.Now
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var intern = new Intern
        {
            UserId = user.Id,
            MentorId = mentor.Id,
            DepartmentId = internDeptId,
            ShiftId = req.ShiftId,
            FullName = req.FullName,
            CNIC = req.CNIC,
            RegNo = regNo,
            University = req.University,
            Degree = req.Degree,
            Gender = req.Gender,
            StartDate = req.StartDate,
            EndDate = req.EndDate,
            Latitude = req.OfficeLatitude,
            Longitude = req.OfficeLongitude,
            CreatedAt = DateTime.Now
        };
        _db.Interns.Add(intern);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternCreated,
            Description = $"Created intern '{req.FullName}' ({username})",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId,
            CreatedAt = DateTime.Now
        });

        await _db.SaveChangesAsync();

        if (user.Username.Contains('@'))
        {
            await _email.SendAsync(user.Username, "Your PIA Internship account",
                $"<p>Hello {intern.FullName},</p><p>Your intern account has been created.</p>" +
                $"<p>Username: <b>{user.Username}</b></p>" +
                "<p>A temporary password was set for you. Ask your mentor for it and change it after your first login.</p>");
        }

        return Ok(new { message = "Intern account created", internId = intern.Id, username = user.Username });
    }

    [HttpPatch("interns/{internId}/reset-password")]
    public async Task<IActionResult> ResetInternPassword(int internId, [FromBody] MentorResetPasswordRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns.Include(i => i.User)
            .FirstOrDefaultAsync(i => i.Id == internId && i.MentorId == mentor.Id);
        if (intern == null) return NotFound();

        var resetPolicyError = PasswordPolicy.Validate(req.NewPassword);
        if (resetPolicyError != null)
            return BadRequest(new { message = resetPolicyError });

        intern.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        intern.User.MustChangePassword = true;
        intern.User.TokenVersion++;
        intern.User.RefreshToken = null;
        intern.User.RefreshTokenExpiry = null;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.PasswordReset,
            Description = $"Mentor reset password for intern '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(intern.UserId, "Password reset",
            "Your password was reset by your mentor", NotificationType.PasswordReset);
        return Ok(new { message = "Password reset successfully" });
    }

    // ─── Attendance View ─────────────────────────────────────────────────────
    [HttpGet("attendance")]
    public async Task<IActionResult> GetAttendance(
        [FromQuery] int? internId,
        [FromQuery] DateTime? date,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var query = _db.Attendances
            .Include(a => a.Intern)
            .Where(a => a.Intern.MentorId == mentor.Id)
            .AsQueryable();

        if (internId.HasValue) query = query.Where(a => a.InternId == internId);
        if (date.HasValue)
        {
            var d = date.Value.Date;
            query = query.Where(a => a.Timestamp.Date == d);
        }
        if (from.HasValue) query = query.Where(a => a.Timestamp >= from);
        if (to.HasValue) query = query.Where(a => a.Timestamp <= to);

        var records = await query
            .OrderByDescending(a => a.Timestamp)
            .Select(a => new
            {
                a.Id,
                internName = a.Intern.FullName,
                a.InternId,
                a.Timestamp,
                a.OutTime,
                a.Latitude,
                a.Longitude,
                a.IsInRange,
                a.DistanceMeters,
                a.FaceVerified,
                a.FaceConfidence,
                a.LivenessVerified,
                a.CheckInPhotoPath,
                a.CheckOutPhotoPath,
                status = a.Status.ToString(),
                arrivalStatus = a.ArrivalStatus.ToString(),
                departureStatus = a.DepartureStatus.ToString(),
                isOnLeave = a.IsOnLeave,
                a.Notes
            }).ToListAsync();

        return Ok(records);
    }

    // ─── Attendance Edit (own interns) ───────────────────────────────────────
    [HttpPut("attendance/{id}")]
    public async Task<IActionResult> UpdateAttendance(int id, [FromBody] MentorUpdateAttendanceRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var attendance = await _db.Attendances
            .Include(a => a.Intern)
            .FirstOrDefaultAsync(a => a.Id == id && a.Intern.MentorId == mentor.Id);
        if (attendance == null) return NotFound();

        attendance.IsOnLeave = req.IsOnLeave ?? attendance.IsOnLeave;
        attendance.Notes = req.Notes ?? attendance.Notes;

        if (req.InTime.HasValue)
        {
            attendance.Timestamp = req.InTime.Value;
            var (shiftStart, _, grace) = await _scoring.GetShiftTimesAsync(attendance.InternId);
            attendance.ArrivalStatus = AttendanceScoringService.ArrivalStatus(req.InTime.Value, shiftStart, grace);
        }
        else if (req.ArrivalStatus.HasValue)
        {
            attendance.ArrivalStatus = req.ArrivalStatus.Value;
        }

        if (req.OutTime.HasValue)
        {
            attendance.OutTime = req.OutTime.Value;
            var (_, shiftEnd, grace) = await _scoring.GetShiftTimesAsync(attendance.InternId);
            attendance.DepartureStatus = AttendanceScoringService.DepartureStatus(req.OutTime.Value, shiftEnd, grace);
        }
        else if (req.DepartureStatus.HasValue)
        {
            attendance.DepartureStatus = req.DepartureStatus.Value;
        }

        if (attendance.ArrivalStatus != AttendanceSlotStatus.Absent && attendance.DepartureStatus != AttendanceSlotStatus.Absent)
        {
            attendance.Status = attendance.IsOnLeave || req.IsOnLeave == true
                ? AttendanceStatus.Absent
                : AttendanceStatus.Present;
        }

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.AttendanceEdited,
            Description = $"Mentor edited attendance for '{attendance.Intern.FullName}' on {attendance.Timestamp:yyyy-MM-dd} (in {attendance.Timestamp:HH:mm} / out {attendance.OutTime:HH:mm})",
            PerformedByUserId = CurrentUserId,
            TargetInternId = attendance.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Attendance updated" });
    }

    // ─── Tasks ───────────────────────────────────────────────────────────────
    [HttpGet("tasks")]
    public async Task<IActionResult> GetTasks([FromQuery] int? internId)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var query = _db.Tasks
            .Include(t => t.Intern)
            .Where(t => t.AssignedByMentorId == mentor.Id)
            .AsQueryable();

        if (internId.HasValue) query = query.Where(t => t.InternId == internId);

        var tasks = await query.OrderByDescending(t => t.CreatedAt).Select(t => new
        {
            t.Id, t.Title, t.Description,
            internName = t.Intern.FullName,
            t.InternId,
            t.Deadline,
            status = t.Status.ToString(),
            t.CreatedAt, t.CompletedAt
        }).ToListAsync();

        return Ok(tasks);
    }

    [HttpPost("tasks")]
    public async Task<IActionResult> AssignTask([FromBody] AssignTaskRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == req.InternId && i.MentorId == mentor.Id);
        if (intern == null) return NotFound(new { message = "Intern not found or not yours" });

        var task = new InternTask
        {
            InternId = req.InternId,
            AssignedByMentorId = mentor.Id,
            Title = req.Title,
            Description = req.Description,
            Deadline = req.Deadline,
            Status = Core.Entities.TaskStatus.Pending,
            CreatedAt = DateTime.Now
        };
        _db.Tasks.Add(task);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.TaskAssigned,
            Description = $"Task '{req.Title}' assigned to intern '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(intern.UserId, "New task assigned",
            $"'{req.Title}' assigned with deadline {req.Deadline:dd MMM yyyy}", NotificationType.Task);
        return Ok(new { message = "Task assigned", taskId = task.Id });
    }

    [HttpPatch("tasks/{taskId:int}")]
    public async Task<IActionResult> UpdateTask(int taskId, [FromBody] UpdateTaskRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var task = await _db.Tasks
            .Include(t => t.Intern)
            .FirstOrDefaultAsync(t => t.Id == taskId && t.AssignedByMentorId == mentor.Id);
        if (task == null) return NotFound(new { message = "Task not found" });

        if (!string.IsNullOrWhiteSpace(req.Title)) task.Title = req.Title.Trim();
        if (req.Description != null) task.Description = req.Description.Trim();
        if (req.Deadline != null) task.Deadline = req.Deadline;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.TaskAssigned,
            Description = $"Task '{task.Title}' updated by mentor",
            PerformedByUserId = CurrentUserId,
            TargetInternId = task.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(task.Intern.UserId, "Task updated",
            $"Your task '{task.Title}' was updated by your mentor", NotificationType.Task, "Task", task.Id);
        return Ok(new { message = "Task updated" });
    }

    // ─── Gate Pass Approvals ─────────────────────────────────────────────────
    [HttpGet("gatepasses")]
    public async Task<IActionResult> GetGatePasses([FromQuery] string? status)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var query = _db.GatePasses
            .Include(g => g.Intern).ThenInclude(i => i.Department)
            .Where(g => g.Intern.MentorId == mentor.Id)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<DocumentRequestStatus>(status, out var s))
            query = query.Where(g => g.Status == s);

        var passes = await query.OrderByDescending(g => g.RequestedAt).Select(g => new
        {
            g.Id,
            internName = g.Intern.FullName,
            internCnic = g.Intern.CNIC,
            department = g.Intern.Department.Name,
            g.StudentIdImagePath,
            g.CnicImagePath,
            status = g.Status.ToString(),
            g.RequestedAt,
            g.ApprovedAt,
            g.RejectionReason,
            g.PdfPath
        }).ToListAsync();

        return Ok(passes);
    }

    [Idempotent]
    [HttpPost("gatepasses/{id}/approve")]
    public async Task<IActionResult> ApproveGatePass(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var gatePass = await _db.GatePasses
            .Include(g => g.Intern).ThenInclude(i => i.Department)
            .Include(g => g.Intern.User)
            .FirstOrDefaultAsync(g => g.Id == id && g.Intern.MentorId == mentor.Id);
        if (gatePass == null) return NotFound();

        if (gatePass.Intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved)
            return BadRequest(new { code = "FACE_NOT_APPROVED", message = $"'{gatePass.Intern.FullName}' must have their face enrollment approved before a gate pass can be issued" });
        if (!await _db.OfficialDocsApprovedAsync(gatePass.InternId))
            return BadRequest(new { code = "DOCS_NOT_APPROVED", message = $"'{gatePass.Intern.FullName}' must have their CNIC and CV/Resume approved before a gate pass can be issued" });

        var affected = await StateTransitions.TryUpdateAsync(_db, "gate pass approval", "GatePasses", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Approved.ToString()),
                ("ApprovedByMentorId", mentor.Id),
                ("ApprovedAt", DateTime.Now)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This gate pass was already decided. Refresh and try again." });

        // Generate PDF (system-generated, no signature)
        var pdfPath = _pdf.GenerateGatePassPdf(gatePass, gatePass.Intern, mentor, gatePass.Intern.Department!);

        gatePass.PdfPath = pdfPath;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.GatePassApproved,
            Description = $"Gate pass approved for '{gatePass.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = gatePass.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(gatePass.Intern.UserId, "Gate pass approved",
            "Your gate pass has been approved and the letter is ready", NotificationType.General);
        return Ok(new { message = "Gate pass approved", pdfPath });
    }

    [Idempotent]
    [HttpPost("gatepasses/batch-approve")]
    public async Task<IActionResult> BatchApproveGatePasses([FromBody] BatchApproveGatePassRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        if (req.GatePassIds == null || req.GatePassIds.Length == 0)
            return BadRequest(new { message = "No gate passes selected" });
        if (req.GatePassIds.Length > 100)
            return BadRequest(new { message = "A maximum of 100 gate passes can be approved at once" });

        var passes = await _db.GatePasses
            .Include(g => g.Intern).ThenInclude(i => i.Department)
            .Include(g => g.Intern.User)
            .Where(g => req.GatePassIds.Contains(g.Id)
                && g.Status == DocumentRequestStatus.Pending
                && g.Intern.MentorId == mentor.Id)
            .ToListAsync();

        if (passes.Count == 0)
            return BadRequest(new { message = "None of the selected gate passes are pending" });

        var skippedFaceNotApproved = passes.Count(g => g.Intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved);
        passes = passes.Where(g => g.Intern.FaceEnrollmentStatus == FaceEnrollmentStatus.Approved).ToList();
        var docsOk = new List<GatePass>();
        var skippedDocsNotApproved = 0;
        foreach (var gp in passes)
        {
            if (await _db.OfficialDocsApprovedAsync(gp.InternId)) docsOk.Add(gp);
            else skippedDocsNotApproved++;
        }
        passes = docsOk;
        if (passes.Count == 0)
            return BadRequest(new { message = "Selected gate passes are only for interns whose CNIC and CV/Resume have not both been approved yet" });

        var now = DateTime.Now;
        var affected = await StateTransitions.TryUpdateBatchAsync(_db, "gate pass batch approval", "GatePasses",
            passes.Select(g => g.Id),
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Approved.ToString()),
                ("ApprovedByMentorId", mentor.Id),
                ("ApprovedAt", now)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "None of the selected gate passes are still pending. Refresh and try again." });

        var winners = await _db.GatePasses
            .Include(g => g.Intern).ThenInclude(i => i.Department)
            .Where(g => passes.Select(p => p.Id).Contains(g.Id)
                && g.Status == DocumentRequestStatus.Approved)
            .ToListAsync();

        var lettersGenerated = 0;

        foreach (var deptGroup in winners.GroupBy(g => g.Intern.DepartmentId))
        {
            var department = deptGroup.First().Intern.Department!;
            var internList = deptGroup.Select(g => g.Intern).ToList();

            var pdfPaths = _pdf.GenerateGatePassBatchPdf(internList, department, mentor, null,
                batchRef: deptGroup.Min(g => g.Id).ToString("0000"));
            lettersGenerated += pdfPaths.Count;

            int index = 0;
            foreach (var gatePass in deptGroup)
            {
                gatePass.PdfPath = pdfPaths[index / PdfService.GatePassBatchPageSize];

                _db.ActivityLogs.Add(new ActivityLog
                {
                    LogType = ActivityLogType.GatePassApproved,
                    Description = $"Gate pass approved via batch letter for '{gatePass.Intern.FullName}'",
                    PerformedByUserId = CurrentUserId,
                    TargetInternId = gatePass.InternId,
                    DepartmentId = gatePass.Intern.DepartmentId
                });

                index++;
            }
        }

        await _db.SaveChangesAsync();

        foreach (var gatePass in winners)
            await _notifications.NotifyAsync(gatePass.Intern.UserId, "Gate pass approved",
                "Your gate pass has been approved (batch letter)", NotificationType.General);

        return Ok(new { message = $"{winners.Count} gate passes approved{(skippedFaceNotApproved > 0 ? $" ({skippedFaceNotApproved} skipped - face not approved)" : "")}{(skippedDocsNotApproved > 0 ? $" ({skippedDocsNotApproved} skipped - CNIC/CV not approved)" : "")}", approvedCount = winners.Count, lettersGenerated, skippedFaceNotApproved, skippedDocsNotApproved });
    }

    [Idempotent]
    [HttpPost("gatepasses/{id}/reject")]
    public async Task<IActionResult> RejectGatePass(int id, [FromBody] RejectRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var gatePass = await _db.GatePasses
            .AsNoTracking()
            .Include(g => g.Intern)
            .FirstOrDefaultAsync(g => g.Id == id && g.Intern.MentorId == mentor.Id);
        if (gatePass == null) return NotFound();

        var affected = await StateTransitions.TryUpdateAsync(_db, "gate pass rejection", "GatePasses", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Rejected.ToString()),
                ("ApprovedByMentorId", mentor.Id),
                ("RejectionReason", req.Reason)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This gate pass was already decided. Refresh and try again." });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.GatePassRejected,
            Description = $"Gate pass rejected for '{gatePass.Intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = gatePass.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(gatePass.Intern.UserId, "Gate pass rejected",
            $"Your gate pass request was rejected: {req.Reason}", NotificationType.General);
        return Ok(new { message = "Gate pass rejected" });
    }

    [HttpDelete("gatepasses/{id}")]
    public async Task<IActionResult> DeleteGatePass(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var gatePass = await _db.GatePasses
            .Include(g => g.Intern)
            .FirstOrDefaultAsync(g => g.Id == id && g.Intern.MentorId == mentor.Id);
        if (gatePass == null) return NotFound();
        if (string.IsNullOrEmpty(gatePass.PdfPath))
            return BadRequest(new { message = "Only issued gate passes (with a generated PDF) can be deleted." });

        if (gatePass.PdfPath != null) _files.DeleteFile(gatePass.PdfPath);
        _db.GatePasses.Remove(gatePass);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.GatePassDeleted,
            Description = $"Issued gate pass deleted by mentor for '{gatePass.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = gatePass.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(gatePass.Intern.UserId, "Gate pass removed",
            "Your issued gate pass was deleted by your mentor.", NotificationType.General);
        return Ok(new { message = "Gate pass deleted" });
    }

    // ─── ID Card Approvals ───────────────────────────────────────────────────
    [HttpGet("idcards")]
    public async Task<IActionResult> GetIdCardRequests([FromQuery] string? status)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var query = _db.IdCardRequests
            .Include(i => i.Intern).ThenInclude(i => i.Department)
            .Where(i => i.Intern.MentorId == mentor.Id)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<DocumentRequestStatus>(status, out var s))
            query = query.Where(i => i.Status == s);

        var requests = await query.OrderByDescending(i => i.RequestedAt).Select(i => new
        {
            i.Id,
            internName = i.Intern.FullName,
            department = i.Intern.Department.Name,
            i.StudentIdImagePath, i.CnicImagePath, i.PhotoImagePath,
            status = i.Status.ToString(),
            i.RequestedAt, i.ApprovedAt, i.RejectionReason, i.PdfPath
        }).ToListAsync();

        return Ok(requests);
    }

    [Idempotent]
    [HttpPost("idcards/{id}/approve")]
    public async Task<IActionResult> ApproveIdCard(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var req = await _db.IdCardRequests
            .Include(i => i.Intern).ThenInclude(i => i.Department)
            .Include(i => i.Intern).ThenInclude(i => i.Mentor)
            .Include(i => i.Intern).ThenInclude(i => i.FaceEnrollmentRecords)
            .FirstOrDefaultAsync(i => i.Id == id && i.Intern.MentorId == mentor.Id);
        if (req == null) return NotFound();

        if (req.Intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved)
            return BadRequest(new { code = "FACE_NOT_APPROVED", message = $"'{req.Intern.FullName}' must have their face enrollment approved before an ID card can be issued" });
        if (!await _db.OfficialDocsApprovedAsync(req.InternId))
            return BadRequest(new { code = "DOCS_NOT_APPROVED", message = $"'{req.Intern.FullName}' must have their CNIC and CV/Resume approved before an ID card can be issued" });

        var affected = await StateTransitions.TryUpdateAsync(_db, "ID card approval", "IdCardRequests", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Approved.ToString()),
                ("ApprovedByMentorId", mentor.Id),
                ("ApprovedAt", DateTime.Now)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This ID card request was already decided. Refresh and try again." });

        var pdfPath = _pdf.GenerateIdCardPdf(req, req.Intern, req.Intern.Department!, req.Intern.Mentor!);

        req.PdfPath = pdfPath;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.IdCardApproved,
            Description = $"ID card approved for '{req.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = req.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(req.Intern.UserId, "ID card approved",
            "Your ID card has been approved and is ready", NotificationType.General);
        return Ok(new { message = "ID card request approved", pdfPath });
    }

    [Idempotent]
    [HttpPost("idcards/{id}/reject")]
    public async Task<IActionResult> RejectIdCard(int id, [FromBody] RejectRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var idReq = await _db.IdCardRequests
            .AsNoTracking()
            .Include(i => i.Intern)
            .FirstOrDefaultAsync(i => i.Id == id && i.Intern.MentorId == mentor.Id);
        if (idReq == null) return NotFound();

        var affected = await StateTransitions.TryUpdateAsync(_db, "ID card rejection", "IdCardRequests", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Rejected.ToString()),
                ("RejectionReason", req.Reason)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This ID card request was already decided. Refresh and try again." });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.IdCardRejected,
            Description = $"ID card rejected for '{idReq.Intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = idReq.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(idReq.Intern.UserId, "ID card rejected",
            $"Your ID card request was rejected: {req.Reason}", NotificationType.General);
        return Ok(new { message = "ID card request rejected" });
    }

    [HttpDelete("idcards/{id}")]
    public async Task<IActionResult> DeleteIdCard(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var idReq = await _db.IdCardRequests
            .Include(i => i.Intern)
            .FirstOrDefaultAsync(i => i.Id == id && i.Intern.MentorId == mentor.Id);
        if (idReq == null) return NotFound();
        if (string.IsNullOrEmpty(idReq.PdfPath))
            return BadRequest(new { message = "Only issued ID cards (with a generated PDF) can be deleted." });

        if (idReq.PdfPath != null) _files.DeleteFile(idReq.PdfPath);
        _db.IdCardRequests.Remove(idReq);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.IdCardDeleted,
            Description = $"Issued ID card deleted by mentor for '{idReq.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = idReq.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(idReq.Intern.UserId, "ID card removed",
            "Your issued ID card was deleted by your mentor.", NotificationType.General);
        return Ok(new { message = "ID card deleted" });
    }

    // ─── Certificate Approvals ───────────────────────────────────────────────
    [HttpGet("department-heads")]
    public async Task<IActionResult> GetDepartmentHeads()
    {
        var heads = await _db.DepartmentHeads
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new { h.Id, h.Name, h.Designation, hasSignature = h.SignatureImagePath != null })
            .ToListAsync();
        return Ok(heads);
    }

    [HttpGet("certificates")]
    public async Task<IActionResult> GetCertificates([FromQuery] string? status)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var query = _db.Certificates
            .Include(c => c.Intern).ThenInclude(i => i.Department)
            .Where(c => c.Intern.MentorId == mentor.Id)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<CertificateStatus>(status, out var s))
            query = query.Where(c => c.Status == s);

        var certs = await query.OrderByDescending(c => c.AppliedAt).Select(c => new
        {
            c.Id,
            internName = c.Intern.FullName,
            department = c.Intern.Department.Name,
            c.ProjectName, c.ProjectOutcomes, c.LanguagesUsed, c.AdditionalNotes,
            c.TechStack, c.InternWork, c.DepartmentHeadName,
            c.ReportPath,
            highlightTaskId = c.HighlightTaskId,
            highlightTaskTitle = c.HighlightTask != null ? c.HighlightTask.Title : null,
            status = c.Status.ToString(),
            c.AppliedAt, c.ApprovedAt, c.RejectionReason, c.PdfPath
        }).ToListAsync();

        return Ok(certs);
    }

    [Idempotent]
    [HttpPost("certificates/{id}/approve")]
    public async Task<IActionResult> ApproveCertificate(int id, [FromBody] ApproveCertRequest? req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var cert = await _db.Certificates
            .Include(c => c.Intern).ThenInclude(i => i.Department)
            .FirstOrDefaultAsync(c => c.Id == id && c.Intern.MentorId == mentor.Id);
        if (cert == null) return NotFound();

        if (cert.Intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved)
            return BadRequest(new { code = "FACE_NOT_APPROVED", message = $"'{cert.Intern.FullName}' must have their face enrollment approved before a certificate can be issued" });
        if (!await _db.OfficialDocsApprovedAsync(cert.InternId))
            return BadRequest(new { code = "DOCS_NOT_APPROVED", message = $"'{cert.Intern.FullName}' must have their CNIC and CV/Resume approved before a certificate can be issued" });

        // Certificate gate: internship ended, attendance threshold met, task threshold met
        var score = await _scoring.ComputeAsync(cert.InternId);
        var (_, thresholdPct) = await _scoring.GetSettingsAsync();
        if (cert.Intern.EndDate.Date > DateTime.Now.Date)
            return BadRequest(new { message = "Internship has not ended yet; certificate cannot be approved" });
        if (score.Percentage < thresholdPct)
            return BadRequest(new { message = $"Attendance {score.Percentage:F1}% is below the required {thresholdPct:F0}% threshold" });

        var task = await _scoring.ComputeTaskCompletionAsync(cert.InternId);
        var (_, _, taskThresholdPct, _) = await _scoring.GetFullSettingsAsync();
        if (task.Percentage < taskThresholdPct)
            return BadRequest(new { message = $"Task completion {task.Percentage:F1}% is below the required {taskThresholdPct:F0}% threshold" });

        if (req?.MentorNotes != null) cert.MentorProjectNotes = req.MentorNotes;

        if (string.IsNullOrWhiteSpace(req?.TechStack) || string.IsNullOrWhiteSpace(req?.InternWork))
            return BadRequest(new { message = "Tech stack and intern work are required to approve a certificate" });

        cert.TechStack = req!.TechStack.Trim();
        cert.InternWork = req.InternWork.Trim();
        cert.DepartmentHeadName = "System Generated";
        cert.DepartmentHeadId = null;

        var now = DateTime.Now;
        cert.Status = CertificateStatus.Approved;
        cert.ApprovedByMentorId = mentor.Id;
        cert.ApprovedAt = now;
        if (req?.MentorNotes != null) cert.MentorProjectNotes = req.MentorNotes.Trim();

        var sets = new List<(string Column, object? Value)>
        {
            ("Status", CertificateStatus.Approved.ToString()),
            ("ApprovedByMentorId", mentor.Id),
            ("ApprovedAt", now),
            ("TechStack", cert.TechStack),
            ("InternWork", cert.InternWork),
            ("DepartmentHeadName", cert.DepartmentHeadName),
            ("DepartmentHeadId", cert.DepartmentHeadId)
        };
        if (cert.MentorProjectNotes != null) sets.Add(("MentorProjectNotes", cert.MentorProjectNotes));

        var affected = await StateTransitions.TryUpdateAsync(_db, "certificate approval", "Certificates", id,
            sets.ToArray(),
            ("Status", WhereOp.Equal, CertificateStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This certificate was already decided. Refresh and try again." });

        var transfers = await _db.InternTransferRequests
            .Where(x => x.InternId == cert.InternId && x.Status == InternTransferStatus.Finalised)
            .Include(x => x.FromMentor).ThenInclude(m => m.Department)
            .Include(x => x.ToMentor).ThenInclude(m => m.Department)
            .OrderBy(x => x.FinalisedAt)
            .ToListAsync();
        var pdfPath = _pdf.GenerateCertificatePdf(cert, cert.Intern, cert.Intern.Department!, null, false,
            transfers.Select(t => new CertificateTransferSection(
                t.FromMentor.FullName, t.FromMentor.Department?.Name ?? "",
                t.ToMentor.FullName, t.ToMentor.Department?.Name ?? "", t.FinalisedAt)).ToList());

        _db.Certificates.Attach(cert);
        cert.PdfPath = pdfPath;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.CertificateApproved,
            Description = $"Certificate approved for '{cert.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = cert.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(cert.Intern.UserId, "Certificate approved",
            "Your completion certificate has been approved and is ready", NotificationType.Certificate);
        return Ok(new { message = "Certificate approved", pdfPath });
    }

    [Idempotent]
    [HttpPost("certificates/{id}/reject")]
    public async Task<IActionResult> RejectCertificate(int id, [FromBody] RejectRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var cert = await _db.Certificates
            .AsNoTracking()
            .Include(c => c.Intern)
            .FirstOrDefaultAsync(c => c.Id == id && c.Intern.MentorId == mentor.Id);
        if (cert == null) return NotFound();

        var affected = await StateTransitions.TryUpdateAsync(_db, "certificate rejection", "Certificates", id,
            new (string, object?)[]
            {
                ("Status", CertificateStatus.Rejected.ToString()),
                ("RejectionReason", req.Reason)
            },
            ("Status", WhereOp.Equal, CertificateStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This certificate was already decided. Refresh and try again." });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.CertificateRejected,
            Description = $"Certificate rejected for '{cert.Intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = cert.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(cert.Intern.UserId, "Certificate rejected",
            $"Your certificate application was rejected: {req.Reason}", NotificationType.Certificate);
        return Ok(new { message = "Certificate rejected" });
    }

    [HttpDelete("certificates/{id}")]
    public async Task<IActionResult> DeleteCertificate(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var cert = await _db.Certificates
            .Include(c => c.Intern)
            .FirstOrDefaultAsync(c => c.Id == id && c.Intern.MentorId == mentor.Id);
        if (cert == null) return NotFound();
        if (string.IsNullOrEmpty(cert.PdfPath))
            return BadRequest(new { message = "Only issued certificates (with a generated PDF) can be deleted." });

        if (cert.PdfPath != null) _files.DeleteFile(cert.PdfPath);
        if (cert.ReportPath != null) _files.DeleteFile(cert.ReportPath);
        _db.Certificates.Remove(cert);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.CertificateDeleted,
            Description = $"Issued certificate deleted by mentor for '{cert.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = cert.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(cert.Intern.UserId, "Certificate removed",
            "Your issued certificate was deleted by your mentor.", NotificationType.Certificate);
        return Ok(new { message = "Certificate deleted" });
    }

    // ─── Document Approvals ──────────────────────────────────────────────────
    [HttpGet("documents")]
    public async Task<IActionResult> GetDocuments([FromQuery] string? status)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var query = _db.DocumentUploads
            .Include(d => d.Intern).ThenInclude(i => i.Department)
            .Include(d => d.Intern).ThenInclude(i => i.FaceEnrollmentRecords)
            .Where(d => d.Intern.MentorId == mentor.Id && d.WithdrawnAt == null)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<DocumentRequestStatus>(status, out var s))
            query = query.Where(d => d.Status == s);

        var docs = await query.OrderByDescending(d => d.UploadedAt).Select(d => new
        {
            d.Id,
            internName = d.Intern.FullName,
            photoThumbPath = d.Intern.FaceEnrollmentRecords.Where(r => r.PhotoThumbPath != null).OrderByDescending(r => r.EnrolledAt).Select(r => r.PhotoThumbPath).FirstOrDefault(),
            department = d.Intern.Department.Name,
            documentType = d.DocumentType.ToString(),
            d.FilePath,
            d.OriginalFileName,
            status = d.Status.ToString(),
            d.RejectionReason,
            d.UploadedAt,
            d.ApprovedAt
        }).ToListAsync();

        return Ok(docs);
    }

    [Idempotent]
    [HttpPost("documents/{id}/approve")]
    public async Task<IActionResult> ApproveDocument(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var doc = await _db.DocumentUploads
            .AsNoTracking()
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id && d.Intern.MentorId == mentor.Id);
        if (doc == null) return NotFound();

        var affected = await StateTransitions.TryUpdateAsync(_db, "document approval", "DocumentUploads", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Approved.ToString()),
                ("ApprovedByUserId", CurrentUserId),
                ("ApprovedAt", DateTime.Now)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()),
            ("WithdrawnAt", WhereOp.IsNull, null),
            ("InternId", WhereOp.Equal, doc.InternId));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This document was already decided or withdrawn. Refresh and try again." });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentApproved,
            Description = $"{doc.DocumentType} document approved for '{doc.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = doc.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(doc.Intern.UserId, "Document approved",
            $"Your {doc.DocumentType} document has been approved", NotificationType.Document);
        return Ok(new { message = "Document approved" });
    }

    [Idempotent]
    [HttpPost("documents/{id}/reject")]
    public async Task<IActionResult> RejectDocument(int id, [FromBody] RejectRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var doc = await _db.DocumentUploads
            .AsNoTracking()
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id && d.Intern.MentorId == mentor.Id);
        if (doc == null) return NotFound();

        var affected = await StateTransitions.TryUpdateAsync(_db, "document rejection", "DocumentUploads", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Rejected.ToString()),
                ("RejectionReason", req.Reason)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()),
            ("WithdrawnAt", WhereOp.IsNull, null),
            ("InternId", WhereOp.Equal, doc.InternId));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This document was already decided or withdrawn. Refresh and try again." });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentRejected,
            Description = $"{doc.DocumentType} document rejected for '{doc.Intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = doc.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(doc.Intern.UserId, "Document rejected",
            $"Your {doc.DocumentType} document was rejected: {req.Reason}", NotificationType.Document);
        return Ok(new { message = "Document rejected" });
    }

    [HttpDelete("documents/{id}")]
    public async Task<IActionResult> DeleteDocument(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var doc = await _db.DocumentUploads
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id && d.Intern.MentorId == mentor.Id);
        if (doc == null) return NotFound();

        _files.DeleteFile(doc.FilePath);
        _db.DocumentUploads.Remove(doc);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentDeleted,
            Description = $"{doc.DocumentType} document deleted for '{doc.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = doc.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(doc.Intern.UserId, "Document deleted",
            $"Your {doc.DocumentType} document was deleted by your mentor.", NotificationType.Document,
            "DocumentUpload", (int)doc.Id, CurrentUserId, doc.InternId, mentor.DepartmentId);
        return Ok(new { message = "Document deleted" });
    }

    // ─── Leave & device MACs (own interns) ──────────────────────────────────
    [HttpGet("leave-applications")]
    public async Task<IActionResult> GetLeaveApplications()
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var leaves = await _db.LeaveApplications
            .Include(l => l.Intern)
            .Where(l => l.Intern.MentorId == mentor.Id)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync();

        return Ok(leaves.Select(l => new
        {
            l.Id,
            internId = l.InternId,
            internName = l.Intern.FullName,
            l.StartDate,
            l.EndDate,
            l.Reason,
            status = l.Status.ToString(),
            l.DecidedAt,
            l.RejectionReason,
            l.CreatedAt
        }));
    }

    [Idempotent]
    [HttpPost("leave-applications/{id}/approve")]
    public async Task<IActionResult> ApproveLeave(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var leave = await _db.LeaveApplications
            .AsNoTracking()
            .Include(l => l.Intern)
            .FirstOrDefaultAsync(l => l.Id == id && l.Intern.MentorId == mentor.Id);
        if (leave == null) return NotFound();

        var settings = await _db.AttendanceSettings.FirstOrDefaultAsync();
        var allowed = settings?.AllowedLeaveDays ?? 0;
        var leaveUsed = await _db.Attendances.CountAsync(a => a.InternId == leave.InternId && a.IsOnLeave);
        var rangeDays = (int)(leave.EndDate.Date - leave.StartDate.Date).TotalDays + 1;
        if (leaveUsed + rangeDays > allowed)
            return BadRequest(new { message = "Approving would exceed the intern's allowed leave days." });

        var now = DateTime.Now;
        var affected = await StateTransitions.TryUpdateAsync(_db, "leave approval", "LeaveApplications", id,
            new (string, object?)[]
            {
                ("Status", LeaveStatus.Approved.ToString()),
                ("DecidedAt", now),
                ("DecidedByUserId", CurrentUserId)
            },
            ("Status", WhereOp.Equal, LeaveStatus.Pending.ToString()),
            ("InternId", WhereOp.Equal, leave.InternId));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This leave request was already decided. Refresh and try again." });

        var current = leave.StartDate.Date;
        var last = leave.EndDate.Date;
        while (!(current > last))
        {
            var exists = await _db.Attendances
                .AnyAsync(a => a.InternId == leave.InternId && a.Timestamp.Date == current);
            if (!exists)
            {
                _db.Attendances.Add(new Attendance
                {
                    InternId = leave.InternId,
                    Timestamp = current,
                    Status = AttendanceStatus.Absent,
                    IsOnLeave = true
                });
            }
            current = current.AddDays(1);
        }

        leave.Status = LeaveStatus.Approved;
        leave.DecidedAt = DateTime.Now;
        leave.DecidedByUserId = CurrentUserId;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.LeaveApproved,
            Description = $"Leave approved for '{leave.Intern.FullName}' from {leave.StartDate.ToString("dd MMM")} to {leave.EndDate.ToString("dd MMM")}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = leave.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(
            leave.Intern.UserId,
            "Leave approved",
            $"Your leave from {leave.StartDate.ToString("dd MMM")} to {leave.EndDate.ToString("dd MMM")} was approved.",
            NotificationType.Leave,
            "LeaveApplication", (int)leave.Id,
            CurrentUserId, leave.InternId, mentor.DepartmentId,
            ActivityLogType.LeaveApproved);
        return Ok(new { message = "Leave approved" });
    }

    [Idempotent]
    [HttpPost("leave-applications/{id}/reject")]
    public async Task<IActionResult> RejectLeave(int id, [FromBody] RejectLeaveRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var leave = await _db.LeaveApplications
            .AsNoTracking()
            .Include(l => l.Intern)
            .FirstOrDefaultAsync(l => l.Id == id && l.Intern.MentorId == mentor.Id);
        if (leave == null) return NotFound();

        var now = DateTime.Now;
        var affected = await StateTransitions.TryUpdateAsync(_db, "leave rejection", "LeaveApplications", id,
            new (string, object?)[]
            {
                ("Status", LeaveStatus.Rejected.ToString()),
                ("RejectionReason", (req.Reason ?? "").Trim()),
                ("DecidedAt", now),
                ("DecidedByUserId", CurrentUserId)
            },
            ("Status", WhereOp.Equal, LeaveStatus.Pending.ToString()),
            ("InternId", WhereOp.Equal, leave.InternId));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This leave request was already decided. Refresh and try again." });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.LeaveRejected,
            Description = $"Leave rejected for '{leave.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = leave.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(
            leave.Intern.UserId,
            "Leave rejected",
            $"Your leave from {leave.StartDate.ToString("dd MMM")} to {leave.EndDate.ToString("dd MMM")} was rejected.",
            NotificationType.Leave,
            "LeaveApplication", (int)leave.Id,
            CurrentUserId, leave.InternId, mentor.DepartmentId,
            ActivityLogType.LeaveRejected);
        return Ok(new { message = "Leave rejected" });
    }

    [HttpGet("devices")]
    public async Task<IActionResult> GetInternMacDevices()
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var macs = await _db.DeviceMacs
            .Include(m => m.Intern)
            .Where(m => m.Intern.MentorId == mentor.Id)
            .ToListAsync();

        return Ok(macs.Select(m => new
        {
            internId = m.InternId,
            internName = m.Intern.FullName,
            deviceType = m.DeviceType.ToString(),
            macAddress = m.MacAddress
        }));
    }

    // ─── Shifts (company-wide + own department) ─────────────────────────────
    [HttpGet("shifts")]
    public async Task<IActionResult> GetShifts()
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var shifts = await _db.Shifts
            .Where(s => s.IsCompanyWide || s.DepartmentId == mentor.DepartmentId)
            .OrderBy(s => s.Name)
            .Select(s => new
            {
                s.Id,
                s.Name,
                s.StartTime,
                s.EndTime,
                s.IsCompanyWide,
                department = s.Department != null ? s.Department.Name : null,
                s.DepartmentId,
                s.IsActive,
                ownerId = s.CreatedByUserId,
                isOwner = s.CreatedByUserId != null && s.CreatedByUserId == mentor.UserId
            }).ToListAsync();
        return Ok(shifts);
    }

    [Idempotent]
    [HttpPost("shifts")]
    public async Task<IActionResult> CreateShift([FromBody] CreateShiftRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Shift name is required" });
        if (req.StartTime == req.EndTime)
            return BadRequest(new { message = "Shift start time must be before end time" });
        if (await _db.Shifts.AnyAsync(s => s.Name == req.Name.Trim() && (s.IsCompanyWide || s.DepartmentId == mentor.DepartmentId)))
            return BadRequest(new { message = "A shift with this name already exists" });

        var shift = new Shift
        {
            Name = req.Name.Trim(),
            StartTime = req.StartTime,
            EndTime = req.EndTime,
            // Department-scoped custom shifts are always forced to the mentor's department
            IsCompanyWide = false,
            CreatedByUserId = mentor.UserId,
            DepartmentId = mentor.DepartmentId,
            IsActive = true
        };
        _db.Shifts.Add(shift);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.ShiftCreated,
            Description = $"Mentor created shift '{shift.Name}' for department {mentor.DepartmentId}",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Shift created", shiftId = shift.Id });
    }

    private bool ShiftIsOwned(Shift shift, Mentor mentor) =>
        !shift.IsCompanyWide && shift.CreatedByUserId != null && shift.CreatedByUserId == mentor.UserId;

    [HttpPut("shifts/{id}")]
    public async Task<IActionResult> UpdateShift(int id, [FromBody] CreateShiftRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.Id == id);
        if (shift == null) return NotFound();
        if (!ShiftIsOwned(shift, mentor))
            return StatusCode(403, new { message = "You can only edit shifts you created" });

        if (req.StartTime == req.EndTime)
            return BadRequest(new { message = "Shift start time must be before end time" });
        if (await _db.Shifts.AnyAsync(s => s.Id != id && s.Name == req.Name.Trim() && (s.IsCompanyWide || s.DepartmentId == mentor.DepartmentId)))
            return BadRequest(new { message = "A shift with this name already exists" });

        shift.Name = req.Name.Trim();
        shift.StartTime = req.StartTime;
        shift.EndTime = req.EndTime;

        var assigned = await _db.Interns.Where(i => i.ShiftId == id).ToListAsync();
        foreach (var intern in assigned)
            await _notifications.NotifyAsync(intern.UserId, "Shift updated",
                $"Your shift '{shift.Name}' was updated by your mentor", NotificationType.ShiftChange,
                "Shift", shift.Id, CurrentUserId, intern.Id, mentor.DepartmentId, ActivityLogType.ShiftUpdated);

        await _db.SaveChangesAsync();
        return Ok(new { message = "Shift updated" });
    }

    [HttpDelete("shifts/{id}")]
    public async Task<IActionResult> DeleteShift(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.Id == id);
        if (shift == null) return NotFound();
        if (!ShiftIsOwned(shift, mentor))
            return StatusCode(403, new { message = "You can only delete shifts you created" });

        var assigned = await _db.Interns.Where(i => i.ShiftId == id).ToListAsync();
        if (assigned.Any())
        {
            var names = assigned.Select(i => i.FullName).Take(3).ToArray();
            var list = String.Join(", ", names) + (assigned.Count() > 3 ? " …" : "");
            return BadRequest(new
            {
                message = $"This shift has {assigned.Count()} intern(s) assigned ({list}). Relocate them before deleting."
            });
        }

        var deptId = mentor.DepartmentId;
        _db.Shifts.Remove(shift);
        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.ShiftDeleted,
            Description = $"Mentor deleted shift '{shift.Name}'",
            PerformedByUserId = CurrentUserId,
            DepartmentId = deptId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Shift deleted" });
    }

    // ─── Intern Shift Changes (mentor initiates) ────────────────────────────
    [HttpGet("shift-changes")]
    public async Task<IActionResult> GetShiftChanges()
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var requests = await _db.InternShiftChangeRequests
            .Include(r => r.Intern)
            .Include(r => r.FromShift)
            .Include(r => r.ToShift)
            .Where(r => r.Intern.MentorId == mentor.Id)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
                internName = r.Intern.FullName,
                r.InternId,
                fromShift = r.FromShift.Name,
                toShift = r.ToShift.Name,
                status = r.Status.ToString(),
                r.Notes,
                r.RejectionReason,
                r.CreatedAt,
                r.InternAcceptedAt
            }).ToListAsync();
        return Ok(requests);
    }

    [HttpPost("interns/{id}/shift-change")]
    public async Task<IActionResult> InitiateShiftChange(int id, [FromBody] InitiateShiftChangeRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns
            .Include(i => i.Shift)
            .FirstOrDefaultAsync(i => i.Id == id && i.MentorId == mentor.Id);
        if (intern == null) return NotFound();

        var toShift = await _db.Shifts.FirstOrDefaultAsync(s => s.Id == req.ToShiftId && s.IsActive);
        if (toShift == null) return BadRequest(new { message = "Target shift not found or inactive" });
        if (intern.ShiftId == toShift.Id)
            return BadRequest(new { message = "Intern is already on that shift" });
        if (!toShift.IsCompanyWide && toShift.DepartmentId != mentor.DepartmentId)
            return BadRequest(new { message = "Cannot assign a shift outside your department" });
        if (await _db.InternShiftChangeRequests.AnyAsync(r => r.InternId == id && r.Status == InternShiftChangeStatus.Pending))
            return BadRequest(new { message = "A shift change is already pending for this intern" });

        var request = new InternShiftChangeRequest
        {
            InternId = id,
            FromShiftId = intern.ShiftId ?? (await _db.Shifts
                .Where(s => s.IsCompanyWide && s.IsActive && s.Name == "Morning")
                .Select(s => (int?)s.Id)
                .FirstOrDefaultAsync() ?? 0),
            ToShiftId = toShift.Id,
            RequestedByUserId = CurrentUserId,
            Notes = req.Notes,
            Status = InternShiftChangeStatus.Pending,
            CreatedAt = DateTime.Now
        };
        _db.InternShiftChangeRequests.Add(request);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternShiftChanged,
            Description = $"Mentor requested shift change for '{intern.FullName}' to '{toShift.Name}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(intern.UserId, "Shift change offered",
            $"Your mentor offered you the '{toShift.Name}' shift", NotificationType.ShiftChange);
        return Ok(new { message = "Shift change requested", requestId = request.Id });
    }

    // ─── Intern Transfers (mentor side) ─────────────────────────────────────
    [HttpGet("intern-transfers")]
    public async Task<IActionResult> GetInternTransfers()
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var transfers = await _db.InternTransferRequests
            .Include(t => t.Intern)
            .Include(t => t.FromMentor).ThenInclude(m => m.Department)
            .Include(t => t.ToMentor).ThenInclude(m => m.Department)
            .Where(t => t.FromMentorId == mentor.Id || t.ToMentorId == mentor.Id)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new
            {
                t.Id,
                internName = t.Intern.FullName,
                t.InternId,
                fromMentor = t.FromMentor.FullName,
                fromDepartment = t.FromMentor.Department != null ? t.FromMentor.Department.Name : "",
                toMentor = t.ToMentor.FullName,
                toDepartment = t.ToMentor.Department != null ? t.ToMentor.Department.Name : "",
                initiatedBy = t.InitiatedBy.ToString(),
                status = t.Status.ToString(),
                t.Notes,
                t.RejectionReason,
                t.CreatedAt,
                t.EndorsedAt,
                t.InternAcceptedAt,
                t.FinalisedAt
            }).ToListAsync();
        return Ok(transfers);
    }

    // Flow B: current mentor initiates the transfer of one of their interns
    [HttpPost("interns/{id}/transfer")]
    public async Task<IActionResult> InitiateInternTransfer(int id, [FromBody] InitiateInternTransferRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == id && i.MentorId == mentor.Id);
        if (intern == null) return NotFound();
        var toMentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == req.ToMentorId && m.Id != mentor.Id);
        if (toMentor == null) return BadRequest(new { message = "Target mentor not found" });
        if (await _db.InternTransferRequests.AnyAsync(t => t.InternId == id &&
            (t.Status == InternTransferStatus.Pending || t.Status == InternTransferStatus.Endorsed || t.Status == InternTransferStatus.InternAccepted)))
            return BadRequest(new { message = "A transfer is already open for this intern" });

        var request = new InternTransferRequest
        {
            InternId = id,
            FromMentorId = mentor.Id,
            ToMentorId = toMentor.Id,
            InitiatedBy = InternTransferInitiator.Mentor,
            InitiatedByUserId = CurrentUserId,
            Status = InternTransferStatus.Pending,
            Notes = req.Notes,
            CreatedAt = DateTime.Now
        };
        _db.InternTransferRequests.Add(request);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternTransferInitiated,
            Description = $"Mentor initiated transfer of intern '{intern.FullName}' to mentor '{toMentor.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(toMentor.UserId, "Intern transfer requested",
            $"{mentor.FullName} wants to transfer '{intern.FullName}' to you", NotificationType.Transfer);
        return Ok(new { message = "Intern transfer initiated", requestId = request.Id });
    }

    // Flow A: the current mentor endorses an admin-initiated transfer
    [HttpPost("transfers/{id}/endorse")]
    public async Task<IActionResult> EndorseInternTransfer(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var actor = new TransferActor(CurrentUserId, UserRole.Mentor, mentor.Id);
        return TransferResponse(await _transfers.MentorEndorseAsync(id, actor));
    }

    [HttpPost("transfers/{id}/reject")]
    public async Task<IActionResult> RejectInternTransfer(int id, [FromBody] RejectInternTransferRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var actor = new TransferActor(CurrentUserId, UserRole.Mentor, mentor.Id);
        return TransferResponse(await _transfers.MentorRejectAsync(id, actor, req.Reason));
    }

    // The receiving mentor may refuse a transfer the intern has already accepted.
    [HttpPost("transfers/{id}/refuse")]
    [Idempotent]
    public async Task<IActionResult> RefuseInternTransfer(int id, [FromBody] RejectInternTransferRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var actor = new TransferActor(CurrentUserId, UserRole.Mentor, mentor.Id);
        return TransferResponse(await _transfers.ToMentorRejectAsync(id, actor, req.Reason));
    }

    // A stakeholder raises a non-terminal objection, notifying the other parties
    [HttpPost("transfers/{id}/objection")]
    public async Task<IActionResult> ObjectInternTransfer(int id, [FromBody] RejectInternTransferRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var transfer = await _db.InternTransferRequests
            .Include(t => t.FromMentor).ThenInclude(m => m.User)
            .Include(t => t.ToMentor).ThenInclude(m => m.User)
            .FirstOrDefaultAsync(t => t.Id == id && (t.FromMentorId == mentor.Id || t.ToMentorId == mentor.Id));
        if (transfer == null) return NotFound();
        if (transfer.Status == InternTransferStatus.Finalised || transfer.Status == InternTransferStatus.Rejected)
            return BadRequest(new { message = "Closed transfers cannot receive objections" });

        var reason = (req.Reason ?? "").Trim();
        if (reason.Length == 0)
            return BadRequest(new { message = "Objection reason is required" });

        transfer.Notes = transfer.Notes == null || transfer.Notes.Length == 0
            ? $"Objection by {mentor.FullName}: {reason}"
            : $"{transfer.Notes} Objection by {mentor.FullName}: {reason}";

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternTransferObjection,
            Description = $"Mentor '{mentor.FullName}' raised an objection on transfer #{transfer.Id}: {reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = transfer.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();

        var parties = new[] { transfer.FromMentor, transfer.ToMentor };
        foreach (var m in parties)
            if (m.Id != mentor.Id)
                await _notifications.NotifyAsync(m.UserId, "Objection on intern transfer",
                    $"{mentor.FullName} raised an objection on transfer #{transfer.Id}: {reason}", NotificationType.Transfer);

        return Ok(new { message = "Objection recorded and stakeholders notified" });
    }

    // Only the target mentor can finalise: moves the intern to their roster + department
    [HttpPost("transfers/{id}/finalise")]
    public async Task<IActionResult> FinaliseInternTransfer(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var actor = new TransferActor(CurrentUserId, UserRole.Mentor, mentor.Id);
        return TransferResponse(await _transfers.FinaliseAsync(id, actor));
    }


    /// <summary>
    /// Maps a state-machine outcome onto HTTP. A lost CAS race is 409 STALE_STATE
    /// (D-12/D-S21), not 400: the request was well-formed, the row simply moved on.
    /// </summary>
    private IActionResult TransferResponse(TransferResult result) => result.Outcome switch
    {
        TransferOutcome.Applied => Ok(new { message = result.Message }),
        TransferOutcome.Conflict => StatusCode(StatusCodes.Status409Conflict, new { message = result.Message }),
        TransferOutcome.Forbidden => StatusCode(StatusCodes.Status403Forbidden, new { message = result.Message }),
        _ => NotFound()
    };

    // ─── Mentor Department Transfers ──────────────────────────────────────
    [HttpGet("transfers")]
    public async Task<IActionResult> GetMyTransfers()
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();
        var transfers = await _db.MentorTransferRequests
            .Include(t => t.FromDepartment)
            .Include(t => t.ToDepartment)
            .Where(t => t.MentorId == mentor.Id)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new
            {
                t.Id,
                fromDepartment = t.FromDepartment.Name,
                toDepartment = t.ToDepartment.Name,
                t.FromDepartmentId,
                t.ToDepartmentId,
                status = t.Status.ToString(),
                t.AdminNote,
                t.MentorNote,
                t.CreatedAt,
                t.RespondedAt,
                t.FinalisedAt
            }).ToListAsync();
        return Ok(transfers);
    }

    [HttpPost("mentor-transfers/{id}/accept")]
    [Idempotent]
    public async Task<IActionResult> AcceptTransfer(int id, [FromBody] TransferResponseRequest? req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();
        var transfer = await _db.MentorTransferRequests.FirstOrDefaultAsync(t => t.Id == id && t.MentorId == mentor.Id);
        if (transfer == null) return NotFound();
        if (transfer.Status != MentorTransferStatus.Pending)
            return BadRequest(new { message = "This transfer is no longer pending" });

        transfer.Status = MentorTransferStatus.Accepted;
        transfer.RespondedAt = DateTime.Now;
        transfer.RespondedByMentorId = CurrentUserId;
        transfer.MentorNote = req?.Note;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.MentorTransferAccepted,
            Description = $"Mentor '{mentor.FullName}' accepted transfer to department {transfer.ToDepartmentId}",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });
        await _db.SaveChangesAsync();
        return Ok(new { message = "Transfer accepted" });
    }

    [HttpPost("mentor-transfers/{id}/reject")]
    [Idempotent]
    public async Task<IActionResult> RejectTransfer(int id, [FromBody] TransferResponseRequest? req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();
        var transfer = await _db.MentorTransferRequests.FirstOrDefaultAsync(t => t.Id == id && t.MentorId == mentor.Id);
        if (transfer == null) return NotFound();
        if (transfer.Status != MentorTransferStatus.Pending)
            return BadRequest(new { message = "This transfer is no longer pending" });

        transfer.Status = MentorTransferStatus.Rejected;
        transfer.RespondedAt = DateTime.Now;
        transfer.RespondedByMentorId = CurrentUserId;
        transfer.MentorNote = req?.Note;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.MentorTransferRejected,
            Description = $"Mentor '{mentor.FullName}' rejected transfer to department {transfer.ToDepartmentId}",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });
        await _db.SaveChangesAsync();
        return Ok(new { message = "Transfer rejected" });
    }

    // ─── State snapshots (offline sync precondition checks) ──────────────────
    [HttpGet("documents/{id}/state")]
    public async Task<IActionResult> GetDocumentState(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();
        var state = await _db.DocumentUploads.AsNoTracking()
            .Where(d => d.Id == id && d.Intern.MentorId == mentor.Id)
            .Select(d => new { d.Id, status = d.Status.ToString(), withdrawn = d.WithdrawnAt != null, d.InternId, mentorId = d.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("gatepasses/{id}/state")]
    public async Task<IActionResult> GetGatePassState(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();
        var state = await _db.GatePasses.AsNoTracking()
            .Where(g => g.Id == id && g.Intern.MentorId == mentor.Id)
            .Select(g => new { g.Id, status = g.Status.ToString(), g.InternId, mentorId = g.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("idcards/{id}/state")]
    public async Task<IActionResult> GetIdCardState(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();
        var state = await _db.IdCardRequests.AsNoTracking()
            .Where(i => i.Id == id && i.Intern.MentorId == mentor.Id)
            .Select(i => new { i.Id, status = i.Status.ToString(), i.InternId, mentorId = i.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("certificates/{id}/state")]
    public async Task<IActionResult> GetCertificateState(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();
        var state = await _db.Certificates.AsNoTracking()
            .Where(c => c.Id == id && c.Intern.MentorId == mentor.Id)
            .Select(c => new { c.Id, status = c.Status.ToString(), c.InternId, mentorId = c.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("leave-applications/{id}/state")]
    public async Task<IActionResult> GetLeaveState(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();
        var state = await _db.LeaveApplications.AsNoTracking()
            .Where(l => l.Id == id && l.Intern.MentorId == mentor.Id)
            .Select(l => new { l.Id, status = l.Status.ToString(), l.InternId, mentorId = l.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("interns/{id}/face/state")]
    public async Task<IActionResult> GetInternFaceState(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();
        var state = await _db.Interns.AsNoTracking()
            .Where(i => i.Id == id && i.MentorId == mentor.Id)
            .Select(i => new { i.Id, status = i.FaceEnrollmentStatus.ToString(), i.MentorId, rejectedReason = i.FaceRejectedReason })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

}

public record CreateInternRequest(
    [MaxLength(100)] string? Username, [MaxLength(128)] string Password, [MaxLength(200)] string FullName, [Required, MaxLength(50)] string? CNIC,
    [MaxLength(200)] string? University, [MaxLength(200)] string? Degree, InternGender Gender, DateTime StartDate, DateTime EndDate, int? DepartmentId = null, int? ShiftId = null,
    double? OfficeLatitude = null, double? OfficeLongitude = null);
public record AssignTaskRequest(int InternId, [MaxLength(300)] string Title, [MaxLength(2000)] string Description, DateTime? Deadline);
public record UpdateTaskRequest([MaxLength(300)] string? Title, [MaxLength(2000)] string? Description, DateTime? Deadline);
public record RejectRequest([MaxLength(1000)] string Reason);
public record ApproveCertRequest([MaxLength(2000)] string? MentorNotes, [MaxLength(500)] string? TechStack, [MaxLength(2000)] string? InternWork, int? DepartmentHeadId);
public record MentorResetPasswordRequest([MaxLength(128)] string NewPassword);
public record TransferResponseRequest([MaxLength(1000)] string? Note);
public record MentorUpdateInternRequest([MaxLength(200)] string? FullName, [MaxLength(50)] string? CNIC, [MaxLength(200)] string? University, [MaxLength(200)] string? Degree,
    InternGender? Gender, DateTime? StartDate, DateTime? EndDate, bool? IsActive);
public record MentorUpdateAttendanceRequest(DateTime? InTime, DateTime? OutTime,
    AttendanceSlotStatus? ArrivalStatus, AttendanceSlotStatus? DepartureStatus, bool? IsOnLeave, [MaxLength(1000)] string? Notes);
public record CreateShiftRequest([MaxLength(100)] string Name, TimeSpan StartTime, TimeSpan EndTime);
public record InitiateShiftChangeRequest(int ToShiftId, [MaxLength(1000)] string? Notes);
public record RejectLeaveRequest([MaxLength(1000)] string? Reason);
public record InitiateInternTransferRequest(int ToMentorId, [MaxLength(1000)] string? Notes);
