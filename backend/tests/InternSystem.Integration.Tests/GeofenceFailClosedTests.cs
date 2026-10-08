using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InternSystem.Integration.Tests;

/// <summary>
/// Covers the fail-closed geofence gate (REQ-01, D-S25) at the layer where the
/// decision actually lives.
///
/// Scope limitation, stated up front so nobody over-reads this file: the HTTP
/// envelope is applied in two controller actions (AttendanceVerificationController
/// VerifyLocation and InternController MarkAttendance), which both call
/// GeoFenceService.EvaluateGeofence and map the verdict to responses. Those actions
/// cannot be invoked here: they need an authenticated principal, and Program's
/// unguarded Database.Migrate() blocks WebApplicationFactory&lt;Program&gt; (see W2.9,
/// same limitation as FaceEnrollmentMirrorTests). The decision logic was therefore
/// extracted into GeoFenceService so the gate itself is testable without half a
/// controller. What these tests DO cover: a department with valid coordinates passes
/// the gate, every missing/invalid coordinate shape fails it closed with the exact
/// MISSING_GEOFENCE_CONFIG message, in-range and out-of-range users are decided with
/// the department centre and radius (no hardcoded fallback), and the 100 m radius
/// fallback for a null RadiusMeters is deliberately still in force (D-S25 leaves that
/// question open). What is NOT covered: that each controller passes the correct
/// department and maps the verdict to a 400. Closing that gap needs controller-level
/// test hosting, tracked separately.
/// </summary>
[Collection(SqlServerCollection.Name)]
public class GeofenceFailClosedTests : IAsyncLifetime
{
    private readonly SqlServerTestDatabase _database;
    private readonly GeoFenceService _geo = new();

    public GeofenceFailClosedTests(SqlServerTestDatabase database) => _database = database;

    public async Task InitializeAsync() => await _database.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Department_with_valid_coordinates_passes_the_gate_at_its_centre()
    {
        var dept = await SeedDepartmentAsync(24.894995, 67.152182, radius: 100);

        var result = _geo.EvaluateGeofence(dept, dept.Latitude!.Value, dept.Longitude!.Value);

        Assert.True(result.ConfigValid);
        Assert.True(result.InRange);
        Assert.Equal(0.0, result.DistanceMeters, 2);
        Assert.Null(result.Message);
    }

    [Fact]
    public async Task Null_coordinates_fail_closed_with_missing_geofence_config()
    {
        var dept = await SeedDepartmentAsync(null, null);

        var result = _geo.EvaluateGeofence(dept, 24.9, 67.15);

        Assert.False(result.ConfigValid);
        Assert.False(result.InRange);
        Assert.Equal(GeoFenceService.MissingGeofenceConfigMessage, result.Message);
    }

    [Fact]
    public async Task Null_latitude_fail_closed_with_missing_geofence_config()
    {
        var dept = await SeedDepartmentAsync(null, 67.152182);

        var result = _geo.EvaluateGeofence(dept, 24.9, 67.15);

        Assert.False(result.ConfigValid);
        Assert.Equal(GeoFenceService.MissingGeofenceConfigMessage, result.Message);
    }

    [Fact]
    public async Task Null_longitude_fail_closed_with_missing_geofence_config()
    {
        var dept = await SeedDepartmentAsync(24.894995, null);

        var result = _geo.EvaluateGeofence(dept, 24.9, 67.15);

        Assert.False(result.ConfigValid);
        Assert.Equal(GeoFenceService.MissingGeofenceConfigMessage, result.Message);
    }

    [Fact]
    public async Task Zero_coordinates_fail_closed_with_missing_geofence_config()
    {
        // (0,0) is in the gulf of Guinea: a real GPS fix would never be exactly
        // there, so a department sitting at zero has unconfigured coordinates
        // rather than a deliberate location.
        var dept = await SeedDepartmentAsync(0, 0);

        var result = _geo.EvaluateGeofence(dept, 24.9, 67.15);

        Assert.False(result.ConfigValid);
        Assert.Equal(GeoFenceService.MissingGeofenceConfigMessage, result.Message);
    }

