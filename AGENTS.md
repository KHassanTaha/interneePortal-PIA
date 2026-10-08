# AGENTS.md — PIA Interns Portal (InternSystem.API + InternApp)

## 0. Project context (read this first)

**What this is.** A university capstone project: a mobile intern-management
portal for PIA (Pakistan International Airlines). Backend is an ASP.NET Core 8
Web API (`InternSystem.API`) backed by SQL Server. Frontend is a React Native
(JavaScript-only) Android app (`InternApp`).

**Who uses it.** Three roles: intern, mentor, admin. Each has its own screen
tree under `InternApp/src/screens/{intern,mentor,admin}`.

**Current focus.** Android only, tested on AVD `Pixel7` (`emulator-5554`) and
on a physical device over USB (`adb reverse tcp:5000 tcp:5000`). iOS must not
be broken, but no iOS-specific work is in scope.

**Two non-negotiable product contracts.** These are detailed in §4.

1. Offline-first. Every GET is cached; a defined set of writes is queued and
   replayed on reconnect. Auth and attendance are never queued. Governed by
   `docs/DECISIONS_LOG.md` D-01 through D-13.
2. Face verification. Attendance is gated by an on-device liveness challenge
   plus three server-side gates (anti-spoof, ArcFace 1:1 match, GPS geofence).
   Governed by `FACE_RECOGNITION_AND_SYSTEM_GUIDE.md`.

**Repo layout (authoritative).**

    interneePortal-PIA/
    ├── InternApp/                          # React Native app (JavaScript only)
    │   ├── android/
    │   ├── ios/
    │   └── src/
    │       ├── api/                        # axios client + endpoint wrappers
    │       ├── components/                 # shared UI (AppHeader, AppToast, etc.)
    │       ├── config/                     # env, constants, feature flags
    │       ├── navigation/                 # RootNavigator, stack/tab definitions
    │       ├── screens/{auth,intern,mentor,admin}/
    │       ├── store/                      # redux toolkit slices + persist config
    │       ├── sync/                       # outbox engine, replay, conflict handling
    │       ├── theme/                      # colour tokens, useAppTheme()
    │       └── utils/                      # faceUtils.js, logTypes.js, etc.
    ├── backend/
    │   ├── InternSystem.sln
    │   ├── InternSystem.API/               # controllers, security, schema guard
    │   ├── InternSystem.Core/              # entities, domain interfaces
    │   └── InternSystem.Infrastructure/    # DbContext, services
    ├── docs/                               # living documentation (see §9)
    ├── samples/                            # seed data, test fixtures
    └── AGENTS.md

**Do not touch.** `mobile/` at the repo root is a **stale duplicate of
`InternApp/`** and must never be edited, referenced, or resurrected. Delete it
if it still exists.

**Working directories.** Commands in this file assume the repository root
unless a `cd` is shown.

---

## 1. Role

You are an expert full-stack developer on this capstone. You write clean,
well-documented code. You explain every step, log every decision, and keep all
project state current. You do not "help out" on a feature — you own it from
design through verified completion. If you cannot verify something, it is not
done (§18).

---

## 2. Communication

- **Ask clarifying questions** when a requirement is ambiguous. Do not assume.
  Log the assumption as `[UNVERIFIED]` in `docs/CONTEXT.md` and ask.
- **Report status after every task or sub-task.** Three lines, always: what
  was completed, what is in progress, what is next.
- **Log every change request, requirement update, or bug fix** in
  `docs/PRD.md` with a status tag (`[NEW]`, `[UPDATED]`, `[REMOVED]`,
  `[FIXED]`), the date, the previous state, and the new state.
- **Log every design decision** in `docs/DECISIONS_LOG.md` immediately, using
  the same format as existing entries (`D-XX`, `D-XXn`, `D-SX`). Never batch.
  `docs/DECISIONS_LOG.md` is committed and is the public record. `docs/DECISIONS.md`
  (§9) is a local working copy the agent may use; the committed log is the one
  stakeholders read.
- **Never proceed on a silent assumption.** If unclear, either ask or log it
  as `[UNVERIFIED]` in `docs/CONTEXT.md` and continue only if non-blocking.

---

## 3. Code standards

### 3.1 Language versions

- **Backend**: .NET 8 LTS. Confirm any new package supports .NET 8 before
  adding it.
- **Frontend**: React Native as pinned in `InternApp/package.json`. Do not
  upgrade the RN major version as a side effect of an unrelated task.
- **JavaScript only. No TypeScript.** New frontend files use `.js`. Existing
  `.ts` and `.tsx` files are converted to `.js` under workstream **W7** (§5).
  Do not add `tsconfig.json`, `typescript`, `ts-jest`, `@types/*`, or
  `babel-preset-typescript`. Use JSDoc `@typedef` for shapes, not inline types.

### 3.2 Style

- **C#**: Microsoft C# Coding Conventions. Every public class, method,
  property, and event gets XML doc comments.
- **JavaScript**: 2-space indent, single quotes, trailing commas. Every
  exported function and component gets a JSDoc block. React components are
  function components with hooks — no class components.
- **File naming**: C# PascalCase. RN PascalCase for components
  (`DataPreviewTable.js`), camelCase for everything else.
- **Imports**: ES module `import`/`export` everywhere. No `require()` in new
  code.

### 3.3 Function design

Small, focused, single-purpose functions. Prefer pure functions in the
reducer/sync layers — those are the parts most likely to be tested and most
likely to be defended. No function longer than ~40 lines without a comment
justifying why.

### 3.4 Cross-platform rule (backend)

- Use `Path.Combine` / `System.IO.Path` for every file operation.
- Do not assume the working directory. Resolve from `AppContext.BaseDirectory`
  or configuration.
- A single `dotnet build` from `backend/` must succeed on Linux and Windows.

### 3.5 Reusability

- Frontend: use the shared components in `InternApp/src/components/` before
  writing a new one. Duplicating a layout or a piece of sync logic is a defect.
- Backend: use existing service patterns. Do not introduce a second way to
  reach the database.

---

## 4. Architecture

### 4.1 Backend layers

    InternSystem.API          → controllers, filters, middleware, DI wiring,
                                schema-guard SQL on startup
    InternSystem.Core         → entities, domain interfaces (no infra refs)
    InternSystem.Infrastructure → DbContext, services

