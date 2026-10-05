# PIA Intern System — Complete Launch Guide (Fresh Start)

> **Purpose**: Step-by-step commands to launch the entire PIA Intern System from a completely dead state — cleared caches, fresh database seed, all services running.

**Prerequisites**: Ubuntu/Linux host, Docker (SQL Server), Node.js ≥ 22.11, .NET 8 SDK, Android SDK + **either** the Emulator (AVD `Pixel7`) **or a physical Android phone with USB debugging** enabled, `adb` in PATH.

> **Windows?** See `docs/LAUNCH_GUIDE_WINDOWS.md`.

---

## 0. Quick Reference — Demo Credentials

> All credentials (SQL SA password, JWT key, demo logins) are centralized in
> **`docs/DEVELOPMENT_CREDENTIALS.md`** (gitignored). Do not paste them into this
> file or any other committed document.

---

## 1. Kill All Running Processes (Clean Slate)

```bash
# Kill any existing Metro, backend, emulator processes
pkill -f "react-native start" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true
pkill -f "InternSystem.API" 2>/dev/null || true
pkill -f "dotnet run" 2>/dev/null || true
pkill -f "emulator" 2>/dev/null || true
adb kill-server 2>/dev/null || true

# Verify nothing is on our ports
ss -ltnp | grep -E ':8081|:5000|:5554' || echo "Ports free"
```

---

## 2. Clear All Caches

### 2.1 React Native / Metro / Node Caches
```bash
cd /home/taha/Documents/pia-interns-app/InternApp

# Clear Metro cache (start then immediately kill)
# (killing it can print "Error: setRawMode EIO" — harmless, the real server starts in §6)
npx react-native start --reset-cache --port 8081 &
METRO_PID=$!
sleep 3
kill $METRO_PID 2>/dev/null || true

# Clear npm cache + node_modules (only if dependency issues)
npm cache clean --force 2>/dev/null || true
# rm -rf node_modules package-lock.json && npm install

# Clear watchman (if installed)
watchman watch-del-all 2>/dev/null || true

# Clear gradle build cache
cd /home/taha/Documents/pia-interns-app/InternApp/android
./gradlew clean --no-daemon 2>/dev/null || true
cd /home/taha/Documents/pia-interns-app/InternApp
```

### 2.2 Android / Emulator Caches
```bash
# Stop any running emulator + wipe data disk
adb emu kill 2>/dev/null || true
cd ~/.android/avd/Pixel7.avd
rm -f *.lock *.qcow2 2>/dev/null || true

# Restart adb
adb kill-server
adb start-server
```

### 2.3 Backend / .NET Caches
> `dotnet clean --no-build` is **not** a valid command (`--no-build` is not a `clean` switch → MSB1001).
> Just delete `bin`/`obj`:

```bash
cd /home/taha/Documents/pia-interns-app/backend/InternSystem.API

rm -rf bin obj 2>/dev/null || true
dotnet nuget locals all --clear 2>/dev/null || true
```

---

## 3. SQL Server (Docker)

> **Docker permissions:** `docker ps` failing with `permission denied while trying to connect to the docker API at unix:///var/run/docker.sock` means your user isn't in the `docker` group.
> Either prefix every `docker` command with `sudo`, or permanently: `sudo usermod -aG docker $USER`, log out/in (or `newgrp docker`), then `sudo systemctl start docker`.
>
> **Reusing an existing DB:** if a container from a past session is already publishing `1433` (any name — dev friends have used `sqlserver` *and* `mssql`), the check below skips the `docker run` and you just re-verify the SA login.

```bash
# Is SQL Server already reachable? (existing container / native install)
if /opt/mssql-tools18/bin/sqlcmd -S localhost,1433 -U sa -P '<see docs/DEVELOPMENT_CREDENTIALS.md>' -C -Q "SELECT 1" >/dev/null 2>&1; then
  echo "SQL Server already running — skipping container start"
else
  # Start container if not running
  docker ps -q -f "name=sqlserver" | grep -q . || docker run -d \
    --name sqlserver \
    -e "ACCEPT_EULA=Y" \
    -e "SA_PASSWORD=<see docs/DEVELOPMENT_CREDENTIALS.md>" \
    -e "MSSQL_PID=Developer" \
    -p 1433:1433 \
    mcr.microsoft.com/mssql/server:2022-latest

  # Wait until ready
  echo "Waiting for SQL Server..."
  until /opt/mssql-tools18/bin/sqlcmd -S localhost,1433 -U sa -P '<see docs/DEVELOPMENT_CREDENTIALS.md>' -C -Q "SELECT 1" >/dev/null 2>&1; do
    sleep 2
  done
  echo "SQL Server ready"
fi
```

