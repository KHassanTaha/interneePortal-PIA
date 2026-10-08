using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InternSystem.Integration.Tests;

/// <summary>
/// Covers the FaceEnrolled / FaceEnrollmentStatus mirror (D-S20) at the layer where it
/// is actually implemented.
///
/// Scope limitation, stated up front so nobody over-reads this file: the mirror write
/// lives inline in four controller actions (AdminController and MentorController,
/// approve and reject). Each calls StateTransitions.TryUpdateAsync with a two-column
/// tuple set and a Pending predicate. Those actions cannot be invoked here, because
/// they need an authenticated principal and because Program's unguarded Database.Migrate()
/// blocks WebApplicationFactory<Program> (see W2.9). Extracting a service to make them
/// callable is REQ implementation and was out of scope for this batch.
///
/// So these tests pin the invariants that are genuinely testable and would break on a
/// real regression: that both mirror columns land in one saved state, that the Pending
/// predicate makes the decision single-winner, and that the .ToString() on the enum is
/// load-bearing. What is NOT covered: whether each controller passes the correct tuples.
/// If someone drops the FaceEnrolled column from one approve action, these tests still
/// pass. Closing that gap needs the extraction, tracked separately.
/// </summary>
[Collection(SqlServerCollection.Name)]
public class FaceEnrollmentMirrorTests : IAsyncLifetime
{
    private readonly SqlServerTestDatabase _database;

    public FaceEnrollmentMirrorTests(SqlServerTestDatabase database) => _database = database;

    public async Task InitializeAsync() => await _database.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Approve_mirror_lands_both_columns_in_one_saved_state()
    {
        var internId = await SeedAsync(FaceEnrollmentStatus.Pending);

        await using (var db = _database.CreateContext())
        {
            var affected = await StateTransitions.TryUpdateAsync(db, "face enrollment", "Interns", internId,
                new (string, object?)[]
                {
                    ("FaceEnrollmentStatus", FaceEnrollmentStatus.Approved.ToString()),
                    ("FaceEnrolled", true)
                },
                ("FaceEnrollmentStatus", WhereOp.Equal, FaceEnrollmentStatus.Pending.ToString()));
            Assert.Equal(1, affected);
        }

        await using var verify = _database.CreateContext();
        var intern = await verify.Interns.AsNoTracking().FirstAsync(i => i.Id == internId);
        Assert.Equal(FaceEnrollmentStatus.Approved, intern.FaceEnrollmentStatus);
        Assert.True(intern.FaceEnrolled);
    }

    [Fact]
    public async Task Reject_mirror_lands_both_columns_in_one_saved_state()
    {
        var internId = await SeedAsync(FaceEnrollmentStatus.Pending);

        await using (var db = _database.CreateContext())
        {
            var affected = await StateTransitions.TryUpdateAsync(db, "face enrollment", "Interns", internId,
                new (string, object?)[]
                {
                    ("FaceEnrollmentStatus", FaceEnrollmentStatus.Rejected.ToString()),
                    ("FaceEnrolled", false)
                },
                ("FaceEnrollmentStatus", WhereOp.Equal, FaceEnrollmentStatus.Pending.ToString()));
            Assert.Equal(1, affected);
        }

        await using var verify = _database.CreateContext();
        var intern = await verify.Interns.AsNoTracking().FirstAsync(i => i.Id == internId);
        Assert.Equal(FaceEnrollmentStatus.Rejected, intern.FaceEnrollmentStatus);
        Assert.False(intern.FaceEnrolled);
    }

    [Fact]
    public async Task Reset_mirror_sets_status_NotEnrolled_and_FaceEnrolled_false()
    {
        // Reset runs from any state, so it is deliberately NOT guarded on Pending.
        var internId = await SeedAsync(FaceEnrollmentStatus.Approved, faceEnrolled: true);

        await using (var db = _database.CreateContext())
        {
            var affected = await StateTransitions.TryUpdateAsync(db, "face enrollment", "Interns", internId,
                new (string, object?)[]
                {
                    ("FaceEnrollmentStatus", FaceEnrollmentStatus.NotEnrolled.ToString()),
                    ("FaceEnrolled", false)
                });
            Assert.Equal(1, affected);
        }

        await using var verify = _database.CreateContext();
        var intern = await verify.Interns.AsNoTracking().FirstAsync(i => i.Id == internId);
        Assert.Equal(FaceEnrollmentStatus.NotEnrolled, intern.FaceEnrollmentStatus);
        Assert.False(intern.FaceEnrolled);
    }

