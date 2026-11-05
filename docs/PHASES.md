# DayStaff — Build Phases

> Mobile Staff Attendance & Biometric Verification App
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
- [x] Seed default schedule and default admin PIN
- [x] Typed query layer (`queries.ts`)

## Phase 3 — Business Logic & Services ✅

- [x] Attendance state engine (clock-in / clock-out / completed)
- [x] Late + early-departure calculations with grace period
- [x] Biometric authentication service
- [x] Admin PIN service (salted SHA-256)
- [x] Photo persistence helper

## Phase 4 — Kiosk Experience ✅

- [x] Locked kiosk as the always-on launch screen
- [x] Live digital clock and date
- [x] Staff photo grid (queue-friendly touch targets)
- [x] Biometric prompt → auto clock-in / clock-out
- [x] Feedback modal: name, photo, status badge, message
- [x] Duplicate / invalid-session prevention messages
- [x] PIN-protected admin entry button

## Phase 5 — Admin Suite ✅

- [x] Master PIN gate
- [x] Daily dashboard with real-time statuses
- [x] Visual cues for late/early/absent
- [x] Staff registration (name, phone, photo capture/upload)
- [x] Staff list + edit + deactivate
- [x] Schedule configuration (start, grace, closing)
- [x] Admin PIN change

## Phase 6 — Reporting & Export ✅

- [x] XLSX workbook generation (`xlsx` / SheetJS)
- [x] CSV generation
- [x] Today / month / all-time ranges
- [x] Native share sheet (`expo-sharing`)
- [x] Graceful fallback when sharing is unavailable

## Phase 7 — Polish & Verification ✅

- [x] App configuration (permissions, plugin entries)
- [x] README with setup + usage + default PIN
- [x] TypeScript strict typecheck
- [x] Git history with one commit per phase

---

## Architecture Summary

```text
App.tsx                        app bootstrap + navigation
src/
  components/                  reusable native-feel UI
  database/
    db.ts                      connection, pragmas, schema, migrations
    queries.ts                 typed CRUD + reporting queries
    seed.ts                    first-run defaults
  navigation/                  root native stack
  screens/
    kiosk/                     KioskTerminalScreen
    admin/                     dashboard, staff, schedule, export
    auth/                      AdminPinModal
  services/
    attendanceLogic.ts         state engine + calculations
    biometricService.ts        expo-local-authentication wrapper
    exportService.ts           XLSX/CSV + sharing
    pinService.ts              salted PIN hashing/verification
    photoService.ts            persist captured photos
  theme/                       design tokens
  types/                       domains models
  utils/                       date/time helpers
```

## Key Product Decisions

1. **Local-first**: all data lives on-device in SQLite. No network, no server.
2. **Always-locked kiosk**: the app's initial and fallback route is always the
   kiosk; admin screens are only reachable after a correct master PIN.
3. **Staff attribution**: native device biometrics authenticate the *device
   owner*, not arbitrary staff. The kiosk therefore asks the teacher to tap
   their own photo card, then verifies the device biometric before recording.
   This preserves the biometric+photo confirmation experience while remaining
   technically accurate on shared devices.
4. **Default admin PIN**: `1234` — change it from Admin → Settings on first run.

## Known Limitations / Post-MVP

- True OS-level kiosk lock (`startLockTask`) requires a custom Android native
  module and a development/production build; app-level locking is implemented
  here and the native hook is documented for a future phase.
- Device biometrics cannot be mapped per staff member with Expo managed APIs;
  see decision #3.
- Wi-Fi sync and automated email/messaging backups remain post-MVP.
