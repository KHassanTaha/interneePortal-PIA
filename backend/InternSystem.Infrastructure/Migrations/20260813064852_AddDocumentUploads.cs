using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternSystem.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentUploads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "GpsAccuracy",
                table: "Attendances",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "LocationVerified",
                table: "Attendances",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "VerificationSessionId",
                table: "Attendances",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AttendanceVerificationSessions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionGuid = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    InternId = table.Column<int>(type: "int", nullable: false),
                    DepartmentId = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LocationVerified = table.Column<bool>(type: "bit", nullable: false),
                    LivenessVerified = table.Column<bool>(type: "bit", nullable: false),
                    FaceVerified = table.Column<bool>(type: "bit", nullable: false),
                    Latitude = table.Column<double>(type: "float", nullable: true),
                    Longitude = table.Column<double>(type: "float", nullable: true),
                    GpsAccuracy = table.Column<double>(type: "float", nullable: true),
                    DistanceFromDepartment = table.Column<double>(type: "float", nullable: true),
                    FailureReason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AttendanceVerificationSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AttendanceVerificationSessions_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AttendanceVerificationSessions_Interns_InternId",
                        column: x => x.InternId,
                        principalTable: "Interns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AttendanceVerificationSessions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DocumentUploads",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    InternId = table.Column<int>(type: "int", nullable: false),
                    DocumentType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FilePath = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ApprovedByUserId = table.Column<int>(type: "int", nullable: true),
                    ApprovedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RejectionReason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    WithdrawnAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UploadedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentUploads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentUploads_Interns_InternId",
                        column: x => x.InternId,
                        principalTable: "Interns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DocumentUploads_Users_ApprovedByUserId",
                        column: x => x.ApprovedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$sUTOHexkYRuEuyoXa6VpneHbmda7GxkZjTpilTSAlX/Yr5s6dUMLC");

            migrationBuilder.CreateIndex(
                name: "IX_AttendanceVerificationSessions_DepartmentId",
                table: "AttendanceVerificationSessions",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_AttendanceVerificationSessions_InternId",
                table: "AttendanceVerificationSessions",
                column: "InternId");

            migrationBuilder.CreateIndex(
                name: "IX_AttendanceVerificationSessions_UserId",
                table: "AttendanceVerificationSessions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentUploads_ApprovedByUserId",
                table: "DocumentUploads",
                column: "ApprovedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentUploads_InternId",
                table: "DocumentUploads",
                column: "InternId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AttendanceVerificationSessions");

            migrationBuilder.DropTable(
                name: "DocumentUploads");

            migrationBuilder.DropColumn(
                name: "GpsAccuracy",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "LocationVerified",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "VerificationSessionId",
                table: "Attendances");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$L6VjsXyoFJyhMQHw02FMrekMGpQTDgtSKF3Ee8KfwwoYaCP67Be/S");
        }
    }
}