**Dependency direction is fixed:** API → Core ← Infrastructure. Infrastructure
never references API. Core references neither.

### 4.2 Frontend layers

    screens/      → route-level components, one per screen
    components/   → reusable UI, no screen-specific logic
    store/        → redux slices, selectors, persist config
    sync/         → outbox queue, replay engine, conflict resolution
    api/          → axios client, interceptors, endpoint wrappers
    navigation/   → stack/tab definitions only
    theme/        → design tokens, no hard-coded values in screens

**Dependency direction is fixed:** screens → store/sync/api → (nothing in
screens). A slice must never import a screen.

### 4.3 The offline contract (D-01 through D-13)

The offline-first behaviour is a **domain contract**. It is recorded in
`docs/DECISIONS_LOG.md` as D-01 through D-13. Restated here so the contract
survives doc drift:

| # | Rule | Source |
|---|------|--------|
| D-01 | All GET responses are cached in AsyncStorage, namespaced per user, keyed by method+URL+query. Offline screens render the last cached value with an "offline · last updated" indicator. Per-endpoint TTL. | D-01 |
| D-02 | Queued writes show as "saved locally · pending", never as confirmed. A local pending mirror holds the entity until the server confirms. | D-02 |
| D-03 | `@react-native-community/netinfo` is the single connectivity truth. Global `useConnectivity()` hook + banner at the app root. | D-03 |
| D-04 | Persistence is `netinfo` + `redux-persist` + a custom sync engine. No heavy offline-queue library. Persist `auth`, `notifications`, `sync`. Do NOT persist volatile UI state. | D-04 |
| D-05 | **Queued writes (intern self-entry):** `POST /intern/leaves`, `POST /intern/documents` (+ withdraw), `POST /intern/certificate`, `PUT /intern/profile`, `PUT /intern/devices`. **Auth and attendance are NEVER queued.** | D-05 |
| D-06 | **Queued writes (admin/mentor moderation):** doc/gatepass/idcard/cert approve+reject, face approve/reject, leave approve/reject, create intern, shifts, departments, holidays, mentors, transfer endorse/reject. **Password-reset, delete, and attestation-sensitive actions are ONLINE-only.** | D-06 |
| D-07 | Attendance check-in/checkout requires internet. Offline buttons are disabled with a clear "requires internet" message. | D-07 |
| D-08 | Replay failure policy: permanent failures toast + in-app notification; NO infinite auto-retry. Transient (5xx/offline) retry on next reconnect/foreground with a bounded cap. Item lifecycle: `queued → sending → done | failed | conflict`. Manual Retry/Discard in a Sync screen. | D-08 |
| D-09 | Document upload binaries ARE included in the queue. The picked `content://`/`file://` file is copied into the app cache dir via `react-native-blob-util` at enqueue time; replay rebuilds `FormData` from the cached localPath. | D-09 |
| D-10 | Sync failures surface as toast AND as in-app local notifications merged into the existing Notifications screen + unread badge. No OS system-tray dependency. | D-10 |
| D-11 | Idempotency keys on ALL queued/replayable writes. Server stores processed keys per user (7-day TTL); duplicate key returns the stored response. Attendance + auth excluded. | D-11 |
| D-12 | Race-condition handling: atomic CAS transitions on approve/reject/finalize; rows-affected 0 → `409 STALE_STATE`. Snapshot at enqueue `{entityType, entityId, expectedStatus, scope:{internId, mentorId, deptId}}`; precondition check at replay; mismatch → `conflict`, never replay. Outbox is FIFO per entityKey. | D-12 |
| D-13 | Reuse existing fields (`Status`, `WithdrawnAt`, `ApprovedAt`) as the optimistic-lock predicate. No new `Version` column. | D-13 |

**If you add an endpoint that can be written to, you must classify it in
D-05 or D-06 and update this table and `docs/DECISIONS_LOG.md` in the same
commit.** An endpoint that is not classified is a contract violation.

### 4.4 The face-recognition contract

Attendance is gated by four stacked defences. All four must pass.

1. **Active liveness (client).** The app issues a random movement challenge
   (blink / turn left / turn right / smile) and observes the live camera for
   that motion. Client reports `livenessPassed: true` on success.
2. **Passive anti-spoof (server).** MiniFASNetV2. `realScore >= 0.60` passes.
3. **Face match (server).** ArcFace 512-D L2-normalised embedding. Cosine
   distance ≤ `0.58` passes.
4. **GPS geofence (server).** Haversine distance ≤ department radius
   (default 100 m).

**Data flow contract.**
- The raw photo is never persisted. Only the 512-D embedding is stored, and
  only at enrollment.
- The mobile app forwards a base64 JPEG; the server re-extracts the embedding
  on every verification. The client never computes embeddings.
- The three ONNX models live server-side under `Models/AI/`.

**Model acquisition is a first-run prerequisite.** The ONNX files are not
committed to the repository. `docs/LAUNCH_GUIDE_LINUX.md` and
`docs/LAUNCH_GUIDE_WINDOWS.md` document the acquisition and placement steps
for `ultraface.onnx`, `facenet.onnx`, and `antispoof.onnx`. Anyone launching
from a dead state must follow those steps first. Full technical specs
(input shapes, preprocessing, thresholds) are in
`FACE_RECOGNITION_AND_SYSTEM_GUIDE.md` §4 and §7.

**Known defects to fix, not reintroduce.** Two open weaknesses are documented
in `FACE_RECOGNITION_AND_SYSTEM_GUIDE.md` §6 and are scheduled for closure
under W9:

- §6.1 Client-asserted liveness. The backend currently trusts the
  `livenessPassed: true` boolean without server-side verification of the
  motion.
- §6.3 The `[` short-circuit in `CheckAntiSpoof` and `ExtractEmbedding` lets a
  stolen embedding bypass anti-spoof and re-extraction. **This is the most
  serious issue** and closes the "only the owner gets in" claim.

### 4.5 The security contract (already implemented — do not regress)

Recorded in `docs/DECISIONS_LOG.md` D-S1, D-S2, and the "Security phase"
section:

- Tokens live in OS Keychain via `react-native-keychain`
  (`com.internapp.access`, `com.internapp.refresh`). **Never in AsyncStorage.**
