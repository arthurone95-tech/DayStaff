/**
 * Face-mode matching.
 *
 * The current matcher compares on-device visual fingerprints (see
 * faceSignature.ts). It returns ranked candidates and only auto-confirms a
 * very close match; anything less is presented to the staff member for
 * confirmation. This keeps a weak heuristic from silently mis-attributing
 * attendance.
 */

import {
  getActiveStaff,
  setStaffFaceSignature,
} from '../database/queries';
import type { Staff } from '../types';
import {
  compareFaceHashes,
  createFaceHashes,
  createFaceSignature,
  type FaceHashes,
} from './faceSignature';

export interface FaceCandidate {
  staff: Staff;
  /** Hamming distance, 0 (identical) to 64 (unrelated). */
  distance: number;
  /** 0..1 display confidence. */
  confidence: number;
}

export interface FaceMatchResult {
  candidates: FaceCandidate[];
  best: FaceCandidate | null;
  /** Best candidate if it is close enough to ask the staff to confirm. */
  suggested: FaceCandidate | null;
  /** True for a very close, clearly separated match; log without a prompt. */
  autoConfirm: boolean;
  /** Hash of the capture, retained for debugging/confirmation UI. */
  capture: FaceHashes;
}

export const AUTO_MATCH_DISTANCE = 7;
export const SUGGEST_MATCH_DISTANCE = 22;
export const MIN_AUTO_MARGIN = 8;

function toCandidate(staff: Staff, distance: number): FaceCandidate {
  return {
    staff,
    distance,
    confidence: Math.max(0, Math.min(1, 1 - distance / 32)),
  };
}

export function confidenceLabel(candidate: FaceCandidate): string {
  if (candidate.distance <= AUTO_MATCH_DISTANCE + 3) {
    return 'Strong visual match';
  }
  if (candidate.distance <= 14) {
    return 'Likely visual match';
  }
  return 'Possible visual match';
}

/**
 * Backfill signatures for staff who already had a photo before face mode was
 * introduced (or whose signature failed to generate at save time).
 * Returns the number of profiles updated.
 */
export async function ensureStaffFaceSignatures(): Promise<number> {
  const pending = getActiveStaff().filter(
    (member) => member.photoUri !== null && !member.faceSignature,
  );
  let updated = 0;

  for (const member of pending) {
    if (!member.photoUri) {
      continue;
    }
    try {
      const signature = await createFaceSignature(member.photoUri);
      setStaffFaceSignature(member.id, signature);
      updated += 1;
    } catch {
      // A missing/broken photo should not block the kiosk.
    }
  }

  return updated;
}

export async function matchFaceToStaff(
  capturedPhotoUri: string,
): Promise<FaceMatchResult> {
  const staffWithPhotos = getActiveStaff().filter(
    (member) => Boolean(member.faceSignature),
  );

  if (staffWithPhotos.length === 0) {
    throw new Error(
      'No face profiles are available. Add a photo for each staff member in the admin area.',
    );
  }

  const capture = await createFaceHashes(capturedPhotoUri);
  const ranked = staffWithPhotos
    .map((member) =>
      toCandidate(
        member,
        compareFaceHashes(capture, member.faceSignature ?? ''),
      ),
    )
    .sort((a, b) => a.distance - b.distance);

  const best = ranked[0] ?? null;
  const second = ranked[1];
  const margin = second ? second.distance - (best?.distance ?? 64) : 64;
  const suggested =
    best && best.distance <= SUGGEST_MATCH_DISTANCE ? best : null;
  const autoConfirm =
    best !== null &&
    best.distance <= AUTO_MATCH_DISTANCE &&
    margin >= MIN_AUTO_MARGIN;

  return {
    candidates: ranked.slice(0, 3),
    best,
    suggested,
    autoConfirm,
    capture,
  };
}
