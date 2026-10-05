using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMentorIdToDepartmentHeads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MentorId",
                table: "DepartmentHeads",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_DepartmentHeads_MentorId",
                table: "DepartmentHeads",
                column: "MentorId");

            migrationBuilder.AddForeignKey(
                name: "FK_DepartmentHeads_Mentors_MentorId",
                table: "DepartmentHeads",
                column: "MentorId",
                principalTable: "Mentors",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DepartmentHeads_Mentors_MentorId",
                table: "DepartmentHeads");

            migrationBuilder.DropIndex(
                name: "IX_DepartmentHeads_MentorId",
                table: "DepartmentHeads");

            migrationBuilder.DropColumn(
                name: "MentorId",
                table: "DepartmentHeads");
        }
    }
}
