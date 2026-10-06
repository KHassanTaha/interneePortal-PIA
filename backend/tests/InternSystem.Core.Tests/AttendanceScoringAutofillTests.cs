using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using InternSystem.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InternSystem.Core.Tests;

/// <summary>
/// Tests <see cref="AttendanceScoringService.ComputeAsync"/> over a seeded
/// InMemory <see cref="AppDbContext"/>.
///
/// Why the weekend and holiday autofill is worth pinning: both are credited a
/// full 2.0. That is a deliberate product decision — an intern is not penalised
/// for a Saturday or a public holiday — and it means the denominator counts
/// those days while the numerator credits them in full. If autofill silently
/// stopped happening, the numerator would drop while the denominator stayed,
/// so every percentage would fall without any error surfacing. That is exactly
/// the class of silent drift this suite exists to catch.
///
/// Why these tests assert on <c>TotalScore</c> and not only on
/// <c>Percentage</c>: percentage is a rounded ratio and can stay stable while
/// the underlying day count is wrong. TotalScore and TotalDays pin the actual
/// arithmetic, so a wrong day count cannot hide behind a coincidental ratio.
///
/// Known provider limitation: EF InMemory does not enforce foreign keys or
/// unique indexes. These tests seed the graph directly, so nothing here proves
/// referential integrity holds in SQL Server. Integrity is a database
/// constraint, not service logic; it is covered by the schema, not here.
/// </summary>
public class AttendanceScoringAutofillTests : IDisposable
{
    private const int Grace = 15;

    // The context ships HasData seed rows (AppDbContext.OnModelCreating), which
    // EnsureCreated applies. That gives us the settings row the service reads by
    // the literal id 1, plus the three company-wide shifts. Tests therefore seed
    // only what the seeds do not provide. Ids below 1000 avoid the seeded rows.
    private static readonly TimeSpan MorningStart = new(9, 0, 0);
    private static readonly TimeSpan MorningEnd = new(17, 0, 0);

    // Fixed week: 2026-03-02 Mon .. 2026-03-08 Sun.
    private static readonly DateTime Mon = new(2026, 3, 2);
    private static readonly DateTime Tue = new(2026, 3, 3);
    private static readonly DateTime Wed = new(2026, 3, 4);
    private static readonly DateTime Sat = new(2026, 3, 7);
    private static readonly DateTime Sun = new(2026, 3, 8);

    private readonly AppDbContext _db;

    // Seeded rows occupy ids 1-3, so generated ids start well clear of them.
    private int _nextId = 1000;

