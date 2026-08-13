using System.Security.Claims;
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

    public MentorController(AppDbContext db, FileService files, PdfService pdf, GeoFenceService geo)
    {
        _db = db; _files = files; _pdf = pdf; _geo = geo;
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
            return Ok(new
            {
                mentorName = "Admin System",
                department = "Administration",
                totalInterns = await _db.Interns.CountAsync(),
                activeInterns = await _db.Interns.CountAsync(i => i.User.IsActive && i.EndDate > DateTime.UtcNow),
                pendingGatePasses = await _db.GatePasses.CountAsync(g => g.Status == DocumentRequestStatus.Pending),
                pendingCertificates = await _db.Certificates.CountAsync(c => c.Status == CertificateStatus.Applied),
                pendingIdCards = await _db.IdCardRequests.CountAsync(i => i.Status == DocumentRequestStatus.Pending),
            });
        }

        var interns = await _db.Interns
            .Where(i => i.MentorId == mentor.Id)
            .Include(i => i.User)
            .ToListAsync();

        var activeCount = interns.Count(i => i.User.IsActive && i.EndDate > DateTime.UtcNow);
        var pendingGatePasses = await _db.GatePasses
            .Where(g => g.Intern.MentorId == mentor.Id && g.Status == DocumentRequestStatus.Pending)
            .CountAsync();
        var pendingCertificates = await _db.Certificates
            .Where(c => c.Intern.MentorId == mentor.Id && c.Status == CertificateStatus.Applied)
            .CountAsync();
        var pendingIdCards = await _db.IdCardRequests
            .Where(i => i.Intern.MentorId == mentor.Id && i.Status == DocumentRequestStatus.Pending)
            .CountAsync();

        return Ok(new
        {
            mentorName = mentor.FullName,
            department = mentor.Department?.Name,
            totalInterns = interns.Count,
            activeInterns = activeCount,
            pendingGatePasses,
            pendingCertificates,
            pendingIdCards
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
            .Select(i => new
            {
                i.Id, i.FullName, i.CNIC, i.University, i.Degree,
                username = i.User.Username,
                isActive = i.User.IsActive,
                department = i.Department.Name,
                i.StartDate, i.EndDate, i.FaceEnrolled,
                isExpired = DateTime.UtcNow > i.EndDate,
                i.CreatedAt
            }).ToListAsync();

        return Ok(interns);
    }

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
                    CreatedAt = DateTime.UtcNow
                };
                _db.Mentors.Add(mentor);
                await _db.SaveChangesAsync();
            }
        }

        string username = req.Username?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(username))
        {
            var firstName = req.FullName.Trim().Split(' ')[0].ToLower();
            firstName = System.Text.RegularExpressions.Regex.Replace(firstName, "[^a-z0-9]", "");
            if (string.IsNullOrEmpty(firstName)) firstName = "intern";

            var prefix = $"{firstName}.PIA.";
            var count = await _db.Users.CountAsync(u => u.Username.StartsWith(prefix));
            int nextNumber = count + 1;
            username = $"{prefix}{nextNumber:D3}";

            while (await _db.Users.AnyAsync(u => u.Username == username))
            {
                nextNumber++;
                username = $"{prefix}{nextNumber:D3}";
            }
        }
        else
        {
            if (await _db.Users.AnyAsync(u => u.Username == username))
                return BadRequest(new { message = $"Username '{username}' already exists" });
        }

        var user = new User
        {
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = UserRole.Intern,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var intern = new Intern
        {
            UserId = user.Id,
            MentorId = mentor.Id,
            DepartmentId = (req.DepartmentId.HasValue && req.DepartmentId.Value > 0) ? req.DepartmentId.Value : mentor.DepartmentId,
            FullName = req.FullName,
            CNIC = req.CNIC,
            University = req.University,
            Degree = req.Degree,
            Gender = req.Gender,
            StartDate = req.StartDate,
            EndDate = req.EndDate,
            CreatedAt = DateTime.UtcNow
        };
        _db.Interns.Add(intern);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternCreated,
            Description = $"Created intern '{req.FullName}' ({username})",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId,
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();
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

        intern.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.PasswordReset,
            Description = $"Mentor reset password for intern '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
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
                a.Latitude,
                a.Longitude,
                a.IsInRange,
                a.DistanceMeters,
                a.FaceVerified,
                a.FaceConfidence,
                a.LivenessVerified,
                status = a.Status.ToString(),
                a.Notes
            }).ToListAsync();

        return Ok(records);
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
            CreatedAt = DateTime.UtcNow
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
        return Ok(new { message = "Task assigned", taskId = task.Id });
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

    [HttpPost("gatepasses/{id}/approve")]
    public async Task<IActionResult> ApproveGatePass(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var gatePass = await _db.GatePasses
            .Include(g => g.Intern).ThenInclude(i => i.Department)
            .FirstOrDefaultAsync(g => g.Id == id && g.Intern.MentorId == mentor.Id);
        if (gatePass == null) return NotFound();

        gatePass.Status = DocumentRequestStatus.Approved;
        gatePass.ApprovedByMentorId = mentor.Id;
        gatePass.ApprovedAt = DateTime.UtcNow;

        // Generate PDF
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
        return Ok(new { message = "Gate pass approved", pdfPath });
    }

    [HttpPost("gatepasses/{id}/reject")]
    public async Task<IActionResult> RejectGatePass(int id, [FromBody] RejectRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var gatePass = await _db.GatePasses
            .Include(g => g.Intern)
            .FirstOrDefaultAsync(g => g.Id == id && g.Intern.MentorId == mentor.Id);
        if (gatePass == null) return NotFound();

        gatePass.Status = DocumentRequestStatus.Rejected;
        gatePass.ApprovedByMentorId = mentor.Id;
        gatePass.RejectionReason = req.Reason;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.GatePassRejected,
            Description = $"Gate pass rejected for '{gatePass.Intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = gatePass.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Gate pass rejected" });
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

    [HttpPost("idcards/{id}/approve")]
    public async Task<IActionResult> ApproveIdCard(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var req = await _db.IdCardRequests
            .Include(i => i.Intern)
            .FirstOrDefaultAsync(i => i.Id == id && i.Intern.MentorId == mentor.Id);
        if (req == null) return NotFound();

        req.Status = DocumentRequestStatus.Approved;
        req.ApprovedByMentorId = mentor.Id;
        req.ApprovedAt = DateTime.UtcNow;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.IdCardApproved,
            Description = $"ID card approved for '{req.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = req.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "ID card request approved" });
    }

    [HttpPost("idcards/{id}/reject")]
    public async Task<IActionResult> RejectIdCard(int id, [FromBody] RejectRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var idReq = await _db.IdCardRequests
            .Include(i => i.Intern)
            .FirstOrDefaultAsync(i => i.Id == id && i.Intern.MentorId == mentor.Id);
        if (idReq == null) return NotFound();

        idReq.Status = DocumentRequestStatus.Rejected;
        idReq.RejectionReason = req.Reason;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.IdCardRejected,
            Description = $"ID card rejected for '{idReq.Intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = idReq.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "ID card request rejected" });
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
            status = c.Status.ToString(),
            c.AppliedAt, c.ApprovedAt, c.RejectionReason, c.PdfPath
        }).ToListAsync();

        return Ok(certs);
    }

    [HttpPost("certificates/{id}/approve")]
    public async Task<IActionResult> ApproveCertificate(int id, [FromBody] ApproveCertRequest? req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var cert = await _db.Certificates
            .Include(c => c.Intern).ThenInclude(i => i.Department)
            .FirstOrDefaultAsync(c => c.Id == id && c.Intern.MentorId == mentor.Id);
        if (cert == null) return NotFound();

        if (req?.MentorNotes != null) cert.MentorProjectNotes = req.MentorNotes;

        if (string.IsNullOrWhiteSpace(req?.TechStack) || string.IsNullOrWhiteSpace(req?.InternWork))
            return BadRequest(new { message = "Tech stack and intern work are required to approve a certificate" });

        DepartmentHead? head = null;
        if (req.DepartmentHeadId.HasValue)
            head = await _db.DepartmentHeads.FirstOrDefaultAsync(h => h.Id == req.DepartmentHeadId.Value);
        if (head == null)
            return BadRequest(new { message = "A department head must be selected to approve a certificate" });

        cert.TechStack = req!.TechStack.Trim();
        cert.InternWork = req.InternWork.Trim();
        cert.DepartmentHeadName = head.Name;
        cert.DepartmentHeadId = head.Id;

        cert.Status = CertificateStatus.Approved;
        cert.ApprovedByMentorId = mentor.Id;
        cert.ApprovedAt = DateTime.UtcNow;

        var pdfPath = _pdf.GenerateCertificatePdf(cert, cert.Intern, cert.Intern.Department!, head);
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
        return Ok(new { message = "Certificate approved", pdfPath });
    }

    [HttpPost("certificates/{id}/reject")]
    public async Task<IActionResult> RejectCertificate(int id, [FromBody] RejectRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var cert = await _db.Certificates
            .Include(c => c.Intern)
            .FirstOrDefaultAsync(c => c.Id == id && c.Intern.MentorId == mentor.Id);
        if (cert == null) return NotFound();

        cert.Status = CertificateStatus.Rejected;
        cert.RejectionReason = req.Reason;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.CertificateRejected,
            Description = $"Certificate rejected for '{cert.Intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = cert.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Certificate rejected" });
    }

    // ─── Document Approvals ──────────────────────────────────────────────────
    [HttpGet("documents")]
    public async Task<IActionResult> GetDocuments([FromQuery] string? status)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var query = _db.DocumentUploads
            .Include(d => d.Intern).ThenInclude(i => i.Department)
            .Where(d => d.Intern.MentorId == mentor.Id && d.WithdrawnAt == null)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<DocumentRequestStatus>(status, out var s))
            query = query.Where(d => d.Status == s);

        var docs = await query.OrderByDescending(d => d.UploadedAt).Select(d => new
        {
            d.Id,
            internName = d.Intern.FullName,
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

    [HttpPost("documents/{id}/approve")]
    public async Task<IActionResult> ApproveDocument(int id)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var doc = await _db.DocumentUploads
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id && d.Intern.MentorId == mentor.Id);
        if (doc == null) return NotFound();

        if (doc.Status != DocumentRequestStatus.Pending || doc.WithdrawnAt != null)
            return BadRequest(new { message = "Only pending documents can be approved" });

        doc.Status = DocumentRequestStatus.Approved;
        doc.ApprovedByUserId = CurrentUserId;
        doc.ApprovedAt = DateTime.UtcNow;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentApproved,
            Description = $"{doc.DocumentType} document approved for '{doc.Intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = doc.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Document approved" });
    }

    [HttpPost("documents/{id}/reject")]
    public async Task<IActionResult> RejectDocument(int id, [FromBody] RejectRequest req)
    {
        var mentor = await GetCurrentMentor();
        if (mentor == null) return NotFound();

        var doc = await _db.DocumentUploads
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id && d.Intern.MentorId == mentor.Id);
        if (doc == null) return NotFound();

        if (doc.Status != DocumentRequestStatus.Pending || doc.WithdrawnAt != null)
            return BadRequest(new { message = "Only pending documents can be rejected" });

        doc.Status = DocumentRequestStatus.Rejected;
        doc.RejectionReason = req.Reason;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentRejected,
            Description = $"{doc.DocumentType} document rejected for '{doc.Intern.FullName}': {req.Reason}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = doc.InternId,
            DepartmentId = mentor.DepartmentId
        });

        await _db.SaveChangesAsync();
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
        return Ok(new { message = "Document deleted" });
    }
}

public record CreateInternRequest(
    string? Username, string Password, string FullName, string? CNIC,
    string? University, string? Degree, InternGender Gender, DateTime StartDate, DateTime EndDate, int? DepartmentId = null);
public record AssignTaskRequest(int InternId, string Title, string Description, DateTime? Deadline);
public record RejectRequest(string Reason);
public record ApproveCertRequest(string? MentorNotes, string? TechStack, string? InternWork, int? DepartmentHeadId);
public record MentorResetPasswordRequest(string NewPassword);
