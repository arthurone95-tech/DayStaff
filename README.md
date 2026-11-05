# DayStaff

**Mobile Staff Attendance & Biometric Verification App**

DayStaff turns an ordinary Android or iOS phone/tablet into a secure, offline
attendance terminal for schools. It replaces paper logbooks and dedicated
clocking hardware with:

- device biometric verification (fingerprint / Face ID)
- staff profile photos for quick queue-friendly scanning
- automatic late / early-departure calculations
- a PIN-locked administrator area
- local SQLite storage (no server, no cloud bills)
- Excel/CSV report export through the native share sheet

Built with **React Native (Expo) + TypeScript**.

---

## Quick start

```bash
npm install
npx expo start
```

Then scan the QR code with **Expo Go** (Android/iOS), or press `a` / `i` for an
emulator. For a production build with full OS-level kiosk behavior use
`eas build`.

### First run

1. The app opens directly into the locked **kiosk**.
2. Tap **Admin** (top-right).
3. Enter the default master PIN: **`1234`**.
4. Add staff, set the schedule, then **change the PIN** in Settings.

> ⚠️ Change the default PIN before handing the device to staff.

---

## Features

### Kiosk (always locked)

- Large live clock and school name.
- Staff photo grid with queue-friendly touch targets.
- Tapping a staff member triggers the native biometric prompt.
- The state engine records one of:
  - **Clock in** — no record today → on time or late.
  - **Clock out** — clocked in, not yet out → on time or early.
  - **Already clocked out** — both records exist.
- Feedback modal shows the teacher's name, photo, status badge, times and
  exact minutes late/early.
- Admin area is unreachable without the master PIN, and the app always boots
  back into the kiosk.

### Admin dashboard

- Live daily summary: total staff, present, late, clocked out, early exit,
  absent.
- Colour-coded staff rows (emerald / amber / coral) for instant visibility.
- Staff registration with camera or gallery photo + phone number.
- Editing, deactivation/reactivation (history preserved).
- Schedule configuration: official start, grace period, closing time.
- PIN change, school name, biometric readiness check, and "lock admin area".

### Reports

- **Excel (.xlsx)** with an `Attendance` sheet and a `Daily totals` sheet.
- **CSV** for lightweight sharing.
- Ranges: today, a chosen month, or all time.
- Handed to the OS share sheet (WhatsApp, email, Files).

---

## Project structure

```text
App.tsx
src/
  components/     reusable native-feel UI (buttons, cards, badges, modals)
  database/       SQLite connection, schema, seed, typed queries
  hooks/          useNow clock hook
  navigation/     React Navigation native stack + route types
  screens/
    kiosk/        KioskTerminalScreen
    admin/        dashboard, staff, register, schedule, export, settings
    auth/         AdminPinModal
  services/       attendance engine, biometrics, PIN, photos, export
  theme/          colour/spacing/type tokens
  types/          domain models
  utils/          date & time helpers
docs/             PRD, technical plan, build phases
```

## Data model

| Table             | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `staff`           | name, phone, photo URI, active flag                            |
| `schedules`       | single row: start time, grace minutes, closing time            |
| `attendance_logs` | one row per staff per day: in/out timestamps, status, minutes  |
| `app_settings`    | hashed admin PIN, school name                                  |

The database is created and migrated automatically on first launch
(`PRAGMA user_version`). All timestamps are stored as ISO strings; the local
date key (`YYYY-MM-DD`) groups daily records.

## Attendance rules

- **On time**: clock-in within `startTime + grace`.
- **Late**: clock-in after the grace period. Minutes late are measured beyond
  the grace period.
- **Clocked out**: departure at or after `endTime`.
- **Early exit**: departure before `endTime`; minutes early are shown.
- No record today = **Absent** on the dashboard.

## Notes & limitations

- Native device biometrics authenticate the person enrolled on the *device*;
  they cannot enrol each staff member individually with Expo managed APIs.
  DayStaff therefore combines the device biometric prompt with an explicit
  staff card selection.
- True OS-level kiosk lock (`startLockTask` on Android) needs a custom native
  module and a development/production build. The app implements strict
  app-level locking (always boots to kiosk, PIN-gated admin) and leaves the
  native hook for a later phase.
- In development, if no biometric sensor is available the prompt is simulated
  so simulators remain usable. Production builds stay strict.
- All data is local. Clearing app data removes attendance history.

## Docs

- [Product Requirements Document](./docs/Product_Requirements_Document.md)
- [Technical Build Plan](./docs/Technical_Build_Plan.md)
- [Build Phases](./docs/PHASES.md)
