# Face Recognition & System Guide — Intern Attendance Portal

> A complete, self-contained reference for understanding, reproducing, and hardening the
> face‑recognition pipeline and the surrounding Intern Attendance system.
>
> **Scope:** Face‑focused with integration points into auth, RBAC, geofencing, email, and
> the mobile/backend bridge. The non‑face parts of the system are summarized where they
> touch the face flow.
>
> **Audience:** A new engineer who must rebuild this on a fresh project, *and* a reviewer
> who must judge how secure the owner‑identification actually is.

---

## 1. Executive overview (non‑technical)

The Intern Attendance Portal lets an intern **check in / check out** from an Android app. To
prevent someone else from marking attendance for an intern, the app proves the intern is
**physically present and is the right person** using four stacked defenses:

1. **Active liveness (on the phone).** The app issues a random movement challenge — *blink*,
   *turn left*, *turn right*, or *smile* — and watches the live camera for that motion. A
   static photo held up to the camera cannot perform the motion, so it is rejected on the
   device.
2. **Passive anti‑spoofing (on the server).** The uploaded photo is run through a small AI
   model (MiniFASNetV2) that decides whether the image is a *real 3D human face* or a *printed
   photo / phone screen replay*.
3. **Face matching (on the server).** The live face is converted into a 512‑number "face
   signature" (embedding) with ArcFace, and compared to the signature enrolled at registration.
   If they are close enough (cosine distance ≤ 0.58), it is the same person.
4. **GPS geofence (on the server).** The phone's location must be within the intern's
   department radius (default 50 m).

All four must pass for attendance to be accepted. The raw photo is **never stored** — only the
512‑number signature is saved, and only at enrollment time.

---

## 2. System architecture

| Layer | Technology |
|---|---|
| Mobile | React Native 0.75.4, `@react-native-vision-camera`, `@react-native-ml-kit/face-detection`, `axios`, `react-native-geolocation-service`, `react-native-image-picker` |
| Backend | ASP.NET Core 8 (minimal‑style controllers), EF Core 8 |
| Database | SQL Server (runs in Docker on Linux during dev) |
| AI | `Microsoft.ML.OnnxRuntime` 1.x, `SixLabors.ImageSharp` for image decode/preprocess |
| Auth | JWT (HMAC‑SHA256) in `Authorization: Bearer`, BCrypt password hashes |
| Roles | `Admin`, `Mentor`, `Intern` (RBAC via `[Authorize]` + intern‑id claims) |
| Email | Gmail SMTP (`smtp.gmail.com:587`) for credential dispatch |
| Models | `Models/AI/{ultraface,facenet,antispoof}.onnx` (ArcFace / UltraFace / MiniFASNetV2) |

### Request flow for a check‑in

```
[Phone] Vision Camera takePhoto()
   └─ file:// temp capture
        └─ imageUriToBase64()  ──► "data:image/jpeg;base64,...."
             └─ ML Kit detectFaces() + evaluateLivenessChallenge()
                  └─ POST /api/attendance/mark { type, lat, lng, faceDescriptor(base64), livenessChallenge, livenessPassed:true }
                       │
                       ▼  [Backend AttendanceService.MarkAttendanceAsync]
                       ├─ 1. Load intern (+ shift, department)
                       ├─ 2. if (!req.LivenessPassed) reject
                       ├─ 3. FaceRecognitionService.CheckAntiSpoof(base64)   → MiniFASNetV2
                       ├─ 4. ExtractEmbedding(base64) vs stored embedding   → ArcFace + cosine Compare
                       ├─ 5. VerifyGeo(lat,lng, dept, radius)               → Haversine
                       └─ 6. Write AttendanceRecord (CheckIn*/CheckOut*)
```

