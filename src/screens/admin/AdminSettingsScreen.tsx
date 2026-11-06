import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { AuthMethodPicker } from '../../components/AuthMethodPicker';
import { Card } from '../../components/Card';
import { PinInput } from '../../components/PinInput';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import type { RootNavigation } from '../../navigation/types';
import {
  getAuthMethod,
  getCompanyName,
  setAuthMethod,
  setCompanyName,
} from '../../services/appSettings';
import {
  type BiometricStatus,
  getBiometricLabelSync,
  getBiometricStatus,
} from '../../services/biometricService';
import {
  changeAdminPin,
  isPinFormatValid,
} from '../../services/pinService';
import { disableKiosk, isKioskLockTaskAvailable } from '../../services/kioskLockTask';
import { colors, fontSize, spacing } from '../../theme';
import type { AuthMethod } from '../../types';

export function AdminSettingsScreen() {
  const navigation = useNavigation<RootNavigation>();

  const [companyName, setCompanyNameState] = useState(getCompanyName());
  const [savingName, setSavingName] = useState(false);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | undefined>();
  const [savingPin, setSavingPin] = useState(false);

  const [authMethod, setAuthMethodState] = useState<AuthMethod>(
    getAuthMethod(),
  );
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [exitKioskVisible, setExitKioskVisible] = useState(false);
  const [kioskLockAvailable, setKioskLockAvailable] = useState(
    isKioskLockTaskAvailable(),
  );

  useEffect(() => {
    let mounted = true;
    getBiometricStatus().then((status) => {
      if (mounted) {
        setBiometric(status);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveName = () => {
    const value = companyName.trim();
    if (!value) {
      Alert.alert('Company name required', 'Enter a company or school name.');
      return;
    }
    setSavingName(true);
    try {
      setCompanyName(value);
      setCompanyNameState(value);
      Alert.alert('Saved', 'The company details have been updated.');
    } catch (error) {
      Alert.alert(
        'Could not save',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleAuthMethodChange = (method: AuthMethod) => {
    try {
      setAuthMethod(method);
      setAuthMethodState(method);
    } catch (error) {
      Alert.alert(
        'Could not change kiosk mode',
        error instanceof Error ? error.message : 'Please try again.',
      );
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

  const handleExitKiosk = async () => {
    Alert.alert(
      'Exit kiosk mode?',
      'This will disable the OS-level kiosk lock and return the device to normal operation. You will need the admin PIN to re-enter the admin area.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit kiosk',
          style: 'destructive',
          onPress: async () => {
            try {
              await disableKiosk();
            } catch (error) {
              Alert.alert(
                'Could not exit kiosk mode',
                error instanceof Error ? error.message : 'Unknown error.',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
        <Card>
          <Text style={styles.cardTitle}>Company details</Text>
          <Text style={styles.cardHint}>
            Shown on the kiosk and in exported reports.
          </Text>
          <View style={styles.field}>
            <TextField
              label="Company / school name"
              value={companyName}
              onChangeText={setCompanyNameState}
              placeholder="e.g. Greenfield Academy"
              maxLength={60}
            />
          </View>
          <AppButton
            title="Save company name"
            onPress={handleSaveName}
            loading={savingName}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Kiosk authentication</Text>
          <Text style={styles.cardHint}>
            Choose how staff identify themselves. This takes effect the next
            time the kiosk is shown.
          </Text>
          <View style={styles.authPicker}>
            <AuthMethodPicker
              value={authMethod}
              onChange={handleAuthMethodChange}
            />
          </View>
          <Text style={styles.authNote}>
            Face mode uses an on-device visual match against staff photos and
            may ask the staff member to confirm. Code mode uses this device's
            {getBiometricLabelSync()}.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Administrator PIN</Text>
          <Text style={styles.cardHint}>
            The master PIN unlocks the admin dashboard from the kiosk. There is
            no default PIN; this is the PIN you created during setup.
          </Text>

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
            Code mode verifies the {getBiometricLabelSync()} enrolled on this
            terminal. Face-recognition mode uses the camera instead.
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
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Detected sensor</Text>
              <Text style={styles.statusValue}>
                {biometric?.label ?? 'Checking…'}
              </Text>
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
          {kioskLockAvailable && (
            <AppButton
              title="Exit kiosk mode"
              onPress={handleExitKiosk}
              variant="ghost"
              style={styles.exitKioskButton}
              icon={<Ionicons name="lock-open" size={18} color={colors.danger} />}
            />
          )}
        </Card>

          <Text style={styles.version}>DayStaff · v1.1.0 · Offline MVP</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
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
  authPicker: {
    marginTop: spacing.md,
  },
  authNote: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.slate500,
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
  statusValue: {
    fontSize: fontSize.sm,
    color: colors.slate500,
    fontWeight: '700',
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
  exitKioskButton: {
    marginTop: spacing.sm,
  },
  version: {
    marginTop: spacing.xl,
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.slate400,
  },
});
