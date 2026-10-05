using System.Diagnostics;
using System.Net;
using System.Text;
using InternSystem.Core.Entities;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace InternSystem.Infrastructure.Services;

public sealed record CertificateTransferSection(string FromMentor, string FromDepartment, string ToMentor, string ToDepartment, DateTime? When);

public class PdfService
{
    private readonly string _uploadRoot;
    private readonly string _templateDir;

    public PdfService(string uploadRoot)
    {
        _uploadRoot = uploadRoot;
        _templateDir = Path.Combine(AppContext.BaseDirectory, "Templates", "Certificates");
        QuestPDF.Settings.License = LicenseType.Community;
    }

    /// <summary>
    /// Generates a PIA-style Gate Pass letter PDF for a single intern (same format as the batch letter).
    /// </summary>
    public string GenerateGatePassPdf(GatePass gatePass, Intern intern, Mentor mentor, Department department, DepartmentHead? head = null)
    {
        return GenerateGatePassBatchPdf(new List<Intern> { intern }, department, mentor, head,
            documentId: $"PIA/GP/{gatePass.Id:0000}")[0];
    }

    /// <summary>
    /// Generates a PIA-style Gate Pass letter PDF covering multiple interns.
    /// Interns are chunked so each letter fits one A4 page (normal margins).
    /// Each chunk produces one PDF; the returned list maps 1:1 to the chunks.
    /// The letter is signed by the department head (signature image + name + designation)
    /// and shows the mentor's designation as supervisor.
    /// </summary>
    public const int GatePassBatchPageSize = 7;

    public List<string> GenerateGatePassBatchPdf(List<Intern> interns, Department department, Mentor mentor, DepartmentHead? head, string? documentId = null, string? batchRef = null)
    {
        var paths = new List<string>();
        var startDate = interns.Min(i => i.StartDate);
        var endDate = interns.Max(i => i.EndDate);

        for (int start = 0; start < interns.Count; start += GatePassBatchPageSize)
        {
            var chunk = interns.Skip(start).Take(GatePassBatchPageSize).ToList();
            var date = DateTime.Now.ToString("yyyyMMdd");
            var deptCode = string.IsNullOrWhiteSpace(department.Code) ? "NA" : department.Code;
            var pageOf = $"{start / GatePassBatchPageSize + 1}of{(int)Math.Ceiling(interns.Count / (double)GatePassBatchPageSize)}";
            string fileName;
            if (chunk.Count == 1)
            {
                // Single-intern letter: readable name + dept + date + GP id (from PIA/GP/{id:0000}).
                var uid = Slugify(chunk[0].FullName);
                var gpId = ExtractDocId(documentId) ?? batchRef ?? "NA";
                fileName = $"GatePass-{uid}-{deptCode}-{date}-{gpId}.pdf";
            }
            else
            {
                // Shared batch letter (one PDF per page, same PdfPath on several rows).
                var uid = Slugify(chunk[0].FullName);
                var batchId = batchRef ?? "BATCH";
                fileName = $"GatePass-Batch-{uid}-{deptCode}-{date}-{batchId}-{pageOf}.pdf";
            }
            var pdfPath = Path.Combine(_uploadRoot, "pdfs", fileName);
            Directory.CreateDirectory(Path.GetDirectoryName(pdfPath)!);
            var fallbackDocId = $"PIA/GP/BATCH-{deptCode}-{DateTime.Now:yyyyMMdd}";

            var document = Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(40);

                    page.Content().Column(col =>
                    {
                        col.Spacing(7);

                        col.Item().AlignRight().Text(date).FontSize(11);

                        col.Item().PaddingTop(10).Text("To").Bold().FontSize(11);
                        col.Item().Text("The Security Incharge").FontSize(11);
                        col.Item().Text("PIA Head Office").FontSize(11);

                        col.Item().PaddingTop(10).Text("Subject: Permission for Entry of Internship Students")
                            .Bold().FontSize(11);

                        col.Item().PaddingTop(5).Text("Dear Sir/Madam,").FontSize(11);

                        col.Item().PaddingTop(5).Text(text =>
                        {
                            text.Span("We are pleased to inform you that the following students will be undertaking their internship in the ").FontSize(11);
                            text.Span(department.Name).Bold().FontSize(11);
                            text.Span(" at PIA Head Office:").FontSize(11);
                        });

                        col.Item().PaddingTop(8).Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.ConstantColumn(50);
                                columns.RelativeColumn(3);
                                columns.RelativeColumn(2);
                            });

                            table.Header(header =>
                            {
                                header.Cell().Border(1).Padding(4).Text("S.NO").Bold().FontSize(10);
                                header.Cell().Border(1).Padding(4).Text("Student Name").Bold().FontSize(10);
                                header.Cell().Border(1).Padding(4).Text("CNIC Number").Bold().FontSize(10);
                            });

                            for (int i = 0; i < chunk.Count; i++)
                            {
                                table.Cell().Border(1).Padding(4).Text((start + i + 1).ToString()).FontSize(10);
                                table.Cell().Border(1).Padding(4).Text(chunk[i].FullName).FontSize(10);
                                table.Cell().Border(1).Padding(4).Text(chunk[i].CNIC ?? "—").FontSize(10);
                            }
                        });

