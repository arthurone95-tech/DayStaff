/**
 * Admin master-PIN handling.
 *
 * The PIN is stored as a salted SHA-256 digest in `app_settings`. This is a
 * local, offline convenience lock (not a substitute for OS-level security).
 */

import * as Crypto from 'expo-crypto';
import { getSetting, setSetting } from '../database/queries';

export const DEFAULT_ADMIN_PIN = '1234';
const PIN_SETTING_KEY = 'admin_pin_hash';
const PIN_SALT = 'daystaff::v1::';

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${PIN_SALT}${pin}`,
  );
}

export async function ensureDefaultAdminPin(): Promise<void> {
  if (!getSetting(PIN_SETTING_KEY)) {
    setSetting(PIN_SETTING_KEY, await hashPin(DEFAULT_ADMIN_PIN));
  }
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  const stored = getSetting(PIN_SETTING_KEY);
  if (!stored) {
    return pin === DEFAULT_ADMIN_PIN;
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
  if (!/^\d{4,8}$/.test(nextPin)) {
    throw new Error('New PIN must be 4 to 8 digits.');
  }
  setSetting(PIN_SETTING_KEY, await hashPin(nextPin));
}

export function isPinFormatValid(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
