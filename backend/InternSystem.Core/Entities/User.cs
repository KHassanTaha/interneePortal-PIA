namespace InternSystem.Core.Entities;

public enum UserRole
{
    Admin = 0,
    Mentor = 1,
    Intern = 2
}

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    public bool MustChangePassword { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }
    public string? DeviceIdHash { get; set; }
    public DateTime? DeviceBoundAt { get; set; }
    public string? DeviceLabel { get; set; }

    // Token revocation: incremented on logout; embedded in access tokens as the "tvn" claim.
    public int TokenVersion { get; set; }

    // Brute-force protection: failed login counter and lockout window.
    public int FailedLoginAttempts { get; set; }
    public DateTime? LockedUntil { get; set; }

    public Mentor? Mentor { get; set; }
    public Intern? Intern { get; set; }
}
