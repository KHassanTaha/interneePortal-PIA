using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskSummarySettingsColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "SignatureRequired",
                table: "AttendanceSettings",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<double>(
                name: "TaskThresholdPct",
                table: "AttendanceSettings",
                type: "float",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.UpdateData(
                table: "AttendanceSettings",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "SignatureRequired", "TaskThresholdPct" },
                values: new object[] { false, 80.0 });

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$4gI3C70MiUcrMjbhnO/.CuXvxMgw/VI1b68TaHlJbI6cVr9TUfNma");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SignatureRequired",
                table: "AttendanceSettings");

            migrationBuilder.DropColumn(
                name: "TaskThresholdPct",
                table: "AttendanceSettings");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$.fu3/nY.aq17GVIwOjm9wuBtlzkgJE8tSy6iLQm8ErLAenSlr28Ze");
        }
    }
}