Key source files:
- `backend/AttendanceAPI/Services/FaceRecognitionService.cs` — the 3‑model ONNX engine.
- `backend/AttendanceAPI/Services/AttendanceService.cs` — `MarkAttendanceAsync` orchestration.
- `backend/AttendanceAPI/Controllers/AttendanceController.cs` — `POST /api/attendance/mark`, `POST /api/intern/face/register`, `GET /api/intern/face/descriptor`.
- `backend/AttendanceAPI/DTOs/Dtos.cs:126` — `MarkAttendanceRequest`.
- `mobile/src/screens/intern/MarkAttendanceScreen.js` — capture + liveness + GPS flow.
- `mobile/src/utils/faceUtils.js` — ML Kit liveness + base64 conversion.

---

## 3. Face‑recognition design & decisions

### Why do the heavy models run on the server, not the phone?
The phone only does **fast, cheap** work: detect a face (ML Kit) and check the motion challenge.
The three ONNX models (face detector, anti‑spoof, recognizer) run on .NET via ONNX Runtime.
**Rationale in the code:** the mobile app sends the *full photo* as base64 and the server
re‑derives the embedding every time (`ExtractEmbedding(req.FaceDescriptor)` in
`AttendanceService.cs:65`). This means a malicious client **cannot pre‑compute or tamper with
the embedding pipeline** — the server always re‑extracts from the raw image. That is a good
design property (see the security caveat in §6 about the one exception).

### Why send a base64 JPEG and not a local embedding?
`faceUtils.js` deliberately does **not** produce embeddings on the device. The phone has no
model; it forwards the image so the server (which owns the trusted models) does recognition.
This keeps the secret model weights server‑side and makes the verification path single‑sourced.

### Threshold rationale
ArcFace is an *angular* recognizer. The code comment (`FaceRecognitionService.cs:22‑24`)
summarizes the empirical separation:
- Genuine (same person): cosine distance ≈ **0.05 – 0.50** (similarity ≥ 0.50)
- Impostor (different person): cosine distance ≈ **0.75 – 1.20** (similarity ≤ 0.25)

`DefaultThreshold = 0.58` sits in the wide gap between these two clusters, so it rejects
impostors while accepting the same person under normal lighting. MiniFASNetV2 uses
`DefaultSpoofThreshold = 0.60`.

---

## 4. Per‑model technical specification

All three models are loaded from `Models/AI/` in `FaceRecognitionService` constructor
(`FaceRecognitionService.cs:31‑90`). Each is wrapped with `GraphOptimizationLevel =
ORT_ENABLE_ALL`. If a file is missing, that session stays `null` and the corresponding check
**silently passes** (see §6 — this is why the placeholder `.onnx` files are dangerous).

### 4.1 UltraFace RFB‑320 — face detector (preprocessor for the other two)

| Property | Value |
|---|---|
| Purpose | Locate the face, crop with 15% padding, feed downstream models |
| Input tensor | `1 × 3 × 240 × 320` (RGB, CHW) |
| Preprocessing | `(pixel − 127.0) / 128.0` per channel (`FaceRecognitionService.cs:293‑295`) |
| Resize | image → `320×240` (`FaceRecognitionService.cs:284`) |
| Outputs | `scores` shape `[1, 4420, 2]`, `boxes` shape `[1, 4420, 4]` (normalized 0..1) |
| Confidence threshold | `0.7` (`FaceRecognitionService.cs:307`) |
| Post‑process | pick highest‑score box; map to image size; expand by 15% (`FaceRecognitionService.cs:320‑339`) |
| Used by | `DetectFaceBoundingBox` — crops the face for anti‑spoof and recognition |

If UltraFace is absent, `DetectFaceBoundingBox` returns `null` and the downstream models use a
center crop (`FaceRecognitionService.cs:233‑237, 132‑147`).

### 4.2 ArcFace / "FaceNet" — 512‑D recognizer

| Property | Value |
|---|---|
| Purpose | Produce the identity embedding |
| Input tensor | `1 × 3 × H × W`, where H/W are read from the model (code defaults `112×112`, supports `160×160`) |
| Preprocessing | `(pixel − 127.5) / 127.5` → range `[-1, 1]` (`FaceRecognitionService.cs:255‑257`) |
| Resize mode | `ResizeMode.Crop` to square (`FaceRecognitionService.cs:240‑244`) |
| Output | `1 × 512` raw vector, then **L2‑normalized** (`NormalizeL2`, `FaceRecognitionService.cs:376‑386`) |
| Stored as | JSON float array in `Users.FaceDescriptor` (`AttendanceController.cs:131‑132`) |

