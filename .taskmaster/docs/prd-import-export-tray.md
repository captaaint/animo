# CSV / Excel Import-Export and Desktop Tray Stopwatch

## Goal

Extend Animo with two daily-use feature areas:

1. CSV and Excel import/export for time entries, supporting migration from other time trackers and accounting/reporting workflows.
2. A Tauri desktop tray/menu-bar stopwatch with a global start/stop hotkey, so users can control tracking without opening the main window.

These features should build on the existing local-first app model, current time entry/project/client/tag data model, PDF report export, and existing Stopwatch XMLUI extension.

## Background

Animo currently supports PDF export for reports, but users also need structured spreadsheet workflows:

- Migrate historical entries from tools such as Toggl, Clockify, and Harvest using CSV exports.
- Export monthly entries to CSV/XLSX for accounting, invoicing, auditing, and manual spreadsheet analysis.
- Round-trip data where possible: export entries, edit in a spreadsheet, and import back safely.

The desktop app already embeds the Rust API and XMLUI frontend through Tauri. The in-app Stopwatch extension exists, but the highest daily-use value comes from being able to start/stop tracking from the system tray/menu bar and via a global shortcut, without opening the main window.

## Product Requirements

### 1. CSV Export

Add CSV export for time entries.

Requirements:

- Export filtered time entries for a date range.
- Include enough columns for accounting and migration:
  - entry id
  - date
  - start time
  - end time
  - duration seconds
  - duration formatted
  - description
  - project name
  - client name
  - tags
  - billable
  - hourly rate
  - currency
  - amount
- Respect the current local user scope.
- Use stable column names that can also be imported later.
- Support monthly export from the Reports UI.
- Avoid breaking the existing PDF export.

Possible backend endpoint:

- `GET /api/reports/export.csv?from=YYYY-MM-DD&to=YYYY-MM-DD`

### 2. Excel / XLSX Export

Add XLSX export for time entries.

Requirements:

- Export the same filtered dataset as CSV.
- Use a workbook layout suitable for accounting:
  - a main `Entries` sheet
  - optional `Summary` sheet with totals by project/client/tag/currency
- Preserve dates/durations in spreadsheet-friendly formats.
- Include currency/amount columns where project rates exist.
- The UI should allow choosing PDF, CSV, or XLSX export from reports.

Possible backend endpoint:

- `GET /api/reports/export.xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD`

### 3. CSV Import

Add CSV import for time entries.

Requirements:

- Import Animo’s own CSV export format.
- Support migration mappings for common CSV exports from:
  - Toggl
  - Clockify
  - Harvest
- Detect or let the user choose source format.
- Map imported rows to local entities:
  - create missing clients if needed
  - create missing projects if needed
  - create missing tags if needed
  - attach imported entries to the current local user
- Validate required fields:
  - start/end or date/duration
  - description can be empty
  - project/client/tag names can be empty depending on source
- Provide a dry-run preview before committing:
  - number of entries to create
  - number of clients/projects/tags to create
  - rows with validation errors
  - duplicate candidates
- Committing the import should be transactional where practical.
- Avoid creating duplicate entries when importing the same file twice.

Possible backend endpoints:

- `POST /api/import/csv/preview`
- `POST /api/import/csv/commit`

### 4. XLSX Import

Add Excel import for time entries.

Requirements:

- Import Animo’s own XLSX export format.
- Prefer the `Entries` sheet when present.
- Support user-selected sheet if needed.
- Reuse the same validation, mapping, preview, duplicate detection, and commit pipeline as CSV import.
- Handle common spreadsheet date/time cell formats.
- Return clear row-level errors.

Possible backend endpoints:

- `POST /api/import/xlsx/preview`
- `POST /api/import/xlsx/commit`

### 5. Import UI

Add an import flow to the frontend.

Requirements:

- Let the user select a CSV/XLSX file.
- Let the user choose source format when auto-detection is uncertain:
  - Animo
  - Toggl
  - Clockify
  - Harvest
