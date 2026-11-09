import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Easing,
  FlatList,
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
import { useAppDialog } from '../../components/AppDialog';
import { AuthMethodPicker } from '../../components/AuthMethodPicker';
import { Card } from '../../components/Card';
import { PinInput } from '../../components/PinInput';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { SETUP_COMPLETED_SETTING } from '../../config/app';
import {
  DEFAULT_SCHEDULE,
  saveSchedule,
  setSetting,
} from '../../database/queries';
import { setAuthMethod, setCompanyName } from '../../services/appSettings';
import { createAdminPin, isSetupPinValid } from '../../services/pinService';
import { colors, fontSize, radius, spacing } from '../../theme';
import type { AuthMethod } from '../../types';
import { formatClockTime } from '../../utils/date';

const STEP_LABELS = ['Organisation', 'Security', 'Kiosk mode'];

// ---------------------------------------------------------------------------
// Time helpers. Schedule times are stored as 24-hour "HH:mm" strings.
// ---------------------------------------------------------------------------
function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  const hour24 = match ? Number(match[1]) % 24 : 7;
  const minute = match ? Number(match[2]) : 0;
  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    pm: hour24 >= 12,
  };
}

function buildTime(hour12: number, minute: number, pm: boolean): string {
  const hour24 = (hour12 % 12) + (pm ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeToDate(value: string): Date {
  const { hour12, minute, pm } = parseTime(value);
  const date = new Date();
  date.setHours((hour12 % 12) + (pm ? 12 : 0), minute, 0, 0);
  return date;
}

function dateToTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ---------------------------------------------------------------------------
// iOS wheel (Android uses the system time dialog instead).
// ---------------------------------------------------------------------------
const ITEM_H = 44; // height of one row on the wheel
const VISIBLE_ROWS = 3; // odd number: 3 = short sheet, 5 = more iPhone-like
const WHEEL_PAD = ITEM_H * Math.floor(VISIBLE_ROWS / 2);
const WHEEL_H = ITEM_H * VISIBLE_ROWS;
const HOURS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
);
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, '0'),
);
const MERIDIEM = ['AM', 'PM'];

interface WheelColumnProps {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  label: string;
  // When true the wheel never ends: after the last value it continues
  // with the first one, in either direction (like the iPhone clock picker).
  loop?: boolean;
  // True while the sheet is open. Each time it turns true, the wheel jumps
  // (instantly) to the current value, so the sheet can stay mounted.
  active: boolean;
}

