/**
 * Thin wrapper around expo-local-authentication.
 *
 * Note: device biometrics verify the person enrolled on the device; they do
 * not enroll individual staff members. The kiosk therefore combines this
 * device-level check with an explicit staff selection.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  available: boolean;
  /** Sensor type reported by the OS (Face ID, fingerprint, iris). */
  kind: BiometricKind;
  /** Human-readable sensor name, e.g. "Face ID" or "Fingerprint". */
  label: string;
  message: string;
}

export interface BiometricResult {
  success: boolean;
  /** True when a development build had to simulate the prompt. */
  simulated?: boolean;
  error?: string;
}

function resolveKind(
  types: LocalAuthentication.AuthenticationType[],
): BiometricKind {
  if (
    types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
  ) {
    return 'face';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'fingerprint';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'iris';
  }
  return 'none';
}

function labelForKind(kind: BiometricKind): string {
  if (kind === 'face') {
    return Platform.OS === 'ios' ? 'Face ID' : 'Face recognition';
  }
  if (kind === 'iris') {
    return 'Iris scan';
  }
  if (kind === 'fingerprint') {
    return 'Fingerprint';
  }
  return 'Biometrics';
}

/**
 * Synchronous biometric label based on platform, for use in static UI text
 * where an async `getBiometricStatus()` call is not practical.
 */
export function getBiometricLabelSync(): string {
  if (Platform.OS === 'ios') {
    return 'Face ID';
  }
  return 'Fingerprint';
}

/**
 * Inspect the physical sensor and enrolment state before any prompt is shown.
 * This lets the kiosk explain *why* verification is unavailable on iOS Face ID
 * devices, Android sensors, and hardware without biometrics.
 */
export async function getBiometricStatus(): Promise<BiometricStatus> {
  try {
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    const kind = resolveKind(supportedTypes);
    const label = labelForKind(kind);

    let message = `${label} is ready.`;
    if (!hasHardware) {
      message =
        'This device has no biometric sensor. Use a device with Face ID, Touch ID, or a fingerprint sensor.';
    } else if (!isEnrolled) {
      message = `No ${label.toLowerCase()} is enrolled on this device. Add one in the device settings, then return to the kiosk.`;
    }

    return {
      hasHardware,
      isEnrolled,
      available: hasHardware && isEnrolled,
      kind,
      label,
      message,
    };
  } catch (error) {
    return {
      hasHardware: false,
      isEnrolled: false,
      available: false,
      kind: 'none',
      label: 'Biometrics',
      message:
        error instanceof Error
          ? `Biometric check failed: ${error.message}`
          : 'Could not read the device biometric sensor.',
    };
  }
}

function mapFailure(error: LocalAuthentication.LocalAuthenticationError): string {
  switch (error) {
    case 'user_cancel':
    case 'app_cancel':
    case 'system_cancel':
      return 'Verification cancelled.';
    case 'lockout':
      return 'Too many attempts. Wait a moment and try again.';
    case 'not_available':
      return 'Biometric verification is not available on this device.';
    case 'not_enrolled':
      return 'No biometric is enrolled on this device. Add one in the device settings.';
    case 'passcode_not_set':
      return 'The device has no passcode or biometric enrolled.';
    case 'timeout':
      return 'The biometric prompt timed out. Try again.';
    case 'user_fallback':
      return 'Device passcode fallback is disabled. Try your biometric again.';
    case 'authentication_failed':
      return 'Biometric verification failed. Try again.';
    default:
      return 'Biometric verification failed.';
  }
}

/**
 * Prompt for the sensor reported by the OS (Face ID / Touch ID / fingerprint).
 *
 * Device passcode fallback is intentionally disabled: the kiosk must verify a
 * biometric, not the shared device passcode. In development, an unavailable
 * sensor falls back to a simulated success so the kiosk can be exercised on
 * simulators; production builds stay strict.
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
      promptSubtitle:
        status.kind === 'face' ? 'Look at the front camera' : undefined,
      promptDescription:
        status.kind === 'face'
          ? 'Confirm your attendance with Face ID.'
          : 'Confirm your attendance with your enrolled biometric.',
      cancelLabel: 'Cancel',
      // Never surface the OS device-passcode prompt for attendance.
      disableDeviceFallback: true,
      fallbackLabel: '',
      requireConfirmation: false,
    });

    if (result.success) {
      return { success: true };
    }

    return { success: false, error: mapFailure(result.error) };
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
