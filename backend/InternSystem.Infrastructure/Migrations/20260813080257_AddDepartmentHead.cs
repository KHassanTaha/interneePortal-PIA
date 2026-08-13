using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDepartmentHead : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DepartmentHeadId",
                table: "Certificates",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DepartmentHeads",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Designation = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SignatureImagePath = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DepartmentHeads", x => x.Id);
                });

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$HG4cYuT.LdOXI5Ic2PUBOukWMioX95njQJKPYkRNSQFSeIwRfJPWm");

            migrationBuilder.CreateIndex(
                name: "IX_Certificates_DepartmentHeadId",
                table: "Certificates",
                column: "DepartmentHeadId");

            migrationBuilder.AddForeignKey(
                name: "FK_Certificates_DepartmentHeads_DepartmentHeadId",
                table: "Certificates",
                column: "DepartmentHeadId",
                principalTable: "DepartmentHeads",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Certificates_DepartmentHeads_DepartmentHeadId",
                table: "Certificates");

            migrationBuilder.DropTable(
                name: "DepartmentHeads");

            migrationBuilder.DropIndex(
                name: "IX_Certificates_DepartmentHeadId",
                table: "Certificates");

            migrationBuilder.DropColumn(
                name: "DepartmentHeadId",
                table: "Certificates");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$7rWT.zBWco6a/254VGg7XOA3FL69inekscgZeRPZ8YdGkYCdVvIcC");
        }
    }
}
