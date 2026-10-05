# PIA BUGS AND CHANGES 11/9/26 — Implementation Plan (persisted)

Source of truth for the 23-item fix list + 2 console errors. All items deployed to
`InternApp/` (frontend) and `backend/InternSystem.API` (backend).

## Phase A — Backend

| # | Change | Location | Status |
|---|--------|----------|--------|
| 1 | Report PDF footer shows **who generated it** (add generated-by user to WriteReport footer) | `PdfService.cs:524`, `ReportController.cs` | completed |
| 8 | Enforce mandatory out-time: no check-out -> `DepartureStatus=Pending` (no silent skip) | attendance finalize/scoring path | completed |
| 17 | Gate-pass PDF: remove PIA letterhead header (`ComposeHeader`), remove Approved-By + supervisor/signature block, add "This is a system generated document", add light-coloured document ID bottom-left, named server files | `PdfService.cs:42-194, 589-606` | completed |
| 20 | Face-enrollment gate on intern apply endpoints (GatePass/IdCard/Certificate) | `InternController.cs:741, 830, ~999` | completed |
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
| 12 | Attendance log: tap card -> day detail/photo viewer | `AttendanceScreen.js:204`, `AttendanceViewScreen.js:173` | completed |
| 13 | Activity logs: use `DateField` + standard sheet-mode `Dropdown` | `ActivityLogsScreen.js:93-104, 119-139` | completed |
| 14 | Toasts: non-interactive absolute overlay (no Modal) | `AppToast.js:49-66` | completed |
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
| Missing key in ShiftsScreen impact grouping (null deptId) | `ShiftsScreen.js:150-155, 267` | completed |
| Text string outside `<Text>` (in ShiftsScreen render tree) | ShiftsScreen / Dropdown / FilterChips | verify at runtime (logcat) |

## Phase D — Rebuild + test (LAST)

- Backend rebuild -> restart -> curl smoke checks.
- `assembleDebug` -> install on device -> user tests all UI/features -> release APK.

## Given clarifications
- #2: ALL admin screens.
- #8: auto-mark absent/pending if no check-out (DepartureSource=Pending + emphasised "missing check-out" on logs).
- #20: add face-enrollment gate too.
- #16: BOTH admin/mentor AND intern.
- #21+23: Admin transfers screen.