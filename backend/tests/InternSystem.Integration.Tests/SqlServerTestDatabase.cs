using System.Data.Common;
using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Xunit;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace InternSystem.Integration.Tests;

/// <summary>
/// Owns the SQL Server database lifecycle for the whole integration suite.
///
/// One ephemeral database per run, named <c>InternSystemTest_{Guid:N}</c>. The
/// Guid means a crashed run can never collide with the next one, and no
/// developer ever points a test at their own working database: the fixture
/// overrides <c>Database=</c> in whatever connection string it resolved, so even
/// a connection string naming <c>InternSystemDB</c> produces a separate test
/// database. The original database is dropped on disposal.
///
/// Schema comes from <see cref="AppDbContext"/> via <c>EnsureCreated()</c>, not
/// from migrations. AGENTS.md 4.10 forbids <c>dotnet ef migrations</c> because the
/// snapshot is stale, and calling <c>Migrate()</c> here would try to replay that
/// stale history onto tables EnsureCreated already made.
///
/// Parallelism: this is a single shared collection fixture. xUnit runs test
/// classes within one collection sequentially and different collections in
/// parallel, so these tests are serialised without disabling parallelism
/// globally. Any future fixture that needs its own database gets its own Guid.
/// </summary>
public class SqlServerTestDatabase : IAsyncLifetime
{
    // A collection fixture cannot receive ITestOutputHelper: that is supplied to
    // test classes only. Fixture-level diagnostics therefore go through ILogger,
    // which is also what keeps a drop failure visible instead of swallowed.
    private readonly ILogger _logger = NullLogger.Instance;
    private string _adminConnectionString = string.Empty;

    public SqlServerTestDatabase()
    {
        _logger = LoggerFactory.Create(b => b.AddSimpleConsole()).CreateLogger<SqlServerTestDatabase>();
    }

    /// <summary>Name of the ephemeral database created for this run.</summary>
    public string DatabaseName { get; private set; } = string.Empty;

    /// <summary>Connection string targeting this run's ephemeral database.</summary>
    public string ConnectionString { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        _adminConnectionString = ResolveBaseConnectionString();

        DatabaseName = $"InternSystemTest_{Guid.NewGuid():N}";

        // Create the database by connecting to master with the target name in the
        // builder. SqlConnectionStringBuilder lets us override Initial Catalog
        // without string surgery on the resolved string.
        var builder = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(_adminConnectionString)
        {
            InitialCatalog = DatabaseName
        };
        ConnectionString = builder.ConnectionString;

        // CREATE DATABASE must be issued from master: connecting straight to the
        // not-yet-existing test database fails with "The login failed".
        var masterBuilder = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(_adminConnectionString)
        {
            InitialCatalog = "master"
        };
        await using (var master = new Microsoft.Data.SqlClient.SqlConnection(masterBuilder.ConnectionString))
        {
            await master.OpenAsync();
            await using var create = master.CreateCommand();
            create.CommandText = $"IF DB_ID('{DatabaseName}') IS NULL CREATE DATABASE [{DatabaseName}]";
            await create.ExecuteNonQueryAsync();
        }

        await using var db = CreateContext();
        await db.Database.EnsureCreatedAsync();

        _logger.LogInformation("Created ephemeral test database {Database}", DatabaseName);
    }

    public async Task DisposeAsync()
    {
        if (string.IsNullOrEmpty(DatabaseName)) return;

        try
        {
            var builder = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(_adminConnectionString)
            {
                InitialCatalog = "master"
            };
            await using var master = new Microsoft.Data.SqlClient.SqlConnection(builder.ConnectionString);
            await master.OpenAsync();
            await using var drop = master.CreateCommand();
            // Terminate other sessions first: EnsureCreated connections may still
            // be pooled, and DROP fails while a session holds the database open.
            drop.CommandText =
                $"IF DB_ID('{DatabaseName}') IS NOT NULL BEGIN " +
                $"DECLARE @sql NVARCHAR(MAX) = N'ALTER DATABASE [{DatabaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{DatabaseName}];' " +
                $"EXEC sp_executesql @sql; END";
            await drop.ExecuteNonQueryAsync();
            _logger.LogInformation("Dropped ephemeral test database {Database}", DatabaseName);
        }
        catch (Exception ex)
        {
            // A teardown failure must never mask a test failure, so this is logged
            // and swallowed. The database name is unique per run, so an orphaned
            // test database cannot affect the next run.
            _logger.LogWarning(ex, "Could not drop ephemeral test database {Database}; it will be left behind", DatabaseName);
        }
    }