**Comparison (`Compare`, `FaceRecognitionService.cs:353‑374`):**
```
similarity = dot(a, b) / (||a|| * ||b||)     // vectors are already L2‑normalized
distance   = 1.0 − similarity
isMatch    = distance <= 0.58
```

### 4.3 MiniFASNetV2 — passive anti‑spoofing

| Property | Value |
|---|---|
| Purpose | Detect printed‑photo / screen‑replay attacks |
| Input tensor | `1 × 3 × 80 × 80` (**BGR**) (`FaceRecognitionService.cs:152‑162`) |
| Preprocessing (as coded) | **raw 0–255** pixel values, no `/255`; BGR channel order |
| Resize | crop face region (2× box) then `Resize(80,80)` (`FaceRecognitionService.cs:150`) |
| Output | logits; code applies softmax and reads **index 1** as `realScore` (`FaceRecognitionService.cs:169‑174`) |
| Decision | `realScore >= 0.60` → real (`FaceRecognitionService.cs:176`) |

> ⚠️ **Contract caveat (important — see §6 and §7):** the code assumes a **2‑class** model
> where `index 1 == real`. The most readily available MiniFASNetV2 export is **3‑class**
> `[live, print, replay]` and expects **`pixel/255`** input. They do **not** match as‑is.

---

## 5. Data flow & "how do we know it's the real person?"

### How the picture reaches the model, and where it is stored

1. **On the phone** (`MarkAttendanceScreen.js`):
   - `cameraRef.current.takePhoto()` writes a frame to a **temporary file** (Vision Camera cache).
     The app never copies it into app documents or the gallery (gallery is allowed *only* during
     enrollment via `pickFromGallery`).
   - `imageUriToBase64(imagePath)` reads that temp file and returns a **base64 Data URL** held in
     memory (`faceUtils.js:96‑114`).
   - That base64 is POSTed as `faceDescriptor` (`MarkAttendanceScreen.js:213`).
2. **On the server**:
   - `MarkAttendanceAsync` decodes the base64 and runs UltraFace → crop, MiniFASNetV2 → anti‑spoof,
     ArcFace → embedding.
   - **The raw image is never written to disk or DB.** Only the resulting 512‑number embedding is
     stored — and only at *registration* (`AttendanceController.cs:131‑132`).
   - During verification the live image is re‑embedded and immediately discarded.

**Conclusion:** the captured photo exists only as (a) a device temp file and (b) in‑memory base64
during one request. Only the embedding vector is persisted.

### How "real person" is computed — the four gates

`AttendanceService.MarkAttendanceAsync` (`AttendanceService.cs:23‑94`):

| # | Gate | Where | Pass condition |
|---|---|---|---|
| 1 | Active liveness | client‑asserted | `req.LivenessPassed == true` (`AttendanceService.cs:45`) |
| 2 | Passive anti‑spoof | server MiniFASNetV2 | `realScore >= 0.60` (`AttendanceService.cs:52‑57`) |
| 3 | Face match | server ArcFace | cosine distance ≤ 0.58 (`AttendanceService.cs:65‑82`) |
| 4 | GPS geofence | server Haversine | distance ≤ department radius (`AttendanceService.cs:85‑94`) |

Registration (`POST /api/intern/face/register`) separately requires an admin‑created intern and
stores the embedding (`AttendanceController.cs:122‑151`). An intern with no `FaceDescriptor`
cannot mark attendance (`AttendanceService.cs:41‑42`).

---

## 6. Security caveats (read before trusting this in production)

These are concrete, code‑grounded weaknesses. They are *not* hypothetical.

