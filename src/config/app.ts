/** App-wide constants and persisted setting keys. */

import type { AuthMethod } from '../types';

export const COMPANY_NAME_SETTING = 'company_name';
export const LEGACY_SCHOOL_NAME_SETTING = 'school_name';
export const DEFAULT_COMPANY_NAME = 'DayStaff';

export const AUTH_METHOD_SETTING = 'auth_method';
export const DEFAULT_AUTH_METHOD: AuthMethod = 'FACE_RECOGNITION';

export const ADMIN_PIN_SETTING = 'admin_pin_hash';
export const SETUP_COMPLETED_SETTING = 'setup_completed_at';

export const STAFF_CODE_MIN_LENGTH = 2;
export const STAFF_CODE_MAX_LENGTH = 2;
export const STAFF_CODE_PATTERN = /^[A-Z0-9]+$/;

/** Admin settings for the face scanner (stored in the settings table). */
export const SCAN_LIGHT_SETTING = 'scan_light_enabled';
export const SHOW_FACE_SCORES_SETTING = 'show_face_scores';
export const FACE_STRICTNESS_SETTING = 'face_strictness';

/** Camera mode profiles are matched against a 64-bit visual fingerprint. */
export const FACE_SIGNATURE_VERSION = 1;
