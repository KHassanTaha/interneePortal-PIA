using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using InternSystem.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InternSystem.Integration.Tests;

/// <summary>
/// Tests <see cref="TransferStateMachine"/>, the intern-transfer state machine
/// from PLAN.md section 1:
/// <code>Pending -> Endorsed -> InternAccepted -> Finalised, rejected at any pre-finalise step.</code>
///
/// These tests exist because the transitions used to live inline in the
/// controllers as read-modify-write: read the status, check it, assign the new
/// one, SaveChanges. Two concurrent requests both read the same status and both
/// "succeeded", so the roster move could be applied twice. The state machine now
/// routes every transition through <see cref="StateTransitions.TryUpdateAsync"/>,
/// so a lost race yields rows-affected 0 and a 409.
///
/// Testing the service directly (rather than the controller) is deliberate: it is
/// the same object the controllers call, so these tests exercise the production
/// path. A test that reimplemented the state machine in its own body would stay
/// green no matter how wrong production got (AGENTS.md 6.5).
/// </summary>
[Collection(SqlServerCollection.Name)]
public class TransferStateMachineTests : IAsyncLifetime
{
    private readonly SqlServerTestDatabase _database;

    public TransferStateMachineTests(SqlServerTestDatabase database) => _database = database;

    private TransferStateMachine Machine(AppDbContext db) => new(db, new NotificationService(db));

    public async Task InitializeAsync() => await _database.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    // ---------- The happy path ----------

    [Fact]
    public async Task Pending_to_Endorsed_when_a_mentor_initiated_transfer_is_endorsed_by_an_admin()
    {
        var seed = await SeedAsync(InternTransferInitiator.Mentor);
        await using var db = _database.CreateContext();

        var result = await Machine(db).AdminEndorseAsync(seed.TransferId, new TransferActor(seed.AdminUserId, UserRole.Admin));

        Assert.Equal(TransferOutcome.Applied, result.Outcome);
        Assert.Equal(InternTransferStatus.Endorsed, await StatusAsync(seed.TransferId));
    }

