-- ==============================================================
-- PIA Intern System - APPEND: Intern 242 certificate-ready demo
-- Purpose: fulfil every certificate gate for Intern 242 (Zain Ul
--          Abideen, zain.ERP.021, ERP Dept 1, Mentor 73/kashif)
--          so the admin dashboard shows a Pending certificate that
--          can be approved and PDF-generated in one click.
-- Rerun-safe: top guard aborts if a cert already exists for
--             intern 242; each batch is idempotent.
-- 2026-09-11
-- ==============================================================
USE InternSystemDB;
GO
SET NOCOUNT ON;
GO

-- GUARD: abort if certificate already exists for intern 242
IF EXISTS (SELECT 1 FROM dbo.Certificates WHERE InternId = 242)
BEGIN
    RAISERROR('append_intern_242_certificate.sql: certificate already exists for Intern 242. Aborting.', 16, 1);
    RETURN;
END
GO

-- 1. UPDATE INTERN DATES: set EndDate to past so the end-date gate passes.
--    StartDate 2026-08-03 (Mon), EndDate 2026-08-28 (Fri) = 4-week window.
--    Public holiday in DB: 2026-08-14 (Fri) auto-scores full marks.
UPDATE dbo.Interns
SET   StartDate = '2026-08-03 09:00:00',
      EndDate   = '2026-08-28 17:00:00'
WHERE Id = 242
  AND (StartDate <> '2026-08-03 09:00:00' OR EndDate <> '2026-08-28 17:00:00');
GO

-- 2. TASKS: 5 completed tasks assigned by Mentor 73 (kashif).
--    Task completion = 5/5 = 100% (threshold 80%).
--    Skip if tasks already seeded for intern 242.
IF NOT EXISTS (SELECT 1 FROM dbo.Tasks WHERE InternId = 242)
BEGIN
    INSERT INTO dbo.Tasks (InternId, AssignedByMentorId, Title, Description, Deadline, Status, CreatedAt, CompletedAt)
    VALUES
    (242, 73, N'ERP Module - TallyGo Invoice Ingestion',
            N'Build REST endpoint for TallyGo invoice data ingestion into the ERP staging layer.',
            '2026-08-15 17:00:00', N'Completed', '2026-08-03 09:00:00', '2026-08-07 16:00:00'),
    (242, 73, N'AS400 Back-end Integration',
            N'Integrate with AS400 RPG programs for order and ledger processing via DDMRR.',
            '2026-08-15 17:00:00', N'Completed', '2026-08-05 09:00:00', '2026-08-11 15:30:00'),
    (242, 73, N'Order-to-Cash Flow Implementation',
            N'Implement complete O2C flow: SalesOrder -> Invoice -> Payment posting.',
            '2026-08-15 17:00:00', N'Completed', '2026-08-07 09:00:00', '2026-08-12 17:00:00'),
    (242, 73, N'Unit Test Coverage - 80 Percent',
            N'Write NUnit tests for invoice validation and posting logic to reach 80% branch coverage.',
            '2026-08-15 17:00:00', N'Completed', '2026-08-10 09:00:00', '2026-08-15 18:00:00'),
    (242, 73, N'User Acceptance Testing',
            N'Prepare UAT scenarios and execute with finance team for sign-off.',
            '2026-08-22 17:00:00', N'Completed', '2026-08-12 09:00:00', '2026-08-20 16:30:00');
END
GO

-- 3. REPORT DOCUMENT: approved internship report (required by certificate gate).
--    Skip if already exists for intern 242.
IF NOT EXISTS (SELECT 1 FROM dbo.DocumentUploads WHERE InternId = 242 AND DocumentType = 'Report')
BEGIN
    INSERT INTO dbo.DocumentUploads
        (InternId, DocumentType, FilePath, OriginalFileName, Status, ApprovedByUserId, ApprovedAt, UploadedAt)
    VALUES
        (242, 'Report',
         N'documents/reports/242/internship-report.pdf',
         N'Internship-Report-Zain-Ul-Abideen.pdf',
         'Approved', 316, '2026-09-04 14:00:00', '2026-09-03 11:00:00');
