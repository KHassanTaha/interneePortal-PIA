using Microsoft.AspNetCore.Http;

namespace InternSystem.Infrastructure.Services;

public class FileService
{
    private readonly string _uploadRoot;

    public FileService(string uploadRoot)
    {
        _uploadRoot = uploadRoot;
        Directory.CreateDirectory(uploadRoot);
        Directory.CreateDirectory(Path.Combine(uploadRoot, "gatepasses"));
        Directory.CreateDirectory(Path.Combine(uploadRoot, "idcards"));
        Directory.CreateDirectory(Path.Combine(uploadRoot, "certificates"));
        Directory.CreateDirectory(Path.Combine(uploadRoot, "pdfs"));
        Directory.CreateDirectory(Path.Combine(uploadRoot, "faces"));
        Directory.CreateDirectory(Path.Combine(uploadRoot, "signatures"));
    }

    public async Task<string> SaveFileAsync(IFormFile file, string subfolder)
    {
        var fileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
        var folder = Path.Combine(_uploadRoot, subfolder);
        Directory.CreateDirectory(folder);
        var filePath = Path.Combine(folder, fileName);

        using var stream = new FileStream(filePath, FileMode.Create);
        await file.CopyToAsync(stream);

        return Path.Combine(subfolder, fileName).Replace("\\", "/");
    }

    public async Task<string> SaveDocumentAsync(IFormFile file, int internId, string docType)
    {
        var fileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
        var folder = Path.Combine(_uploadRoot, "documents", internId.ToString(), docType);
        Directory.CreateDirectory(folder);
        var filePath = Path.Combine(folder, fileName);

        using var stream = new FileStream(filePath, FileMode.Create);
        await file.CopyToAsync(stream);

        return Path.Combine("documents", internId.ToString(), docType, fileName).Replace("\\", "/");
    }

    public string GetAbsolutePath(string relativePath) =>
        Path.Combine(_uploadRoot, relativePath.Replace("/", "\\"));

    /// <summary>
    /// Saves a department head's signature photo (jpg/png only) and returns the stored relative path.
    /// </summary>
    public async Task<string?> SaveSignatureAsync(IFormFile file, int headId)
    {
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext is not ".jpg" and not ".jpeg" and not ".png")
            throw new InvalidOperationException("Signature must be an image (jpg/png)");

        var fileName = $"head_{headId}{ext}";
        var folder = Path.Combine(_uploadRoot, "signatures");
        var filePath = Path.Combine(folder, fileName);

        using var stream = new FileStream(filePath, FileMode.Create);
        await file.CopyToAsync(stream);

        return Path.Combine("signatures", fileName).Replace("\\", "/");
    }

    public void DeleteFile(string relativePath)
    {
        var fullPath = GetAbsolutePath(relativePath);
        if (File.Exists(fullPath)) File.Delete(fullPath);
    }
}
