# PIA Intern System — Persisted Feature Plan (33-issue refactor)

> Active plan for the "PIA BUGS AND CHANGES 1/9/26" refactor. **Source of truth for scope**
> until all phases are delivered. Referenced issue numbers are from that plan's list.
> B1–B6 (notifications, admin shifts CRUD, admin transfers, settings hub, fixed 100 m
> department radius) are already **implemented and emulator-verified** — not in scope here.

**Tracking**: session TODO list mirrors this document phase-by-phase.
**Decision log**: every clarification the user gave is stamped here so future sessions
never re-ask.

---

## Dropped / out of scope (locked)

- **#7** Attendance seeding for old demo interns — dropped.
- **#33** Attendance tab empty-state fix — dropped.

---

## Locked decisions (from planning session, 2026-09-01)

| Topic | Decision |
|-------|----------|
| Header standardization ##15 | Yes — all screens use `AppHeader` + `Icon` |
| Notifications screen #1 | Add top buffer/spacing |
| Dark mode nav icons #6 | Icons adapt in dark mode |
| "Performed by" green text #35 | Low contrast on dark — fix color |
| Mentor app remake #5 | Remove emojis; `AppHeader`/Icons; consistent layout |
| Task-assign form #12 | Form modal sticks to **bottom** (bottom-sheet style) |
| Shifts menu #27 | Merged into Settings as "Configurability"; **Settings-only** access |
| Task completion #28 | Simple completed/total %; default threshold **80%**, admin-configurable |
| Dropdown #24 | Enhance component (searchable + clear) and replace **all** dropdowns at once (~25 instances / 11 files) |
| Reports #22 | **All** reports, PDF **and** Excel; libs: `react-native-html-to-pdf` + `react-native-pdf`; `exceljs` + `react-native-fs` + `react-native-share` |
| Gatepass naming #4 | `gatepass-{uid}-{deptcode}-{date}` |
| Signature toggle | Only inside Settings screen (usage toggle lives in Settings) |
| Shift "Standard" option | Maps to the **Morning** company shift |
| Testing | pure E2E via **Detox**; setup complete; build API endpoints for everything reports need |

---

## Phases & deliverables

