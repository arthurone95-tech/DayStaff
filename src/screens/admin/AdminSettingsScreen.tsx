import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Card } from '../../components/Card';
import { PinInput } from '../../components/PinInput';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { getSetting, setSetting } from '../../database/queries';
import {
  DEFAULT_SCHOOL_NAME,
  SCHOOL_NAME_SETTING,
} from '../../database/seed';
import type { RootNavigation } from '../../navigation/types';
import {
  type BiometricStatus,
  getBiometricStatus,
} from '../../services/biometricService';
import {
  changeAdminPin,
  DEFAULT_ADMIN_PIN,
  isPinFormatValid,
  verifyAdminPin,
} from '../../services/pinService';
import { colors, fontSize, spacing } from '../../theme';

export function AdminSettingsScreen() {
  const navigation = useNavigation<RootNavigation>();

  const [schoolName, setSchoolName] = useState(
    getSetting(SCHOOL_NAME_SETTING) ?? DEFAULT_SCHOOL_NAME,
  );
  const [savingName, setSavingName] = useState(false);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | undefined>();
  const [savingPin, setSavingPin] = useState(false);

  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [usingDefaultPin, setUsingDefaultPin] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [status, isDefault] = await Promise.all([
        getBiometricStatus(),
        verifyAdminPin(DEFAULT_ADMIN_PIN),
      ]);
      if (mounted) {
        setBiometric(status);
        setUsingDefaultPin(isDefault);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveName = () => {
    setSavingName(true);
    try {
      const value = schoolName.trim() || DEFAULT_SCHOOL_NAME;
      setSetting(SCHOOL_NAME_SETTING, value);
      setSchoolName(value);
      Alert.alert('Saved', 'The school name has been updated.');
    } catch (error) {
      Alert.alert(
        'Could not save',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePin = async () => {
    setPinError(undefined);
    if (!isPinFormatValid(currentPin)) {
      setPinError('Enter your current 4–8 digit PIN.');
      return;
    }
    if (!isPinFormatValid(newPin)) {
      setPinError('The new PIN must be 4–8 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('The new PIN and confirmation do not match.');
      return;
    }

    setSavingPin(true);
    try {
      await changeAdminPin(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setUsingDefaultPin(await verifyAdminPin(DEFAULT_ADMIN_PIN));
      Alert.alert(
        'PIN updated',
        'Use the new PIN the next time you unlock the admin area.',
      );
    } catch (error) {
      setPinError(
        error instanceof Error ? error.message : 'Could not update the PIN.',
      );
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Text style={styles.cardTitle}>School details</Text>
          <Text style={styles.cardHint}>
            Shown on the kiosk and in exported reports.
          </Text>
          <View style={styles.field}>
            <TextField
              label="School name"
              value={schoolName}
              onChangeText={setSchoolName}
              placeholder={DEFAULT_SCHOOL_NAME}
              maxLength={60}
            />
          </View>
          <AppButton
            title="Save school name"
            onPress={handleSaveName}
            loading={savingName}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Administrator PIN</Text>
          <Text style={styles.cardHint}>
            The master PIN unlocks the admin dashboard from the kiosk.
          </Text>

          {usingDefaultPin ? (
            <View style={styles.warning}>
              <Ionicons
                name="warning-outline"
                size={16}
                color={colors.warningDark}
              />
              <Text style={styles.warningText}>
                You are still using the default PIN (1234). Change it now.
              </Text>
            </View>
          ) : null}

          <View style={styles.pinFields}>
            <Text style={styles.pinLabel}>Current PIN</Text>
            <PinInput
              value={currentPin}
              onChangeText={(value) => {
                setCurrentPin(value);
                setPinError(undefined);
              }}
              maxLength={8}
              placeholder="Current PIN"
            />
            <Text style={styles.pinLabel}>New PIN</Text>
            <PinInput
              value={newPin}
              onChangeText={(value) => {
                setNewPin(value);
                setPinError(undefined);
              }}
              maxLength={8}
              placeholder="New PIN"
            />
            <Text style={styles.pinLabel}>Confirm new PIN</Text>
            <PinInput
              value={confirmPin}
              onChangeText={(value) => {
                setConfirmPin(value);
                setPinError(undefined);
              }}
              maxLength={8}
              placeholder="Confirm new PIN"
              error={pinError}
            />
          </View>

          <AppButton
            title="Update PIN"
            onPress={handleChangePin}
            loading={savingPin}
            style={styles.pinButton}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Device biometrics</Text>
          <Text style={styles.cardHint}>
            The kiosk uses the fingerprint or Face ID enrolled on this terminal.
          </Text>

          <View style={styles.statusList}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Biometric hardware</Text>
              <Ionicons
                name={
                  biometric?.hasHardware ? 'checkmark-circle' : 'close-circle'
                }
                size={18}
                color={
                  biometric?.hasHardware ? colors.success : colors.danger
                }
              />
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Enrolled biometric</Text>
              <Ionicons
                name={
                  biometric?.isEnrolled ? 'checkmark-circle' : 'close-circle'
                }
                size={18}
                color={biometric?.isEnrolled ? colors.success : colors.danger}
              />
            </View>
          </View>

          <Text style={styles.biometricMessage}>
            {biometric?.message ?? 'Checking device biometrics…'}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Admin session</Text>
          <Text style={styles.cardHint}>
            Return to the locked kiosk immediately. The PIN will be required
            again next time.
          </Text>
          <AppButton
            title="Lock admin area"
            onPress={() => navigation.popToTop()}
            variant="danger"
            style={styles.lockButton}
            icon={<Ionicons name="lock-closed" size={18} color={colors.white} />}
          />
        </Card>

        <Text style={styles.version}>DayStaff · v1.0.0 · Offline MVP</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    marginTop: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate800,
  },
  cardHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
  field: {
    marginTop: spacing.lg,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.sm,
    marginTop: spacing.md,
  },
  warningText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.warningDark,
  },
  pinFields: {
    marginTop: spacing.md,
  },
  pinLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.slate700,
  },
  pinButton: {
    marginTop: spacing.lg,
  },
  statusList: {
    marginTop: spacing.md,
    backgroundColor: colors.slate50,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statusLabel: {
    fontSize: fontSize.sm,
    color: colors.slate700,
    fontWeight: '600',
  },
  biometricMessage: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
  lockButton: {
    marginTop: spacing.lg,
  },
  version: {
    marginTop: spacing.xl,
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.slate400,
  },
});
