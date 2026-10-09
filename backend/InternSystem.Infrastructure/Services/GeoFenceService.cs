using InternSystem.Core.Entities;

namespace InternSystem.Infrastructure.Services;

public class GeoFenceService
{
    public const string MissingGeofenceConfigMessage =
        "This department does not have coordinates configured. Contact an administrator.";

    public const double DefaultRadiusMeters = 100.0;

    private const double EarthRadiusMeters = 6371000;

    public double HaversineDistance(double lat1, double lon1, double lat2, double lon2)
    {
        var dLat = ToRadians(lat2 - lat1);
        var dLon = ToRadians(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) *
                Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return EarthRadiusMeters * c;
    }

    public bool IsInRange(double userLat, double userLon, double centerLat, double centerLon, double radiusMeters)
    {
        var distance = HaversineDistance(userLat, userLon, centerLat, centerLon);
        return distance <= radiusMeters;
    }

    /// <summary>True only when the intern's department carries a usable geofence
    /// centre: non-null Latitude/Longitude within valid ranges and non-zero.</summary>
    public bool HasValidCoordinates(Department? department)
    {
        if (department?.Latitude is not double lat || department.Longitude is not double lon)
            return false;
        if (lat == 0 || lon == 0)
            return false;
        return lat is >= -90 and <= 90 && lon is >= -180 and <= 180;
    }

    /// <summary>Fail-closed geofence decision (D-S25). Department coordinates are
    /// the only authorised centre; there is no hardcoded fallback. A department
    /// with missing or invalid coordinates rejects with the MISSING_GEOFENCE_CONFIG
    /// message rather than a default office location.</summary>
    public GeoFenceResult EvaluateGeofence(Department? department, double userLat, double userLon)
    {
        if (!HasValidCoordinates(department))
            return GeoFenceResult.MissingConfig();

        double distance = HaversineDistance(userLat, userLon, department!.Latitude!.Value, department.Longitude!.Value);
        double allowedRadius = (department.RadiusMeters is double r && r > 0) ? r : DefaultRadiusMeters;
        bool inRange = distance <= allowedRadius;
        string? message = inRange ? null : BuildOutOfBoundsMessage(distance, department.Name, allowedRadius);
        return GeoFenceResult.FromDecision(inRange, distance, allowedRadius, message);
    }

    private static string BuildOutOfBoundsMessage(double distanceMeters, string departmentName, double allowedRadius)
        => $"You are out of bounds! You are {distanceMeters:F0}m away from {departmentName} (must be within {allowedRadius:F0}m)";

    private static double ToRadians(double degrees) => degrees * Math.PI / 180;
}

/// <summary>The non-serialisable outcome of a geofence decision. When
/// <see cref="ConfigValid"/> is false the department has no usable coordinates and
/// <see cref="Message"/> carries the MISSING_GEOFENCE_CONFIG text.</summary>
public sealed record GeoFenceResult(
    bool ConfigValid,
    bool InRange,
    double DistanceMeters,
    double AllowedRadiusMeters,
    string? Message)
{
    public static GeoFenceResult MissingConfig()
        => new(false, false, 0, 0, GeoFenceService.MissingGeofenceConfigMessage);

    public static GeoFenceResult FromDecision(bool inRange, double distanceMeters, double allowedRadiusMeters, string? message)
        => new(true, inRange, distanceMeters, allowedRadiusMeters, message);
}
