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

### D-14 Swipe-to-dismiss retired; Close button + backdrop tap adopted
- Decision: Drop the drag-to-dismiss gesture on sheets. Dismissal is now the
  themed `Close` button in the grab-header row, tapping the dark backdrop, and
  the Android hardware back button.
- Rationale (verified on emulator, admin Create Mentor sheet, RN 0.86 / Fabric
  / Hermes release build): touches that START on the bare chrome strip above a
  Modal's ScrollView never reach JS. Proven with all three gesture layers —
  `PanResponder` (`onMoveShouldSetPanResponder` never engaged; sheet never
  moved mid-drag), raw View responder handlers
  (`onStartShouldSetResponder` on the sheet and on the exact handle wrapper;
  `[swipe]` instrumentation, plain and Pressable alike, produced zero JS
  events — Hermes release strips console, so the visible-probe pill also never
  turned red), and `TouchableOpacity` wrapping the pill (a11y tree shows the
  chrome nodes as non-clickable and a held press produced no state change).
  Controls inside the ScrollView (fields, buttons, and the new remainder of
  the header row placed as content) fire press events normally. All three
  dismissal paths verified vto close the Create Mentor sheet on the emulator.
- Status: implemented and device-verified (2026-10-06).

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

### D-S11 Dependency remediation: axios, ImageSharp, and TypeScript tooling
- Decision: Three changes in one commit, all driven by `AGENTS.md` §11.2 ("do not commit on a high or critical advisory") and §3.1/§11.2 ("no `tsconfig.json`, `typescript`, `ts-jest`, `@types/*`").
  1. **`axios` 1.19.0 → 1.20.0.** `npm audit` reported **12 high-severity advisories** against `axios` in range `1.0.0–1.19.0` (GHSA-vh66-26gq-q6x8, GHSA-9fr6-4gfg-395g, GHSA-c29m-xwm3-cm6r, GHSA-mghh-pgcx-3jjj, GHSA-x97p-jq2g-jp4f, GHSA-3pq3-5fj3-cg6v, GHSA-542g-h47m-68v8, GHSA-j8rh-479h-cp32, GHSA-4hqw-qxg8-jxx2, GHSA-m8m8-qj5v-23w3, GHSA-44g4-m2mj-wpvx, GHSA-r4gj-5m52-g5wh). axios is the HTTP layer for the whole app, so this was the only flagged **direct production dependency**. Many of the advisories are Node-adapter-specific and not reachable from React Native's XHR adapter, but the prototype-pollution and header-injection gadgets are not obviously adapter-bound, so the upgrade is required rather than argued away. `^1.19.0` already permitted 1.20.0, so there is no dependency-graph change: the `package.json` range is now pinned to `^1.20.0` and the lockfile resolves to 1.20.0.
  2. **`SixLabors.ImageSharp` 3.1.7 → 3.1.12** (patch, same 3.1.x line). Cleared GHSA-rxmq-m78w-7wmc and removed both `NU1902` build warnings. `4.1.2` is the latest major but 3.1.12 clears the advisory without a major-version migration.
  3. **Removed all TypeScript tooling**: `typescript`, `@types/jest`, `@types/react`, `@types/react-test-renderer`, `@react-native/typescript-config`, and the root `tsconfig.json`. `InternApp/src/` already contains **zero** `.ts`/`.tsx` files, so this was dead configuration. Nothing in `jest.config.js` (preset is `@react-native/jest-preset` only), `babel.config.js`, or `metro.config.js` referenced `tsconfig.json`.
