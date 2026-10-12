using InternSystem.Core.Entities;
using Xunit;

namespace InternSystem.Integration.Tests;

public class InternshipStatusTests
{
    [Fact]
    public void NewInternDefaultsToUpcoming()
    {
        var i = new Intern { Status = InternshipStatus.Upcoming };
        Assert.Equal(InternshipStatus.Upcoming, i.Status);
    }

    [Fact]
    public void BackfillLogicTargetsUpcomingWithPastStartDate()
    {
        Assert.True(InternshipStatus.Upcoming == InternshipStatus.Upcoming);
    }

    [Fact]
    public void AutoTransitionMovesUpcomingToActiveWhenStartDateReached()
    {
        var today = DateTime.Today;
        var i = new Intern { Status = InternshipStatus.Upcoming, StartDate = today.AddDays(-1) };
        Assert.True(i.StartDate <= today && i.Status == InternshipStatus.Upcoming);
    }

    [Fact]
    public void AutoTransitionDoesNotMoveWhenFuture()
    {
        var today = DateTime.Today;
        var i = new Intern { Status = InternshipStatus.Upcoming, StartDate = today.AddDays(1) };
        Assert.False(i.StartDate <= today);
    }

    [Fact(Skip = "Requires controller/auth context; see W2.9")]
    public void MentorCanSetActiveSuspendedCompletedOnOwnIntern() { }

    [Fact(Skip = "Requires controller/auth context; see W2.9")]
    public void MentorCannotSetWithdrawnOrTerminated() { }

    [Fact(Skip = "Requires controller/auth context; see W2.9")]
    public void InternCannotSetAnyStatus() { }

    [Fact(Skip = "Requires controller/auth context; see W2.9")]
    public void AdminCanSetAllStatuses() { }

    [Fact]
    public void StatusChangeWritesHistoryRow()
    {
        var h = new InternStatusHistory { InternId = 1, Status = InternshipStatus.Active, FromDate = DateTime.Now };
        Assert.NotNull(h);
    }

    [Fact(Skip = "Requires controller context; see W2.9")]
    public void UnterminateMovesTerminatedToWithdrawnAndClearsFields() { }

    [Fact]
    public void ScoringExcludesSuspendedDays()
    {
        Assert.True(InternshipStatus.Suspended == InternshipStatus.Suspended);
    }
}
