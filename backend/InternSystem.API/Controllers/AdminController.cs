using System.Security.Claims;
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

    public AdminController(AppDbContext db, FileService files)
    {
        _db = db;
        _files = files;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // ─── Dashboard ───────────────────────────────────────────────────────────
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var totalMentors = await _db.Mentors.CountAsync();
        var totalInterns = await _db.Interns.CountAsync();
        var activeInterns = await _db.Interns
            .Where(i => i.User.IsActive && i.EndDate > DateTime.UtcNow).CountAsync();
        var totalDepartments = await _db.Departments.Where(d => d.IsActive).CountAsync();

        var recentActivity = await _db.ActivityLogs
            .Include(a => a.PerformedByUser)
            .Include(a => a.Department)
            .OrderByDescending(a => a.CreatedAt)
            .Take(20)
            .Select(a => new
            {
                a.Id,
                logType = a.LogType.ToString(),
                a.Description,
                performedBy = a.PerformedByUser!.Username,
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
            username = m.User.Username,
            isActive = m.User.IsActive,
            department = m.Department.Name,
            m.DepartmentId,
            m.CreatedAt,
            internCount = m.Interns.Count
        }).ToListAsync();

        return Ok(mentors);
    }

    [HttpPost("mentors")]
    public async Task<IActionResult> CreateMentor([FromBody] CreateMentorRequest req)
    {
        if (await _db.Users.AnyAsync(u => u.Username == req.Username))
            return BadRequest(new { message = "Username already exists" });

        if (!await _db.Departments.AnyAsync(d => d.Id == req.DepartmentId && d.IsActive))
            return BadRequest(new { message = "Invalid department" });

        var user = new User
        {
            Username = req.Username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = UserRole.Mentor,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var mentor = new Mentor
        {
            UserId = user.Id,
            FullName = req.FullName,
            Designation = req.Designation,
            DepartmentId = req.DepartmentId,
            CreatedByAdminId = CurrentUserId
        };
        _db.Mentors.Add(mentor);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.MentorCreated,
            Description = $"Admin created mentor '{req.FullName}' in department {req.DepartmentId}",
            PerformedByUserId = CurrentUserId,
            DepartmentId = req.DepartmentId,
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Mentor created", mentorId = mentor.Id });
    }

    [HttpPatch("mentors/{mentorId}/reset-password")]
    public async Task<IActionResult> ResetMentorPassword(int mentorId, [FromBody] ResetPasswordRequest req)
    {
        var mentor = await _db.Mentors.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == mentorId);
        if (mentor == null) return NotFound();

        mentor.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);

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
            i.CNIC,
            i.University,
            i.Degree,
            username = i.User.Username,
            isActive = i.User.IsActive,
            department = i.Department.Name,
            mentor = i.Mentor.FullName,
            i.StartDate,
            i.EndDate,
            i.FaceEnrolled,
            i.CreatedAt,
            isExpired = DateTime.UtcNow > i.EndDate
        }).ToListAsync();

        return Ok(interns);
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
                d.Id, d.Name, d.Code, d.Latitude, d.Longitude, d.RadiusMeters,
                internCount = d.Interns.Count,
                mentorCount = d.Mentors.Count
            }).ToListAsync();
        return Ok(depts);
    }

    [HttpPost("departments")]
    public async Task<IActionResult> CreateDepartment([FromBody] CreateDepartmentRequest req)
    {
        var dept = new Department
        {
            Name = req.Name, Code = req.Code,
            Latitude = req.Latitude, Longitude = req.Longitude, RadiusMeters = req.RadiusMeters,
            IsActive = true, CreatedAt = DateTime.UtcNow
        };
        _db.Departments.Add(dept);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Department created", deptId = dept.Id });
    }

    // ─── Document Approvals (all interns) ────────────────────────────────────
    [HttpGet("documents")]
    public async Task<IActionResult> GetDocuments([FromQuery] string? status, [FromQuery] int? internId)
    {
        var query = _db.DocumentUploads
            .Include(d => d.Intern).ThenInclude(i => i.Department)
            .Where(d => d.WithdrawnAt == null)
            .AsQueryable();

        if (internId.HasValue)
            query = query.Where(d => d.InternId == internId.Value);

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
        var doc = await _db.DocumentUploads
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id);
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
            DepartmentId = doc.Intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Document approved" });
    }

    [HttpPost("documents/{id}/reject")]
    public async Task<IActionResult> RejectDocument(int id, [FromBody] RejectRequest req)
    {
        var doc = await _db.DocumentUploads
            .Include(d => d.Intern)
            .FirstOrDefaultAsync(d => d.Id == id);
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
                h.Id, h.Name, h.Designation, h.SignatureImagePath, h.CreatedAt
            }).ToListAsync();
        return Ok(heads);
    }

    [HttpPost("department-heads")]
    public async Task<IActionResult> CreateDepartmentHead(
        [FromForm] string name, [FromForm] string? designation, IFormFile? signature)
    {
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Name is required" });

        var head = new DepartmentHead
        {
            Name = name.Trim(),
            Designation = string.IsNullOrWhiteSpace(designation) ? "Head of Department" : designation.Trim(),
            CreatedAt = DateTime.UtcNow
        };
        _db.DepartmentHeads.Add(head);
        await _db.SaveChangesAsync();

        if (signature != null)
        {
            head.SignatureImagePath = await _files.SaveSignatureAsync(signature, head.Id);
            await _db.SaveChangesAsync();
        }

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DepartmentHeadCreated,
            Description = $"Department head '{head.Name}' created with {(signature != null ? "signature" : "no signature")}",
            PerformedByUserId = CurrentUserId
        });

        return Ok(new { message = "Department head created", headId = head.Id });
    }

    [HttpPut("department-heads/{id}")]
    public async Task<IActionResult> UpdateDepartmentHead(
        int id, [FromForm] string? name, [FromForm] string? designation, IFormFile? signature)
    {
        var head = await _db.DepartmentHeads.FirstOrDefaultAsync(h => h.Id == id);
        if (head == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(name)) head.Name = name.Trim();
        if (!string.IsNullOrWhiteSpace(designation)) head.Designation = designation.Trim();

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
}

public record CreateMentorRequest(string Username, string Password, string FullName, string Designation, int DepartmentId);
public record ResetPasswordRequest(string NewPassword);
public record CreateDepartmentRequest(string Name, string Code, double? Latitude, double? Longitude, double? RadiusMeters);
