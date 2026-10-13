using System.Reflection;
using System.Security.Claims;
using InternSystem.API.Controllers;
using InternSystem.API.Services;
using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using InternSystem.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InternSystem.Integration.Tests;

/// <summary>
/// REQ-10 internship lifecycle.
///
/// <para>
/// Service-side behaviour (the late-start scan 2e, the reverse late-end
/// notifications 2f, and Upcoming -> Active auto-activation) runs for real
/// against SQL Server via each hosted service's <c>RunOnceAsync</c> seam.
/// </para>
///
/// <para>
/// Endpoint behaviour (status change, un-terminate, task resolution, the
/// permission matrix) now runs for real against the controllers. They are
/// constructed directly with the shared test <see cref="AppDbContext"/> and a
/// fabricated <see cref="ClaimsPrincipal"/>; these actions only touch the
/// context, so the unused dependencies are passed as null.
/// </para>
/// </summary>
[Collection(SqlServerCollection.Name)]
public class InternshipStatusTests : IAsyncLifetime
{
    private static readonly DateTime Today = DateTime.Today;

    private readonly SqlServerTestDatabase _database;

    public InternshipStatusTests(SqlServerTestDatabase database)
    {
        _database = database;
    }

    public async Task InitializeAsync() => await _database.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    // ---------- helpers ----------

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

    /// <summary>
    /// Builds the full graph an Intern needs: Interns has Restrict foreign keys to
    /// Users and Mentors, so both parents must genuinely exist. Ids are IDENTITY and
    /// are never set; EF generates them on SaveChanges.
    /// </summary>
    private static (Intern Intern, Mentor Mentor) SeedGraph(
        AppDbContext db, InternshipStatus status, DateTime start, DateTime end)
    {
        var mentor = new Mentor
        {
            User = MakeUser(db, UserRole.Mentor),
            FullName = "Test Mentor",
            Designation = "Mentor",
            DepartmentId = 1
        };
        db.Mentors.Add(mentor);

        var intern = new Intern
        {
            User = MakeUser(db, UserRole.Intern),
            Mentor = mentor,
            DepartmentId = 1,
            FullName = "Test Intern",
            RegNo = $"T-{Guid.NewGuid():N}"[..10],
            StartDate = start,
            EndDate = end,
            ShiftId = null,
            Status = status
        };
        db.Interns.Add(intern);
        return (intern, mentor);
    }

    // ---------- Group G: Upcoming -> Active auto-activation ----------

    [Fact]
    public async Task AutoTransitionMovesUpcomingToActiveWhenStartDateReached()
    {
        await using var db = _database.CreateContext();
        var (intern, _) = SeedGraph(db, InternshipStatus.Upcoming, Today.AddDays(-1), Today.AddDays(30));
        await db.SaveChangesAsync();
        var internId = intern.Id;

        await InternStatusAutoActivateService.RunOnceAsync(db);

        var reloaded = await db.Interns.FindAsync(internId);
        Assert.Equal(InternshipStatus.Active, reloaded!.Status);
    }

    [Fact]
    public async Task AutoTransitionDoesNotMoveWhenFuture()
    {
        await using var db = _database.CreateContext();
        var (intern, _) = SeedGraph(db, InternshipStatus.Upcoming, Today.AddDays(1), Today.AddDays(30));
        await db.SaveChangesAsync();
        var internId = intern.Id;

        await InternStatusAutoActivateService.RunOnceAsync(db);

        var reloaded = await db.Interns.FindAsync(internId);
        Assert.Equal(InternshipStatus.Upcoming, reloaded!.Status);
    }

    [Fact]
    public async Task BackfillLogicTargetsUpcomingWithPastStartDate()
    {
        await using var db = _database.CreateContext();
        var (started, _) = SeedGraph(db, InternshipStatus.Upcoming, Today.AddDays(-1), Today.AddDays(30));
        var (future, _) = SeedGraph(db, InternshipStatus.Upcoming, Today.AddDays(1), Today.AddDays(30));
        await db.SaveChangesAsync();
        var startedId = started.Id;
        var futureId = future.Id;

        await InternStatusAutoActivateService.RunOnceAsync(db);

        Assert.Equal(InternshipStatus.Active, (await db.Interns.FindAsync(startedId))!.Status);
        Assert.Equal(InternshipStatus.Upcoming, (await db.Interns.FindAsync(futureId))!.Status);

        var history = await db.InternStatusHistories
            .Where(h => h.InternId == startedId && h.Status == InternshipStatus.Active)
            .ToListAsync();
        Assert.Single(history);
    }

