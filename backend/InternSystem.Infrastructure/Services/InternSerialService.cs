using System.Text.RegularExpressions;
using InternSystem.Core.Entities;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.Infrastructure.Services;

// Generates usernames and the formal intern RegNo.
//
// Usernames: auto-generated names share a per-DEPARTMENT serial (tracker key = dept code)
// so two interns/mentors never collide within a unit and distinct names no longer all
// restart at 001. Format: {first}.{last}.{deptcode}.{serial} (e.g. zain.ulabideen.erp.007).
//
// RegNo: formal reference PIA/INT/{DEPT}/{Year}/{Seq}, sequential per (dept, year)
// via InternSerialTrackers with a "REG.DEPT.YEAR" prefix namespace so ranges survive deletes
// and stay race-resistant.
public class InternSerialService
{
    public async Task<string> GenerateUsernameAsync(AppDbContext db, string fullName, string? requestedUsername, int departmentId)
    {
        var requested = requestedUsername?.Trim() ?? "";
        if (!string.IsNullOrWhiteSpace(requested))
        {
            if (await db.Users.AnyAsync(u => u.Username == requested))
                throw new InvalidOperationException($"Username '{requested}' already exists");
            return requested;
        }

        var deptCode = await db.Departments
            .Where(d => d.Id == departmentId)
            .Select(d => d.Code)
            .FirstOrDefaultAsync() ?? "DEPT";
        deptCode = Sanitize(deptCode).ToLowerInvariant();

        var nameBase = NameBase(fullName);
        var prefix = deptCode; // dept-wide serial: one tracker per department (interns + mentors share it)
        var tracker = await db.InternSerialTrackers.FirstOrDefaultAsync(t => t.Prefix == prefix);
        if (tracker == null)
        {
            tracker = new InternSerialTracker { Prefix = prefix, LastSerial = 0 };
            db.InternSerialTrackers.Add(tracker);
        }

        tracker.LastSerial++;
        await db.SaveChangesAsync();

        var username = $"{nameBase}.{deptCode}.{tracker.LastSerial:D3}";
        while (await db.Users.AnyAsync(u => u.Username == username))
        {
            tracker.LastSerial++;
            username = $"{nameBase}.{deptCode}.{tracker.LastSerial:D3}";
        }
        await db.SaveChangesAsync();

        return username;
    }

    public async Task<string> GenerateRegNoAsync(AppDbContext db, int departmentId)
    {
        var deptCodeUpper = await db.Departments
            .Where(d => d.Id == departmentId)
            .Select(d => d.Code)
            .FirstOrDefaultAsync() ?? "DEPT";
        deptCodeUpper = Sanitize(deptCodeUpper).ToUpperInvariant();

        var year = DateTime.Now.Year;
        var prefix = $"REG.{deptCodeUpper}.{year}";
        var tracker = await db.InternSerialTrackers.FirstOrDefaultAsync(t => t.Prefix == prefix);
        if (tracker == null)
        {
            tracker = new InternSerialTracker { Prefix = prefix, LastSerial = 0 };
            db.InternSerialTrackers.Add(tracker);
        }

        tracker.LastSerial++;
        await db.SaveChangesAsync();

        var regNo = $"PIA/INT/{deptCodeUpper}/{year}/{tracker.LastSerial:D4}";
        while (await db.Interns.AnyAsync(i => i.RegNo == regNo))
        {
            tracker.LastSerial++;
            regNo = $"PIA/INT/{deptCodeUpper}/{year}/{tracker.LastSerial:D4}";
        }
        await db.SaveChangesAsync();

        return regNo;
    }

    // "Zain Ul Abideen" -> "zain.ulabideen"; single-word names -> "zain".
    private static string NameBase(string fullName)
    {
        var parts = (fullName ?? "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var first = parts.Length > 0 ? Sanitize(parts[0]) : "intern";
        var last = parts.Length > 1 ? Sanitize(parts[^1]) : "";
        return string.IsNullOrEmpty(last) ? first : $"{first}.{last}";
    }

    private static string Sanitize(string value)
    {
        var clean = Regex.Replace(value.ToLowerInvariant(), "[^a-z0-9]", "");
        return string.IsNullOrWhiteSpace(clean) ? "intern" : clean;
    }
}