- Android cleartext blocked everywhere except `localhost`, `127.0.0.1`,
  `10.0.2.2`, `10.0.3.2`. `usesCleartextTraffic=false`.
- All `/files` consumption is authenticated. `fileUrl()` adds `?token=` for RN
  `<Image>`; `fetchFileLocal()` and `openFileWithAuth()` use BlobUtil with
  Bearer header.
- Reports are server-rendered via `/api/{role}/reports/{reportKey}/pdf|excel`
  (QuestPDF `PdfService.WriteReport`). Client downloads via BlobUtil and
  shares. The client-side `react-native-html-to-pdf` / `react-native-fs`
  report path was removed — do not resurrect it.
- Fail-closed config: no `ConnectionStrings` or `Jwt:Key` in
  `appsettings.json` or `appsettings.Development.json`. Env
  `ConnectionStrings__DefaultConnection` and `Jwt__Key`.
- Rate limiter 300/min/IP. JWT `tvn` claim checked against DB. Lockout after
  5 failed attempts (15 min, HTTP 423). Refresh-token rotation. Logout bumps
  `TokenVersion`.
- Admin cannot read passwords. Reset-only. BCrypt one-way hashes.

### 4.6 The document-and-face gate

CNIC and University ID must both be **approved** (and not withdrawn)
**AND** the intern must have an enrolled face before ANY official
document issuance (gate pass / ID card / certificate). Enforced on
admin + mentor approve endpoints (single and batch) and face
enrollment via `DocumentGateExtensions.OfficialDocsApprovedAsync`.

Batch approve reports skips with a reason that distinguishes the two
failure classes:
- `skippedDocsNotApproved` — CNIC or University ID missing/withdrawn.
- `skippedFaceNotEnrolled` — documents OK, face not enrolled.

### 4.7 Attendance scoring contract (PLAN.md §1, locked)

- Daily maximum **2.0**.
- **Arrival**: OnTime=1, Early=1, Late=0.5, Pending=0.
- **Departure**: OnTime=1, Late=1, Early=0.5, Pending=0.
- Absent / OnLeave = 0 for the day.
- Boundary = shift Start/End ± Grace (`AttendanceSettings.GraceMinutes`,
  default 15).
- `Attendance% = Σ dailyScore / (2.0 × totalDays) × 100` over
  `[StartDate, EndDate]`.
- Weekends and public holidays auto-full.
- Certificate gate: `EndDate ≤ today` AND `Attendance% ≥ ThresholdPct`
  (`AttendanceSettings.ThresholdPct`, admin-set).
- Status enum: `ArrivalStatus { Pending, OnTime, Early, Late, Absent, OnLeave }`,
  `DepartureStatus { Pending, OnTime, Late, Early, Absent, OnLeave }`.

### 4.8 Shift assignment contract

- 3 seeded company-wide shifts (Morning, Afternoon, Night) + mentor-created
  department-scoped custom shifts.
- Intern does NOT pick their shift. Admin/mentor sets it at account creation.
- No shift assigned → default Morning.
- Attendance is only markable within the intern's shift window (start −
  `grace_before` to end + `grace_after`). Shifts may cross midnight.
- Shifts can be changed by admin/mentor with an optional future effective
  date; the change is logged to `AuditLog`.

### 4.9 Intern transfer state machine (locked — PLAN.md §1)

`Pending → Endorsed → InternAccepted → Finalised` (or `Rejected` at any
pre-finalise step).

Two flows converge on the same machine:

- **Flow A (admin initiates):** admin → current mentor endorses → intern
  accepts → new (ToMentor) mentor finalises.
- **Flow B (current mentor initiates):** current mentor → admin endorses →
  intern accepts → new mentor finalises.

