# PIA Intern System — Windows Launch Guide (Fresh Start)

> **Purpose**: Step-by-step commands to launch the entire PIA Intern System on **Windows** from a completely dead state — cleared caches, fresh database seed, all services running.
>
> **Linux users**: see `docs/LAUNCH_GUIDE_LINUX.md`. The app/backend code is identical; only the tooling differs.

**Prerequisites**: Windows 10/11, Node.js ≥ 22.11, .NET 8 SDK, Android Studio (or `adb` in PATH) + **either** an emulator AVD (the team AVD is `Pixel7`) **or a physical Android phone with USB debugging**, and SQL Server Express (`.\SQLEXPRESS`, the project's official Windows dev instance) — or Docker Desktop with the mssql image as a fallback. All commands below are **PowerShell**.

---

## 0. Quick Reference — Demo Credentials

> All credentials (SQL password, JWT key, demo logins) are centralized in
> **`docs/DEVELOPMENT_CREDENTIALS.md`** (gitignored). Do not paste them into this file.
>
> On Windows the **default** SQL connection uses **Windows authentication** against
> `.\SQLEXPRESS` (`DEVELOPMENT_CREDENTIALS.md` §2) — no password needed. `appsettings.json`
> intentionally contains **no** connection string: the API fails closed unless you set the
> `ConnectionStrings__DefaultConnection` environment variable (§5).

Demo logins (seeded): admin `admin` / `Admin@123` · mentor `Aamir_ERP_001` / `Mentor@123` · intern `shahzaib.ERP.001` / `Test@123`.

---

## 1. Kill All Running Processes (Clean Slate)

```powershell
# Kill anything on the app's ports (Metro 8081, backend 5000) and adb
Get-NetTCPConnection -LocalPort 8081,5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
adb emu kill 2>$null          # if an emulator is running
adb kill-server 2>$null

# Verify the ports are free
Get-NetTCPConnection -LocalPort 8081,5000 -State Listen -ErrorAction SilentlyContinue
```

> If `Stop-Process` fails ("process not found") for a node/dotnet process, use `taskkill /F /PID <id>` or `taskkill /F /IM node.exe` (kills all node) as a last resort.

---

## 2. Clear All Caches

### 2.1 React Native / Metro / Node Caches
```powershell
cd C:\path\to\pia-interns-app\InternApp

# Clear Metro's transform cache (start, wait, kill)
Start-Process -FilePath "npx.cmd" -ArgumentList "react-native","start","--reset-cache","--port","8081" -NoNewWindow
Start-Sleep 5
Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# npm cache (only if dependency issues)
npm cache clean --force 2>$null
# rm on Windows: Remove-Item -Recurse -Force node_modules, package-lock.json ; npm install

# Gradle clean
cd C:\path\to\pia-interns-app\InternApp\android
.\gradlew.bat clean --no-daemon 2>$null
cd C:\path\to\pia-interns-app\InternApp
```

### 2.2 Android / Emulator Caches
```powershell
adb emu kill 2>$null
# Wipe the AVD data disk (adjust for your AVD name):
#   Remove-Item -Recurse -Force $env:USERPROFILE\.android\avd\Pixel7.avd\*.lock, $env:USERPROFILE\.android\avd\Pixel7.avd\*.qcow2
adb kill-server
adb start-server
```

### 2.3 Backend / .NET Caches
> `dotnet clean --no-build` is **not** valid PowerShell either (`--no-build` isn't a `clean` switch → MSB1001). Just delete `bin`/`obj`:

```powershell
cd C:\path\to\pia-interns-app\backend\InternSystem.API

Remove-Item -Recurse -Force bin, obj -ErrorAction SilentlyContinue
dotnet nuget locals all --clear 2>$null
```

---

## 3. SQL Server (Express — official dev instance)

```powershell
# Verify SQL Server Express is reachable with Windows auth
sqlcmd -S .\SQLEXPRESS -E -Q "SELECT @@VERSION"
```

- **Not installed?** Install SQL Server Express (with SQL tools). If your instance name differs, replace `.\SQLEXPRESS` everywhere.
- **No Windows SQL server?** Fall back to the Docker route — identical to the Linux guide (`mcr.microsoft.com/mssql/server:2022-latest`, SA auth, port 1433; `sqlcmd -S localhost,1433 -U sa -P <pwd> -C`).

---

## 4. Fresh Database Seed (Full Data)

> Seed creates 12 departments, 72 mentors, 240 interns, 27 shifts, all tables populated.
> **On a brand-new DB `InternSystemDB` doesn't exist** — `full_seed.sql` does `USE InternSystemDB`, so create it first:

```powershell
cd C:\path\to\pia-interns-app

sqlcmd -S .\SQLEXPRESS -E -Q "IF DB_ID('InternSystemDB') IS NULL CREATE DATABASE InternSystemDB;"

# Run the idempotent full seed SQL
sqlcmd -S .\SQLEXPRESS -E -d InternSystemDB -i "backend\InternSystem.API\Seed\full_seed.sql"

# Verify seed counts
sqlcmd -S .\SQLEXPRESS -E -d InternSystemDB -Q "
SELECT 'Departments' t, COUNT(*) c FROM dbo.Departments
UNION ALL SELECT 'Interns', COUNT(*) FROM dbo.Interns
UNION ALL SELECT 'Mentors', COUNT(*) FROM dbo.Mentors
UNION ALL SELECT 'Users', COUNT(*) FROM dbo.Users
UNION ALL SELECT 'Shifts', COUNT(*) FROM dbo.Shifts
ORDER BY t;"
```

**Expected approximate counts** (fresh seed): Departments 12 · Mentors 72 · Interns 240 · Users 313 · Shifts 27 · Attendances 6000+ · Tasks 500+ · DocumentUploads 200+ · GatePasses 100+ · Certificates 50+ · ActivityLogs 1000+.

---

## 5. Build & Start Backend API (Terminal 1)

### 5.0 Face models (REQUIRED — not in git)

The ONNX weights are **not committed** (`facenet.onnx` is 248 MB, over GitHub's
100 MB limit). On a fresh clone, face enrollment and face-attendance
verification are **silently unavailable** — the API still starts, but logs:

```
FaceNet ONNX model NOT found at ...\Models\AI\facenet.onnx — face verification will be unavailable.
```

Fetch them once per machine before starting the API:

```powershell
New-Item -ItemType Directory -Force backend\InternSystem.API\Models\AI | Out-Null
Set-Location backend\InternSystem.API\Models\AI

# <SOURCE_URL> — see docs/DEVELOPMENT_CREDENTIALS.md §5 for the real locations
curl.exe -L -o facenet.onnx   "<SOURCE_URL>\facenet.onnx"     # 248 MB, ArcFace recognition
curl.exe -L -o ultraface.onnx "<SOURCE_URL>\ultraface.onnx"   # 1.2 MB, face detection
curl.exe -L -o antispoof.onnx "<SOURCE_URL>\antispoof.onnx"   # 1.7 MB, liveness / anti-spoofing

Get-ChildItem *.onnx    # verify all three exist and are non-zero
```

### 5.1 Build & start

```powershell
cd C:\path\to\pia-interns-app\backend\InternSystem.API

# Restore (slow the first time — NuGet re-downloads ~3 min) and build
dotnet restore
dotnet build --no-restore -c Release

# REQUIRED env vars (the API FAILS CLOSED without them):
#   ASPNETCORE_ENVIRONMENT=Development   -> enables dev logging config
#   Jwt__Key                              -> signing key (DEVELOPMENT_CREDENTIALS.md §4)
#   ConnectionStrings__DefaultConnection -> Windows-auth string (DEVELOPMENT_CREDENTIALS.md §3)
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:Jwt__Key = "<see docs/DEVELOPMENT_CREDENTIALS.md §4 — signing key>"
$env:ConnectionStrings__DefaultConnection = "Server=.\SQLEXPRESS;Database=InternSystemDB;Trusted_Connection=True;TrustServerCertificate=True;"

# Run (blocking — keep this terminal open; or open a fresh terminal and re-run the 3 $env lines first)
dotnet run --no-build -c Release
```

- Expected to finish with `Now listening on: http://0.0.0.0:5000`.
- MVC/EF migrations auto-apply at startup ("No migrations were applied. The database is already up to date."). Unauthenticated API calls return **401 (expected)**.
- The two classic startup crashes and their cause:
  - `ConnectionStrings:DefaultConnection is not configured...` → the conn-string env var is missing.
  - `Jwt:Key is not configured or too short...` → `Jwt__Key` is missing or under 32 bytes.
- Ready-check from a second terminal: `Test-NetConnection localhost -Port 5000 -InformationLevel Quiet` (or `Get-NetTCPConnection -LocalPort 5000 -State Listen`). Don't `curl` `/api/admin/settings` — it returns 401 unauthenticated.

---

## 6. Start Metro Bundler (JS Bundle Server) (Terminal 2)

```powershell
cd C:\path\to\pia-interns-app\InternApp

npx react-native start --port 8081 --reset-cache   # blocking — keep this terminal open
```

Check it's up: `curl.exe -s http://localhost:8081/status` → `packager-status:running`.

> **Critical**: Do NOT embed a stale JS bundle at `android\app\src\main\assets\index.android.bundle`. The app runs against Metro in debug mode; a stale bundle runs obsolete JS.
>
> **First load after `--reset-cache` is slow**: the first bundle request recompiles ~2600+ modules (30–60 s, CPU pegged) — normal.

---

## 7. Launch the Device (Emulator AVD *or* physical USB phone)

The app hard-codes `API_BASE_URL = http://localhost:5000/api` and Metro serves the JS bundle at `http://localhost:8081`. On a phone/emulator `localhost` means *the device itself*, so you **must** forward both ports back to the dev machine with `adb reverse` — for the emulator **and** a physical phone alike. Skipping this is the #1 cause of "app loads but can't reach the API / dashboard errors".

### 7a. Physical USB phone
```powershell
adb devices                  # expect your phone as "device" (NOT "unauthorized")
# If "unauthorized": accept the RSA "Allow USB debugging" prompt on the phone; if it never
# appears, unplug/re-plug USB and toggle Developer options > USB debugging.
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
adb reverse --list           # expect both lines
```

### 7b. Android Studio emulator
```powershell
# Boot an AVD (create one in Android Studio Device Manager if missing; the team AVD is Pixel7)
emulator -avd Pixel7 -no-snapshot-load -no-boot-anim
# wait for boot: adb wait-for-device ; then poll `adb shell getprop sys.boot_completed`
adb devices                  # expect: emulator-5554    device
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
```

---

## 8. Install & Launch App on the Device

```powershell
cd C:\path\to\pia-interns-app\InternApp\android

# Build debug APK
# FIRST build after `.\gradlew.bat clean` is SLOW (10–15 min): native C++
# (vision-camera, nitro modules, rnscreens) compiles for 4 ABIs. Don't interrupt — it only
# LOOKS stuck. The debug APK is ~280 MB.
.\gradlew.bat assembleDebug

adb install -r app\build\outputs\apk\debug\app-debug.apk

# Launch (either works)
adb shell monkey -p com.internapp -c android.intent.category.LAUNCHER 1
# adb shell am start -n com.internapp/.MainActivity
Start-Sleep 8

# Verify no JS errors (Metro should also print a "Running \"InternApp\"" line)
adb logcat -d -s ReactNativeJS:E 2>$null | Select-Object -Last 5
```

---

## 9. Verify All Roles (Manual Smoke Test)

- **Admin** (`admin` / `Admin@123`): Dashboard stats, Settings (grace minutes, threshold %, holidays, shifts CRUD), Transfers, Departments, Interns, Notifications.
- **Mentor** (`Aamir_ERP_001` / `Mentor@123`): Dashboard, Interns, Attendance, Tasks, Shifts, Intern Transfers.
- **Intern** (`shahzaib.ERP.001` / `Test@123`): Dashboard, Attendance ("Mark Now"), Tasks, Notifications, Certificate.

If a persisted session was carried over from an older DB, the app may auto-logout (stale refresh token after reseed) — just log in again with the demo creds.

---

## 10. Run E2E Tests (Detox)

```powershell
cd C:\path\to\pia-interns-app\InternApp
npm install -D detox
npx detox build --configuration android.emu.debug
npx detox test --configuration android.emu.debug
```

---

## 11. Shutdown All Services

```powershell
Get-NetTCPConnection -LocalPort 5000,8081 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
adb emu kill 2>$null
# stop SQL (Express service) — optional: Stop-Service 'MSSQL$SQLEXPRESS'
# or if using Docker: docker stop sqlserver
```

---

## 12. Troubleshooting Quick Reference

| Issue | Fix |
|-------|-----|
| `adb devices` empty (phone plugged in) | Enable USB debugging, accept the RSA prompt, unplug/re-plug (§7a) |
| Backend exits: `ConnectionStrings:DefaultConnection is not configured` | set the env var in the same terminal before `dotnet run` (§5) |
| Backend exits: `Jwt:Key is not configured or too short` | set `$env:Jwt__Key` before `dotnet run` (§5) |
| `dotnet clean --no-build` → MSB1001 | `--no-build` isn't a clean switch; use `Remove-Item -Recurse bin, obj` (§2.3) |
| App shows black/error but backend + Metro are up | `adb reverse --list` must show BOTH `tcp:8081` and `tcp:5000` (§7) |
| First `.\gradlew.bat assembleDebug` seems stuck | normal — native C++ for 4 ABIs, 10–15 min, ends `BUILD SUCCESSFUL` (§8) |
| `npx react-native start` prints `setRawMode EIO` | harmless — Metro killed without a TTY (§2.1) |
| `sqlcmd -S .\SQLEXPRESS -E` fails | instance name differs or SQL Express not installed → check §3 fallback (Docker) |
| Metro `UnableToResolve` | `cd InternApp && npx react-native start --reset-cache` |
| App white screen | `adb logcat -s ReactNativeJS:E` — inspect JS errors |
| Stale app behavior | Stale embedded bundle present → DELETE it and reinstall (§8) |
| Gradle build fails | `cd InternApp\android && .\gradlew.bat clean && .\gradlew.bat assembleDebug` |
| LogBox overlay swallows taps | Tap the "!" bubble once to dismiss |

---

**Last Updated**: 2026-09-24 · **Version**: 1.0 · **Compatible**: .NET 8, React Native 0.86, Node 22.11+, Android SDK 34 · PowerShell