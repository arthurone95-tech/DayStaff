/**
 * Face-mode matching.
 *
 * Staff profiles are enrolled as FaceNet embeddings averaged over several
 * frames (see faceLiveness.ts). Scans are verified as live, moving faces and
 * matched by cosine similarity against every active profile.
 *
 * TUNING (FaceNet512 on-device, front camera, indoor lighting):
 *  - same person, different session: similarity ~0.45 – 0.75
 *  - different people:                similarity ~0.20 – 0.42
 * Auto-confirm is set at 0.58 with a top-1/top-2 margin of 0.05. If two
 * profiles both score at least 0.45 and the margin is under 0.05, the kiosk
 * asks for the staff PIN. Lower-confidence single candidates are rejected
 * rather than confirmed by name, so a photo cannot claim someone else's
 * identity.
 * Do NOT raise AUTO_MATCH_SIMILARITY toward 0.7 — that range only fires for
 * near-identical photos and makes every real scan fail with
 * "face not recognized".
 */

import { getActiveStaff, setStaffFaceSignature } from '../database/queries';
import type { Staff } from '../types';
import {
  compareFaceEmbeddings,
  extractFaceEmbedding,
  FaceEngineUnavailableError,
  getFaceEngineError,
  isFaceEmbeddingSignature,
  parseFaceEmbedding,
  prepareFaceEngine,
  serializeFaceEmbedding,
} from './faceEngine';
import { averageEmbeddings } from './faceLiveness';
import {
  compareFaceHashes,
  createFaceHashes,
  createFaceSignature,
  type FaceHashes,
} from './faceSignature';

export interface FaceCandidate {
  staff: Staff;
  /** Which matcher produced this candidate. */
  method: 'embedding' | 'legacy';
  /** Cosine similarity for embeddings, 0..1. */
  similarity: number;
  /** Legacy Hamming distance, 0 (identical) to 64 (unrelated). */
  distance: number;
  /** 0..1 display confidence. */
  confidence: number;
}

export interface FaceMatchResult {
  candidates: FaceCandidate[];
  best: FaceCandidate | null;
  /** Best candidate above the suggest threshold; diagnostics only. */
  suggested: FaceCandidate | null;
  /** True for a very close, clearly separated match; log without a prompt. */
  autoConfirm: boolean;
  ambiguous: boolean;
  method: 'embedding' | 'legacy';
  /** Legacy capture hashes, retained for debugging. */
  capture: FaceHashes | null;
}

export interface FaceProfileSummary {
  engineAvailable: boolean;
  total: number;
  ready: number;
  missing: number;
  updated: number;
  message?: string;
}

export const AUTO_MATCH_SIMILARITY = 0.58;
export const SUGGEST_MATCH_SIMILARITY = 0.45;
export const MIN_AUTO_MARGIN = 0.05;

// Legacy dHash fallback — dev builds only (native engine missing).
export const AUTO_MATCH_DISTANCE = 12;
export const SUGGEST_MATCH_DISTANCE = 30;
export const MIN_LEGACY_AUTO_MARGIN = 6;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function embeddingCandidate(staff: Staff, similarity: number): FaceCandidate {
  const score = clamp(similarity);
  return {
    staff,
    method: 'embedding',
    similarity: score,
    distance: Math.round((1 - score) * 64),
    confidence: score,
  };
}

function legacyCandidate(staff: Staff, distance: number): FaceCandidate {
  return {
    staff,
    method: 'legacy',
    similarity: clamp(1 - distance / 32),
    distance,
    confidence: clamp(1 - distance / 32),
  };
}

export function confidenceLabel(candidate: FaceCandidate): string {
  if (candidate.method === 'embedding') {
    if (candidate.similarity >= 0.65) return 'Strong face match';
    if (candidate.similarity >= 0.52) return 'Likely face match';
    return 'Possible face match';
  }
  if (candidate.distance <= AUTO_MATCH_DISTANCE + 3) return 'Strong visual match';
  if (candidate.distance <= 18) return 'Likely visual match';
  return 'Possible visual match';
}