function WheelColumn({
  items,
  selectedIndex,
  onChange,
  label,
  loop = false,
  active,
}: WheelColumnProps) {
  const count = items.length;
  // Looping wheels render the list many times over and always re-centre
  // themselves in the middle copy once they stop, so the edge is never reached.
  const copies = loop ? (count > 30 ? 9 : 41) : 1;
  const baseIndex = Math.floor(copies / 2) * count;
  const data = useMemo(
    () => Array.from({ length: copies * count }, (_, i) => i % count),
    [copies, count],
  );

  const ref = useRef<FlatList<number> | null>(null);
  const [live, setLive] = useState(selectedIndex);
  const latestIndex = useRef(selectedIndex);
  latestIndex.current = selectedIndex;

  useEffect(() => {
    if (!active) {
      return;
    }
    setLive(latestIndex.current);
    ref.current?.scrollToOffset({
      offset: (baseIndex + latestIndex.current) * ITEM_H,
      animated: false,
    });
  }, [active, baseIndex]);

  const toAbs = (offsetY: number) =>
    Math.max(0, Math.min(data.length - 1, Math.round(offsetY / ITEM_H)));

  const commit = (offsetY: number) => {
    const abs = toAbs(offsetY);
    const index = abs % count;
    setLive(index);
    if (loop && abs !== baseIndex + index) {
      ref.current?.scrollToOffset({
        offset: (baseIndex + index) * ITEM_H,
        animated: false,
      });
    }
    if (index !== selectedIndex) {
      onChange(index);
    }
  };

  return (
    <View style={styles.wheel} accessibilityLabel={label}>
      <FlatList
        ref={ref}
        data={data}
        extraData={live}
        keyExtractor={(_, index) => String(index)}
        getItemLayout={(_, index) => ({
          length: ITEM_H,
          offset: ITEM_H * index,
          index,
        })}
        initialScrollIndex={baseIndex + selectedIndex}
        contentContainerStyle={styles.wheelContent}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="normal"
        windowSize={5}
        initialNumToRender={VISIBLE_ROWS + 4}
        maxToRenderPerBatch={VISIBLE_ROWS + 4}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const index = toAbs(event.nativeEvent.contentOffset.y) % count;
          if (index !== live) {
            setLive(index);
          }
        }}
        onMomentumScrollEnd={(event) =>
          commit(event.nativeEvent.contentOffset.y)
        }
        onScrollEndDrag={(event) => {
          // Slow drag with no fling: there will be no momentum event.
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) {
            commit(event.nativeEvent.contentOffset.y);
          }
        }}
        renderItem={({ item, index }) => (
          <Pressable
            style={styles.wheelItem}
            onPress={() => {
              ref.current?.scrollToOffset({
                offset: index * ITEM_H,
                animated: true,
              });
              setLive(item);
              onChange(item);
            }}
          >
            <Text
              style={[
                styles.wheelText,
                item === live && styles.wheelTextActive,
              ]}
            >
              {items[item]}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

interface TimePickerSheetProps {
  visible: boolean;
  title: string;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
}

// Off-screen distance for the closed sheet (larger than the sheet itself).
const SHEET_OFFSCREEN = 600;

// The sheet stays mounted (hidden) so opening it is instant: no Modal to
// create and no wheels to build on every tap.
function TimePickerSheet({
  visible,
  title,
  value,
  onChange,
  onClose,
}: TimePickerSheetProps) {
  const { hour12, minute, pm } = parseTime(value);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 170 : 130,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_OFFSCREEN, 0],
  });

  return (
    <View style={styles.overlay} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable
          style={styles.flex}
          onPress={onClose}
          accessibilityLabel="Close time picker"
        />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetValue}>{formatClockTime(value)}</Text>
        </View>

        <View style={styles.wheelsRow}>
          <View pointerEvents="none" style={styles.wheelBand} />
          <WheelColumn
            label="Hour"
            loop
            active={visible}
            items={HOURS}
            selectedIndex={hour12 - 1}
            onChange={(index) => onChange(buildTime(index + 1, minute, pm))}
          />
          <WheelColumn
            label="Minute"
            loop
            active={visible}
            items={MINUTES}
            selectedIndex={minute}
            onChange={(index) => onChange(buildTime(hour12, index, pm))}
          />
          <WheelColumn
            label="AM or PM"
            active={visible}
            items={MERIDIEM}
            selectedIndex={pm ? 1 : 0}
            onChange={(index) =>
              onChange(buildTime(hour12, minute, index === 1))
            }
          />
        </View>

        <AppButton title="Done" onPress={onClose} size="lg" />
      </Animated.View>
    </View>
  );
}

interface TimeRowProps {
  label: string;
  value: string;
  onPress: () => void;
}

