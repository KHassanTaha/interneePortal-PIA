using System.Text.Json;
using InternSystem.API.Controllers;
using InternSystem.Core.Entities;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace InternSystem.Integration.Tests;

/// <summary>
/// REQ-04: the intern list endpoints must expose the enrollment thumbnail so the
/// admin/mentor list rows and the intern detail card can render the intern's own
/// face photo instead of an initials placeholder.
///
/// These tests call the real <see cref="AdminController.GetInterns"/> action — not a
/// copy of its LINQ — so deleting or renaming the <c>photoThumbPath</c> projection
/// fails here. The action does not read the current principal, so it is invoked
/// against a ControllerContext-less instance; only the DbContext is supplied (the
/// other constructor dependencies are unused by this action).
///
/// The companion assertion, that an intern with no enrollment record yields a null
/// thumb (so the client falls back to initials), is the other half of the contract:
/// the selector filters on <c>PhotoThumbPath != null</c>, and a naive
/// <c>OrderByDescending(EnrolledAt).First()</c> would return null from a newer
/// photo-less record and hide an older valid thumb.
/// </summary>
[Collection(SqlServerCollection.Name)]
public class InternPhotoThumbExposureTests : IAsyncLifetime
{
    private readonly SqlServerTestDatabase _database;

    public InternPhotoThumbExposureTests(SqlServerTestDatabase database) => _database = database;

    public async Task InitializeAsync() => await _database.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Enrolled_intern_has_photo_thumb_path_exposed()
    {
        var (internId, thumbPath) = await SeedAsync(withThumb: true);

        var thumb = await ReadAdminListThumbAsync(internId);

        Assert.Equal(thumbPath, thumb);
    }

    [Fact]
    public async Task Intern_without_face_enrollment_returns_null_photo_thumb_path()
    {
        var (internId, _) = await SeedAsync(withThumb: false);

        var thumb = await ReadAdminListThumbAsync(internId);

        Assert.Null(thumb);
    }

    [Fact]
    public async Task Selector_skips_a_newer_photo_less_record_and_keeps_the_last_real_thumb()
    {
        // Face approval appends a new record without a photo (see PdfService's note),
        // so the newest record can carry a null thumb. The selector must skip it and
        // still surface the last record that actually has a thumbnail.
        var (internId, thumbPath) = await SeedAsync(withThumb: true);
        await using (var db = _database.CreateContext())
        {
            db.FaceEnrollmentRecords.Add(new FaceEnrollmentRecord
            {
                InternId = internId,
                Status = FaceEnrollmentStatus.Approved.ToString(),
                EnrolledAt = DateTime.Now.AddMinutes(5),
                PhotoPath = null,
                PhotoThumbPath = null
            });
            await db.SaveChangesAsync();
        }

        var thumb = await ReadAdminListThumbAsync(internId);

        Assert.Equal(thumbPath, thumb);
    }

    private async Task<string?> ReadAdminListThumbAsync(int internId)
    {
        await using var db = _database.CreateContext();
        var controller = new AdminController(db, null!, null!, null!, null!, null!, null!, null!);

        var result = await controller.GetInterns(departmentId: null, mentorId: null);
        var ok = Assert.IsType<OkObjectResult>(result);

        using var document = JsonDocument.Parse(JsonSerializer.Serialize(ok.Value)!);
        var row = document.RootElement.EnumerateArray().Single(e => e.GetProperty("Id").GetInt32() == internId);
        var thumb = row.GetProperty("photoThumbPath");
        return thumb.ValueKind == JsonValueKind.Null ? null : thumb.GetString();
    }

    private async Task<(int InternId, string ThumbPath)> SeedAsync(bool withThumb)
    {
        await using var db = _database.CreateContext();

        var mentorUser = new User
        {
            Username = $"m-{Guid.NewGuid():N}"[..20],
            PasswordHash = "x",
            Role = UserRole.Mentor,
            IsActive = true
        };
        db.Users.Add(mentorUser);
        var mentor = new Mentor { User = mentorUser, FullName = "Photo Mentor", Designation = "M", DepartmentId = 1 };
        db.Mentors.Add(mentor);

        var internUser = new User
        {
            Username = $"u-{Guid.NewGuid():N}"[..20],
            PasswordHash = "x",
            Role = UserRole.Intern,
            IsActive = true
        };
        db.Users.Add(internUser);

        var intern = new Intern
        {
            User = internUser,
            Mentor = mentor,
            FullName = "Photo Intern",
            RegNo = $"PH-{Guid.NewGuid():N}"[..12],
            DepartmentId = 1,
            StartDate = new DateTime(2026, 3, 1),
            EndDate = new DateTime(2026, 12, 31),
            FaceEnrollmentStatus = FaceEnrollmentStatus.Approved,
            FaceEnrolled = true
        };
        db.Interns.Add(intern);
        await db.SaveChangesAsync();

        var thumbPath = $"faces/{Guid.NewGuid():N}_thumb.jpg";
        if (withThumb)
        {
            db.FaceEnrollmentRecords.Add(new FaceEnrollmentRecord
            {
                InternId = intern.Id,
                Status = FaceEnrollmentStatus.Approved.ToString(),
                EnrolledAt = DateTime.Now,
                PhotoPath = $"faces/{Guid.NewGuid():N}.jpg",
                PhotoThumbPath = thumbPath
            });
            await db.SaveChangesAsync();
        }

        return (intern.Id, thumbPath);
    }
}
