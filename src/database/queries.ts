/** Typed data-access helpers. */

import * as FileSystem from 'expo-file-system';
import { STAFF_CODE_MAX_LENGTH } from '../config/app';
import type {
  AttendanceAuthMethod,
  AttendanceLog,
  ClockInStatus,
  ClockOutStatus,
  NewStaff,
  Schedule,
  Staff,
  StaffDeviceCredential,
} from '../types';
import { getDb } from './db';

const STAFF_CODE_LETTERS = 'ABCDEFGHJK';
const STAFF_CODE_DIGITS = '0123456789';

function normalizeStaffCode(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Find an unused two-character code. Excluding the current staff member keeps
 * an edit that leaves the code unchanged from generating a new one.
 */
export function generateUniqueStaffCode(excludeId?: number): string {
  const rows = excludeId
    ? getDb().getAllSync<{ staff_code: string | null }>(
        'SELECT staff_code FROM staff WHERE staff_code IS NOT NULL AND id != ?',
        [excludeId],
      )
    : getDb().getAllSync<{ staff_code: string | null }>(
        'SELECT staff_code FROM staff WHERE staff_code IS NOT NULL',
      );
  const used = new Set(rows.map((row) => normalizeStaffCode(row.staff_code)));
  for (const letter of STAFF_CODE_LETTERS) {
    for (const digit of STAFF_CODE_DIGITS) {
      const code = `${letter}${digit}`;
      if (!used.has(code)) {
        return code;
      }
    }
  }
  throw new Error(
    'All two-character staff codes are in use. Deactivate or delete an unused staff profile first.',
  );
}

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
  staff_pin_hash: string | null;
  staff_pin_salt: string | null;
  pin_failed_attempts: number;
  pin_locked_until: string | null;
  device_token: string | null;
  device_secret: string | null;
  device_paired_at: string | null;
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
  auth_method: AttendanceAuthMethod;
  is_manual_override: number;
  override_note: string | null;
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
  staffPinHash: row.staff_pin_hash,
  staffPinSalt: row.staff_pin_salt,
  pinFailedAttempts: row.pin_failed_attempts ?? 0,
  pinLockedUntil: row.pin_locked_until,
  deviceToken: row.device_token ?? null,
  devicePairedAt: row.device_paired_at ?? null,
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
  authMethod: row.auth_method ?? 'FACE_BIOMETRIC',
  isManualOverride: (row.is_manual_override ?? 0) === 1,
  overrideNote: row.override_note ?? null,
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
  const providedCode = normalizeStaffCode(input.staffCode);
  if (
    providedCode &&
    (providedCode.length !== STAFF_CODE_MAX_LENGTH ||
      !/^[ABCDEFGHJK][0-9]$/.test(providedCode))
  ) {
    throw new Error(
      `Staff code must be exactly ${STAFF_CODE_MAX_LENGTH} letters or numbers.`,
    );
  }
  const staffCode = providedCode || generateUniqueStaffCode();
  const result = getDb().runSync(
    `INSERT INTO staff
       (full_name, staff_code, photo_uri, face_signature, staff_pin_hash, staff_pin_salt, pin_failed_attempts, pin_locked_until, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 1, ?)`,
    [
      input.fullName.trim(),
      staffCode,
      input.photoUri,
      input.faceSignature,
      input.staffPinHash ?? null,
      input.staffPinSalt ?? null,
      createdAt,
    ],
  );
  const newId = Number(result.lastInsertRowId);
  const staff = getStaffById(newId);
  if (!staff) {
    throw new Error('Failed to create staff member.');
  }
  return staff;
}

