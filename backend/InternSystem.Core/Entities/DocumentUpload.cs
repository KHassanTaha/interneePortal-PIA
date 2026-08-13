namespace InternSystem.Core.Entities;

public enum UploadDocumentType
{
    Cnic,
    UniversityId,
    Resume
}

public class DocumentUpload
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;

    public UploadDocumentType DocumentType { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;

    public DocumentRequestStatus Status { get; set; } = DocumentRequestStatus.Pending;
    public int? ApprovedByUserId { get; set; }
    public User? ApprovedByUser { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? RejectionReason { get; set; }
    public DateTime? WithdrawnAt { get; set; }

    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}

public static class DocumentUploadRules
{
    public static readonly string[] ImageExtensions = { ".jpg", ".jpeg", ".png" };
    public static readonly string[] PdfExtensions = { ".pdf" };
    public static readonly long MaxFileSizeBytes = 5 * 1024 * 1024;
    public static readonly long MaxTotalSizeBytes = 10 * 1024 * 1024;

    public static bool IsValidType(UploadDocumentType type, string ext) =>
        type == UploadDocumentType.Resume
            ? PdfExtensions.Contains(ext, StringComparer.OrdinalIgnoreCase) ||
              ImageExtensions.Contains(ext, StringComparer.OrdinalIgnoreCase)
            : ImageExtensions.Contains(ext, StringComparer.OrdinalIgnoreCase);
}
