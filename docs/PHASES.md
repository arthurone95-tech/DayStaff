# DayStaff — Build Phases

> Mobile Staff Attendance & Verification App
> React Native (Expo) + TypeScript + offline SQLite

This document tracks the implementation phases derived from the
[PRD](./Product_Requirements_Document.md) and
[Technical Build Plan](./Technical_Build_Plan.md).

---

## Status Legend

- ✅ Complete
- 🚧 In progress
- ⬜ Planned

---

## Phase 0 — Discovery & Planning ✅

- [x] Read PRD and Technical Build Plan
- [x] Confirm toolchain (Node, npm, git)
- [x] Establish phase breakdown and folder architecture

## Phase 1 — Foundation ✅

- [x] Initialize git repository
- [x] Scaffold Expo + TypeScript project
- [x] Install runtime dependencies
- [x] Theme tokens (colors, spacing, radius, typography)
- [x] Domain types
- [x] Date/time utilities
- [x] `docs/` retained alongside app source

## Phase 2 — Data Layer ✅

- [x] SQLite connection + pragmas
- [x] Schema: `staff`, `schedules`, `attendance_logs`, `app_settings`
- [x] Migration/versioning guard
- [x] Seed default schedule and company name (no admin PIN)
- [x] Typed query layer (`queries.ts`)

## Phase 3 — Business Logic & Services ✅

- [x] Attendance state engine (clock-in / clock-out / completed)
- [x] Late + early-departure calculations with grace period
- [x] Biometric authentication service
- [x] Admin PIN service (salted SHA-256, no default PIN)
- [x] Photo persistence helper
- [x] App settings accessors (company name, auth method)
- [x] Visual face-signature service (beta)

## Phase 4 — Kiosk Experience ✅

- [x] Locked kiosk as the always-on launch screen
- [x] Live digital clock and date
- [x] Custom staff-code keypad (A–Z/0–9, no QWERTY)
- [x] Biometric prompt → auto clock-in / clock-out
- [x] Optional front-camera face mode with confirmation
- [x] Feedback modal: name, photo, status badge, message
- [x] Duplicate / invalid-session prevention messages
- [x] PIN-protected admin entry button

## Phase 5 — Admin Suite ✅

- [x] First-run setup wizard (company, schedule, PIN, auth mode)
- [x] Master PIN gate
- [x] Daily dashboard with real-time statuses
- [x] Visual cues for late/early/absent
- [x] Staff registration (name, code, phone, photo)
- [x] Staff list + edit + deactivate
- [x] Schedule configuration (start, grace, closing)
- [x] Admin PIN change
- [x] Auth-method switch and company-name editing

## Phase 6 — Reporting & Export ✅

- [x] XLSX workbook generation (`xlsx` / SheetJS)
- [x] CSV generation
- [x] Today / month / all-time ranges
- [x] Staff-code column and company metadata
- [x] Native share sheet (`expo-sharing`)
- [x] Graceful fallback when sharing is unavailable

## Phase 7 — Polish & Verification ✅

- [x] App configuration (permissions, plugin entries)
- [x] README with setup + usage + auth modes
- [x] TypeScript strict typecheck
- [x] Git history with one commit per phase

## Phase 8 — Staff Terminology & Dual-Mode Update ✅

- [x] Rename legacy role-based copy to staff throughout the app and docs
- [x] Rename `school_name` to `company_name` with legacy fallback
- [x] Remove default PIN seeding and the `1234` verification fallback
- [x] Gate the kiosk on `hasAdminPin()` and show `AdminSetupScreen`
- [x] Force company name, shift hours, 4-digit PIN and auth method in setup
- [x] Add `auth_method` setting and admin switch
- [x] Add required unique `staff_code` (schema v2 + migration backfill)
- [x] Build the custom A–Z/0–9 keypad and auto biometric trigger
- [x] Add camera preview, capture and visual profile matching
- [x] Add uncertain-match confirmation and code fallback
- [x] Update exports, dashboard and staff list with staff codes

## Phase 9 — On-Device Acceptance Testing 🚧

