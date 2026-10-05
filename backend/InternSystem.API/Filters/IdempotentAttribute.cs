using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace InternSystem.API.Filters;

/// <summary>
/// Applied with <c>[Idempotent]</c> to POST endpoints that offline clients can
/// queue and retry. When an <c>Idempotency-Key</c> header is present:
///   * A stored record for the same user+key is replayed verbatim (short circuits).
///   * Otherwise the action executes and the outcome is cached (2xx/4xx only;
///     5xx/network failures are never stored so retries actually re-run).
/// Rows expire after 7 days via <see cref="IdempotencyService"/>.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class IdempotentAttribute : TypeFilterAttribute
{
    public IdempotentAttribute() : base(typeof(IdempotencyFilter)) { }
}

public sealed class IdempotencyFilter : IAsyncActionFilter
{
    private const int MaxKeyLength = 64;
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DictionaryKeyPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() }
    };

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var key = context.HttpContext.Request.Headers["Idempotency-Key"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(key) || key.Length > MaxKeyLength)
        {
            // No key (or an abusive one): behave as a plain write.
            await next();
            return;
        }
        if (string.Equals(context.HttpContext.Request.Method, HttpMethods.Get, StringComparison.OrdinalIgnoreCase))
        {
            await next();
            return;
        }
        if (!int.TryParse(context.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        {
            await next();
            return;
        }

        var service = context.HttpContext.RequestServices.GetRequiredService<IdempotencyService>();

        var replay = await service.FindReplayAsync(userId, key);
        if (replay != null)
        {
            context.Result = new ContentResult
            {
                StatusCode = replay.StatusCode,
                Content = replay.ResponseBody ?? "",
                ContentType = "application/json; charset=utf-8"
            };
            return;
        }

        var executed = await next();

        // Only terminal outcomes are cached. 5xx/exceptions are not so retries re-run.
        var status = executed.HttpContext.Response.StatusCode;
        if (status < 200 || status >= 500 || executed.Exception != null)
            return;

        var body = SerializeResult(executed.Result);
        var path = context.HttpContext.Request.Path.ToString();
        await service.SaveAsync(userId, context.HttpContext.Request.Method, path, key, status, body);
    }

    private static string? SerializeResult(IActionResult result)
    {
        switch (result)
        {
            case ObjectResult objectResult when objectResult.Value != null:
                return JsonSerializer.Serialize(objectResult.Value, SerializerOptions);
            case JsonResult jsonResult:
                return JsonSerializer.Serialize(jsonResult.Value, SerializerOptions);
            case ContentResult contentResult:
                return contentResult.Content;
            default:
                return null;
        }
    }
}