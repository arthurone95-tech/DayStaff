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
  phone_number: string;
  photo_uri: string | null;
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
  phone_number: string;
}

const mapStaff = (row: StaffRow): Staff => ({
  id: row.id,
  fullName: row.full_name,
  phoneNumber: row.phone_number,
  photoUri: row.photo_uri,
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

export function createStaff(input: NewStaff): Staff {
  const createdAt = new Date().toISOString();
  const result = getDb().runSync(
    `INSERT INTO staff (full_name, phone_number, photo_uri, is_active, created_at)
     VALUES (?, ?, ?, 1, ?)`,
    [input.fullName.trim(), input.phoneNumber.trim(), input.photoUri, createdAt],
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
     SET full_name = ?, phone_number = ?, photo_uri = ?
     WHERE id = ?`,
    [input.fullName.trim(), input.phoneNumber.trim(), input.photoUri, id],
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

export interface ExportLogRow {
  log: AttendanceLog;
  staffName: string;
  phoneNumber: string;
}

export function getExportLogs(
  startDate: string,
  endDate: string,
): ExportLogRow[] {
  const rows = getDb().getAllSync<ExportRow>(
    `SELECT l.*, s.full_name, s.phone_number
     FROM attendance_logs l
     JOIN staff s ON s.id = l.staff_id
     WHERE l.date BETWEEN ? AND ?
     ORDER BY l.date ASC, s.full_name COLLATE NOCASE ASC`,
    [startDate, endDate],
  );
  return rows.map((row) => ({
    log: mapLog(row),
    staffName: row.full_name,
    phoneNumber: row.phone_number,
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
