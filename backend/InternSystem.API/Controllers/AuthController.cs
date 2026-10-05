using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using InternSystem.API.Security;
using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using InternSystem.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private const int MaxFailedAttempts = 5;
    private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(1);

    private readonly AppDbContext _db;
    private readonly JwtService _jwt;

    public AuthController(AppDbContext db, JwtService jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var username = req.Username?.Trim();
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { message = "Username and password are required." });

        var user = await _db.Users
            .Include(u => u.Intern).ThenInclude(i => i!.Department)
            .Include(u => u.Mentor).ThenInclude(m => m!.Department)
            .FirstOrDefaultAsync(u => u.Username.ToLower() == username.ToLower());

        if (user == null || !VerifyPassword(req.Password, user.PasswordHash))
        {
            if (user != null)
                await RecordFailedAttempt(user);
            return Unauthorized(new { message = "Invalid credentials" });
        }

        if (user.LockedUntil.HasValue && user.LockedUntil > DateTime.Now)
        {
            var minutes = Math.Ceiling((user.LockedUntil.Value - DateTime.Now).TotalMinutes);
            return StatusCode(StatusCodes.Status423Locked, new
            {
                message = $"Account temporarily locked due to too many failed attempts. Try again in {minutes:0} minute(s)."
            });
        }

        if (!user.IsActive)
            return StatusCode(403, new { message = "Your account has been deactivated. Please contact the administrator." });

        // One active login per intern: an intern may sign in from any device, but
        // while another device holds a live session the login is refused. The device
        // is recorded on every login so it can be tracked in the activity log.
        if (user.Role == UserRole.Intern)
        {
            var deviceId = req.DeviceId?.Trim();
            var hasActiveSession = !string.IsNullOrWhiteSpace(user.RefreshToken)
                && user.RefreshTokenExpiry.HasValue
                && user.RefreshTokenExpiry > DateTime.Now;

            if (!string.IsNullOrWhiteSpace(deviceId))
            {
                var hash = DeviceHash(deviceId);
                if (hasActiveSession && user.DeviceIdHash != null
                    && !string.Equals(user.DeviceIdHash, hash, StringComparison.Ordinal))
                {
                    var otherDevice = string.IsNullOrWhiteSpace(user.DeviceLabel)
                        ? "another device"
                        : $"'{user.DeviceLabel}'";
                    return StatusCode(403, new
                    {
                        code = "ALREADY_LOGGED_IN_ELSEWHERE",
                        message = $"You are already signed in on {otherDevice}. Log out there first, then sign in here again."
                    });
                }

                user.DeviceIdHash = hash;
                user.DeviceBoundAt = DateTime.Now;
                user.DeviceLabel = string.IsNullOrWhiteSpace(req.DeviceLabel) ? null : req.DeviceLabel.Trim();
            }
        }

        user.FailedLoginAttempts = 0;
        user.LockedUntil = null;

        var accessToken = _jwt.GenerateAccessToken(user);
        var refreshToken = _jwt.GenerateRefreshToken();

        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiry = DateTime.Now.Add(SessionLifetime);
        await _db.SaveChangesAsync();

        // Log activity
        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.Login,
            Description = $"User '{user.Username}' logged in{ActivityDevice.Summary(user)}",
            PerformedByUserId = user.Id,
            DepartmentId = user.Intern?.DepartmentId ?? user.Mentor?.DepartmentId,
            CreatedAt = DateTime.Now,
            Metadata = ActivityDevice.Metadata(user)
        });
        await _db.SaveChangesAsync();

        object? profile = null;
        if (user.Role == UserRole.Intern && user.Intern != null)
        {
            profile = new
            {
                internId = user.Intern.Id,
                fullName = user.Intern.FullName,
                department = user.Intern.Department?.Name,
                departmentId = user.Intern.DepartmentId,
                faceEnrolled = user.Intern.FaceEnrolled,
                faceEnrollmentStatus = user.Intern.FaceEnrollmentStatus.ToString(),
                faceRejectedReason = user.Intern.FaceRejectedReason,
                mustChangePassword = user.MustChangePassword,
                startDate = user.Intern.StartDate,
                endDate = user.Intern.EndDate
            };
        }
        else if (user.Role == UserRole.Mentor && user.Mentor != null)
        {
            profile = new
            {
                mentorId = user.Mentor.Id,
                fullName = user.Mentor.FullName,
                department = user.Mentor.Department?.Name,
                departmentId = user.Mentor.DepartmentId
            };
        }

        return Ok(new
        {
            accessToken,
            refreshToken,
            role = user.Role.ToString(),
            userId = user.Id,
            profile,
            device = user.Role == UserRole.Intern
                ? new
                {
                    deviceHash = user.DeviceIdHash != null ? $"{user.DeviceIdHash[..10]}…" : null,
                    deviceLabel = user.DeviceLabel,
                    deviceTrackedAt = user.DeviceBoundAt
                }
                : null
        });
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users
            .Include(u => u.Intern)
            .FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return NotFound();

        // Locked-out users cannot change their password to bypass the lockout.
        if (user.LockedUntil.HasValue && user.LockedUntil > DateTime.Now)
            return StatusCode(StatusCodes.Status423Locked, new { message = "Account is temporarily locked." });

        if (!VerifyPassword(req.CurrentPassword, user.PasswordHash))
            return Unauthorized(new { message = "Current password is incorrect." });

        var policyError = PasswordPolicy.Validate(req.NewPassword);
        if (policyError != null)
            return BadRequest(new { message = policyError });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.MustChangePassword = false;
        // Revoke all outstanding access tokens; the app's refresh interceptor issues fresh ones.
        user.TokenVersion++;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.PasswordReset,
            Description = $"'{user.Username}' changed their password",
            PerformedByUserId = user.Id,
            DepartmentId = user.Intern?.DepartmentId
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Password changed" });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u =>
            u.RefreshToken == req.RefreshToken &&
            u.RefreshTokenExpiry > DateTime.Now);

        if (user == null)
            return Unauthorized(new { message = "Invalid or expired refresh token" });

        // Rotation: each refresh invalidates the previously issued refresh token,
        // so a stolen/replayed refresh token is rejected on reuse.
        var accessToken = _jwt.GenerateAccessToken(user);
        var newRefreshToken = _jwt.GenerateRefreshToken();

        user.RefreshToken = newRefreshToken;
        user.RefreshTokenExpiry = DateTime.Now.Add(SessionLifetime);
        await _db.SaveChangesAsync();

        return Ok(new { accessToken, refreshToken = newRefreshToken });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest req)
    {
        var user = await _db.Users
            .Include(u => u.Intern)
            .FirstOrDefaultAsync(u => u.RefreshToken == req.RefreshToken);
        if (user != null)
        {
            _db.ActivityLogs.Add(new ActivityLog
            {
                LogType = ActivityLogType.Logout,
                Description = $"User '{user.Username}' logged out{ActivityDevice.Summary(user)}",
                PerformedByUserId = user.Id,
                DepartmentId = user.Intern?.DepartmentId,
                CreatedAt = DateTime.Now,
                Metadata = ActivityDevice.Metadata(user)
            });

            user.RefreshToken = null;
            user.RefreshTokenExpiry = null;
            // Revoke every outstanding access token immediately.
            user.TokenVersion++;
            await _db.SaveChangesAsync();
        }
        return Ok(new { message = "Logged out" });
    }

    private async Task RecordFailedAttempt(User user)
    {
        user.FailedLoginAttempts++;
        if (user.FailedLoginAttempts >= MaxFailedAttempts)
            user.LockedUntil = DateTime.Now.Add(LockoutDuration);
        await _db.SaveChangesAsync();
    }

    private static bool VerifyPassword(string password, string? hash)
    {
        if (string.IsNullOrWhiteSpace(hash)) return false;
        try { return BCrypt.Net.BCrypt.Verify(password, hash); }
        catch { return false; }
    }

    private static string DeviceHash(string deviceId)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        var bytes = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(deviceId));
        return Convert.ToHexString(bytes);
    }
}

public record LoginRequest([MaxLength(100)] string Username, [MaxLength(128)] string Password, [MaxLength(256)] string? DeviceId = null, [MaxLength(200)] string? DeviceLabel = null);
public record RefreshRequest([MaxLength(512)] string RefreshToken);
public record ChangePasswordRequest([MaxLength(128)] string CurrentPassword, [MaxLength(128)] string NewPassword);