    [Fact]
    public async Task Pending_to_Endorsed_when_an_admin_initiated_transfer_is_endorsed_by_the_current_mentor()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin);
        await using var db = _database.CreateContext();

        var result = await Machine(db).MentorEndorseAsync(
            seed.TransferId, new TransferActor(seed.FromMentorUserId, UserRole.Mentor, seed.FromMentorId));

        Assert.Equal(TransferOutcome.Applied, result.Outcome);
        Assert.Equal(InternTransferStatus.Endorsed, await StatusAsync(seed.TransferId));
    }

    [Fact]
    public async Task Endorsed_to_InternAccepted_when_the_intern_accepts()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin);
        await using (var setup = _database.CreateContext())
        {
            await Machine(setup).MentorEndorseAsync(
                seed.TransferId, new TransferActor(seed.FromMentorUserId, UserRole.Mentor, seed.FromMentorId));
        }

        await using var db = _database.CreateContext();
        var result = await Machine(db).InternAcceptAsync(
            seed.TransferId, new TransferActor(seed.InternUserId, UserRole.Intern, InternId: seed.InternId));

        Assert.Equal(TransferOutcome.Applied, result.Outcome);
        Assert.Equal(InternTransferStatus.InternAccepted, await StatusAsync(seed.TransferId));
    }

    [Fact]
    public async Task InternAccepted_to_Finalised_moves_the_intern_to_the_receiving_mentor()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin, InternTransferStatus.InternAccepted);
        await using var db = _database.CreateContext();

        var result = await Machine(db).FinaliseAsync(
            seed.TransferId, new TransferActor(seed.ToMentorUserId, UserRole.Mentor, seed.ToMentorId));

        Assert.Equal(TransferOutcome.Applied, result.Outcome);
        Assert.Equal(InternTransferStatus.Finalised, await StatusAsync(seed.TransferId));

        await using var verify = _database.CreateContext();
        var intern = await verify.Interns.FirstAsync(i => i.Id == seed.InternId);
        Assert.Equal(seed.ToMentorId, intern.MentorId);
        Assert.Equal(seed.ToMentorDepartmentId, intern.DepartmentId);
    }

    // ---------- Rejection at every pre-finalise step ----------

    [Fact]
    public async Task Pending_to_Rejected_by_the_admin()
    {
        var seed = await SeedAsync(InternTransferInitiator.Mentor);
        await using var db = _database.CreateContext();

        var result = await Machine(db).AdminRejectAsync(
            seed.TransferId, new TransferActor(seed.AdminUserId, UserRole.Admin), "no capacity");

        Assert.Equal(TransferOutcome.Applied, result.Outcome);
        var row = await RowAsync(seed.TransferId);
        Assert.Equal(InternTransferStatus.Rejected, row.Status);
        Assert.Equal("no capacity", row.RejectionReason);
    }

    [Fact]
    public async Task Pending_to_Rejected_by_a_mentor()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin);
        await using var db = _database.CreateContext();

        var result = await Machine(db).MentorRejectAsync(
            seed.TransferId, new TransferActor(seed.FromMentorUserId, UserRole.Mentor, seed.FromMentorId), "not now");

        Assert.Equal(TransferOutcome.Applied, result.Outcome);
        Assert.Equal(InternTransferStatus.Rejected, await StatusAsync(seed.TransferId));
    }

    [Fact]
    public async Task Endorsed_to_Rejected_by_the_intern()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin, InternTransferStatus.Endorsed);
        await using var db = _database.CreateContext();

        var result = await Machine(db).InternRejectAsync(
            seed.TransferId, new TransferActor(seed.InternUserId, UserRole.Intern, InternId: seed.InternId), "no");

        Assert.Equal(TransferOutcome.Applied, result.Outcome);
        Assert.Equal(InternTransferStatus.Rejected, await StatusAsync(seed.TransferId));
    }

    /// <summary>
    /// The gap this refactor closed: once the intern accepted, the only remaining
    /// action was finalise, so the receiving mentor had no way to refuse.
    /// </summary>
    [Fact]
    public async Task InternAccepted_to_Rejected_by_the_receiving_mentor()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin, InternTransferStatus.InternAccepted);
        await using var db = _database.CreateContext();

        var result = await Machine(db).ToMentorRejectAsync(
            seed.TransferId, new TransferActor(seed.ToMentorUserId, UserRole.Mentor, seed.ToMentorId), "no slot");

        Assert.Equal(TransferOutcome.Applied, result.Outcome);
        var row = await RowAsync(seed.TransferId);
        Assert.Equal(InternTransferStatus.Rejected, row.Status);
        Assert.Equal("no slot", row.RejectionReason);
    }

    [Fact]
    public async Task The_sending_mentor_cannot_refuse_an_intern_accepted_transfer_only_the_receiving_one_can()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin, InternTransferStatus.InternAccepted);
        await using var db = _database.CreateContext();

        var result = await Machine(db).ToMentorRejectAsync(
            seed.TransferId, new TransferActor(seed.FromMentorUserId, UserRole.Mentor, seed.FromMentorId), "not mine");

        Assert.Equal(TransferOutcome.NotFound, result.Outcome);
        Assert.Equal(InternTransferStatus.InternAccepted, await StatusAsync(seed.TransferId));
    }

    // ---------- Explicit role guard on finalise ----------

    /// <summary>
    /// Admin must be refused with a specific message. Previously the guard was
    /// incidental: an admin has no Mentor row, so GetCurrentMentor() returned null
    /// and the endpoint answered 404 Not Found. Any change that gave an admin a
    /// mentor row would have silently opened the door.
    /// </summary>
    [Fact]
    public async Task An_admin_cannot_finalise_and_is_refused_explicitly()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin, InternTransferStatus.InternAccepted);
        await using var db = _database.CreateContext();

        var result = await Machine(db).FinaliseAsync(
            seed.TransferId, new TransferActor(seed.AdminUserId, UserRole.Admin));

        Assert.Equal(TransferOutcome.Forbidden, result.Outcome);
        Assert.Equal(InternTransferStatus.InternAccepted, await StatusAsync(seed.TransferId));
        Assert.Contains("receiving mentor", result.Message!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task A_mentor_who_is_not_the_receiving_one_cannot_finalise()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin, InternTransferStatus.InternAccepted);
        await using var db = _database.CreateContext();

        var result = await Machine(db).FinaliseAsync(
            seed.TransferId, new TransferActor(seed.FromMentorUserId, UserRole.Mentor, seed.FromMentorId));

        Assert.Equal(TransferOutcome.Forbidden, result.Outcome);
        Assert.Equal(InternTransferStatus.InternAccepted, await StatusAsync(seed.TransferId));
    }

    // ---------- Concurrency: the reason this refactor exists ----------

    /// <summary>
    /// Two competing finalise calls with the same expected status. Exactly one may
    /// win. Under the old inline read-modify-write both read InternAccepted, both
    /// passed the guard, and both reported success.
    /// </summary>
    [Fact]
    public async Task Two_concurrent_finalise_calls_yield_exactly_one_winner()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin, InternTransferStatus.InternAccepted);

        var gate = new CountdownEvent(2);
        var start = new ManualResetEventSlim(false);

        async Task<TransferOutcome> Attempt()
        {
            await using var db = _database.CreateContext();
            gate.Signal();
            start.Wait();
            var result = await Machine(db).FinaliseAsync(
                seed.TransferId, new TransferActor(seed.ToMentorUserId, UserRole.Mentor, seed.ToMentorId));
            return result.Outcome;
        }

        var first = Task.Run(Attempt);
        var second = Task.Run(Attempt);
        gate.Wait();
        start.Set();
        var outcomes = await Task.WhenAll(first, second);

        Assert.Equal(1, outcomes.Count(o => o == TransferOutcome.Applied));
        Assert.Equal(1, outcomes.Count(o => o == TransferOutcome.Conflict));
        Assert.Equal(InternTransferStatus.Finalised, await StatusAsync(seed.TransferId));
    }

    [Fact]
    public async Task Two_concurrent_endorse_calls_yield_exactly_one_winner()
    {
        var seed = await SeedAsync(InternTransferInitiator.Mentor);

        var gate = new CountdownEvent(2);
        var start = new ManualResetEventSlim(false);

        async Task<TransferOutcome> Attempt()
        {
            await using var db = _database.CreateContext();
            gate.Signal();
            start.Wait();
            return (await Machine(db).AdminEndorseAsync(
                seed.TransferId, new TransferActor(seed.AdminUserId, UserRole.Admin))).Outcome;
        }

        var first = Task.Run(Attempt);
        var second = Task.Run(Attempt);
        gate.Wait();
        start.Set();
        var outcomes = await Task.WhenAll(first, second);

        Assert.Equal(1, outcomes.Count(o => o == TransferOutcome.Applied));
        Assert.Equal(1, outcomes.Count(o => o == TransferOutcome.Conflict));
    }

    // ---------- CAS refuses an out-of-order transition ----------

    [Fact]
    public async Task A_pending_transfer_cannot_be_finalised_out_of_order()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin, InternTransferStatus.Pending);
        await using var db = _database.CreateContext();

        var result = await Machine(db).FinaliseAsync(
            seed.TransferId, new TransferActor(seed.ToMentorUserId, UserRole.Mentor, seed.ToMentorId));

        Assert.Equal(TransferOutcome.Conflict, result.Outcome);
        Assert.Equal(InternTransferStatus.Pending, await StatusAsync(seed.TransferId));
    }

    [Fact]
    public async Task A_transfer_cannot_be_accepted_before_it_is_endorsed()
    {
        var seed = await SeedAsync(InternTransferInitiator.Admin, InternTransferStatus.Pending);
        await using var db = _database.CreateContext();

        var result = await Machine(db).InternAcceptAsync(
            seed.TransferId, new TransferActor(seed.InternUserId, UserRole.Intern, InternId: seed.InternId));

        Assert.Equal(TransferOutcome.Conflict, result.Outcome);
        Assert.Equal(InternTransferStatus.Pending, await StatusAsync(seed.TransferId));
    }

    // ---------- Seed helpers ----------

    private sealed record Seed(
        int TransferId, int InternId, int InternUserId,
        int FromMentorId, int FromMentorUserId,
        int ToMentorId, int ToMentorUserId, int ToMentorDepartmentId,
        int AdminUserId);

    private async Task<InternTransferStatus> StatusAsync(int transferId) =>
        (await RowAsync(transferId)).Status;

    private async Task<InternTransferRequest> RowAsync(int transferId)
    {
        await using var db = _database.CreateContext();
        // AsNoTracking: we must read what the CAS UPDATE actually wrote, not the
        // value the change tracker happened to load.
        return await db.InternTransferRequests.AsNoTracking().FirstAsync(t => t.Id == transferId);
    }

    private async Task<Seed> SeedAsync(InternTransferInitiator initiator, InternTransferStatus status = InternTransferStatus.Pending)
    {
        await using var db = _database.CreateContext();

        var internUser = MakeUser(db, UserRole.Intern);
        var fromUser = MakeUser(db, UserRole.Mentor);
        var toUser = MakeUser(db, UserRole.Mentor);
        var adminUser = MakeUser(db, UserRole.Admin);

        var intern = new Intern
        {
            User = internUser,
            FullName = "Transfer Intern",
            RegNo = $"TR-{Guid.NewGuid():N}"[..12],
            DepartmentId = 1,
            StartDate = new DateTime(2026, 3, 1),
            EndDate = new DateTime(2026, 12, 31)
        };
        var fromMentor = new Mentor { User = fromUser, FullName = "From", Designation = "M", DepartmentId = 1 };
        var toMentor = new Mentor { User = toUser, FullName = "To", Designation = "M", DepartmentId = 2 };

        db.Mentors.Add(fromMentor);
        db.Mentors.Add(toMentor);
        intern.Mentor = fromMentor;
        db.Interns.Add(intern);
        await db.SaveChangesAsync();

        var transfer = new InternTransferRequest
        {
            Intern = intern,
            FromMentor = fromMentor,
            ToMentor = toMentor,
            InitiatedBy = initiator,
            InitiatedByUser = adminUser,
            Status = status,
            CreatedAt = new DateTime(2026, 3, 2, 9, 0, 0, DateTimeKind.Utc)
        };
        db.InternTransferRequests.Add(transfer);
        await db.SaveChangesAsync();

        return new Seed(
            transfer.Id, intern.Id, internUser.Id,
            fromMentor.Id, fromUser.Id,
            toMentor.Id, toUser.Id, toMentor.DepartmentId,
            adminUser.Id);
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
}