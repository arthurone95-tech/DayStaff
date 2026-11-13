/**
 * Guided liveness challenge (spoof resistance) and multi-frame capture.
 *
 * The kiosk asks the person to look straight, then turn their head to one
 * side, then to the other. ML Kit measures the real head angle (yaw) of the
 * face in every photo, so the check requires:
 *   1. the first photo to be facing the camera,
 *   2. the other two photos to be clearly turned, in OPPOSITE directions,
 *   3. all three photos to be the same person.
 *
 * Moving a phone or a printed photo in front of the camera changes the
 * picture but does not rotate the face inside it, so it no longer passes
 * (the old check only asked "did the pictures change?", which a shaken photo
 * satisfied).
 *
 * Identity is taken ONLY from the straight-on photo. Averaging turned-head
 * photos made different people look alike.
 */

import { getShowFaceScores } from './appSettings';
import {
  analyzeFace,
  compareFaceEmbeddings,
  prepareFaceEngine,
  type FaceAnalysis,
  type FacePose,
} from './faceEngine';

export type LivenessFailure =
  | 'engine_unavailable'
  | 'pose_unavailable'
  | 'capture_failed'
  | 'no_face'
  | 'bad_pose'
  | 'no_motion'
  | 'face_changed';

export interface LivenessResult {
  ok: boolean;
  failure?: LivenessFailure;
  message?: string;
  /** Captured frames, in challenge order (first frame = straight-on photo). */
  frames: string[];
  /** Embedding of the straight-on frame (null when the check failed). */
  embedding: number[] | null;
}

export interface LivenessStep {
  key: string;
  hint: string;
  /** Delay before this frame is captured, giving the user time to react. */
  delayMs: number;
}

/** Prompts shown during the live scan. Adjust wording and timing freely. */
export const LIVENESS_STEPS: LivenessStep[] = [
  { key: 'center', hint: 'Hold still and look straight at the camera…', delayMs: 600 },
  { key: 'left', hint: 'Now turn your head to one side…', delayMs: 900 },
  { key: 'right', hint: 'Now turn your head to the OTHER side…', delayMs: 900 },
];

/** First photo: the face must be within this many degrees of straight on. */
const CENTER_MAX_YAW = 15;
const CENTER_MAX_PITCH = 25;
/** Each turned photo must be at least this many degrees away from straight. */
const TURN_MIN_YAW = 15;
/** Total swing between the two turned photos (they must be on opposite sides). */
const TURN_MIN_SWING = 30;
/** Face must fill at least this share of the photo width (not too far away). */
const MIN_FACE_WIDTH_RATIO = 0.2;
/** Eyes must look open in the straight-on photo (0..1). */
const MIN_EYE_OPEN = 0.3;
/** Same-person floor between the three photos. */
const SAME_FACE_MIN_SIMILARITY = 0.45;

/**
 * Lightweight scan timing. Lines are printed as "[scan-timing] label: N ms"
 * (N = milliseconds since the scan button was tapped). Read them with
 * `adb logcat | grep scan-timing` on Android.
 */
let scanStartedAt = 0;
export function scanTimerStart(): void {
  scanStartedAt = Date.now();
}
export function scanTimerMark(label: string): void {
  console.log(`[scan-timing] ${label}: ${Date.now() - scanStartedAt} ms`);
}

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
 * the hint text; `onFrame(uri, index)` right after each photo is saved so
 * work on it can start immediately.
 */
export async function captureChallengeFrames(
  capture: () => Promise<{ uri?: string } | null>,
  steps: LivenessStep[],
  onStep?: (index: number) => void,
  onFrame?: (uri: string, index: number) => void,
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
    onFrame?.(photo.uri, index);
  }
  return frames;
}

function fail(
  frames: string[],
  failure: LivenessFailure,
  message: string,
): LivenessResult {
  return { ok: false, failure, message, frames, embedding: null };
}

/**
 * Yaw (turn) and roll (tilt) of the three photos, for on-screen testing.
 * A roll near 90° would mean the photo reaches the model sideways.
 */
