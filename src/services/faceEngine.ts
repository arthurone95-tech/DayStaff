/**
 * Native face-embedding engine.
 *
 * ML Kit detects and crops the largest face, then a bundled FaceNet
 * (Inception-ResNet-v1) TensorFlow Lite model produces a 512-d embedding. Two
 * embeddings are compared with cosine similarity, which is far more reliable
 * than the old visual-hash fallback for different lighting, angles and cameras.
 *
 * The native module is loaded lazily so Expo Go and non-native platforms can
 * still open the app. Face recognition itself requires a development or
 * production build that includes the native module.
 */

import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import type {
  FaceEmbedding,
  FaceRecognizer,
} from '@nitro-mlkit/face-recognition';

/**
 * Stored face signatures use this prefix so legacy dHash values can coexist.
 * The suffix is a model generation: bump it whenever the embedding model or
 * its preprocessing changes so old vectors are re-enrolled instead of compared
 * against incompatible vectors.
 */
export const FACE_EMBEDDING_PREFIX = 'mf3:';

/**
 * mf3 = frontal-face embeddings from a straightened, square, margin-padded
 * crop (see the patched native module). mf2 profiles were averages of three
 * head poses from stretched crops, so they are not comparable and are rebuilt.
 */
const EMBEDDING_DIM = 512;
/** Extra numbers the patched native module appends to every embedding. */
const POSE_VALUE_COUNT = 6;

/** Head pose and quality numbers reported by ML Kit for the detected face. */
export interface FacePose {
  /** Left/right turn in degrees (sign depends on camera mirroring). */
  yaw: number;
  pitch: number;
  roll: number;
  /** 0..1, or null when ML Kit did not report it. */
  leftEyeOpen: number | null;
  rightEyeOpen: number | null;
  /** Face box width divided by photo width (0..1). */
  faceWidthRatio: number;
}

export interface FaceAnalysis {
  embedding: number[];
  /** null when the installed native module has no pose patch. */
  pose: FacePose | null;
}

const MODEL_ASSET = require('../../assets/models/facenet512.tflite');

const ENGINE_UNAVAILABLE_MESSAGE =
  'Face recognition is not available in this build. Install the latest DayStaff app build, then retry.';

let recognizer: FaceRecognizer | null = null;
let engineState: 'idle' | 'ready' | 'unavailable' = 'idle';
let enginePromise: Promise<boolean> | null = null;
let engineError: string | null = null;

/**
 * The native TFLite interpreter is shared and not safe for concurrent calls.
 * Profile preparation and a live scan can overlap, so every native embedding
 * operation runs through this queue.
 */
let nativeOperationQueue: Promise<void> = Promise.resolve();

function enqueueNativeOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = nativeOperationQueue.then(operation, operation);
  nativeOperationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export class FaceEngineUnavailableError extends Error {
  constructor(message = ENGINE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'FaceEngineUnavailableError';
  }
}

export class FacePhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FacePhotoError';
  }
}

function getRecognizer(): FaceRecognizer {
  if (recognizer) {
    return recognizer;
  }
  // Lazy require keeps Expo Go and web from touching the Nitro native module
  // until a face operation is actually requested.
  const module = require('@nitro-mlkit/face-recognition') as typeof import('@nitro-mlkit/face-recognition');
  recognizer = module.NitroRecognizer as FaceRecognizer;
  return recognizer;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'The face-recognition engine could not start.';
}

function isMissingFaceMessage(message: string): boolean {
  return /no face|face not found|no faces|face.*found|face.*detect/i.test(
    message,
  );
}

/**
 * Load the bundled TFLite model once. Returns false when the native module is
 * missing (for example in Expo Go) or the model cannot be loaded.
 */