    [Theory]
    [InlineData(FaceEnrollmentStatus.Approved)]
    [InlineData(FaceEnrollmentStatus.Rejected)]
    [InlineData(FaceEnrollmentStatus.NotEnrolled)]
    public async Task A_decided_enrollment_cannot_be_decided_again(FaceEnrollmentStatus current)
    {
        // The Pending predicate is what stops a second decision overwriting the first.
        var internId = await SeedAsync(current);

        await using var db = _database.CreateContext();
        var affected = await StateTransitions.TryUpdateAsync(db, "face enrollment", "Interns", internId,
            new (string, object?)[]
            {
                ("FaceEnrollmentStatus", FaceEnrollmentStatus.Rejected.ToString()),
                ("FaceEnrolled", false)
            },
            ("FaceEnrollmentStatus", WhereOp.Equal, FaceEnrollmentStatus.Pending.ToString()));

        Assert.Equal(0, affected);
    }

    [Fact]
    public async Task Two_concurrent_face_approvals_yield_exactly_one_winner()
    {
        var internId = await SeedAsync(FaceEnrollmentStatus.Pending);
        using var gate = new CountdownEvent(2);
        using var start = new ManualResetEventSlim(false);

        async Task<int> Attempt()
        {
            await using var db = _database.CreateContext();
            gate.Signal();
            start.Wait();
            return await StateTransitions.TryUpdateAsync(db, "face enrollment", "Interns", internId,
                new (string, object?)[]
                {
                    ("FaceEnrollmentStatus", FaceEnrollmentStatus.Approved.ToString()),
                    ("FaceEnrolled", true)
                },
                ("FaceEnrollmentStatus", WhereOp.Equal, FaceEnrollmentStatus.Pending.ToString()));
        }

        var tasks = new[] { Task.Run(Attempt), Task.Run(Attempt) };
        gate.Wait();
        start.Set();
        var results = await Task.WhenAll(tasks);

        Assert.Single(results.Where(r => r == 1));
        Assert.Single(results.Where(r => r == 0));

        await using var verify = _database.CreateContext();
        var intern = await verify.Interns.AsNoTracking().FirstAsync(i => i.Id == internId);
        Assert.Equal(FaceEnrollmentStatus.Approved, intern.FaceEnrollmentStatus);
        Assert.True(intern.FaceEnrolled);
    }

    [Fact]
    public async Task Passing_the_enum_without_ToString_silently_corrupts_the_status_column()
    {
        // The FaceEnrollmentStatus column is nvarchar. Passing the enum object rather
        // than its string form does NOT throw - SQL Server coerces the int to its digits
        // and stores '2'. The row then reads back as neither Approved nor any known
        // status. This is D-S27 class (3) and it is the reason every call site uses
        // .ToString(). This test exists so a future "cleanup" that drops .ToString()
        // fails here instead of corrupting an intern's enrollment state in production.
        var internId = await SeedAsync(FaceEnrollmentStatus.Pending);

        await using (var db = _database.CreateContext())
        {
            await StateTransitions.TryUpdateAsync(db, "face enrollment", "Interns", internId,
                new (string, object?)[]
                {
                    ("FaceEnrollmentStatus", FaceEnrollmentStatus.Approved)
                },
                ("FaceEnrollmentStatus", WhereOp.Equal, FaceEnrollmentStatus.Pending.ToString()));
        }

        await using var verify = _database.CreateContext();
        var connection = verify.Database.GetDbConnection();
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT FaceEnrollmentStatus FROM Interns WHERE Id = @id";
        var p = command.CreateParameter();
        p.ParameterName = "@id";
        p.Value = internId;
        command.Parameters.Add(p);
        var stored = (string?)await command.ExecuteScalarAsync();

        Assert.Equal("2", stored);
        Assert.NotEqual("Approved", stored);
    }

    private async Task<int> SeedAsync(FaceEnrollmentStatus status, bool faceEnrolled = false)
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
        var mentor = new Mentor { User = mentorUser, FullName = "Face Mentor", Designation = "M", DepartmentId = 1 };
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
            FullName = "Face Intern",
            RegNo = $"FM-{Guid.NewGuid():N}"[..12],
            DepartmentId = 1,
            StartDate = new DateTime(2026, 3, 1),
            EndDate = new DateTime(2026, 12, 31),
            FaceEnrollmentStatus = status,
            FaceEnrolled = faceEnrolled
        };
        db.Interns.Add(intern);
        await db.SaveChangesAsync();
        return intern.Id;
    }
}