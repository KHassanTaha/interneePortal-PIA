using ClosedXML.Excel;

namespace InternSystem.Infrastructure.Services;

/// <summary>
/// Generic report-to-.xlsx exporter used by the admin/mentor/intern report endpoints.
/// Writes each dictionary row as a spreadsheet row (first row's keys become the header),
/// stores the file under uploadRoot/excel, and returns the relative path (same convention
/// as PdfService returning "pdfs/..." paths, served at /files/...).
/// </summary>
public class ExcelService
{
    private readonly string _uploadRoot;

    public ExcelService(string uploadRoot)
    {
        _uploadRoot = uploadRoot;
        Directory.CreateDirectory(Path.Combine(uploadRoot, "excel"));
    }

    /// <summary>
    /// Builds a .xlsx from rows. <paramref name="rows"/> is a collection of dictionaries keyed
    /// by column name. Returns the relative path ("excel/{fileName}.xlsx").
    /// </summary>
    public string WriteRows(string fileName, string sheetTitle, IReadOnlyList<IDictionary<string, object?>> rows)
    {
        var safeName = Sanitize(fileName);
        var relative = Path.Combine("excel", $"{safeName}.xlsx").Replace("\\", "/");
        var filePath = Path.Combine(_uploadRoot, "excel", $"{safeName}.xlsx");

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add(sheetTitle);

        if (rows.Count == 0)
        {
            wb.SaveAs(filePath);
            return relative;
        }

        var columns = rows[0].Keys.ToList();

        // Header
        ws.Cell(1, 1).Value = "#";
        ws.Cell(1, 1).Style.Font.Bold = true;
        ws.Cell(1, 1).Style.Fill.BackgroundColor = XLColor.FromHtml("#1F2937");
        ws.Cell(1, 1).Style.Font.FontColor = XLColor.White;
        for (int c = 0; c < columns.Count; c++)
        {
            var cell = ws.Cell(1, c + 2);
            cell.Value = HeaderLabel(columns[c]);
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#1F2937");
            cell.Style.Font.FontColor = XLColor.White;
        }

        // Data
        for (int r = 0; r < rows.Count; r++)
        {
            var row = rows[r];
            ws.Cell(r + 2, 1).Value = r + 1;
            for (int c = 0; c < columns.Count; c++)
            {
                var value = row[columns[c]];
                ws.Cell(r + 2, c + 2).Value = ToXlValue(value);
            }
        }

        ws.Columns().AdjustToContents();
        ws.SheetView.FreezeRows(1);

        wb.SaveAs(filePath);
        return relative;
    }

    private static XLCellValue ToXlValue(object? value)
    {
        if (value == null) return XLCellValue.FromObject(null);
        switch (value)
        {
            case bool b: return b;
            case byte n: return n;
            case short n: return n;
            case int n: return n;
            case long n: return n;
            case float n: return n;
            case double n: return n;
            case decimal n: return n;
            case DateTime dt: return dt;
            default: return XLCellValue.FromObject(value.ToString());
        }
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
}
