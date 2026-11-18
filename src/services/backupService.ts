import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';

import { DATABASE_NAME, getDb } from '../database/db';

const SQLITE_DIR = `${FileSystem.documentDirectory ?? ''}SQLite/`;
const BACKUP_MIME = 'application/octet-stream';

export interface BackupResult {
  uri: string;
  fileName: string;
  shared: boolean;
}

export interface BackupStaffRow {
  id: number;
  full_name: string;
  staff_code: string | null;
  photo_uri: string | null;
  face_signature: string | null;
  face_embeddings: string | null;
  similar_group_id: string | null;
  requires_pin: number;
  personal_pin_hash: string | null;
  personal_pin_salt: string | null;
  personal_pin_failed_attempts: number;
  personal_pin_locked_until: number | null;
  staff_pin_hash: string | null;
  staff_pin_salt: string | null;
  pin_failed_attempts: number;
  pin_locked_until: string | null;
  device_token: string | null;
  device_secret: string | null;
  device_public_key: string | null;
  device_paired_at: string | null;
  is_active: number;
  created_at: string;
}

export interface BackupAttendanceRow {
  id: number;
  staff_id: number;
  date: string;
  clock_in_time: string;
  clock_in_status: string;
  minutes_late: number;
  clock_out_time: string | null;
  clock_out_status: string | null;
  minutes_early: number;
  auth_method: string;
  is_manual_override: number;
  override_note: string | null;
}

export interface ImportConflict {
  staffCode: string;
  backupName: string;
  existingName: string;
  backupStaffId: number;
  existingStaffId: number;
}

export interface BackupImportSummary {
  importedStaff: number;
  importedLogs: number;
  conflicts: ImportConflict[];
  /** Staff/logs imported when conflicts were replaced. */
  replacedStaff: number;
  mergedLogs: number;
}

function todayStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function normalizeCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function ensureSqliteDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(SQLITE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true });
  }
}

