/**
 * DayStaff OS-level kiosk lock task bridge.
 *
 * Calls into the native Android module (KioskLockTaskModule) registered via
 * the withKioskLockTask config plugin. On iOS and non-production builds the
 * functions are no-ops so the app remains usable in Expo Go and simulators.
 */

import { NativeModules, Platform } from 'react-native';

const { KioskLockTask } = NativeModules;

/**
 * Enables Android lock task mode (kiosk lock). Requires a production/development
 * build with the withKioskLockTask config plugin applied.
 *
 * @returns Promise that resolves when lock task mode is active, or rejects
 *          if the native module is unavailable or the app is not whitelisted.
 */
export async function enableKiosk(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (!KioskLockTask) {
    if (__DEV__) {
      console.warn(
        'KioskLockTask native module is not available. Run `npx expo prebuild` ' +
          'with the withKioskLockTask config plugin to enable OS-level kiosk lock.',
      );
      return;
    }
    throw new Error('Kiosk lock task native module is not available.');
  }
  await KioskLockTask.enableKiosk();
}

/**
 * Disables Android lock task mode and returns the device to normal operation.
 *
 * @returns Promise that resolves when lock task mode is stopped.
 */
export async function disableKiosk(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (!KioskLockTask) {
    if (__DEV__) {
      console.warn(
        'KioskLockTask native module is not available. Run `npx expo prebuild` ' +
          'with the withKioskLockTask config plugin to enable OS-level kiosk lock.',
      );
      return;
    }
    throw new Error('Kiosk lock task native module is not available.');
  }
  await KioskLockTask.disableKiosk();
}

/**
 * Checks whether the native kiosk lock task module is available.
 */
export function isKioskLockTaskAvailable(): boolean {
  return Platform.OS === 'android' && Boolean(KioskLockTask);
}
