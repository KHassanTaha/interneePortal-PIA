# PRD — PIA Interns Portal

**Master product requirements document.** Per `AGENTS.md` §9.7 this file is
authoritative. If `docs/REQUIREMENTS.md` and this file disagree, this file
wins and `docs/REQUIREMENTS.md` is reconciled immediately.

**Established:** 2026-10-06
**Last updated:** 2026-10-06
**Status:** Seeded from the owner-supplied addendum. De-facto requirement
sources (`PLAN.md`, `PLANNED_FEATURES.md`, `PIA-Interns-App-Planned-Features.md`,
`Unified Intern Management.md`, `DECISIONS_LOG.md` D-01…D-S22, the two feature
specs, `PIA_BUGS_AND_CHANGES_11_9_26.md`) are **not yet folded in** — they are
still indexed informally in `docs/REQUIREMENTS.md` under `PL-XX` / `D01` style
identifiers. Folding them in is tracked separately and is not part of this pass.

**Status legend for requirement entries:** `[READY]` — agent can start ·
`[NEEDS-ANSWER]` — blocked on owner · `[PARTIAL]` — overlaps existing work.

**Source of REQ-01 … REQ-22 below:** owner-supplied list of 14 items, dictated
2026-10-06, updated later the same day with three owner clarifications
(failed-attempt photo retention, re-hiring semantics, full REQ-14 scope).

---

## Requirement index

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| REQ-01 | Geofence fail-open bug (coordinates missing → attendance proceeds) | Critical | `[x]` verified 2026-10-08 — fail-closed both paths; §18 on-device verified; AC4 waits on REQ-05 |
| REQ-02 | Activity log tap does not open correctly on admin dashboard | High | `[NEEDS-ANSWER]` — Q4 |
| REQ-03 | Swipe-to-dismiss does not work | Medium | `[-]` — CANCELLED: superseded by D-14 (swipe retired; Close button + backdrop + back); no longer an open item |
| REQ-04 | Face-enrollment photo reused for ID card and profile avatar | Medium | `[PARTIAL]` — Q6 answered (image on disk, full + thumb); Q7 open |
| REQ-05 | Failed attendance attempts logged, photographed, visible | High | `[NEEDS-ANSWER]` — Q8a, Q8b, Q9a, Q9b |
| REQ-06 | Newest-first ordering across all lists | Low | `[NEEDS-ANSWER]` — Q10 |
| REQ-07 | Database normalization plan | Low | `[NEEDS-ANSWER]` — Q11 |
| REQ-08 | Login rate limit and attempt log for admin / mentor | Medium | `[TODO]` — Q12a answered (all roles); scope per §REQ-08 |
| REQ-09 | Database script for replication to GitHub | Informational | answered in §REQ-09 |
| REQ-10 | Account status enums: add Completed, Paused, etc. | Medium | `[TODO]` — Q13a answered (enum set); scope per §REQ-10 |
| REQ-11 | Restart an old account for a new internship period | High | `[NEEDS-ANSWER]` — Q14a–Q16 |
| REQ-12 | CNIC uniqueness + mandatory CNIC on create (one account per person) | High | `[x]` — CNIC mandatory + unique, §18-verified 2026-10-08 & 2026-10-10 (D-S30, D-S30a); email out of scope (Q17 answered 2026-10-10) |
| REQ-13 | Button sizing: proper buffers and spacing across all pages | Medium | `[NEEDS-ANSWER]` — Q19 |
| REQ-14 | Comprehensive dashboards with historical stats and comparisons | Medium-High | `[NEEDS-ANSWER]` — Q20a–Q22 |

---

## REQ-01 — Geofence fail-open bug (coordinates missing → attendance still proceeds)

**Status:** `[x] verified 2026-10-08 — fail-closed on both paths; §18 on-device verified on emulator-5554 (FR-REQ-01 in PROGRESS.md). AC1–AC3 done; AC4 waits on REQ-05.`
**Priority:** Critical (security)
**Category:** Security / correctness
**Overlaps:** `FACE_RECOGNITION_AND_SYSTEM_GUIDE.md` §2 gate 4 (server-side GPS
geofence)

**Reported behaviour.**
The owner deleted the GPS coordinates from the `Departments` row for the
UI/UX department, and separately deleted coordinates associated with the
intern "Ahmed Hussain". Attendance was then initiated and the camera
opened and the on-device face-recognition commands executed — i.e. the
flow proceeded toward verification instead of failing at the geofence
gate.

**Expected behaviour.**
Attendance must fail-closed when geofence data is missing. Specifically:

- If the intern's department has no coordinates stored (latitude or
  longitude null), attendance must be rejected with a clear user-facing
  error before the camera opens.
- If the intern record has a coordinate field that is null and the
  current logic depends on it, the same rule applies.
- No face capture, no server request, no DB write should occur when
  geofence prerequisites are unmet.

**Acceptance criteria.**

1. Delete `Departments.{Latitude, Longitude}` for a test department
   and confirm attendance is blocked with a message naming the missing
   data (not a generic "try again").
2. Restore the coordinates and confirm attendance proceeds normally.
3. The rejection happens client-side (before camera) **and** is
   re-enforced server-side (defence in depth). Both paths must exist.
4. A failed-geofence attempt is written to the audit log (see REQ-05).

**Open questions — see Q1, Q2, Q3.**

**Implementation record 2026-10-08** (D-S25, branch `fix/req-01-geofence-fail-closed`):
the fail-open is closed on both paths. Server: `GeoFenceService` now owns the
decision (`HasValidCoordinates` + `EvaluateGeofence`); all four hardcoded
fallback sites removed (both start responses return department coords only;
`VerifyLocation` and `InternController.MarkAttendance` return HTTP 400
`{"message": "This department does not have coordinates configured. Contact an
administrator."}` when the department has no usable coordinates). Client:
`/intern/profile` exposes `departmentLatitude`/`departmentLongitude`;
`AttendanceScreen` disables "Mark Attendance" with that reason and the
start/checkout flows check the start response **before** the camera opens
(AC3). Intern-row coordinates are out of the geofence chain entirely.
Q2/Q3 are effectively settled by this implementation: fail-closed block (Q2a),
checked before the camera (Q3b). AC4 (failed attempt in audit log) is REQ-05's
scope and is not addressed here.

**Dependencies.** REQ-05 (failed attempt logging with photo) should
land in the same window.

---

## REQ-02 — Activity log tap does not open correctly on admin dashboard

**Status:** `[NEEDS-ANSWER]` (Q4)
**Priority:** High (broken interaction)
**Category:** UI/UX

**Reported behaviour.**
On the admin dashboard home screen, tapping the "Recent Activity"
entries (or the "Activity Logs" card — the source is ambiguous) does
not open the target correctly.

