# DayStaff

**Mobile Staff Attendance & Biometric Verification App**

DayStaff turns an ordinary Android or iOS phone/tablet into a secure, offline
attendance terminal for schools, studios and small teams. It replaces paper
logbooks and dedicated clocking hardware with:

- device biometric verification (fingerprint / Face ID)
- a custom staff-code keypad built for shared terminals
- optional camera-based face matching against staff profile photos
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

### First-run setup

There is **no default administrator PIN**. On first launch the app opens a
one-time setup wizard before the kiosk is unlocked:

1. **Organisation** — company/school name, opening (arrival) time, closing
   time and an optional grace period.
2. **Security** — create and confirm a 4-digit administrator PIN. Keep it safe;
   it cannot be recovered from the device.
3. **Kiosk mode** — choose **Staff code + biometrics** or **Face recognition**.

After setup, the kiosk is locked. From there:

1. Tap **Admin** (top-right) and enter the PIN.
2. Add staff, assign each person a unique 2–6 character staff code and a clear
   profile photo.
3. Set the schedule, switch kiosk mode or change the PIN from **Settings**.

---

## Kiosk modes

### Staff code + biometrics (recommended)

- A full-width alphanumeric keypad occupies the lower part of the screen; no
  native QWERTY keyboard is needed. Letters use a balanced 9-column grid and
  numbers a separate 5-column grid with a visible divider.
- A prominent scan card shows the detected sensor (Face ID, fingerprint or
  iris) and whether it is ready, scanning or unavailable.
- The staff member types their code. When the code resolves to exactly one
  staff member, the device biometric prompt appears automatically.
- On success, attendance is recorded and the summary card shows the staff
  name, photo, clock-in/out status and late/early minutes.
- The device sensor is checked before prompting. Biometric prompts never fall
  back to the shared device passcode; failed or unavailable sensors show a
  clear message instead.
- The "Verify" key retries the biometric prompt if it is cancelled.

### Face recognition (beta)

- The kiosk shows a live front-camera preview with a face guide.
- Tap **Scan my face** to capture a frame and match it against the profile
  photos stored on the device.
- A very close match records attendance immediately. A less certain match
  shows a confirmation card so the staff member can confirm or reject it.
- **Use staff code instead** is always available as a fallback.

> Face mode is an on-device **visual-fingerprint** matcher (a 64-bit difference
> hash), not a production ML identity model. Expo Go cannot load a custom
> native face-embedding module, so the matcher is deliberately isolated behind
> `src/services/faceRecognitionService.ts`. A native ML model can replace it
> without changing the kiosk UI. For higher accuracy, use clear, front-facing
> profile photos with an uncluttered background.

---

## Features

### Kiosk (always locked)

- Large live clock, company name and terminal status.
- Dual-mode authentication (staff code + biometrics, or face capture).
- The state engine records one of:
  - **Clock in** — no record today → on time or late.
  - **Already signed in** — clocked in before closing → a status card offers a
    prominent manual **Sign out now** action (recorded as an early exit when
    applicable).
  - **Clock out** — verification at or after closing finalises the day
    automatically; on time or early.
  - **Already clocked out** — both records exist.
- Feedback modal shows the staff member's name, photo, status badge, times and
  exact minutes late/early.
- Admin area is unreachable without the master PIN, and the app always boots
  back into the kiosk.

### Admin dashboard

- Live daily summary: total staff, present, late, clocked out, early exit,
  absent.
- Colour-coded staff rows (emerald / amber / coral) for instant visibility.
- Staff registration with full name, unique staff ID/code and an optional
  camera or gallery profile photo.
- Editing, deactivation/reactivation (history preserved).
- Schedule configuration: official start, grace period, closing time.
- Auth-mode switch, company name, PIN change, biometric readiness check and
  "lock admin area".

### Reports

- **Excel (.xlsx)** with an `Attendance` sheet and a `Daily totals` sheet.
- **CSV** for lightweight sharing.
- Ranges: today, a chosen month, or all time.
- Includes staff code and phone number columns.
- Handed to the OS share sheet (WhatsApp, email, Files).

---

## Project structure

```text
App.tsx
src/
  components/     reusable native-feel UI (buttons, cards, badges, modals)
  config/         persisted setting keys and shared constants
  database/       SQLite connection, schema, seed, typed queries
  hooks/          useNow clock hook
  navigation/     React Navigation native stack + route types
  screens/
    kiosk/        terminal, code keypad, face scan and match confirmation
    admin/        dashboard, staff, register, schedule, export, settings
    auth/         AdminPinModal
    setup/        first-run administrator setup wizard
  services/       attendance engine, biometrics, app settings, PIN, photos,
                  face signatures, export
  theme/          colour/spacing/type tokens
  types/          domain models
  utils/          date & time helpers
docs/             PRD, technical plan, build phases
```

## Data model

| Table             | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `staff`           | name, kiosk code, phone, photo URI, face signature, active flag |
| `schedules`       | single row: start time, grace minutes, closing time            |
| `attendance_logs` | one row per staff per day: in/out timestamps, status, minutes  |
| `app_settings`    | hashed admin PIN, company name, auth method, setup marker      |

Schema version 2 adds `staff_code` and `face_signature` to `staff`. Existing
staff receive a deterministic code (`initial + id`) during migration so the
keypad works immediately. The database is created and migrated automatically
on first launch (`PRAGMA user_version`). All timestamps are stored as ISO
strings; the local date key (`YYYY-MM-DD`) groups daily records.

## Attendance rules

- **On time**: clock-in within `startTime + grace`.
- **Late**: clock-in after the grace period. Minutes late are measured beyond
  the grace period.
- **Already signed in**: a second verification before `endTime` does not clock
  the staff member out automatically. The kiosk shows the signed-in status card
  and a manual **Sign out now** button instead.
- **Clocked out**: verification at or after `endTime` finalises the day
  automatically.
- **Early exit**: a manual sign-out before `endTime`; minutes early are shown.
- No record today = **Absent** on the dashboard.

## Notes & limitations

- A device upgraded from an older build that still has the untouched seeded
  `1234` hash is routed through the setup wizard to create a real PIN. New
  installs and completed setups are never forced back into the wizard.
- Face profiles are generated from staff photos when they are saved. Existing
  staff photos from an older build are fingerprinted automatically the first
  time the kiosk loads face mode.
- Native device biometrics authenticate the person enrolled on the *device*;
  they cannot enrol each staff member individually with Expo managed APIs.
  Code mode therefore binds the device-level check to an explicit staff code.
- The kiosk detects the available sensor with
  `supportedAuthenticationTypesAsync()` (Face ID / Touch ID / fingerprint /
  iris). Device-passcode fallback is disabled, so the shared passcode can never
  be used in place of a biometric.
- Phone numbers are no longer collected during staff registration. Existing
  records keep any previously stored number for exports.
- Face mode is a beta heuristic, not a certified biometric system. It always
  falls back to the staff-code keypad and asks for confirmation on uncertain
  matches. Do not use it as the sole identity factor for high-security
  attendance.
- True OS-level kiosk lock (`startLockTask` on Android) needs a custom native
  module and a development/production build. The app implements strict
  app-level locking (always boots to kiosk, PIN-gated admin) and leaves the
  native hook for a later phase.
- In development, if no biometric sensor is available the prompt is simulated
  so simulators remain usable. Production builds stay strict.
- Camera mode requires camera permission. All data is local; clearing app data
  removes attendance history.

## Docs

- [Product Requirements Document](./docs/Product_Requirements_Document.md)
- [Technical Build Plan](./docs/Technical_Build_Plan.md)
- [Build Phases](./docs/PHASES.md)