---

## 4. Fresh Database Seed (Full Data)

> Seed creates 12 departments, 72 mentors, 240 interns, 27 shifts, all tables populated.
> **On a brand-new container `InternSystemDB` doesn't exist yet** — `full_seed.sql` does `USE InternSystemDB`, so create it first (a quick backend boot also creates it via EF auto-migrate, but the guard below is the simplest):

```bash
cd /home/taha/Documents/pia-interns-app

PWD_SQL='<see docs/DEVELOPMENT_CREDENTIALS.md>'
/opt/mssql-tools18/bin/sqlcmd -S localhost,1433 -U sa -P "$PWD_SQL" -C \
  -Q "IF DB_ID('InternSystemDB') IS NULL CREATE DATABASE InternSystemDB;"

# Run the idempotent full seed SQL
/opt/mssql-tools18/bin/sqlcmd \
  -S localhost,1433 \
  -U sa \
  -P "$PWD_SQL" \
  -C \
  -i backend/InternSystem.API/Seed/full_seed.sql

# Verify seed counts
/opt/mssql-tools18/bin/sqlcmd -S localhost,1433 -U sa -P "$PWD_SQL" -C -Q "
SELECT 'Departments' t, COUNT(*) c FROM InternSystemDB.dbo.Departments
UNION ALL SELECT 'Mentors', COUNT(*) FROM InternSystemDB.dbo.Mentors
UNION ALL SELECT 'Interns', COUNT(*) FROM InternSystemDB.dbo.Interns
UNION ALL SELECT 'Users', COUNT(*) FROM InternSystemDB.dbo.Users
UNION ALL SELECT 'Shifts', COUNT(*) FROM InternSystemDB.dbo.Shifts
UNION ALL SELECT 'Attendances', COUNT(*) FROM InternSystemDB.dbo.Attendances
UNION ALL SELECT 'Tasks', COUNT(*) FROM InternSystemDB.dbo.Tasks
UNION ALL SELECT 'DocumentUploads', COUNT(*) FROM InternSystemDB.dbo.DocumentUploads
UNION ALL SELECT 'GatePasses', COUNT(*) FROM InternSystemDB.dbo.GatePasses
UNION ALL SELECT 'Certificates', COUNT(*) FROM InternSystemDB.dbo.Certificates
UNION ALL SELECT 'ActivityLogs', COUNT(*) FROM InternSystemDB.dbo.ActivityLogs
ORDER BY t;"
```

**Expected approximate counts**: Departments 12 · Mentors 72 · Interns 240 · Users 313 ·
Shifts 27 · Attendances 6000+ · Tasks 500+ · DocumentUploads 200+ · GatePasses 100+ ·
Certificates 50+ · ActivityLogs 1000+.

---

## 5. Build & Start Backend API

### 5.0 Face models (REQUIRED — not in git)

The ONNX weights are **not committed** (`facenet.onnx` is 248 MB, over GitHub's
100 MB limit). On a fresh clone, face enrollment and face-attendance
verification are **silently unavailable** — the API still starts, but logs:

```
FaceNet ONNX model NOT found at .../Models/AI/facenet.onnx — face verification will be unavailable.
```

Fetch them once per machine before starting the API:

```bash
mkdir -p backend/InternSystem.API/Models/AI
cd backend/InternSystem.API/Models/AI

# --- ultraface.onnx (1.2 MB) — face detection. Drop-in, no conversion. ---
curl -L -o ultraface.onnx \
  "https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/master/models/RFB-320/version-RFB-320.onnx"

# --- facenet.onnx (248 MB) — ArcFace 512-D embedding. Drop-in, no conversion. ---
# NB: the upstream file is named arc.onnx; `-o facenet.onnx` renames it on the way in.
curl -L -o facenet.onnx \
  "https://huggingface.co/garavv/arcface-onnx/resolve/main/arc.onnx"

ls -la *.onnx    # verify both exist and are non-zero
```

