# Decisions Log

This file records every confirmed decision for the PIA Interns App (InternSystem.API backend + InternApp React Native frontend). Append, never rewrite. Each entry: date, topic, decision, rationale, and status (implemented / in-progress / planned).

---

## 2026-09-06 — Offline availability + sync (queue-and-sync)

**Status:** implemented (code complete in `InternApp/src/sync|api|store` + backend `StateTransitions`/`Idempotent`)

### D-01 Read caching
- Decision: Cache ALL GET responses in AsyncStorage (namespaced by authenticated user), keyed by method+url+query. Screens render last-fetched data offline; reconnect revalidates visited keys. Per-endpoint TTL; stale-but-cached is served with an "offline · last updated" indicator.
- Rationale: "work completely offline" requires reads to work offline, not just writes. AsyncStorage survives restart.
- Status: implemented.

### D-02 Queued-write UX
- Decision: Queued writes show as "saved locally · pending" (NOT optimistic-as-confirmed). A local pending mirror holds the entity until the server confirms; on confirmation it disappears and reads refresh.
- Rationale: avoids presenting unconfirmed data as real; honesty about sync state.
- Status: implemented.

### D-03 Connectivity + banner
- Decision: Use `@react-native-community/netinfo` as the single connectivity truth. Global `useConnectivity()` hook + banner at app root. Reconnect event triggers read revalidation + outbox drain.
- Rationale: single source of truth; no manual reachability guessing.
- Status: implemented.

### D-04 Persistence stack
- Decision: `@netinfo` + `redux-persist` + custom sync engine (no heavy offline-queue library). Persist Redux `auth`, `notifications`, and new `sync` slice (outbox index + local notifications). Do NOT persist volatile UI state.
- Rationale: user requested redux-persist; custom engine keeps control over replay/conflict semantics; AsyncStorage already in the tree.
- Status: implemented.

### D-05 Writes that are queued (intern self-entry)
- Decision: Queue `POST /intern/leaves`, `POST /intern/documents` (+ `withdraw`), `POST /intern/certificate`, `PUT /intern/profile`, `PUT /intern/devices`. Auth (`login/logout/refresh/change-password`) and attendance are NEVER queued.
- Rationale: intern self-entry is append/self-owned and safe to replay; auth/attendance are server-stateful/security-gated.
- Status: implemented.

### D-06 Writes that are queued (admin/mentor moderation)
- Decision: Queue admin/mentor moderation: doc/gatepass/idcard/cert approve+reject, face approve/reject, leave approve/reject, create intern, shifts, departments, holidays, mentors, transfer endorse/reject. Password-reset/delete/attestation-sensitive actions stay ONLINE-only.
- Rationale: user explicitly chose "queue admin/mentor too" even after the contradiction flag; accepts stale-approval risk mitigated by race handling.
- Status: implemented.

### D-07 Attendance offline behavior
- Decision: Attendance check-in/checkout requires an internet connection. When offline, buttons are disabled with a clear "requires internet" message.
- Rationale: attendance is a server-stateful machine (DB sessions, server-issued liveness challenges, server-side geofence + FaceNet match + anti-spoof). Offline replay is meaningless and a security downgrade; rework would be large.
- Status: implemented.

### D-08 Replay failure policy
- Decision: Report permanent failures (toast + in-app notification); NO infinite auto-retry. Transient failures (5xx/offline) retry on next reconnect/foreground with a bounded cap. Each item: `queued → sending → done | failed | conflict`. Manual Retry/Discard on failed/conflict items in a Sync screen.
- Rationale: prevents stuck/dropped actions; surfaces user attention where needed.
- Status: implemented.

### D-09 Binary payloads in the queue
- Decision: Document upload binaries ARE included. Picked `content://`/`file://` file is copied into the app cache dir via `react-native-blob-util` at enqueue time; replay rebuilds `FormData` from the cached `localPath`.
- Rationale: full offline document-upload support; keeps original bytes.
- Status: implemented.