**Expected behaviour.**
`[NEEDS-ANSWER]` — the report says "doesn't open properly", which could
mean: no navigation, opens the wrong screen, opens a blank screen, opens
a modal that immediately closes, or throws an error. One screenshot or
one logcat snippet resolves it.

**Acceptance criteria.** To be written once the symptom is captured.

**Open questions — see Q4.**

---

## REQ-03 — Swipe-to-dismiss does not work anywhere

**Status:** `[-]` CANCELLED — superseded by D-14: swipe retired
(platform-blocked on RN 0.86 Fabric/Hermes Android); Close button +
backdrop + back implemented and verified.
**Priority:** Medium (UX friction)
**Category:** UI/UX
**Overlaps:** `PIA_BUGS_AND_CHANGES_11_9_26.md` items #3 and #6 (marked
"completed" in the source doc but not verified on-device)

**Reported behaviour.**
Owner reports swipe-to-dismiss does not work on any bottom sheet or
modal.

**Expected behaviour.**
Every bottom sheet and modal that presents as a sheet (New Department
form, Dropdown picker, form sheets on `DepartmentsScreen`, etc.) must
support swipe-down-to-dismiss with a natural gesture.

**Acceptance criteria.**

1. On emulator, swipe down on the drag area of each sheet and confirm
   dismissal.
2. Confirm a slow-swipe that does not cross the threshold springs back
   to open (no accidental dismiss).
3. Escape / Android back still closes the sheet.
4. The list of sheets is enumerated in `PROGRESS.md` at close.

**Open questions — see Q5.**

---

## REQ-04 — Face-enrollment photo reused for ID card and profile avatar

**Status:** `[PARTIAL]` (Q6 answered 2026-10-06 — image is on disk, with
full + thumbnail; REQ-04 is a reuse task. Q7 open, plus a sub-question on
reset/re-enroll history.)
**Priority:** Medium (consistency)
**Category:** Features / cross-screen consistency
**Overlaps:** `Unified Intern Management.md` (documents tab)

**Requirement.**
The photo captured during face enrollment must be the canonical
identity photo for that intern everywhere the app displays one:

- On the generated ID card PDF.
- On the profile photo in the intern's own app (dashboard, profile
  screen, sidebar avatar).
- On any mentor/admin view that currently shows an intern avatar or
  photo (intern lists, intern detail, face approvals, document
  approvals, attendance rows where a photo is shown).

**Acceptance criteria.**

1. Enroll a face for a fresh intern; confirm the same image renders on
   the ID card PDF, the intern's profile, and at least one admin/mentor
   list.
2. Reset a face and re-enroll with a different image; confirm all
   surfaces pick up the new image.
3. An intern with no enrolled face shows a clear placeholder
   (initials or icon) — not a broken image.
4. The image is served through the authenticated `/api/files` path,
   never a public URL (per D-S2 / security phase).

**Open questions — see Q6, Q7.**

---

## REQ-05 — Failed attendance attempts must be logged, photographed, and visible

**Status:** `[NEEDS-ANSWER]` (Q8a, Q8b, Q9a, Q9b)
**Priority:** High (audit + UX)
**Category:** Logging / attendance
**Overlaps:** `FACE_RECOGNITION_AND_SYSTEM_GUIDE.md` §2 (four gates);
D-12 (CAS) does not cover this; `AGENTS.md` §12.2 (AuditLog)

**Requirement.**
Every failed attendance attempt must be recorded, photographed, and
surfaced in three places.

**Note (2026-10-06):** Successful-attendance captures are already
retained and displayed. REQ-05 extends the same retention to the
failure path and adds display surfaces for failures. See D-S23.

**Implementation note (2026-10-06):** This is a **mechanism change,
not a retention change**. The only existing write sits after every gate
that can fail (`AttendanceVerificationController.cs:252`); each failure
branch returns before it, so the capture is discarded today. The write
moves to the top of the method, immediately on receipt and before any
gate. Successful-path behaviour is unchanged apart from being earlier.
See D-S23 for the list of discarding early-returns.

### 5.1 Retention of the capture

- Successful-attendance captures continue to be stored under the
  existing path (confirm via grep — see D-S23 implementation note).
- Failed-attempt captures are stored under a **new sibling path**,
  `uploads/faces/{internId}/verify-failures/`. Not
  `uploads/attendance-failures/` — that path was named in the original
  requirement text but does not exist in the codebase. Separate
  directories let retention and inspection treat the two classes
  differently and prevent a failure capture from being served as a
  success capture.
- The image is stored server-side under
  `/uploads/attendance-failures/{internId}/{timestamp}.jpg`.
  **Superseded by the bullet above** — retained here as the original
  wording, not as the specification.

**The image captured during the attempt must be retained** — not
discarded — so a mentor or admin can later review what was actually
shown to the camera when the attempt failed. This is critical for
distinguishing a genuine failed match (bad lighting, glasses, angle)
from an attempted impersonation (photo of a different person, screen
replay).

- The image is stored server-side under
  `/uploads/attendance-failures/{internId}/{timestamp}.jpg`.
- The image is never displayed to the intern in their own view (see
  §5.3).
- The image is retrievable by mentor/admin through the authenticated
  `/api/files` endpoint (D-S2).
- Retention policy: `[NEEDS-ANSWER]` — see Q8a.

> Note: this is a departure from the stated text of `AGENTS.md` §4.4
> ("the raw photo is never persisted") **for the failure path only**.
> That text did not match the code — successful captures were always
> retained. Corrected in `AGENTS.md` §4.4, in the archived
> `FACE_RECOGNITION_AND_SYSTEM_GUIDE.md` §2 (correction line), and
> recorded as **D-S23**. The FACE-02 row in `docs/REQUIREMENTS.md` has
> since been deleted (§9.7 — it was a false claim with no PRD row), so
> this conflict is closed on all sides.

### 5.2 What counts as a failed attempt

Any of the following must produce a failure record with a distinct
reason code:

1. Liveness challenge not passed on device.
2. Anti-spoof (MiniFASNetV2) `realScore < 0.60`.
3. Face-match cosine distance `> 0.58`.
4. GPS outside the department geofence.
5. Missing geofence data (REQ-01).
6. Face not enrolled (pre-verification check).
7. Device not bound / bound to a different device.
8. Attempted outside the intern's shift window.

> Thresholds above (0.60 / 0.58) are the values in `AGENTS.md` §4.4. The
> **live code disagrees**: `FaceRecognitionService.cs:37` sets
> `DefaultThreshold = 0.70` (the effective match gate — the compare call
> at `AttendanceVerificationController.cs:237` passes no threshold) and
> `:40` sets `DefaultSpoofThreshold = 0.40`. `appsettings.json:23` does
> contain `"FaceMatchThreshold": 0.58`, but no code reads it. The same
> file's XML comment (`:18`) claims 0.58 while `:37` defines 0.70.
> Owner instruction 2026-10-06: keep tracked, do not fix now. Reason
> codes must therefore be written against whichever values the owner
> confirms as authoritative — see CONTEXT A23 / open question Q6.

