# Backend test suite

Three test projects. What each one is allowed to do is decided by whether the
code under test touches a database, not by convenience.

| Test project | Provider | What it covers |
|--------------|----------|----------------|
| `InternSystem.Core.Tests` | None | Pure functions: `AttendanceScoringService` status/weight helpers, sync logic, the `FaceEnrolled` mirror rules. No DB. |
| `InternSystem.Integration.Tests` | SQL Server (ephemeral DB per run) | Everything that touches a `DbContext`: CAS transitions (D-12), EF constraints (FK, unique), raw SQL, batch counters, document-and-face gate. |
| `InternSystem.API.Tests` | None yet | Integration-test scaffolding. Populated as controllers are covered per AGENTS.md 6.1. |

SQLite was evaluated and rejected because the production model uses
`HasColumnType("nvarchar(max)")`, which is SQL Server-only DDL. Do not attempt
to make SQLite work by editing production model configuration.

InMemory was evaluated and rejected because it cannot execute raw SQL,
does not enforce FK or unique constraints, and diverges from production
behaviour in ways a high-reliability system cannot tolerate.

There is no InMemory project. If you find one, delete it.

## Why SQL Server, concretely

Not a preference. Three defects in this repository were only exposed by running
against a real server:

- `Intern.Id` is an `IDENTITY` column. An in-memory provider let the tests assign
  ids explicitly; SQL Server rejects that outright.
- `Interns` has foreign keys to `Users` and `Mentors`. An in-memory provider
  accepted dangling ids silently, so a seed that referenced nothing would still
  have "passed".
- `InternTransferRequest.Status` is `nvarchar` via `HasConversion<string>()`. A
  raw enum sent to SQL Server as an int makes it coerce `'Pending'` to int for
  the comparison and fail. Enum values passed to raw SQL must be `.ToString()`,
  which is what the production call sites already do.

`StateTransitions.TryUpdateAsync` is the D-12 compare-and-swap helper. It issues
raw `UPDATE` SQL through `GetDbConnection()`. No in-memory provider can execute
it at all, so the CAS guarantee is only verifiable here.

## Running

```bash
cd backend
dotnet test
```

SQL Server must be reachable. Resolution order:

1. `TEST_CONNECTION_STRING` environment variable.
2. The `Server=` connection string recorded in `docs/DEVELOPMENT_CREDENTIALS.md`,
   located by walking up from the test binary.
3. If neither is present the fixture **throws**. These tests are never skipped:
   a green run must mean something was actually verified.

See `docs/DEV_LAUNCH.md`, section "Test prerequisites".

## Database lifecycle

One database per run, named `InternSystemTest_{Guid}`. Created with
`Database.EnsureCreated()` from the current EF model, never with migrations —
AGENTS.md 4.10 forbids migrations because the snapshot is stale, and calling
`Migrate()` would replay that stale history onto tables `EnsureCreated` already
made. Dropped on fixture disposal with `SINGLE_USER WITH ROLLBACK IMMEDIATE` so
a pooled connection cannot block the drop.

The fixture **overrides `Database=`** in whatever connection string it resolved.
A connection string naming the developer's `InternSystemDB` still produces a
separate ephemeral database, so no test can touch working data by accident.

Tests share one database and reset between each other via
`SqlServerTestDatabase.ResetAsync()`, which clears data tables but preserves the
`HasData` seed rows that `ComputeAsync` reads by literal id. Without that reset a
holiday seeded by one test is visible to every later test and results depend on
ordering.

The fixture discovers FK dependencies at construction. Do not add tables to a
hand-maintained list -- the schema is the source of truth. If a new table needs to
be excluded from reset for a specific test, do that in the test, not in the
fixture.

Parallelism is not disabled globally. These tests share one collection fixture,
and xUnit serialises tests within a collection while running separate
collections in parallel.