- Impact: `npm audit --omit=dev` went from 42 to 39 advisories (8 moderate, 31 high); backend build warnings dropped from 9 to 7.
- **Correction (2026-10-06, D-S18):** the original text here claimed `dotnet list package --vulnerable` reports **zero** vulnerable packages. That was measured **without `--include-transitive`**, i.e. direct packages only. With `--include-transitive` there are **three High-severity transitives** in `InternSystem.API` and `InternSystem.Infrastructure`: `Microsoft.Extensions.Caching.Memory` 8.0.0 (GHSA-qj66-m88j-hmgj), `System.Text.Json` 8.0.4 (GHSA-8g4q-xg66-9fp4), `System.Formats.Asn1` 5.0.0 (GHSA-447r-wph3-92pm), plus Moderate advisories on `Azure.Identity` 1.10.3 and `Microsoft.Identity.Client` 4.56.0. See D-S18. The `axios` half of this entry is independently verified and correct: auditing `axios@1.19.0` in isolation yields severity **high**, range `1.0.0 - 1.19.0`, `fixAvailable: true`, and exactly the 12 GHSAs listed above.
- Trade-off: the remaining 39 advisories are **not fixed**, deliberately. Every one of them is a transitive dependency of the Metro / `@react-native-community/cli` toolchain (`body-parser`, `qs`, `joi`, `js-yaml`, `glob`/`brace-expansion`, `image-size`, `fast-xml-parser`, `test-exclude`). None is a direct production dependency, and none is linked into the Android bundle. `npm audit fix --force` would move React Native off 0.86.2, which `AGENTS.md` §3.1 forbids as a side effect of an unrelated task. Accepted as known tooling risk; revisit on the next RN major upgrade.
- Status: implemented and verified. `dotnet build -c Release` succeeded (0 errors, 7 warnings); `dotnet list package --vulnerable` clean; Metro restarted on the new `node_modules` and an admin login completed on the emulator with **zero console errors** (`logs/screenshots/2026-10-06-admin-dashboard-axios120.png`).

### D-S12 Anti-spoof: Path A confirmed as the model contract
- Decision: The owner confirmed **Path A** — convert the original 2-class `MiniFASNetV2` (`2.7_80x80_MiniFASNetV2.pth`) to `antispoof.onnx`. The code contract in `FaceRecognitionService.cs:206-208` is therefore authoritative and is **not** changed: **2-class output, `index 1 == real`, BGR, raw 0–255** (no `/255`). Path B — adapting the code to the 3-class Hugging Face export `[live, print, replay]` — is rejected.
- Rationale: Path B would change a security-critical scoring path to suit an easier download, and the 3-class model is not the one the thresholds in D-S10 were derived against.
- Correction in the same change: the Path A copy step in both launch guides was wrong. The clone is made *inside* `Models/AI`, so `cp antispoof.onnx ../../backend/InternSystem.API/Models/AI/` resolved to `.../backend/InternSystem.API/backend/InternSystem.API/Models/AI` — a path that does not exist. Corrected to `cp antispoof.onnx ..` (Linux) and `Copy-Item antispoof.onnx ..` (Windows), each followed by a verification `ls`/`Get-Item` and a cleanup `rm -rf` of the clone.
- Status: implemented. Path A now documented correctly in `LAUNCH_GUIDE_LINUX.md` §5.0 and `LAUNCH_GUIDE_WINDOWS.md` §5.0.

### D-S13 Rate limiter is two-tier, with a 10× allowance for file serving
- Finding: `Program.cs:51-70` uses a per-IP fixed window of **1 minute** with `PermitLimit = 300` for every path **except** paths starting with `/api/files/`, which get **3000**. `X-Forwarded-For` takes precedence over the socket remote IP when present. `QueueLimit = 0` and `AutoReplenishment = true`; rejection status is **429**.
- Rationale (as implemented): an intern dashboard that loads many document thumbnails and report PDFs would otherwise exhaust a 300/min budget that is otherwise dominated by small JSON calls.
- Verification: 320 consecutive failed logins produced **290× 401 then 30× 429**. `AGENTS.md` §4.5 describes the limiter only as "300/min/IP"; the 3000/min file tier is an undocumented detail and is now recorded here.

