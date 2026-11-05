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
