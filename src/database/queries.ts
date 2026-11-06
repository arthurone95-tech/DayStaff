/** Typed data-access helpers. */

import type {
  AttendanceLog,
  ClockInStatus,
  ClockOutStatus,
  NewStaff,
  Schedule,
  Staff,
} from '../types';
import { getDb } from './db';

export const DEFAULT_SCHEDULE: Schedule = {
  startTime: '07:00',
  lateThresholdMinutes: 0,
  endTime: '15:00',
  updatedAt: new Date(0).toISOString(),
};

interface StaffRow {
  id: number;
  full_name: string;
  staff_code: string | null;
  photo_uri: string | null;
  face_signature: string | null;
  fingerprint_signature: string | null;
  is_active: number;
  created_at: string;
}

interface ScheduleRow {
  id: number;
  start_time: string;
  late_threshold_minutes: number;
  end_time: string;
  updated_at: string;
}

interface AttendanceRow {
  id: number;
  staff_id: number;
  date: string;
  clock_in_time: string;
  clock_in_status: ClockInStatus;
  minutes_late: number;
  clock_out_time: string | null;
  clock_out_status: ClockOutStatus | null;
  minutes_early: number;
}

interface ExportRow extends AttendanceRow {
  full_name: string;
  staff_code: string | null;
}

const mapStaff = (row: StaffRow): Staff => ({
  id: row.id,
  fullName: row.full_name,
  staffCode: row.staff_code ?? '',
  photoUri: row.photo_uri,
  faceSignature: row.face_signature,
  fingerprintSignature: row.fingerprint_signature,
  isActive: row.is_active,
  createdAt: row.created_at,
});

const mapLog = (row: AttendanceRow): AttendanceLog => ({
  id: row.id,
  staffId: row.staff_id,
  date: row.date,
  clockInTime: row.clock_in_time,
  clockInStatus: row.clock_in_status,
  minutesLate: row.minutes_late,
  clockOutTime: row.clock_out_time,
  clockOutStatus: row.clock_out_status,
  minutesEarly: row.minutes_early,
});

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export function getActiveStaff(): Staff[] {
  const rows = getDb().getAllSync<StaffRow>(
    `SELECT * FROM staff
     WHERE is_active = 1
     ORDER BY full_name COLLATE NOCASE ASC`,
  );
  return rows.map(mapStaff);
}

export function getAllStaff(): Staff[] {
  const rows = getDb().getAllSync<StaffRow>(
    `SELECT * FROM staff ORDER BY is_active DESC, full_name COLLATE NOCASE ASC`,
  );
  return rows.map(mapStaff);
}

export function getStaffById(id: number): Staff | null {
  const row = getDb().getFirstSync<StaffRow>(
    'SELECT * FROM staff WHERE id = ?',
    [id],
  );
  return row ? mapStaff(row) : null;
}

export function getStaffByCode(code: string): Staff | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  const row = getDb().getFirstSync<StaffRow>(
    'SELECT * FROM staff WHERE upper(staff_code) = ? LIMIT 1',
    [normalized],
  );
  return row ? mapStaff(row) : null;
}

/** Case-insensitive uniqueness check used by registration/edit. */
export function isStaffCodeTaken(code: string, excludeId?: number): boolean {
  const normalized = code.trim().toUpperCase();
  const row = excludeId
    ? getDb().getFirstSync<{ id: number }>(
        'SELECT id FROM staff WHERE upper(staff_code) = ? AND id != ? LIMIT 1',
        [normalized, excludeId],
      )
    : getDb().getFirstSync<{ id: number }>(
        'SELECT id FROM staff WHERE upper(staff_code) = ? LIMIT 1',
        [normalized],
      );
  return Boolean(row);
}

