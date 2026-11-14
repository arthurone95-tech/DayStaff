/**
 * SQLite connection, pragmas and schema migrations.
 *
 * Uses the synchronous expo-sqlite API so screens can read local data
 * without async waterfalls.
 */

import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'daystaff_v2.db';
const SCHEMA_VERSION = 6;

/** Two-character alphabet for staff short codes (36 x 36 = 1,296 codes). */
const STAFF_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let connection: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (connection) {
    return connection;
  }

  const db = SQLite.openDatabaseSync(DATABASE_NAME);
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');
  migrate(db);
  // Runs on every launch, even when the schema version is already current,
  // so a database stamped by an older build can never be missing a column.
  ensureStaffColumns(db);
  ensureAttendanceColumns(db);
  console.log('[DayStaff] database ready:', DATABASE_NAME);
  connection = db;
  return db;
}

/** Add any staff columns that an older database is missing. Idempotent. */
function ensureStaffColumns(db: SQLite.SQLiteDatabase): void {
  const names = new Set(
    db
      .getAllSync<{ name: string }>('PRAGMA table_info(staff)')
      .map((column) => column.name),
  );
  const needed: Array<[string, string]> = [
    ['staff_code', 'TEXT'],
    ['face_signature', 'TEXT'],
    ['staff_pin_hash', 'TEXT'],
    ['staff_pin_salt', 'TEXT'],
    ['pin_failed_attempts', 'INTEGER NOT NULL DEFAULT 0'],
    ['pin_locked_until', 'TEXT'],
    ['device_token', 'TEXT'],
    ['device_secret', 'TEXT'],
    ['device_public_key', 'TEXT'],
    ['device_paired_at', 'TEXT'],
  ];
  for (const [name, type] of needed) {
    if (!names.has(name)) {
      db.execSync(`ALTER TABLE staff ADD COLUMN ${name} ${type};`);
    }
  }
}

/** Add the attendance auth-method column to databases created before v5. */
function ensureAttendanceColumns(db: SQLite.SQLiteDatabase): void {
  const names = new Set(
    db
      .getAllSync<{ name: string }>('PRAGMA table_info(attendance_logs)')
      .map((column) => column.name),
  );
  if (!names.has('auth_method')) {
    db.execSync(
      "ALTER TABLE attendance_logs ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'FACE_BIOMETRIC';",
    );
  }
}

/**
 * Give every staff member a unique two-character code.
 *
 * Codes are the keypad identifier for the short-code + QR flow, so a legacy
 * `A10` or blank value cannot be entered on the kiosk. Existing valid codes
 * are preserved; anything else is reassigned deterministically. The unique
 * index is dropped for the duration so case-only duplicates can be repaired.
 */
function normalizeStaffCodes(db: SQLite.SQLiteDatabase): void {
  db.execSync('DROP INDEX IF EXISTS idx_staff_code;');

  const rows = db.getAllSync<{ id: number; staff_code: string | null }>(
    'SELECT id, staff_code FROM staff ORDER BY id ASC',
  );
  const used = new Set<string>();
  const renames: Array<{ id: number; code: string }> = [];
  const unassigned: number[] = [];

  for (const row of rows) {
    const normalized = (row.staff_code ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (/^[A-Z0-9]{2}$/.test(normalized) && !used.has(normalized)) {
      used.add(normalized);
      if (row.staff_code !== normalized) {
        renames.push({ id: row.id, code: normalized });
      }
    } else {
      unassigned.push(row.id);
    }
  }

  for (const rename of renames) {
    db.runSync('UPDATE staff SET staff_code = ? WHERE id = ?', [
      rename.code,
      rename.id,
    ]);
  }

  let cursor = 0;
  for (const id of unassigned) {
    let assigned: string | null = null;
    while (cursor < STAFF_CODE_ALPHABET.length ** 2) {
      const code =
        STAFF_CODE_ALPHABET[Math.floor(cursor / STAFF_CODE_ALPHABET.length)] +
        STAFF_CODE_ALPHABET[cursor % STAFF_CODE_ALPHABET.length];
      cursor += 1;
      if (!used.has(code)) {
        used.add(code);
        assigned = code;
        break;
      }
    }
    if (!assigned) {
      // The app only supports two-character codes. Keeping the legacy value
      // is safer than failing startup; the admin can free a code and re-save.
      console.warn(
        '[DayStaff] no unused 2-character staff code remains for staff id',
        id,
      );
      break;
    }
    db.runSync('UPDATE staff SET staff_code = ? WHERE id = ?', [assigned, id]);
  }

  db.execSync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_code
      ON staff (staff_code)
      WHERE staff_code IS NOT NULL;
  `);
}

function migrate(db: SQLite.SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) {
    return;
  }

  db.withTransactionSync(() => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        staff_code TEXT,
        photo_uri TEXT,
        face_signature TEXT,
        staff_pin_hash TEXT,
        staff_pin_salt TEXT,
        pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
        pin_locked_until TEXT,
        device_token TEXT,
        device_secret TEXT,
        device_public_key TEXT,
        device_paired_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        start_time TEXT NOT NULL,
        late_threshold_minutes INTEGER NOT NULL DEFAULT 0,
        end_time TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attendance_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        clock_in_time TEXT NOT NULL,
        clock_in_status TEXT NOT NULL CHECK (clock_in_status IN ('on_time', 'late')),
        minutes_late INTEGER NOT NULL DEFAULT 0,
        clock_out_time TEXT,
        clock_out_status TEXT CHECK (clock_out_status IN ('on_time', 'early')),
        minutes_early INTEGER NOT NULL DEFAULT 0,
        auth_method TEXT NOT NULL DEFAULT 'FACE_BIOMETRIC',
        FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE,
        UNIQUE (staff_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_attendance_date
        ON attendance_logs (date);
      CREATE INDEX IF NOT EXISTS idx_attendance_staff_date
        ON attendance_logs (staff_id, date);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);

    // Older databases need the newer staff columns added in place. This must
    // happen before staff codes are repaired below.
    ensureStaffColumns(db);

    // Every staff member needs a unique two-character code for the kiosk
    // keypad, including staff imported from pre-QR versions of the app.
    normalizeStaffCodes(db);

    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}

/**
 * Development helper: wipe every table and re-run the schema.
 * Not exposed in the UI.
 */
export function resetDatabase(): void {
  const db = getDb();
  db.execSync(`
    DROP TABLE IF EXISTS attendance_logs;
    DROP TABLE IF EXISTS schedules;
    DROP TABLE IF EXISTS staff;
    DROP TABLE IF EXISTS app_settings;
    PRAGMA user_version = 0;
  `);
  connection = null;
  getDb();
}
