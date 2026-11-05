### 1. Recommended Tech Stack

* **Framework:** React Native (Expo SDK 50+ or React Native CLI)
* **Language:** TypeScript (prevents runtime bugs with state machines and timestamps)
* **Biometrics API:** `expo-local-authentication` (or `react-native-biometrics` if using Bare CLI)
* **Local Database:** `expo-sqlite` or WatermelonDB (Offline-first, zero server required)
* **File Export:** `xlsx` (SheetJS) + `expo-sharing` (for direct WhatsApp / Email sharing)
* **Kiosk Lock:** Custom Android Native module / Android `startLockTask` API

---

### 2. Suggested Project Folder Structure

Have your agent set up the directory tree like this:

```text
daystaff/
├── src/
│   ├── assets/              # Icons, logos, sound effects (success beep)
│   ├── components/          # Reusable UI (Buttons, Cards, Modals)
│   ├── database/
│   │   ├── db.ts            # SQLite connection setup
│   │   └── queries.ts       # Insert/select queries for staff & logs
│   ├── navigation/          # React Navigation (Admin vs Kiosk routes)
│   ├── screens/
│   │   ├── kiosk/           # KioskTerminalScreen.tsx (Daily Clock In/Out)
│   │   ├── admin/           # AdminDashboardScreen.tsx, RegisterStaffScreen.tsx
│   │   └── auth/            # AdminPinModal.tsx
│   ├── services/
│   │   ├── biometricService.ts # Native OS fingerprint/FaceID trigger
│   │   ├── exportService.ts    # XLSX file generation & sharing
│   │   └── attendanceLogic.ts  # Late/Early departure calculations
│   └── types/               # TypeScript interfaces (Staff, Log, Schedule)
├── App.tsx
└── package.json

```

---

### 3. Immediate Step-by-Step Build Plan for Your Agent

Give your agent these tasks in order:

#### **Step 1: Database Setup & Local Tables**

Implement the SQLite database initialization script in `src/database/db.ts`:

* Create `staff` table (`id`, `full_name`, `phone_number`, `photo_uri`).
* Create `schedules` table (`start_time`, `late_threshold`, `end_time`).
* Create `attendance_logs` table (`id`, `staff_id`, `date`, `clock_in_time`, `clock_in_status`, `minutes_late`, `clock_out_time`, `clock_out_status`, `minutes_early`).

#### **Step 2: Biometric Authentication Integration**

* Implement `biometricService.ts` using `expo-local-authentication`.
* Trigger device hardware check (`authenticateAsync`) to prompt fingerprint/Face ID verification.

#### **Step 3: Core Clock-In / Clock-Out State Engine**

Implement `attendanceLogic.ts` to handle daily scans:

1. Identify if teacher has an existing record for `today`.
2. **If NO record exists:** Execute **Clock-In Flow**. Calculate if arrival is *On Time* or *Late* (minutes late). Record `clock_in_time`.
3. **If Clock-In exists & NO Clock-Out:** Execute **Clock-Out Flow**. Calculate if departure is *On Time* or *Early* (minutes early). Record `clock_out_time`.
4. **If both exist:** Trigger pop-up: *"Already Clocked Out for Today at [Time]"*.

#### **Step 4: Kiosk Terminal UI (`KioskTerminalScreen.tsx`)**

* High-contrast screen showing current digital time.
* Prominent central button: *"Tap Fingerprint Sensor to Scan"*.
* Modal pop-up showing Teacher's **Name, Photo**, and **Status Badge** (Green for On-Time, Red/Amber for Late or Early Departure).
* Pin-protected Lock Icon at the top corner to exit to Admin settings.

#### **Step 5: Admin Dashboard & Excel Sharing**

* Real-time list of today's attendance (Present, Late, Absent, Clocked Out).
* Staff registration screen with camera capture for profile pictures.
* **"Export Report"** button that compiles monthly logs into `.xlsx` and triggers the phone's native share sheet (WhatsApp / Email).
