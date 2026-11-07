import * as Crypto from 'expo-crypto';

import { getStaffById, recordStaffPinFailure, resetStaffPinFailures, setStaffPin } from '../database/queries';

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
  for (let i = 0; i < PIN_ITERATIONS; i++) {
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

export async function setStaffPinForStaff(staffId: number, pin: string): Promise<void> {
  if (!isStaffPinFormatValid(pin)) {
    throw new Error('PIN must be exactly 6 digits.');
  }
  const salt = await generatePinSalt();
  const hash = await hashStaffPin(pin, salt);
  setStaffPin(staffId, hash, salt);
}

export async function verifyStaffPin(staffId: number, pin: string): Promise<boolean> {
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
  recordStaffPinFailure(staffId);
  return false;
}

export function isStaffPinLocked(staffId: number): boolean {
  const staff = getStaffById(staffId);
  if (!staff?.pinLockedUntil) return false;
  return Date.now() < new Date(staff.pinLockedUntil).getTime();
}