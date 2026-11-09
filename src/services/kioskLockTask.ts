/**
 * DayStaff OS-level kiosk lock task bridge.
 *
 * Calls into the native Android module (KioskLockTaskModule) registered via
 * the withKioskLockTask config plugin. On iOS and non-production builds the
 * functions are no-ops so the app remains usable in Expo Go and simulators.
 */

import { NativeModules, Platform } from 'react-native';

const { KioskLockTask } = NativeModules;

/** Tracks whether OS-level kiosk lock is currently active. */
let kioskActive = false;

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
  kioskActive = true;
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
  kioskActive = false;
}

/**
 * Temporarily leaves Android lock task mode so an external system activity
 * (for example the system photo picker) can hand its result back to the app.
 *
 * @returns true when lock task mode was active and has been suspended.
 */
export async function suspendKioskLock(): Promise<boolean> {
  if (!isKioskLockTaskAvailable()) {
    return false;
  }
  try {
    await disableKiosk();
    return true;
  } catch {
    return false;
  }
}

/**
 * Restores lock task mode after a successful `suspendKioskLock` call.
 */
export async function resumeKioskLock(wasSuspended: boolean): Promise<void> {
  if (!wasSuspended) {
    return;
  }
  try {
    await enableKiosk();
  } catch {
    // Best effort. The kiosk screen will try again when it regains focus.
  }
}

/**
 * Checks whether the native kiosk lock task module is available.
 */
export function isKioskLockTaskAvailable(): boolean {
  return Platform.OS === 'android' && Boolean(KioskLockTask);
}

/**
 * Whether OS-level kiosk lock is currently active (best-effort, in-memory).
 */
export function isKioskLockActive(): boolean {
  return kioskActive;
}
