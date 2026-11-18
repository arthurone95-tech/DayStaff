/** App-wide constants and persisted setting keys. */

import type { AuthMethod } from '../types';

export const COMPANY_NAME_SETTING = 'company_name';
export const LEGACY_SCHOOL_NAME_SETTING = 'school_name';
export const DEFAULT_COMPANY_NAME = 'DayStaff';

export const AUTH_METHOD_SETTING = 'auth_method';
export const DEFAULT_AUTH_METHOD: AuthMethod = 'FACE_RECOGNITION';

/** How long an abandoned secondary kiosk screen waits before resetting. */
export const MODE_RESET_TIMEOUT_SETTING = 'mode_reset_timeout_seconds';
export const DEFAULT_MODE_RESET_TIMEOUT_SECONDS = 3;
export const MIN_MODE_RESET_TIMEOUT_SECONDS = 3;
export const MAX_MODE_RESET_TIMEOUT_SECONDS = 60;

/** Local phone verifier used by the two-way visual QR flow. */
export const QR_VERIFIER_URL_SETTING = 'qr_verifier_url';
export const DEFAULT_QR_VERIFIER_URL = 'http://127.0.0.1:8080/';

/** Kiosk -> phone QR lifetime. */
export const QR_SESSION_TTL_MS = 10_000;
/** Pairing QR lifetime (the admin is physically present). */
export const QR_PAIRING_TTL_MS = 120_000;
/** Success screens return to the default kiosk mode within this window. */
export const QR_SUCCESS_RESET_MS = 2_000;

export const ADMIN_PIN_SETTING = 'admin_pin_hash';
export const SETUP_COMPLETED_SETTING = 'setup_completed_at';

export const STAFF_CODE_MIN_LENGTH = 2;
export const STAFF_CODE_MAX_LENGTH = 2;
export const STAFF_CODE_PATTERN = /^[A-Z0-9]+$/;

/** Admin settings for the face scanner (stored in the settings table). */
export const SCAN_LIGHT_SETTING = 'scan_light_enabled';
export const KIOSK_SOUND_EFFECTS_SETTING = 'kiosk_sound_effects_enabled';
export const SHOW_FACE_SCORES_SETTING = 'show_face_scores';
export const FACE_STRICTNESS_SETTING = 'face_strictness';
export const ATTENDANCE_OVERRIDE_EDIT_WINDOW_SETTING = 'attendance_override_edit_window_days';
export const DEFAULT_ATTENDANCE_OVERRIDE_EDIT_WINDOW_DAYS = 3;

/** Camera mode profiles are matched against a 64-bit visual fingerprint. */
export const FACE_SIGNATURE_VERSION = 1;