### D-S14 Lockout returns 423 only for a correct password — verified, not a defect
- Finding: `AuthController.Login` evaluates `VerifyPassword` **before** the `LockedUntil` check. A wrong password on a locked account therefore returns **401**, never 423; a **correct** password on a locked account reaches the lock branch and returns **423** with `"Account temporarily locked due to too many failed attempts. Try again in 15 minute(s)."`.
- Decision: Treated as correct, intentional behaviour and left unchanged. Returning 401 on wrong passwords avoids leaking whether an account exists or is locked — the 423 only appears to a caller who has already proven they hold the right password.
- Verification: 6 wrong passwords → `FailedLoginAttempts` reached 6 and `LockedUntil` was set in the database; the next login with the **correct** password returned **423**. State reverted afterwards (`FailedLoginAttempts = 0`, `LockedUntil = NULL`) so no seeded account was left locked.

### D-S15 Jest was configured but had never been able to run
- Finding: `jest.config.js` contained only `preset: '@react-native/jest-preset'`. That preset's default `transformIgnorePatterns` transforms only `react-native`, `jest-react-native` and `@react-native*`, so every other dependency is left as untransformed ESM. The one existing test, `__tests__/App.test.tsx`, therefore died at import time with `SyntaxError: Cannot use import statement outside a module` pointing at `import {Provider} from 'react-redux'`. **No test in this repo had ever passed.** `npx jest` was not merely "unconfigured" — it was broken, and nothing in the launch guides or CI would have caught it.
- Decision: Give Jest a real config rather than leaving the preset bare.
  - `transformIgnorePatterns` allow-lists the ESM-published store and navigation packages actually reached by the import graph: `@react-navigation`, `react-redux`, `redux`, `redux-persist`, `@reduxjs/toolkit`, `immer`, `reselect`, plus `react-native-*`.
  - New `jest.setup.js` mocks AsyncStorage and NetInfo with the **official mocks those libraries ship** (AGENTS.md §6.2), and provides render-time stubs for `react-native-blob-util`, `react-native-keychain`, `react-native-permissions`, `react-native-vision-camera`, `react-native-fs`, `react-native-share`, `react-native-html-to-pdf` and `@react-native-community/geolocation` — none of which ship a mock.
  - The stubs are explicitly documented as **not** behavioural. A test that needs to assert real Keychain or filesystem behaviour must build its own fake; AGENTS.md §6.5 forbids a test that does not fail against the bug it was written for, and a shared stub that fakes the assertion would violate that.
- Rationale: W7.5 requires `npx jest` to pass. It could not pass without this. The alternative — deleting the single test — would have made `npx jest` exit green while proving nothing, which is exactly the failure mode AGENTS.md §18 warns about.
- Impact: `npx jest` now reports **1 suite passed, 1 test passed, exit 0**. The suite is a render smoke test and asserts almost nothing; the coverage target in AGENTS.md §6.4 is untouched and remains W2.
- Known non-fatal warning: `Jest did not exit one second after the test run has completed`. `App.js` starts `initSyncEngine(store)` and `startConnectivityMonitoring()` inside `useEffect`, which leaves timers running past teardown. Exit code is 0. Not fixed here — it needs an injectable clock or an unmount in the test, which is W2 work.
- Status: implemented and verified.

### D-S16 — Face-enrollment gate is mandatory for official document issuance

- **Decision:** Official document issuance (gate pass, ID card, certificate)
  requires BOTH the document gate (CNIC + University ID approved, not
  withdrawn) AND an enrolled face. This extends the document gate; it does
  not replace it.
- **Rationale:** The two gates protect different things. Documents prove
  identity was verified at intake. Face enrollment proves the person can
  later mark attendance, which is the point of issuing the document in the
  first place. Sweep item #20 requested this.
