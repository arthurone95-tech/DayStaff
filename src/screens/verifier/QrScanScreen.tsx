import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Screen } from '../../components/Screen';
import { QrScanner } from '../../components/QrScanner';
import type { RootNavigation } from '../../navigation/types';
import type { PhoneVerificationParams } from './PhoneVerificationScreen';

function parseKioskQr(value: string): PhoneVerificationParams | null {
  const queryIndex = value.indexOf('?');
  const query = queryIndex >= 0 ? value.slice(queryIndex + 1) : '';
  const pairs = query.split('&').filter(Boolean);
  const params = new Map<string, string>();
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = pair.slice(0, separator);
    const val = pair.slice(separator + 1);
    params.set(key, val);
  }

  const version = params.get('v');
  const mode = params.get('m') === 'pair' ? ('pair' as const) : ('attend' as const);
  const code = (params.get('c') || '').toUpperCase();
  const sessionId = params.get('s') || '';
  const nonce = params.get('n') || '';
  const initials = params.get('i') || '';
  const expiresAt = Number(params.get('x') || 0);

  if (version !== '1' || !code || !sessionId || !nonce || !Number.isFinite(expiresAt)) {
    return null;
  }

  return { code, sessionId, nonce, initials, mode, expiresAt };
}

export default function QrScanScreen() {
  const navigation = useNavigation<RootNavigation>();
  const [error, setError] = useState<string | undefined>();
  const [resetKey, setResetKey] = useState(0);

  const handleScanned = useCallback(
    (value: string) => {
      const parsed = parseKioskQr(value);
      if (!parsed) {
        setError('That QR is not a valid DayStaff kiosk code.');
        return;
      }
      setError(undefined);
      navigation.replace('PhoneVerification', parsed);
    },
    [navigation],
  );

  const handleRescan = useCallback(() => {
    setError(undefined);
    setResetKey((value) => value + 1);
  }, []);

  return (
    <Screen>
      <View style={styles.container}>
        <QrScanner active onScanned={handleScanned} resetKey={resetKey} size={300} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          onPress={handleRescan}
          style={({ pressed }) => [styles.rescan, pressed && styles.rescanPressed]}
          accessibilityRole="button"
          accessibilityLabel="Scan again"
        >
          <Text style={styles.rescanText}>Scan again</Text>
        </Pressable>
        <Text style={styles.hint}>Scan the DayStaff kiosk QR with your camera.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#FF4D4F', fontSize: 13, textAlign: 'center' },
  hint: { color: '#94A3B8', fontSize: 12, textAlign: 'center' },
  rescan: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#2F5480' },
  rescanPressed: { opacity: 0.7 },
  rescanText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
