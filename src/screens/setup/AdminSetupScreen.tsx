import { useRef, useState, type ComponentRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { TimeField } from '../../components/TimeField';
import { SETUP_COMPLETED_SETTING } from '../../config/app';
import { DEFAULT_SCHEDULE, saveSchedule, setSetting } from '../../database/queries';
import { setAuthMethod, setCompanyName } from '../../services/appSettings';
import { createAdminPin, isSetupPinValid } from '../../services/pinService';
import { colors, fontSize, radius, spacing } from '../../theme';
import type { AuthMethod } from '../../types';
import { formatClockTime } from '../../utils/date';

const STEP_LABELS = ['Organisation', 'Security', 'Kiosk mode'];

interface AdminSetupScreenProps {
  onComplete: () => void;
}

export function AdminSetupScreen({ onComplete }: AdminSetupScreenProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);

  const [step, setStep] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const [companyName, setCompanyNameState] = useState('');
  const [startTime, setStartTime] = useState(DEFAULT_SCHEDULE.startTime);
  const [endTime, setEndTime] = useState(DEFAULT_SCHEDULE.endTime);
  const [grace, setGrace] = useState(DEFAULT_SCHEDULE.lateThresholdMinutes);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [authMethod, setAuthMethodState] = useState<AuthMethod>(
    'PIN_BIOMETRIC',
  );
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const adjustGrace = (delta: number) => {
    setGrace((current) => Math.max(0, Math.min(120, current + delta)));
  };

  const goNext = () => {
    setError(undefined);

    if (step === 0) {
      if (!companyName.trim()) {
        setError('Enter your company or school name.');
        return;
      }
      if (startTime === endTime) {
        setError('The opening and closing times must be different.');
        return;
      }
    }

    if (step === 1) {
      if (!isSetupPinValid(pin)) {
        setError('Choose a 4-digit administrator PIN.');
        return;
      }
      if (pin !== confirmPin) {
        setError('The two PIN entries do not match.');
        return;
      }
    }

    Keyboard.dismiss();
    setStep((current) => Math.min(2, current + 1));
    scrollToTop();
  };

  const goBack = () => {
    Keyboard.dismiss();
    setError(undefined);
    setStep((current) => Math.max(0, current - 1));
    scrollToTop();
  };

  const finish = async () => {
    if (saving) {
      return;
    }
    Keyboard.dismiss();
    setError(undefined);
    setSaving(true);
    try {
      setCompanyName(companyName);
      saveSchedule({
        startTime,
        endTime,
        lateThresholdMinutes: grace,
      });
      setAuthMethod(authMethod);

      // Write the PIN last: until it exists, the app keeps showing setup.
      await createAdminPin(pin);
      setSetting(SETUP_COMPLETED_SETTING, new Date().toISOString());
      onComplete();
    } catch (setupError) {
      Alert.alert(
        'Setup could not be completed',
        setupError instanceof Error
          ? setupError.message
          : 'Please check the details and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (showWelcome) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.welcomeWrap}>
          <View style={styles.brandRow}>
            <View style={styles.brandText}>
              <Text style={styles.brandTitle}>DayStaff</Text>
              <Text style={styles.brandSub}>One-time setup</Text>
            </View>
          </View>
          <Text style={styles.heading}>Welcome to your attendance terminal</Text>
          <Text style={styles.intro}>
            Set up your organisation, secure the admin area, and choose how
            staff will clock in and out.
          </Text>
          <AppButton
            title="Start setup"
            onPress={() => setShowWelcome(false)}
            size="lg"
            style={styles.startButton}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.shell}>
          <View style={styles.brandRow}>
            <View style={styles.brandText}>
              <Text style={styles.brandTitle}>DayStaff</Text>
              <Text style={styles.brandSub}>One-time setup</Text>
            </View>
          </View>

          {step === 0 ? (
            <Text style={styles.intro}>
              Set up your organisation, secure the admin area, and choose how
              staff will clock in.
            </Text>
          ) : null}

          <View style={styles.steps}>
            {STEP_LABELS.map((label, index) => {
              const active = index === step;
              const done = index < step;
              return (
                <View key={label} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepDot,
                      active && styles.stepDotActive,
                      done && styles.stepDotDone,
                    ]}
                  >
                    {done ? (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={colors.white}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.stepNumber,
                          active && styles.stepNumberActive,
                        ]}
                      >
                        {index + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[styles.stepLabel, active && styles.stepLabelActive]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>

          {step === 0 ? (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Your organisation</Text>
              <Text style={styles.cardHint}>
                These details appear on the kiosk and in exported reports.
              </Text>

              <View style={styles.field}>
                <TextField
                  label="Company / school name"
                  value={companyName}
                  onChangeText={(value) => {
                    setCompanyNameState(value);
                    setError(undefined);
                  }}
                  placeholder="e.g. Greenfield Academy"
                  autoCapitalize="words"
                  maxLength={60}
                />
              </View>

              <Text style={styles.sectionLabel}>Default shift schedule</Text>
              <TimeField
                label="Opening / arrival time"
                value={startTime}
                onChange={setStartTime}
              />
              <TimeField
                label="Closing time"
                value={endTime}
                onChange={setEndTime}
              />

              <View style={styles.graceRow}>
                <View style={styles.graceText}>
                  <Text style={styles.graceTitle}>Grace period</Text>
                  <Text style={styles.cardHint}>
                    Minutes after opening before an arrival counts as late.
                  </Text>
                </View>
                <View style={styles.graceControl}>
                  <Pressable
                    onPress={() => adjustGrace(-5)}
                    style={({ pressed }) => [
                      styles.graceButton,
                      pressed && styles.pressed,
                    ]}
                    accessibilityLabel="Decrease grace period"
                  >
                    <Ionicons name="remove" size={20} color={colors.primary} />
                  </Pressable>
                  <Text style={styles.graceValue}>{grace} min</Text>
                  <Pressable
                    onPress={() => adjustGrace(5)}
                    style={({ pressed }) => [
                      styles.graceButton,
                      pressed && styles.pressed,
                    ]}
                    accessibilityLabel="Increase grace period"
                  >
                    <Ionicons name="add" size={20} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            </Card>
          ) : null}

          {step === 1 ? (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Administrator PIN</Text>
              <Text style={styles.cardHint}>
                Create the 4-digit master PIN that unlocks the admin dashboard
                from the kiosk.
              </Text>

              <View style={styles.pinInfo}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={colors.infoDark}
                />
                <Text style={styles.pinInfoText}>
                  There is no default PIN. Keep this PIN somewhere safe — it
                  cannot be recovered from the device.
                </Text>
              </View>

              <Text style={styles.pinLabel}>4-digit PIN</Text>
              <PinInput
                value={pin}
                onChangeText={(value) => {
                  setPin(value);
                  setError(undefined);
                }}
                maxLength={4}
                placeholder="••••"
              />

              <Text style={styles.pinLabel}>Confirm PIN</Text>
              <PinInput
                value={confirmPin}
                onChangeText={(value) => {
                  setConfirmPin(value);
                  setError(undefined);
                }}
                maxLength={4}
                placeholder="••••"
              />
            </Card>
          ) : null}

          {step === 2 ? (
            <>
              <Card style={styles.card}>
                <Text style={styles.cardTitle}>Kiosk authentication</Text>
                <Text style={styles.cardHint}>
                  Choose how staff identify themselves at the terminal. You can
                  switch at any time from Admin → Settings.
                </Text>
                <View style={styles.authPicker}>
                  <AuthMethodPicker
                    value={authMethod}
                    onChange={(method) => {
                      setAuthMethodState(method);
                      setError(undefined);
                    }}
                  />
                </View>
              </Card>

              <Card style={styles.summaryCard}>
                <Text style={styles.cardTitle}>Ready to go</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Organisation</Text>
                  <Text style={styles.summaryValue}>{companyName.trim()}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Official hours</Text>
                  <Text style={styles.summaryValue}>
                    {formatClockTime(startTime)} – {formatClockTime(endTime)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Grace period</Text>
                  <Text style={styles.summaryValue}>{grace} min</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Kiosk mode</Text>
                  <Text style={styles.summaryValue}>
                    {authMethod === 'PIN_BIOMETRIC'
                      ? 'Staff code + biometrics'
                      : 'Face recognition'}
                  </Text>
                </View>
              </Card>
            </>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={colors.danger}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {step > 0 ? (
              <AppButton
                title="Back"
                onPress={goBack}
                variant="ghost"
                style={styles.flex}
                disabled={saving}
              />
            ) : null}
            <AppButton
              title={step === 2 ? 'Finish setup' : 'Continue'}
              onPress={step === 2 ? () => void finish() : goNext}
              loading={saving}
              size="lg"
              style={styles.flex}
            />
          </View>

          {step === 2 ? (
            <Text style={styles.footnote}>
            You can change the company details, schedule, PIN and kiosk mode
            later from Admin → Settings.
          </Text>
          ) : null}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
  welcomeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  startButton: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  shell: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  brandText: {
    flex: 1,
  },
  brandTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.slate900,
  },
  brandSub: {
    fontSize: fontSize.sm,
    color: colors.slate500,
  },
  heading: {
    marginTop: spacing.xl,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.slate900,
    lineHeight: 34,
    textAlign: 'center',
  },
  intro: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 21,
    color: colors.slate500,
    textAlign: 'center',
  },
  steps: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.slate200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },
  stepDotDone: {
    backgroundColor: colors.success,
  },
  stepNumber: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.slate500,
  },
  stepNumberActive: {
    color: colors.white,
  },
  stepLabel: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.slate500,
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: colors.primary,
  },
  card: {
    marginTop: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
  },
  cardHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.slate500,
  },
  field: {
    marginTop: spacing.lg,
  },
  sectionLabel: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.slate700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  graceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  graceText: {
    flex: 1,
  },
  graceTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate800,
  },
  graceControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  graceButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graceValue: {
    minWidth: 58,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.6,
  },
  pinInfo: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  pinInfoText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.infoDark,
  },
  pinLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.slate700,
  },
  authPicker: {
    marginTop: spacing.lg,
  },
  summaryCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.successSoft,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(5, 150, 105, 0.25)',
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.successDark,
    opacity: 0.8,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.successDark,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.dangerDark,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  flex: {
    flex: 1,
  },
  footnote: {
    marginTop: spacing.lg,
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.slate400,
    textAlign: 'center',
  },
});