let lastLivenessDebug = '';
export function getLastLivenessDebug(): string {
  return getShowFaceScores() ? lastLivenessDebug : '';
}

function describeAngles(poses: FacePose[]): string {
  const angles = poses
    .map((pose) => `${Math.round(pose.yaw)}/${Math.round(pose.roll)}`)
    .join(', ');
  lastLivenessDebug = ` [head turn/tilt: ${angles}]`;
  return getShowFaceScores() ? lastLivenessDebug : '';
}

/**
 * Verify that the captured frames show ONE live face that really turned its
 * head. When ok, returns the straight-on embedding ready for profile matching.
 *
 * `precomputed` are analyses already started while the photos were being
 * taken (one per frame, same order); they are reused instead of repeated.
 */
export async function verifyLiveness(
  frames: string[],
  precomputed?: Promise<FaceAnalysis>[],
): Promise<LivenessResult> {
  const engineReady = await prepareFaceEngine();
  if (!engineReady || frames.length === 0) {
    return fail(
      frames,
      'engine_unavailable',
      'Face recognition is not available in this build. Install the latest DayStaff build.',
    );
  }

  let analyses: FaceAnalysis[];
  try {
    analyses = await Promise.all(
      precomputed && precomputed.length === frames.length
        ? precomputed
        : frames.map((uri) => analyzeFace(uri)),
    );
  } catch (error) {
    return fail(
      frames,
      'no_face',
      error instanceof Error
        ? error.message
        : 'A clear face was not visible in every photo. Face the camera and try again.',
    );
  }

  if (analyses.length < 3) {
    return fail(frames, 'capture_failed', 'Not enough photos were captured. Try again.');
  }

  const poses: FacePose[] = [];
  for (const analysis of analyses) {
    if (!analysis.pose) {
      return fail(
        frames,
        'pose_unavailable',
        'This build cannot measure head turns. Install the latest DayStaff build.',
      );
    }
    poses.push(analysis.pose);
  }
  const [straight, sideA, sideB] = poses;
  const angles = describeAngles(poses);

  // 1. The first photo: close enough, facing the camera, eyes open.
  if (straight.faceWidthRatio < MIN_FACE_WIDTH_RATIO) {
    return fail(frames, 'bad_pose', `Move a little closer to the camera and try again.${angles}`);
  }
  if (
    Math.abs(straight.yaw) > CENTER_MAX_YAW ||
    Math.abs(straight.pitch) > CENTER_MAX_PITCH
  ) {
    return fail(frames, 'bad_pose', `Look straight at the camera for the first photo.${angles}`);
  }
  const eyes = [straight.leftEyeOpen, straight.rightEyeOpen].filter(
    (value): value is number => value !== null,
  );
  if (eyes.length > 0 && Math.min(...eyes) < MIN_EYE_OPEN) {
    return fail(frames, 'bad_pose', `Keep your eyes open for the first photo.${angles}`);
  }

  // 2. A real head turn: two clear turns, to opposite sides.
  const turnedEnough =
    Math.abs(sideA.yaw) >= TURN_MIN_YAW && Math.abs(sideB.yaw) >= TURN_MIN_YAW;
  const oppositeSides = sideA.yaw * sideB.yaw < 0;
  const swing = Math.abs(sideA.yaw - sideB.yaw);
  if (!turnedEnough || !oppositeSides || swing < TURN_MIN_SWING) {
    return fail(
      frames,
      'no_motion',
      `Please turn your head clearly to one side, then to the other side.${angles}`,
    );
  }

  // 3. All photos must show the same person.
  let minSimilarity = 1;
  for (let i = 0; i < analyses.length; i += 1) {
    for (let j = i + 1; j < analyses.length; j += 1) {
      minSimilarity = Math.min(
        minSimilarity,
        compareFaceEmbeddings(analyses[i].embedding, analyses[j].embedding),
      );
    }
  }
  if (minSimilarity < SAME_FACE_MIN_SIMILARITY) {
    return fail(
      frames,
      'face_changed',
      'The face changed between photos. One person must complete the scan.',
    );
  }

  return { ok: true, frames, embedding: analyses[0].embedding };
}
