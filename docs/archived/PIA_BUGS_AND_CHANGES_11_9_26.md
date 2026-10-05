# PIA BUGS AND CHANGES 11/9/26 — Implementation Plan (persisted)

> **W8 VERIFICATION 2026-10-06 (emulator-5554).** Every row below was
> re-checked; the `Status` column in this file is the *author's* claim, not
> evidence. Verified rows say what was checked. Six rows are NOT verified
> and are reopened as `[~]` in `TODO.md`. See `PROGRESS.md` for evidence.

Source of truth for the 23-item fix list + 2 console errors. All items deployed to
`InternApp/` (frontend) and `backend/InternSystem.API` (backend).

## Phase A — Backend

| # | Change | Location | Status |
|---|--------|----------|--------|
| 1 | Report PDF footer shows **who generated it** (add generated-by user to WriteReport footer) | `PdfService.cs:524`, `ReportController.cs` | completed |
| 8 | Enforce mandatory out-time: no check-out -> `DepartureStatus=Pending` (no silent skip) | attendance finalize/scoring path | **REOPENED `[~]`** — partial: `DepartureStatus(null)` does return `Pending`, `AttendanceVerificationController.cs:384` defaults it at check-in, scoring reads it, and "Out: Missing check-out" renders on both admin+mentor logs. But the clarification's **`DepartureSource` field does not exist** anywhere in Core or Infrastructure. |
| 17 | Gate-pass PDF: remove PIA letterhead header (`ComposeHeader`), remove Approved-By + supervisor/signature block, add "This is a system generated document", add light-coloured document ID bottom-left, named server files | `PdfService.cs:42-194, 589-606` | completed |
| 20 | Face-enrollment gate on intern apply endpoints (GatePass/IdCard/Certificate) | `InternController.cs:741, 830, ~999` | **REOPENED `[~]` — NOT IMPLEMENTED.** Only the *document* gate exists (`InternController.cs:473` -> `RequiredDocsApprovedAsync` -> `OfficialDocsApprovedAsync`, which contains no `FaceEnrolled` check). `AdminController.cs:860` / `MentorController.cs:471` are `ResetFaceEnrollment`, not gates. Conflicts with `AGENTS.md` §4.6 — see BLOCKERS B7. |
| 22 | Admin transfer DTO: add `fromDepartment`/`toDepartment` | `AdminController.cs:2186-2190, 2214-2229` | completed |

## Phase B — Frontend

| # | Change | Location | Status |
|---|--------|----------|--------|
| 2 | Remove page-name title from all admin headers (keep bell/icons) via `hideTitle` | `AppHeader.js:33-37` + admin call sites | completed |
| 3+6 | Swipe-to-dismiss on `Dropdown` bottom sheet; wire `onRequestClose` on 3 DepartmentsScreen form sheets | `Dropdown.js:107-115`, `DepartmentsScreen.js:569, 649, 755` | completed |
| 4 | Widen department dropdown in admin filters | `AdminInternsScreen.js:307-318, 656-664, 699`, `FaceApprovalsScreen.js:134-146, 231`, `LeaveApprovalsScreen.js:119-131, 189` | completed |
| 5 | Green "Edit Department" button text not clipped (fontSize/textAlign/width) | `DepartmentsScreen.js:641-643, 866-868` | completed |
| 7 | Replace `Pending` chip with `On Leave` on attendance logs (admin+mentor) | `AttendanceScreen.js:27-32`, `AttendanceViewScreen.js:26-31` | completed |
| 9 | Split timing colours: Out: Early=red, Late=green; add colours to mentor | `AttendanceScreen.js:34, 220-228`; `AttendanceViewScreen.js:199-200` | completed |
| 10 | Admin attend. chips re-fetch directly (match mentor) | `AttendanceScreen.js:98, 185` | completed |
| 11 | Face approvals: whole card pressable -> enrolled-photo viewer | `FaceApprovalsScreen.js:160-163`, `FaceApprovalsSection.js:126-129` | completed |
| 12 | Attendance log: tap card -> day detail/photo viewer | `AttendanceScreen.js:204`, `AttendanceViewScreen.js:173` | **REOPENED `[~]`** — partial: the card opens the *photo viewer* only (`if (a.checkInPhotoPath \|\| a.checkOutPhotoPath)`), gated on a photo existing. No day-detail view is implemented. |
| 13 | Activity logs: use `DateField` + standard sheet-mode `Dropdown` | `ActivityLogsScreen.js:93-104, 119-139` | completed |
| 14 | Toasts: non-interactive absolute overlay (no Modal) | `AppToast.js:49-66` | **REOPENED `[~]` — NOT IMPLEMENTED, and in conflict.** `AppToast.js:52` still renders inside `<Modal>` with a comment saying why. That matches `AGENTS.md` §16.2 ("Toasts render inside their own transparent Modal so they appear above screen modals"); this row contradicts it. Needs an owner ruling — see BLOCKERS B8. |
| 15 | Remove Preview button from issue-docs pending page | `IssueDocumentsScreen.js:346-354, 435-475` | completed |
| 16 | Issued docs display (admin+mentor+intern) from `{uploaded, issued}` / `/intern/gatepass` | `DocumentsScreen.js`, `DocumentsApprovalScreen.js`, intern docs screen | completed |
| 17c | Preserve proper export filename on share | `fileClient.js:42, 49-57` | completed |
| 18 | Compact approve-document cards | `DocumentsScreen.js:251-301, 367-369`, `DocumentsApprovalScreen.js:181-231, 289` | completed |
| 19 | Compact issue-document cards | `IssueDocumentsScreen.js:570` | completed |
| 21 | Fix transfers-page dropdown widths | `AdminTransfersScreen.js:133-155, 250` | completed |
| 22b | Render from/to departments on admin transfer cards | `AdminTransfersScreen.js:161-173` | completed |
| 23 | Status filter -> FilterChips on admin transfers | `AdminTransfersScreen.js:134-140` | completed |