### 5.3 Visibility

- **Intern's own view:** the intern sees their own failed attempts in
  their attendance history (a distinct row or a badge on the day's
  entry), showing the reason code and timestamp. **The retained image
  is NOT shown to the intern** — it exists for mentor/admin review.
- **Mentor / admin view:** a filterable list of failed attempts across
  the interns they own, including the retained image (viewable in a
  full-screen image viewer).
- **AuditLog:** every failure writes a row with the reason code, the
  timestamp, the source IP, and a reference to the stored image path.

### 5.4 Grouping and thresholds

`[NEEDS-ANSWER]` — see Q9a. Draft: repeated failures from the same
intern within a rolling window (e.g. 3 in 10 minutes) raise a flag
visible to the mentor, and the audit entry is marked as a cluster
rather than as three isolated events.

**Acceptance criteria.**

1. Force each of the eight failure modes; confirm a row is written
   with the correct reason code and the image is stored on the server.
2. The intern sees the row (without the image) in their own attendance
   history.
3. The mentor/admin sees the row and can open the image in a viewer.
4. Failure rows are visually distinct from successful attendance (not
   silently counted as "absent").
5. A failure record survives an app restart (server-side persistence).

**Open questions — see Q8a, Q8b, Q9a, Q9b.**

---

## REQ-06 — Newest-first ordering across all lists

**Status:** `[NEEDS-ANSWER]` (Q10)
**Priority:** Low (UX polish)
**Category:** UI/UX

**Requirement.**
Every list that displays records ordered by time (attendance,
leaves, intern list, activity log, documents, notifications, audit
log, transfers) must default to newest-first ordering.

**Acceptance criteria.**

1. Audit every list screen for its current sort order.
2. Where ordering is oldest-first or arbitrary, change to newest-first
   by the record's primary timestamp.
3. Where a list already supports user-controlled sorting, keep the
   control but default to newest-first.
4. Enumerate the affected screens in `PROGRESS.md` at close.

**Open questions — see Q10.**

---

## REQ-07 — Database normalization plan

**Status:** `[NEEDS-ANSWER]` (Q11)
**Priority:** Low (planning, not implementation)
**Category:** Data / technical debt

**Requirement.**
Produce a written normalization plan for the current schema and add it
as a task in `TODO.md`. The plan:

- Identifies tables with repeated groups, redundant columns, or
  transitive dependencies.
- Proposes a normalized schema (up to 3NF or BCNF where sensible) with
  a migration strategy that respects the schema-guard-only rule
  (`AGENTS.md` §4.10).
