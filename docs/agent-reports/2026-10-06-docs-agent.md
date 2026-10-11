# Agent Handoff — docs-agent — 2026-10-06 06:54

## Branch

`docs/prd-reconciliation` — **pushed**, local == origin at `d69ba56`
(`git branch -vv` shows no ahead/behind).

## Last commit

`d69ba56` — `fix: read face thresholds from config; tighten match to 0.58`

Preceded by `b626dde` — `docs: reconcile PRD, correct thresholds, record D-S23/D-S25`

## Done this session

- Wrote `docs/PRD.md` from the owner addendum (14 REQ, questions, requirement
  index) and reconciled `docs/REQUIREMENTS.md`, `docs/TODO.md`, `docs/PROGRESS.md`,
  `docs/CONTEXT.md`.
- Corrected D-S23 (attendance captures ARE written to disk; write sits after
  every gate so failures discard it) and appended the implementation note.
- Appended **D-S25** — geofence reads `Departments.Latitude/Longitude` only,
  fail-closed with `MISSING_GEOFENCE_CONFIG`, both hardcoded fallback centres
  removed, `Interns.Latitude/Longitude` retained but out of the resolution chain.
- Appended **D-S26** — face thresholds read from `IConfiguration`
  (`FaceMatchThreshold` 0.58, `SpoofThreshold` 0.60), hardcoded 0.70/0.40 removed.
  Includes the honest "self-capture side NOT PERFORMED" validation clause.
- Committed the doc work as `b626dde`, then the threshold change as `d69ba56`.
  Both pushed. Nothing merged.
- Investigated the 0.70/0.40/0.58 threshold question end to end:
  - `grep -rnE '0\.5[0-9]|0\.6[0-9]|0\.7[0-9]|threshold'` → 26 matches, only
    **two** are face thresholds (`FaceRecognitionService.cs:37`, `:40`). 21 are
    `AttendanceSettings.ThresholdPct`. **The supplied pattern missed 0.40** — found
    via a supplementary `0\.4[0-9]` sweep. `:380` `bestScore = 0.7f` is an
    UltraFace detection floor, out of scope.
  - Impostor analysis: 76 approved+enrolled interns, 2850 embedding pairs, min
    genuine impostor **0.7099** (46 vs 236). Old gate cleared it by 0.0099; the
    new gate clears by 0.1299.
  - Discovered the seeded enrollments are **synthetic**: interns 258/259/260
    (`Ab`, `Gg`, `Tg`) are 0.0734–0.1072 apart — one photo enrolled repeatedly —
    and intern 128 sits 0.2706–0.2764 from all three.
- Deleted the root addendum `PRD Addendum Owner requested.md` after verifying
  containment (14 REQ + 30 Q headings, 0 missing). `git rm` failed — the file was
  never tracked — so used `rm`; no git history exists.
- Repaired a cross-branch contamination incident on my own pushed commit
  (see "What the next agent must know").
- Captured and reported the 8 compiler warnings; logged as TODO **W2.10**.
- Added TODO **W2.11** (REQUIREMENTS.md gitignore vs §9.7 traceability tension)
  and **DQ.1–DQ.3** (seed data, deferred real-face regression, enrollment-record
  population mismatch).
- Added **A34** to `docs/CONTEXT.md`; corrected **A31**, which had asserted the
  threshold change was "validated against live data" — A34 disproves that.

## In progress (not committed)

Four entries. All four belong to other agents or are evidence artifacts — **none
are mine, commit none of them.**

- `InternApp/src/api/client.js` — tests agent's work. Was present uncommitted
  before my first commit; carried across every branch switch untouched.
- `InternApp/src/components/AppToast.js` — tests agent's work. Same.
- `InternApp/src/components/SwipeableModal.js` — tests agent's work. Same.
- `InternApp/src/sync/syncEngine.js` — tests agent's 4-line comment block above
  `classifySendError`. **This is the file that got folded into my docs commit by
  a bad amend.** I unstaged it during repair; it is theirs to commit.
- `logs/screenshots/2026-10-06-d2-intern.png` — untracked screenshot evidence from
  an earlier on-device session, not from mine.

Gitignored and therefore invisible to `git status` but **uncommitted by
construction**: `docs/TODO.md`, `docs/PROGRESS.md`, `docs/CONTEXT.md`,
`docs/REQUIREMENTS.md`, `docs/DECISIONS.md`, `docs/DEVELOPMENT_CREDENTIALS.md`,
and this handoff file.

## Blocked

- **D-S26 self-capture validation — deferred, TODO `DQ.2`.** A fresh live-human
  enrollment plus a second distinct human for the impostor attempt. The emulator
  camera (`emulator-5554`, AVD Pixel7) renders a synthetic scene; no real face is
  available to me. Needs a human on a device with a real camera. I refused to
  fabricate the result rather than assert an unrun test.
- **`fix/transfer-cas-and-rejection` is `ahead 1`** (unpushed, worktree at
  `/tmp/opencode/transfer-cas`). Sequenced after the doc work; not mine to push.
