/** Domain models shared across the app. */

export type ClockInStatus = 'on_time' | 'late';
export type ClockOutStatus = 'on_time' | 'early';

/** Display status used by the admin dashboard. */
export type DayStatus =
  | 'absent'
  | 'on_time'
  | 'late'
  | 'clocked_out'
  | 'early_exit';

export type AttendanceAction =
  | 'clock_in'
  | 'clock_out'
  | 'already_signed_in'
  | 'already_completed';

/** How the kiosk authenticates a staff member. */
export type AuthMethod =
  | 'PIN_BIOMETRIC'
  | 'FACE_RECOGNITION'
  | 'SHORT_CODE_QR';

/**
 * The method recorded against an individual attendance transaction.
 *
 * `FACE_BIOMETRIC` is used by the face-recognition kiosk; `QR_DEVICE_BOUND`
 * is used by the short-code + two-way visual QR flow. `MANUAL_OVERRIDE` marks
 * a clock-in/out entered by an administrator from the attendance screen.
 * `face_pin` marks a look-alike staff member verified by face plus personal PIN.
 */
export type AttendanceAuthMethod =
  | 'FACE_BIOMETRIC'
  | 'QR_DEVICE_BOUND'
  | 'MANUAL_OVERRIDE'
  | 'face_pin';

export interface Staff {
  id: number;
  fullName: string;
  /** Short alphanumeric code entered on the kiosk keypad. */
  staffCode: string;
  photoUri: string | null;
  /** Visual fingerprint of the profile photo, used by face mode. */
  faceSignature: string | null;
  /** JSON array of individual enrollment embeddings, used for multi-frame matching. */
  faceEmbeddings: number[][] | null;
  /** Look-alike group identifier shared by twins or similar faces. */
  similarGroupId: string | null;
  /** Whether this staff member must enter a personal PIN after face verification. */
  requiresPin: boolean;
  /** Hashed personal PIN for look-alike staff (never plaintext). */
  personalPinHash: string | null;
  /** Per-staff salt for the personal PIN hash. */
  personalPinSalt: string | null;
  /** Consecutive failed personal PIN attempts. */
  personalPinFailedAttempts: number;
  /** Millisecond timestamp until which personal PIN entry is locked, or null. */
  personalPinLockedUntil: number | null;
  /** Hashed staff fallback PIN (never plaintext). */
  staffPinHash: string | null;
  /** Per-staff salt for the PIN hash. */
  staffPinSalt: string | null;
  /** Consecutive failed PIN attempts. */
  pinFailedAttempts: number;
  /** ISO timestamp until which PIN entry is locked, or null. */
  pinLockedUntil: string | null;
  /** Public token for the optional paired phone, or null when unpaired. */
  deviceToken: string | null;
  /** ISO timestamp when the phone was paired, or null. */
  devicePairedAt: string | null;
  isActive: number;
  createdAt: string;
}

/** Secret credential shared with a paired phone during pairing. */
export interface StaffDeviceCredential {
  token: string;
  publicKey: string | null;
}

export interface NewStaff {
  fullName: string;
  staffCode?: string;
  photoUri: string | null;
  faceSignature: string | null;
  faceEmbeddings?: number[][] | null;
  staffPinHash?: string | null;
  staffPinSalt?: string | null;
}

export interface Schedule {
  /** Local wall-clock time, 24h `HH:mm`. */
  startTime: string;
  /** Grace period in minutes after startTime before a scan counts as late. */
  lateThresholdMinutes: number;
  /** Local wall-clock closing time, 24h `HH:mm`. */
  endTime: string;
  updatedAt: string;
}

export interface AttendanceLog {
  id: number;
  staffId: number;
  /** Local date key `YYYY-MM-DD`. */
  date: string;
  /** Full ISO timestamp of the clock-in. */
  clockInTime: string;
  clockInStatus: ClockInStatus;
  minutesLate: number;
  /** Full ISO timestamp or null while still on site. */
  clockOutTime: string | null;
  clockOutStatus: ClockOutStatus | null;
  minutesEarly: number;
  /** How the clock-in/out transaction was authenticated. */
  authMethod: AttendanceAuthMethod;
  /** True when an admin added or corrected this record manually. */
  isManualOverride: boolean;
  /** Short reason entered by the admin for a manual override. */
  overrideNote: string | null;
  /** When an admin recorded a manual override (ISO timestamp). */
  overrideRecordedAt: string | null;
}

export interface StaffDayRecord {
  staff: Staff;
  log: AttendanceLog | null;
  status: DayStatus;
}

export interface AttendanceEvaluation {
  status: 'on_time' | 'late';
  minutesLate: number;
  /** ISO timestamp of the scheduled start for that day. */
  scheduledStart: string;
}

export interface DepartureEvaluation {
  status: 'on_time' | 'early';
  minutesEarly: number;
  /** ISO timestamp of the scheduled closing for that day. */
  scheduledEnd: string;
}

export interface AttendanceResult {
  action: AttendanceAction;
  staff: Staff;
  log: AttendanceLog;
  /** Human-readable feedback shown in the kiosk modal. */
  message: string;
  /** Optional detail such as "Signed in 14 minutes late". */
  detail?: string;
}

export interface DailySummary {
  date: string;
  totalStaff: number;
  present: number;
  late: number;
  absent: number;
  clockedOut: number;
  earlyExit: number;
  records: StaffDayRecord[];
}

export type ExportRange = 'today' | 'month' | 'all';

export interface TimeValue {
  hours: number;
  minutes: number;
}