export function updateStaff(id: number, input: NewStaff): Staff {
  const providedCode = normalizeStaffCode(input.staffCode);
  if (
    providedCode &&
    (providedCode.length !== STAFF_CODE_MAX_LENGTH ||
      !/^[ABCDEFGHJK][0-9]$/.test(providedCode))
  ) {
    throw new Error(
      `Staff code must be exactly ${STAFF_CODE_MAX_LENGTH} letters or numbers.`,
    );
  }
  const staffCode = providedCode || generateUniqueStaffCode(id);
  getDb().runSync(
    `UPDATE staff
     SET full_name = ?, staff_code = ?, photo_uri = ?, face_signature = ?, staff_pin_hash = ?, staff_pin_salt = ?
     WHERE id = ?`,
    [
      input.fullName.trim(),
      staffCode,
      input.photoUri,
      input.faceSignature,
      input.staffPinHash ?? null,
      input.staffPinSalt ?? null,
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

export function setStaffPhotoAndFaceSignature(
  id: number,
  photoUri: string | null,
  signature: string | null,
): void {
  getDb().runSync(
    'UPDATE staff SET photo_uri = ?, face_signature = ? WHERE id = ?',
    [photoUri, signature, id],
  );
}

/** The secret half of a paired phone credential. Never shown in the UI. */
export function getStaffDeviceCredential(
  id: number,
): StaffDeviceCredential | null {
  const row = getDb().getFirstSync<{
    device_token: string | null;
    device_public_key: string | null;
  }>('SELECT device_token, device_public_key FROM staff WHERE id = ?', [id]);
  if (!row?.device_token) {
    return null;
  }
  return { token: row.device_token, publicKey: row.device_public_key };
}

export function setStaffDeviceCredential(
  id: number,
  credential: StaffDeviceCredential,
): void {
  getDb().runSync(
    'UPDATE staff SET device_token = ?, device_public_key = ?, device_paired_at = ? WHERE id = ?',
    [
      credential.token,
      credential.publicKey,
      new Date().toISOString(),
      id,
    ],
  );
}

export function clearStaffDeviceCredential(id: number): void {
  getDb().runSync(
    'UPDATE staff SET device_token = NULL, device_secret = NULL, device_paired_at = NULL WHERE id = ?',
    [id],
  );
}

import * as Crypto from 'expo-crypto';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashStaffPinWithSalt(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = bytesToHex(await Crypto.getRandomBytes(16));
  let value = `${salt}:${pin}`;
  for (let i = 0; i < 1000; i += 1) {
    value = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      value,
    );
  }
  return { hash: value, salt };
}

export async function setStaffPin(id: number, pin: string): Promise<void> {
  const { hash, salt } = await hashStaffPinWithSalt(pin);
  getDb().runSync(
    'UPDATE staff SET staff_pin_hash = ?, staff_pin_salt = ?, pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = ?',
    [hash, salt, id],
  );
}

export function recordStaffPinFailure(id: number): void {
  const row = getDb().getFirstSync<{
    pin_failed_attempts: number;
    pin_locked_until: string | null;
  }>('SELECT pin_failed_attempts, pin_locked_until FROM staff WHERE id = ?', [id]);
  const attempts = (row?.pin_failed_attempts ?? 0) + 1;
  let lockedUntil: string | null = null;
  if (attempts >= 5) {
    lockedUntil = new Date(Date.now() + 30 * 1000).toISOString();
  }
  getDb().runSync(
    'UPDATE staff SET pin_failed_attempts = ?, pin_locked_until = ? WHERE id = ?',
    [attempts, lockedUntil, id],
  );
}

export function resetStaffPinFailures(id: number): void {
  getDb().runSync(
    'UPDATE staff SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = ?',
    [id],
  );
}

/** Clear a staff member's fallback PIN so they must set a new one. */
export function resetStaffPin(id: number): void {
  getDb().runSync(
    'UPDATE staff SET staff_pin_hash = NULL, staff_pin_salt = NULL, pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = ?',
    [id]
  );
}

/** Permanently deletes facial template/photo from the staff record and
 *  removes the photo file from disk, while retaining past clock-in logs
 *  under an archived (inactive) status. */
export async function deleteStaffProfile(id: number): Promise<void> {
  const staff = getStaffById(id);
  // Update the database first (the columns are face_signature / photo_uri;
  // the old camelCase names made this statement fail every time), then remove
  // the photo file, which is best-effort only.
  getDb().runSync(
    'UPDATE staff SET is_active = 0, face_signature = NULL, photo_uri = NULL, device_token = NULL, device_secret = NULL, device_paired_at = NULL WHERE id = ?',
    [id]
  );
  if (staff?.photoUri) {
    try {
      await FileSystem.deleteAsync(staff.photoUri, { idempotent: true });
    } catch {
      // Photo cleanup is best-effort only.
    }
  }
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
  authMethod: AttendanceAuthMethod;
  isManualOverride?: boolean;
  overrideNote?: string | null;
}): AttendanceLog {
  const result = getDb().runSync(
    `INSERT INTO attendance_logs
       (staff_id, date, clock_in_time, clock_in_status, minutes_late, minutes_early, auth_method,
        is_manual_override, override_note)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      params.staffId,
      params.date,
      params.clockInTime,
      params.status,
      params.minutesLate,
      params.authMethod,
      params.isManualOverride ? 1 : 0,
      params.overrideNote ?? null,
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

/** Replace an existing clock-in (used for admin corrections). */
export function updateClockIn(params: {
  logId: number;
  clockInTime: string;
  status: ClockInStatus;
  minutesLate: number;
  authMethod: AttendanceAuthMethod;
  isManualOverride?: boolean;
  overrideNote?: string | null;
}): AttendanceLog {
  const assignments = [
    'clock_in_time = ?',
    'clock_in_status = ?',
    'minutes_late = ?',
    'auth_method = ?',
  ];
  const values: Array<string | number | null> = [
    params.clockInTime,
    params.status,
    params.minutesLate,
    params.authMethod,
  ];
  if (params.isManualOverride !== undefined) {
    assignments.push('is_manual_override = ?', 'override_note = ?');
    values.push(
      params.isManualOverride ? 1 : 0,
      params.overrideNote ?? null,
    );
  }
  values.push(params.logId);
  getDb().runSync(
    `UPDATE attendance_logs SET ${assignments.join(', ')} WHERE id = ?`,
    values,
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

export function updateClockOut(params: {
  logId: number;
  clockOutTime: string;
  status: ClockOutStatus;
  minutesEarly: number;
  authMethod: AttendanceAuthMethod;
  isManualOverride?: boolean;
  overrideNote?: string | null;
}): AttendanceLog {
  const assignments = [
    'clock_out_time = ?',
    'clock_out_status = ?',
    'minutes_early = ?',
    'auth_method = ?',
  ];
  const values: Array<string | number | null> = [
    params.clockOutTime,
    params.status,
    params.minutesEarly,
    params.authMethod,
  ];
  if (params.isManualOverride !== undefined) {
    assignments.push('is_manual_override = ?', 'override_note = ?');
    values.push(
      params.isManualOverride ? 1 : 0,
      params.overrideNote ?? null,
    );
  }
  values.push(params.logId);
  getDb().runSync(
    `UPDATE attendance_logs SET ${assignments.join(', ')} WHERE id = ?`,
    values,
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
  /** Null means the staff member has no attendance record for that date. */
  log: AttendanceLog | null;
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
  auth_method: AttendanceAuthMethod;
  is_manual_override: number;
  override_note: string | null;
  staff_pk: number;
  full_name: string;
  staff_code: string | null;
  photo_uri: string | null;
  face_signature: string | null;
  staff_pin_hash: string | null;
  staff_pin_salt: string | null;
  pin_failed_attempts: number;
  pin_locked_until: string | null;
  device_token: string | null;
  device_secret: string | null;
  device_paired_at: string | null;
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
       l.auth_method,
       l.is_manual_override,
       l.override_note,
       s.id AS staff_pk,
       s.full_name,
       s.staff_code,
       s.photo_uri,
       s.face_signature,
       s.staff_pin_hash,
       s.staff_pin_salt,
       s.pin_failed_attempts,
       s.pin_locked_until,
       s.device_token,
       s.device_secret,
       s.device_paired_at,
       s.is_active,
       s.created_at
     FROM attendance_logs l
     JOIN staff s ON s.id = l.staff_id
     WHERE l.date = ?
     ORDER BY s.full_name COLLATE NOCASE ASC`,
    [date],
  );

  const entries: AttendanceWithStaffRow[] = rows.map((row) => ({
    staff: mapStaff({
      id: row.staff_pk,
      full_name: row.full_name,
      staff_code: row.staff_code,
      photo_uri: row.photo_uri,
      face_signature: row.face_signature,
      staff_pin_hash: row.staff_pin_hash,
      staff_pin_salt: row.staff_pin_salt,
      pin_failed_attempts: row.pin_failed_attempts ?? 0,
      pin_locked_until: row.pin_locked_until,
      device_token: row.device_token,
      device_secret: row.device_secret,
      device_paired_at: row.device_paired_at,
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
      auth_method: row.auth_method,
      is_manual_override: row.is_manual_override,
      override_note: row.override_note,
    }),
  }));

  // The attendance screen also lists active staff who have not scanned yet so
  // an admin can add a manual clock-in for them. Staff created after the
  // selected date are excluded, and everyone already in a log is skipped.
  const loggedStaffIds = new Set(rows.map((row) => row.staff_id));
  const activeStaff = getDb().getAllSync<StaffRow>(
    `SELECT * FROM staff
     WHERE is_active = 1
       AND substr(created_at, 1, 10) <= ?
     ORDER BY full_name COLLATE NOCASE ASC`,
    [date],
  );
  for (const member of activeStaff) {
    if (!loggedStaffIds.has(member.id)) {
      entries.push({ staff: mapStaff(member), log: null });
    }
  }

  entries.sort((a, b) =>
    a.staff.fullName.localeCompare(b.staff.fullName, undefined, {
      sensitivity: 'base',
    }),
  );
  return entries;
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
