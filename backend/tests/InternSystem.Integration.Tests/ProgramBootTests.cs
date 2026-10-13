using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace InternSystem.Integration.Tests;

public class ProgramBootTests : IClassFixture<SqlServerTestDatabase>
{
    private readonly SqlServerTestDatabase _db;

    public ProgramBootTests(SqlServerTestDatabase db)
    {
        _db = db;
    }

    [Fact]
    public void Program_boots_without_exception()
    {
        Environment.SetEnvironmentVariable("Jwt__Key", "TestKeyForIntegrationTesting123456");
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", _db.ConnectionString);
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();
        Assert.NotNull(client);
    }
}