- Show import preview:
  - rows to import
  - entities to create
  - validation errors
  - duplicate warnings
- Let the user confirm commit.
- Show final import summary.
- Keep the flow suitable for desktop and browser usage.

Suggested location:

- Reports page export/import controls, or a dedicated import screen under Manage/Settings.

### 6. Import/Export Shared Data Mapping

Create a shared internal representation for import/export rows.

Requirements:

- Use one normalized internal row type for CSV and XLSX.
- Keep source-specific parsing isolated.
- Keep export formatting isolated from database query logic.
- Support round-trip Animo export/import with minimal loss.
- Make room for future providers without rewriting the import pipeline.

### 7. Tauri Tray / Menu-Bar Stopwatch

Add desktop tray/menu-bar controls for the stopwatch.

Requirements:

- Show a tray/menu-bar item in Tauri desktop builds.
- The tray should expose stopwatch actions:
  - Start
  - Stop
  - Resume / Continue where relevant
  - Show/Hide main window
  - Quit
- Display current stopwatch state when possible:
  - idle
  - running duration
  - current description/project if available
- Starting/stopping from tray should update the same running timer state as the in-app TimerBar/Stopwatch.
- The implementation should not create two independent timers.
- If a user has not completed local onboarding yet, tray start should either open the window or show a setup-required state.

### 8. Global Hotkey

Add a global keyboard shortcut for desktop builds.

Requirements:

- Default shortcut: `Cmd+Shift+T` on macOS, equivalent `Ctrl+Shift+T` or configurable option on Windows/Linux if needed.
- Shortcut toggles start/stop of the current stopwatch.
- Shortcut works while the app is in the background.
- Avoid conflicts with existing OS/app shortcuts where possible.
- Provide a path for future customization in settings.
- The shortcut should use the same stopwatch state as tray and in-app TimerBar.

### 9. Stopwatch State Bridge

Create a reliable bridge between Tauri backend tray/hotkey events and the frontend Stopwatch extension.

Requirements:

- Decide where the canonical running stopwatch state lives:
  - frontend localStorage/state, or
  - Rust/Tauri app state, or
  - a shared event/state bridge
- Tray, hotkey, and in-app TimerBar must stay synchronized.
- Starting from tray should be visible in the app when the window opens.
- Stopping from tray should create or prompt for a time entry consistently with the in-app flow.
- Handle app restart while a timer is running.

### 10. Desktop UX and Notifications

Add desktop feedback for tray/hotkey actions.

Requirements:

- Provide lightweight feedback when the user starts/stops tracking from tray or hotkey.
- Consider native notifications or tray label updates.
- Do not require the main window to open for a simple start/stop toggle.
- If required information is missing to save an entry, open the window to complete details.

## Technical Considerations

- Backend is Rust/axum/sqlx/SQLite.
- Frontend is XMLUI with custom React extensions.
- Desktop shell is Tauri.
- Existing report PDF helper should remain intact.
- Existing E2E tests should continue to pass.
- New import/export code should be covered by parser/formatter tests and at least smoke-level UI/API checks.

## Non-Goals

- Full two-way sync with Toggl/Clockify/Harvest APIs.
- Real-time cloud backup.
- Multi-user import ownership.
- Full accounting/invoicing product features.
- Custom shortcut UI beyond what is needed to make the default hotkey reliable.

## Acceptance Criteria

- Users can export a month of entries as CSV and XLSX.
- Users can import Animo CSV/XLSX back into a clean database.
- Users can import representative Toggl, Clockify, and Harvest CSV samples.
- Import preview shows row-level validation and duplicate warnings before commit.
- Desktop users can start/stop the timer from tray/menu bar.
- Desktop users can toggle the timer with `Cmd+Shift+T` on macOS.
- Tray/hotkey and in-app Stopwatch remain synchronized.
- Existing PDF export and local-user onboarding continue to work.