## Phase C — Console errors

| Fix | Location | Status |
|-----|----------|--------|
| Missing key in ShiftsScreen impact grouping (null deptId) | `ShiftsScreen.js:150-155, 267` | **VERIFIED** — Impact modal renders 20 named interns, 0 unique-key errors in logcat. |
| Text string outside `<Text>` (in ShiftsScreen render tree) | ShiftsScreen / Dropdown / FilterChips | **REOPENED `[~]` — NOT REPRODUCED, but one unexplained occurrence.** 0 occurrences across Shifts, Attendance (x2), Transfers, Interns, login, and a cold start. **One** occurrence was captured during the initial sign-in -> dashboard transition; it carried no component stack and never recurred. Not attributable, therefore not proven fixed. |

## Phase D — Rebuild + test (LAST)

- Backend rebuild -> restart -> curl smoke checks.
- `assembleDebug` -> install on device -> user tests all UI/features -> release APK.

## Given clarifications
- #2: ALL admin screens.
- #8: auto-mark absent/pending if no check-out (DepartureSource=Pending + emphasised "missing check-out" on logs).
- #20: add face-enrollment gate too.
- #16: BOTH admin/mentor AND intern.
- #21+23: Admin transfers screen.
---

## W8 verification summary — 2026-10-06

Method: every claimed change was located in source first (a claim that was
never implemented cannot be verified by looking at the UI), then the
UI-visible rows were exercised on `emulator-5554` with `uiautomator` dumps
and `adb logcat`.

**Verified (20 of 25 rows).** Items 1, 2, 3+6, 4, 5, 7, 9, 10, 11, 13, 15, 16,
17, 17c, 18, 19, 21, 22, 22b, 23, and C1.

Highlights worth recording:

- **Item 2** — initially measured as 11 of 13 admin screens using
  `hideTitle`. That was a measurement artifact: `FaceApprovalsScreen` and
  `LeaveApprovalsScreen` use the shorthand `<AppHeader home />`, which passes
  no `title`, and `AppHeader.js` renders the title only under
  `{!hideTitle && title ? ...}`. All **13** admin screens render no page
  title. Verified, not assumed.
- **Item 9** — `OUT_SLOT_COLORS` in both `admin/AttendanceScreen.js` and
  `mentor/AttendanceViewScreen.js` is `{OnTime: green, Early: '#ef4444',
  Late: green}`. Colour mapping verified in source; **pixel-level colour was
  not** verified on device.
- **Item 17c** — the filename survives because `fetchFileLocal` derives
  `baseName` from the URL path, sanitises it against
  `/^[\w\-\s.()]+$/`, and writes the cache file as `${safe}` before sharing
  `file://${safe}`.
- **Item 14 vs `AGENTS.md` §16.2** — see BLOCKERS B8. Not silently resolved.

**Reopened as `[~]` (5 rows):** items 8, 12, 14, 20 and C2.

### Retraction of an earlier claim

An earlier entry in `PROGRESS.md` and `CONTEXT.md` states "Shifts screen
console errors C1/C2 do NOT reproduce." **That conclusion was wrong** and is
withdrawn. It was reached by grepping logcat for `"text outside Text"` and
`"missing key"`, neither of which matches React Native's actual strings:

- C1 → `Encountered two children with the same key`
- C2 → `Text strings must be rendered within a <Text> component`

With the correct patterns, C1 is genuinely clean, and C2 fired **once**
during the initial sign-in → dashboard transition, with no component stack,
and never recurred across seven further attempts. The honest status is
"not reproduced, not explained, not proven fixed" — hence `[~]`, not `[x]`.
Same failure mode as assumption A16: a search that returns nothing is only
evidence for the pattern that was searched.

### Not verifiable on this run

- Item 8's `DepartureSource` field — absent from the codebase, so there is
  nothing to verify.
- Item 20's face gate — absent from the codebase (BLOCKERS B7).
- Items 4 and 21 are pure layout/clipping claims. The widths exist in
  source, but "not clipped" needs a render; only partially exercised here.
- Items 1, 8, 17 need a real report/gate-pass/attendance record. No such
  fixture was generated on this run, so they are source-verified only.