**Admin can endorse but never finalise.** Target is a specific `ToMentorId`.
`MentorTransferRequest` (the mentor's own department reassignment) is a
separate entity with its own flow — keep screens and endpoints separate.

### 4.10 Schema changes — how they work here

**Schema changes are ONLY applied via Program.cs startup schema-guard SQL.**
`dotnet ef migrations add` is **forbidden** — the snapshot is stale and
running it will corrupt the migration history. `sqlcmd` is available and
allowed for inspection and manual fixes when verified with the owner.

---

## 5. Workstreams

This project is in **feature-completion and hardening mode**. New work is
always classified into one of these:

| # | Workstream | Definition of done |
|---|------------|--------------------|
| W1 | Feature completion | FR implemented, tested, verified per §18. |
| W2 | Test coverage | Every service, slice, and sync path has unit tests. |
| W3 | Offline hardening | Every write endpoint classified per §4.3; conflict paths tested; M11 E2E suite green. |
| W4 | Security hardening | §4.5 unchanged; no secrets, no vulnerable deps, no invented packages. |
| W5 | In-app guide | The Help section matches the current UI. |
| W6 | Documentation | Launch guides pass the dead-state check (§10.4). |
| W7 | JavaScript migration | Every `.ts` / `.tsx` under `InternApp/src/` is `.js` with JSDoc. No TS tooling in `package.json`. `npx jest` and `npx react-native run-android` pass. |
| W8 | 23-item sweep verification | Walk the PIA_BUGS_AND_CHANGES list on the emulator and mark each item `[x]` with evidence, or reopen it. |
| W9 | Face-recognition hardening | Close FACE_RECOGNITION §6.1 (client-trusted liveness) and §6.3 (embedding bypass). |

**Open large-scope plans already on the books** (from `PLANNED_FEATURES.md`
and `PIA-Interns-App-Planned-Features.md`) — these are workstream W1 items and
each has its own full specification in those documents:

- Notifications end-to-end (entity, service, controller, 3-role UI, badge).
- Admin Shifts full CRUD + impact + reassignment guard.
- Admin Transfers create/edit/view + filters + sort.
- Admin Settings hub (Grace, Threshold, Allowed Leave Days, Holidays CRUD).
- Departments — radius locked at 100 m (backend ignores request value).
- Reports (server-rendered PDF + Excel per role/report key).
- Task-completion scoring (threshold default 80%, admin-configurable).
- Detox E2E suite (setup complete, tests pending).
- Unified Intern Management (`InternDetailScreen` with Profile/Face/Device/
  Documents tabs — see `Unified Intern Management.md`).

Do not start W1 work whose W2–W4 follow-ups are unscheduled. Add the follow-up
to `docs/TODO.md` in the same commit.

---

## 6. Testing

**The repository has no automated tests today.** That is the single largest
risk. Every future change must reduce this debt.

### 6.1 Backend (xUnit)

- Create `backend/tests/InternSystem.Core.Tests/` and
  `backend/tests/InternSystem.API.Tests/`; add to the solution.
- xUnit only. Unit-test every service in
  `InternSystem.Infrastructure/Services/`.
- Integration-test every controller with `WebApplicationFactory<Program>`.
- In-memory or SQLite provider for tests — never the developer's real SQL
  Server.
- Cover happy path, validation failure, auth failure, and one edge case per
  endpoint.

### 6.2 Frontend (Jest + React Native Testing Library)

- Jest config and test files are plain JavaScript — no `ts-jest`, no
  `babel-preset-typescript`.
- `@testing-library/react-native` for component tests. Test behaviour, not
  implementation.
- Unit-test every pure function in `sync/` and every reducer in `store/`.
- Mock `@react-native-community/netinfo` and `AsyncStorage` in
  `jest.setup.js`.
- Fixed seed or fixed fixtures for anything time-dependent.

### 6.3 E2E (Detox)

`PLANNED_FEATURES.md` Phase 9 says Detox setup is complete; no tests exist yet.
The intended configuration is `android.emu.debug`. Coverage: auth (3 roles),
admin flows, mentor flows, intern flows, notifications, reports (PDF/Excel),
offline-queue → reconnect → conflict (M11).

### 6.4 Coverage target

- Core + Infrastructure (backend): ≥ 80% line.
- `sync/` + `store/` (frontend): ≥ 80% line.
- Screens: ≥ 50% line.

### 6.5 Test rules

- A test that does not fail against the bug it was written for is not a test.
- Never assert on `IsVisible` alone — assert position or content where a
  layout defect would be.
- Never write to the developer's real filesystem or database. Temp dirs only.
- A test that needs uncommitted data must **skip**, not fake, and the skip
  must name what it cannot show.

### 6.6 How to run

```bash
# Backend
cd backend
dotnet test

# Frontend
cd InternApp
npx jest
npx jest --coverage
```

---

## 7. Deliverables

- Complete, documented source code (XML docs on C# public APIs; JSDoc on
  exported frontend functions).
- `README.md` explaining how to build and run on Linux and Windows.
- `docs/DECISIONS_LOG.md` (committed, append-only).
- `docs/LAUNCH_GUIDE_LINUX.md` and `docs/LAUNCH_GUIDE_WINDOWS.md` passing the
  dead-state check, including the ONNX model acquisition steps (§4.4).
- A test suite that runs with `dotnet test` and `npx jest`.
- Sample data in `samples/`.
- Frontend source tree with zero `.ts` / `.tsx` files (W7 complete).

---

## 8. Stakeholder readiness

This project will be demonstrated and defended. You must understand every
line.

- Comments explain **why**, not what. The sync replay loop, the conflict
  resolver, and the JWT validation pipeline are the three places where a line
  of code is worth more than a paragraph of comment.
- Every external library you use is listed in `docs/DECISIONS_LOG.md` with its
  purpose, licence, and why it was chosen over alternatives.
- Simplicity first. Minimum code that solves the problem; no speculative
  abstractions.
- Surgical changes — touch only what the task requires; flag dead code, don't
  delete it.
- Every non-obvious decision is traceable to a `D-XX` entry.

---

## 9. State persistence & progress tracking (NON-NEGOTIABLE)

You must treat project state as a living artifact. Stale state is a critical
failure.

### 9.1 Persistent files you must maintain

All live in `docs/`. **They are added to `.gitignore` and must never be staged
or committed.**

| File | Purpose | When to update |
|------|---------|----------------|
| `docs/TODO.md` | Master task list with statuses | Immediately on any status change |
| `docs/PROGRESS.md` | Narrative log of what was done and when | After every completed task |
| `docs/DECISIONS.md` | Local working copy of decisions (mirror to committed `DECISIONS_LOG.md`) | The moment a decision is made |
| `docs/REQUIREMENTS.md` | Traceability matrix: requirement → status → source → test → decision ID | When a requirement status changes |
| `docs/CONTEXT.md` | Domain knowledge, assumptions, open questions | When new domain info is learned |
| `docs/BLOCKERS.md` | Anything preventing progress, with owner and needed action | Immediately when a blocker is identified or resolved |

**`.gitignore` entries** (add once, in the same commit as this file):

    docs/TODO.md
    docs/PROGRESS.md
    docs/DECISIONS.md
    docs/REQUIREMENTS.md
    docs/CONTEXT.md
    docs/BLOCKERS.md
    docs/DEVELOPMENT_CREDENTIALS.md

`docs/DECISIONS_LOG.md` is committed and is the public record.
`docs/DECISIONS.md` is the agent's working copy. Mirror entries; do not let
them drift.

### 9.2 Task statuses

Every task in `docs/TODO.md` uses exactly one of:

- `[ ] TODO` — not started
- `[~] IN PROGRESS` — actively being worked on (only ONE at a time)
- `[?] BLOCKED` — cannot proceed; must have a `BLOCKERS.md` entry
- `[x] DONE` — completed and verified
- `[-] CANCELLED` — no longer needed, with reason

### 9.3 Update discipline

1. **Before starting any work**: read `TODO.md`, `DECISIONS.md`,
   `REQUIREMENTS.md`, `BLOCKERS.md`. Do not trust memory.
2. **The instant you begin a task**: set it to `[~]` with a timestamp.
3. **The instant you finish**: set it to `[x]`, add a completion timestamp,
   and append a summary line to `PROGRESS.md`.
4. **New requirement mid-work**: add to `TODO.md` before continuing.
5. **Decision made**: append to `DECISIONS.md` and `DECISIONS_LOG.md`
   immediately.
6. **Blocked**: set the task to `[?]`, create/update `BLOCKERS.md`, and stop
   working on that task.
7. **Never batch updates.** Update at the moment the change occurs.

### 9.4 Session start & end

**Start:** read all persistent files, summarise the current state in 3–5
lines, confirm the next task from `TODO.md`.

**End (or when the owner says "wrap up"):** ensure all statuses are current,
`PROGRESS.md` reflects the session, `BLOCKERS.md` lists anything unresolved,
and produce the §13 handoff.

### 9.5 Assumption tracking

Maintain an "Assumptions" section in `docs/CONTEXT.md`. Every assumption is
tagged `[UNVERIFIED]` or `[VERIFIED]`. When one changes, update the tag
immediately and note the source. Never silently change an assumption.

### 9.6 Enforcement

- If a persistent file is out of date relative to the code, **stop and fix it
  before continuing**.
- If the owner asks for something that conflicts with a persistent file,
  point out the conflict and ask for resolution before proceeding.

### 9.7 Traceability

Every requirement in `docs/PRD.md` appears in `docs/REQUIREMENTS.md` with
status, source file, test name, and decision ID. `PRD.md` is the master;
`REQUIREMENTS.md` is derived. If they disagree, PRD wins and `REQUIREMENTS.md`
is reconciled immediately. No orphan rows.

---

## 10. Documentation deliverables & demo readiness

### 10.1 Required files

| File | Audience | Purpose |
|------|----------|---------|
| `docs/LAUNCH_GUIDE_LINUX.md` | Dev + grader | Dead-state launch on Linux |
| `docs/LAUNCH_GUIDE_WINDOWS.md` | Dev + grader | Dead-state launch on Windows |
| `docs/USER_MANUAL.md` | Non-technical end user | How to use the app |
| `docs/DEVELOPMENT_CREDENTIALS.md` | Dev only (gitignored) | SA password, JWT key, demo logins |

The launch guides must include the ONNX model acquisition and placement steps
(§4.4) as a first-run prerequisite.

### 10.2 When to update the launch guides

Immediately, in the same commit, whenever: a package is added; a project is
added; the .NET SDK or Node version changes; a new env var or secret is
required; a launch command or flag is introduced; the folder layout changes;
a new prerequisite is discovered; a failure mode is fixed (add to
Troubleshooting).

### 10.3 When to update the user manual

Immediately whenever a UI element, input, workflow, output, or user-facing
error changes.

### 10.4 The dead-state rule (non-negotiable)

"Dead state" = fresh clone, no `node_modules/`, no `bin/`, no `obj/`, no
Metro cache, no prior setup. The app must launch by following the relevant
launch guide alone.

**Before marking any workstream done:**

1. Delete `node_modules/`, `bin/`, `obj/`, the Metro cache.
2. Verify the documented commands work from that state.
3. Confirm the launch guide reflects reality — including model acquisition.

If it does not work, the work is NOT done.

### 10.5 Demo-day guarantee

When the owner announces a demo:

- Produce a `DEMO_CHECKLIST` inside `docs/LAUNCH_GUIDE_LINUX.md`.
- Include offline pre-restore steps (demo must not depend on Wi-Fi).
- Exact launch command. Exact sample data file. Exact tap sequence.
- Fallback: pre-recorded capture path or an API-only walkthrough.

### 10.6 Verification discipline

- Copy exact commands you ran into the launch guide. Do not invent commands.
- Never write "should work". Only "verified on <OS> on <date>".
- **A test may not override production sizing.** If a test needs a different
  size, the sizing belongs in the component's StyleSheet so the test and the
  app read the same declared value.
- **A test that needs uncommitted data must skip, not fake.** Name the
  fixture, name what it cannot show, say which test covers the behaviour.
- **Assert where the side effect landed, not just that it happened.** Re-read
  the file from disk. Open the PNG. Read the log file. Assert on the path the
  code used, not the path the test passed in.
- **A negative result is only evidence for the pattern you searched.**
  Before reporting "no X found", "not present", or "does not
  reproduce", state three things:
  1. The exact search pattern you used.
  2. The scope you applied it to (which directory, which file
     extension, which log stream).
  3. What *would* have matched if the thing existed — a concrete
     example string, filename, or log line.

  If you cannot produce (3), you have not searched — you have
  looked. "Grep returned nothing" and "this does not exist" are
  different claims; only the first is a fact.

  Concrete failure modes this rule prevents, all observed in this
  project:
  - A scan for `*.test.js` reported "zero test files" while
    `__tests__/App.test.tsx` sat at the repo root.
  - A grep for `"text outside Text"` and `"missing key"` — strings
    React Native does not emit — reported "C1/C2 do not reproduce".
  - Three separate property names were invented for test fixtures
    (`GeofenceRadiusMeters`, `InternRegNo`, `User.FullName`) and none of them
    existed. The entities expose `RadiusMeters`, `RegNo`, and no `FullName` on
    `User`. Compilation caught it, but only after a guess had been written down
    as if it were fact.
  - `dotnet list package --vulnerable` without `--include-transitive`
    reported "zero vulnerable packages across all three projects"
    while three High-severity transitives were present.
- **A resizable surface needs a test that actually resizes it.** Change the
  size, let layout settle, assert the resize took effect, then assert
  position — not just visibility flags.
- **Screenshot evidence is append-only.** Never overwrite a screenshot cited
  as evidence of a defect. Add a new file.

### 10.7 Names are guesses, not facts

A property, method, column, table, enum member, or file path that you did not
just read out of the source is a guess. Guesses are fine to form; the failure is
treating one as verified.

- **Read before you write.** `grep` the actual declaration first. Do not infer a
  name from a sibling class, a similar entity, or a comment.
- **Never let a guess reach a commit.** If you asserted against a name that does
  not exist, the test is fiction and the suite is worse than no suite.
- **When corrected, correct the test, not the production code.** If a fixture
  disagrees with the service, the fixture is wrong until proven otherwise.
  Record which side was wrong.
- **A wrong guess is a finding worth writing down**, because the next agent will
  make a similar one.

### 10.8 No duplicate instructions

Each instruction in the launch guides and user manual has exactly one
canonical location. If the same step appears twice, consolidate and
cross-reference. Grep for the key phrase before marking done.

---

## 11. Security & supply-chain discipline (MANDATORY)

AI coding agents are a known vector for supply-chain attacks. This section is
higher priority than any deadline.

### 11.1 Never invent a package

- Verify every dependency exists on `npmjs.com` or `nuget.org`.
- Check the name character by character. Typosquats are the most common
  attack vector.
- Check the publisher and repository link. A package claiming to be the
  official wrapper for a major library with one maintainer and 12 downloads
  is not.
- If you cannot verify, **do not add it**. Ask or find an alternative.

### 11.2 Dependency hygiene

- Backend: `dotnet list package --vulnerable` before adding, and after every
  `dotnet restore`. Do not commit on a known-vulnerable package.
- Frontend: `npm audit` before adding, and after every `npm install`. Do not
  commit on a high or critical advisory.
- Pin versions. Backend uses exact versions in `.csproj`. Frontend uses a
  committed `package-lock.json`; never `rm` it to "fix" a conflict.
- Do not add a package to do what the standard library already does.
- **No TypeScript tooling** — no `typescript`, `ts-jest`, `@types/react`,
  `@types/react-native`, `babel-preset-typescript`. Not needed (W7, §5).

### 11.3 Secrets

- Never commit a connection string, JWT signing key, SA password, API key, or
  demo credential. `docs/DEVELOPMENT_CREDENTIALS.md` is gitignored and is the
  only place they live on disk.
- Never log a password, token, connection string, or face embedding. Serilog
  configuration must redact these. Add a Destructure policy for any object
  that might carry them.
- If a secret is accidentally committed: tell the owner immediately, rotate
  it before doing anything else, do NOT amend the commit to "clean up."

### 11.4 Database boundary

- The mobile app never connects to SQL Server directly. Every call goes
  through the API over HTTPS.
- The API's SQL login is least-privilege. Not `sa`.
- `Encrypt=true` for anything not `localhost`. `TrustServerCertificate=false`
  outside local dev.
- EF Core parameterises. Raw SQL only in migrations or the Program.cs
  schema-guard, with a comment explaining why.

### 11.5 Mobile-side storage

- `AsyncStorage` is unencrypted. Acceptable for the offline read cache (D-01).
  Not acceptable for JWTs or refresh tokens.
- JWTs and refresh tokens go in `react-native-keychain` (already implemented —
  see §4.5). If you find any code putting them in `AsyncStorage`, that is a
  defect to log and fix.
- Face embeddings on-device are sensitive. The current design keeps them in
  memory during a verification session. Do not add persistence without a
  decision entry.

### 11.6 Network

- All API calls use HTTPS in production. The Android network security config
  blocks cleartext outside loopback and emulator dev hosts (§4.5).
- Local development against `10.0.2.2` (emulator) or `adb reverse tcp:5000
  tcp:5000` (device) is the one exception and is scoped to dev.
- Certificate pinning is a candidate; log the decision in `DECISIONS_LOG.md`
  with the trade-offs (pinning breaks on cert rotation).

### 11.7 Auth

- JWT validation uses `Microsoft.AspNetCore.Authentication.JwtBearer` with
  `ValidateIssuer`, `ValidateAudience`, `ValidateIssuerSigningKey` all true.
- Clock skew ≤ 1 minute.
- Never issue an access token without validating the password first.
- Refresh-token rotation is required: a used refresh token is invalidated when
  exchanged.

### 11.8 If you are unsure

Stop and ask. A missing feature is recoverable; a compromised dependency or a
leaked credential is not.

---

## 12. Error monitoring & debugging

### 12.1 Developer logging

**Backend (Serilog).** Console sink for `dotnet run`. Rolling file at
`logs/app-YYYYMMDD.log`, retained 7 days. Error-only file at
`logs/errors-YYYYMMDD.log`.

**Frontend (`react-native-logs` or equivalent).** Console transport in dev.
File transport to the app's document directory with a size cap (e.g. 5 MB, 3
files) so it cannot fill the device. A transport that batches and posts
error-level events to the API's `/api/client-log` endpoint so tester-device
crashes surface in the admin panel.

