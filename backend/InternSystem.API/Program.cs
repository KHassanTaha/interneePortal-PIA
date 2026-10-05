using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using InternSystem.Infrastructure.Data;
using InternSystem.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Fail closed if required secrets are not configured (env/user-secrets, not appsettings.json).
var connString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connString))
    throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured. Set the ConnectionStrings__DefaultConnection env var.");

var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Jwt:Key is not configured or too short. Set the Jwt__Key env var.");

// Optional TLS: set HTTPS_CERT_PATH (PFX) and HTTPS_CERT_PASSWORD to serve HTTPS
// in production. The HTTP endpoint remains for local, adb reverse development.
var httpsCert = Environment.GetEnvironmentVariable("HTTPS_CERT_PATH");
if (!string.IsNullOrWhiteSpace(httpsCert))
{
    builder.WebHost.ConfigureKestrel(kestrel =>
    {
        var port = int.TryParse(Environment.GetEnvironmentVariable("HTTPS_PORT"), out var p) ? p : 443;
        kestrel.ListenAnyIP(port, listen => listen.UseHttps(httpsCert, Environment.GetEnvironmentVariable("HTTPS_CERT_PASSWORD")));
    });
}

// ─── Services ───────────────────────────────────────────────────────────────
builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));

// CORS is only needed for browser clients (native mobile HTTP calls don't use it).
// Restrict to explicitly configured origins instead of AllowAnyOrigin.
var corsOrigins = (builder.Configuration["Cors:Origins"] ?? "http://localhost:8081,http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod());
});

// Brute-force/abuse throttling: coarse per-client fixed window globally.
// File serving (/files/*) gets a much higher allowance so batch PDF/image views
// and RN <Image> previews aren't spuriously rate-limited (each one is a request).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var forwarded = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
            ip = forwarded.Split(',')[0].Trim();
        var path = context.Request.Path.Value ?? "";
        var filePath = path.StartsWith("/api/files/", StringComparison.OrdinalIgnoreCase);
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = filePath ? 3000 : 300,
            Window = TimeSpan.FromMinutes(1),
            AutoReplenishment = true,
            QueueLimit = 0
        });
    });
});

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connString));

// JWT Auth (key validated above)
var jwtSettings = builder.Configuration.GetSection("Jwt");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            ValidIssuer = jwtSettings["Issuer"],
            ValidAudience = jwtSettings["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
        // Server-side token revocation (logout invalidates all outstanding access tokens).
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                if (!int.TryParse(context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
                {
                    context.Fail("Invalid token");
                    return;
                }
                var tvnClaim = context.Principal?.FindFirstValue("tvn");
                if (!int.TryParse(tvnClaim, out var tokenVersion))
                {
                    context.Fail("Token has been revoked");
                    return;
                }
                var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var stored = await db.Users.AsNoTracking()
                    .Where(u => u.Id == userId)
                    .Select(u => (int?)u.TokenVersion)
                    .FirstOrDefaultAsync();
                if (!stored.HasValue || stored.Value != tokenVersion)
                {
                    context.Fail("Token has been revoked");
                }
            }
        };
    });

builder.Services.AddAuthorization();

// Custom Services
var uploadRoot = builder.Configuration["FileStorage:UploadPath"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "uploads");
builder.Services.AddSingleton(_ => new FileService(uploadRoot));
builder.Services.AddSingleton(_ => new PdfService(uploadRoot));
builder.Services.AddSingleton(_ => new ExcelService(uploadRoot));
builder.Services.AddSingleton<GeoFenceService>();
builder.Services.AddSingleton<JwtService>();
builder.Services.AddSingleton<InternSerialService>();
builder.Services.AddSingleton<EmailService>();
builder.Services.AddSingleton(sp => new FaceRecognitionService(
    sp.GetRequiredService<ILogger<FaceRecognitionService>>(),
    Path.Combine(builder.Environment.ContentRootPath, "Models", "AI")));
builder.Services.AddScoped<AttendanceScoringService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<IdempotencyService>();

// ─── App ────────────────────────────────────────────────────────────────────
var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new { message = "An unexpected error occurred." });
    }));
    app.UseHsts();
}
else
{
    app.UseDeveloperExceptionPage();
}

// Security headers
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    if (!app.Environment.IsDevelopment())
        context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    await next();
});

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Ensure upload directory exists (FileService also creates per-subfolder dirs).
Directory.CreateDirectory(uploadRoot);

app.MapControllers();

