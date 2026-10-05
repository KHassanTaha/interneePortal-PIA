# PIA Intern System — Attendance Scoring, Certificates, Transfers, Shifts & Mentor Parity

## 0. Context & status
The app was recovered to a working GPS-only attendance MVP. The previous feature set
(password eye-toggle + `autoCapitalize`, `DateField`, narrowed mentors filter, mentor
**department**-transfer flow, promote-to-signatory, intern-detail docs/attendance/face) is
**code-complete but emulator-verify pending**. This plan covers the **new scope** plus
**mentor-portal parity**, bringing mentor up to admin level while keeping strict role
encapsulation.

Authoritative frontend: `InternApp/` (the `mobile/` folder is a STALE duplicate — ignore it).
Safety branch: `backup/recovered-all`.

Environment recap:
- Emulator `emulator-5554` (Pixel7), package `com.internapp`, Metro `:8081`.
- `API_BASE_URL = http://10.0.2.2:5000/api`.
- Backend `0.0.0.0:5000`, SQL Server `.\SQLEXPRESS` `InternSystemDB` (Windows auth).
- Creds: `admin`, `intern1`, `mentor1` — passwords in `docs/DEVELOPMENT_CREDENTIALS.md`.
- pkill/pgrep bracket rule: `[m]etro`, `[I]nternSystem[.]API`, `[q]emu-system`, `[e]mulator`.
- strings rule: .NET string literals UTF-16LE (`strings -e l`).

## 1. Design decisions (locked)

### Attendance model
- Two dimensions: **Arrival** (InTime vs Shift.Start ± Grace) and **Departure**
  (OutTime vs Shift.End ± Grace).
- Statuses (per dimension): `OnTime=1`, `Early=1`, `Late=0.5`, `Pending=0`; whole-day
  `Absent` / `OnLeave` = 0. **Daily max = 2.0**.
- No shift assigned → default **morning** company shift.
- Out-time: intern re-uses the attendance system (Session In / Session Out).
  - Out with no in-row → create `Attendance` with `ArrivalStatus = Pending` (and fill OutTime).
  - No check-out → `DepartureStatus = Pending`.

### Scoring
- `Attendance% = Σ dailyScore over [StartDate, EndDate] / (2.0 × totalDays) × 100`.
- **Weekends auto-full** (2.0).
- **Public holidays** via `PublicHoliday` table (admin CRUD) = full score for that day.
- `GraceMinutes` (default 15) and `ThresholdPct` (e.g. 80) live in `AttendanceSettings`
  (admin-set, single-row config).

### Certificate gate
- Eligible only when `EndDate <= today` **AND** `Attendance% >= ThresholdPct`.
- Enforced in `ApplyForCertificate` and again on admin approve.

### Shifts
- 3 seeded company-wide standard shifts + mentor-created **department-scoped** custom shifts.
- Intern `ShiftId` set by admin/mentor at account creation (intern does NOT pick).
- Shift change: **mentor initiates → intern accepts** (sets `Intern.ShiftId`). No admin involved.

### Intern transfer (state machine)
`Pending → Endorsed → InternAccepted → Finalised` (Rejected at any pre-finalise step).
- Flow A (admin initiates): admin → **current mentor endorses** → intern accepts →
  **new (ToMentor) mentor finalises**.
- Flow B (current mentor initiates): current mentor → **admin endorses** → intern accepts →
  **new mentor finalises**.
