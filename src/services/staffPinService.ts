import * as Crypto from 'expo-crypto';

import {
  getStaffById,
  recordStaffPinFailure,
  resetStaffPinFailures,
  setStaffPin,
} from '../database/queries';

const PIN_ITERATIONS = 1000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generatePinSalt(): Promise<string> {
  const bytes = Crypto.getRandomBytes(16);
  return bytesToHex(bytes);
}

export async function hashStaffPin(pin: string, salt: string): Promise<string> {
  let value = `${salt}:${pin}`;
  for (let i = 0; i < PIN_ITERATIONS; i += 1) {
    value = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      value,
    );
  }
  return value;
}

export function isStaffPinFormatValid(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

export async function setStaffPinForStaff(
  staffId: number,
  pin: string,
): Promise<void> {
  if (!isStaffPinFormatValid(pin)) {
    throw new Error('PIN must be exactly 6 digits.');
  }
  const salt = await generatePinSalt();
  const hash = await hashStaffPin(pin, salt);
  setStaffPin(staffId, hash, salt);
}

export interface VerifyStaffPinOptions {
  /**
   * Set false when testing one PIN against several possible candidates:
   * a wrong guess must NOT count as a failed attempt on an innocent staff
   * member (that bug could lock staff out after 5 tries).
   */
  recordFailure?: boolean;
}

export async function verifyStaffPin(
  staffId: number,
  pin: string,
  options: VerifyStaffPinOptions = {},
): Promise<boolean> {
  const staff = getStaffById(staffId);
  if (!staff || !staff.staffPinHash || !staff.staffPinSalt) {
    return false;
  }
  if (staff.pinLockedUntil) {
    const until = new Date(staff.pinLockedUntil).getTime();
    if (Date.now() < until) {
      return false;
    }
    resetStaffPinFailures(staffId);
  }
  const hash = await hashStaffPin(pin, staff.staffPinSalt);
  if (hash === staff.staffPinHash) {
    resetStaffPinFailures(staffId);
    return true;
  }
  if (options.recordFailure !== false) {
    recordStaffPinFailure(staffId);
  }
  return false;
}

/** Record a single failed attempt explicitly (used by the ambiguous-face flow). */
export function recordSinglePinFailure(staffId: number): void {
  recordStaffPinFailure(staffId);
}

export function isStaffPinLocked(staffId: number): boolean {
  const staff = getStaffById(staffId);
  if (!staff?.pinLockedUntil) return false;
  return Date.now() < new Date(staff.pinLockedUntil).getTime();
}
