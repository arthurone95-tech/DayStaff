# DayStaff — Technical Build Plan

This document records the implementation approach used by the current codebase.
It reflects the shipped Expo Go MVP, including first-run setup, staff codes and
the dual-mode kiosk.

---

## 1. Tech Stack

| Concern        | Choice                                                       |
| -------------- | ------------------------------------------------------------ |
| Framework      | React Native via Expo SDK 58                                 |
| Language       | TypeScript (strict)                                          |
| Biometrics     | `expo-local-authentication`                                  |
| Local database | `expo-sqlite` (synchronous API)                              |
| Camera         | `expo-camera` (`CameraView` + `useCameraPermissions`)        |
| Image handling | `expo-image-manipulator`, `jpeg-js` for pixel access         |
| File export    | `xlsx` (SheetJS) + `expo-sharing` + `expo-file-system/legacy` |
| Haptics        | `expo-haptics`                                               |
| Navigation     | React Navigation 7 native stack                              |
| Kiosk lock     | App-level locking; native `startLockTask` remains post-MVP   |

`jpeg-js` decodes the small resized JPEGs used for visual fingerprints. No
native ML module is required in Expo Go.

---

## 2. Project Structure

```text
DayStaff/
├── App.tsx                     boot + first-run gate + navigation
├── src/
│   ├── components/             AppButton, Card, PinInput, TextField,
│   │                           TimeField, AuthMethodPicker, FeedbackModal, ...
│   ├── config/
│   │   └── app.ts              setting keys, defaults, staff-code limits
│   ├── database/
│   │   ├── db.ts               connection, pragmas, schema v2 migrations
│   │   ├── queries.ts          typed CRUD, settings, attendance, exports
│   │   └── seed.ts             first-run defaults (no admin PIN)
│   ├── navigation/             stack + route types
│   ├── screens/
│   │   ├── kiosk/              KioskTerminalScreen, CodeKeypad,
│   │   │                       FaceScanPanel, FaceMatchModal
│   │   ├── admin/              dashboard, staff, register, schedule,
│   │   │                       export, settings
│   │   ├── auth/               AdminPinModal
│   │   └── setup/              AdminSetupScreen wizard
│   ├── services/
│   │   ├── appSettings.ts      company name + auth method accessors
│   │   ├── attendanceLogic.ts  state engine + late/early calculations
│   │   ├── biometricService.ts device biometric wrapper
│   │   ├── faceEngine.ts       ML Kit + FaceNet embeddings
│   │   ├── faceSignature.ts    legacy dHash fallback (64-bit)
│   │   ├── faceRecognitionService.ts  enrolment + ranking + thresholds
│   │   ├── exportService.ts    XLSX/CSV generation + sharing
│   │   ├── photoService.ts     persist captured/profile photos
│   │   └── pinService.ts       salted SHA-256 admin PIN
│   ├── theme/                  colour, spacing, type tokens
│   ├── types/                  domain models
│   └── utils/                  date/time helpers
└── docs/
```

---

## 3. Database & Settings

### Schema version 2

- `staff`
  - `id`, `full_name`, `staff_code`, `phone_number`, `photo_uri`,
    `face_signature`, `is_active`, `created_at`
  - unique partial index on `staff_code`
- `schedules`
  - single row: `start_time`, `late_threshold_minutes`, `end_time`,
    `updated_at`
- `attendance_logs`
  - one row per staff/date, with clock-in/out timestamps, statuses and minutes
  - unique `(staff_id, date)`
- `app_settings` (key/value)
  - `admin_pin_hash`
  - `company_name` (falls back to legacy `school_name`)
  - `auth_method` — `PIN_BIOMETRIC` or `FACE_RECOGNITION`
  - `setup_completed_at`

Migration adds the new `staff` columns in place and backfills existing rows
with a deterministic code (`initial + id`). `PRAGMA user_version` prevents
re-running the migration.

### First-run gate

`App.tsx` runs `seedDatabase()` (schedule + company default only), then calls
`needsAdminSetup()`. A missing PIN always renders `AdminSetupScreen`; otherwise
the navigation stack mounts. If an older build still has the untouched seeded
`1234` hash and no `setup_completed_at` marker, the wizard is shown so a real
PIN is created. `verifyAdminPin()` returns false when no hash exists — there is
no `1234` fallback.

