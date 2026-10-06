using InternSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;
using Xunit.Abstractions;

namespace InternSystem.Core.Tests;

public class ProviderProbe
{
    private readonly ITestOutputHelper _o;
    public ProviderProbe(ITestOutputHelper o) => _o = o;

    [Fact]
    public void Full_model_builds_under_InMemory()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase("probe").Options;
        using var db = new AppDbContext(opts);
        var entities = db.Model.GetEntityTypes().Count();
        _o.WriteLine($"entity types = {entities}");
        db.Database.EnsureCreated();
        Assert.True(entities > 0);
    }
}