    /// <summary>
    /// Deletes rows created by tests, leaving model seed data intact.
    ///
    /// The suite shares one database, so a PublicHoliday seeded by one test would
    /// otherwise be visible to every later test that scores a Mon-Sun window, and
    /// the results would depend on test ordering. Only data tables are cleared;
    /// Departments, Shifts and AttendanceSettings are HasData seed rows that
    /// ComputeAsync reads by literal id and must survive.
    ///
    /// Deletion order respects foreign keys: children before parents.
    /// </summary>
    public async Task ResetAsync()
    {
        await using var db = CreateContext();

        // Child tables first, in FK order. These are exactly the tables with a
        // foreign key into Interns/Users/Mentors; deleting Interns first fails with
        // "DELETE statement conflicted with the REFERENCE constraint". Every list
        // was read from sys.foreign_key_columns rather than guessed.
        foreach (var table in new[]
        {
            "ActivityLogs", "Attendances", "AttendanceVerificationSessions",
            "Certificates", "DepartmentHeads", "DocumentUploads",
            "FaceEnrollmentRecords", "GatePasses", "IdCardRequests",
            "InternShiftChangeRequests", "InternTransferRequests",
            "MentorTransferRequests", "Notifications", "Tasks"
        })
        {
            await db.Database.ExecuteSqlRawAsync($"DELETE FROM {table};");
        }

        await db.Database.ExecuteSqlRawAsync("DELETE FROM PublicHolidays;");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM Interns;");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM Mentors;");
        // Id 1 is the seeded admin user; keep it and drop only test-created users.
        await db.Database.ExecuteSqlRawAsync("DELETE FROM Users WHERE Id > 1;");
    }

    /// <summary>Creates a fresh context against this run's database.</summary>
    public AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(ConnectionString)
            .Options;
        return new AppDbContext(options);
    }

    /// <summary>
    /// Resolves the base connection string in the owner-mandated order:
    /// <c>TEST_CONNECTION_STRING</c> env var first (CI), then the dev SA
    /// connection string recorded in <c>docs/DEVELOPMENT_CREDENTIALS.md</c>.
    /// The docs path is resolved by walking up from the test binary, never
    /// hardcoded, because the test output directory is several levels below the
    /// repository root and differs between build configurations.
    /// Throws if neither yields a value: silently skipping would let a green run
    /// mean "nothing was verified".
    /// </summary>
    private static string ResolveBaseConnectionString()
    {
        var fromEnv = Environment.GetEnvironmentVariable("TEST_CONNECTION_STRING");
        if (!string.IsNullOrWhiteSpace(fromEnv))
            return fromEnv;

        var credentialsPath = FindCredentialsFile();
        if (credentialsPath != null)
        {
            var fromDocs = ParseConnectionString(credentialsPath);
            if (!string.IsNullOrWhiteSpace(fromDocs))
                return fromDocs;
        }

        throw new InvalidOperationException(
            "No SQL Server connection string for integration tests. " +
            "Option 1: set the TEST_CONNECTION_STRING environment variable. " +
            "Option 2: add a 'Server=' connection string to docs/DEVELOPMENT_CREDENTIALS.md. " +
            "See docs/LAUNCH_GUIDE_LINUX.md or docs/LAUNCH_GUIDE_WINDOWS.md, section 'Test prerequisites'. " +
            "These tests are not skipped because SQL Server is the entire point of this project.");
    }

    /// <summary>
    /// Walks up from the test binary to the repository root looking for
    /// <c>docs/DEVELOPMENT_CREDENTIALS.md</c>. AGENTS.md 3.4 requires resolving
    /// from <c>AppContext.BaseDirectory</c> rather than assuming the working
    /// directory, which is the test output folder, not the repo root.
    /// </summary>
    private static string? FindCredentialsFile()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, "docs", "DEVELOPMENT_CREDENTIALS.md");
            if (File.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }
        return null;
    }

    /// <summary>
    /// Pulls the first <c>Server=</c> connection string out of the credentials
    /// markdown. The file is a table of key/value rows; the Linux/Docker
    /// connection string appears as a plain line. Only the Server= line is used,
    /// never the SA password row, so the fixture cannot pick up a bare password
    /// and misinterpret it as a connection string.
    /// </summary>
    private static string? ParseConnectionString(string path)
    {
        foreach (var line in File.ReadLines(path))
        {
            var trimmed = line.Trim().Trim('`', '|', ' ');
            if (!trimmed.StartsWith("Server=", StringComparison.OrdinalIgnoreCase)) continue;
            if (!trimmed.Contains("Database=", StringComparison.OrdinalIgnoreCase)) continue;
            return trimmed;
        }
        return null;
    }
}

/// <summary>
/// Binds every integration test to one shared database. Collection fixtures are
/// created once per collection, and tests inside a collection do not run in
/// parallel with each other.
/// </summary>
[CollectionDefinition(Name)]
public class SqlServerCollection : ICollectionFixture<SqlServerTestDatabase>
{
    public const string Name = "sqlserver";
}