export interface CreateStaffFaceSignatureOptions {
  /**
   * Development builds may fall back to the legacy matcher when the native
   * module is unavailable (for example Expo Go). Production builds require
   * the real embedding engine.
   */
  allowLegacy?: boolean;
}

export interface StaffFaceSignature {
  signature: string;
  method: 'embedding' | 'legacy';
}

/**
 * Build the face profile stored with a staff member.
 * Pass SEVERAL frames (from the guided scan) so lighting noise averages out;
 * a single-frame profile is brittle against day-to-day variation.
 */
export async function createStaffFaceSignature(
  uris: string[] | string,
  options: CreateStaffFaceSignatureOptions = {},
): Promise<StaffFaceSignature> {
  const list = Array.isArray(uris) ? uris : [uris];
  const engineAvailable = await prepareFaceEngine();

  if (engineAvailable) {
    const embeddings = await Promise.all(
      list.map((uri) => extractFaceEmbedding(uri)),
    );
    const averaged = averageEmbeddings(embeddings);
    if (!averaged) {
      throw new Error('Could not build a face profile from these frames.');
    }
    return {
      signature: serializeFaceEmbedding(averaged),
      method: 'embedding',
    };
  }

  if (options.allowLegacy) {
    return {
      signature: await createFaceSignature(list[0]),
      method: 'legacy',
    };
  }

  throw new FaceEngineUnavailableError(getFaceEngineError() ?? undefined);
}

/**
 * Ensure every active staff photo has a usable profile. Legacy hashes are
 * upgraded to embeddings when possible.
 */
export async function prepareStaffFaceProfiles(): Promise<FaceProfileSummary> {
  const activeStaff = getActiveStaff();
  const engineAvailable = await prepareFaceEngine();
  let ready = 0;
  let missing = 0;
  let updated = 0;

  for (const member of activeStaff) {
    if (!member.photoUri) {
      missing += 1;
      continue;
    }

    if (engineAvailable) {
      if (isFaceEmbeddingSignature(member.faceSignature)) {
        ready += 1;
        continue;
      }
      try {
        const vector = await extractFaceEmbedding(member.photoUri);
        setStaffFaceSignature(member.id, serializeFaceEmbedding(vector));
        ready += 1;
        updated += 1;
      } catch {
        missing += 1;
      }
      continue;
    }

    if (
      member.faceSignature &&
      !isFaceEmbeddingSignature(member.faceSignature)
    ) {
      ready += 1;
    } else {
      missing += 1;
    }
  }

  return {
    engineAvailable,
    total: activeStaff.length,
    ready,
    missing,
    updated,
    message: engineAvailable
      ? undefined
      : getFaceEngineError() ??
        'Face recognition needs the latest installed app build.',
  };
}

async function matchWithEmbeddings(
  captureUris: string[],
  activeStaff: Staff[],
  scanEmbedding: number[] | null,
): Promise<FaceMatchResult> {
  const profiles: Array<{ staff: Staff; embedding: number[] }> = [];

  for (const member of activeStaff) {
    if (!member.photoUri) continue;

    let embedding = parseFaceEmbedding(member.faceSignature);
    if (!embedding) {
      // Upgrade a legacy profile lazily if the kiosk has not prepared it yet.
      try {
        embedding = await extractFaceEmbedding(member.photoUri);
        setStaffFaceSignature(member.id, serializeFaceEmbedding(embedding));
      } catch {
        continue;
      }
    }
    profiles.push({ staff: member, embedding });
  }

  if (profiles.length === 0) {
    throw new Error(
      'No usable face profiles are available. Add or retake a clear profile photo for each staff member in the admin area.',
    );
  }

  let captureEmbedding = scanEmbedding;
  if (!captureEmbedding) {
    const extracted = await Promise.all(
      captureUris.map((uri) => extractFaceEmbedding(uri)),
    );
    captureEmbedding = averageEmbeddings(extracted);
  }
  if (!captureEmbedding) {
    throw new Error('The scan could not be converted into a face signature.');
  }

  const ranked = profiles
    .map((profile) =>
      embeddingCandidate(
        profile.staff,
        compareFaceEmbeddings(captureEmbedding as number[], profile.embedding),
      ),
    )
    .sort((a, b) => b.similarity - a.similarity);

  const best = ranked[0] ?? null;
  const second = ranked[1];
  const margin = second ? (best?.similarity ?? 0) - second.similarity : 1;
  const suggested = best && best.similarity >= SUGGEST_MATCH_SIMILARITY ? best : null;
  const autoConfirm =
    best !== null &&
    best.similarity >= AUTO_MATCH_SIMILARITY &&
    margin >= MIN_AUTO_MARGIN;
  const ambiguous =
    best !== null &&
    best.similarity >= SUGGEST_MATCH_SIMILARITY &&
    second !== undefined &&
    second.similarity >= SUGGEST_MATCH_SIMILARITY &&
    margin < MIN_AUTO_MARGIN;

  return {
    candidates: ranked.slice(0, 3),
    best,
    suggested,
    autoConfirm,
    ambiguous,
    method: 'embedding',
    capture: null,
  };
}

