import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import { exportDatabaseBackup } from '../../services/backupService';
import {
  changeAdminPin,
  generateAdminRecoveryCode,
  isPinFormatValid,
  storeAdminRecoveryCode,
} from '../../services/pinService';
import { colors, fontSize, radius, shadow, spacing } from '../../theme';
import type { AuthMethod } from '../../types';

export function AdminSettingsScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { alert, confirm } = useAppDialog();

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
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);
  const [regeneratingRecovery, setRegeneratingRecovery] = useState(false);
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
  const [creatingBackup, setCreatingBackup] = useState(false);
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
      setPinError('Enter your current 4â€“8 digit PIN.');
      return;
    }
    if (!isPinFormatValid(newPin)) {
      setPinError('The new PIN must be 4â€“8 digits.');
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

  const handleCreateBackup = async () => {
    if (creatingBackup) return;
    setCreatingBackup(true);
    try {
      const result = await exportDatabaseBackup();
      alert({
        tone: 'success',
        title: 'Backup ready',
        message: result.shared
          ? 'Your backup file is ready. Save it to a USB drive, Files, or another device so you can restore it later.'
          : `Sharing is unavailable, so the backup was saved to:\n${result.uri}`,
        buttonLabel: 'Done',
      });
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Backup failed',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleOpenPinningSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        try {
          await Linking.sendIntent('android.settings.SECURITY_SETTINGS');
          return;
        } catch {
          // Some devices expose app pinning elsewhere; fall through.
        }
        try {
          await Linking.sendIntent('android.settings.SETTINGS');
          return;
        } catch {
          await Linking.openSettings();
          return;
        }
      }

      if (Platform.OS === 'ios') {
        const urls = [
          'App-prefs:ACCESSIBILITY',
          'App-prefs:root=ACCESSIBILITY',
          'app-settings:',
        ];
        for (const url of urls) {
          try {
            const supported = await Linking.canOpenURL(url);
            if (supported) {
              await Linking.openURL(url);
              return;
            }
          } catch {
            // try next
          }
        }
      }

      alert({
        tone: 'info',
        title: 'Open settings manually',
        message:
          Platform.OS === 'ios'
            ? 'Open Settings → Accessibility → Guided Access on this device.'
            : 'Open Settings on this device, then look for Security/Privacy → App pinning (or Screen pinning).',
      });
    } catch {
      alert({
        tone: 'info',
        title: 'Open settings manually',
        message:
          Platform.OS === 'ios'
            ? 'Open Settings → Accessibility → Guided Access on this device.'
            : 'Open Settings on this device, then look for Security/Privacy → App pinning (or Screen pinning).',
      });
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
                label="Company name"
                value={companyName}
                onChangeText={setCompanyNameState}
                placeholder="e.g. Greenfield Academy"
                maxLength={60}
                autoFocus
              />
            ) : (
              <>
                <Text style={styles.pinLabel}>Company name</Text>
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
            Stricter means fewer wrong matches but more â€œnot recognizedâ€
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
          <Text style={styles.cardTitle}>Recovery code</Text>
          <Text style={styles.cardHint}>
            Generate a new recovery code if the original was lost. The old code
            will stop working immediately.
          </Text>
          <AppButton
            title={regeneratingRecovery ? 'Generatingâ€¦' : 'Regenerate recovery code'}
            onPress={() => {
              confirm({
                tone: 'warning',
                icon: 'key-outline',
                title: 'Regenerate recovery code?',
                message:
                  'The previous recovery code will no longer work. Save the new code somewhere safe.',
                confirmLabel: 'Regenerate',
                onConfirm: async () => {
                  setRegeneratingRecovery(true);
                  try {
                    const code = generateAdminRecoveryCode();
                    await storeAdminRecoveryCode(code);
                    setRecoveryAcknowledged(false);
                    setRecoveryCode(code);
                  } catch (error) {
                    alert({
                      tone: 'danger',
                      title: 'Could not generate code',
                      message:
                        error instanceof Error
                          ? error.message
                          : 'Please try again.',
                    });
                  } finally {
                    setRegeneratingRecovery(false);
                  }
                },
              });
            }}
            loading={regeneratingRecovery}
            disabled={regeneratingRecovery}
            style={styles.pinButton}
          />
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
          <Text style={styles.cardTitle}>Kiosk device</Text>
          <Text style={styles.cardHint}>
            Keep the tablet ready for staff check-ins and prevent accidental exits.
          </Text>

          <Text style={[styles.statusLabel, styles.strictTitle]}>Keep screen awake</Text>
          <Text style={styles.cardHint}>
            While the kiosk terminal is open, DayStaff keeps the screen on so it does not dim or lock between shifts.
          </Text>

          <Text style={[styles.statusLabel, styles.strictTitle]}>
            {Platform.OS === 'android' ? 'Lock to DayStaff (App pinning)' : Platform.OS === 'ios' ? 'Lock to DayStaff (Guided Access)' : 'Lock to DayStaff'}
          </Text>
          {Platform.OS === 'android' ? (
            <>
              <Text style={styles.cardHint}>
                App pinning stops staff from pressing Home, switching apps, or changing tablet settings.
              </Text>
              <Text style={styles.cardHint}>1. Tap â€œOpen device settingsâ€ below.</Text>
              <Text style={styles.cardHint}>2. Turn on App pinning / Screen pinning (usually in Security or Privacy).</Text>
              <Text style={styles.cardHint}>3. Open DayStaff and go to the kiosk screen.</Text>
              <Text style={styles.cardHint}>4. Open Recent apps, then tap Pin on DayStaff.</Text>
              <Text style={styles.cardHint}>To unpin later, use your deviceâ€™s unpin gesture/buttons and enter the device PIN/password.</Text>
            </>
          ) : Platform.OS === 'ios' ? (
            <>
              <Text style={styles.cardHint}>
                Guided Access stops staff from leaving DayStaff, switching apps, or changing settings.
              </Text>
              <Text style={styles.cardHint}>1. Tap â€œOpen device settingsâ€ below.</Text>
              <Text style={styles.cardHint}>2. Go to Accessibility â†’ Guided Access and turn it on. Set a passcode staff donâ€™t know.</Text>
              <Text style={styles.cardHint}>3. Open DayStaff and go to the kiosk screen.</Text>
              <Text style={styles.cardHint}>4. Triple-click the Side/Top button (or Home button) and tap Start.</Text>
              <Text style={styles.cardHint}>To end later, triple-click the same button, enter the passcode, then tap End.</Text>
            </>
          ) : (
            <Text style={styles.cardHint}>
              Use your deviceâ€™s built-in app pinning or guided access feature to keep this device locked to DayStaff.
            </Text>
          )}
          <AppButton
            title="Open device settings"
            onPress={handleOpenPinningSettings}
            variant="secondary"
            icon={
              <Ionicons
                name="settings-outline"
                size={18}
                color={colors.primary}
              />
            }
            style={styles.pinButton}
          />
          <Text style={styles.cardHint}>
            If it doesnâ€™t open the exact screen, use the steps above to find {Platform.OS === 'ios' ? 'Guided Access' : 'App pinning'} in Settings.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Data backup</Text>
          <Text style={styles.cardHint}>
            Create a backup of staff profiles, short codes, face scans, and
            attendance logs. Save it to a USB drive or another device so you can
            restore it on a replacement tablet without re-scanning faces.
          </Text>
          <AppButton
            title={creatingBackup ? 'Creating backupâ€¦' : 'Create backup'}
            onPress={handleCreateBackup}
            loading={creatingBackup}
            disabled={creatingBackup}
            variant="secondary"
            icon={
              !creatingBackup ? (
                <Ionicons
                  name="cloud-download-outline"
                  size={18}
                  color={colors.primary}
                />
              ) : undefined
            }
            style={styles.pinButton}
          />
          <Text style={styles.cardHint}>
            To restore on a new device, go to Staff and tap Import.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Privacy & security</Text>
          <Text style={styles.cardHint}>
            Attendance verification stays on the kiosk and the paired phone over
            the local Wi-Fi network. No attendance data leaves the local network.
          </Text>
        </Card>

          <Text style={styles.version}>DayStaff Â· v1.1.0 Â· Offline MVP</Text>
        </ScrollView>

        {recoveryCode ? (
          <Modal visible transparent animationType="fade" statusBarTranslucent>
            <View style={styles.recoveryOverlay}>
              <View style={styles.recoveryCard}>
                <Text style={styles.cardTitle}>Save your recovery code</Text>
                <Text style={styles.cardHint}>
                  This code will not be shown again. Save it somewhere safe.
                </Text>
                <View style={styles.recoveryCodeBox}>
                  <Text style={styles.recoveryCode}>{recoveryCode}</Text>
                </View>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleText}>
                    <Text style={styles.statusLabel}>I have saved this code</Text>
                  </View>
                  <Switch
                    value={recoveryAcknowledged}
                    onValueChange={setRecoveryAcknowledged}
                    trackColor={{ false: colors.slate300, true: colors.primaryLight }}
                    thumbColor={colors.white}
                  />
                </View>
                <AppButton
                  title="Done"
                  onPress={() => {
                    setRecoveryCode(null);
                    setRecoveryAcknowledged(false);
                  }}
                  size="lg"
                  disabled={!recoveryAcknowledged}
                />
              </View>
            </View>
          </Modal>
        ) : null}

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
  recoveryOverlay: {
    ...StyleSheet.absoluteFill,    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  recoveryCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.modal,
  },
  recoveryCodeBox: {
    marginVertical: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.slate100,
    alignItems: 'center',
  },
  recoveryCode: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.slate900,
    fontVariant: ['tabular-nums'],
  },
});