### 6.1 Liveness is client‑asserted, not server‑verified
The backend only checks the boolean `req.LivenessPassed` (`AttendanceService.cs:45`). The
legitimate app only reaches the API after passing the on‑device ML Kit challenge
(`MarkAttendanceScreen.js:215` hardcodes `livenessPassed: true` once the app proceeds). **A
modified or custom client can simply send `livenessPassed: true`** and skip the motion check
entirely. The challenge stops casual photo attacks from honest devices, but does **not** stop a
determined attacker with their own client.

### 6.2 The anti‑spoof models are placeholder stubs in this repo
`backend/AttendanceAPI/Models/AI/{ultraface,facenet,antispoof}.onnx` are **132‑byte** files whose
content begins with the text `version `. They are *not* valid ONNX models. Because the loader
treats a missing/invalid file as "session = null", `CheckAntiSpoof` hits its fallback
`return (true, 1.0)` (`FaceRecognitionService.cs:125`) and **anti‑spoofing is effectively
disabled**. The same applies to UltraFace (falls back to center crop) and ArcFace (throws
`InvalidOperationException("Face recognition ONNX model is not loaded")`).

### 6.3 A stolen embedding bypasses anti‑spoof *and* re‑extraction
`MarkAttendanceRequest.FaceDescriptor` ("Base64 image **or JSON float array**",
`Dtos.cs:131`). Both `CheckAntiSpoof` and `ExtractEmbedding` **short‑circuit when the payload
starts with `[`**:
- `CheckAntiSpoof`: `if (trimmed.StartsWith("[")) return (true, 1.0);` (`FaceRecognitionService.cs:102`)
- `ExtractEmbedding`: parses the JSON array directly, skipping image decode (`FaceRecognitionService.cs:197‑208`)

So an attacker who obtains a victim's stored embedding (e.g. via `GET /api/intern/face/descriptor`
or a DB leak) can POST that JSON with `livenessPassed: true` and pass gates 1–3, leaving only the
GPS check. **This is the most serious issue** for "unauthorized people getting access."

### 6.4 Single frame, no averaging
Enrollment and verification use one image/frame. Lighting, blur, or angle variance can shift the
score; there is no multi‑frame consensus.

### 6.5 Transport
In dev, photos travel over plain HTTP via `adb reverse tcp:5000 tcp:5000`
(`mobile/src/config.js:1‑3`). Production must use HTTPS + certificate pinning.

### 6.6 Throttling
Failed attempts are logged (`[Audit Log] …`) but there is no rate‑limit / lockout, making
threshold‑probing feasible.

---

## 7. Recreating the models (full reproducible steps)

> The repo's `.onnx` files are invalid stubs. Obtain the real models before the pipeline works.

### 7.1 UltraFace RFB‑320 (drop‑in — matches code exactly)
Source: Linzaer Ultra‑Light‑Fast‑Generic‑Face‑Detector‑1MB (the ONNX Model Zoo original).

```bash
mkdir -p backend/AttendanceAPI/Models/AI
cd backend/AttendanceAPI/Models/AI
curl -L -o ultraface.onnx \
  https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/master/models/RFB-320/version-RFB-320.onnx
```
Verifies against the code: input `320×240`, mean `127`, scale `1/128`, outputs scores/boxes.

### 7.2 ArcFace 512‑D (drop‑in — matches code exactly)
Source: `garavv/arcface-onnx` on Hugging Face (InsightFace‑family, 112×112, 512‑D).

```bash
cd backend/AttendanceAPI/Models/AI
curl -L -o facenet.onnx \
  "https://huggingface.co/garavv/arcface-onnx/resolve/main/arc.onnx"
```
Verifies against the code: input `112×112`, `(pixel−127.5)/127.5`, L2‑normalized 512‑D output.
(Code auto‑reads H/W from the model, so a 160×160 variant also works.)

### 7.3 MiniFASNetV2 — ⚠️ contract mismatch, choose one path

**The problem:** the code (`FaceRecognitionService.cs:159‑162, 174`) expects:
- **BGR**, **raw 0–255** input (no `/255`),
- **2‑class** output where `index 1 == real`.

