/**
 * Thin wrapper around expo-local-authentication.
 *
 * Note: device biometrics verify the person enrolled on the device; they do
 * not enroll individual staff members. The kiosk therefore combines this
 * device-level check with an explicit staff selection.
 */

import * as LocalAuthentication from 'expo-local-authentication';

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  available: boolean;
  message: string;
}

export interface BiometricResult {
  success: boolean;
  /** True when a development build had to simulate the prompt. */
  simulated?: boolean;
  error?: string;
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);

  let message = 'Biometric verification is ready.';
  if (!hasHardware) {
    message = 'This device has no biometric hardware.';
  } else if (!isEnrolled) {
    message =
      'No fingerprint or Face ID is enrolled on this device. Enroll one in device settings.';
  }

  return {
    hasHardware,
    isEnrolled,
    available: hasHardware && isEnrolled,
    message,
  };
}

/**
 * Prompt for fingerprint / Face ID.
 *
 * In development, an unavailable sensor falls back to a simulated success so
 * the kiosk can be exercised on simulators. Production builds stay strict.
 */
export async function authenticateBiometric(
  promptMessage = 'Verify your identity to record attendance',
): Promise<BiometricResult> {
  const status = await getBiometricStatus();

  if (!status.available) {
    if (__DEV__) {
      return {
        success: true,
        simulated: true,
      };
    }
    return { success: false, error: status.message };
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use device passcode',
      disableDeviceFallback: false,
      requireConfirmation: false,
    });

    if (result.success) {
      return { success: true };
    }

    const error =
      result.error === 'user_cancel'
        ? 'Verification cancelled.'
        : result.error === 'lockout'
          ? 'Too many attempts. Try again later.'
          : 'Biometric verification failed.';

    return { success: false, error };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not start biometric verification.',
    };
  }
}