- **Implementation:** Extend `DocumentGateExtensions.OfficialDocsApprovedAsync`
  to also check `Intern.FaceEnrolled`. Add `skippedFaceNotEnrolled` to the
  batch approve response so the two failure classes are distinguishable.
- **Status:** to implement (W4.7).
- **ID note:** the owner issued this as "D-S11". D-S11 through D-S15 were
  already assigned and committed (D-S11 dependency remediation, D-S12
  anti-spoof Path A, D-S13 rate limiter, D-S14 lockout, D-S15 Jest). Rather
  than reuse an ID, which would make the log ambiguous, this is **D-S16**.

### D-S18 — Three High-severity transitive advisories are open (correction)

- **What:** `dotnet list package --vulnerable --include-transitive` reports
  High-severity advisories on three transitive packages in both
  `InternSystem.API` and `InternSystem.Infrastructure`:

  | Package | Resolved | Severity | Advisory |
  |---|---|---|---|
  | `Microsoft.Extensions.Caching.Memory` | 8.0.0 | High | GHSA-qj66-m88j-hmgj |
  | `System.Text.Json` | 8.0.4 | High | GHSA-8g4q-xg66-9fp4 |
  | `System.Formats.Asn1` | 5.0.0 | High | GHSA-447r-wph3-92pm |
  | `Azure.Identity` | 1.10.3 | Moderate (×2) | GHSA-wvxc-855f-jvrv, GHSA-m5vv-6r4h-3vj9 |
  | `Microsoft.Identity.Client` | 4.56.0 | Low + Moderate | GHSA-x674-v45j-fwxw, GHSA-m5vv-6r4h-3vj9 |

- **Why this matters:** `AGENTS.md` §11.2 says do not commit on a
  known-vulnerable package. This is a live violation.
- **Origin of the error:** D-S11 originally stated "zero vulnerable packages
  across all three backend projects". That command was run **without**
  `--include-transitive`, so it only saw direct package references. The claim
  was stated without its scope, which made a scoped negative result read as a
  general one. `AGENTS.md` §10.6 now names this exact failure mode.
- **Status:** open. Candidate fix is explicit `PackageReference` bumps to
  patched versions; not yet attempted. Tracked as W4.8.

### D-S17 — Toast keeps the Modal wrapper; sweep #14 rejected

- **Decision:** `AppToast` continues to render inside its own transparent
  `<Modal>`. Sweep item #14 ("non-interactive absolute overlay, no Modal") is
  **rejected**.
- **Rationale:** The alternative — a plain absolute-positioned overlay — makes
  toasts invisible whenever any screen modal is open (bottom sheets, confirm
  dialogs, form overlays). That is a worse user-facing defect than a
  4-second tap window. The Aug-19 fix exists because the invisible-under-modal
  bug was observed and painful.
- **Experiment run 2026-10-06.** `pointerEvents="none"` was applied to both
  the `<Modal>` and its root view, then verified on `emulator-5554` against
  the New Department sheet (a `SwipeableModal`), which fires
  `Department name is required.` on an empty submit:
  - **(a) toast visible above the sheet — PASS.** `uiautomator` sees only the
    toast, because it reports the top Modal window and not the sheet beneath.
  - **(b) tap underneath while the toast shows — FAIL, partially.** Tapping
    the Name field at y≈1214 (far from the toast) **did** land — the keyboard
    opened, confirming focus. Tapping Cancel at y≈2167, which sits directly
    under the toast, **did not** land; the sheet stayed open. A React Native
    `Modal` is its own native window: `pointerEvents="none"` on its content
    does not disable that window's touch interception over the region the
    toast occupies. Since the toast is anchored to the bottom (`bottom: 24`)
    — exactly where action buttons live — the remaining unintercepted strip is
    the one that matters least.
  - **(c) auto-dismiss at 4 s — PASS.** `setTimeout(dismiss, 4000)`; the sheet
    reappeared in the accessibility tree ~4 s after the toast.
  - **(d) `adb logcat | grep ReactNativeJS | grep toast` — PASS.**
    `'[toast]', 'error', 'Department name is required.'`
  The change was therefore **reverted** to `pointerEvents="box-none"`, so the
  toast close button remains tappable. Toast behaviour is unchanged from
  2026-08-19.
