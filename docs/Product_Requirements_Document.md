# Product Requirements Document (PRD): Mobile Staff Attendance & Biometric Verification App

## 1. Executive Summary

The Staff Attendance App is a mobile application built with React Native (supporting both Android and iOS) designed to transform standard smartphones or tablets into secure, local biometric attendance terminals. It eliminates traditional paper logbooks and expensive hardware clocking machines by using device-native biometric verification (fingerprint or Face ID) coupled with photo confirmation, precise lateness/departure calculation, and local data export capabilities.

## 2. Core Architectural Decisions & Philosophy

### Tech Stack
React Native (Expo or Bare CLI), allowing cross-platform deployment.

### Storage Model
Local-first database (SQLite/WatermelonDB/AsyncStorage) to avoid cloud infrastructure costs and complexity.

### Single-Device Operation Mode
The application operates primarily as a dedicated terminal device (Phone A).

### Session Locking Mechanism
- The app defaults into a locked Clock-In/Out Kiosk Mode. Teachers cannot exit this screen or access admin controls without entering a master password.
- Even if cleared from recent apps or restarted, the app boots directly back into the biometric clocking screen.
- An administrator enters a master password to unlock administrative dashboards, view summaries, modify staff lists, or end/begin daily sessions.

## 3. User Roles & Permissions

### Teacher / Staff
- Can view their name and profile picture prompt upon successful verification.
- Can record arrival time (clock-in) and departure time (clock-out).
- Can view real-time feedback regarding punctuality (e.g., "On time", "Signed in 12 minutes late", or "Clocked out 15 minutes early").

### Administrator
- Has master password access.
- Can register new staff members (Name, Phone Number, Profile Photo, Biometric mapping).
- Can define school schedules (official arrival window, e.g., 6:50 AM – 7:00 AM, and closing time, e.g., 3:00 PM).
- Can unlock the admin dashboard to view daily records, absent lists, late arrivals/early departures (highlighted in red/amber), and export data as Excel/CSV files.

## 4. Key Functional Features & Workflow

### A. Setup & Staff Registration

**Admin Registration Flow:** Admin enters the admin portal via password, selects "Add Staff", inputs name, phone number, snaps/uploads a profile photo, and registers the fingerprint via the native device prompt.

**Schedule Configuration:** Admin sets the official start time, grace period, and official closing/dismissal time.

### B. Daily Terminal Flow (Clock-In & Clock-Out)

**Idle State:** Displays a simple, intuitive kiosk interface with dual or dynamic touch targets ("Clock In" and "Clock Out").

**Biometric Trigger:** Teacher taps the relevant action button. The native operating system biometric prompt (BiometricPrompt on Android / LocalAuthentication on iOS) appears.

**Clock-In Verification & Feedback:**
- Upon biometric match, the app pairs the scan with the user profile.
- A confirmation modal displays the teacher's Name and Profile Picture.
- Punctuality Calculator: The system evaluates arrival time against the configured start window.
  - On Time: Green badge indicating successful check-in.
  - Late: Amber/Red badge displaying exact duration of lateness (e.g., "Signed in 14 minutes late").
- Duplicate Prevention: If already clocked in and the user attempts to clock in again, the app notifies: "Already clocked in for today."

**Clock-Out Verification & Feedback:**
- Upon biometric match for departure, the app verifies that the teacher has previously clocked in for the current session.
- Departure Calculator: The system evaluates departure time against the configured closing time.
  - Standard Exit: Green badge confirming successful clock-out (e.g., "Clocked out successfully at 3:05 PM").
  - Early Departure: Amber badge noting early departure (e.g., "Clocked out 20 minutes before official closing time").
- Session Completion & Prevention: If a teacher attempts to clock out without having clocked in, or attempts to clock out multiple times in one day, the app notifies: "Clock-in record required first" or "Already completed session for today."

## 5. Admin Dashboard & Reporting

**Daily Summary View:** Lists all registered staff with real-time status updates: Present (On Time), Late, Clocked Out, Early Exit, or Absent.

**Visual Cues:** Late arrivals and unauthorized early departures are highlighted in soft red/amber for instant visibility.

**Data Export:** Admins can generate a clean CSV/Excel summary and share it via WhatsApp, email, or local file transfer.

## 6. UI/UX Guidelines

### Native Mobile Feel
- Avoid web-app aesthetics.
- Use native bottom sheets, smooth card transitions, native typography, haptic feedback on touch, and platform-compliant UI components.

### Clutter-Free Interface
- The kiosk screen must be minimal, featuring large touch areas suitable for quick daily queuing.

### Color Psychology
- Primary brand color: Trustworthy deep blue or slate.
- Success state: Clean emerald green.
- Warning/Late/Early state: Soft amber/coral red.

## 7. Future Roadmap (Post-MVP)

- Local Wi-Fi sync capabilities between terminal devices and secondary admin devices.
- Optional automated daily email/messaging backups of CSV summaries.
