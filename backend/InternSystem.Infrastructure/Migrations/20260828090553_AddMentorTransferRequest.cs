using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMentorTransferRequest : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MentorTransferRequests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MentorId = table.Column<int>(type: "int", nullable: false),
                    FromDepartmentId = table.Column<int>(type: "int", nullable: false),
                    ToDepartmentId = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InitiatedByAdminId = table.Column<int>(type: "int", nullable: false),
                    RespondedByMentorId = table.Column<int>(type: "int", nullable: true),
                    FinalisedByAdminId = table.Column<int>(type: "int", nullable: true),
                    MentorNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AdminNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RespondedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    FinalisedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MentorTransferRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MentorTransferRequests_Departments_FromDepartmentId",
                        column: x => x.FromDepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MentorTransferRequests_Departments_ToDepartmentId",
                        column: x => x.ToDepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MentorTransferRequests_Mentors_MentorId",
                        column: x => x.MentorId,
                        principalTable: "Mentors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MentorTransferRequests_Users_FinalisedByAdminId",
                        column: x => x.FinalisedByAdminId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MentorTransferRequests_Users_InitiatedByAdminId",
                        column: x => x.InitiatedByAdminId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MentorTransferRequests_Users_RespondedByMentorId",
                        column: x => x.RespondedByMentorId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$FqGjG0/X3gaUZkrjGWsxNOC86QD2mNm2S8ZSOs2CpfLiiX1mBd.CC");

            migrationBuilder.CreateIndex(
                name: "IX_MentorTransferRequests_FinalisedByAdminId",
                table: "MentorTransferRequests",
                column: "FinalisedByAdminId");

            migrationBuilder.CreateIndex(
                name: "IX_MentorTransferRequests_FromDepartmentId",
                table: "MentorTransferRequests",
                column: "FromDepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_MentorTransferRequests_InitiatedByAdminId",
                table: "MentorTransferRequests",
                column: "InitiatedByAdminId");

            migrationBuilder.CreateIndex(
                name: "IX_MentorTransferRequests_MentorId",
                table: "MentorTransferRequests",
                column: "MentorId");

            migrationBuilder.CreateIndex(
                name: "IX_MentorTransferRequests_RespondedByMentorId",
                table: "MentorTransferRequests",
                column: "RespondedByMentorId");

            migrationBuilder.CreateIndex(
                name: "IX_MentorTransferRequests_ToDepartmentId",
                table: "MentorTransferRequests",
                column: "ToDepartmentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MentorTransferRequests");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$xUeEbK6APvu5ixjQa1zQaeS8xYW9P/yZ.1q4HPZhXJb1NZ8bj4lMS");
        }
    }
}
