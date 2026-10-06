using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using InternSystem.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;
using Xunit.Abstractions;

namespace InternSystem.Integration.Tests;

/// <summary>
/// Tests <see cref="AttendanceScoringService.ComputeAsync"/> against real SQL
/// Server.
///
/// These live here, not in Core.Tests, because ComputeAsync takes a
/// <see cref="DbContext"/>. Every test that touches a DbContext belongs to this
/// project per the owner ruling; only pure functions stay provider-free.
///
/// Why the weekend and holiday autofill is worth pinning: both are credited a
/// full 2.0. That is a deliberate product decision, an intern is not penalised
/// for a Saturday or a public holiday, and it means the denominator counts those
/// days while the numerator credits them in full. If autofill silently stopped,
/// the numerator would drop while the denominator stayed, so every percentage
/// would fall without any error surfacing.
///
/// Tests assert TotalScore and TotalDays, not only Percentage. Percentage is a
/// rounded ratio and can stay stable while the day count behind it is wrong.
/// </summary>
[Collection(SqlServerCollection.Name)]
public class AttendanceScoringAutofillTests : IAsyncLifetime
{
    private static readonly DateTime Mon = new(2026, 3, 2);
    private static readonly DateTime Tue = new(2026, 3, 3);
    private static readonly DateTime Wed = new(2026, 3, 4);
    private static readonly DateTime Sat = new(2026, 3, 7);
    private static readonly DateTime Sun = new(2026, 3, 8);

    private static readonly TimeSpan MorningStart = new(9, 0, 0);
    private static readonly TimeSpan MorningEnd = new(17, 0, 0);

    private readonly SqlServerTestDatabase _database;
    private readonly ITestOutputHelper _output;

    public AttendanceScoringAutofillTests(SqlServerTestDatabase database, ITestOutputHelper output)
    {
        _database = database;
        _output = output;
    }

    /// <summary>
    /// Creates one intern. Model seed data already supplies the settings row the
    /// service reads by the literal id 1, the two departments and the three
    /// company-wide shifts, so only the intern row is added. ShiftId stays null
    /// so GetShiftTimesAsync exercises its fallback to the Morning shift.
    /// </summary>
    /// <summary>
    /// Builds the full graph a real Intern needs: Interns has foreign keys to
    /// Users and Mentors (both Restrict), and SQL Server enforces them, so the
    /// parent rows must genuinely exist. Id is an IDENTITY column and is never
    /// set explicitly; EF generates it on SaveChanges.
    /// </summary>
    private static Intern SeedIntern(AppDbContext db)
    {
        var user = MakeUser(db);

        var mentor = new Mentor
        {
            User = MakeUser(db),
            FullName = "Test Mentor",
            Designation = "Mentor",
            DepartmentId = 1
        };
        db.Mentors.Add(mentor);

        var intern = new Intern
        {
            User = user,
            Mentor = mentor,
            DepartmentId = 1, // seeded "ERP Section"
            FullName = "Test Intern",
            RegNo = "T-000",
            StartDate = Mon,
            EndDate = Sun,
            ShiftId = null
        };
        db.Interns.Add(intern);
        return intern;
    }

    private static User MakeUser(AppDbContext db)
    {
        var user = new User
        {
            Username = $"u-{Guid.NewGuid():N}"[..20],
            PasswordHash = "x",
            Role = UserRole.Intern,
            IsActive = true
        };
        db.Users.Add(user);
        return user;
    }

    /// <summary>Records a day where the intern clocked in and out on time.</summary>
    private static void SeedPerfectDay(AppDbContext db, int internId, DateTime date)
    {
        db.Attendances.Add(new Attendance
        {
            InternId = internId,
            Timestamp = date.Add(MorningStart),
            OutTime = date.Add(MorningEnd),
            ArrivalStatus = AttendanceSlotStatus.OnTime,
            DepartureStatus = AttendanceSlotStatus.OnTime,
            IsInRange = true,
            FaceVerified = true,
            LocationVerified = true
        });
    }

    // ---------- Weekend autofill ----------

    [Fact]
    public async Task Weekend_days_score_a_full_2_0_even_with_no_attendance_record()
    {
        await using var db = _database.CreateContext();
        var intern = SeedIntern(db);
        db.SaveChanges();
        var internId = intern.Id;

        foreach (var day in new[] { Mon, Tue, Wed, Mon.AddDays(3), Mon.AddDays(4) })
            SeedPerfectDay(db, internId, day);
        db.SaveChanges();

        var result = await new AttendanceScoringService(db).ComputeAsync(internId, Mon, Sun);

        // 5 recorded weekdays at 2.0 = 10.0, plus Sat+Sun autofilled at 2.0 = 4.0.
        Assert.Equal(7, result.TotalDays);
        Assert.Equal(14.0, result.TotalScore);
        Assert.Equal(14.0, result.MaxScore);
        Assert.Equal(100.0, result.Percentage);
    }

    [Fact]
    public async Task Weekend_autofill_credits_2_0_per_day_with_no_records_at_all()
    {
        await using var db = _database.CreateContext();
        var intern = SeedIntern(db);
        db.SaveChanges();
        var internId = intern.Id;

        // Window is Sat..Sun only, so only weekend days are scored.
        var result = await new AttendanceScoringService(db).ComputeAsync(internId, Sat, Sun);

        Assert.Equal(2, result.TotalDays);
        Assert.Equal(4.0, result.TotalScore);
        Assert.Equal(100.0, result.Percentage);
    }

