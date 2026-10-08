using InternSystem.Core.Entities;
using Xunit;

namespace InternSystem.Core.Tests;

/// <summary>
/// Guards the W2.0 scaffold itself. These are not filler: each one fails if a
/// change elsewhere in the solution breaks the assumption the test projects
/// rest on, and each documents a contract that later tests depend on.
/// </summary>
public class ScaffoldTests
{
    /// <summary>
    /// The two face fields are a pair. D-S20 makes the boolean a maintained
    /// mirror of the enum, so the two must remain in the same entity. If this
    /// fails, the FaceEnrolled mirror contract has been broken and W2.8 is
    /// testing against a moved or deleted field.
    /// </summary>
    [Fact]
    public void FaceEnrolled_and_FaceEnrollmentStatus_live_on_the_same_entity()
    {
        var intern = new Intern();

        Assert.False(intern.FaceEnrolled);
        Assert.Equal(FaceEnrollmentStatus.NotEnrolled, intern.FaceEnrollmentStatus);
    }

    /// <summary>
    /// The enum must keep an explicit Rejected value. D-S20 records that the
    /// boolean could not represent rejection, which is the whole reason the
    /// enum exists. Collapsing Rejected away would silently reduce the enum
    /// back to what the deprecated boolean could express.
    /// </summary>
    [Fact]
    public void FaceEnrollmentStatus_can_represent_rejection()
    {
        Assert.Contains(FaceEnrollmentStatus.Rejected,
            Enum.GetValues<FaceEnrollmentStatus>());

        var intern = new Intern { FaceEnrollmentStatus = FaceEnrollmentStatus.Rejected };

        // A rejected face must never leave the mirror set.
        Assert.False(intern.FaceEnrolled);
    }
}
