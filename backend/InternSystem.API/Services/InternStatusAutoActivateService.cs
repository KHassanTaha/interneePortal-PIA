using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.API.Services;

public class InternStatusAutoActivateService : IHostedService, IDisposable
{
    private readonly IServiceProvider _sp;
    private Timer? _timer;

    public InternStatusAutoActivateService(IServiceProvider sp)
    {
        _sp = sp;
    }

    public Task StartAsync(CancellationToken ct)
    {
        var now = DateTime.Now;
        var runAt = new DateTime(now.Year, now.Month, now.Day, 1, 0, 0);
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
            var toActivate = await db.Interns.Where(i => i.Status == InternshipStatus.Upcoming && i.StartDate <= today).ToListAsync();
            foreach (var intern in toActivate)
            {
                // close previous history
                var prev = await db.InternStatusHistories.Where(h => h.InternId == intern.Id && h.ToDate == null).ToListAsync();
                foreach (var p in prev) p.ToDate = DateTime.Now;
                intern.Status = InternshipStatus.Active;
                intern.StatusUpdatedAt = DateTime.Now;
                intern.StatusUpdatedByUserId = null;
                db.InternStatusHistories.Add(new InternStatusHistory
                {
                    InternId = intern.Id,
                    Status = InternshipStatus.Active,
                    FromDate = DateTime.Now,
                    ChangedByUserId = null,
                    Reason = "Auto-activated: StartDate reached"
                });
            }
            if (toActivate.Any())
            {
                db.ActivityLogs.Add(new ActivityLog
                {
                    LogType = ActivityLogType.InternUpdated,
                    Description = $"Auto-activated {toActivate.Count} intern(s) from Upcoming to Active",
                    PerformedByUserId = null,
                    CreatedAt = DateTime.Now
                });
                await db.SaveChangesAsync();
            }
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
