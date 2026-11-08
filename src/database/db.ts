/**
 * SQLite connection, pragmas and schema migrations.
 *
 * Uses the synchronous expo-sqlite API so screens can read local data
 * without async waterfalls.
 */

import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'daystaff_v2.db';
const SCHEMA_VERSION = 4;

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
  ];
  for (const [name, type] of needed) {
    if (!names.has(name)) {
      db.execSync(`ALTER TABLE staff ADD COLUMN ${name} ${type};`);
    }
  }
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
    // happen before the staff_code backfill and unique index below.
    ensureStaffColumns(db);

    // Give existing staff a deterministic, unique code so the keypad works
    // immediately after upgrading.
    db.execSync(`
      UPDATE staff
      SET staff_code =
        (CASE
          WHEN upper(substr(full_name, 1, 1)) GLOB '[A-Z0-9]'
            THEN upper(substr(full_name, 1, 1))
          ELSE 'S'
        END) || id
      WHERE staff_code IS NULL OR trim(staff_code) = '';
    `);

    db.execSync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_code
        ON staff (staff_code)
        WHERE staff_code IS NOT NULL;
    `);

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