- Explicitly marks any denormalization that is *deliberate* and why
  (e.g. the maintained boolean `FaceEnrolled` mirror of
  `FaceEnrollmentStatus == Approved` — see CONTEXT "sweep-doc field
  names are shorthand, not schema"). The addendum cited this as
  "D-S20"; **no `D-S20` entry exists in `DECISIONS_LOG.md`** (the log
  runs D-S1…D-S18, D-S21). Either the decision needs to be written, or
  this mirror needs a decision ID of its own.
- Accounts for the new lifecycle data introduced by REQ-10 and REQ-11
  (InternshipPeriods table, status history).
- Does not implement anything in this pass.

**Acceptance criteria.**

1. A file `docs/DB_NORMALIZATION_PLAN.md` exists with the analysis.
2. A `TODO.md` entry references it and is marked `[ ]` pending owner
   review.
3. No schema changes are made in this pass.

**Open questions — see Q11.**

---

## REQ-08 — Login rate limit and attempt log for admin / mentor

**Status:** `[NEEDS-ANSWER]` (Q12b, Q12c) — Q12a answered 2026-10-08
**Priority:** Medium (security)
**Category:** Security
**Overlaps:** `DECISIONS_LOG.md` D-S1, D-S2 and the "Security phase"
section, which already document a lockout after 5 failed attempts
(15 min, HTTP 423) and rate limiter at 300/min/IP.

**Reported requirement.**
The owner wants rate limiting and attempt logging on login
specifically for admin and mentor, in addition to whatever already
exists.

**Open questions — see Q12b, Q12c.** Q12a (scope) is answered.

**Scope (owner answer to Q12a, 2026-10-08).** Lockout applies to
**all three roles uniformly** — admin, mentor, and intern. The
existing 5-attempt / 15-minute / HTTP 423 lockout currently applies
only to interns; it must be extended to admin and mentor.

**Acceptance criteria.**

1. Failed login attempts are logged with timestamp, username
   attempted, source IP, and outcome.
2. The attempt log goes in the **existing Audit Log** with a new
   filter (per Q12b recommendation, to be confirmed).
3. Rate limiting is enforced and returns a clear HTTP status with a
   `{"message": ...}` body per D-S21.
4. Successful logins are also logged (login events, not just
   failures).
5. The lockout applies uniformly to admin, mentor, and intern roles —
   not selectively. Threshold stays at **5 attempts / 15 minutes /
   HTTP 423** (per Q12c recommendation, to be confirmed).

---

## REQ-09 — Database script for replication to GitHub

**Status:** answered — informational, not a feature
**Priority:** N/A — informational
**Category:** Documentation / onboarding

This is a question, not a task. Answer below.

**Question.** How do I produce a database script that a fresh clone can
run to get a working database, and how should it be committed?

**Answer (for the owner, not a task):**

Two things are needed, and they are different:

1. **Schema-only script.** `sqlcmd` can generate this from the running
   dev DB:

   ```bash
   sqlcmd -S localhost,1433 -U sa -P '<pw>' -d InternSystemDB \
     -Q "SELECT ..." -o schema.sql
   ```

   Or use SQL Server Management Studio's "Generate Scripts" wizard on
   Windows. Given `AGENTS.md` §4.10, the schema-guard in `Program.cs` is
   the source of truth — the script should be *generated from the
   running schema*, not maintained by hand. A `scripts/generate-schema.ps1`
   or `.sh` that runs the extraction and writes `db/schema.sql` would
   keep it current.

2. **Seed data script.** A separate `db/seed.sql` with the minimum rows
   to make the app usable (departments, one admin, one mentor, one
   intern, shifts, settings). Hand-written, checked into git.

Neither script contains real credentials or real intern data. Both
reference `docs/DEVELOPMENT_CREDENTIALS.md` for the SA password at
run time.

Recommended placement:

```
db/
├── schema.sql          # generated, committed
├── seed.sql            # handwritten, committed
├── README.md           # how to run both
└── generate-schema.sh  # regenerates schema.sql from the running DB
```

Add as **W6.8** to `TODO.md` — "Create `db/` directory with schema and
seed scripts; wire into `DEV_LAUNCH.md` as part of the dead-state
setup."

---

## REQ-10 — Account status enums: add Completed, Paused, etc.

**Status:** `[NEEDS-ANSWER]` (Q13a, Q13b)
**Priority:** Medium (data model + UI)
**Category:** Account management
**Overlaps:** `Intern Transfer Feature.md` §3.2 (which proposes an
`intern_status` field with `Active, Inactive, Transferred, Graduated,
Withdrawn`)

**Requirement.**
Replace the boolean `IsActive` (or equivalent) with a status enum
covering more than Active/Inactive. **Confirmed enum values (owner
answer to Q13a, 2026-10-08):** `Upcoming, Active, Suspended, Completed,
Withdrawn`.

- Upcoming: account created, startDate in the future; no attendance.
- Active: internship running (default once started); attendance allowed.
- Suspended: temporarily paused (medical, leave of absence, admin hold);
  no attendance.
- Completed: endDate reached; internship finished normally; no attendance.
- Withdrawn: left before scheduled end date; no attendance.

`Transferred` is deliberately NOT an enum value — the transfer state
machine (D-S24) handles that flow; a transferred intern remains `Active`
in their new department.

> Before implementation, confirm the current boolean property name on
> the entity. `AGENTS.md` §10.7 forbids treating a guessed property name
> as fact.

**Scope correction (2026-10-06):** `IsActive` is on `User`, not
`Intern`. REQ-10 adds a new `InternshipStatus` column on `Intern`
for the lifecycle states. `User.IsActive` is unchanged — it
governs login, not the internship state.

Evidence: `public bool IsActive|IsActive` over
`backend/InternSystem.Core/Entities/` (`--include=*.cs`) matches
`User.cs:16`, `Department.cs:13` and `Shift.cs:13` — **not** `Intern.cs`.
`Intern` has no `IsActive` and no `Status`; it has `StartDate` /
`EndDate` (`Intern.cs:38-39`).

The two concerns are distinct and must not be conflated:

- **`User.IsActive`** — account-level, applies to admin, mentor and
  intern uniformly. `true` means the user can log in; `false` means the
  account is disabled. Out of scope for this requirement.
- **`Intern.InternshipStatus`** — internship lifecycle. An intern can
  have an **active `User` account** while their `InternshipStatus` is
  `Completed`: they can log in to view their history, but they cannot
  mark attendance or submit leave. In scope.

**Q13a answered 2026-10-08** — confirmed enum values govern. Q13b (who
can set which status) remains open.

**Open questions — see Q13b.**

**Acceptance criteria (draft).**

1. `Intern.Status` is an enum with a documented set of values.
2. Every screen currently reading `IsActive` is updated to read the
   enum.
3. Transitions between statuses are defined and enforced (who can set
   which status from which).
4. Each transition writes to the audit log.
5. The login flow and attendance flow behave correctly per status
   (e.g. a Completed intern cannot mark attendance).
6. The status history is preserved (see REQ-11 and REQ-07) — the
   current status is the tip; the history is available for audit and
   for the dashboard (REQ-14).

---

## REQ-11 — Restart an old account for a new internship period

**Status:** `[NEEDS-ANSWER]` (Q14a, Q14b, Q15a, Q15b, Q16)
**Priority:** High (feature)
**Category:** Account lifecycle
**Overlaps:** `Intern Transfer Feature.md` §2 (InternshipPeriods table);
REQ-10; REQ-12; REQ-14

**Owner clarification (2026-10-06).**
Re-hiring **does not create a new account.** It repurposes the existing
account, adding a fresh internship period alongside the completed
one(s). All data from previous periods is preserved separately and
remains viewable.

**Requirement.**
An admin can start a new internship period on an existing account,
attaching:

- A fresh mentor.
- Fresh start and end dates.
- A fresh face enrollment (required before attendance in the new
  period).
- Fresh document uploads (CNIC and Resume per §4.6 / D-S16).
- A fresh device binding.
- Possibly a fresh shift assignment.

**Data model.**

- The account row (`Users` / `Interns`) is preserved — the same
  username, the same CNIC, the same email.
- A new `InternshipPeriods` row is created with `start_date = today`,
  `end_date = null`, `is_current = 1`.
- The previous period's row is updated: `end_date` set, `is_current`
  set to 0.
- All records that belong to a period (attendance, document
  submissions, face enrollment, device binding, transfers, task
  assignments, certificates) are keyed by `period_id`.
- Records from previous periods are never deleted or mutated. They are
  queryable historically.

**Acceptance criteria.**

1. An admin can select a completed account and start a new period.
2. The account keeps its username, CNIC, email.
3. The new period starts with fresh face / docs / device state.
4. The prior period's data remains visible under a "Previous Periods"
   section on the intern detail screen, with date range, mentor, and
   summary stats (attendance %, documents issued, certificates).
5. Attendance, leave, and document flows operate on the current
   period only.
6. The action is audited with a distinct action type
   (`InternshipPeriodStarted`).
7. A per-period view of attendance, documents, and tasks is reachable
   from the intern detail screen.
8. The intern sees a "Periods" tab (or equivalent) showing their own
   history.

**Open questions — see Q14a, Q14b, Q15a, Q15b, Q16.**

---

## REQ-12 — CNIC and email uniqueness (one account per person)

**Status:** `[x]` — implemented and verified 2026-10-10 (D-S30 + D-S30a).
**Priority:** High (data integrity)
**Category:** Account creation
**Overlaps:** REQ-11 (which reuses the same account, so uniqueness is
not violated on re-hire)

**[UPDATED] 2026-10-08** — previous state: `[NEEDS-ANSWER]` (Q17, Q18
open, no implementation). New state: CNIC uniqueness enforced in DB
(`UX_Interns_Cnic` filtered unique index) and API (`POST /admin/interns`
returns 409 with the Q18 message); email uniqueness deferred by owner
until the email field's location is specified (`Users.Email` does not
exist). Decision: D-S30.

**[UPDATED] 2026-10-10** — previous state: `[PARTIAL]`, email deferred
via Q17. New state: **email is removed from this requirement entirely.**
Q17 is answered as a decision, not a deferral: CNIC is the only
uniqueness gate — one person may legitimately have many emails. CNIC is
now **mandatory on create** (`[Required]` + explicit action check on
`AdminController.CreateIntern` and `MentorController.CreateIntern`,
`InvalidModelStateResponseFactory` emits `"{field} is required."` for
`RequiredAttribute` failures), grandfathered legacy null-CNIC rows remain
editable, and a missing/empty/whitespace CNIC returns HTTP 400
`{"message": "CNIC is required."}`, distinct from the duplicate 409.
Decisions: D-S30 + D-S30a.

