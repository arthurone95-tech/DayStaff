import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from './AppButton';
import { DynamicQrPanel } from './DynamicQrPanel';
import { useNow } from '../hooks/useNow';
import { setStaffDeviceCredential } from '../database/queries';
import {
  createQrSession,
  isSessionExpired,
  sessionRemainingSeconds,
  type QrSession,
} from '../services/qrVerificationService';
import { getKioskServerUrl, setKioskServerHandlers, startKioskServer } from '../services/kioskServer';
import { colors, fontSize, radius, spacing } from '../theme';
import type { Staff } from '../types';

interface PhonePairingModalProps {
  visible: boolean;
  staff: Staff;
  onClose: () => void;
  onPaired?: () => void;
}

export function PhonePairingModal({
  visible,
  staff,
  onClose,
  onPaired,
}: PhonePairingModalProps) {
  const now = useNow(1000);
  const [session, setSession] = useState<QrSession | null>(null);
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [scanResetKey, setScanResetKey] = useState(0);

  useEffect(() => {
    if (visible) {
      void startKioskServer().catch(() => undefined);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPaired(false);
    setError(undefined);
    setSession(createQrSession(staff, 'pair', getKioskServerUrl()));
    setScanResetKey((value) => value + 1);
  }, [staff.id, staff.fullName, staff.staffCode, visible]);

  useEffect(() => {
    if (!visible || !session || paired) {
      return;
    }
    const timer = setTimeout(() => {
      if (isSessionExpired(session, Date.now())) {
        setSession(createQrSession(staff, 'pair', getKioskServerUrl()));
        setScanResetKey((value) => value + 1);
      }
    }, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [paired, session, staff, visible]);

  const handlePairPayload = useCallback(
    async (payload: any) => {
      if (!session || paired) {
        return { ok: false, error: 'No active pairing session.' };
      }
      if (payload?.sessionId !== session.sessionId) {
        return { ok: false, error: 'This pairing belongs to a different session.' };
      }
      if (String(payload?.code || '').toUpperCase() !== staff.staffCode.toUpperCase()) {
        return { ok: false, error: 'The staff code does not match.' };
      }
      if (!payload?.nonce || payload.nonce !== session.nonce) {
        return { ok: false, error: 'The authentication challenge does not match.' };
      }
      const payloadTimestamp = Number(payload?.timestamp || 0);
      if (
        !Number.isFinite(payloadTimestamp) ||
        payloadTimestamp > Date.now() + 2000 ||
        Date.now() - payloadTimestamp > 5000
      ) {
        return { ok: false, error: 'Attendance was rejected because the proof was expired.' };
      }
      const deviceToken = String(payload?.deviceToken || '');
      if (!deviceToken) {
        return { ok: false, error: 'The phone did not send a device token.' };
      }
      if (payload?.nativeAuth === true) {
        setBusy(true);
        setError(undefined);
        try {
          setStaffDeviceCredential(staff.id, { token: deviceToken, publicKey: null });
          setPaired(true);
          onPaired?.();
          return { ok: true };
        } catch (pairError) {
          const message =
            pairError instanceof Error ? pairError.message : 'The phone could not be paired.';
          setError(message);
          return { ok: false, error: message };
        } finally {
          setBusy(false);
        }
      }
      if (!payload?.credentialId || !payload?.publicKey) {
        return { ok: false, error: 'The phone did not send a valid credential.' };
      }
      setBusy(true);
      setError(undefined);
      try {
        setStaffDeviceCredential(staff.id, {
          token: String(payload.credentialId),
          publicKey: String(payload.publicKey),
        });
        setPaired(true);
        onPaired?.();
        return { ok: true };
      } catch (pairError) {
        const message =
          pairError instanceof Error ? pairError.message : 'The phone could not be paired.';
        setError(message);
        return { ok: false, error: message };
      } finally {
        setBusy(false);
      }
    },
    [onPaired, paired, session, staff.id, staff.staffCode],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    setKioskServerHandlers({ onPair: handlePairPayload });
    return () => setKioskServerHandlers({ onPair: null });
  }, [handlePairPayload, visible]);

  const remaining = session ? sessionRemainingSeconds(session, now.getTime()) : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Ionicons
                  name={paired ? 'checkmark-circle' : 'phone-portrait-outline'}
                  size={24}
                  color={paired ? colors.success : colors.primary}
                />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>
                  {paired ? 'Phone paired' : 'Pair a phone'}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {staff.fullName} • #{staff.staffCode}
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={colors.slate700} />
              </Pressable>
            </View>

            {paired ? (
              <View style={styles.successBody}>
                <Text style={styles.successText}>
                  This phone can now verify {staff.fullName} for attendance. Keep it with them.
                </Text>
                <AppButton title="Done" onPress={onClose} />
              </View>
            ) : session ? (
              <>
                <Text style={styles.step}>
                  1. Connect the phone to the same Wi-Fi network as this kiosk.
                </Text>
                <Text style={styles.step}>
                  2. Open the DayStaff app on the phone and scan the QR code below
                  (the phone camera also works and opens the app via the deep link).
                </Text>
                <Text style={styles.step}>
                  3. Confirm with the phone's Face ID or fingerprint.
                </Text>
                <DynamicQrPanel
                  title="Pair this phone"
                  session={session}
                  remainingSeconds={remaining}
                  staffName={staff.fullName}
                  initials={session.initials}
                  error={error}
                  busy={busy}
                  showScanner={false}
                  scanResetKey={scanResetKey}
                  hint="The phone creates a secure device credential in its hardware and registers it with this kiosk over the local network."
                  onScan={() => undefined}
                />
              </>
            ) : null}

            <View style={styles.footer}>
              <AppButton title="Cancel" variant="ghost" onPress={onClose} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 700, backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.infoSoft },
  headerText: { flex: 1 },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.slate900 },
  subtitle: { fontSize: fontSize.xs, color: colors.slate500, marginTop: 2 },
  closeButton: { padding: spacing.xs },
  successBody: { gap: spacing.md },
  successText: { fontSize: fontSize.sm, color: colors.slate700, lineHeight: 20 },
  step: { fontSize: fontSize.sm, color: colors.slate700, lineHeight: 20 },
  footer: { marginTop: spacing.sm },
});