**Toast testability.** `showToast` logs `[toast] <type> <message>` via
`console.log`, so toasts can be verified with
`adb logcat | grep ReactNativeJS` instead of fragile UI dumps.

### 12.2 Application logging (admin-viewable)

This is a domain feature. It records user-facing actions for the admin panel.

- Every login, logout, attendance check-in/out, document upload, approval,
  rejection, and admin action writes a row to `AuditLog`.
- Row carries: timestamp (UTC), actor user ID, actor role, action type, entity
  type, entity ID, outcome (success/failure), human-readable description, and
  (where relevant) device ID, GPS coordinates, and method (manual vs
  automated).
- Never log a password, token, connection string, or face embedding.
- `AuditLog` is append-only. The API exposes no update or delete for it.

### 12.3 Log levels

| Level | When to use |
|-------|-------------|
| `Verbose` | Debug builds only — every state check, every RNG draw |
| `Debug` | Sync replay steps, queue-length changes, scheduling |
| `Information` | App start/stop, auth events, audit writes |
| `Warning` | Recoverable issues (cached GET failed, queued write retrying) |
| `Error` | Operation failed but the app continues |
| `Fatal` | Unrecoverable — the app is about to exit |

### 12.4 Global exception handlers

**Frontend** must install `ErrorUtils.setGlobalHandler`,
`react-native-exception-handler`, and a React error boundary around the
navigation root. Each writes the full exception to the local log, attempts to
post to the API, and shows a themed error screen — not a white screen.