/** Export the current database as a shareable backup file. */
export async function exportDatabaseBackup(): Promise<BackupResult> {
  const db = getDb();
  try {
    db.execSync('PRAGMA wal_checkpoint(FULL);');
  } catch {
    // Best effort; copying the main DB still works in most cases.
  }

  const sourceUri = `${SQLITE_DIR}${DATABASE_NAME}`;
  const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
  if (!sourceInfo.exists) {
    throw new Error('The local database could not be found on this device.');
  }

  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory) {
    throw new Error('No writable directory is available on this device.');
  }

  const fileName = `DayStaff-backup-${todayStamp()}.db`;
  const uri = `${baseDirectory}${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: uri });

  let shared = false;
  try {
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(uri, {
        mimeType: BACKUP_MIME,
        dialogTitle: 'Save DayStaff backup',
        UTI: 'public.database',
      });
      shared = true;
    }
  } catch {
    shared = false;
  }

  return { uri, fileName, shared };
}

export interface PickedBackup {
  uri: string;
  name: string;
  canceled: false;
}

export type PickBackupResult = PickedBackup | { canceled: true };

/** Let the user choose a backup file from device storage. */
export async function pickBackupFile(): Promise<PickBackupResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) {
    return { canceled: true };
  }
  const asset = result.assets[0];
  return { canceled: false, uri: asset.uri, name: asset.name ?? 'backup.db' };
}

export interface BackupSnapshot {
  staff: BackupStaffRow[];
  logs: BackupAttendanceRow[];
}



async function openAndReadBackup(pickedUri: string): Promise<BackupSnapshot> {
  await ensureSqliteDir();
  const tempName = `import_${Date.now()}_${Math.random().toString(36).slice(2)}.db`;
  const tempUri = `${SQLITE_DIR}${tempName}`;
  await FileSystem.copyAsync({ from: pickedUri, to: tempUri });
  let backupDb: SQLite.SQLiteDatabase | null = null;
  try {
    backupDb = SQLite.openDatabaseSync(tempName);
    const staffCols = new Set(
      backupDb
        .getAllSync<{ name: string }>('PRAGMA table_info(staff)')
        .map((c) => c.name),
    );
    if (!staffCols.has('id') || !staffCols.has('full_name')) {
      throw new Error('This file is not a valid DayStaff backup.');
    }
    const has = (col: string) => staffCols.has(col);
    const staff = backupDb.getAllSync<any>(
      `SELECT
         id,
         full_name,
         ${has('staff_code') ? 'staff_code' : 'NULL AS staff_code'},
         ${has('photo_uri') ? 'photo_uri' : 'NULL AS photo_uri'},
         ${has('face_signature') ? 'face_signature' : 'NULL AS face_signature'},
          ${has('face_embeddings') ? 'face_embeddings' : 'NULL AS face_embeddings'},
          ${has('similar_group_id') ? 'similar_group_id' : 'NULL AS similar_group_id'},
          ${has('requires_pin') ? 'requires_pin' : '0 AS requires_pin'},
          ${has('personal_pin_hash') ? 'personal_pin_hash' : 'NULL AS personal_pin_hash'},
          ${has('personal_pin_salt') ? 'personal_pin_salt' : 'NULL AS personal_pin_salt'},
          ${has('personal_pin_failed_attempts') ? 'personal_pin_failed_attempts' : '0 AS personal_pin_failed_attempts'},
          ${has('personal_pin_locked_until') ? 'personal_pin_locked_until' : 'NULL AS personal_pin_locked_until'},
         ${has('staff_pin_hash') ? 'staff_pin_hash' : 'NULL AS staff_pin_hash'},
         ${has('staff_pin_salt') ? 'staff_pin_salt' : 'NULL AS staff_pin_salt'},
         ${has('pin_failed_attempts') ? 'pin_failed_attempts' : '0 AS pin_failed_attempts'},
         ${has('pin_locked_until') ? 'pin_locked_until' : 'NULL AS pin_locked_until'},
         ${has('device_token') ? 'device_token' : 'NULL AS device_token'},
         ${has('device_secret') ? 'device_secret' : 'NULL AS device_secret'},
         ${has('device_public_key') ? 'device_public_key' : 'NULL AS device_public_key'},
         ${has('device_paired_at') ? 'device_paired_at' : 'NULL AS device_paired_at'},
         ${has('is_active') ? 'is_active' : '1 AS is_active'},
         ${has('created_at') ? 'created_at' : "datetime('now') AS created_at"}
       FROM staff`,
    ) as BackupStaffRow[];

    const logCols = new Set(
      backupDb
        .getAllSync<{ name: string }>('PRAGMA table_info(attendance_logs)')
        .map((c) => c.name),
    );
    let logs: BackupAttendanceRow[] = [];
    if (logCols.has('id') && logCols.has('staff_id') && logCols.has('date')) {
      const lh = (col: string) => logCols.has(col);
      logs = backupDb.getAllSync<any>(
        `SELECT
           id,
           staff_id,
           date,
           ${lh('clock_in_time') ? 'clock_in_time' : "date || 'T00:00:00.000Z' AS clock_in_time"},
           ${lh('clock_in_status') ? 'clock_in_status' : "'on_time' AS clock_in_status"},
           ${lh('minutes_late') ? 'minutes_late' : '0 AS minutes_late'},
           ${lh('clock_out_time') ? 'clock_out_time' : 'NULL AS clock_out_time'},
           ${lh('clock_out_status') ? 'clock_out_status' : 'NULL AS clock_out_status'},
           ${lh('minutes_early') ? 'minutes_early' : '0 AS minutes_early'},
           ${lh('auth_method') ? 'auth_method' : "'FACE_BIOMETRIC' AS auth_method"},
           ${lh('is_manual_override') ? 'is_manual_override' : '0 AS is_manual_override'},
           ${lh('override_note') ? 'override_note' : 'NULL AS override_note'}
         FROM attendance_logs`,
      ) as BackupAttendanceRow[];
    }

    return { staff, logs };
  } finally {
    try {
      backupDb?.closeSync();
    } catch {
      // ignore
    }
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    // Also clean WAL/SHM if created
    await FileSystem.deleteAsync(`${tempUri}-wal`, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(`${tempUri}-shm`, { idempotent: true }).catch(() => {});
  }
}

function getCurrentStaffByCode(): Map<string, { id: number; fullName: string }> {
  const rows = getDb().getAllSync<{ id: number; full_name: string; staff_code: string | null }>(
    'SELECT id, full_name, staff_code FROM staff',
  );
  const map = new Map<string, { id: number; fullName: string }>();
  for (const row of rows) {
    const code = normalizeCode(row.staff_code);
    if (code) {
      map.set(code, { id: row.id, fullName: row.full_name });
    }
  }
  return map;
}

function insertImportedLogs(
  oldStaffId: number,
  newStaffId: number,
  logsByStaff: Map<number, BackupAttendanceRow[]>,
): number {
  const logs = logsByStaff.get(oldStaffId) ?? [];
  let inserted = 0;
  for (const log of logs) {
    try {
      const result = getDb().runSync(
        `INSERT OR IGNORE INTO attendance_logs
           (staff_id, date, clock_in_time, clock_in_status, minutes_late, clock_out_time, clock_out_status, minutes_early, auth_method, is_manual_override, override_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newStaffId,
          String(log.date),
          String(log.clock_in_time),
          (log.clock_in_status as string) || 'on_time',
          Number(log.minutes_late ?? 0),
          log.clock_out_time ?? null,
          log.clock_out_status ?? null,
          Number(log.minutes_early ?? 0),
          (log.auth_method as string) || 'FACE_BIOMETRIC',
          Number(log.is_manual_override ?? 0) ? 1 : 0,
          log.override_note ?? null,
        ],
      );
      if (result.changes > 0) {
        inserted += 1;
      }
    } catch {
      // skip bad rows
    }
  }
  return inserted;
}

