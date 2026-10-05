using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionFaceConfidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "FaceConfidence",
                table: "AttendanceVerificationSessions",
                type: "float",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$xUeEbK6APvu5ixjQa1zQaeS8xYW9P/yZ.1q4HPZhXJb1NZ8bj4lMS");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FaceConfidence",
                table: "AttendanceVerificationSessions");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$m6vCiJ16SzuXeW6tmIwQxuwWFvXQfRM7l3rGUNJrKXiw4KWnfxvOy");
        }
    }
}
