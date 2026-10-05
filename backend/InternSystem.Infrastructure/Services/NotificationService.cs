using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.Infrastructure.Services;

/// <summary>
/// Creates and reads in-app notifications, optionally attaching an ActivityLog row
/// so the same lifecycle event is visible in both feeds.
/// </summary>
public class NotificationService
{
    private readonly AppDbContext _db;

    public NotificationService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<Notification> NotifyAsync(
        int userId, string title, string body,
        NotificationType type = NotificationType.General,
        string? entityType = null, int? entityId = null,
        int? performedByUserId = null, int? targetInternId = null,
        int? departmentId = null, ActivityLogType? logType = null)
    {
        var notification = new Notification
        {
            UserId = userId,
            Title = title,
            Body = body,
            Type = type,
            EntityType = entityType,
            EntityId = entityId,
            CreatedAt = DateTime.Now
        };
        _db.Notifications.Add(notification);

        if (logType.HasValue)
        {
            _db.ActivityLogs.Add(new ActivityLog
            {
                LogType = logType.Value,
                Description = body,
                PerformedByUserId = performedByUserId,
                TargetInternId = targetInternId,
                DepartmentId = departmentId
            });
        }

        await _db.SaveChangesAsync();
        return notification;
    }

    public async Task<List<Notification>> GetForUserAsync(int userId, bool? unreadOnly = null)
    {
        var q = _db.Notifications.Where(n => n.UserId == userId);
        if (unreadOnly.HasValue && unreadOnly.Value)
            q = q.Where(n => !n.IsRead);
        return await q.OrderByDescending(n => n.CreatedAt).ToListAsync();
    }

    public async Task<int> UnreadCountAsync(int userId)
    {
        return await _db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead);
    }

    public async Task<bool> MarkReadAsync(int userId, int notificationId)
    {
        var n = await _db.Notifications.FirstOrDefaultAsync(x => x.Id == notificationId && x.UserId == userId);
        if (n == null) return false;
        n.IsRead = true;
        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<int> MarkAllReadAsync(int userId)
    {
        var unread = await _db.Notifications.Where(n => n.UserId == userId && !n.IsRead).ToListAsync();
        foreach (var n in unread) n.IsRead = true;
        await _db.SaveChangesAsync();
        return unread.Count;
    }
}