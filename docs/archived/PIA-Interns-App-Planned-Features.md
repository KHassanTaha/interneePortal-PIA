# PIA Intern System — Feature Scope, Requirements & Layout

## Status: Planned (next session)

This document defines scope/requirements/layout for (A) features already in the TODO list
and (B) features discussed & planned today (2026-09-01). Backend entities/migrations
follow existing patterns in `InternSystem.*`; frontend follows `InternApp/src/` conventions.

---

## A. Features already in the TODO list (remaining work)
These were scoped in PLAN.md and are partially/fully implemented on backend, with frontend
screens created and deployed. Remaining: emulator verification + heavy seed of the full flows.

### A1. Attendance out-time (check-out) — LAID OUT
- Backend `POST /attendance/checkout` (done). Sets OutTime + DepartureStatus; if no in-row,
  creates Attendance with ArrivalStatus=Pending.
- Frontend `AttendanceScreen` check-out button (done).

### A2. Scoring & certificate gate — LAID OUT
- Backend scoring service + `/intern/certificate/eligibility` + apply (done).
- Frontend `CertificateScreen` (done).

### A3. Intern transfer state machine — LAID OUT
- Flows A & B, guards (done backend + screens for admin/mentor/intern).

### A4. Shift management & shift-change — LAID OUT
- Mentor creates dept shift; intern accepts shift change (done).

### A5. Mentor parity — LAID OUT
- Mentor intern CRUD/edit/reset, attendance edit, transfers, shifts, create-intern shift+C1.

Remaining verification tasks (from PLAN §7):
- Full emulator walkthrough of transfer flows A & B end-to-end in UI.
- Verify C1 (startDate ≥ today) and C2 (attendance date clamp) in UI.
- Seed a heavier month of mixed attendance + multiple in-flight transfers/shift-changes.

---

## B. Features discussed & planned today (2026-09-01)

### B1. Configurable Leave Provision in Attendance Scoring
**Decision:** Leave = full score (2.0), count-limited.
- `AttendanceSettings` add `int AllowedLeaveDays = 0`.
- Migration add column.
- `UpdateSettingsRequest` add AllowedLeaveDays (validate 0–365); GET/PUT settings return it.
- `AttendanceScoringService.ComputeAsync`: on-leave days add 2.0 while `leaveUsed ≤
  AllowedLeaveDays`, else 0. Denominator (totalDays) unchanged. Expose LeaveUsed /
  AllowedLeaveDays in result + eligibility.
- UI: `SettingsScreen` add "Allowed Leave Days" numeric field.

### B2. Full In-App Notification System
New end-to-end for all roles.
- Entity `Notification`: Id, UserId, Title, Body, Type(enum), EntityType, EntityId,
  IsRead, CreatedAt. New DbSet + migration.
- `NotificationService` (scoped): NotifyAsync, GetForUserAsync, MarkRead, MarkAllRead,
  UnreadCount.
- `NotificationController` (`api/notification`): GET /, GET /unread-count, PUT /{id}/read,
  PUT /read-all.
- Triggers (profile-affecting): shift reassignment, intern transfer (all steps), shift-change,
  attendance edit/leave, password reset, certificate, mentor assignment on create.
- UI: `NotificationsScreen` (shared), RightSidebar "Notifications" + unread badge,
  RootNavigator tab for 3 roles, AppHeader bell + badge, notifications slice for count.

### B3. Admin Shifts — Full CRUD + Impact & Reassignment Guard
- `Shift` add `bool IsActive = true`; migration.
- Admin endpoints: POST /admin/shifts (company OR dept); PUT /admin/shifts/{id}
  (returns impact summary); PATCH /admin/shifts/{id}/toggle (with reassignShiftId);
  DELETE /admin/shifts/{id} (soft-disable + reassign); GET /admin/shifts/{id}/impact.
- Impact = affectedCount + byDepartment [{name,count}].
- Edit confirm dialog: "X people in Y department will be affected; they will be notified
  via in-app notifications."
- Disable/delete: mandatory reassign shift Dropdown (active shifts); block until chosen.
- Exclude inactive shifts from assignment lists; maintain default-Morning fallback.
- UI ShiftsScreen redesign: create+edit+disable+delete, impact dialogs, search+filter+sort
  (Name/Company/per-dept; Name A–Z, Start, End). MentorShiftsScreen reflects IsActive.

### B4. Admin Transfers — Create/Edit/View + Search/Filter/Sort
- Backend: admin initiate from transfers page (`POST /admin/interns/{id}/transfer`);
  `PUT /admin/transfers/{id}` (amend notes/target while Pending);
  extend `GET /admin/intern-transfers` filters (status, internName, initiatedBy, dept).
- UI AdminTransfersScreen: "New Transfer" modal (intern→mentor→note); edit for Pending;
  search bar (intern/mentor) + filter Dropdowns (Status, Initiated By) + sort (Newest,
  Intern A–Z, Mentor). Keep endorse/reject.

### B5. Admin Settings — Consolidated Controls
- Single configuration hub: Grace Minutes, Threshold %, Allowed Leave Days (B1).
- Holidays CRUD: add **edit** (currently create/delete only).
- Add search + type filter to list sections for consistency.

### B6. Departments — Disable Radius Input, Default 100m
- UI `DepartmentsScreen`: render "Radius (meters)" field but disabled (editable=false,
  greyed); force 100 on create; ignore on edit.
- Backend: CreateDepartment sets RadiusMeters=100 (ignore request value);
  UpdateDepartment skips radius (force 100).

---

## Shared frontend layout conventions (consistency)
- **Search**: `searchRow` — Icon(search) + TextInput + clear X, rounded card (colors.card).
- **Filter**: `filterRow` with `Dropdown`(inline) for e.g. Department/Status.
- **Sort**: segmented control or Dropdown with sort options; add per B3/B4.
- **Refresh**: `RefreshControl` on ScrollView.
- **Badges**: status color map + `{color}22` background chip (as in transfers screens).
- **Modals**: bottom-sheet style (`modalOverlay` + `modalContent`, borderTopRadius 24).

## Backend files to touch
- Core/Entities: AttendanceSettings.cs, Shift.cs, Notification.cs (new)
- Infrastructure/Data/AppDbContext.cs + Migrations/*
- Infrastructure/Services: AttendanceScoringService.cs, NotificationService.cs (new)
- API/Controllers: AdminController.cs, MentorController.cs, InternController.cs,
  NotificationController.cs (new)
- API/Program.cs (register NotificationService)
- API/DTOs: UpdateSettingsRequest (+AllowedLeaveDays), CreateShift/UpdateShiftRequest,
  shift-impact, update-transfer, etc.

## Frontend files to touch (InternApp/src/)
- screens/admin: SettingsScreen.js, ShiftsScreen.js, AdminTransfersScreen.js, DepartmentsScreen.js
- screens/mentor/MentorShiftsScreen.js
- screens/notification/NotificationsScreen.js (new)
- navigation/RootNavigator.js, components/RightSidebar.js, components/AppHeader.js
- store/slices/notificationsSlice.js (new)

## Verification
1. Backend build + migration.
2. API tests: leave scoring boundary, shift impact/CRUD/disable-reassign, transfer
   create/edit/filter, notifications list/read/unread.
3. Emulator: settings (leave days), shift edit/disable impact + reassign dialogs, transfer
   create/edit, notifications bell+screen (admin/mentor/intern), department radius locked 100.
