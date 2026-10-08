using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.Infrastructure.Services;

/// <summary>Result of a transfer state-machine attempt.</summary>
public enum TransferOutcome
{
    /// <summary>The transition was applied. Exactly one actor can get this.</summary>
    Applied,
    /// <summary>No transfer matched the id, or the actor is not a party to it.</summary>
    NotFound,
    /// <summary>The expected-status predicate no longer held; someone else won the race.</summary>
    Conflict,
    /// <summary>The actor's role is not permitted to perform this transition.</summary>
    Forbidden
}

/// <summary>
/// The authenticated actor performing a transfer transition. Carrying the role and the
/// mentor/intern ids explicitly lets the state machine apply an explicit role check
/// instead of inferring authority from a null lookup.
/// </summary>
public sealed record TransferActor(int UserId, UserRole Role, int? MentorId = null, int? InternId = null);

/// <summary>Outcome of a transfer transition, carrying the transfer for follow-up work.</summary>
public sealed record TransferResult(
    TransferOutcome Outcome,
    InternTransferRequest? Transfer = null,
    string? Message = null)
{
    public bool IsApplied => Outcome == TransferOutcome.Applied;
}

/// <summary>
/// The intern-transfer state machine (PLAN.md section 1):
/// <code>
/// Pending -> Endorsed -> InternAccepted -> Finalised, rejected at any pre-finalise step.
/// </code>
/// Every transition is a compare-and-swap through <see cref="StateTransitions.TryUpdateAsync"/>
/// guarded by the expected current status, so exactly one concurrent actor can win and
/// losers receive <see cref="TransferOutcome.Conflict"/>. Controllers hold no inline
/// read-modify-write status logic (D-S24).
/// </summary>
public class TransferStateMachine
{
    private const string Table = "InternTransferRequests";

    private readonly AppDbContext _db;
    private readonly NotificationService _notifications;

    public TransferStateMachine(AppDbContext db, NotificationService notifications)
    {
        _db = db;
        _notifications = notifications;
    }

    /// <summary>
    /// Flow B: the admin endorses a mentor-initiated transfer.
    /// </summary>
    public Task<TransferResult> AdminEndorseAsync(int id, TransferActor actor) =>
        EndorseAsync(
            id, actor,
            t => t.InitiatedBy == InternTransferInitiator.Mentor,
            $"Admin endorsed intern transfer #{id}",
            ActivityLogType.InternTransferInitiated);

    /// <summary>
    /// Flow A: the intern's current mentor endorses an admin-initiated transfer.
    /// </summary>
    public Task<TransferResult> MentorEndorseAsync(int id, TransferActor actor) =>
        EndorseAsync(
            id, actor,
            t => t.InitiatedBy == InternTransferInitiator.Admin && t.FromMentorId == actor.MentorId,
            $"Mentor endorsed intern transfer #{id}",
            ActivityLogType.InternTransferInitiated);

