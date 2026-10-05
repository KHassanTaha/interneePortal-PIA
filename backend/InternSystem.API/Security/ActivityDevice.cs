using InternSystem.Core.Entities;

namespace InternSystem.API.Security;

public static class ActivityDevice
{
    // Human-readable label appended to log descriptions, e.g. " (Google Pixel 7)".
    public static string Summary(User? user) =>
        user?.Role == UserRole.Intern && !string.IsNullOrWhiteSpace(user.DeviceLabel)
            ? $" ({user.DeviceLabel.Trim()})"
            : string.Empty;

    // Structured device info stored in a log's Metadata (JSON) for the detail modal.
    public static string? Metadata(User? user)
    {
        if (user?.Role != UserRole.Intern || string.IsNullOrWhiteSpace(user.DeviceIdHash))
            return null;

        var hash = user.DeviceIdHash.Length > 10 ? $"{user.DeviceIdHash[..10]}…" : user.DeviceIdHash;
        return System.Text.Json.JsonSerializer.Serialize(new
        {
            deviceHash = hash,
            deviceLabel = user.DeviceLabel
        });
    }
}