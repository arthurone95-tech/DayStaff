/**
 * Admin master-PIN handling.
 *
 * The PIN is stored as a salted SHA-256 digest in `app_settings`. There is no
 * default PIN: the first-run setup wizard must create one before the kiosk is
 * unlocked. This is a local, offline convenience lock (not a substitute for
 * OS-level security).
 */

import * as Crypto from 'expo-crypto';
import {
  ADMIN_PIN_SETTING,
  SETUP_COMPLETED_SETTING,
} from '../config/app';
import { getSetting, setSetting } from '../database/queries';

const ADMIN_PIN_FAILED_ATTEMPTS_SETTING = 'admin_pin_failed_attempts';
const ADMIN_PIN_LOCKED_UNTIL_SETTING = 'admin_pin_locked_until';
const ADMIN_RECOVERY_CODE_SETTING = 'admin_recovery_code_hash';

const PIN_SALT = 'daystaff::v1::';
/** Only used to detect hashes seeded by old versions; it is never accepted. */
const LEGACY_DEFAULT_PIN = '1234';

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${PIN_SALT}${pin}`,
  );
}

/** True once the setup wizard (or an admin) has created a PIN. */
export function hasAdminPin(): boolean {
  return getSetting(ADMIN_PIN_SETTING) !== null;
}

/**
 * Gate used by App.tsx. A missing PIN always requires setup. Older builds
 * seeded `1234`; if that hash is still present and setup was never completed,
 * force the admin to create a real PIN. New installs that deliberately choose
 * `1234` after setup are not looped back into the wizard.
 */
export async function needsAdminSetup(): Promise<boolean> {
  const stored = getSetting(ADMIN_PIN_SETTING);
  if (!stored) {
    return true;
  }
  if (getSetting(SETUP_COMPLETED_SETTING)) {
    return false;
  }
  return stored === (await hashPin(LEGACY_DEFAULT_PIN));
}

/** Create the PIN during first-run setup. Requires exactly four digits. */
export async function createAdminPin(pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('The administrator PIN must be exactly 4 digits.');
  }
  setSetting(ADMIN_PIN_SETTING, await hashPin(pin));
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  const stored = getSetting(ADMIN_PIN_SETTING);
  if (!stored) {
    return false;
  }
  return stored === (await hashPin(pin));
}

export function getAdminPinFailedAttempts(): number {
  const value = Number(getSetting(ADMIN_PIN_FAILED_ATTEMPTS_SETTING) ?? '0');
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function getAdminPinLockedUntilMs(): number | null {
  const value = getSetting(ADMIN_PIN_LOCKED_UNTIL_SETTING);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isAdminPinLocked(): boolean {
  const until = getAdminPinLockedUntilMs();
  return until !== null && until > Date.now();
}

export function getAdminPinLockoutRemainingMs(): number {
  const until = getAdminPinLockedUntilMs();
  if (!until) {
    return 0;
  }
  return Math.max(0, until - Date.now());
}

export async function recordAdminPinFailure(): Promise<{
  attempts: number;
  lockedUntil: number | null;
}> {
  const now = Date.now();
  const currentUntil = getAdminPinLockedUntilMs();
  if (currentUntil && currentUntil > now) {
    return { attempts: getAdminPinFailedAttempts(), lockedUntil: currentUntil };
  }

  const attempts = getAdminPinFailedAttempts() + 1;
  setSetting(ADMIN_PIN_FAILED_ATTEMPTS_SETTING, String(attempts));

  let lockedUntil: number | null = null;
  if (attempts >= 3) {
    const level = Math.max(0, Math.floor((attempts - 3) / 3));
    const durationMs = 30000 * Math.pow(2, level);
    lockedUntil = now + durationMs;
    setSetting(ADMIN_PIN_LOCKED_UNTIL_SETTING, String(lockedUntil));
  }

  return { attempts, lockedUntil };
}

export function resetAdminPinFailures(): void {
  setSetting(ADMIN_PIN_FAILED_ATTEMPTS_SETTING, '0');
  setSetting(ADMIN_PIN_LOCKED_UNTIL_SETTING, '');
}

export function generateAdminRecoveryCode(): string {
  const bytes = Crypto.getRandomBytes(6);
  const digits = Array.from(bytes.slice(0, 4))
    .map((value) => String(value % 10))
    .join('');
  const letters = Array.from(bytes.slice(4, 6))
    .map((value) => String.fromCharCode(65 + (value % 26)))
    .join('');
  return `DS-${digits}-${letters}`;
}

export async function storeAdminRecoveryCode(code: string): Promise<void> {
  setSetting(ADMIN_RECOVERY_CODE_SETTING, await hashPin(code.trim().toUpperCase()));
}

export async function verifyAdminRecoveryCode(code: string): Promise<boolean> {
  const stored = getSetting(ADMIN_RECOVERY_CODE_SETTING);
  if (!stored) {
    return false;
  }
  return stored === (await hashPin(code.trim().toUpperCase()));
}

export async function resetAdminPinWithRecoveryCode(
  recoveryCode: string,
  newPin: string,
): Promise<void> {
  const valid = await verifyAdminRecoveryCode(recoveryCode);
  if (!valid) {
    throw new Error('Recovery code is incorrect.');
  }
  if (!/^\d{4,8}$/.test(newPin)) {
    throw new Error('New PIN must be 4 to 8 digits.');
  }
  setSetting(ADMIN_PIN_SETTING, await hashPin(newPin));
  resetAdminPinFailures();
}

export async function changeAdminPin(
  currentPin: string,
  nextPin: string,
): Promise<void> {
  const currentValid = await verifyAdminPin(currentPin);
  if (!currentValid) {
    throw new Error('Current PIN is incorrect.');
  }
  if (!isPinFormatValid(nextPin)) {
    throw new Error('New PIN must be 4 to 8 digits.');
  }
  setSetting(ADMIN_PIN_SETTING, await hashPin(nextPin));
}

export function isPinFormatValid(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

/** The setup wizard uses a strict four-digit PIN. */
export function isSetupPinValid(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