**Requirement.**
> An intern account's CNIC is mandatory. It must be unique across active
> intern accounts. Duplicate CNICs are rejected with an error that names
> the owning account.
> Scope: CNIC is the only uniqueness gate.
> Email is NOT part of this requirement. Q17 is answered: CNIC only.
> Legacy null CNIC rows are grandfathered.
> A future edit that touches CNIC must supply one (email stays out).

**Re-hire does not violate uniqueness.** Because REQ-11 repurposes the
existing account, one person still has exactly one account regardless
of how many periods they have completed.

**Open questions — Q17 answered (owner 2026-10-10: CNIC only, decision),
Q18 answered.**

**Acceptance criteria.**

1. [x] Creating a second intern with the same CNIC fails with a clear
   error naming the existing account. — verified via curl E2E
   (HTTP 409 naming `ab.PIA.001`) and on emulator (inline error under
   the CNIC field, screenshot `logs/screenshots/req-12-cnic-inline-error.png`),
   2026-10-08. Regression-checked 2026-10-10 (still 409 after the
   mandatory-CNIC change).
2. [ ] Email uniqueness — **removed from scope** (owner decision
   2026-10-10, D-S30a). Email is not a uniqueness gate; no email column
   is introduced or planned for this.
3. [x] Creating an intern without a CNIC fails with the explicit message
   `{"message": "CNIC is required."}` (HTTP 400) — verified via curl
   (missing, empty, and whitespace CNIC), 3 tests in
   `CnicUniquenessTests.cs`, and on emulator (inline error under the
   CNIC field, no toast, no row created — screenshot
   `logs/screenshots/req-12-cnic-required.png`), 2026-10-10.
4. [x] The error message is actionable: "This CNIC is already registered
   to another intern (username: xxx). To re-hire this person, use the
   Start New Period action on their account." — implemented verbatim at
   `AdminController.cs`.
5. [ ] Re-hire (REQ-11) works without tripping the uniqueness
   constraint. — blocked on REQ-11 (still `[NEEDS-ANSWER]`); the index
   filter allows multiple NULL CNICs but re-hire must reuse the row, not
   insert a second one.

---

## REQ-13 — Button sizing: proper buffers and spacing across all pages

**Status:** `[NEEDS-ANSWER]` (Q19)
**Priority:** Medium (UI polish)
**Category:** UI/UX

**Requirement.**
Buttons across the app must have enough padding and minimum size that
their labels never clip, wrap awkwardly, or become unreadable when the
font scales up or the label is long.

**Acceptance criteria.**

1. Audit every screen for buttons whose label clips or overflows.
2. Apply a minimum `minHeight` (per `AGENTS.md` §16.2 — the filter chips
   rule of 40 is the reference) and horizontal padding rule.
3. Test with the OS font scale set to 130% (Android accessibility
   setting) to catch dynamic-type clipping.
4. Document the audit list and fix status in `PROGRESS.md`.

**Open questions — see Q19.**

---

## REQ-14 — Comprehensive dashboards with historical stats and comparisons

**Status:** `[NEEDS-ANSWER]` (Q20a–Q22)
**Priority:** Medium-High (feature)
**Category:** Reporting / analytics
**Overlaps:** `PLANNED_FEATURES.md` Phase 7 (reports)

**Owner clarification (2026-10-06).**
Scope completely. **Implement slowly but all must be implemented with
no shortcuts.** No phased "first pass" — every metric, every
comparison, every drill-down is in scope. The workstream is scheduled
across multiple sessions but nothing is dropped.

### 14.1 Audience and structure

Two dashboard surfaces, each with the same structure but scoped
differently:

- **Admin dashboard** — org-wide.
- **Mentor dashboard** — scoped to the mentor's own interns.

Both dashboards share the same components. The scope filter (org-wide
vs. own interns) is the only difference.

### 14.2 Global controls

Every dashboard has:

- **Date range picker** with presets: Today, Last 7 days, Last 30
  days, This month, Last month, This quarter, This year, Custom.
- **Department filter** (multi-select) — admin only; mentor sees only
  their department.
- **Mentor filter** (multi-select) — admin only.
- **Shift filter** (multi-select).
- **Intern status filter** (multi-select) — Active, Paused, Completed,
  Inactive (from REQ-10).
- **Comparison toggle** — off / previous period / same period last
  year.
- **Refresh / auto-refresh** — manual refresh by default; optional
  30-second auto-refresh for real-time tiles.
- **Export** — the current view as PDF and XLSX (reuses the
  server-rendered report infrastructure per Phase 7 / `REPORT-01`).

Filters are sticky per user within a session; not persisted across
sessions unless the owner asks (see Q20a).

### 14.3 Metric catalog — Admin dashboard

Organized into sections. Every metric shown as a tile with current
value, delta vs. comparison period, and a sparkline or trend arrow.
Every tile is tappable to drill into the underlying records.

**Section A — Intern population**

| Metric | Definition |
|--------|------------|
| Total interns (current) | Count of accounts in Active or Paused status |
| Active interns | Count of accounts in Active status |
| Paused interns | Count of accounts in Paused status |
| Completed internships (this period) | Count of accounts that moved to Completed within the date range |
| New interns onboarded | Count of first-time interns created in the range |
| Re-hires started | Count of new periods started on existing accounts (REQ-11) |
| Interns by department | Bar chart, one bar per department |
| Interns by mentor | Bar chart, one bar per mentor, sorted desc |
| Interns by shift | Pie chart of shift distribution |
| Average internship duration | In days, for completed internships in range |

**Section B — Attendance**

| Metric | Definition |
|--------|------------|
| Overall attendance % | Σ dailyScore / (2.0 × total days) across all interns in range |
| Attendance % by department | Line or bar, one series per department, daily/weekly/monthly buckets |
| Attendance % by mentor | Same, grouped by mentor |
| Attendance % trend | Line chart over the selected range |
| On-time arrival rate | OnTime arrivals / total arrivals |
| Late arrival rate | Late arrivals / total arrivals |
| Early departure rate | Early departures / total departures |
| Absent days | Count of Absent statuses |
| Leave days taken | Count of OnLeave days |
| Attendance distribution | Stacked bar: OnTime / Late / Early / Absent / OnLeave, over time |
| Top 10 departments by attendance % | Table with rank, department, %, delta |
| Bottom 10 departments by attendance % | Same |
| Top 10 interns by attendance % | Same, with a mentor column |
| Bottom 10 interns by attendance % | Same |
| Absent streak alert | Interns with 3+ consecutive Absent days in range |

**Section C — Failed attendance attempts (REQ-05)**

