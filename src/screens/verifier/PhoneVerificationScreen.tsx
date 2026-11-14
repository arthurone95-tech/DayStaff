import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import {
  authenticateAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
} from 'expo-local-authentication';
import { getSetting, setSetting } from '../../database/queries';
import { bytesToBase64Url } from '../../services/qrCrypto';
import { getKioskServerUrl } from '../../services/kioskServer';
import { colors, fontSize, radius, spacing } from '../../theme';

export type PhoneVerificationParams = {
  code: string;
  sessionId: string;
  nonce: string;
  initials: string;
  mode: 'pair' | 'attend';
  expiresAt: number;
};

export default function PhoneVerificationScreen() {
  const route = useRoute();
  const params = (route.params ?? {}) as PhoneVerificationParams;
  const [status, setStatus] = useState<string>(params.mode === 'pair' ? 'Pair this phone' : 'Attendance verification');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const mode = params.mode === 'pair' ? 'pair' : 'attend';

  const runVerification = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const hardware = await hasHardwareAsync();
      if (!hardware) {
        throw new Error('No Face ID or fingerprint is available on this device.');
      }
      const types = await supportedAuthenticationTypesAsync();
      const enrolled = await isEnrolledAsync();
      if (types.length === 0 || !enrolled) {
        throw new Error('No Face ID or fingerprint is enrolled on this device.');
      }

      const result = await authenticateAsync({
        promptMessage:
          mode === 'pair' ? 'Pair this phone with DayStaff' : 'Verify attendance with Face ID',
        requireConfirmation: true,
        cancelLabel: 'Cancel',
      });

      if (!result.success) {
        throw new Error('Biometric verification failed.');
      }

      const storedToken = getSetting('daystaff.phone.device_token');
      const deviceToken: string =
        mode === 'pair'
          ? storedToken || bytesToBase64Url(Crypto.getRandomBytes(18))
          : String(storedToken || '');
      if (!deviceToken) {
        throw new Error('This phone is not paired yet.');
      }
      if (mode === 'pair') {
        setSetting('daystaff.phone.device_token', deviceToken);
      }

      const response = await fetch(`${getKioskServerUrl()}api/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          v: 1,
          kind: mode,
          code: params.code,
          sessionId: params.sessionId,
          timestamp: Date.now(),
          deviceToken,
          biometric: true,
          nativeAuth: true,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Verification failed.');
      }

      setSuccess(true);
      setStatus(mode === 'pair' ? 'Phone paired successfully.' : 'Attendance verified successfully.');
    } catch (verificationError) {
      const message =
        verificationError instanceof Error
          ? verificationError.message
          : 'Biometric verification failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [mode, params.code, params.sessionId]);

  useEffect(() => {
    setStatus(params.mode === 'pair' ? 'Pair this phone' : 'Attendance verification');
    setSuccess(false);
    setError(undefined);
  }, [params.mode, params.sessionId]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>DayStaff phone verification</Text>
        <Text style={styles.subtitle}>Staff code: #{params.code}</Text>
        <Text style={styles.subtitle}>Initials: {params.initials}</Text>
        <Text style={styles.status}>{status}</Text>
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title={busy ? 'Waiting for biometrics…' : 'Verify with Face ID / fingerprint'}
          onPress={() => void runVerification()}
          disabled={busy}
        />
        {success ? (
          <Text style={styles.success}>Verification completed successfully.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.slate900 },
  subtitle: { fontSize: fontSize.sm, color: colors.slate700, lineHeight: 20 },
  status: { fontSize: fontSize.md, fontWeight: '700', color: colors.slate900 },
  error: { fontSize: fontSize.sm, color: colors.dangerBright },
  success: { fontSize: fontSize.sm, fontWeight: '700', color: colors.success },
});
