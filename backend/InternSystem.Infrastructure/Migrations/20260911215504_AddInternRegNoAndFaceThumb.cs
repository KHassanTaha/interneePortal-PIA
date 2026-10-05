using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInternRegNoAndFaceThumb : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RegNo",
                table: "Interns",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PhotoThumbPath",
                table: "FaceEnrollmentRecords",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$jlabe7hZwmFqIFA0UWbpveCrNWpu3/Avs936MOiEgKQWyG1H1OdUi");

            migrationBuilder.CreateIndex(
                name: "IX_Interns_RegNo",
                table: "Interns",
                column: "RegNo",
                unique: true,
                filter: "[RegNo] IS NOT NULL AND [RegNo] <> ''");

            // Backfill RegNo for existing interns: sequential per (department, creation year),
            // mirroring GenerateRegNoAsync's PIA/INT/{DEPT}/{Year}/{Seq:D4} format.
            migrationBuilder.Sql(@"
                ;WITH cte AS (
                    SELECT i.Id,
                           'PIA/INT/' + REPLACE(REPLACE(UPPER(COALESCE(d.Code, 'DEPT')), ' ', ''), '-', '')
                             + '/' + CONVERT(VARCHAR(4), YEAR(i.CreatedAt))
                             + '/' + RIGHT('0000' + CONVERT(VARCHAR(4),
                                       ROW_NUMBER() OVER (PARTITION BY i.DepartmentId, YEAR(i.CreatedAt) ORDER BY i.Id)), 4)
                             AS NewRegNo
                    FROM Interns i
                    JOIN Departments d ON d.Id = i.DepartmentId
                )
                UPDATE Interns SET RegNo = cte.NewRegNo
                FROM cte WHERE Interns.Id = cte.Id;");

            // Seed REG.{DEPT}.{year} trackers at the max assigned sequence so future
            // RegNos continue the range instead of restarting at 0001.
            migrationBuilder.Sql(@"
                INSERT INTO InternSerialTrackers (Prefix, LastSerial)
                SELECT 'REG.' + REPLACE(REPLACE(UPPER(COALESCE(d.Code, 'DEPT')), ' ', ''), '-', '')
                         + '.' + CONVERT(VARCHAR(4), YEAR(i.CreatedAt)),
                       MAX(CONVERT(INT, RIGHT(i.RegNo, 4)))
                FROM Interns i
                JOIN Departments d ON d.Id = i.DepartmentId
                WHERE i.RegNo <> ''
                GROUP BY d.Id, d.Code, YEAR(i.CreatedAt);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Interns_RegNo",
                table: "Interns");

            migrationBuilder.DropColumn(
                name: "RegNo",
                table: "Interns");

            migrationBuilder.DropColumn(
                name: "PhotoThumbPath",
                table: "FaceEnrollmentRecords");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$hKvamsjORn6zLRpoYMDHXeD9z9VrY9G6rrIPHTMjp8wWEjEPFjfcK");
        }
    }
}
