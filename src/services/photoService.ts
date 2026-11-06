/** Camera / gallery photo capture and local persistence. */

import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

const STAFF_PHOTO_DIR = `${FileSystem.documentDirectory}staff-photos/`;

async function ensurePhotoDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(STAFF_PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(STAFF_PHOTO_DIR, {
      intermediates: true,
    });
  }
}

async function persistPhoto(tempUri: string): Promise<string> {
  await ensurePhotoDirectory();
  const cleaned = tempUri.split('?')[0];
  const extension = cleaned.split('.').pop() || 'jpg';
  const destination = `${STAFF_PHOTO_DIR}staff-${Date.now()}.${extension}`;
  await FileSystem.copyAsync({ from: tempUri, to: destination });
  return destination;
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  // Prefer a head-and-shoulders portrait. iOS may still apply its square crop,
  // but the face engine detects and crops the largest face either way.
  aspect: [3, 4],
  quality: 0.9,
};

export async function captureStaffPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera permission is required to take a photo.');
  }

  const result = await ImagePicker.launchCameraAsync(pickerOptions);
  if (result.canceled || result.assets.length === 0) {
    return null;
  }
  return persistPhoto(result.assets[0].uri);
}

export async function chooseStaffPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to choose a photo.');
  }

  const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
  if (result.canceled || result.assets.length === 0) {
    return null;
  }
  return persistPhoto(result.assets[0].uri);
}

export async function deleteStaffPhoto(photoUri: string | null): Promise<void> {
  if (!photoUri || !photoUri.startsWith(STAFF_PHOTO_DIR)) {
    return;
  }
  try {
    await FileSystem.deleteAsync(photoUri, { idempotent: true });
  } catch {
    // Photo cleanup is best-effort only.
  }
}
