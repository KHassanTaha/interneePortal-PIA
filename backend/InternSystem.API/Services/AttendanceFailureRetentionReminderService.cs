using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.API.Services;

public class AttendanceFailureRetentionReminderService : IHostedService, IDisposable
{
    private readonly IServiceProvider _sp;
    private Timer? _timer;

    public AttendanceFailureRetentionReminderService(IServiceProvider sp)
    {
        _sp = sp;
    }

    public Task StartAsync(CancellationToken ct)
    {
        // run weekly (7 days)
        _timer = new Timer(DoWork, null, TimeSpan.FromDays(7), TimeSpan.FromDays(7));
        return Task.CompletedTask;
    }

    private async void DoWork(object? state)
    {
        try
        {
            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var now = DateTime.Now;
            var cutoff = now.AddDays(-30);
            var count = await db.AttendanceFailureRecords.CountAsync(f => f.ClearedAt == null && f.AttemptedAt < cutoff);
            if (count > 0)
            {
                // send to all admins - batched
                var admins = await db.Users.Where(u => u.Role == InternSystem.Core.Entities.UserRole.Admin).Select(u => u.Id).ToListAsync();
                foreach (var aid in admins)
                {
                    db.Notifications.Add(new Notification
                    {
                        UserId = aid,
                        Title = "Attendance failures pending review",
                        Body = $"{count} attendance failure(s) older than 30 days need review",
                        Type = NotificationType.General,
                        IsRead = false,
                        CreatedAt = DateTime.Now
                    });
                }
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