    // ---------- Group B: late-start scan (2e) ----------

    [Fact]
    public async Task LateStartScanCreatesTaskWhenCriteriaMet()
    {
        await using var db = _database.CreateContext();
        var (intern, _) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var internId = intern.Id;

        await LateStartResolutionService.RunOnceAsync(db);

        var tasks = await db.Tasks
            .Where(t => t.InternId == internId && t.TaskType == "LateStartResolution")
            .ToListAsync();
        Assert.Single(tasks);
        Assert.Equal(InternSystem.Core.Entities.TaskStatus.Pending, tasks[0].Status);
    }

    [Fact]
    public async Task LateStartScanDoesNotDuplicatePendingTask()
    {
        await using var db = _database.CreateContext();
        var (intern, _) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var internId = intern.Id;

        await LateStartResolutionService.RunOnceAsync(db);
        await LateStartResolutionService.RunOnceAsync(db);

        var count = await db.Tasks.CountAsync(t => t.InternId == internId && t.TaskType == "LateStartResolution");
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task LateStartScanSkipsInternsWithAttendance()
    {
        await using var db = _database.CreateContext();
        var (intern, _) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var internId = intern.Id;

        db.Attendances.Add(new Attendance
        {
            InternId = internId,
            Timestamp = Today.AddHours(9),
            ArrivalStatus = AttendanceSlotStatus.OnTime,
            DepartureStatus = AttendanceSlotStatus.Pending
        });
        await db.SaveChangesAsync();

        await LateStartResolutionService.RunOnceAsync(db);

        var count = await db.Tasks.CountAsync(t => t.InternId == internId && t.TaskType == "LateStartResolution");
        Assert.Equal(0, count);
    }

    // ---------- Group E: reverse late-end notifications (2f) ----------

    [Fact]
    public async Task ReverseLateEndCreatesBothNotifications()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(-1));
        await db.SaveChangesAsync();
        var internId = intern.Id;
        var internUserId = intern.UserId;
        var mentorUserId = mentor.UserId;

        // Attendance recorded after the end date.
        db.Attendances.Add(new Attendance
        {
            InternId = internId,
            Timestamp = Today.AddHours(9),
            ArrivalStatus = AttendanceSlotStatus.OnTime,
            DepartureStatus = AttendanceSlotStatus.OnTime
        });
        await db.SaveChangesAsync();

        await LateStartResolutionService.RunOnceAsync(db);