**Backend** must install `app.UseExceptionHandler` and Serilog
`UseSerilogRequestLogging`. Unhandled exceptions return a problem-details
response with a correlation ID that is present in the log.

### 12.5 Crash log format

Every crash entry includes: timestamp (ISO 8601 UTC); app version and build;
device model, OS version, and whether emulator or physical; current user ID
and role (not the token); last screen name and last successful API call; full
exception with stack trace.

### 12.6 Rules for the agent

- **When a build fails**: read the output, quote the exact compiler error, do
  not guess.
- **When a test fails**: run with detailed verbosity, quote the failure, do
  not mark anything done.
- **When the app crashes**: check the newest local log and the newest
  `logs/crash-*.log` first. Quote the stack trace before suggesting a fix.
- **Never** write an empty catch. Every catch either logs and rethrows, logs
  and returns a safe default with a rationale comment, or logs and shows the
  user a themed dialog.
- **Never** use `console.log` for anything that should be logged. Use the
  logger abstraction. (The single exception is the `[toast]` testability log
  in §12.1.)
- **Server error responses use `{"message": "..."}`.** Controllers,
  model-binding failures (via `InvalidModelStateResponseFactory`), and the
  global exception handler all return this shape. The mobile client's error
  handler reads `e.response?.data?.message`. Do not introduce a different
  envelope for a new endpoint.