- **Mitigation accepted:** A 3-second duration (down from 4 s) is a candidate
  follow-up to shorten the tap window. Not scheduled.
- **Status:** implemented (unchanged behaviour, decision recorded).
- **ID note:** the owner issued this as "D-S12"; D-S12 was already assigned to
  anti-spoof Path A, so this is **D-S17**.

### D-S21 — Uniform error shape for model-binding failures

- **Decision:** `Program.cs` configures
  `InvalidModelStateResponseFactory` so any 400 caused by DTO binding
  failure returns `{"message": "..."}` — the same shape controllers
  return for their own validation errors. The message names the
  offending field where possible ("Invalid value for 'startDate'.").
- **Rationale:** The mobile client's error handler reads
  `e.response?.data?.message`. Before this change, a model-binding
  failure produced an RFC 9110 problem-details body with no `message`
  field, so the app showed the generic "Try again" toast with no
  actionable information. This was the root cause of the createIntern
  "generic try again" bug: the admin form sent `startDate: ""` /
  `endDate: ""` for blank dates, which cannot bind to the non-nullable
  `DateTime` fields of `AdminCreateInternRequest`.
- **Impact:** All 400 responses from DTO binding now carry a
  user-readable message. The client's fallback toast becomes a last
  resort instead of the common path.
- **Constraint:** Future custom error responses must use the same
  `{"message": "..."}` shape. Do not introduce a new envelope.
- **Status:** implemented and verified 2026-10-06 (empty-date POST
  previously returned the problem-details envelope with no `message`;
  after the change it returns `HTTP 400 {"message":"Invalid value for
  'startDate'. Check the submitted fields and try again."}`).

---

### D-S23 — Attendance captures are retained for both outcomes

- **Decision:** The photo captured during an attendance attempt is
  stored server-side for **both** successful and failed attempts.
  Successful captures are served to the intern (own history) and to
  mentor/admin (attendance views). Failed captures are served to
  mentor/admin only (REQ-05 §5.3) and are not shown to the intern.
- **Rationale:** Successful captures were already retained and
  displayed before this decision; the change is extending the same
  retention to the failure path so a mentor can distinguish a
  genuine failed match (lighting, glasses, angle) from an attempted
  impersonation. The failed path is additive, not a new class of
  retention.
- **Corrects:** FACE-02 in `AGENTS.md` §4.4 and
  `FACE_RECOGNITION_AND_SYSTEM_GUIDE.md` §2, both of which claimed
  the raw photo is never persisted. That claim did not match the
  code. The corrected wording is in Ruling 1b below.
- **Scope:** Attendance captures only. Face-enrollment captures are
  out of scope for this decision — Q6 remains open.
- **Retention:** Both success and failure captures share the same
  retention policy. The policy value is Q8a (still open). Do not
  implement retention changes until Q8a is answered.
- **Status:** to implement (part of REQ-05).

#### Verified current behaviour (grep evidence, 2026-10-06)

Search pattern: `attendance.*\.jpg|attendance-photos|attendance-failures|SaveAttendancePhoto|photoPath|PhotoPath`
(equivalently `photoPath|PhotoPath`), scope `backend/InternSystem.API` and
`backend/InternSystem.Infrastructure`, `--include=*.cs`. A match would have
been any assignment of a stored image path to an attendance or verification
entity. `rg` is not installed on this machine; `grep -rnE` with the same
pattern and the same two directories was used.

**Write path — one, single location.**

