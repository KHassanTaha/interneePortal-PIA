using Xunit;

namespace InternSystem.API.Tests;

/// <summary>
/// Guards the W2.0 scaffold. Every integration test in this project needs
/// WebApplicationFactory&lt;Program&gt;, which cannot resolve the entry point
/// if Program.cs stops declaring a public partial Program.
/// </summary>
public class ScaffoldTests
{
    /// <summary>
    /// Compiles only if <c>Program</c> is public. Program.cs uses top-level
    /// statements, which generate an internal class; the explicit
    /// <c>public partial class Program</c> at the end of that file is what
    /// makes this test resolve. Losing it fails here at compile time rather
    /// than at some later integration test's runtime.
    /// </summary>
    [Fact]
    public void Program_entry_point_is_visible_to_the_test_assembly()
    {
        var programType = typeof(Program);

        Assert.True(programType.IsPublic,
            "Program must be public for WebApplicationFactory<Program> to resolve it.");
    }
}
