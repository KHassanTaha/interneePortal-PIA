# PIA Intern System — Work Report

## Date: 2026-08-31

## Overview
Delivered the new system scope (attendance out-time + scoring, certificate eligibility
gate, intern transfer state machine, shift management & shift change) and brought the
**mentor portal to full parity with admin** across backend and frontend. Backend is
code-complete and API-tested; frontend feature screens implemented and deployed to the
Android emulator.

## Environment
- Emulator `emulator-5554` (Pixel7), package `com.internapp`, Metro `:8081`
- `API_BASE_URL = http://10.0.2.2:5000/api`
- Backend `0.0.0.0:5000`, SQL Server `localhost,1433` `InternSystemDB` (sa on Linux dev)
- Branch: `backup/recovered-all`

## Design decisions (locked)
- **Scoring**: daily max 2.0. Arrival OnTime=1/Early=1/Late=0.5/Pending=0; Departure
  OnTime=1/Late=1/Early=0.5/Pending=0; Absent/OnLeave=0. Boundary = shift times ± Grace.
- **Attendance %**: Σ dailyScore / (2.0 × totalDays) × 100 over [StartDate, EndDate];
  weekends & public holidays auto-full. Threshold admin-set. Cert gate: EndDate ≤ today
  AND % ≥ threshold.
- **Shifts**: 3 seeded company-wide + mentor dept custom; intern set at creation;
  no shift → default Morning.
- **Out-time**: intern re-uses attendance; Out with no in-row → ArrivalStatus=Pending.
- **Intern transfer**: Pending → Endorsed → InternAccepted → Finalised (Rejected). Flow A
  admin→mentor endorse→intern accept→toMentor finalise; Flow B mentor→admin endorse→…
  Admin only endorses, never finalises.
- Reject guards: mentor/admin only when Pending; intern only when Endorsed.

## Completed — Backend
- Entities: `Shift`, `AttendanceSettings`, `PublicHoliday`, `InternTransferRequest`,
  `InternShiftChangeRequest` created; `Attendance` extended (OutTime, ArrivalStatus,
  DepartureStatus, IsOnLeave); `Intern` extended (ShiftId).
- `AppDbContext` — new DbSets, Fluent configs, seed (3 shifts + settings row).
- `AttendanceScoringService` — status/score functions, ComputeAsync, shift/settings lookups.
- `AttendanceVerificationController` — CompleteAttendance computes ArrivalStatus;
  `POST /attendance/checkout`.
- `InternController` — scoring, eligibility, transfers, shift-change, certificate gate,
  MarkAttendance sets ArrivalStatus=Absent when out-of-range.
- `MentorController` — full parity: shifts, shift-changes, intern transfers, intern
  detail/documents/edit, attendance edit, certificate gate, reset-intern-password.
- `AdminController` — settings, holidays, shifts (GET), intern transfers, attendance edit,
  certificate gate, create/update intern with ShiftId+C1.
- Migration `20260831080459_ShiftsAttendSettingsTransfers` applied.
- E2E API tests: transfer flows A & B, all guards, attendance edit + score recompute,
  checkout with no in-row, certificate eligibility.

## Completed — Frontend
- Admin: `SettingsScreen`, `AdminTransfersScreen`, `ShiftsScreen` (new);
  `AdminInternsScreen` (shift selector).
- Mentor: `MentorInternsScreen`, `MentorInternTransfersScreen`, `MentorShiftsScreen`,
  `MentorEditInternScreen` (new); `CreateInternScreen` (shift + C1); `AttendanceViewScreen`
  (edit + statuses).
- Intern: `TransfersScreen`, `ShiftChangeScreen`, `CertificateScreen` (new); check-out in
  `AttendanceScreen`.
- `RootNavigator` & `RightSidebar` tabs/menu for 3 roles; `Icon` `settings` added.

## Completed — Emulator Deployment (2026-08-31)
- Pixel7 launched/booted; `assembleDebug` built, app installed, launched.
- Metro serving bundle; app running, no fatal errors.

## Test Seed Data
- 5 interns (ERP & Cyber), shifts Morning/Afternoon/Night.
- ~59 attendance rows over 3 weeks → Ayesha 44%, Bilal 47.8%, Fatima 50%, Sara 75%.
- 4 shifts (3 company + 1 ERP), settings 15min/80%.
- Pending transfer: Bilal → Habiba (admin-initiated) for UI walkthrough.

## Login Credentials
> Passwords are centralized in `docs/DEVELOPMENT_CREDENTIALS.md` (gitignored).

| Role | Username |
|------|----------|
| Admin | admin |
| Mentor ERP | Muneeb_ERP_001 |
| Mentor Cyber | Habiba_PIA_001 |
| Interns | ayesha/bilal/fatima/sara/yoab .PIA.001 |

## Notes
- In-app notifications NOT implemented yet (planned next session).
- Full feature TODO for next session is captured in `PIA-Interns-App-Planned-Features.md`.
- Full seed-data design is captured in `PIA-Interns-App-Seed-Data-Guide.md`.
