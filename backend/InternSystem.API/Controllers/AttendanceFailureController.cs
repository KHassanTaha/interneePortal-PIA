using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;

namespace InternSystem.API.Controllers;

[ApiController]
[Route("api")]
public class AttendanceFailureController : ControllerBase
{
    private readonly AppDbContext _db;

    public AttendanceFailureController(AppDbContext db)
    {
        _db = db;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("admin/attendance-failures")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAdminFailures([FromQuery] long? internId, [FromQuery] string? reasonCode, [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var q = _db.AttendanceFailureRecords.Include(x => x.Intern).Include(x => x.Intern.User).AsQueryable();
        if (internId.HasValue) q = q.Where(x => x.InternId == internId.Value);
        if (!string.IsNullOrWhiteSpace(reasonCode)) q = q.Where(x => x.ReasonCode == reasonCode);
        if (from.HasValue) q = q.Where(x => x.AttemptedAt >= from.Value);
        if (to.HasValue) q = q.Where(x => x.AttemptedAt < to.Value.AddDays(1));
        var total = await q.CountAsync();
        var items = await q.OrderByDescending(x => x.AttemptedAt).Skip((page-1)*pageSize).Take(pageSize).ToListAsync();
        var codes = await _db.ReasonCodes.AsNoTracking().ToDictionaryAsync(r => r.Code);
        var result = items.Select(x => {
            codes.TryGetValue(x.ReasonCode, out var rc);
            return new {
                x.Id, x.InternId, internName = x.Intern?.FullName,
                x.ReasonCode, attemptedAt = x.AttemptedAt, x.ImagePath,
                x.AttemptedLatitude, x.AttemptedLongitude, x.DeviceIdHash, x.AdditionalContext,
                simplifiedMentor = rc?.SimplifiedMentor, technical = rc?.Technical, remedyMentor = rc?.RemedyMentor,
                x.ClearedAt, x.ArchivedAt, x.PurgeAfter
            };
        });
        return Ok(new { total, page, pageSize, items = result });
    }

    [HttpGet("admin/attendance-failures/{id:long}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAdminFailure(long id)
    {
        var x = await _db.AttendanceFailureRecords.Include(f => f.Intern).FirstOrDefaultAsync(f => f.Id == id);
        if (x == null) return NotFound();
        var rc = await _db.ReasonCodes.AsNoTracking().FirstOrDefaultAsync(r => r.Code == x.ReasonCode);
        _db.ActivityLogs.Add(new ActivityLog { LogType = ActivityLogType.AttendanceFailureImageRetrieved, Description = $"Admin retrieved attendance failure image for intern {x.InternId} (reason {x.ReasonCode})", PerformedByUserId = CurrentUserId, TargetInternId = (int)x.InternId, CreatedAt = DateTime.Now });
        await _db.SaveChangesAsync();
        return Ok(new {
            x.Id, x.InternId, internName = x.Intern?.FullName,
            x.ReasonCode, attemptedAt = x.AttemptedAt, x.ImagePath,
            x.AttemptedLatitude, x.AttemptedLongitude, x.DeviceIdHash, x.AdditionalContext,
            simplifiedMentor = rc?.SimplifiedMentor, technical = rc?.Technical, remedyMentor = rc?.RemedyMentor,
            x.ClearedAt, x.ArchivedAt, x.PurgeAfter
        });
    }

    [HttpGet("admin/attendance-failures/pending-clear-count")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetPendingClearCount()
    {
        var count = await _db.AttendanceFailureRecords.CountAsync(f => f.ClearedAt == null);
        return Ok(new { count });
    }
}

public record ClearRequest(bool Acknowledged);
public record ClearBatchRequest(List<long> Ids, bool Acknowledged);
