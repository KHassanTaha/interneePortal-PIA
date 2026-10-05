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
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly FileService _files;
    private readonly PdfService _pdf;
    private readonly AttendanceScoringService _scoring;
    private readonly NotificationService _notifications;
    private readonly EmailService _email;
    private readonly InternSerialService _serials;

    public AdminController(AppDbContext db, FileService files, PdfService pdf, AttendanceScoringService scoring, NotificationService notifications, EmailService email, InternSerialService serials)
    {
        _db = db;
        _files = files;
        _pdf = pdf;
        _scoring = scoring;
        _notifications = notifications;
        _email = email;
        _serials = serials;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // ─── Dashboard ───────────────────────────────────────────────────────────
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var totalMentors = await _db.Mentors.CountAsync();
        var totalInterns = await _db.Interns.CountAsync();
        var activeInterns = await _db.Interns
            .Where(i => i.User.IsActive && i.EndDate > DateTime.Now).CountAsync();
        var totalDepartments = await _db.Departments.Where(d => d.IsActive).CountAsync();

        var recentActivity = await _db.ActivityLogs
            .Include(a => a.PerformedByUser)
            .Include(a => a.TargetIntern)
            .Include(a => a.Department)
            .OrderByDescending(a => a.CreatedAt)
            .Take(12)
            .Select(a => new
            {
                a.Id,
                logType = a.LogType.ToString(),
                a.Description,
                performedBy = a.PerformedByUser!.Username,
                targetIntern = a.TargetIntern != null ? a.TargetIntern.FullName : null,
                department = a.Department != null ? a.Department.Name : null,
                a.CreatedAt
            }).ToListAsync();

        return Ok(new { totalMentors, totalInterns, activeInterns, totalDepartments, recentActivity });
    }

    // ─── Mentors ─────────────────────────────────────────────────────────────
    [HttpGet("mentors")]
    public async Task<IActionResult> GetMentors([FromQuery] int? departmentId)
    {
        var query = _db.Mentors
            .Include(m => m.User)
            .Include(m => m.Department)
            .AsQueryable();

        if (departmentId.HasValue)
            query = query.Where(m => m.DepartmentId == departmentId);

        var mentors = await query.Select(m => new
        {
            m.Id,
            m.FullName,
            m.Designation,
            m.Phone,
            m.Email,
            username = m.User.Username,
            isActive = m.User.IsActive,
            department = m.Department.Name,
            m.DepartmentId,
            m.CreatedAt,
            internCount = m.Interns.Count,
            isSignatory = _db.DepartmentHeads.Any(h => h.MentorId == m.Id),
            departmentHeadId = _db.DepartmentHeads.Where(h => h.MentorId == m.Id).Select(h => (int?)h.Id).FirstOrDefault()
        }).ToListAsync();

        return Ok(mentors);
    }

    [Idempotent]
    [HttpPost("mentors")]
    public async Task<IActionResult> CreateMentor([FromBody] CreateMentorRequest req)
    {
        if (!await _db.Departments.AnyAsync(d => d.Id == req.DepartmentId && d.IsActive))
            return BadRequest(new { message = "Invalid department" });

        var policyError = PasswordPolicy.Validate(req.Password);
        if (policyError != null)
            return BadRequest(new { message = policyError });

        string username;
        try
        {
            username = await _serials.GenerateUsernameAsync(_db, req.FullName, req.Username, req.DepartmentId);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        var user = new User
        {
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = UserRole.Mentor,
            IsActive = true,
            CreatedAt = DateTime.Now
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var mentor = new Mentor
        {
            UserId = user.Id,
            FullName = req.FullName,
            Designation = req.Designation,
            DepartmentId = req.DepartmentId,
            Phone = (req.Phone ?? "").Trim().Length > 0 ? req.Phone.Trim() : null,
            Email = (req.Email ?? "").Trim().Length > 0 ? req.Email.Trim() : null,
            CreatedByAdminId = CurrentUserId
        };
        _db.Mentors.Add(mentor);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.MentorCreated,
            Description = $"Admin created mentor '{req.FullName}' ({username}) in department {req.DepartmentId}",
            PerformedByUserId = CurrentUserId,
            DepartmentId = req.DepartmentId,
            CreatedAt = DateTime.Now
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(user.Id, "Welcome to your role",
            $"Your mentor account was created. Username: {username}", NotificationType.General);

        return Ok(new { message = "Mentor created", mentorId = mentor.Id, username });
    }

    [HttpPut("mentors/{mentorId}")]
    public async Task<IActionResult> UpdateMentor(int mentorId, [FromBody] UpdateMentorRequest req)
    {
        var mentor = await _db.Mentors.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null) return NotFound();

        if (string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Full name is required" });
        if (string.IsNullOrWhiteSpace(req.Designation))
            return BadRequest(new { message = "Designation is required" });

        mentor.FullName = req.FullName.Trim();
        mentor.Designation = req.Designation.Trim();
        mentor.User.IsActive = req.IsActive;
        if (req.Phone != null)
            mentor.Phone = req.Phone.Trim().Length > 0 ? req.Phone.Trim() : null;
        if (req.Email != null)
            mentor.Email = req.Email.Trim().Length > 0 ? req.Email.Trim() : null;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.MentorUpdated,
            Description = $"Admin updated mentor '{mentor.FullName}'",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Mentor updated" });
    }

    [HttpPatch("mentors/{mentorId}/reset-password")]
    public async Task<IActionResult> ResetMentorPassword(int mentorId, [FromBody] ResetPasswordRequest req)
    {
        var mentor = await _db.Mentors.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null) return NotFound();

        var policyError = PasswordPolicy.Validate(req.NewPassword);
        if (policyError != null)
            return BadRequest(new { message = policyError });

        mentor.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        mentor.User.MustChangePassword = true;
        mentor.User.TokenVersion++;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.PasswordReset,
            Description = $"Admin reset password for mentor '{mentor.FullName}'",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Password reset successfully" });
    }

    [HttpDelete("mentors/{mentorId}")]
    public async Task<IActionResult> DeleteMentor(int mentorId)
    {
        var mentor = await _db.Mentors.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null) return NotFound();

        var linkedHeads = await _db.DepartmentHeads.Where(h => h.MentorId == mentorId).ToListAsync();
        foreach (var head in linkedHeads)
        {
            if (!string.IsNullOrEmpty(head.SignatureImagePath))
                _files.DeleteFile(head.SignatureImagePath);
            _db.DepartmentHeads.Remove(head);
        }

        mentor.User.IsActive = false;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.MentorDeleted,
            Description = $"Admin deactivated mentor '{mentor.FullName}'",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Mentor deactivated" });
    }

    // Promote a mentor to signatory. Requires a signature image in the same request.
    [HttpPost("mentors/{mentorId}/signatory")]
    public async Task<IActionResult> PromoteMentorToSignatory(
        int mentorId, [FromForm] string? name, [FromForm] string? designation,
        [FromForm] int? departmentId, IFormFile? signature)
    {
        if (signature == null)
            return BadRequest(new { message = "A signature image is required to make a mentor a signatory." });

        var mentor = await _db.Mentors.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null) return NotFound();
        if (await _db.DepartmentHeads.AnyAsync(h => h.MentorId == mentorId))
            return BadRequest(new { message = "This mentor is already a signatory." });

        var deptId = departmentId ?? mentor.DepartmentId;
        if (!await _db.Departments.AnyAsync(d => d.Id == deptId && d.IsActive))
            return BadRequest(new { message = "Invalid department" });

        var head = new DepartmentHead
        {
            Name = string.IsNullOrWhiteSpace(name) ? mentor.FullName : name.Trim(),
            Designation = string.IsNullOrWhiteSpace(designation) ? mentor.Designation : designation.Trim(),
            DepartmentId = deptId,
            MentorId = mentorId,
            CreatedAt = DateTime.Now
        };
        _db.DepartmentHeads.Add(head);
        await _db.SaveChangesAsync();

        head.SignatureImagePath = await _files.SaveSignatureAsync(signature, head.Id);
        await _db.SaveChangesAsync();

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentHeadCreated,
            Description = $"Mentor '{mentor.FullName}' promoted to signatory",
            PerformedByUserId = CurrentUserId,
            DepartmentId = deptId
        });
        await _db.SaveChangesAsync();

        return Ok(new { message = "Mentor promoted to signatory", headId = head.Id });
    }

    // Demote a mentor: removes their signatory entry and its signature file.
    [HttpDelete("mentors/{mentorId}/signatory")]
    public async Task<IActionResult> RemoveMentorSignatory(int mentorId)
    {
        var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null) return NotFound();

        var linkedHeads = await _db.DepartmentHeads.Where(h => h.MentorId == mentorId).ToListAsync();
        if (linkedHeads.Count == 0)
            return Ok(new { message = "Mentor was not a signatory" });

        foreach (var head in linkedHeads)
        {
            if (!string.IsNullOrEmpty(head.SignatureImagePath))
                _files.DeleteFile(head.SignatureImagePath);
            _db.DepartmentHeads.Remove(head);
        }

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentHeadDeleted,
            Description = $"Mentor '{mentor.FullName}' removed as signatory",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });
        await _db.SaveChangesAsync();

        return Ok(new { message = "Signatory removed" });
    }

    // ─── Mentor Department Transfers ──────────────────────────────────────
    [HttpPost("mentors/{mentorId}/transfer")]
    public async Task<IActionResult> InitiateMentorTransfer(int mentorId, [FromBody] InitiateTransferRequest req)
    {
        var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null) return NotFound();
        if (!await _db.Departments.AnyAsync(d => d.Id == req.ToDepartmentId && d.IsActive))
            return BadRequest(new { message = "Invalid target department" });
        if (req.ToDepartmentId == mentor.DepartmentId)
            return BadRequest(new { message = "Mentor is already in that department" });
        if (await _db.MentorTransferRequests.AnyAsync(t => t.MentorId == mentorId && (t.Status == MentorTransferStatus.Pending || t.Status == MentorTransferStatus.Accepted)))
            return BadRequest(new { message = "A transfer request is already open for this mentor" });

        var request = new MentorTransferRequest
        {
            MentorId = mentorId,
            FromDepartmentId = mentor.DepartmentId,
            ToDepartmentId = req.ToDepartmentId,
            Status = MentorTransferStatus.Pending,
            InitiatedByAdminId = CurrentUserId,
            AdminNote = req.AdminNote,
            CreatedAt = DateTime.Now
        };
        _db.MentorTransferRequests.Add(request);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.MentorTransferInitiated,
            Description = $"Admin initiated transfer of mentor '{mentor.FullName}' to department {req.ToDepartmentId}",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });
        await _db.SaveChangesAsync();
        return Ok(new { message = "Transfer request initiated", requestId = request.Id });
    }

    [HttpPost("mentors/{mentorId}/transfer/{requestId}/finalise")]
    public async Task<IActionResult> FinaliseMentorTransfer(int mentorId, int requestId)
    {
        var request = await _db.MentorTransferRequests.FirstOrDefaultAsync(t => t.Id == requestId && t.MentorId == mentorId);
        if (request == null) return NotFound();
        if (request.Status != MentorTransferStatus.Accepted)
            return BadRequest(new { message = "Only accepted transfers can be finalised" });

        var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null) return NotFound();

        mentor.DepartmentId = request.ToDepartmentId;
        request.Status = MentorTransferStatus.Finalised;
        request.FinalisedAt = DateTime.Now;
        request.FinalisedByAdminId = CurrentUserId;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.MentorTransferFinalised,
            Description = $"Admin finalised transfer of mentor '{mentor.FullName}' to department {request.ToDepartmentId}",
            PerformedByUserId = CurrentUserId,
            DepartmentId = request.ToDepartmentId
        });
        await _db.SaveChangesAsync();
        return Ok(new { message = "Transfer finalised" });
    }

    [HttpGet("transfers")]
    public async Task<IActionResult> GetMentorTransfers([FromQuery] MentorTransferStatus? status)
    {
        var query = _db.MentorTransferRequests
            .Include(t => t.Mentor)
            .Include(t => t.FromDepartment)
            .Include(t => t.ToDepartment)
            .AsQueryable();
        if (status.HasValue) query = query.Where(t => t.Status == status.Value);

        var transfers = await query.OrderByDescending(t => t.CreatedAt).Select(t => new
        {
            t.Id,
            mentorId = t.MentorId,
            mentorName = t.Mentor.FullName,
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

    // Re-upload signature for an existing signatory (edit mentor flow)
    [HttpPut("mentors/{mentorId}/signatory")]
    public async Task<IActionResult> UpdateMentorSignatory(int mentorId, IFormFile signature)
    {
        if (signature == null)
            return BadRequest(new { message = "A signature image is required" });

        var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null) return NotFound();

        var head = await _db.DepartmentHeads.FirstOrDefaultAsync(h => h.MentorId == mentorId);
        if (head == null)
            return BadRequest(new { message = "Mentor is not a signatory" });

        if (!string.IsNullOrEmpty(head.SignatureImagePath))
            _files.DeleteFile(head.SignatureImagePath);
        head.SignatureImagePath = await _files.SaveSignatureAsync(signature, head.Id);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentHeadUpdated,
            Description = $"Signature updated for signatory '{mentor.FullName}'",
            PerformedByUserId = CurrentUserId,
            DepartmentId = head.DepartmentId
        });
        await _db.SaveChangesAsync();
        return Ok(new { message = "Signature updated", headId = head.Id });
    }

    // ─── Intern documents (uploaded + issued) ──────────────────────────────
    [HttpGet("interns/{internId}/documents")]
    public async Task<IActionResult> GetInternDocuments(int internId)
    {
        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == internId);
        if (intern == null) return NotFound();

        var uploaded = await _db.DocumentUploads
            .Where(d => d.InternId == internId && d.WithdrawnAt == null)
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
            .Where(g => g.InternId == internId && g.PdfPath != null)
            .Select(g => new { type = "GatePass", id = g.Id, name = "Gate Pass", filePath = g.PdfPath, issuedAt = g.ApprovedAt })
            .ToListAsync();
        var idCards = await _db.IdCardRequests
            .Where(c => c.InternId == internId && c.PdfPath != null)
            .Select(c => new { type = "IDCard", id = c.Id, name = "ID Card", filePath = c.PdfPath, issuedAt = c.ApprovedAt })
            .ToListAsync();
        var certificates = await _db.Certificates
            .Where(c => c.InternId == internId && c.PdfPath != null)
            .Select(c => new { type = "Certificate", id = c.Id, name = c.ProjectName ?? "Certificate", filePath = c.PdfPath, issuedAt = c.ApprovedAt })
            .ToListAsync();

        var issued = gatePasses.Concat(idCards).Concat(certificates).ToList();

        return Ok(new { uploaded, issued });
    }

    // ─── Interns ─────────────────────────────────────────────────────────────
    [HttpGet("interns")]
    public async Task<IActionResult> GetInterns([FromQuery] int? departmentId, [FromQuery] int? mentorId)
    {
        var query = _db.Interns
            .Include(i => i.User)
            .Include(i => i.Department)
            .Include(i => i.Mentor)
            .AsQueryable();

        if (departmentId.HasValue) query = query.Where(i => i.DepartmentId == departmentId);
        if (mentorId.HasValue) query = query.Where(i => i.MentorId == mentorId);

        var interns = await query.Select(i => new
        {
            i.Id,
            i.FullName,
            i.RegNo,
            i.CNIC,
            i.University,
            i.Degree,
            i.Gender,
            i.DepartmentId,
            i.MentorId,
            username = i.User.Username,
            isActive = i.User.IsActive,
            department = i.Department.Name,
            mentor = i.Mentor.FullName,
            i.StartDate,
            i.EndDate,
            i.FaceEnrolled,
            faceEnrollmentStatus = i.FaceEnrollmentStatus.ToString(),
            faceRejectedReason = i.FaceRejectedReason,
            i.CreatedAt,
            isExpired = DateTime.Now > i.EndDate,
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

    // ─── Face Enrollment Approvals ─────────────────────────────────────────
    [HttpGet("face-approvals")]
    public async Task<IActionResult> GetFaceApprovals()
    {
        var interns = await _db.Interns
            .Include(i => i.User)
            .Include(i => i.Department)
            .Include(i => i.Mentor)
            .Include(i => i.FaceEnrollmentRecords)
            .Where(i => i.FaceEnrollmentStatus != FaceEnrollmentStatus.NotEnrolled)
            .Select(i => new
            {
                i.Id,
                i.FullName,
                username = i.User.Username,
                department = i.Department.Name,
                mentor = i.Mentor.FullName,
                i.DepartmentId,
                i.MentorId,
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
        var intern = await _db.Interns
            .AsNoTracking()
            .Include(i => i.Department)
            .FirstOrDefaultAsync(i => i.Id == id);
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
            ("FaceEnrollmentStatus", WhereOp.Equal, FaceEnrollmentStatus.Pending.ToString()));
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
        return Ok(new { message = "Face enrollment approved" });
    }

    [Idempotent]
    [HttpPost("interns/{id}/face/reject")]
    public async Task<IActionResult> RejectFaceEnrollment(int id, [FromBody] RejectRequest req)
    {
        var intern = await _db.Interns
            .AsNoTracking()
            .Include(i => i.Department)
            .FirstOrDefaultAsync(i => i.Id == id);
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
            ("FaceEnrollmentStatus", WhereOp.Equal, FaceEnrollmentStatus.Pending.ToString()));
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
        return Ok(new { message = "Face enrollment rejected" });
    }

    [Idempotent]
    [HttpPost("interns")]
    public async Task<IActionResult> CreateIntern([FromBody] AdminCreateInternRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Full name is required" });
        if (string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { message = "Password is required" });
        var createPolicyError = PasswordPolicy.Validate(req.Password);
        if (createPolicyError != null)
            return BadRequest(new { message = createPolicyError });
        if (req.MentorId <= 0)
            return BadRequest(new { message = "A mentor must be selected" });

        var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == req.MentorId);
        if (mentor == null)
            return BadRequest(new { message = "Invalid mentor" });

        if (req.StartDate.Date < DateTime.Today)
            return BadRequest(new { message = "Start date cannot be in the past" });
        if (req.ShiftId.HasValue && !await _db.Shifts.AnyAsync(s => s.Id == req.ShiftId && (s.IsCompanyWide || s.DepartmentId == mentor.DepartmentId)))
            return BadRequest(new { message = "Invalid shift for this department" });

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
            CreatedAt = DateTime.Now
        };
        _db.Interns.Add(intern);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternCreated,
            Description = $"Created intern '{req.FullName}' ({username})",
            PerformedByUserId = CurrentUserId,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(user.Id, "Welcome to your internship",
            $"Your intern account was created. Username: {username}", NotificationType.General);

        if (username.Contains('@'))
        {
            await _email.SendAsync(username, "Your PIA Internship account",
                $"<p>Hello {intern.FullName},</p><p>Your intern account has been created.</p>" +
                $"<p>Username: <b>{username}</b></p>" +
                "<p>A temporary password was set for you. Ask your administrator for it and change it after your first login.</p>");
        }

        return Ok(new { message = "Intern created", internId = intern.Id, username });
    }

    [HttpPut("interns/{id}")]
    public async Task<IActionResult> UpdateIntern(int id, [FromBody] AdminUpdateInternRequest req)
    {
        var intern = await _db.Interns
            .Include(i => i.User)
            .FirstOrDefaultAsync(i => i.Id == id);
        if (intern == null) return NotFound();
        var prevMentorId = intern.MentorId;
        var prevActive = intern.User.IsActive;

        if (!string.IsNullOrWhiteSpace(req.Username) && req.Username.Trim() != intern.User.Username)
        {
            if (await _db.Users.AnyAsync(u => u.Username == req.Username.Trim()))
                return BadRequest(new { message = $"Username '{req.Username.Trim()}' already exists" });
            intern.User.Username = req.Username.Trim();
        }
        if (!string.IsNullOrWhiteSpace(req.Password))
        {
            var updatePolicyError = PasswordPolicy.Validate(req.Password);
            if (updatePolicyError != null)
                return BadRequest(new { message = updatePolicyError });
            intern.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
            intern.User.TokenVersion++;
        }
        intern.User.IsActive = req.IsActive;

        if (!string.IsNullOrWhiteSpace(req.FullName)) intern.FullName = req.FullName.Trim();
        if (req.CNIC != null) intern.CNIC = req.CNIC;
        if (req.University != null) intern.University = req.University;
        if (req.Degree != null) intern.Degree = req.Degree;
        if (req.Gender.HasValue) intern.Gender = req.Gender;

        if (req.DepartmentId.HasValue && req.DepartmentId.Value > 0)
            intern.DepartmentId = req.DepartmentId.Value;
        if (req.MentorId.HasValue && req.MentorId.Value > 0)
            intern.MentorId = req.MentorId.Value;

        if (req.StartDate.HasValue)
        {
            if (req.StartDate.Value.Date != intern.StartDate.Date && req.StartDate.Value.Date < DateTime.Today)
                return BadRequest(new { message = "Start date cannot be in the past" });
            intern.StartDate = req.StartDate.Value;
        }
        if (req.EndDate.HasValue) intern.EndDate = req.EndDate.Value;
        if (req.ShiftId.HasValue)
        {
            if (!await _db.Shifts.AnyAsync(s => s.Id == req.ShiftId.Value && (s.IsCompanyWide || s.DepartmentId == req.DepartmentId)))
                return BadRequest(new { message = "Invalid shift for this department" });
            intern.ShiftId = req.ShiftId.Value;
        }

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternUpdated,
            Description = $"Updated intern '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();

        if (!intern.User.IsActive && prevActive)
            await _notifications.NotifyAsync(intern.UserId, "Account deactivated",
                "Your intern account has been deactivated by the admin.", NotificationType.General,
                "Intern", (int)intern.Id, CurrentUserId, (int)intern.Id, intern.DepartmentId);
        if (req.MentorId.HasValue && req.MentorId.Value > 0 && req.MentorId.Value != prevMentorId)
            await _notifications.NotifyAsync(intern.UserId, "Mentor assigned",
                "Your assigned mentor was updated by the admin.", NotificationType.MentorAssignment,
                "Intern", (int)intern.Id, CurrentUserId, (int)intern.Id, intern.DepartmentId);

        return Ok(new { message = "Intern updated" });
    }

    // ─── Admin: Reset Intern Password ─────────────────────────────────────────
    [HttpPatch("interns/{internId}/reset-password")]
    public async Task<IActionResult> ResetInternPassword(int internId, [FromBody] ResetPasswordRequest req)
    {
        var intern = await _db.Interns.Include(i => i.User)
            .FirstOrDefaultAsync(i => i.Id == internId);
        if (intern == null) return NotFound();

        var policyError = PasswordPolicy.Validate(req.NewPassword);
        if (policyError != null)
            return BadRequest(new { message = policyError });

        intern.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        intern.User.MustChangePassword = true;
        intern.User.TokenVersion++;
        intern.User.RefreshToken = null;
        intern.User.RefreshTokenExpiry = null;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.PasswordReset,
            Description = $"Admin reset password for intern '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(intern.UserId, "Password reset",
            "Your password was reset by the administrator", NotificationType.PasswordReset);
        return Ok(new { message = "Password reset successfully" });
    }

    // ─── Admin: Reset Face Enrollment (keeps prior record in history) ────────
    [HttpPost("interns/{id}/face/reset")]
    public async Task<IActionResult> ResetFaceEnrollment(int id)
    {
        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == id);
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

    [HttpGet("interns/{id}/face-records")]
    public async Task<IActionResult> GetFaceRecords(int id)
    {
        var records = await _db.FaceEnrollmentRecords
            .Where(r => r.InternId == id)
            .OrderByDescending(r => r.EnrolledAt)
            .Select(r => new { r.Id, r.Status, r.EnrolledAt, r.PhotoPath, r.PhotoThumbPath })
            .ToListAsync();
        return Ok(records);
    }

    // ─── Activity Logs (categorized by department) ────────────────────────────
    [HttpGet("logs")]
    public async Task<IActionResult> GetLogs(
        [FromQuery] int? departmentId,
        [FromQuery] string? logType,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var query = _db.ActivityLogs
            .Include(a => a.PerformedByUser)
            .Include(a => a.TargetIntern)
            .Include(a => a.Department)
            .AsQueryable();

        if (departmentId.HasValue) query = query.Where(a => a.DepartmentId == departmentId);
        if (!string.IsNullOrEmpty(logType) && Enum.TryParse<ActivityLogType>(logType, out var lt))
            query = query.Where(a => a.LogType == lt);
        if (from.HasValue) query = query.Where(a => a.CreatedAt >= from);
        if (to.HasValue) query = query.Where(a => a.CreatedAt <= to);

        var total = await query.CountAsync();
        var logs = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.Id,
                logType = a.LogType.ToString(),
                a.Description,
                a.Metadata,
                performedBy = a.PerformedByUser != null ? a.PerformedByUser.Username : null,
                targetIntern = a.TargetIntern != null ? a.TargetIntern.FullName : null,
                department = a.Department != null ? a.Department.Name : null,
                a.DepartmentId,
                a.CreatedAt
            }).ToListAsync();

        return Ok(new { total, page, pageSize, logs });
    }

    // ─── Departments ─────────────────────────────────────────────────────────
    [HttpGet("departments")]
    public async Task<IActionResult> GetDepartments()
    {
        var depts = await _db.Departments
            .Where(d => d.IsActive)
            .Select(d => new
            {
                d.Id, d.Name, d.Code, d.Address, d.Latitude, d.Longitude, d.RadiusMeters,
                internCount = d.Interns.Count,
                mentorCount = d.Mentors.Count
            }).ToListAsync();
        return Ok(depts);
    }

    [Idempotent]
    [HttpPost("departments")]
    public async Task<IActionResult> CreateDepartment([FromBody] CreateDepartmentRequest req)
    {
        // B6: geofence radius is centralised; always 100m regardless of request value.
        var dept = new Department
        {
            Name = req.Name, Code = req.Code, Address = req.Address,
            Latitude = req.Latitude, Longitude = req.Longitude, RadiusMeters = 100,
            IsActive = true, CreatedAt = DateTime.Now
        };
        _db.Departments.Add(dept);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentCreated,
            Description = $"Created department '{dept.Name}'",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Department created", deptId = dept.Id });
    }

    [HttpPut("departments/{id}")]
    public async Task<IActionResult> UpdateDepartment(int id, [FromBody] AdminUpdateDepartmentRequest req)
    {
        var dept = await _db.Departments.FirstOrDefaultAsync(d => d.Id == id);
        if (dept == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(req.Name)) dept.Name = req.Name.Trim();
        if (req.Code != null) dept.Code = req.Code.Trim();
        if (req.Address != null) dept.Address = req.Address.Trim();
        if (req.Latitude.HasValue) dept.Latitude = req.Latitude;
        if (req.Longitude.HasValue) dept.Longitude = req.Longitude;
        // B6: radius is centralised at 100m and not editable.

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentUpdated,
            Description = $"Updated department '{dept.Name}'",
            PerformedByUserId = CurrentUserId,
            DepartmentId = dept.Id
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Department updated" });
    }

    [HttpDelete("departments/{id}")]
    public async Task<IActionResult> DeleteDepartment(int id)
    {
        var dept = await _db.Departments.FirstOrDefaultAsync(d => d.Id == id);
        if (dept == null) return NotFound();

        if (await _db.Interns.AnyAsync(i => i.DepartmentId == id))
            return BadRequest(new { message = "Cannot delete: department still has interns" });
        if (await _db.Mentors.AnyAsync(m => m.DepartmentId == id))
            return BadRequest(new { message = "Cannot delete: department still has mentors" });
        if (await _db.DepartmentHeads.AnyAsync(dh => dh.DepartmentId == id))
            return BadRequest(new { message = "Cannot delete: department still has signatories" });

        dept.IsActive = false;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentDeleted,
            Description = $"Deleted department '{dept.Name}'",
            PerformedByUserId = CurrentUserId,
            DepartmentId = dept.Id
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Department deleted" });
    }

    // ─── Document Approvals (all interns) ────────────────────────────────────
    [HttpGet("documents")]
    public async Task<IActionResult> GetDocuments([FromQuery] string? status, [FromQuery] int? internId)
    {
        var query = _db.DocumentUploads
            .Include(d => d.Intern).ThenInclude(i => i.Department)
            .Include(d => d.Intern).ThenInclude(i => i.User)
            .Where(d => d.WithdrawnAt == null)
            .AsQueryable();

        if (internId.HasValue)
            query = query.Where(d => d.InternId == internId.Value);

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<DocumentRequestStatus>(status, out var s))
            query = query.Where(d => d.Status == s);

        var docs = await query.OrderByDescending(d => d.UploadedAt).Select(d => new
        {
            d.Id,
            internId = d.InternId,
            internName = d.Intern.FullName,
            username = d.Intern.User.Username,
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
        var doc = await _db.DocumentUploads
            .AsNoTracking()
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id);
        if (doc == null) return NotFound();

        var affected = await StateTransitions.TryUpdateAsync(_db, "document approval", "DocumentUploads", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Approved.ToString()),
                ("ApprovedByUserId", CurrentUserId),
                ("ApprovedAt", DateTime.Now)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()),
            ("WithdrawnAt", WhereOp.IsNull, null));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This document was already decided or withdrawn. Refresh and try again." });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentApproved,
            Description = $"{doc.DocumentType} document approved for '{doc.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = doc.InternId,
            DepartmentId = doc.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Document approved" });
    }

    [Idempotent]
    [HttpPost("documents/{id}/reject")]
    public async Task<IActionResult> RejectDocument(int id, [FromBody] RejectRequest req)
    {
        var doc = await _db.DocumentUploads
            .AsNoTracking()
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id);
        if (doc == null) return NotFound();

        var affected = await StateTransitions.TryUpdateAsync(_db, "document rejection", "DocumentUploads", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Rejected.ToString()),
                ("RejectionReason", req.Reason)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()),
            ("WithdrawnAt", WhereOp.IsNull, null));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This document was already decided or withdrawn. Refresh and try again." });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentRejected,
            Description = $"{doc.DocumentType} document rejected for '{doc.Intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = doc.InternId,
            DepartmentId = doc.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Document rejected" });
    }

    [HttpDelete("documents/{id}")]
    public async Task<IActionResult> DeleteDocument(int id)
    {
        var doc = await _db.DocumentUploads
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id);
        if (doc == null) return NotFound();

        _files.DeleteFile(doc.FilePath);
        _db.DocumentUploads.Remove(doc);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentDeleted,
            Description = $"{doc.DocumentType} document deleted for '{doc.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = doc.InternId,
            DepartmentId = doc.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Document deleted" });
    }

    // ─── Department Heads ────────────────────────────────────────────────────
    [HttpGet("department-heads")]
    public async Task<IActionResult> GetDepartmentHeads()
    {
        var heads = await _db.DepartmentHeads
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new
            {
                h.Id, h.Name, h.Designation, h.SignatureImagePath, h.DepartmentId, h.MentorId,
                departmentName = h.Department != null ? h.Department.Name : null,
                h.CreatedAt
            }).ToListAsync();
        return Ok(heads);
    }

    [Idempotent]
    [HttpPost("department-heads")]
    public async Task<IActionResult> CreateDepartmentHead(
        [FromForm] string name, [FromForm] string? designation, [FromForm] int departmentId,
        [FromForm] int mentorId, IFormFile? signature)
    {
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Name is required" });
        if (signature == null)
            return BadRequest(new { message = "A signature image is required." });
        if (!await _db.Departments.AnyAsync(d => d.Id == departmentId && d.IsActive))
            return BadRequest(new { message = "Invalid department" });

        var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null)
            return BadRequest(new { message = "Mentor not found" });
        if (mentor.DepartmentId != departmentId)
            return BadRequest(new { message = "Mentor must belong to the same department" });
        if (await _db.DepartmentHeads.AnyAsync(h => h.MentorId == mentorId))
            return BadRequest(new { message = "This mentor is already a signatory." });

        var head = new DepartmentHead
        {
            Name = name.Trim(),
            Designation = string.IsNullOrWhiteSpace(designation) ? mentor.Designation : designation.Trim(),
            DepartmentId = departmentId,
            MentorId = mentorId,
            CreatedAt = DateTime.Now
        };
        _db.DepartmentHeads.Add(head);
        await _db.SaveChangesAsync();

        head.SignatureImagePath = await _files.SaveSignatureAsync(signature, head.Id);
        await _db.SaveChangesAsync();

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentHeadCreated,
            Description = $"Department head '{head.Name}' created with signature",
            PerformedByUserId = CurrentUserId
        });

        return Ok(new { message = "Department head created", headId = head.Id });
    }