#### `antispoof.onnx` — NOT a plain download. Pick a path.

The code (`FaceRecognitionService.cs:206-208`) expects a **2-class** model
where `index 1 == real`, fed **BGR, raw 0-255**. The convenient Hugging Face
export is **3-class** `[live, print, replay]` and expects **`pixel/255`**.
Dropping it in unchanged yields meaningless anti-spoof scores.

**Path A — faithful (recommended).** Convert the original 2-class model:

```bash
git clone https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
cd Silent-Face-Anti-Spoofing && pip install torch onnx
python - <<'PY'
import torch, onnx
from model_lib.MiniFASNet import MiniFASNetV2
model = MiniFASNetV2(num_classes=2, input_size=(80, 80), conv6_kernel=(3, 3)).to("cpu")
model.load_state_dict(torch.load("resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth", map_location="cpu"))
model.eval()
torch.onnx.export(model, torch.randn(1, 3, 80, 80), "antispoof.onnx",
                  input_names=["input"], output_names=["output"],
                  opset_version=11, dynamic_axes={"input": {0: "batch"}})
print("wrote antispoof.onnx (2-class, BGR, raw 0-255)")
PY
cp antispoof.onnx ..      # the clone was made inside Models/AI, so .. is Models/AI
ls -la ../antispoof.onnx   # verify it landed in Models/AI and is non-zero
cd ..                      # back to Models/AI; delete the clone when done
rm -rf Silent-Face-Anti-Spoofing
```

No code change needed on Path A.

**Path B — faster fetch, needs 2 code tweaks.** Use the 3-class HF export,
then fix preprocessing (divide by 255) and the score
(`real = 1 - (print + replay)`) in `FaceRecognitionService.cs`.
**Not yet written into this guide — it is a code change and needs a tracked
task.** Ask before choosing it.

Source spec: `docs/archived/FACE_RECOGNITION_AND_SYSTEM_GUIDE.md` §7.3.

### 5.1 Build & start

```bash
cd /home/taha/Documents/pia-interns-app/backend/InternSystem.API

# Restore (slow the FIRST time after the caches were cleared — NuGet re-downloads everything ~3 min) and build
dotnet restore
dotnet build --no-restore -c Release

# Start API detached; logs to file.
# REQUIRED env vars (the API FAILS CLOSED without them):
#   ASPNETCORE_ENVIRONMENT=Development     -> enables dev logging config
#   Jwt__Key                                -> signing key from docs/DEVELOPMENT_CREDENTIALS.md §4
#   ConnectionStrings__DefaultConnection   -> SQL value from docs/DEVELOPMENT_CREDENTIALS.md §3 (SQL auth string)
# Fixes the two classic startup crashes:
#   "ConnectionStrings:DefaultConnection is not configured..." when the conn string env var is missing
#   "Jwt:Key is not configured or too short..."            when Jwt__Key is missing or under 32 bytes
setsid env ASPNETCORE_ENVIRONMENT=Development \
  "Jwt__Key=<see docs/DEVELOPMENT_CREDENTIALS.md §4 — signing key>" \
  "ConnectionStrings__DefaultConnection=<see docs/DEVELOPMENT_CREDENTIALS.md §3 — SQL auth string>" \
  nohup dotnet run --no-build -c Release \
  > /home/taha/Documents/pia-interns-app/backend/intern-api.log 2>&1 < /dev/null &

# Wait for API on :5000.
# NOTE: do NOT health-check with `curl -sf http://localhost:5000/api/admin/settings` —
# that endpoint returns 401 unauthenticated, so curl -f treats it as a failure and the
# loop never exits. Check that the port is listening instead:
echo "Waiting for API on :5000..."
until ss -ltn | grep -q ':5000 '; do
  sleep 2