| Metric | Definition |
|--------|------------|
| Total failed attempts | Count in range |
| Failed attempts by reason | Pie or bar, one slice per reason code (liveness, anti-spoof, face-match, geofence, missing-geofence-data, face-not-enrolled, device-not-bound, outside-shift) |
| Failed attempt rate | Failed / (Failed + Successful) |
| Failed attempts by intern | Top 10 table with a link to the intern's failure history |
| Failed attempts by department | Bar chart |
| Failed attempt clusters | Interns with 3+ failures in 10 minutes, listed with timestamps |
| Failure heatmap | Hour-of-day × day-of-week grid, coloured by count |

**Section D — Documents**

| Metric | Definition |
|--------|------------|
| Documents pending approval | Count by type (CNIC, Resume, Gate Pass, ID Card, Certificate) |
| Documents approved in range | Count by type |
| Documents rejected in range | Count by type, plus top rejection reasons |
| Average approval latency | Median hours from submission to decision, by type |
| Documents by department | Bar chart |
| Certificates issued | Count in range |
| Gate passes issued | Count in range |
| ID cards issued | Count in range |
| Document gate blocks | Count of issuance attempts blocked by the CNIC+Resume gate (D-S16) |

**Section E — Face enrollment**

| Metric | Definition |
|--------|------------|
| Enrolled interns | Count with FaceEnrollmentStatus == Approved |
| Pending enrollment | Count with Pending |
| Rejected enrollment | Count with Rejected |
| Enrollment rate | Enrolled / total active |
| Average time to enrollment | Median hours from account creation to enrollment |
| Re-enrollments | Count of face resets and re-approvals in range |
| Enrollment by department | Bar chart |

**Section F — Transfers**

| Metric | Definition |
|--------|------------|
| Transfers initiated | Count in range |
| Transfers completed | Count |
| Transfers rejected | Count (by step: intern-rejected, mentor-rejected) |
| Transfers in flight | Count currently Pending, Endorsed, or InternAccepted |
| Average transfer cycle time | Median hours from initiate to finalise |
| Transfers by from-department | Bar chart |
| Transfers by to-department | Same |
| Net flow per department | In − Out, one bar per department |

**Section G — Tasks (if task-assignment is in scope per `PLANNED_FEATURES.md` Phase 8)**

| Metric | Definition |
|--------|------------|
| Tasks assigned | Count in range |
| Tasks completed | Count |
| Completion rate | Completed / assigned |
| Average completion time | Median hours |
| Interns below threshold | Count with completion < TaskThresholdPct |
| Task completion by department | Bar chart |

**Section H — System health**

| Metric | Definition |
|--------|------------|
| API request rate | Requests per minute, average and peak |
| Error rate | 5xx responses / total |
| Auth failures | Failed logins, lockouts triggered |
| Rate limit hits | 429 responses |
| Active devices | Distinct device bindings seen in range |
| Background sync activity | Outbox items processed, succeeded, failed, conflicted |

### 14.4 Metric catalog — Mentor dashboard

Same sections as admin, scoped to the mentor's own interns. The
comparison toggle lets the mentor compare their scoped numbers to:

- Their own previous period (default).
- The department average (opt-in toggle).

Additional mentor-only section:

**Section I — My interns at a glance**

| Metric | Definition |
|--------|------------|
| Interns assigned | Count |
| Interns on leave today | Count |
| Interns absent today | Count |
| Pending items awaiting my approval | Count by type |
| Recent failures | Count of failed attempts by my interns in the last 24 h |

### 14.5 Drill-downs

Every metric tile and every table row is tappable and leads to the
underlying records:

- Attendance % → list of interns in that department with their
  individual %s.
- Failed attempts → list of individual failure rows with the retained
  image (REQ-05).
- Documents pending → the pending document queue filtered accordingly.
- Transfers in flight → the transfer list filtered by status.
- Intern in any list → the intern detail screen.
- Department in any list → the department detail screen (interns,
  mentor, stats).

Drill-downs preserve the active date range and filters.

### 14.6 Charts and visual style

- Line charts for time series.
- Bar charts for categorical comparisons (departments, mentors,
  shifts).
- Stacked bars for distributions.
- Pie/donut only for part-to-whole with ≤ 6 categories.
- Tables for rank lists and top/bottom 10.
- Every chart has: title, axis labels with units, legend when multiple
  series, source date range.
- Empty state: "No data for the selected range." — never a blank
  chart.
- Colours from the theme palette only (`AGENTS.md` §16.4). No
  hard-coded hex.
- Dark mode must render every chart legibly.
- Accessibility: every chart has an accessible text summary (screen
  reader announces the takeaway, not just the raw numbers).

### 14.7 Data freshness and performance

- Metrics are computed server-side, not on the client.
- Every endpoint is cached with a short TTL (default 60 s) to make
  filter changes snappy.
- Dashboard first paint < 2 s on the emulator with seeded data.
- Filter change re-render < 1 s.
- Drill-down navigation < 500 ms.
- Aggregation queries use indexed columns; any query > 200 ms is
  logged and reviewed.

### 14.8 Exports

Every dashboard view is exportable:

- **PDF** — server-rendered, layout matching the on-screen view, with
  the date range and filters printed in the header.
- **XLSX** — one sheet per section, raw numbers not rendered charts.
- Both reuse the server-rendered report infrastructure
  (`/api/{role}/reports/{reportKey}/pdf|excel` per Phase 7 /
  `REPORT-01`).
- Export actions are audited (`DashboardExported` with the filter
  state).

### 14.9 Backend scope

New endpoints under `/api/admin/dashboard/*` and
`/api/mentor/dashboard/*`, one per section:

- `/population`
- `/attendance`
- `/failed-attempts`
- `/documents`
- `/face-enrollment`
- `/transfers`
- `/tasks`
- `/system-health` (admin only)
- `/my-interns` (mentor only)

Each accepts the standard filter set (date range, department, mentor,
shift, status, comparison mode) and returns a uniform envelope:

```json
{
  "range": { "from": "...", "to": "..." },
  "comparison": { "mode": "previous-period", "from": "...", "to": "..." },
  "tiles": [ { "id": "...", "value": 123, "delta": 12, "deltaPct": 10.8, "trend": [...] } ],
  "series": [ { "id": "...", "label": "...", "points": [...] } ],
  "tables": [ { "id": "...", "columns": [...], "rows": [...] } ]
}
```

Server-side aggregation is written as raw SQL or compiled EF queries
with indexes — never materialize the whole table client-side.

### 14.10 Implementation order

Even though **all** sections ship, they are implemented in this order
across multiple sessions, one section per session where practical:

1. **Scaffold** — shared components (MetricTile, ChartCard, FilterBar,
   DrillDownList), the standard filter envelope, one endpoint
   (`/population`) end-to-end to prove the pipeline, the dashboard
   route for admin.
