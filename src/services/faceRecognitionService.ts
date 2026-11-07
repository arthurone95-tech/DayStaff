/**
 * Face-mode matching.
 *
 * New profiles are enrolled as FaceNet embeddings (see faceEngine.ts).
 * Embeddings are compared with cosine similarity, which is robust to small
 * changes in lighting, camera and expression. Legacy 64-bit dHash signatures
 * remain readable so existing installations keep working, but they are
 * upgraded automatically whenever the native engine is available.
 */

import {
  getActiveStaff,
  setStaffFaceSignature,
} from '../database/queries';
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
  /** Best candidate if it is close enough to ask the staff to confirm. */
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

export const AUTO_MATCH_SIMILARITY = 0.7;
export const SUGGEST_MATCH_SIMILARITY = 0.55;
export const MIN_AUTO_MARGIN = 0.08;

export const AUTO_MATCH_DISTANCE = 7;
export const SUGGEST_MATCH_DISTANCE = 22;
export const MIN_LEGACY_AUTO_MARGIN = 8;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function embeddingCandidate(
  staff: Staff,
  similarity: number,
): FaceCandidate {
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
    if (candidate.similarity >= 0.8) {
      return 'Strong face match';
    }
    if (candidate.similarity >= 0.65) {
      return 'Likely face match';
    }
    return 'Possible face match';
  }

  if (candidate.distance <= AUTO_MATCH_DISTANCE + 3) {
    return 'Strong visual match';
  }
  if (candidate.distance <= 14) {
    return 'Likely visual match';
  }
  return 'Possible visual match';
}

export interface CreateStaffFaceSignatureOptions {
  /**
   * Development builds may fall back to the legacy matcher when the native
   * module is unavailable (for example Expo Go). Production builds require the
   * real embedding engine.
   */
  allowLegacy?: boolean;
}

export interface StaffFaceSignature {
  signature: string;
  method: 'embedding' | 'legacy';
}

/** Build the face profile stored with a staff member's photo. */
export async function createStaffFaceSignature(
  uri: string,
  options: CreateStaffFaceSignatureOptions = {},
): Promise<StaffFaceSignature> {
  const engineAvailable = await prepareFaceEngine();

  if (engineAvailable) {
    const vector = await extractFaceEmbedding(uri);
    return {
      signature: serializeFaceEmbedding(vector),
      method: 'embedding',
    };
  }

  if (options.allowLegacy) {
    return {
      signature: await createFaceSignature(uri),
      method: 'legacy',
    };
  }

  throw new FaceEngineUnavailableError(
    getFaceEngineError() ?? undefined,
  );
}

/**
 * Ensure every active staff photo has a usable profile. Legacy hashes are
 * upgraded to embeddings when possible. Returns a summary the kiosk can show
 * instead of silently pretending every profile is ready.
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

    if (__DEV__ && member.faceSignature && !isFaceEmbeddingSignature(member.faceSignature)) {
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
  capturedPhotoUri: string,
  activeStaff: Staff[],
): Promise<FaceMatchResult> {
  const profiles: Array<{ staff: Staff; embedding: number[] }> = [];

  for (const member of activeStaff) {
    if (!member.photoUri) {
      continue;
    }

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

  const captureEmbedding = await extractFaceEmbedding(capturedPhotoUri);
  const ranked = profiles
    .map((profile) =>
      embeddingCandidate(
        profile.staff,
        compareFaceEmbeddings(captureEmbedding, profile.embedding),
      ),
    )
    .sort((a, b) => b.similarity - a.similarity);

  const best = ranked[0] ?? null;
  const second = ranked[1];
  const margin = second ? (best?.similarity ?? 0) - second.similarity : 1;
  const suggested =
    best && best.similarity >= SUGGEST_MATCH_SIMILARITY ? best : null;
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
        'Face recognition needs the latest installed app build. Use the staff code for now.',
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
  const margin = second
    ? (best?.distance ?? 64) - second.distance
    : 64;
  const suggested =
    best && best.distance <= SUGGEST_MATCH_DISTANCE ? best : null;
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

export async function matchFaceToStaff(
  capturedPhotoUri: string,
): Promise<FaceMatchResult> {
  const activeStaff = getActiveStaff();
  const engineAvailable = await prepareFaceEngine();

  if (engineAvailable) {
    return matchWithEmbeddings(capturedPhotoUri, activeStaff);
  }

  // The visual-hash matcher is only a development/Expo Go fallback. Production
  // builds must use the real embedding engine rather than silently accepting a
  // weaker match.
  if (__DEV__) {
    return matchWithLegacyHashes(capturedPhotoUri, activeStaff);
  }

  throw new FaceEngineUnavailableError(
    getFaceEngineError() ??
      'Face recognition needs the latest installed app build. Use the staff code for now.',
  );
}
