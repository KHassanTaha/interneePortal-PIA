using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Services;
using Xunit;

namespace InternSystem.Core.Tests;

/// <summary>
/// Tests the pure scoring primitives of <see cref="AttendanceScoringService"/>.
/// No database and no clock: every case uses a fixed date so the expected
/// values are bit-identical on every run and on every machine.
///
/// Why these specific numbers matter: they decide whether an intern gets a
/// completion certificate. The weights are not symmetric — arriving early is
/// rewarded (1.0) but departing early is penalised (0.5) — because an early
/// departure shortens the supervised day. A silent flip of either weight
/// would change attendance percentages across every historical record without
/// any error surfacing, so the weights are pinned exactly here.
///
/// The grace boundary is inclusive, which is the subtle part. At exactly
/// shift-start-minus-grace the intern is not Early, and at exactly
/// shift-start-plus-grace they are not Late; both are OnTime. An
/// implementation using `&lt;=` / `&gt;=` instead of `&lt;` / `&gt;` would pass
/// the obvious cases and fail only on the exact boundary minute, which is
/// exactly when a real intern clocks in.
/// </summary>
public class AttendanceScoringServiceTests
{
    private const int Grace = 15;
    private static readonly TimeSpan ShiftStart = new(9, 0, 0);
    private static readonly TimeSpan ShiftEnd = new(17, 0, 0);

    /// <summary>
    /// Fixed fixture date. Using DateTime.Today here would make the tests pass
    /// or fail depending on when they run and would shift the DayOfWeek.
    /// 2026-03-02 is a Monday.
    /// </summary>
    private static DateTime At(int hour, int minute) =>
        new(2026, 3, 2, hour, minute, 0, DateTimeKind.Unspecified);

    // ---------- ArrivalStatus: boundary behaviour at Grace ----------

