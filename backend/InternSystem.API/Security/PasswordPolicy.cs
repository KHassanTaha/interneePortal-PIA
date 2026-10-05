namespace InternSystem.API.Security;

/// <summary>
/// Shared password strength policy. Applied on change/reset and account creation.
/// </summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;

    public static string? Validate(string password)
    {
        if (string.IsNullOrWhiteSpace(password))
            return "Password is required.";
        if (password.Length < MinLength)
            return $"Password must be at least {MinLength} characters.";
        if (!password.Any(char.IsLower))
            return "Password must contain at least one lowercase letter.";
        if (!password.Any(char.IsUpper))
            return "Password must contain at least one uppercase letter.";
        if (!password.Any(char.IsDigit))
            return "Password must contain at least one number.";
        return null;
    }
}

/// <summary>
/// Generates a cryptographically random temporary password (does not contain lookalike chars).
/// </summary>
public static class RandomPassword
{
    public static string Generate()
    {
        const string upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
        const string lower = "abcdefghjkmnpqrstuvwxyz";
        const string digits = "23456789";
        var rng = System.Security.Cryptography.RandomNumberGenerator.GetBytes(12);
        var chars = new char[12];
        // Ensure at least one of each required class.
        chars[0] = upper[rng[0] % upper.Length];
        chars[1] = lower[rng[1] % lower.Length];
        chars[2] = digits[rng[2] % digits.Length];
        const string all = upper + lower + digits;
        for (int i = 3; i < chars.Length; i++)
            chars[i] = all[rng[i] % all.Length];
        return new string(chars.OrderBy(_ => System.Security.Cryptography.RandomNumberGenerator.GetInt32(int.MaxValue)).ToArray());
    }
}