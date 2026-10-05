using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFaceEnrollmentApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FaceApprovedByUserId",
                table: "Interns",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FaceEnrolledAt",
                table: "Interns",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FaceEnrollmentStatus",
                table: "Interns",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "NotEnrolled");

            migrationBuilder.AddColumn<string>(
                name: "FaceRejectedReason",
                table: "Interns",
                type: "nvarchar(max)",
                nullable: true);

            // Backfill: interns already enrolled before this migration are treated as approved
            migrationBuilder.Sql("UPDATE Interns SET FaceEnrollmentStatus = 'Approved' WHERE FaceEnrolled = 1");

            migrationBuilder.UpdateData(
                table: "Departments",
                keyColumn: "Id",
                keyValue: 1,
                column: "RadiusMeters",
                value: 100.0);

            migrationBuilder.UpdateData(
                table: "Departments",
                keyColumn: "Id",
                keyValue: 2,
                column: "RadiusMeters",
                value: 100.0);

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$m6vCiJ16SzuXeW6tmIwQxuwWFvXQfRM7l3rGUNJrKXiw4KWnfxvOy");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FaceApprovedByUserId",
                table: "Interns");

            migrationBuilder.DropColumn(
                name: "FaceEnrolledAt",
                table: "Interns");

            migrationBuilder.DropColumn(
                name: "FaceEnrollmentStatus",
                table: "Interns");

            migrationBuilder.DropColumn(
                name: "FaceRejectedReason",
                table: "Interns");

            migrationBuilder.UpdateData(
                table: "Departments",
                keyColumn: "Id",
                keyValue: 1,
                column: "RadiusMeters",
                value: 30.0);

            migrationBuilder.UpdateData(
                table: "Departments",
                keyColumn: "Id",
                keyValue: 2,
                column: "RadiusMeters",
                value: 30.0);

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$/eLXbwSIjQqiN06mBRrhdeDfpdMONvsYR6soX1Qrl3Md9B3ew9wqK");
        }
    }
}
