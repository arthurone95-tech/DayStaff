/**
 * Face-mode matching.
 *
 * Staff profiles are enrolled as FaceNet embeddings averaged over several
 * frames (see faceLiveness.ts). Scans are verified as live, moving faces and
 * matched by cosine similarity against every active profile.
 *
 * TUNING (measured in the field after the face-crop margin fix):
 *  - same person, different session: similarity ~0.85 – 0.95
 *  - different people (incl. lookalikes): similarity ~0.55 – 0.80
 * Duplicate registration blocks at 0.85; kiosk auto-confirm requires >= 0.80
 * with a top-1/top-2 margin of 0.06. When two profiles both score >= 0.68 and
 * the margin is under 0.06 the kiosk asks for the staff PIN instead of
 * guessing. Weaker single candidates are rejected rather than confirmed.
 * Tune these numbers using the [face-match] console logs produced on every
 * scan (adb logcat | grep face-match).
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
import { getFaceStrictness, type FaceStrictness } from './appSettings';
import { scanTimerMark } from './faceLiveness';
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

export interface FaceThresholds {
  /** Minimum similarity to accept a match automatically (and to flag a duplicate). */
  auto: number;
  /** Minimum similarity for a candidate to be considered at all. */
  suggest: number;
  /** Required gap between the best and second-best candidate. */
  margin: number;
}

export const FACE_THRESHOLDS: Record<FaceStrictness, FaceThresholds> = {
  relaxed: { auto: 0.74, suggest: 0.62, margin: 0.06 },
  balanced: { auto: 0.8, suggest: 0.68, margin: 0.06 },
  strict: { auto: 0.86, suggest: 0.74, margin: 0.08 },
};

export const DUPLICATE_MATCH_SIMILARITY = 0.85;

export function getFaceThresholds(): FaceThresholds {
  return FACE_THRESHOLDS[getFaceStrictness()];
}

// Legacy dHash fallback — dev builds only (native engine missing).
export const AUTO_MATCH_DISTANCE = 12;
export const SUGGEST_MATCH_DISTANCE = 30;
export const MIN_LEGACY_AUTO_MARGIN = 6;

/**
 * Parsed embeddings kept in memory. Without this, every scan re-parsed a
 * 512-number JSON string for every staff member. An entry is reused only while
 * the stored signature is unchanged, so re-enrolled faces are picked up.
 */
const embeddingCache = new Map<number, { signature: string; embedding: number[] }>();

function getCachedEmbedding(member: Staff): number[] | null {
  const signature = member.faceSignature;
  if (!signature) {
    return null;
  }
  const hit = embeddingCache.get(member.id);
  if (hit && hit.signature === signature) {
    return hit.embedding;
  }
  const parsed = parseFaceEmbedding(signature);
  if (parsed) {
    embeddingCache.set(member.id, { signature, embedding: parsed });
  }
  return parsed;
}

/** Staff whose profile photo could not be read; not retried on every scan. */
const upgradeFailed = new Set<number>();