---

## 13. Session wrap-up format

At the end of every session (or when the owner says "wrap up"), produce
exactly this structure. Save it to the top of `docs/PROGRESS.md` and paste it
into the chat.

```
Session Handoff — YYYY-MM-DD HH:MM
Branch: <current branch>
Status: <Clean / In-Progress / Blocked>

Done
<Task from TODO.md, now [x]>
<Task from TODO.md, now [x]>

In Progress
<Task from TODO.md, currently [~]>
  What is complete:
  What remains:

Next Session Should Start With
<Top item from TODO.md>
<Second item>

Blocked
<Task or decision, with BLOCKERS.md entry ID>

Git State
Commits made this session: <hash + message>
Pushed to origin: <Yes/No — and if No, why>
Uncommitted changes: <None / list>

Build & Test
dotnet build: <PASS/FAIL>
dotnet test: <PASS/FAIL — N passed, M failed>
npx jest: <PASS/FAIL — N passed, M failed>
Warnings: <0 / list>

Files Touched
backend/...: <added/modified/deleted>
InternApp/...: <added/modified/deleted>
docs/...: <added/modified>
tests/...: <added/modified>

Decisions Made
<Decision — link to DECISIONS_LOG.md anchor>

Assumptions Added/Changed
<Assumption — tagged [VERIFIED] or [UNVERIFIED] in CONTEXT.md>

Notes for Next Session
<Anything not captured above>
```

Rules:

1. Timestamp ISO 8601, local time.
2. Every "Done" line must be a status change in `TODO.md` from this session.
3. Every "Decision" must have a matching `DECISIONS_LOG.md` entry.
4. Every "Assumption" must have a matching tag in `CONTEXT.md`.
5. Never write "various changes". Be specific.
6. Never leave "Build & Test" blank. Run both before wrapping.
7. If the session was blocked and no commits were made, say so explicitly.

---

## 14. Session resume protocol

When the owner says "RESUME SESSION", perform a cold-start reconciliation
before any other action.

### 14.1 Reconciliation steps

1. **Read** in this order: `AGENTS.md` → `docs/TODO.md` →
   `docs/PROGRESS.md` (top 3) → `docs/BLOCKERS.md` → `docs/DECISIONS_LOG.md`
   (last 5 entries) → the "Last verified" line in `docs/LAUNCH_GUIDE_LINUX.md`.
2. **Inspect reality:**
   - `git status`
   - `git log --oneline -5`
   - `git branch --show-current`
   - newest file in `logs/` (if present)
3. **Detect drift:**
   - A task `[~]` in TODO with no matching `[x]` from the previous session →
     flag it. Ask whether to resume, reset, or cancel.
   - Uncommitted changes → list them. Do not commit without approval.
   - A crash log newer than the newest PROGRESS entry → read the top 20 lines
     and quote the exception.
   - A launch guide "Last verified" older than the newest commit → flag it.
   - Disagreement between `docs/PRD.md`, `docs/REQUIREMENTS.md`, and
     `docs/DECISIONS_LOG.md` → flag it.
4. **Produce the state summary** in exactly this format:

```
Branch: <name>
Last commit: <hash + message + time>
Last task: <last [x] from TODO.md>
In progress: <current [~] or "None">
Next task: <top of TODO.md>
Blocked: <count from BLOCKERS.md or "None">
```

5. **Wait for confirmation.** Do not begin work until the owner says "go".

### 14.2 Rules

- Never trust `PROGRESS.md` alone — cross-check with git.
- If recorded state and reality disagree, **reality wins.** Update the
  persistent files before proceeding.
- If you cannot determine what the previous session did, say so. "I cannot
  determine whether X was completed" is a valid answer.
- If uncommitted changes exist that you did not make, do not discard them.
  Ask.
- After reconciliation, append one line to `PROGRESS.md`:
  `## Resume — YYYY-MM-DD HH:MM — reconciled: <N findings>`

---

## 15. In-app guide (maintained)

The app has a Help / Guide section. It is a first-class deliverable.

- Content lives as markdown in `docs/USER_MANUAL.md`, rendered in-app.
- Every screen with a non-obvious control carries a "?" icon that deep-links
  to a guide section by anchor, not by index.
- When a screen changes, the corresponding guide section changes in the same
  commit. A guide that describes a screen that no longer exists is a defect.
- A test verifies the guide renders non-empty output for a known section and
  that every anchor referenced in the app exists.

---

## 16. UI/UX standards

### 16.1 Design principles

Every UI decision serves one of these four goals:

1. The user always knows what the current state is.
2. The user always knows what they can do next.
3. The user always knows why something is disabled or failing.
4. The user can always undo or reset.

If a UI element does not serve one of these, it does not ship.

### 16.2 PIA-specific global rules (from the Aug-19 and Aug-20 work reports)

- **No emojis anywhere in the UI.** Use the `Icon` component for all icons.
- **PIA palette only**: green `#004F30`, green `#006633`, gold `#C9A227`,
  cream and neutral tones. **Never blue.** Flagged: the login screen still has
  a blue gradient — this is a known defect to fix.
- **Dark mode on every screen** via `useAppTheme()`. Dark-mode variants of all
  theme keys are kept in `src/theme/`.
- **No page title bars.** Navigation relies on `AppHeader` + tab labels.
- **Keep `AppHeader` back-button behaviour.** Do not remove or replace.
- **Filter chips must not clip.** Segmented control, min-height 40, centred
  text, line-height 20.
- **No infinite `Animated.loop` effects.** They break UI automation dumps. Use
  one-shot animations only.
- **Toasts render inside their own transparent Modal** so they appear above
  screen modals. Auto-dismiss after 4 s (a 3 s duration is a candidate
  improvement).
- **Stat cards use the gold accent.** Numbers shown; cards act as navigation.
- **Mandatory-field validation** with specific per-field error messages.
- **Surgical changes.** Touch only what the task requires. Do not refactor or
  clean up unrelated code. Flag dead code, do not delete it.
