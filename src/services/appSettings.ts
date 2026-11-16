/** Typed accessors for the key/value settings stored in SQLite. */

// kiosk server removed from active flow; keep a safe default URL.
import {
  AUTH_METHOD_SETTING,
  COMPANY_NAME_SETTING,
  DEFAULT_AUTH_METHOD,
  DEFAULT_COMPANY_NAME,
  DEFAULT_MODE_RESET_TIMEOUT_SECONDS,
  DEFAULT_QR_VERIFIER_URL,
  FACE_STRICTNESS_SETTING,
  LEGACY_SCHOOL_NAME_SETTING,
  MAX_MODE_RESET_TIMEOUT_SECONDS,
  MIN_MODE_RESET_TIMEOUT_SECONDS,
  MODE_RESET_TIMEOUT_SETTING,
  QR_VERIFIER_URL_SETTING,
  SCAN_LIGHT_SETTING,
  SHOW_FACE_SCORES_SETTING,
} from '../config/app';
import { getSetting, setSetting } from '../database/queries';
import type { AuthMethod } from '../types';

export function getCompanyName(): string {
  return (
    getSetting(COMPANY_NAME_SETTING) ??
    getSetting(LEGACY_SCHOOL_NAME_SETTING) ??
    DEFAULT_COMPANY_NAME
  );
}

export function setCompanyName(name: string): void {
  setSetting(COMPANY_NAME_SETTING, name.trim() || DEFAULT_COMPANY_NAME);
}

export function getAuthMethod(): AuthMethod {
  const value = getSetting(AUTH_METHOD_SETTING);
  // Staff code + biometrics has been retired; any previously saved value is
  // treated as face recognition so existing installs keep working.
  if (value === 'PIN_BIOMETRIC') {
    return 'FACE_RECOGNITION';
  }
  if (value === 'SHORT_CODE_QR') {
    return 'SHORT_CODE_QR';
  }
  return value === 'FACE_RECOGNITION' ? 'FACE_RECOGNITION' : DEFAULT_AUTH_METHOD;
}

export function setAuthMethod(method: AuthMethod): void {
  setSetting(
    AUTH_METHOD_SETTING,
    method === 'PIN_BIOMETRIC' ? 'FACE_RECOGNITION' : method,
  );
}

/** Seconds an abandoned non-default kiosk screen waits before resetting. */
export function getModeResetTimeoutSeconds(): number {
  const parsed = Number(getSetting(MODE_RESET_TIMEOUT_SETTING));
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MODE_RESET_TIMEOUT_SECONDS;
  }
  return Math.min(
    MAX_MODE_RESET_TIMEOUT_SECONDS,
    Math.max(MIN_MODE_RESET_TIMEOUT_SECONDS, Math.round(parsed)),
  );
}

export function setModeResetTimeoutSeconds(seconds: number): void {
  const safe = Math.min(
    MAX_MODE_RESET_TIMEOUT_SECONDS,
    Math.max(MIN_MODE_RESET_TIMEOUT_SECONDS, Math.round(seconds)),
  );
  setSetting(MODE_RESET_TIMEOUT_SETTING, String(safe));
}

/** Base URL of the static phone verifier page used by the QR flow. */
export function getQrVerifierUrl(): string {
  const value = getSetting(QR_VERIFIER_URL_SETTING)?.trim();
  return value || DEFAULT_QR_VERIFIER_URL;
}

export function setQrVerifierUrl(url: string): void {
  setSetting(QR_VERIFIER_URL_SETTING, url.trim() || DEFAULT_QR_VERIFIER_URL);
}

// ---------------------------------------------------------------------------
// Face scanner settings
// ---------------------------------------------------------------------------

/** Bright screen light around the camera while the 3 scan photos are taken. */
export function getScanLightEnabled(): boolean {
  return getSetting(SCAN_LIGHT_SETTING) === '1';
}

export function setScanLightEnabled(enabled: boolean): void {
  setSetting(SCAN_LIGHT_SETTING, enabled ? '1' : '0');
}

/**
 * Show similarity scores in "face not recognized" and "already registered"
 * messages. On by default while the matcher is being tuned.
 */
export function getShowFaceScores(): boolean {
  return getSetting(SHOW_FACE_SCORES_SETTING) !== '0';
}

export function setShowFaceScores(show: boolean): void {
  setSetting(SHOW_FACE_SCORES_SETTING, show ? '1' : '0');
}

export type FaceStrictness = 'relaxed' | 'balanced' | 'strict';

export function getFaceStrictness(): FaceStrictness {
  const value = getSetting(FACE_STRICTNESS_SETTING);
  return value === 'relaxed' || value === 'strict' ? value : 'balanced';
}

export function setFaceStrictness(level: FaceStrictness): void {
  setSetting(FACE_STRICTNESS_SETTING, level);
}
