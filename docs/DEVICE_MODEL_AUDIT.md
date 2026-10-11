# AUDIT-DEV-01 — Device binding model audit

## 1. Is there a `DeviceBinding` table? Schema?
- **Finding:** No `DeviceBinding` entity class or `DbSet<DeviceBinding>` found in the codebase.
- **Evidence:**
  - `grep -rn "DeviceBinding"` (excluding bin/obj): only `backend/InternSystem.Core/Entities/ActivityLog.cs:63` references `DeviceBindingReset` enum member (activity type). No class/entity named `DeviceBinding`.
  - No `class DeviceBinding` in `backend/InternSystem.Core/Entities/`.
  - No `DbSet<DeviceBinding>` in `AppDbContext` (not found via search).
- **Conclusion:** No `DeviceBinding` table exists in the domain model/schema.

## 2. Is it one row per account, per active session, or per device ever seen?
- **Finding:** Device state is stored on the `User` entity (single record per account), not in a separate table. The fields tracked are: `DeviceIdHash`, `DeviceBoundAt`, `DeviceLabel`, plus session token fields (`RefreshToken`, `RefreshTokenExpiry`, `TokenVersion`).
- **Evidence:**
  - `backend/InternSystem.Core/Entities/User.cs:18-34`: `public string? DeviceIdHash { get; set; }`, `public DateTime? DeviceBoundAt { get; set; }`, `public string? DeviceLabel { get; set; }`, `public string? RefreshToken { get; set; }`, `public DateTime? RefreshTokenExpiry { get; set; }`, `public int TokenVersion { get; set; }`.
- **Cardinality:** One device-binding record per account (per User). An active session is represented by non-expired `RefreshToken`; device binding stores the last bound device hash/label. No separate table tracks multiple devices per account.
- **Conclusion:** Per-account (not per active session, not per device-ever-seen as multiple rows).

## 3. Where are device IDs recorded?
- **Finding:** Device identifiers are provided by client on login, hashed server-side, and stored on `User`. Only `AuthController` reads/writes device ID on login; no other controller updates device binding.
- **Evidence:**
  - `backend/InternSystem.API/Controllers/AuthController.cs:66,74-87,153,271`: 
    - Reads `req.DeviceId` from `LoginRequest` (271).
    - Hashes via `DeviceHash(deviceId)` (line ~81-87) and stores on `user.DeviceIdHash`, sets `user.DeviceBoundAt`, `user.DeviceLabel`.
    - Returns masked hash in response (153).
- **Other places referencing device ID/hash:** `ActivityDevice` (backend/InternSystem.API/Security/ActivityDevice.cs) reads `user.DeviceIdHash` for activity summary/metadata; no writes.
- **Controllers that read/write device identifiers:** Only `AuthController` (login flow) writes; no other controller reads/writes raw device IDs. Interns may use device on login (stored on User).
- **Conclusion:** Device ID recorded only at login in `AuthController` and persisted on `User.DeviceIdHash`.

## 4. What does "bound" mean in the code?
- **Finding:** "Bound" means the account's `DeviceIdHash` is set to the last device used; for interns, there is an active-session/device mismatch guard. If an intern is currently logged in (has non-expired `RefreshToken`) and attempts to login from a different device ID than stored, login is rejected with `ALREADY_LOGGED_IN_ELSEWHERE` (403).
- **Evidence:**
  - `backend/InternSystem.API/Controllers/AuthController.cs:69-93`: 
    - `hasActiveSession = !string.IsNullOrWhiteSpace(user.RefreshToken) && user.RefreshTokenExpiry.HasValue && user.RefreshTokenExpiry > DateTime.Now`
    - If `hasActiveSession && user.DeviceIdHash != null && !string.Equals(user.DeviceIdHash, hash, StringComparison.Ordinal)`: returns 403 with code `ALREADY_LOGGED_IN_ELSEWHERE` and message referencing `user.DeviceLabel` or "another device".
    - On successful login (or when deviceId provided), sets `user.DeviceIdHash = hash; user.DeviceBoundAt = DateTime.Now; user.DeviceLabel = ...`
- **Rejection path:** Intern login while another device holds live session and device hash differs → 403 ALREADY_LOGGED_IN_ELSEWHERE. Non-interns (Mentor/Admin) are not subject to this "one active login per intern" device-mismatch block.
- **Conclusion:** "Bound" = account is associated with the last device ID hash used; for interns, binding is enforced so that a different device cannot login while another active session exists.

## 5. Does the code enforce single-session?
- **Finding:** 
  - **Interns:** Enforced "one active login" at login time: if current session is active on a different device, new login from different device is blocked (403 ALREADY_LOGGED_IN_ELSEWHERE). Login from same device is allowed (updates binding/tokens). Logout clears `RefreshToken`/`RefreshTokenExpiry` and increments `TokenVersion` (revokes tokens). Change password also increments `TokenVersion` to revoke outstanding tokens.
  - **Mentors/Admins:** No device-mismatch block based on active session; login issues new refresh/access tokens (overwriting previous refresh token). That effectively terminates the previous session's ability to refresh (old refresh token invalid after new login) but does not explicitly block concurrent logins in the same way as interns.
- **Evidence:**
  - Login: `AuthController.cs:69-93` (intern device-mismatch block). `user.RefreshToken = refreshToken; user.RefreshTokenExpiry = DateTime.Now.Add(SessionLifetime);` on successful login (line ~109-111) — overwrites any existing refresh token.
  - Logout: `AuthController.cs:236-247` — clears refresh token/expiry, `user.TokenVersion++` (revokes access tokens).
  - Change password: `AuthController.cs:185-188` — `user.TokenVersion++`.
  - Token revocation check: `Program.cs:120-145` validates `tvn` claim against `user.TokenVersion` (returns 401/Fail if mismatch).
- **Conclusion:** 
  - Interns: single-session enforced (blocked if different device tries to login while active session exists). Same device can re-login.
  - Non-interns (Mentor/Admin): login overwrites refresh token (previous session cannot refresh) — effectively single-session at refresh level, but no explicit "already logged in elsewhere" rejection. Outstanding access tokens remain valid until they expire unless TokenVersion is bumped (logout/change password bump it).