2. **Population** (Section A) + mentor equivalent.
3. **Attendance** (Section B) — the largest single section.
4. **Failed attempts** (Section C) — depends on REQ-05.
5. **Documents** (Section D).
6. **Face enrollment** (Section E).
7. **Transfers** (Section F).
8. **Tasks** (Section G).
9. **System health** (Section H, admin only).
10. **Mentor-specific** (Section I).
11. **Exports** — PDF and XLSX for every section.
12. **Polish pass** — accessibility, dark mode, performance
    verification, empty states, drill-down coverage.

Each step is a separate commit or small set of commits, with a
verification note in `PROGRESS.md` naming the metrics that were walked
on the emulator.

### 14.11 Acceptance criteria (whole workstream)

1. Every metric in §14.3 and §14.4 renders.
2. Every comparison toggle works.
3. Every filter works.
4. Every tile and table row drills down.
5. Every section is exportable.
6. Dark mode renders every chart legibly.
7. Accessibility summary present for every chart.
8. Performance targets in §14.7 met.
9. No hard-coded hex colours; theme only.
10. The full workstream is complete — not a phased subset.

**Open questions — see Q20a–Q22.**

---

# Open questions for the owner

Answer in order; each is numbered for reference. Unanswered questions
remain marked `[NEEDS-ANSWER]` in the PRD until answered.

## Q1 (REQ-01) — Where does an intern "have" coordinates?

**ANSWERED 2026-10-06 by agent grep — and the mechanism is now located.**

The face-recognition pipeline checks the *phone's* GPS against the
department's geofence radius. It does not read coordinates from the
intern's DB row. Which field did you delete on Ahmed Hussain's row? Is
it a live field the code reads, or something else? A short answer
("I deleted columns X and Y from table Z") resolves it.

**What the code actually does.** Search pattern
`RadiusMeters|OUT_OF_RANGE|GEOFENCE|Geofence|Haversine`, scope
`backend/InternSystem.API` + `backend/InternSystem.Infrastructure`,
`--include=*.cs`, excluding `Migrations/`.

Nullable coordinate columns:

| Entity | Properties | file:line |
|--------|-----------|-----------|
| `Department` | `Latitude`, `Longitude`, `RadiusMeters` (all `double?`) | `Department.cs:9-11` |
| `Intern` | `Latitude`, `Longitude` (`double?`) | `Intern.cs:42-43` |
| `AttendanceVerificationSession` | `Latitude`, `Longitude` (`double?`) | `AttendanceVerificationSession.cs:35-36` |
| `Attendance` | `Latitude`, `Longitude` (non-null) | `Attendance.cs:28-29` |

Two places resolve the geofence centre, and **both fail open** by
substituting a hardcoded coordinate when the department has none:

| Site | Fallback when department coords are null | Fallback radius |
|------|------------------------------------------|-----------------|
| `AttendanceVerificationController.cs:298-303` | `24.894995`, `67.152182` | `100.0` (`:304-305`) |
| `InternController.cs:551-552` | `24.9065`, `67.1608` | `100.0` (`:553`) |

The two fallbacks are **different coordinate pairs**, so the two
attendance paths disagree about where the office is. Precedence at the
verification site is: intern's own `Interns.Latitude/Longitude` when
non-zero (`:294-297`), else department coords, else the hardcoded pair
(`:302-303`).

**Answer to your question, as best the code supports it:** `Interns.Latitude`
/ `Interns.Longitude` are the fields on an intern's row, and they are
commented in the code as the "internship office location (captured at
creation)" (`:293`). Deleting them removes the *preferred* centre and
silently drops the gate down to the department value, then to the
hardcoded one. Deleting the department's coordinates does the same thing
one level down. Neither deletion blocks attendance — which is exactly
the fail-open you reported.

**Still needed from you:** confirm which of the two you actually deleted,
so acceptance criterion 1 can be written against the right row. But the
fix is the same either way: remove the fallbacks and return a
`MISSING_GEOFENCE_CONFIG` error. Q2 (block vs. default) and Q3 (camera
timing) are unchanged.

## Q2 (REQ-01) — Fail behaviour when geofence data is missing

When the department has no coordinates, should the attendance attempt:
(a) block with a clear error, (b) fall back to a company-wide default
radius and coordinates, or (c) block and notify an admin that the
department needs coordinates configured? I recommend (a) + a one-time
admin notification — fail-closed, but discoverable.

## Q3 (REQ-01) — Camera timing

Should the app check the geofence *before* opening the camera (better
UX, no wasted capture), or open the camera and check on submit (current
behaviour appears to be this)? I recommend before — the whole point is
to not waste the capture.

## Q4 (REQ-02) — What exactly happens on the admin dashboard tap?

One of: no response; navigates but blank; opens a screen and
immediately closes; shows an error toast; opens the wrong screen. A
logcat snippet from the tap would help.

## Q5 (REQ-03) — Which sheets, exactly?

The Aug-19/20 work reports claim swipe-to-dismiss was fixed on the
`Dropdown` bottom sheet and 3 `DepartmentsScreen` sheets. Is swipe
broken on those specifically, or on other sheets? A short list (or
"all of them, here are 3 screenshots") resolves the scope.

## Q6 (REQ-04) — Where does the face photo come from?

**ANSWERED 2026-10-06 by agent grep — the enrollment image IS on disk.**
`InternController.cs:502` calls
`_files.SaveBase64ImageWithThumbAsync(req.FaceImage, Path.Combine("faces", intern.Id.ToString()))`,
writing the full image **and** a 256 px thumbnail. Both paths are stored
on `FaceEnrollmentRecord.PhotoPath` / `PhotoThumbPath` at submission time
(`InternController.cs:515-516`), i.e. **before** approval, not at
approval. Read back at `AdminController.cs:557-558` and
`MentorController.cs:350`. The thumbnail is documented at
`FileService.cs:92-97` as being "used for low-traffic avatars and list
rows; the full-res file is kept for ID-card embedding and the photo
viewer."

So REQ-04 is a **reuse task, not a new storage path.** The remaining
unknown is no longer *whether* the image exists but *which surfaces
already consume it* — `PdfService.cs:302-307` already keys ID-card
selfie selection on `PhotoPath`, so part of REQ-04 may already be done.
That audit has not been performed.

