using System.Security.Claims;
using System.Text.Json;
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
[Route("api/intern")]
[Authorize(Roles = "Intern")]
public class InternController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly FileService _files;
    private readonly GeoFenceService _geo;
    private readonly AttendanceScoringService _scoring;
    private readonly NotificationService _notifications;
    private readonly TransferStateMachine _transfers;
    private readonly FaceRecognitionService _face;

    public InternController(AppDbContext db, FileService files, GeoFenceService geo, AttendanceScoringService scoring, NotificationService notifications, TransferStateMachine transfers, FaceRecognitionService face)
    {
        _db = db; _files = files; _geo = geo; _scoring = scoring; _notifications = notifications; _transfers = transfers; _face = face;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private async Task<Intern?> GetCurrentIntern() =>
        await _db.Interns
            .Include(i => i.User)
            .Include(i => i.Department)
            .Include(i => i.Mentor)
            .Include(i => i.FaceEnrollmentRecords)
            .FirstOrDefaultAsync(i => i.UserId == CurrentUserId);

    // CNIC + CV/Resume must both be approved (and not withdrawn) before face enrollment is allowed.
    private Task<bool> RequiredDocsApprovedAsync(int internId) => _db.OfficialDocsApprovedAsync(internId);

    // ─── Dashboard ───────────────────────────────────────────────────────────
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var todayAttendance = await _db.Attendances
            .Where(a => a.InternId == intern.Id && a.Timestamp.Date == DateTime.Now.Date)
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

        var daysLeft = (int)(intern.EndDate - DateTime.Now).TotalDays;

        var settings = await _db.AttendanceSettings.FirstOrDefaultAsync();
        var shift = intern.ShiftId != null ? await _db.Shifts.FirstOrDefaultAsync(s => s.Id == intern.ShiftId) : null;
        var leaveUsed = await _db.Attendances.CountAsync(a => a.InternId == intern.Id && a.IsOnLeave);
        var allowedLeaveDays = settings?.AllowedLeaveDays ?? 0;

        var mentorDetail = intern.MentorId != null
            ? await _db.Mentors.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == intern.MentorId)
            : null;

        var taskStats = new
        {
            pending = await _db.Tasks.CountAsync(t => t.InternId == intern.Id && t.Status == Core.Entities.TaskStatus.Pending),
            inProgress = await _db.Tasks.CountAsync(t => t.InternId == intern.Id && t.Status == Core.Entities.TaskStatus.InProgress),
            completed = await _db.Tasks.CountAsync(t => t.InternId == intern.Id && t.Status == Core.Entities.TaskStatus.Completed),
            total = await _db.Tasks.CountAsync(t => t.InternId == intern.Id)
        };

        var recentTasks = await _db.Tasks
            .Where(t => t.InternId == intern.Id)
            .OrderByDescending(t => t.CreatedAt)
            .Take(3)
            .Select(t => new { t.Id, t.Title, status = t.Status.ToString(), t.Deadline })
            .ToListAsync();

        var monthStart = new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1);
        var monthStatuses = await _db.Attendances
            .Where(a => a.InternId == intern.Id && a.Timestamp >= monthStart)
            .Select(a => a.Status)
            .ToListAsync();
        var monthPresent = monthStatuses.Count(s => s == AttendanceStatus.Present);
        var attendanceStats = new
        {
            present = monthPresent,
            absent = monthStatuses.Count(s => s == AttendanceStatus.Absent),
            pendingReview = monthStatuses.Count(s => s == AttendanceStatus.PendingReview),
            total = monthStatuses.Count,
            rate = monthStatuses.Count == 0 ? 0 : Math.Round(monthPresent * 100.0 / monthStatuses.Count, 1)
        };

        var pendingRequests = new
        {
            gatePass = await _db.GatePasses.CountAsync(g => g.InternId == intern.Id && g.Status == DocumentRequestStatus.Pending),
            idCard = await _db.IdCardRequests.CountAsync(i => i.InternId == intern.Id && i.Status == DocumentRequestStatus.Pending),
            certificate = await _db.Certificates.CountAsync(c => c.InternId == intern.Id &&
                (c.Status == CertificateStatus.Pending || c.Status == CertificateStatus.UnderReview))
        };

        var activeTransfer = await _db.InternTransferRequests
            .Include(t => t.FromMentor)
            .Include(t => t.ToMentor)
            .Where(t => t.InternId == intern.Id &&
                (t.Status == InternTransferStatus.Pending ||
                 t.Status == InternTransferStatus.Endorsed ||
                 t.Status == InternTransferStatus.InternAccepted))
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new
            {
                t.Id,
                fromMentor = t.FromMentor.FullName,
                toMentor = t.ToMentor.FullName,
                initiatedBy = t.InitiatedBy.ToString(),
                status = t.Status.ToString(),
                t.Notes,
                t.RejectionReason,
                t.CreatedAt,
                t.EndorsedAt,
                t.InternAcceptedAt,
                t.FinalisedAt
            })
            .FirstOrDefaultAsync();

        var activeShiftChange = await _db.InternShiftChangeRequests
            .Include(r => r.FromShift)
            .Include(r => r.ToShift)
            .Where(r => r.InternId == intern.Id && r.Status == InternShiftChangeStatus.Pending)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
                fromShift = r.FromShift.Name,
                toShift = r.ToShift.Name,
                status = r.Status.ToString(),
                r.Notes,
                r.RejectionReason,
                r.CreatedAt,
                r.InternAcceptedAt
            })
            .FirstOrDefaultAsync();

        var transferStats = new
        {
            total = await _db.InternTransferRequests.CountAsync(t => t.InternId == intern.Id),
            active = await _db.InternTransferRequests.CountAsync(t => t.InternId == intern.Id &&
                (t.Status == InternTransferStatus.Pending || t.Status == InternTransferStatus.Endorsed || t.Status == InternTransferStatus.InternAccepted)),
            finalised = await _db.InternTransferRequests.CountAsync(t => t.InternId == intern.Id && t.Status == InternTransferStatus.Finalised),
            rejected = await _db.InternTransferRequests.CountAsync(t => t.InternId == intern.Id && t.Status == InternTransferStatus.Rejected)
        };

        var uploadedDocsInfo = await _db.DocumentUploads
            .Where(d => d.InternId == intern.Id && d.WithdrawnAt == null)
            .GroupBy(d => d.DocumentType)
            .Select(g => new { type = g.Key, approved = g.Any(d => d.Status == DocumentRequestStatus.Approved) })
            .ToListAsync();
        var docsApproved = uploadedDocsInfo.Any(d => d.type == UploadDocumentType.Cnic && d.approved) &&
                           uploadedDocsInfo.Any(d => d.type == UploadDocumentType.UniversityId && d.approved);

        return Ok(new
        {
            internId = intern.Id,
            fullName = intern.FullName,
            department = intern.Department?.Name,
            departmentAddress = intern.Department?.Address,
            shift = shift != null ? new
            {
                name = shift.Name,
                startTime = shift.StartTime.ToString(),
                endTime = shift.EndTime.ToString()
            } : (object?)null,
            allowedLeaveDays,
            leaveUsed,
            remainingLeaveDays = Math.Max(0, allowedLeaveDays - leaveUsed),
            graceMinutes = settings?.GraceMinutes,
            mentor = mentorDetail != null ? new
            {
                name = mentorDetail.FullName,
                designation = mentorDetail.Designation,
                username = mentorDetail.User?.Username,
                phone = mentorDetail.Phone,
                email = mentorDetail.Email
            } : (object?)null,
            mentorName = intern.Mentor?.FullName,
            startDate = intern.StartDate,
            endDate = intern.EndDate,
            daysLeft = Math.Max(0, daysLeft),
            faceEnrolled = intern.FaceEnrolled,
            faceEnrollmentStatus = intern.FaceEnrollmentStatus.ToString(),
            faceRejectedReason = intern.FaceRejectedReason,
            mustChangePassword = intern.User.MustChangePassword,
            todayAttendance = todayAttendance != null ? new
            {
                marked = true,
                status = todayAttendance.Status.ToString(),
                time = (DateTime?)todayAttendance.Timestamp,
                departureTime = (DateTime?)todayAttendance.OutTime
            } : new { marked = false, status = "NotMarked", time = (DateTime?)null, departureTime = (DateTime?)null },
            pendingTasks,
            gatePass,
            certificate,
            taskStats,
            recentTasks,
            attendanceStats,
            pendingRequests,
            activeTransfer,
            transferStats,
            activeShiftChange,
            requiredDocsUploaded = docsApproved,
            onboarding = new
            {
                deviceTracked = intern.User.DeviceBoundAt != null,
                deviceTrackedAt = intern.User.DeviceBoundAt,
                deviceLabel = intern.User.DeviceLabel,
                docsUploaded = uploadedDocsInfo.Count > 0,
                docsApproved,
                faceEnrollmentStatus = intern.FaceEnrollmentStatus.ToString(),
                ready = docsApproved && intern.FaceEnrollmentStatus == FaceEnrollmentStatus.Approved
            }
        });
    }

    // ─── Leave applications ─────────────────────────────────────────────
    [HttpGet("leaves")]
    public async Task<IActionResult> GetMyLeaves()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var leaves = await _db.LeaveApplications
            .Where(l => l.InternId == intern.Id)
            .OrderByDescending(l => l.CreatedAt)
            .Select(l => new
            {
                l.Id,
                l.StartDate,
                l.EndDate,
                l.Reason,
                status = l.Status.ToString(),
                l.DecidedAt,
                l.RejectionReason,
                l.CreatedAt
            })
            .ToListAsync();
        return Ok(leaves);
    }

    [Idempotent]
    [HttpPost("leaves")]
    public async Task<IActionResult> ApplyLeave([FromBody] ApplyLeaveRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        if (req.StartDate == null || req.EndDate == null)
            return BadRequest(new { message = "Start and end dates are required." });
        var start = (DateTime)req.StartDate;
        var end = (DateTime)req.EndDate;
        if (end < start)
            return BadRequest(new { message = "End date cannot be before the start date." });
        var reason = (req.Reason ?? "").Trim();
        if (string.IsNullOrEmpty(reason))
            return BadRequest(new { message = "Please provide a reason for the leave." });

        var settings = await _db.AttendanceSettings.FirstOrDefaultAsync();
        var allowed = settings?.AllowedLeaveDays ?? 0;
        var leaveUsed = await _db.Attendances.CountAsync(a => a.InternId == intern.Id && a.IsOnLeave);
        if (leaveUsed >= allowed)
            return BadRequest(new { message = "You have already used all your allowed leave days." });

        var leave = new LeaveApplication
        {
            InternId = intern.Id,
            StartDate = start,
            EndDate = end,
            Reason = reason
        };
        _db.LeaveApplications.Add(leave);
        await _db.SaveChangesAsync();

        if (intern.Mentor != null)
            await _notifications.NotifyAsync(
                intern.Mentor.UserId,
                "Leave requested",
                $"{intern.FullName} applied for leave starting {start.ToString("dd MMM yyyy")}.",
                NotificationType.Leave,
                "LeaveApplication", (int)leave.Id,
                CurrentUserId, (int)intern.Id, intern.DepartmentId,
                ActivityLogType.LeaveApplied);

        return Ok(new { id = (int)leave.Id, status = leave.Status.ToString() });
    }

    // ─── Device MACs ─────────────────────────────────────────────────────
    [HttpGet("devices")]
    public async Task<IActionResult> GetMyDevices()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var devices = await _db.DeviceMacs.Where(d => d.InternId == intern.Id).ToListAsync();
        return Ok(new
        {
            laptop = devices.FirstOrDefault(d => d.DeviceType == DeviceType.Laptop)?.MacAddress,
            phone = devices.FirstOrDefault(d => d.DeviceType == DeviceType.Phone)?.MacAddress
        });
    }

    [HttpPut("devices")]
    public async Task<IActionResult> UpsertMyDevices([FromBody] UpsertDevicesRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var laptopMac = (req.LaptopMac ?? "").Trim();
        var phoneMac = (req.PhoneMac ?? "").Trim();

        if (laptopMac.Length > 0 && !IsValidMac(laptopMac))
            return BadRequest(new { message = "Laptop MAC address is invalid. Use format AA:BB:CC:DD:EE:FF." });
        if (phoneMac.Length > 0 && !IsValidMac(phoneMac))
            return BadRequest(new { message = "Phone MAC address is invalid. Use format AA:BB:CC:DD:EE:FF." });

        if (laptopMac.Length > 0)
            await UpsertDevice(intern.Id, DeviceType.Laptop, laptopMac);
        if (phoneMac.Length > 0)
            await UpsertDevice(intern.Id, DeviceType.Phone, phoneMac);

        return Ok(await GetMyDevicesResult(intern.Id));
    }

    private static bool IsValidMac(string mac)
    {
        var parts = mac.Trim().Split(':');
        if (parts.Length != 6) return false;
        foreach (var part in parts)
        {
            if (part.Length != 2) return false;
            foreach (var c in part)
            {
                if (!"0123456789abcdefABCDEF".Contains(c)) return false;
            }
        }
        return true;
    }

    private async Task<object> GetMyDevicesResult(int internId)
    {
        var devices = await _db.DeviceMacs.Where(d => d.InternId == internId).ToListAsync();
        return new
        {
            laptop = devices.FirstOrDefault(d => d.DeviceType == DeviceType.Laptop)?.MacAddress,
            phone = devices.FirstOrDefault(d => d.DeviceType == DeviceType.Phone)?.MacAddress
        };
    }

    private async Task<object> UpsertDevice(int internId, DeviceType type, string mac)
    {
        var existing = await _db.DeviceMacs.FirstOrDefaultAsync(d => d.InternId == internId && d.DeviceType == type);
        if (existing != null)
        {
            existing.MacAddress = mac;
            existing.UpdatedAt = DateTime.Now;
        }
        else
        {
            _db.DeviceMacs.Add(new DeviceMac { InternId = internId, DeviceType = type, MacAddress = mac });
        }
        await _db.SaveChangesAsync();
        return null;
    }

    // ─── Profile ──────────────────────────────────────────────────────────────
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        return Ok(new
        {
            fullName = intern.FullName,
            username = intern.User.Username,
            regNo = intern.RegNo,
            cnic = intern.CNIC,
            university = intern.University,
            degree = intern.Degree,
            gender = intern.Gender.HasValue ? (int)intern.Gender.Value : (int?)null,
            department = intern.Department?.Name,
            departmentLatitude = intern.Department?.Latitude,
            departmentLongitude = intern.Department?.Longitude,
            mentorName = intern.Mentor?.FullName,
            startDate = intern.StartDate,
            endDate = intern.EndDate,
            faceEnrolled = intern.FaceEnrolled,
            faceEnrollmentStatus = intern.FaceEnrollmentStatus.ToString(),
            faceRejectedReason = intern.FaceRejectedReason,
            facePhotoPath = intern.FaceEnrollmentRecords
                .Where(r => r.PhotoPath != null)
                .OrderByDescending(r => r.EnrolledAt)
                .Select(r => r.PhotoPath)
                .FirstOrDefault() ?? "",
            facePhotoThumbPath = intern.FaceEnrollmentRecords
                .Where(r => r.PhotoThumbPath != null)
                .OrderByDescending(r => r.EnrolledAt)
                .Select(r => r.PhotoThumbPath)
                .FirstOrDefault() ?? "",
            presentDays = await _db.Attendances.CountAsync(a => a.InternId == intern.Id && a.Status == AttendanceStatus.Present),
            docsApprovedCount = await _db.DocumentUploads.CountAsync(d => d.InternId == intern.Id && d.WithdrawnAt == null && d.Status == DocumentRequestStatus.Approved),
            tasksActiveCount = await _db.Tasks.CountAsync(t => t.InternId == intern.Id && t.Status != Core.Entities.TaskStatus.Completed),
            tasksDoneCount = await _db.Tasks.CountAsync(t => t.InternId == intern.Id && t.Status == Core.Entities.TaskStatus.Completed),
            docsApproved = await RequiredDocsApprovedAsync(intern.Id),
            cnicApproved = await _db.DocumentUploads.AnyAsync(d => d.InternId == intern.Id && d.WithdrawnAt == null &&
                d.Status == DocumentRequestStatus.Approved && d.DocumentType == UploadDocumentType.Cnic),
            cvApproved = await _db.DocumentUploads.AnyAsync(d => d.InternId == intern.Id && d.WithdrawnAt == null &&
                d.Status == DocumentRequestStatus.Approved && d.DocumentType == UploadDocumentType.Resume),
            reportApproved = await _db.DocumentUploads.AnyAsync(d => d.InternId == intern.Id && d.WithdrawnAt == null &&
                d.Status == DocumentRequestStatus.Approved && d.DocumentType == UploadDocumentType.Report),
            deviceTracked = intern.User.DeviceBoundAt != null,
            deviceLabel = intern.User.DeviceLabel
        });
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        if (req.Gender.HasValue && (req.Gender.Value == 0 || req.Gender.Value == 1))
            intern.Gender = (InternGender)req.Gender.Value;

        intern.University = req.University;
        intern.Degree = req.Degree;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternUpdated,
            Description = $"'{intern.FullName}' updated their profile",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Profile updated" });
    }

    // ─── Face Enrollment ─────────────────────────────────────────────────────
    [Idempotent]
    [HttpPost("face/enroll")]
    public async Task<IActionResult> EnrollFace([FromBody] FaceEnrollRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        if (!await RequiredDocsApprovedAsync(intern.Id))
            return BadRequest(new { code = "DOCS_NOT_APPROVED", message = "Upload and get approval for your CNIC and CV/Resume before enrolling your face." });

        if (string.IsNullOrWhiteSpace(req.FaceImage))
            return BadRequest(new { message = "A face photo is required for enrollment" });

        if (intern.FaceEnrollmentStatus == FaceEnrollmentStatus.Pending)
            return BadRequest(new { message = "Your face enrollment is already under review. Please wait for admin/mentor verification." });

        if (intern.FaceEnrollmentStatus == FaceEnrollmentStatus.Approved)
            return BadRequest(new { message = "Your face is already enrolled. Ask your admin to remove the current enrollment before re-enrolling." });

        // Passive anti-spoof first: reject printed photos / screen / video replay.
        var (isReal, _) = _face.CheckAntiSpoof(req.FaceImage);
        if (!isReal)
            return BadRequest(new { message = "Face could not be validated as live. Please retake in good lighting, look directly at the camera, and remove glasses if needed." });

        // Extract a fresh, server-side 512-d embedding from the submitted photo.
        float[] embedding;
        try
        {
            embedding = _face.ExtractEmbedding(req.FaceImage);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = $"No clear face detected in the photo: {ex.Message}" });
        }

        // Persist the enrollment selfie for admin review.
        var (selfiePath, selfieThumbPath) = await _files.SaveBase64ImageWithThumbAsync(req.FaceImage, Path.Combine("faces", intern.Id.ToString()));

        intern.FaceEmbeddingJson = "[" + string.Join(",", embedding) + "]";
        intern.FaceEnrolled = false;
        intern.FaceEnrollmentStatus = FaceEnrollmentStatus.Pending;
        intern.FaceEnrolledAt = DateTime.Now;
        intern.FaceApprovedByUserId = null;
        intern.FaceRejectedReason = null;

        _db.FaceEnrollmentRecords.Add(new FaceEnrollmentRecord
        {
            InternId = intern.Id,
            Status = FaceEnrollmentStatus.Pending.ToString(),
            PhotoPath = selfiePath,
            PhotoThumbPath = selfieThumbPath
        });

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.FaceEnrollmentSubmitted,
            Description = $"'{intern.FullName}' completed face enrollment",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();

        if (intern.Mentor != null)
            await _notifications.NotifyAsync(intern.Mentor.UserId, "Face enrollment submitted",
                $"{intern.FullName} completed face enrollment", NotificationType.FaceEnrollment);

        return Ok(new { message = "Face enrollment recorded. Awaiting admin/mentor approval.", status = FaceEnrollmentStatus.Pending.ToString() });
    }

    // ─── Attendance ───────────────────────────────────────────────────────────
    [HttpPost("attendance")]
    public async Task<IActionResult> MarkAttendance([FromBody] MarkAttendanceRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        // Prevent duplicate attendance for today
        var existing = await _db.Attendances
            .AnyAsync(a => a.InternId == intern.Id && a.Timestamp.Date == DateTime.Now.Date);
        if (existing)
            return BadRequest(new { message = "Attendance already marked for today" });

        // 2. Strict Server-Side Geofence Check (fail-closed, D-S25)
        var verdict = _geo.EvaluateGeofence(intern.Department, req.Latitude, req.Longitude);
        if (!verdict.ConfigValid)
            return BadRequest(new { message = verdict.Message });

        double distanceMeters = verdict.DistanceMeters;
        double radius = verdict.AllowedRadiusMeters;
        bool isInRange = verdict.InRange;

        // 3. Face matching removed: attendance is GPS-geofence gated only.
        bool faceVerified = isInRange;
        double faceConfidence = isInRange ? 1.0 : 0.0;

        // 4. Strict Status Determination
        AttendanceStatus status;
        string notes = "";

        if (!isInRange)
        {
            status = AttendanceStatus.Absent;
            notes = $"Out of office geofence range ({distanceMeters:F0}m from office, max allowed {radius:F0}m)";
        }
        else
        {
            status = AttendanceStatus.Present;
            notes = $"Verified in office range ({distanceMeters:F0}m) via GPS";
        }

        if (req.FailureCount >= 3 && status == AttendanceStatus.Absent)
        {
            status = AttendanceStatus.PendingReview;
            notes += " • Flagged for mentor review";
        }

        var attendance = new Attendance
        {
            InternId = intern.Id,
            Timestamp = DateTime.Now,
            Latitude = req.Latitude,
            Longitude = req.Longitude,
            IsInRange = isInRange,
            DistanceMeters = distanceMeters == double.MaxValue ? 0 : distanceMeters,
            FaceVerified = faceVerified,
            FaceConfidence = faceConfidence,
            LivenessVerified = req.LivenessVerified,
            Status = status,
            Notes = notes,
            ArrivalStatus = isInRange ? AttendanceSlotStatus.Pending : AttendanceSlotStatus.Absent
        };
        if (status == AttendanceStatus.Present)
        {
            var (shiftStart, _, grace) = await _scoring.GetShiftTimesAsync(intern.Id);
            attendance.ArrivalStatus = AttendanceScoringService.ArrivalStatus(attendance.Timestamp, shiftStart, grace);
        }
        _db.Attendances.Add(attendance);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.AttendanceMarked,
            Description = $"Attendance: {status} for '{intern.FullName}' (range:{isInRange}, face:{faceVerified}){ActivityDevice.Summary(intern.User)}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId,
            Metadata = ActivityDevice.Metadata(intern.User)
        });

        await _db.SaveChangesAsync();

        if (intern.Mentor != null)
        {
            await _notifications.NotifyAsync(
                intern.Mentor.UserId,
                status == AttendanceStatus.Absent ? "Attendance: Absent" : "Attendance marked",
                $"{intern.FullName} — {status} ({distanceMeters:F0}m from office)",
                NotificationType.Attendance);
        }

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

        if (month == 0) month = DateTime.Now.Month;
        if (year == 0) year = DateTime.Now.Year;

        var records = await _db.Attendances
            .Where(a => a.InternId == intern.Id &&
                        a.Timestamp.Month == month && a.Timestamp.Year == year)
            .OrderByDescending(a => a.Timestamp)
            .Select(a => new
            {
                a.Id, a.Timestamp, a.OutTime, departureTime = a.OutTime, a.IsInRange, a.DistanceMeters,
                a.FaceVerified, a.FaceConfidence, a.LivenessVerified,
                a.CheckInPhotoPath, a.CheckOutPhotoPath,
                status = a.Status.ToString(), a.Notes,
                arrivalStatus = a.ArrivalStatus.ToString(),
                departureStatus = a.DepartureStatus.ToString(),
                isOnLeave = a.IsOnLeave
            }).ToListAsync();

        return Ok(records);
    }

    // ─── Tasks ───────────────────────────────────────────────────────────────
    [HttpGet("tasks")]
    public async Task<IActionResult> GetMyTasks(
        [FromQuery] string? status,
        [FromQuery] string? keyword,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var query = _db.Tasks.Where(t => t.InternId == intern.Id).AsQueryable();
        if (!string.IsNullOrEmpty(status) && Enum.TryParse<Core.Entities.TaskStatus>(status, out var s))
            query = query.Where(t => t.Status == s);
        if (!string.IsNullOrEmpty(keyword))
            query = query.Where(t => t.Title.Contains(keyword) || t.Description.Contains(keyword));
        if (from.HasValue)
            query = query.Where(t => t.CreatedAt >= from.Value);
        if (to.HasValue)
            query = query.Where(t => t.CreatedAt < to.Value.AddDays(1));

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

        var task = await _db.Tasks
            .Include(t => t.AssignedByMentor)
            .FirstOrDefaultAsync(t => t.Id == taskId && t.InternId == intern.Id);
        if (task == null) return NotFound();

        task.Status = Core.Entities.TaskStatus.Completed;
        task.CompletedAt = DateTime.Now;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.TaskCompleted,
            Description = $"Task '{task.Title}' completed by '{intern.FullName}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();

        if (task.AssignedByMentor != null && task.AssignedByMentor.UserId != CurrentUserId)
            await _notifications.NotifyAsync(task.AssignedByMentor.UserId, "Task completed",
                $"{intern.FullName} completed '{task.Title}'", NotificationType.Task);

        return Ok(new { message = "Task marked as completed" });
    }

    // ─── Gate Pass ───────────────────────────────────────────────────────────
    [HttpGet("gatepass")]
    public async Task<IActionResult> GetGatePass()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var list = await _db.GatePasses
            .Where(g => g.InternId == intern.Id)
            .OrderByDescending(g => g.RequestedAt)
            .Select(g => new
            {
                g.Id, status = g.Status.ToString(),
                g.RequestedAt, g.ApprovedAt, g.RejectionReason, g.PdfPath,
                issued = g.PdfPath != null,
                hasStudentId = g.StudentIdImagePath != null,
                hasCnic = g.CnicImagePath != null
            }).ToListAsync();

        return Ok(list);
    }

    [Idempotent]
    [HttpPost("gatepass")]
    public async Task<IActionResult> RequestGatePass([FromForm] GatePassUploadRequest? req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        if (intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved)
            return BadRequest(new { code = "FACE_NOT_APPROVED", message = "Your face enrollment must be approved before you can request official documents." });

        // Gate pass gate: CNIC + CV/Resume uploads must be approved (face checked above)
        if (!await _db.OfficialDocsApprovedAsync(intern.Id))
            return BadRequest(new { code = "DOCS_NOT_APPROVED", message = "Your CNIC and CV/Resume must be approved before you can request a gate pass." });

        // Check no pending/approved gate pass exists
        var existing = await _db.GatePasses
            .AnyAsync(g => g.InternId == intern.Id &&
                (g.Status == DocumentRequestStatus.Pending || g.Status == DocumentRequestStatus.Approved));
        if (existing)
            return BadRequest(new { message = "You already have an active gate pass request" });

        string? studentIdPath = null, cnicPath = null;
        if (req?.StudentIdImage != null)
            studentIdPath = await _files.SaveFileAsync(req.StudentIdImage, "gatepasses");
        if (req?.CnicImage != null)
            cnicPath = await _files.SaveFileAsync(req.CnicImage, "gatepasses");

        if (studentIdPath == null || cnicPath == null)
        {
            var approved = await _db.DocumentUploads
                .Where(d => d.InternId == intern.Id && d.WithdrawnAt == null &&
                    d.Status == DocumentRequestStatus.Approved)
                .Select(d => new { d.DocumentType, d.FilePath })
                .ToListAsync();
            studentIdPath ??= approved.FirstOrDefault(a => a.DocumentType == UploadDocumentType.UniversityId)?.FilePath
                               ?? approved.FirstOrDefault(a => a.DocumentType == UploadDocumentType.Cnic)?.FilePath;
            cnicPath ??= approved.FirstOrDefault(a => a.DocumentType == UploadDocumentType.Cnic)?.FilePath;
            if (cnicPath == null)
                return BadRequest(new { message = "Upload and get approval for your CNIC and CV/Resume in the Documents section first" });
        }

        var gatePass = new GatePass
        {
            InternId = intern.Id,
            StudentIdImagePath = studentIdPath,
            CnicImagePath = cnicPath,
            Status = DocumentRequestStatus.Pending,
            RequestedAt = DateTime.Now
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

        if (intern.Mentor != null)
            await _notifications.NotifyAsync(intern.Mentor.UserId, "Gate pass requested",
                $"{intern.FullName} submitted a gate pass request", NotificationType.General);

        return Ok(new { message = "Gate pass request submitted", gatePassId = gatePass.Id });
    }

    // ─── ID Card ─────────────────────────────────────────────────────────────
    [HttpGet("idcard")]
    public async Task<IActionResult> GetIdCard()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var list = await _db.IdCardRequests
            .Where(i => i.InternId == intern.Id)
            .OrderByDescending(i => i.RequestedAt)
            .Select(i => new
            {
                i.Id, status = i.Status.ToString(),
                i.RequestedAt, i.ApprovedAt, i.RejectionReason, i.PdfPath,
                issued = i.PdfPath != null
            }).ToListAsync();

        return Ok(list);
    }

    [Idempotent]
    [HttpPost("idcard")]
    public async Task<IActionResult> RequestIdCard([FromForm] IdCardUploadRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        if (intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved)
            return BadRequest(new { code = "FACE_NOT_APPROVED", message = "Your face enrollment must be approved before you can request official documents." });

        // ID card gate: CNIC + CV/Resume uploads must be approved (face checked above)
        if (!await _db.OfficialDocsApprovedAsync(intern.Id))
            return BadRequest(new { code = "DOCS_NOT_APPROVED", message = "Your CNIC and CV/Resume must be approved before you can request an ID card." });

        var existing = await _db.IdCardRequests
            .AnyAsync(i => i.InternId == intern.Id &&
                (i.Status == DocumentRequestStatus.Pending || i.Status == DocumentRequestStatus.Approved));
        if (existing)
            return BadRequest(new { message = "You already have an active ID card request" });

        string? studentIdPath = null, cnicPath = null, photoPath = null;
        if (req.StudentIdImage != null) studentIdPath = await _files.SaveFileAsync(req.StudentIdImage, "idcards");
        if (req.CnicImage != null) cnicPath = await _files.SaveFileAsync(req.CnicImage, "idcards");
        if (req.Photo != null) photoPath = await _files.SaveFileAsync(req.Photo, "idcards");

        if (studentIdPath == null || cnicPath == null)
        {
            var approved = await _db.DocumentUploads
                .Where(d => d.InternId == intern.Id && d.WithdrawnAt == null &&
                    d.Status == DocumentRequestStatus.Approved)
                .Select(d => new { d.DocumentType, d.FilePath })
                .ToListAsync();
            studentIdPath ??= approved.FirstOrDefault(a => a.DocumentType == UploadDocumentType.UniversityId)?.FilePath
                               ?? approved.FirstOrDefault(a => a.DocumentType == UploadDocumentType.Cnic)?.FilePath;
            cnicPath ??= approved.FirstOrDefault(a => a.DocumentType == UploadDocumentType.Cnic)?.FilePath;
            if (cnicPath == null)
                return BadRequest(new { message = "Upload and get approval for your CNIC and CV/Resume in the Documents section first" });
        }

        var idReq = new IdCardRequest
        {
            InternId = intern.Id,
            StudentIdImagePath = studentIdPath,
            CnicImagePath = cnicPath,
            PhotoImagePath = photoPath,
            Status = DocumentRequestStatus.Pending,
            RequestedAt = DateTime.Now
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

        if (intern.Mentor != null)
            await _notifications.NotifyAsync(intern.Mentor.UserId, "ID card requested",
                $"{intern.FullName} submitted an ID card request", NotificationType.General);

        return Ok(new { message = "ID card request submitted", requestId = idReq.Id });
    }

    // ─── Certificate ─────────────────────────────────────────────────────────
    [HttpGet("certificate")]
    public async Task<IActionResult> GetCertificate()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var list = await _db.Certificates
            .Where(c => c.InternId == intern.Id)
            .OrderByDescending(c => c.AppliedAt)
            .Select(c => new
            {
                c.Id, status = c.Status.ToString(),
                c.ProjectName, c.ProjectOutcomes, c.LanguagesUsed, c.AdditionalNotes,
                c.TechStack, c.InternWork, c.DepartmentHeadName,
                c.AppliedAt, c.ApprovedAt, c.RejectionReason, c.PdfPath,
                c.ReportPath,
                highlightTaskId = c.HighlightTaskId,
                highlightTaskTitle = c.HighlightTask != null ? c.HighlightTask.Title : null,
                issued = c.PdfPath != null
            }).ToListAsync();

        return Ok(list);
    }

    // ─── Certificate eligibility & application ──────────────────────────────
    [HttpGet("certificate/eligibility")]
    public async Task<IActionResult> GetCertificateEligibility()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var result = await _scoring.ComputeAsync(intern.Id);
        var (_, thresholdPct, taskThresholdPct, _) = await _scoring.GetFullSettingsAsync();
        var task = await _scoring.ComputeTaskCompletionAsync(intern.Id);
        bool endDatePassed = intern.EndDate.Date <= DateTime.Now.Date;

        var reportApproved = await _db.DocumentUploads.AnyAsync(d => d.InternId == intern.Id && d.WithdrawnAt == null &&
            d.Status == DocumentRequestStatus.Approved && d.DocumentType == UploadDocumentType.Report);
        var completedTasks = await _db.Tasks.CountAsync(t => t.InternId == intern.Id && t.Status == Core.Entities.TaskStatus.Completed);

        return Ok(new
        {
            percentage = result.Percentage,
            totalScore = result.TotalScore,
            maxScore = result.MaxScore,
            totalDays = result.TotalDays,
            thresholdPct,
            taskPct = task.Percentage,
            taskCompleted = task.Completed,
            taskTotal = task.Total,
            taskThresholdPct,
            endDatePassed,
            reportApproved,
            completedTasks,
            eligible = endDatePassed && result.Percentage >= thresholdPct && task.Percentage >= taskThresholdPct &&
                       reportApproved && completedTasks > 0
        });
    }

    [Idempotent]
    [HttpPost("certificate")]
    public async Task<IActionResult> ApplyForCertificate([FromBody] ApplyCertRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        if (intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved)
            return BadRequest(new { code = "FACE_NOT_APPROVED", message = "Your face enrollment must be approved before you can request official documents." });

        // Certificate gate: internship must have ended, attendance % must meet the
        // threshold, and task completion % must meet the task threshold
        if (intern.EndDate.Date > DateTime.Now.Date)
            return BadRequest(new { message = "Certificate can only be applied after the internship end date has passed" });

        var result = await _scoring.ComputeAsync(intern.Id);
        var (_, thresholdPct, taskThresholdPct, _) = await _scoring.GetFullSettingsAsync();
        if (result.Percentage < thresholdPct)
            return BadRequest(new
            {
                message = $"Certificate requires at least {thresholdPct:F0}% attendance (current: {result.Percentage:F1}%)",
                percentage = result.Percentage,
                thresholdPct
            });

        var task = await _scoring.ComputeTaskCompletionAsync(intern.Id);
        if (task.Percentage < taskThresholdPct)
            return BadRequest(new
            {
                message = $"Certificate requires at least {taskThresholdPct:F0}% task completion (current: {task.Percentage:F1}%, {task.Completed}/{task.Total} tasks)",
                taskPct = task.Percentage,
                taskThresholdPct
            });

        // Certificate gate: an approved internship report upload is required
        var reportDoc = await _db.DocumentUploads
            .Where(d => d.InternId == intern.Id && d.WithdrawnAt == null &&
                d.Status == DocumentRequestStatus.Approved && d.DocumentType == UploadDocumentType.Report)
            .OrderByDescending(d => d.ApprovedAt)
            .Select(d => new { d.Id, d.FilePath })
            .FirstOrDefaultAsync();
        if (reportDoc == null)
            return BadRequest(new { code = "REPORT_NOT_APPROVED", message = "You must upload and get approval for your internship report before applying for a certificate." });

        // Certificate gate: a completed, mentor-assigned highlight task is required
        int? highlightTaskId = req.HighlightTaskId;
        if (!highlightTaskId.HasValue)
            return BadRequest(new { code = "HIGHLIGHT_TASK_REQUIRED", message = "Select one completed task to feature on your certificate." });

        var highlightTask = await _db.Tasks
            .Where(t => t.Id == highlightTaskId.Value && t.InternId == intern.Id && t.Status == Core.Entities.TaskStatus.Completed)
            .Select(t => new { t.Id, t.Title })
            .FirstOrDefaultAsync();
        if (highlightTask == null)
            return BadRequest(new { message = "The selected highlight task is invalid or not completed." });

        var existing = await _db.Certificates.AnyAsync(c => c.InternId == intern.Id &&
            (c.Status == CertificateStatus.Pending || c.Status == CertificateStatus.Approved));
        if (existing)
            return BadRequest(new { message = "Certificate request already exists" });

        var cert = new Certificate
        {
            InternId = intern.Id,
            ProjectName = req.ProjectName,
            ProjectOutcomes = req.ProjectOutcomes,
            LanguagesUsed = req.LanguagesUsed,
            AdditionalNotes = req.AdditionalNotes,
            ReportPath = reportDoc.FilePath,
            HighlightTaskId = highlightTaskId.Value,
            Status = CertificateStatus.Pending,
            AppliedAt = DateTime.Now
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

        if (intern.Mentor != null)
            await _notifications.NotifyAsync(intern.Mentor.UserId, "Certificate application submitted",
                $"{intern.FullName} applied for the completion certificate", NotificationType.Certificate);

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

    [Idempotent]
    [HttpPost("documents")]
    public async Task<IActionResult> UploadDocuments([FromForm] DocumentUploadRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var submissions = new[]
        {
            (File: req.CnicFile, Type: UploadDocumentType.Cnic),
            (File: req.UniversityIdFile, Type: UploadDocumentType.UniversityId),
            (File: req.ResumeFile, Type: UploadDocumentType.Resume),
            (File: req.NocFile, Type: UploadDocumentType.Noc),
            (File: req.ReportFile, Type: UploadDocumentType.Report)
        }.Where(s => s.File != null).ToArray();

        if (submissions.Length == 0)
            return BadRequest(new { message = "No files provided" });

        foreach (var s in submissions)
        {
            if (s.File!.Length > DocumentUploadRules.MaxFileSizeBytes)
                return BadRequest(new { message = $"{s.Type} exceeds the 5 MB per-file limit" });

            var ext = Path.GetExtension(s.File.FileName);
            if (!DocumentUploadRules.IsValidType(s.Type, ext))
                return BadRequest(new { message = $"{s.Type} must be {(s.Type == UploadDocumentType.Resume || s.Type == UploadDocumentType.Noc || s.Type == UploadDocumentType.Report ? "a PDF or image" : "an image (jpg/png)")}" });
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
                UploadedAt = DateTime.Now
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

        if (intern.Mentor != null)
            await _notifications.NotifyAsync(intern.Mentor.UserId, "Documents uploaded",
                $"{intern.FullName} uploaded {created.Count} document(s) for approval", NotificationType.Document);

        return Ok(new { message = "Documents submitted for approval", ids = created.Select(c => c.Id) });
    }

    [Idempotent]
    [HttpPost("documents/{id}/withdraw")]
    public async Task<IActionResult> WithdrawDocument(int id)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var doc = await _db.DocumentUploads
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id && d.InternId == intern.Id);
        if (doc == null) return NotFound();

        var affected = await StateTransitions.TryUpdateAsync(_db, "document withdrawal", "DocumentUploads", id,
            new[] { ("WithdrawnAt", (object?)DateTime.Now) },
            ("Status", WhereOp.Equal, DocumentRequestStatus.Pending.ToString()),
            ("WithdrawnAt", WhereOp.IsNull, null),
            ("InternId", WhereOp.Equal, intern.Id));
        if (affected == 0)
            return Conflict(new { code = "STALE_STATE", message = "This document was already decided or withdrawn. Refresh and try again." });

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

    // ─── Intern Transfers (intern side) ─────────────────────────────────────
    [HttpGet("transfers")]
    public async Task<IActionResult> GetMyTransfers()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var transfers = await _db.InternTransferRequests
            .Include(t => t.FromMentor).ThenInclude(m => m.Department)
            .Include(t => t.ToMentor).ThenInclude(m => m.Department)
            .Where(t => t.InternId == intern.Id)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new
            {
                t.Id,
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

    [HttpPost("transfers/{id}/accept")]
    [Idempotent]
    public async Task<IActionResult> AcceptTransfer(int id)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var actor = new TransferActor(CurrentUserId, UserRole.Intern, InternId: intern.Id);
        return TransferResponse(await _transfers.InternAcceptAsync(id, actor));
    }

    [HttpPost("transfers/{id}/reject")]
    [Idempotent]
    public async Task<IActionResult> RejectTransfer(int id, [FromBody] RejectInternTransferRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var actor = new TransferActor(CurrentUserId, UserRole.Intern, InternId: intern.Id);
        return TransferResponse(await _transfers.InternRejectAsync(id, actor, req.Reason));
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

    // ─── Intern Shift Changes (intern side) ────────────────────────────────
    [HttpGet("shift-change")]
    public async Task<IActionResult> GetMyShiftChanges()
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var requests = await _db.InternShiftChangeRequests
            .Include(r => r.FromShift)
            .Include(r => r.ToShift)
            .Where(r => r.InternId == intern.Id)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
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

    [HttpPost("shift-change/{id}/accept")]
    [Idempotent]
    public async Task<IActionResult> AcceptShiftChange(int id)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var request = await _db.InternShiftChangeRequests
            .Include(r => r.ToShift)
            .FirstOrDefaultAsync(r => r.Id == id && r.InternId == intern.Id);
        if (request == null) return NotFound();
        if (request.Status != InternShiftChangeStatus.Pending)
            return BadRequest(new { message = "This shift change is no longer pending" });

        request.Status = InternShiftChangeStatus.Accepted;
        request.InternAcceptedAt = DateTime.Now;
        intern.ShiftId = request.ToShiftId;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternShiftChanged,
            Description = $"Intern '{intern.FullName}' accepted shift change to '{request.ToShift.Name}'",
            PerformedByUserId = CurrentUserId,
            TargetInternId = intern.Id,
            DepartmentId = intern.DepartmentId
        });

        await _db.SaveChangesAsync();

        if (request.RequestedByUserId != intern.UserId)
        {
            var requestedBy = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.RequestedByUserId);
            if (requestedBy != null)
                await _notifications.NotifyAsync(request.RequestedByUserId, "Shift change accepted",
                    $"{intern.FullName} accepted the change to '{request.ToShift.Name}'", NotificationType.ShiftChange);
        }

        return Ok(new { message = "Shift change accepted", shift = request.ToShift.Name });
    }

    [HttpPost("shift-change/{id}/reject")]
    [Idempotent]
    public async Task<IActionResult> RejectShiftChange(int id, [FromBody] RejectInternTransferRequest req)
    {
        var intern = await GetCurrentIntern();
        if (intern == null) return NotFound();

        var request = await _db.InternShiftChangeRequests
            .FirstOrDefaultAsync(r => r.Id == id && r.InternId == intern.Id);
        if (request == null) return NotFound();
        if (request.Status != InternShiftChangeStatus.Pending)
            return BadRequest(new { message = "This shift change is no longer pending" });

        request.Status = InternShiftChangeStatus.Rejected;
        request.RejectionReason = req.Reason;

        await _db.SaveChangesAsync();

        if (request.RequestedByUserId != intern.UserId)
            await _notifications.NotifyAsync(request.RequestedByUserId, "Shift change rejected",
                $"{intern.FullName} rejected the shift change", NotificationType.ShiftChange);

        return Ok(new { message = "Shift change rejected" });
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

public record FaceEnrollRequest(string FaceImage);
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
    public IFormFile? NocFile { get; set; }
    public IFormFile? ReportFile { get; set; }
}
public record ApplyCertRequest(
    string ProjectName, string ProjectOutcomes, string LanguagesUsed, string? AdditionalNotes, int? HighlightTaskId);
public record UpdateProfileRequest(string? University, string? Degree, int? Gender);
public record ApplyLeaveRequest(DateTime? StartDate, DateTime? EndDate, string? Reason);
public record UpsertDevicesRequest(string? LaptopMac, string? PhoneMac);