async function matchWithLegacyHashes(
  capturedPhotoUri: string,
  activeStaff: Staff[],
): Promise<FaceMatchResult> {
  const legacyProfiles = activeStaff.filter(
    (member) =>
      Boolean(member.faceSignature) &&
      !isFaceEmbeddingSignature(member.faceSignature),
  );

  if (legacyProfiles.length === 0) {
    throw new FaceEngineUnavailableError(
      getFaceEngineError() ??
        'Face recognition needs the latest installed app build. Please try again.',
    );
  }

  const capture = await createFaceHashes(capturedPhotoUri);
  const ranked = legacyProfiles
    .map((member) =>
      legacyCandidate(
        member,
        compareFaceHashes(capture, member.faceSignature ?? ''),
      ),
    )
    .sort((a, b) => a.distance - b.distance);

  const best = ranked[0] ?? null;
  const second = ranked[1];
  const margin = second ? (best?.distance ?? 64) - second.distance : 64;
  const suggested = best && best.distance <= SUGGEST_MATCH_DISTANCE ? best : null;
  const autoConfirm =
    best !== null &&
    best.distance <= AUTO_MATCH_DISTANCE &&
    margin >= MIN_LEGACY_AUTO_MARGIN;

  return {
    candidates: ranked.slice(0, 3),
    best,
    suggested,
    autoConfirm,
    ambiguous: false,
    method: 'legacy',
    capture,
  };
}

/**
 * Match a scan against active staff profiles.
 * Pass the verified liveness frames plus the precomputed averaged embedding
 * (from verifyLiveness) to avoid extracting embeddings twice.
 */
export async function matchFaceToStaff(
  captureUris: string[] | string,
  scanEmbedding?: number[] | null,
): Promise<FaceMatchResult> {
  const list = Array.isArray(captureUris) ? captureUris : [captureUris];
  const activeStaff = getActiveStaff();
  const engineAvailable = await prepareFaceEngine();

  if (engineAvailable) {
    return matchWithEmbeddings(list, activeStaff, scanEmbedding ?? null);
  }

  // Native engine missing (e.g. a broken build or Expo Go): fall back to the
  // legacy visual matcher so attendance still works, but matching is basic.
  return matchWithLegacyHashes(list[0], activeStaff);
}

/**
 * Check whether a newly captured face signature already belongs to another
 * staff member. Used during registration to prevent duplicate face profiles.
 */
export async function findDuplicateFace(
  signature: string,
  excludeId?: number,
): Promise<Staff | null> {
  const newEmbedding = parseFaceEmbedding(signature);
  if (!newEmbedding) {
    return null;
  }
  const staff = getActiveStaff().filter((member) => member.id !== excludeId);
  for (const member of staff) {
    if (!member.faceSignature) {
      continue;
    }
    const existing = parseFaceEmbedding(member.faceSignature);
    if (!existing) {
      continue;
    }
    const similarity = compareFaceEmbeddings(newEmbedding, existing);
    if (similarity >= AUTO_MATCH_SIMILARITY) {
      return member;
    }
  }
  return null;
}