    [Fact]
    public async Task Out_of_range_latitude_fail_closed_with_missing_geofence_config()
    {
        var dept = await SeedDepartmentAsync(999, 67.152182);

        var result = _geo.EvaluateGeofence(dept, 24.9, 67.15);

        Assert.False(result.ConfigValid);
        Assert.Equal(GeoFenceService.MissingGeofenceConfigMessage, result.Message);
    }

    [Fact]
    public async Task User_within_radius_passes_using_department_centre_only()
    {
        var dept = await SeedDepartmentAsync(24.894995, 67.152182, radius: 100);

        // ~0.0005 degrees of latitude ≈ 56 m north of the department centre.
        var result = _geo.EvaluateGeofence(dept, dept.Latitude!.Value + 0.0005, dept.Longitude!.Value);

        Assert.True(result.ConfigValid);
        Assert.True(result.InRange);
        Assert.True(result.DistanceMeters < 100);
        Assert.Equal(100, result.AllowedRadiusMeters, 2);
    }

    [Fact]
    public async Task User_outside_radius_is_rejected_with_distance_message_and_department_name()
    {
        var dept = await SeedDepartmentAsync(24.894995, 67.152182, radius: 100);

        // ~0.005 degrees of latitude ≈ 556 m north of the department centre.
        var result = _geo.EvaluateGeofence(dept, dept.Latitude!.Value + 0.005, dept.Longitude!.Value);

        Assert.True(result.ConfigValid);
        Assert.False(result.InRange);
        Assert.True(result.DistanceMeters > 100);
        Assert.Contains("You are out of bounds", result.Message);
        Assert.Contains(dept.Name, result.Message);
    }

    [Fact]
    public async Task Null_radius_keeps_the_100m_default_fallback()
    {
        // D-S25 explicitly leaves the null-radius default open; this fix does not
        // change it. The test pins the current 100 m behaviour so a later decision
        // on the matter starts from a known baseline.
        var dept = await SeedDepartmentAsync(24.894995, 67.152182, radius: null);

        var result = _geo.EvaluateGeofence(dept, dept.Latitude!.Value, dept.Longitude!.Value);

        Assert.True(result.ConfigValid);
        Assert.Equal(GeoFenceService.DefaultRadiusMeters, result.AllowedRadiusMeters, 2);
    }

    [Fact]
    public void HasValidCoordinates_rejects_a_null_department()
    {
        Assert.False(_geo.HasValidCoordinates(null));
    }

    [Fact]
    public void HasValidCoordinates_accepts_only_in_range_non_zero_coordinates()
    {
        Assert.True(_geo.HasValidCoordinates(new Department { Latitude = 24.894995, Longitude = 67.152182 }));
        Assert.False(_geo.HasValidCoordinates(new Department { Latitude = null, Longitude = 67.152182 }));
        Assert.False(_geo.HasValidCoordinates(new Department { Latitude = 24.894995, Longitude = 0 }));
        Assert.False(_geo.HasValidCoordinates(new Department { Latitude = 91, Longitude = 0.5 }));
        Assert.False(_geo.HasValidCoordinates(new Department { Latitude = 0.5, Longitude = 181 }));
    }

    private async Task<Department> SeedDepartmentAsync(double? latitude, double? longitude, double? radius = 100)
    {
        await using var db = _database.CreateContext();

        var dept = new Department
        {
            Name = $"GeoTest-{Guid.NewGuid():N}"[..20],
            Code = $"GT{Guid.NewGuid():N}"[..8],
            Latitude = latitude,
            Longitude = longitude,
            RadiusMeters = radius,
            IsActive = true
        };
        db.Departments.Add(dept);
        await db.SaveChangesAsync();
        return dept;
    }
}