                        col.Item().PaddingTop(15).Text(text =>
                        {
                            text.Span("These students will be ").FontSize(11);
                            text.Span("undertaking an internship").Bold().Underline().FontSize(11);
                            text.Span(" under the supervision of the ").FontSize(11);
                            text.Span(mentor.Designation).Bold().FontSize(11);
                            text.Span(" in the ").FontSize(11);
                            text.Span(department.Name).Bold().FontSize(11);
                            text.Span($" from ").FontSize(11);
                            text.Span(startDate.ToString("dd MMM yyyy")).Bold().FontSize(11);
                            text.Span(" to ").FontSize(11);
                            text.Span(endDate.ToString("dd MMM yyyy")).Bold().FontSize(11);
                            text.Span(".").FontSize(11);
                        });

                        col.Item().PaddingTop(10).Text("Their presence is authorized for the purpose of gaining practical experience within our organization.").FontSize(11);

                        col.Item().PaddingTop(10).Text("We kindly request you to grant them access permission and ensure that their entry and exit are recorded in accordance with the organization's security policies.").FontSize(11);

                        col.Item().PaddingTop(10).Text("Thank you for your cooperation.").FontSize(11);

                        // This letter is system generated; no signature or approver block.
                        col.Item().PaddingTop(24).Text("This is a system generated document. It does not require a signature.").Italic().FontSize(10).FontColor("#6B7280");
                    });

                    page.Footer().Row(footer =>
                    {
                        footer.RelativeItem().AlignLeft().Text(string.IsNullOrWhiteSpace(documentId) ? fallbackDocId : documentId)
                            .FontSize(8).FontColor("#9CA3AF");
                        footer.RelativeItem().AlignRight().Text(text =>
                        {
                            text.Span("Page ").FontSize(9);
                            text.CurrentPageNumber().FontSize(9);
                            text.Span(" of ").FontSize(9);
                            text.TotalPages().FontSize(9);
                        });
                    });
                });
            });

            document.GeneratePdf(pdfPath);
            paths.Add(Path.Combine("pdfs", fileName).Replace("\\", "/"));
        }

        return paths;
    }

    /// <summary>
    /// Generates a PIA-style Internship Certificate PDF from an HTML template.
    /// Male and female interns get their own template file (wording/pronouns differ).
    /// The certificate is signed by the department head's signature photo when
    /// signatures are required (SignatureRequired setting).
    /// </summary>
    public string GenerateCertificatePdf(Certificate certificate, Intern intern, Department department, DepartmentHead head, bool signatureRequired = true, IReadOnlyList<CertificateTransferSection>? transfers = null)
    {
        var fileName = $"Certificate-{Slugify(intern.FullName)}-{(string.IsNullOrWhiteSpace(department.Code) ? "NA" : department.Code)}-{DateTime.Now:yyyyMMdd}-{certificate.Id:0000}.pdf";
        var pdfPath = Path.Combine(_uploadRoot, "pdfs", fileName);
        Directory.CreateDirectory(Path.GetDirectoryName(pdfPath)!);

        var templateName = (intern.Gender ?? InternGender.Male) == InternGender.Female
            ? "certificate_female.html"
            : "certificate_male.html";
        var templatePath = Path.Combine(_templateDir, templateName);
        if (!File.Exists(templatePath))
            throw new InvalidOperationException($"Certificate template '{templateName}' not found at {templatePath}");

        var weeks = Math.Max(1, (int)Math.Round((intern.EndDate - intern.StartDate).TotalDays / 7));
        var techStack = string.IsNullOrWhiteSpace(certificate.TechStack) ? certificate.LanguagesUsed : certificate.TechStack;
        var internWork = string.IsNullOrWhiteSpace(certificate.InternWork) ? certificate.MentorProjectNotes : certificate.InternWork;
        // head may be null for system-approved certificates (AdminController passes null);
        // fall back to the department head name stored on the certificate.
        var headName = head?.Name ?? certificate.DepartmentHeadName ?? "System Generated";
        var headDesignation = head?.Designation ?? "System Generated";

        var html = File.ReadAllText(templatePath)
            .Replace("{{FullName}}", Escape(intern.FullName))
            .Replace("{{Degree}}", Escape(intern.Degree ?? "Bachelor of Computer Science"))
            .Replace("{{University}}", Escape(intern.University ?? "University"))
            .Replace("{{WeeksWords}}", $"{NumberToWords(weeks)} Weeks")
            .Replace("{{StartDate}}", OrdinalDate(intern.StartDate))
            .Replace("{{EndDate}}", OrdinalDate(intern.EndDate))
            .Replace("{{Department}}", Escape(department.Name))
            .Replace("{{ProjectName}}", Escape(certificate.ProjectName ?? "official projects"))
            .Replace("{{TechStack}}", Escape(techStack ?? "various technologies"))
            .Replace("{{InternWork}}", Escape(internWork ?? "—"))
            .Replace("{{Outcomes}}", Escape(certificate.ProjectOutcomes ?? "—"))
            .Replace("{{HeadName}}", Escape(headName))
            .Replace("{{HeadDesignation}}", Escape(headDesignation))
            .Replace("{{RefNo}}", $"PIA/INT-{certificate.Id}/{DateTime.Now.Year}")
            .Replace("{{Date}}", $"{OrdinalDay(DateTime.Now.Day)} {DateTime.Now:MMMM, yyyy}");

        // One "Transfer History" section per finalised intern transfer.
        if (transfers is { Count: > 0 })
        {
            var sb = new StringBuilder();
            sb.Append("<div class=\"th-title\">Transfer History</div>");
            foreach (var t in transfers)
            {
                sb.Append("<div class=\"th-item\"><div class=\"th-line\">");
                sb.Append($"<span class=\"th-side\">From {Escape(t.FromMentor)}{(string.IsNullOrWhiteSpace(t.FromDepartment) ? "" : $" — {Escape(t.FromDepartment)}")}</span>");
                sb.Append("<span class=\"th-arrow\">→</span>");
                sb.Append($"<span class=\"th-side\">To {Escape(t.ToMentor)}{(string.IsNullOrWhiteSpace(t.ToDepartment) ? "" : $" — {Escape(t.ToDepartment)}")}</span>");
                sb.Append("</div><div class=\"th-date\">Transferred on ");
                sb.Append(t.When.HasValue ? OrdinalDate(t.When.Value) : "—");
                sb.Append("</div></div>");
            }
            html = html.Replace("<!--TransferHistory-->", sb.ToString());
        }
        else
        {
            html = html.Replace("<!--TransferHistory-->", string.Empty);
        }

        // Inline every image as a base64 data-URI so wkhtmltopdf runs WITHOUT
        // --enable-local-file-access (no attacker-controlled local file reads).
        html = InlineTemplateImage(html, "header.png", Path.Combine(_templateDir, "header.png"));
        html = InlineTemplateImage(html, "logo.png", Path.Combine(_templateDir, "logo.png"));

        if (!signatureRequired)
        {
            html = html.Replace("<img src=\"{{HeadSignature}}\"", "<img src=\"data:image/png;base64,iVBORw0KGgo=\" alt=\"signature\"");
            html = html.Replace("{{HeadSignature}}", string.Empty);
        }
        else if (head != null && !string.IsNullOrEmpty(head.SignatureImagePath))
        {
            var sigSrc = Path.Combine(_uploadRoot, head.SignatureImagePath.Replace("\\", "/"));
            var fi = new FileInfo(sigSrc);
            if (fi.Exists && fi.Length > 0)
                html = html.Replace("{{HeadSignature}}", DataUri(fi));
            else
                html = html.Replace("{{HeadSignature}}", string.Empty);
        }
        else
        {
            html = html.Replace("{{HeadSignature}}", string.Empty);
        }

        // Stage the HTML (images are inline data-URIs) in a private temp dir.
        var tmpDir = Path.Combine(_uploadRoot, "tmp");
        Directory.CreateDirectory(tmpDir);
        var tmpHtml = Path.Combine(tmpDir, $"{Guid.NewGuid():N}.html");
        File.WriteAllText(tmpHtml, html);

        var psi = new ProcessStartInfo
        {
            FileName = "wkhtmltopdf",
            Arguments = $"--page-size A4 --margin-top 0 --margin-right 0 --margin-bottom 0 --margin-left 0 \"{tmpHtml}\" \"{pdfPath}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        using var proc = Process.Start(psi)!;
        var stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();
        try { if (File.Exists(tmpHtml)) File.Delete(tmpHtml); } catch { }

        if (proc.ExitCode != 0 || !File.Exists(pdfPath))
            throw new InvalidOperationException($"wkhtmltopdf failed: {stderr}");

        return Path.Combine("pdfs", fileName).Replace("\\", "/");
    }

    /// <summary>
    /// Generates a PIA-style company ID card PDF for an intern.
    /// Uses the intern's uploaded photo when available, otherwise an initials placeholder.
    /// Signed off by the issuing mentor.
    /// </summary>
    public string GenerateIdCardPdf(IdCardRequest request, Intern intern, Department department, Mentor mentor)
    {
        var fileName = $"IDCard-{Slugify(intern.FullName)}-{(string.IsNullOrWhiteSpace(department.Code) ? "NA" : department.Code)}-{DateTime.Now:yyyyMMdd}-{request.Id:0000}.pdf";
        var pdfPath = Path.Combine(_uploadRoot, "pdfs", fileName);
        Directory.CreateDirectory(Path.GetDirectoryName(pdfPath)!);

        // Prefer the latest enrollment selfie with a photo, then the request photo, else initials.
        // Note: face approval appends a new Approved record without the photo and leaves the
        // selfie record Pending, so selection keys on "has PhotoPath" (gated by the intern's
        // Approved face status upstream) — the same selector the profile avatar uses.
        var enrolledPhoto = intern.FaceEnrollmentRecords
            ?.Where(r => !string.IsNullOrWhiteSpace(r.PhotoPath))
            .OrderByDescending(r => r.EnrolledAt)
            .Select(r => r.PhotoPath)
            .FirstOrDefault();
        var photoSrc = !string.IsNullOrEmpty(enrolledPhoto)
            ? Path.Combine(_uploadRoot, enrolledPhoto!.Replace("\\", "/"))
            : !string.IsNullOrEmpty(request.PhotoImagePath)
                ? Path.Combine(_uploadRoot, request.PhotoImagePath.Replace("\\", "/"))
                : null;
        var hasPhoto = photoSrc != null
            && File.Exists(photoSrc)
            && new FileInfo(photoSrc).Length > 0;

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(40);

                page.Header().Element(ComposeHeader);

                page.Content().Column(col =>
                {
                    col.Spacing(12);

                    col.Item().PaddingTop(8).Text("COMPANY ID CARD").Bold().FontSize(12).FontColor("#006633");

                    // Card body
col.Item().Border(2).BorderColor("#006633").Background("#FFFFFF").Padding(16).Row(row =>
                        {
                            row.ConstantItem(110).AlignCenter().AlignMiddle().Height(130).Column(photo =>
                            {
                                if (hasPhoto)
                                {
                                    photo.Item().Width(100).Height(124).AlignLeft().Image(photoSrc!).FitArea();
                                }
                            else
                            {
                                photo.Item().Width(100).Height(124).Background("#006633").AlignCenter().AlignMiddle().Text(
                                    text => text.Span($"{intern.FullName[0].ToString().ToUpper()}").FontColor("#FFFFFF").FontSize(44).Bold());
                            }
                        });

                        row.RelativeItem().PaddingLeft(16).Column(details =>
                        {
                            details.Item().Text("EMPLOYEE IDENTIFICATION").Bold().FontSize(9).FontColor("#8B6914");
                            details.Item().PaddingTop(6).Text(intern.FullName).Bold().FontSize(18).FontColor("#004d26");
                            details.Item().Text("Intern").FontSize(11);
                            details.Item().PaddingTop(8).Row(f =>
                            {
                                f.RelativeItem().Column(left =>
                                {
                                    left.Item().Text("CNIC").Bold().FontSize(8).FontColor("#64748b");
                                    left.Item().Text(intern.CNIC ?? "—").FontSize(11);
                                });
                                f.RelativeItem().Column(right =>
                                {
                                    right.Item().Text("Department").Bold().FontSize(8).FontColor("#64748b");
                                    right.Item().Text(department.Name).FontSize(11);
                                });
                            });
                            details.Item().PaddingTop(8).Row(f =>
                            {
                                f.RelativeItem().Column(left =>
                                {
                                    left.Item().Text("Valid From").Bold().FontSize(8).FontColor("#64748b");
                                    left.Item().Text(intern.StartDate.ToString("dd MMM yyyy")).FontSize(11);
                                });
                                f.RelativeItem().Column(right =>
                                {
                                    right.Item().Text("Valid To").Bold().FontSize(8).FontColor("#64748b");
                                    right.Item().Text(intern.EndDate.ToString("dd MMM yyyy")).FontSize(11);
                                });
                            });
                            details.Item().PaddingTop(8).Text("Card No: PIA/INT-" + request.Id + "/" + DateTime.Now.Year).FontSize(10).Bold();
                        });
                    });

                    col.Item().Row(sig =>
                    {
                        sig.RelativeItem().Column(right =>
                        {
                            right.Item().AlignRight().Text("Issued By").Bold().FontSize(10);
                            right.Item().AlignRight().PaddingTop(6).Text(mentor.FullName).Bold().FontSize(11);
                            right.Item().AlignRight().Text(mentor.Designation).FontSize(10);
                            right.Item().AlignRight().Text("Pakistan International Airlines").FontSize(10);
                        });
                    });

                    col.Item().PaddingTop(12).Text(
                        "This card identifies the holder as an intern of Pakistan International Airlines and must be presented on request. Return on completion of internship.")
                        .FontSize(9).FontColor("#64748b").Italic();
                });

                page.Footer().AlignRight().Text(text =>
                {
                    text.Span("Page ").FontSize(9);
                    text.CurrentPageNumber().FontSize(9);
                    text.Span(" of ").FontSize(9);
                    text.TotalPages().FontSize(9);
                });
            });
        });

        document.GeneratePdf(pdfPath);
        return Path.Combine("pdfs", fileName).Replace("\\", "/");
    }

    private static string OrdinalDay(int day) =>
        day % 100 is 11 or 12 or 13 ? $"{day}th"
        : day % 10 == 1 ? $"{day}st"
        : day % 10 == 2 ? $"{day}nd"
        : day % 10 == 3 ? $"{day}rd"
        : $"{day}th";

    private static string OrdinalDate(DateTime d) => $"{OrdinalDay(d.Day)} {d:MMMM yyyy}";

    private static string NumberToWords(int n)
    {
        var ones = new[] { "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
            "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
        var tens = new[] { "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };
        if (n < 20) return ones[n];
        if (n < 100) return $"{tens[n / 10]}{(n % 10 == 0 ? "" : "-" + ones[n % 10])}";
        return n.ToString();
    }

    private static string Escape(string? value) => WebUtility.HtmlEncode(value ?? "");

    // ─── Generic report → PDF table writer ────────────────────────────────────
    // Same row/dictionary shape as ExcelService.WriteRows so the Reports screens
    // get a server-generated PDF (mobile HTML→PDF renderers are unreliable under
    // the React Native New Architecture). Returns "pdfs/{file}.pdf".

    /// <summary>
    /// Renders report rows as a QuestPDF table into uploadRoot/pdfs and returns
    /// the relative path (mirrors ExcelService.WriteRows column layout).
    /// </summary>
    public string WriteReport(string fileName, string reportKey, IReadOnlyList<IDictionary<string, object?>> rows, string? generatedBy = null)
    {
        var safeName = Sanitize(fileName);
        var relative = Path.Combine("pdfs", $"{safeName}.pdf").Replace("\\", "/");
        var dir = Path.Combine(_uploadRoot, "pdfs");
        Directory.CreateDirectory(dir);
        var filePath = Path.Combine(dir, $"{safeName}.pdf");

        var columns = rows.Count == 0 ? Array.Empty<string>() : rows[0].Keys.ToArray();

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(16);
                page.DefaultTextStyle(x => x.FontSize(9).FontColor("#111827"));

                page.Header().Element(ComposeHeader);

                page.Content().Column(col =>
                {
                    col.Item().PaddingTop(8).Text(reportKey.Replace("-", " ").ToUpperInvariant()).Bold().FontSize(12).FontColor("#111827");
                    col.Item().PaddingTop(4).Text($"Records: {rows.Count}").FontSize(9).FontColor("#6B7280");

                    col.Item().PaddingTop(6).Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.ConstantColumn(22);
                            foreach (var _ in columns) cols.RelativeColumn();
                        });

                        if (columns.Length == 0)
                        {
                            table.Cell().ColumnSpan(2).Padding(8).Text("No data in selected range.").Italic().FontColor("#6B7280");
                            return;
                        }

                        table.Header(header =>
                        {
                            header.Cell().Background("#1F2937").Padding(4).Text("#").FontSize(9).Bold().FontColor("#FFFFFF");
                            foreach (var key in columns)
                            {
                                header.Cell()
                                    .Background("#1F2937")
                                    .Padding(4)
                                    .Text(HeaderLabel(key))
                                    .FontSize(9)
                                    .Bold()
                                    .FontColor("#FFFFFF");
                            }
                        });

                        for (int i = 0; i < rows.Count; i++)
                        {
                            var row = rows[i];
                            table.Cell().BorderBottom(0.5f).BorderColor("#E5E7EB").Padding(4).Text((i + 1).ToString()).FontSize(9);
                            foreach (var key in columns)
                            {
                                table.Cell()
                                    .BorderBottom(0.5f)
                                    .BorderColor("#E5E7EB")
                                    .Padding(4)
                                    .Text(Display(row[key]))
                                    .FontSize(9);
                            }
                        }
                    });
                });

                page.Footer().AlignRight().Text(x =>
                {
                    x.Span("Generated by " + (string.IsNullOrWhiteSpace(generatedBy) ? "System" : generatedBy)).FontSize(8).FontColor("#9CA3AF");
                    x.Span("   •   ").FontSize(8).FontColor("#9CA3AF");
                    x.Span("Generated " + DateTime.Now.ToString("dd-MMM-yyyy HH:mm")).FontSize(8).FontColor("#9CA3AF");
                    x.Span("   •   Page ").FontSize(8).FontColor("#9CA3AF");
                    x.CurrentPageNumber().FontSize(8).FontColor("#9CA3AF");
                    x.Span(" of ").FontSize(8).FontColor("#9CA3AF");
                    x.TotalPages().FontSize(8).FontColor("#9CA3AF");
                });
            });
        });

        document.GeneratePdf(filePath);
        return relative;
    }

    private static string Display(object? value)
    {
        if (value == null) return "";
        return value switch
        {
            DateTime dt => dt.ToString("dd MMM yyyy, HH:mm", System.Globalization.CultureInfo.InvariantCulture),
            DateTimeOffset dto => dto.LocalDateTime.ToString("dd MMM yyyy, HH:mm", System.Globalization.CultureInfo.InvariantCulture),
            bool b => b ? "Yes" : "No",
            double d => d % 1 == 0 ? ((long)d).ToString(System.Globalization.CultureInfo.InvariantCulture) : d.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            float f => f % 1 == 0 ? ((long)f).ToString(System.Globalization.CultureInfo.InvariantCulture) : f.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            decimal m => m.ToString(System.Globalization.CultureInfo.InvariantCulture),
            IFormattable f => f.ToString(null, System.Globalization.CultureInfo.InvariantCulture),
            _ => value.ToString() ?? ""
        };
    }

    private static string HeaderLabel(string key) =>
        string.Concat(key.Select((ch, i) => i > 0 && char.IsUpper(ch) ? " " + char.ToLower(ch) : char.ToLower(ch).ToString()));

    private static string Sanitize(string name)
    {
        var invalid = Path.GetInvalidFileNameChars().Concat(new[] { ' ', '/' });
        var sb = new System.Text.StringBuilder();
        foreach (var ch in name)
        {
            if (invalid.Contains(ch)) sb.Append('_');
            else sb.Append(ch);
        }
        return sb.ToString();
    }

    // "Zain Ul Abideen" -> "Zain-Ul-Abideen" (filename-safe, readable).
    private static string Slugify(string value)
    {
        var clean = new string((value ?? "").Where(c => char.IsLetterOrDigit(c) || c == ' ' || c == '-' || c == '\'').ToArray());
        return string.IsNullOrWhiteSpace(clean) ? "Intern"
            : string.Join("-", clean.Split(new[] { ' ', '\'', '-' }, StringSplitOptions.RemoveEmptyEntries));
    }

    // Extracts the trailing id from a "PIA/GP/{id:0000}" document id, else null.
    private static string? ExtractDocId(string? documentId)
    {
        if (string.IsNullOrWhiteSpace(documentId)) return null;
        var parts = documentId.Split('/');
        var tail = parts.Length > 0 ? parts[^1] : "";
        return string.IsNullOrWhiteSpace(tail) ? null : tail;
    }

    /// <summary>Inlines a template image as a base64 data-URI, or removes the tag if missing.</summary>
    private static string InlineTemplateImage(string html, string srcName, string path)
    {
        var fi = new FileInfo(path);
        var src = fi.Exists && fi.Length > 0 ? DataUri(fi) : null;
        return src != null
            ? html.Replace(srcName, src)
            : html.Replace($"<img src=\"{srcName}\"", "<img src=\"\"");
    }

    private static string DataUri(FileInfo fi)
    {
        var mime = fi.Extension.ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            _ => "application/octet-stream"
        };
        return $"data:{mime};base64,{Convert.ToBase64String(File.ReadAllBytes(fi.FullName))}";
    }

    private static void ComposeHeader(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().Column(logo =>
                {
                    logo.Item().Text("✈ PAKISTAN").Bold().FontSize(14).FontColor("#006633");
                    logo.Item().Text("International Airlines").Bold().FontSize(12).FontColor("#006633");
                    logo.Item().Text("Great People to Fly With").FontSize(8).FontColor("#8B6914");
                });
            });
            col.Item().PaddingTop(4).BorderBottom(2).BorderColor("#006633");
            col.Item().PaddingTop(2).BorderBottom(1).BorderColor("#8B6914");
            col.Item().Height(10);
        });
    }
}