done
echo "API ready at http://localhost:5000"
grep "Now listening" /home/taha/Documents/pia-interns-app/backend/intern-api.log
```

**Note**: Migrations auto-apply at startup ("No migrations were applied. The database is already up to date."). Unauthenticated requests return 401 (expected). The app always calls the API at **`http://localhost:5000/api`** (`API_BASE_URL` in `InternApp/src/config/constants.js`) — reachable on an emulator **or** a USB phone **only** via `adb reverse` (Section 7). The emulator's `10.0.2.2` host alias is **not** used by this app.

---

## 6. Start Metro Bundler (JS Bundle Server)

```bash
cd /home/taha/Documents/pia-interns-app/InternApp

# Start Metro with reset cache, detached
setsid nohup npx react-native start --port 8081 --reset-cache \
  > /home/taha/Documents/pia-interns-app/metro.log 2>&1 < /dev/null &

# Wait for Metro
echo "Waiting for Metro on :8081..."
until curl -sf http://localhost:8081/status >/dev/null 2>&1; do
  sleep 2
done
echo "Metro ready at http://localhost:8081"
```

> **Critical**: Do NOT embed a stale JS bundle at `android/app/src/main/assets/index.android.bundle`. The app runs against Metro in debug mode; a stale bundle runs obsolete JS.
>
> **First load after `--reset-cache` is slow**: the first time the app requests `index.bundle` Metro recompiles ~2600+ modules from scratch and briefly pegs the CPU (expect 30–60 s and a `DEVICES xxxx  BUNDLE` progress line in `metro.log`) — normal, later loads are fast.

---

## 7. Launch the Device (Emulator AVD *or* physical USB phone)

The app hard-codes `API_BASE_URL = http://localhost:5000/api` and Metro serves its JS bundle at `http://localhost:8081`. On a phone/emulator `localhost` means *the device itself*, so you **must** forward both ports back to the dev machine with `adb reverse` — for the emulator **and** for a physical phone alike. Skipping this is the #1 cause of "app loads but can't reach the API / dashboard errors".

### 7a. Physical USB phone (recommended — `adb devices` shows your phone model)

```bash
adb devices                    # expect your phone listed as "device" (NOT "unauthorized")
# If "unauthorized": accept the RSA "Allow USB debugging" prompt on the phone.
# If it never appears / is missing: unplug & re-plug USB, toggle Developer options > USB debugging.
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
adb reverse --list             # expect: UsbFfs tcp:8081 tcp:8081  and  UsbFfs tcp:5000 tcp:5000
```

### 7b. Pixel7 emulator (alternative — no phone needed)

```bash
# Boot cold (no snapshot)
emulator -avd Pixel7 -no-snapshot-load -no-boot-anim > /tmp/emulator.log 2>&1 &

# Wait for boot completion
adb wait-for-device
adb shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done'
adb devices   # expect: emulator-5554    device

# Forward both ports (REQUIRED — this app uses localhost, not the 10.0.2.2 alias)
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
```

---

## 8. Install & Launch App on the Device (phone or emulator)

```bash
cd /home/taha/Documents/pia-interns-app/InternApp/android

# Build debug APK
# FIRST build after `./gradlew clean` is SLOW (10–15 min): it recompiles native C++
# (vision-camera, nitro modules, rnscreens) for 4 ABIs and ends with "BUILD SUCCESSFUL".
# Don't interrupt it — it only LOOKS stuck while quiet. The debug APK is ~280 MB.
./gradlew assembleDebug --no-daemon

# Install (replace existing)
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app (either works)
adb shell monkey -p com.internapp -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
# adb shell am start -n com.internapp/.MainActivity
sleep 8

# Verify no JS errors (a "Running \"InternApp\"" line in Metro's log is the success signal)
adb logcat -d -s ReactNativeJS:E 2>/dev/null | tail -5
```

**Success indicator**: metro.log shows `Running "InternApp"`; no `ReactNativeJS:E` errors.
App auto-logs-in from the persisted AsyncStorage session (admin by default).

**Dev-only gotcha**: if a LogBox warning overlay ("!" bubble, bottom-right) appears, tap it once to dismiss — it silently swallows all other taps while visible.

---

## 9. Verify All Roles (Manual Smoke Test)

