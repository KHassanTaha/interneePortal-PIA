using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.API.Services;

/// <summary>
/// Scheduled service that performs two internship-lifecycle passes:
/// <list type="bullet">
/// <item>2e - opens a <c>LateStartResolution</c> task for the mentor of an Active
/// intern whose <c>StartDate</c> is more than three days past with no attendance.</item>
/// <item>2f - notifies the intern and their mentor when attendance is recorded
/// after the internship <c>EndDate</c> has passed.</item>
/// </list>
///
/// Registered in <c>Program.cs</c> as of the REQ-10 endpoint layer (2026-10-14):
/// the resolution endpoint now exists (POST /api/mentor/tasks/{id}/resolve), so
/// the <c>LateStartResolution</c> tasks this pass opens can be closed by a mentor.
/// </summary>
public class LateStartResolutionService : IHostedService, IDisposable
{
    private readonly IServiceProvider _sp;
    private Timer? _timer;

    public LateStartResolutionService(IServiceProvider sp)
    {
        _sp = sp;
    }

    public Task StartAsync(CancellationToken ct)
    {
        var now = DateTime.Now;
        var runAt = new DateTime(now.Year, now.Month, now.Day, 2, 0, 0);
        if (runAt <= now) runAt = runAt.AddDays(1);
        var due = runAt - now;
        _timer = new Timer(DoWork, null, due, TimeSpan.FromDays(1));
        return Task.CompletedTask;
    }

    /// <summary>
    /// Runs the late-start scan (2e) and the reverse late-end notification pass
    /// (2f) exactly once against <paramref name="db"/>. Extracted from
    /// <see cref="DoWork"/> so tests can exercise the logic deterministically
    /// instead of waiting for the 02:00 schedule. This is a test-support seam;
    /// the scheduled behaviour is unchanged.
    /// </summary>
    internal static async Task RunOnceAsync(AppDbContext db)
    {
        var today = DateTime.Today;
        var cutoff = today.AddDays(-3);

        // 2e
        var lateStarts = await db.Interns
            .Where(i => i.Status == InternshipStatus.Active && i.StartDate < cutoff)
            .ToListAsync();
        foreach (var intern in lateStarts)
        {
            var hasAttendance = await db.Attendances.AnyAsync(a => a.InternId == intern.Id);
            if (hasAttendance) continue;
            var hasPending = await db.Tasks.AnyAsync(t => t.InternId == intern.Id && t.TaskType == "LateStartResolution" && t.Status == InternSystem.Core.Entities.TaskStatus.Pending);
            if (hasPending) continue;
            db.Tasks.Add(new InternTask
            {
                InternId = intern.Id,
                AssignedByMentorId = intern.MentorId,
                Title = "Late start resolution needed",
                Description = "Intern's start date is more than 3 days past with no attendance recorded.",
                Status = InternSystem.Core.Entities.TaskStatus.Pending,
                CreatedAt = DateTime.Now,
                TaskType = "LateStartResolution",
                DismissCount = 0,
                Metadata = System.Text.Json.JsonSerializer.Serialize(new { internId = intern.Id, startDate = intern.StartDate.ToString("o"), daysLate = (today - intern.StartDate.Date).Days })
            });
        }

        // 2f
        var pastEnd = await db.Interns
            .Where(i => i.Status == InternshipStatus.Active && i.EndDate < today)
            .ToListAsync();
        foreach (var intern in pastEnd)
        {
            var hasPastAtt = await db.Attendances.AnyAsync(a => a.InternId == intern.Id && a.Timestamp.Date > intern.EndDate.Date);
            if (!hasPastAtt) continue;
            // check if notification sent in last 24 hours
            var last24 = DateTime.Now.AddDays(-1);
            var hasNotif = await db.Notifications.AnyAsync(n => n.UserId == intern.UserId && n.Type == NotificationType.General && n.CreatedAt >= last24 && n.Title.Contains("Internship end date"));
            if (hasNotif) continue;
            db.Notifications.Add(new Notification
            {
                UserId = intern.UserId,
                Title = "Internship end date passed",
                Body = "Your internship end date has passed but you have recent attendance. Contact your mentor.",
                Type = NotificationType.General,
                IsRead = false,
                CreatedAt = DateTime.Now
            });
            var mentor = await db.Mentors.FirstOrDefaultAsync(m => m.Id == intern.MentorId);
            if (mentor != null)
            {
                var hasNotifM = await db.Notifications.AnyAsync(n => n.UserId == mentor.UserId && n.CreatedAt >= last24 && n.Title.Contains(intern.FullName));
                if (!hasNotifM)
                {
                    db.Notifications.Add(new Notification
                    {
                        UserId = mentor.UserId,
                        Title = $"{intern.FullName} marking attendance past end date",
                        Body = "Extend the end date or resolve their internship status.",
                        Type = NotificationType.General,
                        IsRead = false,
                        CreatedAt = DateTime.Now
                    });
                }
            }
        }
        await db.SaveChangesAsync();
    }

    private async void DoWork(object? state)
    {
        try
        {
            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await RunOnceAsync(db);
        }
        catch (Exception ex)
        {
            // A scheduled pass must never tear down the host; log and wait for the
            // next tick. An empty catch here would hide repeated failures (AGENTS 12.6).
            var logger = _sp.GetService<ILogger<LateStartResolutionService>>();
            logger?.LogError(ex, "LateStartResolutionService pass failed");
        }
    }

    public Task StopAsync(CancellationToken ct)
    {
        _timer?.Dispose();
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        _timer?.Dispose();
    }
}