export function createStaff(input: NewStaff): Staff {
  const createdAt = new Date().toISOString();
  const result = getDb().runSync(
    `INSERT INTO staff
       (full_name, staff_code, photo_uri, face_signature, fingerprint_signature, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [
      input.fullName.trim(),
      input.staffCode.trim().toUpperCase(),
      input.photoUri,
      input.faceSignature,
      input.fingerprintSignature,
      createdAt,
    ],
  );
  const staff = getStaffById(Number(result.lastInsertRowId));
  if (!staff) {
    throw new Error('Failed to create staff member.');
  }
  return staff;
}

export function updateStaff(id: number, input: NewStaff): Staff {
  getDb().runSync(
    `UPDATE staff
     SET full_name = ?, staff_code = ?, photo_uri = ?, face_signature = ?, fingerprint_signature = ?
     WHERE id = ?`,
    [
      input.fullName.trim(),
      input.staffCode.trim().toUpperCase(),
      input.photoUri,
      input.faceSignature,
      input.fingerprintSignature,
      id,
    ],
  );
  const staff = getStaffById(id);
  if (!staff) {
    throw new Error('Staff member not found.');
  }
  return staff;
}

export function setStaffActive(id: number, active: boolean): void {
  getDb().runSync('UPDATE staff SET is_active = ? WHERE id = ?', [
    active ? 1 : 0,
    id,
  ]);
}

export function setStaffFaceSignature(
  id: number,
  signature: string | null,
): void {
  getDb().runSync('UPDATE staff SET face_signature = ? WHERE id = ?', [
    signature,
    id,
  ]);
}

export function setStaffFingerprintSignature(
  id: number,
  signature: string | null,
): void {
  getDb().runSync('UPDATE staff SET fingerprint_signature = ? WHERE id = ?', [
    signature,
    id,
  ]);
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export function getSchedule(): Schedule {
  const row = getDb().getFirstSync<ScheduleRow>(
    'SELECT * FROM schedules WHERE id = 1',
  );
  if (row) {
    return {
      startTime: row.start_time,
      lateThresholdMinutes: row.late_threshold_minutes,
      endTime: row.end_time,
      updatedAt: row.updated_at,
    };
  }

  const now = new Date().toISOString();
  saveSchedule(DEFAULT_SCHEDULE);
  return { ...DEFAULT_SCHEDULE, updatedAt: now };
}

export function saveSchedule(schedule: Omit<Schedule, 'updatedAt'>): Schedule {
  const updatedAt = new Date().toISOString();
  getDb().runSync(
    `INSERT INTO schedules (id, start_time, late_threshold_minutes, end_time, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       start_time = excluded.start_time,
       late_threshold_minutes = excluded.late_threshold_minutes,
       end_time = excluded.end_time,
       updated_at = excluded.updated_at`,
    [
      schedule.startTime,
      schedule.lateThresholdMinutes,
      schedule.endTime,
      updatedAt,
    ],
  );
  return { ...schedule, updatedAt };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export function getLogForStaffOnDate(
  staffId: number,
  date: string,
): AttendanceLog | null {
  const row = getDb().getFirstSync<AttendanceRow>(
    'SELECT * FROM attendance_logs WHERE staff_id = ? AND date = ?',
    [staffId, date],
  );
  return row ? mapLog(row) : null;
}

export function getLogsForDate(date: string): AttendanceLog[] {
  const rows = getDb().getAllSync<AttendanceRow>(
    `SELECT * FROM attendance_logs
     WHERE date = ?
     ORDER BY clock_in_time ASC`,
    [date],
  );
  return rows.map(mapLog);
}

export function getLogsBetween(
  startDate: string,
  endDate: string,
): AttendanceLog[] {
  const rows = getDb().getAllSync<AttendanceRow>(
    `SELECT * FROM attendance_logs
     WHERE date BETWEEN ? AND ?
     ORDER BY date ASC, clock_in_time ASC`,
    [startDate, endDate],
  );
  return rows.map(mapLog);
}

export function insertClockIn(params: {
  staffId: number;
  date: string;
  clockInTime: string;
  status: ClockInStatus;
  minutesLate: number;
}): AttendanceLog {
  const result = getDb().runSync(
    `INSERT INTO attendance_logs
       (staff_id, date, clock_in_time, clock_in_status, minutes_late, minutes_early)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [
      params.staffId,
      params.date,
      params.clockInTime,
      params.status,
      params.minutesLate,
    ],
  );
  const log = getDb().getFirstSync<AttendanceRow>(
    'SELECT * FROM attendance_logs WHERE id = ?',
    [Number(result.lastInsertRowId)],
  );
  if (!log) {
    throw new Error('Failed to record clock-in.');
  }
  return mapLog(log);
}

export function updateClockOut(params: {
  logId: number;
  clockOutTime: string;
  status: ClockOutStatus;
  minutesEarly: number;
}): AttendanceLog {
  getDb().runSync(
    `UPDATE attendance_logs
     SET clock_out_time = ?, clock_out_status = ?, minutes_early = ?
     WHERE id = ?`,
    [params.clockOutTime, params.status, params.minutesEarly, params.logId],
  );
  const log = getDb().getFirstSync<AttendanceRow>(
    'SELECT * FROM attendance_logs WHERE id = ?',
    [params.logId],
  );
  if (!log) {
    throw new Error('Attendance record not found.');
  }
  return mapLog(log);
}

export interface AttendanceWithStaffRow {
  staff: Staff;
  log: AttendanceLog;
}

interface AttendanceWithStaffSqlRow {
  log_id: number;
  staff_id: number;
  date: string;
  clock_in_time: string;
  clock_in_status: ClockInStatus;
  minutes_late: number;
  clock_out_time: string | null;
  clock_out_status: ClockOutStatus | null;
  minutes_early: number;
  staff_pk: number;
  full_name: string;
  staff_code: string | null;
  photo_uri: string | null;
  face_signature: string | null;
  fingerprint_signature: string | null;
  is_active: number;
  created_at: string;
}

/**
 * All attendance records for one local date, joined with the staff profile.
 * Inactive staff remain visible in history if they have a record for the day.
 */
export function getAttendanceWithStaffForDate(
  date: string,
): AttendanceWithStaffRow[] {
  const rows = getDb().getAllSync<AttendanceWithStaffSqlRow>(
    `SELECT
       l.id AS log_id,
       l.staff_id,
       l.date,
       l.clock_in_time,
       l.clock_in_status,
       l.minutes_late,
       l.clock_out_time,
       l.clock_out_status,
       l.minutes_early,
       s.id AS staff_pk,
       s.full_name,
       s.staff_code,
       s.photo_uri,
       s.face_signature,
       s.is_active,
       s.created_at
     FROM attendance_logs l
     JOIN staff s ON s.id = l.staff_id
     WHERE l.date = ?
     ORDER BY s.full_name COLLATE NOCASE ASC`,
    [date],
  );

  return rows.map((row) => ({
    staff: mapStaff({
      id: row.staff_pk,
      full_name: row.full_name,
      staff_code: row.staff_code,
      photo_uri: row.photo_uri,
      face_signature: row.face_signature,
      fingerprint_signature: row.fingerprint_signature,
      is_active: row.is_active,
      created_at: row.created_at,
    }),
    log: mapLog({
      id: row.log_id,
      staff_id: row.staff_id,
      date: row.date,
      clock_in_time: row.clock_in_time,
      clock_in_status: row.clock_in_status,
      minutes_late: row.minutes_late,
      clock_out_time: row.clock_out_time,
      clock_out_status: row.clock_out_status,
      minutes_early: row.minutes_early,
    }),
  }));
}

/** Distinct dates that have at least one attendance record. */
export function getAttendanceDateKeys(): string[] {
  const rows = getDb().getAllSync<{ date: string }>(
    `SELECT DISTINCT date
     FROM attendance_logs
     ORDER BY date DESC`,
  );
  return rows.map((row) => row.date);
}

export interface ExportLogRow {
  log: AttendanceLog;
  staffName: string;
  staffCode: string;
}

export function getExportLogs(
  startDate: string,
  endDate: string,
): ExportLogRow[] {
  const rows = getDb().getAllSync<ExportRow>(
    `SELECT l.*, s.full_name, s.staff_code
     FROM attendance_logs l
     JOIN staff s ON s.id = l.staff_id
     WHERE l.date BETWEEN ? AND ?
     ORDER BY l.date ASC, s.full_name COLLATE NOCASE ASC`,
    [startDate, endDate],
  );
  return rows.map((row) => ({
    log: mapLog(row),
    staffName: row.full_name,
    staffCode: row.staff_code ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSetting(key: string): string | null {
  const row = getDb().getFirstSync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb().runSync(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