### 9.1 Admin (`admin` — see docs/DEVELOPMENT_CREDENTIALS.md)
- Dashboard: 72 Mentors, 240 Interns, 12 Departments stats.
- **Settings/Configurability**: Grace Minutes, Threshold %, Allowed Leave Days, Holidays CRUD, Shifts (merged, collapsible).
- **Shifts**: search/filter/sort (Name/Company/per-dept; Name A–Z, Start, End); create/edit/disable; Impact modal with dept breakdown; reassign on disable.
- **Transfers**: search, Status/Initiated-By/Newest-first filters, create/edit modal, endorse/reject.
- **Departments**: radius disabled, locked 100 m.
- **Interns**: search, dept filter, inline create/edit modals, transfer section, eligibility.
- **Notifications**: bell badge, list, Mark all read.

### 9.2 Mentor (e.g. `Aamir_ERP_001` — see docs/DEVELOPMENT_CREDENTIALS.md)
- Dashboard with icons (no emojis).
- Interns (search + dept), Attendance (DateField + edit), Tasks (bottom FAB + edit, filter chips, EndOfListMarker), Shifts (dept dropdown, Active toggle), Intern Transfers (filters).

### 9.3 Intern (e.g. `shahzaib.ERP.001` — see docs/DEVELOPMENT_CREDENTIALS.md)
- Dashboard with bell badge; Attendance (date clamp, Mark Now); Tasks (status badges); Notifications (badge, read-all); Certificate (eligibility + task-completion progress).

---

## 10. Run E2E Tests (Detox)

```bash
cd /home/taha/Documents/pia-interns-app/InternApp

# Install detox if not present
npm install -D detox

# Build test binary + run
npx detox build --configuration android.emu.debug
npx detox test --configuration android.emu.debug
```

Coverage: auth (3 roles), admin flows, mentor flows, intern flows, notifications, reports (PDF/Excel).

---

## 11. One-Command Launch Script (Optional)

Save as `/home/taha/Documents/pia-interns-app/launch-all.sh` (then `chmod +x`):

```bash
#!/usr/bin/env bash
# Fill in the SA password + backend connection string (see docs/DEVELOPMENT_CREDENTIALS.md §1 & §3)
set -euo pipefail
ROOT="/home/taha/Documents/pia-interns-app"
SA_PASS='<SA password>'
CONN='<ConnectionStrings__DefaultConnection value — §3 SQL auth string>'

pkill -f "react-native start" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true
pkill -f "InternSystem.API" 2>/dev/null || true
pkill -f "dotnet run" 2>/dev/null || true
pkill -f "emulator" 2>/dev/null || true
adb kill-server 2>/dev/null || true

cd "$ROOT/InternApp"
npx react-native start --reset-cache --port 8081 & sleep 3 && kill $! 2>/dev/null || true
cd "$ROOT/InternApp/android" && ./gradlew clean --no-daemon 2>/dev/null || true
cd "$ROOT/backend/InternSystem.API" && rm -rf bin obj 2>/dev/null || true

# SQL Server (skip if already running)
if /opt/mssql-tools18/bin/sqlcmd -S localhost,1433 -U sa -P "$SA_PASS" -C -Q "SELECT 1" >/dev/null 2>&1; then
  echo "SQL Server already running"
else
  docker ps -q -f "name=sqlserver" | grep -q . || docker run -d --name sqlserver \
    -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=$SA_PASS" -e "MSSQL_PID=Developer" \
    -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
  until /opt/mssql-tools18/bin/sqlcmd -S localhost,1433 -U sa -P "$SA_PASS" -C -Q "SELECT 1" >/dev/null 2>&1; do sleep 2; done
fi

# Seed (create DB first — full_seed.sql does USE InternSystemDB)
/opt/mssql-tools18/bin/sqlcmd -S localhost,1433 -U sa -P "$SA_PASS" -C \
  -Q "IF DB_ID('InternSystemDB') IS NULL CREATE DATABASE InternSystemDB;"
/opt/mssql-tools18/bin/sqlcmd -S localhost,1433 -U sa -P "$SA_PASS" -C \
  -i "$ROOT/backend/InternSystem.API/Seed/full_seed.sql"

cd "$ROOT/backend/InternSystem.API"
dotnet restore && dotnet build --no-restore -c Release
setsid env ASPNETCORE_ENVIRONMENT=Development "ConnectionStrings__DefaultConnection=$CONN" \
  nohup dotnet run --no-build -c Release > "$ROOT/backend/intern-api.log" 2>&1 < /dev/null &
until ss -ltn | grep -q ':5000 '; do sleep 2; done

cd "$ROOT/InternApp"
setsid nohup npx react-native start --port 8081 --reset-cache > "$ROOT/metro.log" 2>&1 < /dev/null &
until curl -sf http://localhost:8081/status >/dev/null 2>&1; do sleep 2; done

emulator -avd Pixel7 -no-snapshot-load -no-boot-anim > /tmp/emulator.log 2>&1 &
adb wait-for-device
adb shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done'
# REQUIRED reverse ports (this app uses localhost)
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000

cd "$ROOT/InternApp/android"
./gradlew assembleDebug --no-daemon
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p com.internapp -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1

echo "✅ All services running!"
echo "   Backend:  http://localhost:5000"
echo "   Metro:    http://localhost:8081"
echo "   Logs:     tail -f $ROOT/backend/intern-api.log $ROOT/metro.log"
```

