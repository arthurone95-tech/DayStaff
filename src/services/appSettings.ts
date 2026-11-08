/** Typed accessors for the key/value settings stored in SQLite. */

import {
  AUTH_METHOD_SETTING,
  COMPANY_NAME_SETTING,
  DEFAULT_AUTH_METHOD,
  DEFAULT_COMPANY_NAME,
  LEGACY_SCHOOL_NAME_SETTING,
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
  return value === 'FACE_RECOGNITION' ? 'FACE_RECOGNITION' : DEFAULT_AUTH_METHOD;
}

export function setAuthMethod(method: AuthMethod): void {
  setSetting(AUTH_METHOD_SETTING, method);
}