/** Analyze a backup and import non-conflicting staff. */
export async function importBackupMerge(
  pickedUri: string,
): Promise<{ summary: BackupImportSummary; snapshot: BackupSnapshot; idMap: Map<number, number> }> {
  const snapshot = await openAndReadBackup(pickedUri);
  const logsByStaff = new Map<number, BackupAttendanceRow[]>();
  for (const log of snapshot.logs) {
    const list = logsByStaff.get(log.staff_id) ?? [];
    list.push(log);
    logsByStaff.set(log.staff_id, list);
  }

  const currentByCode = getCurrentStaffByCode();
  const conflicts: ImportConflict[] = [];
  const toImport: BackupStaffRow[] = [];
  const seenBackupCodes = new Set<string>();

  for (const staff of snapshot.staff) {
    const code = normalizeCode(staff.staff_code);
    if (!code) {
      // Staff without valid code can't be keyed on kiosk; still import with generated behavior? skip to be safe
      continue;
    }
    if (seenBackupCodes.has(code)) {
      // duplicate within backup, keep first
      continue;
    }
    seenBackupCodes.add(code);
    const existing = currentByCode.get(code);
    if (existing) {
      conflicts.push({
        staffCode: code,
        backupName: staff.full_name,
        existingName: existing.fullName,
        backupStaffId: staff.id,
        existingStaffId: existing.id,
      });
    } else {
      toImport.push(staff);
    }
  }

  let importedStaff = 0;
  let importedLogs = 0;
  const idMap = new Map<number, number>(); // backup staff id -> current staff id

  getDb().withTransactionSync(() => {
    for (const staff of toImport) {
      const code = normalizeCode(staff.staff_code);
      try {
        const result = getDb().runSync(
           `INSERT INTO staff
             (full_name, staff_code, photo_uri, face_signature, face_embeddings, staff_pin_hash, staff_pin_salt,
              pin_failed_attempts, pin_locked_until, similar_group_id, requires_pin, personal_pin_hash, personal_pin_salt,
              personal_pin_failed_attempts, personal_pin_locked_until, device_token, device_secret, device_public_key,
              device_paired_at, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
           [
             staff.full_name,
             code,
             staff.photo_uri ?? null,
             staff.face_signature ?? null,
             staff.face_embeddings ?? null,
             staff.staff_pin_hash ?? null,
             staff.staff_pin_salt ?? null,
             Number(staff.pin_failed_attempts ?? 0),
             staff.pin_locked_until ?? null,
             staff.similar_group_id ?? null,
             Number(staff.requires_pin ?? 0) ? 1 : 0,
             staff.personal_pin_hash ?? null,
             staff.personal_pin_salt ?? null,
             Number(staff.personal_pin_failed_attempts ?? 0),
             staff.personal_pin_locked_until ?? null,
             staff.device_token ?? null,
             staff.device_secret ?? null,
             staff.device_public_key ?? null,
             staff.device_paired_at ?? null,
             staff.is_active ? 1 : 0,
             staff.created_at || new Date().toISOString(),
           ],
        );
        const newId = Number(result.lastInsertRowId);
        idMap.set(staff.id, newId);
        importedStaff += 1;
        importedLogs += insertImportedLogs(staff.id, newId, logsByStaff);
      } catch {
        // If insert fails (e.g. code race), skip
      }
    }
  });

  return {
    summary: {
      importedStaff,
      importedLogs,
      conflicts,
      replacedStaff: 0,
      mergedLogs: 0,
    },
    snapshot,
    idMap,
  };
}

/** Replace conflicting existing staff with backup versions and merge their logs. */
export function replaceConflictingStaff(
  conflicts: ImportConflict[],
  snapshot: BackupSnapshot,
): { replacedStaff: number; mergedLogs: number } {
  const backupStaffById = new Map(snapshot.staff.map((s) => [s.id, s]));
  const logsByStaff = new Map<number, BackupAttendanceRow[]>();
  for (const log of snapshot.logs) {
    const list = logsByStaff.get(log.staff_id) ?? [];
    list.push(log);
    logsByStaff.set(log.staff_id, list);
  }

  let replacedStaff = 0;
  let mergedLogs = 0;

  getDb().withTransactionSync(() => {
    for (const conflict of conflicts) {
      const backup = backupStaffById.get(conflict.backupStaffId);
      if (!backup) continue;
      const code = normalizeCode(backup.staff_code) || conflict.staffCode;
      try {
        getDb().runSync(
          `UPDATE staff SET
             full_name = ?,
             staff_code = ?,
             photo_uri = ?,
             face_signature = ?,
             staff_pin_hash = ?,
             staff_pin_salt = ?,
             pin_failed_attempts = ?,
             pin_locked_until = ?,
             device_token = ?,
             device_secret = ?,
             device_public_key = ?,
             device_paired_at = ?,
             is_active = ?,
             created_at = ?
           WHERE id = ?`,
          [
            backup.full_name,
            code,
            backup.photo_uri ?? null,
            backup.face_signature ?? null,
            backup.staff_pin_hash ?? null,
            backup.staff_pin_salt ?? null,
            Number(backup.pin_failed_attempts ?? 0),
            backup.pin_locked_until ?? null,
            backup.device_token ?? null,
            backup.device_secret ?? null,
            backup.device_public_key ?? null,
            backup.device_paired_at ?? null,
            backup.is_active ? 1 : 0,
            backup.created_at || new Date().toISOString(),
            conflict.existingStaffId,
          ],
        );
        replacedStaff += 1;
        mergedLogs += insertImportedLogs(
          backup.id,
          conflict.existingStaffId,
          logsByStaff,
        );
      } catch {
        // skip
      }
    }
  });

  return { replacedStaff, mergedLogs };
}
