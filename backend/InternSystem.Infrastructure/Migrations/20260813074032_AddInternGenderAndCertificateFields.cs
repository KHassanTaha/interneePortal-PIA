using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInternGenderAndCertificateFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Gender",
                table: "Interns",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DepartmentHeadName",
                table: "Certificates",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InternWork",
                table: "Certificates",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TechStack",
                table: "Certificates",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$7rWT.zBWco6a/254VGg7XOA3FL69inekscgZeRPZ8YdGkYCdVvIcC");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Gender",
                table: "Interns");

            migrationBuilder.DropColumn(
                name: "DepartmentHeadName",
                table: "Certificates");

            migrationBuilder.DropColumn(
                name: "InternWork",
                table: "Certificates");

            migrationBuilder.DropColumn(
                name: "TechStack",
                table: "Certificates");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$sUTOHexkYRuEuyoXa6VpneHbmda7GxkZjTpilTSAlX/Yr5s6dUMLC");
        }
    }
}