**Remaining sub-question, still open:** when the face is **reset** and
re-enrolled, do the old `FaceEnrollmentRecord` rows and their images
survive? `AdminController.cs:853` is commented "Reset Face Enrollment
(keeps prior record in history)", and reads at `:557` use
`OrderByDescending(r => r.EnrolledAt).FirstOrDefault()`, which implies
yes. Confirm before REQ-04 acceptance criterion 2 ("re-enroll with a
different image; confirm all surfaces pick up the new image") is
specified.

## Q7 (REQ-04) — When the face is reset and re-enrolled

Should the ID card PDF regenerate automatically, or only on next
issuance? What about the current profile photo — does it update
immediately or on next app launch?

## Q8a (REQ-05) — Retention policy for failed-attempt images

How long are the images kept? Draft: 90 days, then automatically
purged. Or forever? Or until the record is manually cleared by an
admin? Retention has privacy implications.

## Q8b (REQ-05) — Full list of failure reasons

Confirm the eight reason codes in §5.2. Add or remove any.

## Q9a (REQ-05) — Failure cluster threshold

Draft: 3 failures in 10 minutes from the same intern raises a flag.
Confirm the numbers or supply your own.

## Q9b (REQ-05) — Does the intern see the reason code?

Should the intern see the specific reason ("face didn't match") or a
generic "attendance could not be marked"? The specific reason is more
actionable but could help an attacker iterate. I recommend generic
for the intern, specific for mentor/admin.

## Q10 (REQ-06) — Every list, or a specific set?

Any list you know is wrong today? Otherwise the agent will audit every
list screen and report back.

## Q11 (REQ-07) — Is this driven by a specific problem?

Are there tables you've noticed that are bloated, redundant, or hard to
query? Or is this general housekeeping? A hint would focus the plan.

## Q12a (REQ-08) — Does the existing lockout cover admin/mentor?

Per `DECISIONS_LOG.md`, the backend already implements a lockout (5
failed attempts, 15 min, HTTP 423) and a global rate limiter
(300/min/IP). Is that lockout currently applied to admin/mentor
logins, or only interns? A code check answers this.

## Q12b (REQ-08) — Where does the attempt log live?

Admin panel (new tab), or the existing Audit Log with a filter? I
recommend the Audit Log with a filter — no new surface, consistent
with other audit views.

## Q12c (REQ-08) — New thresholds, or keep existing?

Same 5/15min lockout for all roles? Or stricter for admin?

## Q13a (REQ-10) — Full `InternshipStatus` enum

Please confirm the complete list. My draft: `Active, Inactive,
Paused, Completed, Withdrawn, Graduated, Transferred`. Remove any you
don't want, add any I missed.

Scope note (2026-10-06): this governs the **new** `InternshipStatus`
column on `Intern`. It does **not** touch `User.IsActive`, which stays
as-is and continues to govern login. An intern may hold an active
`User` account with a `Completed` internship status — they log in to
read their history but cannot mark attendance or submit leave.
**REQ-10 is not specified or implemented until this is answered.**

## Q13b (REQ-10) — Who can set which status?

Draft: admin sets all. Mentor can set Active, Paused, Completed for
own interns. Intern cannot set any. Confirm.

## Q14a (REQ-11) — Same username, same account?

Confirmed by your clarification that re-hire repurposes the account.
Please confirm the username is preserved exactly.

## Q14b (REQ-11) — What carries over?

Draft: attendance history preserved (read-only), documents reset,
face reset, device binding reset, shift can be reassigned, tasks
reset, certificates preserved and viewable. Any exceptions?

## Q15a (REQ-11) — Can a period have multiple transfers?

Can the intern be transferred to another department *within* the same
period (this already exists), and then a new period started later?
Confirm the two flows coexist cleanly.

## Q15b (REQ-11) — What triggers period end?

Manual admin action ("Complete Internship"), or automatic when
`EndDate` passes? Draft: manual admin action; the automatic
`EndDate`-passing only marks the intern as `Completed` on the admin
dashboard, it does not close the period.

## Q16 (REQ-11) — Where does this live in the UI?

A button on the intern detail screen ("Start New Period")? A separate
admin screen? A modal on the completed-interns list? Confirm.

## Q17 (REQ-12) — Unique on CNIC only, or CNIC + email?

Both should probably be unique. Confirm.

**[ANSWERED] 2026-10-10 (owner — decision, supersedes PARTIAL):**
"CNIC is the only uniqueness gate. Email is NOT part of this
requirement." Ruling text (verbatim):

> An intern account's CNIC is mandatory. It must be unique across active
> intern accounts. Duplicate CNICs are rejected with an error that names
> the owning account.
> Scope: CNIC is the only uniqueness gate.
> Email is NOT part of this requirement. Q17 is answered: CNIC only.
> Legacy null CNIC rows are grandfathered.
> A future edit that touches CNIC must supply one (email stays out).

CNIC is now mandatory on create (D-S30a); no email column is introduced
or planned. This question is closed.

## Q18 (REQ-12) — What message should the admin see?

Draft: "This CNIC is already registered (username: xxx). To re-hire
this person, use the Start New Period action on their account." —
acceptable?

**[ANSWERED] 2026-10-08:** accepted with the wording refined to "This
CNIC is already registered **to another intern** (username: xxx)…",
implemented verbatim at `AdminController.cs:692` and shown inline
under the CNIC field in the Create Intern modal.

## Q19 (REQ-13) — Any specific buttons you've seen clip?

Or general polish? A list of 2–3 examples would help the agent
prioritize.

## Q20a (REQ-14) — Filter persistence

Should the dashboard remember the last-used filters per user across
sessions, or reset to defaults each session? Draft: remember within a
session, reset on relaunch (consistent with FR-UI-21).

## Q20b (REQ-14) — Metric scope confirmation

Confirm the metric catalog in §14.3–§14.4 is complete. Add any metric
you want that isn't listed. Remove any that isn't useful. This is the
single most important answer for REQ-14 — "no shortcuts" means every
metric in the final list ships.

## Q21 (REQ-14) — Default comparison

Draft: previous period (same length as the selected range, immediately
prior). Opt-in: same period last year. Confirm defaults.

## Q22 (REQ-14) — Charts library

Does the app already have a charting library installed? If not, is
`victory-native` acceptable? Alternatives: `react-native-chart-kit`
(lighter, fewer features), `react-native-svg-charts` (SVG-based,
flexible). I recommend `victory-native` — best maintained, most
flexible for the metric set above.

---

# Suggested scheduling

Once the questions are answered, these items are safe to schedule in this
order:

1. **REQ-01** — critical security fix; land immediately.
2. **REQ-12** — small, protects data integrity.
3. **REQ-08** — small if it's just scoping existing lockout to all
   roles + adding the audit filter.
4. **REQ-05** — needed alongside REQ-01; adds photo retention and
   visibility.
5. **REQ-04** — medium; depends on Q6.
6. **REQ-11 + REQ-10** — larger; land together as an account
   lifecycle workstream. `InternshipPeriods` is the anchor.
7. **REQ-06**, **REQ-13** — polish pass, land together.
8. **REQ-02**, **REQ-03** — small UI fixes once symptoms are captured.
9. **REQ-14** — large; scheduled across many sessions. Start only
   after REQ-10 and REQ-11 have landed, so the dashboards show
   correct status values and per-period data.
10. **REQ-07** — plan only; no code. Can be done in parallel.
11. **REQ-09** — informational; fold into W6 as W6.8.