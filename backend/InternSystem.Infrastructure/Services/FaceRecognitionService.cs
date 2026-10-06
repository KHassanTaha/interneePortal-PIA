using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace InternSystem.Infrastructure.Services;

/// <summary>
/// Server-side deep face recognition pipeline.
///
/// Layers (all run on .NET ONNX; the phone only ships a live photo as base64):
///   1. UltraFace (RFB-320)            — face bounding-box detection.
///   2. MiniFASNetV2                   — passive anti-spoof (prints / screen replays).
///   3. FaceNet / ArcFace               — 512-d embedding, L2 normalized.
///   4. Cosine distance                  — match gate. Threshold comes from
///                                         configuration key
///                                         "FaceMatchThreshold" (default 0.58).
///
/// Security posture: FAIL-CLOSED. If a model is missing or an image fails to
/// parse, the check fails rather than silently passing. A client can never
/// submit a pre-computed embedding (JSON arrays are rejected as inputs).
/// </summary>
public class FaceRecognitionService : IDisposable
{
    private readonly ILogger<FaceRecognitionService> _logger;
    // Not readonly: assigned in LoadModels(), which the constructor delegates to.
    private InferenceSession? _arcFaceSession;
    private InferenceSession? _ultraFaceSession;
    private InferenceSession? _antiSpoofSession;
    private readonly string _modelDir;

    private int _inputWidth = 112;
    private int _inputHeight = 112;
    private string _inputName = "input";

    /// <summary>
    /// Fallback ArcFace cosine distance threshold, used only when the
    /// "FaceMatchThreshold" configuration key is absent or unreadable.
    /// </summary>
    public const double DefaultThreshold = 0.58;

    /// <summary>
    /// Fallback MiniFASNetV2 real-face score threshold, used only when the
    /// "SpoofThreshold" configuration key is absent or unreadable.
    /// </summary>
    public const double DefaultSpoofThreshold = 0.60;

    /// <summary>Effective ArcFace cosine distance gate (1.0 - cosine similarity).</summary>
    public double MatchThreshold { get; }

    /// <summary>Effective MiniFASNetV2 real-face score gate (score >= this = live face).</summary>
    public double SpoofThreshold { get; }

    public FaceRecognitionService(
        ILogger<FaceRecognitionService> logger,
        string modelDir,
        IConfiguration? configuration = null)
    {
        _logger = logger;
        _modelDir = modelDir;

        // Security gates are configuration-driven so they can be tuned without a
        // code change. The code previously hardcoded a MORE PERMISSIVE match gate
        // (0.70) and a LOOSER anti-spoof gate (0.40) than the documented values,
        // while an unused "FaceMatchThreshold": 0.58 sat in appsettings.json.
        // See DECISIONS_LOG.md D-S26.
        MatchThreshold = ReadThreshold(configuration, "FaceMatchThreshold", DefaultThreshold, "match");
        SpoofThreshold = ReadThreshold(configuration, "SpoofThreshold", DefaultSpoofThreshold, "anti-spoof");
        _logger.LogWarning(
            "Face thresholds in effect: match <= {MatchThreshold:F4}, anti-spoof >= {SpoofThreshold:F4}",
            MatchThreshold, SpoofThreshold);

        LoadModels();
    }

    /// <summary>
    /// Reads a threshold from configuration, falling back to the documented default.
    /// A missing key is not an error; an unreadable or out-of-range value IS, because
    /// silently accepting it would widen a security gate without anyone noticing.
    /// </summary>
    private static double ReadThreshold(IConfiguration? configuration, string key, double fallback, string label)
    {
        var raw = configuration?[key];
        if (string.IsNullOrWhiteSpace(raw))
            return fallback;

        if (!double.TryParse(raw, System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var value))
            throw new InvalidOperationException(
                $"Configuration key '{key}' is not a valid number (value: '{raw}'). Refusing to start with an unreadable {label} threshold.");

        // Both gates are cosine distances / normalised scores in [0, 1]. A value
        // outside that range is a configuration error, not a tuning choice.
        if (value < 0.0 || value > 1.0)
            throw new InvalidOperationException(
                $"Configuration key '{key}' must be between 0 and 1 (value: {value}). Refusing to start with an out-of-range {label} threshold.");

        return value;
    }

