using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace InternSystem.API.Controllers;

/// <summary>
/// Authenticated, path-traversal-safe file serving for the uploads directory
/// (replaces the former public static-file mount at /files).
///
/// Authorization is ownership-based:
///   Admin          — any file.
///   Intern         — only their own files (documents/faces under their intern id, or a
///                    GatePass/IdCardRequest/Certificate owned by their intern record).
///   Mentor         — files of interns in their department or assigned to them, plus
///                    generated excel/pdf reports.
///   DepartmentHead — their department's intern files + their own signature.
///
/// The JWT comes from the Authorization header, or — for RN &lt;Image&gt; previews which
/// cannot attach headers — from a query-string "token" (strictly GET scoped).
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/files")]
public class FileController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly string _uploadRoot;

    public FileController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
        _uploadRoot = _config["FileStorage:UploadPath"]
            ?? Path.Combine(Directory.GetCurrentDirectory(), "uploads");
    }

    [HttpGet("{**path}")]
    public async Task<IActionResult> GetFile(string path)
    {
        // ── Authenticate (header JWT, or ?token= for image previews) ──────────
        string? rawToken = null;
        var headerAuth = Request.Headers.Authorization.ToString();
        if (!string.IsNullOrWhiteSpace(headerAuth) && headerAuth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            rawToken = headerAuth[7..].Trim();
        else if (Request.Query.TryGetValue("token", out var qToken) && !string.IsNullOrWhiteSpace(qToken.ToString()))
            rawToken = qToken.ToString();

        if (string.IsNullOrWhiteSpace(rawToken))
            return Unauthorized(new { message = "Authentication required" });

        var principal = ValidateJwt(rawToken);
        if (principal == null)
            return Unauthorized(new { message = "Invalid token" });

        if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Unauthorized(new { message = "Invalid token" });
        var role = principal.FindFirstValue(ClaimTypes.Role);

        // Server-side revocation parity (tvn must match the user's current TokenVersion).
        if (!int.TryParse(principal.FindFirstValue("tvn"), out var tokenVersion))
            return Unauthorized(new { message = "Token has been revoked" });
        var versionMatches = await _db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => (int?)u.TokenVersion)
            .FirstOrDefaultAsync();
        if (!versionMatches.HasValue || versionMatches != tokenVersion)
            return Unauthorized(new { message = "Token has been revoked" });

        // ── Resolve + sanitize the requested path ─────────────────────────────
        var relative = (path ?? "").Replace("\\", "/");
        if (string.IsNullOrWhiteSpace(relative) || Path.IsPathRooted(relative))
            return BadRequest(new { message = "Invalid path" });

        var segments = relative.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0)
            return BadRequest(new { message = "Invalid path" });

        var root = Path.GetFullPath(_uploadRoot);
        var candidate = Path.GetFullPath(Path.Combine(_uploadRoot, relative));
        if (!candidate.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Invalid path" });

        if (!System.IO.File.Exists(candidate))
            return NotFound();

        // ── Ownership resolution + authorization ──────────────────────────────
        var owner = await ResolveOwner(relative, segments);
        if (!await CanAccess(role, userId, owner, relative))
            return Forbid();

        // ── Serve ─────────────────────────────────────────────────────────────
        string contentType;
        if (relative.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) contentType = "application/pdf";
        else if (relative.EndsWith(".png", StringComparison.OrdinalIgnoreCase)) contentType = "image/png";
        else if (relative.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || relative.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)) contentType = "image/jpeg";
        else if (relative.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)) contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        else contentType = "application/octet-stream";

        var bytes = await System.IO.File.ReadAllBytesAsync(candidate);
        Response.Headers["Content-Disposition"] = $"inline; filename=\"{Path.GetFileName(candidate)}\"";
        return File(bytes, contentType);
    }

    private ClaimsPrincipal? ValidateJwt(string token)
    {
        try
        {
            var parameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!)),
                ValidateIssuer = true,
                ValidIssuer = _config["Jwt:Issuer"],
                ValidateAudience = true,
                ValidAudience = _config["Jwt:Audience"],
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30)
            };
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(token, parameters, out _);
            return principal;
        }
        catch
        {
            return null;
        }
    }

    private async Task<(List<int>? InternIds, int? HeadId)> ResolveOwner(string relative, string[] segments)
    {
        // documents/{internId}/... and faces/{internId}/...
        if (segments[0].Equals("documents", StringComparison.OrdinalIgnoreCase) && segments.Length >= 2)
            return (int.TryParse(segments[1], out var d) ? new List<int> { d } : null, null);
        if (segments[0].Equals("faces", StringComparison.OrdinalIgnoreCase) && segments.Length >= 2)
            return (int.TryParse(segments[1], out var f) ? new List<int> { f } : null, null);

        // DB-owned uploads + generated PDFs.
        if (segments[0].Equals("gatepasses", StringComparison.OrdinalIgnoreCase)
            || segments[0].Equals("idcards", StringComparison.OrdinalIgnoreCase)
            || segments[0].Equals("certificates", StringComparison.OrdinalIgnoreCase)
            || segments[0].Equals("pdfs", StringComparison.OrdinalIgnoreCase))
        {
            // A batch gate-pass letter is generated once and shared by every intern
            // in the approved chunk (same PdfPath on several rows), so collect all
            // owning intern ids rather than the first match.
            var internIds = await _db.GatePasses
                .Where(g => g.StudentIdImagePath == relative || g.CnicImagePath == relative || g.PdfPath == relative)
                .Select(g => g.InternId).Distinct().ToListAsync();
            if (internIds.Count > 0) return (internIds, null);

            internIds = await _db.IdCardRequests
                .Where(i => i.StudentIdImagePath == relative || i.CnicImagePath == relative || i.PhotoImagePath == relative || i.PdfPath == relative)
                .Select(i => i.InternId).Distinct().ToListAsync();
            if (internIds.Count > 0) return (internIds, null);

            internIds = await _db.Certificates
                .Where(c => c.PdfPath == relative || c.ReportPath == relative)
                .Select(c => c.InternId).Distinct().ToListAsync();
            if (internIds.Count > 0) return (internIds, null);
        }

        // signatures/head_{headId}.jpg
        if (segments[0].Equals("signatures", StringComparison.OrdinalIgnoreCase))
        {
            var filename = segments[^1];
            if (filename.StartsWith("head_", StringComparison.OrdinalIgnoreCase))
            {
                var headIdPart = filename[5..].Split('.')[0];
                if (int.TryParse(headIdPart, out var headId) && headId > 0)
                    return (null, headId);
            }
        }

        return (null, null);
    }

    private async Task<bool> CanAccess(string? role, int userId, (List<int>? InternIds, int? HeadId) owner, string relative)
    {
        if (role == nameof(UserRole.Admin))
            return true;

        // Generated report files (pdfs/report-*.pdf | excel/report-*.xlsx) carry no
        // single owner; mentors may fetch them.
        var isGeneratedReport = relative.StartsWith("pdfs/report-", StringComparison.OrdinalIgnoreCase)
            || relative.StartsWith("excel/report-", StringComparison.OrdinalIgnoreCase);

        if (role == nameof(UserRole.Mentor))
        {
            var mentor = await _db.Mentors.FirstOrDefaultAsync(m => m.UserId == userId);
            if (mentor == null) return false;

            if (owner.HeadId.HasValue)
                return await _db.DepartmentHeads.AnyAsync(h => h.Id == owner.HeadId && h.MentorId == mentor.Id);

            // Batch letters are shared by every intern in the approved chunk, so a
            // mentor may fetch one when ANY of its owners is in their scope.
            if (owner.InternIds is { Count: > 0 })
                return await _db.Interns.AnyAsync(i => owner.InternIds.Contains(i.Id)
                    && (i.MentorId == mentor.Id || i.DepartmentId == mentor.DepartmentId));

            // Generated report files have no single owner; mentors may fetch them.
            return true;
        }

        if (role == nameof(UserRole.Intern))
        {
            if ((owner.InternIds == null || owner.InternIds.Count == 0) && !isGeneratedReport) return false;
            var intern = await _db.Interns.FirstOrDefaultAsync(i => i.UserId == userId);
            if (intern == null) return false;
            // Interns can only generate their own reports server-side, so a
            // generated report file is safe to hand back to the requesting intern.
            // Batch letters are shared across their chunk, so any owner match grants access.
            return owner.InternIds is { Count: > 0 } ? owner.InternIds.Contains(intern.Id) : isGeneratedReport;
        }

        return false;
    }
}