function TimeRow({ label, value, onPress }: TimeRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.timeRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Change ${label}`}
    >
      <Text style={styles.timeRowLabel}>{label}</Text>
      <View style={styles.timeRowRight}>
        <Text style={styles.timeRowValue}>{formatClockTime(value)}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.slate500} />
      </View>
    </Pressable>
  );
}

interface AdminSetupScreenProps {
  onComplete: () => void;
}

export function AdminSetupScreen({ onComplete }: AdminSetupScreenProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const { alert } = useAppDialog();

  const [step, setStep] = useState(0);
  const [companyName, setCompanyNameState] = useState('');
  const [startTime, setStartTime] = useState(DEFAULT_SCHEDULE.startTime);
  const [endTime, setEndTime] = useState(DEFAULT_SCHEDULE.endTime);
  const [grace, setGrace] = useState(DEFAULT_SCHEDULE.lateThresholdMinutes);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [authMethod, setAuthMethodState] =
    useState<AuthMethod>('FACE_RECOGNITION');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<'start' | 'end' | null>(null);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const adjustGrace = (delta: number) => {
    setGrace((current) => Math.max(0, Math.min(120, current + delta)));
  };

  // Keep showing the last field while the sheet slides closed.
  const lastEditing = useRef<'start' | 'end'>('start');
  if (editing) {
    lastEditing.current = editing;
  }
  const shown = editing ?? lastEditing.current;
  const editingTitle =
    shown === 'end' ? 'Closing time' : 'Opening / arrival time';
  const editingValue = shown === 'end' ? endTime : startTime;
  const setEditingValue = shown === 'end' ? setEndTime : setStartTime;

  const openEditor = (key: 'start' | 'end') => {
    Keyboard.dismiss();
    setEditing(key);
  };

  // Android: the system time dialog reports back here.
  const handleAndroidPick = (event: DateTimePickerEvent, date?: Date) => {
    setEditing(null);
    if (event.type === 'set' && date) {
      setEditingValue(dateToTime(date));
    }
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
      alert({
        tone: 'danger',
        title: 'Setup could not be completed',
        message:
          setupError instanceof Error
            ? setupError.message
            : 'Please check the details and try again.',
      });
    } finally {
      setSaving(false);
    }
  };

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
                      style={[
                        styles.stepLabel,
                        active && styles.stepLabelActive,
                      ]}
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
                <TimeRow
                  label="Opening / arrival time"
                  value={startTime}
                  onPress={() => openEditor('start')}
                />
                <TimeRow
                  label="Closing time"
                  value={endTime}
                  onPress={() => openEditor('end')}
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
                      <Ionicons
                        name="remove"
                        size={20}
                        color={colors.primary}
                      />
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
                    Staff identify themselves with face recognition at the
                    terminal. You can review this in Admin + Settings.
                  </Text>
                  <View style={styles.authPicker}>
                    <Text style={styles.cardHint}>
                      Face recognition (only option)
                    </Text>
                  </View>
                </Card>

                <Card style={styles.summaryCard}>
                  <Text style={styles.cardTitle}>Ready to go</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Organisation</Text>
                    <Text style={styles.summaryValue}>
                      {companyName.trim()}
                    </Text>
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
                      Face recognition
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

      {Platform.OS === 'ios' ? (
        <TimePickerSheet
          visible={editing !== null}
          title={editingTitle}
          value={editingValue}
          onChange={setEditingValue}
          onClose={() => setEditing(null)}
        />
      ) : editing ? (
        <DateTimePicker
          value={timeToDate(editingValue)}
          mode="time"
          is24Hour={false}
          display="default"
          onChange={handleAndroidPick}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
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
    marginTop: 0,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  timeRowLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.slate800,
  },
  timeRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeRowValue: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.slate900,
    fontVariant: ['tabular-nums'],
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 10,
    elevation: 10,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate200,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
  },
  sheetValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  wheelsRow: {
    flexDirection: 'row',
    height: WHEEL_H,
    marginBottom: spacing.md,
  },
  wheel: {
    flex: 1,
    height: WHEEL_H,
  },
  wheelBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WHEEL_PAD,
    height: ITEM_H,
    borderRadius: radius.md,
    backgroundColor: colors.slate200,
  },
  wheelContent: {
    paddingVertical: WHEEL_PAD,
  },
  wheelItem: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.slate400,
    fontVariant: ['tabular-nums'],
  },
  wheelTextActive: {
    fontWeight: '800',
    color: colors.slate900,
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