| What | file:line |
|------|-----------|
| `SaveBase64ImageAsync(req.FaceImage, Path.Combine("faces", intern.Id.ToString(), "verify"))` | `AttendanceVerificationController.cs:252-253` |
| result assigned to `session.VerificationPhotoPath` | `AttendanceVerificationController.cs:258` |
| copied onto the attendance row on check-in | `AttendanceVerificationController.cs:377` (`CheckInPhotoPath`) |
| copied onto the attendance row on check-out | `AttendanceVerificationController.cs:516`, and again at `:534` |

**Column existence (schema-guard, not migrations).**
`Program.cs:212-215` adds `Attendances.CheckInPhotoPath` /
`CheckOutPhotoPath`; `Program.cs:220-221` adds
`AttendanceVerificationSessions.VerificationPhotoPath`.

**Read paths (served to roles).**

| Surface | file:line |
|---------|-----------|
| admin intern list, per-attendance photos | `AdminController.cs:526-527` |
| admin attendance projection | `AdminController.cs:1852-1853` |
| mentor attendance projections | `MentorController.cs:152-153`, `:243-244`, `:676-677` |
| intern own history | `InternController.cs:654` |

**On-disk confirmation.** `uploads/faces/{internId}/verify/` exists for at
least intern ids 4, 128 and 1241 (`find uploads -type d -name verify`).
`FileService.cs:31` creates the `faces` root on startup.
`uploads/attendance-failures/` does **not** exist — the failure path has no
storage yet, which is exactly what REQ-05 adds.

**Important sequencing detail, not visible in the ruling text:** the write at
line 252 sits *after* the liveness, anti-spoof, enrollment and match gates,
so on a face mismatch the capture is **currently discarded**
(`AttendanceVerificationController.cs:229-249` returns before line 252).
REQ-05 therefore does not "stop discarding on the failure path" for that
gate — it must move or add a write *earlier* in the method. Worth
confirming before implementation.

#### Implementation note (2026-10-06) — REQ-05 mechanism change

The write currently sits after all gates
(`AttendanceVerificationController.cs:252`); on a gate failure, execution
returns before the write and the capture is discarded. To retain
failed-attempt photos, the write moves to the top of the method,
immediately on receipt and before any gate. Successful-path behaviour is
preserved (the file is written, just earlier). Failed-path behaviour
changes: the file is now written where previously it was discarded.

This is a **mechanism change, not a retention change**. Retaining the
capture was never the hard part — the hard part is that the only existing
write is positioned after every gate that can fail. The four early-return
branches that currently discard the capture are `:166` (liveness),
`:174` (missing face image), `:193` (challenge echo mismatch), `:203`
(anti-spoof), `:218` (not enrolled), `:234` (embedding extraction) and
`:243` (face mismatch). Each returns before line 252.

**Storage path — corrected.** Failed captures go to a **new sibling
path**, `uploads/faces/{internId}/verify-failures/`, not to
`uploads/attendance-failures/`. The latter path does not exist in the
codebase and was named in the original ruling text; a `find` for a
directory of that name returns nothing. Keeping success and failure
captures in separate directories means retention and inspection can treat
them differently, and it removes any possibility of a failure capture
being served as a success capture by a path that does not distinguish
them. Success captures stay at `uploads/faces/{internId}/verify/`.

Implementation must also ensure the intern-facing read paths
(`InternController.cs:654`) never expose a `verify-failures` path — see
REQ-05 §5.3 and Q9b, still open.

---

### D-S24 — Critical state machines route through CAS; tests must exercise the production path, not a reimplementation

- **Decision:** Every state machine that transitions a
  domain-critical record (transfers, document approvals, face
  enrollment, certificate issuance) routes its transitions
  through `StateTransitions.TryUpdateAsync`. Controllers hold no
  inline read-modify-write status logic.
- **Rationale:** D-12 required CAS for single-winner transitions,
  but the transfer flow was never migrated. The CAS test suite
  passed because it exercised `StateTransitions` directly —
  production transfers did not call it. A green test on an
  unused code path is worse than no test: it produces false
  confidence. This decision makes the code and the tests exercise
  the same path.