    /// <summary>The intern accepts an endorsed transfer.</summary>
    public async Task<TransferResult> InternAcceptAsync(int id, TransferActor actor)
    {
        var transfer = await _db.InternTransferRequests
            .FirstOrDefaultAsync(t => t.Id == id && t.InternId == actor.InternId);
        if (transfer == null) return new TransferResult(TransferOutcome.NotFound);

        var affected = await StateTransitions.TryUpdateAsync(
            _db, "intern transfer", Table, id,
            new (string, object?)[]
            {
                ("Status", InternTransferStatus.InternAccepted.ToString()),
                ("InternAcceptedAt", DateTime.Now)
            },
            ("Status", WhereOp.Equal, InternTransferStatus.Endorsed.ToString()));

        if (affected == 0)
            return new TransferResult(TransferOutcome.Conflict, transfer,
                "This transfer is not awaiting your acceptance");

        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == transfer.InternId);
        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternTransferAccepted,
            Description = $"Intern '{intern?.FullName}' accepted their transfer to mentor '{transfer.ToMentorId}'",
            PerformedByUserId = actor.UserId,
            TargetInternId = transfer.InternId,
            DepartmentId = intern?.DepartmentId
        });
        await _db.SaveChangesAsync();

        var toMentor = await _db.Mentors.FirstOrDefaultAsync(m => m.Id == transfer.ToMentorId);
        if (toMentor != null)
            await _notifications.NotifyAsync(toMentor.UserId, "Intern transfer accepted",
                $"{intern?.FullName} accepted the transfer. Finalise it to move them to your roster.",
                NotificationType.Transfer);

        return new TransferResult(TransferOutcome.Applied, transfer, "Transfer accepted");
    }

    /// <summary>
    /// Admin rejects a pending transfer.
    /// </summary>
    public Task<TransferResult> AdminRejectAsync(int id, TransferActor actor, string? reason) =>
        RejectAsync(id, actor, reason, t => true,
            $"Admin rejected intern transfer #{id}: {reason}");

    /// <summary>
    /// A mentor rejects a pending transfer they are party to.
    /// </summary>
    public Task<TransferResult> MentorRejectAsync(int id, TransferActor actor, string? reason) =>
        RejectAsync(id, actor, reason,
            t => t.FromMentorId == actor.MentorId || t.ToMentorId == actor.MentorId,
            $"Mentor rejected intern transfer #{id}: {reason}");

    /// <summary>
    /// The intern rejects a transfer awaiting their acceptance (expected status Endorsed).
    /// </summary>
    public Task<TransferResult> InternRejectAsync(int id, TransferActor actor, string? reason) =>
        RejectAsync(id, actor, reason, t => t.InternId == actor.InternId,
            $"Intern rejected intern transfer #{id}: {reason}",
            InternTransferStatus.Endorsed, "Transfer is not awaiting your acceptance");

    /// <summary>
    /// The target (new) mentor refuses a transfer the intern has already accepted
    /// (expected status InternAccepted). Without this the new mentor has no refusal path:
    /// once the intern accepts, only finalise remains.
    /// </summary>
    public Task<TransferResult> ToMentorRejectAsync(int id, TransferActor actor, string? reason) =>
        RejectAsync(id, actor, reason, t => t.ToMentorId == actor.MentorId,
            $"Target mentor rejected intern transfer #{id}: {reason}",
            InternTransferStatus.InternAccepted, "Only intern-accepted transfers can be refused");

    /// <summary>
    /// Only the target (new) mentor may finalise. This is an explicit role check: an admin
    /// is refused with a specific message rather than falling out of a null mentor lookup.
    /// </summary>
    public async Task<TransferResult> FinaliseAsync(int id, TransferActor actor)
    {
        var transfer = await _db.InternTransferRequests
            .Include(t => t.ToMentor)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (transfer == null) return new TransferResult(TransferOutcome.NotFound);

        if (actor.Role != UserRole.Mentor)
            return new TransferResult(TransferOutcome.Forbidden, transfer,
                "Only the receiving mentor can finalise a transfer");
        if (actor.MentorId == null || actor.MentorId != transfer.ToMentorId)
            return new TransferResult(TransferOutcome.Forbidden, transfer,
                "Only the receiving mentor can finalise a transfer");

        var intern = await _db.Interns.FirstOrDefaultAsync(i => i.Id == transfer.InternId);
        if (intern == null) return new TransferResult(TransferOutcome.NotFound);

        var now = DateTime.Now;

        // CAS first: this claims the transition. Exactly one concurrent finalise wins,
        // so the roster move below cannot be applied twice.
        var affected = await StateTransitions.TryUpdateAsync(
            _db, "intern transfer", Table, id,
            new (string, object?)[]
            {
                ("Status", InternTransferStatus.Finalised.ToString()),
                ("FinalisedByUserId", actor.UserId),
                ("FinalisedAt", now)
            },
            ("Status", WhereOp.Equal, InternTransferStatus.InternAccepted.ToString()));

        if (affected == 0)
            return new TransferResult(TransferOutcome.Conflict, transfer,
                "Only intern-accepted transfers can be finalised");

        intern.MentorId = transfer.ToMentorId;
        intern.DepartmentId = transfer.ToMentor!.DepartmentId;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternTransferFinalised,
            Description = $"Mentor finalised intern transfer #{id}",
            PerformedByUserId = actor.UserId,
            TargetInternId = intern.Id,
            DepartmentId = transfer.ToMentor.DepartmentId
        });

        await _db.SaveChangesAsync();

        await _notifications.NotifyAsync(intern.UserId, "Intern transfer finalised",
            $"Your transfer to {transfer.ToMentor.FullName} is complete", NotificationType.Transfer);

        return new TransferResult(TransferOutcome.Applied, transfer, "Transfer finalised");
    }

    private async Task<TransferResult> EndorseAsync(
        int id,
        TransferActor actor,
        Func<InternTransferRequest, bool> scope,
        string logDescription,
        ActivityLogType logType)
    {
        var transfer = await _db.InternTransferRequests.FirstOrDefaultAsync(t => t.Id == id);
        if (transfer == null || !scope(transfer)) return new TransferResult(TransferOutcome.NotFound);

        var affected = await StateTransitions.TryUpdateAsync(
            _db, "intern transfer", Table, id,
            new (string, object?)[]
            {
                ("Status", InternTransferStatus.Endorsed.ToString()),
                ("EndorsedByUserId", actor.UserId),
                ("EndorsedAt", DateTime.Now)
            },
            ("Status", WhereOp.Equal, InternTransferStatus.Pending.ToString()));

        if (affected == 0)
            return new TransferResult(TransferOutcome.Conflict, transfer,
                "Only pending transfers can be endorsed");

        var intern = await _db.Interns.Include(i => i.User).FirstOrDefaultAsync(i => i.Id == transfer.InternId);

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = logType,
            Description = logDescription,
            PerformedByUserId = actor.UserId,
            TargetInternId = transfer.InternId
        });
        await _db.SaveChangesAsync();

        if (intern != null)
            await _notifications.NotifyAsync(intern.UserId, "Intern transfer endorsed",
                "Your transfer has been endorsed — please accept or reject it", NotificationType.Transfer);

        return new TransferResult(TransferOutcome.Applied, transfer, "Transfer endorsed");
    }

    private async Task<TransferResult> RejectAsync(
        int id,
        TransferActor actor,
        string? reason,
        Func<InternTransferRequest, bool> scope,
        string logDescription,
        InternTransferStatus expectedStatus = InternTransferStatus.Pending,
        string conflictMessage = "Only pending transfers can be rejected")
    {
        var transfer = await _db.InternTransferRequests.FirstOrDefaultAsync(t => t.Id == id);
        if (transfer == null || !scope(transfer)) return new TransferResult(TransferOutcome.NotFound);

        var affected = await StateTransitions.TryUpdateAsync(
            _db, "intern transfer", Table, id,
            new (string, object?)[]
            {
                ("Status", InternTransferStatus.Rejected.ToString()),
                ("RejectionReason", reason)
            },
            ("Status", WhereOp.Equal, expectedStatus.ToString()));

        if (affected == 0)
            return new TransferResult(TransferOutcome.Conflict, transfer, conflictMessage);

        // ActivityLog.DepartmentId must be a real Department id. Deriving it from the
        // actor's mentor/intern row avoids writing a Mentor id into that column,
        // which SQL Server rejects as an FK violation whenever the ids do not coincide.
        int? departmentId = actor.MentorId.HasValue
            ? await _db.Mentors.Where(m => m.Id == actor.MentorId.Value)
                .Select(m => (int?)m.DepartmentId).FirstOrDefaultAsync()
            : actor.InternId.HasValue
                ? await _db.Interns.Where(i => i.Id == actor.InternId.Value)
                    .Select(i => (int?)i.DepartmentId).FirstOrDefaultAsync()
                : null;

        _db.ActivityLogs.Add(new ActivityLog
        {
            LogType = ActivityLogType.InternTransferRejected,
            Description = logDescription,
            PerformedByUserId = actor.UserId,
            TargetInternId = transfer.InternId,
            DepartmentId = departmentId
        });
        await _db.SaveChangesAsync();

        return new TransferResult(TransferOutcome.Applied, transfer, "Transfer rejected");
    }
}