/** The first model run is slow; one throwaway run at kiosk start hides that. */
let engineWarmed = false;

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
    if (candidate.similarity >= 0.78) return 'Strong face match';
    if (candidate.similarity >= 0.7) return 'Likely face match';
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
    // Identity uses only the first (straight-on) frame.
    const vector = await extractFaceEmbedding(list[0]);
    return {
      signature: serializeFaceEmbedding(vector),
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

  if (engineAvailable && !engineWarmed) {
    const sample = activeStaff.find((member) => member.photoUri);
    if (sample?.photoUri) {
      engineWarmed = true;
      // Fire and forget: the scan queue runs it in order, nothing waits on it.
      void extractFaceEmbedding(sample.photoUri).catch(() => undefined);
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function matchWithEmbeddings(
  captureUris: string[],
  activeStaff: Staff[],
  scanEmbedding: number[] | null,
  scanFrameEmbeddings?: number[][] | null,
): Promise<FaceMatchResult> {
  const profiles: Array<{ staff: Staff; embedding: number[] }> = [];

  for (const member of activeStaff) {
    if (!member.photoUri) continue;

    let embedding = getCachedEmbedding(member);
    if (!embedding) {
      // Upgrade a legacy profile lazily if the kiosk has not prepared it yet.
      if (upgradeFailed.has(member.id)) continue;
      try {
        embedding = await extractFaceEmbedding(member.photoUri);
        setStaffFaceSignature(member.id, serializeFaceEmbedding(embedding));
      } catch {
        upgradeFailed.add(member.id);
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
  if (!captureEmbedding && captureUris.length > 0) {
    captureEmbedding = await extractFaceEmbedding(captureUris[0]);
  }
  if (!captureEmbedding) {
    throw new Error('The scan could not be converted into a face signature.');
  }

  const ranked = profiles
    .map((profile) => {
      const similarity =
        scanFrameEmbeddings && scanFrameEmbeddings.length > 0
          ? median(
              scanFrameEmbeddings.map((frame) =>
                compareFaceEmbeddings(frame, profile.embedding),
              ),
            )
          : compareFaceEmbeddings(captureEmbedding as number[], profile.embedding);
      return embeddingCandidate(profile.staff, similarity);
    })
    .sort((a, b) => b.similarity - a.similarity);

  const limits = getFaceThresholds();
  const best = ranked[0] ?? null;
  const second = ranked[1];
  const margin = second ? (best?.similarity ?? 0) - second.similarity : 1;
  console.log(
    `[face-match] best=${best?.staff.fullName ?? 'none'} ${(best?.similarity ?? 0).toFixed(3)} ` +
      `second=${second?.staff.fullName ?? 'none'} ${(second?.similarity ?? 0).toFixed(3)} ` +
      `margin=${margin.toFixed(3)}`,
  );
  const suggested = best && best.similarity >= limits.suggest ? best : null;
  const autoConfirm =
    best !== null &&
    best.similarity >= limits.auto &&
    margin >= limits.margin;
  const ambiguous =
    best !== null &&
    best.similarity >= limits.suggest &&
    second !== undefined &&
    second.similarity >= limits.suggest &&
    margin < limits.margin;
  console.log(
    `[face-score] top: ${ranked
      .slice(0, 3)
      .map((c) => `#${c.staff.id} ${c.similarity.toFixed(2)}`)
      .join(' | ')} | auto>=${limits.auto} margin>=${limits.margin}`,
  );

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
  scanFrameEmbeddings?: number[][] | null,
): Promise<FaceMatchResult> {
  const list = Array.isArray(captureUris) ? captureUris : [captureUris];
  const activeStaff = getActiveStaff();
  const engineAvailable = await prepareFaceEngine();

  if (engineAvailable) {
    const result = await matchWithEmbeddings(
      list,
      activeStaff,
      scanEmbedding ?? null,
      scanFrameEmbeddings ?? null,
    );
    scanTimerMark('matched against staff');
    return result;
  }

  // Native engine missing (e.g. a broken build or Expo Go): fall back to the
  // legacy visual matcher so attendance still works, but matching is basic.
  return matchWithLegacyHashes(list[0], activeStaff);
}

export interface ClosestFace {
  staff: Staff;
  /** Cosine similarity, 0..1. */
  similarity: number;
}

/**
 * The enrolled staff member whose face is most similar to this signature
 * (excluding `excludeId`), or null when nobody has a face profile.
 */
export async function findClosestFace(
  signature: string,
  excludeId?: number,
): Promise<ClosestFace | null> {
  const newEmbedding = parseFaceEmbedding(signature);
  if (!newEmbedding) {
    return null;
  }
  let closest: ClosestFace | null = null;
  for (const member of getActiveStaff()) {
    if (member.id === excludeId) {
      continue;
    }
    const existing = getCachedEmbedding(member);
    if (!existing) {
      continue;
    }
    const similarity = compareFaceEmbeddings(newEmbedding, existing);
    if (!closest || similarity > closest.similarity) {
      closest = { staff: member, similarity };
    }
  }
  return closest;
}

/**
 * Check whether a newly captured face signature already belongs to another
 * staff member. Used during registration to prevent duplicate face profiles.
 */
export interface DuplicateFaceResult {
  staff: Staff;
  similarity: number;
}

/**
 * Check whether a newly captured face already belongs to another staff
 * member. Used during registration to prevent duplicate face profiles.
 * Blocks only on very strong matches (>= DUPLICATE_MATCH_SIMILARITY): a real
 * duplicate (same person re-registering) will clear it on at least one frame,
 * while mere lookalikes (measured up to ~0.81) pass.
 */
export async function findDuplicateFace(
  signature: string,
  excludeId?: number,
  frameEmbeddings?: number[][] | null,
): Promise<DuplicateFaceResult | null> {
  const probes: number[][] = [];
  const averaged = parseFaceEmbedding(signature);
  if (averaged) {
    probes.push(averaged);
  }
  if (frameEmbeddings && frameEmbeddings.length > 0) {
    probes.push(...frameEmbeddings);
  }
  if (probes.length === 0) {
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
    for (const probe of probes) {
      const similarity = compareFaceEmbeddings(probe, existing);
      if (similarity >= DUPLICATE_MATCH_SIMILARITY) {
        return { staff: member, similarity };
      }
    }
  }
  return null;
}