- **Corrects:** AGENTS.md §4.3 D-12 row, which implied CAS
  covered all state transitions. It did not cover transfers until
  this refactor.
- **Status:** implemented 2026-10-06. `TransferStateMachine` extracted to
  `InternSystem.Infrastructure/Services/`; all eight transfer transition
  call sites in the three controllers are thin wrappers; a lost race now
  returns 409 STALE_STATE. Also added the missing `InternAccepted →
  Rejected` path (the receiving mentor had no refusal route once the
  intern accepted) and an explicit role guard on finalise, replacing the
  incidental `GetCurrentMentor() == null` → 404 check.

---

### D-S25 — Geofence gate reads department coordinates only; fails closed when absent

- **Decision:** The attendance geofence reads
  `Department.{Latitude, Longitude}` and nothing else. If either
  is null, zero, or out of range, the gate returns
  `MISSING_GEOFENCE_CONFIG` and the attempt is rejected. The
  hardcoded fallback centres (24.894995, 67.152182 and 24.9065,
  67.1608) are removed.
- **Rationale:** The fallback silently re-centred the gate to a
  fixed point when department data was missing, so an attendance
  attempt far from any configured location could pass the check.
  That is a fail-open behaviour on a security gate. Fail-closed
  is correct. Also: the intern-row coordinate fields are not
  geofence input — they describe the office location at creation
  and are used elsewhere.
- **Corrects:** The behaviour the owner observed — deleting
  department coordinates did not block attendance, because the
  fallback silently substituted a Karachi centre.
- **Status:** to implement (REQ-01).

#### Sites to change (grep evidence, 2026-10-06)

| Site | Current behaviour |
|------|-------------------|
| `AttendanceVerificationController.cs:293-303` | Precedence: intern-row coords → department coords → hardcoded `24.894995`/`67.152182`. Intern-row coords are removed from the chain; the hardcoded pair is removed. |
| `AttendanceVerificationController.cs:304-305` | Radius falls back to `100.0`. Decide separately whether a null radius is a config error or a legitimate default — **not settled by this decision**; raise before implementing. |
| `InternController.cs:551-552` | Hardcoded `24.9065`/`67.1608`. Note this is a **different coordinate pair** from the one above, so the two attendance paths disagree about where the office is today. |
| `InternController.cs:553` | Radius fallback `100.0` — same open question as above. |

Nullable coordinate columns, for reference: `Department.Latitude` /
`Longitude` / `RadiusMeters` (`Department.cs:9-11`),
`Intern.Latitude` / `Longitude` (`Intern.cs:42-43`),
`AttendanceVerificationSession.Latitude` / `Longitude`
(`AttendanceVerificationSession.cs:35-36`).

`Interns.Latitude` / `Longitude` are **retained** — they are not
deleted by this decision. The code comments them as the "internship
office location (captured at creation)"
(`AttendanceVerificationController.cs:293`). This decision removes them
from the **geofence centre resolution chain only**. What still reads
them is not yet established and should be inventoried before
implementation, so that removing them from the chain does not silently
orphan a feature.

Enforcement is required on **both** paths: client-side before the
camera opens (REQ-01 acceptance criterion 3), and server-side as
defence in depth. The error body uses the uniform `{"message": "..."}`
shape per D-S21.

---

### D-S26 — Face thresholds read from configuration

- **Decision:** `FaceRecognitionService` reads `FaceMatchThreshold` and
  `SpoofThreshold` from `IConfiguration`, defaulting to 0.58 and 0.60
  respectively. Hardcoded 0.70 and 0.40 are removed.
- **Rationale:** The XML comment at `FaceRecognitionService.cs:18` and
  `appsettings.json` both claimed 0.58; the code hardcoded 0.70. For
  ArcFace cosine distance, a larger max distance is a looser match — the
  running code was more permissive than either the doc or the config
  claimed. That is the wrong direction for a security gate.
