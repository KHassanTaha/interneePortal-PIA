using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;
using Xunit.Abstractions;

namespace InternSystem.Integration.Tests;

/// <summary>
/// Tests <see cref="StateTransitions.TryUpdateAsync"/>, the compare-and-swap
/// helper behind the D-12 contract.
///
/// D-12 is what makes queued offline writes safe to replay. It requires that a
/// transition guarded by an expected status either applies to exactly one row or
/// to none, and that exactly one of two competing actors wins. If that holds, a
/// replayed approve cannot overwrite a rejection that arrived while the phone
/// was offline, and the loser sees rows-affected 0 which the controller turns
/// into HTTP 409 STALE_STATE.
///
/// These tests run against real SQL Server because the guarantee is enforced by
/// the UPDATE statement and its WHERE predicate, not by the C# around it. No
/// in-memory provider can execute this code path at all.
///
/// Raw SQL is issued through <c>GetDbConnection()</c>, so each concurrent actor
/// needs its own context; a single DbContext is not thread-safe.
/// </summary>
[Collection(SqlServerCollection.Name)]
public class StateTransitionsCasTests : IAsyncLifetime
{
    private const string Table = "InternTransferRequests";

    private readonly SqlServerTestDatabase _database;
    private readonly ITestOutputHelper _output;

    public StateTransitionsCasTests(SqlServerTestDatabase database, ITestOutputHelper output)
    {
        _database = database;
        _output = output;
    }

    /// <summary>
    /// Inserts one transfer row in Pending state together with the intern, users
    /// and mentors it references.
    ///
    /// The Status column is nvarchar (HasConversion&lt;string&gt;), so the enum
    /// must be passed as its string name exactly as the production call sites do.
    /// Passing the raw enum made SqlClient send an int, and SQL Server then tried
    /// to coerce 'Pending' to int for the comparison and failed.
    ///
    /// These foreign keys are real: SQL Server rejected arbitrary ids with
    /// "FK_InternTransferRequests_Interns_InternId". An in-memory provider would
    /// have accepted the dangling ids silently, which is one of the reasons this
    /// suite runs against a real server. Id is an IDENTITY column, so it is
    /// generated rather than assigned.
    /// </summary>
    private static async Task<int> SeedTransferAsync(AppDbContext db)
    {
        var internUser = MakeUser(db, UserRole.Intern);
        var fromUser = MakeUser(db, UserRole.Mentor);
        var toUser = MakeUser(db, UserRole.Mentor);
        var adminUser = MakeUser(db, UserRole.Admin);

        var intern = new Intern
        {
            User = internUser,
            FullName = "CAS Intern",
            RegNo = $"CAS-{Guid.NewGuid():N}"[..12],
            DepartmentId = 1,
            StartDate = new DateTime(2026, 3, 1),
            EndDate = new DateTime(2026, 12, 31)
        };

        var fromMentor = new Mentor { User = fromUser, FullName = "From", Designation = "M", DepartmentId = 1 };
        var toMentor = new Mentor { User = toUser, FullName = "To", Designation = "M", DepartmentId = 1 };

        db.Mentors.Add(fromMentor);
        db.Mentors.Add(toMentor);
        intern.Mentor = fromMentor;
        db.Interns.Add(intern);
        await db.SaveChangesAsync();

        var row = new InternTransferRequest
        {
            Intern = intern,
            FromMentor = fromMentor,
            ToMentor = toMentor,
            InitiatedBy = InternTransferInitiator.Admin,
            InitiatedByUser = adminUser,
            Status = InternTransferStatus.Pending,
            CreatedAt = new DateTime(2026, 3, 2, 9, 0, 0, DateTimeKind.Utc)
        };
        db.InternTransferRequests.Add(row);
        await db.SaveChangesAsync();
        return row.Id;
    }

    private static User MakeUser(AppDbContext db, UserRole role)
    {
        var user = new User
        {
            Username = $"u-{Guid.NewGuid():N}"[..20],
            PasswordHash = "x",
            Role = role,
            IsActive = true
        };
        db.Users.Add(user);
        return user;
    }

    // ---------- Ruling 3, case 1: matching expected status applies ----------

    [Fact]
    public async Task TryUpdateAsync_with_matching_expected_status_updates_exactly_one_row()
    {
        await using var db = _database.CreateContext();
        var id = await SeedTransferAsync(db);

        var rowsAffected = await StateTransitions.TryUpdateAsync(
            db, nameof(InternTransferRequest), Table, id,
            new[] { ("Status", (object?)InternTransferStatus.Endorsed.ToString()) },
            ("Status", WhereOp.Equal, InternTransferStatus.Pending.ToString()));

        Assert.Equal(1, rowsAffected);

        // Assert the side effect landed on disk, not merely that a number came back.
        db.ChangeTracker.Clear();
        var stored = await db.InternTransferRequests.AsNoTracking().SingleAsync(t => t.Id == id);
        Assert.Equal(InternTransferStatus.Endorsed, stored.Status);
    }

    // ---------- Ruling 3, case 2: mismatched expected status is rejected ----------