    [Fact]
    public async Task A_record_on_a_weekend_does_not_double_credit_the_day()
    {
        await using var db = _database.CreateContext();
        var intern = SeedIntern(db);
        db.SaveChanges();
        var internId = intern.Id;

        SeedPerfectDay(db, internId, Sat);
        db.SaveChanges();

        var result = await new AttendanceScoringService(db).ComputeAsync(internId, Sat, Sun);

        // The weekend branch continues before the record is read, so an existing
        // weekend record must not add a second 2.0.
        Assert.Equal(4.0, result.TotalScore);
    }

    // ---------- Holiday autofill ----------

    [Fact]
    public async Task A_public_holiday_on_a_weekday_scores_a_full_2_0()
    {
        await using var db = _database.CreateContext();
        var intern = SeedIntern(db);
        db.SaveChanges();
        var internId = intern.Id;

        foreach (var day in new[] { Mon, Tue, Wed, Mon.AddDays(3), Mon.AddDays(4) })
            SeedPerfectDay(db, internId, day);
        db.PublicHolidays.Add(new PublicHoliday
        {
            Date = DateOnly.FromDateTime(Wed),
            Name = "Test Holiday"
        });
        db.SaveChanges();

        var result = await new AttendanceScoringService(db).ComputeAsync(internId, Mon, Sun);

        // Wed is deliberately BOTH a recorded perfect day and a holiday, and the
        // total is 14.0 not 16.0: the holiday branch credits 2.0 and continues
        // before the record is read, so a record on a holiday cannot add a
        // second 2.0. Same short-circuit the weekend case relies on.
        Assert.Equal(7, result.TotalDays);
        Assert.Equal(14.0, result.TotalScore);
        Assert.Equal(100.0, result.Percentage);
    }

    [Fact]
    public async Task A_holiday_with_no_record_scores_2_0_from_the_holiday_rule_alone()
    {
        await using var db = _database.CreateContext();
        var intern = SeedIntern(db);
        db.SaveChanges();
        var internId = intern.Id;

        db.PublicHolidays.Add(new PublicHoliday
        {
            Date = DateOnly.FromDateTime(Tue),
            Name = "Holiday"
        });
        db.SaveChanges();

        var result = await new AttendanceScoringService(db).ComputeAsync(internId, Tue, Tue);

        Assert.Equal(1, result.TotalDays);
        Assert.Equal(2.0, result.TotalScore);
    }

    [Fact]
    public async Task Holidays_outside_the_requested_window_are_not_credited()
    {
        await using var db = _database.CreateContext();
        var intern = SeedIntern(db);
        db.SaveChanges();
        var internId = intern.Id;

        SeedPerfectDay(db, internId, Mon);
        SeedPerfectDay(db, internId, Tue);
        db.PublicHolidays.Add(new PublicHoliday
        {
            Date = DateOnly.FromDateTime(Wed),
            Name = "Outside"
        });
        db.SaveChanges();

        // Window is Mon..Tue, so the Wednesday holiday is out of range and must
        // not be credited. Two recorded perfect days = 4.0 of 4.0.
        var result = await new AttendanceScoringService(db).ComputeAsync(internId, Mon, Tue);

        Assert.Equal(4.0, result.TotalScore);
        Assert.Equal(100.0, result.Percentage);
    }

    // ---------- Denominator integrity ----------

    [Fact]
    public async Task Denominator_is_2_0_per_calendar_day_including_non_working_days()
    {
        await using var db = _database.CreateContext();
        var intern = SeedIntern(db);
        db.SaveChanges();
        var internId = intern.Id;

        var result = await new AttendanceScoringService(db).ComputeAsync(internId, Mon, Sun);

        // Every calendar day counts toward the denominator, not just weekdays.
        Assert.Equal(2.0 * result.TotalDays, result.MaxScore);
    }

    [Fact]
    public async Task A_day_with_no_record_scores_zero_and_still_counts_in_the_denominator()
    {
        await using var db = _database.CreateContext();
        var intern = SeedIntern(db);
        db.SaveChanges();
        var internId = intern.Id;

        SeedPerfectDay(db, internId, Mon);
        SeedPerfectDay(db, internId, Tue);
        // Wed intentionally left with no record.
        db.SaveChanges();

        var result = await new AttendanceScoringService(db).ComputeAsync(internId, Mon, Sun);

        // Mon+Tue = 4.0, Wed = 0, Thu+Fri = 0, Sat+Sun = 4.0 -> 8.0 of 14.0.
        Assert.Equal(7, result.TotalDays);
        Assert.Equal(8.0, result.TotalScore);
        Assert.Equal(14.0, result.MaxScore);
    }

    [Fact]
    public async Task An_inverted_date_window_is_swapped_rather_than_returning_nothing()
    {
        await using var db = _database.CreateContext();
        var intern = SeedIntern(db);
        db.SaveChanges();
        var internId = intern.Id;

        SeedPerfectDay(db, internId, Mon);
        db.SaveChanges();

        var result = await new AttendanceScoringService(db).ComputeAsync(internId, Sun, Mon);

        Assert.Equal(7, result.TotalDays);
    }

    [Fact]
    public async Task An_unknown_intern_does_not_throw_and_credits_only_the_weekend()
    {
        await using var db = _database.CreateContext();

        // Weekend and holiday credit is calendar-driven, not intern-driven, so
        // Sat and Sun are credited even for an intern that does not exist. Every
        // weekday scores 0 because no attendance rows exist. 4.0 of 14.0 -> 28.6%.
        var result = await new AttendanceScoringService(db).ComputeAsync(999_999_999, Mon, Sun);

        Assert.Equal(7, result.TotalDays);
        Assert.Equal(4.0, result.TotalScore);
        Assert.Equal(28.6, result.Percentage);
    }

    /// <summary>
    /// Clears rows a previous test created so this test starts from a known
    /// state. Without this the suite shares one database and a holiday or
    /// attendance row from an earlier test would silently change the result.
    /// </summary>
    public async Task InitializeAsync() => await _database.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;
}