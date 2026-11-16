import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { AppButton } from '../../components/AppButton';
import { useAppDialog } from '../../components/AppDialog';
import { AuthMethodPicker } from '../../components/AuthMethodPicker';
import { Card } from '../../components/Card';
import { PinInput } from '../../components/PinInput';
import { AdminBottomTabBar } from '../../components/AdminBottomTabBar';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import type { RootNavigation } from '../../navigation/types';
import {
  MAX_MODE_RESET_TIMEOUT_SECONDS,
  MIN_MODE_RESET_TIMEOUT_SECONDS,
} from '../../config/app';
import {
  type FaceStrictness,
  getAuthMethod,
  getCompanyName,
  getFaceStrictness,
  getModeResetTimeoutSeconds,
  getQrVerifierUrl,
  getScanLightEnabled,
  setAuthMethod,
  setCompanyName,
  setFaceStrictness,
  setModeResetTimeoutSeconds,
  setQrVerifierUrl,
  setScanLightEnabled,
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
import { colors, fontSize, spacing } from '../../theme';
import type { AuthMethod } from '../../types';

export function AdminSettingsScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { alert } = useAppDialog();

  const [savedCompanyName, setSavedCompanyName] = useState(getCompanyName());
  const [companyName, setCompanyNameState] = useState(getCompanyName());
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const nameChanged = companyName.trim() !== savedCompanyName.trim();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | undefined>();
  const [savingPin, setSavingPin] = useState(false);
  const [pinEditorOpen, setPinEditorOpen] = useState(false);

  const [scanLight, setScanLightState] = useState(getScanLightEnabled());
  const [strictness, setStrictnessState] =
    useState<FaceStrictness>(getFaceStrictness());

  const [authMethod, setAuthMethodState] = useState<AuthMethod>(
    getAuthMethod(),
  );
  const [modeResetSeconds, setModeResetSeconds] = useState(
    String(getModeResetTimeoutSeconds()),
  );
  const [verifierUrl, setVerifierUrl] = useState(getQrVerifierUrl());
  const [savingQrSettings, setSavingQrSettings] = useState(false);
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);

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
      alert({
        tone: 'warning',
        title: 'Company name required',
        message: 'Enter a company or school name.',
      });
      return;
    }
    setSavingName(true);
    try {
      setCompanyName(value);
      setCompanyNameState(value);
      setSavedCompanyName(value);
      setEditingName(false);
      Keyboard.dismiss();
      alert({
        tone: 'success',
        title: 'Saved',
        message: 'The company details have been updated.',
      });
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not save',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelName = () => {
    Keyboard.dismiss();
    setCompanyNameState(savedCompanyName);
    setEditingName(false);
  };

  const handleAuthMethodChange = (method: AuthMethod) => {
    try {
      setAuthMethod(method);
      setAuthMethodState(method);
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not change kiosk mode',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleSaveQrSettings = () => {
    const parsed = Number(modeResetSeconds);
    if (
      !Number.isFinite(parsed) ||
      parsed < MIN_MODE_RESET_TIMEOUT_SECONDS ||
      parsed > MAX_MODE_RESET_TIMEOUT_SECONDS
    ) {
      alert({
        tone: 'warning',
        title: 'Invalid timeout',
        message: `Enter a whole number between ${MIN_MODE_RESET_TIMEOUT_SECONDS} and ${MAX_MODE_RESET_TIMEOUT_SECONDS} seconds.`,
      });
      return;
    }
    const url = verifierUrl.trim();
    setSavingQrSettings(true);
    try {
      setModeResetTimeoutSeconds(parsed);
      setModeResetSeconds(String(getModeResetTimeoutSeconds()));
      setQrVerifierUrl(url);
      setVerifierUrl(getQrVerifierUrl());
      Keyboard.dismiss();
      alert({
        tone: 'success',
        title: 'Visual QR settings saved',
        message:
          'New kiosk sessions will use the updated timeout and verifier address.',
      });
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not save QR settings',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSavingQrSettings(false);
    }
  };

  const openPinEditor = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError(undefined);
    setPinEditorOpen(true);
  };

  const closePinEditor = () => {
    Keyboard.dismiss();
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError(undefined);
    setPinEditorOpen(false);
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
      Keyboard.dismiss();
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setPinEditorOpen(false);
      alert({
        tone: 'success',
        title: 'PIN updated',
        message: 'Use the new PIN the next time you unlock the admin area.',
      });
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
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.scroll}
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
            {editingName ? (
              <TextField
                label="Company / school name"
                value={companyName}
                onChangeText={setCompanyNameState}
                placeholder="e.g. Greenfield Academy"
                maxLength={60}
                autoFocus
              />
            ) : (
              <>
                <Text style={styles.pinLabel}>Company / school name</Text>
                <View style={styles.nameReadOnly}>
                  <Text
                    style={[
                      styles.nameReadOnlyText,
                      !savedCompanyName && styles.nameReadOnlyEmpty,
                    ]}
                    numberOfLines={2}
                  >
                    {savedCompanyName || 'Not set'}
                  </Text>
                </View>
              </>
            )}
          </View>

          {editingName ? (
            <View style={styles.nameButtons}>
              <View style={styles.nameButton}>
                <AppButton
                  title="Cancel"
                  onPress={handleCancelName}
                  variant="ghost"
                  disabled={savingName}
                />
              </View>
              <View style={styles.nameButton}>
                <AppButton
                  title="Save"
                  onPress={handleSaveName}
                  loading={savingName}
                  disabled={!nameChanged || savingName}
                />
              </View>
            </View>
          ) : (
            <AppButton
              title="Edit"
              onPress={() => setEditingName(true)}
              variant="ghost"
              icon={
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={colors.primary}
                />
              }
              style={styles.pinButton}
            />
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Kiosk authentication</Text>
          <Text style={styles.cardHint}>
            Choose how staff identify themselves.
          </Text>
          <View style={styles.authPicker}>
            <AuthMethodPicker
              value={authMethod}
              onChange={handleAuthMethodChange}
            />
          </View>
        </Card>


        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Face scanner</Text>
          <Text style={styles.cardHint}>
            Lighting and matching options for the kiosk face scan.
          </Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.statusLabel}>Screen light while scanning</Text>
              <Text style={styles.cardHint}>
                Automatically turn on the screen light when capturing photos,
                then switch it off. Useful in dim lighting or at night.
              </Text>
            </View>
            <Switch
              value={scanLight}
              onValueChange={(value) => {
                setScanLightState(value);
                setScanLightEnabled(value);
              }}
              trackColor={{ false: colors.slate300, true: colors.primaryLight }}
              thumbColor={colors.white}
            />
          </View>


          <Text style={[styles.statusLabel, styles.strictTitle]}>
            Match strictness
          </Text>
          <Text style={styles.cardHint}>
            Stricter means fewer wrong matches but more “not recognized”
            messages. Balanced is recommended; use Relaxed only if real staff
            keep failing.
          </Text>
          <View style={styles.strictRow}>
            {(['relaxed', 'balanced', 'strict'] as FaceStrictness[]).map(
              (level) => (
                <AppButton
                  key={level}
                  title={level.charAt(0).toUpperCase() + level.slice(1)}
                  size="sm"
                  fullWidth={false}
                  variant={strictness === level ? 'primary' : 'ghost'}
                  style={styles.strictButton}
                  onPress={() => {
                    setStrictnessState(level);
                    setFaceStrictness(level);
                  }}
                />
              ),
            )}
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Administrator PIN</Text>
          <Text style={styles.cardHint}>
            The master PIN unlocks the admin dashboard from the kiosk.
          </Text>

          {pinEditorOpen ? (
            <>
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
              <AppButton
                title="Cancel"
                onPress={closePinEditor}
                variant="ghost"
                disabled={savingPin}
                style={styles.pinCancelButton}
              />
            </>
          ) : (
            <AppButton
              title="Change PIN"
              onPress={openPinEditor}
              variant="ghost"
              icon={
                <Ionicons
                  name="key-outline"
                  size={18}
                  color={colors.primary}
                />
              }
              style={styles.pinButton}
            />
          )}
        </Card>


        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Privacy & security</Text>
          <Text style={styles.cardHint}>
            Attendance verification stays on the kiosk and the paired phone over
            the local Wi-Fi network. No attendance data leaves the local network.
          </Text>
        </Card>

          <Text style={styles.version}>DayStaff · v1.1.0 · Offline MVP</Text>
        </ScrollView>
        <AdminBottomTabBar navigation={navigation} active="AdminSettings" />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
  scroll: {
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
  nameReadOnly: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: spacing.sm,
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nameReadOnlyText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.slate900,
  },
  nameReadOnlyEmpty: {
    color: colors.slate400,
    fontWeight: '400',
  },
  nameButtons: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  nameButton: {
    flex: 1,
  },
  pinCancelButton: {
    marginTop: spacing.sm,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toggleText: {
    flex: 1,
  },
  strictTitle: {
    marginTop: spacing.md,
  },
  strictRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  strictButton: {
    flex: 1,
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
  kioskToggleRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  kioskToggleText: {
    flex: 1,
  },
  kioskToggleLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
  },
  kioskStatus: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  version: {
    marginTop: spacing.xl,
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.slate400,
  },
});