- **Ask before assuming.** Present interpretations and tradeoffs; show mockups
  before finalising designs.
- **Goal-driven execution.** Define verifiable success criteria and loop until
  verified on-device.
- **Fail loud.** Report uncertainty explicitly.

### 16.3 Mandatory patterns

| Pattern | Where | Rule |
|---------|-------|------|
| Searchable picker | Any list longer than 8 items | Type-to-filter + clear + keyboard nav |
| Inline error | Fields with validation | Near the field, actionable text |
| Themed dialog | All confirmations and errors | Never the OS-native alert for a decision |
| Themed toast | All non-blocking notifications | Consistent colour, icon, position |
| Dimmed disabled state | All disabled inputs | Muted colour + reason on tap |
| Persistent label | All inputs | Label, not just placeholder |
| Unit on numeric input | All numeric fields | "e.g. 5000 (ms)" not just "5000" |
| Offline indicator | Every screen that reads cached data | "offline · last updated <time>" |

### 16.4 Theming

Define every colour, spacing, and radius in `InternApp/src/theme/`. Never
hard-code a hex value in a screen. A reviewer must be able to change one file
to restyle the app.

### 16.5 Accessibility

- Every control reachable by screen reader.
- Every icon has an accessible label.
- Every disabled control explains why.
- Every error message states cause + remedy.
- No tap-only functionality.
- Respect the OS reduced-motion setting.

### 16.6 Reusable components

Use or build these once in `InternApp/src/components/`:
`AppHeader`, `AppToast`, `AppConfirm`, `FilterChips`, `SearchableDropdown`,
`DateField`, `PasswordInput`, `ActivityCard`, `Icon`, `Dropdown`,
`RightSidebar`, `ValidatedField`, `OfflineBanner`, `DataPreviewTable`.
Duplicating UI logic is a defect.

### 16.7 Form validation

Visual: default border normal; red ≥ 2 px + icon on error; red + thicker focus
ring when focused-with-error; error clears immediately when the field becomes
valid.

Textual: inline message below the field, red text, states what is wrong AND
what is expected. Not a generic "Invalid input".

Behaviour: validate on blur, not on keystroke. On submit failure, focus moves
to the first invalid field. Red is never the only cue — an icon and a message
are always present.

### 16.8 Keyboard / focus

Tab order is part of the contract. Sketch it before building a screen. Every
modal traps focus while open, closes on Escape (or Android back), and returns
focus to the opener on close.

---

## 17. Version control

### 17.1 Remote

`origin` is `https://github.com/KHassanTaha/interneePortal-PIA`. Default
branch is `main`. Never force-push `main`.

### 17.2 Branch strategy

- `main` is always buildable and always passes the dead-state check.
- Each task or small group of related tasks gets a short-lived branch:
  `feat/<short-description>`, `fix/<short-description>`,
  `docs/<short-description>`, `chore/<short-description>`,
  `test/<short-description>`, `refactor/<short-description>`.
- Merge within a session if possible.

**`backup/recovered-all` is not a trusted base.** It is stale and its contents
diverge from the current working state. Do not use it as a merge base, do not
cherry-pick from it, and do not resurrect it as a fallback. If a real safety
net is needed, create a fresh tag from the current `main` first.

### 17.3 Commits

- One logical change per commit.
- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`,
  `refactor:`.
- Body explains **why**, not what.
- Never commit `node_modules/`, `bin/`, `obj/`, `.vs/`, `.idea/`, secrets,
  real intern data, or any state file from §9.
- Before every commit: `dotnet build`, `dotnet test`, `npx jest` must pass.
  If they fail, fix or revert. Do not commit broken code.

### 17.4 Push policy

- Push the feature branch after each meaningful commit:
  `git push -u origin feat/<branch-name>`.
- Do not push directly to `main`.
- Do not create a pull request automatically. Tell the owner the branch is
  ready.
- Do not `git push --force` on a branch that has been pushed.

### 17.5 What not to do

- Do not commit broken code "temporarily".
- Do not amend commits that have been pushed.
- Do not delete a branch that has not been merged.
- Do not run `git reset --hard` without asking.
- Do not add secrets, tokens, or credentials to the repo.
- Do not add a CI workflow that requires paid runners without asking.

### 17.6 No GitHub Actions for now

CI is deferred by owner decision. Do not add a workflow file. When enabled, it
will run `dotnet test` and `npx jest` on both Linux and Windows and put a badge
in `README.md`.

---

## 18. UI completion criterion (non-negotiable)

A UI requirement is **not** `[x] DONE` because tests pass, code exists, or a
file was committed.

A UI requirement is `[x] DONE` only when:

1. The agent has launched the app on the emulator or a connected device.
2. The agent has executed the exact tap sequence the requirement describes.
3. The agent has observed the expected result.
4. Verification is documented in `PROGRESS.md` in this form:
   `FR-XX verified on YYYY-MM-DD: tapped [sequence], observed [result],
   screenshot at logs/screenshots/fr-xx.png`.
5. A screenshot is attached when practical.

If verification was not performed, the requirement is `[~]`, not `[x]`.

The same discipline applies to a whole workstream: a workstream is not `[x]`
until its `PROGRESS.md` entry contains a verification table listing every
requirement it touched and how each was verified.

This rule exists because the reference project shipped a wave of UI rows
marked `[x]` that were never functionally verified. Never repeat that.

---

## 19. What "done" means (summary)

A task is done when all of these are true:

- [ ] Code is written and follows §3 and §16.
- [ ] Unit tests exist and pass (§6).
- [ ] The relevant launch guide still works from a dead state (§10.4).
- [ ] User manual / in-app guide reflects the change if the UI changed
      (§10.3, §15).
- [ ] If it is a UI change, §18 verification was performed and recorded.
- [ ] The change is committed on a feature branch and pushed.
- [ ] `TODO.md` is `[x]`, `PROGRESS.md` has a line, `DECISIONS_LOG.md` has an
      entry if a decision was made, `BLOCKERS.md` is updated if anything is
      unresolved.
- [ ] No secret, no vulnerable dependency, no invented package was introduced
      (§11).

If any box is unchecked, the task is `[~]` or `[?]`, never `[x]`.
