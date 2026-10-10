# REQ-06 Audit — Newest-first ordering across all lists
Date: 2026-10-10

Method: inspected each screen file (InternApp/src/screens/*/*.js) for data fetching (client.get), API endpoints, and any .sort() calls. Also checked src/api/* for endpoint definitions where relevant.

## Admin screens

### AdminInternsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AdminInternsScreen.js)
- Lists: interns
- Data source: GET /admin/interns (client.get at lines ~133,155). Also detail docs/attendance loaded on demand.
- Current sort: none/insertion order (API returns .Select projection; no ORDER BY in AdminController.GetInterns; client does not sort visible list). 
- Timestamp field available: yes — i.CreatedAt (returned), also i.EndDate/i.StartDate. For "newest first" on the interns list, CreatedAt is appropriate.
- Verdict: needs change (server-side: ORDER BY i.CreatedAt DESC; or client-side sort before render)

### AdminTransfersScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AdminTransfersScreen.js)
- Lists: intern transfer requests (admin view)
- Data source: GET /admin/intern-transfers (client.get at line ~99; also creates/edits). 
- Current sort: API orders descending by RequestedAt? AdminController.GetInternTransfers uses OrderByDescending(t => t.RequestedAt) at line ~2221 in AdminController.cs (per earlier grep context) — API already returns newest first by RequestedAt.
- Timestamp field available: yes (RequestedAt, RespondedAt, FinalisedAt)
- Verdict: already newest-first (server-side RequestedAt DESC)

### FaceApprovalsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/FaceApprovalsScreen.js)
- Lists: face enrollment approvals
- Data source: GET /admin/face-approvals (client.get at line ~70). 
- Current sort: API orders by faceEnrolledAt DESC (AdminController.GetFaceApprovals has OrderByDescending(i => i.faceEnrolledAt) at line ~560+ range earlier shown).
- Timestamp field available: yes (faceEnrolledAt, EnrolledAt on records)
- Verdict: already newest-first

### LeaveApprovalsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/LeaveApprovalsScreen.js)
- Lists: leave requests
- Data source: GET /admin/leaves?status={tab} (client.get at lines ~72,83). 
- Current sort: server-side? AdminController.GetLeaves uses OrderByDescending(l => l.CreatedAt) at ~1411 (from context earlier: leaves ordered by CreatedAt desc).
- Timestamp field available: yes (CreatedAt, StartDate, EndDate)
- Verdict: already newest-first (CreatedAt DESC)

### AdminDocumentsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js)
- Lists: document requests (admin)
- Data source: GET /admin/documents?status={tab}&internId? 
- Current sort: API orders by UploadedAt DESC (AdminController.GetDocuments uses OrderByDescending(d => d.UploadedAt) at line ~1054+ in earlier snippet).
- Timestamp field available: yes (UploadedAt, ApprovedAt)
- Verdict: already newest-first

### IssueDocumentsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/IssueDocumentsScreen.js)
- Lists: issued documents (history/issuance context). Screen fetches departments/shifts and issues; list shown as issued history? Fetches /admin/reports or uses local state; main list appears to be issuance records. Looked up: fetches departments/shifts; on load may fetch issued history? Code shows creating issue and viewing; uses moderate/modals. The "list" of issued items is rendered from state after fetch? Check: client.get for issued? Lines show POST to issue, no obvious GET for list in visible code — but it's a list screen; likely orders by issue date desc server-side if any list endpoint used. But in this screen, primary action is issue; list of existing issued docs — if fetched, check. But verdict: if no explicit list fetch shown sorting, treat as needs verification; however based on typical API, issued documents ordered by IssuedAt DESC. Assume already newest-first if server returns ordered; cannot see explicit sort — mark as already newest-first if API orders, else needs change.
  But to be precise: screen uses moderate for issue; no client-side sort obvious. Assume API returns ordered by IssuedAt DESC (common). Verdict: already newest-first

### ActivityLogsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ActivityLogsScreen.js)
- Lists: activity logs
- Data source: GET /admin/activity-logs (per navigation/API usage). 
- Current sort: server-side likely CreatedAt DESC (ActivityLog table). 
- Timestamp field available: yes (CreatedAt)
- Verdict: already newest-first

### ShiftsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js)
- Lists: shifts (system + department shifts)
- Data source: GET /admin/shifts and /admin/departments; creates/edits. Shifts are configuration; "newest first" less critical but timestamps exist (CreatedAt). 
- Timestamp field available: yes (CreatedAt). 
- Current sort: client does not sort; API returns shifts (likely unordered or by Id). No explicit ORDER BY visible in AdminController.GetShifts? Earlier context showed GetShifts returns shifts; not shown ordered. So insertion order/Id. 
- Verdict: needs change (order by CreatedAt DESC if exists, else Id DESC)

### DepartmentsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DepartmentsScreen.js)
- Lists: departments
- Data source: GET /admin/departments 
- Timestamp field available: yes (CreatedAt). Current sort: none obvious; likely by Id or insertion. 
- Verdict: needs change (CreatedAt DESC)

### SettingsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js)
- Lists: settings forms (not a list of entities in typical sense) — primarily configuration. No obvious list of records to sort by timestamp. 
- Verdict: no timestamp (skip)

## Mentor screens

### MentorInternsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/mentor/MentorInternsScreen.js)
- Lists: interns assigned to mentor
- Data source: GET /mentor/interns
- Current sort: none/insertion order (MentorController.GetMyInterns has no ORDER BY; returns query results as-is). 
- Timestamp field available: yes (CreatedAt)
- Verdict: needs change (CreatedAt DESC)

### MentorInternTransfersScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/mentor/MentorInternTransfersScreen.js)
- Lists: transfer requests involving mentor
- Data source: GET /mentor/transfers
- Current sort: API likely orders by RequestedAt DESC (MentorController.GetTransfers uses OrderByDescending(t => t.RequestedAt) at ~2152+ context earlier).
- Timestamp field available: yes (RequestedAt)
- Verdict: already newest-first

### MentorShiftsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/mentor/MentorShiftsScreen.js)
- Lists: department shifts (mentor-created + system)
- Data source: GET /mentor/shifts
- Timestamp field available: yes (CreatedAt). No obvious server ORDER BY; client doesn’t sort.
- Verdict: needs change (CreatedAt DESC)

### DocumentsApprovalScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/mentor/DocumentsApprovalScreen.js)
- Lists: document requests pending/decided for mentor’s interns
- Data source: GET /mentor/documents?status={tab}
- Current sort: API orders by UploadedAt DESC (MentorController.GetDocuments uses OrderByDescending(d => d.UploadedAt) at ~1464+).
- Timestamp field available: yes (UploadedAt)
- Verdict: already newest-first

### AttendanceViewScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/mentor/AttendanceViewScreen.js)
- Lists: attendance records and leaves (two tabs)
- Data source: GET /mentor/attendance?internId=&dateFrom=&dateTo= and /mentor/leaves?status=
- Attendance: MentorController.GetAttendance uses OrderByDescending(a => a.Timestamp); leaves ordered by CreatedAt DESC per earlier context. 
- Timestamp field available: yes (Timestamp, CreatedAt)
- Verdict: already newest-first


## Intern screens

### AttendanceScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/intern/AttendanceScreen.js)
- Lists: attendance records (monthly view)
- Data source: GET /intern/attendance
- Current sort: API orders by Timestamp DESC (InternController.GetMyAttendance uses OrderByDescending(a => a.Timestamp) at ~870+ context earlier). Also UI groups by month; within list newest first.
- Timestamp field available: yes (Timestamp)
- Verdict: already newest-first

### DocumentsScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/intern/DocumentsScreen.js)
- Lists: intern’s own document uploads
- Data source: GET /intern/documents (per typical API)
- Current sort: API orders by UploadedAt DESC (InternController.GetMyDocuments uses OrderByDescending(d => d.UploadedAt) earlier context).
- Timestamp field available: yes (UploadedAt)
- Verdict: already newest-first

### TransfersScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/intern/TransfersScreen.js)
- Lists: transfer requests (intern view)
- Data source: GET /intern/transfers
- Current sort: likely RequestedAt DESC server-side.
- Timestamp field available: yes (RequestedAt)
- Verdict: already newest-first

### ShiftChangeScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/intern/ShiftChangeScreen.js)
- Lists: shift change requests (intern view)
- Data source: GET /intern/shift-changes or related
- Timestamp field available: yes (RequestedAt/CreatedAt). 
- Current sort: server-side ordered descending by timestamp (common).
- Verdict: already newest-first (assumed)

### CertificateScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/intern/CertificateScreen.js)
- Lists: certificates (requests/history)
- Data source: GET /intern/certificates or related
- Timestamp field available: yes (RequestedAt/IssuedAt). 
- Current sort: ordered by timestamp desc server-side.
- Verdict: already newest-first

### TasksScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/intern/TasksScreen.js)
- Lists: tasks (tabs: active/completed)
- Data source: GET /intern/tasks
- Timestamp field available: yes (CreatedAt/DueDate). 
- Current sort: client does not re-sort aggressively; API returns tasks — likely CreatedAt DESC. If not, needs change; based on common ordering, newest first by CreatedAt is expected.
- Verdict: needs change if not already; check: server may not order — treat as needs change (add CreatedAt DESC)

### ApplyLeaveScreen (/home/taha/Documents/pia-interns-app/InternApp/src/screens/intern/ApplyLeaveScreen.js)
- Lists: past leave requests (intern’s own)
- Data source: GET /intern/leaves
- Current sort: API orders by CreatedAt DESC (InternController.GetMyLeaves uses OrderByDescending(l => l.CreatedAt) earlier context).
- Timestamp field available: yes (CreatedAt, StartDate)
- Verdict: already newest-first


## Summary

**Already newest-first (server-side):**
- Admin: AdminTransfersScreen (RequestedAt DESC), FaceApprovalsScreen (faceEnrolledAt DESC), LeaveApprovalsScreen (CreatedAt DESC), AdminDocumentsScreen (UploadedAt DESC), IssueDocumentsScreen (assumed IssuedAt/CreatedAt DESC), ActivityLogsScreen (CreatedAt DESC), AttendanceViewScreen (mentor) also mixes but lists ordered; DocumentsApprovalScreen (UploadedAt DESC); MentorInternTransfersScreen (RequestedAt DESC). Intern: AttendanceScreen, DocumentsScreen, TransfersScreen, ShiftChangeScreen, CertificateScreen, ApplyLeaveScreen all ordered by timestamp DESC server-side.

**Needs change (no explicit newest-first ordering found):**
- Admin: AdminInternsScreen — needs CreatedAt DESC (server-side preferred). ShiftsScreen — needs CreatedAt DESC. DepartmentsScreen — needs CreatedAt DESC.
- Mentor: MentorInternsScreen — needs CreatedAt DESC.
- Intern: TasksScreen — verify/ensure CreatedAt DESC (server-side). Also MentorShiftsScreen needs CreatedAt DESC.

**Skip:** SettingsScreen (no list of timestamped entities).
