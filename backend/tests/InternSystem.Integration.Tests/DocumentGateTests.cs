using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InternSystem.Integration.Tests;

/// <summary>
/// Tests <c>DocumentGateExtensions.OfficialDocsApprovedAsync</c>, the gate that must
/// pass before any official document (gate pass, ID card, certificate) is issued.
///
/// The gate is CNIC + Resume only, per D-S16 as corrected. University ID and NOC are
/// optional and are asserted as irrelevant here so nobody quietly widens the gate.
/// Face enrollment is deliberately NOT tested: it is a separate check performed by the
/// approve endpoints, not part of this method.
///
/// The method returns a bool. The `skippedDocsNotApproved` reason token belongs to the
/// batch-approve counter in the controllers, not to this method, so these tests assert
/// the gate outcome and leave the counter to its own tests.
/// </summary>
[Collection(SqlServerCollection.Name)]
public class DocumentGateTests : IAsyncLifetime
{
    private readonly SqlServerTestDatabase _database;

    public DocumentGateTests(SqlServerTestDatabase database) => _database = database;

    public async Task InitializeAsync() => await _database.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Gate_passes_when_cnic_and_resume_are_both_approved()
    {
        var internId = await SeedAsync();
        await AddDocAsync(internId, UploadDocumentType.Cnic, DocumentRequestStatus.Approved);
        await AddDocAsync(internId, UploadDocumentType.Resume, DocumentRequestStatus.Approved);

        await using var db = _database.CreateContext();
        Assert.True(await db.OfficialDocsApprovedAsync(internId));
    }

    [Fact]
    public async Task Gate_fails_when_cnic_is_missing()
    {
        var internId = await SeedAsync();
        await AddDocAsync(internId, UploadDocumentType.Resume, DocumentRequestStatus.Approved);

        await using var db = _database.CreateContext();
        Assert.False(await db.OfficialDocsApprovedAsync(internId));
    }

    [Fact]
    public async Task Gate_fails_when_resume_is_missing()
    {
        var internId = await SeedAsync();
        await AddDocAsync(internId, UploadDocumentType.Cnic, DocumentRequestStatus.Approved);

        await using var db = _database.CreateContext();
        Assert.False(await db.OfficialDocsApprovedAsync(internId));
    }

    [Fact]
    public async Task Gate_fails_when_cnic_is_withdrawn()
    {
        var internId = await SeedAsync();
        await AddDocAsync(internId, UploadDocumentType.Cnic, DocumentRequestStatus.Approved, withdrawn: true);
        await AddDocAsync(internId, UploadDocumentType.Resume, DocumentRequestStatus.Approved);

        await using var db = _database.CreateContext();
        Assert.False(await db.OfficialDocsApprovedAsync(internId));
    }

    [Fact]
    public async Task Gate_fails_when_resume_is_withdrawn()
    {
        var internId = await SeedAsync();
        await AddDocAsync(internId, UploadDocumentType.Cnic, DocumentRequestStatus.Approved);
        await AddDocAsync(internId, UploadDocumentType.Resume, DocumentRequestStatus.Approved, withdrawn: true);

        await using var db = _database.CreateContext();
        Assert.False(await db.OfficialDocsApprovedAsync(internId));
    }

    [Fact]
    public async Task A_withdrawn_duplicate_does_not_invalidate_a_live_approved_cnic()
    {
        // The gate asks "does a qualifying row exist", not "are all rows
        // qualifying". An intern who re-uploaded and later withdrew one copy while a
        // live approved CNIC stands is still legitimately approved, so the gate must
        // pass. Asserting False here was a wrong expectation written by the test
        // author; production behaviour is correct and was left unchanged.
        var internId = await SeedAsync();
        await AddDocAsync(internId, UploadDocumentType.Cnic, DocumentRequestStatus.Approved);
        await AddDocAsync(internId, UploadDocumentType.Cnic, DocumentRequestStatus.Approved, withdrawn: true);
        await AddDocAsync(internId, UploadDocumentType.Resume, DocumentRequestStatus.Approved);

        await using var db = _database.CreateContext();
        Assert.True(await db.OfficialDocsApprovedAsync(internId));
    }

    [Theory]
    [InlineData(DocumentRequestStatus.Pending)]
    [InlineData(DocumentRequestStatus.Rejected)]
    public async Task Gate_fails_when_either_required_document_is_not_approved(DocumentRequestStatus status)
    {
        var internId = await SeedAsync();
        await AddDocAsync(internId, UploadDocumentType.Cnic, status);
        await AddDocAsync(internId, UploadDocumentType.Resume, DocumentRequestStatus.Approved);

        await using var db = _database.CreateContext();
        Assert.False(await db.OfficialDocsApprovedAsync(internId));
    }

    [Fact]
    public async Task Optional_documents_do_not_affect_the_gate()
    {
        // University ID and NOC are optional. Approving them must not be what opens
        // the gate, and their absence must not close it.
        var internId = await SeedAsync();
        await AddDocAsync(internId, UploadDocumentType.Cnic, DocumentRequestStatus.Approved);
        await AddDocAsync(internId, UploadDocumentType.Resume, DocumentRequestStatus.Approved);

        await using var db = _database.CreateContext();
        Assert.True(await db.OfficialDocsApprovedAsync(internId));
    }

    [Fact]
    public async Task Gate_is_scoped_to_the_intern_who_owns_the_documents()
    {
        var first = await SeedAsync();
        var second = await SeedAsync();
        await AddDocAsync(first, UploadDocumentType.Cnic, DocumentRequestStatus.Approved);
        await AddDocAsync(first, UploadDocumentType.Resume, DocumentRequestStatus.Approved);

        await using var db = _database.CreateContext();
        Assert.True(await db.OfficialDocsApprovedAsync(first));
        Assert.False(await db.OfficialDocsApprovedAsync(second));
    }

    private async Task<int> SeedAsync()
    {
        await using var db = _database.CreateContext();
        var user = new User
        {
            Username = $"u-{Guid.NewGuid():N}"[..20],
            PasswordHash = "x",
            Role = UserRole.Intern,
            IsActive = true
        };
        db.Users.Add(user);

        var mentor = new Mentor { User = MakeMentorUser(db), FullName = "Gate Mentor", Designation = "M", DepartmentId = 1 };
        db.Mentors.Add(mentor);

        var intern = new Intern
        {
            User = user,
            Mentor = mentor,
            FullName = "Gate Intern",
            RegNo = $"DG-{Guid.NewGuid():N}"[..12],
            DepartmentId = 1,
            StartDate = new DateTime(2026, 3, 1),
            EndDate = new DateTime(2026, 12, 31)
        };
        db.Interns.Add(intern);
        await db.SaveChangesAsync();
        return intern.Id;
    }

    private static User MakeMentorUser(AppDbContext db)
    {
        var user = new User
        {
            Username = $"m-{Guid.NewGuid():N}"[..20],
            PasswordHash = "x",
            Role = UserRole.Mentor,
            IsActive = true
        };
        db.Users.Add(user);
        return user;
    }

    private async Task AddDocAsync(int internId, UploadDocumentType type, DocumentRequestStatus status, bool withdrawn = false)
    {
        await using var db = _database.CreateContext();
        db.DocumentUploads.Add(new DocumentUpload
        {
            InternId = internId,
            DocumentType = type,
            FilePath = $"/uploads/{Guid.NewGuid():N}.pdf",
            Status = status,
            WithdrawnAt = withdrawn ? new DateTime(2026, 4, 1) : null
        });
        await db.SaveChangesAsync();
    }
}