    [Fact]
    public async Task TryUpdateAsync_with_mismatched_expected_status_updates_nothing()
    {
        await using var db = _database.CreateContext();
        var id = await SeedTransferAsync(db);

        // Row is Pending, so a guard for Endorsed can never match.
        var rowsAffected = await StateTransitions.TryUpdateAsync(
            db, nameof(InternTransferRequest), Table, id,
            new[] { ("Status", (object?)InternTransferStatus.Finalised.ToString()) },
            ("Status", WhereOp.Equal, InternTransferStatus.Endorsed.ToString()));

        Assert.Equal(0, rowsAffected);

        db.ChangeTracker.Clear();
        var stored = await db.InternTransferRequests.AsNoTracking().SingleAsync(t => t.Id == id);
        Assert.Equal(InternTransferStatus.Pending, stored.Status);
    }

    // ---------- Ruling 3, case 3: the D-12 guarantee, two competing actors ----------

    [Fact]
    public async Task Two_concurrent_transitions_with_the_same_expected_status_yield_exactly_one_winner()
    {
        await using var seed = _database.CreateContext();
        var id = await SeedTransferAsync(seed);

        // Both actors read Pending and try to move it to a different state. They
        // are released together so the two UPDATEs genuinely contend for the same
        // row. Running them one after another would pass even with a broken guard.
        using var ready = new CountdownEvent(2);
        using var go = new ManualResetEventSlim(false);

        async Task<int> Actor(InternTransferStatus next)
        {
            await using var ctx = _database.CreateContext();
            ready.Signal();
            go.Wait();
            return await StateTransitions.TryUpdateAsync(
                ctx, nameof(InternTransferRequest), Table, id,
                new[] { ("Status", (object?)next) },
                ("Status", WhereOp.Equal, InternTransferStatus.Pending.ToString()));
        }

        var actorA = Task.Run(() => Actor(InternTransferStatus.Endorsed));
        var actorB = Task.Run(() => Actor(InternTransferStatus.Rejected));

        ready.Wait();
        go.Set();
        var results = await Task.WhenAll(actorA, actorB);

        _output.WriteLine($"actorA rows={results[0]} actorB rows={results[1]}");

        Assert.Equal(1, results.Count(r => r == 1));
        Assert.Equal(1, results.Count(r => r == 0));

        // The surviving value is whichever actor won, never a blend of both.
        await using var verify = _database.CreateContext();
        var final = await verify.InternTransferRequests.AsNoTracking().SingleAsync(t => t.Id == id);
        Assert.True(
            final.Status == InternTransferStatus.Endorsed || final.Status == InternTransferStatus.Rejected,
            $"expected one actor's value to survive, found {final.Status}");
    }

    // ---------- Ruling 3, case 4: an additional nullability predicate excludes the row ----------

    [Fact]
    public async Task Additional_nullability_predicate_excludes_an_already_rejected_row()
    {
        await using var db = _database.CreateContext();
        var id = await SeedTransferAsync(db);

        // Control: the Pending row has a null RejectionReason, so an IS NULL guard
        // matches it. Without this case the assertion below could pass simply
        // because the guard was ignored and the row never matched anything.
        var control = await StateTransitions.TryUpdateAsync(
            db, nameof(InternTransferRequest), Table, id,
            new[] { ("Status", (object?)InternTransferStatus.Endorsed.ToString()) },
            ("Status", WhereOp.Equal, InternTransferStatus.Pending.ToString()),
            ("RejectionReason", WhereOp.IsNull, null));
        Assert.Equal(1, control);

        // Now a row that has been rejected: RejectionReason is non-null, so the
        // same IS NULL guard must exclude it. This is D-12's "not already
        // withdrawn/rejected" predicate.
        await using var second = _database.CreateContext();
        var rejectedId = await SeedTransferAsync(second);
        await StateTransitions.TryUpdateAsync(
            second, nameof(InternTransferRequest), Table, rejectedId,
            new[] { ("Status", (object?)InternTransferStatus.Rejected.ToString()),
                    ("RejectionReason", "already rejected") },
            ("Status", WhereOp.Equal, InternTransferStatus.Pending.ToString()));
        second.ChangeTracker.Clear();

        var excluded = await StateTransitions.TryUpdateAsync(
            second, nameof(InternTransferRequest), Table, rejectedId,
            new[] { ("Status", (object?)InternTransferStatus.Finalised.ToString()) },
            ("Status", WhereOp.Equal, InternTransferStatus.Pending.ToString()),
            ("RejectionReason", WhereOp.IsNull, null));

        Assert.Equal(0, excluded);

        second.ChangeTracker.Clear();
        var stored = await second.InternTransferRequests.AsNoTracking().SingleAsync(t => t.Id == rejectedId);
        Assert.Equal(InternTransferStatus.Rejected, stored.Status);
    }

    /// <summary>
    /// Clears rows a previous test created so this test starts from a known
    /// state. Without this the suite shares one database and a holiday or
    /// attendance row from an earlier test would silently change the result.
    /// </summary>
    public async Task InitializeAsync() => await _database.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;
}