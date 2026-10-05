using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDepartmentIdToDepartmentHeads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DepartmentId",
                table: "DepartmentHeads",
                type: "int",
                nullable: true);

            migrationBuilder.Sql("UPDATE DepartmentHeads SET DepartmentId = (SELECT TOP 1 Id FROM Departments ORDER BY Id) WHERE DepartmentId IS NULL");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$w29UnmK/h0WUkQ0Xn/9sceByVs0bbdLfbFDySX60sy4KpPRFzGAJ6");

            migrationBuilder.CreateIndex(
                name: "IX_DepartmentHeads_DepartmentId",
                table: "DepartmentHeads",
                column: "DepartmentId");

            migrationBuilder.AddForeignKey(
                name: "FK_DepartmentHeads_Departments_DepartmentId",
                table: "DepartmentHeads",
                column: "DepartmentId",
                principalTable: "Departments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DepartmentHeads_Departments_DepartmentId",
                table: "DepartmentHeads");

            migrationBuilder.DropIndex(
                name: "IX_DepartmentHeads_DepartmentId",
                table: "DepartmentHeads");

            migrationBuilder.DropColumn(
                name: "DepartmentId",
                table: "DepartmentHeads");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$HG4cYuT.LdOXI5Ic2PUBOukWMioX95njQJKPYkRNSQFSeIwRfJPWm");
        }
    }
}
