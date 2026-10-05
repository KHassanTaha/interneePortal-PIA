-- ==============================================================
-- PIA Intern System - APPEND: 15 ERP interns under kashif (Mentor 73)
-- Purpose: multi-intern gate-pass issuing test
-- Run after full_seed.sql.  Rerun-safe (aborts if usernames exist).
-- 2026-09-11
-- Password (interns): Test@123
-- ==============================================================
USE InternSystemDB;
GO
SET NOCOUNT ON;
GO

-- GUARD: abort if first intern username already exists
IF EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'zain.ERP.021')
BEGIN
    RAISERROR('append_erp_15_interns.sql: already applied (zain.ERP.021 exists). Aborting.', 16, 1);
    RETURN;
END
GO

-- 1. USERS (317-331) -- 15 interns, Role=Intern
SET IDENTITY_INSERT dbo.Users ON;
GO
INSERT INTO dbo.Users (Id, Username, PasswordHash, Role, IsActive, CreatedAt, RefreshToken, RefreshTokenExpiry)
VALUES
(317, N'zain.ERP.021',    N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(318, N'fatima.ERP.022',  N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(319, N'hassan.ERP.023',  N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(320, N'ayesha.ERP.024',  N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(321, N'hamza.ERP.025',   N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(322, N'sana.ERP.026',    N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(323, N'usman.ERP.027',   N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(324, N'hira.ERP.028',    N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(325, N'bilal.ERP.029',   N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(326, N'maham.ERP.030',   N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(327, N'affan.ERP.031',   N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(328, N'nimra.ERP.032',   N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(329, N'saad.ERP.033',    N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(330, N'rimsha.ERP.034',  N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL),
(331, N'daniyal.ERP.035', N'$2a$11$Nu8PAI.DPRmGITwPkR282OFmnZYPmgS6Zner8oJEF7PA7FW9lOa9.', N'Intern', 1, '2026-09-11 09:00:00.0000000', NULL, NULL);
GO
SET IDENTITY_INSERT dbo.Users OFF;
GO

-- 2. INTERNS (242-256) -- all under kashif (MentorId=73, DeptId=1)
--    FaceEnrollmentStatus=Approved + FaceEnrolled=1 so the gate-pass
--    request/approval gates pass.  FaceEmbeddingJson stays NULL (no real
--    ML pipeline; no FaceEnrollmentRecords; no photos).
SET IDENTITY_INSERT dbo.Interns ON;
GO
INSERT INTO dbo.Interns (Id, UserId, MentorId, DepartmentId, ShiftId, FullName, CNIC, University, Degree, Gender, StartDate, EndDate, FaceEmbeddingJson, FaceEnrolled, FaceEnrollmentStatus, FaceEnrolledAt, FaceApprovedByUserId, FaceRejectedReason, CreatedAt)
VALUES
(242, 317, 73, 1, 1, N'Zain Ul Abideen',  N'42101-5678234-1', N'SZABIST',        N'BS Computer Science',        0, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(243, 318, 73, 1, 1, N'Fatima Noor',      N'42102-3489127-3', N'NED University', N'BS Software Engineering',     1, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(244, 319, 73, 1, 1, N'Hassan Raza',      N'42103-7823456-5', N'Fast-NUCES',     N'BS Computer Science',         0, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(245, 320, 73, 1, 1, N'Ayesha Siddiqui',  N'42104-9234871-7', N'IBA Karachi',    N'BS Information Systems',      1, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(246, 321, 73, 1, 1, N'Hamza Tariq',      N'42105-1456892-9', N'Comsats',        N'BS Computer Science',         0, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(247, 322, 73, 1, 1, N'Sana Malik',       N'42106-2367413-1', N'SZABIST',        N'BS Software Engineering',     1, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(248, 323, 73, 1, 1, N'Usman Ghani',      N'42107-5678324-3', N'NED University', N'BS Computer Engineering',     0, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(249, 324, 73, 1, 1, N'Hira Shah',        N'42108-9123456-5', N'PUCIT',          N'BS Information Technology',    1, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(250, 325, 73, 1, 1, N'Bilal Khan',       N'42109-6734218-7', N'Fast-NUCES',     N'BS Computer Science',         0, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(251, 326, 73, 1, 1, N'Maham Fatima',     N'42110-2341789-1', N'IBA Karachi',    N'BS Computer Science',         1, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(252, 327, 73, 1, 1, N'Affan Sheikh',     N'42111-8456123-3', N'SZABIST',        N'BS Information Systems',      0, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(253, 328, 73, 1, 1, N'Nimra Aftab',      N'42112-6789456-5', N'NED University', N'BS Software Engineering',     1, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(254, 329, 73, 1, 1, N'Saad Mehmood',     N'42113-9812347-7', N'UET Lahore',     N'BS Computer Science',         0, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(255, 330, 73, 1, 1, N'Rimsha Tariq',     N'42114-5673891-9', N'Fast-NUCES',     N'BS Computer Science',         1, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000'),
(256, 331, 73, 1, 1, N'Daniyal Ahmed',    N'42115-3421786-1', N'IBA Karachi',    N'BS Information Systems',      0, '2026-09-14 09:00:00.0000000', '2026-12-20 17:00:00.0000000', NULL, 1, N'Approved', '2026-09-11 09:00:00.0000000', 1, NULL, '2026-09-11 09:00:00.0000000');
GO
SET IDENTITY_INSERT dbo.Interns OFF;
GO

-- 3. DOCUMENT UPLOADS (1432-1476) -- 3 per intern, all Approved
--    OfficialDocsApprovedAsync requires Cnic + Resume Approved; UniversityId
--    is added to match seed convention and the gate-pass StudentIdImage
--    fallback (InternController.cs:774).
SET IDENTITY_INSERT dbo.DocumentUploads ON;
GO
INSERT INTO dbo.DocumentUploads (Id, InternId, DocumentType, FilePath, OriginalFileName, Status, ApprovedByUserId, ApprovedAt, UploadedAt)
VALUES
-- Zain (InternId 242)
(1432, 242, N'Cnic',       N'documents/242/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:10:00.0000000', '2026-09-11 09:05:00.0000000'),
(1433, 242, N'UniversityId', N'documents/242/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:10:00.0000000', '2026-09-11 09:05:00.0000000'),
(1434, 242, N'Resume',     N'documents/242/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:10:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Fatima (243)
(1435, 243, N'Cnic',       N'documents/243/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:11:00.0000000', '2026-09-11 09:05:00.0000000'),
(1436, 243, N'UniversityId', N'documents/243/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:11:00.0000000', '2026-09-11 09:05:00.0000000'),
(1437, 243, N'Resume',     N'documents/243/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:11:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Hassan (244)
(1438, 244, N'Cnic',       N'documents/244/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:12:00.0000000', '2026-09-11 09:05:00.0000000'),
(1439, 244, N'UniversityId', N'documents/244/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:12:00.0000000', '2026-09-11 09:05:00.0000000'),
(1440, 244, N'Resume',     N'documents/244/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:12:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Ayesha (245)
(1441, 245, N'Cnic',       N'documents/245/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:13:00.0000000', '2026-09-11 09:05:00.0000000'),
(1442, 245, N'UniversityId', N'documents/245/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:13:00.0000000', '2026-09-11 09:05:00.0000000'),
(1443, 245, N'Resume',     N'documents/245/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:13:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Hamza (246)
(1444, 246, N'Cnic',       N'documents/246/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:14:00.0000000', '2026-09-11 09:05:00.0000000'),
(1445, 246, N'UniversityId', N'documents/246/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:14:00.0000000', '2026-09-11 09:05:00.0000000'),
(1446, 246, N'Resume',     N'documents/246/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:14:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Sana (247)
(1447, 247, N'Cnic',       N'documents/247/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:15:00.0000000', '2026-09-11 09:05:00.0000000'),
(1448, 247, N'UniversityId', N'documents/247/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:15:00.0000000', '2026-09-11 09:05:00.0000000'),
(1449, 247, N'Resume',     N'documents/247/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:15:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Usman (248)
(1450, 248, N'Cnic',       N'documents/248/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:16:00.0000000', '2026-09-11 09:05:00.0000000'),
(1451, 248, N'UniversityId', N'documents/248/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:16:00.0000000', '2026-09-11 09:05:00.0000000'),
(1452, 248, N'Resume',     N'documents/248/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:16:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Hira (249)
(1453, 249, N'Cnic',       N'documents/249/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:17:00.0000000', '2026-09-11 09:05:00.0000000'),
(1454, 249, N'UniversityId', N'documents/249/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:17:00.0000000', '2026-09-11 09:05:00.0000000'),
(1455, 249, N'Resume',     N'documents/249/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:17:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Bilal (250)
(1456, 250, N'Cnic',       N'documents/250/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:18:00.0000000', '2026-09-11 09:05:00.0000000'),
(1457, 250, N'UniversityId', N'documents/250/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:18:00.0000000', '2026-09-11 09:05:00.0000000'),
(1458, 250, N'Resume',     N'documents/250/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:18:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Maham (251)
(1459, 251, N'Cnic',       N'documents/251/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:19:00.0000000', '2026-09-11 09:05:00.0000000'),
(1460, 251, N'UniversityId', N'documents/251/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:19:00.0000000', '2026-09-11 09:05:00.0000000'),
(1461, 251, N'Resume',     N'documents/251/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:19:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Affan (252)
(1462, 252, N'Cnic',       N'documents/252/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:20:00.0000000', '2026-09-11 09:05:00.0000000'),
(1463, 252, N'UniversityId', N'documents/252/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:20:00.0000000', '2026-09-11 09:05:00.0000000'),
(1464, 252, N'Resume',     N'documents/252/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:20:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Nimra (253)
(1465, 253, N'Cnic',       N'documents/253/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:21:00.0000000', '2026-09-11 09:05:00.0000000'),
(1466, 253, N'UniversityId', N'documents/253/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:21:00.0000000', '2026-09-11 09:05:00.0000000'),
(1467, 253, N'Resume',     N'documents/253/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:21:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Saad (254)
(1468, 254, N'Cnic',       N'documents/254/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:22:00.0000000', '2026-09-11 09:05:00.0000000'),
(1469, 254, N'UniversityId', N'documents/254/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:22:00.0000000', '2026-09-11 09:05:00.0000000'),
(1470, 254, N'Resume',     N'documents/254/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:22:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Rimsha (255)
(1471, 255, N'Cnic',       N'documents/255/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:23:00.0000000', '2026-09-11 09:05:00.0000000'),
(1472, 255, N'UniversityId', N'documents/255/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:23:00.0000000', '2026-09-11 09:05:00.0000000'),
(1473, 255, N'Resume',     N'documents/255/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:23:00.0000000', '2026-09-11 09:05:00.0000000'),
-- Daniyal (256)
(1474, 256, N'Cnic',       N'documents/256/Cnic/cnic.pdf',            N'cnic.pdf',       N'Approved', 316, '2026-09-11 09:24:00.0000000', '2026-09-11 09:05:00.0000000'),
(1475, 256, N'UniversityId', N'documents/256/UniversityId/university_id.jpg', N'university_id.jpg', N'Approved', 316, '2026-09-11 09:24:00.0000000', '2026-09-11 09:05:00.0000000'),
(1476, 256, N'Resume',     N'documents/256/Resume/resume.pdf',        N'resume.pdf',     N'Approved', 316, '2026-09-11 09:24:00.0000000', '2026-09-11 09:05:00.0000000');
GO
SET IDENTITY_INSERT dbo.DocumentUploads OFF;
GO

-- 4. GATE PASSES (1117-1131) -- Pending, ready for batch-approve.
--    Uses approved UniversityId/Cnic doc paths as image refs.
--    (The PDF is a text letter; images are not embedded.)
SET IDENTITY_INSERT dbo.GatePasses ON;
GO
INSERT INTO dbo.GatePasses (Id, InternId, StudentIdImagePath, CnicImagePath, Status, ApprovedByMentorId, ApprovedAt, PdfPath, RequestedAt)
VALUES
(1117, 242, N'documents/242/UniversityId/university_id.jpg', N'documents/242/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1118, 243, N'documents/243/UniversityId/university_id.jpg', N'documents/243/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1119, 244, N'documents/244/UniversityId/university_id.jpg', N'documents/244/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1120, 245, N'documents/245/UniversityId/university_id.jpg', N'documents/245/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1121, 246, N'documents/246/UniversityId/university_id.jpg', N'documents/246/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1122, 247, N'documents/247/UniversityId/university_id.jpg', N'documents/247/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1123, 248, N'documents/248/UniversityId/university_id.jpg', N'documents/248/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1124, 249, N'documents/249/UniversityId/university_id.jpg', N'documents/249/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1125, 250, N'documents/250/UniversityId/university_id.jpg', N'documents/250/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1126, 251, N'documents/251/UniversityId/university_id.jpg', N'documents/251/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1127, 252, N'documents/252/UniversityId/university_id.jpg', N'documents/252/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1128, 253, N'documents/253/UniversityId/university_id.jpg', N'documents/253/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1129, 254, N'documents/254/UniversityId/university_id.jpg', N'documents/254/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1130, 255, N'documents/255/UniversityId/university_id.jpg', N'documents/255/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000'),
(1131, 256, N'documents/256/UniversityId/university_id.jpg', N'documents/256/Cnic/cnic.pdf', N'Pending', NULL, NULL, NULL, '2026-09-11 09:30:00.0000000');
GO
SET IDENTITY_INSERT dbo.GatePasses OFF;
GO

-- 5. VERIFY
PRINT '--- append_erp_15_interns.sql: SUCCESS ---';
PRINT '15 users (317-331) | 15 interns (242-256) | 45 docs (1432-1476) | 15 gate passes (1117-1131)';
PRINT 'All interns assigned to Mentor 73 (kashif), Dept 1 (ERP), face=Approved, docs=Approved, gate passes=Pending.';
PRINT 'Log in as kashif -> Gate Passes -> select all 15 -> Batch Approve.';
PRINT '';
SELECT 'Users added'          AS metric, COUNT(*) AS cnt FROM dbo.Users          WHERE Id BETWEEN 317 AND 331;
SELECT 'Interns added'        AS metric, COUNT(*) AS cnt FROM dbo.Interns        WHERE Id BETWEEN 242 AND 256;
SELECT 'Docs added'           AS metric, COUNT(*) AS cnt FROM dbo.DocumentUploads WHERE Id BETWEEN 1432 AND 1476;
SELECT 'GatePasses added'     AS metric, COUNT(*) AS cnt FROM dbo.GatePasses     WHERE Id BETWEEN 1117 AND 1131;
SELECT 'ERP dept interns'     AS metric, COUNT(*) AS cnt FROM dbo.Interns        WHERE DepartmentId = 1;
SELECT 'Mentor 73 interns'    AS metric, COUNT(*) AS cnt FROM dbo.Interns        WHERE MentorId = 73;
SELECT 'Pending GP (all)'     AS metric, COUNT(*) AS cnt FROM dbo.GatePasses     WHERE Status = N'Pending';
SELECT 'New interns face OK'  AS metric, COUNT(*) AS cnt FROM dbo.Interns        WHERE Id BETWEEN 242 AND 256 AND FaceEnrollmentStatus = N'Approved';
SELECT 'New interns 3 docs OK' AS metric, COUNT(*) AS cnt FROM (
  SELECT InternId FROM dbo.DocumentUploads
  WHERE InternId BETWEEN 242 AND 256 AND Status = N'Approved' AND WithdrawnAt IS NULL
  GROUP BY InternId
  HAVING COUNT(*) = 3
) t;
GO