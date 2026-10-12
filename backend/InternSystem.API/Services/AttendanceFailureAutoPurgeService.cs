using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.API.Services;

public class AttendanceFailureAutoPurgeService : IHostedService, IDisposable
{
    private readonly IServiceProvider _sp;
    private Timer? _timer;

    public AttendanceFailureAutoPurgeService(IServiceProvider sp)
    {
        _sp = sp;
    }

    public Task StartAsync(CancellationToken ct)
    {
        var now = DateTime.Now;
        var runAt = new DateTime(now.Year, now.Month, now.Day, 3, 0, 0);
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
            var now = DateTime.Now;
            var toPurge = await db.AttendanceFailureRecords.Where(f => f.PurgeAfter.HasValue && f.PurgeAfter.Value <= now).ToListAsync();
            foreach (var x in toPurge)
            {
                if (!string.IsNullOrWhiteSpace(x.ImagePath) && File.Exists(x.ImagePath))
                {
                    try { File.Delete(x.ImagePath); } catch { }
                }
                db.ActivityLogs.Add(new ActivityLog
                {
                    LogType = ActivityLogType.AttendanceFailureAutoPurged,
                    Description = $"Auto-purged attendance failure {x.Id} for intern {x.InternId} (reason {x.ReasonCode})",
                    PerformedByUserId = null,
                    TargetInternId = (int)x.InternId,
                    CreatedAt = DateTime.Now
                });
                db.AttendanceFailureRecords.Remove(x);
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