- **Validation (impostor side):** Measured across 2850 pairs from 76
  approved enrollment embeddings. Minimum impostor distance (excluding
  the 258/259/260 same-photo cluster) is 0.7099. At 0.70, the nearest
  impostor clears by 0.0099. At 0.58, the margin widens to 0.1299. The
  security-side case for tightening is strong.
- **Validation (self-capture side) — NOT PERFORMED:** A fresh live-human
  enrollment test was not possible in the development environment. The
  emulator camera renders a synthetic scene; no real face was available.
  Stored historical session distances (1484 sessions, worst passing
  0.2657) could not be trusted as real-face evidence because the seeded
  enrollments appear synthetic — interns 258/259/260 have embeddings
  0.07-0.11 apart (same photo enrolled repeatedly), and `PhotoPath` is
  NULL for all 10 approved enrollment records.
- **Residual risk:** The self-capture side of the threshold change is
  unvalidated against real faces. Before any production deployment, a
  fresh-enrollment regression test on real faces is required. Tracked as
  a deferred task in `docs/TODO.md`.
- **Status:** implemented (self-capture validation deferred).

Scope note: `FaceRecognitionService.cs:380` (`bestScore = 0.7f`) is an
UltraFace detection-confidence floor, not a match or spoof gate, and is
deliberately **not** changed by this decision.

---

### D-S27 — SQL Server test provider catches defects InMemory hides

- **Decision:** The integration test project uses real SQL Server
  (ephemeral per-run database). Do not propose InMemory as a
  substitute for any test that touches a DbContext.
- **Rationale:** Across the W2 test work, SQL Server caught four
  distinct classes of defect that InMemory would have hidden:
  (1) IDENTITY column assignment, (2) FK violations from loose
  seed inserts, (3) enum-to-raw-SQL coercion (nvarchar column
  received an int), (4) a foreign-key type confusion where a
  Mentor id was written into a Department column and passed only
  because ids coincidentally overlapped. Each was a real
  production defect, not a test setup problem.
- **Constraint:** Any new test project that touches a DbContext
  must use the shared SQL Server fixture. InMemory is not an
  acceptable provider for this codebase.
- **Status:** implemented.

### D-S28 — Test fixture reads FK dependencies from the schema

- **Decision:** The integration test fixture's `ResetAsync()`
  discovers child tables and their FK ordering by querying
  `sys.foreign_key_columns` at reset time. It does not
  hand-maintain a table list.
- **Rationale:** A hand-maintained list drifts as new tables are
  added. The reset then fails or silently leaves orphan rows,
  producing test failures that look unrelated to the schema
  change. Reading the dependencies from the schema means the
  fixture self-maintains.
- **Impact:** A new table with FKs to existing tables is handled
  automatically. No fixture edit required.
- **Status:** implemented 2026-10-06. Reset reads the FK graph and
  deletes in descending dependency depth. This replaces a hard-coded
  14-table list, which broke the moment the transfer state machine
  began writing `ActivityLog` rows (`FK_ActivityLogs_Interns_TargetInternId`).

---

### D-S29 — ImageSharp 4.x major bump deferred

- **Decision:** Stay on ImageSharp 3.1.12 rather than force the
  4.1.2 major bump. The three High advisories on 3.1.12 affect
  TIFF encoders and HistogramEqualization, which the codebase
  does not invoke (verified by grep on 2026-10-08). ImageSharp 4.x
  also changes the licence terms; a licence review is required
  before any upgrade.
- **Rationale:** A major-version bump of a security-critical
  image library, with no test coverage on the affected path, to
  fix advisories that are unreachable at runtime, is a worse risk
  than the residuals. Tracked as W4.11 for evaluation when a
  driving requirement appears.
- **Status:** deferred.