### Phase 1 — Navigation & Header
- Standardize every screen on `AppHeader` + `Icon` (#15).
- Fix Mentor dashboard navigator crash when no tab selected (`RootNavigator.js`).
- Top buffer/spacing on `NotificationsScreen.js` (#1).
- **Verify**: emulator walk of every tab for 3 roles; no taps swallowed.

### Phase 2 — Theme / Dark mode
- Sidebar + header nav icons adapt in dark mode (#6) — `components/RightSidebar.js`,
  `components/AppHeader.js`, `theme/index.js`.
- Fix `ActivityCard.js` "performed by" green text contrast (#35).
- **Verify**: audit every screen color against `theme/index.js` dark palette.

### Phase 3 — Dropdown components
- `components/SearchableDropdown.js` (enhanced `Dropdown`): search + clear + keyboard support.
- Replace **all** dropdowns across 11 files (admin + mentor + intern screens).
- **Verify**: `rg "Dropdown"` returns only the shared component + SearchableDropdown.

### Phase 4 — Mentor app remake
- Remove emoji glyphs; use `AppHeader`/`Icon`/`ScreenBackground`; consistent list/modals.
- Files: mentor `DashboardScreen`, `AssignTaskScreen`, `AttendanceViewScreen`,
  `CreateInternScreen`, `MentorEditInternScreen`, `MentorInternsScreen`,
  `MentorShiftsScreen`, `MentorInternTransfersScreen`, `DocumentsApprovalScreen`.
- **Verify**: emulator screenshots; no raw emoji chars (`rg` for emoji ranges).

### Phase 5 — Admin consolidation
- Merge `/admin/shifts` into Settings "Configurability" (collapsible section); accessible
  only from Settings (#27).
- Inline intern create/edit modals on `AdminInternsScreen`; retire
  `LegacyAddInternScreen` / `LegacyEditInternScreen`.
- Departments: radius stays disabled/locked 100 m.
- **Verify**: settings route only; legacy screens removed from navigator.

### Phase 6 — Forms & UX
- AssignTask form (and other modal forms) stick to screen **bottom** (#12) —
  fix overlay justifyContent + `animationType="slide"`.
- Signature usage toggle only in Settings.
- Gatepass naming `gatepass-{uid}-{deptcode}-{date}` (#4) — backend PDF naming +
  `PdfService.cs`.
- **Verify**: modal anchored bottom on keyboard open across 3 roles.

### Phase 7 — Reports (PDF + Excel)
- Build **all** backend report endpoints (admin/mentor/intern scopes).
- Frontend export: PDF via `react-native-html-to-pdf` + `react-native-pdf` viewer;
  Excel via `exceljs` + `react-native-fs` + `react-native-share`.
- **Verify**: generate + open a PDF and an XLSX per report on emulator.

### Phase 8 — Task completion scoring
- Task completion % = completed / total (simple), shown on intern certificate eligibility.
- Default threshold 80%, configurable via Settings (`TaskThresholdPct`) —
  user asked for a configurable dropdown for the threshold.
- Shift "Standard" option = Morning shift.
- **Verify**: intern with 100% tasks eligible; below-threshold ineligible.

### Phase 9 — E2E tests (Detox)
- Detox setup (`android.emu.debug`), coverage matrix:
  auth (3 roles), admin flows, mentor flows, intern flows, notifications,
  reports (PDF/Excel).
- **Verify**: `npx detox test --configuration android.emu.debug` all green.

---

## Open investigation

- **Chips clipping #10**: user stated text clips *horizontally* and that
  wrap/truncate-to-next-line **will not fix** it. The plan previously proposed a wrapping
  flex container — **needs re-confirmation or a vertical-scroll/expandable chip layout**.
  Blockers for this decision: none, but don't ship Phase 4 chips until resolved.
- **Mentor shifts badge**: Early Bird "Active" badge on dept-scoped shift cards not fully
  verified in emulator dump (only Afternoon card showed "Active"). Re-verify after
  Phase 5 shift merge.

---

## Environment cheat-sheet (for any session)

- Backend: `backend/InternSystem.API`, .NET 8, listens `0.0.0.0:5000`.
  Start: `setsid nohup dotnet run --no-build -c Release > backend/intern-api.log 2>&1 < /dev/null &`
  (tool commands time out at 120 s — always background).
- DB: Docker container `sqlserver`, SA pw in `docs/DEVELOPMENT_CREDENTIALS.md`, DB `InternSystemDB`;
  sqlcmd: `/opt/mssql-tools18/bin/sqlcmd -S localhost,1433 -U sa -P '<pw>' -C`.
- Metro: `npx react-native start --port 8081 --reset-cache` from `InternApp/`.
- AVD: `Pixel7` (`emulator -avd Pixel7 -no-snapshot-load`). App package `com.internapp`.
- `API_BASE_URL=http://10.0.2.2:5000/api` (`InternApp/src/config/constants.js`).
- **Never** edit `mobile/` (stale duplicate). Do not create/recreate
  `android/app/src/main/assets/index.android.bundle` (stale bundle caused old-JS bug).
- Creds: `admin`; mentors `{First}_{DEPT}_001..006`
  (e.g. `Aamir_ERP_001`); interns `{firstname}.{DEPT}.{###}`
  (e.g. `shahzaib.ERP.001`). Passwords in `docs/DEVELOPMENT_CREDENTIALS.md`.
- `adb shell input text` does NOT decode `%40`; type literal `@`.
- LogBox overlay swallows taps → tap the "!" bubble once per session.
- ADB-only UI verification: `adb shell uiautomator dump /sdcard/ui.xml`; JS errors via
  `adb logcat -s ReactNativeJS:E`. No image support — parse text/bounds.