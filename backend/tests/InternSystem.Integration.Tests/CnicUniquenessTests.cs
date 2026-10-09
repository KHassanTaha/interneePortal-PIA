using InternSystem.API.Controllers;
using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InternSystem.Integration.Tests;

/// <summary>
/// Tests the REQ-12 one-account-per-person contract for CNIC.
///
/// Uniqueness is enforced twice: a filtered unique index
/// <c>UX_Interns_Cnic</c> (created for the live database by the Program.cs
/// schema guard, and for fresh/test databases by the EF model, mirroring the
/// existing RegNo index) and an API-level 409 pre-check in
/// <c>AdminController.CreateIntern</c> that names the owning username, per
/// D-S21. These tests exercise the database constraint; the API pre-check is
/// verified end-to-end against a running API because WebApplicationFactory
/// remains blocked (W2.9).
///
/// CNIC is also required on create (D-S30a). The three required tests invoke
/// the action directly for the same W2.9 reason — they assert the action's
/// own guard, which is what the HTTP pipeline falls through to for a
/// whitespace value (the [Required] attribute short-circuits missing/empty
/// ones one layer earlier, in the model-state factory).
///
/// Email is not part of this contract: the owner closed Q17 on 2026-10-08.
/// CNIC is the only uniqueness gate; email is not a stable identity key.
/// </summary>
[Collection(SqlServerCollection.Name)]
public class CnicUniquenessTests : IAsyncLifetime
{
    private const string SharedCnic = "42101-1000000-1";

    private readonly SqlServerTestDatabase _database;

    public CnicUniquenessTests(SqlServerTestDatabase database) => _database = database;

    public async Task InitializeAsync() => await _database.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Duplicate_cnic_is_rejected_by_the_unique_index()
    {
        await SeedInternAsync(cnic: SharedCnic);

        await using var second = _database.CreateContext();
        await Assert.ThrowsAsync<DbUpdateException>(() => AddInternAsync(second, cnic: SharedCnic));
    }

    [Fact]
    public async Task Two_interns_with_null_cnic_are_both_accepted()
    {
        await SeedInternAsync(cnic: null);
        await SeedInternAsync(cnic: null);
    }

    [Fact]
    public async Task Two_interns_with_empty_string_cnic_are_both_accepted()
    {
        // The filtered index treats '' as unset, same as the RegNo index. This
        // is why the schema-guard and model filters are "IS NOT NULL AND <> ''"
        // rather than the literal "IS NOT NULL" from the requirement.
        await SeedInternAsync(cnic: "");
        await SeedInternAsync(cnic: "");
    }

    private async Task SeedInternAsync(string? cnic)
    {
        await using var context = _database.CreateContext();
        await AddInternAsync(context, cnic);
    }

    [Fact]
    public async Task Create_fails_when_cnic_is_missing()
    {
        var result = await CreateInternDirectlyAsync(cnic: null);
        AssertRequiredCnic(result);
    }

    [Fact]
    public async Task Create_fails_when_cnic_is_empty()
    {
        var result = await CreateInternDirectlyAsync(cnic: "");
        AssertRequiredCnic(result);
    }

    [Fact]
    public async Task Create_fails_when_cnic_is_whitespace()
    {
        var result = await CreateInternDirectlyAsync(cnic: "   ");
        AssertRequiredCnic(result);
    }

    /// <summary>
    /// Invokes AdminController.CreateIntern with the value under test. The
    /// controller returns before touching any injected service, so the
    /// unused dependencies are null — WebApplicationFactory is still blocked
    /// (W2.9) and this keeps the test on the fixture's isolated database.
    /// </summary>
    private async Task<IActionResult> CreateInternDirectlyAsync(string? cnic)
    {
        await using var context = _database.CreateContext();
        var controller = new AdminController(context, null!, null!, null!, null!, null!, null!, null!);
        var req = new AdminCreateInternRequest(
            Username: null,
            Password: "Passw0rd!",
            FullName: "Cnic Required Intern",
            CNIC: cnic,
            University: null,
            Degree: null,
            Gender: InternGender.Male,
            StartDate: new DateTime(2026, 10, 15),
            EndDate: new DateTime(2026, 10, 31),
            MentorId: 1);
        return await controller.CreateIntern(req);
    }

    /// <summary>
    /// Asserts the action rejected the request with the field-specific
    /// required message, not a generic invalid-value envelope.
    /// </summary>
    private static void AssertRequiredCnic(IActionResult result)
    {
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        var message = badRequest.Value?.GetType().GetProperty("message")?.GetValue(badRequest.Value) as string;
        Assert.Equal("CNIC is required.", message);
    }

    private async Task AddInternAsync(AppDbContext context, string? cnic)
    {
        var user = new User
        {
            Username = $"u-{Guid.NewGuid():N}"[..20],
            PasswordHash = "x",
            Role = UserRole.Intern,
            IsActive = true
        };
        context.Users.Add(user);

        var mentor = new Mentor
        {
            User = new User
            {
                Username = $"m-{Guid.NewGuid():N}"[..20],
                PasswordHash = "x",
                Role = UserRole.Mentor,
                IsActive = true
            },
            FullName = "Cnic Mentor",
            Designation = "M",
            DepartmentId = 1
        };
        context.Mentors.Add(mentor);

        context.Interns.Add(new Intern
        {
            User = user,
            Mentor = mentor,
            FullName = "Cnic Intern",
            RegNo = $"CN-{Guid.NewGuid():N}"[..12],
            CNIC = cnic,
            DepartmentId = 1,
            StartDate = new DateTime(2026, 3, 1),
            EndDate = new DateTime(2026, 12, 31)
        });
        await context.SaveChangesAsync();
    }
}