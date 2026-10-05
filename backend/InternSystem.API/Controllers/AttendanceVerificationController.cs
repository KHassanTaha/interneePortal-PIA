using InternSystem.API.Filters;
using InternSystem.API.Security;
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
[Route("api/attendance")]
[Authorize(Roles = "Intern")]
public class AttendanceVerificationController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly GeoFenceService _geo;
    private readonly IConfiguration _config;
    private readonly AttendanceScoringService _scoring;
    private readonly FaceRecognitionService _face;
    private readonly FileService _files;

    public AttendanceVerificationController(AppDbContext db, GeoFenceService geo, IConfiguration config, AttendanceScoringService scoring, FaceRecognitionService face, FileService files)
    {
        _db = db;
        _geo = geo;
        _config = config;
        _scoring = scoring;
        _face = face;
        _files = files;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    /// <summary>Picks a random, unique, ordered liveness challenge set (2 of 4) per session.</summary>
    private static List<ChallengeItem> PickChallenges()
    {
        var ids = FaceChallengeBank.AllIds.OrderBy(_ => Random.Shared.Next()).Take(2).ToList();
        return ids.Select(id => new ChallengeItem(id, FaceChallengeBank.Labels[id])).ToList();
    }

    private async Task<Intern?> GetCurrentIntern() =>
        await _db.Interns
            .Include(i => i.Department)
            .Include(i => i.User)
            .FirstOrDefaultAsync(i => i.UserId == CurrentUserId);



    // ─── 1. START SESSION ───────────────────────────────────────────────────
    [HttpPost("start")]
    public async Task<IActionResult> StartSession()
    {
        var intern = await GetCurrentIntern();
        if (intern == null || !intern.User.IsActive)
            return BadRequest(new { code = "EMPLOYEE_INACTIVE", message = "Employee account is inactive or not found" });

        if (intern.Department == null || !intern.Department.IsActive)
            return BadRequest(new { code = "DEPARTMENT_INACTIVE", message = "Assigned department is inactive" });

        // 1:00 PM PKT cut-off check (DateTime.Now is local PKT)
        var nowPkt = DateTime.Now;
        int cutoffHour = _config.GetValue<int>("AttendanceCutoffHour", 13);

        // Check if attendance already marked today
        var existing = await _db.Attendances
            .FirstOrDefaultAsync(a => a.InternId == intern.Id && a.Timestamp.Date == DateTime.Now.Date);

        if (existing != null)
        {
            return BadRequest(new
            {
                code = "ATTENDANCE_ALREADY_MARKED",
                message = $"Attendance already marked for today as {existing.Status}",
                status = existing.Status.ToString()
            });
        }

        if (nowPkt.Hour >= cutoffHour)
        {
            // Auto mark absent after 1:00 PM
            var absentRecord = new Attendance
            {
                InternId = intern.Id,
                Timestamp = DateTime.Now,
                Latitude = 0,
                Longitude = 0,
                IsInRange = false,
                DistanceMeters = 0,
                FaceVerified = false,
                LocationVerified = false,
                Status = AttendanceStatus.Absent,
                Notes = $"Automatically marked ABSENT (Attempted after 1:00 PM cut-off time at {nowPkt:hh:mm tt})"
            };
            _db.Attendances.Add(absentRecord);
            await _db.SaveChangesAsync();

            return BadRequest(new
            {
                code = "ATTENDANCE_WINDOW_CLOSED",
                message = "Attendance window closed (Cut-off time was 1:00 PM). Marked ABSENT for today.",
                status = "Absent"
            });
        }

        // Expire any existing pending sessions for this user
        var pendingSessions = await _db.AttendanceVerificationSessions
            .Where(s => s.UserId == CurrentUserId && s.Status != VerificationSessionStatus.Completed && s.Status != VerificationSessionStatus.Expired)
            .ToListAsync();
        foreach (var s in pendingSessions) s.Status = VerificationSessionStatus.Expired;

        var session = new AttendanceVerificationSession
        {
            UserId = CurrentUserId,
            InternId = intern.Id,
            DepartmentId = intern.DepartmentId,
            CreatedAt = DateTime.Now,
            ExpiresAt = DateTime.Now.AddMinutes(5),
            Status = VerificationSessionStatus.Created,
            IssuedChallenges = JsonSerializer.Serialize(PickChallenges(), WebJson)
        };

        _db.AttendanceVerificationSessions.Add(session);
        await _db.SaveChangesAsync();

        var challenges = JsonSerializer.Deserialize<List<ChallengeItem>>(
            session.IssuedChallenges ?? "[]", WebJson) ?? new List<ChallengeItem>();

        return Ok(new
        {
            sessionId = session.Id,
            sessionGuid = session.SessionGuid,
            expiresAt = session.ExpiresAt,
            departmentName = intern.Department.Name,
            maxRadiusMeters = intern.Department.RadiusMeters ?? 100.0,
            departmentLatitude = (intern.Latitude.HasValue && intern.Latitude.Value != 0) ? intern.Latitude.Value : (intern.Department.Latitude ?? 24.894995),
            departmentLongitude = (intern.Longitude.HasValue && intern.Longitude.Value != 0) ? intern.Longitude.Value : (intern.Department.Longitude ?? 67.152182),
            challenges = challenges.Select(c => new { id = c.Id, label = c.Label })
        });
    }

    // ─── 2. FACE VERIFICATION (Step 1) ──────────────────────────────────────
    [HttpPost("{sessionId:int}/face/verify")]
    public async Task<IActionResult> VerifyFace(int sessionId, [FromBody] FaceVerificationRequest req)
    {
        var session = await _db.AttendanceVerificationSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == CurrentUserId);

        if (session == null || session.ExpiresAt < DateTime.Now || session.Status == VerificationSessionStatus.Expired)
            return BadRequest(new { code = "SESSION_EXPIRED", message = "Verification session expired or invalid" });

        var intern = await GetCurrentIntern();
        if (intern == null)
            return BadRequest(new { code = "INTERN_NOT_FOUND", message = "Intern profile not found" });

        if (!req.LivenessVerified)
        {
            session.Status = VerificationSessionStatus.Failed;
            session.FailureReason = "Liveness verification failed (motion challenge not satisfied)";
            await _db.SaveChangesAsync();
            return BadRequest(new { code = "LIVENESS_FAILED", message = "Liveness check failed. Please blink and turn head when prompted." });
        }

        if (string.IsNullOrWhiteSpace(req.FaceImage))
        {
            session.Status = VerificationSessionStatus.Failed;
            session.FailureReason = "No live face photo provided for verification";
            await _db.SaveChangesAsync();
            return BadRequest(new { code = "FACE_IMAGE_MISSING", message = "Live face photo required for verification" });
        }

        // Liveness challenge echo: the client must return the server-issued
        // challenges in the exact order issued, every one satisfied.
        var issued = JsonSerializer.Deserialize<List<ChallengeItem>>(session.IssuedChallenges ?? "[]", WebJson) ?? new();
        var echoValid =
            issued.Count > 0 &&
            req.ChallengeIds != null && req.ChallengeResults != null &&
            req.ChallengeIds.Count == issued.Count &&
            req.ChallengeResults.Count == issued.Count &&
            req.ChallengeIds.SequenceEqual(issued.Select(c => c.Id)) &&
            req.ChallengeResults.All(r => r);

        if (!echoValid)
        {
            session.Status = VerificationSessionStatus.Failed;
            session.FailureReason = "Liveness challenge responses did not match the server-issued challenges";
            await _db.SaveChangesAsync();
            return BadRequest(new { code = "LIVENESS_FAILED", message = "Liveness check failed. Please perform the exact challenges shown on screen." });
        }

        // Passive anti-spoof (fail-closed): printed photos, screens and video replays are rejected.
        var (isReal, _) = _face.CheckAntiSpoof(req.FaceImage);
        if (!isReal)
        {
            session.Status = VerificationSessionStatus.Failed;
            session.FailureReason = "Passive anti-spoof rejected the submitted photo";
            await _db.SaveChangesAsync();
            return BadRequest(new { code = "SPOOF_DETECTED", message = "Live-face check failed. Photos, screens and video replays are not accepted. Please look directly at the camera." });
        }

        // Server-side 1:1 comparison against the enrolled embedding.
        if (intern.FaceEnrollmentStatus != FaceEnrollmentStatus.Approved || string.IsNullOrWhiteSpace(intern.FaceEmbeddingJson))
        {
            session.Status = VerificationSessionStatus.Failed;
            session.FailureReason = $"Intern face status is {intern.FaceEnrollmentStatus}";
            await _db.SaveChangesAsync();
            return BadRequest(new
            {
                code = "NOT_ENROLLED",
                message = intern.FaceEnrollmentStatus == FaceEnrollmentStatus.Pending
                    ? "Your face profile is under review. You cannot verify attendance until it is approved."
                    : "You must enroll your face first (Profile → Face Verification)."
            });
        }

        float[] storedEmbedding;
        float[] liveEmbedding;
        try
        {
            storedEmbedding = JsonSerializer.Deserialize<float[]>(intern.FaceEmbeddingJson, WebJson)
                ?? throw new InvalidOperationException("Stored embedding is empty");
            liveEmbedding = _face.ExtractEmbedding(req.FaceImage);
        }
        catch (Exception ex)
        {
            session.Status = VerificationSessionStatus.Failed;
            session.FailureReason = ex.Message;
            await _db.SaveChangesAsync();
            return BadRequest(new { code = "FACE_NOT_DETECTED", message = "No clear face detected in the submitted photo. Please retake in good lighting." });
        }

        var (isMatch, _, similarity) = _face.Compare(liveEmbedding, storedEmbedding);
        if (!isMatch)
        {
            session.Status = VerificationSessionStatus.Failed;
            session.FailureReason = $"Face did not match enrolled identity (similarity {similarity:F3})";
            await _db.SaveChangesAsync();
            return BadRequest(new
            {
                code = "FACE_MISMATCH",
                message = "Face did not match your enrolled identity. Please retry.",
                similarityScore = Math.Round(similarity, 4)
            });
        }

        // Persist the verification selfie for later review.
        var photoPath = await _files.SaveBase64ImageAsync(
            req.FaceImage, Path.Combine("faces", intern.Id.ToString(), "verify"));

        session.FaceVerified = true;
        session.LivenessVerified = true;
        session.FaceConfidence = Math.Round(similarity, 4);
        session.VerificationPhotoPath = photoPath;
        session.Status = VerificationSessionStatus.FaceVerified;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            faceVerified = true,
            livenessVerified = true,
            similarityScore = Math.Round(similarity, 4),
            status = "FACE_VERIFIED"
        });
    }

    // ─── 3. LOCATION VERIFICATION (Step 2) ──────────────────────────────────
    [HttpPost("{sessionId:int}/location")]
    public async Task<IActionResult> VerifyLocation(int sessionId, [FromBody] LocationVerificationRequest req)
    {
        var session = await _db.AttendanceVerificationSessions
            .Include(s => s.Department)
            .Include(s => s.Intern)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == CurrentUserId);

        if (session == null || session.ExpiresAt < DateTime.Now || session.Status == VerificationSessionStatus.Expired)
            return BadRequest(new { code = "SESSION_EXPIRED", message = "Verification session expired" });

        double maxAccuracy = _config.GetValue<double>("MaxAllowedGpsAccuracyMeters", 50.0);
        if (req.GpsAccuracy > maxAccuracy)
        {
            return BadRequest(new
            {
                code = "GPS_ACCURACY_TOO_LOW",
                message = $"GPS accuracy is too low ({req.GpsAccuracy:F0}m). Maximum allowed is {maxAccuracy:F0}m."
            });
        }

        // Geofence centre: internship office location (captured at creation) → department coords → default
        double officeLat = (session.Intern?.Latitude != null && session.Intern.Latitude.Value != 0)
            ? session.Intern.Latitude.Value : 0;
        double officeLon = (session.Intern?.Longitude != null && session.Intern.Longitude.Value != 0)
            ? session.Intern.Longitude.Value : 0;
        double deptLat = (session.Department?.Latitude != null && session.Department.Latitude.Value != 0)
            ? session.Department.Latitude.Value : 24.894995;
        double deptLon = (session.Department?.Longitude != null && session.Department.Longitude.Value != 0)
            ? session.Department.Longitude.Value : 67.152182;
        double centerLat = officeLat != 0 ? officeLat : deptLat;
        double centerLon = officeLon != 0 ? officeLon : deptLon;
        double allowedRadius = (session.Department?.RadiusMeters != null && session.Department.RadiusMeters.Value > 0)
            ? session.Department.RadiusMeters.Value : 100.0;

        double distance = _geo.HaversineDistance(req.Latitude, req.Longitude, centerLat, centerLon);
        bool isInRange = distance <= allowedRadius;

        session.Latitude = req.Latitude;
        session.Longitude = req.Longitude;
        session.GpsAccuracy = req.GpsAccuracy;
        session.DistanceFromDepartment = distance;

        if (!isInRange)
        {
            session.Status = VerificationSessionStatus.Failed;
            session.FailureReason = $"Outside allowed geofence ({distance:F1}m from {session.Department?.Name}, max allowed {allowedRadius:F0}m)";
            await _db.SaveChangesAsync();

            return BadRequest(new
            {
                code = "OUTSIDE_ALLOWED_AREA",
                message = $"You are out of bounds! You are {distance:F0}m away from {session.Department?.Name} (must be within {allowedRadius:F0}m)",
                distanceMeters = Math.Round(distance),
                allowedRadiusMeters = allowedRadius
            });
        }

        session.LocationVerified = true;
        session.Status = VerificationSessionStatus.LocationVerified;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            locationVerified = true,
            distanceMeters = Math.Round(distance),
            allowedRadiusMeters = allowedRadius,
            status = "LOCATION_VERIFIED"
        });
    }

    // ─── 4. COMPLETE ATTENDANCE ─────────────────────────────────────────────
    [HttpPost("{sessionId:int}/complete")]
    public async Task<IActionResult> CompleteAttendance(int sessionId)
    {
        var session = await _db.AttendanceVerificationSessions
            .Include(s => s.Department)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == CurrentUserId);

        if (session == null || session.ExpiresAt < DateTime.Now || session.Status == VerificationSessionStatus.Expired)
            return BadRequest(new { code = "SESSION_EXPIRED", message = "Session expired or invalid" });

        if (!session.FaceVerified || !session.LocationVerified || !session.LivenessVerified)
            return BadRequest(new { code = "VERIFICATION_INCOMPLETE", message = "All verification steps (Face + Liveness + GPS Location) must pass before completing." });

        // Double check duplicate attendance
        var existing = await _db.Attendances
            .AnyAsync(a => a.InternId == session.InternId && a.Timestamp.Date == DateTime.Now.Date);
        if (existing)
            return BadRequest(new { code = "ATTENDANCE_ALREADY_MARKED", message = "Attendance already marked for today" });

        var attendance = new Attendance
        {
            InternId = session.InternId,
            Timestamp = DateTime.Now,
            Latitude = session.Latitude ?? 0,
            Longitude = session.Longitude ?? 0,
            GpsAccuracy = session.GpsAccuracy,
            IsInRange = true,
            DistanceMeters = session.DistanceFromDepartment ?? 0,
            FaceVerified = true,
            FaceConfidence = session.FaceConfidence ?? 0.95,
            LivenessVerified = true,
            LocationVerified = true,
            VerificationSessionId = session.Id,
            CheckInPhotoPath = session.VerificationPhotoPath,
            Status = AttendanceStatus.Present,
            Notes = $"Verified PRESENT at {session.Department?.Name} ({session.DistanceFromDepartment:F1}m away)"
        };

        var (shiftStart, _, grace) = await _scoring.GetShiftTimesAsync(session.InternId);
        attendance.ArrivalStatus = AttendanceScoringService.ArrivalStatus(attendance.Timestamp, shiftStart, grace);
        attendance.DepartureStatus = AttendanceSlotStatus.Pending;

        _db.Attendances.Add(attendance);
        session.Status = VerificationSessionStatus.Completed;
        session.CompletedAt = DateTime.Now;

        var deviceUser = await _db.Users.FirstOrDefaultAsync(u => u.Id == CurrentUserId);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.AttendanceMarked,
            Description = $"Intern marked PRESENT at {session.Department?.Name}{ActivityDevice.Summary(deviceUser)}",
            PerformedByUserId = CurrentUserId,
            TargetInternId = session.InternId,
            DepartmentId = session.DepartmentId,
            CreatedAt = DateTime.Now,
            Metadata = ActivityDevice.Metadata(deviceUser)
        });

        await _db.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            status = "PRESENT",
            checkInTime = attendance.Timestamp,
            departmentName = session.Department?.Name,
            distanceMeters = Math.Round(session.DistanceFromDepartment ?? 0)
        });
    }

    // ─── 5. CHECK-OUT (face + GPS, same gates as check-in) ──────────────────
    [HttpPost("checkout/start")]
    public async Task<IActionResult> StartCheckOutSession()
    {
        var intern = await GetCurrentIntern();
        if (intern == null || !intern.User.IsActive)
            return BadRequest(new { code = "EMPLOYEE_INACTIVE", message = "Employee account is inactive or not found" });

        if (intern.Department == null || !intern.Department.IsActive)
            return BadRequest(new { code = "DEPARTMENT_INACTIVE", message = "Assigned department is inactive" });

        var today = await _db.Attendances
            .FirstOrDefaultAsync(a => a.InternId == intern.Id && a.Timestamp.Date == DateTime.Now.Date);

        if (today == null)
            return BadRequest(new { code = "ATTENDANCE_NOT_MARKED", message = "You must mark attendance for today before checking out." });

        if (today.OutTime != null)
            return BadRequest(new { code = "ALREADY_CHECKED_OUT", message = "You have already checked out today" });

        // Expire any existing pending sessions for this user
        var pendingSessions = await _db.AttendanceVerificationSessions
            .Where(s => s.UserId == CurrentUserId && s.Status != VerificationSessionStatus.Completed && s.Status != VerificationSessionStatus.Expired)
            .ToListAsync();
        foreach (var s in pendingSessions) s.Status = VerificationSessionStatus.Expired;

        var session = new AttendanceVerificationSession
        {
            UserId = CurrentUserId,
            InternId = intern.Id,
            DepartmentId = intern.DepartmentId,
            CreatedAt = DateTime.Now,
            ExpiresAt = DateTime.Now.AddMinutes(5),
            Status = VerificationSessionStatus.Created,
            IssuedChallenges = JsonSerializer.Serialize(PickChallenges(), WebJson)
        };

        _db.AttendanceVerificationSessions.Add(session);
        await _db.SaveChangesAsync();

        var challenges = JsonSerializer.Deserialize<List<ChallengeItem>>(
            session.IssuedChallenges ?? "[]", WebJson) ?? new List<ChallengeItem>();

        return Ok(new
        {
            sessionId = session.Id,
            sessionGuid = session.SessionGuid,
            expiresAt = session.ExpiresAt,
            method = "checkout",
            departmentName = intern.Department.Name,
            maxRadiusMeters = intern.Department.RadiusMeters ?? 100.0,
            departmentLatitude = (intern.Latitude.HasValue && intern.Latitude.Value != 0) ? intern.Latitude.Value : (intern.Department.Latitude ?? 24.894995),
            departmentLongitude = (intern.Longitude.HasValue && intern.Longitude.Value != 0) ? intern.Longitude.Value : (intern.Department.Longitude ?? 67.152182),
            challenges = challenges.Select(c => new { id = c.Id, label = c.Label })
        });
    }

    [HttpPost("checkout/{sessionId:int}/complete")]
    public async Task<IActionResult> CompleteCheckOut(int sessionId)
    {
        var session = await _db.AttendanceVerificationSessions
            .Include(s => s.Department)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == CurrentUserId);

        if (session == null || session.ExpiresAt < DateTime.Now || session.Status == VerificationSessionStatus.Expired)
            return BadRequest(new { code = "SESSION_EXPIRED", message = "Verification session expired or invalid" });

        if (!session.FaceVerified || !session.LocationVerified)
        {
            session.Status = VerificationSessionStatus.Failed;
            session.FailureReason = "Check-out attempted without completing face and location verification";
            await _db.SaveChangesAsync();
            return BadRequest(new { code = "VERIFICATION_INCOMPLETE", message = "Face and location verification must both pass before checking out." });
        }

        var intern = await GetCurrentIntern();
        if (intern == null)
            return BadRequest(new { code = "INTERN_NOT_FOUND", message = "Intern profile not found" });

        var today = await _db.Attendances
            .FirstOrDefaultAsync(a => a.InternId == intern.Id && a.Timestamp.Date == DateTime.Now.Date);

        var (_, shiftEnd, grace) = await _scoring.GetShiftTimesAsync(intern.Id);
        var now = DateTime.Now;
        var depart = AttendanceScoringService.DepartureStatus(now, shiftEnd, grace);

        if (today == null)
        {
            // No check-in row captured (e.g. network dropped): recreate with a pending arrival
            today = new Attendance
            {
                InternId = intern.Id,
                Timestamp = now,
                OutTime = now,
                Latitude = session.Latitude ?? 0,
                Longitude = session.Longitude ?? 0,
                IsInRange = true,
                DistanceMeters = session.DistanceFromDepartment ?? 0,
                LocationVerified = true,
                FaceVerified = true,
                Status = AttendanceStatus.Present,
                CheckOutPhotoPath = session.VerificationPhotoPath,
                ArrivalStatus = AttendanceSlotStatus.Pending,
                DepartureStatus = depart,
                Notes = $"Checked out at {now:hh:mm tt} without a recorded check-in (arrival pending review)"
            };
            _db.Attendances.Add(today);
        }
        else
        {
            if (today.OutTime != null)
                return BadRequest(new { code = "ALREADY_CHECKED_OUT", message = "You have already checked out today" });

            today.OutTime = now;
            today.DepartureStatus = depart;
            today.Latitude = session.Latitude ?? 0;
            today.Longitude = session.Longitude ?? 0;
            today.DistanceMeters = session.DistanceFromDepartment ?? today.DistanceMeters;
            today.LocationVerified = true;
            today.CheckOutPhotoPath = session.VerificationPhotoPath;
            today.Notes = (today.Notes ?? "") + $" | Checked out at {now:hh:mm tt} (verified)";
        }

        session.Status = VerificationSessionStatus.Completed;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            checkOutTime = now,
            departureStatus = depart.ToString(),
            distanceMeters = Math.Round(session.DistanceFromDepartment ?? 0)
        });
    }
}

public class FaceVerificationRequest
{
    public string? FaceImage { get; set; }
    public bool LivenessVerified { get; set; }

    /// <summary>Server-issued challenge ids, echoed back in the exact order they were shown.</summary>
    public List<string>? ChallengeIds { get; set; }

    /// <summary>Per-challenge ML-Kit liveness verdicts, same order as ChallengeIds.</summary>
    public List<bool>? ChallengeResults { get; set; }
}

public record ChallengeItem(string Id, string Label);

public static class FaceChallengeBank
{
    public static readonly string[] AllIds = { "blink", "turn_left", "turn_right", "smile" };

    public static readonly Dictionary<string, string> Labels = new()
    {
        ["blink"] = "Look straight & Blink",
        ["turn_left"] = "Turn Head Left",
        ["turn_right"] = "Turn Head Right",
        ["smile"] = "Smile"
    };
}

public class LocationVerificationRequest
{
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double GpsAccuracy { get; set; }
}