### D-10 Failure notifications
- Decision: Sync failures surface as toast AND as in-app local notification merged into the existing Notifications screen + unread badge (stored locally, NOT server-pushed — server is unreachable at failure time). No OS system-tray/notifee dependency.
- Rationale: local events can't ride the server /notification channel; user picked in-app list+badge (Recommended) over system-tray.
- Status: implemented.

### D-11 Idempotency scope
- Decision: Idempotency keys on ALL queued/replayable writes (append-style: leaves, documents, certificates, profile, devices, withdrawals). Server stores processed keys per user (7-day TTL); duplicate key returns the stored response. Attendance + auth excluded (one-shot/server-enforced). State-transition (approve/reject) endpoints are covered by CAS (D-12), not idempotency.
- Rationale: user said "idempotency throughout the app in all relevant actions"; keys protect append-only from double-insert on retry.
- Status: implemented.

### D-12 Race-condition handling (single-winner transitions)
- Decision: The race-risk surface is minimized by the business rule "1 intern has exactly 1 mentor" (that mentor handles the intern's documents/gatepass/idcard/cert/leave/face). Residual races = admin↔mentor, admin↔admin, intern-withdraw↔approve, batch↔single approve, mentor reassignment.
- Handling:
  1. Atomic CAS transitions: approve/reject/finalize on `DocumentUpload`, `GatePass`, `IdCardRequest`, `Certificate`, `LeaveApplication`, face rewritten as guarded single `UPDATE ... WHERE Id=@id AND Status=@expected AND WithdrawnAt IS NULL`; rows-affected 0 → `409 STALE_STATE`. The database decides, not a precheck.
  2. Batch gate-pass approve = one filtered `UPDATE` over the pending subset; count discrepancy feeds skip/conflict accounting.
  3. Snapshot at enqueue: `{entityType, entityId, expectedStatus, scope:{internId, mentorId, deptId}}`.
  4. Precondition check at replay (soft): refresh entity online, compare status/withdrawn + scope (mentor reassignment via `Intern.MentorId`); mismatch → `conflict`, notify, never replay. CAS is authoritative for in-flight cases.
  5. Outbox is FIFO per entityKey; never reorder across an entity; dedupe consecutive same-type ops.
- Rationale: guarantees one winner at the DB and surfaces losers as supervised conflicts.
- Status: implemented.

### D-13 Entities as optimistic-lock tokens
- Decision: Reuse existing fields (`Status`, `WithdrawnAt`, `ApprovedAt`) as the optimistic-lock predicate. No new `Version` column for this phase.
- Rationale: CAS on status is sufficient and migration-free; a `Version` rowversion is the fallback if stronger guarantees are needed later.
- Status: implemented.

---

## 2026-09-06 — Security posture on passwords

### D-S1 Admin cannot read passwords
- Decision: Keep reset-only model. Passwords are BCrypt-hashed, one-way; NO admin "view password" capability. Admin access = existing reset flow (bump `TokenVersion`, random temp password). No recoverable storage.
- Rationale: recoverable storage = critical hole (admin compromise / DB leak exposes all accounts; password reuse across systems). Removed plaintext-password emails in prior security phase.
- Status: implemented (no code change required — posture already correct).

### D-S2 Transport encryption
- Decision: Login/API must be served over HTTPS/TLS in production. Backend supports `HTTPS_CERT_PATH`/`HTTPS_CERT_PASSWORD`/`HTTPS_PORT` env; Android cleartext policy blocks plain HTTP outside loopback/emulator dev hosts.
- Status: implemented (app settings made in security phase; deployment still needs a real cert / reverse proxy on the prod API).

---

## Security phase (carried context, already implemented)

- Tokens moved from AsyncStorage to OS Keychain (`react-native-keychain`) — access/refresh in services `com.internapp.access` / `com.internapp.refresh`; in-memory mirror + refresh-mutex interceptor; `clearTokens` also clears persisted `user`.
- Android cleartext policy: `network_security_config.xml` — cleartext blocked everywhere except `localhost`, `127.0.0.1`, `10.0.2.2`, `10.0.3.2` (dev over adb reverse). Manifest: `networkSecurityConfig` set, `usesCleartextTraffic=false`.
- All `/files` consumption is authenticated: fileClient `fileUrl(path)` (adds `?token=` for RN `<Image>` previews), `fetchFileLocal(path)` + `openFileWithAuth(path)` (BlobUtil with Bearer header). File serving endpoint is `api/files/{**path}` (note `/api/` prefix).
- Reports export: server-rendered `/api/{role}/reports/{reportKey}/pdf|excel` (QuestPDF report table in `PdfService.WriteReport`); client downloads via BlobUtil and shares; removed client-side `react-native-html-to-pdf`/`react-native-fs` report path.
- Docs gate on issuance: CNIC + University ID must both be approved (not withdrawn) before ANY official document issuance (gate pass / ID card / certificate) — enforced on Admin + Mentor approve endpoints (single + batch) and face enrollment, via `DocumentGateExtensions.OfficialDocsApprovedAsync`. Batch approve reports skips (`skippedDocsNotApproved`).
- Backend fail-closed config: no `ConnectionStrings`/`Jwt:Key` in `appsettings.json` or `appsettings.Development.json`; env `ConnectionStrings__DefaultConnection` + `Jwt__Key` (no signing key is committed to git); Kestrel `http://localhost:5000`; rate limiter 300/min/IP; JWT `tvn` claim + DB check; lockout after 5 failed attempts (15 min, HTTP 423); refresh-token rotation; logout bumps TokenVersion.

## Dev environment notes
- Backend start (only working pattern, returns instantly):
  `nohup setsid dotnet run --project backend/InternSystem.API --no-build </dev/null >>/tmp/opencode/backend.log 2>&1 &`
  IMPORTANT: do NOT combine `pkill -f` patterns that match your own command line (use `[X]` bracket trick) and do NOT chain `pkill; sleep; nohup` in one bash call — it hangs the tool.
- Schema changes: only via Program.cs startup schema-guard SQL. NEVER `dotnet ef migrations add` (snapshot stale). `sqlcmd` available.
- Test accounts: admin / mentors / interns — see `docs/DEVELOPMENT_CREDENTIALS.md`.
  ahmed internId 128 (docs NOT approved, face approved, binding reset to `servicetest`,
  was locked out). moiz `moiz.DEVOPS.002` (docs approved, face NotEnrolled, device
  `servicetest2`).
- E2E on phone serial `10268333AR003499` via `adb reverse tcp:5000 tcp:5000`; package `com.internapp`.

---

## 2026-09-08 — Certificates, gatepass, face-approval UI (implementation + verification session log)

Session that (re)implemented and verified certificate templates, gatepass layout, the role-aware Face Approval UI, and appended the offline-sync state/endpoint shapes. Everything below is **implemented** and verified against the running API (wkhtmltopdf harness + generated PDFs).

### D-C1 Certificate templates (gender-aware, system-generated line)
- Decision: Remove `.sig-block` entirely. Two HTML templates — `Templates/Certificates/certificate_male.html` and `certificate_female.html` — each carry a CSS `.sys-line` ("This is a system-generated document and does not require a signature.") plus `.watermark` (logo, opacity 0.10) and full-width `header.png`. Signatures render through the `{{HeadSignature}}` placeholder (inlined base64 data-URI from the department head's `SignatureImagePath`, or blanked when `signatureRequired=false`) with `{{HeadName}}`/`{{HeadDesignation}}` text.
- Rationale: gender-aware wording alignment with the Maaz material; drop the now-obsolete `.sig-block`; head signatures arrive as embedded images.
- Verification: generated PDFs via `PdfService.GenerateCertificatePdf` (wkhtmltopdf at `/usr/bin/wkhtmltopdf`, base64 inlined images, A4, zero margins) — letterhead + watermark embedded, system line present, no signature block. Outputs in `uploads/pdfs/`.
- Status: implemented.

### D-C2 Certificate verification via running API
- Decision: Copy updated templates into the API build output and rebuild/restart the backend so served PDFs reflect the new layout.
- Rationale: template files are read at render time from the content roots; the running process must pick up the new copies.
- Status: implemented.

### D-G1 Gatepass layout (QuestPDF, no letterhead/watermark)
- Decision: `GenerateGatePassPdf`/`GenerateGatePassBatchPdf` remain pure QuestPDF (7 interns/page, A4, margin 40). Letterhead is a text-only `ComposeHeader()` ("✈ PAKISTAN International Airlines / Great People to Fly With", green `#006633` + gold `#8B6914`, double border rule); the watermark does NOT appear in the gatepass (it exists only in the HTML certificate `.watermark`). Invitation: existing QuestPDF gatepass already ships WITHOUT embedded letterhead/watermark image input.
- Rationale: accepted the known constraint that the gatepass has no image input for letterhead/watermark; signature row is a QuestPDF Row (left "Supervisor" = mentor, right "Approved By" = head signature image + name + designation).
- Status: implemented (sample gatepass to be generated in emulator for user visual check).

### D-F1 Face Approval UI (admin + mentor, role-parameterized)
- Decision: Single `FaceApprovalsScreen.js` reused by both tabs; `resolvedRole = role || route?.params?.role || 'admin'`. `AdminTabs` registers `FaceApprovals` with `initialParams={{role:'admin'}}`; `MentorTabs` with `{{role:'mentor'}}`. Lazy-loaded via `React.lazy`. Camera icon in list / empty state; photo viewer via `fileUrl()`. Offline-aware through `moderate()` + `queuedToast()`. Embedded `FaceApprovalsSection.js` used in admin `AttendanceScreen` (`base="/admin"`) and mentor `AttendanceViewScreen` (`base="/mentor"`).
- Verification: eslint clean; will verify role routing on emulator.
- Status: implemented.

### D-S3 Sync state-endpoint shapes
- Decision: Every offline-precondition write is paired with a `.../state` snapshot GET: `{entityType, entityId, expectedStatus, scope:{internId, mentorId, deptId}}`, plus the optimistic-lock fields (`Status`, `WithdrawnAt`, `ApprovedAt`) exposed for the CAS precondition check. Covers documents, gatepasses, idcards, certificates, leave-applications, and face enrollments (`META` map in `api/moderate.js`).
- Status: implemented.

### D-S4 Idempotency — 48 endpoints
- Decision: Exactly **48** `[Idempotent]`-attributed write endpoints across `AdminController`, `MentorController`, `InternController` (7-day key TTL, replay returns the stored 2xx/4xx response). State-transition endpoints are additionally guarded by CAS (D-12), not just idempotency.
- Status: implemented.

### D-S5 Transfers — check-then-write
- Decision: Mentor department transfers use check-then-write: `InitiateMentorTransfer` fails if a Pending/Accepted transfer already exists for that mentor before inserting; finalize is CAS-guarded (`FinaliseMentorTransfer`). Single winner guaranteed at the DB.
- Status: implemented.

### D-S6 404 dead-endpoint fix
- Decision: In `syncEngine.drain()`, any 4xx (including 404) marks the outbox item `terminal`/`failed` immediately (it won't retry forever); only network/5xx are transient (retry up to `MAX_TRANSIENT=8`). 409/`STALE_STATE` → `conflict`. Fixes queued writes to an endpoint that no longer exists hanging forever.
- Status: implemented.

### D-S7 ASPNETCORE_ENVIRONMENT=Development
- Decision: Run the backend with `ASPNETCORE_ENVIRONMENT=Development` (launchSettings profiles all `"Development"`) so the developer exception page is available and dev-only JWT/DB config in `appsettings.Development.json` is used.
- Status: implemented.

### M11 — E2E offline-queue/reconnect/conflict (outstanding)
- Decision: Not yet executed. Plan: boot `Pixel7` emulator (port 5554), `adb reverse tcp:5000 tcp:5000`, install the APK (`com.internapp`), then drive E2E offline-queue → reconnect → conflict flows for certificate/face/gatepass. API base is `http://localhost:5000/api` (works via adb reverse). No Detox config / `e2e/` folder exists yet.
- Status: pending (documented, not run).
### D-S8 ONNX face models are not committed to git
- Decision: `backend/InternSystem.API/Models/AI/*.onnx` is gitignored and acquired at setup time, documented in `docs/LAUNCH_GUIDE_LINUX.md` §5.0 and `docs/LAUNCH_GUIDE_WINDOWS.md` §5.0. Reason: `facenet.onnx` is 248 MB, over GitHub's 100 MB hard push limit — the first push of this work was rejected by the pre-receive hook. Git LFS was considered and rejected: it would consume ~248 MB of GitHub's free 1 GB/month LFS bandwidth per clone cycle, and nothing in the app is served from LFS. Source URLs live in `docs/archived/FACE_RECOGNITION_AND_SYSTEM_GUIDE.md` §7.
- Trade-off: a fresh clone has **no face verification** until setup runs. `FaceRecognitionService` logs a warning and disables the gates rather than failing, so the symptom is silent. The dead-state check (§10.4 of `AGENTS.md`) cannot pass until the models are fetched.
- Status: implemented (gitignore + both launch guides). **Partially open:** `antispoof.onnx` is a documented contract mismatch — the Hugging Face export is 3-class `[live, print, replay]` with `pixel/255` input, while `FaceRecognitionService.cs:206-208` expects 2-class with `index 1 == real` and raw 0-255 BGR. `ultraface.onnx` and `facenet.onnx` are drop-in. Tracked as `TODO.md` W6.1 `[~]`, BLOCKERS B4, CONTEXT A12.

### D-S9 JWT signing key supplied by environment variable only
- Decision: No JWT signing key is stored in any committed file. `appsettings.json` and `appsettings.Development.json` both carry `"Jwt:Key": ""`; the key is supplied via the `Jwt__Key` environment variable. Reason: `appsettings.Development.json` is tracked and both remotes (`KHassanTaha/interneePortal-PIA` and `yoabnadeem12/interneePortal-PIA`) are **public** — a committed signing key is a published credential that lets anyone mint a valid JWT for any role until it is rotated. This extends the existing `ConnectionStrings__DefaultConnection` fail-closed pattern; `Program.cs:19` throws with an actionable message when the key is missing or under 32 bytes.
- Status: implemented. The key was never committed, so no rotation was required. Six documentation references that claimed the dev key lived in `appsettings.Development.json` were corrected in the same change.

### D-S10 Face thresholds: code and AGENTS.md §4.4 disagree — escalated, not "fixed"
- Finding: `FaceMatchThreshold: 0.58` in `appsettings.json` is read by **no code**. The live match at `AttendanceVerificationController.cs:237` calls `_face.Compare(liveEmbedding, storedEmbedding)` with no threshold argument, so the effective limit is the hardcoded `FaceRecognitionService.DefaultThreshold = 0.70` (line 37). Since cosine distance passes at `distance <= threshold`, `0.70` is **more permissive** than the `0.58` documented in AGENTS.md §4.4. Similarly, `DefaultSpoofThreshold = 0.40` is live (line 208) while §4.4 documents `realScore >= 0.60`.
- Decision: Deliberately left unchanged. Editing the constant to match the doc would tighten the gate with no validation data and could lock legitimate interns out of attendance — that is a worse failure than the current gap, and it is not a documentation fix. Either the config key is wired through to `Compare()` or the code and the doc are both corrected, after tuning against a validation set for a target FAR/FRR.
- Impact: the shipped biometric gate is weaker than the contract in AGENTS.md §4.4 states, and a reviewer reading §4.4 would draw a wrong conclusion about system security.
- Status: **open — owner decision required.** Tracked as BLOCKERS B6, CONTEXT Q6, and substantively as `TODO.md` W9.3.