The convenient Hugging Face export (`garciafido/minifasnet-v2-anti-spoofing-onnx`) is **3‑class**
`[live, print, replay]` and expects **`pixel/255`** input. It will **not** produce correct scores
as‑is. Pick one of the two paths below.

#### Path A — Drop‑in (recommended for fidelity): use the original 2‑class model
Obtain `2.7_80x80_MiniFASNetV2.pth` from `minivision-ai/Silent-Face-Anti-Spoofing`, then convert
to ONNX keeping the **2‑class** head. The code's `realScore = exp[1]/sum` matches minivision's
own `test.py` convention (index 1 == real).

```python
# requires: git clone https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
#           pip install torch onnx
import torch, onnx
from model_lib.MiniFASNet import MiniFASNetV2  # from the cloned repo

model = MiniFASNetV2(num_classes=2, input_size=(80, 80),
                    conv6_kernel=(3, 3)).to("cpu")
model.load_state_dict(torch.load("resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth",
                                  map_location="cpu"))
model.eval()
dummy = torch.randn(1, 3, 80, 80)
torch.onnx.export(model, dummy, "antispoof.onnx",
                  input_names=["input"], output_names=["output"],
                  opset_version=11, dynamic_axes={"input": {0: "batch"}})
print("wrote antispoof.onnx (2-class, BGR, raw 0-255)")
```
Drop the resulting `antispoof.onnx` into `Models/AI/`. **No code change needed.**

#### Path B — Use the 3‑class HF model (faster to fetch, needs 2 small code tweaks)
Download:
```bash
cd backend/AttendanceAPI/Models/AI
# file name may vary; check the repo listing:
curl -L -o antispoof.onnx \
  "https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/main/minifasnet_v2.onnx"
```
Then adjust the code to the 3‑class `/255` contract in `FaceRecognitionService.cs`:

1. Preprocessing — divide by 255 (BGR order unchanged):
   ```csharp
   // was: tensor[0,0,y,x] = p.B;   (raw 0-255)
   tensor[0, 0, y, x] = p.B / 255.0f;
   tensor[0, 1, y, x] = p.G / 255.0f;
   tensor[0, 2, y, x] = p.R / 255.0f;
   ```
2. Score — real = 1 − (print + replay):
   ```csharp
   // was: double realScore = exp.Length > 1 ? (exp[1] / sum) : 0.9;
   double live = exp[0] / sum;
   double print_ = exp[1] / sum;
   double replay = exp.Length > 2 ? exp[2] / sum : 0.0;
   double realScore = 1.0 - (print_ + replay);
   ```

> For maximum accuracy and to close the §6.3 bypass, prefer **Path A** and also apply the
> hardening in §8.

---

## 8. Hardening path — precise owner identification, block unauthorized access

To make "only the account owner gets in" actually true, apply in priority order:

1. **Remove the `[` short‑circuit (critical).** In `CheckAntiSpoof` and `ExtractEmbedding`
   (`FaceRecognitionService.cs:102, 197`), reject any payload that is *not* a fresh base64 image.
   Never accept a pre‑computed embedding over the wire — re‑extract from the image every time.
   This alone closes the §6.3 stolen‑embedding attack.
2. **Enforce liveness server‑side.** Have the server *issue* the random challenge (`blink` /
   `turn_left` / `turn_right` / `smile`); the client returns the two challenge frames (or a short
   clip); the server verifies the motion itself (ML Kit‑equivalent or a liveness ONNX). Never trust
   a client boolean.
3. **Use real, mandatory anti‑spoofing** (§7.3) and keep it non‑bypassable. Consider combining
   multiple presentation‑attack cues for higher assurance.
4. **Strengthen the matcher:**
   - Upgrade to a higher‑capacity ArcFace backbone (InsightFace `buffalo_l` / `w600k_r50`).
   - **Tune `0.58` against a validation set** (choose threshold for target FAR/FRR) instead of a
     fixed constant.
   - Enroll and verify from **multiple averaged frames** to reduce noise.
   - For high security, run **1:N identification** against the whole intern population (not just
     1:1 against the claimed user) to stop photo/credential sharing.
