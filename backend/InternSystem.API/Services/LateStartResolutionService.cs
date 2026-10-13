using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.API.Services;

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

    private async void DoWork(object? state)
    {
        try
        {
            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
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
        catch { }
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
