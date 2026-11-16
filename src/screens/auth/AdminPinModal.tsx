import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { PinInput } from '../../components/PinInput';
import {
  getAdminPinLockedUntilMs,
  isPinFormatValid,
  recordAdminPinFailure,
  resetAdminPinFailures,
  resetAdminPinWithRecoveryCode,
  verifyAdminPin,
} from '../../services/pinService';
import { colors, fontSize, radius, shadow, spacing } from '../../theme';

interface AdminPinModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminPinModal({
  visible,
  onClose,
  onSuccess,
}: AdminPinModalProps) {
  const [mode, setMode] = useState<'pin' | 'recovery'>('pin');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);

  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) {
      return;
    }
    setMode('pin');
    setPin('');
    setError(undefined);
    setChecking(false);
    setRecoveryCode('');
    setNewPin('');
    setConfirmPin('');
    setRecoveryError(undefined);
    const until = getAdminPinLockedUntilMs();
    setLockedUntil(until && until > Date.now() ? until : null);
  }, [visible]);

  useEffect(() => {
    if (!lockedUntil) {
      setRemaining(0);
      return;
    }
    const update = () => {
      const ms = lockedUntil - Date.now();
      if (ms <= 0) {
        setLockedUntil(null);
        setRemaining(0);
      } else {
        setRemaining(Math.ceil(ms / 1000));
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const locked = lockedUntil !== null && lockedUntil > Date.now();

  const handleUnlock = async () => {
    if (locked) {
      return;
    }
    if (pin.length < 4) {
      setError('Enter your administrator PIN (4–8 digits).');
      return;
    }
    setChecking(true);
    setError(undefined);
    try {
      const valid = await verifyAdminPin(pin);
      if (valid) {
        resetAdminPinFailures();
        setPin('');
        onSuccess();
      } else {
        const result = await recordAdminPinFailure();
        setError('Incorrect PIN. Please try again.');
        if (result.lockedUntil) {
          setLockedUntil(result.lockedUntil);
        }
      }
    } catch {
      setError('Could not verify the PIN. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleRecoveryReset = async () => {
    setRecoveryError(undefined);
    if (!recoveryCode.trim()) {
      setRecoveryError('Enter your recovery code.');
      return;
    }
    if (!isPinFormatValid(newPin)) {
      setRecoveryError('The new PIN must be 4 to 8 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setRecoveryError('The new PIN and confirmation do not match.');
      return;
    }
    setChecking(true);
    try {
      await resetAdminPinWithRecoveryCode(recoveryCode, newPin);
      resetAdminPinFailures();
      setLockedUntil(null);
      setPin(newPin);
      setMode('pin');
      setRecoveryCode('');
      setConfirmPin('');
      onSuccess();
    } catch (resetError) {
      setRecoveryError(
        resetError instanceof Error
          ? resetError.message
          : 'Could not reset the PIN.',
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed" size={28} color={colors.primary} />
            </View>

            <Text style={styles.title}>Administrator access</Text>
            <Text style={styles.subtitle}>
              Enter the master PIN you created during setup to manage staff,
              schedules and reports.
            </Text>

            {mode === 'pin' ? (
              <>
                {locked ? (
                  <View style={styles.lockoutBox}>
                    <Ionicons
                      name="timer-outline"
                      size={24}
                      color={colors.danger}
                    />
                    <Text style={styles.lockoutText}>
                      Too many incorrect attempts. Try again in {remaining}{' '}
                      second{remaining === 1 ? '' : 's'}.
                    </Text>
                  </View>
                ) : (
                  <PinInput
                    value={pin}
                    onChangeText={(value) => {
                      setPin(value);
                      setError(undefined);
                    }}
                    onSubmit={handleUnlock}
                    maxLength={8}
                    autoFocus
                    error={error}
                    placeholder="••••"
                  />
                )}

                <View style={styles.actions}>
                  <AppButton
                    title="Cancel"
                    onPress={onClose}
                    variant="ghost"
                    style={styles.flex}
                  />
                  <AppButton
                    title={checking ? 'Unlocking…' : 'Unlock'}
                    onPress={handleUnlock}
                    variant="primary"
                    loading={checking}
                    disabled={locked || checking}
                    style={styles.flex}
                  />
                </View>

                <Pressable
                  onPress={() => setMode('recovery')}
                  style={styles.recoveryLink}
                >
                  <Text style={styles.recoveryLinkText}>
                    Forgot PIN? Use recovery code
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Recovery code</Text>
                <PinInput
                  value={recoveryCode}
                  onChangeText={(value) => {
                    setRecoveryCode(value.toUpperCase());
                    setRecoveryError(undefined);
                  }}
                  maxLength={9}
                  autoFocus
                  error={recoveryError}
                  placeholder="DS-0000-AA"
                />

                <Text style={styles.fieldLabel}>New PIN</Text>
                <PinInput
                  value={newPin}
                  onChangeText={(value) => {
                    setNewPin(value);
                    setRecoveryError(undefined);
                  }}
                  maxLength={8}
                  placeholder="••••"
                />

                <Text style={styles.fieldLabel}>Confirm new PIN</Text>
                <PinInput
                  value={confirmPin}
                  onChangeText={(value) => {
                    setConfirmPin(value);
                    setRecoveryError(undefined);
                  }}
                  maxLength={8}
                  placeholder="••••"
                  error={recoveryError}
                />

                <View style={styles.actions}>
                  <AppButton
                    title="Back"
                    onPress={() => setMode('pin')}
                    variant="ghost"
                    style={styles.flex}
                  />
                  <AppButton
                    title={checking ? 'Resetting…' : 'Reset PIN'}
                    onPress={handleRecoveryReset}
                    variant="primary"
                    loading={checking}
                    style={styles.flex}
                  />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: spacing.xl,
    paddingBottom: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.modal,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.slate900,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontSize: fontSize.sm,
    color: colors.slate500,
    textAlign: 'center',
    lineHeight: 20,
  },
  lockoutBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  lockoutText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.danger,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  flex: {
    flex: 1,
  },
  recoveryLink: {
    marginTop: spacing.md,
    alignSelf: 'center',
  },
  recoveryLinkText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  fieldLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.slate700,
  },
});