[HttpPut("department-heads/{id}")]
    public async Task<IActionResult> UpdateDepartmentHead(int id,
        [FromForm] string? name, [FromForm] string? designation, [FromForm] int? departmentId,
        IFormFile? signature)
    {
        var head = await _db.DepartmentHeads.FirstOrDefaultAsync(h => h.Id == id);
        if (head == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(name)) head.Name = name.Trim();
        if (!string.IsNullOrWhiteSpace(designation)) head.Designation = designation.Trim();
        if (departmentId.HasValue)
        {
            if (!await _db.Departments.AnyAsync(d => d.Id == departmentId.Value && d.IsActive))
                return BadRequest(new { message = "Invalid department" });
            head.DepartmentId = departmentId.Value;
        }

        if (HttpContext.Request.Form.ContainsKey("mentorId"))
        {
            var mentorId = HttpContext.Request.Form["mentorId"].ToString();
            if (string.IsNullOrWhiteSpace(mentorId))
            {
                head.MentorId = null;
            }
            else
            {
                if (!int.TryParse(mentorId, out var mId))
                    return BadRequest(new { message = "Invalid mentor" });
                var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == mId);
                if (mentor == null)
                    return BadRequest(new { message = "Mentor not found" });
                if (head.DepartmentId.HasValue && mentor.DepartmentId != head.DepartmentId.Value)
                    return BadRequest(new { message = "Mentor must belong to the same department" });
                head.MentorId = mId;
            }
        }

        if (signature != null)
        {
            var newPath = await _files.SaveSignatureAsync(signature, head.Id);
            if (!string.IsNullOrEmpty(head.SignatureImagePath))
                _files.DeleteFile(head.SignatureImagePath);
            head.SignatureImagePath = newPath;
        }

        await _db.SaveChangesAsync();

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentHeadUpdated,
            Description = $"Department head '{head.Name}' updated",
            PerformedByUserId = CurrentUserId
        });

        return Ok(new { message = "Department head updated" });
    }

    [HttpDelete("department-heads/{id}")]
    public async Task<IActionResult> DeleteDepartmentHead(int id)
    {
        var head = await _db.DepartmentHeads.FirstOrDefaultAsync(h => h.Id == id);
        if (head == null) return NotFound();

        if (!string.IsNullOrEmpty(head.SignatureImagePath))
            _files.DeleteFile(head.SignatureImagePath);
        _db.DepartmentHeads.Remove(head);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentHeadDeleted,
            Description = $"Department head '{head.Name}' deleted",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Department head deleted" });
    }

    // ─── Certificate Approvals (all interns) ─────────────────────────────────
    [HttpGet("certificates")]
    public async Task<IActionResult> GetCertificates([FromQuery] string? status)
    {
        var query = _db.Certificates
            .Include(c => c.Intern).ThenInclude(i => i.Department)
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
        var cert = await _db.Certificates
            .Include(c => c.Intern).ThenInclude(i => i.Department)
            .FirstOrDefaultAsync(c => c.Id == id);
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
        cert.ApprovedAt = now;
        if (req?.MentorNotes != null) cert.MentorProjectNotes = req.MentorNotes.Trim();

        var sets = new List<(string Column, object? Value)>
        {
            ("Status", CertificateStatus.Approved.ToString()),
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
            DepartmentId = cert.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Certificate approved", pdfPath });
    }

    [Idempotent]
    [HttpPost("certificates/{id}/reject")]
    public async Task<IActionResult> RejectCertificate(int id, [FromBody] RejectRequest req)
    {
        var cert = await _db.Certificates
            .AsNoTracking()
            .Include(c => c.Intern)
            .FirstOrDefaultAsync(c => c.Id == id);
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
            DepartmentId = cert.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Certificate rejected" });
    }

    [HttpDelete("certificates/{id}")]
    public async Task<IActionResult> DeleteCertificate(int id)
    {
        var cert = await _db.Certificates
            .Include(c => c.Intern)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (cert == null) return NotFound();
        if (string.IsNullOrEmpty(cert.PdfPath))
            return BadRequest(new { message = "Only issued certificates (with a generated PDF) can be deleted." });

        if (cert.PdfPath != null) _files.DeleteFile(cert.PdfPath);
        if (cert.ReportPath != null) _files.DeleteFile(cert.ReportPath);
        _db.Certificates.Remove(cert);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.CertificateDeleted,
            Description = $"Issued certificate deleted for '{cert.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = cert.InternId,
            DepartmentId = cert.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Certificate deleted" });
    }

    // ─── Gate Pass Approvals (all interns) ───────────────────────────────────
    [HttpGet("gatepasses")]
    public async Task<IActionResult> GetGatePasses([FromQuery] string? status)
    {
        var query = _db.GatePasses
            .Include(g => g.Intern).ThenInclude(i => i.Department)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<DocumentRequestStatus>(status, out var s))
            query = query.Where(g => g.Status == s);

        var passes = await query.OrderByDescending(g => g.RequestedAt).Select(g => new
        {
            g.Id,
            internName = g.Intern.FullName,
            internCnic = g.Intern.CNIC,
            department = g.Intern.Department.Name,
            g.StudentIdImagePath, g.CnicImagePath,
            status = g.Status.ToString(),
            g.RequestedAt, g.ApprovedAt, g.RejectionReason, g.PdfPath
        }).ToListAsync();

        return Ok(passes);
    }

    [Idempotent]
    [HttpPost("gatepasses/{id}/approve")]
    public async Task<IActionResult> ApproveGatePass(int id)
    {
        var gatePass = await _db.GatePasses
            .Include(g => g.Intern).ThenInclude(i => i.Department)
            .Include(g => g.Intern.Mentor)
            .Include(g => g.Intern.User)
            .FirstOrDefaultAsync(g => g.Id == id);
        if (gatePass == null) return NotFound();

        if (gatePass.Intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved)
            return BadRequest(new { code = "FACE_NOT_APPROVED", message = $"'{gatePass.Intern.FullName}' must have their face enrollment approved before a gate pass can be issued" });
        if (!await _db.OfficialDocsApprovedAsync(gatePass.InternId))
            return BadRequest(new { code = "DOCS_NOT_APPROVED", message = $"'{gatePass.Intern.FullName}' must have their CNIC and CV/Resume approved before a gate pass can be issued" });

        var affected = await StateTransitions.TryUpdateAsync(_db, "gate pass approval", "GatePasses", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Approved.ToString()),
                ("ApprovedAt", DateTime.Now)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This gate pass was already decided. Refresh and try again." });

        var pdfPath = _pdf.GenerateGatePassPdf(gatePass, gatePass.Intern, gatePass.Intern.Mentor!, gatePass.Intern.Department!);

        gatePass.PdfPath = pdfPath;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.GatePassApproved,
            Description = $"Gate pass approved for '{gatePass.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = gatePass.InternId,
            DepartmentId = gatePass.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Gate pass approved", pdfPath });
    }

    [Idempotent]
    [HttpPost("gatepasses/batch-approve")]
    public async Task<IActionResult> BatchApproveGatePasses([FromBody] BatchApproveGatePassRequest req)
    {
        if (req.GatePassIds == null || req.GatePassIds.Length == 0)
            return BadRequest(new { message = "No gate passes selected" });
        if (req.GatePassIds.Length > 100)
            return BadRequest(new { message = "A maximum of 100 gate passes can be approved at once" });

        var passes = await _db.GatePasses
            .Include(g => g.Intern).ThenInclude(i => i.Department)
            .Include(g => g.Intern.Mentor)
            .Include(g => g.Intern.User)
            .Where(g => req.GatePassIds.Contains(g.Id) && g.Status == DocumentRequestStatus.Pending)
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
                ("ApprovedAt", now)
            },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "None of the selected gate passes are still pending. Refresh and try again." });

        var winners = await _db.GatePasses
            .Include(g => g.Intern).ThenInclude(i => i.Department)
            .Include(g => g.Intern.Mentor)
            .Where(g => passes.Select(p => p.Id).Contains(g.Id)
                && g.Status == DocumentRequestStatus.Approved)
            .ToListAsync();

        var lettersGenerated = 0;

        foreach (var deptGroup in winners.GroupBy(g => g.Intern.DepartmentId))
        {
            var department = deptGroup.First().Intern.Department!;
            var mentor = deptGroup.First().Intern.Mentor!;
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
        return Ok(new { message = $"{winners.Count} gate passes approved{(skippedFaceNotApproved > 0 ? $" ({skippedFaceNotApproved} skipped - face not approved)" : "")}{(skippedDocsNotApproved > 0 ? $" ({skippedDocsNotApproved} skipped - CNIC/CV not approved)" : "")}", approvedCount = winners.Count, lettersGenerated, skippedFaceNotApproved, skippedDocsNotApproved });
    }

    [Idempotent]
    [HttpPost("gatepasses/{id}/reject")]
    public async Task<IActionResult> RejectGatePass(int id, [FromBody] RejectRequest req)
    {
        var gatePass = await _db.GatePasses
            .AsNoTracking()
            .Include(g => g.Intern)
            .FirstOrDefaultAsync(g => g.Id == id);
        if (gatePass == null) return NotFound();

        var affected = await StateTransitions.TryUpdateAsync(_db, "gate pass rejection", "GatePasses", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Rejected.ToString()),
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
            DepartmentId = gatePass.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Gate pass rejected" });
    }

    [HttpDelete("gatepasses/{id}")]
    public async Task<IActionResult> DeleteGatePass(int id)
    {
        var gatePass = await _db.GatePasses
            .Include(g => g.Intern)
            .FirstOrDefaultAsync(g => g.Id == id);
        if (gatePass == null) return NotFound();
        if (string.IsNullOrEmpty(gatePass.PdfPath))
            return BadRequest(new { message = "Only issued gate passes (with a generated PDF) can be deleted." });

        if (gatePass.PdfPath != null) _files.DeleteFile(gatePass.PdfPath);
        _db.GatePasses.Remove(gatePass);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.GatePassDeleted,
            Description = $"Issued gate pass deleted for '{gatePass.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = gatePass.InternId,
            DepartmentId = gatePass.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Gate pass deleted" });
    }

    // ─── ID Card Approvals (all interns) ────────────────────────────────────
    [HttpGet("idcards")]
    public async Task<IActionResult> GetIdCardRequests([FromQuery] string? status)
    {
        var query = _db.IdCardRequests
            .Include(i => i.Intern).ThenInclude(i => i.Department)
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
        var req = await _db.IdCardRequests
            .Include(i => i.Intern).ThenInclude(i => i.Department)
            .Include(i => i.Intern).ThenInclude(i => i.Mentor)
            .Include(i => i.Intern).ThenInclude(i => i.FaceEnrollmentRecords)
            .FirstOrDefaultAsync(i => i.Id == id);
        if (req == null) return NotFound();

        if (req.Intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved)
            return BadRequest(new { code = "FACE_NOT_APPROVED", message = $"'{req.Intern.FullName}' must have their face enrollment approved before an ID card can be issued" });
        if (!await _db.OfficialDocsApprovedAsync(req.InternId))
            return BadRequest(new { code = "DOCS_NOT_APPROVED", message = $"'{req.Intern.FullName}' must have their CNIC and CV/Resume approved before an ID card can be issued" });

        var affected = await StateTransitions.TryUpdateAsync(_db, "ID card approval", "IdCardRequests", id,
            new (string, object?)[]
            {
                ("Status", DocumentRequestStatus.Approved.ToString()),
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
            DepartmentId = req.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "ID card request approved", pdfPath });
    }

    [Idempotent]
    [HttpPost("idcards/{id}/reject")]
    public async Task<IActionResult> RejectIdCard(int id, [FromBody] RejectRequest req)
    {
        var idReq = await _db.IdCardRequests
            .AsNoTracking()
            .Include(i => i.Intern)
            .FirstOrDefaultAsync(i => i.Id == id);
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
            DepartmentId = idReq.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "ID card request rejected" });
    }

    [HttpDelete("idcards/{id}")]
    public async Task<IActionResult> DeleteIdCard(int id)
    {
        var idReq = await _db.IdCardRequests
            .Include(i => i.Intern)
            .FirstOrDefaultAsync(i => i.Id == id);
        if (idReq == null) return NotFound();
        if (string.IsNullOrEmpty(idReq.PdfPath))
            return BadRequest(new { message = "Only issued ID cards (with a generated PDF) can be deleted." });

        if (idReq.PdfPath != null) _files.DeleteFile(idReq.PdfPath);
        _db.IdCardRequests.Remove(idReq);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.IdCardDeleted,
            Description = $"Issued ID card deleted for '{idReq.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = idReq.InternId,
            DepartmentId = idReq.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "ID card deleted" });
    }

    // ─── Attendance (all interns) ────────────────────────────────────────────
    [HttpGet("attendance")]
    public async Task<IActionResult> GetAttendance(
        [FromQuery] int? departmentId,
        [FromQuery] int? internId,
        [FromQuery] DateTime? date,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var query = _db.Attendances
            .Include(a => a.Intern).ThenInclude(i => i.Department)
            .AsQueryable();

        if (departmentId.HasValue) query = query.Where(a => a.Intern.DepartmentId == departmentId);
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
                username = a.Intern.User.Username,
                department = a.Intern.Department.Name,
                a.Timestamp,
                a.OutTime,
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

    [HttpPut("attendance/{id}")]
    public async Task<IActionResult> UpdateAttendance(int id, [FromBody] AdminUpdateAttendanceRequest req)
    {
        var attendance = await _db.Attendances
            .Include(a => a.Intern)
            .FirstOrDefaultAsync(a => a.Id == id);
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

        attendance.Status = attendance.IsOnLeave ? AttendanceStatus.Absent : AttendanceStatus.Present;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.AttendanceEdited,
            Description = $"Admin edited attendance for '{attendance.Intern.FullName}' on {attendance.Timestamp:yyyy-MM-dd} (in {attendance.Timestamp:HH:mm} / out {attendance.OutTime:HH:mm})",
            PerformedByUserId = CurrentUserId,
            TargetInternId = attendance.InternId,
            DepartmentId = attendance.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Attendance updated" });
    }

    // ─── Settings & Holidays ─────────────────────────────────────────────────
    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var s = await _db.AttendanceSettings.FirstOrDefaultAsync(x => x.Id == 1);
        return Ok(new
        {
            graceMinutes = s?.GraceMinutes ?? 15,
            thresholdPct = s?.ThresholdPct ?? 80,
            allowedLeaveDays = s?.AllowedLeaveDays ?? 0,
            taskThresholdPct = s?.TaskThresholdPct ?? 80,
            signatureRequired = s?.SignatureRequired ?? false
        });
    }

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateSettingsRequest req)
    {
        if (req.GraceMinutes < 0 || req.GraceMinutes > 120)
            return BadRequest(new { message = "Grace minutes must be between 0 and 120" });
        if (req.ThresholdPct <= 0 || req.ThresholdPct > 100)
            return BadRequest(new { message = "Threshold percentage must be between 1 and 100" });
        if (req.AllowedLeaveDays < 0 || req.AllowedLeaveDays > 60)
            return BadRequest(new { message = "Allowed leave days must be between 0 and 60" });
        if (req.TaskThresholdPct is not null and (< 0 or > 100))
            return BadRequest(new { message = "Task threshold percentage must be between 0 and 100" });

        var s = await _db.AttendanceSettings.FirstOrDefaultAsync(x => x.Id == 1);
        if (s == null)
        {
            s = new AttendanceSettings { Id = 1 };
            _db.AttendanceSettings.Add(s);
        }
        s.GraceMinutes = req.GraceMinutes;
        s.ThresholdPct = req.ThresholdPct;
        s.AllowedLeaveDays = req.AllowedLeaveDays;
        if (req.TaskThresholdPct.HasValue) s.TaskThresholdPct = req.TaskThresholdPct.Value;
        if (req.SignatureRequired.HasValue) s.SignatureRequired = req.SignatureRequired.Value;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.SettingsUpdated,
            Description = $"Admin updated attendance settings (grace: {s.GraceMinutes} min, attendance threshold: {s.ThresholdPct}%, task threshold: {s.TaskThresholdPct}%, allowed leave days: {s.AllowedLeaveDays}, signature required: {s.SignatureRequired})",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new
        {
            message = "Settings updated",
            graceMinutes = s.GraceMinutes,
            thresholdPct = s.ThresholdPct,
            allowedLeaveDays = s.AllowedLeaveDays,
            taskThresholdPct = s.TaskThresholdPct,
            signatureRequired = s.SignatureRequired
        });
    }

    [HttpGet("holidays")]
    public async Task<IActionResult> GetHolidays()
    {
        var holidays = await _db.PublicHolidays
            .OrderBy(h => h.Date)
            .Select(h => new { h.Id, h.Date, h.Name })
            .ToListAsync();
        return Ok(holidays);
    }

    [HttpPost("holidays")]
    public async Task<IActionResult> CreateHoliday([FromBody] UpsertHolidayRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Holiday name is required" });
        if (await _db.PublicHolidays.AnyAsync(h => h.Date == req.Date))
            return BadRequest(new { message = "A holiday already exists for this date" });

        var holiday = new PublicHoliday { Date = req.Date, Name = req.Name.Trim() };
        _db.PublicHolidays.Add(holiday);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.HolidayAdded,
            Description = $"Admin added public holiday '{holiday.Name}' on {holiday.Date}",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Holiday added", holidayId = holiday.Id });
    }

    [HttpPut("holidays/{id}")]
    public async Task<IActionResult> UpdateHoliday(int id, [FromBody] UpsertHolidayRequest req)
    {
        var holiday = await _db.PublicHolidays.FirstOrDefaultAsync(h => h.Id == id);
        if (holiday == null) return NotFound();
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Holiday name is required" });

        holiday.Date = req.Date;
        holiday.Name = req.Name.Trim();

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.HolidayUpdated,
            Description = $"Admin updated public holiday #{holiday.Id}",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Holiday updated" });
    }

    [HttpDelete("holidays/{id}")]
    public async Task<IActionResult> DeleteHoliday(int id)
    {
        var holiday = await _db.PublicHolidays.FirstOrDefaultAsync(h => h.Id == id);
        if (holiday == null) return NotFound();

        _db.PublicHolidays.Remove(holiday);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.HolidayDeleted,
            Description = $"Admin deleted public holiday '{holiday.Name}'",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Holiday deleted" });
    }

    // ─── Shifts (B3: full admin CRUD + impact / reassignment guard) ─────────
    [HttpGet("shifts")]
    public async Task<IActionResult> GetShifts()
    {
        var shifts = await _db.Shifts
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
                assignedInterns = _db.Interns.Count(i => i.ShiftId == s.Id && i.User.IsActive)
            }).ToListAsync();
        return Ok(shifts);
    }

    [Idempotent]
    [HttpPost("shifts")]
    public async Task<IActionResult> CreateShift([FromBody] AdminShiftRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Shift name is required" });
        if (req.EndTime == req.StartTime)
            return BadRequest(new { message = "End time must be after start time" });
        if (!req.IsCompanyWide && req.DepartmentId.HasValue &&
            !await _db.Departments.AnyAsync(d => d.Id == req.DepartmentId && d.IsActive))
            return BadRequest(new { message = "Invalid department" });
        if (req.IsCompanyWide && await _db.Shifts.AnyAsync(s => s.Name == req.Name.Trim()))
            return BadRequest(new { message = "A shift with this name already exists" });

        var shift = new Shift
        {
            Name = req.Name.Trim(),
            StartTime = req.StartTime,
            EndTime = req.EndTime,
            IsCompanyWide = req.IsCompanyWide,
            DepartmentId = req.IsCompanyWide ? null : req.DepartmentId,
            IsActive = true
        };
        _db.Shifts.Add(shift);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.ShiftCreated,
            Description = $"Admin created shift '{shift.Name}' ({shift.StartTime:hh\\:mm} - {shift.EndTime:hh\\:mm})",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Shift created", shiftId = shift.Id });
    }

    [HttpPut("shifts/{id}")]
    public async Task<IActionResult> UpdateShift(int id, [FromBody] AdminShiftRequest req)
    {
        var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.Id == id);
        if (shift == null) return NotFound();
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Shift name is required" });
        if (req.EndTime == req.StartTime)
            return BadRequest(new { message = "End time must be after start time" });
        if (req.IsCompanyWide && await _db.Shifts.AnyAsync(s => s.Name == req.Name.Trim() && s.Id != id))
            return BadRequest(new { message = "A shift with this name already exists" });

        shift.Name = req.Name.Trim();
        shift.StartTime = req.StartTime;
        shift.EndTime = req.EndTime;
        shift.IsCompanyWide = req.IsCompanyWide;
        shift.DepartmentId = req.IsCompanyWide ? null : req.DepartmentId;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.ShiftUpdated,
            Description = $"Admin updated shift '{shift.Name}'",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Shift updated" });
    }

    [HttpGet("shifts/{id}/impact")]
    public async Task<IActionResult> GetShiftImpact(int id)
    {
        var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.Id == id);
        if (shift == null) return NotFound();

        var assignedInterns = await _db.Interns
            .Where(i => i.ShiftId == id && i.User.IsActive)
            .Select(i => new { i.Id, i.FullName, i.DepartmentId })
            .ToListAsync();
        var openRequests = await _db.InternShiftChangeRequests
            .Include(r => r.Intern)
            .Where(r => r.FromShiftId == id && r.Status == InternShiftChangeStatus.Pending)
            .Select(r => new { r.Id, internName = r.Intern.FullName, requestedShiftId = r.ToShiftId })
            .ToListAsync();

        return Ok(new { assignedInterns, openRequests, canDelete = assignedInterns.Count == 0 && openRequests.Count == 0 });
    }

    [HttpPost("shifts/{id}/toggle")]
    public async Task<IActionResult> ToggleShift(int id)
    {
        var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.Id == id);
        if (shift == null) return NotFound();

        if (shift.IsActive)
        {
            // Only allow deactivation when no active intern is assigned.
            if (await _db.Interns.AnyAsync(i => i.ShiftId == id && i.User.IsActive))
                return BadRequest(new { message = "Cannot deactivate: interns are still assigned to this shift" });
        }
        shift.IsActive = !shift.IsActive;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.ShiftUpdated,
            Description = $"Admin {(shift.IsActive ? "activated" : "deactivated")} shift '{shift.Name}'",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = $"Shift {(shift.IsActive ? "activated" : "deactivated")}", isActive = shift.IsActive });
    }

    [HttpDelete("shifts/{id}")]
    public async Task<IActionResult> DeleteShift(int id)
    {
        var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.Id == id);
        if (shift == null) return NotFound();

        if (await _db.Interns.AnyAsync(i => i.ShiftId == id && i.User.IsActive))
            return BadRequest(new { message = "Cannot delete: interns are still assigned to this shift" });
        if (await _db.InternShiftChangeRequests.AnyAsync(r => (r.FromShiftId == id || r.ToShiftId == id) && r.Status == InternShiftChangeStatus.Pending))
            return BadRequest(new { message = "Cannot delete: open shift-change requests reference this shift" });

        _db.Shifts.Remove(shift);
        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.ShiftUpdated,
            Description = $"Admin deleted shift '{shift.Name}'",
            PerformedByUserId = CurrentUserId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Shift deleted" });
    }

    // ─── Intern Transfers (admin side) ───────────────────────────────────────
    [HttpGet("intern-transfers")]
    public async Task<IActionResult> GetInternTransfers(
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] string? initiatedBy,
        [FromQuery] string? sortBy = "createdat",
        [FromQuery] string? order = "desc")
    {
        var query = _db.InternTransferRequests
            .Include(t => t.Intern)
            .Include(t => t.FromMentor).ThenInclude(m => m.Department)
            .Include(t => t.ToMentor).ThenInclude(m => m.Department)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<InternTransferStatus>(status, out var s))
            query = query.Where(t => t.Status == s);
        if (Enum.TryParse<InternTransferInitiator>(initiatedBy, out var initiator))
            query = query.Where(t => t.InitiatedBy == initiator);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(t => t.Intern.FullName.Contains(term) ||
                                t.FromMentor.FullName.Contains(term) ||
                                t.ToMentor.FullName.Contains(term));
        }

        query = (sortBy?.ToLowerInvariant(), order?.ToLowerInvariant()) switch
        {
            ("intern", "asc") => query.OrderBy(t => t.Intern.FullName),
            ("intern", _) => query.OrderByDescending(t => t.Intern.FullName),
            ("status", "asc") => query.OrderBy(t => t.Status),
            ("status", _) => query.OrderByDescending(t => t.Status),
            ("createdat", "asc") => query.OrderBy(t => t.CreatedAt),
            _ => query.OrderByDescending(t => t.CreatedAt)
        };

        var transfers = await query.Select(t => new
        {
            t.Id,
            internName = t.Intern.FullName,
            t.InternId,
            fromMentor = t.FromMentor.FullName,
            toMentor = t.ToMentor.FullName,
            fromDepartment = t.FromMentor.Department != null ? t.FromMentor.Department.Name : "",
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

    // Admin amends a pending transfer (target mentor and/or notes) before it concludes.
    [HttpPut("transfers/{id}")]
    public async Task<IActionResult> EditInternTransfer(int id, [FromBody] AdminEditTransferRequest req)
    {
        var transfer = await _db.InternTransferRequests.FirstOrDefaultAsync(t => t.Id == id);
        if (transfer == null) return NotFound();
        if (transfer.Status != InternTransferStatus.Pending)
            return BadRequest(new { message = "Only pending transfers can be edited" });

        if (req.ToMentorId.HasValue)
        {
            var toMentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == req.ToMentorId.Value && m.Id != transfer.FromMentorId);
            if (toMentor == null) return BadRequest(new { message = "Target mentor not found" });
            transfer.ToMentorId = toMentor.Id;
        }
        if (req.Notes != null) transfer.Notes = req.Notes;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternTransferInitiated,
            Description = $"Admin edited pending intern transfer #{transfer.Id} (intern #{transfer.InternId})",
            PerformedByUserId = CurrentUserId,
            TargetInternId = transfer.InternId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Transfer updated" });
    }

    // Flow A: admin initiates a transfer of an intern to a specific mentor
    [HttpPost("interns/{id}/transfer")]
    public async Task<IActionResult> InitiateInternTransfer(int id, [FromBody] AdminInitiateInternTransferRequest req)
    {
        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == id);
        if (intern == null) return NotFound();
        var toMentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == req.ToMentorId && m.Id != intern.MentorId);
        if (toMentor == null) return BadRequest(new { message = "Target mentor not found" });
        if (await _db.InternTransferRequests.AnyAsync(t => t.InternId == id &&
            (t.Status == InternTransferStatus.Pending || t.Status == InternTransferStatus.Endorsed || t.Status == InternTransferStatus.InternAccepted)))
            return BadRequest(new { message = "A transfer is already open for this intern" });

        var request = new InternTransferRequest
        {
            InternId = id,
            FromMentorId = intern.MentorId,
            ToMentorId = toMentor.Id,
            InitiatedBy = InternTransferInitiator.Admin,
            InitiatedByUserId = CurrentUserId,
            Status = InternTransferStatus.Pending,
            Notes = req.Notes,
            CreatedAt = DateTime.Now
        };
        _db.InternTransferRequests.Add(request);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternTransferInitiated,
            Description = $"Admin initiated transfer of intern '{intern.FullName}' to mentor '{toMentor.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();

        var fromMentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == intern.MentorId);
        if (fromMentor != null)
            await _notifications.NotifyAsync(fromMentor.UserId, "Intern transfer pending your approval",
                $"Admin wants to transfer '{intern.FullName}' to {toMentor.FullName}", NotificationType.Transfer);

        return Ok(new { message = "Intern transfer initiated", requestId = request.Id });
    }

    // Flow B: admin endorses a mentor-initiated transfer
    [Idempotent]
    [HttpPost("transfers/{id}/endorse")]
    public async Task<IActionResult> EndorseInternTransfer(int id)
    {
        var transfer = await _db.InternTransferRequests
            .FirstOrDefaultAsync(t => t.Id == id && t.InitiatedBy == InternTransferInitiator.Mentor);
        if (transfer == null) return NotFound();
        if (transfer.Status != InternTransferStatus.Pending)
            return BadRequest(new { message = "Only pending transfers can be endorsed" });

        transfer.Status = InternTransferStatus.Endorsed;
        transfer.EndorsedByUserId = CurrentUserId;
        transfer.EndorsedAt = DateTime.Now;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternTransferInitiated,
            Description = $"Admin endorsed intern transfer #{transfer.Id} (intern #{transfer.InternId})",
            PerformedByUserId = CurrentUserId,
            TargetInternId = transfer.InternId
        });

        await _db.SaveChangesAsync();

        var intern = await _db.Interns.Include(i => i.User).FirstOrDefaultAsync(i => i.Id == transfer.InternId);
        if (intern != null)
            await _notifications.NotifyAsync(intern.UserId, "Intern transfer endorsed",
                "Your transfer has been endorsed by the admin — please accept or reject it", NotificationType.Transfer);

        return Ok(new { message = "Transfer endorsed" });
    }

    [Idempotent]
    [HttpPost("transfers/{id}/reject")]
    public async Task<IActionResult> RejectInternTransfer(int id, [FromBody] RejectInternTransferRequest req)
    {
        var transfer = await _db.InternTransferRequests.FirstOrDefaultAsync(t => t.Id == id);
        if (transfer == null) return NotFound();
        if (transfer.Status != InternTransferStatus.Pending)
            return BadRequest(new { message = "Only pending transfers can be rejected" });

        transfer.Status = InternTransferStatus.Rejected;
        transfer.RejectionReason = req.Reason;

        var transferIntern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == transfer.InternId);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternTransferRejected,
            Description = $"Admin rejected intern transfer #{transfer.Id}: {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = transfer.InternId
        });

        await _db.SaveChangesAsync();
        if (transferIntern != null)
            await _notifications.NotifyAsync(
                transferIntern.UserId,
                "Transfer request rejected",
                $"Your transfer request was rejected by the admin.",
                NotificationType.Transfer,
                "InternTransferRequest", (int)transfer.Id, CurrentUserId, transfer.InternId);
        return Ok(new { message = "Transfer rejected" });
    }

    // ─── Leave applications (all interns) ─────────────────────────────────
    [HttpGet("leave-applications")]
    public async Task<IActionResult> GetLeaveApplications()
    {
        var leaves = await _db.LeaveApplications
            .Include(l => l.Intern).ThenInclude(i => i.User)
            .Include(l => l.Intern).ThenInclude(i => i.Department)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync();

        return Ok(leaves.Select(l => new
        {
            l.Id,
            internId = l.InternId,
            internName = l.Intern.FullName,
            username = l.Intern.User.Username,
            department = l.Intern.Department?.Name,
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
        var leave = await _db.LeaveApplications
            .AsNoTracking()
            .Include(l => l.Intern)
            .FirstOrDefaultAsync(l => l.Id == id);
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
            ("Status", WhereOp.Equal, LeaveStatus.Pending.ToString()));
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
            DepartmentId = leave.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(
            leave.Intern.UserId,
            "Leave approved",
            $"Your leave from {leave.StartDate.ToString("dd MMM")} to {leave.EndDate.ToString("dd MMM")} was approved.",
            NotificationType.Leave,
            "LeaveApplication", (int)leave.Id,
            CurrentUserId, (int)leave.InternId, leave.Intern.DepartmentId,
            ActivityLogType.LeaveApproved);
        return Ok(new { message = "Leave approved" });
    }

    [Idempotent]
    [HttpPost("leave-applications/{id}/reject")]
    public async Task<IActionResult> RejectLeave(int id, [FromBody] RejectLeaveRequest req)
    {
        var leave = await _db.LeaveApplications
            .AsNoTracking()
            .Include(l => l.Intern)
            .FirstOrDefaultAsync(l => l.Id == id);
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
            ("Status", WhereOp.Equal, LeaveStatus.Pending.ToString()));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This leave request was already decided. Refresh and try again." });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.LeaveRejected,
            Description = $"Leave rejected for '{leave.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = leave.InternId,
            DepartmentId = leave.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        await _notifications.NotifyAsync(
            leave.Intern.UserId,
            "Leave rejected",
            $"Your leave from {leave.StartDate.ToString("dd MMM")} to {leave.EndDate.ToString("dd MMM")} was rejected.",
            NotificationType.Leave,
            "LeaveApplication", (int)leave.Id,
            CurrentUserId, (int)leave.InternId, leave.Intern.DepartmentId,
            ActivityLogType.LeaveRejected);
        return Ok(new { message = "Leave rejected" });
    }

    // ─── Device MACs (all interns) ─────────────────────────────────────────
    [HttpGet("devices")]
    public async Task<IActionResult> GetAllInternMacDevices()
    {
        var macs = await _db.DeviceMacs
            .Include(m => m.Intern)
            .ToListAsync();

        return Ok(macs.Select(m => new
        {
            internId = m.InternId,
            internName = m.Intern.FullName,
            deviceType = m.DeviceType.ToString(),
            macAddress = m.MacAddress
        }));
    }

    // ─── State snapshots (offline sync precondition checks) ──────────────────
    [HttpGet("documents/{id}/state")]
    public async Task<IActionResult> GetDocumentState(int id)
    {
        var state = await _db.DocumentUploads.AsNoTracking()
            .Where(d => d.Id == id)
            .Select(d => new { d.Id, status = d.Status.ToString(), withdrawn = d.WithdrawnAt != null, d.InternId, mentorId = d.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("gatepasses/{id}/state")]
    public async Task<IActionResult> GetGatePassState(int id)
    {
        var state = await _db.GatePasses.AsNoTracking()
            .Where(g => g.Id == id)
            .Select(g => new { g.Id, status = g.Status.ToString(), g.InternId, mentorId = g.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("idcards/{id}/state")]
    public async Task<IActionResult> GetIdCardState(int id)
    {
        var state = await _db.IdCardRequests.AsNoTracking()
            .Where(i => i.Id == id)
            .Select(i => new { i.Id, status = i.Status.ToString(), i.InternId, mentorId = i.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("certificates/{id}/state")]
    public async Task<IActionResult> GetCertificateState(int id)
    {
        var state = await _db.Certificates.AsNoTracking()
            .Where(c => c.Id == id)
            .Select(c => new { c.Id, status = c.Status.ToString(), c.InternId, mentorId = c.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("leave-applications/{id}/state")]
    public async Task<IActionResult> GetLeaveState(int id)
    {
        var state = await _db.LeaveApplications.AsNoTracking()
            .Where(l => l.Id == id)
            .Select(l => new { l.Id, status = l.Status.ToString(), l.InternId, mentorId = l.Intern.MentorId })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

    [HttpGet("interns/{id}/face/state")]
    public async Task<IActionResult> GetInternFaceState(int id)
    {
        var state = await _db.Interns.AsNoTracking()
            .Where(i => i.Id == id)
            .Select(i => new { i.Id, status = i.FaceEnrollmentStatus.ToString(), i.MentorId, rejectedReason = i.FaceRejectedReason })
            .FirstOrDefaultAsync();
        if (state == null) return NotFound();
        return Ok(state);
    }

}

public record CreateMentorRequest([MaxLength(100)] string? Username, [MaxLength(128)] string Password, [MaxLength(200)] string FullName, [MaxLength(100)] string Designation, int DepartmentId, [MaxLength(50)] string? Phone = null, [MaxLength(200)] string? Email = null);
public record UpdateMentorRequest([MaxLength(200)] string FullName, [MaxLength(100)] string Designation, bool IsActive, [MaxLength(50)] string? Phone = null, [MaxLength(200)] string? Email = null);
public record InitiateTransferRequest(int ToDepartmentId, [MaxLength(1000)] string? AdminNote);
public record ResetPasswordRequest([MaxLength(128)] string NewPassword);
public record CreateDepartmentRequest([MaxLength(100)] string Name, [MaxLength(20)] string Code, double? Latitude, double? Longitude, double? RadiusMeters, [MaxLength(300)] string? Address = null);
public record AdminUpdateDepartmentRequest([MaxLength(100)] string? Name, [MaxLength(20)] string? Code, double? Latitude, double? Longitude, double? RadiusMeters, [MaxLength(300)] string? Address = null);
public record AdminCreateInternRequest([MaxLength(100)] string? Username, [MaxLength(128)] string Password, [MaxLength(200)] string FullName, [MaxLength(50)] string? CNIC,
    [MaxLength(200)] string? University, [MaxLength(200)] string? Degree, InternGender Gender, DateTime StartDate, DateTime EndDate, int MentorId, int? DepartmentId = null, int? ShiftId = null);
public record AdminUpdateInternRequest([MaxLength(100)] string? Username, [MaxLength(128)] string? Password, [MaxLength(200)] string? FullName, [MaxLength(50)] string? CNIC,
    [MaxLength(200)] string? University, [MaxLength(200)] string? Degree, InternGender? Gender, DateTime? StartDate, DateTime? EndDate,
    int? DepartmentId, int? MentorId, bool IsActive, int? ShiftId = null);
public record BatchApproveGatePassRequest(int[] GatePassIds, int? DepartmentHeadId);
public record UpdateSettingsRequest(int GraceMinutes, double ThresholdPct, int AllowedLeaveDays, double? TaskThresholdPct = null, bool? SignatureRequired = null);
public record UpsertHolidayRequest(DateOnly Date, [MaxLength(200)] string Name);
public record AdminShiftRequest([MaxLength(100)] string Name, TimeSpan StartTime, TimeSpan EndTime, bool IsCompanyWide, int? DepartmentId = null);
public record AdminUpdateAttendanceRequest(DateTime? InTime, DateTime? OutTime,
    AttendanceSlotStatus? ArrivalStatus, AttendanceSlotStatus? DepartureStatus, bool? IsOnLeave, [MaxLength(1000)] string? Notes);
public record AdminInitiateInternTransferRequest(int ToMentorId, [MaxLength(1000)] string? Notes);
public record AdminEditTransferRequest(int? ToMentorId, [MaxLength(1000)] string? Notes);
public record RejectInternTransferRequest([MaxLength(1000)] string Reason);
