import { useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import { AppButton } from '../../components/AppButton';
import { useAppDialog } from '../../components/AppDialog';
import { AdminBottomTabBar } from '../../components/AdminBottomTabBar';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import {
  TimePickerSheet,
  TimeRow,
  timeToDate,
  dateToTime,
} from '../../components/TimePickerSheet';
import {
  DEFAULT_SCHEDULE,
  getSchedule,
  saveSchedule,
} from '../../database/queries';
import type { RootNavigation } from '../../navigation/types';
import { colors, fontSize, radius, spacing } from '../../theme';

export function ScheduleSettingsScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { alert, confirm } = useAppDialog();
  const initial = useMemo(() => getSchedule(), []);

  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [grace, setGrace] = useState(initial.lateThresholdMinutes);
  const [saving, setSaving] = useState(false);

  // Time-picker state (mirrors AdminSetupScreen).
  const [editing, setEditing] = useState<'start' | 'end' | null>(null);
  const lastEditing = useRef<'start' | 'end'>('start');
  if (editing) {
    lastEditing.current = editing;
  }
  const shown = editing ?? lastEditing.current;
  const editingTitle =
    shown === 'end' ? 'Official closing time' : 'Official start time';
  const editingValue = shown === 'end' ? endTime : startTime;
  const setEditingValue = shown === 'end' ? setEndTime : setStartTime;

  const openEditor = (key: 'start' | 'end') => {
    setEditing(key);
  };

  const handleAndroidPick = (event: DateTimePickerEvent, date?: Date) => {
    setEditing(null);
    if (event.type === 'set' && date) {
      setEditingValue(dateToTime(date));
    }
  };
  const adjustGrace = (delta: number) => {
    setGrace((current) => Math.max(0, Math.min(120, current + delta)));
  };

  const currentSchedule = getSchedule();
  const isChanging =
    currentSchedule.startTime !== startTime ||
    currentSchedule.endTime !== endTime ||
    currentSchedule.lateThresholdMinutes !== grace;

  const handleSave = () => {
    confirm({
      tone: 'warning',
      icon: 'alert-circle',
      title: 'Change official hours?',
      message:
        'The new closing time applies immediately to staff clocking in or ' +
        'out today. Existing records won’t change, and from tomorrow, ' +
        'everyone follows the new hours.',
      confirmLabel: 'Save anyway',
      cancelLabel: 'Cancel',
      destructive: false,
      onConfirm: applyScheduleSave,
    });
  };

  const applyScheduleSave = () => {
    setSaving(true);
    try {
      saveSchedule({
        startTime,
        endTime,
        lateThresholdMinutes: grace,
      });
      alert({
        tone: 'success',
        title: 'Schedule saved',
        message: 'The new official hours are now active.',
      });
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not save schedule',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStartTime(DEFAULT_SCHEDULE.startTime);
    setEndTime(DEFAULT_SCHEDULE.endTime);
    setGrace(DEFAULT_SCHEDULE.lateThresholdMinutes);
    alert({
      tone: 'info',
      title: 'Fields reset',
      message:
        'The form has been reset to the default hours. Tap Save schedule to apply them.',
    });
  };

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Text style={styles.cardTitle}>Official hours</Text>
          <Text style={styles.cardHint}>
            Arrivals after the start time plus grace are marked late.
            Departures before closing are marked early.
          </Text>

          <View style={styles.fields}>
            <TimeRow
              label="Official start time"
              value={startTime}
              onPress={() => openEditor('start')}
            />
            <TimeRow
              label="Official closing time"
              value={endTime}
              onPress={() => openEditor('end')}
            />
          </View>
        </Card>

        <Card style={styles.graceCard}>
          <View style={styles.graceRow}>
            <View style={styles.graceText}>
              <Text style={styles.cardTitle}>Grace period</Text>
              <Text style={styles.cardHint}>
                How many minutes after the official time will a staff member be
                marked late?
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

        <Card style={styles.explainCard}>
          <Text style={styles.explainTitle}>How status is calculated</Text>
          <View style={styles.bullet}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.bulletText}>
              On time — clocked in within the grace period, or clocked out at
              or after closing.
            </Text>
          </View>
          <View style={styles.bullet}>
            <Ionicons name="alert-circle" size={16} color={colors.warning} />
            <Text style={styles.bulletText}>
              Late — minutes beyond the grace period are shown on the kiosk and
              dashboard.
            </Text>
          </View>
          <View style={styles.bullet}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.bulletText}>
              Early exit — clocked out before the official closing time.
            </Text>
          </View>
        </Card>

        {isChanging && (
          <AppButton
            title="Save schedule"
            onPress={handleSave}
            loading={saving}
            size="lg"
            style={styles.saveButton}
          />
        )}
        <AppButton
          title="Reset fields to defaults"
          onPress={handleReset}
          variant="ghost"
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>

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

      <AdminBottomTabBar navigation={navigation} active="ScheduleSettings" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
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
  fields: {
    marginTop: spacing.lg,
  },
  graceCard: {
    marginTop: spacing.lg,
  },
  graceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  graceText: {
    flex: 1,
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
  pressed: {
    opacity: 0.6,
  },
  graceValue: {
    minWidth: 58,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
    fontVariant: ['tabular-nums'],
  },
  explainCard: {
    marginTop: spacing.lg,
  },
  explainTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate700,
    marginBottom: spacing.sm,
  },
  bullet: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bulletText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
  saveButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