END
GO

-- 4. ATTENDANCE: present on every weekday (skip weekends + Aug 14 holiday).
--    Window: 2026-08-03 (Mon) .. 2026-08-28 (Fri) = 26 calendar days.
--    Weekdays with rows: 19 | Holiday (Aug 14): 1 | Weekends: 6
--    Score = (19*2 + 1*2 + 6*2) / (26*2) = 100.0%  (threshold 80%).
--    Skip if attendance rows already exist for intern 242.
IF NOT EXISTS (SELECT 1 FROM dbo.Attendances WHERE InternId = 242)
BEGIN
    DECLARE @d DATE = '2026-08-03';
    WHILE @d <= '2026-08-28'
    BEGIN
        -- skip weekends (DATEFIRST 7: Sun=1, Sat=7) and public holiday Aug 14
        IF DATEPART(WEEKDAY, @d) NOT IN (1, 7)
           AND @d <> '2026-08-14'
        BEGIN
            INSERT INTO dbo.Attendances
                (InternId, Timestamp, OutTime, Latitude, Longitude, IsInRange, DistanceMeters,
                 FaceVerified, FaceConfidence, LivenessVerified, LocationVerified, GpsAccuracy,
                 Status, ArrivalStatus, DepartureStatus, IsOnLeave)
            VALUES
                (242,
                 DATEADD(SECOND, 32400, CAST(@d AS DATETIME)),   -- 09:00:00
                 DATEADD(SECOND, 61200, CAST(@d AS DATETIME)),   -- 17:00:00
                 24.8954, 67.1522,
                 1, 0,
                 1, 0.99, 1, 1, 5.0,
                 'Present', 'OnTime', 'OnTime', 0);
        END
        SET @d = DATEADD(DAY, 1, @d);
    END
END
GO

-- 5. CERTIFICATE (Pending) + ACTIVITY LOG
--    HighlightTaskId = first completed task for intern 242.
DECLARE @htId INT = (SELECT TOP 1 Id FROM dbo.Tasks WHERE InternId = 242 AND Status = 'Completed' ORDER BY Id);

INSERT INTO dbo.Certificates
    (InternId, ProjectName, ProjectOutcomes, LanguagesUsed, AdditionalNotes,
     HighlightTaskId, ReportPath, Status, AppliedAt)
VALUES
    (242,
     N'ERP Invoice Processing Module',
     N'Built and tested the TallyGo invoice processing pipeline integrated with AS400 back-end.',
     N'C#, SQL, ASP.NET, jQuery, AS400 RPG',
     N'PIA Fast CSEP2025 internship',
     @htId,
     N'documents/reports/242/internship-report.pdf',
     N'Pending',
     '2026-09-05 10:00:00');

INSERT INTO dbo.ActivityLogs (LogType, Description, PerformedByUserId, TargetInternId, DepartmentId, CreatedAt)
VALUES ('CertificateApplied',
        N'Certificate applied by ''Zain Ul Abideen''',
        317, 242, 1,
        '2026-09-05 10:00:00');
GO

-- 6. VERIFY
SELECT 'Certificate' AS k, Id, InternId, ProjectName, HighlightTaskId, ReportPath, Status
FROM dbo.Certificates WHERE InternId = 242;

SELECT 'Tasks' AS k, COUNT(*) AS Cnt,
       SUM(CASE WHEN Status = 'Completed' THEN 1 ELSE 0 END) AS Completed
FROM dbo.Tasks WHERE InternId = 242;

SELECT 'Attendances' AS k, COUNT(*) AS Cnt FROM dbo.Attendances WHERE InternId = 242;

SELECT 'ReportDoc' AS k, Id, DocumentType, Status
FROM dbo.DocumentUploads WHERE InternId = 242 AND DocumentType = 'Report';

SELECT 'InternDates' AS k, Id, FullName, StartDate, EndDate
FROM dbo.Interns WHERE Id = 242;
GO
