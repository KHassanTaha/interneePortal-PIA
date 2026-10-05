using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCertificateHighlightAndReport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "HighlightTaskId",
                table: "Certificates",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReportPath",
                table: "Certificates",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Certificates_HighlightTaskId",
                table: "Certificates",
                column: "HighlightTaskId");

            migrationBuilder.AddForeignKey(
                name: "FK_Certificates_Tasks_HighlightTaskId",
                table: "Certificates",
                column: "HighlightTaskId",
                principalTable: "Tasks",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Certificates_Tasks_HighlightTaskId",
                table: "Certificates");

            migrationBuilder.DropIndex(
                name: "IX_Certificates_HighlightTaskId",
                table: "Certificates");

            migrationBuilder.DropColumn(
                name: "HighlightTaskId",
                table: "Certificates");

            migrationBuilder.DropColumn(
                name: "ReportPath",
                table: "Certificates");
        }
    }
}
