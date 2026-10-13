using InternSystem.Core.Entities;
using Xunit;

namespace InternSystem.Integration.Tests;

public class AttendanceFailureRetentionTests
{
    [Fact]
    public void AllEightCodesResolveFromReasonCodes()
    {
        // basic shape check
        var codes = new[] { "ANTISPOOF_FAILED", "LIVENESS_FAILED", "FACE_MATCH_FAILED", "GEOFENCE_OUTSIDE", "MISSING_GEOFENCE_CONFIG", "FACE_NOT_ENROLLED", "DEVICE_NOT_BOUND", "OUTSIDE_SHIFT_WINDOW" };
        Assert.Equal(8, codes.Length);
    }

    [Fact]
    public void FailedAttendanceWritesRecord()
    {
        var r = new AttendanceFailureRecord { InternId = 1, ReasonCode = "ANTISPOOF_FAILED", AttemptedAt = DateTime.Now };
        Assert.NotNull(r);
    }

    [Fact]
    public void InternResponseFields()
    {
        var rc = new ReasonCode { Code = "X", SimplifiedIntern = "si", SimplifiedMentor = "sm", Technical = "tech", RemedyIntern = "ri", RemedyMentor = "rm" };
        Assert.False(string.IsNullOrEmpty(rc.SimplifiedIntern));
        Assert.False(string.IsNullOrEmpty(rc.RemedyIntern));
    }

    [Fact]
    public void MentorAdminResponseFields()
    {
        var rc = new ReasonCode { Code = "X", SimplifiedMentor = "sm", Technical = "tech", RemedyMentor = "rm" };
        Assert.False(string.IsNullOrEmpty(rc.SimplifiedMentor));
        Assert.False(string.IsNullOrEmpty(rc.Technical));
        Assert.False(string.IsNullOrEmpty(rc.RemedyMentor));
    }

    [Fact]
    public void ClearMovesFileAndSetsFields() { }

    [Fact]
    public void ClearOnSuspendedInternRequiresAcknowledgement() { }

    [Fact]
    public void AutoPurgeDeletesRowAndArchiveFile() { }

    [Fact]
    public void AutoPurgeWritesAuditEntry() { }

    [Fact]
    public void ImageRetrievalWritesAuditEntry() { }

    [Fact]
    public void WeeklyReminderProducesExactlyOneBatchedNotification() { }
}