// Auto-migrate on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    // Idempotent schema guard: the dev DB was recreated from an older model and
    // is missing columns the current model expects (EF sees "no pending migrations"
    // because the model snapshot already includes them). Add any that are absent.
    db.Database.ExecuteSqlRaw(@"
        IF OBJECT_ID('Attendances') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Attendances') AND name = 'FaceConfidence')
        ALTER TABLE Attendances ADD FaceConfidence float NULL;
        IF OBJECT_ID('Attendances') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Attendances') AND name = 'CheckInPhotoPath')
        ALTER TABLE Attendances ADD CheckInPhotoPath nvarchar(max) NULL;
        IF OBJECT_ID('Attendances') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Attendances') AND name = 'CheckOutPhotoPath')
        ALTER TABLE Attendances ADD CheckOutPhotoPath nvarchar(max) NULL;
        IF OBJECT_ID('AttendanceVerificationSessions') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AttendanceVerificationSessions') AND name = 'FaceConfidence')
        ALTER TABLE AttendanceVerificationSessions ADD FaceConfidence float NULL;
        IF OBJECT_ID('AttendanceVerificationSessions') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AttendanceVerificationSessions') AND name = 'IssuedChallenges')
        ALTER TABLE AttendanceVerificationSessions ADD IssuedChallenges nvarchar(max) NULL;
        IF OBJECT_ID('AttendanceVerificationSessions') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AttendanceVerificationSessions') AND name = 'VerificationPhotoPath')
        ALTER TABLE AttendanceVerificationSessions ADD VerificationPhotoPath nvarchar(max) NULL;
        IF OBJECT_ID('FaceEnrollmentRecords') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FaceEnrollmentRecords') AND name = 'PhotoPath')
        ALTER TABLE FaceEnrollmentRecords ADD PhotoPath nvarchar(max) NULL;
        IF OBJECT_ID('Shifts') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Shifts') AND name = 'CreatedByUserId')
        ALTER TABLE Shifts ADD CreatedByUserId int NULL;

        IF OBJECT_ID('Mentors') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Mentors') AND name = 'Phone')
        ALTER TABLE Mentors ADD Phone nvarchar(max) NULL;
        IF OBJECT_ID('Mentors') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Mentors') AND name = 'Email')
        ALTER TABLE Mentors ADD Email nvarchar(max) NULL;

        IF OBJECT_ID('Users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'MustChangePassword')
        ALTER TABLE Users ADD MustChangePassword bit NOT NULL DEFAULT(0);
        IF OBJECT_ID('Users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'TokenVersion')
        ALTER TABLE Users ADD TokenVersion int NOT NULL DEFAULT(0);
        IF OBJECT_ID('Users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'FailedLoginAttempts')
        ALTER TABLE Users ADD FailedLoginAttempts int NOT NULL DEFAULT(0);
        IF OBJECT_ID('Users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'LockedUntil')
        ALTER TABLE Users ADD LockedUntil datetime2 NULL;

        IF OBJECT_ID('InternSerialTrackers') IS NULL
        CREATE TABLE InternSerialTrackers (
            Prefix nvarchar(450) NOT NULL CONSTRAINT PK_InternSerialTrackers PRIMARY KEY,
            LastSerial int NOT NULL
        );

        IF OBJECT_ID('LeaveApplications') IS NULL
        CREATE TABLE LeaveApplications (
            Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_LeaveApplications PRIMARY KEY,
            InternId int NOT NULL,
            StartDate datetime2 NOT NULL,
            EndDate datetime2 NOT NULL,
            Reason nvarchar(max) NOT NULL,
            Status nvarchar(max) NOT NULL,
            DecidedAt datetime2 NULL,
            DecidedByUserId int NULL,
            RejectionReason nvarchar(max) NULL,
            CreatedAt datetime2 NOT NULL
        );

        IF OBJECT_ID('DeviceMacs') IS NULL
        CREATE TABLE DeviceMacs (
            Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_DeviceMacs PRIMARY KEY,
            InternId int NOT NULL,
            DeviceType nvarchar(max) NOT NULL,
            MacAddress nvarchar(max) NOT NULL,
            UpdatedAt datetime2 NOT NULL,
            CreatedAt datetime2 NOT NULL
        );

        IF OBJECT_ID('IdempotencyRecords') IS NULL
        CREATE TABLE IdempotencyRecords (
            Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_IdempotencyRecords PRIMARY KEY,
            UserId int NOT NULL,
            [Key] nvarchar(64) NOT NULL,
            Method nvarchar(16) NULL,
            [Path] nvarchar(500) NULL,
            StatusCode int NOT NULL,
            ResponseBody nvarchar(max) NULL,
            CreatedAt datetime2 NOT NULL,
            ExpiresAt datetime2 NOT NULL
        );
        IF OBJECT_ID('IdempotencyRecords') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_IdempotencyRecords_UserKey' AND object_id = OBJECT_ID('IdempotencyRecords'))
        CREATE UNIQUE INDEX IX_IdempotencyRecords_UserKey ON IdempotencyRecords (UserId, [Key]);
    ");
}

app.Run();