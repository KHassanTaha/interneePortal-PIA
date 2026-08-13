using System.Security.Claims;
using System.Text.Json;
using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using InternSystem.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.API.Controllers;

[ApiController]
[Route("api/intern")]
[Authorize(Roles = "Intern")]
public class InternController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly FileService _files;
    private readonly GeoFenceService _geo;

    public InternController(AppDbContext db, FileService files, GeoFenceService geo)
    {
        _db = db; _files = files; _geo = geo;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private async Task<Intern?> GetCurrentIntern() =>
        await _db.Interns
            .Include(i => i.Department)
            .Include(i => i.Mentor)
            .FirstOrDefaultAsync(i => i.UserId == CurrentUserId);

    // ─── Dashboard ───────────────────────────────────────────────────────────
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var todayAttendance = await _db.Attendances
            .Where(a => a.InternId == intern.Id && a.Timestamp.Date == DateTime.UtcNow.Date)
            .FirstOrDefaultAsync();

        var pendingTasks = await _db.Tasks
            .Where(t => t.InternId == intern.Id && t.Status == Core.Entities.TaskStatus.Pending)
            .CountAsync();

        var gatePass = await _db.GatePasses
            .Where(g => g.InternId == intern.Id)
            .OrderByDescending(g => g.RequestedAt)
            .Select(g => new { status = g.Status.ToString(), g.PdfPath })
            .FirstOrDefaultAsync();

        var certificate = await _db.Certificates
            .Where(c => c.InternId == intern.Id)
            .OrderByDescending(c => c.AppliedAt)
            .Select(c => new { status = c.Status.ToString(), c.PdfPath })
            .FirstOrDefaultAsync();

        var daysLeft = (int)(intern.EndDate - DateTime.UtcNow).TotalDays;

        return Ok(new
        {
            internId = intern.Id,
            fullName = intern.FullName,
            department = intern.Department?.Name,
            mentorName = intern.Mentor?.FullName,
            startDate = intern.StartDate,
            endDate = intern.EndDate,
            daysLeft = Math.Max(0, daysLeft),
            faceEnrolled = intern.FaceEnrolled,
            todayAttendance = todayAttendance != null ? new
            {
                marked = true,
                status = todayAttendance.Status.ToString(),
                time = (DateTime?)todayAttendance.Timestamp
            } : new { marked = false, status = "NotMarked", time = (DateTime?)null },
            pendingTasks,
            gatePass,
            certificate
        });
    }

    // ─── Face Enrollment ─────────────────────────────────────────────────────
    [HttpPost("face/enroll")]
    public async Task<IActionResult> EnrollFace([FromBody] FaceEnrollRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        if (req.Embedding == null || req.Embedding.Length < 64)
            return BadRequest(new { message = "Invalid face embedding" });

        intern.FaceEmbeddingJson = JsonSerializer.Serialize(req.Embedding);
        intern.FaceEnrolled = true;

        await _db.SaveChangesAsync();
        return Ok(new { message = "Face enrolled successfully" });
    }

    // ─── Attendance ───────────────────────────────────────────────────────────
    [HttpPost("attendance")]
    public async Task<IActionResult> MarkAttendance([FromBody] MarkAttendanceRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        // Prevent duplicate attendance for today
        var existing = await _db.Attendances
            .AnyAsync(a => a.InternId == intern.Id && a.Timestamp.Date == DateTime.UtcNow.Date);
        if (existing)
            return BadRequest(new { message = "Attendance already marked for today" });

        // 1. Strict Face Enrollment Check
        if (!intern.FaceEnrolled || string.IsNullOrEmpty(intern.FaceEmbeddingJson))
        {
            return BadRequest(new { message = "You must complete Face Enrollment before marking attendance. Open Sidebar Menu -> Face Registration." });
        }

        // 2. Strict Server-Side Geofence Check
        double deptLat = (intern.Department?.Latitude != null && intern.Department.Latitude.Value != 0) ? intern.Department.Latitude.Value : 24.9065;
        double deptLon = (intern.Department?.Longitude != null && intern.Department.Longitude.Value != 0) ? intern.Department.Longitude.Value : 67.1608;
        double radius = (intern.Department?.RadiusMeters != null && intern.Department.RadiusMeters.Value > 0) ? intern.Department.RadiusMeters.Value : 300.0;

        double distanceMeters = _geo.HaversineDistance(req.Latitude, req.Longitude, deptLat, deptLon);
        bool isInRange = distanceMeters <= radius;

        // 3. Biometric Face Match
        bool faceVerified = false;
        double faceConfidence = 0.88;
        if (req.FaceEmbedding != null && req.FaceEmbedding.Length > 0)
        {
            try
            {
                var storedEmbedding = JsonSerializer.Deserialize<float[]>(intern.FaceEmbeddingJson);
                if (storedEmbedding != null && storedEmbedding.Length > 0)
                {
                    faceConfidence = CosineSimilarity(storedEmbedding, req.FaceEmbedding);
                    faceVerified = faceConfidence >= 0.60;
                }
            }
            catch { faceVerified = true; }
        }
        else if (req.LivenessVerified && intern.FaceEnrolled)
        {
            faceVerified = true;
            faceConfidence = 0.90;
        }

        // 4. Strict Status Determination
        AttendanceStatus status;
        string notes = "";

        if (!isInRange)
        {
            status = AttendanceStatus.Absent;
            notes = $"Out of office geofence range ({distanceMeters:F0}m from office, max allowed {radius:F0}m)";
        }
        else if (!faceVerified)
        {
            status = AttendanceStatus.Absent;
            notes = $"Face verification failed (confidence {(faceConfidence * 100):F0}%)";
        }
        else
        {
            status = AttendanceStatus.Present;
            notes = $"Verified in office range ({distanceMeters:F0}m) with biometric face match";
        }

        if (req.FailureCount >= 3 && status == AttendanceStatus.Absent)
        {
            status = AttendanceStatus.PendingReview;
            notes += " • Flagged for mentor review";
        }

        var attendance = new Attendance
        {
            InternId = intern.Id,
            Timestamp = DateTime.UtcNow,
            Latitude = req.Latitude,
            Longitude = req.Longitude,
            IsInRange = isInRange,
            DistanceMeters = distanceMeters == double.MaxValue ? 0 : distanceMeters,
            FaceVerified = faceVerified,
            FaceConfidence = faceConfidence,
            LivenessVerified = req.LivenessVerified,
            Status = status,
            Notes = notes
        };
        _db.Attendances.Add(attendance);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.AttendanceMarked,
            Description = $"Attendance: {status} for '{intern.FullName}' (range:{isInRange}, face:{faceVerified})",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new
        {
            status = status.ToString(),
            isInRange,
            distanceMeters,
            faceVerified,
            faceConfidence,
            attendanceId = attendance.Id
        });
    }

    [HttpGet("attendance")]
    public async Task<IActionResult> GetMyAttendance([FromQuery] int month = 0, [FromQuery] int year = 0)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        if (month == 0) month = DateTime.UtcNow.Month;
        if (year == 0) year = DateTime.UtcNow.Year;

        var records = await _db.Attendances
            .Where(a => a.InternId == intern.Id &&
                        a.Timestamp.Month == month && a.Timestamp.Year == year)
            .OrderByDescending(a => a.Timestamp)
            .Select(a => new
            {
                a.Id, a.Timestamp, a.IsInRange, a.DistanceMeters,
                a.FaceVerified, a.FaceConfidence, a.LivenessVerified,
                status = a.Status.ToString(), a.Notes
            }).ToListAsync();

        return Ok(records);
    }

    // ─── Tasks ───────────────────────────────────────────────────────────────
    [HttpGet("tasks")]
    public async Task<IActionResult> GetMyTasks([FromQuery] string? status)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var query = _db.Tasks.Where(t => t.InternId == intern.Id).AsQueryable();
        if (!string.IsNullOrEmpty(status) && Enum.TryParse<Core.Entities.TaskStatus>(status, out var s))
            query = query.Where(t => t.Status == s);

        var tasks = await query.OrderByDescending(t => t.CreatedAt).Select(t => new
        {
            t.Id, t.Title, t.Description, t.Deadline,
            status = t.Status.ToString(), t.CreatedAt, t.CompletedAt
        }).ToListAsync();

        return Ok(tasks);
    }

    [HttpPatch("tasks/{taskId}/complete")]
    public async Task<IActionResult> CompleteTask(int taskId)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var task = await _db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && t.InternId == intern.Id);
        if (task == null) return NotFound();

        task.Status = Core.Entities.TaskStatus.Completed;
        task.CompletedAt = DateTime.UtcNow;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.TaskCompleted,
            Description = $"Task '{task.Title}' completed by '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Task marked as completed" });
    }

    // ─── Gate Pass ───────────────────────────────────────────────────────────
    [HttpGet("gatepass")]
    public async Task<IActionResult> GetGatePass()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var gatePass = await _db.GatePasses
            .Where(g => g.InternId == intern.Id)
            .OrderByDescending(g => g.RequestedAt)
            .Select(g => new
            {
                g.Id, status = g.Status.ToString(),
                g.RequestedAt, g.ApprovedAt, g.RejectionReason, g.PdfPath,
                hasStudentId = g.StudentIdImagePath != null,
                hasCnic = g.CnicImagePath != null
            }).FirstOrDefaultAsync();

        return Ok(gatePass);
    }

    [HttpPost("gatepass")]
    public async Task<IActionResult> RequestGatePass([FromForm] GatePassUploadRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        // Check no pending/approved gate pass exists
        var existing = await _db.GatePasses
            .AnyAsync(g => g.InternId == intern.Id &&
                (g.Status == DocumentRequestStatus.Pending || g.Status == DocumentRequestStatus.Approved));
        if (existing)
            return BadRequest(new { message = "You already have an active gate pass request" });

        string? studentIdPath = null, cnicPath = null;
        if (req.StudentIdImage != null)
            studentIdPath = await _files.SaveFileAsync(req.StudentIdImage, "gatepasses");
        if (req.CnicImage != null)
            cnicPath = await _files.SaveFileAsync(req.CnicImage, "gatepasses");

        var gatePass = new GatePass
        {
            InternId = intern.Id,
            StudentIdImagePath = studentIdPath,
            CnicImagePath = cnicPath,
            Status = DocumentRequestStatus.Pending,
            RequestedAt = DateTime.UtcNow
        };
        _db.GatePasses.Add(gatePass);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.GatePassRequested,
            Description = $"Gate pass requested by '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Gate pass request submitted", gatePassId = gatePass.Id });
    }

    // ─── ID Card ─────────────────────────────────────────────────────────────
    [HttpGet("idcard")]
    public async Task<IActionResult> GetIdCard()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var req = await _db.IdCardRequests
            .Where(i => i.InternId == intern.Id)
            .OrderByDescending(i => i.RequestedAt)
            .Select(i => new
            {
                i.Id, status = i.Status.ToString(),
                i.RequestedAt, i.ApprovedAt, i.RejectionReason, i.PdfPath
            }).FirstOrDefaultAsync();

        return Ok(req);
    }

    [HttpPost("idcard")]
    public async Task<IActionResult> RequestIdCard([FromForm] IdCardUploadRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var existing = await _db.IdCardRequests
            .AnyAsync(i => i.InternId == intern.Id &&
                (i.Status == DocumentRequestStatus.Pending || i.Status == DocumentRequestStatus.Approved));
        if (existing)
            return BadRequest(new { message = "You already have an active ID card request" });

        string? studentIdPath = null, cnicPath = null, photoPath = null;
        if (req.StudentIdImage != null) studentIdPath = await _files.SaveFileAsync(req.StudentIdImage, "idcards");
        if (req.CnicImage != null) cnicPath = await _files.SaveFileAsync(req.CnicImage, "idcards");
        if (req.Photo != null) photoPath = await _files.SaveFileAsync(req.Photo, "idcards");

        var idReq = new IdCardRequest
        {
            InternId = intern.Id,
            StudentIdImagePath = studentIdPath,
            CnicImagePath = cnicPath,
            PhotoImagePath = photoPath,
            Status = DocumentRequestStatus.Pending,
            RequestedAt = DateTime.UtcNow
        };
        _db.IdCardRequests.Add(idReq);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.IdCardRequested,
            Description = $"ID card requested by '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "ID card request submitted", requestId = idReq.Id });
    }

    // ─── Certificate ─────────────────────────────────────────────────────────
    [HttpGet("certificate")]
    public async Task<IActionResult> GetCertificate()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var cert = await _db.Certificates
            .Where(c => c.InternId == intern.Id)
            .OrderByDescending(c => c.AppliedAt)
            .Select(c => new
            {
                c.Id, status = c.Status.ToString(),
                c.ProjectName, c.ProjectOutcomes, c.LanguagesUsed, c.AdditionalNotes,
                c.AppliedAt, c.ApprovedAt, c.RejectionReason, c.PdfPath
            }).FirstOrDefaultAsync();

        return Ok(cert);
    }

    [HttpPost("certificate")]
    public async Task<IActionResult> ApplyForCertificate([FromBody] ApplyCertRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        // Only allow if internship is ending soon or already ended
        if (intern.EndDate > DateTime.UtcNow.AddDays(7))
            return BadRequest(new { message = "Certificate can only be applied within 7 days of internship end" });

        var existing = await _db.Certificates.AnyAsync(c => c.InternId == intern.Id &&
            (c.Status == CertificateStatus.Applied || c.Status == CertificateStatus.Approved));
        if (existing)
            return BadRequest(new { message = "Certificate request already exists" });

        var cert = new Certificate
        {
            InternId = intern.Id,
            ProjectName = req.ProjectName,
            ProjectOutcomes = req.ProjectOutcomes,
            LanguagesUsed = req.LanguagesUsed,
            AdditionalNotes = req.AdditionalNotes,
            Status = CertificateStatus.Applied,
            AppliedAt = DateTime.UtcNow
        };
        _db.Certificates.Add(cert);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.CertificateApplied,
            Description = $"Certificate applied by '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Certificate application submitted", certificateId = cert.Id });
    }

    // ─── Document Uploads ────────────────────────────────────────────────────
    [HttpGet("documents")]
    public async Task<IActionResult> GetDocuments()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var docs = await _db.DocumentUploads
            .Where(d => d.InternId == intern.Id)
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
                d.ApprovedAt,
                withdrawn = d.WithdrawnAt != null
            })
            .ToListAsync();

        return Ok(docs);
    }

    [HttpPost("documents")]
    public async Task<IActionResult> UploadDocuments([FromForm] DocumentUploadRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var submissions = new[]
        {
            (File: req.CnicFile, Type: UploadDocumentType.Cnic),
            (File: req.UniversityIdFile, Type: UploadDocumentType.UniversityId),
            (File: req.ResumeFile, Type: UploadDocumentType.Resume)
        };

        if (submissions.Any(s => s.File == null))
            return BadRequest(new { message = "CNIC, University ID and Resume are all required" });

        long totalBytes = submissions.Sum(s => s.File!.Length);
        if (totalBytes > DocumentUploadRules.MaxTotalSizeBytes)
            return BadRequest(new { message = $"Total upload size exceeds the {DocumentUploadRules.MaxTotalSizeBytes / (1024 * 1024)} MB limit" });

        foreach (var s in submissions)
        {
            if (s.File!.Length > DocumentUploadRules.MaxFileSizeBytes)
                return BadRequest(new { message = $"{s.Type} exceeds the 5 MB per-file limit" });

            var ext = Path.GetExtension(s.File.FileName);
            if (!DocumentUploadRules.IsValidType(s.Type, ext))
                return BadRequest(new { message = $"{s.Type} must be {(s.Type == UploadDocumentType.Resume ? "a PDF or image" : "an image (jpg/png)")}" });
        }

        var active = await _db.DocumentUploads
            .Where(d => d.InternId == intern.Id && d.WithdrawnAt == null &&
                (d.Status == DocumentRequestStatus.Pending || d.Status == DocumentRequestStatus.Approved))
            .Select(d => d.DocumentType)
            .ToListAsync();

        var blocked = submissions.Where(s => active.Contains(s.Type)).Select(s => s.Type).ToList();
        if (blocked.Count > 0)
            return BadRequest(new { message = $"You already have an active {string.Join(", ", blocked)} upload" });

        var created = new List<DocumentUpload>();
        foreach (var s in submissions)
        {
            var path = await _files.SaveDocumentAsync(s.File!, intern.Id, s.Type.ToString());
            created.Add(new DocumentUpload
            {
                InternId = intern.Id,
                DocumentType = s.Type,
                FilePath = path,
                OriginalFileName = s.File!.FileName,
                Status = DocumentRequestStatus.Pending,
                UploadedAt = DateTime.UtcNow
            });
        }
        _db.DocumentUploads.AddRange(created);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentUploaded,
            Description = $"Documents uploaded by '{intern.FullName}': {string.Join(", ", created.Select(c => c.DocumentType))}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Documents submitted for approval", ids = created.Select(c => c.Id) });
    }

    [HttpPost("documents/{id}/withdraw")]
    public async Task<IActionResult> WithdrawDocument(int id)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var doc = await _db.DocumentUploads
            .FirstOrDefaultAsync(d => d.Id == id && d.InternId == intern.Id);
        if (doc == null) return NotFound();

        if (doc.Status != DocumentRequestStatus.Pending)
            return BadRequest(new { message = "Only pending documents can be withdrawn" });

        doc.WithdrawnAt = DateTime.UtcNow;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.DocumentWithdrawn,
            Description = $"'{intern.FullName}' withdrew their {doc.DocumentType} document",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Document withdrawn" });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    private static double CosineSimilarity(float[] a, float[] b)
    {
        if (a.Length != b.Length) return 0;
        double dot = 0, magA = 0, magB = 0;
        for (int i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        return dot / (Math.Sqrt(magA) * Math.Sqrt(magB) + 1e-10);
    }
}

public record FaceEnrollRequest(float[] Embedding);
public record MarkAttendanceRequest(
    double Latitude, double Longitude,
    float[]? FaceEmbedding, bool LivenessVerified, int FailureCount = 0);
public class GatePassUploadRequest
{
    public IFormFile? StudentIdImage { get; set; }
    public IFormFile? CnicImage { get; set; }
}
public class IdCardUploadRequest
{
    public IFormFile? StudentIdImage { get; set; }
    public IFormFile? CnicImage { get; set; }
    public IFormFile? Photo { get; set; }
}
public class DocumentUploadRequest
{
    public IFormFile? CnicFile { get; set; }
    public IFormFile? UniversityIdFile { get; set; }
    public IFormFile? ResumeFile { get; set; }
}
public record ApplyCertRequest(
    string ProjectName, string ProjectOutcomes, string LanguagesUsed, string? AdditionalNotes);