- **Requirement implementation — blocked by owner sequencing.** REQ-01, REQ-05,
  REQ-10 and all others wait for the transfer CAS refactor to land and merge.
  Q13a must be answered before REQ-10 is specified; Q8a/Q9b before REQ-05.
- **`docs/PRD.md` is gitignored** despite being the master requirement document.
  Same family of problem as W2.11; not resolved.
- **Null `RadiusMeters` behaviour under D-S25 is unspecified**, and the remaining
  consumers of `Interns.Latitude/Longitude` have not been inventoried. D-S25
  says to inventory before implementing; that has not been done.

## What the next agent must know

**The contaminated-commit incident.** After I pushed `b626dde`, something amended
the tip to `ecf11c5`, folding `InternApp/src/sync/syncEngine.js` into my docs
commit. I caught it because my own hash no longer matched on the next command.
Repaired with `git reset --soft b626dde` + `git restore --staged`. I did not make
that amend and cannot see who did — the tests agent has been told separately. Root
cause is an amend on a pushed branch (§17.5). If you find a hash mismatch between
local and origin on **any** branch, stop and `git diff` before doing anything else.
The tests agent is now on worktrees (`/tmp/opencode/sync-seams`,
`/tmp/opencode/agents-md`); `fix/transfer-cas-and-rejection` likewise.

**Two standing API-server constraints.** `appsettings.json` pins Kestrel to
`http://0.0.0.0:5000`, which **overrides `--urls`** — a different port needs
`dotnet run --no-build -- --Kestrel:Endpoints:Http:Url=http://127.0.0.1:5099`.
Port 5000 was occupied by another agent's instance throughout this session; I did
not kill it. And `FaceRecognitionService` is registered via an `AddSingleton`
factory, so it is **constructed lazily on first resolve** — the
`"Face thresholds in effect"` startup log will not appear until an authenticated
face endpoint is actually called. Do not read its absence as a failure to load.

**Evidence that is weaker than it looks.** The 1484-session distance distribution
(min 0.0401 / mean 0.2209 / max 0.6790) is arithmetically correct but is **not
evidence about real faces** — the seeds are synthetic (A34). Intern 128's
"healthy 0.2657" is almost certainly the same `test_photos/face1.jpg` as the
junk cluster. **Do not cite A31 as validation.** The impostor margin is the only
load-bearing face evidence so far. Relatedly, `FaceEnrollmentRecords` reports 10
approved rows while `Interns.FaceEnrollmentStatus='Approved'` reports 76; one is
stale and I could not determine which (TODO `DQ.3`).

**Two judgement calls I made that the owner did not specify.** (1) `ReadThreshold`
**throws at startup** on an unreadable or out-of-range configured threshold —
a *missing* key falls back to the default, but a malformed one stops the app
rather than silently widening a gate. (2) I left `FaceRecognitionService.cs:380`
(`bestScore = 0.7f`) untouched per Ruling 4, and added an explicit scope note to
D-S26 saying so. Flag both if you disagree; they are in commit `d69ba56`.

**Unresolved doc tension, flagged not fixed.** The owner asked for the tooling
note in `AGENTS.md` §12.6, but §12.6 does not exist — the file's numbered
sections run `10.6 Verification discipline`. I put it in §10.6 on the grounds
that it is the section about verification discipline, not the section about
logging. Worth a decision rather than leaving it to be "fixed" by the next agent
who greps for §12.6.

**Credentials.** `docs/DEVELOPMENT_CREDENTIALS.md` (gitignored) — SA password is
on **line 24** inside backticks, the connection string on **line 43**, the JWT key
on **line 60**. Extract with `sed -n '24p' | grep -oE '` + backtick-delimited
match. Use `/opt/mssql-tools18/bin/sqlcmd` (not the bare `sqlcmd` on PATH — it
defaults to ODBC Driver 18 without `-C`) and always pass `-d InternSystemDB`.
Passing `-U sa` without `-d` silently connects to `master`, where `Interns` does
not exist and you will read "Invalid object name 'Interns'" and conclude the table
is gone. It is not.

**Env quirks.** `rg` is not installed; use `grep -rnE`. `docs/PRD.md`,
`docs/CONTEXT.md`, `docs/TODO.md`, `docs/PROGRESS.md`, `docs/REQUIREMENTS.md` and
`docs/DECISIONS.md` are all gitignored per §9.1, so documentation work never
propagates to git unless that is deliberately changed. `docs/DECISIONS_LOG.md` and
`AGENTS.md` are tracked and do propagate.

**Build/test state.** `dotnet build` 0 errors, 8 warnings. `dotnet test` 50/50
(35 Core + 1 API + 14 Integration), 0 failed, 0 skipped. The 8 warnings are
pre-existing on `chore/w2-and-createintern-fixes` — 6 in
`AdminController.cs:140,141,1394` / `InternController.cs:78,388` /
`MentorController.cs:1341`, 2 in the tests agent's `IdempotentAttribute.cs:77` and
`SqlServerTestDatabase.cs:6`. `InternController.cs:78` is CS0472 ("always true"
`int` vs `int?`) and reads as a real logic defect, not an annotation nit — worth
raising with whoever owns that branch. Not fixed here: §3.5 surgical changes, and
it is not my branch.