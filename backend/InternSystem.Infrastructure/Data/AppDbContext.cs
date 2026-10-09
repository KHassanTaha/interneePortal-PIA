using InternSystem.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace InternSystem.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Mentor> Mentors => Set<Mentor>();
    public DbSet<Intern> Interns => Set<Intern>();
    public DbSet<Attendance> Attendances => Set<Attendance>();
    public DbSet<InternTask> Tasks => Set<InternTask>();
    public DbSet<GatePass> GatePasses => Set<GatePass>();
    public DbSet<IdCardRequest> IdCardRequests => Set<IdCardRequest>();
    public DbSet<Certificate> Certificates => Set<Certificate>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();
    public DbSet<AttendanceVerificationSession> AttendanceVerificationSessions => Set<AttendanceVerificationSession>();
    public DbSet<DocumentUpload> DocumentUploads => Set<DocumentUpload>();
    public DbSet<DepartmentHead> DepartmentHeads => Set<DepartmentHead>();
    public DbSet<MentorTransferRequest> MentorTransferRequests => Set<MentorTransferRequest>();
    public DbSet<Shift> Shifts => Set<Shift>();
    public DbSet<AttendanceSettings> AttendanceSettings => Set<AttendanceSettings>();
    public DbSet<PublicHoliday> PublicHolidays => Set<PublicHoliday>();
    public DbSet<InternTransferRequest> InternTransferRequests => Set<InternTransferRequest>();
    public DbSet<InternShiftChangeRequest> InternShiftChangeRequests => Set<InternShiftChangeRequest>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<FaceEnrollmentRecord> FaceEnrollmentRecords => Set<FaceEnrollmentRecord>();
    public DbSet<LeaveApplication> LeaveApplications => Set<LeaveApplication>();
    public DbSet<DeviceMac> DeviceMacs => Set<DeviceMac>();
    public DbSet<InternSerialTracker> InternSerialTrackers => Set<InternSerialTracker>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // User
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Username).IsUnique();
            e.Property(u => u.Role).HasConversion<string>();
        });

        // Mentor
        modelBuilder.Entity<Mentor>(e =>
        {
            e.HasOne(m => m.User).WithOne(u => u.Mentor)
                .HasForeignKey<Mentor>(m => m.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(m => m.Department).WithMany(d => d.Mentors)
                .HasForeignKey(m => m.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Intern
        modelBuilder.Entity<Intern>(e =>
        {
            e.HasOne(i => i.User).WithOne(u => u.Intern)
                .HasForeignKey<Intern>(i => i.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.Mentor).WithMany(m => m.Interns)
                .HasForeignKey(i => i.MentorId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.Department).WithMany(d => d.Interns)
                .HasForeignKey(i => i.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.Shift).WithMany()
                .HasForeignKey(i => i.ShiftId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(i => i.FaceEmbeddingJson).HasColumnType("nvarchar(max)");
    e.Property(i => i.FaceEnrollmentStatus).HasConversion<string>();
            e.Property(i => i.RegNo).HasMaxLength(40);
            e.Property(i => i.CNIC).HasMaxLength(20);
            e.HasIndex(i => i.RegNo)
                .IsUnique()
                .HasFilter("[RegNo] IS NOT NULL AND [RegNo] <> ''");
            e.HasIndex(i => i.CNIC)
                .IsUnique()
                .HasFilter("[CNIC] IS NOT NULL AND [CNIC] <> ''")
                .HasDatabaseName("UX_Interns_Cnic");
            e.HasMany(i => i.FaceEnrollmentRecords)
                .WithOne(r => r.Intern)
                .HasForeignKey(r => r.InternId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Attendance
        modelBuilder.Entity<Attendance>(e =>
        {
            e.HasOne(a => a.Intern).WithMany(i => i.Attendances)
                .HasForeignKey(a => a.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.Property(a => a.Status).HasConversion<string>();
            e.Property(a => a.ArrivalStatus).HasConversion<string>();
            e.Property(a => a.DepartureStatus).HasConversion<string>();
        });

        // Task
        modelBuilder.Entity<InternTask>(e =>
        {
            e.HasOne(t => t.Intern).WithMany(i => i.Tasks)
                .HasForeignKey(t => t.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.AssignedByMentor).WithMany()
                .HasForeignKey(t => t.AssignedByMentorId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(t => t.Status).HasConversion<string>();
        });

        // GatePass
        modelBuilder.Entity<GatePass>(e =>
        {
            e.HasOne(g => g.Intern).WithMany(i => i.GatePasses)
                .HasForeignKey(g => g.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(g => g.ApprovedByMentor).WithMany()
                .HasForeignKey(g => g.ApprovedByMentorId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(g => g.Status).HasConversion<string>();
        });

        // IdCardRequest
        modelBuilder.Entity<IdCardRequest>(e =>
        {
            e.HasOne(i => i.Intern).WithMany()
                .HasForeignKey(i => i.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.ApprovedByMentor).WithMany()
                .HasForeignKey(i => i.ApprovedByMentorId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(i => i.Status).HasConversion<string>();
        });

        // Certificate
        modelBuilder.Entity<Certificate>(e =>
        {
            e.HasOne(c => c.Intern).WithMany(i => i.Certificates)
                .HasForeignKey(c => c.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.ApprovedByMentor).WithMany()
                .HasForeignKey(c => c.ApprovedByMentorId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(c => c.DepartmentHead).WithMany()
                .HasForeignKey(c => c.DepartmentHeadId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(c => c.HighlightTask).WithMany()
                .HasForeignKey(c => c.HighlightTaskId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(c => c.Status).HasConversion<string>();
        });

        // ActivityLog
        modelBuilder.Entity<ActivityLog>(e =>
        {
            e.HasOne(a => a.PerformedByUser).WithMany()
                .HasForeignKey(a => a.PerformedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(a => a.TargetIntern).WithMany(i => i.ActivityLogs)
                .HasForeignKey(a => a.TargetInternId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(a => a.Department).WithMany()
                .HasForeignKey(a => a.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(a => a.LogType).HasConversion<string>();
        });

        // AttendanceVerificationSession
        modelBuilder.Entity<AttendanceVerificationSession>(e =>
        {
            e.HasOne(s => s.User).WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(s => s.Intern).WithMany()
                .HasForeignKey(s => s.InternId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(s => s.Department).WithMany()
                .HasForeignKey(s => s.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(s => s.Status).HasConversion<string>();
        });

        // DepartmentHead
        modelBuilder.Entity<DepartmentHead>(e =>
        {
            e.HasOne(h => h.Department).WithMany()
                .HasForeignKey(h => h.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // MentorTransferRequest
        modelBuilder.Entity<MentorTransferRequest>(e =>
        {
            e.HasOne(t => t.Mentor).WithMany()
                .HasForeignKey(t => t.MentorId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.FromDepartment).WithMany()
                .HasForeignKey(t => t.FromDepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.ToDepartment).WithMany()
                .HasForeignKey(t => t.ToDepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.InitiatedByAdmin).WithMany()
                .HasForeignKey(t => t.InitiatedByAdminId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.RespondedByMentor).WithMany()
                .HasForeignKey(t => t.RespondedByMentorId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.FinalisedByAdmin).WithMany()
                .HasForeignKey(t => t.FinalisedByAdminId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(t => t.Status).HasConversion<string>();
        });

        // Shift
        modelBuilder.Entity<Shift>(e =>
        {
            e.HasOne(s => s.Department).WithMany()
                .HasForeignKey(s => s.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // AttendanceSettings
        modelBuilder.Entity<AttendanceSettings>(e =>
        {
            e.HasKey(s => s.Id);
        });

        // PublicHoliday
        modelBuilder.Entity<PublicHoliday>(e =>
        {
            e.HasIndex(h => h.Date);
        });

        // InternTransferRequest
        modelBuilder.Entity<InternTransferRequest>(e =>
        {
            e.HasOne(t => t.Intern).WithMany()
                .HasForeignKey(t => t.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.FromMentor).WithMany()
                .HasForeignKey(t => t.FromMentorId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.ToMentor).WithMany()
                .HasForeignKey(t => t.ToMentorId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.InitiatedByUser).WithMany()
                .HasForeignKey(t => t.InitiatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.EndorsedByUser).WithMany()
                .HasForeignKey(t => t.EndorsedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.FinalisedByUser).WithMany()
                .HasForeignKey(t => t.FinalisedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(t => t.InitiatedBy).HasConversion<string>();
            e.Property(t => t.Status).HasConversion<string>();
        });

        // InternShiftChangeRequest
        modelBuilder.Entity<InternShiftChangeRequest>(e =>
        {
            e.HasOne(t => t.Intern).WithMany()
                .HasForeignKey(t => t.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.FromShift).WithMany()
                .HasForeignKey(t => t.FromShiftId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.ToShift).WithMany()
                .HasForeignKey(t => t.ToShiftId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.RequestedByUser).WithMany()
                .HasForeignKey(t => t.RequestedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(t => t.Status).HasConversion<string>();
        });

        // DocumentUpload
        modelBuilder.Entity<DocumentUpload>(e =>
        {
            e.HasOne(d => d.Intern).WithMany()
                .HasForeignKey(d => d.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(d => d.ApprovedByUser).WithMany()
                .HasForeignKey(d => d.ApprovedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(d => d.DocumentType).HasConversion<string>();
            e.Property(d => d.Status).HasConversion<string>();
        });

        // Notification
        modelBuilder.Entity<Notification>(e =>
        {
            e.HasOne(n => n.User).WithMany()
                .HasForeignKey(n => n.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            e.Property(n => n.Type).HasConversion<string>();
            e.HasIndex(n => new { n.UserId, n.IsRead });
        });

        // LeaveApplication
        modelBuilder.Entity<LeaveApplication>(e =>
        {
            e.HasOne(l => l.Intern).WithMany()
                .HasForeignKey(l => l.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(l => l.DecidedByUser).WithMany()
                .HasForeignKey(l => l.DecidedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(l => l.Status).HasConversion<string>();
        });

        // DeviceMac
        modelBuilder.Entity<DeviceMac>(e =>
        {
            e.HasOne(d => d.Intern).WithMany()
                .HasForeignKey(d => d.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.Property(d => d.DeviceType).HasConversion<string>();
        });

        // InternSerialTracker
        modelBuilder.Entity<InternSerialTracker>(e =>
        {
            e.HasKey(t => t.Prefix);
        });

        // IdempotencyRecord
        modelBuilder.Entity<IdempotencyRecord>(e =>
        {
            e.HasIndex(r => new { r.UserId, r.Key }).IsUnique();
            e.Property(r => r.Key).HasMaxLength(64);
            e.Property(r => r.Method).HasMaxLength(16);
            e.Property(r => r.Path).HasMaxLength(500);
            e.Property(r => r.ResponseBody).HasColumnType("nvarchar(max)");
        });

        // Seed data
        modelBuilder.Entity<Department>().HasData(
            new Department
            {
                Id = 1, Name = "ERP Section", Code = "ERP",
                Latitude = 24.894995, Longitude = 67.152182, RadiusMeters = 100,
                IsActive = true, CreatedAt = new DateTime(2026, 1, 1)
            },
            new Department
            {
                Id = 2, Name = "Cyber Security", Code = "CYBER",
                Latitude = 24.894427, Longitude = 67.151782, RadiusMeters = 100,
                IsActive = true, CreatedAt = new DateTime(2026, 1, 1)
            }
        );

        // Seed admin user (password: Admin@123)
        modelBuilder.Entity<User>().HasData(
            new User
            {
                Id = 1,
                Username = "admin",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin@123"),
                Role = UserRole.Admin,
                IsActive = true,
                CreatedAt = new DateTime(2026, 1, 1)
            }
        );

        // Seed standard company-wide shifts
        modelBuilder.Entity<Shift>().HasData(
            new Shift { Id = 1, Name = "Morning", StartTime = new TimeSpan(9, 0, 0), EndTime = new TimeSpan(17, 0, 0), IsCompanyWide = true, IsActive = true },
            new Shift { Id = 2, Name = "Afternoon", StartTime = new TimeSpan(13, 0, 0), EndTime = new TimeSpan(21, 0, 0), IsCompanyWide = true, IsActive = true },
            new Shift { Id = 3, Name = "Night", StartTime = new TimeSpan(21, 0, 0), EndTime = new TimeSpan(5, 0, 0), IsCompanyWide = true, IsActive = true }
        );

        // Seed single-row attendance settings
        modelBuilder.Entity<AttendanceSettings>().HasData(
            new AttendanceSettings { Id = 1, GraceMinutes = 15, ThresholdPct = 80, AllowedLeaveDays = 5, TaskThresholdPct = 80, SignatureRequired = false }
        );
    }
}