    public AttendanceScoringAutofillTests()
    {
        // Unique name per test instance so a parallel run cannot share state.
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"attendance-{Guid.NewGuid()}")
            .Options;
        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
    }

    public void Dispose() => _db.Dispose();

    /// <summary>
    /// Creates one intern. Settings, the Morning shift and departments already
    /// exist from the model seed data, so only the intern row is added. The
    /// intern is left with no explicit shift so GetShiftTimesAsync exercises its
    /// documented fallback to the company-wide Morning shift.
    /// </summary>
    private int SeedIntern(int? shiftId = null)
    {
        var intern = new Intern
        {
            Id = _nextId++,
            UserId = _nextId++,
            MentorId = 0,
            DepartmentId = 1, // seeded "ERP Section"
            FullName = "Test Intern",
            RegNo = "T-001",
            StartDate = Mon,
            EndDate = Sun,
            ShiftId = shiftId
        };
        _db.Interns.Add(intern);
        _db.SaveChanges();
        return intern.Id;
    }

    /// <summary>Records a day where the intern clocked in and out on time.</summary>
    private void SeedPerfectDay(int internId, DateTime date)
    {
        _db.Attendances.Add(new Attendance
        {
            Id = _nextId++,
            InternId = internId,
            Timestamp = date.Add(MorningStart),
            OutTime = date.Add(MorningEnd),
            ArrivalStatus = AttendanceSlotStatus.OnTime,
            DepartureStatus = AttendanceSlotStatus.OnTime,
            IsInRange = true,
            FaceVerified = true,
            LocationVerified = true
        });
        _db.SaveChanges();
    }

    // ---------- Weekend autofill ----------

    [Fact]
    public async Task Weekend_days_score_a_full_2_0_even_with_no_attendance_record()
    {
        var internId = SeedIntern();
        foreach (var day in new[] { Mon, Tue, Wed, Mon.AddDays(3), Mon.AddDays(4) })
            SeedPerfectDay(internId, day);

        var result = await new AttendanceScoringService(_db).ComputeAsync(internId, Mon, Sun);

        // 5 recorded weekdays at 2.0 = 10.0, plus Sat+Sun autofilled at 2.0 = 4.0.
        Assert.Equal(7, result.TotalDays);
        Assert.Equal(14.0, result.TotalScore);
        Assert.Equal(14.0, result.MaxScore);
        Assert.Equal(100.0, result.Percentage);
    }

    [Fact]
    public async Task Weekend_autofill_credits_2_0_per_day_independently_of_records()
    {
        var internId = SeedIntern();
        SeedPerfectDay(internId, Mon);

        // Explicitly widen the window to Sat..Sun so only weekend days are scored.
        var result = await new AttendanceScoringService(_db).ComputeAsync(internId, Sat, Sun);

        Assert.Equal(2, result.TotalDays);
        Assert.Equal(4.0, result.TotalScore);
        Assert.Equal(100.0, result.Percentage);
    }

    [Fact]
    public async Task A_record_on_a_weekend_does_not_double_credit_the_day()
    {
        var internId = SeedIntern();
        SeedPerfectDay(internId, Sat);

        var result = await new AttendanceScoringService(_db).ComputeAsync(internId, Sat, Sun);

        // The weekend branch continues before the record is read, so an
        // existing weekend record must not add a second 2.0.
        Assert.Equal(4.0, result.TotalScore);
    }

    // ---------- Holiday autofill ----------

    [Fact]
    public async Task A_public_holiday_on_a_weekday_scores_a_full_2_0()
    {
        var internId = SeedIntern();
        foreach (var day in new[] { Mon, Tue, Wed, Mon.AddDays(3), Mon.AddDays(4) })
            SeedPerfectDay(internId, day);
        _db.PublicHolidays.Add(new PublicHoliday
        {
            Date = DateOnly.FromDateTime(Wed),
            Name = "Test Holiday"
        });
        _db.SaveChanges();

        var result = await new AttendanceScoringService(_db).ComputeAsync(internId, Mon, Sun);

        // Wed is deliberately BOTH a seeded perfect day and a holiday. The total
        // is 14.0, not 16.0: the holiday branch credits 2.0 and continues before
        // the attendance record is ever read, so a record on a holiday cannot add
        // a second 2.0. This is the same short-circuit the weekend case relies on.
        Assert.Equal(7, result.TotalDays);
        Assert.Equal(14.0, result.TotalScore);
        Assert.Equal(100.0, result.Percentage);
    }

    [Fact]
    public async Task A_holiday_falls_back_to_zero_when_no_record_exists_and_no_record_is_autofilled()
    {
        // Guards the ordering: holiday credit is 2.0 regardless of records, so
        // this asserts the credit came from the holiday rule, not from a record.
        var internId = SeedIntern();
        _db.PublicHolidays.Add(new PublicHoliday
        {
            Date = DateOnly.FromDateTime(Tue),
            Name = "Holiday"
        });
        _db.SaveChanges();

        var result = await new AttendanceScoringService(_db).ComputeAsync(internId, Tue, Tue);

        Assert.Equal(1, result.TotalDays);
        Assert.Equal(2.0, result.TotalScore);
    }

    [Fact]
    public async Task Holidays_outside_the_requested_window_are_not_credited()
    {
        var internId = SeedIntern();
        SeedPerfectDay(internId, Mon);
        SeedPerfectDay(internId, Tue);
        _db.PublicHolidays.Add(new PublicHoliday
        {
            Date = DateOnly.FromDateTime(Wed),
            Name = "Outside"
        });
        _db.SaveChanges();

        // Window is Mon..Tue only, so the Wednesday holiday is out of range and
        // must not be credited. Two recorded perfect days = 4.0 of 4.0.
        var result = await new AttendanceScoringService(_db).ComputeAsync(internId, Mon, Tue);

        Assert.Equal(4.0, result.TotalScore);
        Assert.Equal(100.0, result.Percentage);
    }

    // ---------- Denominator integrity ----------

    [Fact]
    public async Task Denominator_is_2_0_per_calendar_day_including_non_working_days()
    {
        var internId = SeedIntern();

        var result = await new AttendanceScoringService(_db).ComputeAsync(internId, Mon, Sun);

        // Every calendar day counts toward the denominator, not just weekdays.
        Assert.Equal(2.0 * result.TotalDays, result.MaxScore);
    }

    [Fact]
    public async Task A_day_with_no_record_scores_zero_and_still_counts_in_the_denominator()
    {
        var internId = SeedIntern();
        SeedPerfectDay(internId, Mon);
        SeedPerfectDay(internId, Tue);
        // Wed intentionally left with no record.

        var result = await new AttendanceScoringService(_db).ComputeAsync(internId, Mon, Sun);

        // Mon+Tue = 4.0, Wed = 0, Thu+Fri = 0, Sat+Sun = 4.0 -> 8.0 of 14.0.
        Assert.Equal(7, result.TotalDays);
        Assert.Equal(8.0, result.TotalScore);
        Assert.Equal(14.0, result.MaxScore);
    }

    [Fact]
    public async Task An_inverted_date_window_is_swapped_rather_than_returning_nothing()
    {
        var internId = SeedIntern();
        SeedPerfectDay(internId, Mon);

        var result = await new AttendanceScoringService(_db).ComputeAsync(internId, Sun, Mon);

        Assert.Equal(7, result.TotalDays);
    }

    [Fact]
    public async Task An_unknown_intern_does_not_throw_and_credits_only_the_weekend()
    {
        var result = await new AttendanceScoringService(_db).ComputeAsync(999_999, Mon, Sun);

        // Weekend and holiday credit is calendar-driven, not intern-driven, so
        // Sat and Sun are still credited at 2.0 each. Every weekday scores 0
        // because no attendance rows exist. 4.0 of 14.0 -> 28.6%.
        Assert.Equal(7, result.TotalDays);
        Assert.Equal(4.0, result.TotalScore);
        Assert.Equal(28.6, result.Percentage);
    }
}