    /// <summary>Loads the three ONNX sessions. Separate from the constructor body above.</summary>
    private void LoadModels()
    {
        var arcFacePath = Path.Combine(_modelDir, "facenet.onnx");
        var ultraFacePath = Path.Combine(_modelDir, "ultraface.onnx");
        var antiSpoofPath = Path.Combine(_modelDir, "antispoof.onnx");

        try
        {
            if (File.Exists(arcFacePath))
            {
                _arcFaceSession = new InferenceSession(arcFacePath, Options());
                var firstInput = _arcFaceSession.InputMetadata.First();
                _inputName = firstInput.Key;
                var dims = firstInput.Value.Dimensions;
                if (dims.Length == 4)
                {
                    _inputHeight = dims[2] > 0 ? dims[2] : 112;
                    _inputWidth = dims[3] > 0 ? dims[3] : 112;
                }
                _logger.LogInformation("FaceNet ONNX model loaded ({Path}) {W}x{H}", arcFacePath, _inputWidth, _inputHeight);
            }
            else
            {
                _logger.LogWarning("FaceNet ONNX model NOT found at {Path} — face verification will be unavailable.", arcFacePath);
            }

            if (File.Exists(ultraFacePath))
            {
                _ultraFaceSession = new InferenceSession(ultraFacePath, Options());
                _logger.LogInformation("UltraFace ONNX model loaded ({Path})", ultraFacePath);
            }
            else
            {
                _logger.LogWarning("UltraFace ONNX model NOT found at {Path} — detection will fall back to center crop.", ultraFacePath);
            }

            if (File.Exists(antiSpoofPath))
            {
                _antiSpoofSession = new InferenceSession(antiSpoofPath, Options());
                _logger.LogInformation("MiniFASNetV2 anti-spoof ONNX model loaded ({Path})", antiSpoofPath);
            }
            else
            {
                _logger.LogWarning("AntiSpoof ONNX model NOT found at {Path} — passive anti-spoofing will REJECT submissions.", antiSpoofPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize ONNX inference sessions for {Path}", _modelDir);
        }
    }

    private static SessionOptions Options() => new()
    {
        GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL,
        ExecutionMode = ExecutionMode.ORT_SEQUENTIAL
    };

    /// <summary>
    /// Passive anti-spoofing check on a base64 image. FAIL-CLOSED:
    /// missing model, unparseable input, or a JSON-array descriptor all fail.
    /// Also requires a real face to be detected in the image.
    /// </summary>
    public (bool IsReal, double RealScore) CheckAntiSpoof(string base64OrRaw)
    {
        if (string.IsNullOrWhiteSpace(base64OrRaw))
            return (false, 0.0);

        var trimmed = base64OrRaw.Trim();

        // A pre-computed embedding is NOT a live photo — reject it.
        if (trimmed.StartsWith("["))
            return (false, 0.0);

        if (_antiSpoofSession == null)
        {
            _logger.LogWarning("AntiSpoof model not loaded — passive anti-spoof checks are failing closed.");
            return (false, 0.0);
        }

        try
        {
            var cleanBase64 = trimmed;
            var commaIndex = cleanBase64.IndexOf(',');
            if (commaIndex >= 0)
                cleanBase64 = cleanBase64.Substring(commaIndex + 1);

            byte[] imageBytes;
            try
            {
                imageBytes = Convert.FromBase64String(cleanBase64);
            }
            catch (FormatException ex)
            {
                _logger.LogWarning(ex, "AntiSpool: input is not valid base64 — rejected.");
                return (false, 0.0);
            }

            return CheckAntiSpoofFromBytes(imageBytes);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Anti-spoofing check failed to parse image — rejected.");
            return (false, 0.0);
        }
    }

    /// <summary>
    /// MiniFASNet inference. Requires a face bounding box; if none is detected the
    /// image is rejected (a valid live-face selfie must contain a detectable face).
    /// </summary>
    public (bool IsReal, double RealScore) CheckAntiSpoofFromBytes(byte[] imageBytes)
    {
        if (_antiSpoofSession == null)
            return (false, 0.0);

        try
        {
            using var image = Image.Load<Rgb24>(imageBytes);

            var faceRect = DetectFaceBoundingBox(image);
            if (faceRect.HasValue)
            {
                // Canonical MiniFASNet preprocessing: expand the detected face box by the
                // model's scale factor (2.7 for 2.7_80x80_MiniFASNetV2), center-anchored and
                // clamped to the image bounds, then feed the 80x80 crop. A tight face-only
                // crop makes real photos look like a zoomed replay attack to this model.
                image.Mutate(ctx => ctx.Crop(ExpandBoxForMiniFAS(image.Width, image.Height, faceRect.Value, 2.7)));
            }
            else
            {
                // No face in frame — cannot be a genuine attendance selfie.
                return (false, 0.0);
            }

            if (image.Width < 16 || image.Height < 16)
                return (false, 0.0);

            // MiniFASNet standard input: 80x80 BGR.
            image.Mutate(ctx => ctx.Resize(80, 80));

            var tensor = new DenseTensor<float>(new[] { 1, 3, 80, 80 });
            for (int y = 0; y < 80; y++)
            {
                for (int x = 0; x < 80; x++)
                {
                    var p = image[x, y];
                    tensor[0, 0, y, x] = p.B;
                    tensor[0, 1, y, x] = p.G;
                    tensor[0, 2, y, x] = p.R;
                }
            }

            var inputName = _antiSpoofSession.InputMetadata.Keys.First();
            var inputs = new List<NamedOnnxValue> { NamedOnnxValue.CreateFromTensor(inputName, tensor) };
            using var results = _antiSpoofSession.Run(inputs);

            var output = results.First().AsTensor<float>().ToArray();
            double maxVal = output.Max();
            double[] exp = output.Select(v => Math.Exp(v - maxVal)).ToArray();
            double sum = exp.Sum();
            double realScore = exp.Length > 1 ? (exp[1] / sum) : 0.0;

            bool isReal = realScore >= SpoofThreshold;
            _logger.LogWarning("Anti-spoof debug: realScore={RealScore:F4} isReal={IsReal} faceRect={FaceRect} imageBytes={Bytes}", realScore, isReal, faceRect, imageBytes.Length);
            try
            {
                var dir = "/tmp/opencode/rejected";
                Directory.CreateDirectory(dir);
                File.WriteAllBytes(Path.Combine(dir, $"check_{DateTime.Now:HHmmssfff}.jpg"), imageBytes);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Could not save check image"); }
            return (isReal, realScore);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Passive anti-spoofing inference error — rejected.");
            return (false, 0.0);
        }
    }

    /// <summary>
    /// Extracts the 512-d L2-normalized embedding from an image.
    /// JSON-array descriptors are NOT accepted as input (clients must send a photo).
    /// </summary>
    public float[] ExtractEmbedding(string base64Image)
    {
        if (string.IsNullOrWhiteSpace(base64Image))
            throw new ArgumentException("Image data cannot be empty");

        var trimmed = base64Image.Trim();
        if (trimmed.StartsWith("["))
            throw new InvalidOperationException("Pre-computed embedding arrays are not accepted. Submit a live photo.");

        var cleanBase64 = trimmed;
        var commaIndex = cleanBase64.IndexOf(',');
        if (commaIndex >= 0)
            cleanBase64 = cleanBase64.Substring(commaIndex + 1);

        byte[] imageBytes;
        try
        {
            imageBytes = Convert.FromBase64String(cleanBase64);
        }
        catch (FormatException ex)
        {
            throw new InvalidOperationException("Image is not valid base64.", ex);
        }

        return ExtractEmbeddingFromBytes(imageBytes);
    }

    /// <summary>Extracts the embedding from raw image bytes.</summary>
    public float[] ExtractEmbeddingFromBytes(byte[] imageBytes)
    {
        if (_arcFaceSession == null)
            throw new InvalidOperationException("FaceNet ONNX model is not loaded");

        using var image = Image.Load<Rgb24>(imageBytes);

        var faceRect = DetectFaceBoundingBox(image);
        if (faceRect.HasValue)
        {
            image.Mutate(ctx => ctx.Crop(faceRect.Value));
        }
        else
        {
            // No face detected — a valid enrollment/verification frame must contain one.
            throw new InvalidOperationException("No face detected in the submitted image.");
        }

        image.Mutate(ctx => ctx.Resize(new ResizeOptions
        {
            Size = new Size(_inputWidth, _inputHeight),
            Mode = ResizeMode.Crop
        }));

        // ArcFace / FaceNet standard normalization: (pixel - 127.5) / 127.5 -> [-1, 1].
        var tensor = new DenseTensor<float>(new[] { 1, 3, _inputHeight, _inputWidth });
        for (int y = 0; y < _inputHeight; y++)
        {
            for (int x = 0; x < _inputWidth; x++)
            {
                var pixel = image[x, y];
                tensor[0, 0, y, x] = (pixel.R - 127.5f) / 127.5f;
                tensor[0, 1, y, x] = (pixel.G - 127.5f) / 127.5f;
                tensor[0, 2, y, x] = (pixel.B - 127.5f) / 127.5f;
            }
        }

        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor(_inputName, tensor)
        };

        using var results = _arcFaceSession.Run(inputs);
        var outputTensor = results.First().AsTensor<float>();
        var embedding = outputTensor.ToArray();

        return NormalizeL2(embedding);
    }

    /// <summary>
    /// Compares two embeddings using cosine distance (1.0 - cosine similarity).
    /// </summary>
    public (bool IsMatch, double Distance, double Similarity) Compare(
        float[] emb1, float[] emb2, double? threshold = null)
    {
        if (emb1 == null || emb2 == null || emb1.Length != emb2.Length)
            return (false, 1.0, 0.0);

        double dot = 0, norm1 = 0, norm2 = 0;
        for (int i = 0; i < emb1.Length; i++)
        {
            dot += emb1[i] * emb2[i];
            norm1 += emb1[i] * emb1[i];
            norm2 += emb2[i] * emb2[i];
        }

        double similarity = dot / (Math.Sqrt(norm1) * Math.Sqrt(norm2) + 1e-10);
        double distance = 1.0 - similarity;
        bool isMatch = distance <= (threshold ?? MatchThreshold);
        return (isMatch, distance, similarity);
    }

    /// <summary>Expands a face box by the MiniFASNet scale factor, center-anchored and
    /// clamped to image bounds, mirroring minivision's <c>_get_new_box</c>.</summary>
    private static Rectangle ExpandBoxForMiniFAS(int srcW, int srcH, Rectangle box, double scale)
    {
        double x = box.X, y = box.Y, boxW = box.Width, boxH = box.Height;
        scale = Math.Min((srcH - 1.0) / boxH, Math.Min((srcW - 1.0) / boxW, scale));

        double newW = boxW * scale, newH = boxH * scale;
        double cx = boxW / 2 + x, cy = boxH / 2 + y;
        double ltx = cx - newW / 2, lty = cy - newH / 2;
        double rbx = cx + newW / 2, rby = cy + newH / 2;

        if (ltx < 0) { rbx -= ltx; ltx = 0; }
        if (lty < 0) { rby -= lty; lty = 0; }
        if (rbx > srcW - 1) { ltx -= rbx - srcW + 1; rbx = srcW - 1; }
        if (rby > srcH - 1) { lty -= rby - srcH + 1; rby = srcH - 1; }

        return new Rectangle((int)ltx, (int)lty, (int)(rbx - ltx), (int)(rby - lty));
    }

    /// <summary>Detects the strongest face box via UltraFace, or null to signal absence.</summary>
    private Rectangle? DetectFaceBoundingBox(Image<Rgb24> image)
    {
        if (_ultraFaceSession == null) return null;

        try
        {
            using var clone = image.Clone();
            clone.Mutate(ctx => ctx.Resize(320, 240));

            var tensor = new DenseTensor<float>(new[] { 1, 3, 240, 320 });
            for (int y = 0; y < 240; y++)
            {
                for (int x = 0; x < 320; x++)
                {
                    var p = clone[x, y];
                    tensor[0, 0, y, x] = (p.R - 127.0f) / 128.0f;
                    tensor[0, 1, y, x] = (p.G - 127.0f) / 128.0f;
                    tensor[0, 2, y, x] = (p.B - 127.0f) / 128.0f;
                }
            }

            var inputName = _ultraFaceSession.InputMetadata.Keys.First();
            var inputs = new List<NamedOnnxValue> { NamedOnnxValue.CreateFromTensor(inputName, tensor) };
            using var results = _ultraFaceSession.Run(inputs);

            var scores = results.ElementAt(0).AsTensor<float>();
            var boxes = results.ElementAt(1).AsTensor<float>();

            int bestIdx = -1;
            float bestScore = 0.7f;

            int numBoxes = scores.Dimensions[1];
            for (int i = 0; i < numBoxes; i++)
            {
                float faceScore = scores[0, i, 1];
                if (faceScore > bestScore)
                {
                    bestScore = faceScore;
                    bestIdx = i;
                }
            }

            if (bestIdx >= 0)
            {
                float x1 = Math.Max(0, boxes[0, bestIdx, 0]) * image.Width;
                float y1 = Math.Max(0, boxes[0, bestIdx, 1]) * image.Height;
                float x2 = Math.Min(1, boxes[0, bestIdx, 2]) * image.Width;
                float y2 = Math.Min(1, boxes[0, bestIdx, 3]) * image.Height;

                float padW = (x2 - x1) * 0.15f;
                float padH = (y2 - y1) * 0.15f;

                int rx = (int)Math.Max(0, x1 - padW);
                int ry = (int)Math.Max(0, y1 - padH);
                int rw = (int)Math.Min(image.Width - rx, (x2 - x1) + padW * 2);
                int rh = (int)Math.Min(image.Height - ry, (y2 - y1) + padH * 2);

                if (rw > 20 && rh > 20)
                    return new Rectangle(rx, ry, rw, rh);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "UltraFace detection error");
        }

        return null;
    }

    private static float[] NormalizeL2(float[] v)
    {
        double sumSq = 0;
        for (int i = 0; i < v.Length; i++) sumSq += v[i] * v[i];
        double norm = Math.Sqrt(sumSq);
        if (norm > 1e-10)
        {
            for (int i = 0; i < v.Length; i++) v[i] = (float)(v[i] / norm);
        }
        return v;
    }

    public void Dispose()
    {
        _arcFaceSession?.Dispose();
        _ultraFaceSession?.Dispose();
        _antiSpoofSession?.Dispose();
    }
}