- **Admin can only endorse, never finalise.** Target = specific `ToMentorId`.
- Distinct from `MentorTransferRequest` (the mentor's OWN department reassignment).

### Constraints
- **C1:** Start date cannot be in the past (`StartDate >= today`) — backend-validated + UI
  `minimumDate`.
- **C2:** Intern attendance date picker limited to `[StartDate, min(EndDate, today)]`.

## 2. Backend entities (new / changed)
- `Attendance` (extend): add `OutTime?`, `ArrivalStatus` (enum), `DepartureStatus` (enum),
  `IsOnLeave`.
- `Shift`: `Id, Name, StartTime, EndTime, IsCompanyWide, DepartmentId?`.
- `AttendanceSettings`: `Id (=1), GraceMinutes, ThresholdPct`.
- `PublicHoliday`: `Id, Date, Name`.
- `InternTransferRequest`: `Id, InternId, FromMentorId, ToMentorId, InitiatedBy(Admin|Mentor),
  Status, EndorsedById?, InternAcceptedAt?, FinalisedById?, Notes`.
- `InternShiftChangeRequest`: `Id, InternId, FromShiftId, ToShiftId, RequestedById(Mentor),
  InternAcceptedAt?, Status`.
- Enums: `ArrivalStatus {Pending, OnTime, Early, Late, Absent, OnLeave}`,
  `DepartureStatus {Pending, OnTime, Late, Early, Absent, OnLeave}`,
  `TransferInitiator {Admin, Mentor}`, `RequestStatus {Pending, Endorsed, InternAccepted,
  Finalised, Rejected}`.

## 3. Backend endpoints

### Attendance
- `POST /intern/attendance/checkout` (Session Out) — extends existing In flow.
- `PUT /admin/attendance/{id}` — admin edits any row (times/status/leave).
- `PUT /mentor/attendance/{id}` — mentor edits **own interns only** (ownership guard).
- `GET /admin/attendance` (keep `internId`, add `date`); `GET /mentor/attendance` (add `date`).

### Scoring / certificate
- `AttendanceScoringService.ComputePercentage(internId)` shared (weekends + holidays).
- `POST /intern/certificates/apply` + `GET /intern/certificates/eligibility`
  (returns % + eligible bool).
- Admin approve (`/admin/certificates/{id}/approve`) re-checks the gate.

### Intern transfer
- `POST /admin/interns/{id}/transfer`, `POST /admin/transfers/{id}/endorse`,
  `POST /admin/transfers/{id}/finalise`, `GET /admin/transfers`.
- `POST /mentor/interns/{id}/transfer`, `POST /mentor/transfers/{id}/endorse`,
  `POST /mentor/transfers/{id}/finalise`, `GET /mentor/intern-transfers`.
- `POST /intern/transfers/{id}/accept`, `GET /intern/transfers`.

### Shift / settings / holidays
- `GET /admin/settings`, `PUT /admin/settings`.
- `GET/POST/PUT/DELETE /admin/holidays`.
- `GET /admin/shifts` (company + all dept), `GET /mentor/shifts` (company + own dept).
- `POST /mentor/shifts` (force `DepartmentId = mentor.DeptId`, ignore client value).
- `POST /mentor/interns/{id}/shift-change`; `POST /intern/shift-change/{id}/accept`.

### Mentor intern CRUD
- `GET /mentor/interns/{id}` (detail), `GET /mentor/interns/{id}/documents`
  (uploaded + issued), `PUT /mentor/interns/{id}` (edit basic fields),
  reuse `PATCH /mentor/interns/{id}/reset-password`.

## 4. Permission / encapsulation matrix
| Capability | Admin | Mentor | Intern |
|---|---|---|---|
| Attendance read | any | own interns | self |
| Attendance edit | any | own interns | — |
| Intern create | ✓ (+shift) | ✓ (+shift, own dept) | — |
| Intern edit / reset pw | ✓ | ✓ own | — |
| Intern transfer initiate | ✓ | ✓ own | — |
| Intern transfer endorse | no (endorse only) | current mentor | — |
| Intern transfer finalise | no | ToMentor | — |
| Intern transfer accept | — | — | ✓ |
| Shift custom create | — (sees all) | own dept | — |
| Shift change | — | initiate | accept |
| Settings / holidays | ✓ | read shifts only | — |
| Cert approve | ✓ (gate) | ✓ (gate) | apply |

All mentor routes stay `[Authorize(Roles="Mentor,Admin")]` with **ownership guards**
(default-deny). Attendance/transfer/edit/shift endpoints must verify the intern belongs to
the mentor (or mentor is ToMentor/FromMentor as required).

## 5. Frontend layout (`InternApp/src/` — `mobile/` is stale, ignore)

### intern/
- `AttendanceScreen`: add Check-Out button (Session Out); enforce date clamp C2.
- `TransfersScreen`: incoming transfer accept.
- `ShiftChangeScreen`: accept incoming shift change.
- `CertificateScreen`: eligibility indicator + apply (disabled until eligible).

### admin/
- `AdminInternsScreen`: shift selector on create; transfer section in edit modal;
  detail already has docs/attendance/face — add eligibility + attendance edit.
- `AdminTransfersScreen` (NEW): transfer mgmt (endorse / finalise).
- `SettingsScreen` (NEW): grace/threshold + public-holiday CRUD.
- `ShiftsScreen` (NEW): view company + dept shifts.

### mentor/
- `MentorInternsScreen` (NEW): list + detail (docs/attendance/face) scoped to own interns.
- `AttendanceViewScreen`: swap TextInput date → `DateField`, clamp C2, add edit in/out
  for own interns.
- `MentorInternTransfersScreen` (NEW): separate from `TransferRequestsScreen`
  (which is the mentor's own department transfer). Handles intern transfers:
  initiate / endorse / finalise.
- `MentorShiftsScreen` (NEW): view company shifts, create own-dept custom shifts.
- `CreateInternScreen`: add shift selector; `minimumDate = today` (C1).
- `MentorEditInternScreen` (NEW): edit basic fields + reset password.
- `DashboardScreen`: unchanged (dashboard enrichment declined).

### navigation/RootNavigator.js
- Add mentor tabs `Interns`, `InternTransfers`, `Shifts`; register `MentorEditInternScreen`.

### Shared components
- `PasswordInput`, `DateField`: apply `DateField` to `AttendanceViewScreen`;
  enforce `minimumDate` / `maximumDate` for C1 / C2.

## 6. Implementation order
1. Backend entities + EF migrations (Attendance extend, Shift, AttendanceSettings,
   PublicHoliday, InternTransferRequest, InternShiftChangeRequest) + seed 3 company shifts
   and an `AttendanceSettings` row.
2. Backend: check-out flow + status computation; `AttendanceScoringService`.
3. Backend: attendance edit endpoints (admin + mentor, ownership-guarded).
4. Backend: certificate gate (apply + approve).
5. Backend: intern transfer endpoints (admin + mentor + intern) + state machine.
6. Backend: shift-change + shift/settings/holidays endpoints; mentor intern detail/documents/edit.
7. Frontend admin screens (create shift, transfer section, attendance edit + eligibility,
   transfers mgmt, settings/holidays, cert indicator).
8. Frontend mentor parity (list/detail, attendance upgrade+edit, intern transfers,
   shifts, create shift + C1, edit/reset, eligibility).
9. Frontend intern (check-out, transfer accept, shift-change accept).
10. Build backend; `run-android --deviceId emulator-5554`; seed heavy dummy data; manual verify.

## 7. Verification & seed
- `dotnet build`; `Add-Migration` + `Update-Database` (SQL Server `.\SQLEXPRESS`
  `InternSystemDB`, Windows auth).
- Seed: 3 company shifts; `AttendanceSettings` row (GraceMinutes=15, ThresholdPct=80);
  sample departments/mentors/interns; ~1 month of mixed attendance (on-time/late/early/
  absent/weekend/holiday); 1–2 in-flight intern transfers + shift changes.
- `npx react-native run-android --deviceId emulator-5554`; Metro `:8081`.
- Manual checks (admin/mentor/intern): check-out writes OutTime; scoring % matches;
  cert gated; transfer state machine end-to-end for both flows; shift change
  mentor→intern; mentor gets 403 editing other mentors' interns; C1/C2 enforced.

## 8. Risks / caveats
- `mobile/` duplicate must never be edited.
- `MentorTransferRequest` (mentor's own department move) is unrelated to
  `InternTransferRequest` — keep screens separate to avoid confusion.
- All mentor attendance/transfer/edit/shift endpoints require ownership guards; default-deny.
- Face register remains UI-only (base64 provided later); no stored image path on `Intern`.
- Previous feature set (items 1–8) is code-complete; emulator verification still pending and
  should be re-confirmed after this scope lands.