        var internNotifications = await db.Notifications.Where(n => n.UserId == internUserId).ToListAsync();
        var mentorNotifications = await db.Notifications.Where(n => n.UserId == mentorUserId).ToListAsync();
        Assert.Single(internNotifications);
        Assert.Contains("Internship end date passed", internNotifications[0].Title);
        Assert.Single(mentorNotifications);
        Assert.Contains(intern.FullName, mentorNotifications[0].Title);
    }

    [Fact]
    public async Task ReverseLateEndIsIdempotent()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(-1));
        await db.SaveChangesAsync();
        var internId = intern.Id;
        var internUserId = intern.UserId;
        var mentorUserId = mentor.UserId;

        db.Attendances.Add(new Attendance
        {
            InternId = internId,
            Timestamp = Today.AddHours(9),
            ArrivalStatus = AttendanceSlotStatus.OnTime,
            DepartureStatus = AttendanceSlotStatus.OnTime
        });
        await db.SaveChangesAsync();

        await LateStartResolutionService.RunOnceAsync(db);
        await LateStartResolutionService.RunOnceAsync(db);

        Assert.Equal(1, await db.Notifications.CountAsync(n => n.UserId == internUserId));
        Assert.Equal(1, await db.Notifications.CountAsync(n => n.UserId == mentorUserId));
    }

    [Fact]
    public async Task ReverseLateEndSkipsNoPastAttendance()
    {
        await using var db = _database.CreateContext();
        // StartDate is inside the late-start cutoff so 2e cannot fire; this test is
        // about 2f only.
        var (intern, _) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-2), Today.AddDays(-1));
        await db.SaveChangesAsync();
        var internId = intern.Id;
        var internUserId = intern.UserId;

        // No attendance recorded after the end date.
        await LateStartResolutionService.RunOnceAsync(db);

        Assert.Equal(0, await db.Notifications.CountAsync(n => n.UserId == internUserId));
        Assert.Equal(0, await db.Tasks.CountAsync(t => t.InternId == internId && t.TaskType == "LateStartResolution"));
    }

    // ---------- New intern default ----------

    [Fact]
    public void NewInternDefaultsToUpcoming()
    {
        Assert.Equal(InternshipStatus.Upcoming, new Intern().Status);
    }

    // ---------- Group A: permission matrix + history ----------

    [Fact]
    public async Task MentorCanSetActiveSuspendedCompletedOnOwnIntern()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var internId = intern.Id;

        var controller = MakeMentorController(db, mentor.UserId);
        var result = await controller.ChangeInternStatus(
            internId, new MentorChangeInternStatusRequest((int)InternshipStatus.Suspended, "temporary"));

        Assert.Equal(200, StatusOf(result));
        await using var verify = _database.CreateContext();
        Assert.Equal(InternshipStatus.Suspended, (await verify.Interns.FindAsync(internId))!.Status);
    }

    [Fact]
    public async Task MentorCannotSetWithdrawnOrTerminated()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var internId = intern.Id;

        var controller = MakeMentorController(db, mentor.UserId);
        var result = await controller.ChangeInternStatus(
            internId, new MentorChangeInternStatusRequest((int)InternshipStatus.Withdrawn, "try"));

        Assert.Equal(403, StatusOf(result));
        await using var verify = _database.CreateContext();
        Assert.Equal(InternshipStatus.Active, (await verify.Interns.FindAsync(internId))!.Status);
    }

    [Fact]
    public void InternCannotSetAnyStatus()
    {
        // The intern has no status route at all, so an intern can never change a
        // status. If a route containing "status" is ever added to InternController
        // this fails, which is the point.
        var statusRoutes = typeof(InternController).GetMethods()
            .SelectMany(m => m.GetCustomAttributes<HttpMethodAttribute>(true))
            .SelectMany(a => string.IsNullOrEmpty(a.Template)
                ? Enumerable.Empty<string>()
                : new[] { a.Template })
            .Where(t => t.Contains("status", StringComparison.OrdinalIgnoreCase))
            .ToList();

        Assert.Empty(statusRoutes);
    }

    [Fact]
    public async Task AdminCanSetAllStatuses()
    {
        foreach (var target in new[]
        {
            InternshipStatus.Active, InternshipStatus.Suspended, InternshipStatus.Completed,
            InternshipStatus.Withdrawn, InternshipStatus.Terminated
        })
        {
            await using var db = _database.CreateContext();
            var (intern, _) = SeedGraph(db, InternshipStatus.Upcoming, Today.AddDays(-5), Today.AddDays(30));
            await db.SaveChangesAsync();
            var internId = intern.Id;

            var controller = MakeAdminController(db, AdminUserId);
            var result = await controller.ChangeInternStatus(
                internId, new AdminChangeInternStatusRequest((int)target, "reason"));

            Assert.Equal(200, StatusOf(result));
            await using var verify = _database.CreateContext();
            Assert.Equal(target, (await verify.Interns.FindAsync(internId))!.Status);
        }
    }

    [Fact]
    public async Task StatusChangeWritesHistoryRow()
    {
        await using var db = _database.CreateContext();
        var (intern, _) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var internId = intern.Id;

        db.InternStatusHistories.Add(new InternStatusHistory
        {
            InternId = internId,
            Status = InternshipStatus.Active,
            FromDate = Today.AddDays(-5)
        });
        await db.SaveChangesAsync();

        var controller = MakeAdminController(db, AdminUserId);
        var result = await controller.ChangeInternStatus(
            internId, new AdminChangeInternStatusRequest((int)InternshipStatus.Suspended, "hr"));

        Assert.Equal(200, StatusOf(result));
        await using var verify = _database.CreateContext();
        var rows = await verify.InternStatusHistories.Where(h => h.InternId == internId).ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.Single(rows, h => h.Status == InternshipStatus.Active && h.ToDate != null);
        Assert.Single(rows, h => h.Status == InternshipStatus.Suspended && h.ToDate == null);
    }

    // ---------- Group F: un-terminate ----------

    [Fact]
    public async Task UnterminateMovesTerminatedToWithdrawnAndClearsFields()
    {
        await using var db = _database.CreateContext();
        var (intern, _) = SeedGraph(db, InternshipStatus.Terminated, Today.AddDays(-5), Today.AddDays(30));
        intern.TerminationReason = "misconduct";
        intern.TerminatedAt = Today.AddDays(-1);
        await db.SaveChangesAsync();
        var internId = intern.Id;

        var controller = MakeAdminController(db, AdminUserId);
        var result = await controller.UnterminateIntern(internId, new AdminUnterminateRequest("appeal upheld"));

        Assert.Equal(200, StatusOf(result));
        await using var verify = _database.CreateContext();
        var reloaded = await verify.Interns.FindAsync(internId);
        Assert.Equal(InternshipStatus.Withdrawn, reloaded!.Status);
        Assert.Null(reloaded.TerminationReason);
        Assert.Null(reloaded.TerminatedAt);
    }

    // ---------- Group C: late-start task resolution ----------

    [Fact]
    public async Task ResolveExtendStartUpdatesDateAndClosesTask()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var task = SeedLateStartTask(db, intern, mentor);
        await db.SaveChangesAsync();
        var taskId = task.Id;
        var newStart = Today.AddDays(1);

        var controller = MakeMentorController(db, mentor.UserId);
        var result = await controller.ResolveTask(taskId, new MentorResolveTaskRequest("ExtendStart", newStart));

        Assert.Equal(200, StatusOf(result));
        await using var verify = _database.CreateContext();
        Assert.Equal(InternSystem.Core.Entities.TaskStatus.Completed, (await verify.Tasks.FindAsync(taskId))!.Status);
        Assert.Equal(newStart.Date, (await verify.Interns.FindAsync(intern.Id))!.StartDate.Date);
    }

    [Fact]
    public async Task ResolveExtendStartRejectsPastDate()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var task = SeedLateStartTask(db, intern, mentor);
        await db.SaveChangesAsync();
        var taskId = task.Id;

        var controller = MakeMentorController(db, mentor.UserId);
        var result = await controller.ResolveTask(taskId, new MentorResolveTaskRequest("ExtendStart", Today.AddDays(-1)));

        Assert.Equal(400, StatusOf(result));
        await using var verify = _database.CreateContext();
        Assert.Equal(InternSystem.Core.Entities.TaskStatus.Pending, (await verify.Tasks.FindAsync(taskId))!.Status);
    }

    [Fact]
    public async Task ResolveWithdrawSetsStatusAndClosesTask()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var task = SeedLateStartTask(db, intern, mentor);
        await db.SaveChangesAsync();
        var taskId = task.Id;

        var controller = MakeMentorController(db, mentor.UserId);
        var result = await controller.ResolveTask(taskId, new MentorResolveTaskRequest("Withdraw", null));

        Assert.Equal(200, StatusOf(result));
        await using var verify = _database.CreateContext();
        Assert.Equal(InternshipStatus.Withdrawn, (await verify.Interns.FindAsync(intern.Id))!.Status);
        Assert.Equal(InternSystem.Core.Entities.TaskStatus.Completed, (await verify.Tasks.FindAsync(taskId))!.Status);
    }

    [Fact]
    public async Task ResolveWithdrawWritesHistory()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var task = SeedLateStartTask(db, intern, mentor);
        await db.SaveChangesAsync();

        var controller = MakeMentorController(db, mentor.UserId);
        await controller.ResolveTask(task.Id, new MentorResolveTaskRequest("Withdraw", null));

        await using var verify = _database.CreateContext();
        var rows = await verify.InternStatusHistories
            .Where(h => h.InternId == intern.Id && h.Status == InternshipStatus.Withdrawn && h.ToDate == null)
            .ToListAsync();
        Assert.Single(rows);
    }

    [Fact]
    public async Task ResolveDismissIncrementsAndStaysPending()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var task = SeedLateStartTask(db, intern, mentor);
        await db.SaveChangesAsync();
        var taskId = task.Id;

        var controller = MakeMentorController(db, mentor.UserId);
        var result = await controller.ResolveTask(taskId, new MentorResolveTaskRequest("Dismiss", null));

        Assert.Equal(200, StatusOf(result));
        await using var verify = _database.CreateContext();
        var reloaded = await verify.Tasks.FindAsync(taskId);
        Assert.Equal(1, reloaded!.DismissCount);
        Assert.Equal(InternSystem.Core.Entities.TaskStatus.Pending, reloaded.Status);
    }

    [Fact]
    public async Task ThirdDismissCreatesAdminNotification()
    {
        await using var db = _database.CreateContext();
        var admin = MakeUser(db, UserRole.Admin);
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var adminId = admin.Id;
        var task = SeedLateStartTask(db, intern, mentor);
        await db.SaveChangesAsync();
        var taskId = task.Id;

        var controller = MakeMentorController(db, mentor.UserId);
        await controller.ResolveTask(taskId, new MentorResolveTaskRequest("Dismiss", null));
        await controller.ResolveTask(taskId, new MentorResolveTaskRequest("Dismiss", null));
        await controller.ResolveTask(taskId, new MentorResolveTaskRequest("Dismiss", null));

        await using var verify = _database.CreateContext();
        Assert.Equal(3, (await verify.Tasks.FindAsync(taskId))!.DismissCount);
        var adminNotifs = await verify.Notifications
            .Where(n => n.UserId == adminId && n.Title.Contains("Late-start task dismissed"))
            .ToListAsync();
        Assert.Single(adminNotifs);
    }

    // ---------- Group D: task guards ----------

    [Fact]
    public async Task MentorCannotResolveOthersTask()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        var otherMentor = new Mentor
        {
            User = MakeUser(db, UserRole.Mentor),
            FullName = "Other Mentor",
            Designation = "Mentor",
            DepartmentId = 1
        };
        db.Mentors.Add(otherMentor);
        await db.SaveChangesAsync();
        var task = SeedLateStartTask(db, intern, mentor);
        await db.SaveChangesAsync();
        var taskId = task.Id;

        var controller = MakeMentorController(db, otherMentor.UserId);
        var result = await controller.ResolveTask(taskId, new MentorResolveTaskRequest("Dismiss", null));

        Assert.Equal(404, StatusOf(result));
    }

    [Fact]
    public async Task NonLateStartTaskRejected()
    {
        await using var db = _database.CreateContext();
        var (intern, mentor) = SeedGraph(db, InternshipStatus.Active, Today.AddDays(-5), Today.AddDays(30));
        await db.SaveChangesAsync();
        var task = SeedLateStartTask(db, intern, mentor);
        task.TaskType = "General";
        await db.SaveChangesAsync();
        var taskId = task.Id;

        var controller = MakeMentorController(db, mentor.UserId);
        var result = await controller.ResolveTask(taskId, new MentorResolveTaskRequest("Dismiss", null));

        Assert.Equal(400, StatusOf(result));
    }

    // ---------- endpoint-test helpers ----------

    // Users.Id = 1 is the seeded admin and survives SqlServerTestDatabase.ResetAsync.
    private const int AdminUserId = 1;

    private static ClaimsPrincipal Principal(int userId) =>
        new(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, userId.ToString()) }, "test"));

    private static T WithUser<T>(T controller, int userId) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = Principal(userId) }
        };
        return controller;
    }

    // The tested actions only touch the DbContext, so the remaining collaborators
    // are inert. Notifications is supplied because the dismiss path uses it.
    private static AdminController MakeAdminController(AppDbContext db, int userId) =>
        WithUser(new AdminController(db, null!, null!, null!, null!, null!, null!, null!), userId);

    private static MentorController MakeMentorController(AppDbContext db, int userId) =>
        WithUser(new MentorController(db, null!, null!, null!, null!, new NotificationService(db), null!, null!, null!), userId);

    private static int StatusOf(IActionResult result) => result switch
    {
        ObjectResult o => o.StatusCode ?? StatusCodes.Status200OK,
        StatusCodeResult s => s.StatusCode,
        _ => throw new Xunit.Sdk.XunitException($"Unexpected action result: {result.GetType().Name}")
    };

    private static InternTask SeedLateStartTask(AppDbContext db, Intern intern, Mentor mentor)
    {
        var task = new InternTask
        {
            InternId = intern.Id,
            AssignedByMentorId = mentor.Id,
            Title = "Late start resolution needed",
            Description = "seed",
            TaskType = "LateStartResolution",
            Status = InternSystem.Core.Entities.TaskStatus.Pending
        };
        db.Tasks.Add(task);
        return task;
    }
}
