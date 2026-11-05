/**
 * Lightweight visual fingerprint for staff profile photos.
 *
 * This is NOT an ML face-recognition model. Expo Go cannot load custom native
 * ML modules, and a full TFJS/face-api pipeline is too heavy for this offline
 * MVP. Instead we build a 64-bit difference hash (dHash) over the centre of
 * the image. It can suggest a likely profile from a clear, front-facing
 * capture, and the kiosk asks the staff member to confirm before logging.
 *
 * The matcher is deliberately isolated behind faceRecognitionService so a
 * native embedding model can replace it without touching the UI.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

const SAMPLE_WIDTH = 96;
const GRID_COLS = 9;
const GRID_ROWS = 8;
const CENTER_CROP_RATIO = 0.78;

export interface FaceHashes {
  normal: string;
  /** Hash of the horizontally flipped image, for front-camera captures. */
  mirrored: string;
}

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((clean.length * 3) / 4) - padding;
  const bytes = new Uint8Array(byteLength);
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (char === '=') {
      break;
    }
    const value = BASE64_CHARS.indexOf(char);
    if (value < 0) {
      continue;
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }

  return bytes.subarray(0, index);
}

function bitsToHex(bits: number[]): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j += 1) {
      nibble = (nibble << 1) | (bits[i + j] ?? 0);
    }
    hex += nibble.toString(16);
  }
  return hex;
}

function hashPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
): FaceHashes {
  const side = Math.max(1, Math.floor(Math.min(width, height) * CENTER_CROP_RATIO));
  const startX = Math.floor((width - side) / 2);
  const startY = Math.floor((height - side) / 2);

  const rows: number[][] = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    const values: number[] = [];
    for (let col = 0; col < GRID_COLS; col += 1) {
      const x = Math.min(
        width - 1,
        Math.floor(startX + ((col + 0.5) / GRID_COLS) * side),
      );
      const y = Math.min(
        height - 1,
        Math.floor(startY + ((row + 0.5) / GRID_ROWS) * side),
      );
      const offset = (y * width + x) * 4;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      values.push(0.299 * red + 0.587 * green + 0.114 * blue);
    }
    rows.push(values);
  }

  const normalBits: number[] = [];
  const mirroredBits: number[] = [];
  for (const row of rows) {
    for (let col = 0; col < GRID_COLS - 1; col += 1) {
      normalBits.push(row[col] > row[col + 1] ? 1 : 0);
    }
    for (let col = GRID_COLS - 1; col > 0; col -= 1) {
      mirroredBits.push(row[col] > row[col - 1] ? 1 : 0);
    }
  }

  return {
    normal: bitsToHex(normalBits),
    mirrored: bitsToHex(mirroredBits),
  };
}

export async function createFaceHashes(uri: string): Promise<FaceHashes> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: SAMPLE_WIDTH } }],
    {
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
      compress: 0.85,
    },
  );

  if (!result.base64) {
    throw new Error('Could not read the captured image.');
  }

  const image = decodeJpeg(base64ToBytes(result.base64), {
    useTArray: true,
    formatAsRGBA: true,
  });

  return hashPixels(image.data, image.width, image.height);
}

/** Build the fingerprint stored with a staff member's profile photo. */
export async function createFaceSignature(uri: string): Promise<string> {
  const hashes = await createFaceHashes(uri);
  return hashes.normal;
}

const POPCOUNT = Array.from({ length: 16 }, (_, index) => {
  let value = index;
  let count = 0;
  while (value > 0) {
    count += value & 1;
    value >>= 1;
  }
  return count;
});

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    return 64;
  }
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = parseInt(a[i], 16);
    const right = parseInt(b[i], 16);
    if (Number.isNaN(left) || Number.isNaN(right)) {
      return 64;
    }
    distance += POPCOUNT[left ^ right];
  }
  return distance;
}

/** Compare a capture (normal or mirrored) with a stored profile hash. */
export function compareFaceHashes(
  capture: FaceHashes,
  profileSignature: string,
): number {
  return Math.min(
    hammingDistance(capture.normal, profileSignature),
    hammingDistance(capture.mirrored, profileSignature),
  );
}