export async function prepareFaceEngine(): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    engineError = ENGINE_UNAVAILABLE_MESSAGE;
    return false;
  }
  if (engineState === 'ready') {
    return true;
  }
  if (enginePromise) {
    return enginePromise;
  }

  enginePromise = (async () => {
    try {
      const faceRecognizer = getRecognizer();

      if (faceRecognizer.isModelReady()) {
        engineState = 'ready';
        engineError = null;
        return true;
      }

      const asset = Asset.fromModule(MODEL_ASSET);
      if (!asset.localUri) {
        await asset.downloadAsync();
      }
      const modelUri = asset.localUri ?? asset.uri;
      if (!modelUri) {
        throw new Error('The bundled face model could not be found.');
      }

      const loaded = await faceRecognizer.loadModel(modelUri);
      if (!loaded) {
        throw new Error('The bundled face model could not be loaded.');
      }

      engineState = 'ready';
      engineError = null;
      return true;
    } catch (error) {
      engineState = 'unavailable';
      engineError =
        /simulator/i.test(describeError(error))
          ? 'Face recognition needs a physical iOS or Android device.'
          : `${ENGINE_UNAVAILABLE_MESSAGE} ${describeError(error)}`;
      return false;
    } finally {
      enginePromise = null;
    }
  })();

  return enginePromise;
}

/** Last engine error, suitable for admin-facing messages. */
export function getFaceEngineError(): string | null {
  return engineError;
}

export function isFaceEmbeddingSignature(
  signature: string | null | undefined,
): boolean {
  return Boolean(signature?.startsWith(FACE_EMBEDDING_PREFIX));
}

export function serializeFaceEmbedding(vector: number[]): string {
  return `${FACE_EMBEDDING_PREFIX}${JSON.stringify(vector)}`;
}

export function parseFaceEmbedding(
  signature: string | null | undefined,
): number[] | null {
  if (!isFaceEmbeddingSignature(signature)) {
    return null;
  }
  try {
    const parsed = JSON.parse(signature!.slice(FACE_EMBEDDING_PREFIX.length));
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every((value) => typeof value === 'number' && Number.isFinite(value))
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Raw native vector: embedding, plus 6 pose numbers when the patch is present. */
async function extractRawVector(uri: string): Promise<number[]> {
  const ready = await prepareFaceEngine();
  if (!ready) {
    throw new FaceEngineUnavailableError(
      engineError ?? ENGINE_UNAVAILABLE_MESSAGE,
    );
  }

  try {
    const result: FaceEmbedding = await enqueueNativeOperation(() =>
      getRecognizer().extractEmbedding(uri),
    );
    if (
      !Array.isArray(result.vector) ||
      result.vector.length === 0 ||
      !result.vector.every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    ) {
      throw new FacePhotoError(
        'No clear face was detected. Use a front-facing photo with your whole face visible.',
      );
    }
    return result.vector;
  } catch (error) {
    if (error instanceof FacePhotoError) {
      throw error;
    }
    const message = describeError(error);
    if (isMissingFaceMessage(message)) {
      throw new FacePhotoError(
        'No clear face was detected. Use a front-facing photo with your whole face visible.',
      );
    }
    if (/simulator/i.test(message)) {
      throw new FaceEngineUnavailableError(
        'Face recognition needs a physical iOS or Android device.',
      );
    }
    if (/model/i.test(message) && /load|ready|not/i.test(message)) {
      throw new FaceEngineUnavailableError(ENGINE_UNAVAILABLE_MESSAGE);
    }
    throw new FacePhotoError(`Could not read that photo: ${message}`);
  }
}

/** Embedding and head pose of the largest face in an image. */
export async function analyzeFace(uri: string): Promise<FaceAnalysis> {
  const raw = await extractRawVector(uri);
  if (raw.length === EMBEDDING_DIM + POSE_VALUE_COUNT) {
    const [yaw, pitch, roll, left, right, widthRatio] = raw.slice(EMBEDDING_DIM);
    return {
      embedding: raw.slice(0, EMBEDDING_DIM),
      pose: {
        yaw,
        pitch,
        roll,
        leftEyeOpen: left >= 0 ? left : null,
        rightEyeOpen: right >= 0 ? right : null,
        faceWidthRatio: widthRatio,
      },
    };
  }
  return { embedding: raw, pose: null };
}

/** Extract the embedding of the largest face in an image. */
export async function extractFaceEmbedding(uri: string): Promise<number[]> {
  return (await analyzeFace(uri)).embedding;
}

/** Cosine similarity in the 0..1 range used by the candidate UI. */
export function compareFaceEmbeddings(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magnitudeA += a[index] * a[index];
    magnitudeB += b[index] * b[index];
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (denominator <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, dot / denominator));
}
