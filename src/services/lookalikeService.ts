/**
 * Look-alike (twin) support.
 *
 * Twins and unrelated look-alikes cannot be separated reliably by the face
 * model, so they are enrolled as a "similar group": face verification uses a
 * relaxed threshold and a personal PIN decides identity. Everyone else keeps
 * the normal face-only flow.
 */

import * as Crypto from 'expo-crypto';

import { compareFaceEmbeddings, parseFaceEmbedding } from './faceEngine';
import { averageEmbeddings } from './faceLiveness';
import {
  clearPersonalPinFailures as clearPersonalPinFailuresQuery,
  getStaffByGroup,
  getStaffById,
  recordPersonalPinFailure as recordPersonalPinFailureQuery,
  setPersonalStaffPin as setPersonalStaffPinQuery,
} from '../database/queries';
import type { Staff } from '../types';

export const LOOKALIKE_FACE_THRESHOLD = 0.7;
export const DUPLICATE_GUARD_THRESHOLD = 0.85;
export const PERSONAL_PIN_LENGTH = 4;
export const PIN_MAX_ATTEMPTS = 3;
export const PIN_LOCKOUT_SECONDS = [30, 60, 120, 240] as const;
export const PIN_ENTRY_TIMEOUT_MS = 15000;
export const ENROLL_FRAME_COUNT = 5;
export const ENROLL_OUTLIER_MIN_SIMILARITY = 0.55;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPersonalPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = bytesToHex(await Crypto.getRandomBytes(16));
  let value = `${salt}:${pin}`;
  for (let i = 0; i < 1000; i += 1) {
    value = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      value,
    );
  }
  return { hash: value, salt };
}

export async function setPersonalStaffPin(staffId: number, pin: string): Promise<void> {
  const { hash, salt } = await hashPersonalPin(pin);
  setPersonalStaffPinQuery(staffId, hash, salt);
}

export async function verifyPersonalPin(staffId: number, pin: string): Promise<boolean> {
  const staff = getStaffById(staffId);
  if (!staff?.personalPinHash || !staff.personalPinSalt) {
    return false;
  }
  let value = `${staff.personalPinSalt}:${pin}`;
  for (let i = 0; i < 1000; i += 1) {
    value = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
  }
  return value === staff.personalPinHash;
}

export function isPersonalPinLocked(staff: Staff): boolean {
  return staff.personalPinLockedUntil !== null && staff.personalPinLockedUntil > Date.now();
}

export function getPersonalPinLockoutRemainingMs(staff: Staff): number {
  if (staff.personalPinLockedUntil === null) {
    return 0;
  }
  return Math.max(0, staff.personalPinLockedUntil - Date.now());
}

export async function recordPersonalPinFailureForStaff(staffId: number): Promise<{
  attempts: number;
  lockedUntil: number | null;
}> {
  return recordPersonalPinFailureQuery(staffId);
}

export function clearPersonalPinFailuresForStaff(staffId: number): void {
  clearPersonalPinFailuresQuery(staffId);
}

export function maxFaceSimilarity(staff: Staff, probe: number[]): number {
  const candidates: number[][] = [];
  const primary = parseFaceEmbedding(staff.faceSignature);
  if (primary) {
    candidates.push(primary);
  }
  if (staff.faceEmbeddings) {
    candidates.push(...staff.faceEmbeddings);
  }
  if (candidates.length === 0) {
    return 0;
  }
  return Math.max(...candidates.map((embedding) => compareFaceEmbeddings(probe, embedding)));
}

export function filterEnrollmentFrames<T extends { embedding: number[] }>(
  frames: T[],
): T[] {
  if (frames.length === 0) {
    return [];
  }
  const straight = frames[0];
  const kept = frames.filter((frame, index) => {
    if (index === 0) {
      return true;
    }
    // A frame must be similar enough to the straight-on frame to be the same
    // person; this drops bad captures and outliers.
    return compareFaceEmbeddings(frame.embedding, straight.embedding) >= ENROLL_OUTLIER_MIN_SIMILARITY;
  });
  const result = kept.length > 0 ? kept : [straight];
  return result.slice(0, ENROLL_FRAME_COUNT);
}

export function averageEnrollmentEmbeddings(embeddings: number[][]): number[] | null {
  return averageEmbeddings(embeddings);
}

export function createLookalikeGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `lookalike-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function isPersonalPinUsedByGroup(
  staffId: number,
  pin: string,
  groupMembers: Staff[],
): Promise<boolean> {
  for (const member of groupMembers) {
    if (member.id === staffId) {
      continue;
    }
    if (await verifyPersonalPin(member.id, pin)) {
      return true;
    }
  }
  return false;
}