5. **Add a second factor.** Device attestation (Android Play Integrity / key attestation) and/or a
   PIN, so a leaked embedding alone cannot authenticate.
6. **Secure transport & ops.** HTTPS + cert pinning; rate‑limit / lockout failed attempts; keep the
   GPS geofence and shift‑time windows as mandatory gates; audit‑log and alert on repeated failures.

---

## 9. Recreating the system (backend + mobile + DB)

### 9.1 Prerequisites
- .NET 8 SDK
- Node 18+, Android SDK, an x86_64 emulator (or `adb` + a device)
- SQL Server (Docker on Linux during dev)

### 9.2 Database (SQL Server in Docker)
```bash
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=<SA_PASSWORD>" \
  -p 1433:1433 --name mssql-pkt-backup -d mcr.microsoft.com/mssql/server:2022-latest

# retrieve the SA password later if needed:
docker inspect mssql-pkt-backup --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | awk -F= '/^MSSQL_SA_PASSWORD=/{print $2}'
```
Connection string (`backend/AttendanceAPI/appsettings.json:3`) — **SQL auth on localhost**, not
Windows/`SQLEXPRESS`:
```
Server=localhost;Database=InternAttendanceDB;User Id=sa;Password=<SA_PASSWORD>;TrustServerCertificate=True;
```

### 9.3 Backend
```bash
cd backend/AttendanceAPI
dotnet restore
dotnet run --urls "http://localhost:5000"
```
- `Program.cs:95` uses `db.Database.EnsureCreated();` (changed from `Migrate()` to avoid the
  `There is already an object named 'Departments'` conflict when tables already exist).
- JWT `Key`, token `Issuer`/`Audience`, and Gmail `SmtpSettings` live in `appsettings.json`.
  Swagger is available at `http://localhost:5000/swagger`.

### 9.4 Mobile
```bash
cd mobile
npm install
# Emulator is x86_64 — the arm64-only default build crashes with
# "Native module PlatformConstants could not be found". Fix in android/gradle.properties:
#   reactNativeArchitectures=x86_64      (was arm64-v8a)
#   hermesEnabled=true
#   REACT_NATIVE_NEW_ARCHITECTURE_ENABLED=false
npx react-native run-android           # boots/installs on emulator-5554

# Let the device reach the local backend:
adb reverse tcp:5000 tcp:5000
```
- `mobile/src/config.js`: `API_BASE_URL='http://localhost:5000'`, `GEO_RADIUS_METERS=50`,
  `FACE_MATCH_THRESHOLD=0.60`, `SHIFT_1_ID=1`, `SHIFT_2_ID=2`.
- For the Android **emulator** specifically, `10.0.2.2:5000` reaches the host; for a physical
  device use `adb reverse` (already set above).

### 9.5 First‑run / accounts
- Admin creates an intern (`UserService` generates username `firstname.Mentor.Dept` or
  `firstname.PIA.###` and a random password, emails it via Gmail SMTP, sets
  `MustChangePassword`).
- Intern logs in, is forced to change password, then **registers face**
  (`POST /api/intern/face/register`) — this stores the embedding.
- Intern can then mark attendance (§5 / §2).

---

## 10. Known limitations

- **Placeholder models:** the three `.onnx` files in the repo are invalid stubs; the pipeline
  cannot run until real models are supplied (§7). With stubs, anti‑spoof silently passes and
  ArcFace throws.
- **MiniFASNetV2 contract mismatch:** the convenient 3‑class `/255` model is incompatible with the
  code's 2‑class raw‑BGR assumption (§7.3) — choose a path.
- **Client‑trusted liveness** and the **`[` embedding bypass** are the two security gaps that must
  be closed before this is safe for "owner‑only" access (§6, §8).
- **Single‑frame** enrollment/verification; no multi‑frame averaging.
- **Plain HTTP** in the documented dev setup; use HTTPS in production.
- The mobile app does **not** persist the captured photo; only the server‑side embedding is stored.