The setup wizard saves company, schedule and auth method first, then writes the
PIN hash last, so an interrupted setup is retried on the next boot. In face
mode the kiosk also backfills visual signatures for existing staff photos that
were saved before the feature existed.

---

## 4. Core Services

### Attendance engine

`attendanceLogic.ts` decides the daily action from existing logs:

1. No record today → clock-in flow, evaluate against `startTime + grace`.
2. Clock-in exists, no clock-out → clock-out flow, evaluate against `endTime`.
3. Both exist → already completed for today.

It returns a typed `AttendanceResult` used by the feedback modal.

### Biometric service

`biometricService.ts` wraps `expo-local-authentication`. Device biometrics
authenticate the shared device, not an individual staff member; the staff code
(or confirmed face match) supplies identity attribution. In development, a
missing sensor can be simulated so emulators remain usable.

### Face mode

- `faceEngine.ts`
  - loads the bundled FaceNet `.tflite` model through
    `@nitro-mlkit/face-recognition` + `react-native-nitro-modules`;
  - uses Google ML Kit to detect and crop the largest face;
  - returns a 512-dimensional embedding and compares embeddings with cosine
    similarity;
  - serialises native calls because the shared TFLite interpreter is not
    concurrency-safe;
  - requires a native development/production build; Expo Go and the iOS
    Simulator cannot run the native model.
- `faceRecognitionService.ts`
  - enrols new staff photos as `mf2:`-prefixed embeddings;
  - upgrades legacy 64-bit dHash signatures automatically;
  - auto-confirms only very close, clearly separated matches;
  - otherwise returns the best candidate for a confirmation modal;
  - returns no suggestion beyond a threshold and directs the user to the code
    keypad.
- `faceSignature.ts`
  - remains as an Expo Go/development fallback and for reading legacy hashes:
    a 96 px grayscale sample reduced to a 64-bit difference hash (plus a
    mirrored variant for front-camera captures).

The model is bundled at `assets/models/facenet512.tflite` (MIT-licensed
FaceNet weights, 512-d output) so recognition works fully offline. Face profiles
are templates, not raw biometric data, and stay on the device.

### Admin PIN

`pinService.ts` hashes a salted PIN with SHA-256 via `expo-crypto`.
`createAdminPin` enforces exactly four digits for setup; unlock/change accepts
4–8 digits for flexibility. There is no seeded PIN.

---

## 5. Kiosk UI

`KioskTerminalScreen.tsx` loads `getCompanyName()`, `getAuthMethod()` and
active staff on focus.

- **Code mode**
  - `CodeKeypad` renders a 6-column A–Z/0–9 grid, delete/clear/verify actions.
  - The screen auto-submits when the code uniquely resolves, unless a longer
    staff code shares the prefix; the Verify key handles that case.
  - `authenticateBiometric()` runs next, then `recordAttendance()`.
- **Face mode**
  - `FaceScanPanel` requests camera permission, shows a front-camera preview
    with an oval guide and a scan action.
  - `matchFaceToStaff()` returns a ranked result.
  - Strong matches record immediately; uncertain matches open
    `FaceMatchModal`; failures offer retry or code fallback.
- **Shared**
  - `FeedbackModal` shows name, photo, status badge and minutes late/early.
  - `AdminPinModal` gates the admin dashboard.
  - The kiosk always returns after admin screens are dismissed.

---

## 6. Admin & Reporting

- Dashboard: live daily summary and colour-coded staff rows.
- Staff: registration/edit with unique kiosk code, photo, phone, active flag.
- Schedule: start, grace, end.
- Settings: company name, auth-mode switch, PIN change, biometric readiness.
- Export: XLSX/CSV with staff code, name, phone, date, in/out, statuses and
  minutes; shared through the OS share sheet.

---

## 7. Verification Checklist

1. `npx tsc --noEmit` passes.
2. `npx expo export --platform android` completes (Metro bundle).
3. Fresh install (no PIN) opens the setup wizard; kiosk is not reachable.
4. Completing setup writes settings + PIN and opens the locked kiosk.
5. A unique staff code opens the biometric prompt and records attendance.
6. Face mode scans, suggests/confirms a profile, and falls back to code.
7. Admin PIN unlocks the dashboard; auth-mode changes apply on return.
8. XLSX/CSV exports include the staff-code column.