---

## 12. Troubleshooting Quick Reference

| Issue | Fix |
|-------|-----|
| `adb devices` empty | `adb kill-server && adb start-server`; for a physical phone: enable USB debugging, accept the RSA prompt, unplug/re-plug (§7a) |
| Metro `UnableToResolve` | `cd InternApp && npx react-native start --reset-cache` |
| Backend exits: `ConnectionStrings:DefaultConnection is not configured` | relaunch with the `ConnectionStrings__DefaultConnection` env var (§5) |
| Backend exits: `Jwt:Key is not configured or too short` | relaunch with the `Jwt__Key` env var set (§5) |
| Backend health-check loop never exits | you used `curl -sf` on a 401 endpoint — use the `ss -ltn | grep ':5000 '` check (§5) |
| `dotnet clean --no-build` → MSB1001 | `--no-build` isn't a clean switch; just `rm -rf bin obj` (§2.3) |
| `docker: permission denied ... /var/run/docker.sock` | add user to `docker` group (or `sudo` every docker command) (§3) |
| App shows black/error but backend + Metro are up | `adb reverse --list` must show BOTH `tcp:8081` and `tcp:5000` (§7) |
| First `./gradlew assembleDebug` seems stuck | normal — native C++ for 4 ABIs, 10–15 min, ends `BUILD SUCCESSFUL` (§8) |
| `npx react-native start` prints `setRawMode EIO` | harmless — happens when Metro is killed without a TTY (§2.1) |
| SQL Server connection refused | `docker restart sqlserver` (or the container you're using); wait 30 s |
| App white screen | `adb logcat -s ReactNativeJS:E` — inspect JS errors |
| Stale app behavior | Stale embedded bundle present → DELETE it and reinstall (§8) |
| Gradle build fails | `cd InternApp/android && ./gradlew clean && ./gradlew assembleDebug` |
| LogBox overlay swallows taps | Tap the "!" bubble once to dismiss |

---

## 13. Log File Locations

| Service | Log File |
|---------|----------|
| Backend API | `/home/taha/Documents/pia-interns-app/backend/intern-api.log` |
| Metro Bundler | `/home/taha/Documents/pia-interns-app/metro.log` |
| Emulator | `/tmp/emulator.log` |
| RN JS errors | `adb logcat -s ReactNativeJS:E` |

---

## 14. Shutdown All Services

```bash
pkill -f "react-native start"
pkill -f "dotnet run"
adb emu kill
docker stop sqlserver
```

---

**Last Updated**: 2026-09-24 · **Version**: 1.1 · **Compatible**: .NET 8, React Native 0.86, Node 22.11+, Android SDK 34

> **1.1 changes**: backend start now sets `ASPNETCORE_ENVIRONMENT=Development` + `ConnectionStrings__DefaultConnection` (fail-closed startup); fixed the invalid `dotnet clean --no-build`; ready-check uses port 5000 instead of a 401 endpoint; `adb reverse` now required for emulator **and** physical USB phones; added docker-group permission note, DB-create guard before seeding, and the slow-first-build warning.
