import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { PinInput } from '../../components/PinInput';
import { verifyAdminPin } from '../../services/pinService';
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
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (visible) {
      setPin('');
      setError(undefined);
      setChecking(false);
    }
  }, [visible]);

  const handleUnlock = async () => {
    if (pin.length < 4) {
      setError('Enter your administrator PIN (4–8 digits).');
      return;
    }
    setChecking(true);
    setError(undefined);
    try {
      const valid = await verifyAdminPin(pin);
      if (valid) {
        setPin('');
        onSuccess();
      } else {
        setError('Incorrect PIN. Please try again.');
      }
    } catch {
      setError('Could not verify the PIN. Please try again.');
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
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={28} color={colors.primary} />
          </View>

          <Text style={styles.title}>Administrator access</Text>
          <Text style={styles.subtitle}>
            Enter the master PIN to manage staff, schedules and reports.
          </Text>

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
              style={styles.flex}
            />
          </View>

          <Text style={styles.hint}>First run? The default PIN is 1234.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  flex: {
    flex: 1,
  },
  hint: {
    marginTop: spacing.lg,
    fontSize: fontSize.xs,
    color: colors.slate400,
    textAlign: 'center',
  },
});
