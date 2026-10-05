using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ShiftsAttendSettingsTransfers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ShiftId",
                table: "Interns",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ArrivalStatus",
                table: "Attendances",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "Pending");

            migrationBuilder.AddColumn<string>(
                name: "DepartureStatus",
                table: "Attendances",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "Pending");

            migrationBuilder.AddColumn<bool>(
                name: "IsOnLeave",
                table: "Attendances",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "OutTime",
                table: "Attendances",
                type: "datetime2",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AttendanceSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    GraceMinutes = table.Column<int>(type: "int", nullable: false),
                    ThresholdPct = table.Column<double>(type: "float", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AttendanceSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InternTransferRequests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    InternId = table.Column<int>(type: "int", nullable: false),
                    FromMentorId = table.Column<int>(type: "int", nullable: false),
                    ToMentorId = table.Column<int>(type: "int", nullable: false),
                    InitiatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InitiatedByUserId = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EndorsedByUserId = table.Column<int>(type: "int", nullable: true),
                    EndorsedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    InternAcceptedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    FinalisedByUserId = table.Column<int>(type: "int", nullable: true),
                    FinalisedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RejectionReason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InternTransferRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InternTransferRequests_Interns_InternId",
                        column: x => x.InternId,
                        principalTable: "Interns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InternTransferRequests_Mentors_FromMentorId",
                        column: x => x.FromMentorId,
                        principalTable: "Mentors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InternTransferRequests_Mentors_ToMentorId",
                        column: x => x.ToMentorId,
                        principalTable: "Mentors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InternTransferRequests_Users_EndorsedByUserId",
                        column: x => x.EndorsedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InternTransferRequests_Users_FinalisedByUserId",
                        column: x => x.FinalisedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InternTransferRequests_Users_InitiatedByUserId",
                        column: x => x.InitiatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PublicHolidays",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PublicHolidays", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Shifts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    StartTime = table.Column<TimeSpan>(type: "time", nullable: false),
                    EndTime = table.Column<TimeSpan>(type: "time", nullable: false),
                    IsCompanyWide = table.Column<bool>(type: "bit", nullable: false),
                    DepartmentId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Shifts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Shifts_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InternShiftChangeRequests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    InternId = table.Column<int>(type: "int", nullable: false),
                    FromShiftId = table.Column<int>(type: "int", nullable: false),
                    ToShiftId = table.Column<int>(type: "int", nullable: false),
                    RequestedByUserId = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InternAcceptedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RejectionReason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InternShiftChangeRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InternShiftChangeRequests_Interns_InternId",
                        column: x => x.InternId,
                        principalTable: "Interns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InternShiftChangeRequests_Shifts_FromShiftId",
                        column: x => x.FromShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InternShiftChangeRequests_Shifts_ToShiftId",
                        column: x => x.ToShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InternShiftChangeRequests_Users_RequestedByUserId",
                        column: x => x.RequestedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "AttendanceSettings",
                columns: new[] { "Id", "GraceMinutes", "ThresholdPct" },
                values: new object[] { 1, 15, 80.0 });

            migrationBuilder.InsertData(
                table: "Shifts",
                columns: new[] { "Id", "DepartmentId", "EndTime", "IsCompanyWide", "Name", "StartTime" },
                values: new object[,]
                {
                    { 1, null, new TimeSpan(0, 17, 0, 0, 0), true, "Morning", new TimeSpan(0, 9, 0, 0, 0) },
                    { 2, null, new TimeSpan(0, 21, 0, 0, 0), true, "Afternoon", new TimeSpan(0, 13, 0, 0, 0) },
                    { 3, null, new TimeSpan(0, 5, 0, 0, 0), true, "Night", new TimeSpan(0, 21, 0, 0, 0) }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Interns_ShiftId",
                table: "Interns",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_InternShiftChangeRequests_FromShiftId",
                table: "InternShiftChangeRequests",
                column: "FromShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_InternShiftChangeRequests_InternId",
                table: "InternShiftChangeRequests",
                column: "InternId");

            migrationBuilder.CreateIndex(
                name: "IX_InternShiftChangeRequests_RequestedByUserId",
                table: "InternShiftChangeRequests",
                column: "RequestedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InternShiftChangeRequests_ToShiftId",
                table: "InternShiftChangeRequests",
                column: "ToShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_InternTransferRequests_EndorsedByUserId",
                table: "InternTransferRequests",
                column: "EndorsedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InternTransferRequests_FinalisedByUserId",
                table: "InternTransferRequests",
                column: "FinalisedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InternTransferRequests_FromMentorId",
                table: "InternTransferRequests",
                column: "FromMentorId");

            migrationBuilder.CreateIndex(
                name: "IX_InternTransferRequests_InitiatedByUserId",
                table: "InternTransferRequests",
                column: "InitiatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InternTransferRequests_InternId",
                table: "InternTransferRequests",
                column: "InternId");

            migrationBuilder.CreateIndex(
                name: "IX_InternTransferRequests_ToMentorId",
                table: "InternTransferRequests",
                column: "ToMentorId");

            migrationBuilder.CreateIndex(
                name: "IX_PublicHolidays_Date",
                table: "PublicHolidays",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_Shifts_DepartmentId",
                table: "Shifts",
                column: "DepartmentId");

            migrationBuilder.AddForeignKey(
                name: "FK_Interns_Shifts_ShiftId",
                table: "Interns",
                column: "ShiftId",
                principalTable: "Shifts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Interns_Shifts_ShiftId",
                table: "Interns");

            migrationBuilder.DropTable(
                name: "AttendanceSettings");

            migrationBuilder.DropTable(
                name: "InternShiftChangeRequests");

            migrationBuilder.DropTable(
                name: "InternTransferRequests");

            migrationBuilder.DropTable(
                name: "PublicHolidays");

            migrationBuilder.DropTable(
                name: "Shifts");

            migrationBuilder.DropIndex(
                name: "IX_Interns_ShiftId",
                table: "Interns");

            migrationBuilder.DropColumn(
                name: "ShiftId",
                table: "Interns");

            migrationBuilder.DropColumn(
                name: "ArrivalStatus",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "DepartureStatus",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "IsOnLeave",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "OutTime",
                table: "Attendances");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$FqGjG0/X3gaUZkrjGWsxNOC86QD2mNm2S8ZSOs2CpfLiiX1mBd.CC");
        }
    }
}
