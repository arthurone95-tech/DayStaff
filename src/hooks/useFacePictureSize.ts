import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import type { CameraView } from 'expo-camera';

/**
 * One set of photo settings for BOTH registering a face and scanning it, so
 * the two kinds of photo look alike to the recognition model.
 */
export const FACE_PHOTO_QUALITY = 0.7;

/**
 * Android only: the smallest camera picture size whose shorter side is at
 * least this many pixels. A 12 MP photo is slow to save and decode and the
 * face only needs a few hundred pixels. Raise this for more detail (slower),
 * lower it (e.g. 480) for more speed.
 */
const MIN_PICTURE_SHORT_SIDE = 720;

/**
 * Chooses the camera picture size once the camera is ready. Pass
 * `chooseSize` to CameraView's `onCameraReady` and `pictureSize` to its
 * `pictureSize` prop.
 */
export function useFacePictureSize(cameraRef: { current: CameraView | null }) {
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  const chooseSize = useCallback(async () => {
    if (Platform.OS !== 'android' || pictureSize || !cameraRef.current) return;
    try {
      const sizes = await cameraRef.current.getAvailablePictureSizesAsync();
      let best: { label: string; area: number } | null = null;
      for (const label of sizes) {
        const [w, h] = label.split('x').map(Number);
        if (!w || !h || Math.min(w, h) < MIN_PICTURE_SHORT_SIDE) continue;
        const area = w * h;
        if (!best || area < best.area) best = { label, area };
      }
      if (best) setPictureSize(best.label);
    } catch {
      // Keep the default size if the device cannot list picture sizes.
    }
  }, [cameraRef, pictureSize]);

  return { pictureSize, chooseSize };
}