    [Theory]
    [InlineData(8, 44, AttendanceSlotStatus.Early)]   // strictly before shiftStart-grace
    [InlineData(8, 45, AttendanceSlotStatus.OnTime)]  // exactly shiftStart-grace -> inclusive
    [InlineData(8, 46, AttendanceSlotStatus.OnTime)]
    [InlineData(9, 0, AttendanceSlotStatus.OnTime)]   // exactly shiftStart
    [InlineData(9, 14, AttendanceSlotStatus.OnTime)]
    [InlineData(9, 15, AttendanceSlotStatus.OnTime)]  // exactly shiftStart+grace -> inclusive
    [InlineData(9, 16, AttendanceSlotStatus.Late)]    // strictly after shiftStart+grace
    [InlineData(10, 0, AttendanceSlotStatus.Late)]
    public void ArrivalStatus_is_Early_before_the_grace_window_and_Late_after_it(
        int hour, int minute, AttendanceSlotStatus expected)
    {
        var actual = AttendanceScoringService.ArrivalStatus(At(hour, minute), ShiftStart, Grace);

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void ArrivalStatus_never_returns_Pending_because_a_check_in_exists()
    {
        // Pending arrival is what a missing record looks like. Since a timestamp
        // was supplied, the status must be one of the three graded values; a
        // Pending here would silently score 0 and understate attendance.
        foreach (var (h, m) in new[] { (0, 0), (9, 0), (23, 59) })
        {
            var status = AttendanceScoringService.ArrivalStatus(At(h, m), ShiftStart, Grace);

            Assert.NotEqual(AttendanceSlotStatus.Pending, status);
        }
    }

    // ---------- DepartureStatus: boundary behaviour, plus the null case ----------

    [Theory]
    [InlineData(16, 44, AttendanceSlotStatus.Early)]   // strictly before shiftEnd-grace
    [InlineData(16, 45, AttendanceSlotStatus.OnTime)]  // exactly shiftEnd-grace -> inclusive
    [InlineData(16, 46, AttendanceSlotStatus.OnTime)]
    [InlineData(17, 0, AttendanceSlotStatus.OnTime)]   // exactly shiftEnd
    [InlineData(17, 14, AttendanceSlotStatus.OnTime)]
    [InlineData(17, 15, AttendanceSlotStatus.OnTime)]  // exactly shiftEnd+grace -> inclusive
    [InlineData(17, 16, AttendanceSlotStatus.Late)]    // strictly after shiftEnd+grace
    [InlineData(20, 0, AttendanceSlotStatus.Late)]
    public void DepartureStatus_is_Early_before_the_grace_window_and_Late_after_it(
        int hour, int minute, AttendanceSlotStatus expected)
    {
        var actual = AttendanceScoringService.DepartureStatus(At(hour, minute), ShiftEnd, Grace);

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void DepartureStatus_is_Pending_when_no_check_out_was_recorded()
    {
        // A missing checkout is not the same as a bad checkout. Scoring it as
        // Early would charge the intern 0.5 for leaving on time; scoring it as
        // Late would credit them 1.0. Pending is the only honest answer and it
        // must score 0.
        var status = AttendanceScoringService.DepartureStatus(null, ShiftEnd, Grace);

        Assert.Equal(AttendanceSlotStatus.Pending, status);
        Assert.Equal(0.0, AttendanceScoringService.DepartureScore(status));
    }

    // ---------- ArrivalScore: the weights ----------

    [Theory]
    [InlineData(AttendanceSlotStatus.OnTime, 1.0)]
    [InlineData(AttendanceSlotStatus.Early, 1.0)]   // arriving early is rewarded
    [InlineData(AttendanceSlotStatus.Late, 0.5)]
    [InlineData(AttendanceSlotStatus.Pending, 0.0)]
    [InlineData(AttendanceSlotStatus.Absent, 0.0)]
    [InlineData(AttendanceSlotStatus.OnLeave, 0.0)]
    public void ArrivalScore_matches_the_contracted_weight(AttendanceSlotStatus status, double expected)
    {
        Assert.Equal(expected, AttendanceScoringService.ArrivalScore(status));
    }

    // ---------- DepartureScore: the weights ----------

    [Theory]
    [InlineData(AttendanceSlotStatus.OnTime, 1.0)]
    [InlineData(AttendanceSlotStatus.Late, 1.0)]    // staying late is credited
    [InlineData(AttendanceSlotStatus.Early, 0.5)]   // leaving early is penalised
    [InlineData(AttendanceSlotStatus.Pending, 0.0)]
    [InlineData(AttendanceSlotStatus.Absent, 0.0)]
    [InlineData(AttendanceSlotStatus.OnLeave, 0.0)]
    public void DepartureScore_matches_the_contracted_weight(AttendanceSlotStatus status, double expected)
    {
        Assert.Equal(expected, AttendanceScoringService.DepartureScore(status));
    }

    // ---------- The daily maximum of 2.0 that the whole contract rests on ----------

    [Fact]
    public void A_perfect_day_scores_exactly_2_0_the_documented_daily_maximum()
    {
        // Attendance% is totalScore / (2.0 * totalDays). If the daily maximum
        // ever changed, every historical percentage would silently shift, so
        // the constant is asserted rather than derived from the service.
        const double documentedDailyMax = 2.0;

        double perfect = AttendanceScoringService.ArrivalScore(AttendanceSlotStatus.OnTime)
                       + AttendanceScoringService.DepartureScore(AttendanceSlotStatus.OnTime);

        Assert.Equal(documentedDailyMax, perfect);
    }

    [Fact]
    public void Arrival_and_departure_weights_are_not_symmetric()
    {
        // Guards the intent behind the asymmetry rather than the numbers. Early
        // arrival earns full credit while early departure does not; flipping
        // either side would change attendance percentages retroactively.
        double earlyArrival = AttendanceScoringService.ArrivalScore(AttendanceSlotStatus.Early);
        double earlyDeparture = AttendanceScoringService.DepartureScore(AttendanceSlotStatus.Early);

        Assert.NotEqual(earlyArrival, earlyDeparture);
        Assert.Equal(1.0, earlyArrival);
        Assert.Equal(0.5, earlyDeparture);
    }

    [Fact]
    public void A_day_with_no_recorded_slots_scores_zero_not_Pending_one_point()
    {
        double empty = AttendanceScoringService.ArrivalScore(AttendanceSlotStatus.Pending)
                     + AttendanceScoringService.DepartureScore(AttendanceSlotStatus.Pending);

        Assert.Equal(0.0, empty);
    }
}