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
            e.Property(i => i.FaceEmbeddingJson).HasColumnType("nvarchar(max)");
        });

        // Attendance
        modelBuilder.Entity<Attendance>(e =>
        {
            e.HasOne(a => a.Intern).WithMany(i => i.Attendances)
                .HasForeignKey(a => a.InternId)
                .OnDelete(DeleteBehavior.Cascade);
            e.Property(a => a.Status).HasConversion<string>();
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

        // Seed data
        modelBuilder.Entity<Department>().HasData(
            new Department
            {
                Id = 1, Name = "ERP Section", Code = "ERP",
                Latitude = 24.894995, Longitude = 67.152182, RadiusMeters = 30,
                IsActive = true, CreatedAt = new DateTime(2026, 1, 1)
            },
            new Department
            {
                Id = 2, Name = "Cyber Security", Code = "CYBER",
                Latitude = 24.894427, Longitude = 67.151782, RadiusMeters = 30,
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
    }
}
