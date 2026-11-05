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

export type AttendanceAction = 'clock_in' | 'clock_out' | 'already_completed';

export interface Staff {
  id: number;
  fullName: string;
  phoneNumber: string;
  photoUri: string | null;
  isActive: number;
  createdAt: string;
}

export interface NewStaff {
  fullName: string;
  phoneNumber: string;
  photoUri: string | null;
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
