# Replace Authentication With First-Run Local User Onboarding

## Goal

Animo should become a local-first, single-user application without login, registration, passwords, sessions, or sign-out flows. On first use, the app should show a welcoming onboarding screen where the user can enter their display name and username. Submitting this form creates the local user record that all existing and future app data belongs to.

The onboarding screen should include a graphic area. The final illustration will be provided later, so the initial implementation should use a clean placeholder.

## Background

The current app has a full authentication flow:

- Backend auth module and routes under `/api/auth/*`
- `users` table with `email` and `password_hash`
- `sessions` table and cookie-backed session handling
- Frontend `AuthGate` extension with login/register/logout state
- `LoginScreen` and `RegisterScreen`
- Route guards that redirect unauthenticated users to `/login`
- Sign-out menu and sign-out confirmation modal

This is no longer the desired product model. Animo is intended to behave as a single-user local workspace. The user identity should still exist in the database because existing entities already reference `user_id`, and future preferences should be attached to that user.

## Product Requirements

### 1. Remove Authentication UX

Remove the login/register/sign-out experience from the app.

Requirements:

- The app must not show login or registration screens.
- The app must not redirect users to `/login`.
- The app header/nav should not include a sign-out action.
- The user menu can remain only if it is useful for profile/settings access, but it must not imply account authentication.
- Existing app pages should be accessible after local onboarding is complete.

Affected frontend areas:

- `app/src/Main.xmlui`
- `app/src/components/LoginScreen.xmlui`
- `app/src/components/RegisterScreen.xmlui`
- `app/src/extensions/AuthGate/*`
- Any XMLUI bindings that depend on `auth.value.kind === 'authenticated'`

### 2. Add First-Run Welcome / Onboarding Screen

When the app starts and no local user exists, show a first-run onboarding screen.

The screen should collect:

- Display name
- Username

The screen should include:

- A friendly welcome message
- A placeholder graphic area for a future custom illustration
- A primary action to create the local user and continue into the app
- Basic validation for required fields

Placeholder graphic requirements:

- Use a simple visual placeholder for now.
- Do not block the implementation on final artwork.
- Make the graphic area easy to replace later with a real asset.

Completion behavior:

- On submit, create the local user record.
- Persist enough state so the onboarding screen is not shown again on subsequent launches.
- Navigate to the main app after successful creation.

### 3. Preserve User Ownership Model

The application should keep using `user_id` as the ownership boundary for clients, projects, tags, time entries, reports, and future data.

Requirements:

- Existing tables that reference `users(id)` should continue to work.
- API handlers should still resolve a current local user, but without requiring a login session.
- All list/create/update/delete operations should continue to scope data to the current local user.
- The implementation should not introduce multi-user behavior.

### 4. Update User Schema for Local Profile

The current `users` schema is authentication-oriented:

- `email TEXT NOT NULL UNIQUE`
- `password_hash TEXT NOT NULL`
- `name TEXT NOT NULL`

Replace or migrate this toward a local profile model:

- `id`
- `name`
- `username`
- `created_at`
- Optional profile/preferences fields if the implementation chooses to keep them directly on the user record

Requirements:

- `username` should be required and unique for the local database.
- `email` and `password_hash` should no longer be required for the local-first flow.
- Existing development/demo databases should be migrated safely.
- The API should expose the local user profile without leaking obsolete auth fields.

### 5. Add Preferences Foundation

User preferences should be attached to the local user so future settings can be added cleanly.

Initial preferences should include:

- Theme preference

The design should allow future preferences such as:

- UI density
- Default report options
- Date/time formatting
- Other app-specific settings

Implementation options:

- Add preference columns to `users`, or
- Add a `user_preferences` table keyed by `user_id`

The preferred approach should be chosen based on maintainability and migration safety.

### 6. Backend API Changes

Replace auth/session endpoints with local-user bootstrap/profile endpoints.

Desired capabilities:

- Check whether a local user exists.
- Create the first local user.
- Fetch the current local user/profile.
- Update profile/preferences later, especially from Settings.

Possible endpoint shape:

- `GET /api/user/bootstrap` returns whether setup is complete and the current user if present.
- `POST /api/user/bootstrap` creates the first user from `{ name, username }`.
- `GET /api/user/me` returns the current local user.
- `PATCH /api/user/me` updates profile and preferences.

Exact endpoint names can differ if they better match existing project conventions.

Backend requirements:

- Remove or stop exposing `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, and `/api/auth/me`.
- Remove session cookie dependency from normal API usage.
- Replace `AuthUser` extraction with a local current-user resolver.
- Existing handlers should continue to receive a user identity or otherwise scope queries by the local user.
- If no user exists, protected data endpoints should return a clear setup-required error or an empty state that the frontend handles intentionally.

### 7. Frontend State Changes

Replace auth state with local setup/profile state.

Requirements:

- On app load, check whether the local user exists.
- If no user exists, show the onboarding screen.
- If a user exists, load the main app immediately.
- DataSources should load once setup is complete.
- The app should keep showing user name/initials where appropriate.
- Settings should use the local user profile instead of auth user/email.

Possible implementation:

- Replace `AuthGate` with a simpler `UserGate`, `LocalUserGate`, or similar headless component.
- The component can expose:
  - `value.kind`: `bootstrapping`, `needs-setup`, `ready`
  - `value.user`
  - `createUser(name, username)`
  - `updateUser(...)`
  - `fetch(...)` if a shared API fetch wrapper is still useful

### 8. Remove Security Artifacts That No Longer Apply

Because the app is local-first and no longer has authentication, remove unused authentication-specific code where safe.

Candidates:

- Password hashing and verification code
- Session token creation/revocation
- Session cookie handling
- Login/register API client methods
- CSRF/XSRF behavior tied only to cookie sessions
- Login/register routes and UI
- Idle timeout sign-out behavior

Do not remove data ownership by `user_id`.

### 9. Demo / Seed Data

Update demo seeding so it creates a local user profile instead of an email/password account.

Requirements:

- Demo data should still belong to a user.
- Demo seeding should not print or rely on a demo password.
- Existing clients, projects, tags, entries, and reports should continue to work in demo mode.

### 10. Testing and Verification

Verify the following flows:

- Fresh database starts on the onboarding screen.
- Entering display name and username creates the user and opens the main app.
- Reloading the app after setup opens the main app directly.
- Clients, projects, tags, time entries, reports, and settings still load and save under the local user.
- Login/register routes and UI are no longer reachable from normal navigation.
- Existing demo mode still works.
- Theme preference is stored under the local user or preferences table.

## Non-Goals

- Multi-user support
- Password-based authentication
- Cloud accounts
- OAuth or external identity providers
- Final welcome illustration artwork
- Full settings redesign beyond what is needed for local user/profile/preferences

## Acceptance Criteria

- A new user with `name` and `username` can be created from the first-run welcome screen.
- The app no longer requires or presents login/registration.
- The backend no longer depends on sessions for normal app data endpoints.
- Existing app data remains scoped to a user record.
- The user model supports future preferences, starting with theme preference.
- Placeholder welcome artwork is present and can be swapped later.
- Existing app workflows continue to work after onboarding.
