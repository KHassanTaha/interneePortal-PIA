using System.Security.Claims;
using InternSystem.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InternSystem.API.Controllers;

[ApiController]
[Route("api/notification")]
[Authorize]
public class NotificationController : ControllerBase
{
    private readonly NotificationService _service;

    public NotificationController(NotificationService service)
    {
        _service = service;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<IActionResult> GetNotifications([FromQuery] bool? unreadOnly)
    {
        var notifications = await _service.GetForUserAsync(CurrentUserId, unreadOnly);
        return Ok(notifications.Select(n => new
        {
            n.Id,
            n.Title,
            n.Body,
            type = n.Type.ToString(),
            n.EntityType,
            n.EntityId,
            n.IsRead,
            n.CreatedAt
        }));
    }

    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount()
    {
        return Ok(new { count = await _service.UnreadCountAsync(CurrentUserId) });
    }

    [HttpPut("{id}/read")]
    public async Task<IActionResult> MarkRead(int id)
    {
        var ok = await _service.MarkReadAsync(CurrentUserId, id);
        return ok ? Ok(new { message = "Marked as read" }) : NotFound();
    }

    [HttpPut("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var count = await _service.MarkAllReadAsync(CurrentUserId);
        return Ok(new { message = "All notifications marked as read", count });
    }
}