> **Status: pending manual hardware verification.** These checks require a
> physical Android/iOS device (or an emulator with camera and biometric
> hardware). Automated verification is already green — `npx tsc --noEmit` and
> `npx expo export --platform android` both pass — but runtime behaviour must be
> confirmed by hand before this phase is marked ✅.

- [ ] Fresh install → setup wizard appears, and the kiosk is unreachable until a
      PIN exists.
- [ ] Setup saves company name, shift start/end + grace, 4-digit PIN, and auth
      method.
- [ ] Upgrade from a v1 database → staff codes backfill (`initial + id`), and a
      legacy untouched-`1234` install is routed to setup.
- [ ] `PIN_BIOMETRIC` mode → custom keypad only (no native QWERTY), a valid code
      triggers biometrics, and the success card shows name, photo and status.
- [ ] `FACE_RECOGNITION` mode → camera permission, live preview, correct staff
      match, confirmation for close matches, and a working code fallback.
- [ ] Admin PIN change, auth-mode switch, and company-name edit persist across
      an app restart.

## Phase 10 — Production Native Build & Hardening 🚧

> **Status: in progress.** Android Lock Task Mode has been implemented and
> verified via `npx expo prebuild`. Remaining items require a paid Apple
> Developer account (iOS builds) or additional native work.

- [x] **Android Lock Task Mode**
  - [x] Enable Android kiosk mode natively (`startLockTask`) via Expo config
        plugin `/src/plugins/withKioskLockTask.js`, exposed as
        `enableKiosk()` / `disableKiosk()` in `src/services/kioskLockTask.ts`.
  - [x] Inject `android:lockTaskMode="if_whitelisted"` into MainActivity and
        add `MANAGE_DEVICE_POLICY_LOCK_TASK` permission via config plugin.
  - [x] Register `KioskLockTaskPackage` in `MainApplication.kt` via config plugin.
  - [x] Call `enableKiosk()` when kiosk screen activates
        (`KioskTerminalScreen.tsx`).
  - [x] Add "Exit kiosk mode" button in Admin → Settings behind PIN gate.
  - [ ] Declare a dedicated device-owner/kiosk provisioning path (or document
        the required `dpm set-device-owner` / screen-pinning setup) so
        `startLockTask` is not silently downgraded to screen pinning.
  - [ ] Allow-list the app's own package so the admin PIN gate remains the only
        way to leave the terminal.
  - [ ] Restore normal lock-task state on app foreground and block hardware
        back/recents where the OS permits.
- [ ] **EAS Build pipeline**
  - [x] Add `eas.json` with `development`, `preview` and `production` profiles
        (development client + internal distribution for QA).
  - [x] Configure `app.json` with Android package, iOS bundle identifier,
        version/build numbers, and required permissions.
  - [x] Build Android APK via `npx eas build -p android --profile preview`
        (build `e44a2938`, finished 2026-11-05).
  - [ ] Store signing credentials in EAS (Android keystore, iOS certificates and
        provisioning profiles); document the one-time `eas credentials` setup.
  - [ ] Add build/submit scripts and a documented release checklist
        (version bump → `eas build` → device smoke test → `eas submit`).
  - [ ] Verify the exported config contains no secrets and that config plugins
        are applied in the native projects.
- [ ] **Native face-embedding model (C++/TFLite)**
  - [ ] Replace the 64-bit dHash matcher behind
        `src/services/faceRecognitionService.ts` with a native module that
        returns a fixed-length embedding (e.g. FaceNet/MobileFaceNet TFLite).
  - [ ] Ship the `.tflite` model + C++ inference wrapper via an Expo config
        plugin, with Android NNAPI and iOS Core ML delegates where available.
  - [ ] Add face detection/alignment (landmarks, crop, quality checks) before
        embedding so captures match enrolment conditions.
  - [ ] Migrate stored `face_signature` values to versioned embeddings; keep
        dHash as a fallback for un-migrated photos and re-enrol lazily.
  - [ ] Calibrate similarity thresholds against a labelled staff set, store the
        threshold in settings, and require confirmation below the auto-match
        score.
  - [ ] Add liveness/anti-spoof checks (blink, depth or motion) and document
        privacy handling for on-device biometric templates.
  - [ ] Benchmark inference time on low-end kiosk hardware and cap the
        candidate search (indexed embeddings) as staff counts grow.

