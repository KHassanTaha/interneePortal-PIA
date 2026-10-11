# Agent Handoff — coding-agent — 2026-10-06 06:56

## Branch
`docs/prd-reconciliation` — pushed to origin (upstream set).
Note: this branch had a cross-branch contamination incident earlier today
(amended commit folded syncEngine.js into a docs commit; repaired with
`reset --soft` — see PROGRESS). Current working tree is uncommitted work on
top of it.

## Last commit
`d69ba56 fix: read face thresholds from config; tighten match to 0.58`

## Done this session

**Bug 2 — sheets cannot be dismissed by swipe. RESOLVED via platform root-cause.**
- Proven that RN 0.86 / Fabric / Hermes (release) Modal on Android delivers NO
  JS responder events for touches that START on the bare chrome strip above a
  Modal's ScrollView. Confirmed with all three gesture layers on the admin
  Create Mentor sheet:
  1. `PanResponder` (`onMoveShouldSetPanResponder`) — never engages; sheet did
     not move mid-drag.
  2. Raw View responder handlers on the sheet `Animated.View` AND on the exact
     handle wrapper — no grant, no move (`[swipe]` console instrumentation was
     useless because Hermes release strips console; used a red-pill visual
     probe instead — never turned red).
  3. `TouchableOpacity` wrapping the pill — a11y tree shows chrome nodes as
     non-clickable; a held press produced no visible state change.
- Controls INSIDE the ScrollView (fields, buttons) fire press events normally.
- Rebuilt `SwipeableModal.js`: pill + themed `Close` button rendered INSIDE the
  scrollable content region (so presses work), plus a full-screen backdrop
  `TouchableOpacity` above the sheet.
- Verified all three dismissal paths on the emulator (Pixel7 :5554):
  Close button tap (965,569) closes; backdrop tap (540,150) closes; hardware
  back closes (previously verified).
- Verifiered a field inside the sheet still focuses (tap (540,1000) → EditText
  `focused="true"`).

**Bug 3 — toasts blocking input. FIXED + verified (from earlier release build).**
- `AppToast.js` rewritten: pub/sub `listeners` Set + `ToastHost` plain overlay
  (no Modal), `pointerEvents="box-none"`. Verified on emulator: with toast up,
  username field still took focus and accepted text.

**Bug 1 — activity logs opening from dashboard. Root cause fixed.**
- Not a navigation bug: "View All" and Recent Activity cards work (View All →
  ActivityLogs 867 records; card → LogDetailModal correct). The real defect was
  a stale-session silent failure: 401 → refresh fails → old code cleared tokens
  but not the redux session, leaving a logged-in shell with no token (zeros +
  empty log). `client.js` refresh-failure now clears tokens + dispatches
  `logoutUser` (guard: `isAuthenticated`) + toasts "session expired".

**Hot-swap tooling built and debugged** (fast JS iteration replacing 15-min
release builds):
- metro bundle → replace `assets/index.android.bundle` in release APK →
  two-pass zip (`-0` for everything EXCEPT `assets/*`; `assets/*` deflated) →
  `zipalign -f -p 4` → `apksigner` with `InternApp/android/app/debug.keystore`
  (`androiddebugkey` / `android`) → `adb install -r`.
- Gotcha fixed: `resources.arsc` and `classes.dex` MUST stay Stored and
  aligned or install fails `-124 Failed parse ... resources.arsc ... stored
  uncompressed and aligned on 4-byte`. (First attempts silently deflated them,
  causing install failures that looked like the fix didn't land.)
- Latest installed build on the emulator = `signed7.apk` (Close-button + backdrop
  fix).

**Docs updated:** D-14 appended to `docs/DECISIONS_LOG.md` (swipe retired,
Close button + backdrop + back adopted, with the platform evidence); TODO item 3
marked resolved; PROGRESS.md entry appended.

## In progress (not committed)
- `InternApp/src/components/SwipeableModal.js` — rewritten dismissal UX (Close
  button + backdrop + header pill moved inside scroll region). This is the
  verified-fixed version, not yet committed.
- `InternApp/src/components/AppToast.js` — pub/sub + non-blocking overlay toast
  (verified on emulator from the release build; change uncommitted).
- `InternApp/src/api/client.js` — force logout + toast on refresh-token failure
  (Bug 1 fix; verified server-side behaviour, emulator View All regression
  passed on earlier release build).
- `docs/DECISIONS_LOG.md` — D-14 entry appended.
- `docs/TODO.md` — item 3 status updated to resolved.
- `docs/PROGRESS.md` — session entry appended.
- `docs/agent-reports/` — this file (untracked dir).
- `logs/screenshots/2026-10-06-d2-intern.png` — untracked screenshot.
- `docs/prd-reconciliation` — untracked (working dir; per PROGRESS, previously
  reconciled to equal origin).

## Blocked
- Physical phone (Infinix X678B, serial `10268333AR003499`): adb link is
  unstable / not currently cooperating, so getting the verified bundle onto the
  phone is deferred. Reinstall + verify the three dismissal paths and a real
  mentor submission on the phone once adb is stable.
- Swipe gesture itself is BLOCKED BY PLATFORM and deliberately RETIRED (D-14) —
  do not reintroduce PanResponder/raw-responder/Pressable drag-on-chrome in this
  Modal without re-proving it on this RN/Android combo.

## What the next agent must know
1. **Session/loan state on emulator:** app currently logged in as `admin`
   (dashboard shows real data). API is `http://localhost:5000/api` reachable via
   `adb reverse tcp:5000 tcp:5000`; SQL on host :1433; stale admin token at
   `/tmp/opencode/tok` — re-login for fresh calls. See PROGRESS/debug notes.
2. **Hermes release strips console.log** — do not debug via logcat
   `ReactNativeJS` in release builds. Use visible state/UI probes.
3. Hot-swap pipeline lives in `/tmp/opencode/apkwork/` (`base.apk`, `fixed*.apk`,
   `alignedN.apk`, `signedN.apk`, `wN/` working dirs). Copy the working recipe
   into a script if the phone iteration resumes.
4. The currently understood emulator tap map (physical px): dashboard menu
   (975,205); sidebar Mentors (660,783); Add Mentor (890,204); Create Mentor
   sheet Close (965,569); backdrop close (540,150); login username y≈1220
   (keyboard closed), Sign In (540,1680).
5. Before shipping to the phone: run a full `assembleRelease` (current release
   APK predates the SwipeableModal rework), then re-run the §18 UI verification
   (Bug 1/2/3, real mentor submission), update
   `docs/PIA_FIXES_AND_CHANGES_12_9_26.md`, then commit the uncommitted files on
   a feature branch (do not amend; this branch already had an amend incident).
6. The stray-only-`y` residue in the login username field from toast testing has
   since been overwritten by real admin login.