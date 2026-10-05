using Microsoft.AspNetCore.Http;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;

namespace InternSystem.Infrastructure.Services;

/// <summary>
/// Centralized upload/file storage. Encodes the entire uploads directory layout
/// (assigned GUID names, fixed subfolders) and enforces size + content-type guards.
/// </summary>
public class FileService
{
    private const long DefaultMaxBytes = 10 * 1024 * 1024; // 10 MB
    private const long DocumentMaxBytes = 5 * 1024 * 1024;  // 5 MB (documents)

    private static readonly byte[] Jpeg = { 0xFF, 0xD8, 0xFF };
    private static readonly byte[] Png = { 0x89, 0x50, 0x4E, 0x47 };
    private static readonly byte[] Pdf = { 0x25, 0x50, 0x44, 0x46 };
    private static readonly byte[] Riff = { 0x52, 0x49, 0x46, 0x46 }; // "RIFF" (webp container)

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
        var bytes = await ReadValidatedBytes(file, DefaultMaxBytes, allowPdf: true);
        return await Write(bytes, subfolder);
    }

    public async Task<string> SaveDocumentAsync(IFormFile file, int internId, string docType)
    {
        var bytes = await ReadValidatedBytes(file, DocumentMaxBytes, allowPdf: true);
        var fileName = $"{Guid.NewGuid()}{SniffExt(bytes)}";
        var folder = Path.Combine(_uploadRoot, "documents", internId.ToString(), docType);
        Directory.CreateDirectory(folder);
        await File.WriteAllBytesAsync(Path.Combine(folder, fileName), bytes);
        return Path.Combine("documents", internId.ToString(), docType, fileName).Replace("\\", "/");
    }

    /// <summary>Resolves a stored relative path to a real path, refusing traversal/escapes.</summary>
    public string GetAbsolutePath(string relativePath)
    {
        var clean = (relativePath ?? "").Replace("\\", "/");
        if (Path.IsPathRooted(clean))
            return clean; // rooted paths are resolved directly by callers
        if (clean.Split('/', StringSplitOptions.RemoveEmptyEntries).Any(seg => seg == ".."))
            throw new InvalidOperationException("Path traversal is not allowed");
        return Path.Combine(_uploadRoot, clean);
    }

    /// <summary>
    /// Saves a base64-encoded image (data-URI or raw) under uploads/{subfolder} and
    /// returns the stored relative path. Used for face enrollment/verification selfies.
    /// </summary>
    public async Task<string> SaveBase64ImageAsync(string base64Image, string subfolder)
    {
        var clean = base64Image.Trim();
        var commaIndex = clean.IndexOf(',');
        if (commaIndex >= 0) clean = clean.Substring(commaIndex + 1);

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(clean);
        }
        catch (FormatException)
        {
            throw new InvalidOperationException("The uploaded image is not valid base64.");
        }

        if (bytes.Length == 0)
            throw new InvalidOperationException("The uploaded image is empty.");
        if (bytes.Length > DefaultMaxBytes)
            throw new InvalidOperationException($"Image exceeds the {DefaultMaxBytes / (1024 * 1024)} MB size limit.");
        if (!IsJpeg(bytes) && !IsPng(bytes) && !IsWebP(bytes))
            throw new InvalidOperationException("Uploaded file must be a JPEG/PNG/WebP image.");

        return await Write(bytes, subfolder);
    }

    /// <summary>
    /// Saves a base64 image (faces/selfies) plus a 256px max-dimension JPEG thumbnail
    /// alongside it. Returns the stored relative paths (full, thumb). The thumbnail is
    /// used for low-traffic avatars and list rows; the full-res file is kept for
    /// ID-card embedding and the photo viewer.
    /// </summary>
    public async Task<(string Full, string Thumb)> SaveBase64ImageWithThumbAsync(string base64Image, string subfolder)
    {
        var full = await SaveBase64ImageAsync(base64Image, subfolder);
        try
        {
            var absolute = GetAbsolutePath(full);
            var fileName = Path.GetFileNameWithoutExtension(absolute);
            var folder = Path.GetDirectoryName(absolute)!;
            var thumbPath = Path.Combine(folder, $"{fileName}-thumb.jpg");

            using (var image = SixLabors.ImageSharp.Image.Load(absolute))
            {
                var max = 256;
                if (image.Width <= max && image.Height <= max)
                {
                    image.SaveAsJpeg(thumbPath);
                }
                else
                {
                    var scale = max / (float)Math.Max(image.Width, image.Height);
                    image.Mutate(x => x.Resize(
                        Math.Max(1, (int)Math.Round(image.Width * scale)),
                        Math.Max(1, (int)Math.Round(image.Height * scale))));
                    image.SaveAsJpeg(thumbPath);
                }
            }

            var relativeDir = full.Substring(0, full.LastIndexOf('/'));
            return (full, $"{relativeDir}/{fileName}-thumb.jpg");
        }
        catch
        {
            return (full, full);
        }
    }

    /// <summary>
    /// Saves a department head's signature photo (jpg/png only) and returns the stored relative path.
    /// </summary>
    public async Task<string?> SaveSignatureAsync(IFormFile file, int headId)
    {
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext is not ".jpg" and not ".jpeg" and not ".png")
            throw new InvalidOperationException("Signature must be an image (jpg/png)");

        var bytes = await ReadValidatedBytes(file, DocumentMaxBytes, allowPdf: false);
        if (!IsJpeg(bytes) && !IsPng(bytes))
            throw new InvalidOperationException("Signature file content must be a JPEG/PNG image.");

        var fileName = $"head_{headId}{SafeExt(ext)}";
        var folder = Path.Combine(_uploadRoot, "signatures");
        var filePath = Path.Combine(folder, fileName);

        await File.WriteAllBytesAsync(filePath, bytes);

        return Path.Combine("signatures", fileName).Replace("\\", "/");
    }

    public void DeleteFile(string relativePath)
    {
        var fullPath = GetAbsolutePath(relativePath);
        if (File.Exists(fullPath)) File.Delete(fullPath);
    }

    private async Task<byte[]> ReadValidatedBytes(IFormFile file, long maxBytes, bool allowPdf)
    {
        if (file == null)
            throw new InvalidOperationException("A file is required.");
        if (file.Length == 0)
            throw new InvalidOperationException("The uploaded file is empty.");
        if (file.Length > maxBytes)
            throw new InvalidOperationException($"File exceeds the {maxBytes / (1024 * 1024)} MB size limit.");

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var bytes = ms.ToArray();

        if (!(IsJpeg(bytes) || IsPng(bytes) || IsWebP(bytes) || (allowPdf && IsPdf(bytes))))
            throw new InvalidOperationException("File type not allowed. Only JPEG/PNG/PDF files can be uploaded.");

        return bytes;
    }

    private async Task<string> Write(byte[] bytes, string subfolder)
    {
        var fileName = $"{Guid.NewGuid()}{SniffExt(bytes)}";
        var folder = Path.Combine(_uploadRoot, subfolder);
        Directory.CreateDirectory(folder);
        var filePath = Path.Combine(folder, fileName);
        await File.WriteAllBytesAsync(filePath, bytes);
        return Path.Combine(subfolder, fileName).Replace("\\", "/");
    }

    private static string SniffExt(byte[] b)
    {
        if (IsPdf(b)) return ".pdf";
        if (IsPng(b)) return ".png";
        if (IsJpeg(b) || IsWebP(b)) return ".jpg";
        return ".bin";
    }

    private static bool IsJpeg(byte[] b) => b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF;
    private static bool IsPng(byte[] b) => b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47;
    private static bool IsPdf(byte[] b) => b.Length >= 5 && b[0] == 0x25 && b[1] == 0x50 && b[2] == 0x44 && b[3] == 0x46;
    private static bool IsWebP(byte[] b) => b.Length >= 12
        && b[0] == Riff[0] && b[1] == Riff[1] && b[2] == Riff[2] && b[3] == Riff[3]
        && b[8] == (byte)'W' && b[9] == (byte)'E' && b[10] == (byte)'B' && b[11] == (byte)'P';

    private static string SafeExt(string? ext)
    {
        var e = (ext ?? "").ToLowerInvariant();
        if (e is ".jpg" or ".jpeg" or ".png" or ".pdf" or ".webp")
            return e;
        return ".jpg";
    }
}
