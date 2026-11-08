/**
 * Guided liveness challenge (spoof resistance) and multi-frame capture.
 *
 * A printed photo cannot respond to prompts, so the kiosk asks the user to
 * move their head between captures. Three frames are taken with different
 * prompts; the frames must all belong to the SAME face (high pairwise
 * similarity) yet be far enough apart to prove real motion. The averaged
 * embedding of the frames is what gets matched against staff profiles.
 *
 * This replaces the old two-frame heuristic, which rejected live users who
 * simply held still (their frame-to-frame embedding similarity exceeded
 * 0.985 and was misclassified as a photo).
 */

import {
  compareFaceEmbeddings,
  extractFaceEmbedding,
  prepareFaceEngine,
} from './faceEngine';

export type LivenessFailure =
  | 'engine_unavailable'
  | 'capture_failed'
  | 'no_motion'
  | 'face_changed';

export interface LivenessResult {
  ok: boolean;
  failure?: LivenessFailure;
  message?: string;
  /** Captured frames, in challenge order (last frame = reference photo). */
  frames: string[];
  /** Averaged embedding of the frames (null when the engine was unavailable). */
  embedding: number[] | null;
}

export interface LivenessStep {
  key: string;
  hint: string;
  /** Delay before this frame is captured, giving the user time to react. */
  delayMs: number;
}

/** Prompts shown during the live scan. Adjust wording freely. */
export const LIVENESS_STEPS: LivenessStep[] = [
  { key: 'center', hint: 'Hold still and look straight at the camera…', delayMs: 900 },
  { key: 'left', hint: 'Now turn your head to the LEFT…', delayMs: 1300 },
  { key: 'right', hint: 'Now turn your head to the RIGHT…', delayMs: 1300 },
];

/** Same-person floor for frames taken ~1s apart (same face, moved head). */
const SAME_FACE_MIN_SIMILARITY = 0.45;
/** Minimum cosine distance between consecutive poses; proves real motion. */
const MOTION_MIN_DISTANCE = 0.08;
/** If ALL frames are closer than this, it is a static photo / screen. */
const STATIC_MAX_DISTANCE = 0.03;

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude <= 0) return vector;
  return vector.map((v) => v / magnitude);
}

/** Average several embeddings into one representative vector. */
export function averageEmbeddings(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const sum = new Array<number>(dim).fill(0);
  for (const vector of vectors) {
    if (vector.length !== dim) return null;
    for (let i = 0; i < dim; i += 1) sum[i] += vector[i];
  }
  return normalize(sum.map((v) => v / vectors.length));
}

/**
 * Capture one photo per step using the provided shutter callback, waiting
 * `step.delayMs` before each frame so the user can react to the prompt.
 * `onStep(index)` is invoked right before each capture so the UI can update
 * the hint text.
 */
export async function captureChallengeFrames(
  capture: () => Promise<{ uri?: string } | null>,
  steps: LivenessStep[],
  onStep?: (index: number) => void,
): Promise<string[]> {
  const frames: string[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    onStep?.(index);
    const step = steps[index];
    if (step.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, step.delayMs));
    }
    const photo = await capture();
    if (!photo?.uri) {
      throw new Error('The camera did not return a photo. Try again.');
    }
    frames.push(photo.uri);
  }
  return frames;
}

/**
 * Verify that the captured frames show ONE live, moving face.
 * When ok, returns the averaged embedding ready for profile matching.
 */
export async function verifyLiveness(frames: string[]): Promise<LivenessResult> {
  const engineReady = await prepareFaceEngine();
  if (!engineReady || frames.length === 0) {
    return {
      ok: false,
      failure: 'engine_unavailable',
      message:
        'Face recognition is not available in this build. Install the latest DayStaff build.',
      frames,
      embedding: null,
    };
  }

  let embeddings: number[][];
  try {
    embeddings = await Promise.all(
      frames.map((uri) => extractFaceEmbedding(uri)),
    );
  } catch (error) {
    return {
      ok: false,
      failure: 'face_changed',
      message:
        error instanceof Error
          ? error.message
          : 'A clear face was not visible in every frame. Face the camera and try again.',
      frames,
      embedding: null,
    };
  }

  // All frames must be the same person.
  let minPairSimilarity = 1;
  for (let i = 0; i < embeddings.length; i += 1) {
    for (let j = i + 1; j < embeddings.length; j += 1) {
      minPairSimilarity = Math.min(
        minPairSimilarity,
        compareFaceEmbeddings(embeddings[i], embeddings[j]),
      );
    }
  }
  if (minPairSimilarity < SAME_FACE_MIN_SIMILARITY) {
    return {
      ok: false,
      failure: 'face_changed',
      message: 'The face changed between frames. One person must complete the scan.',
      frames,
      embedding: null,
    };
  }

  // A real head turn moves the embedding; a photo stays identical.
  const distances: number[] = [];
  for (let i = 1; i < embeddings.length; i += 1) {
    distances.push(1 - compareFaceEmbeddings(embeddings[i - 1], embeddings[i]));
  }
  const maxDistance = Math.max(...distances);
  if (maxDistance <= STATIC_MAX_DISTANCE) {
    return {
      ok: false,
      failure: 'no_motion',
      message:
        'No head movement was detected. Please turn your head as prompted and try again.',
      frames,
      embedding: null,
    };
  }
  if (maxDistance < MOTION_MIN_DISTANCE) {
    return {
      ok: false,
      failure: 'no_motion',
      message: 'Please move your head further between prompts and try again.',
      frames,
      embedding: null,
    };
  }

  return { ok: true, frames, embedding: averageEmbeddings(embeddings) };
}
