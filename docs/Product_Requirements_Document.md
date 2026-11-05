# Product Requirements Document (PRD): Mobile Staff Attendance & Verification App

## 1. Executive Summary

DayStaff is a mobile application built with React Native (supporting Android
and iOS) that turns standard smartphones or tablets into secure, local
attendance terminals. It replaces paper logbooks and dedicated clocking
hardware with staff-code identification, device-native biometric verification
(fingerprint or Face ID), optional camera-based face matching, precise
lateness/departure calculation, and local data export.

The terminal is designed for schools, studios and small teams that need a
shared, offline attendance station without a server or cloud subscription.

## 2. Core Architectural Decisions & Philosophy

### Tech Stack

React Native (Expo managed workflow) with TypeScript. A development or
production build can add native kiosk/ML modules later; the MVP runs in Expo Go.

### Storage Model

Local-first SQLite (`expo-sqlite`) for staff, schedules, attendance logs and
app settings. No network, no server, no cloud dependency.

### Single-Device Operation Mode

The application operates primarily as a dedicated terminal device (Phone A).
Administration happens on the same device behind a PIN gate.

### Session Locking Mechanism

- The app defaults into a locked Clock-In/Out Kiosk Mode. Staff cannot exit this
  screen or access admin controls without the administrator PIN.
- Even if cleared from recent apps or restarted, the app boots directly back
  into the kiosk.
- The first run has **no default administrator PIN**. A one-time setup wizard
  must create one before the kiosk is unlocked.
- An administrator enters the PIN to unlock the dashboard, manage staff,
  configure the schedule, switch authentication mode or export reports.

## 3. User Roles & Permissions

### Staff

- Enter a short alphanumeric staff code on the kiosk keypad, then confirm with
  the device biometric prompt; or use the optional face-recognition mode.
- Can record arrival time (clock-in) and departure time (clock-out).
- Can view real-time feedback regarding punctuality (e.g. "On time",
  "Signed in 12 minutes late", or "Clocked out 15 minutes early").

### Administrator

- Creates the initial company name, schedule, PIN and kiosk mode during setup.
- Has master PIN access to the admin area.
- Can register new staff members (name, unique staff code, phone number,
  profile photo).
- Can define company/school schedules (official arrival time, grace period and
  closing time).
- Can switch the kiosk authentication method at any time.
- Can view daily records, absent lists, late arrivals/early departures
  (highlighted in red/amber), and export data as Excel/CSV files.

## 4. Key Functional Features & Workflow

### A. First-Run Setup Wizard

On boot the app checks `app_settings` for an administrator PIN hash. If none
exists, the kiosk stays locked and a three-step wizard appears:

1. **Organisation** — company/school name, default opening (arrival) time,
   closing time and grace period.
2. **Security** — create and confirm a 4-digit administrator PIN.
3. **Kiosk mode** — choose **Staff code + biometrics** or **Face recognition**.

The wizard writes the settings first and the PIN hash last. If setup is
interrupted before the PIN is written, the wizard appears again on the next
boot. There is no seeded or default PIN.

### B. Staff Registration

Admin enters the admin area via PIN, selects "Add Staff", inputs name, unique
staff code (2–6 letters/numbers), phone number and a profile photo. The profile
photo is used for face mode and is fingerprinted locally at save time. Device
biometrics are not enrolled per staff member; they unlock the shared device.

### C. Daily Terminal Flow (Clock-In & Clock-Out)

**Idle state:** Displays a high-contrast kiosk with a live clock, company name
and the active authentication mode.

#### Mode 1 — Staff code + biometrics (recommended)

- A custom A–Z/0–9 keypad fills the lower part of the screen. No native QWERTY
  keyboard is shown.
- The staff member types their code. When it resolves to exactly one active
  staff member, the native biometric prompt
  (BiometricPrompt on Android / LocalAuthentication on iOS) appears
  automatically.
- On success the app records the event and shows the summary modal.

#### Mode 2 — Face recognition (beta)

- A live front-camera preview with a face guide is shown.
- The staff member taps **Scan my face**; the app captures a frame and compares
  it against the visual signatures of staff profile photos stored on the device.
- A very close, clearly separated match records attendance immediately. A less
  certain match shows a confirmation card ("Is this you?") before recording.
- If no confident match is found, the staff member can retry or switch to the
  staff-code keypad.

> The Expo Go MVP uses an on-device 64-bit visual fingerprint, not a native ML
> face-embedding model. Face mode is therefore labelled beta and always offers
> the code fallback. A production build can replace the matcher behind
> `faceRecognitionService.ts` with a native face-recognition module.

#### Clock-In Verification & Feedback

- Upon successful verification, the app pairs the scan with the staff profile.
- A confirmation modal displays the staff member's name, profile picture and
  status.
- Punctuality calculation against the configured start time + grace period:
  - On Time: green badge indicating successful check-in.
  - Late: amber/red badge showing the exact duration late.
- Duplicate prevention: if already clocked in, the app shows the existing
  record/status instead of creating a duplicate.

#### Clock-Out Verification & Feedback

- The app verifies that the staff member has previously clocked in today.
- Departure calculation against the configured closing time:
  - Standard exit: green badge confirming successful clock-out.
  - Early departure: amber badge noting the early duration.
- Session completion & prevention: clocking out without clocking in, or clocking
  out twice, shows the appropriate message.

## 5. Admin Dashboard & Reporting

**Daily summary view:** Lists all registered staff with real-time status:
Present (On Time), Late, Clocked Out, Early Exit, or Absent.

**Visual cues:** Late arrivals and early departures are highlighted in soft
red/amber for instant visibility.

**Settings:** Company/school name, administrator PIN change, kiosk
authentication mode, schedule, biometric readiness check and "lock admin area".

**Data export:** Admins can generate a clean CSV/Excel summary — including
staff code, phone, in/out times, status and late/early minutes — and share it
via WhatsApp, email, or local file transfer.

## 6. UI/UX Guidelines

### Native Mobile Feel

- Avoid web-app aesthetics.
- Use native cards, smooth transitions, haptic feedback on touch and
  platform-compliant components.

### Clutter-Free Kiosk

- The kiosk screen must be minimal, with large touch areas suitable for quick
  daily queuing.
- Code mode uses a custom keypad on the lower half of the screen; face mode uses
  a large camera frame with a simple scan action.
- Both modes always expose the admin lock and a code fallback.

### Color Psychology

- Primary brand color: trustworthy deep blue/slate.
- Success state: clean emerald green.
- Warning/late/early state: soft amber/coral red.
- Kiosk background: dark navy for high contrast and reduced glare.

## 7. Future Roadmap (Post-MVP)

- Native ML face recognition (on-device embeddings) in a development build.
- Local Wi-Fi sync between terminal devices and secondary admin devices.
- Optional automated daily email/messaging backups of CSV summaries.
- True OS-level kiosk lock (`startLockTask`) via a native Android module.