## Phase 11 — Attendance History & Nested Export ✅

- [x] Replace the dashboard **Export** tile with **Attendance**.
- [x] Turn the dashboard's bottom attendance list into a "Not clocked in yet"
      view that surfaces staff still awaiting check-in.
- [x] Add `AttendanceHistoryScreen` with Today/Yesterday quick filters, previous
      and next day navigation, and a month/year calendar picker that highlights
      dates with stored records.
- [x] Show every attendance record for the selected local date with staff photo,
      name, code, exact clock-in/clock-out times, and green/red status badges
      for on-time arrival, late arrival, correct departure, and early exit.
- [x] Add an empty state for dates without records.
- [x] Move export into the attendance screen: a header-level Export button opens
      an XLSX/CSV modal scoped to the selected date and hands the file to the
      native share sheet.
- [x] Add indexed SQLite date filtering (`attendance_logs.date`) and a distinct
      recorded-date query for the calendar picker.

---

## Architecture Summary

```text
App.tsx                        boot + first-run setup gate + navigation
src/
  components/                  reusable native-feel UI
  config/                      setting keys, defaults, staff-code rules
  database/
    db.ts                      connection, pragmas, schema v2 migrations
    queries.ts                 typed CRUD + reporting queries
    seed.ts                    first-run defaults (schedule + company)
  navigation/                  root native stack
  screens/
    kiosk/                     terminal, CodeKeypad, FaceScanPanel,
                               FaceMatchModal
    admin/                     dashboard, staff, register, schedule, attendance,
                               export, settings
    auth/                      AdminPinModal
    setup/                     AdminSetupScreen wizard
  services/
    appSettings.ts             company name + auth method
    attendanceLogic.ts         state engine + calculations
    biometricService.ts        expo-local-authentication wrapper
    faceSignature.ts           dHash visual fingerprints
    faceRecognitionService.ts  candidate ranking + thresholds
    exportService.ts           XLSX/CSV + sharing
    pinService.ts              salted PIN hashing/verification
    photoService.ts            persist captured photos
  theme/                       design tokens
  types/                       domain models
  utils/                       date/time helpers
```

## Key Product Decisions

1. **Local-first**: all data lives on-device in SQLite. No network, no server.
2. **First-run setup, no default PIN**: the kiosk is gated by `hasAdminPin()`.
   The setup wizard creates the company name, schedule, 4-digit PIN and auth
   method. Until the PIN exists, the kiosk cannot be reached.
3. **Staff attribution**: device biometrics authenticate the shared terminal,
   not an individual. Code mode binds the code to a staff profile before the
   biometric prompt, preserving the biometric+photo confirmation experience.
4. **Dual-mode kiosk**: admins choose staff code + biometrics (recommended), or
   face recognition. Both modes are switchable at any time from Settings.
5. **Face mode is beta**: the Expo Go MVP uses a 64-bit visual fingerprint, not
   a native ML face-embedding model. It auto-confirms only very close matches,
   asks for confirmation otherwise, and always offers the code fallback.
6. **Terminology**: all user-facing copy, schema fields, export headers and
   documentation use "staff" (with "company / school name" for the
   organisation).

## Known Limitations / Post-MVP

- True OS-level kiosk lock (`startLockTask`) is implemented for Android via
  the `withKioskLockTask` config plugin (Phase 10). It requires device-owner
  provisioning or user confirmation on first use to take full effect.
- Device biometrics cannot be mapped per staff member with Expo managed APIs;
  see decision #3.
- Face mode is a beta visual matcher in Expo Go; Phase 10 replaces it with a
  native TFLite embedding model. The matcher is already isolated behind
  `faceRecognitionService` for that swap.
- Release signing, EAS build profiles and store submission are covered by
  Phase 10.
- Wi-Fi sync and automated email/messaging backups remain post-MVP.
