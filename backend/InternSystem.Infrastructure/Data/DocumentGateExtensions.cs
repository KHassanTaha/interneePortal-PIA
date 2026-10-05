using InternSystem.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.Infrastructure.Data;

/// <summary>
/// Document-issuance gate shared by the intern (face enroll), and admin/mentor
/// (gate pass / ID card / certificate approval) controllers. Both the CNIC and
/// the CV/Resume upload must be approved and not withdrawn before any official
/// document can be issued to that intern. University ID and NOC are optional.
/// </summary>
public static class DocumentGateExtensions
{
    public static async Task<bool> OfficialDocsApprovedAsync(this AppDbContext db, int internId)
    {
        var approvedTypes = await db.DocumentUploads
            .Where(d => d.InternId == internId && d.WithdrawnAt == null && d.Status == DocumentRequestStatus.Approved)
            .Select(d => d.DocumentType)
            .ToListAsync();
        return approvedTypes.Contains(UploadDocumentType.Cnic) &&
               approvedTypes.Contains(UploadDocumentType.Resume);
    }
}