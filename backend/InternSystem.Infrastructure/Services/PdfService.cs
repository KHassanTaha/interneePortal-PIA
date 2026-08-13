using System.Diagnostics;
using System.Net;
using InternSystem.Core.Entities;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace InternSystem.Infrastructure.Services;

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
    /// Generates a PIA-style Gate Pass letter PDF for a list of interns in the same department.
    /// </summary>
    public string GenerateGatePassPdf(GatePass gatePass, Intern intern, Mentor mentor, Department department)
    {
        var date = DateTime.Now.ToString("dd-MMMM-yyyy");
        var fileName = $"gatepass_{gatePass.Id}_{DateTime.Now.Ticks}.pdf";
        var pdfPath = Path.Combine(_uploadRoot, "pdfs", fileName);

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(50);

                page.Header().Element(ComposeHeader);

                page.Content().Column(col =>
                {
                    col.Spacing(10);

                    // Date (right-aligned)
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
                        text.Span(" Section at PIA Head Office:").FontSize(11);
                    });

                    // Table of interns in this batch (for this gate pass — single intern)
                    col.Item().PaddingTop(10).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.ConstantColumn(50);
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(2);
                        });

                        // Header
                        table.Header(header =>
                        {
                            header.Cell().Border(1).Padding(5).Text("S.NO").Bold().FontSize(10);
                            header.Cell().Border(1).Padding(5).Text("Student Name").Bold().FontSize(10);
                            header.Cell().Border(1).Padding(5).Text("CNIC Number").Bold().FontSize(10);
                        });

                        table.Cell().Border(1).Padding(5).Text("1").FontSize(10);
                        table.Cell().Border(1).Padding(5).Text(intern.FullName).FontSize(10);
                        table.Cell().Border(1).Padding(5).Text(intern.CNIC ?? "—").FontSize(10);
                    });

                    col.Item().PaddingTop(15).Text(text =>
                    {
                        text.Span("These students will be ").FontSize(11);
                        text.Span("undertaking an internship").Bold().Underline().FontSize(11);
                        text.Span(" under the supervision of the ").FontSize(11);
                        text.Span("Manager Information Technology").Bold().FontSize(11);
                        text.Span(" in the ").FontSize(11);
                        text.Span(department.Name).Bold().FontSize(11);
                        text.Span($" Section from ").FontSize(11);
                        text.Span(intern.StartDate.ToString("dd MMM yyyy")).Bold().FontSize(11);
                        text.Span(" to ").FontSize(11);
                        text.Span(intern.EndDate.ToString("dd MMM yyyy")).Bold().FontSize(11);
                        text.Span(".").FontSize(11);
                    });

                    col.Item().PaddingTop(10).Text("Their presence is authorized for the purpose of gaining practical experience within our organization.").FontSize(11);

                    col.Item().PaddingTop(10).Text("We kindly request you to grant them access permission and ensure that their entry and exit are recorded in accordance with the organization's security policies.").FontSize(11);

                    col.Item().PaddingTop(10).Text("Thank you for your cooperation.").FontSize(11);

                    // Signature block
                    col.Item().PaddingTop(40).Column(sig =>
                    {
                        sig.Item().Text(mentor.FullName).Bold().FontSize(11);
                        sig.Item().Text(mentor.Designation).FontSize(10);
                        sig.Item().Text(department.Name).FontSize(10);
                        sig.Item().Text("Pakistan International Airline").FontSize(10);
                    });
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

    /// <summary>
    /// Generates a PIA-style Internship Certificate PDF from an HTML template.
    /// Male and female interns get their own template file (wording/pronouns differ).
    /// The certificate is signed by the department head's signature photo.
    /// </summary>
    public string GenerateCertificatePdf(Certificate certificate, Intern intern, Department department, DepartmentHead head)
    {
        var fileName = $"certificate_{certificate.Id}_{DateTime.Now.Ticks}.pdf";
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
            .Replace("{{HeadName}}", Escape(head.Name))
            .Replace("{{HeadDesignation}}", Escape(head.Designation))
            .Replace("{{HeadSignature}}", "sig.png")
            .Replace("{{RefNo}}", $"PIA/INT-{certificate.Id}/{DateTime.Now.Year}")
            .Replace("{{Date}}", $"{OrdinalDay(DateTime.Now.Day)} {DateTime.Now:MMMM, yyyy}");

        // Stage HTML + images together so relative image paths resolve
        var tmpDir = Path.Combine(_uploadRoot, "tmp", Path.GetFileNameWithoutExtension(fileName));
        Directory.CreateDirectory(tmpDir);
        var tmpHtml = Path.Combine(tmpDir, "certificate.html");
        File.WriteAllText(tmpHtml, html);
        foreach (var img in new[] { "header.png", "logo.png" })
        {
            var src = Path.Combine(_templateDir, img);
            if (File.Exists(src)) File.Copy(src, Path.Combine(tmpDir, img), true);
        }

        if (!string.IsNullOrEmpty(head.SignatureImagePath))
        {
            var sigSrc = Path.Combine(_uploadRoot, head.SignatureImagePath.Replace("\\", "/"));
            if (File.Exists(sigSrc)) File.Copy(sigSrc, Path.Combine(tmpDir, "sig.png"), true);
        }

        var psi = new ProcessStartInfo
        {
            FileName = "wkhtmltopdf",
            Arguments = $"--enable-local-file-access --page-size A4 --margin-top 0 --margin-right 0 --margin-bottom 0 --margin-left 0 \"{tmpHtml}\" \"{pdfPath}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        using var proc = Process.Start(psi)!;
        var stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();
        Directory.Delete(tmpDir, true);

        if (proc.ExitCode != 0 || !File.Exists(pdfPath))
            throw new InvalidOperationException($"wkhtmltopdf failed: {stderr}");

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
